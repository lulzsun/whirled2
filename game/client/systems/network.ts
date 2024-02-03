import { geckos } from "@geckos.io/client";
import { World } from "../factory/world";
import { addComponent, defineSystem } from "bitecs";
import { createEntity } from "../factory/entity";
import { TransformComponent } from "../components";
import * as THREE from "three";

export function createNetworkSystem() {
	let events: {
		type: string;
	}[] = [];
	const network = geckos({ port: 9696 });

	network.onConnect((error) => {
		if (error) {
			console.log("oh noes");
			console.error(error.message);
		}

		console.log("connected");

		// Example of sending and recieving from server
		// Client will send the event 'ping' with data 'hello'
		// Client will recieve the event 'pong' with data 'world'
		network.on("pong", (data) => {
			console.log(`Server sent event 'pong' with data '${data}'`);
			// events.push({ type: "createEntity" });
		});

		network.emit("ping", "hello", {
			reliable: false,
			interval: 150,
			runs: 10,
		});
	});

	network.onDisconnect((cb) => {
		console.log(cb);
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

			console.log(peerConnection.connectionState);
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
		for (let i = events.length - 1; i >= 0; i--) {
			let event = events[i];
			switch (event.type) {
				case "createEntity":
					const parent = createEntity(
						world,
						new THREE.BoxGeometry(100, 100, 100),
					);
					addComponent(world, TransformComponent, parent.eid);
					world.objects.set(parent.eid, parent);
					world.scene.add(parent);
					break;
				default:
					console.error("Unknown event type:", event.type);
					break;
			}
			events.splice(i, 1);
		}
		return world;
	});
}
