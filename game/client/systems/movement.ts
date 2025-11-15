import * as THREE from "three";

import { defineQuery, defineSystem, removeComponent } from "bitecs";
import {
	AnimationComponent,
	MoveTowardsComponent,
	TransformComponent,
} from "../components";
import { World } from "../factory/world";
import { faceLeft, faceRight, playWalking, stopWalking } from "./animation";

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
				// Calculate the 3D Movement Direction Vector
				const movementDirection = targetPosition
					.clone()
					.sub(initialPosition);
				// Ensure we're only considering the horizontal (X-Z) plane for the flip check
				movementDirection.y = 0;
				movementDirection.normalize();

				// Get the Camera's Right Vector
				const camera = world.camera;
				const cameraRight = new THREE.Vector3();
				// The .right vector is typically calculated from the cross product of the camera's up and forward.
				// Three.js provides a convenient method to get the world direction vectors.
				camera.getWorldDirection(cameraRight); // This gets the FORWARD vector
				cameraRight.cross(camera.up); // Cross Forward with Up to get Right

				// Ensure cameraRight is also only considering the horizontal plane for the check
				cameraRight.y = 0;
				cameraRight.normalize();

				// Calculate the Dot Product ---
				// A positive result means movement is aligned with the camera's Right (faceRight)
				// A negative result means movement is aligned with the camera's Left (faceLeft)
				const dotProduct = movementDirection.dot(cameraRight);
				if (dotProduct > 0.01) {
					faceRight(world, e);
				} else if (dotProduct < -0.01) {
					faceLeft(world, e);
				}

				var newPosition = new THREE.Vector3().lerpVectors(
					initialPosition,
					targetPosition,
					progress,
				);
				TransformComponent.position.x[e] = newPosition.x;
				TransformComponent.position.y[e] = newPosition.y;
				TransformComponent.position.z[e] = newPosition.z;

				playWalking(world, e);
			} else {
				removeComponent(world, MoveTowardsComponent, e);

				stopWalking(world, e);
			}
		}
		return world;
	});
}
