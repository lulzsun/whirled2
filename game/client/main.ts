import { pipe } from "bitecs";
import { createWorld } from "./factory/world";
import {
	createTimeSystem,
	createRenderSystem,
	createMovementSystem,
	createNetworkSystem,
} from "./factory/systems";

const world = createWorld();

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
