try {
	window.parent.location.href;
	console.error("WARNING!!! SWF IFRAME CAN ACCESS PARENT WINDOW!!!");
} catch (e) {}

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
			function streamFrame() {
				createImageBitmap(canvas).then((imageBitmap) => {
					window.parent.postMessage(
						{ type: "frame", imageBitmap },
						"*",
						[imageBitmap],
					);
				});
				requestAnimationFrame(streamFrame);
			}
			streamFrame();
		});
	});

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
		default:
			console.log("Message from parent:", event.data);
			break;
	}
});
