import { createElement, createRef } from "jsx-dom";
import { API_URL } from "../constants";

export const createChatMessageUI = (
	username: string,
	nickname: string,
	message: string,
) => {
	const profileLink = createRef<HTMLAnchorElement>();

	const element = createElement(
		"chatmessage",
		{},
		<>
			<a
				class="cursor-pointer text-cyan-100"
				style={{ display: "ruby" }}
				hx-target="#page"
				hx-push-url="true"
				ref={profileLink}
			>
				<img
					class="w-5 h-5 rounded-full mr-1 select-none"
					src={`${API_URL}/static/assets/profile_picture.png`}
				/>
				{nickname}
				<span class="text-white">:</span>
			</a>
			<span>{message}</span>
		</>,
	);

	if (!/^Guest/i.test(username)) {
		profileLink.current!.href = `/profile/${username}`;
	}

	element.className =
		"flex gap-1 block text-white font-outline drop-shadow-lg font-black text-xs break-all";
	return element as HTMLElement;
};
