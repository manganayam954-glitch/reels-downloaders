/**
 * Tiny REST client for the Reels Downloaders backend.
 *
 * The backend URL is read from `VITE_API_BASE_URL`.  In dev that defaults to
 * the FastAPI dev server on `http://localhost:8000`; in production it should
 * point at the deployed backend URL.
 */

export type Platform =
  | "facebook"
  | "tiktok"
  | "instagram"
  | "youtube"
  | "other";

export interface VideoFormat {
  format_id: string;
  ext: string;
  quality_label: string;
  width: number | null;
  height: number | null;
  fps: number | null;
  filesize: number | null;
  has_audio: boolean;
  has_video: boolean;
  is_progressive: boolean;
}

export interface VideoInfo {
  id: string;
  title: string;
  description: string | null;
  uploader: string | null;
  uploader_url: string | null;
  platform: Platform;
  duration_seconds: number | null;
  thumbnail: string | null;
  webpage_url: string;
  formats: VideoFormat[];
  best_format_id: string | null;
  is_short: boolean;
  view_count: number | null;
  like_count: number | null;
}

const API_BASE: string = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail) && body.detail.length > 0) {
      const first = body.detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
  } catch {
    /* ignore JSON parse errors */
  }
  return `Request failed with status ${response.status}`;
}

export async function fetchVideoInfo(url: string): Promise<VideoInfo> {
  const response = await fetch(`${API_BASE}/api/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) {
    throw new ApiError(await parseDetail(response), response.status);
  }
  return (await response.json()) as VideoInfo;
}

export function buildDownloadUrl(url: string, formatId?: string): string {
  const params = new URLSearchParams({ url });
  if (formatId) params.set("format_id", formatId);
  return `${API_BASE}/api/download?${params.toString()}`;
}

/**
 * Trigger a download by streaming the file through `fetch` and turning the
 * response into a blob URL.  Doing this client-side (rather than just
 * navigating to the API URL) lets us:
 *   - read the suggested filename from `Content-Disposition`
 *   - show progress / disable the button while the file is in flight
 *   - surface API errors as toasts instead of as an opaque "this site can't
 *     be reached" page
 */
export async function downloadVideo(
  url: string,
  formatId?: string,
  fallbackName = "video.mp4",
): Promise<{ filename: string; size: number }> {
  const apiUrl = buildDownloadUrl(url, formatId);
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new ApiError(await parseDetail(response), response.status);
  }

  const filename = parseFilename(
    response.headers.get("Content-Disposition"),
    fallbackName,
  );
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revocation a bit so the click has time to take effect.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000);

  return { filename, size: blob.size };
}

function parseFilename(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      /* fall through */
    }
  }
  const plainMatch = /filename="?([^"]+)"?/i.exec(header);
  if (plainMatch) return plainMatch[1];
  return fallback;
}
