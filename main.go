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

// The Content-Security-Policy for the Flash sandbox document. See
// docs/specs/swf-avatar-rendering.md section 16.
//
// Two jobs in one header. `frame-ancestors` says who may frame the sandbox:
// PocketBase defaults to X-Frame-Options: SAMEORIGIN, which is right for every
// page here except the one that exists to be framed by the app — and the whole
// point of M6 is that the app is somewhere else, so main.go drops XFO for this
// document and this directive takes over. Everything else says what the
// sandbox itself may load: its own origin only, which is what "deny Ruffle
// networking" actually means in a browser — every URLLoader/Loader an avatar
// opens goes through the document's fetch, and the document can only reach
// 'self', where the only user content is the sniffed, size-capped /avatar
// proxy (api/avatar.go).
//
// 'unsafe-eval' is not a concession, it is load-bearing: Ruffle implements the
// outbound half of ExternalInterface — every whirledHostEvent the shim sends —
// as `new Function(...)` in its wasm-bindgen glue, and without it the shim
// goes silent while inbound callbacks keep working (measured: queries
// answered, zero events). It also costs nothing here: this document grants
// avatars arbitrary JS in itself by design (`allowScriptAccess` *is* an eval
// service), and the directives that actually confine an avatar — connect-src,
// default-src, frame-ancestors — stay tight. 'unsafe-inline' styles are for
// the styles Ruffle injects into its shadow DOM and, in dev, vite's HMR.
// The policy contains a "{origin}" placeholder next to every 'self', filled
// in per request from the Host header. 'self' alone is not enough: under M6
// step 7 a single-origin deployment runs the sandbox with an opaque origin
// (iframe sandbox="allow-scripts"), and CSP's 'self' keyword matches nothing
// for a document whose origin is opaque — the explicit origin is what keeps
// ruffle.js, the wasm and /avatar loadable there, while still permitting only
// the one origin they actually come from.
var sandboxCSP = "default-src 'none'"

func buildSandboxCSP(debug bool, localIPs []string) string {
	self := []string{"'self'", "{origin}"}
	viteHTTP := []string{}
	viteWS := []string{}
	ancestors := []string{"'self'"}

	if debug {
		// Dev serves the app from three places: the Go server on either
		// loopback spelling, and vite. 'self' covers neither loopback spelling
		// but its own, and localhost vs 127.0.0.1 is exactly the pairing step
		// 4 uses to get two origins out of one server. The vite origins are in
		// script/connect because the dev fallback in sandbox.html loads
		// sandbox.ts (and its HMR websocket) straight from vite.
		viteHTTP = []string{"http://127.0.0.1:6969", "http://localhost:6969"}
		viteWS = []string{"ws://127.0.0.1:6969", "ws://localhost:6969"}
		ancestors = append(ancestors,
			"http://127.0.0.1:42069", "http://localhost:42069",
			"http://127.0.0.1:6969", "http://localhost:6969",
		)
		for _, ip := range localIPs {
			viteHTTP = append(viteHTTP, "http://"+ip+":6969")
			viteWS = append(viteWS, "ws://"+ip+":6969")
			ancestors = append(ancestors,
				"http://"+ip+":42069", "http://"+ip+":6969")
		}
	} else if origin := os.Getenv("APP_ORIGIN"); origin != "" {
		// One framing origin in production: the app. Without it, only
		// same-origin framing works, which is the state M6 is trying to leave.
		ancestors = append(ancestors, origin)
	}

	directives := []string{
		"default-src 'none'",
		"script-src " + strings.Join(
			append(append([]string{}, self...), viteHTTP...), " ") +
			" 'unsafe-eval' 'wasm-unsafe-eval'",
		// `data:` is the upload preview: a file that is not on any server
		// yet reaches the shim as a data: URL, and Ruffle loads SWFs through
		// fetch, so the scheme has to be connectable. It grants nothing — a
		// data: URL carries its own bytes and cannot reach the network.
		"connect-src data: " + strings.Join(
			append(append(append([]string{}, self...), viteHTTP...),
				viteWS...), " "),
		"img-src 'self' {origin} data: blob:",
		"media-src 'self' {origin} blob:",
		"font-src 'self' {origin} data:",
		"style-src 'self' {origin} 'unsafe-inline'",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'none'",
		"frame-ancestors " + strings.Join(ancestors, " "),
	}
	return strings.Join(directives, "; ")
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
		sandboxCSP = buildSandboxCSP(true, localIPs)
		if err == nil {
			os.Args = append(os.Args, "--http=0.0.0.0:42069", "--origins=http://127.0.0.1:6969,http://"+localIPs[0]+":6969,null")
		} else {
			os.Args = append(os.Args, "--http=0.0.0.0:42069", "--origins=http://127.0.0.1:6969,null")
		}
	} else {
		godotenv.Load()
		sandboxCSP = buildSandboxCSP(false, nil)
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
		api.AddAvatarRoutes,
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
				scheme := "http"
				if e.Request.TLS != nil ||
					e.Request.Header.Get("X-Forwarded-Proto") == "https" {
					scheme = "https"
				}
				origin := scheme + "://" + e.Request.Host
				e.Response.Header().Set(
					"Content-Security-Policy",
					strings.ReplaceAll(sandboxCSP, "{origin}", origin))
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
