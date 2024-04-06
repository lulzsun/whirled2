import * as THREE from "three";
import {
	addComponent,
	defineQuery,
	defineSystem,
	exitQuery,
	hasComponent,
	removeComponent,
} from "bitecs";
import { World } from "../factory/world";

import { ImGui } from "imgui-js";

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
	ObjectComponent,
	ObjectOutlineComponent,
	PlayerComponent,
	TransformComponent,
} from "../components";
import { STATIC, UNIQUE } from "./imgui";
import { NetworkEvent } from "./network";

const objectLeaveQuery = exitQuery(defineQuery([ObjectComponent]));

export type Editor = {
	enabled: boolean;
	selectedObject: number | null;
	selectedTool: EditorTool;
};

type EditorTool = null | "translate" | "rotate" | "scale";

export function createEditorSystem(world: World) {
	const pointer = new THREE.Vector2();
	const raycaster = new THREE.Raycaster();

	world.editor = {
		enabled: false,
		selectedObject: null,
		selectedTool: null,
	};

	const canvas = world.renderer.domElement;

	let transformControlsCaptureMouse = true;

	const unselectObject = (force: boolean = false) => {
		if (
			ImGui.bind !== undefined &&
			ImGui.GetIO().WantCaptureMouse &&
			!force
		)
			return;
		if (world.editor.selectedObject !== null) {
			removeComponent(
				world,
				ObjectOutlineComponent,
				world.editor.selectedObject,
			);
			world.editor.selectedObject = null;
		}
		transformControls.detach();
	};

	const selectObject = (eid: number | null, force: boolean = false) => {
		unselectObject(force);
		if (eid === null) return;
		addComponent(world, ObjectOutlineComponent, eid);
		world.editor.selectedObject = eid;
		var object = world.scene.getObjectByProperty("eid", eid);
		if (!object) {
			removeComponent(world, ObjectOutlineComponent, eid);
			world.editor.selectedObject = null;
			return;
		}
		if (
			world.editor.selectedTool !== null &&
			!(
				world.network.getPlayer(eid) === null &&
				world.network.getObject(eid) === null
			)
		) {
			transformControls.attach(object);
		}
	};

	const orbitControls = new OrbitControls(
		world.camera,
		world.renderer.domElement,
	);
	canvas.addEventListener("pointermove", (event) => {
		if (!world.editor.enabled) return;
		if (ImGui.GetCurrentContext() !== null) {
			orbitControls.enabled =
				(!ImGui.GetIO().WantCaptureMouse &&
					transformControlsCaptureMouse) ||
				(ImGui.GetIO().WantCaptureMouse &&
					!transformControlsCaptureMouse);
		}
		const rect = canvas.getBoundingClientRect();
		pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	});

	canvas.addEventListener("pointerdown", (event) => {
		if (transformControls.axis !== null) {
			return;
		}
		if (!(event.button === 0 && world.editor.enabled)) return;
		const intersects = raycaster.intersectObjects(
			world.scene.children.filter((x) => {
				//@ts-ignore: only make certain objects interactive
				const eid = x.eid;
				if (eid !== undefined) {
					return hasComponent(world, TransformComponent, eid);
				}
				return x === transformControls;
			}),
			true,
		);

		if (intersects.length > 0) {
			let i = 0;
			let root = intersects[i].object;
			while (
				root.type.startsWith("TransformControls") ||
				root.parent?.parent?.type.startsWith("TransformControls")
			) {
				i++;
				if (i === intersects.length) break;
				root = intersects[i].object;
			}
			do {
				if (
					intersects[i] === undefined ||
					root.type.startsWith("TransformControls") ||
					//@ts-ignore
					root._gizmo === "TransformControlsGizmo" ||
					transformControls.axis !== null
				) {
					unselectObject();
					break;
				}
				if (root.parent != null && root.parent.type !== "Scene") {
					root = root.parent;
					continue;
				}
				//@ts-ignore
				const eid = root.eid;
				if (eid === undefined) {
					unselectObject();
					break;
				}
				selectObject(eid);
				break;
			} while (true);
		} else {
			unselectObject();
		}
	});

	const transformControls = new TransformControls(world.camera, canvas);
	transformControls.addEventListener("dragging-changed", (event) => {
		transformControlsCaptureMouse = !event.value;
	});
	transformControls.addEventListener("change", () => {
		if (!transformControlsCaptureMouse) {
			const eid = world.editor.selectedObject ?? -1;
			if (eid === -1) return;
			let id: string | null = null;
			let isPlayer = hasComponent(world, PlayerComponent, eid);
			if (isPlayer) {
				id = world.network.getPlayer(eid)?.username ?? null;
			} else {
				id = world.network.getObject(eid)?.id ?? null;
			}
			if (id === null) return;
			world.network.emit(NetworkEvent.ObjectTransform, {
				id,
				isPlayer,
				position: {
					x: TransformComponent.position.x[eid],
					y: TransformComponent.position.y[eid],
					z: TransformComponent.position.z[eid],
				},
				rotation: {
					x: TransformComponent.rotation.x[eid],
					y: TransformComponent.rotation.y[eid],
					z: TransformComponent.rotation.z[eid],
					w: 0,
				},
				scale: {
					x: TransformComponent.scale.x[eid],
					y: TransformComponent.scale.y[eid],
					z: TransformComponent.scale.z[eid],
				},
			});
		}
	});
	world.scene.add(transformControls);

	let lastSelectedTool: EditorTool = null;
	return defineSystem((world: World) => {
		orbitControls.update();
		raycaster.setFromCamera(pointer, world.camera);

		if (ImGui.bind === undefined || !world.editor.enabled) {
			if (world.editor.selectedObject !== null) {
				unselectObject();
			}
			return world;
		}

		if (lastSelectedTool !== world.editor.selectedTool) {
			lastSelectedTool = world.editor.selectedTool;
			if (lastSelectedTool !== null) {
				transformControls.setMode(lastSelectedTool);
			} else {
				selectObject(null, true);
			}
		}

		{
			const objects = objectLeaveQuery(world);
			for (let x = 0; x < objects.length; x++) {
				var obj = world.objects.get(objects[x]);
				if (obj === undefined) continue;
				if (world.editor.selectedObject === objects[x]) {
					unselectObject();
				}
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
		ImGui.SetNextWindowSize(new ImGui.ImVec2(69 * 4, 420), ImGui.Cond.Once);
		renderExplorer(world, selectObject);

		ImGui.SetNextWindowPos(
			new ImGui.ImVec2(
				canvas.getBoundingClientRect().width -
					canvas.getBoundingClientRect().right +
					69 * 4,
				0,
			),
			ImGui.ImGuiCond.Appearing,
		);
		ImGui.SetNextWindowSize(new ImGui.ImVec2(50 * 4, 75), ImGui.Cond.Once);
		renderToolbar(world);

		ImGui.SetNextWindowPos(
			new ImGui.ImVec2(
				canvas.getBoundingClientRect().right - 69 * 4,
				canvas.getBoundingClientRect().height - 420,
			),
			ImGui.ImGuiCond.Appearing,
		);
		ImGui.SetNextWindowSize(new ImGui.ImVec2(69 * 4, 420), ImGui.Cond.Once);
		renderInspector(world);
		return world;
	});
}

function renderExplorer(world: World, onSelect: (eid: number) => void) {
	ImGui.Begin("Explorer", null, ImGui.WindowFlags.None);
	const objects = world.scene.children.filter((x) => {
		//@ts-ignore: only make certain objects interactive
		const eid = x.eid;
		if (eid !== undefined) return true;
		return false;
	});
	for (let i = 0; i < objects.length; i++) {
		let node_flags: ImGui.TreeNodeFlags =
			ImGui.TreeNodeFlags.OpenOnArrow |
			ImGui.TreeNodeFlags.OpenOnDoubleClick |
			ImGui.TreeNodeFlags.SpanAvailWidth;
		const is_selected: boolean = false;
		const objectName = `${objects[i].name || objects[i].uuid}`;
		if (is_selected) node_flags |= ImGui.TreeNodeFlags.Selected;
		if (false) {
			// this is for nested objects (not implemented yet)
			const node_open = ImGui.TreeNodeEx(i, node_flags, objectName);
			if (ImGui.IsItemClicked() && !ImGui.IsItemToggledOpen()) {
				//@ts-ignore
				onSelect(objects[i].eid ?? null, true);
			}
			if (ImGui.BeginDragDropSource()) {
				ImGui.SetDragDropPayload("_TREENODE", null, 0);
				ImGui.Text(objectName);
				ImGui.EndDragDropSource();
			}
			if (node_open) {
				ImGui.BulletText("Blah blah\nBlah Blah");
				ImGui.TreePop();
			}
		} else {
			node_flags |=
				ImGui.TreeNodeFlags.Leaf | ImGui.TreeNodeFlags.NoTreePushOnOpen;
			ImGui.TreeNodeEx(i, node_flags, objectName);
			if (ImGui.IsItemClicked() && !ImGui.IsItemToggledOpen()) {
				//@ts-ignore
				onSelect(objects[i].eid ?? null, true);
			}
			if (ImGui.BeginDragDropSource()) {
				ImGui.SetDragDropPayload("_TREENODE", null, 0);
				ImGui.Text(objectName);
				ImGui.EndDragDropSource();
			}
		}
	}
}

function renderInspector(world: World) {
	const eid = world.editor.selectedObject ?? -1;
	const object = world.scene.getObjectByProperty("eid", eid);

	ImGui.Begin("Inspector", null, ImGui.WindowFlags.None);
	if (object === undefined) {
		ImGui.TextWrapped(`No selected object`);
	} else {
		ImGui.TextWrapped(`${object.name}`);
		if (
			ImGui.CollapsingHeader(
				"Transform Component",
				ImGui.ImGuiTreeNodeFlags.DefaultOpen,
			)
		) {
			const posX = STATIC<ImGui.ImScalar<number>>(UNIQUE(`posX#${eid}`), [
				TransformComponent.position.x[eid],
			]);
			const posY = STATIC<ImGui.ImScalar<number>>(UNIQUE(`posY#${eid}`), [
				TransformComponent.position.y[eid],
			]);
			const posZ = STATIC<ImGui.ImScalar<number>>(UNIQUE(`posZ#${eid}`), [
				TransformComponent.position.z[eid],
			]);
			posX.value[0] = TransformComponent.position.x[eid];
			posY.value[0] = TransformComponent.position.y[eid];
			posZ.value[0] = TransformComponent.position.z[eid];

			ImGui.PushItemWidth(ImGui.CalcItemWidth() / 4);
			ImGui.Text("Position:");
			ImGui.SameLine();
			ImGui.DragFloat(`X##posX#${eid}`, posX.value);
			ImGui.SameLine();
			ImGui.DragFloat(`Y##posY#${eid}`, posY.value);
			ImGui.SameLine();
			ImGui.DragFloat(`Z##posZ#${eid}`, posZ.value);
			ImGui.PopItemWidth();

			const rotX = STATIC<ImGui.ImScalar<number>>(UNIQUE(`rotX#${eid}`), [
				TransformComponent.rotation.x[eid],
			]);
			const rotY = STATIC<ImGui.ImScalar<number>>(UNIQUE(`rotY#${eid}`), [
				TransformComponent.rotation.y[eid],
			]);
			const rotZ = STATIC<ImGui.ImScalar<number>>(UNIQUE(`rotZ#${eid}`), [
				TransformComponent.rotation.z[eid],
			]);
			rotX.value[0] = TransformComponent.rotation.x[eid];
			rotY.value[0] = TransformComponent.rotation.y[eid];
			rotZ.value[0] = TransformComponent.rotation.z[eid];

			ImGui.PushItemWidth(ImGui.CalcItemWidth() / 4);
			ImGui.Text("Rotation:");
			ImGui.SameLine();
			ImGui.DragFloat(`X##rotX#${eid}`, rotX.value);
			ImGui.SameLine();
			ImGui.DragFloat(`Y##rotY#${eid}`, rotY.value);
			ImGui.SameLine();
			ImGui.DragFloat(`Z##rotZ#${eid}`, rotZ.value);
			ImGui.PopItemWidth();

			const scaX = STATIC<ImGui.ImScalar<number>>(UNIQUE(`scaX#${eid}`), [
				TransformComponent.scale.x[eid],
			]);
			const scaY = STATIC<ImGui.ImScalar<number>>(UNIQUE(`scaY#${eid}`), [
				TransformComponent.scale.y[eid],
			]);
			const scaZ = STATIC<ImGui.ImScalar<number>>(UNIQUE(`scaZ#${eid}`), [
				TransformComponent.scale.z[eid],
			]);
			scaX.value[0] = TransformComponent.scale.x[eid];
			scaY.value[0] = TransformComponent.scale.y[eid];
			scaZ.value[0] = TransformComponent.scale.z[eid];

			ImGui.PushItemWidth(ImGui.CalcItemWidth() / 4);
			ImGui.Text("Scale:");
			ImGui.SameLine();
			ImGui.DragFloat(`X##scaX#${eid}`, scaX.value);
			ImGui.SameLine();
			ImGui.DragFloat(`Y##scaY#${eid}`, scaY.value);
			ImGui.SameLine();
			ImGui.DragFloat(`Z##scaZ#${eid}`, scaZ.value);
			ImGui.PopItemWidth();
		}
	}
}

function renderToolbar(world: World) {
	ImGui.Begin("Tools", null, ImGui.WindowFlags.None);
	const button_sz: ImGui.Vec2 = new ImGui.Vec2(40, 40);
	const window_visible_x2: number =
		ImGui.GetWindowPos().x + ImGui.GetWindowContentRegionMax().x;

	const buttons: { name: string; isSelected: boolean; click: () => void }[] =
		[
			{
				name: "None",
				isSelected: world.editor.selectedTool === null,
				click: () => {
					world.editor.selectedTool = null;
				},
			},
			{
				name: "Move",
				isSelected: world.editor.selectedTool === "translate",
				click: () => {
					world.editor.selectedTool = "translate";
				},
			},
			{
				name: "Rotate",
				isSelected: world.editor.selectedTool === "rotate",
				click: () => {
					world.editor.selectedTool = "rotate";
				},
			},
			{
				name: "Scale",
				isSelected: world.editor.selectedTool === "scale",
				click: () => {
					world.editor.selectedTool = "scale";
				},
			},
		];
	for (let n = 0; n < buttons.length; n++) {
		ImGui.PushID(n);
		ImGui.PushStyleVar(
			ImGui.ImGuiStyleVar.SelectableTextAlign,
			new ImGui.ImVec2(0.5, 0.5),
		);
		ImGui.Selectable(buttons[n].name, buttons[n].isSelected, 0, button_sz);
		ImGui.PopStyleVar();
		if (ImGui.IsItemClicked()) {
			buttons[n].click();
		}
		const last_button_x2: number = ImGui.GetItemRectMax().x;
		const next_button_x2: number = last_button_x2 + button_sz.x;
		if (n + 1 < buttons.length && next_button_x2 < window_visible_x2)
			ImGui.SameLine();
		ImGui.PopID();
	}
}
