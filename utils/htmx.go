package utils

import (
	"fmt"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase/core"
)

// Process trueCallback if client has HX-Request, else falseCallback (client has no-js?)
//
// Parameter 'e' allowed types:
//   - *core.RecordCreateEvent
//   - echo.Context
func ProcessHXRequest(e interface{}, trueCallback, falseCallback func() error) error {
	switch e := e.(type) {
	case *core.RecordCreateEvent:
		{
			hxRequest := e.HttpContext.Request().Header.Get("HX-Request")
			if hxRequest != "" {
				if hxRequest == "true" {
					return trueCallback()
				}
				return falseCallback()
			}
		}
	case echo.Context:
		{
			hxRequest := e.Request().Header.Get("HX-Request")
			if hxRequest != "" {
				if hxRequest == "true" {
					return trueCallback()
				}
				return falseCallback()
			}
		}
	default:
		return fmt.Errorf("ProcessHXRequest: Unknown type %T", e)
	}
	return nil
}
