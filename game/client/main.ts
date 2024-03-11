import { pipe } from "bitecs";
import { World, createWorld } from "./factory/world";
import { createSystems } from "./factory/systems";

const world = createWorld();
declare global {
	interface Window {
		world: World;
		htmx: any;
		game: {
			reconnect: () => void;
		};
	}
}
if (window.htmx === undefined) {
	window.htmx = {};
	window.htmx.process = () => {};
}
window.world = world;
window.game.reconnect = () => {};

const systems = createSystems(world);

const update = () => {
	requestAnimationFrame(update);
	pipe(...systems)(world);
};

update();
