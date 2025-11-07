package server

import (
	"log"

	buf "whirled2/utils/proto"

	"google.golang.org/protobuf/proto"

	gecgosio "github.com/lulzsun/gecgos.io"
	"github.com/pocketbase/dbx"
)

// Prepares a player to join by sending them to go auth themselves
func onPlayerJoin(peer *gecgosio.Peer) {
	p := &buf.WhirledEvent{
		Event: &buf.WhirledEvent_PlayerAuth{
			PlayerAuth: &buf.PlayerAuth{
				Id: peer.Id,
			},
		},
	}
	data, _ := proto.Marshal(p)
	peer.Emit(data)
}

// Authorize a peer as user or guest when they join a room
//
// After successful authorization, send "Join" event to all peers in room and
// let our peer know about existing peers in the room ("Join" event for each peer)
//
// If room is not provided, then join default room (bravenewwhirled)
func onPlayerAuth(peer *gecgosio.Peer, code string, roomId string) {
	client := clients[peer.Id]

	if client.Auth == "" {
		// user is already authorized at this point
		return
	}

	if code != "" && client.Auth == code {
		log.Printf("Successfully authorized '%s' as '%s'", peer.Id, client.Username)

		// check if peer already auth'd, if so we perform a "reconnect"
		if peerId, ok := usernameToPeerId[client.Username]; ok {
			log.Printf("Disconnecting client '%s' authorized as '%s'", peerId, client.Username)
			clients[peerId].Peer.Disconnect()
		}
		usernameToPeerId[client.Username] = peer.Id

		// retrieve client's avatar from db
		dbObject := struct {
			Id string		`db:"id" json:"id"`
			Type int		`db:"type" json:"type"`
			StuffId string	`db:"stuff_id" json:"stuff_id"`

			Name string		`db:"name" json:"name"`
			File string		`db:"file" json:"file"`
			Scale float64	`db:"scale" json:"scale"`
		}{}
		err := pb.DB().
			NewQuery(`
				SELECT
					s.id, 
					s.type, 
					s.stuff_id, 
					a.name,
					a.file,
					a.scale
				FROM stuff s
				INNER JOIN users u ON u.username = {:username}
				INNER JOIN avatars a ON a.id = s.stuff_id
				WHERE s.in_use != '' AND u.id == s.owner_id
			`).Bind(dbx.Params{
				"username": client.Username,
			}).One(&dbObject)

		if err != nil {
			log.Println(err)
			client.InitialScale = 1
			client.File = "/static/assets/avatars/RobotExpressive.glb"
		} else {
			client.InitialScale = dbObject.Scale
			client.File = "/api/files/avatars/" + dbObject.StuffId + "/" + dbObject.File
		}

		client.Position = &buf.Position{}
		client.Rotation = &buf.Rotation{}
		client.Scale = &buf.Scale{
			X: 1,
			Y: 1,
			Z: 1,
		}

		player := &buf.Player{
			Username: client.Username,
			Nickname: client.Nickname,
			File: client.File,
			Local: true,
			Owner: false,
			Position: &buf.Position{
				X: client.Position.X,
				Y: client.Position.Y,
				Z: client.Position.Z,
			},
			Rotation: &buf.Rotation{
				X: client.Rotation.X,
				Y: client.Rotation.Y,
				Z: client.Rotation.Z,
				W: client.Rotation.W,
			},
			Scale: &buf.Scale{
				X: client.Scale.X,
				Y: client.Scale.Y,
				Z: client.Scale.Z,
			},
			InitialScale: client.InitialScale,
		}

		// verify client
		if roomId == "" {
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
				roomId = "@underwhirled"
			} else {
				player.Owner = true;
				roomId = room.Id
			}
		// client provided a room id, check if room exists on server
		} else if _, ok := server.Rooms[roomId]; ok {
		// client provided a room id, check if room exists by db
		} else {
			room := struct {
				Id string		`db:"id" json:"id"`
				Owner string	`db:"owner" json:"owner"`
				Objects string 	`db:"objects" json:"objects"`
			}{}
			err := pb.DB().
				NewQuery(`
					SELECT r.id, r.objects, u.username AS owner 
					FROM rooms r
					INNER JOIN users u ON r.owner_id = u.id
					WHERE r.id = {:roomId}
				`).
				Bind(dbx.Params{
					"roomId": roomId,
				}).One(&room)

			if err != nil {
				roomId = "@underwhirled"
			} else if roomId != room.Id {
				log.Printf("Room '%s' does not exist or '%s' does not have privileges", roomId, client.Username)
				roomId = "@underwhirled"
			} else {
				if room.Owner == client.Username {
					player.Owner = true;
				}
			}
		}

		// prepare client (player) data
		p := &buf.WhirledEvent{
			Event: &buf.WhirledEvent_PlayerJoin{
				PlayerJoin: &buf.PlayerJoin{
					Player: player,
				},
			},
		}
		data, err := proto.Marshal(p)
		if err != nil {
			log.Printf("Failed to join user '%s', unable to marshal protobuf.", client.Username)
			return
		}

		// try to populate room with saved objects
		loadRoomFromDb(roomId)

		// join our client to a room
		peer.Join(roomId)
		peer.Emit(data)
		log.Printf("User '%s' is joining room '%s'", client.Username, roomId)

		// announce client to all other clients in the room
		player.Local = false

		// re-prepare client (player) data
		p = &buf.WhirledEvent{
			Event: &buf.WhirledEvent_PlayerJoin{
				PlayerJoin: &buf.PlayerJoin{
					Player: player,
				},
			},
		}
		data, _ = proto.Marshal(p)
		peers := peer.Broadcast(roomId)
		peers.Emit(data)

		// let our client know about existing clients in the room
		for _, p := range peers {
			if clients[p.Id].Username == client.Username {
				continue
			}
			data, err := proto.Marshal(&buf.WhirledEvent{
				Event: &buf.WhirledEvent_PlayerJoin{
					PlayerJoin: &buf.PlayerJoin{
						Player: &buf.Player{
							Username: clients[p.Id].Username,
							Nickname: clients[p.Id].Nickname,
							File: clients[p.Id].File,
							Local: false,
							// Owner: false,
							Position: &buf.Position{
								X: clients[p.Id].Position.X,
								Y: clients[p.Id].Position.Y,
								Z: clients[p.Id].Position.Z,
							},
							Rotation: &buf.Rotation{
								X: clients[p.Id].Rotation.X,
								Y: clients[p.Id].Rotation.Y,
								Z: clients[p.Id].Rotation.Z,
								W: clients[p.Id].Rotation.W,
							},
							Scale: &buf.Scale{
								X: clients[p.Id].Scale.X,
								Y: clients[p.Id].Scale.Y,
								Z: clients[p.Id].Scale.Z,
							},
							InitialScale: clients[p.Id].InitialScale,
						},
					},
				},
			})
			if err != nil {
				log.Printf("Failed to join user '%s', unable to marshal protobuf.", client.Username)
				continue
			}
			peer.Emit(data)
		}

		// let our client know about existing objects in the room
		for _, object := range objects[roomId] {
			p := &buf.WhirledEvent{
				Event: &buf.WhirledEvent_ObjectJoin{
					ObjectJoin: &buf.ObjectJoin{
						Object: object,
					},
				},
			}
			data, err := proto.Marshal(p)
			if err != nil {
				log.Printf("Failed to join object '%s', unable to marshal json.", client.Username)
				return
			}
			peer.Emit(data)
		}
		
		client.Auth = ""
	} else {
		log.Printf("Failed to authorize '%s', provided wrong auth code?", peer.Id)
	}
	
	clients[peer.Id] = client
}

func onPlayerLeave(peer *gecgosio.Peer) {
	client, ok := clients[peer.Id]
	if !ok {
		return
	}
	p := &buf.WhirledEvent{
		Event: &buf.WhirledEvent_PlayerLeave{
			PlayerLeave: &buf.PlayerLeave{
				Username: client.Username,
			},
		},
	}
	data, _ := proto.Marshal(p)
	peer.Room().Emit(data)
}

func onPlayerMove(peer *gecgosio.Peer, pos *buf.Position, rot *buf.Rotation) {
	client := clients[peer.Id]

	data := &buf.WhirledEvent{
		Event: &buf.WhirledEvent_PlayerMove{
			PlayerMove: &buf.PlayerMove{
				Username: client.Username,
				Position: pos,
				Rotation: rot,
			},
		},
    }

	// Save position on the server
	client.Position.X = pos.X
	client.Position.Y = pos.Y
	client.Position.Z = pos.Z

	// Save rotation on the server
	client.Rotation.X = rot.X
	client.Rotation.Y = rot.Y
	client.Rotation.Z = rot.Z
	client.Rotation.W = rot.W

	// Marshal the map back into a JSON string
	updatedMsg, err := proto.Marshal(data)
	if err != nil {
		log.Println("Error:", err)
		return
	}

	peer.Room().Emit(updatedMsg);
}

func onPlayerChat(peer *gecgosio.Peer, msg string) {
	client := clients[peer.Id]

	p := &buf.WhirledEvent{
        Event: &buf.WhirledEvent_PlayerChat{
            PlayerChat: &buf.PlayerChat{
                Username: client.Username,
                Message:  msg,
            },
        },
    }
    data, _ := proto.Marshal(p)

	peer.Room().Emit(data);
}

func onPlayerAnim(peer *gecgosio.Peer, name string) {
	client := clients[peer.Id]

	p := &buf.WhirledEvent{
        Event: &buf.WhirledEvent_PlayerAnim{
            PlayerAnim: &buf.PlayerAnim{
                Username: client.Username,
                Anim:  name,
            },
        },
    }

	updatedMsg, err := proto.Marshal(p)
	if err != nil {
		log.Println("Error:", err)
		return
	}

	peer.Broadcast().Emit(updatedMsg);
}