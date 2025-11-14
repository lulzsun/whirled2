try {
	window.parent.location.href;
	console.error("WARNING!!! SWF IFRAME CAN ACCESS PARENT WINDOW!!!");
} catch (e) {}

window.addEventListener("message", (event) => {
	console.log("Message from parent:", event.data);
});

let ruffle = window.RufflePlayer.newest();
let player = ruffle.createPlayer();
let container = document.getElementById("ruffle");
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
