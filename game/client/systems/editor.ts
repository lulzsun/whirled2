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
	TransformComponent,
} from "../components";
import { Object } from "../factory/object";

const objectQuery = defineQuery([ObjectComponent]);
const objectLeaveQuery = exitQuery(defineQuery([ObjectComponent]));

export function createEditorSystem(world: World) {
	const pointer = new THREE.Vector2();
	const raycaster = new THREE.Raycaster();

	const canvas = world.renderer.domElement;

	let transformControlsCaptureMouse = true;
	let selectedObject: number | null = null;

	const unselectObject = () => {
		if (selectedObject !== null) {
			removeComponent(world, ObjectOutlineComponent, selectedObject);
			selectedObject = null;
		}
		transformControls.detach();
	};

	const orbitControls = new OrbitControls(
		world.camera,
		world.renderer.domElement,
	);
	canvas.addEventListener("pointermove", (event) => {
		if (!world.editMode) return;
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
		if (!(event.button === 0 && world.editMode)) return;
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
				unselectObject();
				addComponent(world, ObjectOutlineComponent, eid);
				selectedObject = eid;
				transformControls.attach(root as Object);
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
	world.scene.add(transformControls);

	return defineSystem((world: World) => {
		orbitControls.update();
		raycaster.setFromCamera(pointer, world.camera);

		if (ImGui.bind === undefined || !world.editMode) {
			if (selectedObject) {
				selectedObject = null;
				transformControls.detach();
			}
			return world;
		}

		{
			const objects = objectLeaveQuery(world);
			for (let x = 0; x < objects.length; x++) {
				var obj = world.objects.get(objects[x]);
				if (obj === undefined) continue;
				if (selectedObject === objects[x]) {
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
		ImGui.Begin("Explorer", null, ImGui.WindowFlags.None);
		populateExplorer();

		ImGui.SetNextWindowPos(
			new ImGui.ImVec2(
				canvas.getBoundingClientRect().right - 69 * 4,
				canvas.getBoundingClientRect().height - 420,
			),
			ImGui.ImGuiCond.Appearing,
		);
		ImGui.SetNextWindowSize(new ImGui.ImVec2(69 * 4, 420), ImGui.Cond.Once);
		ImGui.Begin("Inspector", null, ImGui.WindowFlags.None);
		ImGui.TextWrapped(`Hello, Whirled!`);
		return world;
	});
}

function UNIQUE(key: string): string {
	return key;
}

class Static<T> {
	constructor(public value: T) {}
	access: ImGui.Access<T> = (value: T = this.value): T =>
		(this.value = value);
}

const _static_map: Map<string, Static<any>> = new Map();

function STATIC<T>(key: string, init: T): Static<T> {
	let value: Static<T> | undefined = _static_map.get(key);
	if (value === undefined) {
		_static_map.set(key, (value = new Static<T>(init)));
	}
	return value;
}

function populateExplorer() {
	const base_flags = STATIC<ImGui.TreeNodeFlags>(
		UNIQUE("base_flags#f8c171be"),
		ImGui.TreeNodeFlags.OpenOnArrow |
			ImGui.TreeNodeFlags.OpenOnDoubleClick |
			ImGui.TreeNodeFlags.SpanAvailWidth,
	);
	const selection_mask = STATIC<number>(
		UNIQUE("selection_mask#b42bb9cf"),
		1 << 2,
	);
	let node_clicked: number = -1;
	for (let i = 0; i < 6; i++) {
		// Disable the default "open on single-click behavior" + set Selected flag according to our selection.
		// To alter selection we use IsItemClicked() && !IsItemToggledOpen(), so clicking on an arrow doesn't alter selection.
		let node_flags: ImGui.TreeNodeFlags = base_flags.value;
		const is_selected: boolean = false;
		if (is_selected) node_flags |= ImGui.TreeNodeFlags.Selected;
		if (i < 3) {
			// this.Items 0..2 are Tree Node
			const node_open: boolean = ImGui.TreeNodeEx(
				/*(void*)(intptr_t)*/ i,
				node_flags,
				`Selectable Node ${i}`,
			);
			if (ImGui.IsItemClicked() && !ImGui.IsItemToggledOpen())
				node_clicked = i;
			if (ImGui.BeginDragDropSource()) {
				ImGui.SetDragDropPayload("_TREENODE", null, 0);
				ImGui.Text("This is a drag and drop source");
				ImGui.EndDragDropSource();
			}
			if (node_open) {
				ImGui.BulletText("Blah blah\nBlah Blah");
				ImGui.TreePop();
			}
		} else {
			// this.Items 3..5 are Tree Leaves
			// The only reason we use TreeNode at all is to allow selection of the leaf. Otherwise we can
			// use BulletText() or advance the cursor by GetTreeNodeToLabelSpacing() and call Text().
			node_flags |=
				ImGui.TreeNodeFlags.Leaf | ImGui.TreeNodeFlags.NoTreePushOnOpen; // ImGui.TreeNodeFlags.Bullet
			ImGui.TreeNodeEx(
				/*(void*)(intptr_t)*/ i,
				node_flags,
				`Selectable Leaf ${i}`,
			);
			if (ImGui.IsItemClicked() && !ImGui.IsItemToggledOpen())
				node_clicked = i;
			if (ImGui.BeginDragDropSource()) {
				ImGui.SetDragDropPayload("_TREENODE", null, 0);
				ImGui.Text("This is a drag and drop source");
				ImGui.EndDragDropSource();
			}
		}
	}
}
