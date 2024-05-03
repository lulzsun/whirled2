package server

import (
	"encoding/json"
	"log"

	gecgosio "github.com/lulzsun/gecgos.io"
	"github.com/pocketbase/dbx"
)

// player spawning an object (furniture) into a room
func onObjectJoin(peer *gecgosio.Peer, msg string) {
	client := clients[peer.Id]

	// note: this assumes the client is only in a single room
	roomId := peer.Rooms()[0]

	// Parse the JSON string into a map
	var data map[string]interface{}
	err := json.Unmarshal([]byte(msg), &data)
	if err != nil {
		log.Println("Error:", err)
		return
	}

	// making sure client payload contains these fields
	objectId, okId := data["id"].(string)
	objectType, okType := data["type"].(float64) // int no worky
	if !okId || !okType || objectType != 2 {
		return
	}

	// making sure this object does not already exist
	if _, ok := objects[roomId][objectId]; ok {
		return
	}

	// check if client owns the current room they're in
	err = pb.DB().
		NewQuery(`
			SELECT r.id
			FROM rooms r
			INNER JOIN users u ON r.owner_id = u.id
			WHERE r.id = {:roomId} AND u.username = {:username}
		`).
		Bind(dbx.Params{
			"roomId": roomId,
			"username": client.Username,
		}).One(&struct{}{})

	if err != nil {
		// user does not own this room, so do nothing
		return
	}

	// retrieve object (furniture) data from db
	dbObject := struct {
		Id string		`db:"id" json:"id"`
		Type int		`db:"type" json:"type"`
		StuffId string	`db:"stuff_id" json:"stuff_id"`

		Name string		`db:"name" json:"name"`
		File string		`db:"file" json:"file"`
		Scale int		`db:"scale" json:"scale"`
	}{}
	err = pb.DB().
		NewQuery(`
			SELECT
				s.id, 
				s.type, 
				s.stuff_id, 
				f.creator_id, 
				f.name, 
				f.description,
				f.file,
				f.scale
			FROM stuff s
			INNER JOIN furniture f ON f.id = s.stuff_id
			WHERE s.id = {:id}
		`).
		Bind(dbx.Params{
			"id": objectId,
		}).One(&dbObject)

	if err != nil {
		log.Println(err)
		return
	}
	dbObject.File = "/api/files/furniture/" + dbObject.StuffId + "/" + dbObject.File

	// prepare object (furniture) data
	object := &Object{
		Id: dbObject.Id,
		Type: dbObject.Type,
		StuffId: dbObject.StuffId,
		Name: dbObject.Name,
		File: dbObject.File,
		Position: Position{
			X: 0,
			Y: 0,
			Z: 0,
		},
		Rotation: Rotation{
			X: 0,
			Y: 0,
			Z: 0,
			W: 0,
		},
		Scale: Scale{
			X: 1,
			Y: 1,
			Z: 1,
		},
		InitialScale: dbObject.Scale,
	}

	newData, err := json.Marshal(object)
	if err != nil {
		log.Printf("Failed to join object '%s', unable to marshal json.", client.Username)
		return
	}

	// prepare to store as server object
	if _, ok := objects[roomId]; !ok {
		objects[roomId] = make(map[string]*Object)
	}
	objects[roomId][objectId] = object
	log.Printf("Object '%s' is joining room '%s'", objectId, roomId)

	peer.Room().Emit(ObjectJoin, string(newData))
}

// player removing an object (furniture) from a room
func onObjectLeave(peer *gecgosio.Peer, msg string) {
	client := clients[peer.Id]

	// note: this assumes the client is only in a single room
	roomId := peer.Rooms()[0]

	// Parse the JSON string into a map
	var data map[string]interface{}
	err := json.Unmarshal([]byte(msg), &data)
	if err != nil {
		log.Println("Error:", err)
		return
	}

	id, okId := data["id"].(string)
	isPlayer, okIsPlayer := data["isPlayer"].(bool)
	if !okId || !okIsPlayer {
		return
	}

	// making sure this object or player exists
	if isPlayer {
		if _, ok := usernameToPeerId[id]; !ok {
			return
		}
	} else {
		if _, ok := objects[roomId][id]; !ok {
			return
		}
	}

	// check if client owns the current room they're in
	err = pb.DB().
		NewQuery(`
			SELECT r.id
			FROM rooms r
			INNER JOIN users u ON r.owner_id = u.id
			WHERE r.id = {:roomId} AND u.username = {:username}
		`).
		Bind(dbx.Params{
			"roomId": roomId,
			"username": client.Username,
		}).One(&struct{}{})

	if err != nil {
		// user does not own this room, so do nothing
		return
	}

	if isPlayer {
		// TODO: kick player
		return
	} else {
		delete(objects[roomId], id)
		log.Printf("Object '%s' has been deleted from room '%s'", id, roomId)
	}
	peer.Room().Emit(ObjectLeave, string(msg))
}

func onObjectTransform(peer *gecgosio.Peer, msg string) {
	client := clients[peer.Id]

	// note: this assumes the client is only in a single room
	roomId := peer.Rooms()[0]

	// Parse the JSON string into a map
	var data map[string]interface{}
	err := json.Unmarshal([]byte(msg), &data)
	if err != nil {
		log.Println("Error:", err)
		return
	}

	id, okId := data["id"].(string)
	isPlayer, okIsPlayer := data["isPlayer"].(bool)
	if !okId || !okIsPlayer {
		return
	}

	// making sure this object or player exists
	if isPlayer {
		if _, ok := usernameToPeerId[id]; !ok {
			return
		}
	} else {
		if _, ok := objects[roomId][id]; !ok {
			return
		}
	}

	// check if client owns the current room they're in
	err = pb.DB().
		NewQuery(`
			SELECT r.id
			FROM rooms r
			INNER JOIN users u ON r.owner_id = u.id
			WHERE r.id = {:roomId} AND u.username = {:username}
		`).
		Bind(dbx.Params{
			"roomId": roomId,
			"username": client.Username,
		}).One(&struct{}{})

	if err != nil {
		// user does not own this room, so do nothing
		return
	}

	posData, okPos := data["position"].(map[string]interface{})
	rotData, okRot := data["rotation"].(map[string]interface{})
	scaData, okSca := data["scale"].(map[string]interface{})

	position := Position{}
	rotation := Rotation{}
	scale := Scale{}

	if okPos {
		s, _ := json.Marshal(posData)
		err = json.Unmarshal([]byte(s), &position)
		if err == nil {
			if isPlayer {
				clients[usernameToPeerId[id]].Position = position
			} else {
				objects[roomId][id].Position = position
			}
		}
	}
	if okRot {
		s, _ := json.Marshal(rotData)
		err = json.Unmarshal([]byte(s), &rotation)
		if err == nil {
			if isPlayer {
				clients[usernameToPeerId[id]].Rotation = rotation
			} else {
				objects[roomId][id].Rotation = rotation
			}
		}
	}
	if okSca {
		s, _ := json.Marshal(scaData)
		err = json.Unmarshal([]byte(s), &scale)
		if err == nil {
			if isPlayer {
				clients[usernameToPeerId[id]].Scale = scale
			} else {
				objects[roomId][id].Scale = scale
			}
		}
	}

	peer.Broadcast().Emit(ObjectTransform, string(msg))
}