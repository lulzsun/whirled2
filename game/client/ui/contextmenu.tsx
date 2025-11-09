import { createElement } from "jsx-dom";

export type HTMLContextMenu = HTMLElement & {
	open: (event: MouseEvent | PointerEvent) => void;
	close: (all?: boolean) => void;
	setItem: (item: HTMLElement) => void;
	menuItems: HTMLElement[];
	hasParentMenu: boolean;
};

export const createContextMenuUI = (hasParentMenu?: boolean) => {
	const element: HTMLContextMenu = Object.assign(
		createElement("contextmenu", {}, <></>) as HTMLElement,
		{
			open: function (event: MouseEvent | PointerEvent) {
				element.style.display = "block";
				element.innerHTML = "";
				element.appendChild(
					<ContextMenuUI
						HTMLParent={element}
						menuItems={element.menuItems}
					/>,
				);
				window.htmx.process(element);

				const canvas = document.querySelector<HTMLCanvasElement>(
					!window.world.isPreview ? "#game" : "#preview",
				)!;
				const bounds = canvas.parentElement!.getBoundingClientRect();

				let x =
					event.clientX - (bounds.width - bounds.right - bounds.left);
				let y = event.clientY - bounds.top;

				if (element.hasParentMenu) {
					//@ts-ignore
					const eRect = event.currentTarget.getBoundingClientRect();
					if (event.currentTarget !== null && eRect) {
						element.style.marginTop = `-${eRect.height}px`;
					}

					var parent = element.parentElement;
					while (parent) {
						if (parent.tagName.toLowerCase() === "contextmenu") {
							break;
						}
						parent = parent.parentElement;
					}
					if (
						parent !== null &&
						parent.tagName.toLowerCase() === "contextmenu"
					) {
						element.style.left = `${parent.clientWidth}px`;

						let rect = element.getBoundingClientRect();
						if (rect.right > bounds.width) {
							// Right side is out of viewport
							element.style.left = "";
							element.style.right = `${parent.clientWidth}px`;
						}
						if (rect.bottom > bounds.height) {
							// Bottom is out of viewport
							element.style.marginTop = `-${-1 * parseInt(element.style.marginTop) + (rect.bottom - bounds.bottom)}px`;
						}
						rect = element.getBoundingClientRect();
						if (rect.height > bounds.height) {
							// Top is out of viewport
							element.style.marginTop = "";

							const pRect = parent.getBoundingClientRect();

							element.style.bottom = `0px`;
							element.style.marginBottom = `-${bounds.height - pRect.top - pRect.height}px`;
							element.querySelector<HTMLUListElement>(
								"ul",
							)!.style.height = `${bounds.height - 3}px`;
						}
					}
				} else {
					const rect = element.getBoundingClientRect();
					element.style.top = `${Math.max(0, Math.min(y, bounds.height - rect.height))}px`;
					element.style.left = `${Math.max(0, Math.min(x, bounds.right + bounds.left - rect.width))}px`;
					if (rect.height > bounds.height) {
						// Top is out of viewport
						element.style.top = "";
						element.style.bottom = "1px";
						element.querySelector<HTMLUListElement>(
							"ul",
						)!.style.height = `${bounds.height - 3}px`;
						console.log(bounds);
					}
				}
			},
			close: function (all: boolean = false) {
				if (all) {
					var parent = element.parentElement;
					while (parent) {
						if (parent.tagName.toLowerCase() === "contextmenu") {
							break;
						}
						parent = parent.parentElement;
					}
					if (
						parent !== null &&
						parent.tagName.toLowerCase() === "contextmenu"
					) {
						parent.style.display = "none";
					}
				}
				element.style.display = "none";
			},
			setItem: function (item: HTMLElement) {
				element.menuItems.push(item);
			},
			menuItems: [],
			hasParentMenu: hasParentMenu ?? false,
		},
	);
	element.style.display = "none";
	element.className =
		"absolute h-fit z-10 whitespace-nowrap bg-white border border-gray-300 divide-y divide-gray-100 rounded-lg shadow dark:bg-gray-700 dark:border-gray-600";
	element.oncontextmenu = (e) => e.preventDefault();

	return element as HTMLContextMenu;
};

type ContextMenuUIProps = {
	HTMLParent: HTMLElement;
	menuItems: HTMLElement[];
};

const ContextMenuUI = (p: ContextMenuUIProps) => {
	return (
		<>
			<ul class="overflow-y-auto text-sm text-gray-700 dark:text-gray-200 rounded-lg">
				{p.menuItems}
			</ul>
		</>
	);
};
