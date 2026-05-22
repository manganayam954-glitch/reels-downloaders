---
title: Reels Downloaders API
sdk: docker
app_port: 8000
pinned: false
license: mit
short_description: yt-dlp-powered API for downloading short videos
---

# Reels Downloaders — Backend

FastAPI + [yt-dlp](https://github.com/yt-dlp/yt-dlp) service used by the
Reels Downloaders frontend. The YAML block at the top of this file is
metadata for [Hugging Face Spaces](https://huggingface.co/docs/hub/spaces-config-reference);
GitHub renders the rest of this file normally.

## Endpoints

* `POST /api/info` — body `{ "url": "..." }`. Returns video metadata + a
  normalized list of progressive (audio + video) formats.
* `GET /api/download?url=...&format_id=...` — streams the chosen MP4
  back to the client with a `Content-Disposition: attachment` header.
* `GET /api/platforms` — `{ "supported": ["facebook", "instagram",
  "tiktok", "youtube"] }`.
* `GET /healthz` — liveness probe used by deploy targets.

## Local development

```bash
poetry install
poetry run fastapi dev app/main.py --host 127.0.0.1 --port 8000
```

`ffmpeg` must be on `$PATH` (yt-dlp uses it to mux some formats).

## Deploy

A `Dockerfile` is provided. Three deploy targets are pre-configured:

* **Hugging Face Spaces** — push this folder as a Space's git repo
  (Docker SDK, `app_port: 8000`, free CPU tier).
* **Render** — repo-root [`render.yaml`](../render.yaml) blueprint.
* **Fly.io** — [`fly.toml`](./fly.toml) for `fly launch --copy-config`.

See the root [`README.md`](../README.md) for full instructions.
