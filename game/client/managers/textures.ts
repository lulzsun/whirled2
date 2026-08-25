import * as THREE from "three";

/**
 * Tiling textures for builder materials, drawn at runtime onto a canvas.
 *
 * Generated rather than shipped as image files, for the reason the whole
 * project is one executable: an asset is another thing to serve, cache, and
 * keep in step with a material index that is persisted in every room. A few
 * hundred lines of canvas drawing has no such tail. They are also greyscale
 * by design -- the part's tint multiplies through, so one wood texture makes
 * every colour of wood.
 *
 * Each is drawn to tile seamlessly at the edges, since a wall is many
 * repeats of one square and a visible seam every unit is worse than no
 * texture at all.
 */

const TEXTURE_SIZE = 256;

function createCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
	const canvas = document.createElement("canvas");
	canvas.width = TEXTURE_SIZE;
	canvas.height = TEXTURE_SIZE;
	const context = canvas.getContext("2d")!;
	return [canvas, context];
}

/** Value noise, used to break up flat fills so they read as a surface. */
function speckle(
	context: CanvasRenderingContext2D,
	amount: number,
	alpha: number,
) {
	for (let i = 0; i < amount; i++) {
		const x = Math.random() * TEXTURE_SIZE;
		const y = Math.random() * TEXTURE_SIZE;
		const shade = Math.floor(Math.random() * 255);
		context.fillStyle = `rgba(${shade},${shade},${shade},${alpha})`;
		context.fillRect(x, y, 2, 2);
	}
}

function drawPlanks(context: CanvasRenderingContext2D) {
	context.fillStyle = "#b9b9b9";
	context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

	const plankHeight = TEXTURE_SIZE / 4;
	for (let i = 0; i < 4; i++) {
		const y = i * plankHeight;
		const shade = 176 + ((i * 37) % 40);
		context.fillStyle = `rgb(${shade},${shade},${shade})`;
		context.fillRect(0, y, TEXTURE_SIZE, plankHeight - 2);

		// grain
		context.strokeStyle = "rgba(0,0,0,0.10)";
		context.lineWidth = 1;
		for (let g = 0; g < 5; g++) {
			const gy = y + 4 + Math.random() * (plankHeight - 10);
			context.beginPath();
			context.moveTo(0, gy);
			context.bezierCurveTo(
				TEXTURE_SIZE * 0.3,
				gy + (Math.random() * 4 - 2),
				TEXTURE_SIZE * 0.6,
				gy + (Math.random() * 4 - 2),
				TEXTURE_SIZE,
				gy,
			);
			context.stroke();
		}

		// the gap between boards, drawn at both ends so the tile wraps
		context.fillStyle = "rgba(0,0,0,0.28)";
		context.fillRect(0, y + plankHeight - 2, TEXTURE_SIZE, 2);
	}
}

function drawBricks(context: CanvasRenderingContext2D) {
	context.fillStyle = "#8a8a8a";
	context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

	const rows = 8;
	const brickHeight = TEXTURE_SIZE / rows;
	const brickWidth = TEXTURE_SIZE / 4;
	const mortar = 3;

	for (let row = 0; row < rows; row++) {
		const y = row * brickHeight;
		// every other row offset by half a brick; the row is drawn from -half
		// so the overhang reappears on the opposite edge and the tile wraps
		const offset = row % 2 === 0 ? 0 : -brickWidth / 2;
		for (let column = -1; column <= 4; column++) {
			const x = column * brickWidth + offset;
			const shade = 190 + ((row * 7 + column * 23) % 45);
			context.fillStyle = `rgb(${shade},${shade},${shade})`;
			context.fillRect(
				x + mortar / 2,
				y + mortar / 2,
				brickWidth - mortar,
				brickHeight - mortar,
			);
		}
	}
}

function drawTiles(context: CanvasRenderingContext2D) {
	const squares = 4;
	const size = TEXTURE_SIZE / squares;
	for (let x = 0; x < squares; x++) {
		for (let y = 0; y < squares; y++) {
			const light = (x + y) % 2 === 0;
			context.fillStyle = light ? "#e8e8e8" : "#c2c2c2";
			context.fillRect(x * size, y * size, size, size);
		}
	}
	context.strokeStyle = "rgba(0,0,0,0.18)";
	context.lineWidth = 2;
	for (let i = 0; i <= squares; i++) {
		const at = i * size;
		context.beginPath();
		context.moveTo(at, 0);
		context.lineTo(at, TEXTURE_SIZE);
		context.moveTo(0, at);
		context.lineTo(TEXTURE_SIZE, at);
		context.stroke();
	}
}

function drawConcrete(context: CanvasRenderingContext2D) {
	context.fillStyle = "#cfcfcf";
	context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
	speckle(context, 9000, 0.08);
	// a few larger blotches so it does not read as uniform noise
	for (let i = 0; i < 60; i++) {
		const x = Math.random() * TEXTURE_SIZE;
		const y = Math.random() * TEXTURE_SIZE;
		const r = 4 + Math.random() * 14;
		context.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.04})`;
		context.beginPath();
		context.arc(x, y, r, 0, Math.PI * 2);
		context.fill();
	}
}

/**
 * A one-unit reference grid, for laying things out.
 *
 * Deliberately drawn as a single cell so that with world-space UVs the lines
 * fall exactly on whole world units, whatever size the part is -- which
 * makes it a ruler rather than a decoration.
 */
function drawGrid(context: CanvasRenderingContext2D) {
	context.fillStyle = "#d5d5d5";
	context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
	context.strokeStyle = "rgba(0,0,0,0.35)";
	context.lineWidth = 6;
	context.strokeRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
}

const PATTERNS: Record<string, (c: CanvasRenderingContext2D) => void> = {
	planks: drawPlanks,
	bricks: drawBricks,
	tiles: drawTiles,
	concrete: drawConcrete,
	grid: drawGrid,
};

const cache = new Map<string, THREE.Texture>();

/**
 * Returns the named tiling texture, drawing it the first time it is asked
 * for. Shared: two parts in the same material share one GPU texture, and
 * nothing ever clones them (see the note in materials.ts).
 */
export function getPartTexture(name: string): THREE.Texture | null {
	const draw = PATTERNS[name];
	if (draw === undefined) return null;

	const cached = cache.get(name);
	if (cached !== undefined) return cached;

	const [canvas, context] = createCanvas();
	draw(context);

	const texture = new THREE.CanvasTexture(canvas);
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.colorSpace = THREE.SRGBColorSpace;
	// A wall seen edge-on covers many repeats in a few pixels; without
	// mipmaps and anisotropy that shimmers badly as the camera moves.
	texture.generateMipmaps = true;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.anisotropy = 4;
	cache.set(name, texture);
	return texture;
}
