import { geckos } from "@geckos.io/client";
import { World } from "../factory/world";
import { defineSystem } from "bitecs";

export function createNetworkSystem() {
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
		// handle movement of networked entities
		return world;
	});
}
