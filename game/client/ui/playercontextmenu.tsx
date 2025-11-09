import { World } from "../factory/world";
import { MouseEventHandler } from "jsx-dom";
import {
	getActionNames,
	getStateNames,
	playAnimation,
} from "../systems/animation";
import { entityExists } from "bitecs";
import { API_URL } from "../constants";
import { createContextMenuUI } from "./contextmenu";
import { NetworkPlayer } from "../systems/network/network";

export const createPlayerContextMenuUI = (world: World, eid: number) => {
	if (!entityExists(world, eid)) throw `Could not find eid: ${eid}`;

	let player = world.players.get(eid);
	if (player === null) throw `Could not find player with eid: ${eid}`;

	const firstModelAnims =
		world.players.get(eid)?.player.children[0].animations;
	if (firstModelAnims === undefined) throw `No animations for eid: ${eid}`;

	const animations = {
		states: getStateNames(firstModelAnims),
		actions: getActionNames(firstModelAnims),
	};

	const statesAnimMenu = createContextMenuUI(true);
	const onStatesMenuOpen: MouseEventHandler<HTMLButtonElement> = (event) => {
		event.currentTarget.parentElement!.appendChild(statesAnimMenu);
		statesAnimMenu.setItem(
			createAnimationMenu(
				world,
				eid,
				animations.states,
				statesAnimMenu.close,
			),
		);
		statesAnimMenu.open(event);
		actionsAnimMenu.close();
	};

	const actionsAnimMenu = createContextMenuUI(true);
	const onActionsMenuOpen: MouseEventHandler<HTMLButtonElement> = (event) => {
		event.currentTarget.parentElement!.appendChild(actionsAnimMenu);
		actionsAnimMenu.setItem(
			createAnimationMenu(
				world,
				eid,
				animations.actions,
				actionsAnimMenu.close,
			),
		);
		actionsAnimMenu.open(event);
		statesAnimMenu.close();
	};

	// fallback network player is this is a preview world
	let networkPlayer: NetworkPlayer = {
		eid,
		isLocal: true,
		isOwner: true,
		nickname: "Test",
		username: "",
	};
	if (!world.isPreview) {
		networkPlayer = world.network.getPlayer(eid)!;
		if (networkPlayer === null) {
			throw `Could not find player with eid: ${eid}`;
		}
	}

	return (
		<>
			{networkPlayer.username !== "" && (
				<li class="flex space-x-2 px-4 py-2 text-sm text-gray-900 dark:text-white border-b border-white">
					<img
						class="w-10 h-10 rounded-full"
						src={`${API_URL}/static/assets/profile_picture.png`}
					/>

					<div>
						<div class="font-bold truncate">
							{networkPlayer.nickname}
						</div>

						<div class="font-medium">@{networkPlayer.username}</div>
					</div>
				</li>
			)}
			{networkPlayer.isLocal && (
				<>
					<li>
						<button
							type="button"
							class="flex items-center justify-between w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white"
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
			{!/^Guest/i.test(networkPlayer.username) &&
				networkPlayer.username !== "" && (
					<li class="border-t border-white">
						<a
							hx-target="#page"
							hx-push-url="true"
							href={`/profile/${networkPlayer.username}`}
							class="cursor-default block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200 dark:hover:text-white"
							onClick={(e) => {
								var parent = (e.target as HTMLElement)
									.parentElement;
								while (parent) {
									if (
										parent.tagName.toLowerCase() ===
										"contextmenu"
									) {
										break;
									}
									parent = parent.parentElement;
								}
								if (
									parent !== null &&
									parent.tagName.toLowerCase() ===
										"contextmenu"
								) {
									parent.style.display = "none";
								}
							}}
						>
							View Profile
						</a>
					</li>
				)}
		</>
	) as HTMLElement;
};

export const createAnimationMenu = (
	world: World,
	eid: number,
	names: string[],
	close: (all?: boolean) => void,
) => {
	return (
		<>
			<div class="z-10 bg-white divide-y divide-gray-100 rounded-lg shadow dark:bg-gray-700">
				<ul class="text-sm text-gray-700 dark:text-gray-200">
					{names.map((name, i) => {
						return (
							<li>
								<button
									key={i}
									type="button"
									class="block w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white"
									onClick={(_) => {
										playAnimation(world, eid, name);
										close(true);
									}}
								>
									{name.replace(/^(action|state)_/i, "")}
								</button>
							</li>
						);
					})}
				</ul>
			</div>
		</>
	) as HTMLElement;
};
