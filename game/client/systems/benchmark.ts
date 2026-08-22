import { addComponent, defineQuery, defineSystem, removeEntity } from "bitecs";
import { World } from "../factory/world";
import {
	NameplateComponent,
	PlayerComponent,
	SwfComponent,
} from "../components";
import { Avatar, createPlayer } from "../factory/player";
import { createNameplate } from "../factory/nameplate";

import { ImGui } from "imgui-js";

// M0 of docs/specs/swf-avatar-rendering.md: measure what the current SWF
// pipeline actually costs, so the fork has a baseline to beat. This system is
// dev tooling — it is inert until enabled from the console.
//
// What it measured (spec §11.3): steady-state frame rate is NOT the pipeline's
// problem — the old one held ~59 fps with 20 avatars. Spawn time was: ~2.3s
// each, ~46s for twenty, because every avatar instantiated its own wasm module
// in its own iframe. Watch the spawnMs column at least as closely as fps.
// After the M4 cutover (§14.7) the same twenty spawn in ~5s.

const swfAvatarQuery = defineQuery([SwfComponent, PlayerComponent]);
const playerQuery = defineQuery([PlayerComponent]);

/** How many recent frame intervals to keep for the live HUD readout. */
const RING_SIZE = 240;

/** Avatar counts swept by `bench.run()`, per the M0 acceptance criteria. */
const DEFAULT_SWEEP = [1, 5, 10, 20];

const DEFAULT_AVATAR = "/static/assets/avatars/guest.swf";

export type FrameStats = {
	frames: number;
	fps: number;
	avgMs: number;
	p50Ms: number;
	p95Ms: number;
	p99Ms: number;
	maxMs: number;
	drawCalls: number;
	triangles: number;
	textures: number;
	geometries: number;
};

export type SweepRow = FrameStats & {
	avatars: number;
	spawnMs: number;
};

export type BenchmarkApi = {
	show: () => void;
	hide: () => void;
	spawn: (n: number, avatarFile?: string) => Promise<number>;
	clear: () => void;
	run: (
		counts?: number[],
		opts?: { settleMs?: number; sampleMs?: number },
	) => Promise<SweepRow[]>;
	stats: () => FrameStats;
	table: (rows: SweepRow[]) => string;
};

export type Benchmark = {
	enabled: boolean;
	/** Entities spawned by the harness, so `clear()` only removes its own. */
	spawned: number[];
	api: BenchmarkApi;
};

export function createBenchmarkSystem(world: World) {
	const ring = new Float64Array(RING_SIZE);
	let ringCount = 0;
	let ringHead = 0;
	let lastFrameAt = 0;

	// Non-null only while a sample window is open.
	let sampling: number[] | null = null;

	// renderer.info resets on every renderer.render() call, and EffectComposer
	// issues several per frame, so the default reading only reflects the last
	// pass. Take manual control while benchmarking to get whole-frame totals.
	let managedInfo = false;

	// Latched per frame before the render system runs, so the HUD reports the
	// previous complete frame rather than a partially-accumulated one.
	let lastInfo = { drawCalls: 0, triangles: 0, textures: 0, geometries: 0 };

	const pushFrame = (deltaMs: number) => {
		ring[ringHead] = deltaMs;
		ringHead = (ringHead + 1) % RING_SIZE;
		if (ringCount < RING_SIZE) ringCount++;
		if (sampling !== null) sampling.push(deltaMs);
	};

	const recentFrames = (): number[] => {
		const out: number[] = [];
		for (let i = 0; i < ringCount; i++) {
			out.push(ring[(ringHead - 1 - i + RING_SIZE) % RING_SIZE]);
		}
		return out;
	};

	const statsFrom = (samples: number[]): FrameStats => {
		if (samples.length === 0) {
			return {
				frames: 0,
				fps: 0,
				avgMs: 0,
				p50Ms: 0,
				p95Ms: 0,
				p99Ms: 0,
				maxMs: 0,
				...lastInfo,
			};
		}
		const sorted = [...samples].sort((a, b) => a - b);
		const at = (q: number) =>
			sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
		const sum = samples.reduce((a, b) => a + b, 0);
		const avg = sum / samples.length;
		return {
			frames: samples.length,
			fps: avg > 0 ? 1000 / avg : 0,
			avgMs: avg,
			p50Ms: at(0.5),
			p95Ms: at(0.95),
			p99Ms: at(0.99),
			maxMs: sorted[sorted.length - 1],
			...lastInfo,
		};
	};

	/** Collect frame intervals for `durationMs`, then resolve with the stats. */
	const sample = (durationMs: number): Promise<FrameStats> => {
		sampling = [];
		return new Promise((resolve) => {
			setTimeout(() => {
				const collected = sampling ?? [];
				sampling = null;
				resolve(statsFrom(collected));
			}, durationMs);
		});
	};

	const setEnabled = (on: boolean) => {
		world.benchmark.enabled = on;
		const info = world.renderer.info;
		if (on && !managedInfo) {
			info.autoReset = false;
			managedInfo = true;
		} else if (!on && managedInfo) {
			info.autoReset = true;
			managedInfo = false;
		}
		if (!on) {
			ringCount = 0;
			ringHead = 0;
			lastFrameAt = 0;
		}
	};

	const spawnOne = async (index: number, avatarFile: string) => {
		const player = await createPlayer(
			world,
			`bench${index}`,
			false,
			Avatar.None,
			avatarFile,
			1,
		);
		const eid = player.eid;

		// Lay them out in a grid centred on the origin so they are all in
		// frame. Off-screen avatars would not be rendered and the numbers
		// would flatter the pipeline.
		const cols = 5;
		const spacing = 2;
		const col = index % cols;
		const row = Math.floor(index / cols);
		player.position.x = (col - (cols - 1) / 2) * spacing;
		player.position.y = 0;
		player.position.z = -row * spacing;

		const nameplate = createNameplate(world, `bench${index}`);
		addComponent(world, NameplateComponent, nameplate.eid);
		NameplateComponent.owner[nameplate.eid] = eid;

		world.players.set(eid, { player, nameplate });
		world.scene.add(player);
		world.benchmark.spawned.push(eid);
		return eid;
	};

	/**
	 * Spawn `n` SWF avatars. Resolves once every one has produced its first
	 * frame, since `createSwfAvatar` awaits that before returning.
	 */
	const spawn = async (n: number, avatarFile = DEFAULT_AVATAR) => {
		const start = performance.now();
		const base = world.benchmark.spawned.length;
		for (let i = 0; i < n; i++) {
			await spawnOne(base + i, avatarFile);
		}
		return performance.now() - start;
	};

	/** Remove only the avatars this harness spawned. */
	const clear = () => {
		for (const eid of world.benchmark.spawned) {
			removeEntity(world, eid);
		}
		world.benchmark.spawned = [];
	};

	/**
	 * Sweep a set of avatar counts, sampling each. Logs a markdown table ready
	 * to paste into the spec.
	 */
	const run = async (
		counts: number[] = DEFAULT_SWEEP,
		// 3s settle samples during spawn churn and produces non-monotonic
		// nonsense (24 fps at 5 avatars, 59 at 20). At 6s, repeated runs of the
		// same count agree to within 2 fps. See spec §12.6.
		{ settleMs = 6000, sampleMs = 6000 } = {},
	): Promise<SweepRow[]> => {
		setEnabled(true);
		const rows: SweepRow[] = [];

		for (const count of counts) {
			clear();
			// Let the previous run's teardown settle before spawning.
			await wait(settleMs);

			const spawnMs = await spawn(count);
			await wait(settleMs);

			const stats = await sample(sampleMs);
			rows.push({ avatars: count, spawnMs, ...stats });
			console.log(
				`[bench] ${count} avatars: ${stats.fps.toFixed(1)} fps, ` +
					`avg ${stats.avgMs.toFixed(2)}ms, p95 ${stats.p95Ms.toFixed(2)}ms`,
			);
		}

		console.log(formatTable(rows));
		return rows;
	};

	// Reachable from the console as window.game.bench (wired up in main.ts).
	world.benchmark = {
		enabled: false,
		spawned: [],
		api: {
			show: () => setEnabled(true),
			hide: () => setEnabled(false),
			spawn,
			clear,
			run,
			stats: () => statsFrom(recentFrames()),
			table: formatTable,
		},
	};

	return defineSystem((world: World) => {
		if (!world.benchmark.enabled) return world;

		const now = performance.now();
		if (lastFrameAt !== 0) pushFrame(now - lastFrameAt);
		lastFrameAt = now;

		// Latch last frame's totals, then start a fresh accumulation for this
		// frame. This system runs before the render system.
		const info = world.renderer.info;
		lastInfo = {
			drawCalls: info.render.calls,
			triangles: info.render.triangles,
			textures: info.memory.textures,
			geometries: info.memory.geometries,
		};
		info.reset();

		if (ImGui.bind === undefined) return world;

		const stats = statsFrom(recentFrames());
		const swfCount = swfAvatarQuery(world).length;
		const playerCount = playerQuery(world).length;

		ImGui.SetNextWindowSize(new ImGui.ImVec2(69 * 4, 260), ImGui.Cond.Once);
		// NOTE: every other system in this codebase opens an ImGui window
		// without closing it — the render system supplies a single trailing
		// End(). Matching that convention rather than changing the stack
		// depth out from under it.
		ImGui.Begin("SWF Benchmark", null, ImGui.WindowFlags.None);
		ImGui.TextWrapped(
			`[avatars]  ${swfCount} swf / ${playerCount} players\n` +
				`[fps]      ${stats.fps.toFixed(1)}\n` +
				`[avg]      ${stats.avgMs.toFixed(2)} ms\n` +
				`[p95]      ${stats.p95Ms.toFixed(2)} ms\n` +
				`[p99]      ${stats.p99Ms.toFixed(2)} ms\n` +
				`[max]      ${stats.maxMs.toFixed(2)} ms\n` +
				`[draws]    ${stats.drawCalls}\n` +
				`[tris]     ${stats.triangles}\n` +
				`[textures] ${stats.textures}\n` +
				`[window]   ${stats.frames} frames` +
				(sampling !== null ? "  (SAMPLING)" : ""),
		);

		for (const n of [1, 5, 10, 20]) {
			if (ImGui.Button(`+${n}`)) void spawn(n);
			ImGui.SameLine();
		}
		if (ImGui.Button("clear")) clear();

		return world;
	});
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Render sweep results as a markdown table for pasting into the spec. */
export function formatTable(rows: SweepRow[]): string {
	const header =
		"| avatars | fps | avg ms | p95 ms | p99 ms | max ms | draws | tris | textures | spawn ms |\n" +
		"| ------- | --- | ------ | ------ | ------ | ------ | ----- | ---- | -------- | -------- |";
	const body = rows
		.map(
			(r) =>
				`| ${r.avatars} | ${r.fps.toFixed(1)} | ${r.avgMs.toFixed(2)} | ` +
				`${r.p95Ms.toFixed(2)} | ${r.p99Ms.toFixed(2)} | ${r.maxMs.toFixed(2)} | ` +
				`${r.drawCalls} | ${r.triangles} | ${r.textures} | ${r.spawnMs.toFixed(0)} |`,
		)
		.join("\n");
	return `${header}\n${body}`;
}
