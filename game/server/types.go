package server

import (
	"time"

	buf "whirled2/utils/proto"

	gecgosio "github.com/lulzsun/gecgos.io"
)

type Client struct {
	Peer     *gecgosio.Peer
	Auth     string
	Username string
	Nickname string
	File     string

	// RoomId and IsRoomOwner are resolved once, during onPlayerAuth, and
	// cached for the life of the connection. Every object mutation used to
	// re-derive ownership with its own `rooms INNER JOIN users` query, and
	// transforms arrive once per mouse-move -- so dragging a single piece of
	// furniture ran a query per frame. Ownership cannot change mid-session
	// without the room record changing under us, which requires a rejoin to
	// observe anyway. Read them through canEditRoom, never directly: the
	// cached flag only speaks for RoomId.
	RoomId      string
	IsRoomOwner bool

	// Transform budget. onObjectTransform is the one handler a client can
	// drive as fast as it can emit, so it gets a token bucket -- see
	// spendTransformToken.
	transformTokens  float64
	transformSpentAt time.Time

	Position     *buf.Position
	Rotation     *buf.Rotation
	Scale        *buf.Scale
	InitialScale float64
}
