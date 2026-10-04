# ATRI companion: add songs from streaming links

A tiny zero-dependency Node helper that lets the ATRI web app download songs
from YouTube, YouTube Music, SoundCloud, Bandcamp and other yt-dlp-supported
sites straight into your library.

## Setup

1. Install [yt-dlp](https://github.com/yt-dlp/yt-dlp) and make sure it's on your
   PATH (`yt-dlp --version`):
   ```
   pip install yt-dlp
   ```
   (or `winget install yt-dlp`, `scoop install yt-dlp`, brew, etc.)
2. That's it for the desktop app: it spawns the companion itself on launch
   (and keeps yt-dlp fresh with a daily `yt-dlp -U` / pip upgrade check, first
   one ~15s after startup). Start it by hand only when driving the web build
   standalone:
   ```
   npm run companion
   ```
   It listens on `http://localhost:8790` (override with `PORT`).
3. In ATRI: LIBRARY → **ADD URL**, paste a link or search YouTube.

## What it does

- `GET /api/health`: `{ ok, ytdlp, updatedAt, update }` (version + last
  self-update check)
- `POST /api/search { query }`: YouTube search results
- `POST /api/playlist { url }`: expand a playlist URL into entries
- `POST /api/download { url }`: downloads best-audio to a temp file, streams it
  back with an `X-Atori-Meta` header (title/uploader/duration/thumbnail), then
  deletes the temp copy. ATRI imports it like any local file.
- `POST /api/update`: force the yt-dlp self-update check now

URLs are validated before use: only public `http`/`https` links are accepted.
Localhost, private/LAN and reserved addresses (including cloud metadata IPs)
are rejected, and the URL is passed to yt-dlp as a single argument (never a
shell), so a crafted link can't reach your network or run commands.

## Not supported

Spotify (and Apple Music, Tidal, etc.) are DRM-protected; nothing can
legitimately download from them, and the app will tell you so if you paste such
a link. Find the same track on YouTube and paste that link instead.

## Remote downloads: use this PC as the worker's yt-dlp engine

The cloud worker's ADD URL (accounts mode) needs an external downloader
(`DL_BASE`). Your companion can BE that downloader: YouTube extraction runs
on this PC's residential IP, which is the only reliably unblocked location.

Setup (a quick tunnel's URL changes each run; a stable one is covered below):

1. Install the tunnel: `winget install Cloudflare.cloudflared`
2. Start a quick tunnel and keep the window open:
   ```powershell
   cloudflared tunnel --url http://localhost:8790
   ```
   It prints a `https://<random>.trycloudflare.com` URL.
3. Restart the companion with that URL:
   ```powershell
   $env:PUBLIC_BASE="https://<random>.trycloudflare.com"; npm run companion
   ```
5. Point the worker at it (once per tunnel URL):
   ```powershell
   cd worker
   $env:CLOUDFLARE_API_TOKEN="<your token>"
   npx wrangler secret put DL_BASE   # paste the same tunnel URL
   npx wrangler deploy
   ```

Now ADD URL works signed-in from ANY device: the worker calls this PC, which
downloads via yt-dlp and serves the file for upload into R2. Files auto-expire
from the tunnel cache after 30 minutes; nothing lingers locally. PC off =
remote downloads off (streaming still works; it reads from R2).

For a stable URL instead of the random one: `cloudflared tunnel` (named) with
a domain in your Cloudflare account.
