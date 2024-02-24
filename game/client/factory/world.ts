import * as THREE from "three";
import * as bitECS from "bitecs";
import * as spine from "@esotericsoftware/spine-threejs";

import { Player } from "./player";
import { Nameplate } from "./nameplate";

import { ClientChannel } from "@geckos.io/client";

export type World = {
	players: Map<number, { player: Player; nameplate: Nameplate }>;
	camera: THREE.Camera;
	html: HTMLElement;
	scene: THREE.Scene;
	renderer: THREE.WebGLRenderer;
	time: {
		last: number;
		delta: number;
		elapsed: number;
	};
	network: ClientChannel;
	spineAssetManager: spine.AssetManager;
};

export const createWorld = (): World => {
	const world: World = bitECS.createWorld();
	const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
	const aspect = window.innerWidth / window.innerHeight;
	const fov = 1000;

	// set the HTML parent element
	world.html = canvas.parentElement!;

	// create a scene
	world.scene = new THREE.Scene();

	// add a camera
	world.camera = new THREE.PerspectiveCamera(fov / 10, aspect, 0.1, 4000);
	// world.camera = new THREE.OrthographicCamera(
	// 	(-fov * aspect) / 2,
	// 	(fov * aspect) / 2,
	// 	fov / 2,
	// 	-fov / 2,
	// 	0.1,
	// 	4000,
	// );
	world.camera.position.set(0, 200, 400);

	// add a light
	const light = new THREE.DirectionalLight(0xffffff, 3);
	world.scene.add(light);

	// add a floor
	const plane = new THREE.Mesh(
		new THREE.PlaneGeometry(800, 500),
		new THREE.MeshBasicMaterial({
			color: 0xffffff,
			side: THREE.DoubleSide,
		}),
	);
	plane.position.z = 0;
	plane.rotation.x = (Math.PI / 180) * -90;

	world.scene.add(plane);

	// add "stars" to the background
	var stars = new Array(0);
	for (var i = 0; i < 1000; i++) {
		let x = THREE.MathUtils.randFloatSpread(2000);
		let y = THREE.MathUtils.randFloatSpread(2000);
		let z = THREE.MathUtils.randFloatSpread(2000);
		stars.push(x, y, z);
	}
	var starsGeometry = new THREE.BufferGeometry();
	starsGeometry.setAttribute(
		"position",
		new THREE.Float32BufferAttribute(stars, 3),
	);
	const loader = new THREE.TextureLoader();
	var starsMaterial = new THREE.PointsMaterial({
		size: 5,
		map: loader.load(
			"https://raw.githubusercontent.com/Kuntal-Das/textures/main/sp2.png",
		),
		transparent: true,
		color: 0xffffff,
	});
	var starField = new THREE.Points(starsGeometry, starsMaterial);
	world.scene.add(starField);

	world.renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
	world.renderer.setPixelRatio(window.devicePixelRatio);
	console.log(canvas.parentElement!.getBoundingClientRect());
	world.renderer.setSize(window.innerWidth, window.innerHeight);

	setTimeout(function () {
		const rect = canvas.parentElement!.getBoundingClientRect();
		world.renderer.setSize(window.innerWidth, rect.height);
	}, 1);

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

		const rect = canvas.parentElement!.getBoundingClientRect();
		world.renderer.setSize(window.innerWidth, rect.height);
	});

	world.players = new Map();

	world.time = { last: 0, delta: 0, elapsed: 0 };

	world.spineAssetManager = new spine.AssetManager(
		"http://127.0.0.1:42069/static/assets/",
	);

	return world;
};
