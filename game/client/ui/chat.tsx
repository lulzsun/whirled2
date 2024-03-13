import React, { createRef } from "jsx-dom";

export const createChatUI = (sender?: (msg: string) => any) => {
	const chatInput = createRef<HTMLInputElement>();

	return (
		<div className="absolute left-1 bottom-1 w-46 text-white z-10">
			<div id="chatbox" class="pb-2" />
			<div class="relative">
				<div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
					<svg
						class="w-4 h-4 text-gray-500 dark:text-gray-400"
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						fill="currentColor"
						viewBox="0 0 16 16"
					>
						<path d="M14 1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4.414A2 2 0 0 0 3 11.586l-2 2V2a1 1 0 0 1 1-1zM2 0a2 2 0 0 0-2 2v12.793a.5.5 0 0 0 .854.353l2.853-2.853A1 1 0 0 1 4.414 12H14a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2z" />
						<path d="M5 6a1 1 0 1 1-2 0 1 1 0 0 1 2 0m4 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0m4 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0" />
					</svg>
				</div>
				<input
					class="block w-full p-1.5 ps-10 text-xs text-gray-900 border border-gray-300 rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
					placeholder="Send a Message..."
					required
					ref={chatInput}
					onKeyUp={(e) => {
						if (
							e.key === "Enter" &&
							sender &&
							chatInput.current &&
							chatInput.current.value.length > 0
						) {
							sender(chatInput.current.value);
							chatInput.current.value = "";
						}
					}}
				/>
			</div>
		</div>
	) as HTMLElement;
};
