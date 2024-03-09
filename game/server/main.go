package server

import (
	"encoding/hex"
	"encoding/json"
	"log"
	"math/rand"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
	"github.com/spf13/cast"

	gecgosio "github.com/lulzsun/gecgos.io"
)

var server *gecgosio.Server
var clients = make(map[string]*Client)
var numOfGuests = 0;
var usernameToPeer = make(map[string]string)
var pb *pocketbase.PocketBase

func Start(port int, app *pocketbase.PocketBase) {
	pb = app

	server = gecgosio.Gecgos(&gecgosio.Options{
		DisableHttpServer: true,
	})

	server.OnConnection(func(peer *gecgosio.Peer) {
		log.Printf("Client %s has connected!\n", peer.Id)

		clients[peer.Id] = &Client{
			Peer: peer,
		}

		peer.On("Join", func(msg string) { peer.Emit("Auth", peer.Id) })
		peer.On("Auth", func(msg string) { onAuth(peer, msg) })
		peer.On("Move", func(msg string) { onMove(peer, msg) })
		peer.On("Chat", func(msg string) { onChat(peer, msg) })
		peer.On("Anim", func(msg string) { onAnim(peer, msg) })
	})

	server.OnDisconnect(func(peer *gecgosio.Peer) {
		log.Printf("Client %s has disconnected!\n", peer.Id)
		client, ok := clients[peer.Id]
		if ok {
			peer.Room().Emit("Leave", client.Username)
			delete(usernameToPeer, client.Username)
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
		server.CreateConnection(c.Response().Writer, c.Request())
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