import { SwfHost, SwfInstanceOptions } from "./host";
import { SwfRoomEntity } from "./room";
import { FromSandbox, ToSandbox } from "./protocol";

// A SwfHost that runs Flash in an iframe and talks to it over postMessage. See
// docs/specs/swf-avatar-rendering.md §16 (M6), step 3.
//
// This class is the entire cost of getting Flash out of our origin, and it is
// deliberately dull: the sandbox document runs the same InPageSwfHost and the
// same SwfRoom that ran here before, so the only new thing in the system is the
// wire. What makes the wire cheap is step 2 — the SDK's synchronous room
// queries never cross it, because the room went to the far side.
//
// Whether the frame is actually isolated is a property of the URL it is given,
// not of this class. Same-origin, it is a working but pointless indirection;
// cross-origin, it is the whole point. Step 4 changes the URL.

/** How long to wait for the sandbox document to come up. */
const READY_TIMEOUT_MS = 15000;

type Instance = Pick<SwfInstanceOptions, "onStream" | "onEvent">;

export class FrameSwfHost implements SwfHost {
	private readonly frame: HTMLIFrameElement;
	/** The origin we will post to and the only one we accept replies from. */
	private readonly origin: string;

	private ready = false;
	/** Set once the sandbox has been given up on. Requests fail fast after. */
	private failed: Error | null = null;
	/** Commands issued before the sandbox came up, in order. */
	private backlog: { message: ToSandbox; transfer: Transferable[] }[] = [];

	private instances = new Map<string, Instance>();
	private pending = new Map<
		number,
		{ resolve: (value: unknown) => void; reject: (error: Error) => void }
	>();
	private seq = 0;

	constructor(sandboxUrl: string) {
		this.origin = new URL(sandboxUrl, window.location.href).origin;

		this.frame = document.createElement("iframe");
		this.frame.id = "swf-sandbox";
		// Deliberately no `sandbox` attribute. An opaque origin — which is what
		// `allow-scripts` alone produces — is treated as public by Private
		// Network Access, so nothing it loads from a loopback address arrives,
		// which is exactly how §12.4's sandbox failed. A *different* origin
		// needs no attribute to be isolated and keeps a real origin, so its
		// subresources load normally in dev and in production alike.
		// Inside the viewport, deliberately. The obvious thing is to park it
		// off-screen the way the players themselves are parked, and it does not
		// work: Chrome throttles requestAnimationFrame in a cross-origin iframe
		// that intersects nothing, and Ruffle's whole tick rides on rAF. An
		// avatar in an off-screen frame emitted 2 draw frames in 6 seconds
		// where an in-page one emits 48 in 2. So it stays on-screen and is made
		// invisible instead, which is what web/templates/pages/index.gohtml
		// already does with its own #ruffle container.
		this.frame.style.cssText =
			"position:fixed;left:0;top:0;width:1px;height:1px;border:0;" +
			"opacity:0;pointer-events:none;z-index:-1;";
		this.frame.src = sandboxUrl;

		window.addEventListener("message", this.onMessage);
		document.body.appendChild(this.frame);

		window.setTimeout(() => {
			if (this.ready) return;
			console.error(
				`swf: sandbox at ${sandboxUrl} never reported ready; ` +
					"avatars will not load",
			);
			// Fail the backlog rather than leaving every caller hanging: an
			// avatar that never appears is worse than one that errors, because
			// nothing downstream has a timeout of its own.
			this.failAllPending(new Error("swf sandbox failed to start"));
		}, READY_TIMEOUT_MS);
	}

	public create(id: string, options: SwfInstanceOptions): Promise<void> {
		this.instances.set(id, {
			onStream: options.onStream,
			onEvent: options.onEvent,
		});
		return this.request((seq) => [
			{
				t: "create",
				id,
				seq,
				avatarUrl: options.avatarUrl,
				entityId: options.entityId,
				width: options.width,
				height: options.height,
			},
			[],
		]).then(() => undefined);
	}

	public resize(id: string, width: number, height: number) {
		this.send({ t: "resize", id, width, height });
	}

	public enter(id: string) {
		this.send({ t: "enter", id });
	}

	public update(id: string, patch: Partial<SwfRoomEntity>) {
		this.send({ t: "update", id, patch });
	}

	public call(id: string, name: string, ...args: unknown[]) {
		this.send({ t: "call", id, name, args });
	}

	public query(id: string, name: string, ...args: unknown[]) {
		return this.request((seq) => [{ t: "query", id, seq, name, args }, []]);
	}

	public destroy(id: string) {
		if (!this.instances.delete(id)) return;
		this.send({ t: "destroy", id });
	}

	/** Tear down the sandbox itself. Every avatar in it goes with it. */
	public dispose() {
		window.removeEventListener("message", this.onMessage);
		this.failAllPending(new Error("swf sandbox disposed"));
		this.instances.clear();
		this.frame.remove();
	}

	// ------------------------------------------------------------- the wire

	private send(message: ToSandbox, transfer: Transferable[] = []) {
		if (this.failed !== null) return;
		if (!this.ready) {
			this.backlog.push({ message, transfer });
			return;
		}
		const target = this.frame.contentWindow;
		if (target === null) return;
		target.postMessage(message, this.origin, transfer);
	}

	private request(
		build: (seq: number) => [ToSandbox, Transferable[]],
	): Promise<unknown> {
		if (this.failed !== null) return Promise.reject(this.failed);
		const seq = ++this.seq;
		const [message, transfer] = build(seq);
		return new Promise<unknown>((resolve, reject) => {
			this.pending.set(seq, { resolve, reject });
			this.send(message, transfer);
		});
	}

	private onMessage = (event: MessageEvent) => {
		// Both checks matter. The origin check is what stops another frame
		// impersonating the sandbox; the source check is what stops the
		// sandbox's own origin doing it from somewhere else on the page.
		if (event.source !== this.frame.contentWindow) return;
		if (event.origin !== this.origin) return;

		const message = event.data as FromSandbox;
		if (message === null || typeof message !== "object") return;

		switch (message.t) {
			case "ready":
				if (this.ready) return;
				this.ready = true;
				for (const { message: queued, transfer } of this.backlog) {
					this.send(queued, transfer);
				}
				this.backlog = [];
				return;

			case "settled": {
				const waiter = this.pending.get(message.seq);
				if (waiter === undefined) return;
				this.pending.delete(message.seq);
				if (message.error !== undefined) {
					waiter.reject(new Error(message.error));
				} else {
					waiter.resolve(message.value);
				}
				return;
			}

			case "stream":
				this.instances.get(message.id)?.onStream(message.event);
				return;

			case "event":
				this.instances
					.get(message.id)
					?.onEvent(message.type, message.value);
				return;
		}
	};

	private failAllPending(error: Error) {
		this.failed = error;
		for (const waiter of this.pending.values()) waiter.reject(error);
		this.pending.clear();
		this.backlog = [];
	}
}
