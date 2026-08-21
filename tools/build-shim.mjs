// Compiles the Whirled control host shim (flash/whirled-host) to
// web/static/whirled-host.swf.
//
// The shim answers the Whirled SDK's controlConnect handshake so that
// unmodified user-uploaded avatars can be driven, replacing the per-file
// patching the current pipeline needs. See docs/specs/swf-avatar-rendering.md
// (W1).
//
// The compiled .swf is committed, so a normal `npm run dev` never needs any of
// this. You only need the toolchain if you change WhirledHost.as.
//
// Setup (one time):
//
//   1. Apache Flex SDK 4.16.1 binary, extracted to .flex-sdk/ (gitignored):
//        curl -LO https://archive.apache.org/dist/flex/4.16.1/binaries/apache-flex-sdk-4.16.1-bin.tar.gz
//        mkdir -p .flex-sdk && tar -xzf apache-flex-sdk-4.16.1-bin.tar.gz -C .flex-sdk
//
//      The Apache distribution is Apache-2.0 and deliberately ships without
//      playerglobal.swc, which is Adobe-licensed. That is what the (now
//      largely non-functional) Flex SDK Installer existed to fetch.
//
//   2. A playerglobal.swc at
//      .flex-sdk/apache-flex-sdk-4.16.1-bin/frameworks/libs/player/32.0/
//
//   3. A JDK. Tested on 21; the 4.16.1 compiler is Java 7/8-era but runs fine.
//
// Override any of it with FLEX_HOME, PLAYERGLOBAL_HOME, JAVA_HOME.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shimDir = join(repoRoot, "flash", "whirled-host");
const source = join(shimDir, "src", "WhirledHost.as");
const built = join(shimDir, "whirled-host.swf");
const deployed = join(repoRoot, "web", "static", "whirled-host.swf");

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
	console.error(`\nbuild-shim: ${message}\n`);
	process.exit(1);
};

if (!existsSync(source)) {
	fail(`no shim source at ${source}`);
}

const mxmlc = join(
	flexHome,
	"bin",
	process.platform === "win32" ? "mxmlc.bat" : "mxmlc",
);
if (!existsSync(mxmlc)) {
	fail(
		`no Flex SDK at ${flexHome}\n` +
			`Set FLEX_HOME, or see the setup notes at the top of this file.`,
	);
}

const playerglobal = join(playerglobalHome, TARGET_PLAYER, "playerglobal.swc");
if (!existsSync(playerglobal)) {
	fail(
		`no playerglobal.swc at ${playerglobal}\n` +
			`The Apache Flex distribution does not ship it; supply it yourself.\n` +
			`See the setup notes at the top of this file.`,
	);
}

console.log(`build-shim: compiling ${source}`);

try {
	execFileSync(
		mxmlc,
		[
			`-target-player=${TARGET_PLAYER}`,
			`-swf-version=${SWF_VERSION}`,
			// The shim references only flash.* classes, so nothing of the Flex
			// framework should end up linked in. Keeps the output tiny.
			"-static-link-runtime-shared-libraries=true",
			`-output=${built}`,
			source,
		],
		{
			cwd: shimDir,
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

if (!existsSync(built)) {
	fail(`mxmlc reported success but produced no ${built}`);
}

copyFileSync(built, deployed);

const { size } = statSync(deployed);
console.log(`\nbuild-shim: wrote web/static/whirled-host.swf (${size} bytes)`);
console.log(
	"build-shim: load it with ?avatar=<url>, then drive it through the\n" +
		"            whirled* ExternalInterface callbacks (see WhirledHost.as)",
);
