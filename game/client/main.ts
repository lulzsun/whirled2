import { pipe } from "bitecs";
import { World, createWorld } from "./factory/world";
import * as createSystems from "./factory/systems";

const world = createWorld();
declare global {
	interface Window {
		world: World;
	}
}
window.world = world;

const systems = Object.values(createSystems).map((createSystem) =>
	createSystem(world),
);

const update = () => {
	requestAnimationFrame(update);
	pipe(...systems)(world);
};

update();
