package api

import (
	"log"
	"text/template"
	"whirled2/utils"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

var stuffTmplFiles []string
var stuffTmpl *template.Template

var previewTmplFiles []string
var previewTmpl *template.Template

var uploadTmplFiles []string
var uploadTmpl *template.Template

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
	uploadTmplFiles = append(uploadTmplFiles, AppendToBaseTmplFiles(
		"web/templates/pages/stuffUpload.gohtml",
	)...)
	uploadTmpl = template.Must(template.ParseFiles(uploadTmplFiles...))
}

func AddStuffRoutes(se *core.ServeEvent, app *pocketbase.PocketBase) {
	se.Router.GET("/stuff", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth != nil {
			e.Redirect(302, "/stuff/avatars")
			return nil
		}
		e.Redirect(302, "/login")
		return nil
	})
	se.Router.GET("/stuff/{category}", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth == nil {
			e.Redirect(302, "/login")
			return nil
		}
		userId := info.Auth.Id

		category := e.Request.PathValue("category")
		if category != "avatars" && category != "furniture" && category != "backdrops" && category != "games" {
			e.Redirect(302, "/stuff/avatars")
			return nil
		}

		data := struct {
			Category	string
			Items		[]Stuff
		}{Category: category}

		stuff := []Stuff{}

		switch category {
		case "avatars":
			err := app.DB().
			NewQuery(`
				SELECT
					s.id,
					s.type,
					s.stuff_id,
					f.name,
					f.thumb
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
					f.name,
					f.thumb
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
			e.Redirect(302, "/404")
		case "games":
			e.Redirect(302, "/404")
		default:
			e.Redirect(302, "/stuff/avatars")
			return nil
		}

		if err := stuffTmpl.ExecuteTemplate(e.Response, e.Get("name").(string), AppendToBaseData(e, data)); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
	se.Router.GET("/stuff/{category}/upload", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth == nil {
			e.Redirect(302, "/login")
			return nil
		}
		userId := info.Auth.Id
		category := e.Request.PathValue("category")
		if category != "avatars" && category != "furniture" && category != "backdrops" && category != "games" {
			e.Redirect(302, "/stuff/avatars")
			return nil
		}

		data := struct {
			UserId   string
			Id       string
			File     string
			Category string
			Type     string
			Scale    float64
		}{UserId: userId, Id: utils.GenerateHTMLSafeID(), Category: category, Type: category + "Upload"}

		switch category {
		case "avatars":
		default:
			e.Redirect(302, "/stuff/avatars")
			return nil
		}

		if err := uploadTmpl.ExecuteTemplate(e.Response, e.Get("name").(string), AppendToBaseData(e, data)); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
	se.Router.GET("/stuff/{category}/{id}", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth == nil {
			e.Redirect(302, "/login")
			return nil
		}
		userId := info.Auth.Id
		avatarId := e.Request.PathValue("id")
		category := e.Request.PathValue("category")
		if category != "avatars" && category != "furniture" && category != "backdrops" && category != "games" {
			e.Redirect(302, "/stuff/avatars")
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

			Username string		`db:"username" json:"Username"`
			Nickname string	    `db:"nickname" json:"Nickname"`
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
				INNER JOIN avatars a ON a.id = s.stuff_id
				INNER JOIN users u ON u.id = a.creator_id
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
			e.Redirect(302, "/stuff/avatars")
			return nil
		}

		if err := previewTmpl.ExecuteTemplate(e.Response, e.Get("name").(string), AppendToBaseData(e, data)); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
}

func AddStuffEventHooks(app *pocketbase.PocketBase) {
	// POST /api/collections/comments/records
	// After successful avatar creation, redirect the user back to /stuff
	app.OnRecordCreateRequest("avatars").BindFunc(func(e *core.RecordRequestEvent) error {
		err := e.Next()
		if err == nil {
			return err
		}

		utils.ProcessHXRequest(e, func() error {
			return e.Redirect(302, "/stuff")
		}, func() error {
			return e.Redirect(302, "/stuff")
		})
		return nil
	})

	// POST /api/collections/comments/records
	// After successful avatar creation give the creator a copy of the avatar (in stuff)
	app.OnRecordAfterCreateSuccess("avatars").BindFunc(func(e *core.RecordEvent) error {
		avatarId := e.Record.Id
		collection, err := app.FindCollectionByNameOrId("stuff")
		if err != nil {
			return err
		}
		record := core.NewRecord(collection)
		record.Load(map[string]any{
			"stuff_id": avatarId,
			"type": 2,
			"owner_id": e.Record.Get("creator_id"),
		})
		if err := app.Save(record); err != nil {
			return err
		}
		return e.Next()
	})
}