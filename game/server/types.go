package server

import (
	buf "whirled2/utils/proto"

	gecgosio "github.com/lulzsun/gecgos.io"
)

type Client struct {
	Peer     *gecgosio.Peer
	Auth     string
	Username string
	Nickname string
	File     string

	Position     *buf.Position
	Rotation     *buf.Rotation
	Scale        *buf.Scale
	InitialScale float64
}
