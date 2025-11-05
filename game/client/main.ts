import { pipe } from "bitecs";
import { World, createWorld } from "./factory/world";
import { createSystems } from "./factory/systems";
import { NetworkEvent } from "./systems/network";
import { initializeHtmx, htmx } from "./htmx";

const world = createWorld();
declare global {
	interface Window {
		RufflePlayer: any;
		world: World;
		htmx: typeof htmx;
		game: {
			addStuff: (id: string, type: string) => void;
			wearAvatar: (id: string) => void;
			reconnect: () => void;
		};
	}
}
if (window.htmx === undefined) {
	//@ts-ignore
	window.htmx = {};
	window.htmx.process = () => {};
} else {
	initializeHtmx();
}
window.world = world;
window.game = {
	addStuff: (id, type) => {
		world.network.emit(NetworkEvent.ObjectJoin, {
			id,
			type: parseInt(type),
		});
	},
	wearAvatar: (id) => {
		console.log(id);
	},
	reconnect: () => {},
};
// Config for Ruffle player which handles swf emulation
window.RufflePlayer.config = {
	autoplay: "on",
	splashScreen: false,
	unmuteOverlay: "hidden",
	letterbox: "off",
	wmode: "transparent",
	preferredRenderer: "canvas",
};

const systems = createSystems(world);

const update = () => {
	requestAnimationFrame(update);
	pipe(...systems)(world);
};

update();
