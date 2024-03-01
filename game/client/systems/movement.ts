import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
	addComponent,
	defineQuery,
	defineSystem,
	hasComponent,
	removeComponent,
} from "bitecs";
import {
	LocalPlayerComponent,
	MoveTowardsComponent,
	ObjectOutlineComponent,
	TransformComponent,
} from "../components";
import { World } from "../factory/world";

const movementQuery = defineQuery([MoveTowardsComponent]);
const localPlayerQuery = defineQuery([LocalPlayerComponent]);

export function createMovementSystem(world: World) {
	const pointer = new THREE.Vector2();
	const pointerMesh = new THREE.Group();
	const raycaster = new THREE.Raycaster();

	const canvas = world.renderer.domElement;

	let currIntersect: { point: THREE.Vector3; root: THREE.Object3D } | null;

	// create a "cursor" for user to click on floor to move
	createPointer(world, pointerMesh);

	const controls = new OrbitControls(world.camera, world.renderer.domElement);

	canvas.addEventListener("pointermove", (event) => {
		var rect = canvas.getBoundingClientRect();
		pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	});

	canvas.addEventListener("pointerdown", (event) => {
		if (currIntersect && pointerMesh.visible && event.button === 0) {
			const localPlayer = world.players.get(
				localPlayerQuery(world)[0],
			)!.player;
			localPlayer.lookAt(
				new THREE.Vector3(
					currIntersect.point.x,
					localPlayer.position.y,
					currIntersect.point.z,
				),
			);
			const rotation = localPlayer.rotation;

			world.network.emit("Move", {
				position: {
					x: currIntersect.point.x,
					y: currIntersect.point.y,
					z: currIntersect.point.z,
				},
				rotation: {
					x: rotation.x,
					y: rotation.y,
					z: rotation.z,
					w: 0,
				},
			});
		}
	});

	return defineSystem((world: World) => {
		const {
			time: { delta },
		} = world;

		controls.update();
		raycaster.setFromCamera(pointer, world.camera);

		const intersects = raycaster.intersectObjects(
			world.scene.children.filter((x) => {
				//@ts-ignore: ignore player objects
				// const eid = x.eid;
				// if (eid !== undefined) {
				// 	return !world.players.has(eid);
				// }
				return true;
			}),
			true,
		);

		const cleanupIntersect = (
			intersect: { point: THREE.Vector3; root: THREE.Object3D } | null,
		) => {
			if (intersect) {
				//@ts-ignore
				const eid = intersect.root.eid;
				if (eid !== undefined) {
					removeComponent(world, ObjectOutlineComponent, eid);
				}
			}
		};

		if (intersects.length > 0) {
			for (let i = 0; i < intersects.length; i++) {
				let root = intersects[i].object;
				while (root.parent != null && root.parent.type !== "Scene") {
					root = root.parent;
				}
				if (root.id === pointerMesh.id) {
					continue;
				}
				//@ts-ignore
				const eid = root.eid;
				if (eid !== undefined) {
					// intersecting an ecs entity, probably a player
					currIntersect = { point: intersects[i].point, root };
					if (!hasComponent(world, ObjectOutlineComponent, eid))
						addComponent(world, ObjectOutlineComponent, eid);
					pointerMesh.visible = false;
					break;
				}
				cleanupIntersect(currIntersect);
				currIntersect = { point: intersects[i].point, root };
				pointerMesh.visible = true;
				pointerMesh.position.set(
					currIntersect.point.x - 15,
					currIntersect.point.y + 1,
					currIntersect.point.z + 10,
				);
			}
		} else {
			if (currIntersect) {
				console.log("leave", currIntersect.root);
				cleanupIntersect(currIntersect);
			}
			currIntersect = null;
			pointerMesh.visible = false;
		}

		const ents = movementQuery(world);
		for (let i = 0; i < ents.length; i++) {
			const e = ents[i];
			const player = world.players.get(e)!.player;
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
						/walking$|walk$/.test(animation.name.toLowerCase()),
					) ?? animations[0];
				mixer.clipAction(clip).play();
			} else {
				removeComponent(world, MoveTowardsComponent, e);

				// Play default idle animation
				const clip =
					animations.find((animation) =>
						/idle$/.test(animation.name.toLowerCase()),
					) ?? animations[0];
				mixer.stopAllAction();
				mixer.clipAction(clip).play();
			}
		}
		return world;
	});
}

const createPointer = (world: World, pointerMesh: THREE.Group) => {
	const fileLoader = new SVGLoader();
	fileLoader.load(
		"http://127.0.0.1:42069/static/assets/walkable.svg",
		function (data) {
			pointerMesh.scale.multiplyScalar(1);
			pointerMesh.position.set(0, 1, 0);
			pointerMesh.rotation.x = (Math.PI / 180) * -90;

			let renderOrder = 0;

			for (const path of data.paths) {
				const fillColor = path.userData!.style.fill;

				if (fillColor !== undefined && fillColor !== "none") {
					const material = new THREE.MeshBasicMaterial({
						color: new THREE.Color().setStyle(fillColor),
						opacity: path.userData!.style.fillOpacity,
						transparent: true,
						side: THREE.DoubleSide,
						depthWrite: false,
						wireframe: false,
					});

					const shapes = SVGLoader.createShapes(path);

					for (const shape of shapes) {
						const geometry = new THREE.ShapeGeometry(shape);
						const mesh = new THREE.Mesh(geometry, material);
						mesh.renderOrder = renderOrder++;

						pointerMesh.add(mesh);
					}
				}

				const strokeColor = path.userData!.style.stroke;

				if (strokeColor !== undefined && strokeColor !== "none") {
					const material = new THREE.MeshBasicMaterial({
						color: new THREE.Color().setStyle(strokeColor),
						opacity: path.userData!.style.strokeOpacity,
						transparent: true,
						side: THREE.DoubleSide,
						depthWrite: false,
						wireframe: false,
					});

					for (const subPath of path.subPaths) {
						const geometry = SVGLoader.pointsToStroke(
							subPath.getPoints(),
							path.userData!.style,
						);

						if (geometry) {
							const mesh = new THREE.Mesh(geometry, material);
							mesh.renderOrder = renderOrder++;

							pointerMesh.add(mesh);
						}
					}
				}
			}

			world.scene.add(pointerMesh);
		},
	);
};
