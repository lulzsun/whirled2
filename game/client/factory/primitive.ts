import * as THREE from "three";
import { addComponent, addEntity } from "bitecs";

import {
	ObjectComponent,
	PrimitiveComponent,
	TransformComponent,
} from "../components";
import { World } from "./world";
import { Part, Shape } from "../proto";
import { getPartMaterial } from "../managers/materials";
import { bindTransformToEcs } from "./object";

export type Primitive = THREE.Group & { eid: number };

/**
 * Unit geometry, one instance per shape, shared by every part using it.
 *
 * Every shape is built to fit a 1x1x1 box centred on its origin, because a
 * part's size is its Scale (spec §0.3) -- the scale gizmo is the resize tool,
 * and that only works if every shape starts from the same cube.
 *
 * Geometry is shared but *materials* are what actually matter for memory;
 * see managers/materials.ts. When textured materials land, textured parts
 * will need their own geometry for world-space UVs -- shared geometry cannot
 * carry per-part UVs -- which is why this is a lookup rather than a field.
 */
const geometryCache = new Map<Shape, THREE.BufferGeometry>();

/**
 * A wedge: a cube with its top edge collapsed along -Z, giving a ramp that
 * rises from the -Z face to the +Z face.
 *
 * Hand-built because three has no wedge. Written as explicit triangles
 * rather than a modified BoxGeometry so the face normals are right; a ramp
 * lit as though it were still a cube looks wrong immediately.
 */
function createWedgeGeometry(): THREE.BufferGeometry {
	const h = 0.5;
	// prettier-ignore
	const positions = new Float32Array([
		// sloped face
		-h, -h, -h,   h, -h, -h,   h,  h,  h,
		-h, -h, -h,   h,  h,  h,  -h,  h,  h,
		// bottom
		-h, -h, -h,  -h, -h,  h,   h, -h,  h,
		-h, -h, -h,   h, -h,  h,   h, -h, -h,
		// back (the tall end)
		-h, -h,  h,  -h,  h,  h,   h,  h,  h,
		-h, -h,  h,   h,  h,  h,   h, -h,  h,
		// left side
		-h, -h, -h,  -h,  h,  h,  -h, -h,  h,
		// right side
		 h, -h, -h,   h, -h,  h,   h,  h,  h,
	]);
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.computeVertexNormals();
	return geometry;
}

/**
 * A corner wedge: a wedge sloping along two axes, i.e. a tetrahedron filling
 * one corner of the unit cube. The piece that makes hipped roofs possible.
 */
function createCornerWedgeGeometry(): THREE.BufferGeometry {
	const h = 0.5;
	// prettier-ignore
	const positions = new Float32Array([
		// bottom
		-h, -h, -h,  -h, -h,  h,   h, -h,  h,
		// back
		-h, -h,  h,  -h,  h,  h,   h, -h,  h,
		// left
		-h, -h, -h,  -h,  h,  h,  -h, -h,  h,
		// the doubly-sloped face
		-h, -h, -h,   h, -h,  h,  -h,  h,  h,
	]);
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.computeVertexNormals();
	return geometry;
}

export function getPartGeometry(shape: Shape): THREE.BufferGeometry {
	const cached = geometryCache.get(shape);
	if (cached !== undefined) return cached;

	let geometry: THREE.BufferGeometry;
	switch (shape) {
		case Shape.Wedge:
			geometry = createWedgeGeometry();
			break;
		case Shape.CornerWedge:
			geometry = createCornerWedgeGeometry();
			break;
		case Shape.Cylinder:
			geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
			break;
		case Shape.Sphere:
			geometry = new THREE.SphereGeometry(0.5, 24, 16);
			break;
		case Shape.Cone:
			geometry = new THREE.ConeGeometry(0.5, 1, 24);
			break;
		case Shape.Plane:
			// Double-sided so a wall built from one is not invisible from
			// behind; a plane has no inside to hide.
			geometry = new THREE.PlaneGeometry(1, 1);
			break;
		case Shape.Box:
		default:
			geometry = new THREE.BoxGeometry(1, 1, 1);
			break;
	}
	geometryCache.set(shape, geometry);
	return geometry;
}

/** Builds the mesh for a part, without any ECS or networking attached. */
export function createPartMesh(part: Part): THREE.Mesh {
	const material = getPartMaterial(part.material, part.color);
	const mesh = new THREE.Mesh(getPartGeometry(part.shape), material);
	if (part.shape === Shape.Plane) {
		(mesh.material as THREE.Material).side = THREE.DoubleSide;
	}
	return mesh;
}

/**
 * Creates a builder part as a world entity.
 *
 * Mirrors createObject's ECS wiring -- and reuses its transform binding --
 * so a part is selectable, outline-able, gizmo-able and replicable by
 * exactly the same code paths that already handle furniture. The whole point
 * of describing parts as Objects (spec §0.2) is that none of that had to be
 * written twice.
 */
export const createPrimitive = (
	world: World,
	name: string,
	part: Part,
): Primitive => {
	const eid = addEntity(world);

	addComponent(world, ObjectComponent, eid);
	addComponent(world, TransformComponent, eid);
	addComponent(world, PrimitiveComponent, eid);

	TransformComponent.scale.x[eid] = 1;
	TransformComponent.scale.y[eid] = 1;
	TransformComponent.scale.z[eid] = 1;

	const group = new THREE.Group();
	group.add(createPartMesh(part));

	const entity = Object.assign(group, { eid });
	entity.name = `${name} (Part)`;
	bindTransformToEcs(entity, eid);

	world.primitives.set(eid, part);
	return entity;
};
