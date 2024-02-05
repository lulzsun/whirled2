package server

import (
	"log"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"

	gecgosio "github.com/lulzsun/gecgos.io"
)

var server *gecgosio.Server

func Start(port int) {
	server = gecgosio.Gecgos(&gecgosio.Options{
		Cors: gecgosio.Cors{Origin: "*"},
		CustomHttpHandler: true,
	})

	server.OnConnection(func(peer gecgosio.Peer) {
		log.Printf("Client %s has connected!\n", peer.Id)

		peer.On("Auth", func(msg string) {
			log.Printf("Client %s sent event 'Auth' with data '%s'", peer.Id, msg)
		})

		peer.On("Join", func(msg string) {
			peer.Emit("Auth", "")
		})
	})

	server.OnDisconnect(func(peer gecgosio.Peer) {
		log.Printf("Client %s has disconnected!\n", peer.Id)
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
	e.Router.GET("/game/auth", func(c echo.Context) error {
		c.Response().Header().Set("Access-Control-Allow-Credentials", "true")
		return c.String(200, "Hello whirled!")
	})
}