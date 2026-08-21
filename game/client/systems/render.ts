import {
	defineQuery,
	defineSystem,
	enterQuery,
	exitQuery,
	entityExists,
	hasComponent,
	removeComponent,
	removeEntity,
} from "bitecs";
import { World } from "../factory/world";
import {
	AnimationComponent,
	AvatarComponent,
	GltfComponent,
	NameplateComponent,
	ObjectComponent,
	ObjectOutlineComponent,
	PlayerComponent,
	SpineComponent,
	SwfComponent,
} from "../components";

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutlinePass as ObjectOutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { OutlinePass as PlayerOutlinePass } from "../shaders/OutlinePass";

import { ImGui, ImGui_Impl } from "imgui-js";
import { composeSwfStreams } from "../managers/stream";

const objectLeaveQuery = exitQuery(defineQuery([ObjectComponent]));
const playerLeaveQuery = exitQuery(defineQuery([PlayerComponent]));
const avatarLeaveQuery = exitQuery(defineQuery([AvatarComponent]));
const nameplateQuery = defineQuery([NameplateComponent]);

const enterOutlinePlayerQuery = enterQuery(
	defineQuery([PlayerComponent, ObjectOutlineComponent]),
);
const exitOutlinePlayerQuery = exitQuery(
	defineQuery([PlayerComponent, ObjectOutlineComponent]),
);
const enterOutlineObjectQuery = enterQuery(
	defineQuery([ObjectComponent, ObjectOutlineComponent]),
);
const exitOutlineObjectQuery = exitQuery(
	defineQuery([ObjectComponent, ObjectOutlineComponent]),
);

export function createRenderSystem(world: World) {
	const canvas = world.renderer.domElement;
	const composer = new EffectComposer(world.renderer);

	canvas.style.imageRendering = "optimizeSpeed";

	const renderPass = new RenderPass(world.scene, world.camera);
	composer.addPass(renderPass);

	const objectOutlinePass = new ObjectOutlinePass(
		new THREE.Vector2(window.innerWidth, window.innerHeight),
		world.scene,
		world.camera,
	);
	objectOutlinePass.visibleEdgeColor.set(0x57aed1);
	objectOutlinePass.hiddenEdgeColor.set(0x57aed1);
	objectOutlinePass.overlayMaterial.blending = THREE.CustomBlending;
	composer.addPass(objectOutlinePass);

	const playerOutlinePass = new PlayerOutlinePass(
		new THREE.Vector2(window.innerWidth, window.innerHeight),
		world.scene,
		world.camera,
	);
	playerOutlinePass.visibleEdgeColor.set(0x57aed1);
	playerOutlinePass.hiddenEdgeColor.set(0x57aed1);
	playerOutlinePass.overlayMaterial.blending = THREE.CustomBlending;
	composer.addPass(playerOutlinePass);

	world.composer = composer;

	const setGameSize = () => {
		// https://threejs.org/manual/#en/responsive
		// https://stackoverflow.com/a/60506772
		const dpr = window.devicePixelRatio || 1;
		const parent = canvas.parentElement!;
		const aspect = parent.clientWidth / parent.clientHeight;

		if (world.camera instanceof THREE.PerspectiveCamera) {
			world.camera.aspect = aspect;
			world.camera.updateProjectionMatrix();
		} else if (world.camera instanceof THREE.OrthographicCamera) {
			//@ts-ignore
			const fov = world.camera.fov ?? 1000;
			world.camera.left = (-fov * aspect) / 2;
			world.camera.right = (fov * aspect) / 2;
			world.camera.top = fov / 2;
			world.camera.bottom = -fov / 2;
			world.camera.updateProjectionMatrix();
		}

		const width = Math.floor(canvas.parentElement!.clientWidth * dpr);
		const height = Math.floor(canvas.parentElement!.clientHeight * dpr);
		world.renderer.setSize(width, height, false);
		world.composer?.setSize(width, height);
		world.renderer.setViewport(0, 0, width, height);
	};

	var observer = new window.ResizeObserver(() => {
		requestAnimationFrame(setGameSize);
	});
	observer.observe(canvas.parentElement!);
	let isDragging = false;
	document.addEventListener("mousedown", (e) => {
		if ((e.target as HTMLElement).classList.contains("gutter")) {
			isDragging = true;
		}
	});

	document.addEventListener("mouseup", () => {
		if (isDragging) {
			isDragging = false;
			setGameSize();
		}
	});

	let isZooming = false;
	let zoomTimeout: number | undefined;
	document.addEventListener(
		"wheel",
		(e) => {
			if (e.ctrlKey || e.metaKey) {
				isZooming = true;
				if (zoomTimeout !== undefined) {
					clearTimeout(zoomTimeout);
				}
				zoomTimeout = window.setTimeout(() => {
					isZooming = false;
				}, 100);
			}
		},
		{ passive: true },
	);

	return defineSystem((world: World) => {
		if (isDragging || isZooming) {
			setGameSize();
		}

		// handle player nameplates
		const nameplates = nameplateQuery(world);
		for (let x = 0; x < nameplates.length; x++) {
			const ent = world.players.get(
				NameplateComponent.owner[nameplates[x]],
			);
			const player = ent?.player;
			const nameplate = ent?.nameplate;

			if (player !== undefined && nameplate !== undefined) {
				// Get the player's bounding box
				const boundingBox = new THREE.Box3().setFromObject(player);
				const playerHeight = boundingBox.max.y - boundingBox.min.y;

				// Start with the player's world position
				const nameplateWorldPos = new THREE.Vector3();
				nameplateWorldPos.setFromMatrixPosition(player.matrixWorld);

				// Offset upward by the player's height (to get to top)
				nameplateWorldPos.y += playerHeight + 0.5;

				// Project to screen space
				nameplateWorldPos.project(world.camera);

				// Convert to screen coordinates
				const canvas = world.renderer.domElement;
				const rect = canvas.getBoundingClientRect();
				const widthHalf = rect.width / 2;
				const heightHalf = rect.height / 2;

				nameplate.position.x =
					nameplateWorldPos.x * widthHalf + widthHalf + rect.left;
				nameplate.position.y =
					-nameplateWorldPos.y * heightHalf + heightHalf;

				const xOffset = nameplate.getBoundingClientRect().width / 2;
				nameplate.style.top = `${nameplate.position.y}px`;
				nameplate.style.left = `${nameplate.position.x - xOffset}px`;
			}
		}

		// handle cleanup of player entities
		const playerLeave = playerLeaveQuery(world);
		/** Players whose map entry is released once their avatar is torn down. */
		const left: number[] = [];
		for (let x = 0; x < playerLeave.length; x++) {
			const player = {
				eid: playerLeave[x],
				entity: world.players.get(playerLeave[x])?.player,
			};
			if (player.entity !== undefined) {
				// remove player entity
				world.scene.remove(player.entity);
			} else {
				console.warn("Unable to cleanup player entity", player.eid);
			}

			const nameplate = world.players.get(playerLeave[x])?.nameplate;
			if (nameplate !== undefined) {
				removeEntity(world, nameplate.eid);
				nameplate.remove();
			} else {
				console.warn("Unable to cleanup player nameplate", player.eid);
			}

			// The map entry is the last reference to the group and its
			// nameplate, so leaving it behind keeps both alive forever. It
			// cannot be dropped here though: the avatar cleanup below still
			// needs it to find the mesh it has to dispose.
			left.push(playerLeave[x]);
		}

		// handle cleanup of object entities
		const objectLeave = objectLeaveQuery(world);
		for (let x = 0; x < objectLeave.length; x++) {
			const object = {
				eid: objectLeave[x],
				entity: world.objects.get(objectLeave[x]),
			};
			if (object.entity !== undefined) {
				// remove object entity
				world.scene.remove(object.entity);
			} else {
				console.warn("Unable to cleanup object entity", object.eid);
			}
		}

		// handle cleanup of avatars
		//
		// This fires in two quite different situations, and the teardown has to
		// work for both: a player left, in which case `removeEntity` is what put
		// the entity in this query and it no longer exists; or a player changed
		// avatar, in which case the entity is alive and about to be given a new
		// one.
		//
		// Nothing here may assume the entity still exists. `removeComponent`
		// throws on a removed entity, and that throw used to abort this loop
		// before any resource was released — so every player who left leaked
		// their avatar's Ruffle player, render target and textures, and the
		// exception surfaced in main.ts's update loop as "bitECS - entity does
		// not exist in the world".
		const avatarLeave = avatarLeaveQuery(world);
		for (let x = 0; x < avatarLeave.length; x++) {
			const eid = avatarLeave[x];

			const player = world.players.get(eid)?.player;
			// this is under the assumption that the first child is the avatar
			// mesh. During a swap that is the *outgoing* one: a replacement is
			// appended after it, and is not removed until this runs.
			const avatar = player?.children[0];
			const token = avatar?.userData?.swfToken as number | undefined;

			// Release by registration, not by entity. An avatar swap gives the
			// entity a new player and render target under the same id before
			// this cleanup runs, and releasing "this entity's avatar" would
			// destroy the incoming one mid-load — which is exactly what made
			// wearing a second SWF avatar fail with a Ruffle error and no
			// avatar. Passing the outgoing mesh's token makes that a no-op;
			// the outgoing avatar was already released by `add`.
			world.swfAssetManager.remove(eid, token);

			if (player !== undefined && avatar !== undefined) {
				player.remove(avatar);
				// Only SWF billboards own their geometry and material outright.
				// glTF and Spine avatars share loader-cached resources with
				// every other instance of the same file, so disposing theirs
				// would blank out other players wearing it.
				if (token !== undefined) disposeMesh(avatar);
			}

			if (entityExists(world, eid)) {
				removeComponent(world, SpineComponent, eid);
				removeComponent(world, GltfComponent, eid);
				removeComponent(world, SwfComponent, eid);
				removeComponent(world, AnimationComponent, eid);
			}
		}

		for (const eid of left) world.players.delete(eid);

		// SWF streams render into their own targets with the world's renderer, so
		// they have to be composed before anything samples them and at a point
		// where no pass owns the renderer's state. Here is that point: after the
		// scene graph is settled for this frame, before any pass runs.
		composeSwfStreams(world);

		if (!world.composer) {
			world.renderer.render(world.scene, world.camera);
			return world;
		}

		// handle postprocessing
		{
			const enterOutlines = enterOutlinePlayerQuery(world);
			for (let i = 0; i < enterOutlines.length; i++) {
				// handle adding player outlines
				const player = world.players.get(enterOutlines[i])?.player;
				if (player === undefined) continue;
				if (
					hasComponent(world, SwfComponent, player.eid) &&
					(!world.editor.enabled || !world.editor.selectedTool)
				) {
					const outline =
						playerOutlinePass.selectedObjects.indexOf(player);
					if (outline === -1)
						playerOutlinePass.selectedObjects.push(player);
					continue;
				}
				const outline =
					playerOutlinePass.selectedObjects.indexOf(player);
				if (outline === -1)
					playerOutlinePass.selectedObjects.push(player);
			}
			const exitOutlines = exitOutlinePlayerQuery(world);
			for (let i = 0; i < exitOutlines.length; i++) {
				// handle removing player outlines
				// A player who left is already out of the map, and their entry
				// in this query is exactly that departure.
				const player = world.players.get(exitOutlines[i])?.player;
				if (player === undefined) continue;
				const outline =
					playerOutlinePass.selectedObjects.indexOf(player);
				if (outline !== -1)
					playerOutlinePass.selectedObjects.splice(outline, 1);
			}
		}
		{
			const enterOutlines = enterOutlineObjectQuery(world);
			for (let i = 0; i < enterOutlines.length; i++) {
				// handle adding object outlines
				const object = world.objects.get(enterOutlines[i]);
				if (object === undefined) continue;
				const outline =
					objectOutlinePass.selectedObjects.indexOf(object);
				if (outline === -1)
					objectOutlinePass.selectedObjects.push(object);
			}
			const exitOutlines = exitOutlineObjectQuery(world);
			for (let i = 0; i < exitOutlines.length; i++) {
				// handle removing object outlines
				const object = world.objects.get(exitOutlines[i]);
				if (object === undefined) continue;
				const outline =
					objectOutlinePass.selectedObjects.indexOf(object);
				if (outline !== -1)
					objectOutlinePass.selectedObjects.splice(outline, 1);
			}
		}

		if (ImGui.bind === undefined) {
			return world;
		}

		ImGui.End();
		ImGui.EndFrame();
		ImGui.Render();

		world.composer.render();

		ImGui_Impl.RenderDrawData(ImGui.GetDrawData());
		return world;
	});
}

/** Free a mesh's own geometry and material(s). */
function disposeMesh(object: THREE.Object3D) {
	object.traverse((child) => {
		const mesh = child as THREE.Mesh;
		if (!mesh.isMesh) return;
		mesh.geometry?.dispose();
		const material = mesh.material;
		if (Array.isArray(material)) {
			for (const entry of material) entry.dispose();
		} else {
			material?.dispose();
		}
	});
}
