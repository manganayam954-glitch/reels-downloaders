import type { HistoryItem } from "@/components/HistoryPanel";

const STORAGE_KEY = "reels-downloaders.history.v1";
const MAX_ITEMS = 12;

export function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryItem);
  } catch {
    return [];
  }
}

export function saveHistory(items: HistoryItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(items.slice(0, MAX_ITEMS)),
    );
  } catch {
    /* quota errors are not fatal */
  }
}

export function pushHistory(
  items: HistoryItem[],
  next: HistoryItem,
): HistoryItem[] {
  // Drop any prior entry for the same source URL so the new download bubbles
  // to the top instead of duplicating.
  const filtered = items.filter((it) => it.source_url !== next.source_url);
  return [next, ...filtered].slice(0, MAX_ITEMS);
}

function isHistoryItem(value: unknown): value is HistoryItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.platform === "string" &&
    typeof v.webpage_url === "string" &&
    typeof v.source_url === "string" &&
    typeof v.filename === "string" &&
    typeof v.size === "number" &&
    typeof v.downloaded_at === "string"
  );
}
