import { defineQuery, defineSystem } from "bitecs";
import { World } from "../factory/world";
import { SpineAvatarComponent } from "../components";

import * as spine from "@esotericsoftware/spine-threejs";

export const spineAvatarQuery = defineQuery([SpineAvatarComponent]);

export function createRenderSystem() {
	return defineSystem((world: World) => {
		const {
			time: { delta },
		} = world;
		const ents = spineAvatarQuery(world);
		for (let x = 0; x < ents.length; x++) {
			const e = ents[x];
			const obj3d = world.objects.get(e);
			for (let y = 0; y < obj3d!.children.length; y++) {
				//@ts-ignore
				let skeletonMesh: spine.SkeletonMesh = obj3d!.children[y];
				skeletonMesh.update(delta / SpineAvatarComponent.timeScale[e]);
			}
		}
		world.renderer.render(world.scene, world.camera);
		return world;
	});
}
