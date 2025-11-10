package utils

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase/core"
)

// Process trueCallback if client has HX-Request, else falseCallback (client has no-js?)
//
// Parameter 'e' allowed types:
//   - *core.RecordCreateEvent
//   - echo.Context
func ProcessHXRequest(e interface{}, trueCallback, falseCallback func() error) error {
	switch e := e.(type) {
	case *core.RequestEvent:
		{
			hxRequest := e.Request.Header.Get("HX-Request")
			if hxRequest != "" {
				if hxRequest == "true" {
					return trueCallback()
				}
			}
			return falseCallback()
		}
	case *core.RecordRequestEvent:
		{
			hxRequest := e.Request.Header.Get("HX-Request")
			if hxRequest != "" {
				if hxRequest == "true" {
					return trueCallback()
				}
			}
			return falseCallback()
		}
	default:
		log.Printf("ProcessHXRequest: Unknown type %T", e)
		return fmt.Errorf("ProcessHXRequest: Unknown type %T", e)
	}
}
