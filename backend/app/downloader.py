"""yt-dlp based video extraction utilities.

This module wraps ``yt-dlp`` to expose two helpers:

* :func:`extract_info` -- get JSON metadata about a single video URL.
* :func:`stream_download` -- yield the raw bytes of a video so they can be
  streamed to an HTTP client without first being persisted to disk.

We intentionally keep the surface area small.  All policy decisions about
which platforms are allowed live in :mod:`app.routes`.
"""

from __future__ import annotations

import logging
import re
import subprocess
import sys
from collections.abc import Iterator
from typing import Any
from urllib.parse import urlparse

import yt_dlp

from app.schemas import Platform, VideoFormat, VideoInfo

logger = logging.getLogger(__name__)


SHORT_VIDEO_MAX_SECONDS = 600  # 10 minutes -- generous upper bound for "shorts"


_PLATFORM_HOSTS: dict[Platform, tuple[str, ...]] = {
    "facebook": ("facebook.com", "fb.watch", "fb.com", "m.facebook.com"),
    "tiktok": ("tiktok.com", "vm.tiktok.com", "vt.tiktok.com", "m.tiktok.com"),
    "instagram": ("instagram.com", "instagr.am"),
    "youtube": ("youtube.com", "youtu.be", "m.youtube.com", "youtube-nocookie.com"),
}


class DownloaderError(Exception):
    """Raised when extraction fails for a known reason."""

    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def detect_platform(url: str) -> Platform:
    """Return the canonical platform name for a URL, or ``"other"``."""

    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return "other"

    host = host.removeprefix("www.")
    for platform, hosts in _PLATFORM_HOSTS.items():
        if any(host == h or host.endswith(f".{h}") for h in hosts):
            return platform
    return "other"


def _ydl_opts(extra: dict[str, Any] | None = None) -> dict[str, Any]:
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        # The HF Spaces / Render free tiers occasionally hit slow TLS
        # handshakes against Instagram / YouTube edge nodes.  Give yt-dlp
        # generous timeouts and a few retries so a transient first-attempt
        # failure doesn't bubble up as a hard error.
        "socket_timeout": 30,
        "retries": 5,
        "fragment_retries": 5,
        "extractor_retries": 5,
        "retry_sleep_functions": {
            "http": lambda n: min(2 ** n, 8),
            "fragment": lambda n: min(2 ** n, 8),
            "extractor": lambda n: min(2 ** n, 8),
        },
        # Use a desktop UA -- some platforms block default yt-dlp UA on mobile pages.
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
        },
    }
    if extra:
        opts.update(extra)
    return opts


def _classify_quality(fmt: dict[str, Any]) -> str:
    height = fmt.get("height")
    if height:
        return f"{height}p"
    fmt_note = fmt.get("format_note")
    if fmt_note:
        return str(fmt_note)
    return fmt.get("format_id", "source")


def _build_format(fmt: dict[str, Any]) -> VideoFormat | None:
    """Translate a yt-dlp format dict into our :class:`VideoFormat` schema."""

    vcodec = fmt.get("vcodec") or "none"
    acodec = fmt.get("acodec") or "none"
    has_video = vcodec != "none"
    has_audio = acodec != "none"

    if not has_video:
        # We're a video downloader -- audio-only formats are not interesting.
        return None

    ext = fmt.get("ext") or "mp4"
    return VideoFormat(
        format_id=str(fmt["format_id"]),
        ext=str(ext),
        quality_label=_classify_quality(fmt),
        width=fmt.get("width"),
        height=fmt.get("height"),
        fps=fmt.get("fps"),
        filesize=fmt.get("filesize") or fmt.get("filesize_approx"),
        has_audio=has_audio,
        has_video=has_video,
        is_progressive=has_video and has_audio,
    )


def _normalize_info(info: dict[str, Any], platform: Platform) -> VideoInfo:
    raw_formats = info.get("formats") or []
    formats: list[VideoFormat] = []
    for fmt in raw_formats:
        parsed = _build_format(fmt)
        if parsed is not None:
            formats.append(parsed)

    progressive = [f for f in formats if f.is_progressive]
    progressive.sort(key=lambda f: (f.height or 0, f.fps or 0), reverse=True)
    if progressive:
        best_id: str | None = progressive[0].format_id
    else:
        best_id = "bv*+ba/best"

    duration = info.get("duration")

    return VideoInfo(
        id=str(info.get("id") or ""),
        title=str(info.get("title") or "Untitled video"),
        description=info.get("description"),
        uploader=info.get("uploader") or info.get("channel"),
        uploader_url=info.get("uploader_url") or info.get("channel_url"),
        platform=platform,
        duration_seconds=float(duration) if duration is not None else None,
        thumbnail=info.get("thumbnail"),
        webpage_url=info.get("webpage_url") or info.get("original_url") or "",
        formats=progressive or formats,
        best_format_id=best_id,
        is_short=(duration or 0) <= SHORT_VIDEO_MAX_SECONDS,
        view_count=info.get("view_count"),
        like_count=info.get("like_count"),
    )


_FRIENDLY_ERROR_PATTERNS: tuple[tuple[str, str], ...] = (
    # Instagram very frequently asks for cookies for "public" reels, and
    # yt-dlp's exact error wording for that case is recognizable -- match
    # it BEFORE the broader "login required" pattern so the message is
    # specific and actionable.
    (
        r"rate-limit reached.*login required"
        r"|requested content is not available"
        r"|sign in to confirm",
        "The platform is rate-limiting or asking us to sign in for this "
        "video. Try again in a few minutes, or test with a TikTok or "
        "Facebook link in the meantime.",
    ),
    (
        r"login required|requires authentication|requires you to be logged in",
        "This video is private or requires you to be logged in. "
        "We only support public videos.",
    ),
    (
        r"video unavailable|not available|removed",
        "The video is unavailable or has been removed.",
    ),
    (
        r"unsupported url|no video could be found",
        "We couldn't find a video at that URL. Double-check the link.",
    ),
    (r"http error 404", "The video link returned 404 (not found)."),
    (r"http error 403", "The host blocked the request (403)."),
    (
        r"http error 429|too many requests",
        "Rate-limited by the source. Wait a bit and try again.",
    ),
    # Cloud / shared-IP hosts (HF Spaces, Render free, etc.) sometimes
    # get slow TLS handshakes against Instagram / YouTube edge nodes.
    # Keep this pattern narrow so it doesn't swallow other errors.
    (
        r"handshake.*timed out|read timed out|connection timed out"
        r"|tls handshake|ssl.*timed out",
        "The source took too long to respond. This usually clears up in "
        "a minute or two -- please try again. (Some platforms throttle "
        "our deploy host's IP.)",
    ),
)


def _friendly_error(message: str) -> str:
    lowered = message.lower()
    for pattern, friendly in _FRIENDLY_ERROR_PATTERNS:
        if re.search(pattern, lowered):
            return friendly
    return "We couldn't fetch that video. Please verify the URL and try again."


def extract_info(url: str) -> VideoInfo:
    """Extract a normalized :class:`VideoInfo` for the given URL."""

    platform = detect_platform(url)
    try:
        with yt_dlp.YoutubeDL(_ydl_opts()) as ydl:
            raw = ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as exc:
        msg = str(exc)
        logger.warning("yt-dlp DownloadError for %s: %s", url, msg)
        raise DownloaderError(_friendly_error(msg), status_code=400) from exc
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Unexpected error extracting %s", url)
        raise DownloaderError(
            "Unexpected error while inspecting the video.",
            status_code=500,
        ) from exc

    if raw is None:
        raise DownloaderError("No video data returned.", status_code=502)

    if "entries" in raw and raw.get("entries"):
        # Playlist or carousel -- pick the first playable entry.
        entries = [e for e in raw["entries"] if e]
        if not entries:
            raise DownloaderError("This URL has no playable videos.", status_code=400)
        raw = entries[0]

    return _normalize_info(raw, platform)


def stream_download(
    url: str,
    *,
    format_selector: str | None = None,
) -> tuple[Iterator[bytes], str, str]:
    """Stream the chosen format of a video to the caller.

    Returns ``(byte_iterator, suggested_filename, content_type)``.

    Implementation note: we shell out to ``yt-dlp -o -`` so it can write the
    muxed result to stdout without us having to manage a temp file.  This is
    the same approach the official docs recommend for streaming.
    """

    info = extract_info(url)
    selector = format_selector or info.best_format_id or "best"

    safe_title = re.sub(r"[^\w\-. ]+", "_", info.title).strip("._ ") or "video"
    ext = "mp4"
    for fmt in info.formats:
        if fmt.format_id == selector and fmt.ext:
            ext = fmt.ext
            break
    filename = f"{safe_title}.{ext}"

    # Invoke via the current Python interpreter so we use the same yt-dlp
    # that the rest of the app imports -- no PATH lookups needed.
    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--no-playlist",
        "--quiet",
        "--no-warnings",
        # Mirror the timeout / retry settings from `_ydl_opts` so the
        # streaming path is just as resilient to flaky upstream TLS as
        # the metadata path.
        "--socket-timeout",
        "30",
        "--retries",
        "5",
        "--fragment-retries",
        "5",
        "--extractor-retries",
        "5",
        "-f",
        selector,
        "-o",
        "-",
        url,
    ]
    logger.info("Spawning yt-dlp for streaming")

    proc = subprocess.Popen(  # noqa: S603 - args are constructed safely above
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=0,
    )

    def _iter() -> Iterator[bytes]:
        assert proc.stdout is not None
        try:
            while True:
                chunk = proc.stdout.read(64 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            proc.stdout.close()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
            if proc.returncode not in (0, None):
                stderr_bytes = b""
                if proc.stderr is not None:
                    stderr_bytes = proc.stderr.read() or b""
                logger.warning(
                    "yt-dlp exited with code %s: %s",
                    proc.returncode,
                    stderr_bytes.decode(errors="replace")[:500],
                )

    content_type = "video/mp4" if ext == "mp4" else f"video/{ext}"
    return _iter(), filename, content_type
