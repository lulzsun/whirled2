import { create, toBinary } from "@bufbuild/protobuf";
import { World } from "../../factory/world";
import * as buf from "../../proto";

/**
 * Emits to server that an object is trying to join
 *
 * Ideally this would be a player having ownership of the object to
 * be able to do this (ex: room owner adding furniture)
 */
export function emitObjectJoin(world: World, id: string, type: number) {
	const whirledEvent = create(buf.WhirledEventSchema);
	whirledEvent.event = {
		case: "objectJoin",
		value: create(buf.ObjectJoinSchema, {
			object: create(buf.ObjectSchema, {
				id,
				type,
			}),
		}),
	};

	const bytes = toBinary(buf.WhirledEventSchema, whirledEvent);
	world.network.rawEmit(bytes);
}

/**
 * Emits to server that a builder part is being placed.
 *
 * Unlike furniture, which names an inventory row and lets the server fill in
 * everything else, a part is described entirely here -- there is no row to
 * read it back out of. The id is deliberately absent: the server mints it,
 * so `nonce` is what lets the reply be matched to the ghost this client drew
 * (see systems/build.ts).
 */
export function emitPartJoin(
	world: World,
	nonce: string,
	part: buf.Part,
	position: THREE.Vector3,
	rotation: THREE.Euler,
	scale: THREE.Vector3,
) {
	const whirledEvent = create(buf.WhirledEventSchema);
	whirledEvent.event = {
		case: "objectJoin",
		value: create(buf.ObjectJoinSchema, {
			object: create(buf.ObjectSchema, {
				type: buf.Type.Primitive,
				nonce,
				part,
				position,
				rotation: create(buf.RotationSchema, {
					x: rotation.x,
					y: rotation.y,
					z: rotation.z,
					w: 0,
				}),
				scale,
			}),
		}),
	};

	const bytes = toBinary(buf.WhirledEventSchema, whirledEvent);
	world.network.rawEmit(bytes);
}

/**
 * Emits to server that an object is moving (by the player)
 *
 * Ideally this would be a player having ownership of the object to
 * be able to do this (ex: room owner moving furniture)
 */
export function emitObjectTransform(
	world: World,
	id: string,
	isPlayer: boolean,
	position: THREE.Vector3,
	rotation: THREE.Euler,
	scale: THREE.Vector3,
) {
	const whirledEvent = create(buf.WhirledEventSchema);
	whirledEvent.event = {
		case: "objectTransform",
		value: create(buf.ObjectTransformSchema, {
			id,
			isPlayer,
			position,
			rotation,
			scale,
		}),
	};

	const bytes = toBinary(buf.WhirledEventSchema, whirledEvent);
	world.network.rawEmit(bytes);
}

/**
 * Emits to server that an object is leaving the room
 *
 * Ideally this would be a player having ownership of the object to
 * be able to do this (ex: room owner removing furniture)
 */
export function emitObjectLeave(world: World, id: string, isPlayer: boolean) {
	const whirledEvent = create(buf.WhirledEventSchema);
	whirledEvent.event = {
		case: "objectLeave",
		value: create(buf.ObjectLeaveSchema, {
			id,
			isPlayer,
		}),
	};

	const bytes = toBinary(buf.WhirledEventSchema, whirledEvent);
	world.network.rawEmit(bytes);
}
