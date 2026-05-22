# Reels Downloaders

A modern, free web app for downloading short videos from **TikTok**,
**Instagram (Reels)**, **Facebook**, and **YouTube (Shorts)**. Paste a public
link, pick the quality you want, and the app streams a clean MP4 straight to
your device — no signup, no watermark, no ads.

![Reels Downloaders hero](docs/hero.png)

> **Disclaimer.** This project is intended for personal use with public,
> non-copyrighted content (e.g. videos you own or videos that are explicitly
> licensed for reuse). Always respect each platform's Terms of Service and
> applicable copyright law before downloading.

---

## Architecture

```
┌─────────────────────┐         ┌──────────────────────┐
│  React + Vite + TS  │ HTTPS   │  FastAPI + yt-dlp    │
│  Tailwind / shadcn  │ ──────► │  /api/info           │
│  (frontend)         │         │  /api/download       │
└─────────────────────┘         └──────────────────────┘
```

* **Backend** (`backend/`) — FastAPI + [yt-dlp](https://github.com/yt-dlp/yt-dlp)
  exposing two endpoints:
  * `POST /api/info` — extract video metadata + available formats
  * `GET /api/download?url=...&format_id=...` — stream the muxed MP4
* **Frontend** (`frontend/`) — React + Vite + Tailwind + shadcn/ui with a
  dark, glassmorphic UI, platform auto-detection, format picker, toast
  notifications and a local "recent downloads" history.

## Getting started

### Requirements
* Python 3.12 + [Poetry](https://python-poetry.org/)
* Node.js 20+ and npm
* `ffmpeg` available on `$PATH` (used by yt-dlp to mux some formats)

### 1. Run the backend

```bash
cd backend
poetry install
poetry run fastapi dev app/main.py --host 127.0.0.1 --port 8000
```

The API will be live at <http://localhost:8000>. Check
<http://localhost:8000/docs> for the interactive Swagger UI.

### 2. Run the frontend

```bash
cd frontend
cp .env.example .env   # points at http://localhost:8000 by default
npm install
npm run dev
```

Open <http://localhost:5173>, paste a public TikTok/Instagram/Facebook/YouTube
link, and download the video.

## Project layout

```
.
├── backend/              # FastAPI + yt-dlp
│   ├── app/
│   │   ├── main.py       # FastAPI app + CORS
│   │   ├── routes.py     # /api/info, /api/download, /api/platforms
│   │   ├── downloader.py # yt-dlp wrapper (extract + stream)
│   │   └── schemas.py    # Pydantic models
│   └── pyproject.toml
└── frontend/             # React + Vite + Tailwind
    ├── src/
    │   ├── App.tsx
    │   ├── components/
    │   └── lib/
    └── package.json
```

## API

### `POST /api/info`
```json
{ "url": "https://www.tiktok.com/@user/video/1234..." }
```
Returns metadata + a normalized list of progressive (audio + video) formats.

### `GET /api/download?url=...&format_id=...`
Streams the chosen format with a `Content-Disposition` attachment header so
the browser saves it directly. If `format_id` is omitted the backend picks
the highest-quality progressive format.

### `GET /api/platforms`
Returns `{ "supported": ["facebook", "instagram", "tiktok", "youtube"] }`.

## Notes on each platform

* **TikTok** — public videos work out of the box, no cookies needed.
* **Facebook** — public videos and `fb.watch` links work locally and from
  most hosts. **However**, some shared-IP cloud hosts (notably the free
  tier of Hugging Face Spaces) have their outbound IP ranges throttled by
  Facebook's edge, which causes every request to time out at 30 s. If you
  hit "The source took too long to respond" on every Facebook URL, the fix
  is to deploy the backend somewhere with a different egress IP (Render,
  Fly.io, your own VPS) — the code itself works.
* **Instagram Reels** — public reels work, but Instagram aggressively rate-
  limits anonymous traffic from datacenter IP ranges. If a reel that works
  in a browser returns "rate-limit reached or login required", provision
  a cookies file (see below). The downloader uses Instagram's GraphQL
  endpoint by default, which is more reliable than the default web-page
  scraper, but cookies are the only thing that fully unblocks IG today.
* **YouTube** — Shorts work, but YouTube occasionally rate-limits server
  IPs. If you hit a "Sign in to confirm you're not a bot" error, provision
  cookies as below.

### Optional: providing cookies for Instagram / Facebook / YouTube

The backend reads cookies from environment variables, so you can wire them
up on any host (HF Spaces, Render, Fly.io, Docker Compose, …) without
committing the cookies to git. Two equivalent ways to provide a cookies
file, in priority order:

| Env var | Meaning |
|---|---|
| `INSTAGRAM_COOKIES_FILE` | Path on disk to a Netscape-format cookies file. |
| `INSTAGRAM_COOKIES`      | The *contents* of that cookies file, as a single multi-line string. The backend writes it to a tempfile on first use. Easiest on hosts that only let you set env vars. |

The same pattern works for `FACEBOOK_COOKIES{,_FILE}`, `YOUTUBE_COOKIES{,_FILE}`,
and `TIKTOK_COOKIES{,_FILE}`. Generic `COOKIES{,_FILE}` is also honoured
as a last-resort fallback for *all* platforms.

To export cookies from your browser, use the
[**Get cookies.txt LOCALLY**](https://chromewebstore.google.com/detail/cclelndahbckbenkjhflpdbgdldlbecc)
Chrome extension (the "LOCALLY" suffix matters — the older extension is
deprecated). Browse to instagram.com while logged in, click the extension,
and click "Export". The downloaded `cookies.txt` is the value to use.

Then either set:

```bash
# Hugging Face Space → Settings → Variables and secrets → New secret
# Name:  INSTAGRAM_COOKIES
# Value: <paste the entire body of cookies.txt>
```

…or mount the file at a known path and point at it:

```bash
# docker-compose / fly.toml
INSTAGRAM_COOKIES_FILE=/data/instagram-cookies.txt
```

The backend will pass `--cookies <file>` to yt-dlp on every Instagram
request. Same for Facebook / YouTube / TikTok if you set those env vars.

> **Privacy note.** A cookies file is equivalent to your logged-in
> session — anyone with that file can act as you on Instagram. Treat it
> like a password. Use a throwaway account if you're going to host the
> backend publicly.

## Deploying

### Backend on Render (free, Docker)

The repo ships a [`render.yaml`](./render.yaml) blueprint:

1. Sign in at <https://dashboard.render.com>.
2. Click **New** → **Blueprint** → connect this GitHub repo.
3. Render reads `render.yaml`, builds `backend/Dockerfile`, and gives you a
   public URL like `https://reels-downloaders-api.onrender.com`.
4. Free-tier services spin down after ~15 min of idle traffic; the first
   request after a sleep takes ~30–60 s while the container wakes.

### Backend on Fly.io (alternative)

A `backend/fly.toml` is included for `fly launch --copy-config` if you'd
rather use [Fly.io](https://fly.io). Make sure your org has machines
available; otherwise `fly deploy` will fail with a machine-limit error.

### Frontend on any static host

```bash
cd frontend
echo "VITE_API_BASE_URL=https://your-deployed-backend.onrender.com" > .env
npm run build
```

Upload the resulting `frontend/dist/` folder to Netlify, Vercel, Cloudflare
Pages, or any other static host.

## Contributing

Pull requests welcome — see [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the
full workflow (lint, tests, conventional commits).

## License

MIT — see [`LICENSE`](LICENSE).
