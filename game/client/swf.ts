// SUPERSEDED at M4. Nothing loads this any more.
//
// This is the iframe half of the old SWF pipeline: a Ruffle player inside a
// sandboxed srcdoc iframe, copying its canvas out with createImageBitmap once
// per frame. managers/swf.ts now runs Ruffle in the page against the forked
// "three" render backend instead, so no frame ever crosses a postMessage.
//
// It is kept, unreferenced, until W3/M6 replaces it properly with a worker —
// that is the change that restores real isolation, and having the old path on
// disk makes the comparison easy. See docs/specs/swf-avatar-rendering.md §14.

// Self-check: reaching the parent window means this sandbox is not isolated.
// In dev that is expected — swfsandbox.tsx grants allow-same-origin there to
// work around opaque-origin loopback blocking (see
// docs/specs/swf-avatar-rendering.md §12.4). In production it means the
// sandbox has been broken, and user-uploaded SWFs can reach the page.
try {
	window.parent.location.href;
	if (import.meta.env.DEV) {
		console.warn(
			"SWF sandbox is running with allow-same-origin (dev only): " +
				"it is NOT isolated from the page.",
		);
	} else {
		console.error("WARNING!!! SWF IFRAME CAN ACCESS PARENT WINDOW!!!");
	}
} catch (e) {}

let then = Date.now();

const ruffle = window.RufflePlayer.newest();
const player = ruffle.createPlayer();
const container = document.getElementById("ruffle");
container!.appendChild(player);
// NOTE: this listener must be registered *before* load() is called. It used to
// be attached in load().finally(), which races: if "loadedmetadata" has
// already fired by the time load() resolves, the listener never runs, no
// frames are ever streamed to the parent, and createSwfAvatar's await never
// settles — the avatar hangs forever rather than failing. Older Ruffle builds
// happened to win that race; newer ones do not.
const startStreaming = () => {
	const canvas = player.shadowRoot!.querySelector("canvas")!;
	if (canvas == null || canvas == undefined)
		throw Error("Ruffle canvas could not be found");
	player.style.height = `${player.metadata.height * 2}px`;
	player.style.width = `${player.metadata.width * 2}px`;
	function streamFrame() {
		requestAnimationFrame(streamFrame);

		const now = Date.now();
		const elapsed = now - then;

		if (elapsed > 1000 / player.metadata.frameRate) {
			// Get ready for next frame by setting then=now, but also adjust for your
			// specified fpsInterval not being a multiple of RAF's interval (16.7ms)
			then = now - (elapsed % (1000 / player.metadata.frameRate));
			createImageBitmap(canvas).then((imageBitmap) => {
				window.parent.postMessage({ type: "frame", imageBitmap }, "*", [
					imageBitmap,
				]);
			});
		}
	}
	streamFrame();
};

player.addEventListener("loadedmetadata", startStreaming);

player.ruffle().load({
	url: document.body.dataset.swf,
	allowScriptAccess: true,
	autoplay: "on",
	splashScreen: false,
	unmuteOverlay: "hidden",
	letterbox: "off",
	wmode: "transparent",
	preferredRenderer: "canvas",
});

var avatarStates: string[] = [];
//@ts-ignore
window.setupStates = (states: string[]) => {
	avatarStates = states;
};
var avatarActions: string[] = [];
//@ts-ignore
window.setupActions = (actions: string[]) => {
	avatarActions = actions;
};

window.addEventListener("message", (event) => {
	switch (event.data.type) {
		case "framelist":
			const frameList = player.metadata.frameList.map(
				(item: [number, string][]) => ({
					frame: item[0],
					name: item[1],
				}),
			);
			window.parent.postMessage({ type: "framelist", frameList }, "*");
			break;
		case "gotoframe":
			player.GotoFrame(event.data.frame);
			break;
		case "setMoving":
			player.setMoving(event.data.isMoving);
			break;
		case "setState":
			player.setState(event.data.state);
			break;
		case "setOrientation":
			player.setOrientation(event.data.degrees);
			break;
		case "playAction":
			player.playAction(event.data.action);
			break;
		case "states":
			// if length is 0, either there are no states or ruffle was a little slow
			// on sending the states, so we will wait 1 second before send
			// ...
			// need to figure out how to properly fix this race condition
			if (avatarStates.length === 0) {
				setTimeout(() => {
					window.parent.postMessage(
						{ type: "states", avatarStates },
						"*",
					);
				}, 1000);
			} else {
				window.parent.postMessage(
					{ type: "states", avatarStates },
					"*",
				);
			}
			break;
		case "actions":
			// if length is 0, either there are no actions or ruffle was a little slow
			// on sending the actions, so we will wait 1 second before send
			// ...
			// need to figure out how to properly fix this race condition
			if (avatarActions.length === 0) {
				setTimeout(() => {
					window.parent.postMessage(
						{ type: "actions", avatarActions },
						"*",
					);
				}, 1000);
			} else {
				window.parent.postMessage(
					{ type: "actions", avatarActions },
					"*",
				);
			}
			break;
		default:
			console.log("Unhandled message from parent:", event.data);
			break;
	}
});
