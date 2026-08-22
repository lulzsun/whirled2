import { pipe } from "bitecs";
import { createSystems } from "./factory/systems";
import { createWorld } from "./factory/world";

const world = createWorld(true);

console.log("loading preview");
window.world = world;
const systems = createSystems(world);

const update = () => {
	requestAnimationFrame(update);
	pipe(...systems)(world);
};

update();
