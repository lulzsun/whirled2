package api

import (
	"log"
	"strings"
	"text/template"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

var stuffTmplFiles []string
var stuffTmpl *template.Template

type Category int64
const (
	Undefined Category = iota
	Avatar
	Furniture
)

type Stuff struct {
	Id			string 	`db:"id" json:"id"`
	OwnerId		string 	`db:"owner_id" json:"owner_id"`
	StuffId		string 	`db:"stuff_id" json:"stuff_id"`
	Name		string 	`db:"name" json:"name"`
	Description	string 	`db:"description" json:"description"`
	Thumbnail	string 	`db:"thumb" json:"thumb"`

	Type		int 	`db:"type" json:"type"`
}

func init() {
	parseStuffFiles()
}

func parseStuffFiles() {
	stuffTmplFiles = append(stuffTmplFiles, AppendToBaseTmplFiles(
		"web/templates/pages/stuff.gohtml",
	)...)
	stuffTmpl = template.Must(template.ParseFiles(stuffTmplFiles...))
}

func AddStuffRoutes(e *core.ServeEvent, app *pocketbase.PocketBase) {
	e.Router.GET("/stuff", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		if info.AuthRecord != nil {
			c.Redirect(302, "/stuff/avatars")
			return nil
		}
		c.Redirect(302, "/login")
		return nil
	})
	e.Router.GET("/stuff/:category", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		if info.AuthRecord == nil {
			c.Redirect(302, "/login")
			return nil
		}
		userId := info.AuthRecord.Id

		category := c.PathParam("category")
		if category != "avatars" && category != "furniture" && category != "backdrops" && category != "games" {
			c.Redirect(302, "/stuff/avatars")
			return nil
		}

		data := struct {
			Category	string
			Items		[]Stuff
		}{Category: strings.Title(category)}

		stuff := []Stuff{}

		switch category := c.PathParam("category"); category {
		case "avatars":
		case "furniture":
			err := app.DB().
			NewQuery(`
				SELECT
					s.id,
					s.type,
					s.stuff_id,
					f.name
				FROM stuff s
				INNER JOIN furniture f ON f.id = s.stuff_id
				WHERE s.owner_id = {:owner_id}
			`).
			Bind(dbx.Params{
				"owner_id": userId,
			}).All(&stuff)

			if err != nil {
				log.Println(err)
			} else {
				data.Items = stuff
			}
		case "backdrops":
			c.Redirect(302, "/404")
		case "games":
			c.Redirect(302, "/404")
		default:
			c.Redirect(302, "/stuff/avatars")
			return nil
		}

		if err := stuffTmpl.ExecuteTemplate(c.Response().Writer, c.Get("name").(string), data); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
	e.Router.GET("/stuff/:category/:id", func(c echo.Context) error {
		// TODO: Stuff item preview page
		c.String(404, "work in progress...")
		return nil
	})
}

func AddStuffEventHooks(app *pocketbase.PocketBase) {
}