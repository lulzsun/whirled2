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
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
	"github.com/pocketbase/pocketbase/tools/types"
	"github.com/spf13/cast"

	gecgosio "github.com/lulzsun/gecgos.io"
)

var server *gecgosio.Server

var clients = make(map[string]*Client)
var objects = make(map[string]map[string]*Object)

var numOfGuests = 0;
var usernameToPeerId = make(map[string]string)
var pb *pocketbase.PocketBase

func Start(port int, app *pocketbase.PocketBase, debug bool) {
	pb = app

	// TODO: hardcoded cause lazy, but later make these .env configurable
	if debug {
		server = gecgosio.Gecgos(&gecgosio.Options{
			DisableHttpServer: true,
			BindAddress: "0.0.0.0",
			NAT1To1IPs: []string{},
		})
	} else {
		server = gecgosio.Gecgos(&gecgosio.Options{
			DisableHttpServer: true,
			BindAddress: "fly-global-services",
			NAT1To1IPs: []string{"188.93.148.218"},
		})
	}

	server.OnConnection(func(peer *gecgosio.Peer) {
		log.Printf("Client '%s' has connected", peer.Id)

		clients[peer.Id] = &Client{
			Peer: peer,
		}

		peer.On(PlayerJoin, func(msg string) { peer.Emit(PlayerAuth, peer.Id) })
		peer.On(PlayerAuth, func(msg string) { onPlayerAuth(peer, msg) })
		peer.On(PlayerMove, func(msg string) { onPlayerMove(peer, msg) })
		peer.On(PlayerChat, func(msg string) { onPlayerChat(peer, msg) })
		peer.On(PlayerAnim, func(msg string) { onPlayerAnim(peer, msg) })

		peer.On(ObjectJoin, func(msg string) { onObjectJoin(peer, msg) })
		peer.On(ObjectTransform, func(msg string) { onObjectTransform(peer, msg) })
	})

	server.OnDisconnect(func(peer *gecgosio.Peer) {
		log.Printf("Client '%s' has disconnected", peer.Id)
		client, ok := clients[peer.Id]
		if ok {
			peer.Room().Emit(PlayerLeave, client.Username)
			for _, roomId := range(peer.Rooms()) {
				// check if room is empty (of players)
				if len(server.Rooms[roomId]) > 1 {
					continue
				}
				// save objects in room to store in db
				saveRoomToDb(roomId)
				// check if objects exist in room
				if _, ok := objects[roomId]; ok {
					// clear out objects in rooms
					for objectId := range(objects[roomId]) {
						delete(objects[roomId], objectId)
						log.Printf("Object '%s' has been deleted from room '%s'", objectId, roomId)
					}
					delete(objects, roomId)
				}
			}
			delete(usernameToPeerId, client.Username)
			delete(clients, peer.Id)
		}
	})

	if err := server.Listen(port); err != nil {
		log.Fatal(err)
	}

	log.Printf("Gecgos.io signaling server is running on port at %d\n", port)
}

func AddAuthRoutes(e *core.ServeEvent, app *pocketbase.PocketBase) {
	e.Router.POST("/.wrtc/v2/connections", func(c echo.Context) error {
		r := c.Request()
		ips := r.Header.Get("X-Forwarded-For")
		if ips == "" {
			ips = r.RemoteAddr
		}
		log.Println("Client attempting to connect from:", ips)
		server.CreateConnection(c.Response().Writer, r)
		return nil
	})
	e.Router.POST("/.wrtc/v2/connections/:id/remote-description", func(c echo.Context) error {
		server.SetRemoteDescription(c.Response().Writer, c.Request())
		return nil
	})
	e.Router.GET("/.wrtc/v2/connections/:id/additional-candidates", func(c echo.Context) error {
		server.SendAdditionalCandidates(c.Response().Writer, c.Request())
		return nil
	})
	e.Router.GET("/game/:id/auth", func(c echo.Context) error {
		code, err := generateAuthCode()
		if err != nil {
			return c.String(500, "Could not generate auth code")
		}

		id := c.PathParam("id")

		// allows passing cookie from subdomain(?) or different localhost:port
		c.Response().Header().Set("Access-Control-Allow-Credentials", "true")

		client, exists := clients[id]
		if !exists || client.Username != "" {
			return c.String(400, "ID does not exist")
		}

		client.Auth = code
		client.Username = "Guest" + strconv.Itoa(numOfGuests+1)
		client.Nickname = "Guest" + strconv.Itoa(numOfGuests+1)
		clients[id] = client
		numOfGuests++

		if cookie, err := c.Cookie("pb_auth"); err == nil {
			decodedCookieValue, err := url.QueryUnescape(cookie.Value)
			if err != nil {
				log.Println("Error decoding cookie value:", err)
				return c.String(200, code)
			}
			var cookieData map[string]interface{}
			err = json.Unmarshal([]byte(decodedCookieValue), &cookieData)
			if err != nil {
				log.Println("Error unmarshaling JSON:", err)
				return c.String(200, code)
			}

			token := strings.TrimPrefix(cookieData["token"].(string), "Bearer ")

			// we assume that our middleware has already verified this JWT/cookie as legitimate
			claims, _ := security.ParseUnverifiedJWT(token)
			pbUserId := cast.ToString(claims["id"])
			user, err := app.Dao().FindRecordById("users", pbUserId)
			if err != nil {
				log.Println("Error finding user by id:", err)
				return c.String(200, code)
			}

			client.Username = user.GetString("username")
			client.Nickname = user.GetString("nickname")
			clients[id] = client
			numOfGuests--
		}

		return c.String(200, code)
	})
}

type ActiveRoom struct {
	Id 			string 
	UsersCount	int
}

func GetActiveRooms(limit int, offset int) ([]ActiveRoom) {
	rooms := server.Rooms
	activeRooms := []ActiveRoom{}

	if server == nil || rooms == nil {
		return activeRooms
	}

	for key, value := range rooms {
		if key == "@underwhirled" {
			continue
		}
		activeRooms = append(activeRooms, ActiveRoom{
			Id: key,
			UsersCount: len(value),
		})
	}

	sort.Slice(activeRooms, func(i, j int) bool {
		return activeRooms[i].UsersCount > activeRooms[j].UsersCount
	})

	return activeRooms[offset:int(math.Min(float64(offset+limit), float64(len(activeRooms))))]
}

// Saves room objects to db
func saveRoomToDb(roomId string) {
	record, err := pb.Dao().FindRecordById("rooms", roomId)
	if err != nil {
		log.Printf("%s", err)
		return
	}

	objsToSave := []Object{}

	for _, object := range objects[roomId] {
		objsToSave = append(objsToSave, *object)
	}

	objsJson, err := json.Marshal(objsToSave)
    if err != nil {
        log.Println("Error marshaling JSON:", err)
        return
    }

	record.Set("objects", string(objsJson))

	if err := pb.Dao().SaveRecord(record); err != nil {
		log.Printf("%s", err)
		return
	}
}

// Loads room objects from db
func loadRoomFromDb(roomId string) {
	// check if this room is empty of objects
	if _, ok := objects[roomId]; ok {
		return
	}
	objects[roomId] = make(map[string]*Object)

	record, err := pb.Dao().FindRecordById("rooms", roomId)
	if err != nil {
		log.Printf("%s", err)
		return
	}

	objsJsonRaw := record.Get("objects").(types.JsonRaw)
	objsToLoad := []Object{}

	err = json.Unmarshal(objsJsonRaw, &objsToLoad)
	if err != nil {
		log.Printf("%s", err)
		return
	}

	for _, object := range objsToLoad {
		objects[roomId][object.Id] = &object
	}
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