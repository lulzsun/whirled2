import { defineQuery, defineSystem, exitQuery, removeEntity } from "bitecs";
import { World } from "../factory/world";
import {
	NameplateComponent,
	PlayerComponent,
	SpineComponent,
} from "../components";

import * as spine from "@esotericsoftware/spine-threejs";

export const playerLeaveQuery = exitQuery(defineQuery([PlayerComponent]));
export const spineAvatarQuery = defineQuery([SpineComponent]);
export const nameplateQuery = defineQuery([NameplateComponent]);

export function createRenderSystem() {
	return defineSystem((world: World) => {
		const {
			time: { delta },
		} = world;
		// handle specific spine avatar rendering
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
				let obj3d = player.children[y];
				if (obj3d instanceof spine.SkeletonMesh) {
					obj3d.update(delta / SpineComponent.timeScale[eid]);
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
