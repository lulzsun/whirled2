import { defineQuery, defineSystem, exitQuery } from "bitecs";
import { World } from "../factory/world";
import { PlayerComponent, SpineComponent } from "../components";

import * as spine from "@esotericsoftware/spine-threejs";

export const playerLeaveQuery = exitQuery(defineQuery([PlayerComponent]));
export const spineAvatarQuery = defineQuery([SpineComponent]);

export function createRenderSystem() {
	return defineSystem((world: World) => {
		const {
			time: { delta },
		} = world;
		// handle specific spine avatar rendering
		const spineAvatars = spineAvatarQuery(world);
		for (let x = 0; x < spineAvatars.length; x++) {
			const eid = spineAvatars[x];
			const entity = world.objects.get(eid);
			for (let y = 0; y < entity!.children.length; y++) {
				let obj3d = entity!.children[y];
				if (obj3d instanceof spine.SkeletonMesh) {
					obj3d.update(delta / SpineComponent.timeScale[eid]);
				}
			}
		}
		// handle cleanup of player entities
		const playerLeave = playerLeaveQuery(world);
		for (let x = 0; x < playerLeave.length; x++) {
			const eid = playerLeave[x];
			const entity = world.objects.get(eid);
			if (entity !== undefined) {
				world.scene.remove(entity);
			} else {
				console.warn("Unable to cleanup player entity", eid);
			}
		}
		world.renderer.render(world.scene, world.camera);
		return world;
	});
}
