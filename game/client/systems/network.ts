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
	AnimationComponent,
} from "../components";
import { API_URL } from "../constants";
import { playAnimation } from "./animation";
import { createPlayer } from "../factory/player";
import { createDisconnectUI } from "../ui/disconnect";
import { createNameplate } from "../factory/nameplate";
import { createChatMessage } from "../factory/chatmessage";
import { createObject } from "../factory/object";
import * as buf from "../proto";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

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
			event: string,
			data?: Data | null | undefined,
			options?: EmitOptions | undefined,
		): void;
	};
	rawEmit(bytes: Uint8Array<ArrayBuffer>): void;
};

export function createNetworkSystem(world: World) {
	const playersByUsername = new Map<string, NetworkPlayer>();
	const playersByEid = new Map<number, NetworkPlayer>();
	const objectsById = new Map<string, NetworkObject>();
	const objectsByEid = new Map<number, NetworkObject>();

	const eventQueue: buf.WhirledEvent[] = [];

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
			event: string,
			data?: Data | null | undefined,
			options?: EmitOptions | undefined,
		) => {
			network.emit(event + "", data, options);
		},
		rawEmit: (bytes: Uint8Array<ArrayBuffer>) => {
			network.raw.emit(bytes);
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

		emitPlayerJoin(world);
		network.onRaw((data) => {
			if (!(data instanceof ArrayBuffer)) {
				console.error(
					`Expected raw data to be ArrayBuffer, is actually ${typeof data}:`,
					data,
				);
				return;
			}

			const bytes = new Uint8Array(data as unknown as ArrayBuffer);
			try {
				const whirledEvent: buf.WhirledEvent = fromBinary(
					buf.WhirledEventSchema,
					bytes,
				);
				if (whirledEvent.event.value === undefined) {
					return;
				}
				const type = whirledEvent.event.value.$typeName;
				const data = whirledEvent.event.value;
				console.log(`Server sent event '${type}' with data:`, data);
				eventQueue.push(whirledEvent);
			} catch (error) {}
		});
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
		for (let i = 0; i < eventQueue.length; i++) {
			let whirledEvent = eventQueue[i];
			switch (whirledEvent.event.case) {
				case "playerAuth": {
					const id = whirledEvent.event.value.id;
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
							const whirledEvent = create(buf.WhirledEventSchema);
							whirledEvent.event = {
								case: "playerAuth",
								value: create(buf.PlayerAuthSchema, {
									code,
									room,
								}),
							};

							const bytes = toBinary(
								buf.WhirledEventSchema,
								whirledEvent,
							);
							world.network.rawEmit(bytes);
						})
						.catch((e) => {
							console.error(e);
						});
					break;
				}
				case "playerJoin": {
					const player = whirledEvent.event.value.player;
					if (player === undefined) {
						break;
					}
					const playerEntity = createPlayer(
						world,
						player.username,
						player.local ?? false,
						undefined,
						player.file ?? "",
						player.initialScale ?? 1,
					);
					const eid = playerEntity.eid;

					if (player.position === undefined) {
						player.position = create(buf.PositionSchema, {
							x: 0.0,
							y: 0.0,
							z: 0.0,
						});
					}

					TransformComponent.position.x[eid] = player.position.x;
					TransformComponent.position.y[eid] = player.position.y;
					TransformComponent.position.z[eid] = player.position.z;

					if (player.rotation === undefined) {
						player.rotation = create(buf.RotationSchema, {
							x: 0.0,
							y: 0.0,
							z: 0.0,
						});
					}

					TransformComponent.rotation.x[eid] = player.rotation.x;
					TransformComponent.rotation.y[eid] = player.rotation.y;
					TransformComponent.rotation.z[eid] = player.rotation.z;
					TransformComponent.rotation.w[eid] = player.rotation.w;
					playerEntity.rotation._onChangeCallback();

					if (player.scale === undefined) {
						player.scale = create(buf.ScaleSchema, {
							x: 0.0,
							y: 0.0,
							z: 0.0,
						});
					}

					TransformComponent.scale.x[eid] = player.scale.x;
					TransformComponent.scale.y[eid] = player.scale.y;
					TransformComponent.scale.z[eid] = player.scale.z;

					const nameplateEntity = createNameplate(
						world,
						player.nickname,
					);
					addComponent(
						world,
						NameplateComponent,
						nameplateEntity.eid,
					);
					NameplateComponent.owner[nameplateEntity.eid] = eid;

					const networkPlayer: NetworkPlayer = {
						eid: eid,
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
					playersByEid.set(eid, networkPlayer);

					world.players.set(eid, {
						player: playerEntity,
						nameplate: nameplateEntity,
					});
					world.scene.add(playerEntity);
					break;
				}
				case "playerLeave": {
					const username = whirledEvent.event.value.username;
					console.log("huh");
					const player = playersByUsername.get(username);

					if (player === undefined) {
						break;
					}

					if (player.isLocal) {
						world.renderer.domElement.parentElement!.appendChild(
							createDisconnectUI(
								"You have been removed from the room",
							),
						);
						break;
					}

					removeEntity(world, player.eid);
					playersByUsername.delete(username);
					playersByEid.delete(player.eid);
					break;
				}
				case "playerMove": {
					const event = whirledEvent.event.value;
					const player = Object.assign(
						playersByUsername.get(event.username) as {
							eid: number;
							nickname: string;
						},
					);

					if (player === undefined) {
						console.error(
							"Could not find player:",
							player.username,
						);
						break;
					}

					if (event.position === undefined) {
						console.error(`Invalid movement by ${player.username}`);
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
					MoveTowardsComponent.x[player.eid] = event.position.x;
					MoveTowardsComponent.y[player.eid] = event.position.y;
					MoveTowardsComponent.z[player.eid] = event.position.z;
					break;
				}
				case "playerChat": {
					const event = whirledEvent.event.value;
					const player = Object.assign(
						playersByUsername.get(event.username) as {
							eid: number;
							nickname: string;
						},
					);
					const chatMessageEntity = createChatMessage(
						world,
						player.username,
						player.nickname,
						event.message,
					);
					addComponent(
						world,
						ChatMessageComponent,
						chatMessageEntity.eid,
					);
					break;
				}
				case "playerAnim": {
					const event = whirledEvent.event.value;
					const eid = playersByUsername.get(event.username)?.eid;
					if (eid === undefined) {
						break;
					}
					console.log(event.anim ?? -1);
					if (hasComponent(world, AnimationComponent, eid)) {
						playAnimation(world, eid, event.anim ?? -1);
					}
					break;
				}
				case "objectJoin": {
					const object = whirledEvent.event.value.object;

					if (object === undefined) break;

					const objectEntity = createObject(
						world,
						object.name ?? "Unnamed",
						object.file ?? "",
						object.initialScale ?? 1,
					);
					const eid = objectEntity.eid;

					if (object.position) {
						TransformComponent.position.x[eid] = object.position.x;
						TransformComponent.position.y[eid] = object.position.y;
						TransformComponent.position.z[eid] = object.position.z;
					}

					if (object.rotation) {
						TransformComponent.rotation.x[eid] = object.rotation.x;
						TransformComponent.rotation.y[eid] = object.rotation.y;
						TransformComponent.rotation.z[eid] = object.rotation.z;
						TransformComponent.rotation.w[eid] = object.rotation.w;
						objectEntity.rotation._onChangeCallback();
					}

					if (object.scale) {
						TransformComponent.scale.x[eid] = object.scale.x;
						TransformComponent.scale.y[eid] = object.scale.y;
						TransformComponent.scale.z[eid] = object.scale.z;
					}

					const networkObject: NetworkObject = {
						eid: eid,
						id: object.id,
						name: object.name,
					};

					objectsById.set(object.id, networkObject);
					objectsByEid.set(eid, networkObject);

					world.objects.set(eid, objectEntity);
					world.scene.add(objectEntity);
					break;
				}
				case "objectTransform": {
					const object = whirledEvent.event.value;
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

					if (object.position) {
						TransformComponent.position.x[eid] = object.position.x;
						TransformComponent.position.y[eid] = object.position.y;
						TransformComponent.position.z[eid] = object.position.z;
					}

					if (object.rotation) {
						TransformComponent.rotation.x[eid] = object.rotation.x;
						TransformComponent.rotation.y[eid] = object.rotation.y;
						TransformComponent.rotation.z[eid] = object.rotation.z;
						TransformComponent.rotation.w[eid] = object.rotation.w;
						objectEntity.rotation._onChangeCallback();
					}

					if (object.scale) {
						TransformComponent.scale.x[eid] = object.scale.x;
						TransformComponent.scale.y[eid] = object.scale.y;
						TransformComponent.scale.z[eid] = object.scale.z;
					}
					break;
				}
				case "objectLeave": {
					const object = whirledEvent.event.value;
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
				default: {
					console.warn(
						`warn: sent event '${whirledEvent.event}' which does not match a case`,
					);
					break;
				}
			}
			eventQueue.splice(i, 1);
			i--;
		}
		return world;
	});
}

/**
 * Emits to server that the player is trying to join (for the first time)
 *
 * There should be no reason to call this more than once, or expose this
 * to be called outside of this file.
 */
function emitPlayerJoin(world: World) {
	const whirledEvent = create(buf.WhirledEventSchema);
	whirledEvent.event = {
		case: "playerJoin",
		value: create(buf.PlayerJoinSchema),
	};

	const bytes = toBinary(buf.WhirledEventSchema, whirledEvent);
	world.network.rawEmit(bytes);
}

/**
 * Emits to server that the player is trying to send a message
 */
export function emitPlayerChat(world: World, message: string) {
	const whirledEvent = create(buf.WhirledEventSchema);
	whirledEvent.event = {
		case: "playerChat",
		value: create(buf.PlayerChatSchema, {
			message,
		}),
	};

	const bytes = toBinary(buf.WhirledEventSchema, whirledEvent);
	world.network.rawEmit(bytes);
}

/**
 * Emits to server that the player is trying to move their avatar
 */
export function emitPlayerMove(
	world: World,
	position: THREE.Vector3,
	rotation: THREE.Euler,
) {
	const whirledEvent = create(buf.WhirledEventSchema);
	whirledEvent.event = {
		case: "playerMove",
		value: create(buf.PlayerMoveSchema, {
			position,
			rotation,
		}),
	};

	const bytes = toBinary(buf.WhirledEventSchema, whirledEvent);
	world.network.rawEmit(bytes);
}

/**
 * Emits to server that the player is trying to play an action/state
 * animation with their avatar
 */
export function emitPlayerAnim(world: World, anim: string) {
	const whirledEvent = create(buf.WhirledEventSchema);
	whirledEvent.event = {
		case: "playerAnim",
		value: create(buf.PlayerAnimSchema, {
			anim,
		}),
	};

	const bytes = toBinary(buf.WhirledEventSchema, whirledEvent);
	world.network.rawEmit(bytes);
}

/**
 * Emits to server that an object is trying to join
 *
 * Ideally this would be a player having ownership of the object to
 * be able to do this (ex: room owner adding furniture)
 */
export function emitObjectJoin(world: World, id: string, type: number) {
	const whirledEvent = create(buf.WhirledEventSchema);
	whirledEvent.event = {
		case: "objectJoin",
		value: create(buf.ObjectJoinSchema, {
			object: create(buf.ObjectSchema, {
				id,
				type,
			}),
		}),
	};

	const bytes = toBinary(buf.WhirledEventSchema, whirledEvent);
	world.network.rawEmit(bytes);
}

/**
 * Emits to server that an object is moving (by the player)
 *
 * Ideally this would be a player having ownership of the object to
 * be able to do this (ex: room owner moving furniture)
 */
export function emitObjectTransform(
	world: World,
	id: string,
	isPlayer: boolean,
	position: THREE.Vector3,
	rotation: THREE.Euler,
	scale: THREE.Vector3,
) {
	const whirledEvent = create(buf.WhirledEventSchema);
	whirledEvent.event = {
		case: "objectTransform",
		value: create(buf.ObjectTransformSchema, {
			id,
			isPlayer,
			position,
			rotation,
			scale,
		}),
	};

	const bytes = toBinary(buf.WhirledEventSchema, whirledEvent);
	world.network.rawEmit(bytes);
}

/**
 * Emits to server that an object is leaving the room
 *
 * Ideally this would be a player having ownership of the object to
 * be able to do this (ex: room owner removing furniture)
 */
export function emitObjectLeave(world: World, id: string, isPlayer: boolean) {
	const whirledEvent = create(buf.WhirledEventSchema);
	whirledEvent.event = {
		case: "objectLeave",
		value: create(buf.ObjectLeaveSchema, {
			id,
			isPlayer,
		}),
	};

	const bytes = toBinary(buf.WhirledEventSchema, whirledEvent);
	world.network.rawEmit(bytes);
}
