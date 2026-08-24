package api

import (
	"errors"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"text/template"
	"whirled2/utils"
	buf "whirled2/utils/proto"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

const shopPageSize = 24
const shopMaxTagsPerListing = 24

var shopTmplFiles []string
var shopTmpl *template.Template

var shopListingTmplFiles []string
var shopListingTmpl *template.Template

var queryGetListingComments string

var shopTagPattern = regexp.MustCompile(`^[a-z0-9-]{2,24}$`)

type ShopListing struct {
	Id        string `db:"id" json:"id"`
	ItemId    string `db:"item_id" json:"item_id"`
	Name      string `db:"name" json:"name"`
	Thumbnail string `db:"thumb" json:"thumb"`
	Price     int64  `db:"price" json:"price"`
	Purchases int64  `db:"purchases" json:"purchases"`
	Username  string `db:"username" json:"username"`
	Nickname  string `db:"nickname" json:"nickname"`
	Owned     bool   `db:"owned" json:"owned"`

	// filled in Go, for the buy-button template fragment
	Category string
	AuthId   string
}

// shop categories mapped to their buf.Type discriminator; categories without
// a type yet (backdrops, games) render an empty shop page
var shopCategories = map[string]int{
	"avatars":   int(buf.Type_Avatar),
	"furniture": int(buf.Type_Furniture),
	"backdrops": 0,
	"games":     0,
}

var shopSorts = map[string]string{
	"new":     "l.created DESC",
	"popular": "l.purchases DESC, l.created DESC",
	"price":   "l.price ASC, l.created DESC",
}

func init() {
	parseShopFiles()
	queryGetListingComments = utils.ReadSqlQuery("sql/shop/getListingComments.sql")
}

func parseShopFiles() {
	shopTmplFiles = append(shopTmplFiles, AppendToBaseTmplFiles(
		"web/templates/pages/shop.gohtml",
	)...)
	shopTmpl = template.Must(template.ParseFiles(shopTmplFiles...))

	shopListingTmplFiles = append(append(shopListingTmplFiles, AppendToBaseTmplFiles(
		"web/templates/pages/shopListing.gohtml",
	)...),
		"web/templates/components/comment.gohtml",
		"web/templates/components/commentBox.gohtml",
	)
	shopListingTmpl = template.Must(template.ParseFiles(shopListingTmplFiles...))
}

func AddShopRoutes(se *core.ServeEvent, app *pocketbase.PocketBase) {
	se.Router.GET("/shop", func(e *core.RequestEvent) error {
		e.Redirect(302, "/shop/avatars")
		return nil
	})
	se.Router.GET("/shop/{category}", func(e *core.RequestEvent) error {
		category := e.Request.PathValue("category")
		itemType, ok := shopCategories[category]
		if !ok {
			e.Redirect(302, "/shop/avatars")
			return nil
		}

		sort := e.Request.URL.Query().Get("sort")
		orderBy, ok := shopSorts[sort]
		if !ok {
			sort, orderBy = "new", shopSorts["new"]
		}

		page, _ := strconv.Atoi(e.Request.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}

		info, _ := e.RequestInfo()
		authId := ""
		if info.Auth != nil {
			authId = info.Auth.Id
		}

		data := struct {
			Category string
			Sort     string
			Page     int
			Pages    []int
			Items    []ShopListing
			Featured []ShopListing
		}{Category: category, Sort: sort, Page: page}

		if itemType != 0 {
			// category and collection name are deliberately the same string
			baseQuery := `
				FROM listings l
				INNER JOIN ` + category + ` i ON i.id = l.item_id
				LEFT JOIN users u ON u.id = l.creator_id
				WHERE l.is_listed = TRUE AND l.type = {:type}
			`

			var total int
			err := app.DB().
				NewQuery(`SELECT COUNT(*) ` + baseQuery).
				Bind(dbx.Params{"type": itemType}).Row(&total)
			if err != nil {
				log.Println(err)
				return apis.NewBadRequestError("Something went wrong.", err)
			}
			totalPages := (total + shopPageSize - 1) / shopPageSize
			if totalPages > 1 {
				if page > totalPages {
					page = totalPages
					data.Page = page
				}
				for i := 1; i <= totalPages; i++ {
					data.Pages = append(data.Pages, i)
				}
			}

			selectColumns := `
				SELECT
					l.id,
					l.item_id,
					l.price,
					l.purchases,
					i.name,
					i.thumb,
					IFNULL(u.username, '') AS username,
					IFNULL(u.nickname, '') AS nickname,
					EXISTS(
						SELECT 1 FROM stuff s
						WHERE s.owner_id = {:auth} AND s.stuff_id = l.item_id
					) AS owned
			`

			items := []ShopListing{}
			err = app.DB().
				NewQuery(selectColumns + baseQuery + `
				ORDER BY ` + orderBy + `
				LIMIT {:limit} OFFSET {:offset}
			`).
				Bind(dbx.Params{
					"type":   itemType,
					"auth":   authId,
					"limit":  shopPageSize,
					"offset": (page - 1) * shopPageSize,
				}).All(&items)
			if err != nil {
				log.Println(err)
			} else {
				for i := range items {
					items[i].Category = category
					items[i].AuthId = authId
				}
				data.Items = items
			}

			featured := []ShopListing{}
			err = app.DB().
				NewQuery(selectColumns + baseQuery + `
				AND l.is_featured = TRUE
				ORDER BY l.created DESC
				LIMIT 4
			`).
				Bind(dbx.Params{"type": itemType, "auth": authId}).All(&featured)
			if err != nil {
				log.Println(err)
			} else {
				for i := range featured {
					featured[i].Category = category
					featured[i].AuthId = authId
				}
				data.Featured = featured
			}
		}

		if err := shopTmpl.ExecuteTemplate(e.Response, e.Get("name").(string), AppendToBaseData(e, data)); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
	se.Router.GET("/shop/{category}/{id}", func(e *core.RequestEvent) error {
		htmxEnabled := false
		utils.ProcessHXRequest(e, func() error {
			htmxEnabled = true
			return nil
		}, func() error { return nil })

		category := e.Request.PathValue("category")
		listingId := e.Request.PathValue("id")
		itemType, ok := shopCategories[category]
		if !ok || itemType == 0 {
			e.Redirect(302, "/shop/avatars")
			return nil
		}

		info, _ := e.RequestInfo()
		authId := ""
		if info.Auth != nil {
			authId = info.Auth.Id
		}

		listing := struct {
			ItemId      string  `db:"item_id" json:"item_id"`
			Name        string  `db:"name" json:"name"`
			Description string  `db:"description" json:"description"`
			File        string  `db:"file" json:"file"`
			Scale       float64 `db:"scale" json:"scale"`
			Price       int64   `db:"price" json:"price"`
			Username    string  `db:"username" json:"username"`
			Nickname    string  `db:"nickname" json:"nickname"`
			Owned       bool    `db:"owned" json:"owned"`
		}{}
		err := app.DB().
			NewQuery(`
			SELECT
				l.item_id,
				l.price,
				i.name,
				i.description,
				i.file,
				i.scale,
				IFNULL(u.username, '') AS username,
				IFNULL(u.nickname, '') AS nickname,
				EXISTS(
					SELECT 1 FROM stuff s
					WHERE s.owner_id = {:auth} AND s.stuff_id = l.item_id
				) AS owned
			FROM listings l
			INNER JOIN ` + category + ` i ON i.id = l.item_id
			LEFT JOIN users u ON u.id = l.creator_id
			WHERE l.id = {:id} AND l.is_listed = TRUE AND l.type = {:type}
		`).
			Bind(dbx.Params{"id": listingId, "type": itemType, "auth": authId}).One(&listing)
		if err != nil {
			log.Println(err)
			e.Redirect(302, "/shop/"+category)
			return nil
		}
		if listing.Nickname == "" {
			listing.Nickname = "Admin"
		}

		threadUrl := "/shop/" + category + "/" + listingId
		parentCommentId := e.Request.URL.Query().Get("viewReplies")
		commentOffset, _ := strconv.Atoi(e.Request.URL.Query().Get("replyOffset"))

		comments := []Comment{}
		err = app.DB().
			NewQuery(queryGetListingComments).
			Bind(dbx.Params{
				"listing_id":     listingId,
				"parent_id":      parentCommentId,
				"comment_offset": commentOffset,
			}).All(&comments)
		if err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		comments = list2tree(comments, parentCommentId, htmxEnabled, threadUrl)

		if htmxEnabled && parentCommentId != "" {
			// user is expanding replies; send just the comment fragments
			data := struct{ Comments []Comment }{Comments: comments}
			if err := commentTmpl.ExecuteTemplate(e.Response, "base", data); err != nil {
				log.Println(err)
				return apis.NewBadRequestError("Something went wrong.", err)
			}
			return nil
		}

		rating := getListingRating(app, category, listingId, authId)
		data := struct {
			ListingId string
			Category  string

			Name        string
			Description string
			File        string
			Type        string
			Scale       float64
			Price       int64
			Owned       bool

			CreatorUsername string
			CreatorNickname string

			AvgRating   string
			AvgRounded  int
			RatingCount int
			UserRating  int
			Stars       []int

			Tags []string

			CommentId string
			Comments  []Comment
			ThreadUrl string
		}{
			ListingId: listingId,
			Category:  category,

			Name:        listing.Name,
			Description: listing.Description,
			File:        "/api/files/" + category + "/" + listing.ItemId + "/" + listing.File,
			Type:        category,
			Scale:       listing.Scale,
			Price:       listing.Price,
			Owned:       listing.Owned,

			CreatorUsername: listing.Username,
			CreatorNickname: listing.Nickname,

			AvgRating:   rating.AvgRating,
			AvgRounded:  rating.AvgRounded,
			RatingCount: rating.RatingCount,
			UserRating:  rating.UserRating,
			Stars:       rating.Stars,

			Tags: getListingTags(app, listingId),

			Comments:  comments,
			ThreadUrl: threadUrl,
		}

		if err := shopListingTmpl.ExecuteTemplate(e.Response, e.Get("name").(string), AppendToBaseData(e, data)); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
	se.Router.POST("/shop/{category}/{id}/rate", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth == nil {
			return apis.NewForbiddenError("Only authorized users can rate a listing.", nil)
		}
		category := e.Request.PathValue("category")
		listingId := e.Request.PathValue("id")
		if _, ok := shopCategories[category]; !ok {
			return apis.NewNotFoundError("Unknown category.", nil)
		}

		stars, err := strconv.Atoi(e.Request.FormValue("stars"))
		if err != nil || stars < 1 || stars > 5 {
			return apis.NewBadRequestError("A rating must be between 1 and 5 stars.", err)
		}

		if _, err := app.FindFirstRecordByFilter(
			"listings",
			"id = {:id} && is_listed = TRUE",
			dbx.Params{"id": listingId},
		); err != nil {
			return apis.NewNotFoundError("This listing no longer exists.", err)
		}

		record, err := app.FindFirstRecordByFilter(
			"ratings",
			"user_id = {:user} && listing_id = {:listing}",
			dbx.Params{"user": info.Auth.Id, "listing": listingId},
		)
		if err != nil {
			collection, err := app.FindCollectionByNameOrId("ratings")
			if err != nil {
				return apis.NewBadRequestError("Something went wrong.", err)
			}
			record = core.NewRecord(collection)
			record.Load(map[string]any{
				"user_id":    info.Auth.Id,
				"listing_id": listingId,
			})
		}
		record.Set("stars", stars)
		if err := app.Save(record); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}

		rating := getListingRating(app, category, listingId, info.Auth.Id)
		if err := shopListingTmpl.ExecuteTemplate(e.Response, "listingRating", rating); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
	se.Router.POST("/shop/{category}/{id}/tags", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth == nil {
			return apis.NewForbiddenError("Only authorized users can tag a listing.", nil)
		}
		category := e.Request.PathValue("category")
		listingId := e.Request.PathValue("id")
		if _, ok := shopCategories[category]; !ok {
			return apis.NewNotFoundError("Unknown category.", nil)
		}

		tag := strings.ToLower(strings.TrimSpace(e.Request.FormValue("tag")))
		if !shopTagPattern.MatchString(tag) {
			return apis.NewBadRequestError("Tags are 2-24 characters: lowercase letters, numbers, and dashes.", nil)
		}

		if _, err := app.FindFirstRecordByFilter(
			"listings",
			"id = {:id} && is_listed = TRUE",
			dbx.Params{"id": listingId},
		); err != nil {
			return apis.NewNotFoundError("This listing no longer exists.", err)
		}

		existing := getListingTags(app, listingId)
		if len(existing) >= shopMaxTagsPerListing {
			return apis.NewBadRequestError("This listing has enough tags already.", nil)
		}
		for _, t := range existing {
			if t == tag {
				return apis.NewBadRequestError("This listing already has that tag.", nil)
			}
		}

		collection, err := app.FindCollectionByNameOrId("listing_tags")
		if err != nil {
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		record := core.NewRecord(collection)
		record.Load(map[string]any{
			"user_id":    info.Auth.Id,
			"listing_id": listingId,
			"tag":        tag,
		})
		if err := app.Save(record); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}

		data := struct {
			AuthId    string
			Category  string
			ListingId string
			Tags      []string
		}{
			AuthId:    info.Auth.Id,
			Category:  category,
			ListingId: listingId,
			Tags:      getListingTags(app, listingId),
		}
		if err := shopListingTmpl.ExecuteTemplate(e.Response, "listingTags", data); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
	se.Router.POST("/shop/{category}/{id}/buy", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth == nil {
			return apis.NewForbiddenError("Only authorized users can buy from the shop.", nil)
		}
		category := e.Request.PathValue("category")
		listingId := e.Request.PathValue("id")
		itemType, ok := shopCategories[category]
		if !ok || itemType == 0 {
			return apis.NewNotFoundError("Unknown category.", nil)
		}
		buyerId := info.Auth.Id

		listing := struct {
			ItemId    string `db:"item_id" json:"item_id"`
			CreatorId string `db:"creator_id" json:"creator_id"`
			Price     int64  `db:"price" json:"price"`
			Name      string `db:"name" json:"name"`
		}{}

		// the whole purchase is one transaction; the conditional debit
		// inside AdjustCoins is what makes concurrent buys safe (spec §6)
		err := app.RunInTransaction(func(txApp core.App) error {
			err := txApp.DB().
				NewQuery(`
				SELECT l.item_id, l.creator_id, l.price, i.name
				FROM listings l
				INNER JOIN ` + category + ` i ON i.id = l.item_id
				WHERE l.id = {:id} AND l.is_listed = TRUE AND l.type = {:type}
			`).
				Bind(dbx.Params{"id": listingId, "type": itemType}).One(&listing)
			if err != nil {
				return errListingGone
			}

			if listing.Price > 0 {
				if _, err := utils.AdjustCoins(txApp, buyerId, -listing.Price, utils.TxPurchaseSpend, listingId, "Bought "+listing.Name); err != nil {
					return err
				}
				// creator income is price - fee; fee is 0 for coin sales
				// (spec §0.2, bars will differ). an empty creator means a
				// system item: the coins are burned
				const fee = 0
				if income := listing.Price - fee; listing.CreatorId != "" && income > 0 {
					if _, err := utils.AdjustCoins(txApp, listing.CreatorId, income, utils.TxSaleIncome, listingId, "Sold "+listing.Name); err != nil {
						return err
					}
				}
			}

			collection, err := txApp.FindCollectionByNameOrId("stuff")
			if err != nil {
				return err
			}
			record := core.NewRecord(collection)
			record.Load(map[string]any{
				"owner_id": buyerId,
				"stuff_id": listing.ItemId,
				"type":     itemType,
			})
			if err := txApp.Save(record); err != nil {
				return err
			}

			_, err = txApp.DB().
				NewQuery(`
				UPDATE listings SET purchases = purchases + 1, updated = {:now}
				WHERE id = {:id}
			`).
				Bind(dbx.Params{"id": listingId, "now": types.NowDateTime().String()}).Execute()
			return err
		})
		if errors.Is(err, errListingGone) {
			return apis.NewNotFoundError("This listing no longer exists.", err)
		}
		if errors.Is(err, utils.ErrInsufficientCoins) {
			return apis.NewBadRequestError("You don't have enough coins for this.", err)
		}
		if err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}

		// tell the header to refresh the coin balance
		e.Response.Header().Set("HX-Trigger", "coinsChanged")

		if e.Request.URL.Query().Get("frag") == "card" {
			data := ShopListing{
				Id:       listingId,
				Price:    listing.Price,
				Owned:    true,
				Category: category,
				AuthId:   buyerId,
			}
			if err := shopTmpl.ExecuteTemplate(e.Response, "shopCardBuy", data); err != nil {
				log.Println(err)
				return apis.NewBadRequestError("Something went wrong.", err)
			}
			return nil
		}
		data := struct {
			AuthId    string
			Category  string
			ListingId string
			Price     int64
			Owned     bool
		}{
			AuthId:    buyerId,
			Category:  category,
			ListingId: listingId,
			Price:     listing.Price,
			Owned:     true,
		}
		if err := shopListingTmpl.ExecuteTemplate(e.Response, "listingBuy", data); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
	se.Router.GET("/wallet/balance", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth == nil {
			return apis.NewForbiddenError("Not logged in.", nil)
		}
		data := struct {
			AuthCoins int64
		}{AuthCoins: utils.GetCoins(app, info.Auth.Id)}
		if err := shopTmpl.ExecuteTemplate(e.Response, "coinBalance", data); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
}

var errListingGone = errors.New("listing gone")

type listingRating struct {
	AuthId    string
	Category  string
	ListingId string

	AvgRating   string
	AvgRounded  int
	RatingCount int
	UserRating  int
	Stars       []int
}

func getListingRating(app *pocketbase.PocketBase, category string, listingId string, authId string) listingRating {
	rating := listingRating{
		AuthId:    authId,
		Category:  category,
		ListingId: listingId,
		Stars:     []int{1, 2, 3, 4, 5},
	}

	agg := struct {
		Avg   float64 `db:"avg" json:"avg"`
		Count int     `db:"count" json:"count"`
	}{}
	err := app.DB().
		NewQuery(`
		SELECT IFNULL(AVG(stars), 0) AS avg, COUNT(*) AS count
		FROM ratings WHERE listing_id = {:listing}
	`).
		Bind(dbx.Params{"listing": listingId}).One(&agg)
	if err != nil {
		log.Println(err)
	}
	rating.AvgRating = fmt.Sprintf("%.1f", agg.Avg)
	rating.AvgRounded = int(agg.Avg + 0.5)
	rating.RatingCount = agg.Count

	if authId != "" {
		var stars int
		err := app.DB().
			NewQuery(`
			SELECT stars FROM ratings
			WHERE listing_id = {:listing} AND user_id = {:user}
		`).
			Bind(dbx.Params{"listing": listingId, "user": authId}).Row(&stars)
		if err == nil {
			rating.UserRating = stars
		}
	}
	return rating
}

func getListingTags(app *pocketbase.PocketBase, listingId string) []string {
	tags := []string{}
	err := app.DB().
		NewQuery(`
		SELECT tag FROM listing_tags
		WHERE listing_id = {:listing}
		ORDER BY created, id
	`).
		Bind(dbx.Params{"listing": listingId}).Column(&tags)
	if err != nil {
		log.Println(err)
	}
	return tags
}
