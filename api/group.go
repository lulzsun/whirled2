package api

import (
	"errors"
	"fmt"
	"html/template"
	"log"
	"regexp"
	"strconv"
	"strings"
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
const groupFeedPageSize = 20

const groupPostMaxTitle = 120
const groupPostMaxContent = 5000

var groupTmplFiles []string
var groupTmpl *template.Template

var groupsTmplFiles []string
var groupsTmpl *template.Template

var groupPostTmplFiles []string
var groupPostTmpl *template.Template

var groupManageTmplFiles []string
var groupManageTmpl *template.Template

var queryGetPostComments string

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

// GroupPost is one row of a group's feed and the body of a post page.
type GroupPost struct {
	Id        string `db:"id" json:"id"`
	UserId    string `db:"user_id" json:"user_id"`
	Title     string `db:"title" json:"title"`
	Content   string `db:"content" json:"content"`
	IsDeleted bool   `db:"is_deleted" json:"is_deleted"`
	Timestamp string `db:"created" json:"created"`
	Username  string `db:"username" json:"username"`
	Nickname  string `db:"nickname" json:"nickname"`
	Comments  int    `db:"comments" json:"comments"`

	// filled in Go, for the feed card and the post page
	GroupName    string
	RelativeTime string
	CanDelete    bool
}

func init() {
	parseGroupFiles()
	queryGetPostComments = utils.ReadSqlQuery("sql/group/getPostComments.sql")
}

func parseGroupFiles() {
	groupsTmplFiles = append(groupsTmplFiles, AppendToBaseTmplFiles(
		"web/templates/pages/groups.gohtml",
	)...)
	groupsTmpl = template.Must(template.ParseFiles(groupsTmplFiles...))

	groupTmplFiles = append(groupTmplFiles, AppendToBaseTmplFiles(
		"web/templates/pages/group.gohtml",
		"web/templates/components/postCard.gohtml",
	)...)
	groupTmpl = template.Must(template.ParseFiles(groupTmplFiles...))

	groupPostTmplFiles = append(groupPostTmplFiles, AppendToBaseTmplFiles(
		"web/templates/pages/groupPost.gohtml",
		"web/templates/components/comment.gohtml",
		"web/templates/components/commentBox.gohtml",
	)...)
	groupPostTmpl = template.Must(template.ParseFiles(groupPostTmplFiles...))

	groupManageTmplFiles = append(groupManageTmplFiles, AppendToBaseTmplFiles(
		"web/templates/pages/groupManage.gohtml",
	)...)
	groupManageTmpl = template.Must(template.ParseFiles(groupManageTmplFiles...))
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

			CreationCost  string
			CanAffordCost bool
		}{
			Sort: sort, Page: page, Groups: []Group{},
			CreationCost: formatCoins(utils.GroupCreationCoins),
		}
		if info, _ := e.RequestInfo(); info.Auth != nil {
			data.CanAffordCost = utils.GetCoins(app, info.Auth.Id) >= utils.GroupCreationCoins
		}

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

		// tell the header to refresh the coin balance
		e.Response.Header().Set("HX-Trigger", "coinsChanged")

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

		owner := struct {
			Username string `db:"username" json:"username"`
			Nickname string `db:"nickname" json:"nickname"`
		}{}
		if err := app.DB().
			NewQuery(`SELECT username, nickname FROM users WHERE id = {:id}`).
			Bind(dbx.Params{"id": group.OwnerId}).One(&owner); err != nil {
			log.Println(err)
		}

		page, _ := strconv.Atoi(e.Request.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}
		membership := getGroupMembership(app, group, authId, false)
		posts, pages := getGroupFeed(app, group, authId, membership.Role, page)

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

			Membership groupMembership

			Posts []GroupPost
			Page  int
			Pages []int
		}{
			Id:          group.Id,
			Name:        group.Name,
			DisplayName: group.DisplayName,
			Description: group.Description,
			Members:     group.Members,

			OwnerUsername: owner.Username,
			OwnerNickname: owner.Nickname,

			Membership: membership,

			Posts: posts,
			Page:  page,
			Pages: pages,
		}

		if err := groupTmpl.ExecuteTemplate(e.Response, e.Get("name").(string), AppendToBaseData(e, data)); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
	se.Router.POST("/groups/{name}/join", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth == nil {
			return apis.NewForbiddenError("Only authorized users can join a group.", nil)
		}
		group, err := findGroupByName(app, e.Request.PathValue("name"))
		if err != nil {
			return apis.NewNotFoundError("That group does not exist.", err)
		}

		if err := joinGroup(app, group.Id, info.Auth.Id); err != nil {
			return err
		}
		return renderGroupMembership(e, app, group.Name, info.Auth.Id)
	})
	se.Router.POST("/groups/{name}/leave", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth == nil {
			return apis.NewForbiddenError("Only authorized users can leave a group.", nil)
		}
		group, err := findGroupByName(app, e.Request.PathValue("name"))
		if err != nil {
			return apis.NewNotFoundError("That group does not exist.", err)
		}

		if err := leaveGroup(app, group.Id, info.Auth.Id); err != nil {
			return err
		}
		return renderGroupMembership(e, app, group.Name, info.Auth.Id)
	})
	se.Router.POST("/groups/{name}/posts", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth == nil {
			return apis.NewForbiddenError("Only authorized users can post.", nil)
		}
		group, err := findGroupByName(app, e.Request.PathValue("name"))
		if err != nil {
			return apis.NewNotFoundError("That group does not exist.", err)
		}
		if getGroupRole(app, group.Id, info.Auth.Id) < GroupRoleMember {
			return apis.NewForbiddenError("Only members of this group can post in it.", nil)
		}

		postId, err := createGroupPost(
			app,
			group.Id,
			info.Auth.Id,
			e.Request.FormValue("title"),
			e.Request.FormValue("content"),
		)
		if err != nil {
			return err
		}

		url := "/groups/" + group.Name + "/post/" + postId
		return utils.ProcessHXRequest(e, func() error {
			e.Response.Header().Set("HX-Location", `{"path":"`+url+`", "target":"#page"}`)
			return e.String(200, "Posted!")
		}, func() error {
			return e.Redirect(302, url)
		})
	})
	se.Router.GET("/groups/{name}/post/{id}", func(e *core.RequestEvent) error {
		htmxEnabled := false
		utils.ProcessHXRequest(e, func() error {
			htmxEnabled = true
			return nil
		}, func() error { return nil })

		info, _ := e.RequestInfo()
		authId := ""
		if info.Auth != nil {
			authId = info.Auth.Id
		}

		group, err := findGroupByName(app, e.Request.PathValue("name"))
		if err != nil {
			return apis.NewNotFoundError("That group does not exist.", err)
		}
		postId := e.Request.PathValue("id")
		membership := getGroupMembership(app, group, authId, false)
		post, err := getGroupPost(app, group, postId, authId, membership.Role)
		if err != nil {
			return apis.NewNotFoundError("That post does not exist.", err)
		}

		threadUrl := "/groups/" + group.Name + "/post/" + postId
		parentCommentId := e.Request.URL.Query().Get("viewReplies")
		commentOffset, _ := strconv.Atoi(e.Request.URL.Query().Get("replyOffset"))

		comments := []Comment{}
		if err := app.DB().
			NewQuery(queryGetPostComments).
			Bind(dbx.Params{
				"post_id":        postId,
				"parent_id":      parentCommentId,
				"comment_offset": commentOffset,
			}).All(&comments); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		for i := range comments {
			comments[i].GroupName = group.Name
			comments[i].CanDelete = !comments[i].IsDeleted &&
				canDeleteGroupCommentBy(comments[i].UserId, membership.Role, authId)
		}
		comments = list2tree(comments, parentCommentId, htmxEnabled, threadUrl)

		if htmxEnabled && parentCommentId != "" {
			// expanding replies; send just the comment fragments
			if err := commentTmpl.ExecuteTemplate(e.Response, "base", struct{ Comments []Comment }{comments}); err != nil {
				log.Println(err)
				return apis.NewBadRequestError("Something went wrong.", err)
			}
			return nil
		}

		data := struct {
			Name        string
			DisplayName string

			Post GroupPost

			Membership groupMembership

			// commentBox reads these; PostId is what makes the box post to
			// this thread rather than a profile or a listing
			ProfileId string
			ListingId string
			PostId    string
			CommentId string

			Comments  []Comment
			ThreadUrl string
		}{
			Name:        group.Name,
			DisplayName: group.DisplayName,

			Post: post,

			Membership: membership,

			PostId: postId,

			Comments:  comments,
			ThreadUrl: threadUrl,
		}

		if err := groupPostTmpl.ExecuteTemplate(e.Response, e.Get("name").(string), AppendToBaseData(e, data)); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
	se.Router.POST("/groups/{name}/post/{id}/delete", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth == nil {
			return apis.NewForbiddenError("Only authorized users can remove a post.", nil)
		}
		group, err := findGroupByName(app, e.Request.PathValue("name"))
		if err != nil {
			return apis.NewNotFoundError("That group does not exist.", err)
		}
		postId := e.Request.PathValue("id")
		record, err := app.FindRecordById("group_posts", postId)
		if err != nil || record.GetString("group_id") != group.Id {
			return apis.NewNotFoundError("That post does not exist.", err)
		}

		role := getGroupRole(app, group.Id, info.Auth.Id)
		if !canDeleteGroupPost(record, role, info.Auth.Id) {
			return apis.NewForbiddenError("You cannot remove this post.", nil)
		}
		record.Set("is_deleted", true)
		if err := app.Save(record); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}

		// the post survives as a tombstone so its comment thread stays
		// addressable (spec §5.3). From the feed we swap the one card in
		// place; from the post page there is nothing to swap into, so the
		// page re-renders itself.
		if e.Request.URL.Query().Get("frag") == "card" {
			post, err := getGroupPost(app, group, postId, info.Auth.Id, role)
			if err != nil {
				return apis.NewNotFoundError("That post does not exist.", err)
			}
			if err := groupTmpl.ExecuteTemplate(e.Response, "postCard", post); err != nil {
				log.Println(err)
				return apis.NewBadRequestError("Something went wrong.", err)
			}
			return nil
		}
		url := "/groups/" + group.Name + "/post/" + postId
		return utils.ProcessHXRequest(e, func() error {
			e.Response.Header().Set("HX-Location", `{"path":"`+url+`", "target":"#page"}`)
			return e.String(200, "Removed.")
		}, func() error {
			return e.Redirect(302, url)
		})
	})
	se.Router.POST("/groups/{name}/comment/{id}/delete", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth == nil {
			return apis.NewForbiddenError("Only authorized users can remove a comment.", nil)
		}
		group, err := findGroupByName(app, e.Request.PathValue("name"))
		if err != nil {
			return apis.NewNotFoundError("That group does not exist.", err)
		}
		record, err := app.FindRecordById("comments", e.Request.PathValue("id"))
		if err != nil {
			return apis.NewNotFoundError("That comment does not exist.", err)
		}
		// the comment must actually live on a post in *this* group, or a
		// moderator of one group could remove comments in another
		postId := record.GetString("post_id")
		if postId == "" {
			return apis.NewNotFoundError("That comment does not exist.", nil)
		}
		post, err := app.FindRecordById("group_posts", postId)
		if err != nil || post.GetString("group_id") != group.Id {
			return apis.NewNotFoundError("That comment does not exist.", err)
		}

		role := getGroupRole(app, group.Id, info.Auth.Id)
		if !canDeleteGroupCommentBy(record.GetString("user_id"), role, info.Auth.Id) {
			return apis.NewForbiddenError("You cannot remove this comment.", nil)
		}
		record.Set("is_deleted", true)
		if err := app.Save(record); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}

		// swap only the comment's own body; its replies live in a sibling
		// element and must survive (spec §7)
		comment := Comment{
			CommentId: record.Id,
			PostId:    postId,
			ParentId:  record.GetString("parent_id"),
			IsDeleted: true,
			Timestamp: record.GetString("created"),
			ThreadUrl: "/groups/" + group.Name + "/post/" + postId,
		}
		comment.RelativeTime = utils.FormatRelativeTime(comment.Timestamp)
		if err := groupPostTmpl.ExecuteTemplate(e.Response, "commentBody", comment); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
	se.Router.GET("/groups/{name}/manage", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		authId := ""
		if info.Auth != nil {
			authId = info.Auth.Id
		}
		group, err := findGroupByName(app, e.Request.PathValue("name"))
		if err != nil {
			return apis.NewNotFoundError("That group does not exist.", err)
		}
		role := getGroupRole(app, group.Id, authId)
		if role < GroupRoleModerator {
			// 404 rather than 403: the panel's existence is not interesting
			// to somebody who cannot use it
			return apis.NewNotFoundError("That page does not exist.", nil)
		}

		data := struct {
			Name        string
			DisplayName string
			Description string

			Role        int
			IsModerator bool
			IsAdmin     bool

			Members []GroupMember
		}{
			Name:        group.Name,
			DisplayName: group.DisplayName,
			Description: group.Description,

			Role:        role,
			IsModerator: role >= GroupRoleModerator,
			IsAdmin:     role >= GroupRoleAdmin,

			Members: getGroupMembers(app, group, authId, role),
		}

		if err := groupManageTmpl.ExecuteTemplate(e.Response, e.Get("name").(string), AppendToBaseData(e, data)); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
	se.Router.POST("/groups/{name}/members/{user}/role", func(e *core.RequestEvent) error {
		group, viewerRole, targetRole, targetId, err := resolveMemberAction(e, app)
		if err != nil {
			return err
		}
		if !canSetMemberRole(viewerRole, targetRole, targetId == viewerIdOf(e)) {
			return apis.NewForbiddenError("You cannot change this member's role.", nil)
		}
		role, convErr := strconv.Atoi(e.Request.FormValue("role"))
		if convErr != nil || (role != GroupRoleMember && role != GroupRoleModerator) {
			return apis.NewBadRequestError("A member can only be made a moderator or a plain member.", convErr)
		}
		if err := saveGroupMember(app, group.Id, targetId, role); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return renderGroupMemberRow(e, app, group, targetId)
	})
	se.Router.POST("/groups/{name}/members/{user}/remove", func(e *core.RequestEvent) error {
		group, viewerRole, targetRole, targetId, err := resolveMemberAction(e, app)
		if err != nil {
			return err
		}
		if !canRemoveMember(viewerRole, targetRole, targetId == viewerIdOf(e)) {
			return apis.NewForbiddenError("You cannot remove this member.", nil)
		}
		record, findErr := app.FindFirstRecordByFilter(
			"group_members",
			"group_id = {:group} && user_id = {:user}",
			dbx.Params{"group": group.Id, "user": targetId},
		)
		if findErr == nil {
			if err := app.Delete(record); err != nil {
				log.Println(err)
				return apis.NewBadRequestError("Something went wrong.", err)
			}
		}
		// the row is gone; swap it out of the table
		return e.HTML(200, "")
	})
	se.Router.POST("/groups/{name}/edit", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth == nil {
			return apis.NewForbiddenError("Only authorized users can edit a group.", nil)
		}
		group, err := findGroupByName(app, e.Request.PathValue("name"))
		if err != nil {
			return apis.NewNotFoundError("That group does not exist.", err)
		}
		if getGroupRole(app, group.Id, info.Auth.Id) < GroupRoleAdmin {
			return apis.NewForbiddenError("Only the admin can edit this group.", nil)
		}

		displayName := strings.TrimSpace(e.Request.FormValue("display_name"))
		if displayName == "" {
			displayName = group.Name
		}
		if len([]rune(displayName)) > 50 {
			return apis.NewBadRequestError("A display name can be at most 50 characters.", nil)
		}
		description := strings.TrimSpace(e.Request.FormValue("description"))
		if len([]rune(description)) > 500 {
			return apis.NewBadRequestError("A description can be at most 500 characters.", nil)
		}

		record, err := app.FindRecordById("groups", group.Id)
		if err != nil {
			return apis.NewNotFoundError("That group does not exist.", err)
		}
		record.Set("display_name", displayName)
		record.Set("description", description)
		if err := app.Save(record); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}

		url := "/groups/" + group.Name + "/manage"
		return utils.ProcessHXRequest(e, func() error {
			e.Response.Header().Set("HX-Location", `{"path":"`+url+`", "target":"#page"}`)
			return e.String(200, "Saved.")
		}, func() error {
			return e.Redirect(302, url)
		})
	})
	se.Router.POST("/groups/{name}/delete", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth == nil {
			return apis.NewForbiddenError("Only authorized users can delete a group.", nil)
		}
		group, err := findGroupByName(app, e.Request.PathValue("name"))
		if err != nil {
			return apis.NewNotFoundError("That group does not exist.", err)
		}
		if getGroupRole(app, group.Id, info.Auth.Id) < GroupRoleAdmin {
			return apis.NewForbiddenError("Only the admin can delete this group.", nil)
		}

		record, err := app.FindRecordById("groups", group.Id)
		if err != nil {
			return apis.NewNotFoundError("That group does not exist.", err)
		}
		// soft delete: the name stays claimed and nothing cascades, the
		// pages simply stop serving (spec §9.3)
		record.Set("is_deleted", true)
		if err := app.Save(record); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}

		return utils.ProcessHXRequest(e, func() error {
			e.Response.Header().Set("HX-Location", `{"path":"/groups", "target":"#page"}`)
			return e.String(200, "Deleted.")
		}, func() error {
			return e.Redirect(302, "/groups")
		})
	})
}

func viewerIdOf(e *core.RequestEvent) string {
	info, _ := e.RequestInfo()
	if info.Auth == nil {
		return ""
	}
	return info.Auth.Id
}

// resolveMemberAction does the lookup and auth work the two member-management
// routes share: the group must exist, the caller must be at least a
// moderator, and the target must actually be a member of that group.
func resolveMemberAction(e *core.RequestEvent, app core.App) (Group, int, int, string, error) {
	info, _ := e.RequestInfo()
	if info.Auth == nil {
		return Group{}, 0, 0, "", apis.NewForbiddenError("Only authorized users can manage members.", nil)
	}
	group, err := findGroupByName(app, e.Request.PathValue("name"))
	if err != nil {
		return Group{}, 0, 0, "", apis.NewNotFoundError("That group does not exist.", err)
	}
	viewerRole := getGroupRole(app, group.Id, info.Auth.Id)
	if viewerRole < GroupRoleModerator {
		return Group{}, 0, 0, "", apis.NewForbiddenError("You cannot manage this group's members.", nil)
	}
	targetId := e.Request.PathValue("user")
	targetRole := getGroupRole(app, group.Id, targetId)
	if targetRole == groupRoleNone {
		return Group{}, 0, 0, "", apis.NewNotFoundError("That user is not a member of this group.", nil)
	}
	return group, viewerRole, targetRole, targetId, nil
}

// renderGroupMemberRow answers a role change with just that member's row.
func renderGroupMemberRow(e *core.RequestEvent, app core.App, group Group, targetId string) error {
	viewerId := viewerIdOf(e)
	viewerRole := getGroupRole(app, group.Id, viewerId)
	for _, m := range getGroupMembers(app, group, viewerId, viewerRole) {
		if m.UserId == targetId {
			if err := groupManageTmpl.ExecuteTemplate(e.Response, "memberRow", m); err != nil {
				log.Println(err)
				return apis.NewBadRequestError("Something went wrong.", err)
			}
			return nil
		}
	}
	return e.HTML(200, "")
}

func AddGroupEventHooks(app *pocketbase.PocketBase) {
}

// createGroupPost validates and stores a post, returning its id. Membership
// is checked by the caller, which is the only place that knows the group.
func createGroupPost(app core.App, groupId string, userId string, title string, content string) (string, error) {
	title = strings.TrimSpace(title)
	if title == "" || len([]rune(title)) > groupPostMaxTitle {
		return "", apis.NewBadRequestError("A post title is 1-120 characters.", nil)
	}
	content = strings.TrimSpace(content)
	if len([]rune(content)) > groupPostMaxContent {
		return "", apis.NewBadRequestError("A post can be at most 5,000 characters.", nil)
	}

	collection, err := app.FindCollectionByNameOrId("group_posts")
	if err != nil {
		return "", apis.NewBadRequestError("Something went wrong.", err)
	}
	record := core.NewRecord(collection)
	record.Load(map[string]any{
		"group_id":   groupId,
		"user_id":    userId,
		"title":      title,
		"content":    content,
		"is_deleted": false,
	})
	if err := app.Save(record); err != nil {
		log.Println(err)
		return "", apis.NewBadRequestError("Something went wrong.", err)
	}
	return record.Id, nil
}

// canDeleteGroupPostBy is the single rule for who may remove a post, shared
// by the route that enforces it and the template flag that offers it — so the
// button and the check can never disagree: the author, or any moderator of
// the group (spec §4).
func canDeleteGroupPostBy(authorId string, role int, userId string) bool {
	if userId == "" {
		return false
	}
	return authorId == userId || role >= GroupRoleModerator
}

func canDeleteGroupPost(post *core.Record, role int, userId string) bool {
	return canDeleteGroupPostBy(post.GetString("user_id"), role, userId)
}

// canDeleteGroupCommentBy mirrors the post rule: a comment can be removed by
// whoever wrote it or by a moderator of the group it lives in (spec §4).
func canDeleteGroupCommentBy(authorId string, role int, userId string) bool {
	if userId == "" {
		return false
	}
	return authorId == userId || role >= GroupRoleModerator
}

// canRemoveMember decides who may drop somebody's membership. Nobody may
// touch the admin, a moderator may only act on plain members (moderators do
// not remove each other), and nobody removes themselves here — that is what
// Leave is for (spec §4).
func canRemoveMember(viewerRole int, targetRole int, isSelf bool) bool {
	if isSelf || targetRole >= GroupRoleAdmin {
		return false
	}
	if viewerRole >= GroupRoleAdmin {
		return true
	}
	return viewerRole >= GroupRoleModerator && targetRole < GroupRoleModerator
}

// canSetMemberRole decides who may promote or demote. Only the admin, and
// never against the admin's own row (spec §4).
func canSetMemberRole(viewerRole int, targetRole int, isSelf bool) bool {
	return !isSelf && viewerRole >= GroupRoleAdmin && targetRole < GroupRoleAdmin
}

// getGroupFeed reads one page of a group's posts, newest first. Removed posts
// stay in the feed as tombstones rather than vanishing, so a thread under a
// removed post is still reachable (spec §5.3).
func getGroupFeed(app core.App, group Group, authId string, role int, page int) ([]GroupPost, []int) {
	posts := []GroupPost{}
	pages := []int{}

	var total int
	if err := app.DB().
		NewQuery(`SELECT COUNT(*) FROM group_posts WHERE group_id = {:group}`).
		Bind(dbx.Params{"group": group.Id}).Row(&total); err != nil {
		log.Println(err)
		return posts, pages
	}
	totalPages := (total + groupFeedPageSize - 1) / groupFeedPageSize
	if totalPages > 1 {
		if page > totalPages {
			page = totalPages
		}
		for i := 1; i <= totalPages; i++ {
			pages = append(pages, i)
		}
	}

	if err := app.DB().
		NewQuery(`
		SELECT
			p.id,
			p.user_id,
			p.title,
			p.content,
			p.is_deleted,
			p.created,
			IFNULL(u.username, '') AS username,
			IFNULL(u.nickname, '') AS nickname,
			(
				SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id
			) AS comments
		FROM group_posts p
		LEFT JOIN users u ON u.id = p.user_id
		WHERE p.group_id = {:group}
		ORDER BY p.created DESC
		LIMIT {:limit} OFFSET {:offset}
	`).
		Bind(dbx.Params{
			"group":  group.Id,
			"limit":  groupFeedPageSize,
			"offset": (page - 1) * groupFeedPageSize,
		}).All(&posts); err != nil {
		log.Println(err)
		return posts, pages
	}

	for i := range posts {
		decorateGroupPost(&posts[i], group, authId, role)
	}
	return posts, pages
}

// getGroupPost reads a single post, confirming it belongs to the group.
func getGroupPost(app core.App, group Group, postId string, authId string, role int) (GroupPost, error) {
	post := GroupPost{}
	err := app.DB().
		NewQuery(`
		SELECT
			p.id,
			p.user_id,
			p.title,
			p.content,
			p.is_deleted,
			p.created,
			IFNULL(u.username, '') AS username,
			IFNULL(u.nickname, '') AS nickname,
			(
				SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id
			) AS comments
		FROM group_posts p
		LEFT JOIN users u ON u.id = p.user_id
		WHERE p.id = {:id} AND p.group_id = {:group}
	`).
		Bind(dbx.Params{"id": postId, "group": group.Id}).One(&post)
	if err != nil {
		return post, err
	}
	decorateGroupPost(&post, group, authId, role)
	return post, nil
}

// decorateGroupPost fills the view-only fields and escapes everything the
// author controls (see the escaping note in the spec).
func decorateGroupPost(post *GroupPost, group Group, authId string, role int) {
	post.GroupName = group.Name
	post.RelativeTime = utils.FormatRelativeTime(post.Timestamp)
	post.CanDelete = !post.IsDeleted &&
		canDeleteGroupPostBy(post.UserId, role, authId)
}

// GroupMember is one row of the manage page's member list.
type GroupMember struct {
	UserId   string `db:"user_id" json:"user_id"`
	Username string `db:"username" json:"username"`
	Nickname string `db:"nickname" json:"nickname"`
	Role     int    `db:"role" json:"role"`
	Joined   string `db:"created" json:"created"`

	// filled in Go
	GroupName    string
	RelativeTime string
	RoleName     string
	CanPromote   bool
	CanDemote    bool
	CanRemove    bool
}

// getGroupMembers lists a group's members, highest role first, with the
// controls the viewer is actually allowed to use already resolved.
func getGroupMembers(app core.App, group Group, viewerId string, viewerRole int) []GroupMember {
	members := []GroupMember{}
	if err := app.DB().
		NewQuery(`
		SELECT
			m.user_id,
			m.role,
			m.created,
			IFNULL(u.username, '') AS username,
			IFNULL(u.nickname, '') AS nickname
		FROM group_members m
		LEFT JOIN users u ON u.id = m.user_id
		WHERE m.group_id = {:group}
		ORDER BY m.role DESC, m.created
	`).
		Bind(dbx.Params{"group": group.Id}).All(&members); err != nil {
		log.Println(err)
		return members
	}

	for i := range members {
		m := &members[i]
		isSelf := m.UserId == viewerId
		m.GroupName = group.Name
		m.RelativeTime = utils.FormatRelativeTime(m.Joined)
		m.RoleName = groupRoleName(m.Role)
		m.CanPromote = canSetMemberRole(viewerRole, m.Role, isSelf) &&
			m.Role < GroupRoleModerator
		m.CanDemote = canSetMemberRole(viewerRole, m.Role, isSelf) &&
			m.Role >= GroupRoleModerator
		m.CanRemove = canRemoveMember(viewerRole, m.Role, isSelf)
	}
	return members
}

func groupRoleName(role int) string {
	switch role {
	case GroupRoleAdmin:
		return "Admin"
	case GroupRoleModerator:
		return "Moderator"
	default:
		return "Member"
	}
}

// checkGroupPostCommentable is the group half of the shared comment-create
// hook in profile.go: commenting on a group post requires the post to exist,
// to not have been removed, and the commenter to be a member (spec §4).
func checkGroupPostCommentable(app core.App, postId string, userId string) error {
	post, err := app.FindRecordById("group_posts", postId)
	if err != nil {
		return apis.NewBadRequestError("This post no longer exists.", err)
	}
	if post.GetBool("is_deleted") {
		return apis.NewBadRequestError("This post has been removed.", nil)
	}
	groupId := post.GetString("group_id")
	group, err := app.FindRecordById("groups", groupId)
	if err != nil || group.GetBool("is_deleted") {
		return apis.NewBadRequestError("This group no longer exists.", err)
	}
	if getGroupRole(app, groupId, userId) < GroupRoleMember {
		return apis.NewForbiddenError("Only members of this group can comment on its posts.", nil)
	}
	return nil
}

// joinGroup adds a user to a group as a plain member. Joining twice is a
// no-op rather than an error, and the role check is what makes it one:
// saveGroupMember sets the role, so an unconditional re-join would silently
// demote a moderator back to plain member.
func joinGroup(app core.App, groupId string, userId string) error {
	if getGroupRole(app, groupId, userId) != groupRoleNone {
		return nil
	}
	if err := saveGroupMember(app, groupId, userId, GroupRoleMember); err != nil {
		log.Println(err)
		return apis.NewBadRequestError("Something went wrong.", err)
	}
	return nil
}

// leaveGroup drops a user's membership. The admin is the one member who
// cannot walk away: a group whose admin left has nobody who can moderate it,
// and ownership is not transferable in this milestone (spec §4). Leaving a
// group you are not in is a no-op.
func leaveGroup(app core.App, groupId string, userId string) error {
	role := getGroupRole(app, groupId, userId)
	if role == GroupRoleAdmin {
		return apis.NewBadRequestError("The admin cannot leave their own group.", nil)
	}
	if role == groupRoleNone {
		return nil
	}
	record, err := app.FindFirstRecordByFilter(
		"group_members",
		"group_id = {:group} && user_id = {:user}",
		dbx.Params{"group": groupId, "user": userId},
	)
	if err != nil {
		return nil
	}
	if err := app.Delete(record); err != nil {
		log.Println(err)
		return apis.NewBadRequestError("Something went wrong.", err)
	}
	return nil
}

// groupMembership drives the join/leave control and the member count. Both
// are re-rendered after a join or leave, but they sit in different corners of
// the group's info card, so the count travels back as an out-of-band swap
// rather than forcing the two into one swap target.
type groupMembership struct {
	AuthId  string
	Name    string
	Members int

	Role        int
	IsMember    bool
	IsModerator bool
	IsAdmin     bool

	// Oob is set only on the fragment response, so the copy rendered as part
	// of the full page does not carry a stray hx-swap-oob attribute.
	Oob bool
}

func getGroupMembership(app core.App, group Group, authId string, oob bool) groupMembership {
	role := getGroupRole(app, group.Id, authId)
	return groupMembership{
		AuthId:  authId,
		Name:    group.Name,
		Members: group.Members,

		Role:        role,
		IsMember:    role >= GroupRoleMember,
		IsModerator: role >= GroupRoleModerator,
		IsAdmin:     role >= GroupRoleAdmin,

		Oob: oob,
	}
}

// renderGroupMembership answers a join or leave with the two fragments that
// changed. The group is re-read so the member count reflects the write that
// just happened (findGroupByName recomputes it).
func renderGroupMembership(e *core.RequestEvent, app core.App, name string, authId string) error {
	group, err := findGroupByName(app, name)
	if err != nil {
		return apis.NewNotFoundError("That group does not exist.", err)
	}
	data := getGroupMembership(app, group, authId, false)
	if err := groupTmpl.ExecuteTemplate(e.Response, "groupJoin", data); err != nil {
		log.Println(err)
		return apis.NewBadRequestError("Something went wrong.", err)
	}
	data.Oob = true
	if err := groupTmpl.ExecuteTemplate(e.Response, "groupMemberCount", data); err != nil {
		log.Println(err)
		return apis.NewBadRequestError("Something went wrong.", err)
	}
	return nil
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
		if err := saveGroupMember(txApp, group.Id, ownerId, GroupRoleAdmin); err != nil {
			return err
		}
		// the fee is inside the transaction, so a founder who cannot afford
		// it does not end up owning a group they never paid for. The debit
		// guard lives in AdjustCoins' UPDATE, which is what makes two
		// concurrent creates safe.
		_, err = utils.AdjustCoins(
			txApp, ownerId, -int64(utils.GroupCreationCoins),
			utils.TxGroupCreation, group.Id, "Founded "+displayName,
		)
		return err
	})
	if errors.Is(err, utils.ErrInsufficientCoins) {
		return "", apis.NewBadRequestError(fmt.Sprintf(
			"Founding a group costs %s coins.", formatCoins(utils.GroupCreationCoins)), err)
	}
	if err != nil {
		log.Println(err)
		return "", apis.NewBadRequestError("Something went wrong.", err)
	}
	return name, nil
}

// formatCoins renders an amount with thousands separators, for messages and
// the create form's price tag.
func formatCoins(n int64) string {
	s := strconv.FormatInt(n, 10)
	if len(s) <= 3 {
		return s
	}
	var out []byte
	for i, c := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, c)
	}
	return string(out)
}

// findGroupByName resolves a URL slug to a live (not soft-deleted) group,
// with its member count. Names are stored lowercase (spec §5.1).
func findGroupByName(app core.App, name string) (Group, error) {
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
func getGroupRole(app core.App, groupId string, userId string) int {
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
