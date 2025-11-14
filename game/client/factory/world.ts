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
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SwfAssetManager } from "../managers/swf";

export type World = {
	players: Map<number, { player: Player; nameplate: Nameplate }>;
	objects: Map<number, Object>;
	controls: OrbitControls;
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
	swfAssetManager: SwfAssetManager;
	editor: Editor;
	isPreview: boolean;
};

export const createWorld = (isPreview: boolean = false): World => {
	const world: World = bitECS.createWorld();
	const canvas = document.querySelector<HTMLCanvasElement>(
		!isPreview ? "#game" : "#preview",
	)!;
	const aspect = window.innerWidth / window.innerHeight;

	world.players = new Map();
	world.objects = new Map();

	world.isPreview = isPreview;

	// initialize scene
	world.scene = new THREE.Scene();

	// add a camera
	world.camera = new THREE.PerspectiveCamera(80, aspect, 0.1, 4000);

	// add lights
	const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 2);
	hemiLight.position.set(0, 2, 0);
	world.scene.add(hemiLight);

	const dirlight = new THREE.DirectionalLight(0xffffff, 3);
	dirlight.position.set(0, 2, 1);
	world.scene.add(dirlight);

	const textureLoader = new THREE.TextureLoader();

	if (!world.isPreview) {
		world.camera.position.set(0, 10, 20);
		// add a floor
		const gridHelper = new THREE.GridHelper(20, 10, 0xffffff, 0xffffff);
		//@ts-ignore
		gridHelper.ignoreIntersect = true;
		gridHelper.position.y = 0.01;

		var textureEquirec = textureLoader.load(
			`${API_URL}/static/assets/backdrops/clear_sky.png`,
		);
		textureEquirec.mapping = THREE.EquirectangularReflectionMapping;
		textureEquirec.colorSpace = THREE.SRGBColorSpace;

		world.scene.background = textureEquirec;

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
	} else {
		world.camera.position.set(0, 0, 10);
		// add a floor
		const gridHelper = new THREE.GridHelper(20, 5, 0xffffff, 0xffffff);
		//@ts-ignore
		gridHelper.ignoreIntersect = true;
		gridHelper.position.y = -7.49;
		//creating a cube
		const geometry = new THREE.BoxGeometry(20, 15, 20);
		var materials = [
			new THREE.MeshBasicMaterial({
				color: 0x195178,
				side: THREE.BackSide,
			}),
			new THREE.MeshBasicMaterial({
				color: 0x195178,
				side: THREE.BackSide,
			}),
			new THREE.MeshBasicMaterial({
				color: 0x97c3e1,
				side: THREE.BackSide,
			}),
			new THREE.MeshBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0,
			}),
			new THREE.MeshBasicMaterial({
				color: 0x195178,
				side: THREE.BackSide,
			}),
			new THREE.MeshBasicMaterial({
				color: 0x195178,
				side: THREE.BackSide,
			}),
		];
		const cube = new THREE.Mesh(geometry, materials);
		world.scene.add(cube);

		const planeMesh = new THREE.Mesh(
			new THREE.PlaneGeometry(20, 20),
			new THREE.MeshBasicMaterial({
				color: 0x995a01,
				side: THREE.DoubleSide,
			}),
		);
		planeMesh.position.z = 0;
		planeMesh.position.y = -7.5;
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
	}

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
	world.renderer = new THREE.WebGLRenderer({
		antialias: true,
		alpha: true,
		canvas,
	});

	world.renderer.setClearColor(0x000000, 0);
	world.renderer.shadowMap.enabled = true;

	world.time = { last: 0, delta: 0, elapsed: 0 };

	world.spineAssetManager = new spine.AssetManager(
		`${API_URL}/static/assets/avatars/`,
	);
	world.swfAssetManager = new SwfAssetManager();

	return world;
};
