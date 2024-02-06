import { geckos } from "@geckos.io/client";
import { World } from "../factory/world";
import { addComponent, defineQuery, defineSystem, removeEntity } from "bitecs";
import { createEntity } from "../factory/entity";
import {
	PlayerComponent,
	SpineComponent,
	TransformComponent,
} from "../components";

export enum NetworkEvent {
	Auth,
	Join,
	Leave,
}

export const playersQuery = defineQuery([PlayerComponent]);

export function createNetworkSystem() {
	const playersByUsername = new Map<
		string,
		{ eid: number; nickname: string }
	>();

	let events: {
		type: NetworkEvent;
		data: string | number | Object;
	}[] = [];
	const network = geckos({ port: 42069 });

	network.onConnect((error) => {
		if (error) {
			console.log("oh noes");
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
		if (error === undefined) {
			console.log("Lost connection to gecgos.io server");
			return;
		}

		console.log("Disconnected from gecgos.io server:", error);
	});

	// @ts-ignore
	const connectionsManager: ClientChannel = network.connectionsManager;
	console.log(connectionsManager);

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
					const ent = createEntity(world);
					const player: {
						username: string;
						nickname: string;
					} = event.data as any;

					playersByUsername.set(player.username, {
						eid: ent.eid,
						nickname: player.nickname,
					});
					addComponent(world, TransformComponent, ent.eid);
					addComponent(world, PlayerComponent, ent.eid);
					addComponent(world, SpineComponent, ent.eid);
					SpineComponent.timeScale[ent.eid] = 1000;
					world.objects.set(ent.eid, ent);
					world.scene.add(ent);
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
