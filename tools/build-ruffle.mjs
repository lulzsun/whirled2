// Builds the forked Ruffle web bundle with our command-stream render backend
// and copies it into web/static/, replacing the stock ruffle.js.
//
// The fork lives outside this repo. Point RUFFLE_DIR at it, or keep it as a
// sibling directory (the default). See docs/specs/swf-avatar-rendering.md (W2).
//
// Usage:
//   npm run build-ruffle
//   RUFFLE_DIR=/path/to/ruffle npm run build-ruffle

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ruffleDir = resolve(
	process.env.RUFFLE_DIR ?? join(repoRoot, "..", "ruffle"),
);
const ruffleWeb = join(ruffleDir, "web");
const selfhostedDist = join(ruffleWeb, "packages", "selfhosted", "dist");
const staticDir = join(repoRoot, "web", "static");

const fail = (message) => {
	console.error(`\nbuild-ruffle: ${message}\n`);
	process.exit(1);
};

if (!existsSync(ruffleWeb)) {
	fail(
		`no Ruffle checkout at ${ruffleDir}\n` +
			`Set RUFFLE_DIR to your fork, or clone it next to this repo.`,
	);
}

// The stream backend lives in our fork, not upstream. Catch the easy mistake
// of pointing at a stock checkout before spending minutes on a wasm build.
if (!existsSync(join(ruffleDir, "render", "stream"))) {
	fail(
		`${ruffleDir} has no render/stream crate.\n` +
			`That directory is a stock Ruffle checkout, not our fork.`,
	);
}

if (!existsSync(join(ruffleWeb, "node_modules"))) {
	fail(
		`Ruffle's web dependencies are not installed.\n` +
			`Run:  cd ${ruffleWeb} && npm ci`,
	);
}

console.log(`build-ruffle: building ${ruffleDir} with the "three" feature`);
console.log("build-ruffle: this takes several minutes on a cold cache\n");

try {
	execFileSync("npm", ["run", "build"], {
		cwd: ruffleWeb,
		stdio: "inherit",
		shell: process.platform === "win32",
		env: {
			...process.env,
			// Consumed by packages/core/tools/build_wasm.ts and appended to
			// the wasm-pack --features list.
			CARGO_FEATURES: "three",
		},
	});
} catch {
	fail("Ruffle build failed; see the output above");
}

if (!existsSync(selfhostedDist)) {
	fail(`build produced no output at ${selfhostedDist}`);
}

// Ruffle's selfhosted package ships npm metadata alongside the bundle. The
// license files are kept (Ruffle is MIT/Apache and we redistribute it), but
// package.json and README.md have no business being served.
const SKIP = new Set(["package.json", "README.md"]);

cpSync(selfhostedDist, staticDir, {
	recursive: true,
	filter: (src) => !SKIP.has(src.slice(selfhostedDist.length + 1)),
});

const copied = readdirSync(selfhostedDist).filter((n) => !SKIP.has(n));
console.log(`\nbuild-ruffle: copied ${copied.length} files into web/static/`);
for (const name of copied) {
	console.log(`  ${name}`);
}
console.log(
	'\nbuild-ruffle: select it at runtime with preferredRenderer: "three"',
);
