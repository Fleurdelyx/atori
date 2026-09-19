# ATRI — アトリ

An anime-aesthetic music player built as an art piece. Audio-reactive shader
backgrounds, gacha-game UI language (slash wipes, cut-ins, kinetic type,
holographic foil), a multi-skin design engine — on top of a purposeful,
Spotify/Qobuz-style player architecture. Local-first: your music never leaves
your machine.

![status](https://img.shields.io/badge/status-v0.1.0--alpha-orange)

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:1420
```

First run: click **IMPORT MUSIC FOLDER** to point Atori at your music
(MP3 / FLAC / WAV / OGG / OPUS / M4A), or just drag files & folders anywhere.

Dev extras:

```bash
pnpm gen:demo     # synthesize a tagged demo library into public/demo-library/
pnpm dev          # then open http://localhost:1420/?demo=1 for a one-click demo
```

`?demo=1` (dev builds only) pushes the generated WAVs through the *real*
import pipeline: worker-based tag parsing → IndexedDB → cover extraction.

## What's inside (v0.2)

- **Now Playing showpiece** — fullscreen audio-reactive shader stage
  (Three.js), pointer-tilt cover art, glitch-in kinetic typography,
  hi-res metadata line, animated spectrum strip, gacha cut-in on every
  track change, shared-element morph from the mini player.
- **Library power tools** — playlists (create/rename/delete, add via
  right-click menu), slide-over queue panel (jump / play next / remove /
  clear), gacha-styled right-click context menus everywhere, toast
  feedback, virtualized track lists (TanStack Virtual — smooth at 10k+).
- **Cloud library (R2)** — sync your local library up to a Cloudflare R2
  bucket through the `worker/` Cloudflare Worker (auth, manifest,
  range-streaming, uploads), browse & stream it from the CLOUD screen,
  cache albums for offline playback.
- **Command palette (Ctrl+K)** — fuzzy track search + navigation, skin
  switching, calm mode.
- **Karaoke lyrics** — embedded USLT/SYLT or sidecar `.lrc` files render
  as synced, highlighted lyric sheets in Now Playing.
- **Three complete skins**, hot-swappable live (tokens + shader + motion
  profile + fonts all swap):
  - `NEON GACHA` — charcoal / magenta-cyan / gold foil, perspective grid
  - `PASTEL DREAMY` — city-pop sunset gradients, bokeh, film grain (light UI)
  - `CELESTIAL` — indigo night, twinkling starfield, gold leaf, serif type
- **Real player engine** — Web Audio graph with 10-band EQ + analyser tap,
  queue/shuffle/repeat, Media Session (OS media keys), preloading,
  play-count tracking.
- **Library** — Dexie/IndexedDB persistence, Web-Worker metadata parsing
  (`music-metadata`), embedded cover-art extraction with LRU object-URL
  cache, FS-Access handle persistence (re-opens without re-importing).
- **Gacha UI kit** — slash panels, foil sweep covers, rarity grades
  (SSR = lossless/hi-res), kinetic text, cut-ins, boot sequence,
  calm mode (respects `prefers-reduced-motion`), FX quality presets.
- **Tests** — Vitest over the core (LRC parser, quality grades, cloud
  key/URL/manifest mapping, import contracts): `pnpm test`.

## Keyboard & OS

| Input | Action |
|---|---|
| `Space` | play / pause |
| `Ctrl+K` | command palette |
| Media keys | play/pause/next/prev via Media Session |
| Click boot screen | skip intro |

## Cloud (Cloudflare R2 + accounts)

The `worker/` package is a Cloudflare Worker (Hono) fronting an R2 bucket and
a D1 database. Two access modes:

**Accounts (default)** — register/login with email + password; each user gets
an isolated namespace (`u/<uid>/…` in R2), their own manifest, favorites and
cloud playlists. Passwords are PBKDF2-hashed; sessions are hashed tokens with
30-day sliding expiry.

```bash
cd worker
pnpm install
pnpm wrangler d1 create atori-auth        # copy the real database_id into wrangler.toml
pnpm wrangler d1 migrations apply atori-auth --local   # dev (add --remote for prod)
pnpm wrangler dev            # local simulation on :8787 (no account needed)
pnpm wrangler deploy         # production — then:
pnpm wrangler d1 migrations apply atori-auth --remote
pnpm wrangler secret put AUTH_TOKEN
pnpm wrangler secret put ALLOWED_ORIGIN   # e.g. https://your-app.pages.dev
```

In the app: **SETTINGS → CLOUD → ACCOUNT**, paste the worker URL, CREATE
ACCOUNT (or SIGN IN). Then **CLOUD → SYNC LIBRARY UP** uploads your library
(tracks + covers + manifest) into your namespace; stream any cloud track,
♥-save tracks, build CLOUD PLAYLISTS (right-click a cloud track), or CACHE
OFFLINE per album. Favorites/playlists sync to the account; local playlists
stay separate under LIBRARY → PLAYLISTS → LOCAL.

**Advanced (legacy shared token)** — the old single-token mode still works for
private/LAN self-hosting: SETTINGS → CLOUD → ADVANCED — SHARED TOKEN, paste
URL + token, CONNECT. Same endpoints as before (`/api/manifest`,
`/api/upload/*`, `/api/stream/*` with `?token=`).

**URL downloads (Cobalt)** — signed-in users can add songs from streaming
links via **LIBRARY → ADD URL** from any device (no local yt-dlp needed).
The worker calls a [Cobalt](https://github.com/imputnet/cobalt)-compatible
downloader API and stores the audio in the user's namespace. Configure the
worker with:

```bash
pnpm wrangler secret put DL_BASE   # e.g. https://your-cobalt.example.com (or a public instance)
pnpm wrangler secret put DL_KEY    # optional — only if the instance requires an API key
```

Any Cobalt v10+ instance works (self-host via their Docker image for full
privacy, or use a public instance with an API key). Personal use only —
respect the source platforms' terms.

Notes: media elements cannot send headers, so stream GETs pass the session or
shared token as a query param. Keep the worker URL unlisted; rotate
`AUTH_TOKEN` if it leaks. HTTPS-only in production (workers.dev is TLS by
default). If a session expires, the app prompts re-login instead of silently
failing.

## Desktop (Tauri 2)

```bash
pnpm tauri dev     # native window, hot-reloads the Vite UI
pnpm tauri build   # installer (NSIS/MSI)
```

## Roadmap

Remaining polish: drag-reorder for playlists/queue, watch-folder auto
re-scan, virtualizer mode selector, per-skin UI SFX, and a production
`wrangler deploy` against a real Cloudflare account (local simulation and
`--dry-run` bundling both verified).

## Architecture

```
src/
  core/            engine room (no UI)
    audio/         AudioEngine, AudioLevels FFT tap, playback store
    library/       Dexie db, import service, metadata worker, covers, lyrics
    cloud/         CloudService (R2 client), cloud store, engine resolvers
  fx/              ShaderStage (Three.js canvas), FxDirector bus, GLSL
  skins/           SkinDef data: tokens, motion, shader pack, particles
  ui/kit/          KineticText, HoloCover, GradeBadge, SpectrumBars, CutIn,
                   LyricsSheet, CommandPalette
  shell/           NavRail + Director (view transitions), MiniPlayer
  screens/         Boot, Home, Library, Album, Cloud, Settings, NowPlaying
  state/           ui store (persisted: skin, fx quality, EQ, cloud, calm)
worker/            Cloudflare Worker (Hono) — R2 auth/manifest/stream/upload
src-tauri/         Tauri 2 desktop shell (Rust)
scripts/           demo-library + icon generators (stdlib only)
```

Layer rules: core never imports UI; skins are data; the FX stage is one
canvas behind everything; frame-driven UI (seek bars, spectrum) mutates DOM
imperatively in rAF — React never re-renders per frame.

See [docs/DESIGN_BIBLE.md](docs/DESIGN_BIBLE.md) for the visual language.

## Performance & accessibility

- Transform/opacity-only CSS animations; FLIP via Motion for layout morphs
- DPR caps per FX tier (Ultra 2.0 → Low 0.66), render pause when tab hidden
- `prefers-reduced-motion` → calm mode default (fade-only, frozen shader time)
- Keyboard navigable, focus-visible rings, contrast-checked token pairs

## Privacy

Import, tags, covers, playback — 100% local. The R2 cloud phase is opt-in and
token-gated; nothing uploads without explicit configuration.
