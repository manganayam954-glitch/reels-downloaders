# Contributing

Thanks for taking the time to contribute! This project is small but tries
to keep the bar for code quality high. The notes below should get you set
up in less than five minutes.

## Project shape

* `backend/` — FastAPI + yt-dlp service exposing `/api/info`,
  `/api/download`, `/api/platforms`.
* `frontend/` — Vite + React + Tailwind + shadcn UI for pasting links
  and downloading the resulting MP4.
* `.github/workflows/ci.yml` — runs the lint/build matrix on every PR.
* `render.yaml`, `backend/fly.toml` — deployment blueprints.

## Local setup

You only need Python 3.12, Node 20, and `ffmpeg` on `$PATH`.

```bash
# Backend
cd backend
poetry install
poetry run fastapi dev app/main.py --host 127.0.0.1 --port 8000

# Frontend (in another terminal)
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Before opening a PR

```bash
# Backend
cd backend
poetry run python -m compileall app

# Frontend
cd frontend
npm run lint
npm run build
```

CI runs the same commands; PRs that fail CI won't be merged.

## Pull-request style

* One logical change per PR.
* Use a descriptive title — e.g. `Add Instagram carousel support` rather
  than `update`.
* Reference any issue you're fixing in the description.
* If you add a new dependency, justify it briefly in the description.
* Keep `app/main.py` CORS untouched and the FastAPI instance named `app`
  (the deploy server expects both).

## Reporting bugs

Open an issue with:

* The platform / URL pattern you tried (sanitize anything personal).
* The error you saw in the browser and, if possible, the response body
  from `POST /api/info`.
* Browser, OS, and roughly what time the failure happened (helps when
  the platform changes its API on us).

Thanks!
