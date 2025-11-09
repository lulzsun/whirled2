import { World } from "./world";
import { createTimeSystem } from "../systems/time";
import { createRenderSystem } from "../systems/render";
import { createNetworkSystem } from "../systems/network";
import { createMovementSystem } from "../systems/movement";
import { createUISystem } from "../systems/ui";
import { createAnimationSystem } from "../systems/animation";
import { createControlSystem } from "../systems/control";
import { createImguiSystem } from "../systems/imgui";
import { createEditorSystem } from "../systems/editor";
import { createPreviewSystem } from "../systems/preview";

const systems = [
	createImguiSystem, // Imgui system should run first
	createTimeSystem,

	createMovementSystem,
	createUISystem,
	createAnimationSystem,
	createControlSystem,
	createEditorSystem,
	createRenderSystem, // Render system should run last
];

export const createSystems = (world: World) => {
	return [
		...systems.slice(0, 2),
		world.isPreview ? createPreviewSystem : createNetworkSystem,
		...systems.slice(2),
	].map((createSystem) => createSystem(world));
};
