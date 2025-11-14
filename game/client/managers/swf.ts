import * as THREE from "three";
import { createSwfSandbox } from "../ui/swfsandbox";

export class SwfAssetManager {
	private swfSandboxes: Map<number, HTMLIFrameElement>;
	private swfTexture: Map<number, THREE.Texture>;
	private swfEventHandler: Map<number, (event: MessageEvent) => void>;

	constructor() {
		this.swfSandboxes = new Map();
		this.swfTexture = new Map();
		this.swfEventHandler = new Map();
	}

	public async add(eid: number, swfFile: string): Promise<THREE.Texture> {
		const iframe = await createSwfSandbox(swfFile);
		const texturePromise = new Promise<THREE.Texture>((resolve) => {
			const handler = (event: MessageEvent) => {
				// this sandbox is ready when the first frame can be rendered
				if (
					event.source === iframe.contentWindow &&
					event.data.type === "frame"
				) {
					const imageBitmap = event.data.imageBitmap;
					let texture = this.swfTexture.get(eid);
					if (texture === undefined) {
						texture = new THREE.Texture(imageBitmap);

						texture.minFilter = THREE.LinearFilter;
						texture.magFilter = THREE.LinearFilter;
						texture.format = THREE.RGBAFormat;
						texture.needsUpdate = true;

						this.swfTexture.set(eid, texture);
					}

					texture.image = imageBitmap;
					texture.needsUpdate = true;

					// window.removeEventListener("message", handler);
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
		this.swfEventHandler.delete(eid);
		this.swfTexture.delete(eid);
		this.swfSandboxes.get(eid)?.remove();
		this.swfSandboxes.delete(eid);
	}

	public getTexture(eid: number): THREE.Texture | undefined {
		return this.swfTexture.get(eid);
	}
}
