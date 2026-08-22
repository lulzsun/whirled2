import { InPageSwfHost } from "./managers/host";
import {
	collectTransferables,
	FromSandbox,
	ToSandbox,
} from "./managers/protocol";

// The Flash sandbox. Loaded by web/static/sandbox.html, on its own origin, and
// driven entirely by postMessage from managers/host-frame.ts. See
// docs/specs/swf-avatar-rendering.md §16 (M6), step 3.
//
// Nothing here is clever, and that is the design. Everything that was hard —
// the SDK handshake, the entity registry, the synchronous room queries — is the
// same InPageSwfHost and SwfRoom that ran in the page before, unchanged. This
// file is a message adapter over them.
//
// It imports no three.js, no API_URL and nothing from the game: the draw stream
// is forwarded verbatim and rendered on the other side. Keep it that way. The
// whole value of this document is what it does *not* have access to, and every
// import is a chance to give it something.

/** The shim lives beside this page, so it is fetched from this origin. */
const host = new InPageSwfHost(
	new URL("whirled-host.swf", window.location.href).href,
);

/**
 * The origin that owns this sandbox, pinned to whoever spoke first.
 *
 * Pinning to the first speaker is enough. Anyone else who frames this document
 * gets their own empty sandbox and nothing else — it holds no session, no
 * storage and no DOM but its own, which is the entire point of it existing.
 */
let parentOrigin: string | null = null;

function post(message: FromSandbox, transfer: Transferable[] = []) {
	if (parentOrigin === null) return;
	window.parent.postMessage(message, parentOrigin, transfer);
}

/** Answer a `create` or `query`, whichever way it went. */
function settle(seq: number, value: unknown) {
	try {
		post({ t: "settled", seq, value });
	} catch (error) {
		// A value the shim produced that structured clone will not carry. The
		// caller is waiting, so it has to hear something.
		post({ t: "settled", seq, error: `uncloneable result: ${error}` });
	}
}

async function handle(message: ToSandbox) {
	switch (message.t) {
		case "create":
			try {
				await host.create(message.id, {
					avatarUrl: message.avatarUrl,
					entityId: message.entityId,
					width: message.width,
					height: message.height,
					onStream: (event) =>
						post(
							{ t: "stream", id: message.id, event },
							collectTransferables(event),
						),
					onEvent: (type, value) =>
						post({ t: "event", id: message.id, type, value }),
				});
				settle(message.seq, undefined);
			} catch (error) {
				post({
					t: "settled",
					seq: message.seq,
					error: String((error as Error)?.message ?? error),
				});
			}
			return;

		case "query":
			settle(
				message.seq,
				await host.query(message.id, message.name, ...message.args),
			);
			return;

		case "resize":
			host.resize(message.id, message.width, message.height);
			return;
		case "enter":
			host.enter(message.id);
			return;
		case "update":
			host.update(message.id, message.patch);
			return;
		case "call":
			host.call(message.id, message.name, ...message.args);
			return;
		case "destroy":
			host.destroy(message.id);
			return;
	}
}

window.addEventListener("message", (event) => {
	if (event.source !== window.parent) return;
	if (parentOrigin === null) parentOrigin = event.origin;
	else if (event.origin !== parentOrigin) return;

	const message = event.data as ToSandbox;
	if (message === null || typeof message !== "object") return;
	void handle(message);
});

// Unsolicited and wildcarded, because there is nobody to ask yet and no address
// to send to. It carries nothing: the reply is what tells us where the page is.
window.parent.postMessage({ t: "ready" } satisfies FromSandbox, "*");
