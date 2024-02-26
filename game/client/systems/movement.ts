import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { defineQuery, defineSystem, removeComponent } from "bitecs";
import { MoveTowardsComponent, TransformComponent } from "../components";
import { World } from "../factory/world";

export const movementQuery = defineQuery([MoveTowardsComponent]);

export function createMovementSystem(world: World) {
	const pointer = new THREE.Vector2();
	const pointerMesh = new THREE.Group();
	const raycaster = new THREE.Raycaster();

	const canvas = world.renderer.domElement;

	let INTERSECTED: THREE.Intersection | null;

	// create a "cursor" for user to click on floor to move
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

	const controls = new OrbitControls(world.camera, world.renderer.domElement);

	canvas.addEventListener("pointermove", (event) => {
		var rect = canvas.getBoundingClientRect();
		pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	});

	canvas.addEventListener("pointerdown", (event) => {
		if (INTERSECTED && event.button === 0) {
			world.network.emit("Move", {
				x: INTERSECTED.point.x,
				y: INTERSECTED.point.y,
				z: INTERSECTED.point.z,
			});
		}
	});

	return defineSystem((world: World) => {
		controls.update();

		raycaster.setFromCamera(pointer, world.camera);

		const intersects = raycaster.intersectObjects(
			world.scene.children,
			false,
		);

		if (intersects.length > 0) {
			if (!INTERSECTED || INTERSECTED.point != intersects[0].point) {
				INTERSECTED = intersects[0];
				pointerMesh.position.set(
					intersects[0].point.x - 15,
					intersects[0].point.y + 1,
					intersects[0].point.z + 10,
				);
			}
		} else {
			if (INTERSECTED) {
				// console.log("leave", INTERSECTED);
			}
			INTERSECTED = null;
		}

		const {
			time: { delta },
		} = world;
		const ents = movementQuery(world);
		for (let i = 0; i < ents.length; i++) {
			const e = ents[i];
			const speed = 1;

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
			} else {
				removeComponent(world, MoveTowardsComponent, e);
			}
		}
		return world;
	});
}
