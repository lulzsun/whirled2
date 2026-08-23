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
				class="cursor-pointer"
				style={{ color: "#000070" }}
				hx-target="#page"
				hx-push-url="true"
				ref={profileLink}
			>
				<img
					class="w-4 h-4 rounded-full mr-1 inline-block align-text-bottom select-none"
					src={`${API_URL}/static/assets/profile_picture.png`}
				/>
				{nickname}
				<span>:</span>
			</a>{" "}
			<span>{message}</span>
		</>,
	) as HTMLElement;

	if (!/^Guest/i.test(username)) {
		profileLink.current!.href = `/profile/${username}`;
	}

	element.className =
		"block w-fit max-w-full text-black text-xs break-words bg-white border border-black";
	element.style.padding = "1px 10px";
	element.style.borderRadius = "10px";
	element.style.lineHeight = "1.25";
	return element as HTMLElement;
};
