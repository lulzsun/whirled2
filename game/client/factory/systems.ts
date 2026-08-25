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
import { createHistorySystem } from "../systems/history";
import { createBuildSystem } from "../systems/build";
import { createPreviewSystem } from "../systems/preview";
import { createBenchmarkSystem } from "../systems/benchmark";

const systems = [
	createImguiSystem, // Imgui system should run first
	createTimeSystem,

	createBenchmarkSystem, // dev tooling; inert until enabled
	createMovementSystem,
	createUISystem,
	createAnimationSystem,
	createControlSystem,
	// Before the editor: the editor's gizmo handlers push onto world.history,
	// so it has to exist by the time one fires.
	createHistorySystem,
	createEditorSystem,
	// After the editor: both draw imgui panels, and the editor's panels are
	// positioned relative to the canvas edges the build panel sits inside of.
	createBuildSystem,
	createRenderSystem, // Render system should run last
];

export const createSystems = (world: World) => {
	return [
		...systems.slice(0, 2),
		world.isPreview ? createPreviewSystem : createNetworkSystem,
		...systems.slice(2),
	].map((createSystem) => createSystem(world));
};
