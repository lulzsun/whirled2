// main.go
package main

import (
	"html/template"
	"log"
	"os"
	"whirled2/api"

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
		// DefaultDebug: false,
	})

	api.AddAuthEventHooks(app)

	// serves static files from the provided public dir (if exists)
	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		e.Router.GET("/static/*", func(c echo.Context) error {
			// Disable client-side caching for development
			c.Response().Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
			return apis.StaticDirectoryHandler(os.DirFS("./web/static"), false)(c)
		})
		e.Router.GET("/", func(c echo.Context) error {
			tmpl, err := template.New("").ParseFiles("web/templates/login.html", "web/templates/index.html")
			if err != nil {
				return err
			}
			if err := tmpl.ExecuteTemplate(c.Response().Writer, "base", nil); err != nil {
				return err
			}
			return nil
		})
		e.Router.GET("/signup", func(c echo.Context) error {
			if c.Request().Header.Get("HX-Request") == "true" {
				tmpl := template.Must(template.ParseFiles("web/templates/signup.html"))
				if err := tmpl.ExecuteTemplate(c.Response().Writer, "content", nil); err != nil {
					return err
				}
				return nil
			}
			tmpl, err := template.New("").ParseFiles("web/templates/signup.html", "web/templates/index.html")
			if err != nil {
				return err
			}
			if err := tmpl.ExecuteTemplate(c.Response().Writer, "base", nil); err != nil {
				return err
			}
			return nil
		})
		e.Router.GET("/login", func(c echo.Context) error {
			if c.Request().Header.Get("HX-Request") == "true" {
				tmpl := template.Must(template.ParseFiles("web/templates/login.html"))
				if err := tmpl.ExecuteTemplate(c.Response().Writer, "content", nil); err != nil {
					return err
				}
				return nil
			}
			tmpl, err := template.New("").ParseFiles("web/templates/login.html", "web/templates/index.html")
			if err != nil {
				return err
			}
			if err := tmpl.ExecuteTemplate(c.Response().Writer, "base", nil); err != nil {
				return err
			}
			return nil
		})
		e.Router.GET("/api/hello", func(c echo.Context) error {
			return c.String(200, "Hello whirled!")
		})
		return nil
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}

	app.Bootstrap()
	serveCmd := cmd.NewServeCommand(app, true)
	serveCmd.SetArgs([]string{"--http=0.0.0.0:42069"})
	serveCmd.Execute()
}
