package api

import (
	"bytes"
	"io"
	"log"
	"maps"
	"net/http"
	"net/url"
	"os"
	"strings"
	"text/template"
	"whirled2/utils"

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

func AppendToBaseData(e *core.RequestEvent, data any) any {
	info, _ := e.RequestInfo()
	authId, authUsername, authNickname := "", "", ""
	if info.Auth != nil {
		authId = info.Auth.Id
		authUsername = info.Auth.GetString("username")
		authNickname = info.Auth.GetString("nickname")
	}

	baseData := struct {
		GameVersion string

		AuthId       string
		AuthUsername string
		AuthNickname string
	}{
		GameVersion: os.Getenv("VERSION"),

		AuthId:       authId,
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

func AddBaseRoutes(se *core.ServeEvent, app *pocketbase.PocketBase) {
	se.Router.GET("/", func(e *core.RequestEvent) error {
		htmxEnabled := false
		params := e.Request.URL.Query()
		info, _ := e.RequestInfo()

		utils.ProcessHXRequest(e, func() error {
			htmxEnabled = true
			return nil
		}, func() error {
			return nil
		})

		if info.Auth != nil || len(params) > 0 {
			// if the user is auth'd, we will return an "empty page",
			// the client should handle this by hiding the "empty page" side panel
			if htmxEnabled {
				if err := partialIndexTmpl.ExecuteTemplate(e.Response, "page", nil); err != nil {
					return err
				}
				return nil
			}

			if err := fullIndexTmpl.ExecuteTemplate(e.Response, "base", AppendToBaseData(e, struct{ NoJs bool }{true})); err != nil {
				return err
			}
			return nil
		}

		// if the user is not auth'd, we will give them the initial load a redirect
		if htmxEnabled {
			if err := partialIndexTmpl.ExecuteTemplate(e.Response, "page", nil); err != nil {
				return err
			}
			return nil
		}
		e.Redirect(302, "/login")
		return nil
	})
}

func AddBaseEventHooks(app *pocketbase.PocketBase) {
	// If a client is making a request with a method query, it may possibly be a
	// noscript client. Some actions performed by a noscript user needs workarounds
	// so this handles them.
	app.OnRecordViewRequest().BindFunc(func(e *core.RecordRequestEvent) error {
		info, _ := e.RequestInfo()
		method := info.Query["method"]
		switch strings.ToLower(method) {
		case "delete":
			// if noscript user is setting a GET but has a DELETE method query,
			// they probably couldnt make the DELETE request themselves, so we
			// will do it for them.
			//
			// this basically will just create a new http request
			// not sure if there are any security implications doing it this way
			// but seems like i wasn't the only person to think of this:
			// https://github.com/pocketbase/pocketbase/discussions/5908#discussioncomment-11349162
			u, _ := url.Parse(e.Request.RequestURI)
			u.RawQuery = ""
			cleanURL := u.String()
			token, err := e.Auth.NewAuthToken()
			if err != nil {
				return err
			}
			req, err := http.NewRequest("DELETE", "http://127.0.0.1:42069"+cleanURL, nil)
			if err != nil {
				log.Println(err)
				return err
			}
			req.Header.Add("Authorization", "Bearer "+token)
			client := &http.Client{}
			resp, err := client.Do(req)
			if err != nil {
				log.Println(err)
				return err
			}
			defer resp.Body.Close()
			for key, values := range resp.Header {
				for _, value := range values {
					e.Response.Header().Set(key, value)
				}
			}
			body, err := io.ReadAll(resp.Body)
			if err != nil {
				return nil
			}
			e.Response.Write(body)
			return nil
		}
		return e.Next()
	})
}

// Adds specific htmx error handling
// Will override pb's error json response if request was done by htmx
func ErrorMiddleware(e *core.RequestEvent) error {
	err := e.Next()
	if err == nil {
		return nil // no error
	}

	apiErr := apis.ToApiError(err)
	for key, value := range apiErr.Data {
		if nestedMap, ok := value.(map[string]any); ok {
			newMap := make(map[string]any)
			newMap["key"] = key
			maps.Copy(newMap, nestedMap)
			apiErr.Data[key] = newMap
		} else {
			apiErr.Data[key] = value
		}
	}
	var page bytes.Buffer
	formatErr := map[string]interface{}{
		"Code":    apiErr.Status,
		"Message": apiErr.Message,
		"Data":    apiErr.Data,
	}

	err = utils.ProcessHXRequest(e, func() error {
		e.Response.Header().Add("HX-Retarget", "#error-alert")
		e.Response.Header().Add("HX-Reswap", "innerHTML")

		if err := CreateError(true).ExecuteTemplate(&page, "error", formatErr); err != nil {
			return nil
		}
		return e.HTML(202, page.String())
	}, func() error {
		formatErr["Redirect"] = "href='" + e.Request.Referer() + "'"
		if err := CreateError(false).ExecuteTemplate(&page, "base", formatErr); err != nil {
			return nil
		}
		return e.HTML(apiErr.Status, page.String())
	})
	return err
}

func BaseMiddleware(e *core.RequestEvent) error {
	path := e.Request.URL.Path
	if strings.HasSuffix(strings.TrimSuffix(path, ".html"), ".json") {
		return e.Next()
	}
	if path == "/static/*" || strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/_") {
		return e.Next()
	}
	if e.Request.Header.Get("HX-Request") == "true" {
		e.Set("name", "page")
	} else {
		e.Set("name", "base")
	}
	if path == "" {
		formatErr := map[string]string{
			"Error": "Page not found.",
		}
		if err := CreateError(false).ExecuteTemplate(e.Response, e.Get("name").(string), formatErr); err != nil {
			return err
		}
		return nil
	}
	return e.Next()
}

func CreateError(partial bool) *template.Template {
	if partial {
		return partialErrTmpl
	}
	return fullErrTmpl
}
