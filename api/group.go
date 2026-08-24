package api

import (
	"log"
	"regexp"
	"strconv"
	"strings"
	"text/template"
	"whirled2/utils"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// Groups: user-created subreddit-alikes. Spec: docs/specs/groups-page.md

// Membership roles. The values are ordered so a permission check is a
// comparison ("at least moderator" is role >= GroupRoleModerator), and they
// are persisted, so never renumber them. See spec §4.
const (
	GroupRoleMember = iota
	GroupRoleModerator
	GroupRoleAdmin
)

// groupRoleNone is what getGroupRole reports for a user who is not a member;
// it is never stored.
const groupRoleNone = -1

const groupPageSize = 24

var groupTmplFiles []string
var groupTmpl *template.Template

var groupsTmplFiles []string
var groupsTmpl *template.Template

// A group name is its URL slug, so it is kept to the same shape as a
// username. Stored lowercase, which is what makes the unique index
// case-insensitive (spec §5.1).
var groupNamePattern = regexp.MustCompile(`^[a-z0-9_]{3,30}$`)

var groupSorts = map[string]string{
	"new":     "g.created DESC",
	"members": "members DESC, g.created DESC",
}

// Group is one row of the /groups list and the header of a group page.
type Group struct {
	Id          string `db:"id" json:"id"`
	OwnerId     string `db:"owner_id" json:"owner_id"`
	Name        string `db:"name" json:"name"`
	DisplayName string `db:"display_name" json:"display_name"`
	Description string `db:"description" json:"description"`
	Members     int    `db:"members" json:"members"`
}

func init() {
	parseGroupFiles()
}

func parseGroupFiles() {
	groupsTmplFiles = append(groupsTmplFiles, AppendToBaseTmplFiles(
		"web/templates/pages/groups.gohtml",
	)...)
	groupsTmpl = template.Must(template.ParseFiles(groupsTmplFiles...))

	groupTmplFiles = append(groupTmplFiles, AppendToBaseTmplFiles(
		"web/templates/pages/group.gohtml",
	)...)
	groupTmpl = template.Must(template.ParseFiles(groupTmplFiles...))
}

func AddGroupRoutes(se *core.ServeEvent, app *pocketbase.PocketBase) {
	se.Router.GET("/group", func(e *core.RequestEvent) error {
		e.Redirect(302, "/groups")
		return nil
	})
	se.Router.GET("/groups", func(e *core.RequestEvent) error {
		sort := e.Request.URL.Query().Get("sort")
		orderBy, ok := groupSorts[sort]
		if !ok {
			sort, orderBy = "new", groupSorts["new"]
		}

		page, _ := strconv.Atoi(e.Request.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}

		data := struct {
			Sort   string
			Page   int
			Pages  []int
			Groups []Group
		}{Sort: sort, Page: page, Groups: []Group{}}

		var total int
		err := app.DB().
			NewQuery(`SELECT COUNT(*) FROM groups g WHERE g.is_deleted = FALSE`).
			Row(&total)
		if err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		totalPages := (total + groupPageSize - 1) / groupPageSize
		if totalPages > 1 {
			if page > totalPages {
				page = totalPages
				data.Page = page
			}
			for i := 1; i <= totalPages; i++ {
				data.Pages = append(data.Pages, i)
			}
		}

		groups := []Group{}
		err = app.DB().
			NewQuery(`
			SELECT
				g.id,
				g.owner_id,
				g.name,
				g.display_name,
				g.description,
				(
					SELECT COUNT(*) FROM group_members m
					WHERE m.group_id = g.id
				) AS members
			FROM groups g
			WHERE g.is_deleted = FALSE
			ORDER BY ` + orderBy + `
			LIMIT {:limit} OFFSET {:offset}
		`).
			Bind(dbx.Params{
				"limit":  groupPageSize,
				"offset": (page - 1) * groupPageSize,
			}).All(&groups)
		if err != nil {
			log.Println(err)
		} else {
			for i := range groups {
				groups[i].DisplayName = escapeGroupText(groups[i].DisplayName)
				groups[i].Description = escapeGroupText(groups[i].Description)
			}
			data.Groups = groups
		}

		if err := groupsTmpl.ExecuteTemplate(e.Response, e.Get("name").(string), AppendToBaseData(e, data)); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
	se.Router.POST("/groups", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth == nil {
			return apis.NewForbiddenError("Only authorized users can create a group.", nil)
		}

		name, err := createGroup(
			app,
			info.Auth.Id,
			e.Request.FormValue("name"),
			e.Request.FormValue("display_name"),
			e.Request.FormValue("description"),
		)
		if err != nil {
			return err
		}

		return utils.ProcessHXRequest(e, func() error {
			e.Response.Header().Set("HX-Location", `{"path":"/groups/`+name+`", "target":"#page"}`)
			return e.String(200, "Group created!")
		}, func() error {
			return e.Redirect(302, "/groups/"+name)
		})
	})
	se.Router.GET("/groups/{name}", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		authId := ""
		if info.Auth != nil {
			authId = info.Auth.Id
		}

		group, err := findGroupByName(app, e.Request.PathValue("name"))
		if err != nil {
			return apis.NewNotFoundError("That group does not exist.", err)
		}

		role := groupRoleNone
		if authId != "" {
			role = getGroupRole(app, group.Id, authId)
		}

		owner := struct {
			Username string `db:"username" json:"username"`
			Nickname string `db:"nickname" json:"nickname"`
		}{}
		if err := app.DB().
			NewQuery(`SELECT username, nickname FROM users WHERE id = {:id}`).
			Bind(dbx.Params{"id": group.OwnerId}).One(&owner); err != nil {
			log.Println(err)
		}

		// fields are flattened rather than embedded: AppendToBaseData merges
		// through utils.StructToMap, which keys by field name and does not
		// promote an embedded struct's fields
		data := struct {
			Id          string
			Name        string
			DisplayName string
			Description string
			Members     int

			OwnerUsername string
			OwnerNickname string

			Role        int
			IsMember    bool
			IsModerator bool
			IsAdmin     bool
		}{
			Id:          group.Id,
			Name:        group.Name,
			DisplayName: escapeGroupText(group.DisplayName),
			Description: escapeGroupText(group.Description),
			Members:     group.Members,

			OwnerUsername: owner.Username,
			OwnerNickname: escapeGroupText(owner.Nickname),

			Role:        role,
			IsMember:    role >= GroupRoleMember,
			IsModerator: role >= GroupRoleModerator,
			IsAdmin:     role >= GroupRoleAdmin,
		}

		if err := groupTmpl.ExecuteTemplate(e.Response, e.Get("name").(string), AppendToBaseData(e, data)); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
}

func AddGroupEventHooks(app *pocketbase.PocketBase) {
}

// createGroup validates a proposed group and creates it along with the
// creator's admin membership, returning the stored (lowercased) name. The two
// records are one transaction on purpose: a group whose creator is not its
// admin has nobody who can moderate it (spec §4, §6).
func createGroup(app core.App, ownerId string, name string, displayName string, description string) (string, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	if !groupNamePattern.MatchString(name) {
		return "", apis.NewBadRequestError("A group name is 3-30 characters: letters, numbers, and underscores.", nil)
	}
	displayName = strings.TrimSpace(displayName)
	if displayName == "" {
		displayName = name
	}
	if len([]rune(displayName)) > 50 {
		return "", apis.NewBadRequestError("A display name can be at most 50 characters.", nil)
	}
	description = strings.TrimSpace(description)
	if len([]rune(description)) > 500 {
		return "", apis.NewBadRequestError("A description can be at most 500 characters.", nil)
	}

	if _, err := app.FindFirstRecordByFilter(
		"groups",
		"name = {:name}",
		dbx.Params{"name": name},
	); err == nil {
		return "", apis.NewBadRequestError("That group name is already taken.", nil)
	}

	err := app.RunInTransaction(func(txApp core.App) error {
		collection, err := txApp.FindCollectionByNameOrId("groups")
		if err != nil {
			return err
		}
		group := core.NewRecord(collection)
		group.Load(map[string]any{
			"owner_id":     ownerId,
			"name":         name,
			"display_name": displayName,
			"description":  description,
			"privacy":      0,
			"is_deleted":   false,
		})
		if err := txApp.Save(group); err != nil {
			return err
		}
		return saveGroupMember(txApp, group.Id, ownerId, GroupRoleAdmin)
	})
	if err != nil {
		log.Println(err)
		return "", apis.NewBadRequestError("Something went wrong.", err)
	}
	return name, nil
}

// escapeGroupText makes user-supplied text safe to interpolate into a page.
// The page templates are parsed with text/template (see api/base.go), which
// does no contextual escaping of its own, so it has to happen here. Drop this
// if the app ever moves to html/template, or values will double-escape.
func escapeGroupText(s string) string {
	return template.HTMLEscapeString(s)
}

// findGroupByName resolves a URL slug to a live (not soft-deleted) group,
// with its member count. Names are stored lowercase (spec §5.1).
func findGroupByName(app *pocketbase.PocketBase, name string) (Group, error) {
	group := Group{}
	err := app.DB().
		NewQuery(`
		SELECT
			g.id,
			g.owner_id,
			g.name,
			g.display_name,
			g.description,
			(
				SELECT COUNT(*) FROM group_members m
				WHERE m.group_id = g.id
			) AS members
		FROM groups g
		WHERE g.name = {:name} AND g.is_deleted = FALSE
	`).
		Bind(dbx.Params{"name": strings.ToLower(name)}).One(&group)
	return group, err
}

// getGroupRole reports a user's role in a group, or groupRoleNone if they are
// not a member. Every role-gated route goes through this and compares against
// the rank it requires (spec §6).
func getGroupRole(app *pocketbase.PocketBase, groupId string, userId string) int {
	if groupId == "" || userId == "" {
		return groupRoleNone
	}
	var role int
	err := app.DB().
		NewQuery(`
		SELECT role FROM group_members
		WHERE group_id = {:group} AND user_id = {:user}
	`).
		Bind(dbx.Params{"group": groupId, "user": userId}).Row(&role)
	if err != nil {
		return groupRoleNone
	}
	return role
}

// saveGroupMember upserts a membership row at the given role.
func saveGroupMember(app core.App, groupId string, userId string, role int) error {
	record, err := app.FindFirstRecordByFilter(
		"group_members",
		"group_id = {:group} && user_id = {:user}",
		dbx.Params{"group": groupId, "user": userId},
	)
	if err != nil {
		collection, err := app.FindCollectionByNameOrId("group_members")
		if err != nil {
			return err
		}
		record = core.NewRecord(collection)
		record.Load(map[string]any{
			"group_id": groupId,
			"user_id":  userId,
		})
	}
	record.Set("role", role)
	return app.Save(record)
}
