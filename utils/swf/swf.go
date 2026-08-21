// Package swf parses just enough of the SWF container to answer the questions
// whirled2 needs to ask about an uploaded avatar: is it AVM1 or AVM2, does it
// speak the Whirled SDK control protocol, and what frame labels does its
// timeline expose?
//
// This is deliberately not a full SWF parser. It walks the tag stream, reads
// the handful of tags that matter, and skips everything else. See
// docs/specs/swf-avatar-rendering.md (§5 W1b, §7).
package swf

import (
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"strings"
)

// Tag codes we care about. Everything else is skipped by length.
const (
	tagEnd          = 0
	tagShowFrame    = 1
	tagDoAction     = 12
	tagDefineSprite = 39
	tagFrameLabel   = 43
	tagDoInitAction = 59
	tagFileAttrs    = 69
	tagDoABC        = 72
	tagSymbolClass  = 76
	tagDoABC2       = 82
)

// maxBodySize caps decompression so a malicious upload cannot exhaust memory.
// Whirled avatars are tens to hundreds of KB; 64 MiB is far past any real file.
const maxBodySize = 64 << 20

// ScriptKind is which ActionScript virtual machine the file targets.
type ScriptKind string

const (
	// ScriptNone means no bytecode at all: a pure timeline animation.
	ScriptNone ScriptKind = "none"
	// ScriptAVM1 means ActionScript 1/2 bytecode (DoAction / DoInitAction).
	ScriptAVM1 ScriptKind = "avm1"
	// ScriptAVM2 means ActionScript 3 bytecode (DoABC / SymbolClass, or the
	// FileAttributes ActionScript3 flag).
	ScriptAVM2 ScriptKind = "avm2"
)

// ControlTier is how a given file can be driven in-world. It maps directly
// onto the workstreams in the spec.
type ControlTier string

const (
	// TierSDK is an AS3 avatar built with the Whirled SDK. Driven through the
	// controlConnect host shim (W1). This is the good case.
	TierSDK ControlTier = "sdk"
	// TierExternal is a file that registered its own ExternalInterface
	// callbacks — the hand-patched avatars the current pipeline requires.
	TierExternal ControlTier = "external"
	// TierLabels is a file with no usable control protocol but with timeline
	// frame labels we can seek between (W1b).
	TierLabels ControlTier = "labels"
	// TierStatic is a file we can render but cannot drive at all. It plays its
	// own timeline and ignores state changes.
	TierStatic ControlTier = "static"
)

// Label is a named frame on a timeline.
type Label struct {
	Name  string `json:"name"`
	Frame int    `json:"frame"`
	// Anchor is the SWF6+ named-anchor flag. Rare; recorded for completeness.
	Anchor bool `json:"anchor,omitempty"`
}

// Info is everything we learned about one SWF.
type Info struct {
	Signature  string `json:"signature"` // FWS, CWS or ZWS
	Version    int    `json:"version"`
	FileLength uint32 `json:"fileLength"` // as claimed by the header
	BodyLength int    `json:"bodyLength"` // uncompressed, as measured

	WidthPx    float64 `json:"widthPx"`
	HeightPx   float64 `json:"heightPx"`
	FrameRate  float64 `json:"frameRate"`
	FrameCount int     `json:"frameCount"` // as claimed by the header

	Script ScriptKind  `json:"script"`
	Tier   ControlTier `json:"tier"`

	// UsesFileAttrsAS3 records whether the AVM2 verdict came from the
	// FileAttributes tag rather than from finding actual bytecode.
	UsesFileAttrsAS3 bool `json:"usesFileAttrsAs3"`

	// HasWhirledSDK is true when Whirled SDK symbols are present.
	HasWhirledSDK bool `json:"hasWhirledSdk"`
	// HasAvatarControl is true when the AvatarControl class specifically is
	// referenced — i.e. this is an avatar rather than some other Whirled item.
	HasAvatarControl bool `json:"hasAvatarControl"`
	// HasExternalInterface is true for the hand-patched files.
	HasExternalInterface bool `json:"hasExternalInterface"`

	// RootLabels are frame labels on the main timeline. These are what W1b's
	// frame-label control path can actually seek to.
	RootLabels []Label `json:"rootLabels"`
	// SpriteLabels are frame labels found inside DefineSprite tags, keyed by
	// sprite id. Avatar states are sometimes nested one level down.
	SpriteLabels map[uint16][]Label `json:"spriteLabels,omitempty"`

	// Truncated is set when the tag stream ended early or was malformed. The
	// rest of Info is still populated with whatever was read before that.
	Truncated bool   `json:"truncated,omitempty"`
	Warning   string `json:"warning,omitempty"`
}

// LabelNames returns every root label name, in timeline order.
func (i *Info) LabelNames() []string {
	names := make([]string, 0, len(i.RootLabels))
	for _, l := range i.RootLabels {
		names = append(names, l.Name)
	}
	return names
}

// AllLabelNames returns root plus nested sprite label names, deduplicated.
func (i *Info) AllLabelNames() []string {
	seen := map[string]bool{}
	var names []string
	add := func(l Label) {
		if !seen[l.Name] {
			seen[l.Name] = true
			names = append(names, l.Name)
		}
	}
	for _, l := range i.RootLabels {
		add(l)
	}
	for _, labels := range i.SpriteLabels {
		for _, l := range labels {
			add(l)
		}
	}
	return names
}

// ErrNotSWF is returned when the file does not start with a SWF signature.
var ErrNotSWF = errors.New("swf: not a SWF file (bad signature)")

// ErrLZMA is returned for ZWS (LZMA-compressed) files, which we cannot
// decompress without pulling in a third-party LZMA dependency. Whirled-era
// content predates ZWS, so this is expected to be rare.
var ErrLZMA = errors.New("swf: LZMA-compressed (ZWS) files are not supported")

// Parse reads a SWF and reports what whirled2 needs to know about it.
func Parse(r io.Reader) (*Info, error) {
	raw, err := io.ReadAll(io.LimitReader(r, maxBodySize))
	if err != nil {
		return nil, fmt.Errorf("swf: read: %w", err)
	}
	if len(raw) < 8 {
		return nil, ErrNotSWF
	}

	sig := string(raw[0:3])
	if sig != "FWS" && sig != "CWS" && sig != "ZWS" {
		return nil, ErrNotSWF
	}

	info := &Info{
		Signature:  sig,
		Version:    int(raw[3]),
		FileLength: binary.LittleEndian.Uint32(raw[4:8]),
	}

	var body []byte
	switch sig {
	case "FWS":
		body = raw[8:]
	case "CWS":
		zr, err := zlib.NewReader(bytes.NewReader(raw[8:]))
		if err != nil {
			return info, fmt.Errorf("swf: zlib: %w", err)
		}
		defer zr.Close()
		body, err = io.ReadAll(io.LimitReader(zr, maxBodySize))
		if err != nil {
			return info, fmt.Errorf("swf: inflate: %w", err)
		}
	case "ZWS":
		return info, ErrLZMA
	}
	info.BodyLength = len(body)

	if err := parseBody(body, info); err != nil {
		return info, err
	}
	classify(body, info)
	return info, nil
}

// ParseFile is a convenience wrapper around Parse.
func ParseBytes(b []byte) (*Info, error) { return Parse(bytes.NewReader(b)) }

func parseBody(body []byte, info *Info) error {
	br := &bitReader{buf: body}

	xmin, xmax, ymin, ymax, err := br.readRect()
	if err != nil {
		return fmt.Errorf("swf: frame size: %w", err)
	}
	// SWF rects are in twips (1/20th of a pixel).
	info.WidthPx = float64(xmax-xmin) / 20
	info.HeightPx = float64(ymax-ymin) / 20

	rate, ok := br.readU16()
	if !ok {
		return errors.New("swf: truncated before frame rate")
	}
	// Frame rate is an 8.8 fixed-point value.
	info.FrameRate = float64(rate) / 256

	count, ok := br.readU16()
	if !ok {
		return errors.New("swf: truncated before frame count")
	}
	info.FrameCount = int(count)

	walkTags(br, info, 0)
	return nil
}

// walkTags iterates a tag stream, recording what we care about. depth guards
// the single level of DefineSprite recursion we do.
func walkTags(br *bitReader, info *Info, depth int) {
	frame := 0
	for {
		codeAndLen, ok := br.readU16()
		if !ok {
			if depth == 0 {
				info.Truncated = true
			}
			return
		}
		code := codeAndLen >> 6
		length := int(codeAndLen & 0x3f)
		if length == 0x3f {
			l32, ok := br.readU32()
			if !ok {
				info.Truncated = true
				return
			}
			// A tag longer than the remaining buffer is malformed.
			if l32 > uint32(maxBodySize) {
				info.Truncated = true
				return
			}
			length = int(l32)
		}

		if code == tagEnd {
			return
		}

		payload, ok := br.readBytes(length)
		if !ok {
			info.Truncated = true
			return
		}

		switch code {
		case tagShowFrame:
			frame++

		case tagFrameLabel:
			name, rest := readCString(payload)
			if name == "" {
				break
			}
			label := Label{Name: name, Frame: frame}
			// A single trailing 1 byte marks a named anchor (SWF 6+).
			if len(rest) == 1 && rest[0] == 1 {
				label.Anchor = true
			}
			// At depth > 0 this collects into a scratch Info that the
			// DefineSprite case attributes to its sprite id.
			info.RootLabels = append(info.RootLabels, label)

		case tagDefineSprite:
			if depth > 0 || len(payload) < 4 {
				break
			}
			spriteID := binary.LittleEndian.Uint16(payload[0:2])
			// payload[2:4] is the sprite's own frame count.
			nested := &Info{}
			walkTags(&bitReader{buf: payload[4:]}, nested, depth+1)
			if len(nested.RootLabels) > 0 {
				if info.SpriteLabels == nil {
					info.SpriteLabels = map[uint16][]Label{}
				}
				info.SpriteLabels[spriteID] = nested.RootLabels
			}

		case tagFileAttrs:
			if len(payload) < 1 {
				break
			}
			// Bit fields are packed MSB-first:
			//   Reserved, UseDirectBlit, UseGPU, HasMetadata,
			//   ActionScript3, Reserved(2), UseNetwork
			if payload[0]>>3&1 == 1 {
				info.Script = ScriptAVM2
				info.UsesFileAttrsAS3 = true
			}

		case tagDoABC, tagDoABC2, tagSymbolClass:
			info.Script = ScriptAVM2

		case tagDoAction, tagDoInitAction:
			// Never downgrade an AVM2 verdict: an AS3 file can still carry
			// stray AVM1 tags, but the reverse is not true.
			if info.Script != ScriptAVM2 {
				info.Script = ScriptAVM1
			}
		}
	}
}

// classify fills in Script (if still unset) and the control tier. The SDK and
// ExternalInterface checks are substring scans over the decompressed body,
// which is how these symbols show up in both the ABC constant pool and the
// AVM1 string table.
func classify(body []byte, info *Info) {
	if info.Script == "" {
		info.Script = ScriptNone
	}

	info.HasWhirledSDK = bytes.Contains(body, []byte("com.whirled"))
	info.HasAvatarControl = bytes.Contains(body, []byte("AvatarControl"))
	info.HasExternalInterface = bytes.Contains(body, []byte("ExternalInterface")) &&
		bytes.Contains(body, []byte("addCallback"))

	switch {
	case info.HasExternalInterface:
		info.Tier = TierExternal
	case info.Script == ScriptAVM2 && (info.HasWhirledSDK || info.HasAvatarControl):
		info.Tier = TierSDK
	case len(info.AllLabelNames()) > 0:
		info.Tier = TierLabels
	default:
		info.Tier = TierStatic
	}

	if info.Script != ScriptAVM2 && (info.HasWhirledSDK || info.HasAvatarControl) {
		info.Warning = "references the Whirled SDK but is not AVM2; " +
			"the controlConnect shim cannot connect to it"
	}
}

// NormalizeLabel reduces a frame label or animation name to a comparable form,
// mirroring the /^(action|state)_/i stripping the client already does in
// SwfAssetManager. Used by the W1b label matcher.
func NormalizeLabel(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	for _, prefix := range []string{"state_", "action_", "state-", "action-"} {
		s = strings.TrimPrefix(s, prefix)
	}
	return strings.NewReplacer(" ", "", "-", "", "_", "").Replace(s)
}

// bitReader is a little cursor over the SWF body with the bit-level reads the
// RECT structure needs.
type bitReader struct {
	buf []byte
	pos int
}

func (b *bitReader) readBytes(n int) ([]byte, bool) {
	if n < 0 || b.pos+n > len(b.buf) {
		return nil, false
	}
	out := b.buf[b.pos : b.pos+n]
	b.pos += n
	return out, true
}

func (b *bitReader) readU16() (uint16, bool) {
	v, ok := b.readBytes(2)
	if !ok {
		return 0, false
	}
	return binary.LittleEndian.Uint16(v), true
}

func (b *bitReader) readU32() (uint32, bool) {
	v, ok := b.readBytes(4)
	if !ok {
		return 0, false
	}
	return binary.LittleEndian.Uint32(v), true
}

// readRect reads a SWF RECT: a 5-bit width followed by four signed fields of
// that width. Returns twips.
func (b *bitReader) readRect() (xmin, xmax, ymin, ymax int32, err error) {
	if b.pos >= len(b.buf) {
		return 0, 0, 0, 0, io.ErrUnexpectedEOF
	}
	bitPos := 0
	readBits := func(n int) (int32, error) {
		var v uint32
		for i := 0; i < n; i++ {
			byteIdx := b.pos + bitPos/8
			if byteIdx >= len(b.buf) {
				return 0, io.ErrUnexpectedEOF
			}
			bit := (b.buf[byteIdx] >> (7 - bitPos%8)) & 1
			v = v<<1 | uint32(bit)
			bitPos++
		}
		// Sign-extend.
		if n > 0 && v&(1<<(n-1)) != 0 {
			return int32(v | (^uint32(0))<<n), nil
		}
		return int32(v), nil
	}

	nbits32, err := readBits(5)
	if err != nil {
		return
	}
	nbits := int(nbits32)
	if nbits < 0 || nbits > 31 {
		return 0, 0, 0, 0, errors.New("swf: bad RECT bit width")
	}
	if xmin, err = readBits(nbits); err != nil {
		return
	}
	if xmax, err = readBits(nbits); err != nil {
		return
	}
	if ymin, err = readBits(nbits); err != nil {
		return
	}
	if ymax, err = readBits(nbits); err != nil {
		return
	}

	// Advance the byte cursor past the (padded) rect.
	b.pos += (bitPos + 7) / 8
	return
}

// readCString splits a null-terminated string off the front of a payload.
func readCString(b []byte) (string, []byte) {
	i := bytes.IndexByte(b, 0)
	if i < 0 {
		return string(b), nil
	}
	return string(b[:i]), b[i+1:]
}
