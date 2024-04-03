import * as THREE from "three";
import * as bitECS from "bitecs";
import * as spine from "@esotericsoftware/spine-threejs";

import { Player } from "./player";
import { Nameplate } from "./nameplate";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { Network } from "../systems/network";
import { API_URL } from "../constants";
import { Object, createObject } from "./object";
import { Editor } from "../systems/editor";

export type World = {
	players: Map<number, { player: Player; nameplate: Nameplate }>;
	objects: Map<number, Object>;
	camera: THREE.Camera;
	scene: THREE.Scene;
	renderer: THREE.WebGLRenderer;
	composer: EffectComposer;
	time: {
		last: number;
		delta: number;
		elapsed: number;
	};
	network: Network;
	spineAssetManager: spine.AssetManager;
	editor: Editor;
};

export const createWorld = (): World => {
	const world: World = bitECS.createWorld();
	const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
	const aspect = window.innerWidth / window.innerHeight;

	world.players = new Map();
	world.objects = new Map();

	// initialize scene
	world.scene = new THREE.Scene();

	// add a camera
	world.camera = new THREE.PerspectiveCamera(100, aspect, 0.1, 4000);
	world.camera.position.set(0, 10, 20);

	// add lights
	const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 2);
	hemiLight.position.set(0, 2, 0);
	world.scene.add(hemiLight);

	const dirlight = new THREE.DirectionalLight(0xffffff, 3);
	dirlight.position.set(0, 2, 1);
	world.scene.add(dirlight);

	// add a floor
	const gridHelper = new THREE.GridHelper(20, 10, 0xffffff, 0xffffff);
	//@ts-ignore
	gridHelper.ignoreIntersect = true;
	gridHelper.position.y = 0.01;

	const planeMesh = new THREE.Mesh(
		new THREE.PlaneGeometry(20, 20),
		new THREE.MeshBasicMaterial({
			color: 0x0,
			side: THREE.DoubleSide,
		}),
	);
	planeMesh.position.z = 0;
	planeMesh.rotation.x = (Math.PI / 180) * -90;
	const plane = createObject(
		world,
		"Floor",
		undefined,
		1,
		new THREE.Group().add(planeMesh).add(gridHelper),
	);
	world.objects.set(plane.eid, plane);
	world.scene.add(plane);

	// add "stars" to the background
	var stars = new Array(0);
	for (var i = 0; i < 0; i++) {
		let x = THREE.MathUtils.randFloatSpread(50);
		let y = THREE.MathUtils.randFloatSpread(50);
		let z = THREE.MathUtils.randFloatSpread(50);
		stars.push(x, y, z);
	}
	var starsGeometry = new THREE.BufferGeometry();
	starsGeometry.setAttribute(
		"position",
		new THREE.Float32BufferAttribute(stars, 3),
	);
	const loader = new THREE.TextureLoader();
	var starsMaterial = new THREE.PointsMaterial({
		size: 0.5,
		map: loader.load(
			"https://raw.githubusercontent.com/Kuntal-Das/textures/main/sp2.png",
		),
		transparent: true,
		color: 0xffffff,
	});
	var starField = new THREE.Points(starsGeometry, starsMaterial);
	world.scene.add(starField);

	// create a default renderer, this can be modified later by render system
	world.renderer = new THREE.WebGLRenderer({ antialias: true, canvas });

	world.time = { last: 0, delta: 0, elapsed: 0 };

	world.spineAssetManager = new spine.AssetManager(
		`${API_URL}/static/assets/avatar/`,
	);

	return world;
};
