package api

import (
	"log"
	"text/template"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

var stuffTmplFiles []string
var stuffTmpl *template.Template

var previewTmplFiles []string
var previewTmpl *template.Template

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
	previewTmplFiles = append(previewTmplFiles, AppendToBaseTmplFiles(
		"web/templates/pages/stuffPreview.gohtml",
	)...)
	previewTmpl = template.Must(template.ParseFiles(previewTmplFiles...))
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
		}{Category: category}

		stuff := []Stuff{}

		switch category := c.PathParam("category"); category {
		case "avatars":
			err := app.DB().
			NewQuery(`
				SELECT
					s.id,
					s.type,
					s.stuff_id,
					f.name
				FROM stuff s
				INNER JOIN avatars f ON f.id = s.stuff_id
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

		if err := stuffTmpl.ExecuteTemplate(c.Response().Writer, c.Get("name").(string), AppendToBaseData(c, data)); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
	e.Router.GET("/stuff/:category/:id", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		if info.AuthRecord == nil {
			c.Redirect(302, "/login")
			return nil
		}
		userId := info.AuthRecord.Id
		avatarId := c.PathParam("id")
		category := c.PathParam("category")
		if category != "avatars" && category != "furniture" && category != "backdrops" && category != "games" {
			c.Redirect(302, "/stuff/avatars")
			return nil
		}

		data := struct {
			AvatarId string
			StuffId string
			CreatorUsername string
			CreatorNickname string

			Name string
			Description string
			File	string
			Type	string
			Scale	float64
		}{AvatarId: avatarId, Type: category}

		dbObject := struct {
			Id string		    `db:"id" json:"id"`
			Type int		    `db:"type" json:"type"`
			AvatarId string	    `db:"stuff_id" json:"stuff_id"`

			Name string		    `db:"name" json:"name"`
			Description string  `db:"description" json:"description"`
			File string		    `db:"file" json:"file"`
			Scale float64	    `db:"scale" json:"scale"`

			Username string		`db:"Username" json:"Username"`
			Nickname string	    `db:"Nickname" json:"Nickname"`
		}{}

		switch category {
		case "avatars":
			err := app.DB().
			NewQuery(`
				SELECT 
					s.id, 
					s.type, 
					s.stuff_id, 
					a.name,
					a.description,
					a.file,
					a.scale,
					u.username,
					u.nickname
				FROM stuff s
				INNER JOIN users u ON u.id = s.owner_id
				INNER JOIN avatars a ON a.id = s.stuff_id
				WHERE s.owner_id = {:owner_id} AND a.id = {:avatar_id}
			`).
			Bind(dbx.Params{
				"owner_id": userId,
				"avatar_id": avatarId,
			}).One(&dbObject)

			if err != nil {
				log.Println(err)
			} else {
				data.StuffId = dbObject.Id
				data.CreatorUsername = dbObject.Username
				data.CreatorNickname = dbObject.Nickname
				if dbObject.Username == "" {
					data.CreatorUsername = "Admin"
					data.CreatorNickname = "Admin"
				}
				data.Name = dbObject.Name
				data.Description = dbObject.Description
				data.File = "/api/files/avatars/" + dbObject.AvatarId + "/" + dbObject.File
				data.Scale = dbObject.Scale
			}
		default:
			c.Redirect(302, "/stuff/avatars")
			return nil
		}

		if err := previewTmpl.ExecuteTemplate(c.Response().Writer, c.Get("name").(string), AppendToBaseData(c, data)); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
}

func AddStuffEventHooks(app *pocketbase.PocketBase) {
}