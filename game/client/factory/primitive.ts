import * as THREE from "three";
import { addComponent, addEntity } from "bitecs";

import {
	ObjectComponent,
	PrimitiveComponent,
	TransformComponent,
} from "../components";
import { World } from "./world";
import { Part, Shape } from "../proto";
import { getPartMaterial, materialIsTextured } from "../managers/materials";
import { bindTransformToEcs } from "./object";

export type Primitive = THREE.Group & { eid: number };

/**
 * Unit geometry, one instance per shape, shared by every part using it.
 *
 * Every shape is built to fit a 1x1x1 box centred on its origin, because a
 * part's size is its Scale (spec §0.3) -- the scale gizmo is the resize tool,
 * and that only works if every shape starts from the same cube.
 *
 * Shared only for untextured parts. A textured part needs UVs measured in
 * world units (applyWorldUVs), and UVs live on the geometry, so it gets a
 * clone of its own -- which is why this is a lookup behind a function rather
 * than a field anyone can reach for.
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

/** Whether a geometry is one of the shared unit shapes, not a per-part clone. */
export function isSharedGeometry(geometry: THREE.BufferGeometry): boolean {
	for (const shared of geometryCache.values()) {
		if (shared === geometry) return true;
	}
	return false;
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

/**
 * Rewrites a geometry's UVs so its texture is measured in world units.
 *
 * Without this, a texture is stretched across whatever the part happens to
 * be: scale a box into a 4x3x0.2 wall and the brick pattern repeats four
 * times along one face, three along another and once across the thin edge --
 * three different brick sizes on one object. Roblox measures its textures in
 * studs for exactly this reason, and it is the difference between a builder
 * that looks authored and one that looks improvised.
 *
 * A box gets its faces handled individually, because each face spans a
 * different pair of the part's dimensions. Everything else is wrapped
 * proportionally, which is not strictly correct for a sphere but is right
 * for the cylinders and cones people actually build with.
 */
function applyWorldUVs(
	geometry: THREE.BufferGeometry,
	shape: Shape,
	scale: THREE.Vector3,
	uvScale: number,
): void {
	const uv = geometry.getAttribute("uv") as THREE.BufferAttribute | undefined;
	if (uv === undefined) return;

	const sx = Math.abs(scale.x) * uvScale;
	const sy = Math.abs(scale.y) * uvScale;
	const sz = Math.abs(scale.z) * uvScale;

	if (shape === Shape.Box) {
		// three builds a box as six 4-vertex faces in the order
		// +X, -X, +Y, -Y, +Z, -Z. Each spans the two dimensions it does not
		// face along.
		const spans: [number, number][] = [
			[sz, sy],
			[sz, sy],
			[sx, sz],
			[sx, sz],
			[sx, sy],
			[sx, sy],
		];
		for (let face = 0; face < 6; face++) {
			const [u, v] = spans[face];
			for (let corner = 0; corner < 4; corner++) {
				const i = face * 4 + corner;
				uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v);
			}
		}
	} else {
		const u = shape === Shape.Plane ? sx : (sx + sz) / 2;
		const v = sy;
		for (let i = 0; i < uv.count; i++) {
			uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v);
		}
	}
	uv.needsUpdate = true;
}

/**
 * Builds the mesh for a part, without any ECS or networking attached.
 *
 * `scale` is the size the part is about to be given. It is needed here, not
 * just on the transform, because a textured part's UVs are computed from its
 * world size and so its geometry cannot be the shared unit one.
 */
export function createPartMesh(
	part: Part,
	scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1),
): THREE.Mesh {
	const material = getPartMaterial(part.material, part.color);

	// Untextured parts keep the shared geometry -- there is nothing to
	// measure, and one BoxGeometry for every plastic box in the room is worth
	// having.
	const geometry = materialIsTextured(part.material)
		? getPartGeometry(part.shape).clone()
		: getPartGeometry(part.shape);
	if (materialIsTextured(part.material)) {
		applyWorldUVs(geometry, part.shape, scale, part.uvScale || 1);
	}

	const mesh = new THREE.Mesh(geometry, material);
	if (part.shape === Shape.Plane) {
		(mesh.material as THREE.Material).side = THREE.DoubleSide;
	}
	return mesh;
}

/**
 * The world size a mesh's UVs were computed for.
 *
 * Kept on the mesh so a resize can tell whether the texture still measures
 * correctly without recomputing it to find out. Untextured parts never get
 * one, which is also how syncPartMeshScale knows to leave them alone.
 */
const BUILT_FOR = "__uvBuiltFor";

/**
 * Rebuilds a part's UVs if it has been resized since they were computed.
 *
 * Called when a scale change *commits* -- the end of a gizmo drag, or a
 * transform arriving from another client -- and never per frame. Rebuilding
 * a geometry on every frame of a drag would be wasteful and, worse, would
 * churn GPU buffers for a size the player is still choosing.
 */
export function syncPartMeshScale(
	entity: THREE.Object3D,
	part: Part | undefined,
	scale: THREE.Vector3,
): void {
	if (part === undefined || !materialIsTextured(part.material)) return;
	const mesh = entity.children[0] as THREE.Mesh | undefined;
	if (mesh === undefined) return;

	//@ts-ignore: our own bookkeeping, not a three.js field
	const builtFor = mesh[BUILT_FOR] as THREE.Vector3 | undefined;
	if (
		builtFor !== undefined &&
		Math.abs(builtFor.x - scale.x) < 1e-6 &&
		Math.abs(builtFor.y - scale.y) < 1e-6 &&
		Math.abs(builtFor.z - scale.z) < 1e-6
	) {
		return;
	}
	refreshPartMesh(entity, part, scale);
}

/**
 * Rebuilds a part's mesh in place, after its description or size changed.
 *
 * Disposes the geometry it replaces, but only when that geometry was this
 * part's own clone -- the shared unit geometries are used by every other
 * untextured part in the room and disposing one would blank them all.
 */
export function refreshPartMesh(
	entity: THREE.Object3D,
	part: Part,
	scale: THREE.Vector3,
): void {
	const existing = entity.children[0] as THREE.Mesh | undefined;
	const replacement = createPartMesh(part, scale);

	if (existing !== undefined) {
		entity.remove(existing);
		if (!isSharedGeometry(existing.geometry)) existing.geometry.dispose();
	}
	//@ts-ignore: remember what these UVs measure, for syncPartMeshScale
	replacement[BUILT_FOR] = scale.clone();
	entity.add(replacement);
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
	// Built at unit size; the caller writes the real scale into the
	// transform straight after, and the network handler calls
	// refreshPartMesh once it has, so textured UVs get the true size.
	group.add(createPartMesh(part));

	const entity = Object.assign(group, { eid });
	entity.name = `${name} (Part)`;
	bindTransformToEcs(entity, eid);

	world.primitives.set(eid, part);
	return entity;
};
