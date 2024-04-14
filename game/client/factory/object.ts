import { addComponent, addEntity } from "bitecs";
import {
	GltfComponent,
	ObjectComponent,
	TransformComponent,
} from "../components";
import { World } from "./world";

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { API_URL } from "../constants";

export type Object = THREE.Group & { eid: number };

export const createObject = (
	world: World,
	name: string = "Unnamed",
	fileUrl: string | undefined = undefined,
	initialScale: number = 1,
	group: THREE.Group = new THREE.Group(),
): Object => {
	const eid = addEntity(world);

	addComponent(world, ObjectComponent, eid);
	addComponent(world, TransformComponent, eid);

	TransformComponent.scale.x[eid] = 1;
	TransformComponent.scale.y[eid] = 1;
	TransformComponent.scale.z[eid] = 1;

	let entity = Object.assign(group, { eid });
	entity.name = `${name} (Object)`;

	// position
	Object.defineProperty(entity.position, "eid", { get: () => eid });
	Object.defineProperty(entity.position, "store", {
		get: () => TransformComponent.position,
	});

	Object.defineProperty(entity.position, "x", {
		get() {
			return this.store.x[this.eid];
		},
		set(n) {
			this.store.x[this.eid] = n;
		},
	});
	Object.defineProperty(entity.position, "y", {
		get() {
			return this.store.y[this.eid];
		},
		set(n) {
			this.store.y[this.eid] = n;
		},
	});
	Object.defineProperty(entity.position, "z", {
		get() {
			return this.store.z[this.eid];
		},
		set(n) {
			this.store.z[this.eid] = n;
		},
	});

	// rotation
	Object.defineProperty(entity.rotation, "eid", { get: () => eid });
	Object.defineProperty(entity.rotation, "store", {
		get: () => TransformComponent.rotation,
	});

	Object.defineProperty(entity.rotation, "_x", {
		get() {
			return this.store.x[this.eid];
		},
		set(n) {
			this.store.x[this.eid] = n;
		},
	});
	Object.defineProperty(entity.rotation, "_y", {
		get() {
			return this.store.y[this.eid];
		},
		set(n) {
			this.store.y[this.eid] = n;
		},
	});
	Object.defineProperty(entity.rotation, "_z", {
		get() {
			return this.store.z[this.eid];
		},
		set(n) {
			this.store.z[this.eid] = n;
		},
	});

	// scale
	Object.defineProperty(entity.scale, "eid", { get: () => eid });
	Object.defineProperty(entity.scale, "store", {
		get: () => TransformComponent.scale,
	});

	Object.defineProperty(entity.scale, "x", {
		get() {
			return this.store.x[this.eid];
		},
		set(n) {
			this.store.x[this.eid] = n;
		},
	});
	Object.defineProperty(entity.scale, "y", {
		get() {
			return this.store.y[this.eid];
		},
		set(n) {
			this.store.y[this.eid] = n;
		},
	});
	Object.defineProperty(entity.scale, "z", {
		get() {
			return this.store.z[this.eid];
		},
		set(n) {
			this.store.z[this.eid] = n;
		},
	});

	if (fileUrl === undefined) {
		return entity;
	}

	const loader = new GLTFLoader();
	loader.load(
		`${API_URL}${fileUrl}`,
		function (gltf) {
			let model: THREE.Group | THREE.Object3D = gltf.scene;
			model.scale.set(
				initialScale * model.scale.x,
				initialScale * model.scale.y,
				initialScale * model.scale.z,
			);

			entity.add(
				Object.assign(model, {
					mixer: new THREE.AnimationMixer(model),
				}),
			);

			model = entity.children[0];

			addComponent(world, GltfComponent, eid);
			GltfComponent.timeScale[eid] = 1000;
			GltfComponent.animState[eid] = -1;
			GltfComponent.animAction[eid] = -1;

			console.log("Created GLTF mesh", model);
		},
		undefined,
		function (e) {
			console.warn("Error loading gltf:", `${API_URL}${fileUrl}`);
			console.error(e);
		},
	);

	return entity;
};
