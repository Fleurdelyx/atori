# ATRI companion — add songs from streaming links

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
2. Start the companion:
   ```
   npm run companion
   ```
   It listens on `http://localhost:8790` (override with `PORT`).
3. In ATRI: LIBRARY → **ADD URL** — paste a link or search YouTube.

## What it does

- `GET /api/health` — `{ ok, ytdlp }` (yt-dlp version or null)
- `POST /api/search { query }` — YouTube search results
- `POST /api/download { url }` — downloads best-audio to a temp file, streams it
  back with an `X-Atori-Meta` header (title/uploader/duration/thumbnail), then
  deletes the temp copy. ATRI imports it like any local file.

URLs are validated before use: only public `http`/`https` links are accepted —
localhost, private/LAN and reserved addresses (including cloud metadata IPs)
are rejected, and the URL is passed to yt-dlp as a single argument (never a
shell), so a crafted link can't reach your network or run commands.

## Not supported

Spotify (and Apple Music, Tidal, etc.) are DRM-protected — nothing can
legitimately download from them, and the app will tell you so if you paste such
a link. Find the same track on YouTube and paste that link instead.
