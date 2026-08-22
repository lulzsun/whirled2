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

/** How often the throttle watchdog samples the sandbox's frame rate. */
const WATCHDOG_INTERVAL_MS = 2000;

/**
 * Per-avatar stream frames per second below which the sandbox counts as
 * render-throttled. Healthy is the stage rate, ~24+; Chrome's stuck throttle
 * is ~1. Low enough that a legitimately slow SWF never trips it.
 */
const STARVED_FPS = 4;

type Instance = Pick<SwfInstanceOptions, "onStream" | "onEvent">;

export class FrameSwfHost implements SwfHost {
	private readonly frame: HTMLIFrameElement;
	/** The only origin we accept replies from. `"null"` when opaque. */
	private readonly origin: string;
	/**
	 * The targetOrigin we post commands to. An opaque origin cannot be named
	 * in postMessage, so the opaque mode posts to `"*"` — safe because the
	 * `event.source` check is what identifies the frame, and commands carry
	 * nothing secret.
	 */
	private readonly postTarget: string;

	private ready = false;
	/** Set once the sandbox has been given up on. Requests fail fast after. */
	private failed: Error | null = null;
	/** Commands issued before the sandbox came up, in order. */
	private backlog: { message: ToSandbox; transfer: Transferable[] }[] = [];

	private instances = new Map<string, Instance>();

	// ----- throttle watchdog state (see checkThrottle) -----
	/** Stream messages since the watchdog last sampled. */
	private streamEvents = 0;
	/** Set once any stream message has arrived; the watchdog waits for it. */
	private everStreamed = false;
	/** Consecutive starved samples; two in a row means stuck, not jank. */
	private starvedSamples = 0;
	/** Alternates the nudge so consecutive nudges are real mutations. */
	private nudgeParity = false;
	/** One warning per stuck episode, not one per nudge. */
	private warnedStuck = false;
	private readonly watchdogId: number;
	private pending = new Map<
		number,
		{ resolve: (value: unknown) => void; reject: (error: Error) => void }
	>();
	private seq = 0;

	constructor(sandboxUrl: string, opaque = false) {
		const realOrigin = new URL(sandboxUrl, window.location.href).origin;
		this.origin = opaque ? "null" : realOrigin;
		this.postTarget = opaque ? "*" : realOrigin;

		this.frame = document.createElement("iframe");
		this.frame.id = "swf-sandbox";
		// Two isolation modes, chosen by the caller (SANDBOX_OPAQUE):
		//
		// A *different* origin needs no `sandbox` attribute — it is already
		// isolated, keeps a real origin, and its subresources load normally.
		// That is dev's loopback pair and any deployment with a configured
		// VITE_SANDBOX_ORIGIN.
		//
		// A *same-origin* production deployment gets `allow-scripts` instead,
		// which makes the document's origin opaque: no cookie jar, no storage,
		// cross-site to everything including us. Only viable on a public
		// address — Private Network Access treats opaque origins as public and
		// blocks their fetches to private ones, which is exactly how §12.4's
		// sandbox failed in dev.
		if (opaque) {
			this.frame.setAttribute("sandbox", "allow-scripts");
		}
		// Every part of this style is a throttle scar; change nothing here
		// without re-measuring against spec §16.13. Chrome has (at least) two
		// separate mechanisms that quietly park a cross-origin frame's rAF at
		// ~1 fps, and Ruffle's whole tick rides on rAF:
		//
		// Intersection/size: a frame that intersects nothing, or a 1x1 frame
		// classified while the tab is hidden, is render-throttled — the
		// latter STICKS after the tab is shown until a style mutation forces
		// reclassification. Hence inside the viewport and 8x8.
		//
		// Paint: a frame that never contributes pixels (opacity:0, or parked
		// behind the page at z-index:-1) is eventually marked hidden outright
		// — DevTools/CDP attach churn is one reclassification moment — and
		// once marked, no amount of resizing or opacity fiddling revives it;
		// only actually painting does. Measured live: stuck at 1 fps through
		// dozens of resize nudges, back to 24 the moment the frame sat on top
		// with nonzero opacity. Hence topmost and opacity 0.01: an 8x8 dot at
		// 1% opacity is imperceptible, pointer-events:none keeps it inert,
		// and the frame stays genuinely painted every frame.
		//
		// Firefox throttles none of these shapes.
		this.frame.style.cssText =
			"position:fixed;left:0;top:0;width:8px;height:8px;border:0;" +
			"opacity:0.01;pointer-events:none;z-index:2147483647;";
		this.frame.src = sandboxUrl;

		window.addEventListener("message", this.onMessage);
		document.body.appendChild(this.frame);

		this.watchdogId = window.setInterval(
			this.checkThrottle,
			WATCHDOG_INTERVAL_MS,
		);

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
		window.clearInterval(this.watchdogId);
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
		target.postMessage(message, this.postTarget, transfer);
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
				this.streamEvents++;
				this.everStreamed = true;
				this.instances.get(message.id)?.onStream(message.event);
				return;

			case "event":
				this.instances
					.get(message.id)
					?.onEvent(message.type, message.value);
				return;
		}
	};

	/**
	 * Detect Chrome's stuck render-throttle and mutate our way out of it.
	 *
	 * The 8x8 opacity-hidden shape (spec §16.13) stopped the tab-switch
	 * trigger, but Chrome can reclassify the frame as throttleable during
	 * other layout/overlay churn — opening or closing DevTools, or hovering
	 * the frame in the Elements panel, reproduces it — and once stuck it
	 * stays at ~1 fps indefinitely. The triggers keep growing, but the cure
	 * is constant and measured: any style mutation forces reclassification.
	 * So instead of chasing triggers, watch the symptom. Stream frames ride
	 * the sandbox's rAF (one submit_frame per tick), so their arrival rate
	 * *is* the sandbox's frame rate; when it starves while the tab is
	 * visible and avatars exist, nudge the frame's width and let Chrome
	 * re-decide. A nudge on a healthy frame is harmless, so the detector
	 * only has to be conservative, not perfect.
	 */
	private checkThrottle = () => {
		const frames = this.streamEvents;
		this.streamEvents = 0;
		// Debug visibility for throttle reports: the last few samples, newest
		// last, as frames-per-second per avatar. Read it from the console as
		// window.swfSandboxStats when chasing a Chrome reclassification.
		const stats = ((window as any).swfSandboxStats ??= {
			samples: [] as number[],
			nudges: 0,
		});
		stats.samples.push(
			this.instances.size === 0
				? -1
				: frames / this.instances.size / (WATCHDOG_INTERVAL_MS / 1000),
		);
		if (stats.samples.length > 30) stats.samples.shift();
		if (!this.ready || this.failed !== null) return;
		// Nothing to measure until an avatar has produced frames at all —
		// a slow first load is not a throttle.
		if (this.instances.size === 0 || !this.everStreamed) {
			this.starvedSamples = 0;
			return;
		}
		// Hidden tabs are throttled legitimately; only count starvation
		// while visible. (Coming back stuck after a tab switch still gets
		// caught: the next two visible samples starve and trip the nudge.)
		if (document.visibilityState !== "visible") {
			this.starvedSamples = 0;
			return;
		}
		const perAvatar =
			frames / this.instances.size / (WATCHDOG_INTERVAL_MS / 1000);
		if (perAvatar >= STARVED_FPS) {
			this.starvedSamples = 0;
			if (this.warnedStuck) {
				// Recovered: put the rescue opacity back to imperceptible.
				this.frame.style.opacity = "0.01";
				this.warnedStuck = false;
			}
			return;
		}
		this.starvedSamples++;
		if (this.starvedSamples < 2) return;
		// Two cures for two mechanisms: the resize forces the intersection
		// classifier to re-decide, and full opacity forces a real paint for
		// the paint-based one. Both are restored by the healthy branch above.
		this.nudgeParity = !this.nudgeParity;
		this.frame.style.width = this.nudgeParity ? "9px" : "8px";
		this.frame.style.opacity = "1";
		stats.nudges++;
		if (!this.warnedStuck) {
			this.warnedStuck = true;
			console.warn(
				"swf: sandbox frame looks render-throttled " +
					`(${perAvatar.toFixed(1)} fps/avatar); ` +
					"nudging its style to force reclassification",
			);
		}
	};

	private failAllPending(error: Error) {
		this.failed = error;
		for (const waiter of this.pending.values()) waiter.reject(error);
		this.pending.clear();
		this.backlog = [];
	}
}
