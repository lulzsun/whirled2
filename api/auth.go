package api

import (
	"encoding/json"
	"net/http"
	"net/url"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/forms"
	"github.com/pocketbase/pocketbase/models"
)

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
