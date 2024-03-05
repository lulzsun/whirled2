import { createTimeSystem } from "../systems/time";
import { createRenderSystem } from "../systems/render";
import { createNetworkSystem } from "../systems/network";
import { createMovementSystem } from "../systems/movement";
import { createChatSystem } from "../systems/chat";
import { createAnimationSystem } from "../systems/animation";
import { createControlSystem } from "../systems/control";
import { createImguiSystem } from "../systems/imgui";
import { World } from "./world";

export const createSystems = (world: World) => {
	return [
		createImguiSystem, // Imgui system should run first
		createTimeSystem,
		createNetworkSystem,
		createMovementSystem,
		createChatSystem,
		createAnimationSystem,
		createControlSystem,
		createRenderSystem, // Render system should run last
	].map((createSystem) => createSystem(world));
};
