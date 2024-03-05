import { defineSystem } from "bitecs";
import { World } from "../factory/world";

import { ImGui, ImGui_Impl } from "imgui-js";

export function createImguiSystem(world: World) {
	ImGui.default().then(function () {
		ImGui.CreateContext();
		ImGui.StyleColorsDark();

		ImGui_Impl.Init(world.renderer.domElement);
	});
	return defineSystem((world: World) => {
		if (ImGui.GetCurrentContext() === null) return world;

		ImGui_Impl.NewFrame(world.time.last);
		ImGui.NewFrame();
		return world;
	});
}
