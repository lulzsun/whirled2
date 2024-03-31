import { defineQuery, defineSystem, exitQuery } from "bitecs";
import { World } from "../factory/world";

import { ImGui } from "imgui-js";

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { ObjectComponent } from "../components";

const objectQuery = defineQuery([ObjectComponent]);
const objectLeaveQuery = exitQuery(defineQuery([ObjectComponent]));

export function createEditorSystem(world: World) {
	const canvas = world.renderer.domElement;
	let transformControlsCaptureMouse = true;
	let selectedObject: Object | null = null;

	const orbitControls = new OrbitControls(
		world.camera,
		world.renderer.domElement,
	);
	canvas.addEventListener("pointermove", () => {
		if (ImGui.GetCurrentContext() !== null) {
			orbitControls.enabled =
				(!ImGui.GetIO().WantCaptureMouse &&
					transformControlsCaptureMouse) ||
				(ImGui.GetIO().WantCaptureMouse &&
					!transformControlsCaptureMouse);
		}
	});

	const transformControls = new TransformControls(world.camera, canvas);
	transformControls.addEventListener("dragging-changed", (event) => {
		transformControlsCaptureMouse = !event.value;
	});

	world.scene.add(transformControls);

	return defineSystem((world: World) => {
		orbitControls.update();

		if (ImGui.bind === undefined || !world.editMode) {
			return world;
		}

		{
			const objects = objectQuery(world);
			for (let x = 0; x < objects.length; x++) {
				var obj = world.objects.get(objects[x]);
				if (obj === undefined) continue;
				if (selectedObject !== obj) {
					selectedObject = obj;
					transformControls.attach(obj);
					console.log("epic");
				}
			}
		}
		{
			const objects = objectLeaveQuery(world);
			for (let x = 0; x < objects.length; x++) {
				var obj = world.objects.get(objects[x]);
				if (obj === undefined) continue;
				if (selectedObject === obj) {
					selectedObject = null;
				}
				console.log("exit");
			}
		}

		ImGui.SetNextWindowPos(
			new ImGui.ImVec2(
				canvas.getBoundingClientRect().width -
					canvas.getBoundingClientRect().right,
				0,
			),
			ImGui.ImGuiCond.Appearing,
		);
		ImGui.SetNextWindowSize(new ImGui.ImVec2(69 * 2, 100), ImGui.Cond.Once);
		ImGui.Begin("Inspector", null, ImGui.WindowFlags.None);
		ImGui.TextWrapped(`Hello, Whirled!`);
		return world;
	});
}
