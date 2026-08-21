import * as THREE from "three";

// Consumes the draw-command stream emitted by our Ruffle fork's
// `ruffle_render_stream` backend and renders it with three.js, into a render
// target the caller owns. See docs/specs/swf-avatar-rendering.md (W2).
//
// Nothing here rasterizes Flash content itself. Ruffle has already tessellated
// every shape into triangles and flattened the display list into a painter-order
// draw list; this just replays that with the world's own WebGL context.

/** Event discriminants, mirrored from render/stream/src/js_sink.rs. */
const EVENT_SHAPE = 0;
const EVENT_BITMAP = 1;
const EVENT_FRAME = 2;
const EVENT_BITMAP_UPDATE = 3;

/** Draw-kind discriminants within a shape. */
const KIND_COLOR = 0;
const KIND_GRADIENT = 1;
const KIND_BITMAP = 2;

/** Opcodes within a packed frame record. */
const OP_DRAW_SHAPE = 0;
const OP_DRAW_BITMAP = 1;
const OP_DRAW_RECT = 2;
const OP_PUSH_MASK = 3;
const OP_ACTIVATE_MASK = 4;
const OP_DEACTIVATE_MASK = 5;
const OP_POP_MASK = 6;
const OP_BEGIN_BLEND = 7;
const OP_END_BLEND = 8;

/** Floats per packed record; must match RECORD_STRIDE in js_sink.rs. */
const RECORD_STRIDE = 18;

/** Flash works in twips: 20 per pixel. */
const TWIPS_PER_PIXEL = 20;

type GradientSpec = {
	/** 0 linear, 1 radial, 2 focal. */
	kind: number;
	/** 0 clamp, 1 repeat, 2 mirror. */
	repeat: number;
	/** 0 sRGB, 1 linear RGB. */
	interpolation: number;
	focalPoint: number;
	ratios: Float32Array;
	/** Flattened rgba per stop. */
	colors: Float32Array;
};

type ShapeEvent = {
	event: typeof EVENT_SHAPE;
	id: number;
	/** Indexed by a gradient draw's `gradient` field. Local to this shape. */
	gradients: GradientSpec[];
	draws: {
		kind: number;
		gradient?: number;
		bitmap?: number;
		matrix?: Float32Array;
		smoothed?: boolean;
		repeating?: boolean;
		vertices: Float32Array;
		indices: Uint32Array;
	}[];
};

type BitmapEvent = {
	event: typeof EVENT_BITMAP | typeof EVENT_BITMAP_UPDATE;
	id: number;
	width: number;
	height: number;
	rgba: Uint8Array;
};

type FrameEvent = {
	event: typeof EVENT_FRAME;
	count: number;
	stride: number;
	/** Pixel viewport Ruffle scaled its transforms into. */
	width: number;
	height: number;
	clear: Float32Array;
	records: Float32Array;
};

export type StreamEvent = ShapeEvent | BitmapEvent | FrameEvent;

/**
 * Where a draw sits relative to the enclosing mask.
 *
 * Flash masks arrive as a marker sequence — push, mask geometry, activate,
 * masked content, deactivate, mask geometry again, pop — and the geometry
 * before `activate` and after `deactivate` is stencil bookkeeping rather than
 * something to be drawn.
 */
const enum MaskPhase {
	/** Outside any mask, or drawing the content a mask applies to. */
	Drawing,
	/** Stamping the mask region into the stencil buffer. */
	Writing,
	/** Replaying the mask region to undo the stamp. */
	Clearing,
}

/** One tessellated sub-draw, uploaded once and reused every frame. */
type ShapeDraw = {
	geometry: THREE.BufferGeometry;
	/**
	 * Builds a material for one use of this draw, sharing textures with every
	 * other use. Deliberately not `material.clone()`: three's `cloneUniforms`
	 * calls `.clone()` on anything `isTexture`, so cloning a gradient material
	 * clones its ramp. The copies share a `source`, so the GPU texture is not
	 * duplicated — but each copy increments that source's `usedTimes`, and
	 * nothing ever decrements it, so the ramp can never be released. A single
	 * avatar leaked around thirty textures that survived its own teardown.
	 */
	make: () => THREE.Material;
	/** Materials for the 1st, 2nd, ... use of this draw within one frame. */
	instances: THREE.Material[];
	/** Uses so far in the frame being built. */
	used: number;
};

/** What a renderer needs from the world it belongs to. */
type StreamHost = { swfStreams: Set<SwfStreamRenderer> };

/** A unit quad with its origin at the top-left, as bitmap draws expect. */
function bitmapQuad(): THREE.PlaneGeometry {
	const geometry = new THREE.PlaneGeometry(1, 1);
	geometry.translate(0.5, 0.5, 0);
	return geometry;
}

/** Scratch for single-texel readbacks in `alphaAt`. */
const texelScratch = new Uint8Array(4);

/** Scratch for saving the renderer's clear colour across a composition. */
const savedClearColor = new THREE.Color();

/**
 * Compose every SWF stream in `world` that has a new frame waiting.
 *
 * Must be called from the render system, before the composer runs: these share
 * the world's renderer, and composing from a timer or a message handler lands
 * at an undefined point relative to the composer's passes.
 */
export function composeSwfStreams(world: {
	renderer: THREE.WebGLRenderer;
	swfStreams: Set<SwfStreamRenderer>;
}) {
	for (const stream of world.swfStreams) {
		if (stream.needsRender) stream.render(world.renderer);
	}
}

/**
 * Renders one SWF's command stream into a `THREE.WebGLRenderTarget`.
 *
 * One instance per avatar. The caller drives it: feed events in with
 * `handleEvent`, then read `texture` for the most recently composed frame.
 */
export class SwfStreamRenderer {
	/** The composed frame. Sample this from the avatar's billboard. */
	public readonly target: THREE.WebGLRenderTarget;

	private readonly scene = new THREE.Scene();
	private readonly camera: THREE.OrthographicCamera;

	private readonly shapes = new Map<number, ShapeDraw[]>();
	private readonly bitmaps = new Map<number, THREE.DataTexture>();

	/** Gradient ramps, owned here so they can be disposed with the renderer. */
	private readonly ownedTextures: THREE.DataTexture[] = [];

	/** Draws used by the frame being composed, so their pools can be reset. */
	private activeDraws: ShapeDraw[] = [];

	/** Pooled quads for bitmap draws, keyed by bitmap id. */
	private readonly bitmapMeshes = new Map<
		number,
		{ meshes: THREE.Mesh[]; used: number }
	>();

	/** Set when a frame arrived that has not been composed yet. */
	private dirty = false;

	/**
	 * How many frames have been composed into the target.
	 *
	 * Callers that size or sample the texture need to know it holds something;
	 * composition happens in the render system, not when a frame arrives.
	 */
	public composedFrames = 0;
	private lastFrame: FrameEvent | null = null;

	private disposed = false;

	/** Current output size, taken from the stream. */
	public width = 0;
	public height = 0;

	/**
	 * Draw every command unmasked, ignoring stencil state. A debugging aid for
	 * telling "the mask is wrong" apart from "the geometry never arrived".
	 */
	public ignoreMasks = false;

	/**
	 * The target is sized from the first frame's viewport rather than from a
	 * constructor argument, because Ruffle bakes the stage-to-viewport scale
	 * into the transforms it emits. Sizing from anything else puts every draw
	 * in the wrong place.
	 */
	constructor(private readonly world: StreamHost) {
		// depthBuffer must stay on even though nothing depth-tests: WebGL
		// exposes stencil through a combined DEPTH_STENCIL attachment, so
		// asking for stencil without depth silently yields no stencil at all
		// and every masked draw fails its test (symptom: masked content simply
		// missing, unmasked content fine).
		this.target = new THREE.WebGLRenderTarget(1, 1, {
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter,
			format: THREE.RGBAFormat,
			depthBuffer: true,
			stencilBuffer: true,
		});

		// Flash's origin is top-left with y growing downward, so the camera is
		// set up flipped rather than flipping every matrix.
		this.camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1000, 1000);
		this.camera.position.z = 1;

		world.swfStreams.add(this);
	}

	/** Resize output to match the viewport Ruffle is rendering for. */
	private resize(width: number, height: number) {
		if (width === this.width && height === this.height) return;
		if (width <= 0 || height <= 0) return;

		this.width = width;
		this.height = height;
		this.target.setSize(width, height);

		this.camera.left = 0;
		this.camera.right = width;
		this.camera.top = 0;
		this.camera.bottom = height;
		this.camera.updateProjectionMatrix();
	}

	public handleEvent(event: StreamEvent) {
		if (this.disposed) return;
		switch (event.event) {
			case EVENT_SHAPE:
				this.registerShape(event);
				break;
			case EVENT_BITMAP:
			case EVENT_BITMAP_UPDATE:
				this.registerBitmap(event);
				break;
			case EVENT_FRAME:
				this.resize(event.width, event.height);
				this.lastFrame = event;
				this.dirty = true;
				break;
		}
	}

	/** True when a new frame has arrived since the last `render`. */
	public get needsRender() {
		return this.dirty;
	}

	/**
	 * Compose the most recent frame into the render target.
	 *
	 * Uses the caller's renderer — the same WebGL context as the world — so no
	 * readback or cross-context copy is involved. Skipped entirely when no new
	 * frame has arrived, which is most display frames since SWFs typically run
	 * at 12-30fps against a 60fps render loop.
	 *
	 * Borrowing the world's renderer means borrowing its state. `EffectComposer`
	 * and especially `OutlinePass` drive `renderer.state` directly rather than
	 * through materials — the outline pass toggles the stencil test and swaps
	 * the clear colour around its own passes — and three.js caches that state,
	 * so whatever ran last leaks in here. Masked draws depend on the stencil
	 * buffer, so the leak is not cosmetic: it decides whether anything is drawn
	 * at all. Everything this touches is therefore saved and restored, and the
	 * state cache is dropped on both sides so neither side inherits the other's
	 * assumptions. Call this from a fixed point in the frame (see
	 * `composeSwfStreams`), not from arbitrary timers.
	 */
	public render(renderer: THREE.WebGLRenderer) {
		if (this.disposed || !this.dirty || this.lastFrame === null) return;
		if (this.width === 0 || this.height === 0) return;

		this.buildScene(this.lastFrame);

		const previousTarget = renderer.getRenderTarget();
		const previousAutoClear = renderer.autoClear;
		const previousAlpha = renderer.getClearAlpha();
		renderer.getClearColor(savedClearColor);

		renderer.resetState();
		renderer.setRenderTarget(this.target);
		renderer.autoClear = false;
		// The frame is composited over whatever the billboard sits in front of,
		// so the background must be cleared to transparent rather than to the
		// world's clear colour.
		renderer.setClearColor(0x000000, 0);
		renderer.clear(true, true, true);
		renderer.render(this.scene, this.camera);

		// resetState() clears the cached render target as well as the GL state,
		// so it has to run before the target is put back, not after.
		renderer.resetState();
		renderer.setRenderTarget(previousTarget);
		renderer.autoClear = previousAutoClear;
		renderer.setClearColor(savedClearColor, previousAlpha);

		this.dirty = false;
		this.composedFrames++;
	}

	private registerShape(event: ShapeEvent) {
		const draws: ShapeDraw[] = [];

		// Gradient indices are local to a shape's tessellation, so ramps are
		// built per shape rather than kept in a global table.
		const ramps = (event.gradients ?? []).map((spec) => ({
			spec,
			texture: buildGradientRamp(spec),
		}));
		for (const ramp of ramps) this.ownedTextures.push(ramp.texture);

		for (const draw of event.draws) {
			const geometry = new THREE.BufferGeometry();

			// The backend interleaves [x, y, r, g, b, a] per vertex.
			const interleaved = new THREE.InterleavedBuffer(draw.vertices, 6);
			geometry.setAttribute(
				"position",
				new THREE.InterleavedBufferAttribute(interleaved, 2, 0),
			);
			geometry.setAttribute(
				"color",
				new THREE.InterleavedBufferAttribute(interleaved, 4, 2),
			);
			geometry.setIndex(new THREE.BufferAttribute(draw.indices, 1));

			draws.push({
				geometry,
				make: this.materialFactory(draw, ramps),
				instances: [],
				used: 0,
			});
		}

		this.shapes.set(event.id, draws);
	}

	private materialFactory(
		draw: ShapeEvent["draws"][number],
		ramps: { spec: GradientSpec; texture: THREE.DataTexture }[],
	): () => THREE.Material {
		const ramp =
			draw.gradient !== undefined ? ramps[draw.gradient] : undefined;
		if (
			draw.kind === KIND_GRADIENT &&
			ramp !== undefined &&
			draw.matrix !== undefined
		) {
			const matrix = draw.matrix;
			return () =>
				createGradientMaterial(ramp.texture, ramp.spec, matrix);
		}

		if (draw.kind === KIND_BITMAP && draw.bitmap !== undefined) {
			const map = this.bitmaps.get(draw.bitmap);
			if (map !== undefined) {
				return () =>
					new THREE.MeshBasicMaterial({
						map,
						transparent: true,
						depthTest: false,
						depthWrite: false,
						side: THREE.DoubleSide,
					});
			}
		}

		// KIND_COLOR uses vertex colours directly.
		if (draw.kind !== KIND_COLOR && draw.kind !== KIND_GRADIENT) {
			console.warn(`swf stream: unknown draw kind ${draw.kind}`);
		}

		return () =>
			new THREE.MeshBasicMaterial({
				vertexColors: true,
				transparent: true,
				depthTest: false,
				depthWrite: false,
				side: THREE.DoubleSide,
			});
	}

	/**
	 * The material for the next use of a draw in this frame.
	 *
	 * A shape is typically drawn many times per frame and each use carries its
	 * own colour transform and stencil state, so they cannot share one
	 * material — but they can be kept and reused frame to frame instead of
	 * being rebuilt sixty times a second.
	 */
	private takeMaterial(draw: ShapeDraw): THREE.Material {
		let material = draw.instances[draw.used];
		if (material === undefined) {
			material = draw.make();
			draw.instances[draw.used] = material;
		}
		if (draw.used === 0) this.activeDraws.push(draw);
		draw.used++;
		return material;
	}

	private registerBitmap(event: BitmapEvent) {
		const existing = this.bitmaps.get(event.id);
		if (existing !== undefined) {
			existing.dispose();
		}

		const texture = new THREE.DataTexture(
			event.rgba,
			event.width,
			event.height,
			THREE.RGBAFormat,
		);
		texture.minFilter = THREE.LinearFilter;
		texture.magFilter = THREE.LinearFilter;
		texture.needsUpdate = true;
		this.bitmaps.set(event.id, texture);
	}

	/**
	 * Rebuild the scene graph for one frame.
	 *
	 * Flash is a painter's algorithm: draw order is the only thing that decides
	 * what covers what. Depth testing is off on every material and `renderOrder`
	 * is assigned in stream order, so three.js reproduces that exactly.
	 */
	private buildScene(frame: FrameEvent) {
		this.scene.clear();
		for (const draw of this.activeDraws) draw.used = 0;
		this.activeDraws.length = 0;
		for (const pool of this.bitmapMeshes.values()) pool.used = 0;

		const records = frame.records;
		let order = 0;
		let stencilRef = 0;
		let phase = MaskPhase.Drawing;

		for (let i = 0; i < frame.count; i++) {
			const base = i * RECORD_STRIDE;
			const op = records[base];

			switch (op) {
				case OP_DRAW_SHAPE: {
					const draws = this.shapes.get(records[base + 1]);
					if (draws === undefined) break;
					for (const draw of draws) {
						const material = this.takeMaterial(draw);
						const mesh = new THREE.Mesh(draw.geometry, material);
						mesh.renderOrder = order++;
						mesh.frustumCulled = false;
						applyRecord(mesh, records, base);
						if (!this.ignoreMasks) {
							applyStencil(mesh, stencilRef, phase);
						}
						this.scene.add(mesh);
					}
					break;
				}

				case OP_DRAW_BITMAP: {
					const texture = this.bitmaps.get(records[base + 1]);
					if (texture === undefined) break;
					const mesh = this.takeBitmapMesh(
						records[base + 1],
						texture,
						order++,
					);
					applyRecord(mesh, records, base);
					// A bitmap draw is a unit quad scaled by the bitmap's size.
					mesh.scale.x *= texture.image.width;
					mesh.scale.y *= texture.image.height;
					if (!this.ignoreMasks) {
						applyStencil(mesh, stencilRef, phase);
					}
					this.scene.add(mesh);
					break;
				}

				case OP_PUSH_MASK:
					stencilRef++;
					phase = MaskPhase.Writing;
					break;

				case OP_ACTIVATE_MASK:
					phase = MaskPhase.Drawing;
					break;

				case OP_DEACTIVATE_MASK:
					phase = MaskPhase.Clearing;
					break;

				case OP_POP_MASK:
					stencilRef = Math.max(0, stencilRef - 1);
					phase = MaskPhase.Drawing;
					break;

				// Blend markers and rects are not handled yet; see §9.
				case OP_DRAW_RECT:
				case OP_BEGIN_BLEND:
				case OP_END_BLEND:
				default:
					break;
			}
		}
	}

	/**
	 * A quad for one bitmap draw.
	 *
	 * Pooled per bitmap for the same reason shape materials are: a frame can
	 * contain many draws of one bitmap, and rebuilding a geometry and material
	 * for each of them every frame is pure churn.
	 */
	private takeBitmapMesh(
		id: number,
		texture: THREE.DataTexture,
		order: number,
	): THREE.Mesh {
		let pool = this.bitmapMeshes.get(id);
		if (pool === undefined) {
			pool = { meshes: [], used: 0 };
			this.bitmapMeshes.set(id, pool);
		}
		let mesh = pool.meshes[pool.used];
		if (mesh === undefined) {
			mesh = new THREE.Mesh(
				bitmapQuad(),
				new THREE.MeshBasicMaterial({
					map: texture,
					transparent: true,
					depthTest: false,
					depthWrite: false,
					side: THREE.DoubleSide,
				}),
			);
			mesh.frustumCulled = false;
			pool.meshes[pool.used] = mesh;
		}
		pool.used++;
		// The record's scale is applied on top of this, so reset first.
		mesh.scale.set(1, 1, 1);
		mesh.renderOrder = order;
		return mesh;
	}

	/**
	 * Find the avatar's lowest opaque row, as a fraction from the top.
	 *
	 * Used to stand a billboard on the ground when the avatar does not report a
	 * preferred Y itself. This is a synchronous GPU readback, so it is done
	 * once at load rather than per frame.
	 *
	 * Note the readback is bottom-up while the SWF's own y axis points down, so
	 * row 0 of the buffer is the *bottom* of the artwork — which is exactly
	 * where the feet are, hence scanning upward from it.
	 */
	public measureBottomEdge(renderer: THREE.WebGLRenderer): number {
		if (this.width === 0 || this.height === 0) return 1;
		const pixels = new Uint8Array(this.width * this.height * 4);
		renderer.readRenderTargetPixels(
			this.target,
			0,
			0,
			this.width,
			this.height,
			pixels,
		);
		for (let row = 0; row < this.height; row++) {
			const start = row * this.width * 4;
			for (let x = 0; x < this.width; x++) {
				if (pixels[start + x * 4 + 3] > 127) {
					return (this.height - 1 - row) / this.height;
				}
			}
		}
		return 1;
	}

	/**
	 * Read one texel's alpha, for hit testing.
	 *
	 * `uv` is in texture space, so it needs no flip: the target's row 0 is its
	 * bottom, which is also where v = 0 samples.
	 */
	public alphaAt(renderer: THREE.WebGLRenderer, uv: THREE.Vector2): number {
		if (this.width === 0 || this.height === 0) return 0;
		const x = Math.min(
			this.width - 1,
			Math.max(0, Math.floor(uv.x * this.width)),
		);
		const y = Math.min(
			this.height - 1,
			Math.max(0, Math.floor(uv.y * this.height)),
		);
		renderer.readRenderTargetPixels(this.target, x, y, 1, 1, texelScratch);
		return texelScratch[3];
	}

	public dispose() {
		this.disposed = true;
		this.world.swfStreams.delete(this);
		for (const draws of this.shapes.values()) {
			for (const draw of draws) {
				draw.geometry.dispose();
				for (const material of draw.instances) material.dispose();
				draw.instances.length = 0;
			}
		}
		this.shapes.clear();
		for (const texture of this.bitmaps.values()) texture.dispose();
		this.bitmaps.clear();
		for (const pool of this.bitmapMeshes.values()) {
			for (const mesh of pool.meshes) {
				mesh.geometry.dispose();
				(mesh.material as THREE.Material).dispose();
			}
		}
		this.bitmapMeshes.clear();
		for (const texture of this.ownedTextures) texture.dispose();
		this.ownedTextures.length = 0;
		this.activeDraws.length = 0;
		this.target.dispose();
	}
}

/** Resolution of a baked gradient ramp. Flash allows at most 15 stops. */
const RAMP_SIZE = 256;

/** sRGB -> linear, per component. Matches Ruffle's srgb_to_linear. */
function srgbToLinear(c: number): number {
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Bake a gradient's stops into a 1D ramp texture.
 *
 * For a linearRGB gradient, Ruffle converts the stops to linear space, mixes
 * there, and converts the result back to sRGB in the shader. That is
 * reproduced exactly: the conversion in happens here, the conversion out
 * happens in the fragment shader.
 */
function buildGradientRamp(spec: GradientSpec): THREE.DataTexture {
	const count = spec.ratios.length;
	const data = new Uint8Array(RAMP_SIZE * 4);

	const stopColor = (index: number) => {
		const base = index * 4;
		const rgba: [number, number, number, number] = [
			spec.colors[base],
			spec.colors[base + 1],
			spec.colors[base + 2],
			spec.colors[base + 3],
		];
		if (spec.interpolation !== 0) {
			rgba[0] = srgbToLinear(rgba[0]);
			rgba[1] = srgbToLinear(rgba[1]);
			rgba[2] = srgbToLinear(rgba[2]);
		}
		return rgba;
	};

	if (count === 0) {
		return makeRampTexture(data);
	}

	let next = 0;
	for (let i = 0; i < RAMP_SIZE; i++) {
		const t = i / (RAMP_SIZE - 1);

		// Stops are ordered, so this walks forward rather than searching.
		while (next < count - 1 && spec.ratios[next + 1] < t) next++;

		const lowIndex = next;
		const highIndex = Math.min(next + 1, count - 1);
		const low = spec.ratios[lowIndex];
		const high = spec.ratios[highIndex];
		const span = high - low;
		const mix = span > 0 ? Math.min(1, Math.max(0, (t - low) / span)) : 0;

		const a = stopColor(lowIndex);
		const b = stopColor(highIndex);
		for (let c = 0; c < 4; c++) {
			data[i * 4 + c] = Math.round(255 * (a[c] + (b[c] - a[c]) * mix));
		}
	}

	return makeRampTexture(data);
}

function makeRampTexture(data: Uint8Array): THREE.DataTexture {
	const texture = new THREE.DataTexture(data, RAMP_SIZE, 1, THREE.RGBAFormat);
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	// The ramp holds raw values (possibly linear-space); three must not apply
	// its own colour conversion on top.
	texture.encoding = THREE.LinearEncoding;
	texture.needsUpdate = true;
	return texture;
}

const GRADIENT_VERTEX_SHADER = `
uniform mat3 uGradientMatrix;
varying vec2 vGradientUv;
void main() {
	vGradientUv = (uGradientMatrix * vec3(position.xy, 1.0)).xy;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// A direct port of Ruffle's gradient.frag, with the 15-stop if-chain replaced
// by a lookup into the baked ramp.
const GRADIENT_FRAGMENT_SHADER = `
uniform sampler2D uRamp;
uniform int uKind;
uniform int uRepeat;
uniform int uInterpolation;
uniform float uFocalPoint;
uniform vec4 uMult;
uniform vec4 uAdd;
varying vec2 vGradientUv;

vec3 linearToSrgb(vec3 linear) {
	vec3 a = 12.92 * linear;
	vec3 b = 1.055 * pow(linear, vec3(1.0 / 2.4)) - 0.055;
	vec3 c = step(vec3(0.0031308), linear);
	return mix(a, b, c);
}

void main() {
	float t;
	if (uKind == 0) {
		t = vGradientUv.x;
	} else if (uKind == 1) {
		t = length(vGradientUv * 2.0 - 1.0);
	} else {
		vec2 uv = vGradientUv * 2.0 - 1.0;
		vec2 d = vec2(uFocalPoint, 0.0) - uv;
		float l = length(d);
		d /= l;
		t = l / (sqrt(1.0 - uFocalPoint * uFocalPoint * d.y * d.y) + uFocalPoint * d.x);
	}

	if (uRepeat == 0) {
		t = clamp(t, 0.0, 1.0);
	} else if (uRepeat == 1) {
		t = fract(t);
	} else {
		if (t < 0.0) t = -t;
		if (int(mod(t, 2.0)) == 0) {
			t = fract(t);
		} else {
			t = 1.0 - fract(t);
		}
	}

	vec4 color = texture2D(uRamp, vec2(t, 0.5));

	// Ruffle applies the colour transform to each stop before mixing. The
	// transform is affine, so applying it after the mix is equivalent (up to
	// clamping of out-of-range endpoints) and costs one operation instead of
	// two.
	color = clamp(uMult * color + uAdd, 0.0, 1.0);

	if (uInterpolation != 0) {
		color.rgb = linearToSrgb(color.rgb);
	}

	if (color.a < 0.001) discard;
	gl_FragColor = color;
}
`;

function createGradientMaterial(
	ramp: THREE.DataTexture,
	spec: GradientSpec,
	matrix: Float32Array,
): THREE.ShaderMaterial {
	return new THREE.ShaderMaterial({
		uniforms: {
			uRamp: { value: ramp },
			uKind: { value: spec.kind },
			uRepeat: { value: spec.repeat },
			uInterpolation: { value: spec.interpolation },
			uFocalPoint: { value: spec.focalPoint },
			uMult: { value: new THREE.Vector4(1, 1, 1, 1) },
			uAdd: { value: new THREE.Vector4(0, 0, 0, 0) },
			// The tessellator's `[[f32; 3]; 3]` is an array of *columns*, not
			// rows — wgpu copies each entry straight into a mat4 column — so
			// this arrives column-major and `fromArray` consumes it as such.
			// `set()` would transpose it, which drops the translation terms
			// out of the multiply and leaves every fill flat at one end of
			// its ramp.
			uGradientMatrix: {
				value: new THREE.Matrix3().fromArray(matrix),
			},
		},
		vertexShader: GRADIENT_VERTEX_SHADER,
		fragmentShader: GRADIENT_FRAGMENT_SHADER,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		side: THREE.DoubleSide,
	});
}

/**
 * Apply a record's affine transform and colour transform to a mesh.
 *
 * Flash matrices are `[a, b, c, d, tx, ty]` with the translation in twips.
 */
function applyRecord(mesh: THREE.Mesh, records: Float32Array, base: number) {
	const a = records[base + 2];
	const b = records[base + 3];
	const c = records[base + 4];
	const d = records[base + 5];
	// The two halves of the transform are in different units, which is easy to
	// get wrong in both directions: Ruffle's tessellator emits vertices already
	// in *pixels*, while the translation from the display list is in *twips*.
	// So a/b/c/d apply to the vertices unchanged and only tx/ty are converted.
	// (Measured, not assumed: shape vertices span ~±50 while tx is ~5400.)
	const tx = records[base + 6] / TWIPS_PER_PIXEL;
	const ty = records[base + 7] / TWIPS_PER_PIXEL;

	mesh.matrixAutoUpdate = false;
	mesh.matrix.set(a, c, 0, tx, b, d, 0, ty, 0, 0, 1, 0, 0, 0, 0, 1);
	mesh.matrixWorldNeedsUpdate = true;

	const material = mesh.material as THREE.Material;

	if (material instanceof THREE.ShaderMaterial) {
		// The gradient shader applies the full colour transform itself.
		material.uniforms.uMult.value.set(
			records[base + 8],
			records[base + 9],
			records[base + 10],
			records[base + 11],
		);
		material.uniforms.uAdd.value.set(
			records[base + 12],
			records[base + 13],
			records[base + 14],
			records[base + 15],
		);
		return;
	}

	// MeshBasicMaterial can only express the alpha term; full RGB
	// multiply/add would need its own shader. Alpha alone covers fades, which
	// is what avatars actually use it for.
	const alphaMultiply = records[base + 11];
	if (alphaMultiply < 1) {
		(material as THREE.MeshBasicMaterial).opacity = Math.max(
			0,
			Math.min(1, alphaMultiply),
		);
	}
}

/**
 * Map Flash's mask state onto three.js stencil parameters.
 *
 * While a mask region is being drawn, write the reference value and draw no
 * colour. Afterwards, draws test against it.
 */
function applyStencil(mesh: THREE.Mesh, ref: number, phase: MaskPhase) {
	const material = mesh.material as THREE.Material;
	if (ref === 0) {
		material.stencilWrite = false;
		return;
	}

	material.stencilWrite = true;

	switch (phase) {
		case MaskPhase.Writing:
			// Stamp the mask region with the current depth. Shape only, no
			// colour: this draw defines where later draws are allowed.
			material.stencilRef = ref;
			material.stencilFunc = THREE.AlwaysStencilFunc;
			material.stencilZPass = THREE.ReplaceStencilOp;
			material.colorWrite = false;
			break;

		case MaskPhase.Clearing:
			// Ruffle replays the mask geometry after deactivating it, to take
			// the stencil back down to the enclosing mask's depth. Writing
			// ref - 1 undoes exactly the region this mask stamped, which is
			// what makes nesting work. Invisible, like the writing pass — the
			// mask shape is a region, not artwork, and drawing it is how the
			// avatar ended up as a flat red silhouette.
			material.stencilRef = ref - 1;
			material.stencilFunc = THREE.AlwaysStencilFunc;
			material.stencilZPass = THREE.ReplaceStencilOp;
			material.colorWrite = false;
			break;

		default:
			material.stencilRef = ref;
			material.stencilFunc = THREE.EqualStencilFunc;
			material.stencilZPass = THREE.KeepStencilOp;
			material.colorWrite = true;
			break;
	}
}
