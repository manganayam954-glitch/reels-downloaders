import { ArrowRight, Clipboard, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  PLATFORM_ACCENT,
  PLATFORM_LABELS,
  PlatformIcon,
} from "@/components/PlatformIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Platform } from "@/lib/api";
import { cn } from "@/lib/utils";

interface UrlInputProps {
  url: string;
  setUrl: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  detectedPlatform: Platform;
  disabled?: boolean;
}

export function UrlInput({
  url,
  setUrl,
  onSubmit,
  loading,
  detectedPlatform,
  disabled,
}: UrlInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pasteState, setPasteState] = useState<"idle" | "ok" | "err">("idle");

  // Auto-focus the input on first render so users can immediately paste a URL.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        setPasteState("ok");
        setTimeout(() => setPasteState("idle"), 1500);
      }
    } catch {
      setPasteState("err");
      setTimeout(() => setPasteState("idle"), 1500);
    }
  };

  const accent = PLATFORM_ACCENT[detectedPlatform];
  const showPlatform = detectedPlatform !== "other" && url.length > 0;

  return (
    <form
      className="ring-gradient relative w-full rounded-2xl"
      onSubmit={(event) => {
        event.preventDefault();
        if (!loading && url.trim()) onSubmit();
      }}
    >
      <div
        className={cn(
          "glass relative flex flex-col gap-3 rounded-2xl border border-white/10 p-3 sm:flex-row sm:items-center sm:gap-2 sm:p-2",
        )}
      >
        <div className="flex flex-1 items-center gap-2 px-2">
          {showPlatform ? (
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-md",
                accent,
              )}
              title={PLATFORM_LABELS[detectedPlatform]}
            >
              <PlatformIcon platform={detectedPlatform} className="h-4 w-4" />
            </span>
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/60">
              <PlatformIcon platform="other" className="h-4 w-4" />
            </span>
          )}
          <Input
            ref={inputRef}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Paste a TikTok, Instagram, Facebook or YouTube link…"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled || loading}
            className="h-11 flex-1 border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0 sm:text-base"
          />
          {url.length > 0 && !loading && (
            <button
              type="button"
              onClick={() => setUrl("")}
              aria-label="Clear URL"
              className="rounded-md p-1 text-white/40 transition hover:bg-white/5 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 sm:pr-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handlePaste}
            disabled={loading}
            className="h-9 gap-1.5 rounded-xl text-white/80 hover:bg-white/10 hover:text-white"
          >
            <Clipboard className="h-4 w-4" />
            {pasteState === "ok" ? "Pasted!" : "Paste"}
          </Button>
          <Button
            type="submit"
            disabled={loading || !url.trim()}
            className="h-11 gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-500 to-rose-500 px-5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/20 transition hover:from-violet-500 hover:via-fuchsia-400 hover:to-rose-400 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Fetching…
              </>
            ) : (
              <>
                NDAS BANDENG
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
