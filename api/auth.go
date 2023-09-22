package api

import (
	"encoding/json"
	"net/http"
	"net/url"
	"text/template"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/forms"
	"github.com/pocketbase/pocketbase/models"
)

var loginTmplFiles []string
var signupTmplFiles []string
var loginTmpl *template.Template
var signupTmpl *template.Template

func init() {
	parseLoginFiles()
	parseSignupFiles()
}

func parseLoginFiles() {
	loginTmplFiles = AppendToBaseTmplFiles("web/templates/pages/login.gohtml")
	loginTmpl = template.Must(template.ParseFiles(loginTmplFiles...))
}

func parseSignupFiles() {
	signupTmplFiles = AppendToBaseTmplFiles("web/templates/pages/signup.gohtml")
	signupTmpl = template.Must(template.ParseFiles(signupTmplFiles...))
}

func AddAuthRoutes(e *core.ServeEvent) {
	e.Router.GET("/login", func(c echo.Context) error {
		if err := loginTmpl.ExecuteTemplate(c.Response().Writer, c.Get("name").(string), nil); err != nil {
			return err
		}
		return nil
	})
	e.Router.GET("/signup", func(c echo.Context) error {
		if err := signupTmpl.ExecuteTemplate(c.Response().Writer, c.Get("name").(string), nil); err != nil {
			return err
		}
		return nil
	})
	e.Router.GET("/signout", func(c echo.Context) error {
		cookie := &http.Cookie{
			Name:     "pb_auth",
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			MaxAge:   -1,
			SameSite: http.SameSiteStrictMode,
		}
		c.SetCookie(cookie)
		c.Redirect(302, "/")
		return nil
	})
	e.Router.GET("/login.json", func(c echo.Context) error {
		return apis.NewNotFoundError("hi there ugly", nil)
	})
}

func AddAuthEventHooks(app *pocketbase.PocketBase) {
	// POST /api/collections/users/records
	// Verify new user's age on signup
	app.OnRecordBeforeCreateRequest("users").Add(func(e *core.RecordCreateEvent) error {
		dob, err := time.Parse("2006-01-02 15:04:05.000Z", e.Record.GetDateTime("birthday").String())
		if err != nil || int(time.Since(dob).Hours()/24/365) < 13 {
			return apis.NewBadRequestError("You must be at least 13 years or older to register.", err)
		}
		return nil
	})

	// POST /api/collections/users/records
	// Creates a new profile for the new user
	app.OnRecordAfterCreateRequest("users").Add(func(e *core.RecordCreateEvent) error {
		collection, err := app.Dao().FindCollectionByNameOrId("profiles")
		if err != nil {
			return err
		}
		record := models.NewRecord(collection)
		form := forms.NewRecordUpsert(app, record)

		form.LoadData(map[string]any{
			"id":       e.Record.Id,
			"username": e.Record.Username(),
			"nickname": e.Record.Username(),
		})

		if err := form.Submit(); err != nil {
			return err
		}
		return nil
	})

	// POST /api/collections/users/auth-with-password
	// Converts PocketBase's JWT auth token to a cookie if the request is called from HTMX
	app.OnRecordAuthRequest("users").Add(func(e *core.RecordAuthEvent) error {
		if e.HttpContext.Request().Header.Get("HX-Request") == "true" {
			token, _, err := new(jwt.Parser).ParseUnverified(e.Token, jwt.MapClaims{})
			if claims, ok := token.Claims.(jwt.MapClaims); ok && err == nil {
				if exp, exists := claims["exp"]; exists {
					if expUnix, ok := exp.(float64); ok {
						currentUnix := float64(time.Now().Unix())
						maxAge := int(expUnix - currentUnix)

						cookieValue, err := json.Marshal(map[string]interface{}{
							"token": e.Token,
							"model": map[string]interface{}{
								"verified": false,
							},
						})

						if err == nil {
							cookie := &http.Cookie{
								Name:     "pb_auth",
								Value:    url.QueryEscape(string(cookieValue)),
								Path:     "/",
								HttpOnly: true,
								MaxAge:   maxAge,
								SameSite: http.SameSiteStrictMode,
							}
							e.HttpContext.SetCookie(cookie)
							e.HttpContext.Response().Header().Set("HX-Redirect", "/")
							return e.HttpContext.String(200, "Successful login!")
						}
					}
				}
			}
			return apis.NewBadRequestError("Something went wrong...", nil)
		}
		return nil
	})
}
