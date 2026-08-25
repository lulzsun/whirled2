import * as THREE from "three";
import { defineSystem } from "bitecs";

import { ImGui } from "imgui-js";

import { World } from "../factory/world";
import { createPartMesh } from "../factory/primitive";
import { DEFAULT_PART_MATERIAL, PART_MATERIALS } from "../managers/materials";
import { createGhostMaterial } from "../managers/materials";
import { emitPartJoin } from "./network";
import { addPartCommand, isTypingTarget } from "./history";
import { GRID_INCREMENTS, isFreeMoveHeld, snapCentreByEdge } from "./snap";
import { DenyReason, Part, PartSchema, Shape } from "../proto";
import { create } from "@bufbuild/protobuf";

/** How long a denial message stays on screen. */
const TOAST_MS = 4000;

/**
 * How long a placed part waits for the server to confirm it.
 *
 * The ghost stays up, dimmed, until the broadcast comes back carrying its
 * nonce. Leaving it up forever after a dropped packet would be worse than
 * taking it down, since the player has no way to tell a slow server from a
 * lost one.
 */
const PLACEMENT_TIMEOUT_MS = 5000;

export type Build = {
	/** Whether the player is placing parts rather than selecting them. */
	placing: boolean;
	shape: Shape;
	material: number;
	color: number;
	used: number;
	capacity: number;
	onDenied(id: string, reason: DenyReason): void;
	onCapacity(used: number, capacity: number): void;
	/** Takes down the ghost drawn for a placement the server has confirmed. */
	resolveGhost(nonce: string, id: string): void;
	/**
	 * Places a part and reports the id the server minted for it.
	 *
	 * Shared with history: redoing a placement, or undoing a removal, is the
	 * same operation as making one, and each time the part comes back with a
	 * *different* id -- so the caller has to be told the new one rather than
	 * assume the old one still means anything.
	 */
	placePart(
		part: Part,
		position: THREE.Vector3,
		rotation: THREE.Euler,
		scale: THREE.Vector3,
		onConfirmed?: (id: string) => void,
	): void;
};

const DENY_MESSAGES: Record<number, string> = {
	[DenyReason.NotOwner]: "You do not own this room.",
	[DenyReason.CapacityFull]: "This room is full.",
	[DenyReason.InvalidPart]: "That part could not be built.",
	[DenyReason.Duplicate]: "That is already in the room.",
};

/** Colour swatches offered in the palette, as 0xRRGGBB. */
const SWATCHES = [
	0xffffff, 0xc8c8c8, 0x6d6d6d, 0x2a2a2a, 0xd44b4b, 0xe08b3a, 0xe6c445,
	0x69b34c, 0x3f8fd4, 0x7a5bc4, 0xd06fa8, 0x8b5a2b,
];

export function createBuildSystem(world: World) {
	world.build = {
		placing: false,
		shape: Shape.Box,
		material: DEFAULT_PART_MATERIAL,
		color: 0xffffff,
		used: 0,
		capacity: 0,
		onDenied: (id, reason) => {
			// A denial can answer either a pending ghost (by nonce) or an
			// action with no ghost at all, like adding furniture.
			const pending = pendingPlacements.get(id);
			if (pending !== undefined) {
				world.scene.remove(pending.ghost);
				pendingPlacements.delete(id);
			}
			toast =
				DENY_MESSAGES[reason] ?? "That could not be done right now.";
			toastUntil = performance.now() + TOAST_MS;
		},
		onCapacity: (used, capacity) => {
			world.build.used = used;
			world.build.capacity = capacity;
		},
		resolveGhost: (nonce, id) => {
			const pending = pendingPlacements.get(nonce);
			if (pending === undefined) return;
			world.scene.remove(pending.ghost);
			pendingPlacements.delete(nonce);
			pending.onConfirmed?.(id);
		},
		placePart: (part, position, rotation, scale, onConfirmed) =>
			placePart(part, position, rotation, scale, onConfirmed),
	};

	const canvas = world.renderer.domElement;
	const pointer = new THREE.Vector2();
	const raycaster = new THREE.Raycaster();

	let toast: string | null = null;
	let toastUntil = 0;

	/** The part following the cursor, or null when not placing. */
	let ghost: THREE.Mesh | null = null;
	const ghostMaterial = createGhostMaterial();

	/**
	 * Ghosts already sent to the server, keyed by the nonce they were sent
	 * with. They stay in the scene, dimmed, until the server's broadcast
	 * arrives carrying that nonce -- at which point the real part replaces
	 * them.
	 */
	const pendingPlacements = new Map<
		string,
		{
			ghost: THREE.Mesh;
			expiresAt: number;
			onConfirmed?: (id: string) => void;
		}
	>();

	/**
	 * Sends a part to the server and stands a ghost in for it until the
	 * broadcast comes back.
	 *
	 * The ghost is not merely cosmetic: the server mints the id, so until it
	 * answers there is no object to select, move, or undo -- only a promise
	 * that one is coming.
	 */
	const placePart = (
		part: Part,
		position: THREE.Vector3,
		rotation: THREE.Euler,
		scale: THREE.Vector3,
		onConfirmed?: (id: string) => void,
	) => {
		const nonce = `p${Date.now().toString(36)}${Math.floor(
			Math.random() * 1e6,
		).toString(36)}`;

		const placed = createPartMesh(part);
		placed.material = ghostMaterial;
		placed.position.copy(position);
		placed.rotation.copy(rotation);
		placed.scale.copy(scale);
		world.scene.add(placed);
		pendingPlacements.set(nonce, {
			ghost: placed,
			expiresAt: performance.now() + PLACEMENT_TIMEOUT_MS,
			onConfirmed,
		});

		emitPartJoin(world, nonce, part, position, rotation, scale);
	};

	const describeCurrentPart = (): Part =>
		create(PartSchema, {
			shape: world.build.shape,
			material: world.build.material,
			color: world.build.color,
			uvScale: 1,
			collides: true,
			locked: false,
			group: "",
		});

	const rebuildGhost = () => {
		if (ghost !== null) world.scene.remove(ghost);
		ghost = createPartMesh(describeCurrentPart());
		ghost.material = ghostMaterial;
		ghost.visible = false;
		world.scene.add(ghost);
	};

	/**
	 * Where a new part would land, given the cursor.
	 *
	 * M3 places on the ground plane only; the surface-flush placement that
	 * makes stacking feel like Rec Room is M6. Even so the part is lifted by
	 * half its height, so a box sits *on* the floor rather than halfway
	 * through it -- a part sunk into the ground on every placement would
	 * read as broken long before M6 arrived.
	 */
	const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
	const resolvePlacement = (): THREE.Vector3 | null => {
		raycaster.setFromCamera(pointer, world.camera);
		const hit = new THREE.Vector3();
		if (raycaster.ray.intersectPlane(groundPlane, hit) === null) {
			return null;
		}

		// Lifted by half its height so it rests on the ground rather than
		// halfway through it. Parts are unit geometry and placed unscaled,
		// so this is a half unit today; it becomes a real half-extent once
		// placement can inherit a scale.
		hit.y += 0.5;

		// Snapped by edge, not centre, and by the same rule the gizmo uses
		// -- so a part dropped here and a part dragged here end up in the
		// same place. See snapCentreByEdge.
		const grid = world.editor.grid;
		if (grid > 0 && !isFreeMoveHeld()) {
			hit.x = snapCentreByEdge(hit.x, 1, grid);
			hit.y = snapCentreByEdge(hit.y, 1, grid);
			hit.z = snapCentreByEdge(hit.z, 1, grid);
		}
		return hit;
	};

	canvas.addEventListener("pointermove", (event) => {
		const rect = canvas.getBoundingClientRect();
		pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	});

	canvas.addEventListener("pointerdown", (event) => {
		if (event.button !== 0) return;
		if (!world.editor.enabled || !world.build.placing) return;
		// imgui draws its panels onto this same canvas, so a click on the
		// palette still arrives here; without this, choosing a shape would
		// also place one behind the panel.
		if (ImGui.bind !== undefined && ImGui.GetIO().WantCaptureMouse) return;

		const position = resolvePlacement();
		if (position === null) return;

		if (world.build.used >= world.build.capacity) {
			// The server refuses this too -- it has to, the client cannot be
			// trusted -- but saying so here avoids a round trip to tell the
			// player something already on screen.
			toast = "This room is full.";
			toastUntil = performance.now() + TOAST_MS;
			return;
		}

		const part = describeCurrentPart();
		const rotation = new THREE.Euler(0, 0, 0);
		const scale = new THREE.Vector3(1, 1, 1);
		const command = addPartCommand(part, {
			position: [position.x, position.y, position.z],
			rotation: [0, 0, 0],
			scale: [1, 1, 1],
		});
		placePart(part, position, rotation, scale, (id) => {
			// Recorded only once the server has confirmed it. An undo of a
			// placement that never landed would have nothing to remove.
			command.setId(id);
			world.history.push(command);
		});
	});

	window.addEventListener("keydown", (event) => {
		if (!world.editor.enabled) return;
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (isTypingTarget()) return;

		if (event.key === "Escape" && world.build.placing) {
			world.build.placing = false;
			return;
		}
		// Cycles coarse -> fine -> off and back. A hotkey rather than only a
		// button because changing grid is something you do mid-build, with
		// the cursor already where you want the part.
		if (event.key === "g" || event.key === "G") {
			const order = [...GRID_INCREMENTS, 0];
			const at = order.indexOf(world.editor.grid);
			world.editor.grid = order[(at + 1) % order.length];
		}
	});

	let lastShape = world.build.shape;
	let lastMaterial = world.build.material;
	let lastColor = world.build.color;

	return defineSystem((world: World) => {
		if (!world.editor.enabled) {
			if (ghost !== null) ghost.visible = false;
			return world;
		}

		if (
			ghost === null ||
			lastShape !== world.build.shape ||
			lastMaterial !== world.build.material ||
			lastColor !== world.build.color
		) {
			lastShape = world.build.shape;
			lastMaterial = world.build.material;
			lastColor = world.build.color;
			rebuildGhost();
		}

		// Retire ghosts the server never answered for. Confirmed ones are
		// removed by the objectJoin handler as their real part arrives.
		if (pendingPlacements.size > 0) {
			const now = performance.now();
			for (const [nonce, pending] of pendingPlacements) {
				if (now >= pending.expiresAt) {
					world.scene.remove(pending.ghost);
					pendingPlacements.delete(nonce);
					console.warn(
						"Placement " + nonce + " was never acknowledged",
					);
				}
			}
		}

		if (ghost !== null) {
			const position = world.build.placing ? resolvePlacement() : null;
			ghost.visible = position !== null;
			if (position !== null) ghost.position.copy(position);
		}

		renderBuildPanel(world);
		if (toast !== null && performance.now() < toastUntil) {
			renderToast(toast);
		} else {
			toast = null;
		}
		return world;
	});

	function renderToast(message: string) {
		const size = canvas.getBoundingClientRect();
		ImGui.SetNextWindowPos(
			new ImGui.ImVec2(size.width / 2 - 150, 60),
			ImGui.ImGuiCond.Always,
		);
		ImGui.SetNextWindowSize(new ImGui.ImVec2(300, 0), ImGui.Cond.Always);
		ImGui.Begin(
			"##buildToast",
			null,
			ImGui.WindowFlags.NoTitleBar |
				ImGui.WindowFlags.NoResize |
				ImGui.WindowFlags.NoMove |
				ImGui.WindowFlags.AlwaysAutoResize,
		);
		ImGui.TextWrapped(message);
	}
}

function renderBuildPanel(world: World) {
	const canvas = world.renderer.domElement;
	const rect = canvas.getBoundingClientRect();
	ImGui.SetNextWindowPos(
		new ImGui.ImVec2(rect.width - 69 * 4 - 220, 0),
		ImGui.ImGuiCond.Appearing,
	);
	ImGui.SetNextWindowSize(new ImGui.ImVec2(220, 420), ImGui.Cond.Once);
	ImGui.Begin("Build", null, ImGui.WindowFlags.None);

	const full = world.build.used >= world.build.capacity;
	ImGui.Text(`Parts: ${world.build.used} / ${world.build.capacity}`);
	if (full) ImGui.TextWrapped("Room is full.");
	ImGui.Separator();

	const placeLabel = world.build.placing ? "Stop placing" : "Place parts";
	if (ImGui.Button(placeLabel)) {
		world.build.placing = !world.build.placing;
	}
	ImGui.Separator();

	ImGui.Text("Grid");
	for (let i = 0; i < GRID_INCREMENTS.length; i++) {
		const increment = GRID_INCREMENTS[i];
		ImGui.PushID(`grid${i}`);
		ImGui.Selectable(
			`${increment}`,
			world.editor.grid === increment,
			0,
			new ImGui.Vec2(44, 22),
		);
		if (ImGui.IsItemClicked()) world.editor.grid = increment;
		ImGui.PopID();
		ImGui.SameLine();
	}
	ImGui.PushID("gridOff");
	ImGui.Selectable("Off", world.editor.grid <= 0, 0, new ImGui.Vec2(44, 22));
	if (ImGui.IsItemClicked()) world.editor.grid = 0;
	ImGui.PopID();
	ImGui.TextWrapped(
		isFreeMoveHeld() ? "Alt held: snapping off" : "Hold Alt for free move",
	);
	ImGui.Separator();

	ImGui.Text("Shape");
	const shapes: [string, Shape][] = [
		["Box", Shape.Box],
		["Wedge", Shape.Wedge],
		["Cylinder", Shape.Cylinder],
		["Sphere", Shape.Sphere],
		["Cone", Shape.Cone],
		["Plane", Shape.Plane],
		["Corner", Shape.CornerWedge],
	];
	for (let i = 0; i < shapes.length; i++) {
		const [label, shape] = shapes[i];
		ImGui.PushID(`shape${i}`);
		ImGui.Selectable(
			label,
			world.build.shape === shape,
			0,
			new ImGui.Vec2(96, 22),
		);
		if (ImGui.IsItemClicked()) {
			world.build.shape = shape;
			world.build.placing = true;
		}
		ImGui.PopID();
		if (i % 2 === 0 && i + 1 < shapes.length) ImGui.SameLine();
	}

	ImGui.Separator();
	ImGui.Text("Material");
	for (let i = 0; i < PART_MATERIALS.length; i++) {
		ImGui.PushID(`mat${i}`);
		ImGui.Selectable(
			PART_MATERIALS[i].name,
			world.build.material === i,
			0,
			new ImGui.Vec2(96, 22),
		);
		if (ImGui.IsItemClicked()) world.build.material = i;
		ImGui.PopID();
		if (i % 2 === 0 && i + 1 < PART_MATERIALS.length) ImGui.SameLine();
	}

	ImGui.Separator();
	ImGui.Text("Colour");
	for (let i = 0; i < SWATCHES.length; i++) {
		const swatch = SWATCHES[i];
		ImGui.PushID(`col${i}`);
		const label = world.build.color === swatch ? "*" : " ";
		ImGui.Selectable(
			label,
			world.build.color === swatch,
			0,
			new ImGui.Vec2(30, 22),
		);
		if (ImGui.IsItemClicked()) world.build.color = swatch;
		ImGui.PopID();
		if ((i + 1) % 6 !== 0) ImGui.SameLine();
	}
}
