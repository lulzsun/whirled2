import { defineQuery, defineSystem, exitQuery, removeEntity } from "bitecs";
import { World } from "../factory/world";
import {
	GltfComponent,
	NameplateComponent,
	PlayerComponent,
	SpineComponent,
} from "../components";

import * as THREE from "three";
import * as spine from "@esotericsoftware/spine-threejs";

const playerLeaveQuery = exitQuery(defineQuery([PlayerComponent]));
const spineAvatarQuery = defineQuery([SpineComponent]);
const gltfAvatarQuery = defineQuery([GltfComponent]);
const nameplateQuery = defineQuery([NameplateComponent]);

export function createRenderSystem() {
	return defineSystem((world: World) => {
		const {
			time: { delta },
		} = world;

		// handle spine avatar rendering
		const spineAvatars = spineAvatarQuery(world);
		for (let x = 0; x < spineAvatars.length; x++) {
			const eid = spineAvatars[x];
			const player = world.players.get(eid)?.player;

			if (!player) continue;

			// always facing camera (billboard effect)
			player.quaternion.set(
				player.quaternion.x,
				world.camera.quaternion.y,
				player.quaternion.z,
				world.camera.quaternion.w,
			);
			for (let y = 0; y < player.children.length; y++) {
				let mesh = player.children[y];
				if (mesh instanceof spine.SkeletonMesh) {
					mesh.update(delta / SpineComponent.timeScale[eid]);
				}
			}
		}

		// handle gltf avatar rendering
		const gltfAvatars = gltfAvatarQuery(world);
		for (let x = 0; x < gltfAvatars.length; x++) {
			const eid = gltfAvatars[x];
			const player = world.players.get(eid)?.player;

			if (!player) continue;

			for (let y = 0; y < player.children.length; y++) {
				//@ts-ignore: createPlayer() adds a mixer component to the model
				let mixer = player.children[y].mixer;
				if (mixer instanceof THREE.AnimationMixer) {
					mixer.update(delta / GltfComponent.timeScale[eid]);
				}
			}
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
				nameplate.position.setFromMatrixPosition(player.matrixWorld);
				nameplate.position.project(world.camera);

				const canvas = world.renderer.domElement;
				const rect = canvas.getBoundingClientRect();
				const widthHalf = rect.width / 2;
				const heightHalf = rect.height / 2;

				nameplate.position.x =
					nameplate.position.x * widthHalf + widthHalf + rect.left;
				nameplate.position.y =
					-nameplate.position.y * heightHalf + heightHalf;

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

		world.renderer.render(world.scene, world.camera);
		return world;
	});
}
