// main.go
package main

import (
	"html/template"
	"log"
	"os"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/cmd"
	"github.com/pocketbase/pocketbase/core"
)

type Film struct {
	Title    string
	Director string
}

func main() {
	app := pocketbase.NewWithConfig(pocketbase.Config{
		// DefaultDebug: false,
	})

	// serves static files from the provided public dir (if exists)
	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		e.Router.GET("/static/*", func(c echo.Context) error {
			// Disable client-side caching for development
			c.Response().Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
			return apis.StaticDirectoryHandler(os.DirFS("./web/static"), false)(c)
		})
		e.Router.GET("/*", func(c echo.Context) error {
			tmpl := template.Must(template.ParseFiles("web/templates/index.html"))
			films := map[string][]Film{
				"Films": {
					{Title: "The Godfather", Director: "Francis Ford Coppola"},
					{Title: "Blade Runner", Director: "Ridley Scott"},
					{Title: "The Things", Director: "John Carpenter"},
				},
			}
			if err := tmpl.Execute(c.Response().Writer, films); err != nil {
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
