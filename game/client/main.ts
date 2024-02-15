import { pipe } from "bitecs";
import { createWorld } from "./factory/world";
import {
	createTimeSystem,
	createRenderSystem,
	createMovementSystem,
	createNetworkSystem,
} from "./factory/systems";

const world = createWorld();

const systems = [
	createTimeSystem,
	createMovementSystem,
	createRenderSystem,
	createNetworkSystem,
].map((createSystem) => createSystem(world));

const update = () => {
	requestAnimationFrame(update);
	pipe(...systems)(world);
};

update();
