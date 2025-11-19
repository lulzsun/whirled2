import * as THREE from "three";
import { createSwfSandbox } from "../ui/swfsandbox";

export class SwfAssetManager {
	private swfSandboxes: Map<number, HTMLIFrameElement>;
	private swfTexture: Map<number, THREE.Texture>;
	private swfEventHandler: Map<number, (event: MessageEvent) => void>;
	private avatarStates: Map<number, string[]>;
	private avatarActions: Map<number, string[]>;
	private isMoving: boolean;
	private orientation: number;

	constructor() {
		this.swfSandboxes = new Map();
		this.swfTexture = new Map();
		this.swfEventHandler = new Map();
		this.avatarStates = new Map();
		this.avatarActions = new Map();
		this.isMoving = false;
		this.orientation = -1;
	}

	public async add(eid: number, swfFile: string): Promise<THREE.Texture> {
		const iframe = await createSwfSandbox(swfFile);
		const texturePromise = new Promise<THREE.Texture>((resolve) => {
			const handler = async (event: MessageEvent) => {
				// this sandbox is ready when the first frame can be rendered
				if (event.source !== iframe.contentWindow) return;
				if (event.data.type === "frame") {
					const imageBitmap = event.data.imageBitmap;
					let texture = this.swfTexture.get(eid);
					if (texture === undefined) {
						const offset = await getSpriteBottomOffset(imageBitmap);
						if (offset.bottomNormalized === 0) return;
						// TODO: capture AvatarControl.setPreferredY() to calculate offset
						// for avatars that do not touch the ground (flying?)

						texture = new THREE.Texture(imageBitmap);

						texture.minFilter = THREE.LinearFilter;
						texture.magFilter = THREE.LinearFilter;
						texture.format = THREE.RGBAFormat;
						texture.needsUpdate = true;
						texture.userData.spriteOffset = offset;

						this.swfTexture.set(eid, texture);
					}

					texture.image = imageBitmap;
					texture.needsUpdate = true;

					resolve(texture);
				}
			};
			this.swfEventHandler.set(eid, handler);
			window.addEventListener("message", handler);
		});

		this.swfSandboxes.set(eid, iframe);
		return texturePromise;
	}

	public remove(eid: number) {
		const handler = this.swfEventHandler.get(eid);
		if (handler !== undefined)
			window.removeEventListener("message", handler);
		this.swfEventHandler.delete(eid);
		this.swfTexture.delete(eid);
		this.swfSandboxes.get(eid)?.remove();
		this.swfSandboxes.delete(eid);
	}

	public getTexture(eid: number): THREE.Texture | undefined {
		return this.swfTexture.get(eid);
	}

	public getFrameList(
		eid: number,
	): Promise<{ frame: number; name: string }[]> {
		const iframe = this.swfSandboxes.get(eid);
		const frameListPromise = new Promise<{ frame: number; name: string }[]>(
			(resolve, reject) => {
				if (
					iframe === null ||
					iframe === undefined ||
					iframe.contentWindow === null
				) {
					return reject(
						new Error(`could not find iframe given eid: ${eid}`),
					);
				}
				iframe.contentWindow.postMessage({ type: "framelist" }, "*");
				const handler = (event: MessageEvent) => {
					if (
						event.source === iframe.contentWindow &&
						event.data.type === "framelist"
					) {
						window.removeEventListener("message", handler);
						resolve(event.data.frameList);
					}
				};
				window.addEventListener("message", handler);
			},
		);

		return frameListPromise;
	}

	public gotoFrame(eid: number, frame: number) {
		const iframe = this.swfSandboxes.get(eid);
		if (
			iframe === null ||
			iframe === undefined ||
			iframe.contentWindow === null
		) {
			return new Error(`could not find iframe given eid: ${eid}`);
		}
		iframe.contentWindow.postMessage({ type: "gotoframe", frame }, "*");
	}

	public setMoving(eid: number, isMoving: boolean) {
		if (isMoving === this.isMoving) {
			return;
		}
		this.isMoving = isMoving;
		const iframe = this.swfSandboxes.get(eid);
		if (
			iframe === null ||
			iframe === undefined ||
			iframe.contentWindow === null
		) {
			return new Error(`could not find iframe given eid: ${eid}`);
		}
		iframe.contentWindow.postMessage({ type: "setMoving", isMoving }, "*");
	}

	public setState(eid: number, state: string) {
		const iframe = this.swfSandboxes.get(eid);
		if (
			iframe === null ||
			iframe === undefined ||
			iframe.contentWindow === null
		) {
			return new Error(`could not find iframe given eid: ${eid}`);
		}
		iframe.contentWindow.postMessage(
			{ type: "setState", state: state.replace(/^(action|state)_/i, "") },
			"*",
		);
	}

	public setOrientation(eid: number, degrees: number) {
		if (degrees === this.orientation) {
			return;
		}
		this.orientation = degrees;
		const iframe = this.swfSandboxes.get(eid);
		if (
			iframe === null ||
			iframe === undefined ||
			iframe.contentWindow === null
		) {
			return new Error(`could not find iframe given eid: ${eid}`);
		}
		iframe.contentWindow.postMessage(
			{ type: "setOrientation", degrees },
			"*",
		);
	}

	public playAction(eid: number, action: string) {
		const iframe = this.swfSandboxes.get(eid);
		if (
			iframe === null ||
			iframe === undefined ||
			iframe.contentWindow === null
		) {
			return new Error(`could not find iframe given eid: ${eid}`);
		}
		iframe.contentWindow.postMessage(
			{
				type: "playAction",
				action: action.replace(/^(action|state)_/i, ""),
			},
			"*",
		);
	}

	public getStates(eid: number): Promise<string[]> {
		return new Promise((resolve, reject) => {
			if (this.avatarStates.has(eid)) {
				resolve(this.avatarStates.get(eid) ?? []);
				return;
			}
			const iframe = this.swfSandboxes.get(eid);
			if (
				iframe === null ||
				iframe === undefined ||
				iframe.contentWindow === null
			) {
				return reject(
					new Error(`could not find iframe given eid: ${eid}`),
				);
			}
			iframe.contentWindow.postMessage({ type: "states" }, "*");
			const handler = (event: MessageEvent) => {
				if (
					event.source === iframe.contentWindow &&
					event.data.type === "states"
				) {
					window.removeEventListener("message", handler);
					resolve(
						this.avatarStates
							.set(eid, event.data.avatarStates)
							.get(eid) ?? [],
					);
				}
			};
			window.addEventListener("message", handler);
		});
	}

	public getActions(eid: number): Promise<string[]> {
		return new Promise((resolve, reject) => {
			if (this.avatarActions.has(eid)) {
				resolve(this.avatarActions.get(eid) ?? []);
				return;
			}
			const iframe = this.swfSandboxes.get(eid);
			if (
				iframe === null ||
				iframe === undefined ||
				iframe.contentWindow === null
			) {
				return reject(
					new Error(`could not find iframe given eid: ${eid}`),
				);
			}
			iframe.contentWindow.postMessage({ type: "actions" }, "*");
			const handler = (event: MessageEvent) => {
				if (
					event.source === iframe.contentWindow &&
					event.data.type === "actions"
				) {
					window.removeEventListener("message", handler);
					resolve(
						this.avatarActions
							.set(eid, event.data.avatarActions)
							.get(eid) ?? [],
					);
				}
			};

			window.addEventListener("message", handler);
		});
	}

	public async getAnimations(eid: number): Promise<{ name: string }[]> {
		const states =
			(await this.getStates(eid)).map((state) => ({
				name: `state_${state}`,
			})) ?? [];
		const actions =
			(await this.getActions(eid)).map((action) => ({
				name: `action_${action}`,
			})) ?? [];
		return [...states, ...actions];
	}
}

// maybe move this somewhere else
async function getSpriteBottomOffset(imageBitmap: ImageBitmap) {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	canvas.width = imageBitmap.width;
	canvas.height = imageBitmap.height;
	ctx!.drawImage(imageBitmap, 0, 0);
	const imageData = ctx!.getImageData(0, 0, canvas.width, canvas.height);

	let minY = canvas.height;
	let maxY = 0;

	for (let y = 0; y < canvas.height; y++) {
		for (let x = 0; x < canvas.width; x++) {
			const i = (y * canvas.width + x) * 4;
			if (imageData.data[i + 3] > 127) {
				minY = Math.min(minY, y);
				maxY = Math.max(maxY, y);
			}
		}
	}

	// Return normalized positions (0 = top, 1 = bottom)
	return {
		topPixel: minY,
		bottomPixel: maxY,
		topNormalized: minY / canvas.height,
		bottomNormalized: maxY / canvas.height,
		heightPixels: maxY - minY,
		heightNormalized: (maxY - minY) / canvas.height,
	};
}
