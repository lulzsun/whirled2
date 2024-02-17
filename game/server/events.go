package server

import (
	"encoding/json"
	"log"

	gecgosio "github.com/lulzsun/gecgos.io"
)

// Authorize a peer as user or guest and have them join a room
//
// After successful authorization, send "Join" event to all peers in room and
// let our peer know about existing peers in the room ("Join" event for each peer)
//
// If 'msg' does not provide a room, then join default room (bravenewwhirled)
func onAuth(peer gecgosio.Peer, msg string) {
	client := clients[peer.Id]

	if client.Auth == "" {
		// user is already authorized at this point
		return
	}

	var j map[string]interface{}
	err := json.Unmarshal([]byte(msg), &j)
	if err != nil {
		return
	}
	
	if j["code"] != nil && client.Auth == j["code"] {
		log.Printf("Successfully authorized '%s' as '%s'", peer.Id, client.Username)

		// check if peer already auth'd, if so we perform a "reconnect"
		if peerId, ok := usernameToPeer[client.Username]; ok {
			log.Printf("Disconnecting client '%s' authorized as '%s'", peerId, client.Username)
			clients[peerId].Peer.Disconnect()
		}
		usernameToPeer[client.Username] = peer.Id

		data, err := json.Marshal(map[string]interface{}{
			"username": client.Username,
			"local": true,
			"position": map[string]interface{}{
				"x": client.Position.X,
				"y": client.Position.Y,
				"z": client.Position.Z,
			},
		})
		if err != nil {
			log.Printf("Failed to join user '%s', unable to marshal json.", client.Username)
			return
		}

		defaultRoom := "bravenewwhirled"
		room, ok := j["room"].(string)
		if !ok {
			room = defaultRoom
		}

		// join our client to a room, and announce it to all clients in the room
		peer.Join(room)
		peers := peer.Room(room)
		peers.Emit("Join", string(data))

		// let our client know about existing clients in the room
		for _, p := range peers {
			if clients[p.Id].Username == client.Username {
				continue
			}
			data, err := json.Marshal(map[string]interface{}{
				"username": clients[p.Id].Username,
				"local": false,
				"position": map[string]interface{}{
					"x": clients[p.Id].Position.X,
					"y": clients[p.Id].Position.Y,
					"z": clients[p.Id].Position.Z,
				},
			})
			if err != nil {
				log.Printf("Failed to join user '%s', unable to marshal json.", client.Username)
				continue
			}
			peer.Emit("Join", string(data))
		}
		
		client.Auth = ""
	} else {
		log.Printf("Failed to authorize '%s', provided wrong auth code?", peer.Id)
	}
	
	clients[peer.Id] = client
}

func onMove(peer gecgosio.Peer, msg string) {
	client := clients[peer.Id]

	// Parse the JSON string into a map
	var data map[string]interface{}
	err := json.Unmarshal([]byte(msg), &data)
	if err != nil {
		log.Println("Error:", err)
		return
	}

	// Add the username property to the map
	data["username"] = client.Username

	// Save position on the server
	client.Position.X = data["x"].(float64)
	client.Position.Y = data["y"].(float64)
	client.Position.Z = data["z"].(float64)

	// Marshal the map back into a JSON string
	updatedMsg, err := json.Marshal(data)
	if err != nil {
		log.Println("Error:", err)
		return
	}

	peer.Room().Emit("Move", string(updatedMsg));
}