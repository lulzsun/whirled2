import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

import {
	addComponent,
	defineQuery,
	defineSystem,
	enterQuery,
	entityExists,
	hasComponent,
	removeComponent,
} from "bitecs";
import {
	AvatarComponent,
	LocalPlayerComponent,
	ObjectOutlineComponent,
	PlayerComponent,
	TransformComponent,
} from "../components";
import { World } from "../factory/world";

import { createContextMenuUI } from "../ui/contextmenu";
import { createPlayerContextMenuUI } from "../ui/playercontextmenu";
import { API_URL } from "../constants";

import { emitPlayerMove } from "./network";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const localPlayerQuery = defineQuery([LocalPlayerComponent]);
const enterLocalPlayerQuery = enterQuery(
	defineQuery([LocalPlayerComponent, AvatarComponent]),
);

export function createControlSystem(world: World) {
	const pointer = new THREE.Vector2();
	const pointerMesh = new THREE.Group();
	const raycaster = new THREE.Raycaster();

	world.controls = new OrbitControls(world.camera, world.renderer.domElement);

	const canvas = world.renderer.domElement;

	let currIntersect: { point: THREE.Vector3; root: THREE.Object3D } | null;

	// create a "cursor" for user to click on floor to move
	createPointer(world, pointerMesh);
	const contextMenu = createContextMenuUI();
	world.renderer.domElement.parentElement!.appendChild(contextMenu);

	canvas.addEventListener("pointermove", (event) => {
		const rect = canvas.getBoundingClientRect();
		pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	});

	canvas.addEventListener("pointerdown", (event) => {
		if (currIntersect && pointerMesh.visible && event.button === 0) {
			contextMenu.close();

			const queryPlayer = world.players.get(localPlayerQuery(world)[0]);
			if (queryPlayer === undefined) return;

			const localPlayer = queryPlayer.player;
			localPlayer.lookAt(
				new THREE.Vector3(
					currIntersect.point.x,
					localPlayer.position.y,
					currIntersect.point.z,
				),
			);
			const rotation = localPlayer.rotation;

			emitPlayerMove(world, currIntersect.point, rotation);
		} else if (
			currIntersect &&
			!pointerMesh.visible &&
			event.button !== 0
		) {
			//@ts-ignore
			const eid = currIntersect.root.eid ?? -1;
			// open up right click context menu (player)
			if (hasComponent(world, PlayerComponent, eid)) {
				contextMenu.setItem(createPlayerContextMenuUI(world, eid));
				contextMenu.open(event);
			} else {
				contextMenu.close();
			}
		} else {
			contextMenu.close();
		}
	});

	return defineSystem((world: World) => {
		world.controls.update();
		raycaster.setFromCamera(pointer, world.camera);

		const intersects = raycaster.intersectObjects(
			world.scene.children.filter((x) => {
				//@ts-ignore: only make certain objects interactive
				const eid = x.eid;
				if (eid !== undefined) {
					return hasComponent(world, TransformComponent, eid);
				}
				return false;
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

		if (
			intersects.length > 0 &&
			(!world.editor.enabled || !world.editor.selectedTool)
		) {
			let i = 0;
			let root = intersects[i].object;
			while (root.type === "GridHelper") {
				i++;
				if (i > intersects.length - 1) break;
				root = intersects[i].object;
			}
			do {
				if (intersects[i] === undefined) break;
				if (root.parent != null && root.parent.type !== "Scene") {
					root = root.parent;
					continue;
				}

				cleanupIntersect(currIntersect);
				//@ts-ignore
				const eid = root.eid;

				// attach outline component on player hover
				if (
					eid !== undefined &&
					hasComponent(world, PlayerComponent, eid)
				) {
					currIntersect = { point: intersects[i].point, root };
					if (!hasComponent(world, ObjectOutlineComponent, eid))
						addComponent(world, ObjectOutlineComponent, eid);
					pointerMesh.visible = false;
					break;
				}
				currIntersect = { point: intersects[i].point, root };
				pointerMesh.visible = true;
				pointerMesh.position.set(
					currIntersect.point.x,
					currIntersect.point.y + 0.01,
					currIntersect.point.z,
				);
				break;
			} while (true);
		} else {
			if (currIntersect) {
				cleanupIntersect(currIntersect);
			}
			currIntersect = null;
			pointerMesh.visible = false;
		}

		const enterPlayer = enterLocalPlayerQuery(world)[0];
		if (enterPlayer > 0) {
			const player = world.players.get(enterPlayer)!.player;
			console.log(player, enterPlayer);

			const box = new THREE.Box3().setFromObject(player);
			const center = box.getCenter(new THREE.Vector3());
			const size = box.getSize(new THREE.Vector3());

			const maxDim = Math.max(size.x, size.y, size.z);

			// Set max/min distance for controls
			world.controls.maxDistance = maxDim * 10;
			world.controls.minDistance = maxDim * 0.1;

			// Check if we need to zoom out (camera is too close)
			const currentDistance = world.camera.position.distanceTo(center);
			//@ts-ignore
			const fov = (world.camera.fov ?? 1000) * (Math.PI / 180);
			const requiredDistance =
				Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;

			// Only adjust camera if current distance is less than required
			if (currentDistance < requiredDistance) {
				world.controls.target.copy(center);
				world.camera.position.set(
					world.camera.position.x,
					world.camera.position.y,
					center.z + maxDim,
				);
				world.controls.update();
			}
		}

		return world;
	});
}

const createPointer = (world: World, pointerMesh: THREE.Group) => {
	const fileLoader = new SVGLoader();
	fileLoader.load(
		`${API_URL}/static/assets/avatars/walkable.svg`,
		function (data) {
			pointerMesh.position.set(0, 0.01, 0);
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
