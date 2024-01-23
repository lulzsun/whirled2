import { IWorld, addEntity } from "bitecs";
import * as THREE from "three";
import { TransformComponent } from "../components";

export type Entity = THREE.Mesh & { eid: number };

export const createEntity = (
	world: IWorld,
	geometry = new THREE.BoxGeometry(200, 200, 200),
	material = new THREE.MeshBasicMaterial({ wireframe: true }),
): Entity => {
	const eid = addEntity(world);
	const entity = Object.assign(new THREE.Mesh(geometry, material), { eid });

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

	// console.log(entity);
	return entity;
};
