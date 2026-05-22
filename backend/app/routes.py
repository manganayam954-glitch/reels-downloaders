"""HTTP routes for the Reels Downloaders API."""

from __future__ import annotations

import logging
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.downloader import (
    DownloaderError,
    detect_platform,
    extract_info,
    normalize_url,
    stream_download,
)
from app.schemas import InfoRequest, VideoInfo

logger = logging.getLogger(__name__)

router = APIRouter(tags=["downloader"])


SUPPORTED_PLATFORMS = {"facebook", "tiktok", "instagram", "youtube"}


def _ensure_supported(url: str) -> str:
    platform = detect_platform(normalize_url(url))
    if platform == "other":
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported source. We currently support Facebook, "
                "Instagram (Reels), TikTok and YouTube links."
            ),
        )
    return platform


@router.post("/info", response_model=VideoInfo)
async def get_info(payload: InfoRequest) -> VideoInfo:
    """Return metadata + available formats for a video URL."""

    url = str(payload.url)
    _ensure_supported(url)

    try:
        return extract_info(url)
    except DownloaderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/download")
async def download(
    url: str = Query(..., description="Video URL"),
    format_id: str | None = Query(
        None,
        description="Optional yt-dlp format id. Defaults to the best progressive MP4.",
    ),
) -> StreamingResponse:
    """Stream the chosen video format back as a downloadable file."""

    _ensure_supported(url)

    try:
        iterator, filename, content_type = stream_download(
            url, format_selector=format_id
        )
    except DownloaderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    quoted = quote(filename)
    headers = {
        "Content-Disposition": (
            f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quoted}"
        ),
        "Cache-Control": "no-store",
    }
    return StreamingResponse(iterator, media_type=content_type, headers=headers)


@router.get("/platforms")
async def platforms() -> dict[str, list[str]]:
    """List which platforms the backend will accept."""

    return {"supported": sorted(SUPPORTED_PLATFORMS)}
