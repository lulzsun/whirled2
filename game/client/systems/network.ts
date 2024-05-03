import { Data, geckos } from "@geckos.io/client";
import { EmitOptions } from "@geckos.io/common/lib/types.js";
import { World } from "../factory/world";
import {
	addComponent,
	defineSystem,
	hasComponent,
	removeComponent,
	removeEntity,
} from "bitecs";
import {
	TransformComponent,
	MoveTowardsComponent,
	NameplateComponent,
	ChatMessageComponent,
	GltfComponent,
} from "../components";
import { API_URL } from "../constants";
import { playAnimation } from "./animation";
import { createPlayer } from "../factory/player";
import { createDisconnectUI } from "../ui/disconnect";
import { createNameplate } from "../factory/nameplate";
import { createChatMessage } from "../factory/chatmessage";
import { createObject } from "../factory/object";

export enum NetworkEvent {
	PlayerAuth,
	PlayerJoin,
	PlayerLeave,
	PlayerMove,
	PlayerChat,
	PlayerAnim,

	ObjectJoin,
	ObjectLeave,
	ObjectTransform,
}

export type NetworkPlayer = {
	eid: number;
	username: string;
	nickname: string;
	isLocal: boolean;
	isOwner: boolean;
};

export type NetworkObject = {
	eid: number;
	id: string;
	name: string;
};

export type Network = {
	getPlayer: {
		(eid: number): NetworkPlayer | null;
		(username: string): NetworkPlayer | null;
	};
	getObject: {
		(eid: number): NetworkObject | null;
		(id: string): NetworkObject | null;
	};
	emit: {
		(
			eventType: NetworkEvent,
			data?: Data | null | undefined,
			options?: EmitOptions | undefined,
		): void;
	};
};

export function createNetworkSystem(world: World) {
	const playersByUsername = new Map<string, NetworkPlayer>();
	const playersByEid = new Map<number, NetworkPlayer>();
	const objectsById = new Map<string, NetworkObject>();
	const objectsByEid = new Map<number, NetworkObject>();

	let events: {
		type: NetworkEvent;
		data: string | number | Object;
	}[] = [];

	const network = geckos({
		url: API_URL,
		//@ts-ignore
		port: null,
	});

	world.network = {
		getPlayer: (arg: number | string) => {
			if (typeof arg === "number") {
				const player = playersByEid.get(arg);
				if (!player) return null;
				return {
					eid: arg,
					username: player.username,
					nickname: player.nickname,
					isLocal: player.isLocal,
				} as NetworkPlayer;
			} else {
				const player = playersByUsername.get(arg);
				if (!player) return null;
				return {
					eid: player.eid,
					username: arg,
					nickname: player.nickname,
					isLocal: player.isLocal,
				} as NetworkPlayer;
			}
		},
		getObject: (arg: number | string) => {
			if (typeof arg === "number") {
				const object = objectsByEid.get(arg);
				if (!object) return null;
				return {
					eid: arg,
					id: object.id,
					name: object.name,
				} as NetworkObject;
			} else {
				const object = objectsById.get(arg);
				if (!object) return null;
				return {
					eid: object.eid,
					id: arg,
					name: object.name,
				} as NetworkObject;
			}
		},
		emit: (
			event: NetworkEvent,
			data?: Data | null | undefined,
			options?: EmitOptions | undefined,
		) => {
			network.emit(event + "", data, options);
		},
	};

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
				network.on(i + "", (data) => {
					const isEmpty =
						typeof data === "string" && data.length === 0;
					console.log(
						`Server sent event '${event}' ${isEmpty ? "" : "with data:"}`,
						data,
					);
					events.push({ type: i, data });
				});
			});

		world.network.emit(NetworkEvent.PlayerJoin);
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
					world.renderer.domElement.parentElement!.appendChild(
						createDisconnectUI(
							"Something went wrong connecting to server",
						),
					);
					break;
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
				case NetworkEvent.PlayerAuth:
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
							let room = "";
							if (window.location.pathname === "/") {
								const params = new URLSearchParams(
									window.location.search,
								);
								room = params.get("room") ?? "";
							}
							world.network.emit(
								NetworkEvent.PlayerAuth,
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
				case NetworkEvent.PlayerJoin: {
					const player: {
						username: string;
						nickname: string;
						local: boolean;
						owner: boolean;
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
						scale: {
							x: number;
							y: number;
							z: number;
						};
						eid: number;
					} = event.data as any;
					const playerEntity = createPlayer(
						world,
						player.username,
						player.local ?? false,
					);
					player.eid = playerEntity.eid;

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

					TransformComponent.scale.x[player.eid] = player.scale.x;
					TransformComponent.scale.y[player.eid] = player.scale.y;
					TransformComponent.scale.z[player.eid] = player.scale.z;

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
						isLocal: player.local,
						isOwner: player.owner,
					};

					if (player.local && player.owner) {
						document
							.getElementById("openEditorBtn")
							?.setAttribute("style", "");
					}

					playersByUsername.set(player.username, networkPlayer);
					playersByEid.set(player.eid, networkPlayer);

					world.players.set(player.eid, {
						player: playerEntity,
						nameplate: nameplateEntity,
					});
					world.scene.add(playerEntity);
					break;
				}
				case NetworkEvent.PlayerLeave: {
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
				case NetworkEvent.PlayerMove: {
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
				case NetworkEvent.PlayerChat: {
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
				case NetworkEvent.PlayerAnim: {
					const d: {
						username: string;
						action: number;
						state: number;
					} = event.data as any;
					const eid = playersByUsername.get(d.username)?.eid;
					if (eid === undefined) {
						break;
					}
					const player = world.players.get(eid)?.player;
					const anims = player?.children[0].animations;
					if (anims && hasComponent(world, GltfComponent, eid)) {
						playAnimation(
							world,
							eid,
							d.action ?? d.state ?? -1,
							anims,
						);
					}
					break;
				}
				case NetworkEvent.ObjectJoin: {
					const object: {
						id: string;
						name: string;
						file: string;
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
						scale: {
							x: number;
							y: number;
							z: number;
						};
						initialScale: number;
						eid: number;
					} = event.data as any;

					const objectEntity = createObject(
						world,
						object.name ?? "Unnamed",
						object.file ?? "",
						object.initialScale ?? 1,
					);
					object.eid = objectEntity.eid;

					TransformComponent.position.x[object.eid] =
						object.position.x;
					TransformComponent.position.y[object.eid] =
						object.position.y;
					TransformComponent.position.z[object.eid] =
						object.position.z;

					TransformComponent.rotation.x[object.eid] =
						object.rotation.x;
					TransformComponent.rotation.y[object.eid] =
						object.rotation.y;
					TransformComponent.rotation.z[object.eid] =
						object.rotation.z;
					TransformComponent.rotation.w[object.eid] =
						object.rotation.w;
					objectEntity.rotation._onChangeCallback();

					TransformComponent.scale.x[object.eid] = object.scale.x;
					TransformComponent.scale.y[object.eid] = object.scale.y;
					TransformComponent.scale.z[object.eid] = object.scale.z;

					const networkObject: NetworkObject = {
						eid: object.eid,
						id: object.id,
						name: object.name,
					};

					objectsById.set(object.id, networkObject);
					objectsByEid.set(object.eid, networkObject);

					world.objects.set(object.eid, objectEntity);
					world.scene.add(objectEntity);
					break;
				}
				case NetworkEvent.ObjectLeave: {
					const object: {
						id: string;
						isPlayer: boolean;
					} = event.data as any;
					console.log(object);
					let eid = -1;
					if (object.isPlayer) {
						eid = world.network.getPlayer(object.id)?.eid ?? -1;
						if (eid === -1) break;
						const player = playersByEid.get(eid);
						if (player === undefined) {
							break;
						}
						playersByUsername.delete(player.username);
						playersByEid.delete(eid);
					} else {
						eid = world.network.getObject(object.id)?.eid ?? -1;
						if (eid === -1) break;
						objectsById.delete(object.id);
						objectsByEid.delete(eid);
					}
					removeEntity(world, eid);
					break;
				}
				case NetworkEvent.ObjectTransform: {
					const object: {
						id: string;
						isPlayer: boolean;
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
						scale: {
							x: number;
							y: number;
							z: number;
						};
					} = event.data as any;
					let eid = -1;
					if (object.isPlayer) {
						eid = world.network.getPlayer(object.id)?.eid ?? -1;
					} else {
						eid = world.network.getObject(object.id)?.eid ?? -1;
					}
					if (eid === -1) break;
					const objectEntity = world.scene.getObjectByProperty(
						"eid",
						eid,
					);
					if (objectEntity === undefined) break;
					TransformComponent.position.x[eid] = object.position.x;
					TransformComponent.position.y[eid] = object.position.y;
					TransformComponent.position.z[eid] = object.position.z;

					TransformComponent.rotation.x[eid] = object.rotation.x;
					TransformComponent.rotation.y[eid] = object.rotation.y;
					TransformComponent.rotation.z[eid] = object.rotation.z;
					TransformComponent.rotation.w[eid] = object.rotation.w;
					objectEntity.rotation._onChangeCallback();

					TransformComponent.scale.x[eid] = object.scale.x;
					TransformComponent.scale.y[eid] = object.scale.y;
					TransformComponent.scale.z[eid] = object.scale.z;
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
