package server

import (
	"encoding/json"
	"log"

	gecgosio "github.com/lulzsun/gecgos.io"
	"github.com/pocketbase/dbx"
)

// Authorize a peer as user or guest and have them join a room
//
// After successful authorization, send "Join" event to all peers in room and
// let our peer know about existing peers in the room ("Join" event for each peer)
//
// If 'msg' does not provide a room, then join default room (bravenewwhirled)
func onAuth(peer *gecgosio.Peer, msg string) {
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

		player := map[string]interface{}{
			"username": client.Username,
			"nickname": client.Nickname,
			"local": true,
			"position": map[string]interface{}{
				"x": client.Position.X,
				"y": client.Position.Y,
				"z": client.Position.Z,
			},
			"rotation": map[string]interface{}{
				"x": client.Rotation.X,
				"y": client.Rotation.Y,
				"z": client.Rotation.Z,
				"w": client.Rotation.W,
			},
		}

		roomId, ok := j["room"].(string)
		if !ok || (ok && roomId == "") {
			// client did not provide a room id, check if client has a home room
			room := struct {
				Id string `db:"id" json:"id"`
			}{}
			err := pb.DB().
				NewQuery(`
					SELECT rooms.id
					FROM rooms 
					INNER JOIN users ON rooms.owner_id = users.id
					WHERE users.username = {:username} AND rooms.is_home = true
				`).
				Bind(dbx.Params{
					"username": client.Username,
				}).One(&room)

			if err != nil {
				roomId = "underwhirled"
			} else {
				roomId = room.Id
			}
		} else {
			// client provided a room id, check if room exists
			room := struct {
				Id string `db:"id" json:"id"`
			}{}
			err := pb.DB().
				NewQuery(`
					SELECT r1.id FROM rooms r1 WHERE r1.id = {:roomId}
					UNION ALL
					SELECT r2.id FROM rooms r2
					INNER JOIN users ON r2.owner_id = users.id
					WHERE users.username = {:username} AND r2.is_home = true
						AND NOT EXISTS (SELECT r1.id FROM rooms r1 WHERE r1.id = {:roomId})
				`).
				Bind(dbx.Params{
					"username": client.Username,
					"roomId": roomId,
				}).One(&room)

			if err != nil {
				roomId = "underwhirled"
			} else {
				roomId = room.Id
			}
		}

		// join our client to a room
		data, err := json.Marshal(player)
		if err != nil {
			log.Printf("Failed to join user '%s', unable to marshal json.", client.Username)
			return
		}
		peer.Join(roomId)
		peer.Emit("Join", string(data))
		log.Printf("User '%s' is joining room id '%s'", client.Username, roomId)

		// announce client to all other clients in the room
		player["local"] = false
		data, _ = json.Marshal(player)
		peers := peer.Broadcast(roomId)
		peers.Emit("Join", string(data))

		// let our client know about existing clients in the room
		for _, p := range peers {
			if clients[p.Id].Username == client.Username {
				continue
			}
			data, err := json.Marshal(map[string]interface{}{
				"username": clients[p.Id].Username,
				"nickname": clients[p.Id].Nickname,
				"local": false,
				"position": map[string]interface{}{
					"x": clients[p.Id].Position.X,
					"y": clients[p.Id].Position.Y,
					"z": clients[p.Id].Position.Z,
				},
				"rotation": map[string]interface{}{
					"x": clients[p.Id].Rotation.X,
					"y": clients[p.Id].Rotation.Y,
					"z": clients[p.Id].Rotation.Z,
					"w": clients[p.Id].Rotation.W,
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

func onMove(peer *gecgosio.Peer, msg string) {
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

	pos, posOk := data["position"].(map[string]interface{})

	if !posOk {
        log.Println("Error: Invalid or missing type for position")
        return
    }

    pos_x, xOk := pos["x"].(float64)
    pos_y, yOk := pos["y"].(float64)
    pos_z, zOk := pos["z"].(float64)

    if !xOk || !yOk || !zOk {
        log.Println("Error: Invalid type or missing type for x, y, or z")
        return
    }

	// Save position on the server
	client.Position.X = pos_x
	client.Position.Y = pos_y
	client.Position.Z = pos_z

	rot, rotOk := data["rotation"].(map[string]interface{})

	if !rotOk {
        log.Println("Error: Invalid or missing type for rotation")
        return
    }

    rot_x, xOk := rot["x"].(float64)
    rot_y, yOk := rot["y"].(float64)
    rot_z, zOk := rot["z"].(float64)
	rot_w, wOk := rot["w"].(float64)

    if !xOk || !yOk || !zOk || !wOk {
        log.Println("Error: Invalid type or missing type for x, y, or z")
        return
    }

	// Save rotation on the server
	client.Rotation.X = rot_x
	client.Rotation.Y = rot_y
	client.Rotation.Z = rot_z
	client.Rotation.W = rot_w

	// Marshal the map back into a JSON string
	updatedMsg, err := json.Marshal(data)
	if err != nil {
		log.Println("Error:", err)
		return
	}

	peer.Room().Emit("Move", string(updatedMsg));
}

func onChat(peer *gecgosio.Peer, msg string) {
	client := clients[peer.Id]

	// Create a new msg map (JSON)
	var data map[string]interface{} = map[string]interface{}{
		"username": client.Username,
		"message": msg[1:len(msg)-1],
	}

	// Marshal the map back into a JSON string
	updatedMsg, err := json.Marshal(data)
	if err != nil {
		log.Println("Error:", err)
		return
	}

	peer.Room().Emit("Chat", string(updatedMsg));
}

func onAnim(peer *gecgosio.Peer, msg string) {
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

	// Marshal the map back into a JSON string
	updatedMsg, err := json.Marshal(data)
	if err != nil {
		log.Println("Error:", err)
		return
	}

	peer.Broadcast().Emit("Anim", string(updatedMsg));
}