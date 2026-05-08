from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import router as downloader_router

app = FastAPI(
    title="Reels Downloaders API",
    description=(
        "Backend API that extracts and downloads short videos from "
        "Facebook, TikTok, Instagram (Reels) and YouTube using yt-dlp."
    ),
    version="0.1.0",
)

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(downloader_router, prefix="/api")
