// Compiles the §16.4 acceptance-test avatar (flash/evil-avatar) to
// web/static/assets/avatars/eval-probe.swf.
//
// This is a deliberately HOSTILE avatar: it tries every way out of the Flash
// sandbox and paints whether it was blocked. Upload it as an avatar on a
// DEPLOYED build and confirm the stage comes up green. See
// docs/specs/swf-avatar-rendering.md section 16.4, and the header of
// flash/evil-avatar/src/EvilAvatar.as for what each probe means.
//
// Same toolchain as build-shim.mjs (Apache Flex 4.16.1 + a JDK + a supplied
// playerglobal.swc); the compiled .swf is committed, so a normal checkout
// never needs any of this. Override with FLEX_HOME, PLAYERGLOBAL_HOME,
// JAVA_HOME.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectDir = join(repoRoot, "flash", "evil-avatar");
const source = join(projectDir, "src", "EvilAvatar.as");
const deployed = join(
	repoRoot,
	"web",
	"static",
	"assets",
	"avatars",
	"eval-probe.swf",
);

const flexHome =
	process.env.FLEX_HOME ??
	join(repoRoot, ".flex-sdk", "apache-flex-sdk-4.16.1-bin");

// Flash Player 32 maps to SWF version 43.
const TARGET_PLAYER = "32.0";
const SWF_VERSION = "43";

const playerglobalHome =
	process.env.PLAYERGLOBAL_HOME ??
	join(flexHome, "frameworks", "libs", "player");

const fail = (message) => {
	console.error(`\nbuild-evil-avatar: ${message}\n`);
	process.exit(1);
};

if (!existsSync(source)) {
	fail(`no source at ${source}`);
}

const mxmlc = join(
	flexHome,
	"bin",
	process.platform === "win32" ? "mxmlc.bat" : "mxmlc",
);
if (!existsSync(mxmlc)) {
	fail(
		`no Flex SDK at ${flexHome}\n` +
			`Set FLEX_HOME, or see the setup notes in tools/build-shim.mjs.`,
	);
}

const playerglobal = join(playerglobalHome, TARGET_PLAYER, "playerglobal.swc");
if (!existsSync(playerglobal)) {
	fail(
		`no playerglobal.swc at ${playerglobal}\n` +
			`Supply it yourself; see the setup notes in tools/build-shim.mjs.`,
	);
}

mkdirSync(dirname(deployed), { recursive: true });

console.log(`build-evil-avatar: compiling ${source}`);

try {
	execFileSync(
		mxmlc,
		[
			`-target-player=${TARGET_PLAYER}`,
			`-swf-version=${SWF_VERSION}`,
			"-static-link-runtime-shared-libraries=true",
			`-output=${deployed}`,
			source,
		],
		{
			cwd: projectDir,
			stdio: "inherit",
			shell: process.platform === "win32",
			env: {
				...process.env,
				PLAYERGLOBAL_HOME: playerglobalHome,
			},
		},
	);
} catch {
	fail("mxmlc failed; see the output above");
}

if (!existsSync(deployed)) {
	fail(`mxmlc reported success but produced no ${deployed}`);
}

const { size } = statSync(deployed);
console.log(
	`\nbuild-evil-avatar: wrote web/static/assets/avatars/eval-probe.swf ` +
		`(${size} bytes)`,
);
console.log(
	"build-evil-avatar: upload it as an avatar on a DEPLOYED build; a green\n" +
		"                   stage means the sandbox held. See spec section 16.4.",
);
