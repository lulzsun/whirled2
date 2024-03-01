import { ClientChannel, geckos } from "@geckos.io/client";
import { World } from "../factory/world";
import {
	addComponent,
	defineSystem,
	hasComponent,
	removeComponent,
	removeEntity,
} from "bitecs";
import { createPlayer } from "../factory/player";
import {
	TransformComponent,
	MoveTowardsComponent,
	NameplateComponent,
	ChatMessageComponent,
} from "../components";
import { createDisconnectUI } from "../ui/disconnect";
import { createNameplate } from "../factory/nameplate";
import { createChatMessage } from "../factory/chatmessage";
import { API_URL } from "../constants";

export enum NetworkEvent {
	Auth,
	Join,
	Leave,
	Move,
	Chat,
}

export type NetworkPlayer = {
	eid: number;
	username: string;
	nickname: string;
	isLocal: boolean;
};

export type Network = ClientChannel & {
	getPlayer: {
		(eid: number): NetworkPlayer;
		(username: string): NetworkPlayer;
	};
};

export function createNetworkSystem(world: World) {
	const playersByUsername = new Map<string, NetworkPlayer>();
	const playersByEid = new Map<number, NetworkPlayer>();

	let events: {
		type: NetworkEvent;
		data: string | number | Object;
	}[] = [];
	const network: Network = Object.assign(geckos({ port: 42069 }), {
		getPlayer: (arg: number | string) => {
			if (typeof arg === "number") {
				const player = playersByEid.get(arg);
				if (!player) throw `Issue finding player by eid: ${arg}`;
				return {
					eid: arg,
					username: player.username,
					nickname: player.nickname,
					isLocal: player.isLocal,
				} as NetworkPlayer;
			} else {
				const player = playersByUsername.get(arg);
				if (!player) throw `Issue finding player by username: ${arg}`;
				return {
					eid: player.eid,
					username: arg,
					nickname: player.nickname,
					isLocal: player.isLocal,
				} as NetworkPlayer;
			}
		},
	});
	world.network = network;

	network.onConnect((error) => {
		if (error) {
			world.renderer.domElement.parentElement!.appendChild(
				createDisconnectUI("Something went wrong connecting to server"),
			);
			console.error(error.message);
		}

		console.log("connected");

		Object.keys(NetworkEvent)
			.filter((v) => isNaN(Number(v)))
			.forEach((event, i) => {
				network.on(event, (data) => {
					const isEmpty =
						typeof data === "string" && data.length === 0;
					console.log(
						`Server sent event '${event}' ${isEmpty ? "" : "with data:"}`,
						data,
					);
					events.push({ type: i, data });
				});
			});

		network.emit("Join");
	});

	network.onDisconnect((error) => {
		world.renderer.domElement.parentElement!.appendChild(
			createDisconnectUI("Lost connection to server"),
		);

		if (error === undefined) {
			console.log("Disconnected from gecgos.io server");
			return;
		}
		console.log("Disconnected from gecgos.io server:", error);
	});

	// @ts-ignore
	const connectionsManager: any = network.connectionsManager;

	// we can handle websocket fallback here?
	(function repeatUntilCondition() {
		if (!connectionsManager.localPeerConnection) {
			setTimeout(repeatUntilCondition, 1000);
		} else {
			const peerConnection: RTCPeerConnection =
				connectionsManager.localPeerConnection;

			// console.log(peerConnection.connectionState);
			switch (peerConnection.connectionState) {
				case "failed":
				case "connected":
					break;
				default:
					setTimeout(repeatUntilCondition, 1000);
					break;
			}
		}
	})();

	return defineSystem((world: World) => {
		for (let i = 0; i < events.length; i++) {
			let event = events[i];
			switch (event.type) {
				case NetworkEvent.Auth:
					const id = event.data;
					// Make a request to get auth code
					fetch(`${API_URL}/game/${id}/auth`, {
						method: "GET",
						mode: "cors",
						credentials: "include",
					})
						.then((response) => {
							if (response.ok) {
								return response.text();
							}
							throw new Error("Something went wrong");
						})
						.then((code: string) => {
							const room = "bravenewwhirled";
							network.emit(
								"Auth",
								{ code, room },
								{
									reliable: true,
									interval: 150,
									runs: 10,
								},
							);
						})
						.catch((e) => {
							console.error(e);
						});
					break;
				case NetworkEvent.Join: {
					const playerEntity = createPlayer(
						world,
						(event.data as any).local ?? false,
					);
					const player: {
						username: string;
						nickname: string;
						local: boolean;
						position: {
							x: number;
							y: number;
							z: number;
						};
						rotation: {
							x: number;
							y: number;
							z: number;
							w: number;
						};
						eid: number;
					} = event.data as any;
					player.eid = playerEntity.eid;

					const nameplateEntity = createNameplate(
						world,
						player.nickname,
					);
					addComponent(
						world,
						NameplateComponent,
						nameplateEntity.eid,
					);
					NameplateComponent.owner[nameplateEntity.eid] = player.eid;

					const networkPlayer: NetworkPlayer = {
						eid: player.eid,
						username: player.username,
						nickname: player.nickname,
						isLocal: false,
					};

					playersByUsername.set(player.username, networkPlayer);
					playersByEid.set(player.eid, networkPlayer);

					TransformComponent.position.x[player.eid] =
						player.position.x;
					TransformComponent.position.y[player.eid] =
						player.position.y;
					TransformComponent.position.z[player.eid] =
						player.position.z;

					TransformComponent.rotation.x[player.eid] =
						player.rotation.x;
					TransformComponent.rotation.y[player.eid] =
						player.rotation.y;
					TransformComponent.rotation.z[player.eid] =
						player.rotation.z;
					TransformComponent.rotation.w[player.eid] =
						player.rotation.w;
					playerEntity.rotation._onChangeCallback();

					world.players.set(player.eid, {
						player: playerEntity,
						nameplate: nameplateEntity,
					});
					world.scene.add(playerEntity);
					break;
				}
				case NetworkEvent.Leave: {
					const username = event.data as string;
					const player = playersByUsername.get(username);

					if (player === undefined) {
						break;
					}

					removeEntity(world, player.eid);
					playersByUsername.delete(username);
					playersByEid.delete(player.eid);
					break;
				}
				case NetworkEvent.Move: {
					const player = Object.assign(
						playersByUsername.get((event.data as any).username) as {
							eid: number;
							nickname: string;
						},
						event.data as any as {
							username: string;
							position: {
								x: number;
								y: number;
								z: number;
							};
							rotation: {
								x: number;
								y: number;
								z: number;
								w: number;
							};
						},
					);

					if (player === undefined) {
						console.error(
							"Could not find player:",
							(event.data as any).username,
						);
						break;
					}
					if (hasComponent(world, MoveTowardsComponent, player.eid)) {
						removeComponent(
							world,
							MoveTowardsComponent,
							player.eid,
						);
					}
					addComponent(world, MoveTowardsComponent, player.eid);
					MoveTowardsComponent.x[player.eid] = player.position.x;
					MoveTowardsComponent.y[player.eid] = player.position.y;
					MoveTowardsComponent.z[player.eid] = player.position.z;
					break;
				}
				case NetworkEvent.Chat: {
					const player = Object.assign(
						playersByUsername.get((event.data as any).username) as {
							eid: number;
							nickname: string;
						},
						event.data as any as {
							username: string;
							message: string;
						},
					);
					const chatMessageEntity = createChatMessage(
						world,
						player.username,
						player.nickname,
						player.message,
					);
					addComponent(
						world,
						ChatMessageComponent,
						chatMessageEntity.eid,
					);
					break;
				}
				default: {
					console.error("Unhandled event:", event.type, event.data);
					break;
				}
			}
			events.splice(i, 1);
			i--;
		}
		return world;
	});
}
