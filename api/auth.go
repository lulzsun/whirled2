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
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
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

func AddAuthRoutes(se *core.ServeEvent, app *pocketbase.PocketBase) {
	se.Router.GET("/login", func(e *core.RequestEvent) error {
		if err := loginTmpl.ExecuteTemplate(e.Response, e.Get("name").(string), AppendToBaseData(e, nil)); err != nil {
			return err
		}
		return nil
	})
	se.Router.GET("/signup", func(e *core.RequestEvent) error {
		if err := signupTmpl.ExecuteTemplate(e.Response, e.Get("name").(string), AppendToBaseData(e, nil)); err != nil {
			return err
		}
		return nil
	})
	se.Router.GET("/signout", func(e *core.RequestEvent) error {
		cookie := &http.Cookie{
			Name:     "pb_auth",
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			MaxAge:   -1,
			SameSite: http.SameSiteLaxMode,
		}
		e.SetCookie(cookie)
		e.Redirect(302, "/")
		return nil
	})
	se.Router.GET("/login.json", func(e *core.RequestEvent) error {
		return apis.NewNotFoundError("hi there ugly", nil)
	})
}

// This is basically PocketBase's Auth middleware reimplemented for cookies
// Modify request header to include Authorization if request has a cookie
// This should properly auth pocketbase requests using JWT
// https://github.com/pocketbase/pocketbase/discussions/6345
func AuthMiddleware(app core.App) *hook.Handler[*core.RequestEvent] {
	return &hook.Handler[*core.RequestEvent]{
		Id: "authMiddleware",
		// execute this right after pocketbase auth middleware
		Priority: apis.DefaultLoadAuthTokenMiddlewarePriority + 1,
		Func: func(e *core.RequestEvent) error {
			if e.Auth != nil {
				// already loaded by another middleware
				return e.Next()
			}

			if cookie, err := e.Request.Cookie("pb_auth"); err == nil && !strings.HasPrefix(e.Request.URL.Path, "/_/") {
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

				if token == "" {
					return e.Next()
				}

				claims, _ := security.ParseUnverifiedJWT(token)
				tokenType := cast.ToString(claims["type"])

				switch tokenType {
				// does "admin" token exist in pocketbase v0.30.x? originally this was used
				// in v0.22.x, not sure but just gonna keep it around...
				case "admin":
					admin, err := app.FindAuthRecordByToken(
						token,
						"admin",
					)
					if err == nil && admin != nil {
						e.Auth = admin
					}
				case core.TokenTypeAuth:
					record, err := app.FindAuthRecordByToken(
						token,
						core.TokenTypeAuth,
					)
					if err == nil && record != nil {
						e.Auth = record
					} else {
						log.Println(err)
					}
				default:
					log.Println("Unknown token type:", tokenType)
				}
			}

			return e.Next()
		},
	}
}

func AddAuthEventHooks(app *pocketbase.PocketBase) {
	// POST /api/collections/users/records
	// On User signup/creation
	app.OnRecordCreateRequest("users").BindFunc(func(e *core.RecordRequestEvent) error {
		// Verify new user's age on signup
		username := e.Record.GetString("username")
		if !(utf8.RuneCountInString(username) >= 3 && utf8.RuneCountInString(username) <= 30) {
			return apis.NewBadRequestError("Your username must be between 3-30 characters.", nil)
		}
		dob, err := time.Parse("2006-01-02 15:04:05.000Z", e.Record.GetDateTime("birthday").String())
		if err != nil || int(time.Since(dob).Hours()/24/365) < 13 {
			return apis.NewBadRequestError("You must be at least 13 years or older to register.", err)
		}
		e.Record.Set("nickname", e.Record.GetString("username"))

		// Send back HTML response if user signed up through HTMX or x-www-form-urlencoded
		utils.ProcessHXRequest(e, func() error {
			e.Response.Header().Set("HX-Redirect", "/")
			return e.String(200, "Successful sign up!")
		}, func() error {
			return e.Redirect(302, "/")
		})

		err = e.Next()
		if err != nil {
			return err
		}

		// Creates a profile & room for the new user
		// Creating new profile
		collection, err := app.FindCollectionByNameOrId("profiles")
		if err != nil {
			return err
		}
		record := core.NewRecord(collection)
		record.Load(map[string]any{
			"user_id": e.Record.Id,
		})
		if err := app.Save(record); err != nil {
			log.Println(err, e.Record)
			return err
		}

		// Creating new room (home)
		collection, err = app.FindCollectionByNameOrId("rooms")
		if err != nil {
			log.Println(err)
			return err
		}
		record = core.NewRecord(collection)
		record.Load(map[string]any{
			"owner_id": e.Record.Id,
			"name":     e.Record.GetString("username") + "'s Home",
			"is_home":  true,
		})
		if err := app.Save(record); err != nil {
			log.Println(err)
			return err
		}
		return nil
	})

	// POST /api/collections/users/auth-with-password
	// Converts PocketBase's JWT auth token (on user login) to a cookie if the request is called from HTMX
	app.OnRecordAuthRequest("users").BindFunc(func(e *core.RecordAuthRequestEvent) error {
		hxRequest := e.Request.Header.Get("HX-Request")
		if hxRequest != "" {
			token, _, err := new(jwt.Parser).ParseUnverified(e.Token, jwt.MapClaims{})
			if claims, ok := token.Claims.(jwt.MapClaims); ok && err == nil {
				if exp, exists := claims["exp"]; exists {
					if expUnix, ok := exp.(float64); ok {
						currentUnix := float64(time.Now().Unix())
						maxAge := int(expUnix - currentUnix)

						cookieValue, err := json.Marshal(map[string]any{
							"token": e.Token,
							"model": map[string]any{
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
								SameSite: http.SameSiteLaxMode,
							}
							e.SetCookie(cookie)
							if hxRequest == "true" {
								e.Response.Header().Set("HX-Redirect", "/")
								return e.String(200, "Successful login!")
							}
							return e.Redirect(302, "/")
						}
					}
				}
			}
			return apis.NewBadRequestError("Something went wrong...", nil)
		}
		return e.Next()
	})
}
