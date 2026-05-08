import {
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Heart,
  Loader2,
  User,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  PLATFORM_ACCENT,
  PLATFORM_LABELS,
  PlatformIcon,
} from "@/components/PlatformIcon";
import { Button } from "@/components/ui/button";
import type { VideoFormat, VideoInfo } from "@/lib/api";
import { cn } from "@/lib/utils";

interface VideoPreviewProps {
  info: VideoInfo;
  onDownload: (formatId: string) => Promise<void> | void;
  isDownloading: boolean;
  downloadedFormat: string | null;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatNumber(value: number | null): string | null {
  if (value === null || value === undefined) return null;
  if (value < 1_000) return value.toString();
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)}K`;
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return `${(value / 1_000_000_000).toFixed(1)}B`;
}

function formatSize(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function dedupeFormats(formats: VideoFormat[]): VideoFormat[] {
  const byKey = new Map<string, VideoFormat>();
  for (const fmt of formats) {
    const key = `${fmt.quality_label}-${fmt.ext}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, fmt);
    } else if ((fmt.filesize ?? 0) > (existing.filesize ?? 0)) {
      byKey.set(key, fmt);
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => (b.height ?? 0) - (a.height ?? 0),
  );
}

export function VideoPreview({
  info,
  onDownload,
  isDownloading,
  downloadedFormat,
}: VideoPreviewProps) {
  const formats = useMemo(() => dedupeFormats(info.formats), [info.formats]);
  const [selected, setSelected] = useState<string>(
    info.best_format_id ?? formats[0]?.format_id ?? "",
  );
  const platformAccent = PLATFORM_ACCENT[info.platform];

  return (
    <div className="ring-gradient animate-fade-in-up rounded-2xl">
      <div className="glass overflow-hidden rounded-2xl border border-white/10">
        <div className="grid gap-0 md:grid-cols-[260px_1fr]">
          <div className="relative bg-black/40">
            {info.thumbnail ? (
              <img
                src={info.thumbnail}
                alt={info.title}
                className="aspect-[9/16] w-full object-cover md:aspect-auto md:h-full"
                loading="lazy"
              />
            ) : (
              <div className="flex aspect-[9/16] w-full items-center justify-center text-white/40 md:aspect-auto md:h-full">
                No preview
              </div>
            )}
            <div
              className={cn(
                "absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r px-2.5 py-1 text-xs font-semibold text-white shadow-md",
                platformAccent,
              )}
            >
              <PlatformIcon platform={info.platform} className="h-3.5 w-3.5" />
              {PLATFORM_LABELS[info.platform]}
            </div>
            {info.duration_seconds != null && (
              <div className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] font-medium text-white">
                <Clock className="h-3 w-3" />
                {formatDuration(info.duration_seconds)}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 p-5 md:p-6">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold leading-snug text-white md:text-xl">
                {info.title}
              </h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/60">
                {info.uploader && (
                  <span className="inline-flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    {info.uploader_url ? (
                      <a
                        href={info.uploader_url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-white"
                      >
                        @{info.uploader.replace(/^@/, "")}
                      </a>
                    ) : (
                      <>@{info.uploader.replace(/^@/, "")}</>
                    )}
                  </span>
                )}
                {info.view_count != null && (
                  <span className="inline-flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" />
                    {formatNumber(info.view_count)} views
                  </span>
                )}
                {info.like_count != null && (
                  <span className="inline-flex items-center gap-1.5">
                    <Heart className="h-3.5 w-3.5" />
                    {formatNumber(info.like_count)}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-white/40">
                Choose quality
              </p>
              {formats.length === 0 ? (
                <p className="text-sm text-white/60">
                  No downloadable formats were returned for this video.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {formats.map((fmt) => {
                    const isSelected = fmt.format_id === selected;
                    const downloaded = downloadedFormat === fmt.format_id;
                    const size = formatSize(fmt.filesize);
                    return (
                      <button
                        type="button"
                        key={fmt.format_id}
                        onClick={() => setSelected(fmt.format_id)}
                        className={cn(
                          "group inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition",
                          isSelected
                            ? "border-transparent bg-gradient-to-r text-white shadow-md " +
                                platformAccent
                            : "border-white/10 bg-white/5 text-white/80 hover:border-white/20 hover:text-white",
                        )}
                      >
                        <span className="font-semibold">
                          {fmt.quality_label}
                        </span>
                        <span className="opacity-70">
                          {fmt.ext.toUpperCase()}
                        </span>
                        {size && (
                          <span className="opacity-60">{size}</span>
                        )}
                        {downloaded && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-auto flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <a
                href={info.webpage_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-1 text-xs text-white/40 underline-offset-2 hover:text-white/80 hover:underline"
              >
                Open original
              </a>
              <Button
                type="button"
                disabled={isDownloading || !selected}
                onClick={() => onDownload(selected)}
                className={cn(
                  "h-11 gap-2 rounded-xl bg-gradient-to-r px-5 text-sm font-semibold text-white shadow-lg",
                  platformAccent,
                  isDownloading && "opacity-80",
                )}
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Downloading…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Download video
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
