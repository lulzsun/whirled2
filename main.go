// main.go
package main

import (
	"html/template"
	"log"
	"os"

	"whirled2/api"
	"whirled2/game/server"
	"whirled2/utils"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func main() {
	os.Args = append(os.Args, "--http=0.0.0.0:42069", "--origins=http://127.0.0.1:6969")

	// start gecgos.io game server
	server.Start(42069)

	app := pocketbase.NewWithConfig(pocketbase.Config{
		HideStartBanner: true,
		// DefaultDebug: false
	})
	routes := []func(*core.ServeEvent, *pocketbase.PocketBase){
		api.AddBaseRoutes,
		api.AddAuthRoutes,
		api.AddProfileRoutes,
		server.AddAuthRoutes,
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
		utils.Bootstrap(app)

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

		log.Println("Server started at http://localhost:42069")
		return nil
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
