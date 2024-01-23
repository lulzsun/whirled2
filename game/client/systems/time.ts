import { defineSystem } from "bitecs";
import { World } from "../factory/world";

export function createTimeSystem() {
	return defineSystem((world: World) => {
		const now = performance.now();
		world.time.delta = now - world.time.last;
		world.time.elapsed += world.time.delta;
		world.time.last = now;
		return world;
	});
}
