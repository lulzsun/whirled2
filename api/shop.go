package api

import (
	"fmt"
	"log"
	"text/template"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

var shopTmplFiles []string
var shopTmpl *template.Template

type ShopItem struct {
	Id      string
	Name    string
	Creator string
	Price   int
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
		if category != "avatars" && category != "furniture" && category != "backdrops" && category != "games" {
			e.Redirect(302, "/shop/avatars")
			return nil
		}

		data := struct {
			Category string
			Items    []ShopItem
		}{Category: category}

		// TODO: replace placeholder items with a real shop/catalog query
		for i := 1; i <= 12; i++ {
			data.Items = append(data.Items, ShopItem{
				Id:      fmt.Sprintf("placeholder-%d", i),
				Name:    fmt.Sprintf("Placeholder %d", i),
				Creator: "Admin",
				Price:   i * 100,
			})
		}

		if err := shopTmpl.ExecuteTemplate(e.Response, e.Get("name").(string), AppendToBaseData(e, data)); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
}
