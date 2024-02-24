import React, { createElement } from "jsx-dom";

export const createNameplateUI = (name: string) => {
	const element = createElement("nameplate", {}, <>{name}</>);
	element.className =
		"absolute text-white font-outline drop-shadow-lg font-black text-xs select-none";
	return element as Node;
};
