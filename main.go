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
		e.Router.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
			return func(c echo.Context) error {
				log.Println(c.Path())
				path := strings.TrimSuffix(c.Path(), ".html")
				if strings.HasSuffix(path, ".json") {
					return next(c)
				}
				if c.Path() == "/static/*" {
					return next(c)
				}
				name := "base"
				templateFiles := []string{
					"web/templates/pages/error.gohtml",
					"web/templates/pages/index.gohtml",
					"web/templates/components/header.gohtml",
					"web/templates/components/profileHeader.gohtml",
				}
				if c.Path() == "" {
					templateFiles[0] = "web/templates/pages/error.gohtml"
					if c.Request().Header.Get("HX-Request") == "true" {
						name = "page"
						templateFiles = []string{templateFiles[0]}
					}
					tmpl := template.Must(template.ParseFiles(templateFiles...))
					formatErr := map[string]string{
						"Error": "Page not found.",
					}
					if err := tmpl.ExecuteTemplate(c.Response().Writer, name, formatErr); err != nil {
						return err
					}
					return nil
				} else {
					templateFiles[0] = "web/templates/pages/" + path + ".gohtml"
					if c.Request().Header.Get("HX-Request") == "true" {
						name = "page"
						templateFiles = []string{templateFiles[0]}
					}
					tmpl, err := template.ParseFiles(templateFiles...)
					if err != nil {
						templateFiles[0] = "web/templates/pages/error.gohtml"
						tmpl := template.Must(template.ParseFiles(templateFiles...))
						formatErr := map[string]string{
							"Error": err.Error(),
						}
						if err := tmpl.ExecuteTemplate(c.Response().Writer, name, formatErr); err != nil {
							return err
						}
						return next(c)
					}
					if err := tmpl.ExecuteTemplate(c.Response().Writer, name, nil); err != nil {
						return err
					}
				}
				return next(c)
			}
		})
		e.Router.GET("/", func(c echo.Context) error { return nil })
		e.Router.GET("/login", func(c echo.Context) error { return nil })
		e.Router.GET("/signup", func(c echo.Context) error { return nil })
		e.Router.GET("/profile", func(c echo.Context) error {
			log.Println("hello")
			return nil
		})
		e.Router.GET("/login.json", func(c echo.Context) error {
			return apis.NewNotFoundError("hi there ugly", nil)
		})
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

	app.Bootstrap()
	serveCmd := cmd.NewServeCommand(app, true)
	serveCmd.SetArgs([]string{"--http=0.0.0.0:42069"})
	serveCmd.Execute()
}
