// main.go
package main

import (
	"log"
	"net/http/httputil"
	"net/url"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/cmd"
	"github.com/pocketbase/pocketbase/core"

	gecgosio "github.com/lulzsun/gecgos.io"
)

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

	app := pocketbase.NewWithConfig(&pocketbase.Config{
		// DefaultDebug: false,
	})
	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		// production(?)
		// e.Router.GET("/*", apis.StaticDirectoryHandler(os.DirFS("pb_public"), true))

		// development
		url, _ := url.Parse("http://localhost:8091")
		proxy := httputil.NewSingleHostReverseProxy(url)
		e.Router.GET("/*", echo.WrapHandler(proxy))
		return nil
	})
	app.Bootstrap()
	serveCmd := cmd.NewServeCommand(app, true)
	// serveCmd.SetArgs([]string{"--http=127.0.0.1:8092"})
	serveCmd.Execute()
}
