import * as THREE from "three";
import { SANDBOX_OPAQUE, SANDBOX_ORIGIN, SANDBOX_URL } from "../constants";
import { SwfStreamRenderer } from "./stream";
import { SwfHost } from "./host";
import { FrameSwfHost } from "./host-frame";

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
//   Isolation. Flash now runs in a separate document, driven over postMessage
//   (./host-frame). Whether that document is actually isolated depends on the
//   origin it is served from, and today it is still ours — M6 step 4 moves it.
//
// Nothing below knows where Flash is running. Every player, every callback and
// every ExternalInterface call goes through the `SwfHost` in ./host; this file
// owns the *avatar*: its billboard geometry, its animation state, and its cache
// of what has been pushed to Flash. Who is in the room and what they may ask
// about each other is ./room, which lives on the far side of the seam because
// the SDK asks those questions synchronously. M6 steps 1 and 2 (§16.3).

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

/** How far an avatar must move before the room is told about it, in room units. */
const MOVE_EPSILON = 0.002;

type Entry = {
	/**
	 * Identifies this registration, as opposed to the entity it belongs to.
	 *
	 * An avatar swap gives one entity two avatars for a moment: `add` releases
	 * the outgoing one and registers the incoming one under the same id, while
	 * the render system is still on its way to cleaning up the outgoing one.
	 * Releasing by entity id alone destroys the new avatar mid-load.
	 */
	token: number;
	/** This registration's key with the host. Distinct from `entityId` only in
	 * meaning: one addresses a Flash instance, the other addresses a room
	 * occupant, and nothing guarantees they stay the same string. */
	hostId: string;
	stream: SwfStreamRenderer;
	/** Registered states/actions, read once the avatar has connected. */
	states: string[] | null;
	actions: string[] | null;
	/** Last appearance pushed, so a change of one term keeps the others. */
	moving: boolean;
	orientation: number;
	/** Reported by the avatar through setPreferredY_v1, if it reports one. */
	preferredY: number | null;
	/**
	 * The avatar's own height in stage pixels, from setHotSpot_v1's third
	 * argument. Null when the avatar passes only two, as guest.swf does.
	 */
	hotSpotHeight: number | null;
	/**
	 * The y of the hot spot in stage pixels: the avatar's own answer to where
	 * its feet are, which is what the ground offset otherwise has to measure.
	 */
	hotSpotY: number | null;
	/** The avatar's own stage size, which decides its size in the world. */
	stage: { width: number; height: number };
	/** Where the feet are, as a fraction from the top of the frame. */
	ground: number;
	/**
	 * Highest drawn row seen while measuring the ground, as a fraction from
	 * the top of the frame. `1` means never measured. The nameplate's
	 * fallback when the avatar reports no height of its own.
	 */
	artTop: number;
	/** Cleared by `remove`, so a load in flight can give up promptly. */
	alive: boolean;
	/** This avatar's id within the room, as the SDK sees it. */
	entityId: string;
	/** Room-relative location, [x, y, z] in 0..1. */
	location: [number, number, number];
	connected: boolean;
};

/** Source of `Entry.token`. Monotonic for the life of the page. */
let tokenCounter = 0;

export class SwfAssetManager {
	private entries = new Map<number, Entry>();

	/** Where Flash runs. The only thing here that knows. */
	private readonly host: SwfHost;

	constructor(
		private readonly world: {
			renderer: THREE.WebGLRenderer;
			swfStreams: Set<SwfStreamRenderer>;
		},
		host: SwfHost = new FrameSwfHost(SANDBOX_URL, SANDBOX_OPAQUE),
	) {
		this.host = host;
	}

	public async add(
		eid: number,
		swfFile: string,
		name = "",
	): Promise<THREE.Texture> {
		this.remove(eid);

		const stream = new SwfStreamRenderer(this.world);

		const entry: Entry = {
			token: ++tokenCounter,
			hostId: String(eid),
			stream,
			states: null,
			actions: null,
			moving: false,
			orientation: 0,
			preferredY: null,
			hotSpotHeight: null,
			hotSpotY: null,
			stage: { width: 0, height: 0 },
			ground: 1,
			artTop: 1,
			alive: true,
			entityId: String(eid),
			location: [0.5, 0, 0.5],
			connected: false,
		};
		this.entries.set(eid, entry);

		const onEvent = (type: string, value: any) => {
			switch (type as HostEventType) {
				case "connected":
					entry.connected = true;
					// Granting control and announcing are the room's, and the
					// room is on the far side of the seam. All the page knows
					// is that this avatar is ready to be let in.
					this.host.enter(entry.hostId);
					break;
				case "setPreferredY":
					entry.preferredY = Number(value);
					break;
				case "setHotSpot": {
					// [x, y, height]. The height is the interesting one: it is
					// what Whirled positioned the name label from. It is
					// optional in the SDK and arrives as NaN when the avatar
					// passes only x and y.
					const height = Number(indexOf(value, 2));
					entry.hotSpotHeight =
						Number.isFinite(height) && height > 0 ? height : null;
					const hotY = Number(indexOf(value, 1));
					entry.hotSpotY =
						Number.isFinite(hotY) && hotY > 0 ? hotY : null;
					break;
				}
				// setState/setOrientation come back when the avatar changes
				// itself. Nothing consumes them yet; the room is the authority
				// on both, so acting on them would fight the movement system.
			}
		};

		// The box starts at 1x1 and is set for real by sizeToAvatar, once the
		// avatar has reported the stage size it wants.
		await this.host.create(entry.hostId, {
			avatarUrl: resolveAvatarUrl(swfFile),
			entityId: entry.entityId,
			width: 1,
			height: 1,
			onStream: (event) => stream.handleEvent(event),
			onEvent,
		});

		// The wearer's name is a fact about the room (std:name), published
		// like location and dimensions are.
		if (name !== "") {
			this.host.update(entry.hostId, { name });
		}

		await this.sizeToAvatar(entry);
		if (!entry.alive) return stream.target.texture;
		entry.ground = await waitForGround(entry, this.world.renderer);

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
		const size = await waitForStageSize(this.host, entry);
		if (!entry.alive) return;
		entry.stage = size;
		// std:dimensions is the avatar's stage size, not its viewport, so the
		// room hears the unscaled one.
		this.host.update(entry.hostId, {
			width: size.width,
			height: size.height,
		});
		this.host.resize(
			entry.hostId,
			size.width * RENDER_SCALE,
			size.height * RENDER_SCALE,
		);
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

	/**
	 * Release an avatar's player, render target and textures.
	 *
	 * Pass the `token` of the registration you mean to release — from
	 * `getToken`, or off the billboard's `userData.swfToken` — and the call
	 * becomes a no-op if the entity has since been given a different avatar.
	 * Without it, releasing during an avatar swap kills the incoming avatar.
	 *
	 * Returns whether anything was released.
	 */
	/**
	 * Release an avatar's player and render target.
	 *
	 * With a token this releases one *registration*: it no-ops if the entity
	 * has since been given a different avatar. Without one it releases
	 * whatever the entity currently has, which is what `add` needs to clear
	 * the way for a replacement — and is never what teardown wants. A caller
	 * tearing down an avatar that owns no registration must not call this at
	 * all, or it will destroy an incoming avatar that has already registered.
	 */
	public remove(eid: number, token?: number): boolean {
		const entry = this.entries.get(eid);
		if (entry === undefined) return false;
		if (token !== undefined && entry.token !== token) return false;
		entry.alive = false;
		this.host.destroy(entry.hostId);
		entry.stream.dispose();
		this.entries.delete(eid);
		return true;
	}

	/** The token identifying this entity's current avatar registration. */
	public getToken(eid: number): number | undefined {
		return this.entries.get(eid)?.token;
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
	 * Where the avatar's feet are, as a fraction from the top of its frame.
	 *
	 * The SDK's own answers outrank our measurement whenever the avatar gave
	 * one (decided 2026-08-22, superseding §15.12's ordering): setPreferredY
	 * is a request, setHotSpot's y is the author's declared ground contact,
	 * and the alpha scan is a guess that reads a floating avatar wrong — the
	 * guest ghost's body bottom crosses the threshold at 0.64 of the frame
	 * while its declared hot spot (and its shadow) sit at 0.9, so trusting
	 * the scan stood it on its chin. The cost, accepted: an avatar that
	 * reports its container origin as its hot spot now stands wrong; §15.12
	 * priced that the other way, and the guest is the avatar we actually
	 * ship. The measurement remains the answer for avatars that never call
	 * setHotSpot at all.
	 */
	public getGroundOffset(eid: number): number {
		const entry = this.entries.get(eid);
		if (entry === undefined) return 1;
		if (entry.preferredY !== null && entry.stage.height > 0) {
			return entry.preferredY / entry.stage.height;
		}
		if (entry.hotSpotY !== null && entry.stage.height > 0) {
			return Math.min(1, entry.hotSpotY / entry.stage.height);
		}
		// `1` means the scan found nothing to measure.
		return entry.ground;
	}

	/**
	 * How tall the avatar says it is, as a fraction of its own stage height.
	 *
	 * The SWF's stage is a canvas, not a silhouette: an avatar authored with
	 * headroom for a jump animation leaves the top of the frame empty, and a
	 * nameplate placed at the top of the frame floats far above the character.
	 * setHotSpot's third argument is the avatar's own answer to "how tall am
	 * I", and it is what Whirled positioned the name label from — kawaii
	 * passes `avatar.character.height + 10`, padding included.
	 *
	 * When the avatar never reported one, the measured top edge of its
	 * artwork stands in — the height from the standing line to the highest
	 * drawn row — so a character in a mostly-empty frame (the guest ghost
	 * gives a hot spot but no height) still gets its nameplate just above
	 * its head rather than at the top of the canvas. Null only when neither
	 * answer exists.
	 */
	public getHeightFraction(eid: number): number | null {
		const entry = this.entries.get(eid);
		if (entry === undefined) return null;
		if (entry.hotSpotHeight !== null && entry.stage.height > 0) {
			// Clamped: the height is measured from the hot spot, and an
			// avatar that reports more than its own frame would put the
			// nameplate outside the artwork it is supposed to sit above.
			return Math.min(1, entry.hotSpotHeight / entry.stage.height);
		}
		const ground = this.getGroundOffset(eid);
		if (entry.artTop < ground) {
			return ground - entry.artTop;
		}
		return null;
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
		this.host.update(entry.hostId, { orientation: degrees });
		this.pushAppearance(entry);
	}

	/**
	 * Appearance is one call in the SDK, not a set of independent setters, so
	 * moving, orientation and location are pushed together from cached values.
	 */
	private pushAppearance(entry: Entry) {
		this.host.call(
			entry.hostId,
			"whirledSetAppearance",
			entry.location[0],
			entry.location[1],
			entry.location[2],
			entry.orientation,
			entry.moving,
			false,
		);
	}

	public async getStates(eid: number): Promise<string[]> {
		const entry = this.entries.get(eid);
		if (entry === undefined) return [];
		if (entry.states === null) {
			await this.waitForConnection(entry);
			entry.states = toStringArray(
				await this.query(eid, "whirledGetStates"),
			);
		}
		return entry.states;
	}

	public async getActions(eid: number): Promise<string[]> {
		const entry = this.entries.get(eid);
		if (entry === undefined) return [];
		if (entry.actions === null) {
			await this.waitForConnection(entry);
			entry.actions = toStringArray(
				await this.query(eid, "whirledGetActions"),
			);
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
		const expired = visibleDeadline(CONNECT_TIMEOUT_MS);
		while (!entry.connected && !expired()) {
			if (await this.host.query(entry.hostId, "whirledIsConnected")) {
				entry.connected = true;
				break;
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

	// ------------------------------------------------------------- the room
	//
	// What is left here is the page's half of it: the movement system's samples
	// arrive as world coordinates and have to become the two different things
	// the SDK wants — an appearance edge for this avatar, and a stream of
	// positions for its neighbours. The neighbours are ./room's business.

	/**
	 * Tell an avatar where it is, in room-relative coordinates (0..1).
	 *
	 * Drives three things at once: the avatar's own appearance, what
	 * `std:location_pixel` reports about it to others, and the entityMoved
	 * events other avatars receive.
	 */
	public setLocation(eid: number, x: number, y: number, z: number) {
		const entry = this.entries.get(eid);
		if (entry === undefined) return;
		const [px, py, pz] = entry.location;
		if (
			Math.abs(px - x) < MOVE_EPSILON &&
			Math.abs(py - y) < MOVE_EPSILON &&
			Math.abs(pz - z) < MOVE_EPSILON
		) {
			return;
		}
		entry.location = [x, y, z];
		// Deliberately not pushing appearance while the avatar is walking.
		//
		// appearanceChanged is an edge, not a sample. Avatars treat it as
		// "your look changed, re-pick your animation", and they re-pick by
		// jumping to the first frame of a labelled scene — Whirled's own
		// guest.swf does exactly `gotoAndPlay(1, moving ? "walk_..." :
		// "face_...")` on every event, with no check for whether anything
		// actually changed. Pushing it per frame of movement restarts the walk
		// cycle every frame, so the avatar slides along the floor frozen on
		// frame 1. Whirled itself moved actors by tweening between endpoints,
		// so the avatar heard about a walk twice: once starting, once ending.
		//
		// setMoving covers both of those edges and carries the cached location
		// with it, so the only case left here is a position change with no
		// movement — a placement or a teleport — which is a real appearance
		// change and does need to go through.
		if (!entry.moving) this.pushAppearance(entry);
		// Neighbours still get every step; the room fans it out.
		this.host.update(entry.hostId, { location: entry.location });
	}

	/** Invoke one of the shim's callbacks on an entity, if it still has one. */
	private call(eid: number, name: string, ...args: unknown[]) {
		const entry = this.entries.get(eid);
		if (entry === undefined) return;
		this.host.call(entry.hostId, name, ...args);
	}

	/** As `call`, for the callbacks whose answer we read. */
	private async query(
		eid: number,
		name: string,
		...args: unknown[]
	): Promise<unknown> {
		const entry = this.entries.get(eid);
		if (entry === undefined) return undefined;
		return this.host.query(entry.hostId, name, ...args);
	}
}

/**
 * Read one element of a value that crossed ExternalInterface.
 *
 * An AS3 Array can arrive as a real array or as a plain object with numeric
 * keys depending on how it was marshalled, so neither form can be assumed.
 */
function indexOf(value: any, index: number): unknown {
	if (value === null || value === undefined) return undefined;
	if (Array.isArray(value)) return value[index];
	if (typeof value === "object") return value[String(index)];
	return undefined;
}

/** Animation names carry a state_/action_ prefix the SDK does not use. */
function stripPrefix(name: string): string {
	return name.replace(/^(action|state)_/i, "");
}

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
}

/**
 * Turn a stored avatar path into a URL Flash can load.
 *
 * Resolved against the sandbox's origin rather than the app's, because that is
 * where it will be fetched from and Flash requires the shim and the avatar to
 * share a security domain. In dev both names point at the same Go server, so
 * this is a rewrite; in production the sandbox is a separate app and will have
 * to serve these bytes itself (M6 steps 4 and 5).
 */
function resolveAvatarUrl(swfFile: string): string {
	if (swfFile === "") {
		return `${SANDBOX_ORIGIN}/avatar/static/assets/avatars/guest.swf`;
	}
	if (swfFile.startsWith("data:")) return swfFile;
	if (/^https?:/.test(swfFile)) {
		// An absolute URL from elsewhere in the app; keep the path, take the
		// sandbox's /avatar proxy — the size-capped, SWF-sniffed route that is
		// the only way user bytes reach Flash (M6 step 5).
		const url = new URL(swfFile);
		return `${SANDBOX_ORIGIN}/avatar${url.pathname}${url.search}`;
	}
	return `${SANDBOX_ORIGIN}/avatar${swfFile}`;
}

const nextFrame = () =>
	new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * A timeout that only counts down while the page is visible.
 *
 * Every wait in the load path is driven by requestAnimationFrame — the shim's
 * first frame, the stream's first composition — and a hidden tab gets no rAF
 * at all. Counting wall-clock time would expire every wait within seconds of
 * the tab being backgrounded and leave the avatar with a fallback stage size
 * and a guessed ground line: wrong, permanently, and only on the machines
 * where someone opened the room in a background tab.
 *
 * Waiting longer is the right failure here. A hidden tab is not rendering, so
 * nothing is waiting on the answer.
 */
function visibleDeadline(ms: number): () => boolean {
	let remaining = ms;
	let last = performance.now();
	const started = last;
	return () => {
		const now = performance.now();
		if (!document.hidden) remaining -= now - last;
		last = now;
		// Two clocks, and either one can expire it. The visible budget is the
		// point of this: everything being waited for is driven by rAF, which a
		// hidden tab does not get, so counting wall-clock time there just
		// burns the timeout and settles for a guess.
		//
		// The wall-clock ceiling is the backstop. Counting *only* visible time
		// means a tab that is never shown waits forever, and a load that never
		// finishes is worse than one that gives up: nothing downstream has a
		// timeout of its own, so the avatar simply never appears.
		return remaining <= 0 || now - started >= ms * VISIBLE_WAIT_CEILING;
	};
}

/** How many times its visible budget a wait may spend in wall-clock time. */
const VISIBLE_WAIT_CEILING = 12;

/**
 * Wait until the loaded avatar reports a stage size.
 *
 * Ruffle's own `metadata` describes the shim, not the SWF the shim loaded, so
 * the size has to come back through the shim. A zero reading means "the avatar
 * has not initialized yet" rather than "this avatar is empty".
 */
async function waitForStageSize(
	host: SwfHost,
	entry: Entry,
): Promise<{ width: number; height: number }> {
	const expired = visibleDeadline(CONNECT_TIMEOUT_MS);
	while (entry.alive && !expired()) {
		const size = await host.query(entry.hostId, "whirledGetStageSize");
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
	entry: Entry,
	renderer: THREE.WebGLRenderer,
): Promise<number> {
	const stream = entry.stream;
	const expired = visibleDeadline(CONNECT_TIMEOUT_MS);
	let ground = 1;

	let attempts = 0;
	while (entry.alive && !expired()) {
		if (stream.composedFrames > 0) {
			const edges = stream.measureEdges(renderer);
			ground = edges.bottom;
			if (ground < 1) {
				entry.artTop = Math.min(entry.artTop, edges.top);
				break;
			}
			// Measuring looks for the lowest row the avatar draws solidly, a
			// question a translucent avatar has no answer to: Spooky Ghost
			// never reaches the opacity threshold, so this would scan until
			// the timeout and then guess. Once it has had a fair chance, let
			// the avatar's own hot spot answer instead.
			if (++attempts >= GROUND_SAMPLE_FRAMES && entry.hotSpotY !== null) {
				return 1;
			}
		}
		await nextFrame();
	}
	if (ground === 1) return 1;

	for (let i = 0; i < GROUND_SAMPLE_FRAMES && entry.alive; i++) {
		await nextFrame();
		const edges = stream.measureEdges(renderer);
		if (edges.bottom < 1) {
			ground = Math.max(ground, edges.bottom);
			entry.artTop = Math.min(entry.artTop, edges.top);
		}
	}
	return ground;
}
