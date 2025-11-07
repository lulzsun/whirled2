import {
	defineQuery,
	defineSystem,
	enterQuery,
	exitQuery,
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
import { CopyShader } from "three/examples/jsm/shaders/CopyShader.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";

import { ImGui, ImGui_Impl } from "imgui-js";

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

	const outlinePass = new OutlinePass(
		new THREE.Vector2(window.innerWidth, window.innerHeight),
		world.scene,
		world.camera,
	);
	outlinePass.visibleEdgeColor.set(0x57aed1);
	outlinePass.hiddenEdgeColor.set(0x57aed1);
	outlinePass.overlayMaterial.blending = THREE.CustomBlending;
	composer.addPass(outlinePass);

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
		const avatarLeave = avatarLeaveQuery(world);
		for (let x = 0; x < avatarLeave.length; x++) {
			const eid = avatarLeave[x];
			const player = world.players.get(eid)?.player;

			removeComponent(world, SpineComponent, eid);
			removeComponent(world, GltfComponent, eid);
			removeComponent(world, SwfComponent, eid);
			removeComponent(world, AnimationComponent, eid);

			if (player === undefined) {
				continue;
			}

			// this is under the assumption that the first child is the avatar mesh
			const avatar = player.children[0];
			player.remove(avatar);
		}

		if (!world.composer) {
			world.renderer.render(world.scene, world.camera);
			return world;
		}

		// handle postprocessing
		{
			const enterOutlines = enterOutlinePlayerQuery(world);
			for (let i = 0; i < enterOutlines.length; i++) {
				// handle adding player outlines
				const player = world.players.get(enterOutlines[i])!.player;
				const outline = outlinePass.selectedObjects.indexOf(player);
				if (outline === -1) outlinePass.selectedObjects.push(player);
			}
			const exitOutlines = exitOutlinePlayerQuery(world);
			for (let i = 0; i < exitOutlines.length; i++) {
				// handle removing player outlines
				const player = world.players.get(exitOutlines[i])!.player;
				const outline = outlinePass.selectedObjects.indexOf(player);
				if (outline !== -1)
					outlinePass.selectedObjects.splice(outline, 1);
			}
		}
		{
			const enterOutlines = enterOutlineObjectQuery(world);
			for (let i = 0; i < enterOutlines.length; i++) {
				// handle adding object outlines
				const object = world.objects.get(enterOutlines[i])!;
				const outline = outlinePass.selectedObjects.indexOf(object);
				if (outline === -1) outlinePass.selectedObjects.push(object);
			}
			const exitOutlines = exitOutlineObjectQuery(world);
			for (let i = 0; i < exitOutlines.length; i++) {
				// handle adding object outlines
				const object = world.objects.get(exitOutlines[i])!;
				const outline = outlinePass.selectedObjects.indexOf(object);
				if (outline !== -1)
					outlinePass.selectedObjects.splice(outline, 1);
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
