import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
	addComponent,
	defineQuery,
	defineSystem,
	entityExists,
	hasComponent,
	removeComponent,
} from "bitecs";
import { LocalPlayerComponent, ObjectOutlineComponent } from "../components";
import { World } from "../factory/world";

import { createContextMenuUI } from "../ui/contextmenu";
import { createPlayerContextMenuUI } from "../ui/playercontextmenu";
import { API_URL } from "../constants";

import { ImGui } from "imgui-js";
import { NetworkEvent } from "./network";

const localPlayerQuery = defineQuery([LocalPlayerComponent]);

export function createControlSystem(world: World) {
	const pointer = new THREE.Vector2();
	const pointerMesh = new THREE.Group();
	const raycaster = new THREE.Raycaster();

	const canvas = world.renderer.domElement;

	let currIntersect: { point: THREE.Vector3; root: THREE.Object3D } | null;

	// create a "cursor" for user to click on floor to move
	createPointer(world, pointerMesh);
	const contextMenu = createContextMenuUI();
	world.renderer.domElement.parentElement!.appendChild(contextMenu);

	const controls = new OrbitControls(world.camera, world.renderer.domElement);

	canvas.addEventListener("pointermove", (event) => {
		if (ImGui.GetCurrentContext() !== null)
			controls.enabled = !ImGui.GetIO().WantCaptureMouse;

		const rect = canvas.getBoundingClientRect();
		pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	});

	canvas.addEventListener("pointerdown", (event) => {
		if (currIntersect && pointerMesh.visible && event.button === 0) {
			contextMenu.close();

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

			world.network.emit(NetworkEvent.PlayerMove, {
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
		} else if (
			currIntersect &&
			!pointerMesh.visible &&
			event.button !== 0
		) {
			//@ts-ignore
			const eid = currIntersect.root.eid ?? -1;
			// open up right click context menu (player)
			contextMenu.setItem(createPlayerContextMenuUI(world, eid));
			contextMenu.open(event);
		} else {
			contextMenu.close();
		}
	});

	return defineSystem((world: World) => {
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
				if (eid !== undefined && entityExists(world, eid)) {
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
				cleanupIntersect(currIntersect);
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
				cleanupIntersect(currIntersect);
			}
			currIntersect = null;
			pointerMesh.visible = false;
		}
		return world;
	});
}

const createPointer = (world: World, pointerMesh: THREE.Group) => {
	const fileLoader = new SVGLoader();
	fileLoader.load(
		`${API_URL}/static/assets/avatar/walkable.svg`,
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
