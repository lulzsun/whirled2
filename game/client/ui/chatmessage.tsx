import React, { createElement } from "jsx-dom";

export const createChatMessageUI = (
	username: string,
	nickname: string,
	message: string,
) => {
	const element = createElement(
		"chatmessage",
		{},
		<>
			{nickname}: {message}
		</>,
	);
	element.className =
		"block text-white font-outline drop-shadow-lg font-black text-xs";
	return element as HTMLElement;
};
