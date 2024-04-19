package utils

// https://github.com/superfly/tired-proxy/blob/7885ca9aa1425caceb3aa555668c9cac41dc349c/main.go

import (
	"log"
	"net"
	"os"
	"strconv"
	"time"

	"github.com/labstack/echo/v5"
)

type IdleTracker struct {
	active map[net.Conn]bool
	idle   time.Duration
	timer  *time.Timer
}

func NewIdleTracker(idle time.Duration) *IdleTracker {
	return &IdleTracker{
		active: make(map[net.Conn]bool),
		idle:   idle,
		timer:  time.NewTimer(idle),
	}
}

func (t *IdleTracker) Done() <-chan time.Time {
	return t.timer.C
}

var idle *IdleTracker

// Starts an idle timer for IDLE_MINUTES to stop the application
//
// This is used during fly.io to automatically stop the machine if it idles,
// in order to save money on compute time. Lets hope that we don't need to
// use this in the future. :)
func Start() {
	minutes, err := strconv.Atoi(os.Getenv("IDLE_MINUTES"))
	if err != nil || minutes <= 0 {
		return
	}

	idle = NewIdleTracker(time.Duration(minutes * 60) * time.Second)
	log.Printf("Configured idle tracker for %d minutes", minutes)

	go func() {
		<-idle.Done()
		log.Println("Machine idling for too long. Shutting down server.")
		os.Exit(0)
	}()
}

// Resets Idle timer if a request has been made
func IdleMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		IdleTimerReset()
		return next(c)
	}
}

func IdleTimerReset() {
	if idle == nil {
		return
	}
	idle.timer.Reset(idle.idle)
}