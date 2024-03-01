import React from "jsx-dom";
import { World } from "../factory/world";
import { getActionNames, getStateNames } from "../systems/animation";
import { entityExists } from "bitecs";
import { API_URL } from "../constants";

export const createPlayerContextMenuUI = (world: World, eid: number) => {
	if (!entityExists(world, eid)) throw `Could not find eid: ${eid}`;

	const player = world.network.getPlayer(eid);

	return (
		<>
			<li class="px-4 py-2 text-sm text-gray-900 dark:text-white border-b border-white">
				<img
					class="w-10 h-10 rounded-full"
					src={`${API_URL}/static/profile_picture.png`}
				/>
				<div>{player.nickname}</div>
				<div class="font-medium truncate">@{player.username}</div>
			</li>
			<li>
				<button
					type="button"
					class="relative flex items-center justify-between w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white"
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
			</li>
			<li>
				<button
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
			</li>
			<li class="border-t border-white">
				<a
					href="#"
					class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200 dark:hover:text-white "
				>
					View Avatar in Stuff
				</a>
			</li>
		</>
	) as HTMLElement;
};
