package server

import gecgosio "github.com/lulzsun/gecgos.io"

type Client struct {
    Peer *gecgosio.Peer
	Auth string
	Username string
	Nickname string

	Position Position
	Rotation Rotation
	Scale Scale
	InitialScale int
}

type Object struct {
	Id string			`db:"id" json:"id"`
	Type int			`db:"type" json:"type"`
	StuffId string		`db:"stuff_id" json:"stuff_id"`
	Name string			`db:"name" json:"name"`
	File string			`db:"file" json:"file"`

	Position Position	`db:"position" json:"position"`
	Rotation Rotation	`db:"rotation" json:"rotation"`
	Scale Scale			`db:"scale" json:"scale"`
	InitialScale int	`db:"initialScale" json:"initialScale"`
}

type Position struct {
	X float64			`db:"x" json:"x"`
	Y float64			`db:"y" json:"y"`
	Z float64			`db:"z" json:"z"`
}

type Rotation struct {
	X float64			`db:"x" json:"x"`
	Y float64			`db:"y" json:"y"`
	Z float64			`db:"z" json:"z"`
	W float64			`db:"w" json:"w"`
}

type Scale struct {
	X float64			`db:"x" json:"x"`
	Y float64			`db:"y" json:"y"`
	Z float64			`db:"z" json:"z"`
}

const ( // god this is fucking awful, figure out how to use protobufs
	PlayerAuth	 		= "0"
	PlayerJoin			= "1"
	PlayerLeave			= "2"
	PlayerMove			= "3"
	PlayerChat			= "4"
	PlayerAnim			= "5"

	ObjectJoin			= "6"
	ObjectLeave			= "7"
	ObjectTransform		= "8"
)