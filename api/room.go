package api

import (
	"log"
	"text/template"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"whirled2/game/server"
)

var roomTmplFiles []string
var roomTmpl *template.Template

type Room struct {
	Id 			string	`db:"id" json:"id"`
	OwnerId		string	`db:"owner_id" json:"owner_id"`
	Name		string	`db:"name" json:"name"`
	IsFeatured	bool	`db:"is_featured" json:"is_featured"`

	UsersCount	int
}

func init() {
	parseRoomFiles()
}

func parseRoomFiles() {
	roomTmplFiles = append(roomTmplFiles, AppendToBaseTmplFiles(
		"web/templates/pages/room.gohtml",
		"web/templates/components/room.gohtml",
	)...)
	roomTmpl = template.Must(template.ParseFiles(roomTmplFiles...))
}

func AddRoomRoutes(e *core.ServeEvent, app *pocketbase.PocketBase) {
	e.Router.GET("/room", func(c echo.Context) error {
		c.Redirect(302, "/rooms")
		return nil
	})
	e.Router.GET("/rooms", func(c echo.Context) error {
		data := struct {
			ActiveRooms []Room
			FeaturedRooms []Room
		}{
			ActiveRooms: []Room{},
			FeaturedRooms: []Room{},
		}
		rooms := server.GetActiveRooms(6, 0)

		q := app.DB().NewQuery(`
			SELECT name FROM rooms 
			WHERE id = {:id}
		`)
		q.Prepare()
		defer q.Close()

		for _, room := range rooms {
			dbRoom := Room{}
			q.Bind(dbx.Params{"id": room.Id})
			err := q.One(&dbRoom)
			if err != nil {
				log.Println(err)
				continue
			}
			data.ActiveRooms = append(data.ActiveRooms, Room{
				Id: room.Id,
				Name: dbRoom.Name,
				UsersCount: room.UsersCount,
			})
		}

		featuredRooms := []Room{}
		err := app.DB().
			NewQuery(`
				SELECT * FROM rooms 
				WHERE is_featured = true
				ORDER BY updated DESC
				LIMIT 6 OFFSET 0
			`).All(&featuredRooms)

		if err == nil {
			for _, room := range featuredRooms {
				data.FeaturedRooms = append(data.FeaturedRooms, Room{
					Id: room.Id,
					Name: room.Name,
					UsersCount: server.GetActiveRoom(room.Id).UsersCount,
				})
			}
		}

		if err := roomTmpl.ExecuteTemplate(c.Response().Writer, c.Get("name").(string), AppendToBaseData(c, data)); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
}

func AddRoomEventHooks(app *pocketbase.PocketBase) {
}