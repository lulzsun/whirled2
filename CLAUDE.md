# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

`whirled2` is a browser-based 3D virtual world inspired by
[Whirled](https://github.com/greyhavens/msoy) (Three Rings Design). It is a
Go monolith (PocketBase + htmx server-rendered pages) that also serves a
three.js game client. Players walk around rooms, chat, place furniture, and
wear avatars. Avatars can be glTF, Spine, or **Adobe Flash `.swf`** files
authored with the original Whirled SDK, emulated at runtime by
[Ruffle](https://github.com/ruffle-rs/ruffle).

License is AGPL-3.0. Keep that in mind when vendoring third-party code.

## Commands

```bash
npm run dev            # concurrently: vite client + go server + tailwind + buf watchers
npm run dev-client     # vite dev server on 127.0.0.1:6969
npm run dev-server     # nodemon + `go run . serve` on 0.0.0.0:42069
npm run build-client   # vite build -> game/client/dist/ (+ tailwind css)
npm run build-server   # go build .
npm run build-proto    # buf generate (proto/ -> utils/proto/*.pb.go and game/client/proto/*_pb.ts)
npm run pretty         # prettier --write .
```

Bootstrap: `go install google.golang.org/protobuf/cmd/protoc-gen-go@latest && go mod download && npm ci`.
Requires node 18.14.2+, go 1.21+, and cloning with `--recurse-submodules`
(`gecgos/` is a submodule).

There is no test suite. Verify changes by running `npm run dev` and exercising
the client.

## Ports

| Port    | What                                                      |
| ------- | --------------------------------------------------------- |
| `6969`  | Vite dev server (client TS, HMR)                          |
| `42069` | Go server: PocketBase, htmx pages, `/static/*`, geckos.io |

`API_URL` in [constants.ts](game/client/constants.ts) resolves to
`:42069` on localhost/LAN IPs and to the bare origin in production. In
production the built client is copied into `web/static/` (see
[Dockerfile](Dockerfile)), so client and server are same-origin.

## Layout

```
main.go              PocketBase app: routes, event hooks, starts game server
api/                 htmx/HTML routes (auth, profile, room, stuff/inventory)
game/server/         Realtime game server over geckos.io (WebRTC datachannels)
gecgos/              Submodule: Go geckos.io server implementation
proto/  utils/proto/ game/client/proto/   Protobuf wire format (buf-generated)
utils/               DB bootstrap, SQL helpers, htmx helpers, idle middleware
web/templates/       Go html/template pages + components (htmx-driven)
web/static/          Static assets, Ruffle bundle, built client in prod
game/client/         three.js + bitECS client (TypeScript)
pb_data/             PocketBase SQLite data + uploaded user files (gitignored)
```

## Client architecture

The client is an **ECS** built on [bitecs](https://github.com/NateTheGreatt/bitECS)
driving a three.js scene.

-   [factory/world.ts](game/client/factory/world.ts) — `createWorld()` builds the
    bitECS world plus scene/camera/renderer/composer and the asset managers.
    A `World` is shared mutable state; systems read and write it directly.
-   [factory/systems.ts](game/client/factory/systems.ts) — fixed system order.
    imgui first, render last. `main.ts` runs `pipe(...systems)(world)` on rAF.
-   [components.ts](game/client/components.ts) — bitECS components. Note
    `TransformComponent`: `createPlayer` redefines `position`/`rotation`/`scale`
    properties on the three.js `Group` so they read/write the component's typed
    arrays. Mutating `entity.position.x` mutates ECS storage.
-   [factory/player.ts](game/client/factory/player.ts) — `createPlayer()` and the
    per-format avatar builders (`createGtlfAvatar`, `createSwfAvatar`,
    `createSpineMesh`). Avatar format is chosen by file extension.
-   [systems/network/](game/client/systems/network/) — geckos.io client, protobuf
    messages, remote player/object replication.
-   [systems/](game/client/systems/) — time, movement, control (raycast/picking),
    animation, editor, ui, imgui, render.
-   Pages are server-rendered Go templates; htmx swaps fragments and the client
    reaches back through `window.game` and `window.world`
    (see [main.ts](game/client/main.ts)).
-   `preview.ts` / `systems/preview.ts` run a second, standalone world used by the
    item-upload preview iframe.

Conventions:

-   JSX is `jsx-dom` (`jsxImportSource: "jsx-dom"`), **not React** — components in
    `ui/` return real DOM nodes.
-   three.js is pinned to **0.141**, an old version. Check the API before using
    anything modern (no WebGPURenderer, older postprocessing paths).
-   Prettier: tabs, width 4, double quotes, semicolons, trailing commas. Run
    `npm run pretty` after edits.
-   `web/static/*` is prettier-ignored and holds vendored bundles — don't reformat.

## SWF avatars (the fragile part)

Flash avatars are the most involved subsystem and the one most likely to change.
Read [docs/specs/swf-avatar-rendering.md](docs/specs/swf-avatar-rendering.md)
before touching it — it documents the design, what has landed, and what has not.

The pipeline was rewritten at M4. Ruffle now runs **in the page** against a
forked render backend that emits a command stream instead of drawing to a
canvas, and each avatar is composed into its own `WebGLRenderTarget`. Nothing is
read back per frame.

1. [managers/swf.ts](game/client/managers/swf.ts) (`SwfAssetManager`) creates one
   offscreen `<ruffle-player>` per avatar, loading
   `web/static/whirled-host.swf?avatar=<url>&hostId=<eid>` with
   `preferredRenderer: "three"`.
2. The **host shim** (`flash/whirled-host/src/WhirledHost.as`, built by
   `npm run build-shim`) loads the avatar SWF, answers the Whirled SDK's
   `controlConnect` handshake, and exposes `whirled*` `ExternalInterface`
   callbacks (`whirledSetState`, `whirledPlayAction`, `whirledSetAppearance`,
   `whirledGetStates`, `whirledGetStageSize`, …). Events come back to JS through
   the single global `whirledHostEvent(hostId, type, value)`.
3. The forked backend (`ruffle/render/stream`, selected by the `three` cargo
   feature) hands each frame's draw list to `player.whirledStream`.
4. [managers/stream.ts](game/client/managers/stream.ts) (`SwfStreamRenderer`)
   turns that stream into a three.js scene — tessellated shapes, gradient ramps,
   bitmaps, stencil masks — and composes it into a render target.
5. [systems/render.ts](game/client/systems/render.ts) calls
   `composeSwfStreams(world)` once per frame, before the composer.
6. `createSwfAvatar` builds the billboard: size from the SWF's **stage** size,
   ground offset measured from the composed frame, and a small `ShaderMaterial`
   that unpremultiplies before its alpha cutout.

Known constraints to respect:

-   **The render target holds premultiplied alpha.** Anything that samples it as
    straight alpha will darken and tint every soft edge. See spec §13.4.
-   **Composition must happen from the render system**, not from a message
    handler or a timer. It borrows `world.renderer`, and `OutlinePass` drives
    renderer state directly; composing at an undefined point in the frame
    produced nondeterministic output. See spec §13.4.
-   **Do not use `material.clone()` for per-draw materials.** three's
    `cloneUniforms` clones textures, which pins the GPU texture forever. Draw
    materials are pooled per use instead. See spec §14.6.
-   **Flash currently runs in the page, with no sandbox.** That is the accepted
    cost of M4 and what W3/M6 (worker) exists to fix. Do not ship user uploads to
    production in this state.
-   `swf.ts` and `ui/swfsandbox.tsx` are the old iframe pipeline, superseded and
    referenced by nothing. They stay until M6 replaces them with a worker.
-   Rebuilding the fork or the shim needs a toolchain most work does not:
    `npm run build-ruffle` (Rust + wasm-pack, `RUFFLE_DIR`) and
    `npm run build-shim` (Apache Flex + a JDK). Both outputs are committed.

## Things that will bite you

-   Working directory persists across shell calls; `cd` back to the repo root.
-   `pb_data/` is gitignored but contains the local dev database and uploads —
    never delete it casually.
-   `.env.local` is intentionally committed for local dev; real secrets go in
    `.env` (Fly).
-   The Go server appends `--http`/`--origins` args itself in debug mode
    ([main.go](main.go)); passing `--http` is what switches it to production mode.
-   `game/client/dist/` is gitignored build output. In production the
    Dockerfile copies it into `web/static/`; locally it is stale unless rebuilt.
