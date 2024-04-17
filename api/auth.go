package api

import (
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"strings"
	"text/template"
	"time"
	"unicode/utf8"
	"whirled2/utils"

	"github.com/golang-jwt/jwt/v4"
	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/forms"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/tokens"
	"github.com/pocketbase/pocketbase/tools/security"
	"github.com/spf13/cast"
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

func AddAuthRoutes(e *core.ServeEvent, app *pocketbase.PocketBase) {
	e.Router.GET("/login", func(c echo.Context) error {
		if err := loginTmpl.ExecuteTemplate(c.Response().Writer, c.Get("name").(string), AppendToBaseData(c, nil)); err != nil {
			return err
		}
		return nil
	})
	e.Router.GET("/signup", func(c echo.Context) error {
		if err := signupTmpl.ExecuteTemplate(c.Response().Writer, c.Get("name").(string), AppendToBaseData(c, nil)); err != nil {
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
			SameSite: http.SameSiteLaxMode,
		}
		c.SetCookie(cookie)
		c.Redirect(302, "/")
		return nil
	})
	e.Router.GET("/login.json", func(c echo.Context) error {
		return apis.NewNotFoundError("hi there ugly", nil)
	})
}

// This is basically PocketBase's LoadAuthContext middleware reimplemented for cookies
// Modify request header to include Authorization if request has a cookie
// This should properly auth pocketbase requests using JWT
func AuthMiddleware(app core.App) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if cookie, err := c.Cookie("pb_auth"); err == nil {
				decodedCookieValue, err := url.QueryUnescape(cookie.Value)
				if err != nil {
					log.Println("Error decoding cookie value:", err)
					return nil
				}
				var cookieData map[string]interface{}
				err = json.Unmarshal([]byte(decodedCookieValue), &cookieData)
				if err != nil {
					log.Println("Error unmarshaling JSON:", err)
					return nil
				}

				token := strings.TrimPrefix(cookieData["token"].(string), "Bearer ")
				// model := cookieData["model"].(map[string]interface{})

				claims, _ := security.ParseUnverifiedJWT(token)
				tokenType := cast.ToString(claims["type"])

				switch tokenType {
				case tokens.TypeAdmin:
					admin, err := app.Dao().FindAdminByToken(
						token,
						app.Settings().AdminAuthToken.Secret,
					)
					if err == nil && admin != nil {
						c.Set(apis.ContextAdminKey, admin)
					}
				case tokens.TypeAuthRecord:
					record, err := app.Dao().FindAuthRecordByToken(
						token,
						app.Settings().RecordAuthToken.Secret,
					)
					if err == nil && record != nil {
						c.Set(apis.ContextAuthRecordKey, record)
					}
				}
			}
			return next(c)
		}
	}
}

func AddAuthEventHooks(app *pocketbase.PocketBase) {
	// POST /api/collections/users/records
	// Verify new user's age on signup
	app.OnRecordBeforeCreateRequest("users").Add(func(e *core.RecordCreateEvent) error {
		username := e.Record.GetString("username")
		if !(utf8.RuneCountInString(username) >= 3 && utf8.RuneCountInString(username) <= 30) {
			return apis.NewBadRequestError("Your username must be between 3-30 characters.", nil)
		}
		dob, err := time.Parse("2006-01-02 15:04:05.000Z", e.Record.GetDateTime("birthday").String())
		if err != nil || int(time.Since(dob).Hours()/24/365) < 13 {
			return apis.NewBadRequestError("You must be at least 13 years or older to register.", err)
		}
		e.Record.Set("nickname", e.Record.GetString("username"))
		return nil
	})

	// POST /api/collections/users/records
	// Send back HTML response if user signed up through HTMX or x-www-form-urlencoded
	app.OnRecordAfterCreateRequest("users").Add(func(e *core.RecordCreateEvent) error {
		return utils.ProcessHXRequest(e, func() error {
			e.HttpContext.Response().Header().Set("HX-Redirect", "/")
			return e.HttpContext.String(200, "Successful sign up!")
		}, func() error {
			return e.HttpContext.Redirect(302, "/")
		})
	})

	// POST /api/collections/users/records
	// Creates a profile & room for the new user
	app.OnRecordAfterCreateRequest("users").Add(func(e *core.RecordCreateEvent) error {
		// Creating new profile
		collection, err := app.Dao().FindCollectionByNameOrId("profiles")
		if err != nil {
			return err
		}
		record := models.NewRecord(collection)
		form := forms.NewRecordUpsert(app, record)
		form.LoadData(map[string]any{
			"user_id": e.Record.Id,
		})
		if err := form.Submit(); err != nil {
			return err
		}

		// Creating new room (home)
		collection, err = app.Dao().FindCollectionByNameOrId("rooms")
		if err != nil {
			return err
		}
		record = models.NewRecord(collection)
		form = forms.NewRecordUpsert(app, record)
		form.LoadData(map[string]any{
			"owner_id": e.Record.Id,
			"name": e.Record.GetString("username") + "'s Home",
			"is_home": true,
		})
		if err := form.Submit(); err != nil {
			return err
		}
		return nil
	})

	// POST /api/collections/users/auth-with-password
	// Converts PocketBase's JWT auth token to a cookie if the request is called from HTMX
	app.OnRecordAuthRequest("users").Add(func(e *core.RecordAuthEvent) error {
		hxRequest := e.HttpContext.Request().Header.Get("HX-Request")
		if hxRequest != "" {
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
							if hxRequest == "true" {
								e.HttpContext.Response().Header().Set("HX-Redirect", "/")
								return e.HttpContext.String(200, "Successful login!")
							}
							return e.HttpContext.Redirect(302, "/")
						}
					}
				}
			}
			return apis.NewBadRequestError("Something went wrong...", nil)
		}
		return nil
	})
}
