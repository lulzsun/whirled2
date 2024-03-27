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

	// check if client owns the current room they're in
	// note: this assumes the client is only in a single room
	currentRoom := peer.Rooms()[0]
	err := pb.DB().
		NewQuery(`
			SELECT r.id
			FROM rooms r
			INNER JOIN users u ON r.owner_id = u.id
			WHERE r.id = {:roomId} AND u.username = {:username}
		`).
		Bind(dbx.Params{
			"roomId": currentRoom,
			"username": client.Username,
		}).One(&struct{}{})

	if err != nil {
		// user does not own this room, so do nothing
		return
	}

	// Parse the JSON string into a map
	var data map[string]interface{}
	err = json.Unmarshal([]byte(msg), &data)
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

	// making sure this object does not already exist in the room

	// retrieve object (furniture) data from db
	dbObject := struct {
		Id string		`db:"id" json:"id"`
		Type string		`db:"type" json:"type"`
		StuffId string	`db:"stuff_id" json:"stuff_id"`

		Name string		`db:"name" json:"name"`
		File string		`db:"file" json:"file"`
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
				f.file
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
	object := map[string]interface{}{
		"id": dbObject.Id,
		"type": dbObject.Type,
		"stuff_id": dbObject.StuffId,
		"name": dbObject.Name,
		"file": dbObject.File,
		"position": map[string]interface{}{
			"x": 0,
			"y": 0,
			"z": 0,
		},
		"rotation": map[string]interface{}{
			"x": 0,
			"y": 0,
			"z": 0,
			"w": 0,
		},
	}

	newData, err := json.Marshal(object)
	if err != nil {
		log.Printf("Failed to join object '%s', unable to marshal json.", client.Username)
		return
	}

	peer.Room().Emit(ObjectJoin, string(newData));
}