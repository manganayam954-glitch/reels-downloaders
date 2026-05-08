from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, HttpUrl

Platform = Literal["facebook", "tiktok", "instagram", "youtube", "other"]


class VideoFormat(BaseModel):
    """A single downloadable variant for a video (e.g. 720p mp4)."""

    format_id: str
    ext: str
    quality_label: str
    width: int | None = None
    height: int | None = None
    fps: float | None = None
    filesize: int | None = None
    has_audio: bool = True
    has_video: bool = True
    is_progressive: bool = True


class VideoInfo(BaseModel):
    """Metadata about a single video extracted by yt-dlp."""

    id: str
    title: str
    description: str | None = None
    uploader: str | None = None
    uploader_url: HttpUrl | str | None = None
    platform: Platform
    duration_seconds: float | None = None
    thumbnail: HttpUrl | str | None = None
    webpage_url: HttpUrl | str
    formats: list[VideoFormat] = Field(default_factory=list)
    best_format_id: str | None = None
    is_short: bool = True
    view_count: int | None = None
    like_count: int | None = None


class InfoRequest(BaseModel):
    url: HttpUrl


class ErrorResponse(BaseModel):
    error: str
    detail: str | None = None
