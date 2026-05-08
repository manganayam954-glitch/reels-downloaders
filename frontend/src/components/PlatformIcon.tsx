import type { Platform } from "@/lib/api";
import { cn } from "@/lib/utils";

interface PlatformIconProps {
  platform: Platform;
  className?: string;
}

/**
 * Inline SVG glyphs for each supported platform.  We intentionally avoid
 * pulling in a brand-icon library so the bundle stays small and the colors
 * always match our gradient palette.
 */
export function PlatformIcon({ platform, className }: PlatformIconProps) {
  const common = cn("h-5 w-5", className);
  switch (platform) {
    case "tiktok":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className={common}
          aria-hidden="true"
        >
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.94a8.16 8.16 0 0 0 4.77 1.52V7a4.85 4.85 0 0 1-1.84-.31z" />
        </svg>
      );
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle
            cx="12"
            cy="12"
            r="4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle cx="17.5" cy="6.5" r="1.25" fill="currentColor" />
        </svg>
      );
    case "facebook":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className={common}
          aria-hidden="true"
        >
          <path d="M13.5 22v-8h2.7l.4-3.1h-3.1V8.9c0-.9.25-1.5 1.55-1.5H17V4.7c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2H7.6V14h2.7v8h3.2z" />
        </svg>
      );
    case "youtube":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className={common}
          aria-hidden="true"
        >
          <path d="M23 12s0-3.6-.46-5.32a2.78 2.78 0 0 0-1.96-1.97C18.86 4.25 12 4.25 12 4.25s-6.86 0-8.58.46a2.78 2.78 0 0 0-1.96 1.97C1 8.4 1 12 1 12s0 3.6.46 5.32a2.78 2.78 0 0 0 1.96 1.97c1.72.46 8.58.46 8.58.46s6.86 0 8.58-.46a2.78 2.78 0 0 0 1.96-1.97C23 15.6 23 12 23 12zM9.75 15.5v-7l6 3.5-6 3.5z" />
        </svg>
      );
    default:
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={common}
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
  }
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  facebook: "Facebook",
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  other: "Link",
};

export const PLATFORM_ACCENT: Record<Platform, string> = {
  tiktok: "from-cyan-400 via-fuchsia-400 to-rose-400",
  instagram: "from-amber-400 via-rose-500 to-fuchsia-500",
  facebook: "from-sky-500 via-blue-500 to-indigo-500",
  youtube: "from-rose-500 via-red-500 to-orange-500",
  other: "from-violet-500 via-fuchsia-500 to-rose-500",
};
