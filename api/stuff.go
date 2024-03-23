package api

import (
	"log"
	"strings"
	"text/template"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

var stuffTmplFiles []string
var stuffTmpl *template.Template

type Stuff struct {
	Id			string `db:"id" json:"id"`
	OwnerId		string `db:"owner_id" json:"owner_id"`
	Name		string `db:"name" json:"name"`
	Description	string `db:"description" json:"description"`
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

		category := c.PathParam("category")
		if category != "avatars" && category != "furniture" && category != "backdrops" && category != "games" {
			c.Redirect(302, "/stuff/avatars")
			return nil
		}

		data := struct {
			Category	string
			Items		[]Stuff
		}{Category: strings.Title(category)}

		switch category := c.PathParam("category"); category {
		case "avatars":
		case "furniture":
			
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
}

func AddStuffEventHooks(app *pocketbase.PocketBase) {
}