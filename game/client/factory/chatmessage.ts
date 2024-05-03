import { addEntity } from "bitecs";
import { World } from "./world";
import { createChatMessageUI } from "../ui/chatmessage";

export type ChatMessage = HTMLElement & {
	eid: number;
};

export const createChatMessage = (
	world: World,
	username: string = "Guest",
	nickname: string = "Guest",
	message: string = "placeholder",
): ChatMessage => {
	const eid = addEntity(world);
	const ui = world.renderer.domElement
		.parentElement!.querySelector("#chatbox")!
		.appendChild(createChatMessageUI(username, nickname, message));
	window.htmx.process(ui);
	const entity = Object.assign(ui, { eid });
	return entity;
};
