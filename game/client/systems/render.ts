import { defineSystem } from "bitecs";
import { World } from "../factory/world";

export function createRenderSystem() {
	return defineSystem((world: World) => {
		world.renderer.render(world.scene, world.camera);
		return world;
	});
}
