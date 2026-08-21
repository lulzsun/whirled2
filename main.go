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

// Origins allowed to frame the Flash sandbox document.
//
// PocketBase defaults to X-Frame-Options: SAMEORIGIN, which is right for every
// page here except one: web/static/sandbox.html exists to be framed by the app,
// and the whole point of M6 is that the app is somewhere else. See
// docs/specs/swf-avatar-rendering.md section 16.
//
// This is a list of who may frame it, not of who it may talk to. The sandbox
// itself pins its parent on first contact and holds nothing worth reaching.
var sandboxFrameAncestors = "'self'"

func sandboxAncestors(debug bool, localIPs []string) string {
	if !debug {
		// One origin in production: the app. Without it, only same-origin
		// framing works, which is the state M6 is trying to leave.
		if origin := os.Getenv("APP_ORIGIN"); origin != "" {
			return "'self' " + origin
		}
		return "'self'"
	}
	// Dev serves the app from three places: the Go server on either loopback
	// spelling, and vite. 'self' covers neither loopback spelling but its own,
	// and localhost vs 127.0.0.1 is exactly the pairing step 4 uses to get two
	// origins out of one server.
	allowed := []string{
		"'self'",
		"http://127.0.0.1:42069",
		"http://localhost:42069",
		"http://127.0.0.1:6969",
		"http://localhost:6969",
	}
	for _, ip := range localIPs {
		allowed = append(allowed, "http://"+ip+":42069", "http://"+ip+":6969")
	}
	return strings.Join(allowed, " ")
}

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
		sandboxFrameAncestors = sandboxAncestors(true, localIPs)
		if err == nil {
			os.Args = append(os.Args, "--http=0.0.0.0:42069", "--origins=http://127.0.0.1:6969,http://"+localIPs[0]+":6969,null")
		} else {
			os.Args = append(os.Args, "--http=0.0.0.0:42069", "--origins=http://127.0.0.1:6969,null")
		}
	} else {
		godotenv.Load()
		sandboxFrameAncestors = sandboxAncestors(false, nil)
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
			// The one document here that is meant to be framed from another
			// origin. X-Frame-Options has no syntax for "this specific other
			// origin", so it goes and frame-ancestors takes over.
			if strings.HasSuffix(e.Request.URL.Path, "/sandbox.html") {
				e.Response.Header().Del("X-Frame-Options")
				e.Response.Header().Set(
					"Content-Security-Policy",
					"frame-ancestors "+sandboxFrameAncestors,
				)
			}
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
