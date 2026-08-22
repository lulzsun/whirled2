// The room, as Flash sees it. See docs/specs/swf-avatar-rendering.md §16 (M6),
// step 2.
//
// The SDK never lets one avatar touch another: every call goes to the host and
// the host routes it. This is that host — the registry of who is in the room,
// where they are, and what one avatar is allowed to ask about another.
//
// It lives on the *Flash* side of the SwfHost boundary, and that placement is
// the whole point of the file existing. Two of the SDK's calls are synchronous:
// `getEntityIds` and `getEntityProperty` return a value inline, inside the
// asking avatar's own AVM tick, and `getEntityProperty` resolves a non-`std:`
// key by *running code in another avatar* — Land Sea Animals kills its opponent
// by reading `landseaanimal:IKillJoo` on it, and the death happens inside the
// target's property provider. No message boundary can serve that. Answering it
// requires that the asker, the answerer and this registry share one context.
//
// So the page does not answer these questions; it publishes the facts they are
// answered from. `add`, `enter`, `update` and `remove` are what crosses the
// boundary, all of them one-way. Everything below reads only its own state and
// calls only into Flash instances beside it.

/**
 * Nominal room size in Whirled units, used to turn a room-relative location
 * into the pixel coordinates `std:location_pixel` reports.
 *
 * Avatars use those pixels for distance and facing maths — Land Sea Animals
 * picks its duel opponent that way — so the numbers only have to be
 * self-consistent, not to match anything in the 3D scene.
 */
export const ROOM_BOUNDS = { width: 700, height: 500, depth: 400 };

/** What the room knows about one avatar. Published by the page. */
export type SwfRoomEntity = {
	/** Room-relative location, [x, y, z] in 0..1. */
	location: [number, number, number];
	orientation: number;
	/** The avatar's stage size in SWF pixels, for `std:dimensions`. */
	width: number;
	height: number;
	/** The wearer's display name, for `std:name`. */
	name: string;
};

type Occupant = SwfRoomEntity & {
	hostId: string;
	entityId: string;
	/** Whether the avatar has been granted control and announced. */
	present: boolean;
};

/** Invokes one of the shim's ExternalInterface callbacks, synchronously. */
export type Invoke = (hostId: string, name: string, args: unknown[]) => unknown;

export class SwfRoom {
	private occupants = new Map<string, Occupant>();

	constructor(private readonly invoke: Invoke) {}

	/**
	 * Register a loaded avatar, before it has answered the handshake.
	 *
	 * Identity and room bounds are asserted here and again in `enter`. The shim
	 * registers its callbacks on its own first frame, which can land after the
	 * load resolves, so the first of the two is not reliably delivered.
	 */
	public add(hostId: string, entityId: string) {
		this.occupants.set(hostId, {
			hostId,
			entityId,
			// Centre of the room, standing on the floor, facing front — held
			// only until the page publishes where the avatar actually is.
			location: [0.5, 0, 0.5],
			orientation: 0,
			width: 0,
			height: 0,
			name: "",
			present: false,
		});
		this.identify(hostId, entityId);
	}

	/**
	 * Grant control and make the avatar visible to the room.
	 *
	 * Entity awareness, signals and the SDK's own tick timer are all gated on
	 * `hasControl`, which starts false — nothing about the room reaches an
	 * avatar until this is granted. That is why announcing is a separate step
	 * from `add` rather than something the registry does on its own: announcing
	 * before control is granted drops the events on the floor.
	 */
	public enter(hostId: string) {
		const occupant = this.occupants.get(hostId);
		if (occupant === undefined || occupant.present) return;
		this.identify(hostId, occupant.entityId);
		this.invoke(hostId, "whirledGrantControl", []);
		occupant.present = true;

		for (const other of this.occupants.values()) {
			if (other.hostId === hostId) continue;
			// Telling an avatar that has not been granted control is the same
			// as not telling it: the SDK drops the event. Skipping it saves a
			// message once this is talking across a boundary.
			if (!other.present) continue;
			// And a not-yet-present occupant must not be announced either, or
			// the newcomer hears of it twice: once here while it is still
			// invisible, and again when it enters for itself.
			this.invoke(other.hostId, "whirledEntityEntered", [
				occupant.entityId,
			]);
			this.invoke(hostId, "whirledEntityEntered", [other.entityId]);
		}
	}

	/**
	 * Publish a change. Omitted fields are left alone.
	 *
	 * A location change is also a fact about the room, so neighbours hear about
	 * it here. They get every sample, not just the endpoints: `entityMoved` is
	 * a sample, and an avatar tracking another one wants the current position,
	 * not the last place it stood still. (`appearanceChanged` is the opposite
	 * — an edge — which is why the page still owns that one.)
	 */
	public update(hostId: string, patch: Partial<SwfRoomEntity>) {
		const occupant = this.occupants.get(hostId);
		if (occupant === undefined) return;
		Object.assign(occupant, patch);
		if (patch.location === undefined) return;
		// A mover that has not entered yet has never been announced, so its
		// movement is not yet a fact about the room — the patch above still
		// records it, and neighbours learn the position on entry.
		if (!occupant.present) return;
		const [x, y, z] = occupant.location;
		for (const other of this.occupants.values()) {
			if (other.hostId === hostId || !other.present) continue;
			this.invoke(other.hostId, "whirledEntityMoved", [
				occupant.entityId,
				[x, y, z],
			]);
		}
	}

	/** Announce a departure and forget the avatar. Safe on an unknown id. */
	public remove(hostId: string) {
		const occupant = this.occupants.get(hostId);
		if (occupant === undefined) return;
		this.occupants.delete(hostId);
		for (const other of this.occupants.values()) {
			if (!other.present) continue;
			this.invoke(other.hostId, "whirledEntityLeft", [occupant.entityId]);
		}
	}

	/**
	 * Handle an event on its way out of an avatar, returning whether the room
	 * consumed it.
	 *
	 * Signals and messages are routing, not news: they are addressed to other
	 * avatars, and nothing on the page has any use for them.
	 */
	public handleEvent(hostId: string, type: string, value: any): boolean {
		switch (type) {
			case "sendSignal": {
				const [name, arg] = unpackPair(value);
				if (name === null) return true;
				// Including the sender: Whirled delivers a signal to every
				// entity in the room, and LSA relies on that to hear its own
				// death notice.
				for (const other of this.occupants.keys()) {
					this.invoke(other, "whirledSignal", [name, arg]);
				}
				return true;
			}
			case "sendMessage": {
				// The SDK sends a message to every instance of the sending
				// entity, which in a single-client room means the sender
				// itself. Actions arrive here too — `sendMessage(name, arg,
				// true)` is how the SDK triggers one — and go the same way.
				const [name, arg] = unpackPair(value);
				if (name === null) return true;
				this.invoke(hostId, "whirledMessage", [name, arg]);
				return true;
			}
			default:
				return false;
		}
	}

	/**
	 * Answer one of the SDK's synchronous room queries.
	 *
	 * The asking entity is not needed yet — both queries are room-wide — but it
	 * is what a permission check would key on, so the channel carries it.
	 */
	public query(_asker: string, query: string, a: any, b: any): unknown {
		switch (query) {
			case "getEntityIds":
				// `a` is a type filter; every entity we host is an avatar.
				if (a !== null && a !== undefined && a !== "avatar") return [];
				return [...this.occupants.values()].map((e) => e.entityId);

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
	 * `std:` keys are the room's to answer. Everything else belongs to the
	 * entity that registered it, so it is forwarded to that avatar's own
	 * provider — and forwarded live, not from a cache: a property read is not
	 * necessarily side-effect free.
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
				return [target.width, target.height];
			case "std:name":
				// Null, not "": avatars draw this into text fields, and a
				// name the page never published should read as absent, not
				// as an empty label.
				return target.name === "" ? null : target.name;
		}

		return this.invoke(target.hostId, "whirledLookupProperty", [key]);
	}

	private identify(hostId: string, entityId: string) {
		this.invoke(hostId, "whirledSetEntityId", [entityId]);
		this.invoke(hostId, "whirledSetRoomBounds", [
			ROOM_BOUNDS.width,
			ROOM_BOUNDS.height,
			ROOM_BOUNDS.depth,
		]);
	}

	private byEntityId(entityId: string): Occupant | undefined {
		for (const occupant of this.occupants.values()) {
			if (occupant.entityId === entityId) return occupant;
		}
		return undefined;
	}
}

/**
 * Unpack a [name, value] pair as it arrives from the shim.
 *
 * An AS3 Array can arrive as a real array or as a plain object with numeric
 * keys depending on how it was marshalled, so neither form can be assumed.
 */
function unpackPair(value: any): [string | null, unknown] {
	if (value === null || value === undefined) return [null, null];
	if (Array.isArray(value)) return [String(value[0]), value[1] ?? null];
	if (typeof value === "object" && "0" in value) {
		return [String(value[0]), value[1] ?? null];
	}
	return [String(value), null];
}
