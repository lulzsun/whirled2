import { pipe } from "bitecs";
import { createSystems } from "./factory/systems";
import { createWorld } from "./factory/world";

const world = createWorld(true);

console.log("loading preview");
window.world = world;
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
