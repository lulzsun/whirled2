import { defineSystem } from "bitecs";
import { World } from "../factory/world";
import { emitPlayerChat } from "./network";
import {
	createChatUI,
	createEditButton,
	createToolbarContainer,
} from "../ui/toolbar";

export function createUISystem(world: World) {
	const toolbar = createToolbarContainer();
	const container =
		world.renderer.domElement.parentElement!.appendChild(toolbar);

	const chatUI = createChatUI((msg) => {
		emitPlayerChat(world, msg);
	});
	container.appendChild(chatUI);
	container.appendChild(createEditButton());

	return defineSystem((world: World) => {
		return world;
	});
}
