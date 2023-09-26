package utils

import "github.com/pocketbase/pocketbase/core"

// Process trueCallback if client has HX-Request, else falseCallback (client has no-js?)
func ProcessHXRequest(e *core.RecordCreateEvent, trueCallback, falseCallback func() error) error {
	hxRequest := e.HttpContext.Request().Header.Get("HX-Request")
	if hxRequest != "" {
		if hxRequest == "true" {
			return trueCallback()
		}
		return falseCallback()
	}
	return nil
}
