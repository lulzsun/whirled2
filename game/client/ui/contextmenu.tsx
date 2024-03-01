import React, { createElement } from "jsx-dom";

export type HTMLContextMenu = HTMLElement & {
	open: (bounds: DOMRect, x: number, y: number) => void;
	close: () => void;
	setItem: (item: HTMLElement) => void;
	menuItems: HTMLElement[];
};

export const createContextMenuUI = () => {
	const element: HTMLContextMenu = Object.assign(
		createElement("contextmenu", {}, <></>) as HTMLElement,
		{
			open: function (bounds: DOMRect, x: number, y: number) {
				element.style.display = "block";

				x = x - (bounds.width - bounds.right) - bounds.left;
				y = y - bounds.top;

				let menuRect = element.getBoundingClientRect();
				element.style.top = `${Math.max(0, Math.min(y, bounds.height - menuRect.height))}px`;
				element.style.left = `${Math.max(0, Math.min(x, bounds.right + bounds.left - menuRect.width))}px`;

				element.innerHTML = "";
				element.appendChild(
					<ContextMenuUI
						HTMLParent={element}
						menuItems={element.menuItems}
					/>,
				);
			},
			close: function () {
				element.style.display = "none";
			},
			setItem: function (item: HTMLElement) {
				element.menuItems.push(item);
			},
			menuItems: [],
		},
	);
	element.style.display = "none";
	element.className =
		"absolute z-10 overflow-hidden bg-white border border-gray-300 divide-y divide-gray-100 rounded-lg shadow w-44 dark:bg-gray-700 dark:border-gray-600";
	element.oncontextmenu = (e) => e.preventDefault();

	return element as HTMLContextMenu;
};

type ContextMenuUIProps = {
	HTMLParent: HTMLElement;
	menuItems: HTMLElement[];
};

const ContextMenuUI = (p: ContextMenuUIProps) => {
	return (
		<ul class="text-sm text-gray-700 dark:text-gray-200 rounded-lg">
			{p.menuItems}
		</ul>
	);
};
