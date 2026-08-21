package swf

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// fixtures are the SWF avatars committed to the repo. They are stock Whirled
// SDK avatars, which makes them the reference case for the W1 host shim.
const fixtureDir = "../../web/static/assets/avatars"

func parseFixture(t *testing.T, name string) *Info {
	t.Helper()
	f, err := os.Open(filepath.Join(fixtureDir, name))
	if err != nil {
		t.Skipf("fixture %s unavailable: %v", name, err)
	}
	defer f.Close()

	info, err := Parse(f)
	if err != nil {
		t.Fatalf("Parse(%s): %v", name, err)
	}
	return info
}

func TestParseStockAvatars(t *testing.T) {
	tests := []struct {
		file   string
		width  float64
		height float64
	}{
		{"guest.swf", 200, 200},
		{"member.swf", 200, 150},
	}

	for _, tt := range tests {
		t.Run(tt.file, func(t *testing.T) {
			info := parseFixture(t, tt.file)

			if info.Signature != "CWS" {
				t.Errorf("Signature = %q, want CWS", info.Signature)
			}
			if info.WidthPx != tt.width || info.HeightPx != tt.height {
				t.Errorf("size = %.0fx%.0f, want %.0fx%.0f",
					info.WidthPx, info.HeightPx, tt.width, tt.height)
			}
			if info.FrameRate <= 0 || info.FrameRate > 120 {
				t.Errorf("FrameRate = %v, want a plausible rate", info.FrameRate)
			}
			if info.Truncated {
				t.Error("Truncated = true, want a clean walk of the tag stream")
			}

			// The whole premise of W1: stock SDK avatars are AVM2, reference
			// the Whirled SDK, and register no ExternalInterface callbacks of
			// their own. If this ever fails, §4.2 of the spec is wrong.
			if info.Script != ScriptAVM2 {
				t.Errorf("Script = %q, want %q", info.Script, ScriptAVM2)
			}
			if !info.HasWhirledSDK {
				t.Error("HasWhirledSDK = false, want true")
			}
			if info.HasExternalInterface {
				t.Error("HasExternalInterface = true; stock avatars should not register callbacks")
			}
			if info.Tier != TierSDK {
				t.Errorf("Tier = %q, want %q", info.Tier, TierSDK)
			}
		})
	}
}

func TestParseRejectsNonSWF(t *testing.T) {
	for _, in := range []string{"", "no", "GIF89a and then some"} {
		if _, err := ParseBytes([]byte(in)); err != ErrNotSWF {
			t.Errorf("ParseBytes(%q) error = %v, want ErrNotSWF", in, err)
		}
	}
}

func TestParseRejectsTruncatedHeader(t *testing.T) {
	// Valid signature, but nothing after it.
	if _, err := ParseBytes([]byte("FWS")); err != ErrNotSWF {
		t.Errorf("error = %v, want ErrNotSWF", err)
	}
}

func TestParseReportsLZMAUnsupported(t *testing.T) {
	// ZWS header with 8 bytes so it gets past the length check.
	body := append([]byte("ZWS\x0d"), 0, 0, 0, 0)
	info, err := ParseBytes(body)
	if err != ErrLZMA {
		t.Fatalf("error = %v, want ErrLZMA", err)
	}
	// Header fields read before the compression check should still be set.
	if info == nil || info.Signature != "ZWS" {
		t.Error("want partial Info with Signature ZWS")
	}
}

func TestNormalizeLabel(t *testing.T) {
	tests := []struct{ in, want string }{
		{"idle", "idle"},
		{"Idle", "idle"},
		{"state_idle", "idle"},
		{"STATE_Idle", "idle"},
		{"action_dance", "dance"},
		{"walk_loop", "walkloop"},
		{"  Walk Loop  ", "walkloop"},
		{"sword_lt_1", "swordlt1"},
	}
	for _, tt := range tests {
		if got := NormalizeLabel(tt.in); got != tt.want {
			t.Errorf("NormalizeLabel(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestLabelNamesPreserveTimelineOrder(t *testing.T) {
	info := &Info{RootLabels: []Label{
		{Name: "b", Frame: 5},
		{Name: "a", Frame: 1},
	}}
	got := strings.Join(info.LabelNames(), ",")
	if got != "b,a" {
		t.Errorf("LabelNames() = %q, want timeline order %q", got, "b,a")
	}
}

func TestAllLabelNamesDeduplicates(t *testing.T) {
	info := &Info{
		RootLabels:   []Label{{Name: "idle"}},
		SpriteLabels: map[uint16][]Label{1: {{Name: "idle"}, {Name: "walk"}}},
	}
	got := info.AllLabelNames()
	if len(got) != 2 || got[0] != "idle" || got[1] != "walk" {
		t.Errorf("AllLabelNames() = %v, want [idle walk]", got)
	}
}
