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
			const eid = ents[x];
			const entity = world.objects.get(eid);
			for (let y = 0; y < entity!.children.length; y++) {
				let obj3d = entity!.children[y];
				if (obj3d instanceof spine.SkeletonMesh) {
					obj3d.update(delta / SpineAvatarComponent.timeScale[eid]);
				}
			}
		}
		world.renderer.render(world.scene, world.camera);
		return world;
	});
}
