import * as THREE from "three";
import { API_URL } from "../constants";
import { SwfStreamRenderer } from "./stream";

// M4 of docs/specs/swf-avatar-rendering.md: the cutover.
//
// Every SWF avatar used to be a sandboxed iframe running its own Ruffle
// instance, reading its canvas back with createImageBitmap once per frame and
// posting the bitmap to the page. This runs Ruffle in the page instead, with
// the forked "three" render backend, so frames arrive as a command stream and
// are composed straight into a GPU render target — no readback, no structured
// clone, no per-frame texture upload.
//
// Two things replace what the iframe gave us:
//
//   Control. Avatars are driven through whirled-host.swf (W1), which answers
//   the SDK's controlConnect handshake and exposes whirled* ExternalInterface
//   callbacks. Unpatched avatars work; the hand-patched patched_*.swf files
//   are no longer needed.
//
//   Isolation. There is none right now — this is the known cost of M4, and
//   what W3/M6 exists to fix by moving Flash execution into a worker. The
//   iframe's isolation was already only nominal in dev (§12.4).

/** How long to wait for an avatar to answer the SDK handshake. */
const CONNECT_TIMEOUT_MS = 5000;

/**
 * Render scale for the offscreen player, in CSS pixels per stage pixel.
 *
 * The old pipeline set the iframe's player to twice the stage size and then
 * sized the billboard from the resulting *canvas* pixels, which folded
 * devicePixelRatio into the avatar's world size — the same avatar came out
 * half as big on a non-retina display. Billboard size now comes from the stage
 * size instead (see createSwfAvatar), so this only decides texel density.
 */
const RENDER_SCALE = 2;

type HostEventType =
	| "connected"
	| "setState"
	| "setOrientation"
	| "setLocation"
	| "setMoveSpeed"
	| "setPreferredY"
	| "setHotSpot";

type Entry = {
	player: any;
	stream: SwfStreamRenderer;
	host: HTMLElement;
	/** Registered states/actions, read once the avatar has connected. */
	states: string[] | null;
	actions: string[] | null;
	/** Last appearance pushed, so a change of one term keeps the others. */
	moving: boolean;
	orientation: number;
	/** Reported by the avatar through setPreferredY_v1, if it reports one. */
	preferredY: number | null;
	/** The avatar's own stage size, which decides its size in the world. */
	stage: { width: number; height: number };
	/** Where the feet are, as a fraction from the top of the frame. */
	ground: number;
	connected: boolean;
};

/**
 * Routes whirledHostEvent calls back to the avatar that made them.
 *
 * ExternalInterface.call reaches the page's single global scope, so with every
 * player in one document the events would be indistinguishable. The shim takes
 * a hostId flashvar and hands it back on every event; this maps it to an entry.
 */
const hostListeners = new Map<
	string,
	(type: HostEventType, value: any) => void
>();

let hostEventInstalled = false;

function installHostEventBridge() {
	if (hostEventInstalled) return;
	hostEventInstalled = true;
	(window as any).whirledHostEvent = (
		hostId: string,
		type: HostEventType,
		value: any,
	) => {
		hostListeners.get(String(hostId))?.(type, value);
	};
}

export class SwfAssetManager {
	private entries = new Map<number, Entry>();

	/**
	 * Offscreen players live in one hidden container rather than in the scene's
	 * DOM. They are positioned off-screen rather than display:none, because a
	 * hidden element gets no layout and Ruffle would have no viewport to scale
	 * its transforms into.
	 */
	private container: HTMLElement | null = null;

	constructor(
		private readonly world: {
			renderer: THREE.WebGLRenderer;
			swfStreams: Set<SwfStreamRenderer>;
		},
	) {
		installHostEventBridge();
	}

	public async add(eid: number, swfFile: string): Promise<THREE.Texture> {
		this.remove(eid);

		const host = document.createElement("div");
		host.dataset.swfEid = String(eid);
		host.style.cssText =
			"position:fixed;left:-10000px;top:0;width:1px;height:1px;";
		this.getContainer().appendChild(host);

		const player = window.RufflePlayer.newest().createPlayer();
		// <ruffle-player> defaults to 550x400 and ignores its parent, and that
		// box is what decides both the stage size the shim lays the avatar out
		// in and the render target's resolution. Left alone, every avatar would
		// render into a 550x400 letterbox regardless of its own shape.
		player.style.cssText = "display:block;width:100%;height:100%;";
		host.appendChild(player);

		const stream = new SwfStreamRenderer(this.world);
		player.whirledStream = (event: any) => stream.handleEvent(event);

		const entry: Entry = {
			player,
			stream,
			host,
			states: null,
			actions: null,
			moving: false,
			orientation: 0,
			preferredY: null,
			stage: { width: 0, height: 0 },
			ground: 1,
			connected: false,
		};
		this.entries.set(eid, entry);

		hostListeners.set(String(eid), (type, value) => {
			switch (type) {
				case "connected":
					entry.connected = true;
					break;
				case "setPreferredY":
					entry.preferredY = Number(value);
					break;
				// setState/setOrientation come back when the avatar changes
				// itself. Nothing consumes them yet; the room is the authority
				// on both, so acting on them would fight the movement system.
			}
		});

		// The shim loads the avatar itself, from the `avatar` flashvar, then
		// scales it to fill whatever box it is given. The box is set below,
		// once the avatar has reported the stage size it wants.
		const url = resolveAvatarUrl(swfFile);
		await player.ruffle().load({
			url: `${API_URL}/static/whirled-host.swf?avatar=${encodeURIComponent(url)}&hostId=${eid}`,
			allowScriptAccess: true,
			autoplay: "on",
			splashScreen: false,
			unmuteOverlay: "hidden",
			letterbox: "off",
			wmode: "transparent",
			preferredRenderer: "three",
			parameters: { avatar: url, hostId: String(eid) },
		});

		await this.sizeToAvatar(entry);
		entry.ground = await waitForGround(stream, this.world.renderer);

		return stream.target.texture;
	}

	/**
	 * Give the player a viewport matching the avatar's stage.
	 *
	 * The shim's own stage is 1x1 — it is a loader, not artwork — so the size
	 * that matters is the loaded avatar's, which is only known after it has
	 * initialized. Ruffle scales its transforms into the element's box, so this
	 * decides the render target's resolution.
	 */
	private async sizeToAvatar(entry: Entry) {
		const size = await waitForStageSize(entry.player);
		entry.stage = size;
		entry.host.style.width = `${size.width * RENDER_SCALE}px`;
		entry.host.style.height = `${size.height * RENDER_SCALE}px`;
	}

	/**
	 * The avatar's stage size in SWF pixels, which is what decides how big it
	 * is in the world. Distinct from the render target's resolution.
	 */
	public getStageSize(
		eid: number,
	): { width: number; height: number } | undefined {
		return this.entries.get(eid)?.stage;
	}

	public remove(eid: number) {
		const entry = this.entries.get(eid);
		if (entry === undefined) return;
		hostListeners.delete(String(eid));
		try {
			entry.player.remove();
		} catch {
			// Ruffle throws if the instance is already gone; nothing to undo.
		}
		entry.host.remove();
		entry.stream.dispose();
		this.entries.delete(eid);
	}

	public getTexture(eid: number): THREE.Texture | undefined {
		return this.entries.get(eid)?.stream.target.texture;
	}

	/** The stream renderer behind an avatar, for picking and sizing. */
	public getStream(eid: number): SwfStreamRenderer | undefined {
		return this.entries.get(eid)?.stream;
	}

	/**
	 * Where the avatar reports its feet are, in stage pixels from the top, or
	 * null if it never said. Avatars that call setPreferredY are giving a
	 * better answer than an alpha scan can, since it does not move with the
	 * animation.
	 */
	public getPreferredY(eid: number): number | null {
		return this.entries.get(eid)?.preferredY ?? null;
	}

	/**
	 * Where to stand the avatar, as a fraction from the top of its frame.
	 *
	 * Measured once at load, when the first frame with any artwork in it has
	 * been composed.
	 */
	public getGroundOffset(eid: number): number {
		const entry = this.entries.get(eid);
		if (entry === undefined) return 1;
		if (entry.preferredY !== null && entry.stage.height > 0) {
			return entry.preferredY / entry.stage.height;
		}
		return entry.ground;
	}

	public setState(eid: number, state: string) {
		this.call(eid, "whirledSetState", stripPrefix(state));
	}

	public playAction(eid: number, action: string) {
		this.call(eid, "whirledPlayAction", stripPrefix(action));
	}

	public setMoving(eid: number, isMoving: boolean) {
		const entry = this.entries.get(eid);
		if (entry === undefined || entry.moving === isMoving) return;
		entry.moving = isMoving;
		this.pushAppearance(entry);
	}

	public setOrientation(eid: number, degrees: number) {
		const entry = this.entries.get(eid);
		if (entry === undefined || entry.orientation === degrees) return;
		entry.orientation = degrees;
		this.pushAppearance(entry);
	}

	/**
	 * Appearance is one call in the SDK, not a set of independent setters, so
	 * moving and orientation are pushed together from the cached pair.
	 * Location stays at the origin: avatars use it for room-relative effects we
	 * do not model, and the room drives position in three.js instead.
	 */
	private pushAppearance(entry: Entry) {
		try {
			entry.player.whirledSetAppearance?.(
				0,
				0,
				0,
				entry.orientation,
				entry.moving,
				false,
			);
		} catch (error) {
			console.warn("swf: setAppearance failed", error);
		}
	}

	public async getStates(eid: number): Promise<string[]> {
		const entry = this.entries.get(eid);
		if (entry === undefined) return [];
		if (entry.states === null) {
			await this.waitForConnection(entry);
			entry.states = toStringArray(this.call(eid, "whirledGetStates"));
		}
		return entry.states;
	}

	public async getActions(eid: number): Promise<string[]> {
		const entry = this.entries.get(eid);
		if (entry === undefined) return [];
		if (entry.actions === null) {
			await this.waitForConnection(entry);
			entry.actions = toStringArray(this.call(eid, "whirledGetActions"));
		}
		return entry.actions;
	}

	public async getAnimations(eid: number): Promise<{ name: string }[]> {
		const states = (await this.getStates(eid)).map((state) => ({
			name: `state_${state}`,
		}));
		const actions = (await this.getActions(eid)).map((action) => ({
			name: `action_${action}`,
		}));
		return [...states, ...actions];
	}

	/**
	 * States and actions only exist once the avatar has answered the handshake,
	 * which happens a few frames after load resolves. The old pipeline guessed
	 * with a 1s sleep and a retry; the shim reports connection, so this waits
	 * for the real thing and gives up rather than hanging.
	 */
	private async waitForConnection(entry: Entry) {
		if (entry.connected) return;
		const deadline = performance.now() + CONNECT_TIMEOUT_MS;
		while (!entry.connected && performance.now() < deadline) {
			try {
				if (entry.player.whirledIsConnected?.()) {
					entry.connected = true;
					break;
				}
			} catch {
				// Callbacks are not registered until the shim's first frame.
			}
			await nextFrame();
		}
		if (!entry.connected) {
			console.warn(
				"swf: avatar never answered the control handshake; " +
					"it may not be a Whirled SDK avatar",
			);
		}
	}

	/** Invoke one of the shim's ExternalInterface callbacks. */
	private call(eid: number, name: string, ...args: unknown[]): unknown {
		const player = this.entries.get(eid)?.player;
		if (player === undefined) return undefined;
		const fn = player[name];
		if (typeof fn !== "function") return undefined;
		try {
			return fn.apply(player, args);
		} catch (error) {
			console.warn(`swf: ${name} failed`, error);
			return undefined;
		}
	}

	private getContainer(): HTMLElement {
		if (this.container === null) {
			this.container = document.createElement("div");
			this.container.id = "swf-players";
			this.container.style.cssText =
				"position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;";
			document.body.appendChild(this.container);
		}
		return this.container;
	}
}

/** Animation names carry a state_/action_ prefix the SDK does not use. */
function stripPrefix(name: string): string {
	return name.replace(/^(action|state)_/i, "");
}

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
}

function resolveAvatarUrl(swfFile: string): string {
	if (swfFile === "") return `${API_URL}/static/assets/avatars/guest.swf`;
	if (swfFile.startsWith("data:") || /^https?:/.test(swfFile)) return swfFile;
	return `${API_URL}${swfFile}`;
}

const nextFrame = () =>
	new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Wait until the loaded avatar reports a stage size.
 *
 * Ruffle's own `metadata` describes the shim, not the SWF the shim loaded, so
 * the size has to come back through the shim. A zero reading means "the avatar
 * has not initialized yet" rather than "this avatar is empty".
 */
async function waitForStageSize(
	player: any,
): Promise<{ width: number; height: number }> {
	const deadline = performance.now() + CONNECT_TIMEOUT_MS;
	while (performance.now() < deadline) {
		let size: unknown;
		try {
			size = player.whirledGetStageSize?.();
		} catch {
			// The shim has not registered its callbacks yet.
		}
		if (Array.isArray(size)) {
			const width = Number(size[0]);
			const height = Number(size[1]);
			if (width > 1 && height > 1) return { width, height };
		}
		await nextFrame();
	}
	// A fallback keeps a misbehaving avatar visible rather than zero-sized.
	return { width: 200, height: 200 };
}

/** How many frames to watch before deciding where the ground line is. */
const GROUND_SAMPLE_FRAMES = 12;

/**
 * Wait for the avatar to appear, then measure where its feet are.
 *
 * Two things make a single measurement unreliable. The shim's own empty stage
 * composes several frames before the avatar it is loading draws anything, and
 * measuring one of those puts the ground line at the bottom of an empty
 * rectangle. And avatars idle — they bob, breathe, and settle — so the first
 * frame with artwork in it is not necessarily one where the feet are down.
 *
 * So this waits for artwork, then watches a short window and keeps the lowest
 * edge it sees, which is the avatar at its ground contact.
 */
async function waitForGround(
	stream: SwfStreamRenderer,
	renderer: THREE.WebGLRenderer,
): Promise<number> {
	const deadline = performance.now() + CONNECT_TIMEOUT_MS;
	let ground = 1;

	while (performance.now() < deadline) {
		if (stream.composedFrames > 0) {
			ground = stream.measureBottomEdge(renderer);
			if (ground < 1) break;
		}
		await nextFrame();
	}
	if (ground === 1) return 1;

	for (let i = 0; i < GROUND_SAMPLE_FRAMES; i++) {
		await nextFrame();
		const sample = stream.measureBottomEdge(renderer);
		if (sample < 1) ground = Math.max(ground, sample);
	}
	return ground;
}
