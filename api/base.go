package api

import (
	"log"
	"strings"
	"text/template"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

var errorTmpl *template.Template

func init() {
	errorTmpl = template.Must(template.ParseFiles(AppendToBaseTmplFiles("web/templates/pages/error.gohtml")...))
}

func AppendToBaseTmplFiles(files ...string) []string {
	return append([]string{
		"web/templates/pages/index.gohtml",
		"web/templates/components/header.gohtml",
		"web/templates/components/profileHeader.gohtml",
	}, files...)
}

func AddBaseRoutes(e *core.ServeEvent) {
	e.Router.GET("/", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		if info.AuthRecord != nil {
			username := info.AuthRecord.GetString("username")
			c.Redirect(302, "/profile/"+username)
			return nil
		}
		c.Redirect(302, "/login")
		return nil
	})
}

func BaseMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		log.Println(c.Request().Method, c.Path(), c.PathParams())
		path := strings.TrimSuffix(c.Path(), ".html")
		if strings.HasSuffix(path, ".json") {
			return next(c)
		}
		if c.Path() == "/static/*" || strings.HasPrefix(c.Path(), "/api") || strings.HasPrefix(c.Path(), "/_") {
			return next(c)
		}
		if c.Request().Header.Get("HX-Request") == "true" {
			c.Set("name", "page")
		} else {
			c.Set("name", "base")
		}
		if c.Path() == "" {
			formatErr := map[string]string{
				"Error": "Page not found.",
			}
			if err := CreateError().ExecuteTemplate(c.Response().Writer, c.Get("name").(string), formatErr); err != nil {
				return err
			}
			return nil
		}
		return next(c)
	}
}

func CreateError() *template.Template {
	return errorTmpl
}
