import * as THREE from "three";
import { getPartTexture } from "./textures";

/**
 * The built-in material set for builder parts.
 *
 * Indices are persisted in every room's object blob, so this list is
 * append-only: never renumber, never remove.
 *
 * Textures are greyscale patterns drawn at runtime (managers/textures.ts) and
 * tinted by the part's own colour, so one wood pattern serves every colour of
 * wood. Textured materials need world-space UVs to go with them -- see
 * applyWorldUVs in factory/primitive.ts -- because a 4x3x0.2 box would
 * otherwise show its pattern smeared four times along one face and once along
 * another, which is the most visible "homemade builder" tell there is.
 */
export type MaterialDefinition = {
	name: string;
	/** Multiplied with the part's own tint. */
	baseColor: number;
	roughness: number;
	metalness: number;
	opacity: number;
	/** Tiling pattern from managers/textures.ts, or null for a flat fill. */
	texture: string | null;
};

export const PART_MATERIALS: MaterialDefinition[] = [
	{
		name: "Plastic",
		baseColor: 0xffffff,
		roughness: 0.7,
		metalness: 0,
		opacity: 1,
		texture: null,
	},
	{
		name: "Smooth",
		baseColor: 0xffffff,
		roughness: 0.25,
		metalness: 0,
		opacity: 1,
		texture: null,
	},
	{
		name: "Matte",
		baseColor: 0xffffff,
		roughness: 1,
		metalness: 0,
		opacity: 1,
		texture: "concrete",
	},
	{
		name: "Metal",
		baseColor: 0xffffff,
		roughness: 0.35,
		metalness: 0.9,
		opacity: 1,
		texture: null,
	},
	{
		name: "Glass",
		baseColor: 0xffffff,
		roughness: 0.05,
		metalness: 0,
		opacity: 0.35,
		texture: null,
	},
	{
		name: "Neon",
		baseColor: 0xffffff,
		roughness: 1,
		metalness: 0,
		opacity: 1,
		texture: null,
	},
	{
		name: "Wood",
		baseColor: 0xc99a5b,
		roughness: 0.85,
		metalness: 0,
		opacity: 1,
		texture: "planks",
	},
	{
		name: "Stone",
		baseColor: 0x9a9a94,
		roughness: 0.95,
		metalness: 0,
		opacity: 1,
		texture: "bricks",
	},
];

/**
 * Materials the server will accept, and the number it validates against.
 *
 * Persisted in every room, so this list is append-only. The server keeps its
 * own copy of the count (partMaterialCount in game/server/part.go) and the
 * two have to move together -- a material the client offers and the server
 * refuses is a part that silently will not place.
 */
export const PART_MATERIAL_COUNT = PART_MATERIALS.length;

/** Index of the material a freshly placed part gets. */
export const DEFAULT_PART_MATERIAL = 0;

/**
 * Materials are shared between every part that asks for the same look.
 *
 * Deliberately not `material.clone()`: three's cloneUniforms clones textures
 * too, which pins the GPU copy for the lifetime of the clone. The SWF stream
 * renderer already had to learn this the hard way (swf-avatar-rendering.md
 * §14.6). Now that materials carry maps, that is not a habit but a hard
 * requirement: every part in Wood shares one texture, and cloning would give
 * each of them their own copy of it.
 */
const cache = new Map<string, THREE.Material>();

/** Whether a material carries a texture, and so needs world-space UVs. */
export function materialIsTextured(material: number): boolean {
	const definition = PART_MATERIALS[material];
	return definition !== undefined && definition.texture !== null;
}

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
	const map = definition.texture ? getPartTexture(definition.texture) : null;
	const created = new THREE.MeshStandardMaterial({
		map,
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
