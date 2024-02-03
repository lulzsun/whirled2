import { defineQuery, defineSystem } from "bitecs";
import { TransformComponent } from "../components";
import { World } from "../factory/world";

export const movementQuery = defineQuery([TransformComponent]);

export function createMovementSystem() {
	return defineSystem((world: World) => {
		const {
			time: { delta },
		} = world;
		const ents = movementQuery(world);
		for (let i = 0; i < ents.length; i++) {
			const e = ents[i];
			const obj3d = world.objects.get(e);

			TransformComponent.rotation.x[e] += 0.0001 * delta;
			TransformComponent.rotation.y[e] += 0.003 * delta;
			TransformComponent.rotation.z[e] += 0.0005 * delta;
			obj3d!.rotation._onChangeCallback();
		}
		return world;
	});
}
