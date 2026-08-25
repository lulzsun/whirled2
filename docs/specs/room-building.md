# Spec: Room building with primitive parts

Status: **in progress** — M1 landed; M2 next
Owner: @lulzsun
Last updated: 2026-08-24

## 0. Decisions

Settled in planning, 2026-08-24:

1. **Parts, not floorplans.** The builder is Roblox/Rec Room-shaped: a
   palette of primitive solids (box, wedge, cylinder, ...) that the owner
   places, moves, rotates, and scales freely. There is no wall tool and no
   floor tool — a wall is a part someone scaled thin. A Sims-style
   floorplan mode is explicitly out (§3).
2. **A primitive is an object whose "file" is a parameter set.** Primitives
   ride the existing `Object` replication path (`ObjectJoin` /
   `ObjectTransform` / `ObjectLeave`) and persist in the existing
   `rooms.objects` JSON blob. No second sync path, no second storage path,
   and — because a primitive carries no user bytes — no upload boundary.
3. **Size is scale.** Every shape is unit geometry; a part's dimensions are
   its `Scale`. The existing scale gizmo _is_ the resize tool.
4. **The economy is capacity, not per-part pricing.** Each room has a part
   capacity; placing a part consumes a slot, deleting frees it. Coins buy
   permanent capacity expansions for a room — a true burn (coins leave the
   supply, unlike item purchases, which are transfers — see
   shop-currency.md §4). Iteration inside the budget is free: place,
   nudge, delete, and rebuild cost nothing. Per-instance or per-volume
   pricing was considered and rejected — it taxes exactly the
   place/nudge/delete loop the tool lives on, and pricing by volume tells
   players to prefer many small parts over one large one, which is
   backwards from real cost (draw calls, raycasts, blob size all track
   part _count_).
5. **Parts write depth.** Solid geometry must occlude normally. This means
   a player-built floor _will_ clip the below-hotspot drop shadow of a SWF
   avatar standing on it, which the room's own floor deliberately does not
   (see the `depthWrite: false` comment in `factory/world.ts` and
   swf-avatar-rendering.md). Accepted for v1; revisit only if it reads as
   a bug in practice.
6. **Build and Play are hard-separated modes.** They never share a cursor.
   In Play, parts are walk targets and obstacles, never selectables; in
   Build, click-to-move is off. (Roblox and Rec Room both do this.)
7. **Server generates part ids.** Furniture ids are `stuff` row ids the
   server can verify; a primitive has no backing row, so the id must be
   minted server-side. The client never supplies one.
8. **Undo lands before the palette.** The command stack is a prerequisite
   milestone, not a follow-up; retrofitting one under a live editor is
   miserable, and nobody builds a 300-part structure without it.

## 1. Summary

Room owners can currently place only owned inventory items (`stuff` rows)
into their room, positioned with a select + `TransformControls` editor. This
spec adds **primitive parts**: server-validated, parameter-defined solids
that make walls, floors, platforms, and whole structures buildable in-world
with Roblox-Studio-style snapping, multi-select, grouping, and undo — plus
the **capacity economy** that turns building into the game's first scalable
coin sink.

It also fixes the transform pipeline the builder would otherwise fall over
on: today every gizmo mouse-move emits a network event that triggers a SQL
ownership query on the server, and a room only saves to the database when
its last occupant leaves.

## 2. Goals

-   **G1** — A room owner can place, move, rotate, scale, recolor, and
    delete primitive parts in their room; other occupants see every change
    live; everything survives a server restart.
-   **G2** — Building feels like Studio: grid snap with cycling increments,
    absolute-position rounding, Alt for free placement, surface-flush
    placement on existing geometry.
-   **G3** — Undo/redo covers every build action, including ones already
    possible today (moving furniture).
-   **G4** — Each room has a part capacity; expansions are bought with
    coins through the existing wallet/ledger machinery (shop-currency.md
    G4/G5 apply: server-side, transactional, append-only ledger).
-   **G5** — A malicious client cannot: place parts in a room it does not
    own, exceed capacity, submit out-of-range geometry, forge part ids, or
    spend anyone else's coins.
-   **G6** — 500 parts in a room renders and edits at frame rate on a
    mid-range desktop; the transform path no longer performs per-mousemove
    SQL.

## 3. Non-goals

-   **Floorplan / wall-drag tool** (Sims-style). Different product; parts
    cover the need for v1.
-   **CSG** (unions/negations), **voxel building**, **physics simulation**,
    **structural integrity**. Out entirely.
-   **Per-face materials.** The schema leaves room (§5.2), v1 ships one
    material per part.
-   **Edge/vertex snapping.** Grid + surface snap first; edge snap is a lot
    of code for the last 5% of precision.
-   **Group → furniture item** (save a built structure as a sellable
    inventory item). The highest-leverage follow-up — UGC without an upload
    pipeline — and `Primitive.group` (§5.2) exists to enable it, but it
    needs its own spec: it touches `stuff`/`furniture`/shop, and the
    capacity question (does placing a bought 40-part structure consume 40
    slots? yes, it must, or building-to-sell becomes capacity arbitrage)
    deserves its own treatment.
-   **Premium materials as owned items** (the Habbo wallpaper model).
    Planned second sink; the `material` enum makes room for gated entries
    later.
-   **Multi-storey helpers, ceilings/lighting tools.** Parts can already
    build these manually.

## 4. Capacity economy

### 4.1 Model

| Constant           | Value | Notes                                    |
| ------------------ | ----- | ---------------------------------------- |
| `RoomBaseCapacity` | 100   | Every room, free. Enough for a real room |
| `RoomExpandStep`   | +100  | Parts per expansion purchase             |
| `RoomExpandPrice`  | 500   | Coins, burned (no recipient)             |
| `RoomCapacityMax`  | 2000  | Hard ceiling — a perf cap, not economic  |

All four live as tunable constants in `utils/economy.go` beside the faucet
amounts, per shop-currency.md §4.

Against current faucets (1,000 signup / 100 daily): the free tier means
day-one players build immediately; a maxed room (19 expansions = 9,500
coins) is a long-term goal, ~3 months of daily play — appropriate for a
permanent per-room upgrade. Expansions are flat-priced; escalating curves
punish exactly the invested builders the feature exists for.

Deleting a part frees its slot immediately. Capacity is per-room and
permanent; it is never refunded (rooms are not deletable by users today —
if that changes, capacity dies with the room, like Habbo room upgrades).

### 4.2 Ledger

New transaction type in the `utils/economy.go` enum: `TxRoomExpand`. The
ledger row's `ref_id` is the room id, `note` records the new capacity
(`"expand to 300"`). Burn means: one `AdjustCoins` debit, no matching
credit — same shape as `TxListingFee`.

### 4.3 Purchase flow

Expansion is an htmx route, not a game-server event — it is a wallet
mutation and belongs on the authed HTTP side with the other economy routes:

```
POST /room/{id}/expand
```

Server-side, in one transaction: verify `owner_id` is the authed user,
read current `part_capacity`, refuse at `RoomCapacityMax`, call
`utils.AdjustCoins(user, -RoomExpandPrice, TxRoomExpand, roomId, note)`
(its `coins + amount >= 0` guard already handles insufficient funds
atomically), then `part_capacity += RoomExpandStep`. Returns the updated
capacity fragment for htmx swap.

The game server reads `part_capacity` fresh from the DB inside
`onObjectJoin`'s validation (§6.2), so a purchase takes effect on the next
placement with no cache-invalidation channel between the HTTP and game
sides.

### 4.4 UI

-   Build-mode toolbar shows `parts used / capacity` (from `RoomCapacity`
    events, §5.1) with an **Expand** button when the viewer owns the room —
    opens the standard confirm flow against `POST /room/{id}/expand`.
-   A denied placement (capacity or otherwise) must be visible feedback,
    never a silent no-op — the silent-failure class of bug is already
    documented in `editor.ts` and `object.go` comments. See `ObjectDenied`,
    §5.1.

## 5. Data model

### 5.1 Protobuf

```proto
enum Type {
    None = 0;
    Avatar = 1;
    Furniture = 2;
    Primitive = 3;
}

enum Shape {
    Box = 0;
    Wedge = 1;
    Cylinder = 2;
    Sphere = 3;
    Cone = 4;
    Plane = 5;
    CornerWedge = 6;
}

message Primitive {
    Shape  shape    = 1;
    uint32 material = 2;  // index into the built-in material set
    uint32 color    = 3;  // 0xRRGGBB tint
    float  uvScale  = 4;  // texture repeats per world unit
    bool   collides = 5;  // blocks movement in Play mode
    bool   locked   = 6;  // excluded from editor raycast (Roblox's Locked)
    string group    = 7;  // linkset id; "" = ungrouped
}

message Object {
    // ... existing fields 1–9 unchanged
    Primitive primitive = 10;  // set iff type == Primitive
    string    nonce     = 11;  // client echo, primitives only (§6.1)
}

// New WhirledEvent members:

message ObjectTransformBatch {
    repeated ObjectTransform transforms = 1;  // one multi-select drag
}

message ObjectDenied {
    string id     = 1;  // stuff id (furniture) or nonce (primitive)
    Reason reason = 2;  // NotOwner / CapacityFull / InvalidPrimitive / Duplicate
}

message RoomCapacity {
    uint32 used     = 1;
    uint32 capacity = 2;
}
```

`ObjectDenied` and `RoomCapacity` are sent only to the affected peer
(`peer.Emit`), not the room. `RoomCapacity` is sent on join and after every
successful `ObjectJoin`/`ObjectLeave` of a primitive.

Furniture join/leave/transform messages are untouched; existing clients'
furniture flow does not change shape.

### 5.2 Schema notes

-   `material` is a scalar in v1. If per-face lands later it becomes a
    parallel `repeated uint32 face_materials` — do not redefine field 2.
-   Serialized size: a primitive `Object` is ~150 bytes of JSON in the room
    blob; 2,000 parts ≈ 300 KB against the field's 5 MB cap. Storage is not
    the constraint; draw calls are, hence `RoomCapacityMax`.

### 5.3 `rooms` collection

One new field, added via the existing create-if-missing bootstrap pattern
in `utils/db.go` (an `if Fields.GetByName(...) == nil` migration, like the
`users.birthday` one):

```
part_capacity INTEGER NOT NULL DEFAULT 100   -- RoomBaseCapacity
```

API rules stay `nil` — only the `POST /room/{id}/expand` route and the
bootstrap touch it.

## 6. Server (`game/server/`)

### 6.1 `onObjectJoin` — the primitive path

```go
switch obj.Type {
case buf.Type_Furniture:
    // existing path, unchanged
case buf.Type_Primitive:
    // 1. ownership (cached, §6.3)
    // 2. capacity: len(primitives in objects[roomId]) < part_capacity
    //    (part_capacity read fresh from rooms row — §4.3)
    // 3. validatePrimitive (§6.2); denial → ObjectDenied to peer
    // 4. obj.Id = server-minted id; never client-supplied
    // 5. transform taken from the client message, clamped (§6.2) —
    //    unlike furniture, primitives spawn where placed
    // 6. store in objects[roomId], broadcast ObjectJoin (nonce included),
    //    emit RoomCapacity to owner
}
```

This is a new trust boundary: the furniture path trusts nothing from the
client (everything comes from the DB); the primitive path necessarily
accepts a descriptor and a transform. Validation is therefore not optional
hardening — it is the whole boundary.

The client-supplied `nonce` (random string, per placement) is echoed in the
broadcast `ObjectJoin` and in `ObjectDenied`, so the placing client can
reconcile its optimistic ghost (§7.4) with the server-assigned id. Other
clients ignore it.

### 6.2 Validation table

Reject (drop + `ObjectDenied`) on structural violations; clamp numerics:

| Field           | Rule                                           |
| --------------- | ---------------------------------------------- |
| `shape`         | reject if outside enum                         |
| `material`      | reject if outside built-in set                 |
| `color`         | mask to 24 bits                                |
| `uvScale`       | clamp to [0.1, 16]                             |
| `scale.{x,y,z}` | clamp to [0.05, 64]                            |
| `position`      | clamp to room bounds (±256 each axis, y ≥ −16) |
| `rotation`      | reject non-finite                              |
| `group`         | length ≤ 32, `[a-z0-9-]` only                  |
| `nonce`         | length ≤ 32                                    |

The same numeric clamps apply in `onObjectTransform` for primitives —
scale is size (§0.3), so an unclamped transform is an unclamped part.

### 6.3 Ownership check off the hot path

`onObjectJoin`, `onObjectLeave`, and `onObjectTransform` each run a SQL
`rooms ⋈ users` ownership query per event today, and transforms arrive per
mouse-move. Fix: `onPlayerAuth` already queries the room row on join
(`player.go` — it selects `u.username AS owner`); cache `IsRoomOwner` on
the `Client` struct there, and compare in-memory in all three handlers.
Ownership changes require rejoining the room, which is acceptable.

### 6.4 Transform batching and rate

-   New handler `onObjectTransformBatch`: validates once, applies each
    member transform (primitives get §6.2 clamps), stores, re-broadcasts as
    one message. Per-message cap of 256 entries; oversized messages dropped.
-   Server-side rate limit: at most ~20 transform messages/sec per peer
    (single or batch); excess silently dropped — the drag's final `mouseUp`
    emit (§7.2) makes the end state authoritative anyway.

### 6.5 Autosave

`saveRoomToDb` currently runs only when a room empties. Add a dirty flag
per room, set by every object mutation, and a 30-second ticker that saves
dirty rooms. The empty-room save stays as the final flush. This bounds a
crash's damage to 30 seconds of build work instead of a whole session.

## 7. Client (`game/client/`)

### 7.1 Part factory and materials

`factory/primitive.ts` — `createPrimitive(world, obj)` builds a mesh from
shared unit geometries (one `BoxGeometry`, `CylinderGeometry`, ... module
singleton each; wedge and corner-wedge are small hand-built
`BufferGeometry`s) and rides `createObject`'s ECS wiring so the transform
accessors, selection, outline, and network paths all Just Work. A
`PrimitiveComponent` (bitECS) marks the eid; a `world.primitives` map holds
the descriptor per eid for the inspector and re-emission.

Materials:

-   Built-in set (~8–12) as textures under
    `web/static/assets/materials/`, defined in one
    `managers/materials.ts` table (enum index → maps + base params).
-   **Cache materials by `(material, color, uvScale)` key. Never
    `material.clone()`** — three 0.141's `cloneUniforms` clones textures
    and pins them on the GPU forever; the SWF stream renderer already
    learned this (swf-avatar-rendering.md §14.6, CLAUDE.md).
-   **World-space UVs.** Size-is-scale means a 4×3×0.2 box otherwise shows
    its texture smeared 4× on one face — the single most visible
    "homemade builder" tell. On placement and on scale commit (not per
    drag frame), recompute the part's UV attribute so repeats =
    `worldSize * uvScale` per face (Roblox's studs-per-tile). This
    requires per-part geometry for textured parts: acceptable — geometry
    is tiny; it is materials/textures that must be shared. Flat-color
    parts (v1 default material) skip this and share the unit geometry.

### 7.2 Snapping

three 0.141's `TransformControls` ships `setTranslationSnap` /
`setRotationSnap` / `setScaleSnap`. But **it snaps drag deltas, not
absolute positions** — a part that starts off-grid stays off-grid, which
is not how Studio feels. So:

-   Grid increments cycle 1 → 0.5 → 0.25 (toolbar + hotkey); rotation snap
    15°; scale snap = grid.
-   In the existing `transformControls` `"change"` handler (which already
    reads the ECS arrays to emit), round the **absolute** position (and
    scale) of primitives to the grid before writing/emitting.
-   Hold Alt → snap `null`, free placement. Studio muscle memory.
-   Emit cadence: throttle `"change"` emits to ~15 Hz during drag; emit
    once unthrottled on `mouseUp` as the authoritative final state
    (matches the server rate limit, §6.4).

### 7.3 Surface snap (placement)

What makes placing feel like Rec Room:

1. Raycast the cursor against parts + floor; take `intersect.face.normal`
   into world space via the hit object's normal matrix.
2. Quaternion-rotate the new part's +Y onto that normal.
3. Offset position along the normal by half the new part's extent, so it
   sits flush.
4. Snap the tangential position to the grid **in the surface's tangent
   frame**, not world axes — the step everyone skips, and why stacking on
   a rotated wall feels wrong in most homebrew builders.

Applies while dragging a ghost (§7.4) and, later, to translate-drags of
existing parts (v1: placement only).

### 7.4 Placement flow

Palette click arms placement → ghost mesh (semi-transparent, non-networked,
no ECS entity) follows the cursor with surface + grid snap → click commits:
`emitObjectJoin` carrying `Primitive` descriptor + transform + nonce →
ghost goes into a "pending" visual → server's `ObjectJoin` broadcast (nonce
match) replaces it with the real entity, or `ObjectDenied` removes it and
shows the reason (toast: "Room is full — 200/200 parts", with Expand button
for the owner). Escape cancels; holding Shift on commit re-arms for
repeated stamping (Rec Room).

### 7.5 Undo/redo (prerequisite milestone)

`TransformControls` writes straight through the redefined accessors into
ECS storage, so there is no natural interception point — use explicit
command objects:

```ts
interface Command {
	do(world): void;
	undo(world): void;
}
// AddPart, RemovePart, Transform (eids + before/after arrays),
// SetPrimitiveProps (material/color/uvScale/collides/locked), Group, Ungroup
```

-   Transform commands snapshot on the gizmo's `mouseDown` event and push
    on `mouseUp`; inspector drags snapshot on first change, push on
    release.
-   `do`/`undo` emit the same network events the direct action would —
    undo of Add is `emitObjectLeave` with the server id learned via nonce;
    redo of Add re-places (accepting a new server id, remapped in the
    command).
-   Stack cap 100; cleared on leaving the room or Build mode. ⌘Z/⌃Z,
    ⇧⌘Z/⌃Y.
-   Also wraps existing furniture moves — G3.

### 7.6 Modes, picking, locking

-   `world.editor.enabled` already gates Build; harden the split: in Build,
    `control.ts` click-to-move and object interaction are off entirely; in
    Play, primitives are excluded from `editor.ts` selection (which cannot
    run anyway) and included in `control.ts` movement raycasts as ground /
    obstacle only.
-   `locked` parts are skipped by the editor raycast (the floor's existing
    `ignoreIntersect` convention extends to a per-part flag) — this is how
    a builder stops selecting their own floor with every marquee. Unlock
    via the Explorer panel.
-   Selecting any part of a `group` selects the whole group (pivot
    behavior §7.7); double-click enters the group to edit one part —
    Roblox's Model/Part distinction.

### 7.7 Multi-select

Ctrl-click adds to selection; the gizmo needs a single `Object3D`, so use
a temporary pivot: an unregistered `Group` at the selection centroid,
`attach()` each selected entity (preserves world transform), attach the
gizmo to the pivot; on `mouseUp`, `attach()` everything back to the scene
and emit one `ObjectTransformBatch`.

**Risk — prototype before building UI on this:** `attach()` decomposes
matrices and writes `position`/`quaternion`/`scale`, which route through
`createObject`'s redefined accessors into ECS typed arrays; quaternion
writes reach `rotation._x/_y/_z` only via the patched Euler's
`_onChangeCallback` chain. If reparenting misbehaves, the fallback is: no
reparenting — keep entities in the scene and apply the pivot's delta
matrix to each per frame during the drag. Decide by measurement in M-multi,
not by hope.

### 7.8 Rendering budget

-   Shared unit geometry + cached materials: 500 parts ≈ 500 draw calls
    over ~20 material instances. Fine on desktop; measure before doing
    anything cleverer.
-   Do **not** reach for `InstancedMesh` preemptively — it fights per-part
    picking and the `OutlinePass` selection highlight. It is the
    documented escape hatch if profiling demands it, applied to locked
    parts only (they are not selectable, so neither objection applies).

### 7.9 Collision and walkable surfaces (Play mode)

No physics engine. Minimum honest version, gated on `collides`:

-   **Walk height:** `control.ts` currently raycasts the floor plane for
    the walk target. Include colliding primitives in that raycast and walk
    to the topmost hit — built platforms and stairs (wedges) become
    walkable for free.
-   **Blocking:** swept AABB of the player's capsule footprint against
    colliding parts' world AABBs along the move path; stop at first hit.
    Parts are mostly boxes; AABB is honest. Rotated-part false positives
    are accepted for v1.
-   Whirled itself had no collision (2.5D), so shipping the builder
    milestones before this one is acceptable; without it, everything built
    is scenery, so it is a committed milestone, not a wish.

## 8. Milestones

Each lands separately and leaves the game working. No test suite exists;
each milestone names its manual verification (`npm run dev`, two browsers —
owner + guest — since replication is half the feature).

-   **M1 — Transform hot path.** ✅ **Landed.** Ownership cached on
    `Client` (§6.3); client throttle + `mouseUp` authoritative emit (§7.2);
    server rate limit (§6.4); 30 s dirty-flag autosave (§6.5). _Measured:_
    a 1-second drag firing 60 `change` events put 14 transforms on the wire
    (~15 Hz, 67–84 ms apart) plus exactly one `mouseUp` flush carrying the
    final value — 15 messages where the old code sent 60.

    Three things this milestone had to add beyond the list above:

    -   **`objectsMu`.** gecgos ships with its locking commented out and
        pion delivers each peer on its own goroutine, so the `objects` map
        was already raced. Concurrent map access is a runtime panic, so a
        30 s ticker iterating that map during a drag would have turned a
        latent bug into a crash. Every access now goes through the mutex;
        `saveRoomToDb` marshals under the read lock and writes to the
        database outside it.
    -   **Owner of an already-loaded room got no editor button.**
        `onPlayerAuth` had three room-resolution branches and the middle
        one — "room is already live in memory" — set `player.Owner`
        nowhere. Server-side permission still worked, because the old
        per-event query said yes, but `player.owner` gates `openEditorBtn`,
        so the owner had no way to ask. Unified resolution fixed it.
    -   **`@`-prefixed rooms skip the database** in both save and load.
        They have no `rooms` row, so every guest joining the default room
        was logging a bare `sql: no rows in result set`.

    The transform budget has the package's only unit tests
    (`permission_test.go`): no client path reaches 20/s, so it would ship
    unexercised otherwise. `ObjectTransformBatch` (§6.4) is deferred to M8
    — nothing can emit one until multi-select exists.

-   **M2 — Undo/redo** for existing furniture actions (move, remove,
    place). _Verify:_ move → undo → guest browser shows the revert.
-   **M3 — Primitive end-to-end.** Proto changes, `Type_Primitive` join
    path with validation + minted ids + nonce echo, `ObjectDenied` +
    `RoomCapacity` events, `createPrimitive` (Box, flat color), placement
    ghost, persistence round-trip, capacity enforced at the default 100.
    _Verify:_ place/move/delete boxes as owner; guest sees all of it and
    is denied placing; restart server, room reloads; 101st box shows the
    denial toast.
-   **M4 — Snapping.** Grid cycle, absolute rounding, rotation snap, Alt
    free, scale snap. The make-or-break feel milestone.
-   **M5 — Palette + inspector.** All shapes; material set with
    world-space UVs; color, uvScale, collides, locked in `renderInspector`;
    lock behavior in picking.
-   **M6 — Surface snap** on placement, tangent-frame grid included.
-   **M7 — Capacity economy.** `part_capacity` field + bootstrap
    migration, `TxRoomExpand`, `POST /room/{id}/expand`, toolbar meter +
    Expand flow. _Verify:_ expand, ledger row appears on /wallet, next
    placement honors the new cap; guest cannot POST for a room they do not
    own.
-   **M8 — Multi-select + groups.** Pivot prototype decision (§7.7),
    `ObjectTransformBatch`, group/ungroup commands, group selection.
-   **M9 — Collision.** Walk-height + swept AABB per §7.9.

Future (each its own spec): group → furniture item, premium materials,
per-face materials, edge/vertex snap, room templates.

## 9. Security posture (do not regress)

-   The primitive join path is a **new trust boundary** (§6.1): the only
    place client-authored geometry enters the server. Validation lives in
    one `validatePrimitive` function; every numeric clamp in §6.2 is load
    bearing.
-   Part ids are server-minted; a client-supplied id on a primitive is
    dropped, never honored (id collision with a furniture `stuff` id would
    otherwise confuse the duplicate check).
-   Capacity, ownership, and coin checks are all server-side; the client
    UI meters are cosmetic.
-   `POST /room/{id}/expand` mutates coins only through
    `utils.AdjustCoins`, whose in-UPDATE debit guard is what makes
    concurrent spends safe — never read-check-write a balance around it.
-   Primitives carry no user bytes and no file path. Keep it that way: the
    moment a primitive can reference a URL (custom texture), it needs an
    `api/avatar.go`-style proxy boundary; that belongs to the premium
    materials spec, not this one.

## 10. Open questions

1. **Wedge walkability** (§7.9) — ramps as walk surfaces via the raycast
   trick work for gentle slopes; steep wedges will teleport-step. Fine for
   v1?
2. **Guest building** — should owners be able to grant build rights to
   friends? The ownership cache (§6.3) would grow into a per-room rights
   set; deferred until asked for.
3. **`rooms.objects` blob versioning** — primitives change the persisted
   `Object` JSON shape. Old blobs load fine (unknown fields absent), but
   consider a `version` key in the blob when the format next changes.
