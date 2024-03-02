import * as THREE from "three";

import { defineQuery, defineSystem, removeComponent } from "bitecs";
import {
	GltfComponent,
	MoveTowardsComponent,
	TransformComponent,
} from "../components";
import { World } from "../factory/world";

const movementQuery = defineQuery([MoveTowardsComponent]);

export function createMovementSystem() {
	return defineSystem((world: World) => {
		const {
			time: { delta },
		} = world;

		const ents = movementQuery(world);
		for (let i = 0; i < ents.length; i++) {
			const e = ents[i];
			const player = world.players.get(e)!.player;

			if (player === undefined) continue;

			//@ts-ignore
			const mixer: THREE.AnimationMixer = player.children[0].mixer;
			const animations = player.children[0].animations;
			const speed = 0.35;

			const initialPosition = new THREE.Vector3(
				TransformComponent.position.x[e],
				TransformComponent.position.y[e],
				TransformComponent.position.z[e],
			);

			const targetPosition = new THREE.Vector3(
				MoveTowardsComponent.x[e],
				MoveTowardsComponent.y[e],
				MoveTowardsComponent.z[e],
			);

			// Create a rotation matrix
			const matrix = new THREE.Matrix4();
			matrix.lookAt(
				new THREE.Vector3(
					targetPosition.x,
					initialPosition.y,
					targetPosition.z,
				),
				new THREE.Vector3(
					initialPosition.x,
					initialPosition.y,
					initialPosition.z,
				),
				player.up,
			);

			// Extract rotation components from the rotation matrix
			const quaternion = new THREE.Quaternion();
			quaternion.setFromRotationMatrix(matrix);
			const euler = new THREE.Euler();
			euler.setFromQuaternion(quaternion);

			// Apply the (lookAt) rotation
			TransformComponent.rotation.x[e] = euler.x;
			TransformComponent.rotation.y[e] = euler.y;
			TransformComponent.rotation.z[e] = euler.z;
			player.rotation._onChangeCallback();

			// Calculate distance towards the target
			var distance = initialPosition.distanceTo(targetPosition);

			var duration = distance / speed;
			var progress = delta / duration;
			if (progress < 1) {
				var newPosition = new THREE.Vector3().lerpVectors(
					initialPosition,
					targetPosition,
					progress,
				);
				TransformComponent.position.x[e] = newPosition.x;
				TransformComponent.position.y[e] = newPosition.y;
				TransformComponent.position.z[e] = newPosition.z;

				// Play default walking animation
				const clip =
					animations.find((animation) =>
						/walking_state$|walk_state$/i.test(animation.name),
					) ?? animations[0];
				mixer.clipAction(clip).play();
			} else {
				removeComponent(world, MoveTowardsComponent, e);

				// Play default state animation
				const clip =
					animations[GltfComponent.animState[e]] ??
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
