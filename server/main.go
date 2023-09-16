// main.go
package main

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/cmd"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/forms"
	"github.com/pocketbase/pocketbase/models"

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
		proxy.ModifyResponse = func(r *http.Response) error {
			if r.Header.Get("Content-Type") != "text/html;charset=utf-8" &&
				r.Request.Header.Get("Sec-Fetch-Dest") != "document" {
				return nil
			}
			b, err := io.ReadAll(r.Body) //Read html
			if err != nil {
				return err
			} else {
				log.Println(r.Request.URL.Path)
			}
			buf := bytes.NewBufferString("")
			buf.Write(b)
			r.Body = io.NopCloser(buf)
			r.Header["Content-Length"] = []string{fmt.Sprint(buf.Len())}
			return nil
		}
		e.Router.GET("/*", echo.WrapHandler(proxy))
		e.Router.GET("/api/hello", func(c echo.Context) error {
			return c.String(200, "Hello whirled!")
		})
		return nil
	})

	app.OnRecordBeforeCreateRequest().Add(func(e *core.RecordCreateEvent) error {
		if e.Collection.Name == "users" {
			dob, err := time.Parse("2006-01-02 15:04:05.000Z", e.Record.GetDateTime("birthday").String())
			if err != nil || int(time.Since(dob).Hours()/24/365) < 13 {
				return apis.NewBadRequestError("You must be at least 13 years or older to register.", err)
			}
		}
		return nil
	})

	app.OnRecordAfterCreateRequest().Add(func(e *core.RecordCreateEvent) error {
		if e.Collection.Name == "users" {
			collection, err := app.Dao().FindCollectionByNameOrId("profiles")
			if err != nil {
				return err
			}
			record := models.NewRecord(collection)
			form := forms.NewRecordUpsert(app, record)

			form.LoadData(map[string]any{
				"id":       e.Record.Id,
				"username": e.Record.Username(),
				"nickname": e.Record.Username(),
			})

			if err := form.Submit(); err != nil {
				return err
			}
		}
		return nil
	})

	app.Bootstrap()
	serveCmd := cmd.NewServeCommand(app, true)
	serveCmd.SetArgs([]string{"--http=0.0.0.0:8090"})
	serveCmd.Execute()
}
