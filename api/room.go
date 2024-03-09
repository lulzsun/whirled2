package api

import (
	"log"
	"text/template"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

var roomTmplFiles []string
var roomTmpl *template.Template

type Room struct {
	OwnerId    string `db:"owner_id" json:"owner_id"`
	Name  string `db:"nickname" json:"nickname"`
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
			ActiveRooms []int
		}{
			ActiveRooms: []int{0, 0, 0, 0, 0, 0, 0, 0},
		}

		if err := roomTmpl.ExecuteTemplate(c.Response().Writer, c.Get("name").(string), data); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
}

func AddRoomEventHooks(app *pocketbase.PocketBase) {
}