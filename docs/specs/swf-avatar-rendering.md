# Spec: SWF avatar rendering in three.js

Status: **in progress** — M1 and M2 landed; M3 partially.
Owner: @lulzsun
Last updated: 2026-08-20

## 0. Decisions

Settled 2026-08-20 (see §10 for what was asked):

1. **Render topology: per-avatar `WebGLRenderTarget`.** Avatars stay billboards
   sampling a render target drawn in the world's own WebGL context. Emitting
   real 3D meshes is deferred, not foreclosed.
2. **No M1 safety net.** Go straight to the fork. The current iframe pipeline
   stays in place, untouched, until the replacement works.
3. **AS3 host shim.** Control interception lives in a `whirled-host.swf` we
   compile, not in Rust inside the fork.
4. **AVM1/AS2 avatars ship in the first release** — as _render-and-animate_,
   with frame-label control. See §5, W1b, and the caveat below.

**Caveat on decision 4, stated up front.** The Whirled SDK is AS3-only:
`AbstractControl` connects through `root.loaderInfo.sharedEvents`, which has no
AVM1 equivalent, and the SDK docs list ActionScript 3.0 as a requirement
throughout. There is therefore no such thing as an AS2 avatar that speaks the
Whirled control protocol, and no amount of host-side work creates one. What is
deliverable — and what this spec now commits to — is that AVM1 SWFs **render,
animate, and are driven by timeline frame labels** rather than by the SDK
handshake. W1b specifies that path.

**Update after M0 (§11.2b): the premise looks unfounded.** All 14 avatars
surveyed across two corpora are AVM2; not one is AVM1. This decision may be
scoping work for content that does not exist, and is worth revisiting.

## 1. Summary

whirled2 supports avatars authored as Flash `.swf` files using the original
[Whirled SDK](https://github.com/greyhavens/whirled-sdk), emulated with
[Ruffle](https://github.com/ruffle-rs/ruffle). The current implementation works,
but it requires every uploaded `.swf` to be hand-patched before it can be
controlled, it spends ~2.3 s and a whole wasm instance per avatar at spawn, and
it never releases either when a player leaves.

(An earlier draft of this spec asserted that it "does not scale past a couple of
simultaneous avatars". Measurement in §11.3 does not support that: twenty
avatars hold ~59 fps on the dev machine. The costs are real but they are
startup, memory and correctness, not steady-state frame rate.)

This document proposes replacing it with:

1. A **host shim** that speaks the Whirled SDK's own control protocol, so
   unmodified user-uploaded avatars work. (Independent of rendering.)
2. A **forked Ruffle render backend that emits a draw-command stream instead of
   rasterizing**, consumed by a small three.js renderer that draws into the
   world's existing WebGL context.
3. Relocating all Flash emulation into **one Web Worker**, replacing the current
   per-avatar iframe as the isolation boundary.

Plus a fourth, smaller piece: a **frame-label control path for AVM1 (AS2)
avatars**, which the SDK protocol cannot reach (§0, and §5 W1b).

Each is separately shippable and separately valuable.

## 2. Goals

-   **G1** — A user uploads an unmodified Whirled-SDK `.swf`, wears it, and it
    animates and responds to state/action/orientation changes in-world.
-   **G1b** — An AVM1 (AS2) `.swf` renders and animates correctly, and responds
    to state/action changes where its timeline labels allow. See §0.
-   **G2** — 20+ simultaneous SWF avatars in a room at 60 fps on mid-range
    hardware, with per-avatar cost roughly comparable to a Spine avatar.
-   **G3** — No per-file manual patching, no offline preprocessing required at
    upload time.
-   **G4** — A misbehaving or hostile `.swf` cannot read the page, reach the
    network, or stall the render loop.
-   **G5** — SWF avatars stay first-class citizens of the 3D scene: correct depth
    sorting, working outline pass, and pixel-accurate raycast picking.

## 3. Non-goals

-   Full Flash fidelity. Avatars need shapes, bitmaps, masks, color transforms,
    and common blend modes. Stage3D, PixelBender, video, and microphone are out.
-   Flash **games**, whirled pets, or furniture SWFs. The design should not
    preclude them, but avatars are the target.
-   Upstreaming anything to Ruffle. If it happens, good, but the fork is ours.
-   Whirled-SDK-level control for AVM1 avatars. They are in scope for rendering
    and frame-label animation (§5, W1b) — but the SDK protocol they would need
    to speak does not exist for AS2. See §0.

## 4. Current implementation

```
                 ┌─ iframe (sandbox="allow-scripts", CSP) ─────────┐
per avatar ─────▶│ ruffle.js → wasm instance → <canvas> (canvas2d) │
                 │ rAF: createImageBitmap(canvas)                  │
                 └───────────────┬────────────────────────────────┘
                                 │ postMessage(ImageBitmap, transfer)
                                 ▼
            SwfAssetManager ──▶ THREE.Texture ──▶ PlaneGeometry billboard
```

Files: [ui/swfsandbox.tsx](../../game/client/ui/swfsandbox.tsx),
[swf.ts](../../game/client/swf.ts),
[managers/swf.ts](../../game/client/managers/swf.ts),
`createSwfAvatar` in [factory/player.ts](../../game/client/factory/player.ts),
and the SWF branches of
[systems/animation.ts](../../game/client/systems/animation.ts) and
[systems/control.ts](../../game/client/systems/control.ts).

### 4.1 What each avatar costs

Per avatar, per frame — note that §11.3 measured this as affordable at twenty
avatars on one dev machine, so treat this table as where the money goes rather
than as proof of a frame-rate problem:

| Cost                                          | Notes                                      |
| --------------------------------------------- | ------------------------------------------ |
| A whole wasm instantiation                    | iframes cannot share a wasm module         |
| A separate canvas and rendering context       | Browsers cap active WebGL contexts (~16)   |
| `createImageBitmap` on a canvas               | GPU→CPU readback, or at best a driver copy |
| A structured clone across the iframe boundary | Plus a promise hop and rAF misalignment    |
| A full-texture `texImage2D` upload            | Even if one pixel changed                  |

The `canvas` renderer Ruffle is configured with is also deprecated upstream and
slower than the wgpu path — but switching to wgpu would make the readback
strictly worse, so the current design is stuck on the slow rasterizer.

Secondary problems:

-   **Sizing and ground offset are guessed from pixels.** `getSpriteBottomOffset`
    scans the alpha channel of the first frame on the CPU to find where the avatar
    meets the floor. It is wrong for flying avatars, wrong for avatars whose first
    frame is atypical, and it silently bails when the frame is empty
    (`if (offset.bottomNormalized === 0) return;`).
-   **Picking re-reads pixels.** `isHitTransparent` in `systems/control.ts` exists
    only because the avatar is an opaque quad.
-   **Per-entity state is stored per-manager.** `SwfAssetManager.isMoving` and
    `.orientation` are single fields, not maps, so the change-detection guard is
    shared across every avatar in the room.
-   **Race conditions are papered over.** `getStates` / `getActions` in
    [swf.ts](../../game/client/swf.ts) fall back to a 1000 ms `setTimeout` when the
    SWF has not registered yet, with a comment saying exactly that.

### 4.2 Why avatars must be patched today

`player.setState(...)`, `player.setMoving(...)`, `player.setOrientation(...)`
and `player.playAction(...)` are not Ruffle APIs. Ruffle exposes a SWF's
`ExternalInterface.addCallback` registrations as methods on the player element,
so those calls only work if the SWF itself registered them.

Whirled avatars do not. They talk to their host through the SDK's
`AbstractControl`: on construction the control dispatches a `"controlConnect"`
event on `root.loaderInfo.sharedEvents` carrying a props object. The control
fills in `props.userProps` — the functions the **host** may call
(`appearanceChanged_v2`, `stateSet_v1`, `getStates_v1`, `getActions_v1`,
`avatarSpoke_v1`, …) — and the host is expected to fill in `props.hostProps`,
the functions the **avatar** may call (`setState_v1`, `setOrientation_v1`,
`setLocation_v1`, `setPreferredY_v1`, `setHotSpot_v1`, …). The table in §5 W1
lays out which direction each name travels; it is not obvious from the names.

Confirming this against the files in this repo: `guest_37u99gbx6h.swf` contains
`com.whirled` and `AvatarControl` symbols and **zero** occurrences of
`ExternalInterface`, while `patched_70cdo87221.swf` contains
`ExternalInterface.addCallback`. The patched files are hand-modified. That is a
dead end for user uploads.

## 5. Design

Three independent workstreams. W1 unblocks G1/G3, W2 unblocks G2/G5, W3
unblocks G4.

### W1 — Host shim for the Whirled control protocol

Build a small AS3 SWF, `whirled-host.swf`, that we compile ourselves and ship as
a static asset. Ruffle loads **it**, not the avatar. It:

1. `Loader.load`s the avatar SWF into its own display list.
2. Listens for `"controlConnect"` on the loaded content's
   `loaderInfo.sharedEvents`.
3. Captures `props.userProps` and populates `props.hostProps` with our
   implementations (`setPreferredY_v1`, `setHotSpot_v1`, …).
4. Exposes a _fixed_, host-authored `ExternalInterface` surface — the same one
   for every avatar — that forwards to the captured `userProps`.

**The protocol runs in both directions, and it is easy to get backwards.** An
earlier draft of this spec had it wrong; `ActorControl.as` settles it:

| Direction     | Functions                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| host → avatar | `userProps.appearanceChanged_v2(location, orient, moving, sleeping)`, `userProps.stateSet_v1(state)`                   |
| avatar → host | `hostProps.setState_v1`, `setOrientation_v1`, `setLocation_v1`, `setMoveSpeed_v1`, `setPreferredY_v1`, `setHotSpot_v1` |

So `setState_v1` and `setOrientation_v1` are **not** entry points we call —
they are how an avatar asks the room to change _it_. Driving an avatar means
telling it its appearance changed; its own code listens for the resulting
`ControlEvent` and moves its timeline. `AvatarControl` adds
`getStates_v1` / `getActions_v1` / `avatarSpoke_v1` on the userProps side.

The existing [whirled-sdk-patcher](https://github.com/lulzsun/whirled-sdk-patcher)
independently corroborates this. It uses FFDec to decompile `AvatarControl`
out of each SWF, textually injects `ExternalInterface.addCallback` handlers
into the constructor, and recompiles. Those handlers set `_state`, `_isMoving`,
`_orient`, `_sleeping` and dispatch `ControlEvent.STATE_CHANGED` /
`APPEARANCE_CHANGED` — which is precisely what `stateSet_v1` and
`appearanceChanged_v2` do. The patcher reaches the right end state by
rewriting every file; the shim reaches it through the handshake the SDK
already provides, once.

Consequences:

-   Unmodified SDK avatars work. No patch step. (G3)
-   `setPreferredY_v1` gives us the real ground offset, so the alpha scan in
    `getSpriteBottomOffset` can be deleted, along with the empty-frame bail-out.
-   `getStates_v1` / `getActions_v1` are answerable as soon as `controlConnect`
    has fired, so the two `setTimeout(…, 1000)` races are replaced by a
    "control connected" promise resolved by the shim.
-   The `ExternalInterface` surface becomes ours, so `allowScriptAccess` is scoped
    to the shim's needs rather than extended to arbitrary uploaded content.

Open question: whether to write the shim in AS3 (needs an AS3 compiler in the
build — Apache Flex `mxmlc`) or to implement the same interception in Rust
inside the Ruffle fork, since W2 puts us in a fork anyway. The AS3 route is more
faithful to the SDK and testable in isolation; the Rust route avoids adding a
Flash toolchain. **Decided: AS3 shim**, checked in as a prebuilt `.swf`
alongside its source, so `npm run dev` does not require a Flash toolchain.

### W1b — AVM1 (AS2) avatars: frame-label control

The AS3 shim in W1 cannot connect to an AVM1 SWF, because `sharedEvents` is an
AS3 mechanism and the Whirled SDK never shipped an AS2 control library (§0). So
AVM1 avatars get a parallel, degraded control path built on the timeline
instead of on the SDK.

Two facts make this cheap:

-   **The W2 render backend is AVM-agnostic.** It sits below the ActionScript
    VM entirely — it only ever sees `register_shape` / `submit_frame`. AVM1
    content renders through it with no extra work, so "AS2 avatars display and
    animate correctly" falls out of W2 for free.
-   **Half the control path already exists.** `swf.ts` and `SwfAssetManager`
    already expose `getFrameList` (from Ruffle's `metadata.frameList`) and
    `gotoFrame`. Today they're vestigial; for AVM1 they become the control API.

Design:

1. At load, read the root timeline's frame labels. Ruffle exposes these, and
   the fork can expose them more directly than the current metadata scrape.
2. Map Whirled state and action names onto labels with a documented convention
   and a normalizing matcher — `state_idle` → `idle`, `walking` → `walk`, and
   so on, case- and prefix-insensitive, matching the `/^(action|state)_/i`
   stripping `SwfAssetManager` already does.
3. `setState(name)` becomes "seek to that label and loop from it";
   `playAction(name)` becomes "play that label once, then return to the current
   state label". This mirrors the `animState` / `animAction` bookkeeping
   `systems/animation.ts` already performs for glTF avatars, so the ECS side is
   unchanged.
4. `setOrientation` has no timeline equivalent. Prefer a `_left` / `_right`
   label pair when the SWF provides one; otherwise flip the billboard
   horizontally in three.js.
5. Ground offset has no `setPreferredY_v1`. Fall back to the display bounds
   Ruffle reports for the root sprite — still far better than today's CPU alpha
   scan, because it is geometry rather than pixels and does not depend on which
   frame happens to be showing.

An AVM1 avatar with no usable frame labels degrades to "plays its own timeline,
ignores state changes". That is an acceptable floor: it looks right, it just
isn't reactive.

Note that AVM1 does support `ExternalInterface` (Flash 8+), so an AS2 avatar
_authored for whirled2 specifically_ could register callbacks and get full
control. That is a documentation matter, not an engineering one, and it should
not be confused with supporting the existing Whirled corpus.

`api/stuff.go` should record the AVM version at upload (§7) so the client picks
the W1 or W1b path without sniffing at runtime.

### W2 — Command-stream render backend

Fork Ruffle and add a render backend that does not rasterize. Ruffle's
`RenderBackend` trait already has exactly the seam we need:

```rust
fn register_shape(&mut self, shape: DistilledShape, source: &dyn BitmapSource) -> ShapeHandle;
fn register_bitmap(&mut self, bitmap: Bitmap<'_>) -> Result<BitmapHandle, Error>;
fn update_texture(&mut self, handle: &BitmapHandle, bitmap: Bitmap<'_>, region: PixelRegion) -> Result<(), Error>;
fn submit_frame(&mut self, clear: swf::Color, commands: CommandList, cache_entries: Vec<BitmapCacheEntry>);
```

`register_shape` receives vector geometry that we tessellate **once** using
Ruffle's own `ShapeTessellator` — the same one the wgpu and webgl backends use —
producing triangle draws typed `Color`, `Gradient`, or `Bitmap`. `submit_frame`
receives a `CommandList`: a flat, already-culled list of

```rust
enum Command {
    RenderShape { shape, transform },
    RenderBitmap { bitmap, transform, smoothing, pixel_snapping },
    RenderAlphaMask { maskee_commands, mask_commands },
    DrawRect { color, matrix }, DrawLine { .. }, DrawLineRect { .. },
    PushMask, ActivateMask, DeactivateMask, PopMask,
    Blend(CommandList, RenderBlendMode),
    RenderStage3D { .. },
}
```

That is a display list, not pixels. Our backend serializes it.

**Protocol.** Two channels between wasm and JS:

-   _Resource events_ (rare): "shape N has M draws, here are its vertex and index
    buffers and per-draw types", "bitmap N is W×H RGBA at this offset". JS turns
    these into `THREE.BufferGeometry` / `THREE.DataTexture` once and caches them
    by handle.
-   _Frame buffer_ (once per SWF frame): a packed `ArrayBuffer` of fixed-width
    records — `[opcode, handle, a, b, c, d, tx, ty, colorMult×4, colorAdd×4,
blendMode, maskDepth]`. No JS objects allocated per draw.

Both are read directly out of wasm linear memory; nothing is structured-cloned
per draw.

**three.js side** — a new `managers/swf/ThreeStageRenderer.ts` walks the frame
buffer and issues draws. Masks map onto three.js stencil material state
(`stencilWrite` / `stencilFunc` / `stencilRef` / `stencilZPass`), the same
technique Ruffle's own backends use. Flash's painter-algorithm layering is
preserved with `renderOrder` plus `depthWrite: false` within an avatar.

**Render topology.** Each avatar gets a `THREE.WebGLRenderTarget`. The command
stream is drawn into it with `world.renderer` — _the same WebGL context as the
world_ — and the existing billboard plane samples that render target. This is the
recommended choice because:

-   Zero GPU↔CPU readback and zero cross-context copies. (G2)
-   The 2D compositing rules (masks, blend modes, painter order) stay contained in
    a 2D pass instead of fighting the 3D depth buffer.
-   Billboarding, the outline pass, nameplates, and raycast picking keep working
    against a plane exactly as they do now. (G5)
-   Redraws are trivially skippable: only redraw a target when that SWF actually
    advanced a frame (12–30 fps, not 60), and skip off-screen avatars entirely.

The alternative — emitting real three.js meshes into the world scene so avatars
become genuine 3D geometry — is more interesting and is _not_ foreclosed by this
design, since the command stream is the same either way. It is deferred because
depth-sorting thousands of coplanar 2D fills against a 3D scene is a much harder
correctness problem, and it breaks the existing outline and picking code.

**Scope of the backend.** Initially:

| Trait method                                                  | Plan                                          |
| ------------------------------------------------------------- | --------------------------------------------- |
| `register_shape` / `register_shape_with_scale`                | Tessellate and export                         |
| `register_bitmap` / `update_texture` / `create_empty_texture` | Export RGBA                                   |
| `submit_frame`                                                | Serialize the `CommandList`                   |
| `is_filter_supported`                                         | `false` initially, then glow/blur/drop-shadow |
| `is_offscreen_supported` / `render_offscreen`                 | `false` / `None` initially                    |
| `apply_filter`                                                | `None` initially                              |
| `create_context3d`                                            | `Err` — Stage3D is a non-goal                 |
| `compile_pixelbender_shader` / `run_pixelbender_shader`       | `Err` — non-goal                              |
| `resolve_sync_handle`                                         | Follows `render_offscreen`                    |

Returning `false` / `None` from the optional methods is the supported way to
declare a limited backend; Ruffle degrades rather than panicking.

**Fork logistics.**

-   Vendor as a git submodule at `vendor/ruffle`, pinned to an upstream commit,
    with our changes kept as a _thin, rebasable_ patch series: one new crate
    (`render/stream`) plus a `"three"` arm in
    `web/src/builder.rs::create_renderer`, which already dispatches over
    `["wgpu-webgl", "webgpu", "webgl", "canvas"]` behind cargo features.
-   Build with `wasm-pack` into `web/static/`. Add a Rust stage to the
    [Dockerfile](../../Dockerfile) and an `npm run build-ruffle` script. Commit a
    prebuilt bundle so a plain `npm run dev` does not require a Rust toolchain.
-   Ruffle is dual MIT / Apache-2.0, compatible with this repo's AGPL-3.0.

**Fallback if fidelity is unacceptable.** If real avatars render visibly wrong
through the command-stream path and the gap is not closing, fall back to keeping
Ruffle's own rasterizer but pointing it at a texture we own — one cross-context
copy per _SWF_ frame instead of one readback per _display_ frame. Strictly worse
than W2, but still much better than today.

### W3 — Out-of-process isolation

Revised after M4. The original text called for a Web Worker and dismissed the
iframe; the reasoning was sound about _opaque_ origins and wrong about iframes
in general. What follows replaces it. See §16 for the plan.

**What we actually have to contain.** A `.swf` on this site is user-uploaded
content with no MIME or extension check on the `file` field
([utils/db.go](../../utils/db.go)), and M4 runs it in the page with
`allowScriptAccess: true`. `ExternalInterface.call` resolves a name against the
host page, so an uploaded avatar reaches arbitrary page JS. `pb_auth` is
`HttpOnly`, so a token cannot be read — but same-origin requests carry it
automatically, so this is account takeover for everyone who walks into the
room, not merely a data leak. That is the whole threat, and it ends the moment
Flash executes somewhere that is not our origin.

**Any separate origin closes it.** Worker or iframe is a secondary question:
what matters is that the code executes against an origin that holds no session
and cannot touch our DOM. Both qualify. They differ in cost.

**Why the iframe attempt failed, and why that is not an argument against
iframes.** §12.4 built the sandbox with `sandbox="allow-scripts"` and no
`allow-same-origin`, which gives the document an **opaque** origin — and an
opaque origin is treated as public by Private Network Access, so its subresource
loads to a loopback address are blocked. `ruffle.js` never loaded in dev. The
only way to restore it was `allow-same-origin`, which on a same-origin `src`
hands the frame our own origin back and defeats the entire exercise.

The mistake was reaching for an opaque origin at all. An iframe pointed at a
**different** origin needs no `sandbox` attribute to be isolated: it is
cross-origin, so it cannot touch our DOM, our storage, or our cookies, and it
still has a real origin, so its own subresources load normally — in dev as well
as in production. This is the ordinary pattern for running untrusted code in a
page, and it is what the sandbox should have been.

**Cross-origin iframe versus worker.**

|                           | Cross-origin iframe                 | Worker                                    |
| ------------------------- | ----------------------------------- | ----------------------------------------- |
| Isolation from our origin | Yes                                 | Yes                                       |
| Ruffle changes needed     | None — it is a normal page          | `ruffle_web` is written against `web_sys` |
| `<ruffle-player>` element | Works as-is                         | No DOM; drive `ruffle_core` directly      |
| Audio                     | Works as-is                         | No `AudioContext` on a worker thread      |
| Element sizing (`§14.2`)  | Works as-is                         | Viewport must be set on the core player   |
| Blocks our render loop    | No — Chrome site-isolates it        | No                                        |
| One wasm module for all   | Yes, if one frame hosts all avatars | Yes                                       |

The worker's remaining edge is that it has no DOM at all rather than a DOM we
cannot reach. That is a smaller difference than the Rust work it costs, and the
work is speculative: nobody has established that `ruffle_web` builds for a
worker target. **Build the cross-origin iframe. Keep the boundary abstract
enough that a worker can be dropped in behind it**, because everything
expensive — serializing the command stream, turning the control protocol into
message passing — is shared between the two and none of it is wasted.

**One sandbox for every avatar, never one per avatar.** This is forced, not a
preference. `whirledHostQuery` answers the SDK's room queries _synchronously_,
inside the calling avatar's own AVM tick, and `entityProperty` resolves a
property by calling synchronously into a **different** avatar
([managers/swf.ts](../../game/client/managers/swf.ts), `whirledLookupProperty`).
No message boundary can serve a synchronous call. Inside one shared JS context
it is a function call, exactly as it is today. So the boundary goes between the
page and _all_ of Flash, not between the page and each avatar — which is also
what W4 wants.

**The consequence: room state has to be mirrored.** Those synchronous queries
have to be answerable from inside the sandbox with no round trip, so the host
pushes room state in (entity ids, locations, orientations, properties) and the
sandbox answers locally from its copy. The mirror is small and already exists in
substance — it is `Entry.location`, `Entry.entityId` and friends — but it has to
move across, and it becomes the sandbox's copy rather than the page's.

**What crosses, and how.** The command stream is already shaped for this. The
backend packs each frame into one `Float32Array` of fixed-width records and
hands bulk data over as typed arrays built with `Float32Array::from`, which
copies into the JS heap rather than viewing wasm memory
([render/stream/src/js_sink.rs](https://github.com/ruffle-rs/ruffle)). They are
therefore already detached-transfer-ready: `postMessage` with a transfer list
moves them without a second copy. Control goes the other way as an RPC: today's
`this.call(eid, name, …)` is fire-and-forget in every case but two
(`whirledGetStates`, `whirledGetActions`), and both already sit inside `async`
methods, so they become awaited messages without changing their callers.

**Flash's own security domains are a separate boundary.** The shim reaches into
the avatar's `userProps` after loading it, which requires the two to share a
security domain. Serving the sandbox page from one origin while the avatar file
comes from another puts the avatar in a different domain and breaks the
handshake. The sandbox origin should therefore **serve the avatar bytes itself**,
proxying from the app, so that from Flash's point of view everything is local.
That proxy is also the natural place to enforce a size cap and to reject
anything that is not a SWF.

**The origin must be a different site, not a subdomain.** `pb_auth` is host-only
and `SameSite=Lax`, so a subdomain does not receive it on its own requests — but
a subdomain is _same-site_, so the cookie still rides along on requests the
sandbox makes **to** the app origin. CORS stops the response being read and a
JSON content type forces a preflight, which is defence, not isolation. Two Fly
apps are genuinely cross-site, because `fly.dev` is on the Public Suffix List.
In dev, `localhost` and `127.0.0.1` are different hosts with different cookie
jars and both are private addresses, so the sandbox can be served from the same
Go server on the other name — no second dev server, and no repeat of §12.4.

### W4 — One player, one room: avatars that interact

Not scheduled. Recorded now because it changes what W3 should build, and
building W3 the obvious way would foreclose it.

The goal is avatars that can see and act on each other — Whirled's
[Land Sea Animals](https://wiki.whirled.club/wiki/Land_Sea_Animals) are the
canonical example: avatars that duel, "LAND WHAAALE" shooting "LAND SHAAARK",
built on a `DuelingLandSeaAnimal(_ctrl, duelState, duelAction, deadState)`
helper that drives ordinary SDK states and actions. The wiki page is a stub and
does not document the mechanism, so what follows is read out of the SDK itself
(decompiled `com.whirled.EntityControl`) rather than from LSA's source.

#### What the SDK actually provides

| Direction     | Call                                      | Notes                                            |
| ------------- | ----------------------------------------- | ------------------------------------------------ |
| avatar → host | `getEntityIds(type?)`                     | **returns synchronously**                        |
| avatar → host | `getMyEntityId()`                         | **returns synchronously**                        |
| avatar → host | `getEntityProperty(key, entityId?)`       | **returns synchronously**, from _another_ entity |
| avatar → host | `sendMessage(name, arg)`                  | fire and forget                                  |
| avatar → host | `sendSignal(name, arg)`                   | fire and forget, transient                       |
| avatar → host | `updateMemory/lookupMemory/getMemories`   | persistent per-entity state                      |
| host → avatar | `entityEntered_v1` / `entityLeft_v1`      | gated on `_hasControl`                           |
| host → avatar | `entityMoved_v2(id, location)`            | gated on `_hasControl`                           |
| host → avatar | `signalReceived_v1(name, arg)`            | gated on `_hasControl`                           |
| host → avatar | `messageReceived_v1(name, arg, isAction)` | **not** gated — this is the action path          |
| host → avatar | `gotControl_v1()`                         | flips `_hasControl` on                           |
| host → avatar | `lookupEntityProperty_v1(key)`            | how _this_ avatar answers others' queries        |

**The headline: no avatar ever touches another avatar.** Every one of these is a
call to the host, and the host routes. Two avatars interacting is a feature of
the room, not of the emulator, so most of this can be built on the current
one-player-per-avatar topology.

**The second finding, which will otherwise cost a day of confusion:**
`_hasControl` starts `false`, and entity awareness, signals, chat and the SDK's
tick timer are all gated on it. An avatar sees nothing of the room until the
host calls its `gotControl_v1()`. Only `messageReceived_v1` is ungated, which is
why action triggering works today without any of this.

#### Why one player, then

Three reasons, in increasing order of force.

**Fidelity.** Real Whirled ran an entire room in a single Flash player. LSA was
authored against that: one frame rate, one tick, one display list. Anything
authored to assume it will be subtly wrong in N players — most visibly because a
Flash player has one frame rate, taken from the root SWF, so avatars authored at
12 and 30 fps currently run at their own rates and would not under one player.

**Cost.** Every player is a full AVM, display list, audio mixer and timer set.
One player amortizes all of it, and collapses N command streams into one.

**Synchronous cross-entity reads.** `getEntityProperty(key, otherId)` returns
inline, which means the host has to call the _other_ avatar's
`lookupEntityProperty_v1` and get a value back within the caller's own AVM tick.
Today both players are in one JS context, so that is a synchronous JS call into
a second wasm instance — awkward and re-entrant, but possible. **Under W3 it
becomes impossible**: a worker boundary is asynchronous, and there is no way to
turn an `await` into a synchronous AS3 return value.

So W3 and cross-avatar interaction are in tension — unless every avatar lives in
the same worker _and_ the same player, where the host answers the query with an
ordinary AS3 call and the tension disappears. That is the real argument, and it
is why this is written down before W3 starts.

#### What it changes on our side

The shim stops being a per-avatar loader and becomes **the room**: one stage, N
child `Loader`s, each still in its own `ApplicationDomain`, plus the entity
registry and message routing the API above needs.

Rendering follows: one player means one stage and one command stream, so the
per-avatar render target has to go. The natural replacement is a **texture
atlas** — the shim packs each avatar into a cell of the stage, reports the
layout, and each billboard samples its own cell through UV offset and scale.
Avatars are billboards positioned by the ECS, so the stage layout is free to be
a packing grid rather than anything resembling the room. Open questions to
settle when this is built: per-cell resolution budget, what happens when an
avatar draws outside its cell (probably a mask per cell), and the maximum useful
stage size.

Two costs to weigh honestly:

-   **One failure domain.** A runaway avatar currently stalls only itself. Under
    one player it stalls the room. W3 contains that to the worker rather than the
    page, which makes it survivable but not invisible.
-   **Weaker separation between avatars.** `ApplicationDomain(null)` keeps class
    definitions from colliding; it is not a security boundary. Two avatars in one
    AVM can reach each other in ways two AVMs cannot. Since the point of the
    exercise is letting them interact, this is partly the feature — but "can duel"
    and "can tamper" are not the same permission, and the host should stay the
    only route between them.

#### Sequencing

Most of the host work does not depend on the topology and can be built and
tested now, on the current N-player setup: the entity registry mapping SDK
entity ids to ECS entities, `gotControl_v1`, signal and message routing, and
`entityEntered`/`Left`/`Moved` fan-out. Only `getEntityProperty` genuinely needs
one player.

Two pieces reach past the client and are their own work: signals and messages
have to be fanned out through the game server to reach other people's clients at
all, and memories need persistence in PocketBase. Both raise an authority
question this spec has so far been able to ignore — an avatar that can duel is
an avatar that can lie about the outcome.

## 6. Client changes outside the renderer

-   `SwfAssetManager` — rewrite. Per-entity state (`isMoving`, `orientation`,
    `states`, `actions`) moves into per-entity records; the `postMessage` plumbing
    collapses into direct calls (W2) or one worker channel (W3).
-   `createSwfAvatar` — take size and ground offset from the SWF header and
    `setPreferredY_v1` instead of `swfTexture.image.width` and the alpha scan.
    Drop `mesh.scale.y = -1` by flipping in the render target instead.
-   `systems/control.ts` — `isHitTransparent` can stay, but it should sample a
    CPU-side coverage mask rather than the avatar texture, or be replaced by a
    per-avatar bounding polygon derived from the display bounds.
-   `ui/swfsandbox.tsx` and `swf.ts` — deleted once W3 lands.
-   `vite.config.ts` — drop the `swf.ts` entry, add a worker entry.

## 7. Server changes

Upload validation in [api/stuff.go](../../api/stuff.go) should reject anything
that is not a plausible SWF before it reaches storage: magic bytes (`FWS`,
`CWS`, `ZWS`), a sane uncompressed-size ceiling, and a parse of the header rect
and frame rate. Storing the header dimensions on the item record lets the client
size the billboard before the first frame arrives.

The parse must also record **AVM1 vs AVM2** on the item record, since that
selects the W1 (SDK control) or W1b (frame-label control) path at wear time.
For AVM1 items, extracting the root timeline's frame labels at upload and
storing them lets the client build its state/action list without waiting for
the player to boot — which also removes the last reason for the
`setTimeout(…, 1000)` races described in §4.1.

## 8. Milestones

| #   | Deliverable                                                                                            | Done when                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| M0  | Benchmark harness: N SWF avatars in a room, frame-time HUD; avatar corpus collected, AVM1/AVM2 counted | Baseline recorded for N = 1, 5, 10, 20; corpus checked in as test fixtures                 |
| M1  | W1 host shim (`whirled-host.swf` + `mxmlc` build)                                                      | An **unpatched** SDK avatar from `pb_data` wears, animates, and changes state              |
| M2  | Ruffle fork builds in CI; `preferredRenderer: "three"` selects a stub backend                          | `npm run build-ruffle` produces a bundle; the stub logs commands                           |
| M3  | Command stream renders a real avatar correctly                                                         | Side-by-side with Ruffle's wgpu output: shapes, bitmaps, masks, color transforms all match |
| M4  | Integrated: render targets, billboards, outline pass, picking **(done, section 14)**                   | G5 holds; visually indistinguishable from today                                            |
| M5  | W1b AVM1 path + upload-time AVM/label extraction in `api/stuff.go`                                     | G1b: an AS2 avatar from the corpus renders, animates, and follows its frame labels         |
| M6  | W3 out-of-process isolation (§16)                                                                      | Zero Flash execution on our origin; `swfsandbox.tsx` and `swf.ts` deleted                  |
| M7  | Perf target                                                                                            | G2: 20 avatars at 60 fps                                                                   |
| M8  | W4 one player per room: entity registry, signals, atlas rendering                                      | Two SDK avatars in a room can see each other and exchange signals (LSA-style)              |

The old iframe pipeline stays in place and untouched through M1–M3; the cutover
happens at M4. There is no interim main-thread-canvas step (decision 2).

M0's corpus work is now load-bearing rather than optional: M3 cannot be judged
without real avatars to compare against, and M5's label-convention matcher
cannot be designed without knowing what labels real AS2 avatars actually use.

## 9. Risks and open questions

-   **AVM1 avatars have a ceiling.** `sharedEvents` is AS3-only, so W1b's
    frame-label control is the most that can be offered for existing AS2
    content — an AS2 avatar without usable labels will animate but ignore state
    changes. This is a property of the Whirled SDK, not something more
    engineering effort removes. The risk to manage is expectation-setting: the
    upload UI should say plainly which control tier an uploaded file landed in.
-   **Label conventions are unknown.** W1b's state-name-to-frame-label matcher
    is guesswork until the M0 corpus exists. If real AS2 avatars turn out to use
    no consistent labelling, W1b degrades to "plays its own timeline" for most
    of them and the matcher is wasted work. Measure at M0, before building M5.
-   **Fidelity of the command-stream backend.** Real avatars use gradients, masks,
    blend modes, and sometimes filters. Filters in particular need offscreen
    passes the initial backend declines to support, so a glow-heavy avatar will
    render flat. This needs a corpus of real avatars to test against — worth
    collecting one before M4.
-   **Fork maintenance.** Every Ruffle rebase costs time. Keeping the patch series
    to "one new crate plus one match arm" is the mitigation; anything that
    requires editing `ruffle_core` should be treated as a design smell.
-   **Build complexity.** Adding Rust/wasm-pack — and possibly an AS3 compiler —
    to a repo that currently needs only Go and node is a real cost for
    contributors. Prebuilt artifacts in `web/static/` are the mitigation.
-   **three.js 0.141.** Old. Stencil material properties exist, so masks are fine,
    but verify anything else before relying on it. An upgrade may be worth
    sequencing before M5.
-   **Audio.** Not addressed here. Whirled avatars can make sound, and a worker
    build needs an audio path back to the main thread.
-   **Does this need Ruffle's `Player` at all?** An alternative worth a spike: bake
    each avatar state to a spritesheet offline at upload time and drop Flash from
    the runtime entirely. It kills interactivity (`setPreferredY`, dynamic text,
    reactive avatars) so it fails G1 — but it may be the right treatment for
    distant avatars as an LOD tier later.

## 10. Decision log

Asked and answered 2026-08-20; outcomes are recorded in §0.

| Question                                                        | Outcome                                 |
| --------------------------------------------------------------- | --------------------------------------- |
| Render-target topology, or avatars as real 3D meshes?           | Render targets; meshes deferred         |
| Interim main-thread-canvas step, or straight to the fork?       | Straight to the fork                    |
| AS3 host shim, or control interception in Rust inside the fork? | AS3 shim (`mxmlc` in the build)         |
| Is AS2/AVM1 support required for the first release?             | Yes — scoped to W1b, with the §0 caveat |

Still genuinely open, and to be resolved by evidence rather than by decision:

-   What fraction of the real avatar corpus is AVM1, and what frame labels it
    uses (M0 answers both, and W1b's design depends on the answer).
-   Whether the command-stream backend's fidelity is good enough on real
    avatars, or whether the §5 W2 fallback is needed (M3 answers this).
-   Whether three.js needs upgrading off 0.141 before M4.

## 11. M0 findings

Tooling landed for M0:

-   `utils/swf` — a minimal SWF container parser: header, AVM version, Whirled
    SDK markers, and frame labels (root plus one level of `DefineSprite`).
    Written in Go rather than as a throwaway script because §7 needs exactly
    this at upload time. Covered by `go test ./utils/swf/`.
-   `tools/swfinfo` — corpus survey CLI over that parser.
-   `game/client/systems/benchmark.ts` — frame-time HUD and avatar-spawning
    harness, inert until `window.game.bench.show()`.

### 11.1 Corpus survey

`go run ./tools/swfinfo` over two corpora — the 8 SWFs in this repo plus the 6
in [whirled-sdk-patcher](https://github.com/lulzsun/whirled-sdk-patcher):

| tier       | count | share | meaning                                    |
| ---------- | ----- | ----- | ------------------------------------------ |
| `sdk`      | 11    | 79%   | AVM2 + Whirled SDK, no `ExternalInterface` |
| `external` | 3     | 21%   | the hand-patched files                     |
| `labels`   | 0     | 0%    | —                                          |
| `static`   | 0     | 0%    | —                                          |

This **confirms §4.2 empirically**: stock SDK avatars carry `com.whirled` /
`AvatarControl` symbols and register no `ExternalInterface` callbacks of their
own, so the W1 host shim is the only way to drive them, and the current
pipeline genuinely cannot accept an unmodified upload.

Two files in the patcher corpus are the same avatar before and after patching
(`Kawaii_Basic_F.swf` and `patched.swf`). They carry an identical set of 44
frame labels, which confirms the patch step does not disturb the timeline.

### 11.2 Frame labels are real but not universal

The label vocabulary is genuinely usable where it exists — `idle`, `walk`,
`walk_loop`, `walk_stop`, `sprint`, `dance`, `sit`, `kick`, `block` — and it
appears on `sdk`-tier files too, not only patched ones. That makes frame-label
control a viable **fallback for any avatar**, not just an AVM1 path.

But it is far from universal: 8 of 14 files expose no usable labels at all
(`Hapitos`, `Unpatched_Eepy_Base`, `ahri_unpatched` have none; several others
have only `speak` / `closedmouth`). Those avatars are driven entirely by AS3
state changes with no timeline structure to seek to.

So W1b cannot be a general substitute for W1 — for more than half the corpus
there is nothing to seek to. It stays a fallback tier.

### 11.2b The AS2 premise looks unfounded

**Across 14 files from two independent corpora, every single one is AVM2.**
Zero AVM1.

Combined with the SDK evidence in §0 — `sharedEvents` is AS3-only, and the
Whirled SDK documentation lists ActionScript 3.0 as a requirement throughout —
the likeliest explanation is that AS2 Whirled avatars essentially do not
exist. The AS2 support committed to in decision 4 may be scope with no
corresponding content.

This is worth settling before building W1b's matcher, because it is currently
sized for a population that has not been shown to exist. Recommended: keep the
AVM1 _detection_ at upload (cheap, already implemented in `utils/swf`), and
defer the frame-label control path until either an AS2 avatar actually turns
up, or it gets repurposed as the general fallback tier that §11.2 suggests it
should be.

### 11.3 Baseline: the premise was wrong about frame rate

Measured with `window.game.bench.run([1,5,10,20], {settleMs:6000, sampleMs:6000})`
on the dev machine (Chrome, Windows), against the current iframe pipeline with
`preferredRenderer: "canvas"`, avatars in a grid so all are on screen:

| avatars | fps  | avg ms | p95 ms | p99 ms | max ms | draws | tris | textures | spawn ms |
| ------- | ---- | ------ | ------ | ------ | ------ | ----- | ---- | -------- | -------- |
| 1       | 57.8 | 17.29  | 16.80  | 34.20  | 150.90 | 24    | 3254 | 71       | 2307     |
| 5       | 58.3 | 17.15  | 16.80  | 17.30  | 202.50 | 28    | 3262 | 76       | 11010    |
| 10      | 60.0 | 16.67  | 16.80  | 19.90  | 29.10  | 33    | 3272 | 86       | 22316    |
| 20      | 59.0 | 16.95  | 21.30  | 28.10  | 42.20  | 43    | 3292 | 106      | 46108    |

**G2 is already met on this hardware.** Twenty simultaneous SWF avatars sustain
59 fps with a 21 ms p95. That directly contradicts §1's claim that the
implementation "does not scale past a couple of simultaneous avatars", and the
claim should not be repeated without qualification.

This was verified to be a real measurement rather than an artifact of throttled
background iframes. With 20 avatars spawned, the parent receives **597.5
`frame` messages per second — 29.9 per avatar, exactly the SWFs' 30 fps** — so
every sandbox is running at full rate and every `createImageBitmap` and texture
upload is actually happening.

Two caveats on the number. It is one developer machine, not the "mid-range
hardware" G2 names. And an earlier, discarded run showed much worse figures
(38 fps at 10 avatars, 22.8 at 20) because leaked sandboxes from previous rows
were still running — see §12.6. Numbers from before that was understood should
be ignored.

**What the measurement does confirm as broken:**

-   **Spawn time, badly.** ~2.3 s for the first avatar and **46 s to spawn
    twenty**, essentially linear, because each avatar instantiates its own wasm
    module. A room that fills up is unusable for the better part of a minute.
    This, not frame rate, is the pipeline's most visible failure.
-   **Resource growth.** 20 wasm instances, 20 canvases, and a texture count
    that climbs 71 → 106 across the sweep.
-   **Frame-time spikes at low counts** — 150 ms and 202 ms maxima at 1 and 5
    avatars — which is startup cost bleeding into the sample window.

So the case for W2/W3 stands, but it should be argued on **startup cost, memory,
and per-avatar wasm instances**, not on steady-state frame rate. G2 needs
re-basing on something the current design actually fails: time-to-first-frame
for a room of twenty, and resident memory.

### 11.4 Incidental finding: avatar loading is coupled to rAF

Attempting the run surfaced a real robustness bug in the current pipeline.
`createSwfAvatar` awaits the first frame from the sandbox iframe, and that frame
is produced by a `requestAnimationFrame` loop inside the iframe (`swf.ts`). In a
hidden or backgrounded tab that loop never runs, so **avatar creation never
resolves** — it hangs forever rather than failing. Observed directly: the
sandbox iframe was created, and `spawn(1)` was still pending after 15 seconds.

Anyone loading a room in a background tab gets permanently stuck avatars. W2
removes the coupling (frames come from `submit_frame`, not from the host's rAF)
and W3 moves the driving clock into a worker, so this resolves as a side effect
— but it is worth a regression test at M4, and it is a reason not to leave the
current pipeline in place longer than necessary.

## 12. M1/M2 findings

### 12.1 W1 works: unmodified avatars connect and can be driven

`flash/whirled-host/` compiles to a 2.9 KB `whirled-host.swf` via
`npm run build-shim`. Verified in Ruffle against four unmodified SDK avatars
(`guest`, `member`, `unpatched_tofu`, `Kawaii_Basic_F`): all four complete the
`controlConnect` handshake, and Kawaii enumerates its real content —
states `Default, Sprint Mode, Sit, Dance, Dead, Guard`, actions
`Playful, Lonely, Hungry, Excited, Curious, Content`.

Driving works: `setAppearance(..., moving=true)` puts the avatar into `walk`,
and `setState("Sit")` / `setState("Dance")` produce the corresponding poses.

**Ruffle implements `LoaderInfo.sharedEvents`**, which was the single biggest
risk in this design. It does not need patching.

### 12.2 Three things the SDK requires that were not obvious

-   **Two SDK vintages are in the wild**, and they shape the handshake event
    differently. `com.whirled.WhirledControl` (older; guest, member, tofu) puts
    `userProps`/`hostProps` directly on the event. `com.whirled.AbstractControl`
    (newer; Kawaii, and what is on GitHub) nests them under `event.props` and
    adds an `alreadyConnected` flag that the control _throws_ on if set.
    Reading the wrong shape raises `ReferenceError #1069`, so the shim probes
    with `"props" in connect`. They also differ in arity:
    `appearanceChanged_v1(location, orient, moving)` versus
    `appearanceChanged_v2(..., sleeping)`. `whirledGetCapabilities()` reports
    what a given avatar actually registered.

-   **The host is the authority on state.** Avatars typically respond to
    `STATE_CHANGED` by immediately calling `getState()`, which round-trips back
    to the host's `getState_v1`. The shim must record the new state _before_
    notifying, or the avatar reads back the previous value and appears inert.

-   **Appearance must be seeded during the handshake.** `ActorControl` caches
    location locally and `getLogicalLocation()` returns that cache rather than
    asking the host. Until something calls `appearanceChanged`, it is null, and
    avatars that read it die with `#1009 (accessing field: 1)` — which is
    exactly what kawaii_v2's `updateLook()` does on its first frame. The shim
    fixes this for every avatar by seeding appearance inside the handshake,
    which runs within the control's constructor, before the avatar's own code
    gets a turn.

These were all established by decompiling `com.whirled` out of real avatars
with FFDec. The SDK published on GitHub matches only the newer vintage, so it
is not a reliable reference on its own.

### 12.3 W2 builds and is selectable

`ruffle_render_stream` is a new crate in the fork implementing `RenderBackend`
without rasterizing (§5 W2). `npm run build-ruffle` produces a bundle with
`CARGO_FEATURES=three`, and the browser confirms
`New Ruffle instance created (... Used renderer: stream)`.

Six tests in `render/stream/tests/flatten.rs` pin the command-stream contract,
notably that `RenderAlphaMask` flattens to
`PushMask → mask draws → ActivateMask → maskee draws → DeactivateMask → PopMask`.

### 12.4 The iframe sandbox cannot load anything in local dev

`createSwfSandbox` built each avatar's iframe with `sandbox="allow-scripts"` and
no `allow-same-origin`, giving it an **opaque origin**. In current Chrome,
subresource loads from a null-origin document to a loopback address are blocked
— consistent with Private Network Access rules, which treat a null origin as
public and `127.0.0.1` as private. Measured directly, same content, only the
sandbox flags differing:

| sandbox                           | script load failures | `RufflePlayer` |
| --------------------------------- | -------------------- | -------------- |
| `allow-scripts`                   | 3                    | `undefined`    |
| `allow-scripts allow-same-origin` | 1 (an expected 404)  | `object`       |

So `ruffle.js` never loaded inside the sandbox, no frames were streamed, and
`createSwfAvatar` awaited forever — a hang rather than an error. Confirmed
unrelated to CSP (reproduces with the CSP meta removed) and unrelated to the
forked Ruffle (the same bundle works fine at top level).

This is **dev-only in principle**: in production the page is a public https
origin and the assets are same-origin, so the public→private rule should not
apply. That has not been confirmed against a deployed build, and it should be.

**Current mitigation.** `swfsandbox.tsx` now adds `allow-same-origin` when
`import.meta.env.DEV` is set. Vite substitutes that at build time, so the
production bundle contains only `allow-scripts` with no runtime branch —
verified by grepping the built output. `swf.ts`'s parent-reachability
self-check was updated to warn (not error) in dev, so it reports the real state
of affairs instead of crying wolf.

Be clear about what this costs: in dev, the SWF sandbox provides **no isolation
from the page**. The sandbox's only isolation-relevant flag is precisely the one
that breaks it, so there is no version of the iframe design that is both
functional in local dev and isolating. That is not a fix, it is a dev-only
concession — and another argument for W3, where a worker needs no opaque
document and isolates strictly better.

### 12.5 Incidental fix: a latent race in swf.ts

`swf.ts` registered its `loadedmetadata` listener inside `load().finally(...)`,
so if the event had already fired the listener never ran and no frames were
ever streamed. Older Ruffle builds happened to win that race. The listener is
now registered before `load()`; verified at top level that it fires correctly.
This was not the cause of §12.4, but it is a real bug and would have become one.

### 12.6 SWF avatars leak their sandbox on teardown

`SwfAssetManager.remove(eid)` is **never called**. Verified by monkeypatching it
and clearing spawned avatars: zero calls, the manager's maps still hold the
removed eids, and the iframe stays in the DOM with its Ruffle wasm instance
running a `requestAnimationFrame` loop forever. Spawn two, clear, and both
iframes remain.

The intended cleanup is the `avatarLeaveQuery` exit-query block in
`systems/render.ts`, which does call `remove(eid)`. It is not executing for
these entities; whether the bitECS exit query fires at all is unresolved.

**Resolved in §14.9.** The exit query fires perfectly well; the block throws
before it gets to the release.

This is not benchmark-only. Remote players leaving go through the same
`removeEntity` path (`"playerLeave"` in `systems/network/network.ts`), so a busy
room accumulates one orphaned wasm instance, canvas and texture per departed
player, indefinitely.

It also silently corrupted the first baseline attempt: each sweep row ran on top
of every avatar from every previous row, which is why those numbers showed a
collapse that does not reproduce. `systems/benchmark.ts` released
explicitly in `clear()` as a measurement workaround for as long as this was
open; that workaround is gone now that teardown works.

A second measurement lesson: the harness originally settled for 3 s between
rows, which samples during spawn churn and produced non-monotonic nonsense
(24 fps at 5 avatars, 59 at 20). At 6 s settle, repeated runs of the same count
agree to within 2 fps. The defaults were raised accordingly.

## 13. M3 findings

The command stream now reaches JavaScript and renders through three.js. An
unmodified `guest.swf` draws with the correct silhouette, face, mask cutouts
and shadow, positioned correctly — in the world's own WebGL context, with no
canvas readback anywhere.

**Colour is wrong: the ghost renders red instead of pale blue.** See §13.3.

### 13.1 How the bridge works

`ruffle_render_stream` gained a `web` feature providing `JsCommandSink`, which
hands the stream to a `whirledStream` function the host attaches to its Ruffle
player element before `load()`. Bulk data (vertices, indices, pixels) crosses
as typed arrays; the per-frame draw list crosses as one packed `Float32Array`
of 18-float records rather than an array of objects, so a frame with hundreds
of draws allocates one object instead of hundreds at the SWF's frame rate.

One wrinkle worth recording: `create_renderer` receives Ruffle's internal
`InnerPlayer`, which the embedding page has no reference to. The sink therefore
looks for the callback on that object _and_ on its `element` property — the
`<ruffle-player>` the page actually created.

The consumer is `game/client/managers/stream.ts` (`SwfStreamRenderer`), which
replays the stream into a `THREE.WebGLRenderTarget`.

### 13.2 Three bugs worth remembering

-   **Vertices are in pixels; translations are in twips.** Ruffle's tessellator
    emits vertex positions already scaled to pixels, while the display-list
    translation is in twips. Only `tx`/`ty` get divided by 20. Getting this
    wrong in either direction collapses every shape to a few pixels — which is
    exactly what happened twice, in opposite directions, before the ranges were
    measured rather than assumed (vertices span ~±50, `tx` ~5400).

-   **Per-record state cannot be written to a shared material.** A shape is
    typically drawn many times per frame and at least one of those draws is a
    mask with `colorWrite` off. Writing stencil state or colour-transform alpha
    onto the shape's cached material leaks it onto every other use. The renderer
    now clones a material per record and disposes them per frame — correct, but
    an obvious optimization target.

-   **The frame's viewport must come from the stream.** Ruffle bakes the
    stage-to-viewport scale into the transforms it emits, so the consumer has to
    size its target and camera to the viewport Ruffle used, not to the SWF's
    stage size. `submit_frame` now carries it.

### 13.3 Gradients

Implemented in both halves.

The backend was discarding `Mesh::gradients` entirely, so `DrawKind::Gradient`
carried an index into nothing. `GradientSpec` now crosses with the shape
registration: type, spread, interpolation, focal point and stops, encoded to
match Ruffle's own gradient shader (note the spread remap — `swf::GradientSpread`
is Pad/Reflect/Repeat but the shader wants clamp/repeat/mirror).

The consumer bakes each gradient into a 256-entry ramp texture and draws it with
a port of Ruffle's `gradient.frag`, with the 15-stop `if` chain replaced by a
ramp lookup. Two details carried over deliberately:

-   **linearRGB gradients convert twice.** Stops go sRGB→linear before mixing
    (done while baking the ramp) and the mixed result goes linear→sRGB in the
    shader, which is what Ruffle does.
-   **The colour transform moved.** Ruffle applies mult/add to each stop before
    mixing; the shader applies it once after sampling. The transform is affine,
    so this is equivalent apart from clamping of out-of-range endpoints, and it
    is one operation instead of two.

Verified at the data level: 44 gradient specs arrive for `guest.swf` with
correct stop colours (radial, pad, sRGB, pale blue — e.g. `0.533 → (0.79, 0.88,
0.92, 1)`), and 21 gradient materials are built into the frame's scene.

### 13.4 Resolved: shared renderer state, and a mask that was being drawn

The nondeterminism reported in the previous draft of this section — the same
scene graph producing a full-size ghost at 12.7% coverage in one run and only a
shadow at 3.7% in the next — was real, and it was two bugs stacked on each
other.

**Cause 1: the world's renderer was shared, not borrowed.**
`SwfStreamRenderer.render` used `world.renderer` from whatever callback happened
to be running — a Ruffle message handler or a console call — which lands at an
arbitrary point relative to `EffectComposer`'s passes. That matters more than it
sounds: `OutlinePass` drives `renderer.state` directly rather than through
materials, toggling the stencil test and swapping the clear colour around its
own passes, and three.js caches all of that. Masked draws depend on the stencil
buffer, so an inherited stencil state does not degrade the output, it decides
whether anything is drawn at all.

Two changes fix it:

-   Composition is driven from `systems/render.ts`, immediately before the
    composer runs, via `composeSwfStreams(world)`. Renderers register themselves
    in `world.swfStreams` on construction and remove themselves on `dispose`.
-   `render` saves and restores everything it touches — render target,
    `autoClear`, clear colour and alpha — and calls `renderer.resetState()` on
    both sides so neither side inherits the other's cached GL state. It also
    clears to transparent rather than to the world's clear colour, which is what
    a texture composited over the scene needs. Note `resetState()` also clears
    the cached render target, so it has to run _before_ the previous target is
    put back, not after.

After this, three fresh runs of the same avatar agreed to within 0.02% coverage.

**Cause 2: the mask shape was being drawn as artwork.** With rendering stable,
the "flat red ghost" turned out to be a real bug rather than an artifact. Flash
masks arrive as `push, mask geometry, activate, content, deactivate, mask
geometry again, pop` — Ruffle replays the mask geometry after deactivating, to
take the stencil back down to the enclosing depth. The consumer treated
everything after `deactivate` as ordinary content, so that replay was drawn
visibly, in the flat colour Ruffle tessellates mask shapes with, on top of the
avatar it had just finished masking.

The fix is a three-state phase (`Drawing` / `Writing` / `Clearing`) instead of a
`writingMask` boolean. `Clearing` writes `ref - 1` with `colorWrite` off, which
undoes exactly the region this mask stamped and is what makes nested masks work.

**Cause 3: the gradient matrix was transposed.** With the first two fixed the
avatar was recognisable, but every gradient fill rendered flat at one end of its
ramp. The tessellator's `[[f32; 3]; 3]` is an array of **columns**, not rows —
wgpu copies each entry straight into a `mat4` column — so it arrives
column-major. Building it with `Matrix3.set()` (which is row-major) transposed
it, which moves the translation terms out of the multiply entirely: `t` then
lands far outside `0..1` on every vertex and clamps. `Matrix3.fromArray()`
consumes column-major and is correct.

This one is worth remembering because the symptom does not look like a matrix
bug. Flat fills in roughly the right colour read as "the ramp is wrong", not as
"the texture coordinates are constant".

**Fidelity against Ruffle's own canvas renderer**, same SWF, same viewport,
same container size (Ruffle picks its viewport scale from the container, so the
two players must be sized identically or the comparison is meaningless):

| avatar     | ours coverage | ref coverage | opaque pixels within 4/channel | mean abs diff |
| ---------- | ------------- | ------------ | ------------------------------ | ------------- |
| guest.swf  | 10.52%        | 10.59%       | 95.7%                          | 3.4 / 765     |
| member.swf | 19.92%        | 20.02%       | 96.9%                          | 2.5 / 765     |

The residual is animation phase: the two players run independently and the
avatars idle, so a snapshot pair never catches them on the same frame.

**On the drop shadow, correcting the previous draft of this section twice
over:** it is not a filter, it was never missing, and the "wrong colour" that
remained after the gradient fix was not in the renderer at all — it was in the
comparison harness.

`guest.swf`'s shadow is a low-alpha radial gradient (radial, pad, sRGB, stops
`0.447 → rgba(0.2, 0.369, 0.435, 0.2)` and `0.973 → rgba(0.212, 0.427, 0.522,
0)`) drawn under a colour transform of `alpha × 0.777`. It was flat for the same
reason every other gradient was flat.

Isolating that one draw — replaying shape 10 alone into a fresh renderer with a
synthetic one-record frame — settles it: peak alpha 40, stored RGB `(8, 15, 17)`,
which unpremultiplies to `(51, 96, 108)` against a predicted stop-0 colour of
`(51, 94, 111)`. Replaying the whole frame prefix by prefix while watching that
pixel shows it reaching its final value on record 0 and never being touched
again. The shadow is correct.

What was wrong: the side-by-side viewer read the target back and handed the
bytes straight to `putImageData`. The target is **premultiplied**; `ImageData`
is not. The canvas then premultiplies on write and unpremultiplies on read, so
a pixel like `(8, 15, 17) @ 40` round-trips through `8 × 40/255 = 1.25 → 1 →
6.4` and lands at roughly `(6, 13, 19)` — crushed, and hue-shifted blue, because
the smallest channels lose the most. At alpha 255 the round trip is lossless,
which is exactly why the body matched and only the shadow looked wrong. The
viewer now unpremultiplies before blitting.

**One consequence for M4:** the render target holds premultiplied alpha, so the
avatar billboard must use premultiplied-alpha blending. Anything that samples
this texture and assumes straight alpha will reproduce the same hue shift on
every soft edge.

**A real, quantified limit:** premultiplied RGBA8 costs colour precision where
alpha is low. At alpha 30, one stored unit is ~8.5 units of unpremultiplied
colour, so the shadow band matches the reference on alpha (mean difference 0.13
of 255) while its colour spreads ~3.6 units per channel. Since those pixels
composite at 12% opacity, the visible error is well under one unit. A half-float
target would remove it at double the memory per avatar; not worth it unless
something turns out to need it.

**Fidelity against Ruffle's canvas renderer**, measured with the viewer fixed:

| region             | pixels | mean RGB diff (of 765) | within 4/channel | mean alpha diff |
| ------------------ | ------ | ---------------------- | ---------------- | --------------- |
| body (alpha ≥ 200) | 39129  | 1.2                    | 98.6%            | 0.12            |
| shadow (alpha ≥ 8) | 14109  | 10.8                   | 57.6%            | 0.13            |

### 13.5 Still unimplemented

-   **Colour transforms are only fully applied on gradient draws**, which have
    their own shader. Vertex-coloured and bitmap draws use `MeshBasicMaterial`
    and can express only the alpha term; full RGB multiply/add would need a
    shader for those paths too.

-   `DrawRect` and blend-mode markers are parsed but ignored.

-   Filters (blur, glow, and the like) are not implemented. No avatar looked at
    so far needs one — see the note on `guest.swf`'s shadow above — so this is
    unquantified rather than known-missing.

So M3 is **met** for the fills that avatars actually use: geometry, ordering,
masking and colour all reproduce Ruffle's canvas renderer closely enough to be
hard to tell apart. What is left above is additive rather than corrective.

## 14. M4 findings

M4 is the cutover: the iframe pipeline is no longer used. `managers/swf.ts` now
runs Ruffle in the page against the forked `three` backend, composes each avatar
into its own render target, and drives avatars through `whirled-host.swf` rather
than through hand-patched SWFs. `swf.ts` and `ui/swfsandbox.tsx` are left on
disk, marked superseded and referenced by nothing, until W3/M6 replaces them
with a worker.

### 14.1 Three things the shim still needed

**Identity.** With every player in one document, `ExternalInterface.call` reaches
one global scope, so `whirledHostEvent` could not say which avatar it came from.
The shim now takes a `hostId` flashvar and passes it back as the first argument
of every event; the manager routes on it.

**A verb for actions.** The stock SDK gives the host no way to trigger one.
`AvatarControl` registers `getActions_v1` so the host can _list_ them, but
triggering arrives through the message path:
`EntityControl.messageReceived_v1(name, arg, isAction)` dispatches
`ACTION_TRIGGERED` when `isAction` is true. The hand-patched avatars added a
`playAction` ExternalInterface callback instead, which is the shortcut
`whirledPlayAction` now replaces properly.

**A stage size.** Ruffle's `metadata` describes the SWF it loaded — the shim —
not the avatar the shim loaded, so the client had no way to know how big the
avatar is. The shim now reports it (`whirledGetStageSize`) and scales the loaded
avatar to fill whatever viewport it is given, which is what lets the client
choose texel density independently of avatar size.

### 14.2 The element-size trap

`<ruffle-player>` defaults to 550x400 and does not inherit its parent's size.
That box decides two things at once: the stage the shim lays the avatar out in,
and the render target's resolution. Left alone, every avatar renders into a
550x400 letterbox regardless of its own shape — a 200x200 avatar came out centred
in a 4:3 target with most of the texture empty. The manager sets the player
element to fill its host box explicitly.

### 14.3 Ground offset: one frame is not enough

Standing an avatar on the floor means finding its lowest opaque row. Two things
break the obvious approach of measuring the first frame:

-   The shim's own empty stage composes several frames before the avatar it is
    loading draws anything. Measuring one of those puts the ground line at the
    bottom of an empty rectangle and the avatar floats.
-   Avatars idle. `guest.swf`'s first drawn frame is part of an intro that
    settles over about a second, and measuring it put the ground line 19% of the
    frame too high.

So the manager waits for artwork, then watches a short window and keeps the
lowest edge it sees. `setPreferredY` would be a better answer since it does not
move with the animation, but no avatar in the corpus calls it.

### 14.4 Picking without a canvas

The old transparency test copied the frame's `ImageBitmap` into a 2D canvas and
read the alpha there, on every hover. The frame is now a GPU render target, so
`alphaAt` reads back the single texel under the ray instead — one pixel per hover
rather than a whole-frame copy. Verified against three avatars: hovering each one
selects that one, hovering an empty corner of the same quad selects nothing.

### 14.5 The billboard has to unpremultiply

The render target holds premultiplied alpha (§13.4), so a stock
`MeshBasicMaterial` draws every partially transparent texel too dark and tinted.
The billboard is a small `ShaderMaterial` that divides by alpha before the
cutout, keeping the hard-edged, depth-writing look the scene relies on for
sorting against furniture.

Billboard size now comes from the SWF's **stage size**, not the texture's
dimensions. Those were the same thing in the old pipeline, which meant
`devicePixelRatio` leaked into how big an avatar was in the world — the same
avatar was half the size on a non-retina display. Resolution and world size are
now separate knobs.

### 14.6 A texture leak, found by checking teardown rather than frame rate

Spawning one avatar added ~30 GPU textures; removing it freed one. Disposing all
39 of a stream's gradient ramps by hand freed **zero**.

The cause is in three.js, and it is easy to walk into. Each draw record needs its
own material — colour transform and stencil state differ per use — and the obvious
way to get one is `material.clone()`. But `cloneUniforms` calls `.clone()` on any
uniform value that is `isTexture`, so cloning a gradient material clones its
ramp. The copies share a `source`, so the GPU texture is not duplicated and
nothing looks wrong; but each copy increments that source's `usedTimes`, and a
texture that is never disposed never decrements it. The `WebGLTexture` is
therefore permanently "in use" and survives the avatar's own teardown.

Fixed by pooling: each sub-draw keeps materials for its 1st, 2nd, ... use within
a frame, built by a factory that shares textures, and reused frame to frame
instead of rebuilt sixty times a second. Bitmap quads are pooled the same way.
Verified over three spawn/clear cycles: 18 textures to 88 with two avatars, then
back to exactly 18, with no drift.

### 14.7 Numbers

| avatars | fps   | avg ms | p95 ms | p99 ms | max ms | draws | tris  | textures | spawn ms |
| ------- | ----- | ------ | ------ | ------ | ------ | ----- | ----- | -------- | -------- |
| 1       | 120.0 | 8.33   | 8.40   | 8.50   | 8.50   | 24    | 3254  | 56       | 218      |
| 5       | 120.0 | 8.33   | 8.50   | 8.50   | 8.60   | 28    | 3262  | 277      | 1130     |
| 10      | 120.0 | 8.33   | 8.50   | 8.50   | 8.60   | 189   | 8260  | 582      | 2328     |
| 20      | 120.0 | 8.33   | 8.60   | 10.20  | 12.50  | 355   | 13190 | 1122     | 4971     |

**Read the fps column with care.** It is vsync-capped, and the cap was not the
same in both runs — the M0 baseline (§11.3) topped out at ~59 fps, this one at 120. Neither pipeline was ever missing vsync, which was §11.3's point: frame rate
was never the problem. What these numbers do show is that twenty avatars still
hold the ceiling, with p99 within 2 ms of the frame budget.

**Spawn time is the number that moved**, and it is the one the M0 baseline
identified as the real cost:

| avatars | M0 iframe pipeline | M4 stream pipeline | ratio |
| ------- | ------------------ | ------------------ | ----- |
| 1       | 2 300 ms           | 218 ms             | 10.6x |
| 5       | 11 000 ms          | 1 130 ms           | 9.7x  |
| 10      | 22 300 ms          | 2 328 ms           | 9.6x  |
| 20      | 46 100 ms          | 4 971 ms           | 9.3x  |

Twenty avatars used to take three quarters of a minute to appear. They now take
five seconds. Most of that came from dropping the per-avatar iframe: each one was
a fresh document that had to fetch and instantiate its own wasm module.

M7's target (20 avatars at 60 fps) is met with the ceiling to spare.

### 14.8 What M4 does not do

-   **Isolation is gone.** Flash now runs in the page. The iframe's isolation was
    already only nominal in dev (§12.4), but in production it was real, and this
    trades it away until W3/M6 puts execution in a worker. Nothing should ship to
    production accepting user uploads in this state.
-   **Outlines are still rectangles** around a SWF avatar's quad rather than its
    silhouette. `OutlinePass` renders selected objects with a depth material that
    ignores texture alpha, which was equally true before the cutover, so this is
    unchanged rather than regressed.
-   **`getFrameList` / `gotoFrame` are gone.** They addressed the avatar SWF's own
    timeline, which the shim now owns, and nothing called them.
-   Avatar teardown on player-leave **is fixed** — see §14.9, which was written
    after this section and supersedes the entry that stood here.

### 14.9 Avatar teardown, fixed

§12.6 recorded that `SwfAssetManager.remove` was never called when a player
left, and guessed that the bitECS exit query was not firing. That guess was
wrong, and the wrongness is the interesting part: the query fires exactly as it
should. Logging it directly showed `avatarLeave [3, 5]` on the frame after
removal — and then nothing, no per-entity log at all from inside the loop that
was iterating those very entities.

The loop was throwing on its first statement. `removeEntity` is what puts an
entity in this query, so by the time the block runs the entity is gone, and
bitECS's `removeComponent` throws `entity does not exist in the world` on a
removed entity. The throw escaped through `pipe(...)` into `main.ts`'s update
loop, which is where those "bitECS - entity does not exist" errors in the
console were coming from — I had seen them and written them off as debris from
my own test harness.

So the release code was unreachable, and every departing player left behind a
Ruffle player, a render target and its textures.

The fix reorders the block around what is actually true in each of the two
situations it handles:

-   **A player left.** The entity no longer exists. Resources still must be
    released, so the release happens first and is keyed by entity id, and the
    component removals are guarded by `entityExists`.
-   **A player changed avatar.** The entity is alive and about to be given a new
    avatar. The old mesh has to be detached and its geometry and material
    disposed — but only for SWF billboards, which own their resources outright.
    glTF and Spine avatars share loader-cached materials and textures with every
    other player wearing the same file, so disposing theirs would blank out
    other people's avatars.

Two further leaks fell out of testing the fix:

-   `world.players` was never pruned, so the group and its nameplate stayed
    reachable forever. The entry is now dropped — but _after_ the avatar
    cleanup, since that cleanup needs the map to find the mesh it has to
    dispose. Deleting it in the player-leave block, which runs first, silently
    reintroduced the geometry leak.
-   The outline blocks did `world.players.get(eid)!.player` on entities that had
    just left, which throws once the map is pruned. They are now guarded — as
    are the equivalent object-outline blocks, which had the same shape.

Verified over four spawn/clear cycles of three avatars, with the benchmark's
explicit `remove()` workaround deleted so the render system is the only thing
releasing anything: textures 18 → 125 → 18, geometries 26 → 236 → 26, hosts
3 → 0, `world.players` 4 → 1, streams 3 → 0, and no errors. The swap path was
checked separately by removing `AvatarComponent` from a live entity: the old
avatar is released and detached, the entity and its map entry survive.

### 14.10 Wearing a second avatar: release by registration, not by entity

Changing avatar through My Stuff left the player with no avatar and Ruffle
throwing. The trace says it plainly — `remove` instrumented across a swap:

```
t=0ms      add(eid, member.swf)   → releases the outgoing avatar
t=0ms      remove(eid)            ← from add() itself, correct
t=19ms     remove(eid)            ← from the render system's exit query,
                                     destroying the *incoming* avatar mid-load
t=10023ms  add() finally resolves, having lost its player to two 5 s timeouts
```

An avatar swap gives one entity two avatars for a moment. `network.ts` removes
`AvatarComponent` and starts an async `createSwfAvatar`; the exit query fires on
the very next frame, long before the new SWF has loaded. The cleanup released
"the avatar for this entity" — and by then that meant the new one.

The fix is to release by **registration** rather than by entity. Each entry gets
a monotonic token; the billboard carries its own in `userData.swfToken`; and
`remove(eid, token)` is a no-op when the entity has since been given a different
avatar. Teardown passes the token of the mesh it is actually tearing down, which
during a swap is the outgoing one — already released by `add`, so the call
correctly does nothing.

Two things that made this behave worse than it needed to, also fixed:

-   `add()` kept waiting after its own player had been torn down, burning two
    5-second timeouts before returning a texture attached to nothing. Entries now
    carry an `alive` flag that the wait loops check, so a load that loses its
    player gives up at once.
-   `player.children[0]` is the _outgoing_ mesh throughout a swap, since a
    replacement is appended after it. That is what makes the token check land on
    the right object; it is worth knowing rather than rediscovering.

Verified by replaying the wear path three times in a row (guest → member →
guest → member): each swap completes in ~1.1 s with a live stream at the right
size, one mesh on the player, one offscreen player in the DOM, no texture
accumulation, and no errors. Leaving after a swap still returns everything to
baseline.

## 15. M8 progress: the entity registry and signal routing

The room-side half of W4, built on the current one-player-per-avatar topology
because — as W4 argues — routing is a host concern and does not need one player.

### 15.1 What Land Sea Animals actually does

The `DuelingLandSeaAnimal.as` source settles what this has to support, and it is
not what the wiki's "avatars that can duel" suggests. Signals are barely
involved; the mechanism is **cross-entity property reads**.

On its duel action the animal:

1. reads its own `landseaanimal:inDuelState` — through the host, by entity id,
   not from a local variable;
2. reads `EntityControl.PROP_LOCATION_PIXEL` for itself;
3. calls `getEntityIds(TYPE_AVATAR)` to enumerate the room;
4. for each other avatar, reads their `landseaanimal:inDuelState` and pixel
   location, and picks the nearest one it is facing;
5. **reads `landseaanimal:IKillJoo` on that opponent.**

Step 5 is the kill. The opponent's own `propertyProvider` runs, sees that key,
and sets its own state to a random death animation. A property read is being
used as a remote procedure call.

Two consequences for the host:

-   `getEntityProperty` must reach the target avatar's live provider. Answering
    from a cache would make the game not work at all, not merely go stale.
-   Property reads have side effects, so they are not safely reorderable,
    batchable or de-duplicated. Anything that later moves this across an async
    boundary has to preserve call-for-call semantics.

The only signal LSA sends is `lsa:deathNotice`, guarded by `hasControl()`, and
its comment says it exists so third-party furni can keep score. The one signal
handler in the file is commented out as deprecated.

### 15.2 What was built

In the shim: `getMyEntityId_v1`, `getEntityIds_v1`, `getEntityProperty_v1`,
`sendSignal_v1` and `sendMessage_v1` on the host props, and callbacks for the
other direction — `whirledGrantControl`, `whirledSignal`, `whirledMessage`,
`whirledEntityEntered` / `Left` / `Moved`, `whirledLookupProperty`.

In `managers/swf.ts`: the registry itself. Entity ids, `getEntityIds` with a
type filter, `std:` property resolution, forwarding of everything else to the
owning avatar's provider, signal broadcast, arrival and departure announcements,
and location fan-out.

`systems/animation.ts` pushes each avatar's position into the room every frame,
mapped into the SDK's 0..1 room coordinates and rate-limited by a movement
threshold. That feeds three things at once: the avatar's own appearance, what
`std:location_pixel` reports about it, and the `entityMoved` events its
neighbours receive.

### 15.3 Two things worth knowing

**`ExternalInterface.call` returns values in Ruffle.** The SDK's room queries
return synchronously, so the shim answers them by calling out to JS and using
the result — verified: an avatar asking `getEntityIds` gets `["3", "5"]` back
inside its own call. This is what makes cross-instance queries work _today_, and
it is exactly the mechanism a worker boundary would take away.

**`_hasControl` starts false and gates almost everything.** Entity awareness,
signals, chat and the SDK's tick timer are all silent until the host calls
`gotControl_v1`. The manager now grants control the moment an avatar completes
its handshake. Without this the registry would look completely inert while being
completely correct.

(A third, only useful when testing: Ruffle defines its ExternalInterface
callbacks non-writable but configurable, so instrumenting one from the console
needs `Object.defineProperty`. Plain assignment fails silently and makes it look
as though nothing is being called.)

### 15.4 Verified

Two avatars in a room, driving the bridge from the console:

| checked                                              | result                                     |
| ---------------------------------------------------- | ------------------------------------------ |
| `getEntityIds("avatar")` from inside an avatar       | `["3", "5"]`                               |
| `getEntityIds("furni")`                              | `[]`                                       |
| `std:location_pixel` for self and for the other      | `[210, 0, 200]` / `[280, 0, 200]`          |
| `std:location_logical`, `std:type`, `std:dimensions` | correct per entity                         |
| custom key on another entity                         | reaches **that player's** provider         |
| unknown entity id                                    | `null`, no throw                           |
| avatar arrives / leaves                              | `entityEntered` / `entityLeft` both ways   |
| avatar moves                                         | `entityMoved` to every other avatar        |
| signal sent                                          | delivered to every avatar, sender included |

The custom-key read returns `null` only because a stock avatar registers no
property provider; the call is observed arriving at the other player.

### 15.5 Not built yet

-   **Memories.** `updateMemory` / `lookupMemory` / `getMemories` are unanswered.
    They need PocketBase persistence, so they are server work, not client work.
-   **Anything past this client.** Signals, messages and entity events reach only
    avatars in this browser. Real interaction between two people needs the game
    server to fan them out, which also raises the authority question: an avatar
    that can kill another by reading a property is an avatar that can lie about
    having done so. Nothing here should be trusted once it crosses a client.
-   **Control election.** Every avatar is granted control unconditionally. Whirled
    elected one client per entity; with a single client that distinction does not
    exist yet, but it will the moment the previous point is addressed.
-   **Non-SWF entities.** The registry contains SWF avatars only. glTF and Spine
    players are invisible to `getEntityIds`, as is furniture.
-   **`getEntityProperty` under a worker.** Still the open question W4 names, and
    the reason M8 ends at one player per room rather than at this registry.

### 15.6 Two bugs found while checking merge readiness

**Host props must give every parameter a default.** Stock `guest.swf` was
throwing `Error #1063: Argument count mismatch` out of
`EntityControl.setHotSpot()` on every single load, aborting the avatar's frame-1
script and taking the rest of its initialization with it. The cause is the same
two-vintage problem as section 12.2: the older `WhirledControl` calls
`setHotSpot_v1` with two arguments where the newer one passes three, and an AVM2
function with fixed parameters throws rather than padding. Every host prop now
has defaults on its parameters. This was pre-existing, and had been visible in
the console for as long as the shim has existed.

**Waits must not count time while the tab is hidden.** Everything the loader
waits for is driven by requestAnimationFrame — the shim's first frame, the
stream's first composition — and a hidden tab gets no rAF at all. Counting
wall-clock time meant a room opened in a background tab burned all three
5-second timeouts and settled for a fallback 200x200 stage and a guessed ground
line, permanently, with no error anywhere. The timeouts now only count down
while the document is visible, so a hidden tab waits instead of guessing.

This surfaced while trying to explain the item-upload preview running at 1.5 fps.
It was not the preview: the Browser pane had been backgrounded, and the main
game page measured the same 2 fps at that moment, having measured 120 fps
earlier in the same session. Worth remembering before reading any frame-rate
number off a pane that is not on screen.

### 15.7 appearanceChanged is an edge, not a sample

Feeding the room location in every frame (15.2) froze the walk cycle on
`guest.swf`, `member.swf` and `Kawaii_Basic_F` — the avatar slid across the
floor stuck on one frame. Whirled's own stock avatar says why:

```as3
public function updateLook (... ) :void {
    var moving :Boolean = _ctrl.isMoving();
    var orient :Number = _ctrl.getOrientation();
    gotoAndPlay(1, (moving ? "walk" : "face") + "_" +
        (orient < 180 ? "right" : "left"));
}
_ctrl.addEventListener(ControlEvent.APPEARANCE_CHANGED, updateLook);
```

`gotoAndPlay(1, scene)` unconditionally, with no check for whether the look
actually changed. Push appearance every frame and the walk restarts every frame.
This is Whirled's own avatar, so it is evidence about what the real host did:
Whirled moved actors by tweening between endpoints, and the avatar heard about a
walk twice — once starting, once ending — not sixty times a second.

So appearance is now pushed on the edges only: `setMoving` and `setOrientation`
transitions, both of which carry the cached location with them, plus a location
change while _not_ moving, which is a placement or a teleport rather than a walk.
`entityMoved` still fans out every step, because that one genuinely is a sample —
an avatar tracking a neighbour wants its current position, not the last place it
stood still.

The cost is that `getLogicalLocation()` inside an avatar is stale for the
duration of a walk and settles when it stops. Nothing in the corpus reads it
mid-walk, and cross-entity reads do not go through it: `std:location_pixel` is
answered from the host's own live copy.

Measured over 90 frames of walking, per avatar, appearance pushes vs. distinct
rendered frames:

| avatar         | edge-only (now) | every frame (before) |
| -------------- | --------------- | -------------------- |
| guest.swf      | 0 → 19 frames   | 90 → 2 frames        |
| member.swf     | 0 → 17 frames   | 90 → 2 frames        |
| Kawaii_Basic_F | 0 → 20 frames   | 90 → 2 frames        |

### 15.8 Bitmap fills were sampling one texel

kawaii's drop shadow never appeared, and its eyes went dark after a state
change and stayed dark. Both were the same root cause, and it was not the one
the symptoms suggested.

What the evidence ruled out, in order: the mask/stencil path (turning masks off
changed the missing-pixel count by 1%), missing commands (every draw the backend
emits is rendered — the silent-drop counters stay at zero), Ruffle's
`render_offscreen` gap (this SWF carries no `PlaceObject3Tag`, so no filters and
no blend modes, and its ActionScript sets none at runtime), and the colour
transform (the shadow's mesh was in the scene with `mult` of exactly 1). The
decisive measurement was driving the _same manager_ against Ruffle's canvas
renderer: the shadow appeared. Since AVM state cannot depend on the render
backend, the draw had to be present and drawn invisibly.

It was. A bitmap fill is not a textured quad. The tessellated geometry carries
`position` and `color` and **no UVs at all** — the fill's own matrix is what maps
shape space onto the bitmap. Drawing it with a stock `MeshBasicMaterial` and a
`map` meant three had no `uv` attribute to read, so every vertex sampled texel
(0,0). For the shadow that corner texel is transparent, so the whole fill
vanished; for other shapes it is whatever colour happens to sit in the corner.

`swf_bitmap_to_gl_matrix` already inverts the matrix and scales it by the
bitmap's size, so it maps vertex position straight to 0..1 — the same convention
the gradient fills use, and the backend already forwards it along with
`smoothed` and `repeating`. Bitmap fills now get their own `ShaderMaterial`
built on that matrix, mirroring `createGradientMaterial`.

| kawaii, pixels covered in Ruffle but not in ours | before | after |
| ------------------------------------------------ | ------ | ----- |
| idle                                             | 20971  | 4269  |
| walk                                             | 17214  | 2286  |
| dance                                            | 23762  | 1612  |
| back to default                                  | 18038  | 1201  |

Mean per-pixel difference over the same frames fell from 5.5/10.3/2.9/2.4 to
4.8/2.6/2.0/1.7. `smoothed` is still ignored — the texture is shared between
draws, so per-draw filtering would need per-draw texture views.

Two further bugs fixed alongside, both found by measurement rather than by the
report:

**The colour transform dropped its RGB terms.** `MeshBasicMaterial` can only
express the alpha multiply through `opacity`, so the multiply and offset on
R, G and B were discarded. That is not a subtle shift: 34 of kawaii's draws
carry a multiply of 0.35, and dropping it renders a darkened copy at full
brightness. The stock materials are now patched through `onBeforeCompile` to
apply `clamp(uMult * color + uAdd, 0, 1)`, which keeps three's own vertex-colour
and bitmap handling intact.

**Pooled materials kept a stale opacity.** `opacity` was only assigned when the
alpha multiply was below 1, so a material that once carried a fade and was later
reused for an opaque draw stayed faded forever. Materials are pooled across
frames, so this was permanent and depended on draw order — which is what makes
a bug look like "it only happens after switching states".

### 15.9 Nameplate height, and the floor that was not quite the floor

**The SDK does report a height.** `EntityControl.setHotSpot(x, y, height)` takes
an optional third argument, and it is what Whirled positioned the name label
from. `x, y` is the hot spot — the point in the avatar's own coordinates that
sits at its location, i.e. the feet. `height` is how tall the avatar says it is,
in its own stage pixels.

This matters because a SWF's stage is a canvas, not a silhouette. An avatar
authored with headroom for a jump leaves the top of its frame empty, and a
nameplate placed at the top of the billboard floats well above the character.
Measured:

| avatar         | stage   | reported height | fraction of frame |
| -------------- | ------- | --------------- | ----------------- |
| Kawaii_Basic_F | 300x400 | 235.8           | 0.59              |
| guest.swf      | 200x200 | none            | —                 |
| member.swf     | 200x150 | none            | —                 |

kawaii passes `avatar.character.height + 10`, padding included, and uses only
the bottom 59% of its frame — which is exactly the gap that was showing. The
two stock avatars call `setHotSpot` with two arguments and report nothing, so
they keep falling back to the frame; there is nothing better to measure against.

The shim already forwarded this as `notifyHost("setHotSpot", [x, y, height])`
and `swf.ts` already declared the event — the value was simply dropped. It is
now kept on the entry and exposed as `getHeightFraction`, which the render
system multiplies into the billboard's bounding box.

**And the floor.** kawaii's shadow still did not appear in a real room after
§15.8, for an unrelated reason on our side. The SDK's `y` is height above the
floor, and avatars test it for _equality_ with zero rather than against a
tolerance:

```as3
if (_ctrl.getLogicalLocation()[1] != 0) { onGround = false; }
...
if (!onGround && avatar.character.shadow.shadow.alpha > 0) {
    avatar.character.shadow.shadow.alpha -= 0.1;
}
```

Our `y` comes from a raycast onto the floor mesh, which lands on something like
1e-16 rather than 0 about as often as not. That is enough to convince an avatar
it is airborne and fade its shadow out. It only bites while _walking_: with the
avatar standing still, `MOVE_EPSILON` swallows a y that small and nothing is
pushed at all, which is why it survived the harness and not the room.

`snapToFloor` now reports anything within 1e-4 of the floor as exactly zero.
Measured by frame coverage, with the avatar walking so the location actually
reaches it:

| y pushed              | covered pixels | shadow  |
| --------------------- | -------------- | ------- |
| standing, never moved | 119977         | on      |
| 1.1e-17 (raw raycast) | 112548         | **off** |
| snapped to 0          | 119968         | on      |
| 0.4 (genuinely up)    | 112548         | off     |

The raw-raycast figure is identical to the airborne one, which is the whole
bug in a single number. A real jump still turns the shadow off, as it should.

### 15.10 The swap bug, again, by a path the token did not cover

§14.10 fixed "wearing a second SWF avatar destroys the incoming one" with
registration tokens. Going through a glTF avatar in between brought it back:
**swf → glTF → swf** left the second SWF permanently unloaded.

`remove(eid, token?)` has two behaviours in one signature. With a token it
releases one registration and no-ops if the entity has since been given a
different avatar. Without one it releases whatever the entity currently has —
which is what `add` needs in order to clear the way for a replacement, and is
never what teardown wants.

The render system passed `avatar.userData.swfToken` straight through. A glTF or
Spine mesh carries no such token, so on the frame the outgoing glTF avatar was
torn down the call became the untokened form and destroyed the SWF that had
just registered. Measured through the manager directly:

| step                                  | entry for the entity |
| ------------------------------------- | -------------------- |
| wear SWF A                            | token 1              |
| wear glTF (teardown passes A's token) | released, correct    |
| wear SWF B                            | token 2              |
| teardown of the glTF, no token        | **released — wrong** |

The last row is the bug: the incoming avatar is destroyed, and because its
`add` is still waiting on a stage size that will never arrive, it hangs rather
than failing, which is why the avatar simply never appears.

An avatar that owns no SWF registration has nothing to release, so the render
system now calls `remove` only when it has a token, and the two behaviours are
spelled out on the method.

**Note on topology.** One Ruffle player is created per avatar and destroyed
when that avatar is replaced. That is the current design, not a regression:
W4's single-player-per-room is unscheduled, and §15 was built deliberately on
the one-player-per-avatar topology because routing is a host concern that does
not need it. Only `getEntityProperty` genuinely does.

### 15.11 The shadow was cut off at the billboard, and "" is not null

Two more, both found by testing the wrong layer and then the right one.

**The billboard discarded the shadow.** §15.8 got the shadow into the render
target and §15.9 got the avatar to stop believing it was airborne, and it still
did not appear in a room. The composed target was right the whole time; the
billboard threw the shadow away one step later. Its fragment shader cuts every
texel below `SWF_ALPHA_TEST`, which was 0.5, and the shadow's alpha peaks at
about 0.35:

| alpha, bottom fifth of kawaii's frame | texels |
| ------------------------------------- | ------ |
| 0.0 – 0.1                             | 8585   |
| 0.1 – 0.2                             | 4114   |
| 0.2 – 0.3                             | 2895   |
| 0.3 – 0.4                             | 2733   |
| 0.4 – 0.5                             | 465    |
| 1.0                                   | 21404  |

Every one of those sub-0.5 texels was discarded. The harnesses missed it because
they read the render target directly with `readRenderTargetPixels`, which is
upstream of the material — a good reminder that verifying a stage is not
verifying the pipeline.

The constant was doing two jobs. The outline pass wants the character's
silhouette and nothing else, so it keeps 0.5 as `SWF_OUTLINE_ALPHA_TEST`;
otherwise the outline wraps the drop shadow. The billboard now cuts at 0.02 —
just enough to keep empty frame out of the depth buffer — and blends the rest,
because avatars contain genuinely semi-transparent artwork and a cutout cannot
express it.

**`getState_v1` returned "" where Whirled returned null.** Spooky Ghost rendered
nothing at all, under our renderer _and_ under Ruffle's canvas renderer, which
ruled out the render path immediately. Its body is a `MovieClipBody`:

```as3
startState = null;
if (_ctrl.isConnected()) { startState = _ctrl.getState(); }
if (startState == null) { startState = "default"; }
switchToState(startState);          // getMovie("state_" + state), or return
```

"No state yet" and "the state is the empty string" are different answers, and
avatars branch on the difference — both `AvatarControl.getState`, which falls
back to the first registered state, and this, which falls back to `"default"`.
Returning `""` walks past both and sends the avatar looking for a movie named
`state_`, which does not exist, so `switchToState` returns having done nothing.
No error, no artwork. Spooky Ghost registers no states at all, so this is the
only branch it ever takes.

**Ground offset from the hot spot.** The same avatar exposed a second problem:
`measureBottomEdge` scans for the lowest row with alpha above 127, which asks
the wrong question of a translucent avatar. A ghost never reaches it, so the
scan finds nothing, spends its entire timeout doing so, and falls back to a
guess. `setHotSpot`'s y _is_ the feet line — Spooky Ghost reports 375 of its
400-pixel stage — so the ground offset now prefers it and only measures when no
hot spot was reported. `setPreferredY` still wins over both, being a request
rather than a description.

**And a bound on the visible-time waits.** §15.6 made loader timeouts count only
visible time, which is right — a hidden tab gets no rAF, so wall-clock time
there just burns the timeout. But counting _only_ visible time means a tab that
is never shown waits forever, and nothing downstream has a timeout of its own,
so the avatar simply never appears. The waits now expire on either clock, with
the wall-clock ceiling set well above the visible budget.

### 15.12 Never divide the premultiply back out

Lowering the billboard's cutout to 0.02 (§15.11) exposed the shader sitting
behind it. It undid the premultiply and blended normally:

```glsl
gl_FragColor = vec4(texel.rgb / texel.a, texel.a);
```

That division is unbounded as alpha approaches zero. At the old 0.5 cutout it
could at most double a texel's colour, which is why it was survivable. At 0.02
it multiplies by fifty, so every soft edge and the whole of a drop shadow blow
out towards white — and they shimmer as the artwork animates and different
texels land in the low-alpha band.

Premultiplied data wants premultiplied blending, not conversion. The texel now
goes to the blender exactly as it comes out of the target, with
`premultipliedAlpha: true` selecting `ONE, ONE_MINUS_SRC_ALPHA`. There is no
division and therefore no failure mode near zero.

Measured against a mid-green background, counting near-white pixels per sampled
frame: `[0, 3, 3, 2]` with premultiplied blending against `[0, 11, 11]` with the
division — and kawaii is mostly opaque artwork, so this understates it badly for
anything with large soft regions.

**Ground offset ordering, corrected.** §15.11 made the reported hot spot outrank
the measured bottom edge. That is backwards: measurement describes what is
actually drawn, and the hot spot is what the avatar claims, which for a
`setHotSpot(avatar.x, avatar.y, …)` call is the author's container origin and
need not be the feet at all. The order is now `setPreferredY` (a request, so it
wins), then the measured edge, then the hot spot, which is reached only when
measurement found nothing — exactly the translucent case it was added for. The
measuring loop gives up early in favour of the hot spot rather than spending its
whole timeout, but only after a fair number of frames.

### 15.13 The floor was standing in front of the shadow

The drop shadow survived §15.8 through §15.12 and still did not appear in a
room. Two things were hiding it, and only one of them was in the renderer.

**The floor plane clipped it.** A Flash avatar's artwork does not stop at its
feet. Whirled composited an avatar as a whole sprite over the room's floor art,
so a drop shadow is drawn _below_ the hot spot as a matter of course — kawaii's
reaches 38 rows of a 1200-row frame below the lowest opaque row, which at the
billboard's scale is about half a world unit. Standing that sprite upright in a
3D room puts all of it under the floor plane, where an opaque floor that writes
depth removes it.

The floor now keeps depth _testing_ and drops only the depth _write_. Furniture
still occludes it the usual way, because furniture writes its own depth and is
drawn first; all the change gives up is the floor's ability to hide something
drawn after it, and the only thing below the floor is avatar artwork that
belongs on the ground. Measured on a lit floor with the camera above: 7324
avatar pixels visible with the write, 7797 without, and the ellipse under the
feet is plainly there in the second.

**And the default room floor is pure black.** A dark, half-transparent shadow
composited over `color: 0x0` is exactly as dark as the floor it lands on. With
the floor black the pixel count is 7046 either way — the shadow is present,
correct, and indistinguishable. That is not a bug to fix in the renderer, but it
does mean "the shadow does not show" can have nothing to do with the shadow.

### 15.14 Height off the ground is not height

`setLocation` was handed the avatar's world y. That is the wrong quantity. The
SDK's y is _how far off the ground the avatar is_, and ours was the height of
whatever surface it walked onto — anywhere from 1e-16 on the floor plane to the
full height of a piece of furniture. Standing on a table is still standing on
the ground.

This matters more than a small numeric error would, because avatars test the
value for equality with zero rather than against a tolerance. kawaii's
`updateLook` does `if (getLogicalLocation()[1] != 0) onGround = false`, and its
`enterFrame` then fades the shadow out at 0.1 alpha per frame and leaves it out.
Nothing brings it back until an appearance edge reads a y of exactly zero again.
§15.9 patched the raycast's 1e-16 with an epsilon, which addressed the symptom
on a bare floor and nothing else.

Nothing in this game can leave the ground: movement is a raycast onto a surface,
so an avatar is by construction standing on something. The reported height is
now zero, and if flight or jumping is ever added it wants a real airborne flag
from the movement system rather than a world-space height.

Driving the manager directly and sweeping one input at a time is what separated
these: orientation, walking, stopping and every registered state all left the
shadow at ~18200 covered pixels in the bottom band of the frame, while a y of
0.2 dropped it to 4839 and returning to zero restored it to 18387. The mechanism
was never in doubt after that; what remained was finding which of the two
hiding places applied.

## 16. M6 plan: moving Flash off our origin

Written in response to the merge review. Nothing in §15 is a prerequisite; this
is independent of the renderer and can start now.

### 16.1 The stopgap, and why it is not the fix

`.github/workflows/fly.yml` deploys on push to `master`, so merging ships M4's
in-page Flash. Until M6 lands, SWF avatars should be **compiled out of
production builds** behind `import.meta.env.DEV`, the same shape as the guard
already in `swfsandbox.tsx`. Vite substitutes it at build time, so the shipped
bundle contains no branch to flip.

That is a gate, not a fix: it means the feature this branch exists for cannot be
used by anyone. M6 is what turns it back on.

### 16.2 Shape

One page, served from a second origin, hosting every avatar in the room.

```
  our origin                        │  sandbox origin
                                    │
  SwfAssetManager                   │  sandbox.html
    add / remove / setState  ──────►│    SwfHostBridge
    setLocation / setMoving         │      ├─ N × <ruffle-player>   (whirled-host.swf)
                                    │      ├─ room-state mirror     (answers sync queries)
    SwfStreamRenderer      ◄────────│      └─ /avatar proxy          (same Flash domain)
    (three.js, unchanged)           │
```

The manager keeps its public surface. `SwfStreamRenderer` does not change at
all: it already consumes the packed-record events, and they arrive the same way
whether a function call or a `message` event delivered them.

### 16.3 Steps

1. **Draw the seam where Flash is today.** Extract everything in
   `managers/swf.ts` that touches `RufflePlayer`, `player[name](…)`,
   `whirledHostEvent` and `whirledHostQuery` behind one interface — call it
   `SwfHost` — with an in-page implementation that is exactly today's code. No
   behaviour change, nothing crosses a boundary yet, and the branch stays
   shippable. This is the step that keeps a worker possible later.
2. **Move the room-state mirror behind the seam.** The synchronous query
   handlers (`answerQuery`, `entityProperty`, `routeSignal`, `routeMessage`) and
   the state they read move to the `SwfHost` side; the page pushes changes in.
   Still in-page, still synchronous, still no boundary — but now the queries no
   longer read page state, which is what makes them answerable remotely.
3. **Build the sandbox page and the message protocol.** A second `SwfHost`
   implementation that talks `postMessage` to `sandbox.html`. Commands out;
   stream events and host events back, transferring the typed arrays. Serve
   `sandbox.html`, `ruffle.js`, the wasm, `whirled-host.swf` and an `/avatar`
   proxy from the sandbox origin.
4. **Serve the second origin.** Dev: the same Go server on `localhost` while the
   app runs on `127.0.0.1`. Production: a second Fly app. The client picks the
   sandbox origin from a build-time constant next to `API_URL`.
5. **Tighten the sandbox.** Deny Ruffle networking; cap the proxy's file size and
   reject non-SWF bytes (`utils/swf` already parses enough to tell); a CSP on
   the sandbox document that permits only its own origin. `allowScriptAccess`
   stays on — the shim needs `ExternalInterface` — but it now reaches only the
   sandbox's own JS, which holds no session and no DOM of ours.
6. **Delete the old pipeline.** `game/client/swf.ts`, `ui/swfsandbox.tsx`, the
   `swf.js` entry in `vite.config.ts`, and the misleading global
   `preferredRenderer: "canvas"` in `main.ts` and `preview.ts`.
7. **Remove the production gate** from §16.1 and confirm on a deployed build.

### 16.4 Done when

-   An uploaded avatar that calls `ExternalInterface.call("eval", …)` runs it and
    reaches nothing: no page DOM, no `pb_auth`, no authenticated request it can
    make. Write that avatar; it is the acceptance test, and it is a better one
    than any amount of reading.
-   Two SDK avatars in one room still see each other and exchange signals — the
    §15 entity registry works through the boundary, which is the thing the
    synchronous queries put at risk.
-   Frame cost is unchanged within noise at 5 and 20 avatars against the M4
    numbers in §14.7.
-   `grep -r ruffle` finds nothing loaded by the app origin.

### 16.5 Known unknowns

-   **Whether Chrome gives the frame its own process.** Site isolation is the
    reason a runaway avatar stops blocking our render loop (G4). It is very
    likely and it is not guaranteed; measure it rather than assuming it, because
    the G4 claim rests on it entirely.
-   **Audio.** Still unaddressed (§9). It becomes easier here than in a worker —
    the sandbox is a normal document with a normal `AudioContext` — but a sound
    playing from an invisible cross-origin frame needs an autoplay story.
-   **The proxy is now the upload boundary.** Anything it will not serve, an
    avatar cannot load. That is the point, but it means the SWF sniffing has to
    be right or working avatars break.
-   **`API_URL` reads `window.parent.location`** for the `about:` case, a
    leftover of the old iframe pipeline that will throw cross-origin. It has to
    go when the sandbox page gets its own constant.
