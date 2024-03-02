import { defineQuery, defineSystem } from "bitecs";
import { World } from "../factory/world";
import { GltfComponent, SpineComponent } from "../components";

import * as THREE from "three";
import * as spine from "@esotericsoftware/spine-threejs";

const spineAvatarQuery = defineQuery([SpineComponent]);
const gltfAvatarQuery = defineQuery([GltfComponent]);

export function createAnimationSystem() {
	return defineSystem((world: World) => {
		const {
			time: { delta },
		} = world;

		// handle spine avatar animations
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

		// handle gltf avatar animations
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
		return world;
	});
}

export function getStateNames(
	anims: THREE.AnimationClip[] | undefined,
): string[] {
	if (anims === undefined) return [];

	let result: string[] = [];

	anims.forEach((anim) => {
		// if animation name has suffix "_state", it is a state
		if (/_state$/i.test(anim.name)) {
			result.push(anim.name);
		}
	});

	return result;
}

export function getActionNames(
	anims: THREE.AnimationClip[] | undefined,
): string[] {
	if (anims === undefined) return [];

	let result: string[] = [];

	anims.forEach((anim) => {
		// if animation name has suffix "_action", it is an action
		if (/_action$/i.test(anim.name)) {
			result.push(anim.name);
		}
	});

	return result;
}
