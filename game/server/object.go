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

	// Ownership first now that it is a map lookup rather than a query: a
	// part carries no id to check for duplicates, so there is nothing to do
	// before this.
	if !canEditRoom(client, roomId) {
		// user does not own this room, so do nothing
		log.Printf("Refusing to add to room '%s': '%s' does not own it", roomId, client.Username)
		// A part is only knowable to its sender by the nonce it chose; a
		// furniture placement is knowable by the stuff id it named.
		deniedId := obj.Id
		if obj.Type == buf.Type_Primitive {
			deniedId = obj.Nonce
		}
		denyObject(peer, deniedId, buf.DenyReason_NotOwner)
		return
	}

	// Builder parts are described on the wire rather than looked up, so they
	// take a wholly separate path (part.go).
	if obj.Type == buf.Type_Primitive {
		onPartJoin(peer, roomId, obj)
		return
	}

	// making sure this object is of type 2 (furniture)
	if obj.Type != buf.Type_Furniture {
		return
	}

	// making sure this object does not already exist
	objectsMu.RLock()
	_, exists := objects[roomId][obj.Id]
	objectsMu.RUnlock()
	if exists {
		denyObject(peer, obj.Id, buf.DenyReason_Duplicate)
		return
	}

	// retrieve object (furniture) data from db
	dbObject := struct {
		Id      string `db:"id" json:"id"`
		Type    int    `db:"type" json:"type"`
		StuffId string `db:"stuff_id" json:"stuff_id"`

		Name  string  `db:"name" json:"name"`
		File  string  `db:"file" json:"file"`
		Scale float64 `db:"scale" json:"scale"`
	}{}
	err := pb.DB().
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
		Id:      dbObject.Id,
		Type:    buf.Type(dbObject.Type),
		StuffId: dbObject.StuffId,
		Name:    dbObject.Name,
		File:    dbObject.File,
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
	objectsMu.Lock()
	if _, ok := objects[roomId]; !ok {
		objects[roomId] = make(map[string]*buf.Object)
	}
	objects[roomId][obj.Id] = object
	markRoomDirty(roomId)
	objectsMu.Unlock()
	log.Printf("Object '%s' is joining room '%s'", obj.Id, roomId)

	peer.Room().Emit(newData)
}

// player removing an object (furniture) from a room
func onObjectLeave(peer *gecgosio.Peer, id string, isPlayer bool) {
	client := clients[peer.Id]

	// note: this assumes the client is only in a single room
	roomId := peer.Rooms()[0]

	// making sure this object or player exists
	//
	// Both of these bail without a word, which is why a removal that the
	// server drops looks to the player exactly like a dead button. Say which
	// one it was.
	if isPlayer {
		if _, ok := usernameToPeerId[id]; !ok {
			log.Printf("Refusing to remove player '%s' from room '%s': no such player", id, roomId)
			return
		}
	} else {
		objectsMu.RLock()
		_, exists := objects[roomId][id]
		objectsMu.RUnlock()
		if !exists {
			log.Printf("Refusing to remove object '%s' from room '%s': the server has no object under that id", id, roomId)
			return
		}
	}

	// check if client owns the current room they're in
	if !canEditRoom(client, roomId) {
		// user does not own this room, so do nothing
		log.Printf("Refusing to remove '%s' from room '%s': '%s' does not own it", id, roomId, client.Username)
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
		objectsMu.Lock()
		wasPart := objects[roomId][id].GetType() == buf.Type_Primitive
		delete(objects[roomId], id)
		markRoomDirty(roomId)
		objectsMu.Unlock()
		log.Printf("Object '%s' has been deleted from room '%s'", id, roomId)
		if wasPart {
			// A freed slot is only useful to the builder if the UI hears
			// about it.
			defer emitRoomCapacity(peer, roomId)
		}
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
		objectsMu.RLock()
		_, exists := objects[roomId][obj.Id]
		objectsMu.RUnlock()
		if !exists {
			return
		}
	}

	// check if client owns the current room they're in
	if !canEditRoom(client, roomId) {
		// user does not own this room, so do nothing
		return
	}

	// A drag emits continuously, so this is the one handler a client can
	// drive as fast as it can send. Everything above this point is cheap
	// map work; everything below broadcasts to the room. Spend the token
	// last, so a refused event costs a rejected client nothing but a drop.
	if !spendTransformToken(client) {
		return
	}

	if obj.IsPlayer {
		clients[usernameToPeerId[obj.Id]].Position = obj.Position
		clients[usernameToPeerId[obj.Id]].Rotation = obj.Rotation
		clients[usernameToPeerId[obj.Id]].Scale = obj.Scale
	} else {
		objectsMu.Lock()
		// Re-checked under the write lock: the existence test above released
		// it, and a concurrent removal in between would leave a nil here.
		if stored, ok := objects[roomId][obj.Id]; ok {
			stored.Position = obj.Position
			stored.Rotation = obj.Rotation
			stored.Scale = obj.Scale
			markRoomDirty(roomId)
		}
		objectsMu.Unlock()
	}

	p := &buf.WhirledEvent{
		Event: &buf.WhirledEvent_ObjectTransform{
			ObjectTransform: obj,
		},
	}
	newData, _ := proto.Marshal(p)
	peer.Broadcast().Emit(newData)
}
