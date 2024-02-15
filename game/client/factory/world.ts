import * as THREE from "three";
import * as bitECS from "bitecs";
import * as spine from "@esotericsoftware/spine-threejs";

import { Entity } from "./entity";

export type World = {
	objects: Map<number, Entity>;
	camera: THREE.Camera;
	scene: THREE.Scene;
	renderer: THREE.WebGLRenderer;
	time: {
		last: number;
		delta: number;
		elapsed: number;
	};
	spineAssetManager: spine.AssetManager;
};

export const createWorld = (): World => {
	const world: World = bitECS.createWorld();
	const canvas = document.querySelector<HTMLDivElement>("#app")!;

	const light = new THREE.DirectionalLight(0xffffff, 3);
	const aspect = window.innerWidth / window.innerHeight;
	const fov = 1000;

	// world.camera = new THREE.PerspectiveCamera(70, aspect, 0.1, 1000);
	world.camera = new THREE.OrthographicCamera(
		(-fov * aspect) / 2,
		(fov * aspect) / 2,
		fov / 2,
		-fov / 2,
		0.1,
		1000,
	);
	world.camera.position.z = 400;

	world.scene = new THREE.Scene();
	world.scene.add(light);
	world.renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
	world.renderer.setPixelRatio(window.devicePixelRatio);
	world.renderer.setSize(window.innerWidth, window.innerHeight);

	window.addEventListener("resize", () => {
		const aspect = window.innerWidth / window.innerHeight;
		if (world.camera instanceof THREE.PerspectiveCamera) {
			world.camera.aspect = aspect;
			world.camera.updateProjectionMatrix();
		} else if (world.camera instanceof THREE.OrthographicCamera) {
			world.camera.left = (-fov * aspect) / 2;
			world.camera.right = (fov * aspect) / 2;
			world.camera.top = fov / 2;
			world.camera.bottom = -fov / 2;
			world.camera.updateProjectionMatrix();
		}

		world.renderer.setSize(window.innerWidth, window.innerHeight);
	});

	world.objects = new Map();

	world.time = { last: 0, delta: 0, elapsed: 0 };

	world.spineAssetManager = new spine.AssetManager(
		"http://127.0.0.1:42069/static/assets/",
	);

	return world;
};
