import {
  PLATFORM_ACCENT,
  PLATFORM_LABELS,
  PlatformIcon,
} from "@/components/PlatformIcon";
import type { Platform } from "@/lib/api";
import { cn } from "@/lib/utils";

const PLATFORMS: Platform[] = ["tiktok", "instagram", "facebook", "youtube"];

interface SupportedPlatformsProps {
  active: Platform;
}

export function SupportedPlatforms({ active }: SupportedPlatformsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
      <span className="text-xs uppercase tracking-[0.18em] text-white/40">
        Supports
      </span>
      {PLATFORMS.map((platform) => {
        const isActive = active === platform;
        return (
          <span
            key={platform}
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-white/70 transition",
              isActive
                ? "border-transparent bg-gradient-to-r text-white shadow-md " +
                    PLATFORM_ACCENT[platform]
                : "hover:border-white/20 hover:text-white",
            )}
          >
            <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
            {PLATFORM_LABELS[platform]}
          </span>
        );
      })}
    </div>
  );
}
