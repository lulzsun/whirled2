try {
	window.parent.location.href;
	console.error("WARNING!!! SWF IFRAME CAN ACCESS PARENT WINDOW!!!");
} catch (e) {}

let then = Date.now();

const ruffle = window.RufflePlayer.newest();
const player = ruffle.createPlayer();
const container = document.getElementById("ruffle");
container!.appendChild(player);
player
	.ruffle()
	.load({
		url: document.body.dataset.swf,
		allowScriptAccess: true,
		autoplay: "on",
		splashScreen: false,
		unmuteOverlay: "hidden",
		letterbox: "off",
		wmode: "transparent",
		preferredRenderer: "canvas",
	})
	.finally(() => {
		player.addEventListener("loadedmetadata", () => {
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
						window.parent.postMessage(
							{ type: "frame", imageBitmap },
							"*",
							[imageBitmap],
						);
					});
				}
			}
			streamFrame();
		});
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
