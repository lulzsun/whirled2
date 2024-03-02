import React from "jsx-dom";
import { World } from "../factory/world";
import { getActionNames, getStateNames } from "../systems/animation";
import { entityExists } from "bitecs";
import { API_URL } from "../constants";
import { createContextMenuUI } from "./contextmenu";

export const createPlayerContextMenuUI = (world: World, eid: number) => {
	if (!entityExists(world, eid)) throw `Could not find eid: ${eid}`;

	const player = world.network.getPlayer(eid);
	const firstModelAnims = world.players.get(player.eid)?.player.children[0]
		.animations;

	const animations = {
		states: getStateNames(firstModelAnims),
		actions: getActionNames(firstModelAnims),
	};

	const statesAnimMenu = createContextMenuUI(true);
	const onStatesMenuOpen: React.MouseEventHandler<HTMLButtonElement> = (
		event,
	) => {
		event.currentTarget.parentElement!.appendChild(statesAnimMenu);
		statesAnimMenu.setItem(createAnimationMenu(animations.states));
		statesAnimMenu.open(event);
		actionsAnimMenu.close();
	};

	const actionsAnimMenu = createContextMenuUI(true);
	const onActionsMenuOpen: React.MouseEventHandler<HTMLButtonElement> = (
		event,
	) => {
		event.currentTarget.parentElement!.appendChild(actionsAnimMenu);
		actionsAnimMenu.setItem(createAnimationMenu(animations.actions));
		actionsAnimMenu.open(event);
		statesAnimMenu.close();
	};

	return (
		<>
			<li class="flex space-x-2 px-4 py-2 text-sm text-gray-900 dark:text-white">
				<img
					class="w-10 h-10 rounded-full"
					src={`${API_URL}/static/profile_picture.png`}
				/>
				<div>
					<div class="font-bold truncate">{player.nickname}</div>
					<div class="font-medium">@{player.username}</div>
				</div>
			</li>
			{player.isLocal && (
				<>
					<li>
						<button
							type="button"
							class="border-t border-white flex items-center justify-between w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white"
							onClick={onStatesMenuOpen}
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
							onClick={onActionsMenuOpen}
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
				</>
			)}
			{!/^Guest/i.test(player.username) && (
				<li class="border-t border-white">
					<a
						hx-target="#page"
						hx-push-url="false"
						href={`/profile/${player.username}`}
						class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200 dark:hover:text-white"
					>
						View Profile
					</a>
				</li>
			)}
		</>
	) as HTMLElement;
};

export const createAnimationMenu = (names: string[]) => {
	return (
		<>
			<div class="z-10 bg-white divide-y divide-gray-100 rounded-lg shadow dark:bg-gray-700">
				<ul
					class="text-sm text-gray-700 dark:text-gray-200"
					aria-labelledby="doubleDropdownButton"
				>
					{names.map((name, i) => {
						return (
							<li>
								<button
									key={i}
									type="button"
									class="block w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white"
									onClick={(_) => {
										console.log("Play animation:", name);
									}}
								>
									{name.replace(/_(action|state)$/i, "")}
								</button>
							</li>
						);
					})}
				</ul>
			</div>
		</>
	) as HTMLElement;
};
