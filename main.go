// main.go
package main

import (
	"html/template"
	"log"
	"os"
	"strings"
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

	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		// serves static files from the provided public dir (if exists)
		e.Router.GET("/static/*", func(c echo.Context) error {
			// Disable client-side caching for development
			c.Response().Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
			return apis.StaticDirectoryHandler(os.DirFS("./web/static"), false)(c)
		})
		e.Router.GET("/*", func(c echo.Context) error {
			path := strings.TrimSuffix(c.PathParam("*"), ".html")
			if path == "" {
				path = "login"
			}
			if strings.HasSuffix(path, ".json") {
				return apis.NewBadRequestError("JSON endpoint not yet implemented", nil)
			}
			if c.Request().Header.Get("HX-Request") == "true" {
				tmpl, err := template.ParseFiles("web/templates/pages/" + path + ".html")
				if err != nil {
					tmpl := template.Must(template.ParseFiles("web/templates/pages/error.html"))
					formatErr := map[string]string{
						"Error": err.Error(),
					}
					if err := tmpl.ExecuteTemplate(c.Response().Writer, "page", formatErr); err != nil {
						return err
					}
					return nil
				}
				if err := tmpl.ExecuteTemplate(c.Response().Writer, "page", nil); err != nil {
					return err
				}
				return nil
			}

			tmpl, err := template.ParseFiles(
				"web/templates/pages/"+path+".html",
				"web/templates/pages/index.html",
				"web/templates/components/header.html",
				"web/templates/components/profileHeader.html",
			)
			if err != nil {
				tmpl := template.Must(template.ParseFiles(
					"web/templates/pages/error.html",
					"web/templates/pages/index.html",
					"web/templates/components/header.html",
					"web/templates/components/profileHeader.html",
				))
				formatErr := map[string]string{
					"Error": err.Error(),
				}
				c.Response().Writer.WriteHeader(404)
				if err := tmpl.ExecuteTemplate(c.Response().Writer, "base", formatErr); err != nil {
					return err
				}
				return nil
			}
			if err := tmpl.ExecuteTemplate(c.Response().Writer, "base", nil); err != nil {
				return err
			}
			return nil
		})
		e.Router.GET("/login.json", func(c echo.Context) error {
			return apis.NewNotFoundError("hi there ugly", nil)
		})
		e.Router.GET("/api/hello", func(c echo.Context) error {
			return c.String(200, "Hello whirled!")
		})
		e.Router.GET("/test", func(c echo.Context) error {
			tmpl := template.Must(template.ParseFiles("web/templates/pages/test.html"))
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

	app.Bootstrap()
	serveCmd := cmd.NewServeCommand(app, true)
	serveCmd.SetArgs([]string{"--http=0.0.0.0:42069"})
	serveCmd.Execute()
}
