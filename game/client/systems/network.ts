import { geckos } from "@geckos.io/client";
import { World } from "../factory/world";
import {
	addComponent,
	defineQuery,
	defineSystem,
	hasComponent,
	removeComponent,
	removeEntity,
} from "bitecs";
import { Entity, createEntity } from "../factory/entity";
import {
	PlayerComponent,
	LocalPlayerComponent,
	SpineComponent,
	TransformComponent,
	MoveTowardsComponent,
} from "../components";
import { createDisconnectUI } from "../ui/disconnect";

export enum NetworkEvent {
	Auth,
	Join,
	Leave,
	Move,
}

export const playersQuery = defineQuery([
	LocalPlayerComponent,
	PlayerComponent,
]);

export function createNetworkSystem(world: World) {
	const playersByUsername = new Map<
		string,
		{ eid: number; nickname: string }
	>();

	let events: {
		type: NetworkEvent;
		data: string | number | Object;
	}[] = [];
	const network = geckos({ port: 42069 });
	world.network = network;

	network.onConnect((error) => {
		if (error) {
			world.canvas.parentElement?.appendChild(
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
		world.canvas.parentElement?.appendChild(
			createDisconnectUI("Lost connection to server"),
		);

		if (error === undefined) {
			console.log("Disconnected from gecgos.io server");
			return;
		}
		console.log("Disconnected from gecgos.io server:", error);
	});

	// @ts-ignore
	const connectionsManager: ClientChannel = network.connectionsManager;

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
					fetch(`http://127.0.0.1:42069/game/${id}/auth`, {
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
					const entity = createEntity(world);
					const player: {
						username: string;
						nickname: string;
						local: boolean;
						position: {
							x: number;
							y: number;
							z: number;
						};
						eid: number;
					} = event.data as any;
					player.eid = entity.eid;

					playersByUsername.set(player.username, {
						eid: player.eid,
						nickname: player.nickname,
					});
					addComponent(world, TransformComponent, player.eid);
					TransformComponent.position.x[player.eid] =
						player.position.x;
					TransformComponent.position.y[player.eid] =
						player.position.y;
					TransformComponent.position.z[player.eid] =
						player.position.z;
					if (player.local) {
						addComponent(world, LocalPlayerComponent, player.eid);
					}
					addComponent(world, PlayerComponent, player.eid);
					addComponent(world, SpineComponent, player.eid);
					SpineComponent.timeScale[player.eid] = 1000;
					world.objects.set(player.eid, entity);
					world.scene.add(entity);
					break;
				}
				case NetworkEvent.Leave: {
					const username = event.data as string;
					const player = playersByUsername.get(username);

					if (player === undefined) {
						break;
					}

					removeEntity(world, playersByUsername.get(username)!.eid);
					playersByUsername.delete(username);
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
							x: number;
							y: number;
							z: number;
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
					MoveTowardsComponent.x[player.eid] = player.x;
					MoveTowardsComponent.y[player.eid] = player.y;
					MoveTowardsComponent.z[player.eid] = player.z;
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
