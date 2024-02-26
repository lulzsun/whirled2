import { defineSystem } from "bitecs";
import { World } from "../factory/world";
import { createChatUI } from "../ui/chat";

export function createChatSystem(world: World) {
	const chatUI = createChatUI((msg) => {
		world.network.emit("Chat", msg);
	});
	world.renderer.domElement.parentElement!.appendChild(chatUI);

	return defineSystem((world: World) => {
		return world;
	});
}
