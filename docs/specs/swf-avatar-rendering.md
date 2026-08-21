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

### W3 — Worker isolation

Move every Ruffle player into **one** dedicated Web Worker. The frame buffers
from W2 are small (kilobytes) and transferable, so this boundary is cheap in a
way the current `ImageBitmap`-per-avatar boundary is not.

It is also a better isolation boundary than the current iframe:

-   A worker has **no DOM at all**, so there is nothing to reach into. The current
    iframe's defense is a CSP, `sandbox="allow-scripts"`, and a hopeful
    `window.parent.location.href` probe at the top of `swf.ts`.
-   Flash bytecode never executes on the main thread, so a runaway avatar cannot
    stall rendering. Today it can. (G4)
-   One wasm instance serves all avatars instead of N.

With W1 in place the avatar no longer needs `ExternalInterface` at all, so
Ruffle can additionally be configured with `allowScriptAccess: false` and
networking denied.

Risk: `ruffle_web` is written against `web_sys` DOM APIs (canvas, audio, input,
navigator). A worker build needs those paths stubbed or feature-gated. W2's
backend removes the canvas dependency, which is the largest one, but audio and
input still need attention. **W3 should not start until W2 lands.**

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
| M6  | W3 worker                                                                                              | Zero Flash execution on the main thread; `swfsandbox.tsx` and `swf.ts` deleted             |
| M7  | Perf target                                                                                            | G2: 20 avatars at 60 fps                                                                   |

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
