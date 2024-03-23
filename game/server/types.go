package server

import gecgosio "github.com/lulzsun/gecgos.io"

type Client struct {
    Peer *gecgosio.Peer
	Auth string
	Username string
	Nickname string
	Position Position
	Rotation Rotation
}

type Position struct {
	X float64
	Y float64
	Z float64
}

type Rotation struct {
	X float64
	Y float64
	Z float64
	W float64
}

const ( // god this is fucking awful, figure out how to use protobufs
	PlayerAuth	 		= "0"
	PlayerJoin			= "1"
	PlayerLeave			= "2"
	PlayerMove			= "3"
	PlayerChat			= "4"
	PlayerAnim			= "5"
)