import * as THREE from "three";
import * as bitECS from "bitecs";
import * as spine from "@esotericsoftware/spine-threejs";

import { Player } from "./player";
import { Nameplate } from "./nameplate";
import { ChatBubbleStack } from "./chatbubble";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { Network } from "../systems/network";
import { API_URL } from "../constants";
import { Object, createObject } from "./object";
import { Editor } from "../systems/editor";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SwfAssetManager } from "../managers/swf";
import { SwfStreamRenderer } from "../managers/stream";
import { Benchmark } from "../systems/benchmark";

export type World = {
	players: Map<
		number,
		{
			player: Player;
			nameplate: Nameplate;
			chatBubbles?: ChatBubbleStack;
		}
	>;
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
	/** Live SWF command-stream renderers, composed once per frame. */
	swfStreams: Set<SwfStreamRenderer>;
	editor: Editor;
	benchmark: Benchmark;
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
		// See the floor plane below: the grid sits a centimetre above it and
		// would clip the same artwork.
		(gridHelper.material as THREE.Material).depthWrite = false;
		// With neither the grid nor the floor writing depth, whichever draws
		// last wins the overlap, and opaque sorting orders by material id —
		// the grid's is older, so the black floor was overdrawing the lines.
		// Draw the grid after the floor; depth testing still lets furniture
		// occlude it.
		gridHelper.renderOrder = 1;

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
				// The ground does not write depth.
				//
				// A SWF avatar is a flat billboard standing on this plane, and
				// its artwork does not stop at the feet: Flash avatars draw
				// their drop shadow *below* the hot spot, because in Whirled's
				// 2.5D rooms a sprite was composited whole over the floor art.
				// Standing that sprite up in 3D puts the shadow underneath the
				// floor plane — kawaii's reaches about half a world unit down
				// — where an opaque floor depth-tests it away.
				//
				// Depth *testing* stays on, so furniture still occludes the
				// floor normally. Dropping only the write means the floor
				// cannot hide anything drawn after it, and the only thing
				// below it is avatar artwork that belongs on the ground.
				depthWrite: false,
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
		(gridHelper.material as THREE.Material).depthWrite = false;
		gridHelper.renderOrder = 1;
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
				depthWrite: false,
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
	// The manager creates stream renderers, which register themselves here, so
	// the registry has to exist first.
	world.swfStreams = new Set();
	world.swfAssetManager = new SwfAssetManager(world);

	return world;
};
