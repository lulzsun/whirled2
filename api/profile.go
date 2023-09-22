package api

import (
	"log"
	"text/template"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase/apis"
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
		log.Println(username)
		if err := profileTmpl.ExecuteTemplate(c.Response().Writer, c.Get("name").(string), nil); err != nil {
			return err
		}
		return nil
	})
}
