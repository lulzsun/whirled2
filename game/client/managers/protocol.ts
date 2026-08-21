import { SwfRoomEntity } from "./room";

// The wire format between the page and the Flash sandbox. See
// docs/specs/swf-avatar-rendering.md §16 (M6), step 3.
//
// Both halves import this file, so it must not import anything that assumes
// which side it is on — no three.js, no API_URL, no DOM beyond types.
//
// Everything here is structured-cloneable. `value` fields carry whatever
// crossed ExternalInterface, which Ruffle hands over as plain arrays, objects,
// numbers and strings; a value that is not cloneable is a bug in the shim, and
// the sandbox reports it rather than letting postMessage throw.

/** Page to sandbox. */
export type ToSandbox =
	| {
			t: "create";
			id: string;
			seq: number;
			avatarUrl: string;
			entityId: string;
			width: number;
			height: number;
	  }
	| { t: "resize"; id: string; width: number; height: number }
	| { t: "enter"; id: string }
	| { t: "update"; id: string; patch: Partial<SwfRoomEntity> }
	| { t: "call"; id: string; name: string; args: unknown[] }
	| { t: "query"; id: string; seq: number; name: string; args: unknown[] }
	| { t: "destroy"; id: string };

/** Sandbox to page. */
export type FromSandbox =
	/** Sent once, unsolicited, when the sandbox can accept commands. */
	| { t: "ready" }
	/**
	 * The answer to a `create` or a `query`. One reply type for both, because
	 * the page only ever wants to know "did it finish, and with what".
	 */
	| { t: "settled"; seq: number; value?: unknown; error?: string }
	/** A frame's draw commands. The typed arrays inside are transferred. */
	| { t: "stream"; id: string; event: any }
	| { t: "event"; id: string; type: string; value: unknown };

/**
 * The buffers in a stream event, for `postMessage`'s transfer list.
 *
 * Transferring rather than copying is safe because the render backend builds
 * every one of these with `Float32Array::from(slice)` and friends, which
 * allocate on the JS heap and are dropped by the Rust side the moment the
 * event is emitted. Nothing on the far side reads them again. (A `::view` into
 * wasm memory would be a different matter entirely — it would detach Ruffle's
 * own heap.)
 *
 * Deduplicated by buffer identity: `postMessage` throws if the same
 * `ArrayBuffer` appears twice in one transfer list, and nothing guarantees two
 * arrays in a frame do not share one.
 */
export function collectTransferables(event: any): Transferable[] {
	const buffers = new Set<ArrayBufferLike>();

	const take = (value: any) => {
		if (ArrayBuffer.isView(value) && value.buffer.byteLength > 0) {
			buffers.add(value.buffer);
		}
	};

	take(event?.clear);
	take(event?.records);
	take(event?.rgba);
	for (const draw of event?.draws ?? []) {
		take(draw?.vertices);
		take(draw?.indices);
		take(draw?.matrix);
	}
	for (const gradient of event?.gradients ?? []) {
		take(gradient?.ratios);
		take(gradient?.colors);
	}

	return [...buffers] as Transferable[];
}
