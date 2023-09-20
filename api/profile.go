package api

import (
	"text/template"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase/core"
)

var profileTmplFiles []string
var profileTmpl *template.Template

func init() {
	parseProfileFiles()
}

func parseProfileFiles() {
	profileTmplFiles = AppendToBaseTmplFiles("web/templates/pages/profile.gohtml")
	profileTmpl = template.Must(template.ParseFiles(profileTmplFiles...))
}

func AddProfileRoutes(e *core.ServeEvent) {
	e.Router.GET("/profile", func(c echo.Context) error {
		if err := profileTmpl.ExecuteTemplate(c.Response().Writer, c.Get("name").(string), nil); err != nil {
			return err
		}
		return nil
	})
}
