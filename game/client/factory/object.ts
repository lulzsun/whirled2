import { addComponent, addEntity } from "bitecs";
import {
	GltfComponent,
	ObjectComponent,
	TransformComponent,
} from "../components";
import { World } from "./world";

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type Object = THREE.Group & { eid: number };

export const createObject = (world: World, fileUrl: string): Object => {
	const eid = addEntity(world);
	let entity = Object.assign(new THREE.Group(), { eid });

	addComponent(world, ObjectComponent, eid);
	addComponent(world, TransformComponent, eid);

	const loader = new GLTFLoader();
	loader.load(
		`${fileUrl}`,
		function (gltf) {
			let model: THREE.Group | THREE.Object3D = gltf.scene;
			model.scale.set(
				30 * model.scale.x,
				30 * model.scale.y,
				30 * model.scale.z,
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
			console.error(e);
		},
	);

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
	// Object.defineProperty(obj3d.scale, 'eid', { get: () => eid })
	// Object.defineProperty(obj3d.scale, 'store', { get: () => TransformComponent.scale })

	// Object.defineProperty(obj3d.scale, 'x', {
	//   get () { return this.store.x[this.eid] },
	//   set (n) { this.store.x[this.eid] = n }
	// })
	// Object.defineProperty(obj3d.scale, 'y', {
	//   get () { return this.store.y[this.eid] },
	//   set (n) { this.store.y[this.eid] = n }
	// })
	// Object.defineProperty(obj3d.scale, 'z', {
	//   get () { return this.store.z[this.eid] },
	//   set (n) { this.store.z[this.eid] = n }
	// })

	return entity;
};
