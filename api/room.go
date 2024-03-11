package api

import (
	"log"
	"sort"
	"text/template"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"whirled2/game/server"
)

var roomTmplFiles []string
var roomTmpl *template.Template

type Room struct {
	Id 			string `db:"id" json:"id"`
	OwnerId		string `db:"owner_id" json:"owner_id"`
	Name		string `db:"nickname" json:"nickname"`

	UsersCount	int
}

func init() {
	parseRoomFiles()
}

func parseRoomFiles() {
	roomTmplFiles = append(roomTmplFiles, AppendToBaseTmplFiles(
		"web/templates/pages/room.gohtml",
	)...)
	roomTmpl = template.Must(template.ParseFiles(roomTmplFiles...))
}

func AddRoomRoutes(e *core.ServeEvent, app *pocketbase.PocketBase) {
	e.Router.GET("/room", func(c echo.Context) error {
		c.Redirect(302, "/rooms")
		return nil
	})
	e.Router.GET("/rooms", func(c echo.Context) error {
		// err := app.DB().
		// 	NewQuery(`
		// 		SELECT profiles.id, user_id, users.nickname
		// 		FROM rooms 
		// 		INNER JOIN users ON profiles.user_id = users.id
		// 		WHERE users.username = {:username}
		// 	`).
		// 	Bind(dbx.Params{
		// 		"username": username,
		// 	}).One(&profile)

		// if err != nil {
		// 	log.Println(err)
		// 	return apis.NewBadRequestError("Something went wrong.", err)
		// }

		data := struct {
			ActiveRooms []Room
		}{
			ActiveRooms: []Room{},
		}
		rooms := server.GetActiveRooms(6)

		for id, count := range rooms {
			data.ActiveRooms = append(data.ActiveRooms, Room{
				Id: id,
				Name: "Untitled Room",
				UsersCount: count,
			})
		}

		sort.Slice(data.ActiveRooms, func(i, j int) bool {
			return data.ActiveRooms[i].UsersCount > data.ActiveRooms[j].UsersCount
		})

		if err := roomTmpl.ExecuteTemplate(c.Response().Writer, c.Get("name").(string), data); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
}

func AddRoomEventHooks(app *pocketbase.PocketBase) {
}