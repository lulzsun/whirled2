// main.go
package main

import (
	"html/template"
	"log"
	"os"
	"strings"

	"whirled2/api"
	"whirled2/game/server"
	"whirled2/utils"

	"github.com/joho/godotenv"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func main() {
	log.SetFlags(log.Llongfile)
	args := os.Args[1:]

	// Check if "--http" is present in the arguments
	debug := true
	for _, arg := range args {
		if strings.HasPrefix(arg, "--http") {
			debug = false
			break
		}
	}

	if debug {
		log.Println("Debug mode enabled")
		godotenv.Load(".env.local")
		localIPs, err := utils.GetLocalIP()
		if err == nil {
			os.Args = append(os.Args, "--http=0.0.0.0:42069", "--origins=http://127.0.0.1:6969,http://"+localIPs[0]+":6969,null")
		} else {
			os.Args = append(os.Args, "--http=0.0.0.0:42069", "--origins=http://127.0.0.1:6969,null")
		}
	} else {
		godotenv.Load()
	}

	utils.Start()

	app := pocketbase.NewWithConfig(pocketbase.Config{
		HideStartBanner: true,
		// DefaultDebug: false
	})
	routes := []func(*core.ServeEvent, *pocketbase.PocketBase){
		api.AddBaseRoutes,
		api.AddAuthRoutes,
		api.AddProfileRoutes,
		api.AddRoomRoutes,
		api.AddStuffRoutes,
		server.AddAuthRoutes,
		// Add more routes here
	}
	customEventHooks := []func(*pocketbase.PocketBase){
		api.AddAuthEventHooks,
		api.AddProfileEventHooks,
		api.AddRoomEventHooks,
		api.AddStuffEventHooks,
		// Add more event hooks here
		api.AddBaseEventHooks, // keep last
	}
	for _, AddEventHooks := range customEventHooks {
		AddEventHooks(app)
	}

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		utils.Bootstrap(app)

		// serves static files from the provided public dir (if exists)
		se.Router.GET("/static/{path...}", func(e *core.RequestEvent) error {
			// Disable client-side caching for development
			e.Response.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
			return apis.Static(os.DirFS("./web/static"), false)(e)
		})
		se.Router.Bind(
			// api.FormMiddleware(app),
			api.AuthMiddleware(app),
		)
		se.Router.BindFunc(
			utils.IdleMiddleware,
			api.ErrorMiddleware,
			api.BaseMiddleware,
		)
		for _, AddRoutes := range routes {
			AddRoutes(se, app)
		}
		se.Router.GET("/api/hello", func(e *core.RequestEvent) error {
			return e.String(200, "Hello whirled!")
		})
		se.Router.GET("/test", func(e *core.RequestEvent) error {
			tmpl := template.Must(template.ParseFiles("web/templates/pages/test.gohtml"))
			if err := tmpl.Execute(e.Response, nil); err != nil {
				return err
			}
			return nil
		})

		// start gecgos.io game server
		server.Start(42069, app, debug)
		return se.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
