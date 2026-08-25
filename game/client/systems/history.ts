import * as THREE from "three";
import { defineSystem } from "bitecs";

import { ImGui } from "imgui-js";

import { World } from "../factory/world";
import { TransformComponent } from "../components";
import { Part } from "../proto";
import {
	emitObjectJoin,
	emitObjectLeave,
	emitObjectTransform,
} from "./network";

/** How many actions can be walked back. */
const HISTORY_LIMIT = 100;

/**
 * How long a restore waits for the server to acknowledge a re-added object
 * before giving up on repositioning it.
 *
 * Undoing a removal cannot be a single message: re-adding an object is
 * emitObjectJoin, and the server rebuilds it from the database at the origin
 * -- the placement the player is undoing back to is not something it stores.
 * So the object has to come back first, and only then can it be moved. If it
 * never comes back (denied, disconnected), the pending move is dropped
 * rather than left to fire at some arbitrary later time against whatever
 * object has since taken that id.
 */
const RESTORE_TIMEOUT_MS = 5000;

export type Snapshot = {
	position: [number, number, number];
	rotation: [number, number, number];
	scale: [number, number, number];
};

/**
 * One reversible action.
 *
 * `do` is not called when a command is first pushed -- the player has already
 * performed the action by then, and replaying it would double it. It exists
 * for redo.
 */
export type Command = {
	label: string;
	do(world: World): void;
	undo(world: World): void;
};

export type History = {
	/** Record an action the player has *already* performed. */
	push(command: Command): void;
	undo(world: World): boolean;
	redo(world: World): boolean;
	clear(): void;
	canUndo(): boolean;
	canRedo(): boolean;
	/** Re-add an object and put it back where it was, once it arrives. */
	restore(world: World, id: string, type: number, transform: Snapshot): void;
	/** Advances pending restores; called once per frame by the system. */
	pump(world: World): void;
	depth(): { undo: number; redo: number };
};

/** Reads an entity's current transform out of ECS storage. */
export function snapshotTransform(eid: number): Snapshot {
	return {
		position: [
			TransformComponent.position.x[eid],
			TransformComponent.position.y[eid],
			TransformComponent.position.z[eid],
		],
		rotation: [
			TransformComponent.rotation.x[eid],
			TransformComponent.rotation.y[eid],
			TransformComponent.rotation.z[eid],
		],
		scale: [
			TransformComponent.scale.x[eid],
			TransformComponent.scale.y[eid],
			TransformComponent.scale.z[eid],
		],
	};
}

/** Whether two snapshots differ enough to be worth recording. */
export function transformsDiffer(a: Snapshot, b: Snapshot): boolean {
	const EPSILON = 1e-6;
	for (const key of ["position", "rotation", "scale"] as const) {
		for (let i = 0; i < 3; i++) {
			if (Math.abs(a[key][i] - b[key][i]) > EPSILON) return true;
		}
	}
	return false;
}

/**
 * Writes a transform into ECS storage and tells the server about it.
 *
 * The three.js object aliases the same typed arrays (see createObject), so
 * writing the component *is* writing the object -- with one exception: three
 * caches a quaternion derived from the Euler and only refreshes it when the
 * Euler's change callback fires. Bypassing the setters means poking it by
 * hand, exactly as the objectJoin handler does.
 */
function applyTransform(world: World, id: string, t: Snapshot): boolean {
	const eid = world.network.getObject(id)?.eid;
	if (eid === undefined) return false;

	TransformComponent.position.x[eid] = t.position[0];
	TransformComponent.position.y[eid] = t.position[1];
	TransformComponent.position.z[eid] = t.position[2];
	TransformComponent.rotation.x[eid] = t.rotation[0];
	TransformComponent.rotation.y[eid] = t.rotation[1];
	TransformComponent.rotation.z[eid] = t.rotation[2];
	TransformComponent.scale.x[eid] = t.scale[0];
	TransformComponent.scale.y[eid] = t.scale[1];
	TransformComponent.scale.z[eid] = t.scale[2];

	const entity = world.scene.getObjectByProperty("eid", eid);
	//@ts-ignore: the Euler's private change hook, as used by objectJoin
	entity?.rotation._onChangeCallback?.();

	emitObjectTransform(
		world,
		id,
		false,
		new THREE.Vector3(...t.position),
		new THREE.Euler(...t.rotation),
		new THREE.Vector3(...t.scale),
	);
	return true;
}

/**
 * Undo of a move.
 *
 * Keyed by network id rather than entity id: an object that is removed and
 * re-added comes back as a different entity, and a command that outlived that
 * would otherwise write into whatever entity inherited the number.
 */
export function transformCommand(
	id: string,
	before: Snapshot,
	after: Snapshot,
): Command {
	return {
		label: "Move",
		do: (world) => {
			applyTransform(world, id, after);
		},
		undo: (world) => {
			applyTransform(world, id, before);
		},
	};
}

/** Undo of a placement: take it back out; redo: put it back where it was. */
export function addObjectCommand(id: string, type: number): Command {
	// Filled in on the way out. A placement lands at the origin and the
	// player almost always moves it before thinking better of the whole
	// thing, so the position worth redoing to is the one it had at the moment
	// of the undo -- not the one it was born with.
	let placed: Snapshot | null = null;
	return {
		label: "Add",
		do: (world) => {
			if (placed !== null) {
				world.history.restore(world, id, type, placed);
			} else {
				emitObjectJoin(world, id, type);
			}
		},
		undo: (world) => {
			const eid = world.network.getObject(id)?.eid;
			if (eid !== undefined) placed = snapshotTransform(eid);
			emitObjectLeave(world, id, false);
		},
	};
}

/**
 * A command whose object only gets an id once the server has minted one.
 *
 * Parts differ from furniture here: furniture is placed by naming an
 * inventory row, so the client knows the id before it asks. A part's id does
 * not exist until the server makes one, and it is a *different* id every
 * time the part is placed -- so a command that outlives one round trip has
 * to be told the new id rather than remember the old.
 */
export type PartCommand = Command & { setId(id: string): void };

function toVector(t: Snapshot) {
	return {
		position: new THREE.Vector3(...t.position),
		rotation: new THREE.Euler(...t.rotation),
		scale: new THREE.Vector3(...t.scale),
	};
}

/** Undo of a part placement: take it back out; redo: build it again. */
export function addPartCommand(part: Part, at: Snapshot): PartCommand {
	let id: string | null = null;
	return {
		label: "Add part",
		setId: (newId) => {
			id = newId;
		},
		do: (world) => {
			const { position, rotation, scale } = toVector(at);
			id = null;
			world.build.placePart(part, position, rotation, scale, (newId) => {
				id = newId;
			});
		},
		undo: (world) => {
			if (id === null) return;
			emitObjectLeave(world, id, false);
			id = null;
		},
	};
}

/** Undo of a part removal: build it again, same description, same place. */
export function removePartCommand(
	id: string,
	part: Part,
	at: Snapshot,
): Command {
	let currentId: string | null = id;
	return {
		label: "Remove part",
		do: (world) => {
			if (currentId === null) return;
			emitObjectLeave(world, currentId, false);
			currentId = null;
		},
		undo: (world) => {
			const { position, rotation, scale } = toVector(at);
			world.build.placePart(part, position, rotation, scale, (newId) => {
				currentId = newId;
			});
		},
	};
}

/** Undo of a removal: put it back exactly where it was taken from. */
export function removeObjectCommand(
	id: string,
	type: number,
	removed: Snapshot,
): Command {
	return {
		label: "Remove",
		do: (world) => {
			emitObjectLeave(world, id, false);
		},
		undo: (world) => {
			world.history.restore(world, id, type, removed);
		},
	};
}

export function createHistory(): History {
	const undoStack: Command[] = [];
	const redoStack: Command[] = [];

	type PendingRestore = {
		id: string;
		transform: Snapshot;
		expiresAt: number;
	};
	const pending: PendingRestore[] = [];

	return {
		push(command) {
			undoStack.push(command);
			// A new action makes any redo branch unreachable -- there is no
			// longer a single future to walk forward into.
			redoStack.length = 0;
			if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
		},
		undo(world) {
			const command = undoStack.pop();
			if (command === undefined) return false;
			command.undo(world);
			redoStack.push(command);
			return true;
		},
		redo(world) {
			const command = redoStack.pop();
			if (command === undefined) return false;
			command.do(world);
			undoStack.push(command);
			return true;
		},
		clear() {
			undoStack.length = 0;
			redoStack.length = 0;
			pending.length = 0;
		},
		canUndo: () => undoStack.length > 0,
		canRedo: () => redoStack.length > 0,
		restore(world, id, type, transform) {
			emitObjectJoin(world, id, type);
			pending.push({
				id,
				transform,
				expiresAt: performance.now() + RESTORE_TIMEOUT_MS,
			});
		},
		pump(world) {
			if (pending.length === 0) return;
			const now = performance.now();
			for (let i = pending.length - 1; i >= 0; i--) {
				const restore = pending[i];
				if (applyTransform(world, restore.id, restore.transform)) {
					pending.splice(i, 1);
				} else if (now >= restore.expiresAt) {
					console.warn(
						"Gave up repositioning restored object " +
							restore.id +
							": the server never re-added it",
					);
					pending.splice(i, 1);
				}
			}
		},
		depth: () => ({ undo: undoStack.length, redo: redoStack.length }),
	};
}

/** Whether a keystroke belongs to something other than the world. */
function isTypingTarget(): boolean {
	if (ImGui.bind !== undefined && ImGui.GetCurrentContext() !== null) {
		if (ImGui.GetIO().WantCaptureKeyboard) return true;
	}
	const element = document.activeElement as HTMLElement | null;
	if (element === null) return false;
	if (element.isContentEditable) return true;
	return (
		element.tagName === "INPUT" ||
		element.tagName === "TEXTAREA" ||
		element.tagName === "SELECT"
	);
}

export function createHistorySystem(world: World) {
	world.history = createHistory();

	// On window rather than the canvas: the canvas is not focusable, so a
	// keystroke never reaches it unless something else has already declined
	// the event. The guards below hand the keystroke back to whatever is
	// actually being typed into.
	window.addEventListener("keydown", (event) => {
		if (!world.editor.enabled) return;
		if (!(event.ctrlKey || event.metaKey)) return;
		const key = event.key.toLowerCase();
		if (key !== "z" && key !== "y") return;
		if (isTypingTarget()) return;

		event.preventDefault();
		if (key === "y" || event.shiftKey) {
			world.history.redo(world);
		} else {
			world.history.undo(world);
		}
	});

	return defineSystem((world: World) => {
		world.history.pump(world);
		return world;
	});
}
