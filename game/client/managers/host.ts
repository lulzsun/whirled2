import { SwfRoom, SwfRoomEntity } from "./room";

// The boundary between our page and Flash. See docs/specs/swf-avatar-rendering.md
// §16 (M6), step 1.
//
// Everything that touches a RufflePlayer lives behind `SwfHost`. Today the only
// implementation runs Ruffle in this document, exactly as M4 left it — this
// file is a re-housing, not a change. The point is that `SwfAssetManager` no
// longer knows Flash is in the page, so a second implementation can put it on
// another origin (M6) or, if that ever becomes cheap, in a worker, without
// touching the room logic.
//
// Three channels cross the boundary, and they are not alike:
//
//   Stream. The forked render backend's draw commands, one message per frame
//   per avatar. High volume, one direction, already shaped for transfer — the
//   backend builds its typed arrays with Float32Array::from, which copies into
//   the JS heap rather than viewing wasm memory.
//
//   Calls and events. The shim's whirled* ExternalInterface callbacks going in,
//   and whirledHostEvent coming back out. Both are fire-and-forget, so both
//   survive becoming messages. `query` exists for the two callbacks whose
//   return value we read; both callers already await.
//
//   Queries. The SDK's room queries (getEntityIds, getEntityProperty) return a
//   value *inline*, inside the calling avatar's own AVM tick. No message
//   boundary can serve those, so they do not cross one: ./room answers them on
//   this side, from state the page publishes. That is why every avatar has to
//   share one host — see W4.

/**
 * How a host reaches back into whoever asked for an avatar.
 *
 * Registered per instance at `create`, and torn down by `destroy`.
 */
export type SwfInstanceOptions = {
	/**
	 * Absolute URL of the avatar SWF. The host decides how Flash actually
	 * obtains those bytes — an out-of-process host has to serve or proxy them
	 * from its own origin, or the shim and the avatar land in different Flash
	 * security domains and the handshake fails.
	 */
	avatarUrl: string;
	/** This avatar's id within the room, as the SDK sees it. */
	entityId: string;
	/** Size of the instance's viewport in CSS pixels. May change later. */
	width: number;
	height: number;
	/** A frame's worth of draw commands from the forked render backend. */
	onStream: (event: any) => void;
	/**
	 * An asynchronous event pushed out by the shim.
	 *
	 * Only the ones the page has a use for: signals and messages are addressed
	 * to other avatars and never get this far.
	 */
	onEvent: (type: string, value: any) => void;
};

export interface SwfHost {
	/**
	 * Start an avatar. Resolves once the shim has loaded — which is before it
	 * has connected, and well before it has drawn anything.
	 *
	 * `id` is the caller's, and is what every other method takes. It reaches
	 * Flash as the shim's `hostId` flashvar and comes back on every event.
	 */
	create(id: string, options: SwfInstanceOptions): Promise<void>;

	/** Resize an instance's viewport, in CSS pixels. */
	resize(id: string, width: number, height: number): void;

	/**
	 * Grant control and announce the avatar to the room.
	 *
	 * Separate from `create` because the SDK gates everything on `hasControl`,
	 * so this must not happen until the avatar has answered the handshake —
	 * which the page learns about through `onEvent("connected")`.
	 */
	enter(id: string): void;

	/**
	 * Publish what the room should know about an instance. Omitted fields are
	 * left alone. One-way: nothing comes back, and nothing waits on it.
	 */
	update(id: string, patch: Partial<SwfRoomEntity>): void;

	/** Invoke one of the shim's callbacks, ignoring anything it returns. */
	call(id: string, name: string, ...args: unknown[]): void;

	/** Invoke a callback and read its result. */
	query(id: string, name: string, ...args: unknown[]): Promise<unknown>;

	/** Stop an avatar, announce its departure, and release what it holds. */
	destroy(id: string): void;
}

// ---------------------------------------------------------------------------

/**
 * Routing tables for the two globals the shim calls, shared by every host in
 * the document.
 *
 * ExternalInterface.call reaches one global scope, so with every player in one
 * page the events would otherwise be indistinguishable. Module-level rather
 * than per-host because the globals are: two hosts in one document (the room
 * and the upload preview each build their own world) install the same two
 * functions, and only the last install would survive if it routed into
 * instance state. Ids are entity ids, so two worlds can still collide on one —
 * that is true of M4 as well, and is not this change's to fix.
 */
declare global {
	interface Window {
		/**
		 * Installed by ruffle.js, which only the sandbox document loads. The
		 * declaration lives here because this class is the last thing that
		 * touches it — the app's own pages stopped loading Ruffle at M6 step 6.
		 */
		RufflePlayer: any;
	}
}

const eventListeners = new Map<string, (type: string, value: any) => void>();
const queryHandlers = new Map<
	string,
	(query: string, a: any, b: any) => unknown
>();

let bridgeInstalled = false;

function installBridge() {
	if (bridgeInstalled) return;
	bridgeInstalled = true;
	(window as any).whirledHostEvent = (
		hostId: string,
		type: string,
		value: any,
	) => {
		eventListeners.get(String(hostId))?.(type, value);
	};
	(window as any).whirledHostQuery = (
		hostId: string,
		query: string,
		a: any,
		b: any,
	) => queryHandlers.get(String(hostId))?.(query, a, b) ?? null;
}

type Instance = {
	player: any;
	element: HTMLElement;
};

/**
 * Runs Ruffle in this document, with no isolation whatsoever.
 *
 * A SWF here can reach `window`, and therefore anything the session can: the
 * auth cookie is HttpOnly but rides same-origin requests regardless. This is
 * the accepted cost of M4 and what M6 exists to retire. Do not serve user
 * uploads through it in production.
 */
export class InPageSwfHost implements SwfHost {
	private instances = new Map<string, Instance>();

	/**
	 * Absolute URL of whirled-host.swf.
	 *
	 * A constructor argument rather than a constant because this class also
	 * runs *inside* the sandbox, where the shim has to come from the sandbox's
	 * own origin — the shim reaches into the avatar it loads, which Flash only
	 * permits within one security domain.
	 */
	private readonly shimUrl: string;

	/**
	 * Players live in one hidden container rather than in the scene's DOM.
	 * Positioned off-screen rather than display:none, because a hidden element
	 * gets no layout and Ruffle would have no viewport to scale into.
	 */
	private container: HTMLElement | null = null;

	/**
	 * The room, on this side of the boundary. It calls straight into the
	 * players beside it, which is what lets it answer the SDK's synchronous
	 * queries — including the ones that resolve by running another avatar's
	 * code. See ./room.
	 */
	private readonly room = new SwfRoom((id, name, args) =>
		this.invoke(id, name, args),
	);

	constructor(shimUrl: string) {
		this.shimUrl = shimUrl;
		installBridge();
	}

	public async create(id: string, options: SwfInstanceOptions) {
		this.destroy(id);

		const element = document.createElement("div");
		element.dataset.swfHostId = id;
		element.style.cssText =
			"position:fixed;left:-10000px;top:0;" +
			`width:${options.width}px;height:${options.height}px;`;
		this.getContainer().appendChild(element);

		const player = window.RufflePlayer.newest().createPlayer();
		// <ruffle-player> defaults to 550x400 and ignores its parent, and that
		// box is what decides both the stage size the shim lays the avatar out
		// in and the render target's resolution. Left alone, every avatar would
		// render into a 550x400 letterbox regardless of its own shape.
		player.style.cssText = "display:block;width:100%;height:100%;";
		element.appendChild(player);
		player.whirledStream = options.onStream;

		this.instances.set(id, { player, element });
		eventListeners.set(id, (type, value) => {
			// Signals and messages are routing, not news. The room consumes
			// them; only what the page has a use for gets forwarded.
			if (this.room.handleEvent(id, type, value)) return;
			options.onEvent(type, value);
		});
		queryHandlers.set(id, (query, a, b) =>
			this.room.query(id, query, a, b),
		);

		// The shim loads the avatar itself, from the `avatar` flashvar, then
		// scales it to fill whatever box it is given.
		await player.ruffle().load({
			url:
				`${this.shimUrl}` +
				`?avatar=${encodeURIComponent(options.avatarUrl)}&hostId=${id}`,
			allowScriptAccess: true,
			// The one browser-interaction API CSP cannot reach: navigateToURL
			// out of the SWF becomes a page navigation, not a fetch. Denied
			// outright — nothing in an avatar has business steering a browser.
			// (`allowNetworking` stays at its default: Flash's stricter levels
			// also disable ExternalInterface, which the shim is built on. The
			// sandbox document's connect-src is what fences URLLoader in.)
			openUrlMode: "deny",
			autoplay: "on",
			splashScreen: false,
			unmuteOverlay: "hidden",
			letterbox: "off",
			wmode: "transparent",
			preferredRenderer: "three",
			parameters: { avatar: options.avatarUrl, hostId: id },
		});

		// Registered only once the SWF is up, since registering asserts the
		// avatar's identity and the room's bounds to it.
		this.room.add(id, options.entityId);
	}

	public resize(id: string, width: number, height: number) {
		const instance = this.instances.get(id);
		if (instance === undefined) return;
		instance.element.style.width = `${width}px`;
		instance.element.style.height = `${height}px`;
	}

	public enter(id: string) {
		this.room.enter(id);
	}

	public update(id: string, patch: Partial<SwfRoomEntity>) {
		this.room.update(id, patch);
	}

	public call(id: string, name: string, ...args: unknown[]) {
		this.invoke(id, name, args);
	}

	public async query(id: string, name: string, ...args: unknown[]) {
		return this.invoke(id, name, args);
	}

	public destroy(id: string) {
		const instance = this.instances.get(id);
		if (instance === undefined) return;
		// Before the player goes: the departure is announced to avatars that
		// are still alive, and this one is still a legitimate target of the
		// property reads that announcement can provoke.
		this.room.remove(id);
		eventListeners.delete(id);
		queryHandlers.delete(id);
		this.instances.delete(id);
		try {
			instance.player.remove();
		} catch {
			// Ruffle throws if the instance is already gone; nothing to undo.
		}
		instance.element.remove();
	}

	private invoke(id: string, name: string, args: unknown[]): unknown {
		const player = this.instances.get(id)?.player;
		if (player === undefined) return undefined;
		// The shim registers its callbacks with the host id in the name, and
		// that is what makes cross-avatar routing correct: Ruffle dispatches
		// an inbound callback to the currently executing movie whenever the
		// NAME matches one of its own, whichever player was called. Unique
		// names confine that re-entrant path to the one movie it is correct
		// for. See registerExternalInterface in WhirledHost.as.
		const fn = player[`${name}_${id}`] ?? player[name];
		// Callbacks are not registered until the shim's first frame, so a
		// missing one means "too early", not "wrong name".
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
