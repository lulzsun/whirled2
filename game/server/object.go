package server

import (
	"log"
	buf "whirled2/utils/proto"

	gecgosio "github.com/lulzsun/gecgos.io"
	"github.com/pocketbase/dbx"
	"google.golang.org/protobuf/proto"
)

// player spawning an object (furniture) into a room
func onObjectJoin(peer *gecgosio.Peer, obj *buf.Object) {
	client := clients[peer.Id]

	// note: this assumes the client is only in a single room
	roomId := peer.Rooms()[0]

	// making sure this object is of type 2 (furniture)
	if obj.Type != buf.Type_Furniture {
		return
	}

	// making sure this object does not already exist
	if _, ok := objects[roomId][obj.Id]; ok {
		return
	}

	// check if client owns the current room they're in
	err := pb.DB().
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
		Scale float64	`db:"scale" json:"scale"`
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
			"id": obj.Id,
		}).One(&dbObject)

	if err != nil {
		log.Println(err)
		return
	}
	dbObject.File = "/api/files/furniture/" + dbObject.StuffId + "/" + dbObject.File

	// prepare object (furniture) data
	object := &buf.Object{
		Id: dbObject.Id,
		Type: buf.Type(dbObject.Type),
		StuffId: dbObject.StuffId,
		Name: dbObject.Name,
		File: dbObject.File,
		Position: &buf.Position{
			X: 0,
			Y: 0,
			Z: 0,
		},
		Rotation: &buf.Rotation{
			X: 0,
			Y: 0,
			Z: 0,
			W: 0,
		},
		Scale: &buf.Scale{
			X: 1,
			Y: 1,
			Z: 1,
		},
		InitialScale: dbObject.Scale,
	}

	p := &buf.WhirledEvent{
		Event: &buf.WhirledEvent_ObjectJoin{
			ObjectJoin: &buf.ObjectJoin{
				Object: object,
			},
		},
	}
	newData, err := proto.Marshal(p)
	if err != nil {
		log.Printf("Failed to join object '%s', unable to marshal protobuf.", client.Username)
		return
	}

	// prepare to store as server object
	if _, ok := objects[roomId]; !ok {
		objects[roomId] = make(map[string]*buf.Object)
	}
	objects[roomId][obj.Id] = object
	log.Printf("Object '%s' is joining room '%s'", obj.Id, roomId)

	peer.Room().Emit(newData)
}

// player removing an object (furniture) from a room
func onObjectLeave(peer *gecgosio.Peer, id string, isPlayer bool) {
	client := clients[peer.Id]

	// note: this assumes the client is only in a single room
	roomId := peer.Rooms()[0]

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
	err := pb.DB().
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
		// TODO: kick with parameters:
		//	- prevent kicked player from rejoining after certain time period
		p := &buf.WhirledEvent{
			Event: &buf.WhirledEvent_PlayerLeave{
				PlayerLeave: &buf.PlayerLeave{
					Username: id,
				},
			},
		}
		data, _ := proto.Marshal(p)
		peer.Room().Emit(data)
		clients[usernameToPeerId[id]].Peer.Leave(roomId)
		return
	} else {
		delete(objects[roomId], id)
		log.Printf("Object '%s' has been deleted from room '%s'", id, roomId)
	}
	p := &buf.WhirledEvent{
		Event: &buf.WhirledEvent_ObjectLeave{
			ObjectLeave: &buf.ObjectLeave{
				Id: id,
			},
		},
	}
	newData, _ := proto.Marshal(p)
	peer.Room().Emit(newData)
}

func onObjectTransform(peer *gecgosio.Peer, obj *buf.ObjectTransform) {
	client := clients[peer.Id]

	// note: this assumes the client is only in a single room
	roomId := peer.Rooms()[0]

	// making sure this object or player exists
	if obj.IsPlayer {
		if _, ok := usernameToPeerId[obj.Id]; !ok {
			return
		}
	} else {
		if _, ok := objects[roomId][obj.Id]; !ok {
			return
		}
	}

	// check if client owns the current room they're in
	err := pb.DB().
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

	if obj.IsPlayer {
		clients[usernameToPeerId[obj.Id]].Position = obj.Position
		clients[usernameToPeerId[obj.Id]].Rotation = obj.Rotation
		clients[usernameToPeerId[obj.Id]].Scale = obj.Scale
	} else {
		objects[roomId][obj.Id].Position = obj.Position
		objects[roomId][obj.Id].Rotation = obj.Rotation
		objects[roomId][obj.Id].Scale = obj.Scale
	}

	p := &buf.WhirledEvent{
		Event: &buf.WhirledEvent_ObjectTransform{
			ObjectTransform: obj,
		},
	}
	newData, _ := proto.Marshal(p)
	peer.Broadcast().Emit(newData)
}