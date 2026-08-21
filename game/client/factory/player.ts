import { addComponent, addEntity } from "bitecs";
import {
	AnimationComponent,
	AvatarComponent,
	GltfComponent,
	LocalPlayerComponent,
	PlayerComponent,
	SpineComponent,
	SwfComponent,
	TransformComponent,
} from "../components";
import { World } from "./world";

import * as THREE from "three";
import * as spine from "@esotericsoftware/spine-threejs";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { API_URL } from "../constants";

export type Player = THREE.Group & { eid: number };
export enum Avatar {
	None,
	GLTF,
	Spine,
	SWF,
}

export const createPlayer = async (
	world: World,
	name: string = "Unnamed",
	local: boolean = false,
	avatar: Avatar = Avatar.None,
	avatarFile: string = "",
	initialScale: number = 1,
): Promise<Player> => {
	if (avatar === Avatar.None) {
		const extension = avatarFile.split(".").pop();
		switch (extension) {
			case "spine":
				avatar = Avatar.Spine;
				break;
			case "gtlf":
			case "glb":
				avatar = Avatar.GLTF;
				break;
			case "swf":
				avatar = Avatar.SWF;
				break;
			default:
				console.error(`Unknown avatar file extension: ${extension}`);
				avatar = Avatar.None;
				break;
		}
	}

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

	switch (avatar) {
		case Avatar.Spine:
			avatarFile = avatarFile
				.replace(/^.*[\\/]/, "")
				.replace(/\.[^/.]+$/, "");
			if (avatarFile === "") avatarFile = "spineboy";
			world.spineAssetManager.loadText(`${avatarFile}.json`);
			world.spineAssetManager.loadTextureAtlas(
				`${avatarFile}.atlas`,
				() => {
					if (entity !== undefined)
						entity.add(
							createSpineMesh(
								world.spineAssetManager,
								avatarFile,
							),
						);
					addComponent(world, SpineComponent, eid);
					addComponent(world, AnimationComponent, eid);
					AnimationComponent.timeScale[eid] = 1000;
				},
				function (e) {
					console.error(e);
				},
			);
			break;
		case Avatar.GLTF:
			entity.add(
				await createGtlfAvatar(world, eid, avatarFile, initialScale),
			);
			break;
		case Avatar.SWF:
			entity.add(
				await createSwfAvatar(world, eid, avatarFile, initialScale),
			);
			break;
		default:
			console.error("Unknown avatar loaded! This can't be happening!");
			break;
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

export const createGtlfAvatar = async (
	world: World,
	eid: number,
	avatarFile: string,
	initialScale: number = 1,
) => {
	if (avatarFile === "")
		avatarFile = "/static/assets/avatars/RobotExpressive.glb";
	if (!avatarFile.startsWith("data:")) avatarFile = `${API_URL}${avatarFile}`;

	const loader = new GLTFLoader();
	const mesh:
		| THREE.Group<THREE.Object3DEventMap>
		| THREE.Object3D<THREE.Object3DEventMap> = await new Promise(
		(resolve) => {
			loader.load(
				avatarFile,
				function (gltf) {
					let model: THREE.Group | THREE.Object3D = gltf.scene;
					model.scale.set(
						initialScale * model.scale.x,
						initialScale * model.scale.y,
						initialScale * model.scale.z,
					);

					let m = Object.assign(model, {
						mixer: new THREE.AnimationMixer(model),
						animations: gltf.animations,
					});

					console.log("Created GLTF mesh", m);
					resolve(m);
				},
				undefined,
				function (e) {
					console.error("Error loading GLTF file:", e);
					resolve(new THREE.Mesh());
				},
			);
		},
	);

	addComponent(world, GltfComponent, eid);
	addComponent(world, AnimationComponent, eid);
	addComponent(world, AvatarComponent, eid);
	return mesh;
};

export const createSwfAvatar = async (
	world: World,
	eid: number,
	avatarFile: string,
	initialScale: number = 1,
) => {
	const texture = await world.swfAssetManager.add(eid, avatarFile);

	// Size the billboard from the SWF's stage, not from the texture. They are
	// no longer the same thing: the render target's resolution is a quality
	// knob (RENDER_SCALE x devicePixelRatio), while the avatar's size in the
	// world is a property of the artwork. The old pipeline conflated them, so
	// avatars came out half as large on a non-retina display.
	const stage = world.swfAssetManager.getStageSize(eid) ?? {
		width: 200,
		height: 200,
	};
	const geometry = new THREE.PlaneGeometry(
		stage.width * SWF_WORLD_SCALE * initialScale,
		stage.height * SWF_WORLD_SCALE * initialScale,
	);

	const material = createSwfBillboardMaterial(texture);

	// Where the avatar's feet are, as a fraction from the top of the frame.
	// The SDK's own answer (setPreferredY) wins when the avatar gives one,
	// since it does not wander with the animation; otherwise it is the lowest
	// opaque row of the first frame that had artwork in it, which is what the
	// old pipeline measured off the ImageBitmap.
	const bottomNormalized = world.swfAssetManager.getGroundOffset(eid);

	const mesh = new THREE.Mesh(geometry, material);
	// The outline pass masks by geometry by default, which for a billboard
	// means outlining the rectangle instead of the character. Point it at the
	// frame's alpha so it traces the avatar's silhouette.
	mesh.userData.outlineAlphaMap = texture;
	mesh.userData.outlineAlphaTest = SWF_OUTLINE_ALPHA_TEST;
	// Ties this mesh to the registration it was built from, so teardown can
	// tell it apart from a replacement worn under the same entity id.
	mesh.userData.swfToken = world.swfAssetManager.getToken(eid);
	// Stand the avatar on the ground: shift the quad so its lowest opaque row
	// sits at the entity's origin.
	mesh.position.y = (bottomNormalized - 0.5) * geometry.parameters.height;
	//@ts-ignore
	mesh.animations = await world.swfAssetManager.getAnimations(eid);

	addComponent(world, SwfComponent, eid);
	addComponent(world, AnimationComponent, eid);
	addComponent(world, AvatarComponent, eid);
	return mesh;
};

/**
 * Alpha below which a texel is not part of the avatar's *silhouette*.
 *
 * Used by the outline pass, which wants the character's shape and nothing
 * else: trace soft texels too and the outline wraps the drop shadow and every
 * feathered edge instead of the avatar.
 */
const SWF_OUTLINE_ALPHA_TEST = 0.5;

/**
 * Alpha below which a billboard texel is discarded outright.
 *
 * Deliberately far lower than the outline's threshold. These used to be one
 * constant, which meant the billboard threw away everything the outline did
 * not consider part of the silhouette — including all of a soft drop shadow,
 * whose alpha peaks around 0.35. The shadow was composed into the render
 * target correctly and then cut away one step later, at the billboard.
 *
 * This only needs to be high enough that fully empty texels take no part in
 * depth; anything with real coverage is blended instead of cut.
 */
const SWF_BILLBOARD_ALPHA_TEST = 0.02;

/** World units per SWF stage pixel. Matches the old pipeline's apparent size. */
const SWF_WORLD_SCALE = 0.04;

/**
 * Billboard material for a SWF render target.
 *
 * The target holds premultiplied alpha — the stream composes onto a
 * transparent clear — so the texel is fed to premultiplied blending
 * (`ONE, ONE_MINUS_SRC_ALPHA`) exactly as it comes out, with no conversion.
 *
 * Emphatically *not* by dividing the colour back out and blending normally.
 * That division is unbounded as alpha approaches zero: at the 0.02 cutout a
 * texel's colour is multiplied by fifty, so every soft edge and the whole of a
 * drop shadow blow out to white, and they shimmer as the artwork moves and
 * different texels land in the low-alpha band. Premultiplied blending is what
 * premultiplied data wants, and it has no such failure mode.
 *
 * Blended rather than purely cut out, because avatars genuinely contain
 * semi-transparent artwork and a cutout has no way to express it. Depth is
 * still written so the scene keeps sorting avatars against furniture the way
 * it always has; the low cutout is what keeps empty parts of the frame out of
 * the depth buffer.
 */
function createSwfBillboardMaterial(texture: THREE.Texture) {
	return new THREE.ShaderMaterial({
		uniforms: {
			uMap: { value: texture },
			uAlphaTest: { value: SWF_BILLBOARD_ALPHA_TEST },
		},
		vertexShader: `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
		fragmentShader: `
uniform sampler2D uMap;
uniform float uAlphaTest;
varying vec2 vUv;
void main() {
	vec4 texel = texture2D(uMap, vUv);
	if (texel.a < uAlphaTest) discard;
	// Already premultiplied; the material blends it as such.
	gl_FragColor = texel;
}
`,
		side: THREE.DoubleSide,
		transparent: true,
		premultipliedAlpha: true,
		depthWrite: true,
		depthTest: true,
	});
}

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
