import { addEntity } from "bitecs";
import * as THREE from "three";
import * as spine from "@esotericsoftware/spine-threejs";
import { TransformComponent } from "../components";
import { World } from "./world";

export type Player = THREE.Mesh & { eid: number };
export enum Avatar {
	GLTF,
	Spine,
}

export const createPlayer = (
	world: World,
	avatar: Avatar = Avatar.Spine,
	avatarName: string = "",
	geometry = new THREE.BoxGeometry(1, 1, 1),
	material = new THREE.MeshBasicMaterial({
		// wireframe: true,
		opacity: 1,
		transparent: true,
	}),
): Player => {
	const eid = addEntity(world);
	const entity = Object.assign(new THREE.Mesh(geometry, material), { eid });

	if (avatar === Avatar.Spine) {
		if (avatarName === "") avatarName = "spineboy";

		world.spineAssetManager.loadText(`${avatarName}.json`);
		world.spineAssetManager.loadTextureAtlas(`${avatarName}.atlas`, () => {
			entity.add(createSpineMesh(world.spineAssetManager, avatarName));
		});
	}

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

const createSpineMesh = (
	assetManager: spine.AssetManager,
	avatarName: string,
) => {
	// Load the texture atlas using name.atlas and name.png from the AssetManager.
	// The function passed to TextureAtlas is used to resolve relative paths.
	let atlas = assetManager.require(`${avatarName}.atlas`);

	// Create a AtlasAttachmentLoader that resolves region, mesh, boundingbox and path attachments
	let atlasLoader = new spine.AtlasAttachmentLoader(atlas);

	// Create a SkeletonJson instance for parsing the .json file.
	let skeletonJson = new spine.SkeletonJson(atlasLoader);

	// Set the scale to apply during parsing, parse the file, and create a new skeleton.
	skeletonJson.scale = 0.3;
	let skeletonData = skeletonJson.readSkeletonData(
		assetManager.require(`${avatarName}.json`),
	);

	// Create a SkeletonMesh from the data and attach it to the scene
	let skeletonMesh = new spine.SkeletonMesh(skeletonData, (parameters) => {
		parameters.depthTest = true;
		parameters.depthWrite = true;
		parameters.alphaTest = 0.001;
	});
	skeletonMesh.state.setAnimation(0, "idle", true);
	console.log("Created Spine skeleton mesh", skeletonMesh);
	// console.log(skeletonMesh.state.data.skeletonData.animations);
	return skeletonMesh;
};
