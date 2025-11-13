package api

import (
	"bytes"
	"log"
	"math"
	"strconv"
	"text/template"
	"whirled2/utils"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

var commentTmplFiles []string
var commentTmpl *template.Template

var profileTmplFiles []string
var profileTmpl *template.Template

var queryGetProfileComments string

type Profile struct {
	UserId    string `db:"user_id" json:"user_id"`
	ProfileId string `db:"id" json:"id"`
	Nickname  string `db:"nickname" json:"nickname"`
}
type Comment struct {
	CommentId string `db:"id" json:"id"`
	ProfileId string `db:"profile_id" json:"profile_id"`
	ParentId  string `db:"parent_id" json:"parent_id"`
	Content   string `db:"content" json:"content"`
	Timestamp string `db:"created" json:"created"`
	IsDeleted bool   `db:"is_deleted" json:"is_deleted"`

	Username string `db:"username" json:"username"`
	Nickname string `db:"nickname" json:"nickname"`

	RelativeTime string

	Total       int
	Depth       int
	Count       int
	DepthHideId string
	CountHideId string
	Children    []*Comment
}

func init() {
	parseProfileFiles()
	queryGetProfileComments = utils.ReadSqlQuery("sql/profile/getProfileComments.sql")
}

func parseProfileFiles() {
	commentTmplFiles = []string{
		"web/templates/components/comment.gohtml",
		"web/templates/components/commentBox.gohtml",
	}
	commentBaseTmpl := `
	{{define "base"}}
		{{range .Comments}}
			{{template "comment" .}}
		{{end}}
	{{end}}
	`
	var err error
	err = nil
	commentTmpl, err = template.New("").Parse(commentBaseTmpl)
	if err != nil {
		log.Fatalln("Something went wrong when parsing commentTmpl:", err)
	}
	commentTmpl = template.Must(commentTmpl.ParseFiles(commentTmplFiles...))

	profileTmplFiles = append(append(profileTmplFiles, AppendToBaseTmplFiles(
		"web/templates/pages/profile.gohtml",
		"web/templates/components/pagination.gohtml",
	)...), commentTmplFiles...)
	profileTmpl = template.Must(template.ParseFiles(profileTmplFiles...))
}

func AddProfileRoutes(se *core.ServeEvent, app *pocketbase.PocketBase) {
	se.Router.GET("/profile", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth != nil {
			username := info.Auth.GetString("username")
			e.Redirect(302, "/profile/"+username)
			return nil
		}
		e.Redirect(302, "/login")
		return nil
	})
	se.Router.GET("/profile/{username}", func(e *core.RequestEvent) error {
		htmxEnabled := false
		username := e.Request.PathValue("username")
		parentCommentId := e.Request.URL.Query().Get("viewReplies")
		commentOffset, _ := strconv.Atoi(e.Request.URL.Query().Get("replyOffset"))
		commentsPage, err := strconv.Atoi(e.Request.URL.Query().Get("commentsPage")) // each page has 4 comments
		if err == nil {
			commentsPage = commentsPage - 1
		}

		profile := Profile{}
		comments := []Comment{}

		utils.ProcessHXRequest(e, func() error {
			htmxEnabled = true
			return nil
		}, func() error { return nil })

		err = app.DB().
			NewQuery(`
				SELECT profiles.id, users.nickname
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
			NewQuery(queryGetProfileComments).
			Bind(dbx.Params{
				"profile_id":     profile.ProfileId,
				"parent_id":      parentCommentId,
				"comment_offset": commentOffset + (commentsPage * 4),
			}).All(&comments)

		if err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}

		comments = list2tree(comments, parentCommentId, htmxEnabled)
		commentPageLength := make([]int, 0)
		if len(comments) > 0 {
			// each page has a max of 4 parent comments, divide total by 4 and round up
			commentPageLength = make([]int, int(math.Ceil(float64(comments[0].Total)/4)))
		}
		for i := 0; i < len(commentPageLength); i++ {
			commentPageLength[i] = i + 1
		}

		data := struct {
			Username  string
			Nickname  string
			Status    string
			Following int
			Followers int

			CommentId string
			UserId    string
			ProfileId string
			ParentId  string

			Comments []Comment

			// pagination component values
			CommentPageCurrent int
			CommentPageLength  []int
		}{
			Username:  username,
			Nickname:  profile.Nickname,
			Status:    "Building the new whirled.",
			Following: 69,
			Followers: 420,

			CommentId: "",
			UserId:    profile.UserId,
			ProfileId: profile.ProfileId,
			ParentId:  "",

			Comments: comments,

			CommentPageCurrent: commentsPage + 1,
			CommentPageLength:  commentPageLength,
		}

		if htmxEnabled && parentCommentId != "" {
			// User is viewing more comments under /profile/,
			// so we will just send partial html (comments)
			if err := commentTmpl.ExecuteTemplate(e.Response, "base", AppendToBaseData(e, data)); err != nil {
				log.Println(err)
				return apis.NewBadRequestError("Something went wrong.", err)
			}
			return nil
		}
		if err := profileTmpl.ExecuteTemplate(e.Response, e.Get("name").(string), AppendToBaseData(e, data)); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
}

func AddProfileEventHooks(app *pocketbase.PocketBase) {
	// POST /api/collections/comments/records
	// Verify user id and send back HTML fragments of the new comment
	app.OnRecordCreateRequest("comments").BindFunc(func(e *core.RecordRequestEvent) error {
		// Before creating comment for a user's profile
		// Set the user_id to be the currently auth'd user
		// This is because our API rule for creating comments is nothing (no rule!)
		// So we should manually check our token to prevent impersonations and such
		info, _ := e.RequestInfo()
		if info.Auth == nil {
			return apis.NewForbiddenError("Only authorized users can create a comment.", nil)
		}
		e.Record.Set("user_id", info.Auth.Id)

		// we manually save the record here, do not call e.next()
		// or else record json will append to our json
		if err := app.Save(e.Record); err != nil {
			return err
		}

		// If HTMX enabled, we will return html for the newly created comment
		// elif HTMX disabled, we will just refresh the page (redirect=refresh)
		// else, do normal pocketbase things (return Record json)
		err := utils.ProcessHXRequest(e, func() error {
			user, err := app.FindRecordById("users", e.Record.GetString("user_id"))
			if err != nil {
				log.Println(err)
				return apis.NewBadRequestError("Something went wrong.", err)
			}
			username, nickname := user.GetString("username"), user.GetString("nickname")

			data := struct {
				Comments []Comment
			}{
				Comments: []Comment{
					{
						CommentId:    e.Record.Id,
						ProfileId:    e.Record.GetString("profile_id"),
						ParentId:     e.Record.GetString("parent_id"),
						Content:      e.Record.GetString("content"),
						Timestamp:    e.Record.GetString("created"),
						IsDeleted:    e.Record.GetBool("is_deleted"),
						RelativeTime: utils.FormatRelativeTime(e.Record.GetString("created")),
						Username:     username,
						Nickname:     nickname,
					},
				},
			}
			var htmlBuffer bytes.Buffer
			if err := commentTmpl.ExecuteTemplate(&htmlBuffer, "base", data); err != nil {
				log.Println(err)
				return apis.NewBadRequestError("Something went wrong.", err)
			}
			return e.HTML(200, htmlBuffer.String())
		}, func() error {
			return e.Redirect(302, e.Request.Referer())
		})

		if err != nil {
			return err
		}
		return nil
	})
}

func list2tree(flatComments []Comment, parentCommentId string, isHTMX bool) []Comment {
	// log.Printf("%# v", pretty.Formatter(flatComments))
	commentMap := make(map[string]*Comment)

	// Step 1: Build a map of comments by their Id
	for i := range flatComments {
		// also format the time to be relative
		flatComments[i].RelativeTime = utils.FormatRelativeTime(flatComments[i].Timestamp)
		commentMap[flatComments[i].CommentId] = &flatComments[i]
	}

	// Step 2: Attach child comments to their parent comments
	for i := range flatComments {
		if flatComments[i].CommentId == parentCommentId {
			continue
		}
		parent := flatComments[i].ParentId
		if flatComments[i].Count >= 5 {
			c, exists := commentMap[parent]
			if exists {
				c.CountHideId = flatComments[i].CommentId
			} else {
				flatComments[i].CountHideId = flatComments[i].CommentId
			}
		}
		if parent != "" && flatComments[i].Depth < 5 {
			commentMap[parent].Children = append(commentMap[parent].Children, &flatComments[i])
		} else if flatComments[i].Depth >= 5 {
			commentMap[parent].DepthHideId = flatComments[i].ParentId
		}
	}

	// Step 3: Find root comments (comments with no parent)
	var hierarchy []Comment
	for i := range flatComments {
		if flatComments[i].CommentId == parentCommentId && !isHTMX {
			hierarchy = append(hierarchy, flatComments[i])
			break
		}
		if flatComments[i].ParentId == parentCommentId {
			hierarchy = append(hierarchy, flatComments[i])
		}
	}

	// log.Printf("%# v", pretty.Formatter(hierarchy))
	return hierarchy
}
