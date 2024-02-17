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