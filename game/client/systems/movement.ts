import * as THREE from "three";

import { defineQuery, defineSystem, removeComponent } from "bitecs";
import {
	AnimationComponent,
	MoveTowardsComponent,
	TransformComponent,
} from "../components";
import { World } from "../factory/world";
import { playAnimation } from "./animation";

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
			const speed = 0.01;

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
				playAnimation(
					world,
					e,
					/^state_walking|^state_walk|^walking_|^walk_/i,
				);
			} else {
				removeComponent(world, MoveTowardsComponent, e);

				// Play default state animation
				playAnimation(world, e, AnimationComponent.prevAnimState[e]);
			}
		}
		return world;
	});
}
