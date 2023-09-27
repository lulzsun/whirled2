package api

import (
	"log"
	"text/template"
	"whirled2/utils"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

var profileTmplFiles []string
var profileTmpl *template.Template

type Profile struct {
	UserId    string `db:"user_id" json:"user_id"`
	ProfileId string `db:"id" json:"id"`
}
type ProfileComment struct {
	CommentId string `db:"id" json:"id"`
	UserId    string `db:"user_id" json:"user_id"`
	ProfileId string `db:"profile_id" json:"profile_id"`
	Content   string `db:"content" json:"content"`
	Timestamp string `db:"created" json:"created"`
	IsDeleted bool   `db:"is_deleted" json:"is_deleted"`

	Username string `db:"username" json:"username"`
	Nickname string `db:"nickname" json:"nickname"`
}

func init() {
	parseProfileFiles()
}

func parseProfileFiles() {
	profileTmplFiles = AppendToBaseTmplFiles(
		"web/templates/pages/profile.gohtml",
		"web/templates/components/profile/comment.gohtml",
		"web/templates/components/profile/commentBox.gohtml",
	)
	profileTmpl = template.Must(template.ParseFiles(profileTmplFiles...))
}

func AddProfileRoutes(e *core.ServeEvent, app *pocketbase.PocketBase) {
	e.Router.GET("/profile", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		if info.AuthRecord != nil {
			username := info.AuthRecord.GetString("username")
			c.Redirect(302, "/profile/"+username)
			return nil
		}
		c.Redirect(302, "/login")
		return nil
	})
	e.Router.GET("/profile/:username", func(c echo.Context) error {
		username := c.PathParam("username")
		profile := Profile{}
		comments := []ProfileComment{}
		err := app.DB().
			NewQuery(`
				SELECT profiles.id, user_id 
				FROM profiles 
				INNER JOIN users ON profiles.user_id = users.id
				WHERE users.username = {:username}
			`).
			Bind(dbx.Params{
				"username": username,
			}).One(&profile)

		if err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}

		err = app.DB().
			NewQuery(`
				SELECT comments.id, comments.created, content, user_id, users.username, users.nickname 
				FROM comments 
				INNER JOIN users ON user_id = users.id
				WHERE profile_id = {:profile_id}
				ORDER BY comments.created DESC
			`).
			Bind(dbx.Params{
				"profile_id": profile.ProfileId,
			}).All(&comments)

		if err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}

		// log.Printf("%# v", pretty.Formatter(comments))

		data := struct {
			Username  string
			Nickname  string
			Status    string
			Following int
			Followers int

			UserId    string
			ProfileId string

			Comments []ProfileComment
		}{
			Username:  username,
			Nickname:  username,
			Status:    "Dreamer, Builder of the new whirled.",
			Following: 69,
			Followers: 420,

			UserId:    profile.UserId,
			ProfileId: profile.ProfileId,

			Comments: comments,
		}

		if err := profileTmpl.ExecuteTemplate(c.Response().Writer, c.Get("name").(string), data); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
}

func AddProfileEventHooks(app *pocketbase.PocketBase) {
	// POST /api/collections/comments/records
	// Successfully created comment for a user's profile
	app.OnRecordAfterCreateRequest("comments").Add(func(e *core.RecordCreateEvent) error {
		return utils.ProcessHXRequest(e, func() error {
			return e.HttpContext.String(201, "Successful comment!")
		}, func() error {
			return e.HttpContext.Redirect(302, e.HttpContext.Request().Referer())
		})
	})
}
