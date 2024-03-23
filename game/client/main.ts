import { pipe } from "bitecs";
import { World, createWorld } from "./factory/world";
import { createSystems } from "./factory/systems";
import { NetworkEvent } from "./systems/network";

const world = createWorld();
declare global {
	interface Window {
		world: World;
		htmx: any;
		game: {
			addToRoom: (id: string) => void;
			reconnect: () => void;
		};
	}
}
if (window.htmx === undefined) {
	window.htmx = {};
	window.htmx.process = () => {};
}
window.world = world;
window.game = {
	addToRoom: (id) => {
		world.network.emit(NetworkEvent.ObjectJoin, { id });
	},
	reconnect: () => {},
};

const systems = createSystems(world);

const update = () => {
	requestAnimationFrame(update);
	pipe(...systems)(world);
};

update();
