package api

import (
	"io"
	"net/http"
	"os"
	pathpkg "path"
	"strings"
	"time"

	"whirled2/utils/swf"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

// The avatar proxy: the only route the Flash sandbox loads user content
// through. See docs/specs/swf-avatar-rendering.md section 16 (M6), step 5.
//
// The sandbox document's CSP confines every fetch Ruffle makes to the sandbox
// origin, so whatever this route will not serve, an avatar cannot load. That
// makes this the upload boundary: it caps the size, requires the bytes to
// parse as a SWF container, and serves them from the sandbox's own origin so
// the shim and the avatar share one Flash security domain.
//
// In production the sandbox is a second deployment of this server with
// APP_ORIGIN set, and the proxy fetches the bytes from the app. In dev (and on
// a deployment without APP_ORIGIN) it loops back to this same server, which is
// where the files already live.

// maxAvatarBytes caps the proxied file. Whirled avatars are tens to hundreds
// of KB; this is far past any real one, and it is the *compressed* size —
// utils/swf separately caps what the body may decompress to.
const maxAvatarBytes = 8 << 20

// avatarPathPrefixes is every upstream path the proxy will fetch: PocketBase
// file storage (uploads) and the bundled default avatars. The path is cleaned
// before matching, so `..` cannot escape it.
var avatarPathPrefixes = []string{"/api/files/", "/static/assets/"}

var avatarClient = &http.Client{Timeout: 20 * time.Second}

func AddAvatarRoutes(se *core.ServeEvent, app *pocketbase.PocketBase) {
	se.Router.GET("/avatar/{path...}", func(e *core.RequestEvent) error {
		cleaned := pathpkg.Clean("/" + e.Request.PathValue("path"))
		allowed := false
		for _, prefix := range avatarPathPrefixes {
			if strings.HasPrefix(cleaned, prefix) {
				allowed = true
				break
			}
		}
		if !allowed {
			return e.String(http.StatusForbidden, "not an avatar path")
		}

		upstream := os.Getenv("APP_ORIGIN")
		if upstream == "" {
			upstream = "http://127.0.0.1:42069"
		}
		target := strings.TrimSuffix(upstream, "/") + cleaned
		if query := e.Request.URL.RawQuery; query != "" {
			target += "?" + query
		}

		resp, err := avatarClient.Get(target)
		if err != nil {
			return e.String(http.StatusBadGateway, "avatar fetch failed")
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return e.String(resp.StatusCode, "avatar not available")
		}

		body, err := io.ReadAll(io.LimitReader(resp.Body, maxAvatarBytes+1))
		if err != nil {
			return e.String(http.StatusBadGateway, "avatar fetch failed")
		}
		if len(body) > maxAvatarBytes {
			return e.String(http.StatusRequestEntityTooLarge, "avatar too large")
		}
		// The parse is the sniff: if utils/swf cannot walk it as a SWF
		// container, the sandbox does not get it. This is what stands between
		// "the avatars collection has no MIME check" and Ruffle.
		if _, err := swf.ParseBytes(body); err != nil {
			return e.String(http.StatusUnsupportedMediaType, "not a SWF")
		}

		e.Response.Header().Set("Cache-Control", "public, max-age=3600")
		e.Response.Header().Set("X-Content-Type-Options", "nosniff")
		return e.Blob(http.StatusOK, "application/x-shockwave-flash", body)
	})
}
