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
	| "setHotSpot"
	| "sendSignal"
	| "sendMessage";

/**
 * Nominal room size in Whirled units, used to turn a room-relative location
 * into the pixel coordinates `std:location_pixel` reports.
 *
 * Avatars use those pixels for distance and facing maths — Land Sea Animals
 * picks its duel opponent that way — so the numbers only have to be
 * self-consistent, not to match anything in the 3D scene.
 */
const ROOM_BOUNDS = { width: 700, height: 500, depth: 400 };

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
	/**
	 * The avatar's own height in stage pixels, from setHotSpot_v1's third
	 * argument. Null when the avatar passes only two, as guest.swf does.
	 */
	hotSpotHeight: number | null;
	/** The avatar's own stage size, which decides its size in the world. */
	stage: { width: number; height: number };
	/** Where the feet are, as a fraction from the top of the frame. */
	ground: number;
	/** Cleared by `remove`, so a load in flight can give up promptly. */
	alive: boolean;
	/** This avatar's id within the room, as the SDK sees it. */
	entityId: string;
	/** Room-relative location, [x, y, z] in 0..1. */
	location: [number, number, number];
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

/** Synchronous room queries, keyed the same way as `hostListeners`. */
const hostQueries = new Map<
	string,
	(query: string, a: any, b: any) => unknown
>();

let hostEventInstalled = false;

/** Source of `Entry.token`. Monotonic for the life of the page. */
let tokenCounter = 0;

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
	// Synchronous counterpart: the SDK's room queries return a value inline, so
	// this has to answer within the caller's own AVM tick. That is only
	// possible while every player shares this JS context — see the spec, W4.
	(window as any).whirledHostQuery = (
		hostId: string,
		query: string,
		a: any,
		b: any,
	) => hostQueries.get(String(hostId))?.(query, a, b) ?? null;
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
			token: ++tokenCounter,
			player,
			stream,
			host,
			states: null,
			actions: null,
			moving: false,
			orientation: 0,
			preferredY: null,
			hotSpotHeight: null,
			stage: { width: 0, height: 0 },
			ground: 1,
			alive: true,
			entityId: String(eid),
			location: [0.5, 0, 0.5],
			connected: false,
		};
		this.entries.set(eid, entry);

		hostListeners.set(String(eid), (type, value) => {
			switch (type) {
				case "connected":
					entry.connected = true;
					// Entity awareness, signals and the SDK's own tick timer
					// are gated on hasControl, which starts false. Nothing
					// about the room reaches an avatar until this is granted.
					// Re-assert identity and room size here as well as at load:
					// the shim registers its callbacks on its own first frame,
					// which can land after load() resolves.
					this.call(eid, "whirledSetEntityId", entry.entityId);
					this.call(
						eid,
						"whirledSetRoomBounds",
						ROOM_BOUNDS.width,
						ROOM_BOUNDS.height,
						ROOM_BOUNDS.depth,
					);
					this.call(eid, "whirledGrantControl");
					this.announceEntered(eid);
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
					break;
				}
				case "sendSignal":
					this.routeSignal(eid, value);
					break;
				case "sendMessage":
					this.routeMessage(eid, value);
					break;
				// setState/setOrientation come back when the avatar changes
				// itself. Nothing consumes them yet; the room is the authority
				// on both, so acting on them would fight the movement system.
			}
		});

		hostQueries.set(String(eid), (query, a, b) =>
			this.answerQuery(eid, query, a, b),
		);

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

		this.call(eid, "whirledSetEntityId", entry.entityId);
		this.call(
			eid,
			"whirledSetRoomBounds",
			ROOM_BOUNDS.width,
			ROOM_BOUNDS.height,
			ROOM_BOUNDS.depth,
		);

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
		const size = await waitForStageSize(entry);
		if (!entry.alive) return;
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
		this.announceLeft(eid, entry.entityId);
		hostListeners.delete(String(eid));
		hostQueries.delete(String(eid));
		try {
			entry.player.remove();
		} catch {
			// Ruffle throws if the instance is already gone; nothing to undo.
		}
		entry.host.remove();
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
	 * Null when the avatar never reported one, in which case the frame is the
	 * only thing left to measure against.
	 */
	public getHeightFraction(eid: number): number | null {
		const entry = this.entries.get(eid);
		if (entry === undefined) return null;
		if (entry.hotSpotHeight === null || entry.stage.height <= 0) {
			return null;
		}
		// Clamped: the height is measured from the hot spot, and an avatar
		// that reports more than its own frame would put the nameplate
		// outside the artwork it is supposed to sit above.
		return Math.min(1, entry.hotSpotHeight / entry.stage.height);
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
	 * moving, orientation and location are pushed together from cached values.
	 */
	private pushAppearance(entry: Entry) {
		try {
			entry.player.whirledSetAppearance?.(
				entry.location[0],
				entry.location[1],
				entry.location[2],
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
		const expired = visibleDeadline(CONNECT_TIMEOUT_MS);
		while (!entry.connected && !expired()) {
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

	// ------------------------------------------------------------- the room
	//
	// Everything below is what makes two avatars aware of each other. The SDK
	// never lets one avatar touch another: every call goes to the host and the
	// host routes it, which is why this lives here rather than in the shim.

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
		// Neighbours still get every step: entityMoved is a sample, and an
		// avatar tracking another one wants the current position, not the last
		// place it stood still.
		for (const other of this.entries.keys()) {
			if (other === eid) continue;
			this.call(other, "whirledEntityMoved", entry.entityId, [x, y, z]);
		}
	}

	/** Broadcast a transient signal to every avatar in the room. */
	private routeSignal(_from: number, value: any) {
		const [name, arg] = unpackPair(value);
		if (name === null) return;
		// Including the sender: Whirled delivers a signal to every entity in
		// the room, and LSA relies on that to hear its own death notice.
		for (const eid of this.entries.keys()) {
			this.call(eid, "whirledSignal", name, arg);
		}
	}

	/**
	 * Deliver a message.
	 *
	 * The SDK sends a message to every instance of the sending entity, which
	 * in a single-client room means the sender itself. Actions arrive here too
	 * — `sendMessage(name, arg, true)` is how the SDK triggers one — and are
	 * delivered the same way.
	 */
	private routeMessage(from: number, value: any) {
		const [name, arg] = unpackPair(value);
		if (name === null) return;
		this.call(from, "whirledMessage", name, arg);
	}

	/**
	 * Answer one of the SDK's synchronous room queries.
	 *
	 * The asking entity is not needed yet — both queries are room-wide — but it
	 * is what a permission check would key on, so the channel carries it.
	 */
	private answerQuery(
		_asker: number,
		query: string,
		a: any,
		b: any,
	): unknown {
		switch (query) {
			case "getEntityIds":
				// `a` is a type filter; every entity we host is an avatar.
				if (a !== null && a !== undefined && a !== "avatar") return [];
				return [...this.entries.values()].map((e) => e.entityId);

			case "getEntityProperty":
				return this.entityProperty(String(a), String(b));

			default:
				console.warn(`swf: unknown host query ${query}`);
				return null;
		}
	}

	/**
	 * Read a property of another entity.
	 *
	 * `std:` keys are the host's to answer. Everything else belongs to the
	 * entity that registered it, so it is forwarded to that avatar's own
	 * provider — and forwarded live, not from a cache: a property read is not
	 * necessarily side-effect free. Land Sea Animals kills its opponent by
	 * reading `landseaanimal:IKillJoo` on it, and the death happens inside the
	 * target's provider.
	 */
	private entityProperty(entityId: string, key: string): unknown {
		const target = this.byEntityId(entityId);
		if (target === undefined) return null;

		switch (key) {
			case "std:location_pixel":
				return [
					target.location[0] * ROOM_BOUNDS.width,
					target.location[1] * ROOM_BOUNDS.height,
					target.location[2] * ROOM_BOUNDS.depth,
				];
			case "std:location_logical":
				return [...target.location];
			case "std:orientation":
				return target.orientation;
			case "std:type":
				return "avatar";
			case "std:dimensions":
				return [target.stage.width, target.stage.height];
		}

		return this.callEntry(target, "whirledLookupProperty", key);
	}

	/** Tell the room an avatar arrived, and the avatar who is already here. */
	private announceEntered(eid: number) {
		const entry = this.entries.get(eid);
		if (entry === undefined) return;
		for (const [other, target] of this.entries) {
			if (other === eid) continue;
			this.call(other, "whirledEntityEntered", entry.entityId);
			this.call(eid, "whirledEntityEntered", target.entityId);
		}
	}

	private announceLeft(eid: number, entityId: string) {
		for (const other of this.entries.keys()) {
			if (other === eid) continue;
			this.call(other, "whirledEntityLeft", entityId);
		}
	}

	private byEntityId(entityId: string): Entry | undefined {
		for (const entry of this.entries.values()) {
			if (entry.entityId === entityId) return entry;
		}
		return undefined;
	}

	/** Invoke one of the shim's ExternalInterface callbacks. */
	private call(eid: number, name: string, ...args: unknown[]): unknown {
		const entry = this.entries.get(eid);
		if (entry === undefined) return undefined;
		return this.callEntry(entry, name, ...args);
	}

	private callEntry(entry: Entry, name: string, ...args: unknown[]): unknown {
		const player = entry.player;
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

/**
 * Unpack a [name, value] pair as it arrives from the shim.
 *
 * ExternalInterface hands arrays across as array-likes rather than as real
 * Arrays in some Ruffle paths, so this is deliberately forgiving.
 */
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

function unpackPair(value: any): [string | null, unknown] {
	if (value === null || value === undefined) return [null, null];
	if (Array.isArray(value)) return [String(value[0]), value[1] ?? null];
	if (typeof value === "object" && "0" in value) {
		return [String(value[0]), value[1] ?? null];
	}
	return [String(value), null];
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
	return () => {
		const now = performance.now();
		if (!document.hidden) remaining -= now - last;
		last = now;
		return remaining <= 0;
	};
}

/**
 * Wait until the loaded avatar reports a stage size.
 *
 * Ruffle's own `metadata` describes the shim, not the SWF the shim loaded, so
 * the size has to come back through the shim. A zero reading means "the avatar
 * has not initialized yet" rather than "this avatar is empty".
 */
async function waitForStageSize(
	entry: Entry,
): Promise<{ width: number; height: number }> {
	const expired = visibleDeadline(CONNECT_TIMEOUT_MS);
	while (entry.alive && !expired()) {
		let size: unknown;
		try {
			size = entry.player.whirledGetStageSize?.();
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
	entry: Entry,
	renderer: THREE.WebGLRenderer,
): Promise<number> {
	const stream = entry.stream;
	const expired = visibleDeadline(CONNECT_TIMEOUT_MS);
	let ground = 1;

	while (entry.alive && !expired()) {
		if (stream.composedFrames > 0) {
			ground = stream.measureBottomEdge(renderer);
			if (ground < 1) break;
		}
		await nextFrame();
	}
	if (ground === 1) return 1;

	for (let i = 0; i < GROUND_SAMPLE_FRAMES && entry.alive; i++) {
		await nextFrame();
		const sample = stream.measureBottomEdge(renderer);
		if (sample < 1) ground = Math.max(ground, sample);
	}
	return ground;
}
