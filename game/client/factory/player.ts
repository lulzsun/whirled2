import { addComponent, addEntity } from "bitecs";
import {
	GltfComponent,
	LocalPlayerComponent,
	PlayerComponent,
	SpineComponent,
	TransformComponent,
} from "../components";
import { World } from "./world";

import * as THREE from "three";
import * as spine from "@esotericsoftware/spine-threejs";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { API_URL } from "../constants";

export type Player = THREE.Group & { eid: number };
export enum Avatar {
	GLTF,
	Spine,
}

export const createPlayer = (
	world: World,
	name: string = "Unnamed",
	local: boolean = false,
	avatar: Avatar = Avatar.GLTF,
	avatarFile: string = "",
	initialScale: number = 1,
): Player => {
	const eid = addEntity(world);
	let entity = Object.assign(new THREE.Group(), { eid });
	entity.name = `${name} (Player)`;

	if (local) {
		addComponent(world, LocalPlayerComponent, eid);
	}
	addComponent(world, PlayerComponent, eid);
	addComponent(world, TransformComponent, eid);

	TransformComponent.scale.x[eid] = 1;
	TransformComponent.scale.y[eid] = 1;
	TransformComponent.scale.z[eid] = 1;

	if (avatar === Avatar.Spine) {
		if (avatarFile === "") avatarFile = "spineboy";

		world.spineAssetManager.loadText(`${avatarFile}.json`);
		world.spineAssetManager.loadTextureAtlas(
			`${avatarFile}.atlas`,
			() => {
				if (entity !== undefined)
					entity.add(
						createSpineMesh(world.spineAssetManager, avatarFile),
					);
				addComponent(world, SpineComponent, eid);
				SpineComponent.timeScale[eid] = 1000;
			},
			function (e) {
				console.error(e);
			},
		);
	} else if (avatar === Avatar.GLTF) {
		if (avatarFile === "")
			avatarFile = "/static/assets/avatars/RobotExpressive.glb";

		console.log(`${API_URL}${avatarFile}`);

		const loader = new GLTFLoader();
		loader.load(
			`${API_URL}${avatarFile}`,
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
				//@ts-ignore: this is probably a bad idea for the future...
				const mixer: THREE.AnimationMixer = model.mixer;
				model.animations = gltf.animations;
				const clip =
					model.animations.find((animation) =>
						/idle_state$/i.test(animation.name),
					) ?? model.animations[0];
				const clipIndex = model.animations.indexOf(clip);
				const action = mixer.clipAction(clip).play();
				action.time = Math.random() * clip.duration;

				addComponent(world, GltfComponent, eid);
				GltfComponent.timeScale[eid] = 1000;
				GltfComponent.animState[eid] = clipIndex;
				GltfComponent.animAction[eid] = -1;

				console.log("Created GLTF mesh", model);
			},
			undefined,
			function (e) {
				console.error(e);
			},
		);
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

	return entity;
};

const createSpineMesh = (
	assetManager: spine.AssetManager,
	avatarFile: string,
) => {
	// Load the texture atlas using name.atlas and name.png from the AssetManager.
	// The function passed to TextureAtlas is used to resolve relative paths.
	let atlas = assetManager.require(`${avatarFile}.atlas`);

	// Create a AtlasAttachmentLoader that resolves region, mesh, boundingbox and path attachments
	let atlasLoader = new spine.AtlasAttachmentLoader(atlas);

	// Create a SkeletonJson instance for parsing the .json file.
	let skeletonJson = new spine.SkeletonJson(atlasLoader);

	// Set the scale to apply during parsing, parse the file, and create a new skeleton.
	skeletonJson.scale = 0.3;
	let skeletonData = skeletonJson.readSkeletonData(
		assetManager.require(`${avatarFile}.json`),
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
