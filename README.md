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

* **TikTok** and **Instagram Reels** — public videos work out of the box.
* **Facebook** — public videos and `fb.watch` links are supported.
* **YouTube** — Shorts work, but YouTube occasionally rate-limits server IPs.
  If you hit a "Sign in to confirm you're not a bot" error, configure cookies
  via `yt-dlp` (see the
  [yt-dlp cookies wiki](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp)).

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
