package server

import (
	"strings"
	"time"

	"github.com/pocketbase/dbx"
)

// Transform budget, per connection. A gizmo drag emits at roughly 15 Hz
// (see the client's TRANSFORM_EMIT_INTERVAL), so 20/s leaves headroom for a
// drag plus incidental traffic while still bounding what a client that
// ignores the throttle can cost us. The burst covers a drag that starts
// mid-second; a drag always ends with an unthrottled authoritative emit, so
// dropping the odd intermediate frame only costs smoothness for observers,
// never correctness.
const (
	transformTokensPerSecond = 20.0
	transformTokenBurst      = 40.0
)

// resolveRoomOwner reports whether username owns roomId.
//
// The default room ("@underwhirled") and anything else prefixed with '@' is a
// server-owned room with no rooms row: nobody owns it, so nobody may edit it.
func resolveRoomOwner(roomId string, username string) bool {
	if roomId == "" || username == "" || strings.HasPrefix(roomId, "@") {
		return false
	}
	err := pb.DB().
		NewQuery(`
			SELECT r.id
			FROM rooms r
			INNER JOIN users u ON r.owner_id = u.id
			WHERE r.id = {:roomId} AND u.username = {:username}
		`).
		Bind(dbx.Params{
			"roomId":   roomId,
			"username": username,
		}).One(&struct{}{})
	return err == nil
}

// canEditRoom reports whether client may mutate the contents of roomId.
//
// The cached ownership flag is only meaningful for the room it was resolved
// against, so the room is compared too rather than trusted from the caller.
// A peer is only ever in one room (every handler already assumes this via
// peer.Rooms()[0]), so a mismatch means something has drifted -- deny.
func canEditRoom(client *Client, roomId string) bool {
	return client != nil && client.IsRoomOwner && client.RoomId == roomId
}

// spendTransformToken takes one token from the client's transform budget,
// reporting whether there was one to take. Refills continuously rather than
// on a tick, so a client that pauses mid-drag is not penalised for it.
func spendTransformToken(client *Client) bool {
	now := time.Now()
	if client.transformSpentAt.IsZero() {
		client.transformTokens = transformTokenBurst
	} else {
		client.transformTokens += now.Sub(client.transformSpentAt).Seconds() * transformTokensPerSecond
		if client.transformTokens > transformTokenBurst {
			client.transformTokens = transformTokenBurst
		}
	}
	client.transformSpentAt = now

	if client.transformTokens < 1 {
		return false
	}
	client.transformTokens--
	return true
}
