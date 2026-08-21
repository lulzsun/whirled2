import { API_URL } from "../constants";

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
//   boundary can serve those, which is why `callSync` exists and why every
//   avatar has to share one host — see the note on it, and W4.

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
	/** Size of the instance's viewport in CSS pixels. May change later. */
	width: number;
	height: number;
	/** A frame's worth of draw commands from the forked render backend. */
	onStream: (event: any) => void;
	/** An asynchronous event pushed out by the shim. */
	onEvent: (type: string, value: any) => void;
	/** A synchronous room query from the SDK. Must be answered inline. */
	onQuery: (query: string, a: any, b: any) => unknown;
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

	/** Invoke one of the shim's callbacks, ignoring anything it returns. */
	call(id: string, name: string, ...args: unknown[]): void;

	/** Invoke a callback and read its result. */
	query(id: string, name: string, ...args: unknown[]): Promise<unknown>;

	/**
	 * Invoke a callback and read its result *without yielding*.
	 *
	 * Only legitimate while answering a synchronous room query, and only
	 * because the SDK resolves a property by calling into another avatar. An
	 * out-of-process host cannot implement this across its boundary; what makes
	 * it possible is that the asker and the answerer are in the same context,
	 * so M6 step 2 moves the caller (the room-state mirror) to this side of the
	 * boundary rather than trying to make the call itself asynchronous.
	 */
	callSync(id: string, name: string, ...args: unknown[]): unknown;

	/** Stop an avatar and release everything it holds. */
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
	 * Players live in one hidden container rather than in the scene's DOM.
	 * Positioned off-screen rather than display:none, because a hidden element
	 * gets no layout and Ruffle would have no viewport to scale into.
	 */
	private container: HTMLElement | null = null;

	constructor() {
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
		eventListeners.set(id, options.onEvent);
		queryHandlers.set(id, options.onQuery);

		// The shim loads the avatar itself, from the `avatar` flashvar, then
		// scales it to fill whatever box it is given.
		await player.ruffle().load({
			url:
				`${API_URL}/static/whirled-host.swf` +
				`?avatar=${encodeURIComponent(options.avatarUrl)}&hostId=${id}`,
			allowScriptAccess: true,
			autoplay: "on",
			splashScreen: false,
			unmuteOverlay: "hidden",
			letterbox: "off",
			wmode: "transparent",
			preferredRenderer: "three",
			parameters: { avatar: options.avatarUrl, hostId: id },
		});
	}

	public resize(id: string, width: number, height: number) {
		const instance = this.instances.get(id);
		if (instance === undefined) return;
		instance.element.style.width = `${width}px`;
		instance.element.style.height = `${height}px`;
	}

	public call(id: string, name: string, ...args: unknown[]) {
		this.invoke(id, name, args);
	}

	public async query(id: string, name: string, ...args: unknown[]) {
		return this.invoke(id, name, args);
	}

	public callSync(id: string, name: string, ...args: unknown[]) {
		return this.invoke(id, name, args);
	}

	public destroy(id: string) {
		const instance = this.instances.get(id);
		if (instance === undefined) return;
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
		const fn = player[name];
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
