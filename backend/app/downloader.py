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
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import yt_dlp

from app.schemas import Platform, VideoFormat, VideoInfo

logger = logging.getLogger(__name__)


SHORT_VIDEO_MAX_SECONDS = 600  # 10 minutes -- generous upper bound for "shorts"

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

DEFAULT_ACCEPT_LANGUAGE = "en-US,en;q=0.9,id;q=0.8"

BEST_VIDEO_SELECTOR = (
    "best[ext=mp4][vcodec!=none][acodec!=none]/"
    "best[vcodec!=none][acodec!=none]/"
    "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/best"
)


def _resolve_cookiefile(platform: Platform | None) -> str | None:
    """Return a path to a Netscape-format cookies file for ``platform`` if one
    has been provisioned via env vars, else ``None``.

    Two ways to provide cookies (in order of priority):

    1. ``{PLATFORM}_COOKIES_FILE`` env var pointing to a file path on disk.
    2. ``{PLATFORM}_COOKIES`` env var containing the file *contents* directly
       (useful on hosts like HF Spaces where you can only inject env vars,
       not files). Contents are written to a per-platform tempfile on first
       use.

    Where ``{PLATFORM}`` is one of ``INSTAGRAM`` / ``FACEBOOK`` / ``TIKTOK`` /
    ``YOUTUBE``. A platform-specific value wins over the generic ``COOKIES*``
    fallback.
    """

    candidates: list[str] = []
    if platform:
        candidates.append(platform.upper())
    candidates.append("")  # generic fallback (env vars without a prefix)

    for prefix in candidates:
        path_var = f"{prefix}_COOKIES_FILE" if prefix else "COOKIES_FILE"
        body_var = f"{prefix}_COOKIES" if prefix else "COOKIES"

        path = os.environ.get(path_var)
        if path and Path(path).is_file():
            return path

        body = os.environ.get(body_var)
        if body and body.strip():
            cache_path = Path(tempfile.gettempdir()) / f"snapreel_{prefix.lower() or 'cookies'}.txt"
            try:
                cache_path.write_text(body, encoding="utf-8")
            except OSError as exc:  # pragma: no cover - defensive
                logger.warning("Failed to materialise cookies file %s: %s", cache_path, exc)
                continue
            return str(cache_path)

    return None


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


def _ydl_opts(
    extra: dict[str, Any] | None = None,
    *,
    platform: Platform | None = None,
) -> dict[str, Any]:
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
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept-Language": DEFAULT_ACCEPT_LANGUAGE,
        },
        # Some Meta extractors expose alternate APIs that work better in
        # 2026 than the default web-page scraper.
        "extractor_args": {
            "instagram": {"api": ["graphql"]},
            "youtube": {"player_client": ["android", "web"]},
        },
    }

    cookiefile = _resolve_cookiefile(platform)
    if cookiefile:
        opts["cookiefile"] = cookiefile
        logger.info("Using cookies file %s for %s", cookiefile, platform or "any")

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
        best_id = BEST_VIDEO_SELECTOR

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


def normalize_url(url: str) -> str:
    """Clean common mobile/share wrappers before handing the URL to yt-dlp."""

    parsed = urlparse(url.strip())
    host = (parsed.hostname or "").lower().removeprefix("www.")

    if host in {"l.facebook.com", "lm.facebook.com"}:
        target = parse_qs(parsed.query).get("u", [None])[0]
        if target:
            return unquote(target)

    if host == "youtube.com" and parsed.path == "/redirect":
        target = parse_qs(parsed.query).get("q", [None])[0]
        if target:
            return unquote(target)

    return url.strip()


def extract_info(url: str) -> VideoInfo:
    """Extract a normalized :class:`VideoInfo` for the given URL."""

    url = normalize_url(url)
    platform = detect_platform(url)
    try:
        with yt_dlp.YoutubeDL(_ydl_opts(platform=platform)) as ydl:
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


_BASE_YTDLP_FLAGS: tuple[str, ...] = (
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
    # Mirror `extractor_args` from `_ydl_opts` -- some Meta extractors
    # have alternate APIs that work better in 2026.
    "--extractor-args",
    "instagram:api=graphql;youtube:player_client=android,web",
    "--user-agent",
    DEFAULT_USER_AGENT,
    "--add-header",
    f"Accept-Language:{DEFAULT_ACCEPT_LANGUAGE}",
)


def _selector_needs_merging(selector: str) -> bool:
    """Return True if a yt-dlp format selector requires merging two streams.

    yt-dlp can stream a single muxed format directly to stdout, but a
    selector like ``bv*+ba`` or ``137+140`` produces two separate streams
    that must be muxed via ffmpeg into a real MP4 -- and MP4 muxing needs a
    seekable output (the ``moov`` atom must be patched in at the end), so we
    can't pipe to stdout.  In that case we download to a tempfile and stream
    that back instead.
    """

    return "+" in selector or "bv" in selector or "ba" in selector


def stream_download(
    url: str,
    *,
    format_selector: str | None = None,
) -> tuple[Iterator[bytes], str, str]:
    """Stream the chosen format of a video to the caller.

    Returns ``(byte_iterator, suggested_filename, content_type)``.

    For *progressive* formats (audio + video already muxed by the platform,
    common on TikTok / Facebook), we shell out to ``yt-dlp -o -`` so the
    bytes flow through stdout with zero filesystem footprint.

    For *DASH* formats (audio + video as separate streams, common on
    Instagram / YouTube), we download to a tempfile, ask yt-dlp to remux
    into MP4, and then stream the tempfile back to the client -- because
    you cannot mux MP4 to a non-seekable stdout pipe.
    """

    url = normalize_url(url)
    info = extract_info(url)
    selector = format_selector or info.best_format_id or "best"

    safe_title = re.sub(r"[^\w\-. ]+", "_", info.title).strip("._ ") or "video"
    platform = detect_platform(url)

    if _selector_needs_merging(selector):
        return _download_via_tempfile(
            url=url,
            selector=selector,
            safe_title=safe_title,
            platform=platform,
        )
    return _stream_stdout(
        url=url,
        selector=selector,
        safe_title=safe_title,
        platform=platform,
        info=info,
    )


def _stream_stdout(
    *,
    url: str,
    selector: str,
    safe_title: str,
    platform: Platform,
    info: VideoInfo,
) -> tuple[Iterator[bytes], str, str]:
    ext = "mp4"
    for fmt in info.formats:
        if fmt.format_id == selector and fmt.ext:
            ext = fmt.ext
            break
    filename = f"{safe_title}.{ext}"

    cmd: list[str] = [sys.executable, "-m", "yt_dlp", *_BASE_YTDLP_FLAGS]
    cookiefile = _resolve_cookiefile(platform)
    if cookiefile:
        cmd.extend(["--cookies", cookiefile])
    cmd.extend(["-f", selector, "-o", "-", url])
    logger.info(
        "Spawning yt-dlp for stdout streaming (platform=%s, cookies=%s, selector=%s)",
        platform,
        bool(cookiefile),
        selector,
    )

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


def _download_via_tempfile(
    *,
    url: str,
    selector: str,
    safe_title: str,
    platform: Platform,
) -> tuple[Iterator[bytes], str, str]:
    tmpdir = Path(tempfile.mkdtemp(prefix="snapreel_"))
    output_template = tmpdir / "video.%(ext)s"

    cmd: list[str] = [
        sys.executable,
        "-m",
        "yt_dlp",
        *_BASE_YTDLP_FLAGS,
        "--merge-output-format",
        "mp4",
    ]
    cookiefile = _resolve_cookiefile(platform)
    if cookiefile:
        cmd.extend(["--cookies", cookiefile])
    cmd.extend(["-f", selector, "-o", str(output_template), url])
    logger.info(
        "Spawning yt-dlp for tempfile download (platform=%s, cookies=%s, selector=%s)",
        platform,
        bool(cookiefile),
        selector,
    )

    try:
        result = subprocess.run(  # noqa: S603 - args are constructed safely above
            cmd,
            capture_output=True,
            timeout=180,
        )
    except subprocess.TimeoutExpired as exc:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise DownloaderError(
            "Download took too long. Try a smaller quality or another URL.",
            status_code=504,
        ) from exc

    if result.returncode != 0:
        stderr = result.stderr.decode(errors="replace")
        shutil.rmtree(tmpdir, ignore_errors=True)
        logger.warning("yt-dlp tempfile download failed: %s", stderr[:500])
        raise DownloaderError(_friendly_error(stderr), status_code=400)

    produced = sorted(
        (p for p in tmpdir.iterdir() if p.is_file()),
        key=lambda p: p.stat().st_size,
        reverse=True,
    )
    if not produced:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise DownloaderError(
            "No video file was produced.",
            status_code=502,
        )

    produced_path = produced[0]
    ext = produced_path.suffix.lstrip(".").lower() or "mp4"
    filename = f"{safe_title}.{ext}"

    def _iter() -> Iterator[bytes]:
        try:
            with produced_path.open("rb") as fh:
                while True:
                    chunk = fh.read(64 * 1024)
                    if not chunk:
                        break
                    yield chunk
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    content_type = "video/mp4" if ext == "mp4" else f"video/{ext}"
    return _iter(), filename, content_type
