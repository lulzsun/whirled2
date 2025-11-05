import { defineQuery, defineSystem, hasComponent } from "bitecs";
import { World } from "../factory/world";
import {
	AnimationComponent,
	GltfComponent,
	LocalPlayerComponent,
	PlayerComponent,
	SpineComponent,
	SwfComponent,
} from "../components";

import * as THREE from "three";
import * as spine from "@esotericsoftware/spine-threejs";
import { NetworkEvent } from "./network";
import { EffectComposer } from "three/examples/jsm/Addons.js";
import { Nameplate } from "../factory/nameplate";
import { Object } from "../factory/object";
import { Player } from "../factory/player";
import { Editor } from "./editor";

const spineAvatarQuery = defineQuery([SpineComponent, PlayerComponent]);
const gltfAvatarQuery = defineQuery([GltfComponent, PlayerComponent]);
const swfAvatarQuery = defineQuery([SwfComponent, PlayerComponent]);

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
					mesh.update(delta / AnimationComponent.timeScale[eid]);
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

				mixer.update(delta / AnimationComponent.timeScale[eid]);

				if (AnimationComponent.animAction[eid] === -1) continue;

				let animations = player.children[y].animations;
				let clip = animations[AnimationComponent.animAction[eid]];

				if (mixer.clipAction(clip).time !== clip.duration) continue;

				// return to playing previous animation state
				AnimationComponent.animAction[eid] = -1;
				clip =
					animations[AnimationComponent.animState[eid]] ??
					animations.find((animation) =>
						/^state_idle/i.test(animation.name),
					) ??
					animations[0];
				mixer.stopAllAction();
				mixer.clipAction(clip).play();
			}
		}

		// handle swf avatar animations
		const swfAvatars = swfAvatarQuery(world);
		for (let x = 0; x < swfAvatars.length; x++) {
			const eid = swfAvatars[x];
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
				const material: THREE.MeshBasicMaterial =
					//@ts-ignore
					player.children[y]?.material?.map;
				if (material === undefined) continue;
				material.needsUpdate = true;
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
		// if animation name has prefix "state_" or no prefixes at all, it is a state
		if (
			/^state_/i.test(anim.name) ||
			/^(?!action_|state_).*/i.test(anim.name)
		) {
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
		// if animation name has suffix "action_", it is an action
		if (/^action_/i.test(anim.name)) {
			result.push(anim.name);
		}
	});

	return result;
}

export function playAnimation(
	world: World,
	eid: number,
	clip: string | RegExp | number,
) {
	const player = world.players.get(eid)?.player;
	if (player === undefined) return;
	if (player.children[0] === undefined) return;
	const anims = player.children[0].animations;
	if (anims.length <= 0) return;

	let animName = "";
	let animIndex = 0;

	if (typeof clip === "string") {
		animIndex = anims.findIndex((anim) => anim.name === clip);
	} else if (clip instanceof RegExp) {
		animIndex = anims.findIndex((animation) => clip.test(animation.name));
	} else if (typeof clip === "number") {
		animIndex = clip;
	}
	if (animIndex === -1 || animIndex === AnimationComponent.animState[eid])
		return;

	animName = anims[animIndex].name;

	if (hasComponent(world, GltfComponent, eid)) {
		playGltfAnimation(world, player, anims, animName, animIndex);
	} else if (hasComponent(world, SwfComponent, eid)) {
		playSwfAnimation(world, player, anims, animName, animIndex);
	}

	console.log("Playing animation:", eid, animName, anims[animIndex], anims);
}

function playGltfAnimation(
	world: World,
	player: Player,
	anims: THREE.AnimationClip[],
	name: string,
	index: number,
) {
	//@ts-ignore
	const mixer: THREE.AnimationMixer = player.children[0].mixer;

	mixer.stopAllAction();
	if (/^action_/i.test(name)) {
		AnimationComponent.animAction[player.eid] = index;
		const clip =
			anims[AnimationComponent.animAction[player.eid]] ??
			anims.find((animation: { name: string }) =>
				/^action_/i.test(animation.name),
			) ??
			anims[0];
		const animation = mixer.clipAction(clip);

		animation.clampWhenFinished = true;
		animation.loop = THREE.LoopOnce;
		animation.play();

		if (hasComponent(world, LocalPlayerComponent, player.eid))
			world.network.emit(NetworkEvent.PlayerAnim, { action: index });
	} else {
		AnimationComponent.prevAnimState[player.eid] =
			AnimationComponent.animState[player.eid];
		AnimationComponent.animState[player.eid] = index;
		const clip =
			anims[AnimationComponent.animState[player.eid]] ??
			anims.find((animation: { name: string }) =>
				/^state_idle/i.test(animation.name),
			) ??
			anims[0];
		const animation = mixer.clipAction(clip);

		// animation.clampWhenFinished = true;
		// animation.loop = THREE.LoopOnce;
		animation.play();

		if (hasComponent(world, LocalPlayerComponent, player.eid))
			world.network.emit(NetworkEvent.PlayerAnim, { state: index });
	}
}

function playSwfAnimation(
	world: World,
	player: Player,
	anims: THREE.AnimationClip[],
	name: string,
	index: number,
) {
	//@ts-ignore
	const rufflePlayer = player.children[0].ruffle;
	//@ts-ignore
	const frame = anims[index].frame;

	if (/^action_/i.test(name)) {
		AnimationComponent.animAction[player.eid] = index;

		rufflePlayer.GotoFrame(frame);

		if (hasComponent(world, LocalPlayerComponent, player.eid))
			world.network.emit(NetworkEvent.PlayerAnim, {
				action: index,
			});
	} else {
		AnimationComponent.prevAnimState[player.eid] =
			AnimationComponent.animState[player.eid];
		AnimationComponent.animState[player.eid] = index;

		rufflePlayer.GotoFrame(frame);

		if (hasComponent(world, LocalPlayerComponent, player.eid))
			world.network.emit(NetworkEvent.PlayerAnim, {
				state: index,
			});
	}
}
