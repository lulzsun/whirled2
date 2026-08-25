package server

import (
	"testing"
	"time"
)

// The transform budget is the only thing standing between a client that
// ignores the emit throttle and an unbounded broadcast loop, and no normal
// client ever reaches it -- the editor holds itself to 15 Hz against a 20/s
// budget. So it is exercised here or not at all.
func TestSpendTransformTokenBurstThenRefills(t *testing.T) {
	client := &Client{}

	// A fresh client starts with a full burst and nothing else.
	for i := 0; i < transformTokenBurst; i++ {
		if !spendTransformToken(client) {
			t.Fatalf("token %d of the initial burst was refused", i+1)
		}
	}
	if spendTransformToken(client) {
		t.Fatal("budget allowed a spend beyond the burst")
	}

	// Refill is continuous rather than ticked, so a pause buys tokens in
	// proportion to its length: 100ms at 20/s is 2.
	time.Sleep(100 * time.Millisecond)
	granted := 0
	for i := 0; i < 10; i++ {
		if spendTransformToken(client) {
			granted++
		}
	}
	if granted < 1 || granted > 4 {
		t.Fatalf("100ms should refill about 2 tokens, got %d", granted)
	}
}

// A long idle must not bank an unbounded number of tokens -- otherwise a
// client could sit still and then spend a whole session's budget at once.
func TestSpendTransformTokenCapsAtBurst(t *testing.T) {
	client := &Client{}
	client.transformTokens = 0
	client.transformSpentAt = time.Now().Add(-1 * time.Hour)

	granted := 0
	for i := 0; i < transformTokenBurst*3; i++ {
		if spendTransformToken(client) {
			granted++
		}
	}
	if granted != transformTokenBurst {
		t.Fatalf("an hour idle granted %d tokens, want the burst cap of %d", granted, int(transformTokenBurst))
	}
}
