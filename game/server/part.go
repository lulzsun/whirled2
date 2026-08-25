package server

import (
	"log"
	"math"
	"regexp"
	"whirled2/utils"
	buf "whirled2/utils/proto"

	gecgosio "github.com/lulzsun/gecgos.io"
	"github.com/pocketbase/pocketbase/tools/security"
	"google.golang.org/protobuf/proto"
)

// Geometry limits for a builder part (room-building spec §6.2).
//
// This is the only place in the server where client-authored geometry gets
// in. Furniture is safe by construction -- the client sends an id and every
// other field is read back out of the database -- but a part has no backing
// row, so what arrives on the wire is all there is. Structural violations
// (an unknown shape) are refused; numbers are clamped, because a number
// slightly out of range is far more likely to be float drift than an attack,
// and refusing those would make the builder feel broken at the edges.
const (
	partMinScale = 0.05
	partMaxScale = 64.0

	// Room bounds. Generous -- the point is to stop a part being parked at
	// 1e30 where it breaks culling and the camera, not to fence the builder
	// in. The floor sits at y=0; parts may go somewhat below it so sunken
	// pools and thresholds are buildable.
	partMaxHorizontal = 256.0
	partMinHeight     = -16.0
	partMaxHeight     = 256.0

	partMinUVScale = 0.1
	partMaxUVScale = 16.0

	// How many built-in materials exist. Indices outside this are refused
	// rather than clamped: a part rendered in a material the builder did not
	// pick is a silently wrong result, not a near miss.
	partMaterialCount = 8

	partMaxGroupLen = 32
	partMaxNonceLen = 32
)

var partGroupPattern = regexp.MustCompile(`^[a-z0-9-]*$`)

// clampFloat holds v inside [min, max], mapping NaN to min.
//
// NaN needs saying out loud: every comparison against it is false, so a bare
// min/max pair would pass it straight through, and a NaN scale poisons the
// object's matrix and every bounding volume computed from it.
func clampFloat(v float64, min float64, max float64) float64 {
	if math.IsNaN(v) {
		return min
	}
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

// validatePart reports whether a part's description is structurally sound,
// clamping its numbers in place. A false return means the placement is
// refused outright.
func validatePart(obj *buf.Object) bool {
	part := obj.Part
	if part == nil {
		return false
	}
	if _, ok := buf.Shape_name[int32(part.Shape)]; !ok {
		return false
	}
	if part.Material >= partMaterialCount {
		return false
	}
	if len(part.Group) > partMaxGroupLen || !partGroupPattern.MatchString(part.Group) {
		return false
	}
	if len(obj.Nonce) > partMaxNonceLen {
		return false
	}

	// Colour is a 24-bit value in a 32-bit field; mask rather than refuse.
	part.Color &= 0xFFFFFF
	part.UvScale = float32(clampFloat(float64(part.UvScale), partMinUVScale, partMaxUVScale))

	// Scale is the part's size (spec §0.3), so an unclamped scale is an
	// unclamped part -- this is the same guard as a size limit.
	if obj.Scale == nil {
		obj.Scale = &buf.Scale{X: 1, Y: 1, Z: 1}
	}
	obj.Scale.X = clampFloat(obj.Scale.X, partMinScale, partMaxScale)
	obj.Scale.Y = clampFloat(obj.Scale.Y, partMinScale, partMaxScale)
	obj.Scale.Z = clampFloat(obj.Scale.Z, partMinScale, partMaxScale)

	if obj.Position == nil {
		obj.Position = &buf.Position{}
	}
	obj.Position.X = clampFloat(obj.Position.X, -partMaxHorizontal, partMaxHorizontal)
	obj.Position.Y = clampFloat(obj.Position.Y, partMinHeight, partMaxHeight)
	obj.Position.Z = clampFloat(obj.Position.Z, -partMaxHorizontal, partMaxHorizontal)

	if obj.Rotation == nil {
		obj.Rotation = &buf.Rotation{}
	}
	// Rotation rides in as Euler angles (the editor writes Euler; see the
	// client's TransformComponent), so there is nothing to normalise -- only
	// non-finite values to reject.
	for _, v := range []float64{obj.Rotation.X, obj.Rotation.Y, obj.Rotation.Z, obj.Rotation.W} {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return false
		}
	}
	return true
}

// countParts reports how many of a room's objects are builder parts.
// Callers must already hold objectsMu.
func countParts(roomId string) uint32 {
	var count uint32
	for _, object := range objects[roomId] {
		if object.Type == buf.Type_Primitive {
			count++
		}
	}
	return count
}

// roomCapacity reports how many parts a room may hold.
//
// Reads the constant for now. The purchasable per-room field arrives with
// the capacity economy (spec §4.3, M7); when it does, this is the one place
// that has to learn about it, and it deliberately reads fresh rather than
// caching so a purchase takes effect on the very next placement without a
// cache-invalidation channel between the HTTP and game sides.
func roomCapacity(roomId string) uint32 {
	return utils.RoomBaseCapacity
}

// denyObject tells one peer why its request went nowhere.
//
// Every refusal on this path used to be a bare return, which is
// indistinguishable from a dead button -- the same failure the removal
// button had to be rescued from. Placement is worse, because the client has
// already drawn a ghost it now has to take back.
func denyObject(peer *gecgosio.Peer, id string, reason buf.DenyReason) {
	data, err := proto.Marshal(&buf.WhirledEvent{
		Event: &buf.WhirledEvent_ObjectDenied{
			ObjectDenied: &buf.ObjectDenied{Id: id, Reason: reason},
		},
	})
	if err != nil {
		log.Printf("Failed to marshal ObjectDenied: %v", err)
		return
	}
	peer.Emit(data)
}

// emitRoomCapacity tells one peer how full the room is.
func emitRoomCapacity(peer *gecgosio.Peer, roomId string) {
	objectsMu.RLock()
	used := countParts(roomId)
	objectsMu.RUnlock()

	data, err := proto.Marshal(&buf.WhirledEvent{
		Event: &buf.WhirledEvent_RoomCapacity{
			RoomCapacity: &buf.RoomCapacity{
				Used:     used,
				Capacity: roomCapacity(roomId),
			},
		},
	})
	if err != nil {
		log.Printf("Failed to marshal RoomCapacity: %v", err)
		return
	}
	peer.Emit(data)
}

// onPartJoin handles a client placing a builder part.
//
// Unlike furniture, which the server rebuilds from the database and drops at
// the origin, a part arrives fully described and is placed where the client
// put it -- there is nowhere else to get that from. The id is minted here
// and never taken from the client: a part has no stuff row to verify against,
// so an id from the wire could collide with furniture already in the room.
func onPartJoin(peer *gecgosio.Peer, roomId string, obj *buf.Object) {
	if !validatePart(obj) {
		log.Printf("Refusing a part in room '%s': malformed description", roomId)
		denyObject(peer, obj.Nonce, buf.DenyReason_InvalidPart)
		return
	}

	objectsMu.RLock()
	used := countParts(roomId)
	objectsMu.RUnlock()
	if used >= roomCapacity(roomId) {
		log.Printf("Refusing a part in room '%s': at capacity (%d)", roomId, used)
		denyObject(peer, obj.Nonce, buf.DenyReason_CapacityFull)
		return
	}

	object := &buf.Object{
		Id:           security.RandomString(15),
		Type:         buf.Type_Primitive,
		Name:         buf.Shape_name[int32(obj.Part.Shape)],
		Position:     obj.Position,
		Rotation:     obj.Rotation,
		Scale:        obj.Scale,
		InitialScale: 1,
		Part:         obj.Part,
		Nonce:        obj.Nonce,
	}

	objectsMu.Lock()
	if _, ok := objects[roomId]; !ok {
		objects[roomId] = make(map[string]*buf.Object)
	}
	objects[roomId][object.Id] = object
	markRoomDirty(roomId)
	objectsMu.Unlock()

	data, err := proto.Marshal(&buf.WhirledEvent{
		Event: &buf.WhirledEvent_ObjectJoin{
			ObjectJoin: &buf.ObjectJoin{Object: object},
		},
	})
	if err != nil {
		log.Printf("Failed to marshal a part joining room '%s': %v", roomId, err)
		return
	}
	log.Printf("Part '%s' (%s) is joining room '%s'", object.Id, object.Name, roomId)
	peer.Room().Emit(data)
	emitRoomCapacity(peer, roomId)
}
