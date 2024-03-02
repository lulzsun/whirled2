import { defineQuery, defineSystem, hasComponent } from "bitecs";
import { World } from "../factory/world";
import {
	GltfComponent,
	LocalPlayerComponent,
	SpineComponent,
} from "../components";

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
				if (!(mixer instanceof THREE.AnimationMixer)) continue;

				mixer.update(delta / GltfComponent.timeScale[eid]);

				if (GltfComponent.animAction[eid] === -1) continue;

				let animations = player.children[y].animations;
				let clip = animations[GltfComponent.animAction[eid]];

				if (mixer.clipAction(clip).time !== clip.duration) continue;

				// return to playing previous animation state
				GltfComponent.animAction[eid] = -1;
				clip =
					animations[GltfComponent.animState[eid]] ??
					animations.find((animation) =>
						/idle_state$/i.test(animation.name),
					) ??
					animations[0];
				mixer.stopAllAction();
				mixer.clipAction(clip).play();
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

export function playAnimation(
	world: World,
	eid: number,
	clip: string | number,
	anims: THREE.AnimationClip[],
) {
	let animName = "";
	let animIndex = 0;

	if (typeof clip === "string") {
		animName = clip;
		animIndex = anims.findIndex((anim) => anim.name === animName);
	}
	if (typeof clip === "number") {
		animIndex = clip;
		animName = anims[animIndex].name;
	}
	if (animIndex === -1) return;

	const player = world.players.get(eid)?.player;
	if (player === undefined) return;

	//@ts-ignore
	const mixer: THREE.AnimationMixer = player.children[0].mixer;

	mixer.stopAllAction();

	if (/_action$/i.test(animName)) {
		GltfComponent.animAction[eid] = animIndex;
		const clip =
			anims[GltfComponent.animAction[eid]] ??
			anims.find((animation) => /_action$/i.test(animation.name)) ??
			anims[0];
		const animation = mixer.clipAction(clip);

		animation.clampWhenFinished = true;
		animation.loop = THREE.LoopOnce;
		animation.play();

		if (hasComponent(world, LocalPlayerComponent, eid))
			world.network.emit("Anim", { action: animIndex });
	} else {
		GltfComponent.animState[eid] = animIndex;
		const clip =
			anims[GltfComponent.animState[eid]] ??
			anims.find((animation) => /idle_state$/i.test(animation.name)) ??
			anims[0];
		const animation = mixer.clipAction(clip);

		// animation.clampWhenFinished = true;
		// animation.loop = THREE.LoopOnce;
		animation.play();

		if (hasComponent(world, LocalPlayerComponent, eid))
			world.network.emit("Anim", { state: animIndex });
	}

	console.log("Playing animation:", eid, animName, anims[animIndex], anims);
}
