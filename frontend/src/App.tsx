import {
  CheckCircle2,
  Github,
  Sparkles,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { HistoryPanel, type HistoryItem } from "@/components/HistoryPanel";
import { SupportedPlatforms } from "@/components/SupportedPlatforms";
import { UrlInput } from "@/components/UrlInput";
import { VideoPreview } from "@/components/VideoPreview";
import {
  ApiError,
  downloadVideo,
  fetchVideoInfo,
  type VideoInfo,
} from "@/lib/api";
import { loadHistory, pushHistory, saveHistory } from "@/lib/history";
import { detectPlatform } from "@/lib/platform";

interface Toast {
  id: number;
  kind: "error" | "success";
  message: string;
}

const REPO_URL = "https://github.com/manganayam954-glitch/reels-downloaders";

function App() {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadedFormat, setDownloadedFormat] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Start "wanting" sound. The video element initially renders muted (because
  // every browser blocks autoplay-with-sound on a cold page load), but on
  // mount we *try* to play unmuted; if the browser allows it (high Media
  // Engagement Index, persisted user gesture, etc.) sound starts instantly.
  // Otherwise we fall back to muted autoplay and unmute the moment we see
  // any sign of life from the user (mousemove / scroll / touch / key).
  const [bgMuted, setBgMuted] = useState(true);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);

  const detectedPlatform = useMemo(() => detectPlatform(url), [url]);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  // 1) On mount, optimistically try to play with sound. If the browser
  //    permits it (returning visitor, MEI, persisted permission, etc.)
  //    audio kicks in on frame 1 with no interaction needed. If the
  //    browser refuses, we silently fall back to the muted state we
  //    already started in -- no error toast, this is expected.
  useEffect(() => {
    const v = bgVideoRef.current;
    if (!v) return;
    let cancelled = false;
    v.muted = false;
    v.volume = 1;
    v.play()
      .then(() => {
        if (!cancelled) setBgMuted(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Browser blocked unmuted autoplay -- fall back to muted
        // autoplay so the visuals still loop, then wait for any
        // user gesture below to bring sound in.
        v.muted = true;
        setBgMuted(true);
        v.play().catch(() => {
          /* even muted autoplay can fail in extremely strict
             configurations; non-fatal */
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) While we're still muted, listen for ANY sign of user activity --
  //    not just clicks. The instant we see one, unmute. This makes
  //    sound feel "instant" on the user's first interaction with the
  //    page, even just moving the mouse or starting to scroll.
  useEffect(() => {
    if (!bgMuted) return;
    const events = [
      "pointerdown",
      "pointermove",
      "keydown",
      "touchstart",
      "wheel",
      "scroll",
    ] as const;
    const unmute = () => {
      setBgMuted(false);
      events.forEach((e) =>
        window.removeEventListener(e, unmute, { capture: true } as never),
      );
    };
    events.forEach((e) =>
      window.addEventListener(e, unmute, {
        once: true,
        capture: true,
        passive: true,
      } as AddEventListenerOptions),
    );
    return () => {
      events.forEach((e) =>
        window.removeEventListener(e, unmute, { capture: true } as never),
      );
    };
  }, [bgMuted]);

  // 3) Whenever bgMuted flips, sync it onto the actual <video> element
  //    and re-call play() (some user agents pause on a muted->unmuted
  //    transition).
  useEffect(() => {
    const v = bgVideoRef.current;
    if (!v) return;
    v.muted = bgMuted;
    v.play().catch(() => {
      /* non-fatal; if the browser still refuses, the user can hit the
         Sound on/off pill in the corner */
    });
  }, [bgMuted]);

  const pushToast = (kind: Toast["kind"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const handleSubmit = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoadingInfo(true);
    setDownloadedFormat(null);
    try {
      const result = await fetchVideoInfo(trimmed);
      setInfo(result);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Something went wrong while fetching the video.";
      pushToast("error", message);
      setInfo(null);
    } finally {
      setLoadingInfo(false);
    }
  };

  const handleDownload = async (formatId: string) => {
    if (!info) return;
    setDownloading(true);
    try {
      const ext =
        info.formats.find((f) => f.format_id === formatId)?.ext ?? "mp4";
      const result = await downloadVideo(
        info.webpage_url || url.trim(),
        formatId,
        `${info.title}.${ext}`,
      );
      setDownloadedFormat(formatId);
      pushToast("success", `Saved ${result.filename}`);
      setHistory((prev) =>
        pushHistory(prev, {
          id: `${info.id}-${formatId}-${Date.now()}`,
          title: info.title,
          thumbnail: info.thumbnail,
          platform: info.platform,
          webpage_url: info.webpage_url,
          source_url: url.trim(),
          filename: result.filename,
          size: result.size,
          downloaded_at: new Date().toISOString(),
        }),
      );
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Download failed.";
      pushToast("error", message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-app relative min-h-full overflow-hidden">
      {/* Decorative looping background video sitting behind the hero -- low
          opacity so the foreground stays readable, but you can still see
          and hear what's playing. aria-hidden so screen readers ignore it. */}
      <video
        ref={bgVideoRef}
        className="video-watermark pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
        src="/hero-watermark.mp4"
        autoPlay
        loop
        muted={bgMuted}
        playsInline
        preload="auto"
        aria-hidden="true"
      />
      {/* Soft gradient veil so the hero copy keeps strong contrast on top of
          the moving video. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-[hsl(var(--background))]/50 via-[hsl(var(--background))]/30 to-[hsl(var(--background))]/85"
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between">
          <a
            href="/"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-white/80"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-rose-500 text-white shadow-md">
              <Wand2 className="h-4 w-4" />
            </span>
            <span className="text-base font-bold tracking-tight text-white">
              <span className="text-gradient">BAYONG</span>
            </span>
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/20 hover:text-white"
          >
            <Github className="h-3.5 w-3.5" />
            Source
          </a>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center gap-10 py-8 sm:py-14">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/70">
              <Sparkles className="h-3 w-3 text-amber-300" />
              No signup • No watermark • Free to use
            </span>
            <h1 className="max-w-3xl text-balance text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl">
              Download <span className="text-gradient">short videos</span>
              <br className="hidden sm:block" /> in one click.
            </h1>
            <p className="max-w-xl text-pretty text-base text-white/60 sm:text-lg">
              Paste a TikTok, Instagram Reel, Facebook video or YouTube Short
              link and get a clean MP4 you can save anywhere.
            </p>
          </div>

          <div className="w-full max-w-3xl space-y-4">
            <UrlInput
              url={url}
              setUrl={setUrl}
              onSubmit={handleSubmit}
              loading={loadingInfo}
              detectedPlatform={detectedPlatform}
            />
            <SupportedPlatforms active={detectedPlatform} />
          </div>

          {loadingInfo && (
            <div className="ring-gradient w-full max-w-3xl rounded-2xl">
              <div className="glass animate-pulse rounded-2xl border border-white/10 p-6">
                <div className="grid gap-4 md:grid-cols-[260px_1fr]">
                  <div className="aspect-[9/16] w-full rounded-xl bg-white/5 md:aspect-auto md:h-[260px]" />
                  <div className="space-y-3">
                    <div className="h-5 w-3/4 rounded-md bg-white/10" />
                    <div className="h-4 w-1/2 rounded-md bg-white/10" />
                    <div className="h-4 w-2/3 rounded-md bg-white/5" />
                    <div className="flex gap-2 pt-4">
                      <div className="h-9 w-20 rounded-lg bg-white/5" />
                      <div className="h-9 w-20 rounded-lg bg-white/5" />
                      <div className="h-9 w-20 rounded-lg bg-white/5" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!loadingInfo && info && (
            <div className="w-full max-w-3xl">
              <VideoPreview
                info={info}
                onDownload={handleDownload}
                isDownloading={downloading}
                downloadedFormat={downloadedFormat}
              />
            </div>
          )}

          <HistoryPanel
            items={history}
            onClear={() => setHistory([])}
            onSelect={(item) => {
              setUrl(item.source_url);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </main>

        <footer className="mt-auto border-t border-white/5 pt-6 text-center text-xs text-white/40">
          Built with FastAPI + yt-dlp + React. Only public videos are supported.
          Please respect each platform&apos;s terms of service and copyright
          law.
        </footer>
      </div>

      {/* Background-video sound toggle. Sits above content but doesn't
          steal focus from the URL input. Starts in 'muted' state because
          browsers refuse to autoplay with sound; flips to 'on' on the
          first user interaction with the page (or when the user clicks
          this button). */}
      <button
        type="button"
        onClick={() => setBgMuted((m) => !m)}
        aria-label={
          bgMuted ? "Enable background video sound" : "Mute background video"
        }
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/70 backdrop-blur-md transition hover:border-white/20 hover:text-white"
      >
        {bgMuted ? (
          <VolumeX className="h-3.5 w-3.5" />
        ) : (
          <Volume2 className="h-3.5 w-3.5" />
        )}
        {bgMuted ? "Sound off" : "Sound on"}
      </button>

      {/* Toasts */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={
              "pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-md " +
              (toast.kind === "error"
                ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
                : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100")
            }
          >
            {toast.kind === "error" ? (
              <X className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span className="leading-snug">{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
