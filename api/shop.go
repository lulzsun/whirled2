package api

import (
	"log"
	"strconv"
	"text/template"
	buf "whirled2/utils/proto"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const shopPageSize = 24

var shopTmplFiles []string
var shopTmpl *template.Template

type ShopListing struct {
	Id        string `db:"id" json:"id"`
	ItemId    string `db:"item_id" json:"item_id"`
	Name      string `db:"name" json:"name"`
	Thumbnail string `db:"thumb" json:"thumb"`
	Price     int64  `db:"price" json:"price"`
	Purchases int64  `db:"purchases" json:"purchases"`
	Username  string `db:"username" json:"username"`
	Nickname  string `db:"nickname" json:"nickname"`
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
}

func parseShopFiles() {
	shopTmplFiles = append(shopTmplFiles, AppendToBaseTmplFiles(
		"web/templates/pages/shop.gohtml",
	)...)
	shopTmpl = template.Must(template.ParseFiles(shopTmplFiles...))
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

			items := []ShopListing{}
			err = app.DB().
				NewQuery(`
				SELECT
					l.id,
					l.item_id,
					l.price,
					l.purchases,
					i.name,
					i.thumb,
					IFNULL(u.username, '') AS username,
					IFNULL(u.nickname, '') AS nickname
				` + baseQuery + `
				ORDER BY ` + orderBy + `
				LIMIT {:limit} OFFSET {:offset}
			`).
				Bind(dbx.Params{
					"type":   itemType,
					"limit":  shopPageSize,
					"offset": (page - 1) * shopPageSize,
				}).All(&items)
			if err != nil {
				log.Println(err)
			} else {
				data.Items = items
			}

			featured := []ShopListing{}
			err = app.DB().
				NewQuery(`
				SELECT
					l.id,
					l.item_id,
					l.price,
					l.purchases,
					i.name,
					i.thumb,
					IFNULL(u.username, '') AS username,
					IFNULL(u.nickname, '') AS nickname
				` + baseQuery + `
				AND l.is_featured = TRUE
				ORDER BY l.created DESC
				LIMIT 4
			`).
				Bind(dbx.Params{"type": itemType}).All(&featured)
			if err != nil {
				log.Println(err)
			} else {
				data.Featured = featured
			}
		}

		if err := shopTmpl.ExecuteTemplate(e.Response, e.Get("name").(string), AppendToBaseData(e, data)); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
}
