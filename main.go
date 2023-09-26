// main.go
package main

import (
	"html/template"
	"log"
	"os"

	"whirled2/api"
	"whirled2/utils"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/cmd"
	"github.com/pocketbase/pocketbase/core"

	gecgosio "github.com/lulzsun/gecgos.io"
)

type Film struct {
	Title    string
	Director string
}

func main() {
	go func() {
		server := gecgosio.Gecgos(nil)

		server.OnConnection(func(peer gecgosio.Peer) {
			log.Printf("Client %s has connected!\n", peer.Id)

			// Example of sending and recieving from client(s)
			// Server will recieve the event 'ping' with data 'hello'
			// Server will send the event 'pong' with data 'world'
			peer.On("ping", func(msg string) {
				log.Printf("Client %s sent event 'ping' with data '%s', emitting back 'pong'\n", peer.Id, msg)
				// peer.Reliable(150, 10).Emit("pong", "world")
				peer.Emit("pong", "world")
			})
		})

		server.OnDisconnect(func(peer gecgosio.Peer) {
			log.Printf("Client %s has disconnected!\n", peer.Id)
		})

		// server.Listen(420)
	}()

	app := pocketbase.NewWithConfig(pocketbase.Config{
		HideStartBanner: true,
		// DefaultDebug: false
	})
	routes := []func(*core.ServeEvent, *pocketbase.PocketBase){
		api.AddBaseRoutes,
		api.AddAuthRoutes,
		api.AddProfileRoutes,
		// Add more routes here
	}
	customEventHooks := []func(*pocketbase.PocketBase){
		api.AddAuthEventHooks,
		api.AddProfileEventHooks,
		// Add more event hooks here
	}
	for _, AddEventHooks := range customEventHooks {
		AddEventHooks(app)
	}

	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		// serves static files from the provided public dir (if exists)
		e.Router.GET("/static/*", func(c echo.Context) error {
			// Disable client-side caching for development
			c.Response().Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
			return apis.StaticDirectoryHandler(os.DirFS("./web/static"), false)(c)
		})
		e.Router.Use(
			api.FormMiddleware,
			api.AuthMiddleware(app),
			api.BaseMiddleware,
		)
		for _, AddRoutes := range routes {
			AddRoutes(e, app)
		}
		e.Router.GET("/api/hello", func(c echo.Context) error {
			return c.String(200, "Hello whirled!")
		})
		e.Router.GET("/test", func(c echo.Context) error {
			tmpl := template.Must(template.ParseFiles("web/templates/pages/test.gohtml"))
			if err := tmpl.Execute(c.Response().Writer, nil); err != nil {
				return err
			}
			return nil
		})
		return nil
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}

	app.OnAdminAfterCreateRequest().Add(func(e *core.AdminCreateEvent) error {
		utils.Bootstrap(app)
		return nil
	})
	app.Bootstrap()
	utils.Bootstrap(app)
	serveCmd := cmd.NewServeCommand(app, false)
	serveCmd.SetArgs([]string{"--http=0.0.0.0:42069"})
	serveCmd.Execute()
}
