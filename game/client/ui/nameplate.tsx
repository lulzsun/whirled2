import React, { createElement } from "jsx-dom";

export const createNameplateUI = (name: string) => {
	const element = createElement("nameplate", {}, <>{name}</>);
	element.className =
		"absolute text-cyan-100 font-outline drop-shadow-lg font-black text-xs select-none pointer-events-none";
	return element as HTMLElement;
};
