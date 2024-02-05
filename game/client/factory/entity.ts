import { addEntity } from "bitecs";
import * as THREE from "three";
import * as spine from "@esotericsoftware/spine-threejs";
import { TransformComponent } from "../components";
import { World } from "./world";

export type Entity = THREE.Mesh & { eid: number };

export const createEntity = (
	world: World,
	geometry = new THREE.BoxGeometry(0, 0, 0),
	material = new THREE.MeshBasicMaterial({ wireframe: true }),
): Entity => {
	const eid = addEntity(world);
	const entity = Object.assign(new THREE.Mesh(geometry, material), { eid });
	const fileName = "spineboy";

	console.log(world.spineAssetManager);
	world.spineAssetManager.loadText(`${fileName}.json`);
	world.spineAssetManager.loadTextureAtlas(`${fileName}.atlas`, () => {
		// Load the texture atlas using name.atlas and name.png from the AssetManager.
		// The function passed to TextureAtlas is used to resolve relative paths.
		let atlas = world.spineAssetManager.require(`${fileName}.atlas`);

		// Create a AtlasAttachmentLoader that resolves region, mesh, boundingbox and path attachments
		let atlasLoader = new spine.AtlasAttachmentLoader(atlas);

		// Create a SkeletonJson instance for parsing the .json file.
		let skeletonJson = new spine.SkeletonJson(atlasLoader);

		// Set the scale to apply during parsing, parse the file, and create a new skeleton.
		skeletonJson.scale = 0.3;
		let skeletonData = skeletonJson.readSkeletonData(
			world.spineAssetManager.require(`${fileName}.json`),
		);

		// Create a SkeletonMesh from the data and attach it to the scene
		let skeletonMesh = new spine.SkeletonMesh(
			skeletonData,
			(parameters) => {
				parameters.depthTest = true;
				parameters.depthWrite = true;
				parameters.alphaTest = 0.001;
			},
		);
		skeletonMesh.state.setAnimation(0, "idle", true);
		console.log(skeletonMesh.state.data.skeletonData.animations);
		entity.add(skeletonMesh);
	});

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
