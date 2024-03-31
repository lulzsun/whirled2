import { defineSystem } from "bitecs";
import { World } from "../factory/world";
import { ImGui } from "imgui-js";

export function createTimeSystem() {
	let frames = 0;
	let prevTime = 0;

	let fps = 0;
	let ms = 0;
	return defineSystem((world: World) => {
		frames++;

		const now = performance.now();
		world.time.delta = now - world.time.last;
		world.time.elapsed += world.time.delta;
		world.time.last = now;

		if (ImGui.bind !== undefined && world.editMode) {
			ImGui.SetNextWindowPos(
				new ImGui.ImVec2(
					world.renderer.domElement.getBoundingClientRect().right -
						69 * 2,
					0,
				),
			);
			ImGui.SetNextWindowSize(
				new ImGui.ImVec2(69 * 2, 100),
				ImGui.Cond.Appearing,
			);
			ImGui.SetNextWindowCollapsed(true, ImGui.Cond.Appearing);
			ImGui.SetNextWindowSizeConstraints(
				new ImGui.ImVec2(-1, 100),
				new ImGui.ImVec2(-1, Infinity),
			);
			ImGui.Begin("Debug", null, ImGui.WindowFlags.NoMove);
			ImGui.TextWrapped(
				`Hello, Whirled!\n\n[fps]: ${fps.toFixed()}\n[ms]: ${ms.toFixed()}\n[imgui]: v.${ImGui.VERSION}`,
			);
			if (now >= prevTime + 1000) {
				fps = (frames * 1000) / (now - prevTime);
				ms = world.time.delta;
				prevTime = now;
				frames = 0;
			}
		}
		return world;
	});
}
