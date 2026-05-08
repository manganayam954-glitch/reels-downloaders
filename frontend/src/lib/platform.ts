import type { Platform } from "@/lib/api";

const PATTERNS: Array<[Platform, RegExp]> = [
  ["tiktok", /(^|\.)tiktok\.com$|^vm\.tiktok\.com$|^vt\.tiktok\.com$/i],
  ["instagram", /(^|\.)instagram\.com$|^instagr\.am$/i],
  ["facebook", /(^|\.)facebook\.com$|^fb\.watch$|^fb\.com$/i],
  ["youtube", /(^|\.)youtube\.com$|^youtu\.be$|^youtube-nocookie\.com$/i],
];

/**
 * Best-effort client-side platform detection so we can color the input field
 * before the backend has even seen the URL.  The backend re-validates.
 */
export function detectPlatform(url: string): Platform {
  const trimmed = url.trim();
  if (!trimmed) return "other";
  let host: string;
  try {
    host = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    ).hostname.toLowerCase();
  } catch {
    return "other";
  }
  host = host.replace(/^www\./, "");
  for (const [platform, pattern] of PATTERNS) {
    if (pattern.test(host)) return platform;
  }
  return "other";
}
