import { defineSystem } from "bitecs";
import { World } from "../factory/world";

import { ImGui, ImGui_Impl } from "imgui-js";

export function UNIQUE(key: string): string {
	return key;
}

class Static<T> {
	constructor(public value: T) {}
	access: ImGui.Access<T> = (value: T = this.value): T =>
		(this.value = value);
}

const _static_map: Map<string, Static<any>> = new Map();

export function STATIC<T>(key: string, init: T): Static<T> {
	let value: Static<T> | undefined = _static_map.get(key);
	if (value === undefined) {
		_static_map.set(key, (value = new Static<T>(init)));
	}
	return value;
}

export function createImguiSystem(world: World) {
	ImGui.default().then(function () {
		ImGui.CreateContext();
		ImGui.StyleColorsDark();

		ImGui_Impl.Init(world.renderer.domElement);

		// ImGui_Impl.Init attaches copy/cut/paste handlers on document.body
		// that preventDefault unconditionally, killing the clipboard for the
		// whole document (login form included). Intercept in the capture
		// phase and let imgui see the event only when it owns the keyboard.
		for (const type of ["copy", "cut", "paste"]) {
			document.addEventListener(
				type,
				(e) => {
					if (!ImGui.GetIO().WantCaptureKeyboard) e.stopPropagation();
				},
				true,
			);
		}
	});
	return defineSystem((world: World) => {
		if (ImGui.GetCurrentContext() === null) return world;

		ImGui_Impl.NewFrame(world.time.last);
		ImGui.NewFrame();
		return world;
	});
}
