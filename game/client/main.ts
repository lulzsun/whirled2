import { pipe } from "bitecs";
import { World, createWorld } from "./factory/world";
import {
	createTimeSystem,
	createRenderSystem,
	createMovementSystem,
	createNetworkSystem,
} from "./factory/systems";

const world = createWorld();
declare global {
	interface Window {
		world: World;
	}
}
window.world = world;

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
