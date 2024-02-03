import * as THREE from "three";
import { addComponent, pipe } from "bitecs";
import { SpineAvatarComponent, TransformComponent } from "./components";
import { createEntity } from "./factory/entity";
import { createWorld } from "./factory/world";
import {
	createTimeSystem,
	createRenderSystem,
	createMovementSystem,
	createNetworkSystem,
} from "./factory/systems";

const world = createWorld();

const parent = await createEntity(world, new THREE.BoxGeometry(100, 100, 100));
addComponent(world, TransformComponent, parent.eid);
addComponent(world, SpineAvatarComponent, parent.eid);
SpineAvatarComponent.timeScale[parent.eid] = 1000;
world.objects.set(parent.eid, parent);
world.scene.add(parent);

// create a bunch of entities and attach the transform component
// for (let i = 1; i <= 10; i++) {
// 	const size = 10 * (10 - i);
// 	const obj3d = createEntity(world, new THREE.BoxGeometry(size, size, size));
// 	addComponent(world, TransformComponent, obj3d.eid);
// 	world.objects.set(obj3d.eid, obj3d);
// 	let last = world.objects.get(obj3d.eid - 1);
// 	if (!last) parent.add(obj3d);
// 	else last.add(obj3d);
// }

const timeSystem = createTimeSystem();
const movementSystem = createMovementSystem();
const renderSystem = createRenderSystem();
const networkSystem = createNetworkSystem();

const update = () => {
	requestAnimationFrame(update);
	pipe(
		//
		timeSystem,
		//movementSystem,
		renderSystem,
		networkSystem,
	)(world);
};

update();
