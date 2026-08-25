import * as THREE from "three";
import {
	addComponent,
	defineQuery,
	defineSystem,
	entityExists,
	exitQuery,
	hasComponent,
	removeComponent,
} from "bitecs";
import { World } from "../factory/world";

import { ImGui } from "imgui-js";

import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
	ObjectComponent,
	ObjectOutlineComponent,
	PlayerComponent,
	TransformComponent,
} from "../components";
import { STATIC, UNIQUE } from "./imgui";
import { emitObjectLeave, emitObjectTransform } from "./network";
import { isSwfHitTransparent } from "./control";
import {
	Snapshot,
	removeObjectCommand,
	removePartCommand,
	snapshotTransform,
	transformCommand,
	transformsDiffer,
} from "./history";
import { Type } from "../proto";

const objectLeaveQuery = exitQuery(defineQuery([ObjectComponent]));
const playerLeaveQuery = exitQuery(defineQuery([PlayerComponent]));

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

	/** Ceiling on how often a drag pushes intermediate transforms onto the
	 * wire. The server budgets 20/s per connection (spendTransformToken), so
	 * this leaves room for the unthrottled mouseUp emit and for a second
	 * object being dragged in the same second. */
	const TRANSFORM_EMIT_HZ = 15;
	const TRANSFORM_EMIT_INTERVAL = 1000 / TRANSFORM_EMIT_HZ;
	let lastTransformEmit = 0;
	/** Whether a transform has changed since the last emit -- i.e. whether
	 * the final mouseUp emit has anything to say. */
	let pendingTransformEmit = false;

	/** What the dragged object looked like before the drag started, captured
	 * on mouseDown so mouseUp can record the pair as one undoable move. A
	 * drag is the unit of undo here, not a frame of one. */
	let dragSnapshot: { id: string; before: Snapshot } | null = null;

	const unselectObject = (force: boolean = false) => {
		if (
			ImGui.bind !== undefined &&
			ImGui.GetIO().WantCaptureMouse &&
			!force
		)
			return;
		if (
			world.editor.selectedObject !== null &&
			entityExists(world, world.editor.selectedObject) &&
			hasComponent(
				world,
				ObjectOutlineComponent,
				world.editor.selectedObject,
			)
		) {
			removeComponent(
				world,
				ObjectOutlineComponent,
				world.editor.selectedObject,
			);
		}
		world.editor.selectedObject = null;
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

	canvas.addEventListener("pointermove", (event) => {
		if (!world.editor.enabled) return;
		if (ImGui.GetCurrentContext() !== null) {
			world.controls.enabled =
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
		// ImGui draws its panels onto this same canvas, so a click on one
		// still arrives here as a plain canvas pointerdown. Without this the
		// raycast below runs *behind* the panel and reselects whatever is
		// under it -- the floor, wherever a panel overlaps it. Pressing
		// "Remove from room" therefore swapped the selection out from under
		// itself on the press, and on the release the button acted on the
		// floor, which has no network id, and silently did nothing. Which
		// piece you could delete depended on where the panel happened to sit.
		// unselectObject() has carried this guard all along; selecting never
		// did, so the click only ever went one way: it took a selection, it
		// could not keep one.
		if (ImGui.bind !== undefined && ImGui.GetIO().WantCaptureMouse) return;
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

		// Walk the hits front to back. Anything the pointer did not really
		// land on -- a gizmo, a see-through pixel of a SWF avatar -- is
		// skipped so whatever is behind it can be selected instead; a pass
		// that accepts nothing clears the selection the same way a miss does.
		let selected = false;
		for (let i = 0; i < intersects.length; i++) {
			let root = intersects[i].object;
			if (
				root.type.startsWith("TransformControls") ||
				root.parent?.parent?.type.startsWith("TransformControls")
			) {
				continue;
			}
			if (
				//@ts-ignore
				root._gizmo === "TransformControlsGizmo" ||
				transformControls.axis !== null
			) {
				break;
			}
			while (root.parent != null && root.parent.type !== "Scene") {
				root = root.parent;
			}
			//@ts-ignore
			const eid = root.eid;
			if (eid === undefined) break;
			// A SWF avatar is a rectangle with an avatar-shaped hole in it, so
			// the raycast hits its empty corners too. Clicking one used to
			// select the avatar; now it falls through to whatever is behind.
			if (isSwfHitTransparent(world, eid, intersects[i])) continue;
			selectObject(eid);
			selected = true;
			break;
		}
		if (!selected) unselectObject();
	});

	const transformControls = new TransformControls(world.camera, canvas);

	/**
	 * Sends the selected entity's current transform to the server.
	 *
	 * Reads straight out of ECS storage rather than off the three.js object,
	 * because TransformControls has already written through the accessors
	 * createPlayer/createObject redefined -- the typed arrays are the truth.
	 */
	const emitSelectedTransform = () => {
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

		const position = new THREE.Vector3(
			TransformComponent.position.x[eid],
			TransformComponent.position.y[eid],
			TransformComponent.position.z[eid],
		);
		const rotation = new THREE.Euler(
			TransformComponent.rotation.x[eid],
			TransformComponent.rotation.y[eid],
			TransformComponent.rotation.z[eid],
		);
		const scale = new THREE.Vector3(
			TransformComponent.scale.x[eid],
			TransformComponent.scale.y[eid],
			TransformComponent.scale.z[eid],
		);

		lastTransformEmit = performance.now();
		pendingTransformEmit = false;
		emitObjectTransform(world, id, isPlayer, position, rotation, scale);
	};

	transformControls.addEventListener("dragging-changed", (event) => {
		transformControlsCaptureMouse = !event.value;
	});
	transformControls.addEventListener("change", () => {
		if (transformControlsCaptureMouse) return;
		// A drag fires "change" once per mouse move -- every frame, in
		// practice. Each one is a broadcast to the room and, before the
		// ownership cache landed, a SQL query on the server too. Observers
		// cannot see more than the display refresh anyway, so hold the wire
		// rate to TRANSFORM_EMIT_HZ and let mouseUp below send the state
		// that actually matters.
		const now = performance.now();
		if (now - lastTransformEmit < TRANSFORM_EMIT_INTERVAL) {
			pendingTransformEmit = true;
			return;
		}
		emitSelectedTransform();
	});
	transformControls.addEventListener("mouseDown", () => {
		dragSnapshot = null;
		const eid = world.editor.selectedObject ?? -1;
		if (eid === -1) return;
		// Players are left out of history on purpose: a player moves itself
		// continuously, so an undo would be fighting whoever it teleported.
		if (hasComponent(world, PlayerComponent, eid)) return;
		const id = world.network.getObject(eid)?.id ?? null;
		if (id === null) return;
		dragSnapshot = { id, before: snapshotTransform(eid) };
	});
	transformControls.addEventListener("mouseUp", () => {
		// The authoritative end-of-drag emit. Unthrottled on purpose: this
		// is the only frame whose exact values have to survive, and dropping
		// it would leave everyone else -- and the database -- holding
		// whatever intermediate position happened to make it through last.
		//
		// Fires before TransformControls clears `dragging`, so the guard in
		// the "change" handler above still reads as mid-drag here.
		if (pendingTransformEmit) emitSelectedTransform();

		// Recorded independently of the emit above: a drag whose last frame
		// happened to land on the throttle boundary has nothing left to
		// send, but it still moved something.
		if (dragSnapshot !== null) {
			const eid = world.network.getObject(dragSnapshot.id)?.eid;
			if (eid !== undefined) {
				const after = snapshotTransform(eid);
				if (transformsDiffer(dragSnapshot.before, after)) {
					world.history.push(
						transformCommand(
							dragSnapshot.id,
							dragSnapshot.before,
							after,
						),
					);
				}
			}
			dragSnapshot = null;
		}
	});
	world.scene.add(transformControls);

	let lastSelectedTool: EditorTool = null;
	let lastEditorEnabled = false;
	return defineSystem((world: World) => {
		raycaster.setFromCamera(pointer, world.camera);

		if (ImGui.bind === undefined || !world.editor.enabled) {
			if (world.editor.selectedObject !== null) {
				unselectObject();
			}
			// controls.enabled is only ever recomputed by the pointermove
			// handler above, and that returns early unless the editor is on.
			// Leaving the editor with the cursor over an ImGui panel -- or
			// mid gizmo drag -- therefore left it false, freezing the camera
			// with no way back short of re-entering the editor. Hand the
			// camera over on the way out.
			if (lastEditorEnabled) {
				lastEditorEnabled = false;
				transformControlsCaptureMouse = true;
				world.controls.enabled = true;
				// The stack is only meaningful against the world it was
				// recorded in. Leaving the editor -- or the room -- can put
				// objects somewhere else entirely, and replaying stale
				// commands into that would move the wrong things.
				world.history.clear();
			}
			return world;
		}
		lastEditorEnabled = true;

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
					selectObject(null, true);
				}
			}
		}
		{
			const players = playerLeaveQuery(world);
			for (let x = 0; x < players.length; x++) {
				var obj = world.players.get(players[x])?.player;
				if (obj === undefined) continue;
				if (world.editor.selectedObject === players[x]) {
					selectObject(null, true);
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
		if (ImGui.Button("Remove from room")) {
			let id: string | null = null;
			let isPlayer = hasComponent(world, PlayerComponent, eid);
			if (isPlayer) {
				id = world.network.getPlayer(eid)?.username ?? null;
			} else {
				id = world.network.getObject(eid)?.id ?? null;
			}
			// Anything the network never registered -- the room's own floor,
			// say -- has no id to remove by. Bailing silently here is
			// indistinguishable from a dead button, so say which it was; the
			// matching server-side rejections log too.
			if (id === null) {
				console.warn(
					"Cannot remove entity",
					eid,
					`(${object.name}): it is not a networked ` +
						(isPlayer ? "player" : "object"),
				);
				return;
			}
			console.debug("Removing from room", { eid, id, isPlayer });
			if (isPlayer) {
				// Kicking a player is not an edit to the room, and there is
				// nothing to put back.
				emitObjectLeave(world, id, true);
			} else {
				// Snapshot first: once the server acknowledges the removal
				// the entity is gone, and with it the only record of where
				// it stood -- and, for a part, of what it even was.
				const part = world.primitives.get(eid);
				const command =
					part !== undefined
						? removePartCommand(id, part, snapshotTransform(eid))
						: removeObjectCommand(
								id,
								Type.Furniture,
								snapshotTransform(eid),
							);
				command.do(world);
				world.history.push(command);
			}
		}
		ImGui.NewLine();
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
