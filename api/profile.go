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
type Comment struct {
	CommentId string `db:"id" json:"id"`
	UserId    string `db:"user_id" json:"user_id"`
	ProfileId string `db:"profile_id" json:"profile_id"`
	ParentId  string `db:"parent_id" json:"parent_id"`
	Content   string `db:"content" json:"content"`
	Timestamp string `db:"created" json:"created"`
	IsDeleted bool   `db:"is_deleted" json:"is_deleted"`

	Username string `db:"username" json:"username"`
	Nickname string `db:"nickname" json:"nickname"`

	Depth     int
	Count     int
	DepthHide bool
	CountHide bool
	Children  []*Comment
}

func init() {
	parseProfileFiles()
}

func parseProfileFiles() {
	profileTmplFiles = AppendToBaseTmplFiles(
		"web/templates/pages/profile.gohtml",
		"web/templates/components/pagination.gohtml",
		"web/templates/components/comment.gohtml",
		"web/templates/components/commentBox.gohtml",
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
		comments := []Comment{}
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
			// i don't really know what im doing lol...
			NewQuery(`
			WITH list_orders AS (
				SELECT i1.*, 
				users.username AS username, users.nickname AS nickname,
				(SELECT COUNT(i2.id)
					FROM comments i2
					WHERE i2.parent_id = i1.parent_id
						AND (i2.created > i1.created 
							OR (i2.created = i1.created AND i2.id > i1.id))
				) list_order
				FROM comments i1
				INNER JOIN users ON i1.user_id = users.id
				WHERE i1.profile_id = {:profile_id}
			),
			cte AS (
				SELECT * FROM (
					SELECT *, 
						1 depth, 
						(list_order + 1) || '' path_index,
						(
							SELECT COUNT(*) 
							FROM comments subchild
							WHERE subchild.parent_id = li.id
						) AS count,
						(
							SELECT GROUP_CONCAT(id, ',')
							FROM (
								SELECT subchild.id
								FROM comments subchild
								WHERE subchild.parent_id = li.id
								ORDER BY created DESC
								LIMIT 4 -- Limit to 4 subcomments
							)
						) as _path
					FROM list_orders li
					WHERE parent_id = ''
					ORDER BY created DESC
				)
				UNION ALL
				SELECT li.*, 
					c.depth + 1, 
					c.path_index || '.' || (li.list_order + 1),
					(
						SELECT COUNT(*) 
						FROM comments subchild
						WHERE subchild.parent_id = li.id
					) AS count,
					(
						SELECT GROUP_CONCAT(id, ',')
						FROM (
							SELECT subchild.id
							FROM comments subchild
							WHERE subchild.parent_id = li.id
							ORDER BY created DESC
							LIMIT 4 -- Limit to 4 subcomments
						)
					) as _path
				FROM list_orders li INNER JOIN cte c
				ON c.id = li.parent_id 
				WHERE c.depth <= 4 AND c._path LIKE '%' || li.id || '%' -- Limit depth to 4 levels
			)
			SELECT *
			FROM cte
			WHERE CAST(SUBSTR(path_index, 1, 1) AS INTEGER) >= 1 -- Start range (offset)
			AND CAST(SUBSTR(path_index, 1, 1) AS INTEGER) <= 4 -- End range
			ORDER BY path_index
			`).
			Bind(dbx.Params{
				"profile_id": profile.ProfileId,
			}).All(&comments)

		if err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}

		comments = list2tree(comments)

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
		}{
			Username:  username,
			Nickname:  username,
			Status:    "Dreamer, Builder of the new whirled.",
			Following: 69,
			Followers: 420,

			CommentId: "",
			UserId:    profile.UserId,
			ProfileId: profile.ProfileId,
			ParentId:  "",

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
			// e.HttpContext.Response().Header().Set("HX-Redirect", e.HttpContext.Request().Referer())
			return e.HttpContext.String(200, "Successful comment!")
		}, func() error {
			return e.HttpContext.Redirect(302, e.HttpContext.Request().Referer())
		})
	})
}

func list2tree(flatComments []Comment) []Comment {
	commentMap := make(map[string]*Comment)

	// Step 1: Build a map of comments by their Id
	for i := range flatComments {
		commentMap[flatComments[i].CommentId] = &flatComments[i]
	}

	// Step 2: Attach child comments to their parent comments
	for i := range flatComments {
		parent := flatComments[i].ParentId
		if flatComments[i].Count >= 5 {
			commentMap[parent].CountHide = true
		}
		if parent != "" && flatComments[i].Depth < 5 {
			commentMap[parent].Children = append(commentMap[parent].Children, &flatComments[i])
		} else if flatComments[i].Depth >= 5 {
			commentMap[parent].DepthHide = true
		}
	}

	// Step 3: Find root comments (comments with no parent)
	var hierarchy []Comment
	for i := range flatComments {
		if flatComments[i].ParentId == "" {
			hierarchy = append(hierarchy, flatComments[i])
		}
	}
	// log.Printf("%# v", pretty.Formatter(hierarchy))
	return hierarchy
}
