package server

import (
	"log"

	gecgosio "github.com/lulzsun/gecgos.io"
)

func onObjectJoin(peer *gecgosio.Peer, msg string) {
	client := clients[peer.Id]
	log.Println(client)
	peer.Broadcast().Emit(PlayerAnim, msg);
}