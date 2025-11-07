import { create, toBinary } from "@bufbuild/protobuf";
import { World } from "../../factory/world";
import * as buf from "../../proto";

/**
 * Emits to server that the player is trying to join (for the first time)
 *
 * There should be no reason to call this more than once, or expose this
 * to be called outside of network.ts.
 */
export function emitPlayerJoin(world: World) {
	const whirledEvent = create(buf.WhirledEventSchema);
	whirledEvent.event = {
		case: "playerJoin",
		value: create(buf.PlayerJoinSchema),
	};

	const bytes = toBinary(buf.WhirledEventSchema, whirledEvent);
	world.network.rawEmit(bytes);
}

/**
 * Emits to server that the player is trying to send a message
 */
export function emitPlayerChat(world: World, message: string) {
	const whirledEvent = create(buf.WhirledEventSchema);
	whirledEvent.event = {
		case: "playerChat",
		value: create(buf.PlayerChatSchema, {
			message,
		}),
	};

	const bytes = toBinary(buf.WhirledEventSchema, whirledEvent);
	world.network.rawEmit(bytes);
}

/**
 * Emits to server that the player is trying to move their avatar
 */
export function emitPlayerMove(
	world: World,
	position: THREE.Vector3,
	rotation: THREE.Euler,
) {
	const whirledEvent = create(buf.WhirledEventSchema);
	whirledEvent.event = {
		case: "playerMove",
		value: create(buf.PlayerMoveSchema, {
			position,
			rotation,
		}),
	};

	const bytes = toBinary(buf.WhirledEventSchema, whirledEvent);
	world.network.rawEmit(bytes);
}

/**
 * Emits to server that the player is trying to play an action/state
 * animation with their avatar
 */
export function emitPlayerAnim(world: World, anim: string) {
	const whirledEvent = create(buf.WhirledEventSchema);
	whirledEvent.event = {
		case: "playerAnim",
		value: create(buf.PlayerAnimSchema, {
			anim,
		}),
	};

	const bytes = toBinary(buf.WhirledEventSchema, whirledEvent);
	world.network.rawEmit(bytes);
}

/**
 * Emits to server that the player is changing avatars
 *
 * @param {string} id - Avatar ID that is represented in database
 */
export function emitPlayerWear(world: World, id: string) {
	const whirledEvent = create(buf.WhirledEventSchema);
	whirledEvent.event = {
		case: "playerWear",
		value: create(buf.PlayerWearSchema, {
			id,
		}),
	};

	const bytes = toBinary(buf.WhirledEventSchema, whirledEvent);
	world.network.rawEmit(bytes);
}
