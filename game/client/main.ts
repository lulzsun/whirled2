import { pipe } from "bitecs";
import { World, createWorld } from "./factory/world";
import { createSystems } from "./factory/systems";
import { emitObjectJoin, emitPlayerWear } from "./systems/network";
import { initializeHtmx, htmx } from "./htmx";

const world = createWorld();
declare global {
	interface Window {
		RufflePlayer: any;
		world: World;
		htmx: typeof htmx;
		game: {
			addStuff: (id: string, type: string) => void;
			wearAvatar: (id: string) => void;
			previewUpload: (iframe: HTMLIFrameElement, e: Event) => void;
			previewScale: (iframe: HTMLIFrameElement, scale: number) => void;
			reconnect: () => void;
		};
	}
}
if (window.htmx === undefined) {
	//@ts-ignore
	window.htmx = {};
	window.htmx.process = () => {};
} else {
	initializeHtmx();
}
window.world = world;
window.game = {
	addStuff: (id, type) => {
		emitObjectJoin(world, id, parseInt(type));
	},
	wearAvatar: (id) => {
		emitPlayerWear(world, id);
	},
	previewUpload: (iframe, event) => {
		const input = event.target as HTMLInputElement;
		if (iframe === null || input.value == "") return;
		const file = input?.files?.[0];

		if (file) {
			const reader = new FileReader();

			reader.onload = function (e) {
				if (e.target === null) return;
				const dataUrl = e.target.result;

				if (iframe.contentWindow) {
					const createPlayer =
						//@ts-ignore
						iframe.contentWindow.createPlayer;
					createPlayer(
						dataUrl,
						file.name.split(".").pop()?.toLowerCase(),
					);
				} else {
					console.error("Issue communicating with iframe", iframe);
					input.value = "";
				}
			};
			reader.readAsDataURL(file);
		}
	},
	previewScale: (iframe, scale = 1) => {
		if (iframe === null) return;
		if (iframe.contentWindow) {
			//@ts-ignore
			iframe.contentWindow.scalePlayer(scale);
		}
	},
	reconnect: () => {},
};
// Config for Ruffle player which handles swf emulation
window.RufflePlayer.config = {
	autoplay: "on",
	splashScreen: false,
	unmuteOverlay: "hidden",
	letterbox: "off",
	wmode: "transparent",
	preferredRenderer: "canvas",
};

const systems = createSystems(world);

const update = () => {
	requestAnimationFrame(update);
	pipe(...systems)(world);
};

update();
