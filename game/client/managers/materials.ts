import * as THREE from "three";

/**
 * The built-in material set for builder parts.
 *
 * Indices are persisted in every room's object blob, so this list is
 * append-only: never renumber, never remove.
 *
 * M3 ships flat colours only. Textured entries arrive with the material
 * palette (spec M5), at which point each entry grows a map and parts need
 * world-space UVs -- a 4x3x0.2 box would otherwise show its texture smeared
 * four times along one face and once along another, which is the single most
 * visible "homemade builder" tell.
 */
export type MaterialDefinition = {
	name: string;
	/** Multiplied with the part's own tint. */
	baseColor: number;
	roughness: number;
	metalness: number;
	opacity: number;
};

export const PART_MATERIALS: MaterialDefinition[] = [
	{
		name: "Plastic",
		baseColor: 0xffffff,
		roughness: 0.7,
		metalness: 0,
		opacity: 1,
	},
	{
		name: "Smooth",
		baseColor: 0xffffff,
		roughness: 0.25,
		metalness: 0,
		opacity: 1,
	},
	{
		name: "Matte",
		baseColor: 0xffffff,
		roughness: 1,
		metalness: 0,
		opacity: 1,
	},
	{
		name: "Metal",
		baseColor: 0xffffff,
		roughness: 0.35,
		metalness: 0.9,
		opacity: 1,
	},
	{
		name: "Glass",
		baseColor: 0xffffff,
		roughness: 0.05,
		metalness: 0,
		opacity: 0.35,
	},
	{
		name: "Neon",
		baseColor: 0xffffff,
		roughness: 1,
		metalness: 0,
		opacity: 1,
	},
	{
		name: "Wood",
		baseColor: 0xc99a5b,
		roughness: 0.85,
		metalness: 0,
		opacity: 1,
	},
	{
		name: "Stone",
		baseColor: 0x9a9a94,
		roughness: 0.95,
		metalness: 0,
		opacity: 1,
	},
];

/** Index of the material a freshly placed part gets. */
export const DEFAULT_PART_MATERIAL = 0;

/**
 * Materials are shared between every part that asks for the same look.
 *
 * Deliberately not `material.clone()`: three's cloneUniforms clones textures
 * too, which pins the GPU copy for the lifetime of the clone. The SWF stream
 * renderer already had to learn this the hard way (swf-avatar-rendering.md
 * §14.6). Nothing here is textured yet, but the palette lands in M5 and the
 * habit has to be in place before it does.
 */
const cache = new Map<string, THREE.Material>();

export function getPartMaterial(
	material: number,
	color: number,
): THREE.Material {
	const index =
		material >= 0 && material < PART_MATERIALS.length ? material : 0;
	const key = `${index}:${color}`;
	const cached = cache.get(key);
	if (cached !== undefined) return cached;

	const definition = PART_MATERIALS[index];
	const created = new THREE.MeshStandardMaterial({
		color: new THREE.Color(color).multiply(
			new THREE.Color(definition.baseColor),
		),
		roughness: definition.roughness,
		metalness: definition.metalness,
		transparent: definition.opacity < 1,
		opacity: definition.opacity,
		// Neon reads as lit-from-within rather than lit-by-the-room.
		emissive:
			definition.name === "Neon"
				? new THREE.Color(color)
				: new THREE.Color(0x000000),
		emissiveIntensity: definition.name === "Neon" ? 0.8 : 0,
		side: THREE.FrontSide,
	});
	cache.set(key, created);
	return created;
}

/** The translucent stand-in drawn while a part is being positioned. */
export function createGhostMaterial(): THREE.Material {
	return new THREE.MeshBasicMaterial({
		color: 0x44ff88,
		transparent: true,
		opacity: 0.45,
		depthWrite: false,
	});
}
