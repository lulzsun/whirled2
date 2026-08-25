package server

import (
	"encoding/hex"
	"encoding/json"
	"log"
	"math"
	"math/rand"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"whirled2/utils"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
	"github.com/pocketbase/pocketbase/tools/types"
	"github.com/spf13/cast"
	"google.golang.org/protobuf/proto"

	buf "whirled2/utils/proto"

	gecgosio "github.com/lulzsun/gecgos.io"
)

var server *gecgosio.Server

var clients = make(map[string]*Client)

// objects holds every room's furniture and, later, its primitive parts,
// keyed room id -> object id.
//
// pion delivers each peer's datachannel messages on its own goroutine, so
// two peers in one room mutate this concurrently; the autosave ticker
// (startRoomAutosave) reads it from a third. Concurrent map access is a
// runtime panic, not a subtle wrong answer, so every read and write of this
// map -- and of the *buf.Object values in it, which onObjectTransform
// rewrites in place -- goes through objectsMu.
var objectsMu sync.RWMutex
var objects = make(map[string]map[string]*buf.Object)

// dirtyRooms is the set of rooms mutated since their last save. Guarded by
// objectsMu, since it changes in lockstep with objects.
var dirtyRooms = make(map[string]bool)

var numOfGuests = 0
var usernameToPeerId = make(map[string]string)
var pb *pocketbase.PocketBase

func Start(port int, app *pocketbase.PocketBase, debug bool) {
	pb = app

	// TODO: hardcoded cause lazy, but later make these .env configurable
	if debug {
		server = gecgosio.Gecgos(&gecgosio.Options{
			DisableHttpServer: true,
			BindAddress:       "0.0.0.0",
			NAT1To1IPs:        []string{},
		})
	} else {
		server = gecgosio.Gecgos(&gecgosio.Options{
			DisableHttpServer: true,
			BindAddress:       "fly-global-services",
			NAT1To1IPs:        []string{"188.93.148.218"},
		})
	}

	server.OnConnection(func(peer *gecgosio.Peer) {
		log.Printf("Client '%s' has connected", peer.Id)

		clients[peer.Id] = &Client{
			Peer: peer,
		}

		peer.OnRaw(func(bytes []byte) {
			// everytime a event occurs, reset idle timer
			utils.IdleTimerReset()
			event := &buf.WhirledEvent{}
			err := proto.Unmarshal(bytes, event)
			if err != nil {
				log.Printf("Failed to unmarshal: %v", err)
				return
			}

			switch e := event.Event.(type) {
			case *buf.WhirledEvent_PlayerJoin:
				onPlayerJoin(peer)
			case *buf.WhirledEvent_PlayerAuth:
				onPlayerAuth(peer, e.PlayerAuth.Code, e.PlayerAuth.Room)
			case *buf.WhirledEvent_PlayerChat:
				onPlayerChat(peer, e.PlayerChat.Message)
			case *buf.WhirledEvent_PlayerMove:
				onPlayerMove(peer, e.PlayerMove.Position, e.PlayerMove.Rotation)
			case *buf.WhirledEvent_PlayerAnim:
				onPlayerAnim(peer, e.PlayerAnim.Anim)
			case *buf.WhirledEvent_PlayerWear:
				onPlayerWear(peer, e.PlayerWear.Id)
			case *buf.WhirledEvent_ObjectJoin:
				onObjectJoin(peer, e.ObjectJoin.Object)
			case *buf.WhirledEvent_ObjectLeave:
				onObjectLeave(peer, e.ObjectLeave.Id, e.ObjectLeave.IsPlayer)
			case *buf.WhirledEvent_ObjectTransform:
				onObjectTransform(peer, e.ObjectTransform)
			default:
				log.Printf("Unknown event type '%s", e)
			}
		})

		utils.IdleTimerReset()
	})

	server.OnDisconnect(func(peer *gecgosio.Peer) {
		log.Printf("Client '%s' has disconnected", peer.Id)
		client, ok := clients[peer.Id]
		if ok {
			onPlayerLeave(peer)
			for _, roomId := range peer.Rooms() {
				// check if room is empty (of players)
				if len(server.Rooms[roomId]) > 1 {
					continue
				}
				// save objects in room to store in db
				saveRoomToDb(roomId)
				// check if objects exist in room
				objectsMu.Lock()
				if _, ok := objects[roomId]; ok {
					// clear out objects in rooms
					for objectId := range objects[roomId] {
						delete(objects[roomId], objectId)
						log.Printf("Object '%s' has been deleted from room '%s'", objectId, roomId)
					}
					delete(objects, roomId)
				}
				// The room is unloaded; anything still queued for it was
				// just written by saveRoomToDb above.
				delete(dirtyRooms, roomId)
				objectsMu.Unlock()
			}
			delete(usernameToPeerId, client.Username)
			delete(clients, peer.Id)
		}
	})

	startRoomAutosave()

	if err := server.Listen(port); err != nil {
		log.Fatal(err)
	}

	log.Printf("Gecgos.io server is listening on port at %d\n", port)
}

func AddAuthRoutes(se *core.ServeEvent, app *pocketbase.PocketBase) {
	se.Router.POST("/.wrtc/v2/connections", func(e *core.RequestEvent) error {
		r := e.Request
		ips := r.Header.Get("X-Forwarded-For")
		if ips == "" {
			ips = r.RemoteAddr
		}
		log.Println("Client attempting to connect from:", ips)
		server.CreateConnection(e.Response, r)
		return nil
	})
	se.Router.POST("/.wrtc/v2/connections/{id}/remote-description", func(e *core.RequestEvent) error {
		server.SetRemoteDescription(e.Response, e.Request)
		return nil
	})
	se.Router.GET("/.wrtc/v2/connections/{id}/additional-candidates", func(e *core.RequestEvent) error {
		server.SendAdditionalCandidates(e.Response, e.Request)
		return nil
	})
	se.Router.GET("/game/{id}/auth", func(e *core.RequestEvent) error {
		code, err := generateAuthCode()
		if err != nil {
			return e.String(500, "Could not generate auth code")
		}

		id := e.Request.PathValue("id")

		// allows passing cookie from subdomain(?) or different localhost:port
		e.Response.Header().Set("Access-Control-Allow-Credentials", "true")

		client, exists := clients[id]
		if !exists || client.Username != "" {
			return e.String(400, "ID does not exist")
		}

		client.Auth = code
		client.Username = "Guest" + strconv.Itoa(numOfGuests+1)
		client.Nickname = "Guest" + strconv.Itoa(numOfGuests+1)
		clients[id] = client
		numOfGuests++

		if cookie, err := e.Request.Cookie("pb_auth"); err == nil {
			decodedCookieValue, err := url.QueryUnescape(cookie.Value)
			if err != nil {
				log.Println("Error decoding cookie value:", err)
				return e.String(200, code)
			}
			var cookieData map[string]interface{}
			err = json.Unmarshal([]byte(decodedCookieValue), &cookieData)
			if err != nil {
				log.Println("Error unmarshaling JSON:", err)
				return e.String(200, code)
			}

			token := strings.TrimPrefix(cookieData["token"].(string), "Bearer ")

			// we assume that our middleware has already verified this JWT/cookie as legitimate
			claims, _ := security.ParseUnverifiedJWT(token)
			pbUserId := cast.ToString(claims["id"])
			user, err := app.FindRecordById("users", pbUserId)
			if err != nil {
				log.Println("Error finding user by id:", err)
				return e.String(200, code)
			}

			client.Username = user.GetString("username")
			client.Nickname = user.GetString("nickname")
			clients[id] = client
			numOfGuests--
		}

		return e.String(200, code)
	})
}

type ActiveRoom struct {
	Id         string
	UsersCount int
}

func GetActiveRoom(id string) ActiveRoom {
	return ActiveRoom{
		Id:         id,
		UsersCount: len(server.Rooms[id]),
	}
}

func GetActiveRooms(limit int, offset int) []ActiveRoom {
	rooms := server.Rooms
	activeRooms := []ActiveRoom{}

	if server == nil || rooms == nil {
		return activeRooms
	}

	for id := range rooms {
		if id == "@underwhirled" {
			continue
		}
		activeRooms = append(activeRooms, GetActiveRoom(id))
	}

	sort.Slice(activeRooms, func(i, j int) bool {
		return activeRooms[i].UsersCount > activeRooms[j].UsersCount
	})

	return activeRooms[offset:int(math.Min(float64(offset+limit), float64(len(activeRooms))))]
}

// How often startRoomAutosave flushes rooms that have changed.
//
// A room used to reach the database only when its last occupant left, so a
// crash or a redeploy mid-session threw away everything built since the
// first player arrived. Thirty seconds bounds that loss to about one
// misplaced wall.
const roomAutosaveInterval = 30 * time.Second

// markRoomDirty records that a room's contents have changed since its last
// save. Callers must already hold objectsMu for writing.
func markRoomDirty(roomId string) {
	dirtyRooms[roomId] = true
}

// startRoomAutosave flushes every room that has changed, forever, on
// roomAutosaveInterval. Rooms that nobody has touched cost nothing.
func startRoomAutosave() {
	go func() {
		for range time.Tick(roomAutosaveInterval) {
			objectsMu.RLock()
			pending := make([]string, 0, len(dirtyRooms))
			for roomId := range dirtyRooms {
				pending = append(pending, roomId)
			}
			objectsMu.RUnlock()

			for _, roomId := range pending {
				saveRoomToDb(roomId)
			}
		}
	}()
}

// Saves room objects to db
func saveRoomToDb(roomId string) {
	// Rooms the server owns ("@underwhirled") have no rooms row and nothing
	// worth persisting. Checked before the lookup so the disconnect path
	// stops logging a not-found error every time the default room empties.
	if roomId == "" || strings.HasPrefix(roomId, "@") {
		return
	}

	// Marshal under the read lock rather than copying the slice out first:
	// the values are pointers, and onObjectTransform rewrites their
	// Position/Rotation/Scale in place, so a copied slice would still be
	// read while it was being written. Serializing a full room is well under
	// a millisecond; the database write below is the slow part, and that
	// happens after the lock is released.
	objectsMu.RLock()
	objsToSave := []*buf.Object{}
	for _, object := range objects[roomId] {
		objsToSave = append(objsToSave, object)
	}
	objsJson, err := json.Marshal(objsToSave)
	objectsMu.RUnlock()

	if err != nil {
		log.Println("Error marshaling JSON:", err)
		return
	}

	record, err := pb.FindRecordById("rooms", roomId)
	if err != nil {
		log.Printf("%s", err)
		return
	}

	record.Set("objects", string(objsJson))

	if err := pb.Save(record); err != nil {
		log.Printf("%s", err)
		return
	}

	// Cleared only after the write lands, so a failed save stays queued for
	// the next tick instead of being silently forgotten. A mutation racing
	// the save above re-dirties the room and is picked up next tick.
	objectsMu.Lock()
	delete(dirtyRooms, roomId)
	objectsMu.Unlock()
}

// Loads room objects from db
func loadRoomFromDb(roomId string) {
	// Server-owned rooms have no rooms row to load from -- see saveRoomToDb.
	// Without this, every guest joining the default room logged a bare
	// "sql: no rows in result set", which is exactly the noise you are
	// reading the log to see past.
	if roomId == "" || strings.HasPrefix(roomId, "@") {
		return
	}

	// check if this room is already loaded
	objectsMu.Lock()
	if _, ok := objects[roomId]; ok {
		objectsMu.Unlock()
		return
	}
	objects[roomId] = make(map[string]*buf.Object)
	objectsMu.Unlock()

	record, err := pb.FindRecordById("rooms", roomId)
	if err != nil {
		log.Printf("%s", err)
		return
	}

	objsJsonRaw := record.Get("objects").(types.JSONRaw)
	objsToLoad := []*buf.Object{}

	err = json.Unmarshal(objsJsonRaw, &objsToLoad)
	if err != nil {
		log.Printf("%s", err)
		return
	}

	objectsMu.Lock()
	for _, object := range objsToLoad {
		objects[roomId][object.Id] = object
	}
	objectsMu.Unlock()
}

// TODO: not secure, tie logic with secret key or something
func generateAuthCode() (string, error) {
	// Generate a random seed based on current time
	seed := time.Now().UnixNano()

	// Create a new random number generator with the seed
	rng := rand.New(rand.NewSource(seed))

	// Generate a random byte slice (16 bytes long for a 128-bit string)
	randomBytes := make([]byte, 16)
	_, err := rng.Read(randomBytes)
	if err != nil {
		return "", err
	}

	// Encode the random bytes to a hexadecimal string
	randomString := hex.EncodeToString(randomBytes)

	return randomString, nil
}
