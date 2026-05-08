import { Clock, ExternalLink, Trash2 } from "lucide-react";

import {
  PLATFORM_ACCENT,
  PLATFORM_LABELS,
  PlatformIcon,
} from "@/components/PlatformIcon";
import { Button } from "@/components/ui/button";
import type { Platform } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface HistoryItem {
  id: string;
  title: string;
  thumbnail: string | null;
  platform: Platform;
  webpage_url: string;
  source_url: string;
  filename: string;
  size: number;
  downloaded_at: string;
}

interface HistoryPanelProps {
  items: HistoryItem[];
  onClear: () => void;
  onSelect: (item: HistoryItem) => void;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function HistoryPanel({ items, onClear, onSelect }: HistoryPanelProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="mx-auto w-full max-w-3xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium text-white/70">
          <Clock className="h-4 w-4" />
          Recent downloads
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/60">
            {items.length}
          </span>
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-7 gap-1.5 px-2 text-xs text-white/50 hover:text-white"
        >
          <Trash2 className="h-3 w-3" />
          Clear
        </Button>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2 pr-3 text-left transition hover:border-white/20 hover:bg-white/[0.06]"
            >
              <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md bg-black/40">
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-white/30">
                    <PlatformIcon
                      platform={item.platform}
                      className="h-5 w-5"
                    />
                  </div>
                )}
                <div
                  className={cn(
                    "absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r",
                    PLATFORM_ACCENT[item.platform],
                  )}
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-white/90">
                  {item.title}
                </span>
                <span className="flex items-center gap-2 text-[11px] text-white/50">
                  <span className="inline-flex items-center gap-1">
                    <PlatformIcon
                      platform={item.platform}
                      className="h-3 w-3"
                    />
                    {PLATFORM_LABELS[item.platform]}
                  </span>
                  <span>•</span>
                  <span>{formatSize(item.size)}</span>
                  <span>•</span>
                  <span>{formatTime(item.downloaded_at)}</span>
                </span>
              </div>
              <a
                href={item.webpage_url}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="rounded-md p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white"
                aria-label="Open original page"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
