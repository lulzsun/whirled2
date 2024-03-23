import { defineSystem } from "bitecs";
import { World } from "../factory/world";
import { createChatUI } from "../ui/chat";
import { NetworkEvent } from "./network";

export function createChatSystem(world: World) {
	const chatUI = createChatUI((msg) => {
		world.network.emit(NetworkEvent.PlayerChat, msg);
	});
	world.renderer.domElement.parentElement!.appendChild(chatUI);

	return defineSystem((world: World) => {
		return world;
	});
}
