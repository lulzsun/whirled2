package api

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"strings"
	"text/template"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
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
		"web/templates/pages/game.gohtml",
		"web/templates/components/header.gohtml",
		"web/templates/components/profileHeader.gohtml",
	}, files...)
}

func AddBaseRoutes(e *core.ServeEvent, app *pocketbase.PocketBase) {
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
		c.Response().After(func() {
			log.Println(c.Response().Status, c.Request().Method, c.Request().URL.RequestURI())
		})
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

// This is for converting form data when PocketBase is expecting json data
// This is pretty hacky so expect to look here for debugging
func FormMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		if c.Request().Method == "POST" && c.PathParams().Get("collection", "") != "" &&
			c.Request().Header.Get("Content-Type") == "application/x-www-form-urlencoded" {
			if err := c.Request().ParseForm(); err != nil {
				return nil
			}
			formData := make(map[string]interface{})
			for key, values := range c.Request().Form {
				if len(values) == 1 {
					formData[key] = values[0]
				} else {
					formData[key] = values
				}
			}
			jsonFormData, err := json.Marshal(formData)
			if err != nil {
				log.Println("Error:", err)
				return nil
			}
			c.Request().Body = io.NopCloser(bytes.NewReader(jsonFormData))
			c.Request().ContentLength = int64(len(jsonFormData))
			c.Request().Header.Set("Content-Type", "application/json")
			if c.Request().Header.Get("HX-Request") != "true" {
				c.Request().Header.Set("HX-Request", "false")
			}
			c.Request().Form = nil

			if err := c.Request().ParseForm(); err != nil {
				return nil
			}
		}
		return next(c)
	}
}

func CreateError() *template.Template {
	return errorTmpl
}
