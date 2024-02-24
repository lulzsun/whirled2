import * as THREE from "three";
import { addEntity } from "bitecs";
import { World } from "./world";
import { createNameplateUI } from "../ui/nameplate";

export type Nameplate = HTMLElement & { eid: number; position: THREE.Vector3 };

export const createNameplate = (
	world: World,
	name: string = "Guest",
): Nameplate => {
	const eid = addEntity(world);
	const entity = Object.assign(
		world.html.appendChild(createNameplateUI(name)) as HTMLElement,
		{ eid, position: new THREE.Vector3() },
	);
	return entity;
};
