import * as THREE from "three";
import * as bitECS from "bitecs";
import { Entity } from "./entity";

export type World = {
	objects: Map<number, Entity>;
	camera: THREE.PerspectiveCamera;
	scene: THREE.Scene;
	renderer: THREE.WebGLRenderer;
	time: {
		last: number;
		delta: number;
		elapsed: number;
	};
};

export const createWorld = (): World => {
	const world: World = bitECS.createWorld();
	const canvas = document.querySelector<HTMLDivElement>("#app")!;

	const light = new THREE.DirectionalLight(0xffffff, 3);
	world.camera = new THREE.PerspectiveCamera(
		70,
		window.innerWidth / window.innerHeight,
		1,
		1000,
	);
	world.camera.position.z = 400;

	world.scene = new THREE.Scene();
	world.scene.add(light);
	world.renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
	world.renderer.setPixelRatio(window.devicePixelRatio);
	world.renderer.setSize(window.innerWidth, window.innerHeight);

	window.addEventListener("resize", () => {
		world.camera.aspect = window.innerWidth / window.innerHeight;
		world.camera.updateProjectionMatrix();

		world.renderer.setSize(window.innerWidth, window.innerHeight);
	});

	world.objects = new Map();

	world.time = { last: 0, delta: 0, elapsed: 0 };

	return world;
};
