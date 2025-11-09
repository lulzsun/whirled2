import { create, toBinary } from "@bufbuild/protobuf";
import { World } from "../../factory/world";
import * as buf from "../../proto";
import { hasComponent, removeComponent, addComponent } from "bitecs";
import { MoveTowardsComponent } from "../../components";

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
	if (world.isPreview) {
		// if this world is a preview, we will just assume that there is only 1 player object
		// and use eid = 1
		const eid = 1;
		if (hasComponent(world, MoveTowardsComponent, eid)) {
			removeComponent(world, MoveTowardsComponent, eid);
		}
		addComponent(world, MoveTowardsComponent, eid);
		MoveTowardsComponent.x[eid] = position.x;
		MoveTowardsComponent.y[eid] = position.y;
		MoveTowardsComponent.z[eid] = position.z;
		return;
	}

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
	if (world.isPreview) {
		return;
	}

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
