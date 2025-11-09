package api

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"os"
	"strings"
	"text/template"
	"whirled2/utils"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

var partialIndexTmpl *template.Template
var fullIndexTmpl *template.Template
var partialErrTmpl *template.Template
var fullErrTmpl *template.Template

func init() {
	partialIndexTmpl, _ = template.ParseFiles("web/templates/pages/world.gohtml")
	fullIndexTmpl = template.Must(partialIndexTmpl.ParseFiles(AppendToBaseTmplFiles()...))
	partialErrTmpl, _ = template.ParseFiles("web/templates/components/error.gohtml")
	fullErrTmpl = template.Must(partialErrTmpl.ParseFiles(AppendToBaseTmplFiles("web/templates/pages/error.gohtml")...))
}

func AppendToBaseData(c echo.Context, data any) any {
	info := apis.RequestInfo(c)
	authId, authUsername, authNickname := "", "", ""
	if info.AuthRecord != nil {
		authId = info.AuthRecord.Id
		authUsername = info.AuthRecord.GetString("username")
		authNickname = info.AuthRecord.GetString("nickname")
	}

	baseData := struct {
		GameVersion  string

		AuthId 		 string
		AuthUsername string
		AuthNickname string
	}{
		GameVersion: os.Getenv("VERSION"),

		AuthId: authId,
		AuthUsername: authUsername,
		AuthNickname: authNickname,
	}

	if data == nil {
		return baseData
	}

	// Convert structs to maps
	mapA := utils.StructToMap(data)
	mapB := utils.StructToMap(baseData)

	// Merge maps
	mergedMap := utils.MergeMaps(mapA, mapB)
	return mergedMap
}

func AppendToBaseTmplFiles(files ...string) []string {
	return append([]string{
		"web/templates/pages/index.gohtml",
		"web/templates/components/game.gohtml",
		"web/templates/components/preview.gohtml",
		"web/templates/components/header.gohtml",
		"web/templates/components/profileHeader.gohtml",
	}, files...)
}

func AddBaseRoutes(e *core.ServeEvent, app *pocketbase.PocketBase) {
	e.Router.GET("/", func(c echo.Context) error {
		htmxEnabled := false
		params := c.QueryParams()
		info := apis.RequestInfo(c)

		utils.ProcessHXRequest(c, func() error {
			htmxEnabled = true
			return nil
		}, func() error {
			return nil
		})

		if info.AuthRecord != nil || len(params) > 0 {
			// if the user is auth'd, we will return an "empty page",
			// the client should handle this by hiding the "empty page" side panel
			if htmxEnabled {
				if err := partialIndexTmpl.ExecuteTemplate(c.Response().Writer, "page", nil); err != nil {
					return err
				}
				return nil
			}

			if err := fullIndexTmpl.ExecuteTemplate(c.Response().Writer, "base", AppendToBaseData(c, struct{ NoJs bool }{true})); err != nil {
				return err
			}
			return nil
		}

		// if the user is not auth'd, we will give them the initial load a redirect
		if htmxEnabled {
			if err := partialIndexTmpl.ExecuteTemplate(c.Response().Writer, "page", nil); err != nil {
				return err
			}
			return nil
		}
		c.Redirect(302, "/login")
		return nil
	})
}

func AddBaseEventHooks(app *pocketbase.PocketBase) {
	// Adds specific htmx error handling
	// Will override pb's error json response if request was done by htmx
	app.OnBeforeApiError().Add(func(e *core.ApiErrorEvent) error {
		htmxEnabled := false
		c := e.HttpContext

		utils.ProcessHXRequest(c, func() error {
			htmxEnabled = true
			return nil
		}, func() error {
			return nil
		})

		if c.Request().Method == "POST" && c.PathParams().Get("collection", "") != "" &&
			c.Request().Header.Get("Content-Type") == "application/json" {

			apiErr := e.Error.(*apis.ApiError)
			for k, v := range apiErr.Data {
				vm, ok := v.(map[string]string)
				if ok {
					vm["key"] = k
					apiErr.Data[k] = v
				}
			}
			formatErr := map[string]interface{}{
				"Code": apiErr.Code,
				"Message": apiErr.Message,
				"Data": apiErr.Data,
			}

			var page bytes.Buffer
			if htmxEnabled {
				c.Response().Header().Add("HX-Retarget", "#error-alert");
				c.Response().Header().Add("HX-Reswap", "innerHTML");
				
				if err := CreateError(true).ExecuteTemplate(&page, "error", formatErr); err != nil {
					return nil
				}
				return c.HTML(202, page.String())
			} else {
				formatErr["Redirect"] = "href='" + c.Request().Referer() + "'"
				if err := CreateError(false).ExecuteTemplate(&page, "base", formatErr); err != nil {
					return nil
				}
				return c.HTML(apiErr.Code, page.String())
			}
		}
        return nil
    })
}

func BaseMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		c.Response().After(func() {
			if !strings.HasPrefix(c.Request().URL.RequestURI(), "/static/") && 
				!strings.HasPrefix(c.Request().URL.RequestURI(), "/_/") && 
				!strings.HasPrefix(c.Request().URL.RequestURI(), "/api/") {
				log.Println(c.Response().Status, c.Request().Method, c.Request().URL.RequestURI())
			}
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
			if err := CreateError(false).ExecuteTemplate(c.Response().Writer, c.Get("name").(string), formatErr); err != nil {
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

func CreateError(partial bool) *template.Template {
	if partial {
		return partialErrTmpl
	}
	return fullErrTmpl
}
