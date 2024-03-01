import React, { createElement } from "jsx-dom";

export type HTMLContextMenu = HTMLElement & {
	open: (x: number, y: number) => void;
	close: () => void;
};

export const createContextMenuUI = () => {
	const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
	const element: HTMLContextMenu = Object.assign(
		createElement(
			"contextmenu",
			{},
			<>
				<div class="px-4 py-3 text-sm text-gray-900 dark:text-white">
					<div>Nickname</div>
					<div class="font-medium truncate">@username</div>
				</div>
				<ul
					class="py-2 text-sm text-gray-700 dark:text-gray-200"
					aria-labelledby="dropdownInformationButton"
				>
					<li>
						<button
							id="doubleDropdownButton"
							data-dropdown-toggle="doubleDropdown"
							data-dropdown-placement="right-start"
							type="button"
							class="flex items-center justify-between w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white"
						>
							States
							<svg
								class="w-2.5 h-2.5 ms-3 rtl:rotate-180"
								aria-hidden="true"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 6 10"
							>
								<path
									stroke="currentColor"
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="m1 9 4-4-4-4"
								/>
							</svg>
						</button>
						<div
							id="doubleDropdown"
							class="z-10 hidden bg-white divide-y divide-gray-100 rounded-lg shadow w-44 dark:bg-gray-700"
						>
							<ul
								class="py-2 text-sm text-gray-700 dark:text-gray-200"
								aria-labelledby="doubleDropdownButton"
							>
								<li>
									<a
										href="#"
										class="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white"
									>
										Dance
									</a>
								</li>
							</ul>
						</div>
					</li>
					<li>
						<button
							id="doubleDropdownButton"
							data-dropdown-toggle="doubleDropdown"
							data-dropdown-placement="right-start"
							type="button"
							class="flex items-center justify-between w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white"
						>
							Actions
							<svg
								class="w-2.5 h-2.5 ms-3 rtl:rotate-180"
								aria-hidden="true"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 6 10"
							>
								<path
									stroke="currentColor"
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="m1 9 4-4-4-4"
								/>
							</svg>
						</button>
						<div
							id="doubleDropdown"
							class="z-10 hidden bg-white divide-y divide-gray-100 rounded-lg shadow w-44 dark:bg-gray-700"
						>
							<ul
								class="py-2 text-sm text-gray-700 dark:text-gray-200"
								aria-labelledby="doubleDropdownButton"
							>
								<li>
									<a
										href="#"
										class="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white"
									>
										Wave
									</a>
								</li>
							</ul>
						</div>
					</li>
					{/* <li>
						<a
							href="#"
							class="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white"
						>
							View Profile
						</a>
					</li> */}
				</ul>
				<div class="py-2">
					<a
						href="#"
						class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200 dark:hover:text-white"
					>
						View Avatar in Stuff
					</a>
				</div>
			</>,
		) as HTMLElement,
		{
			open: function (x: number, y: number) {
				//@ts-ignore
				const menu: HTMLContextMenu = this;
				menu.style.display = "block";

				let canvasRect = canvas.getBoundingClientRect();
				let posX = x - canvasRect.left;
				let posY = y - canvasRect.top;

				let menuRect = menu.getBoundingClientRect();
				menu.style.top = `${Math.max(0, Math.min(posY, canvasRect.height - menuRect.height))}px`;
				menu.style.left = `${Math.max(0, Math.min(posX, canvasRect.width - menuRect.width))}px`;
			},
			close: function () {
				//@ts-ignore
				const menu: HTMLContextMenu = this;
				menu.style.display = "none";
			},
		},
	);
	element.style.display = "none";
	element.className =
		"absolute z-10 bg-white divide-y divide-gray-100 rounded-lg shadow w-44 dark:bg-gray-700";
	element.oncontextmenu = (e) => e.preventDefault();

	return element as HTMLContextMenu;
};
