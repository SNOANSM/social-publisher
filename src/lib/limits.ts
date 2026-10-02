// Limits shared by the browser and the server.

// Each chunk travels through a Netlify Function. Binary bodies are base64
// encoded (+33%) and the buffered request limit is 6 MB, so 3 MiB is safe.
// 3 MiB is also a multiple of 256 KiB, which YouTube's resumable upload needs.
export const CHUNK_SIZE = 3 * 1024 * 1024;

export const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB
export const IG_MAX_VIDEO_SIZE = 300 * 1024 * 1024; // resumable upload ceiling
export const IG_MAX_IMAGE_SIZE = 8 * 1024 * 1024;
export const IG_CAPTION_MAX = 2200;
export const IG_MAX_HASHTAGS = 30;
export const IG_REEL_MIN_SECONDS = 3;
export const IG_REEL_MAX_SECONDS = 15 * 60;

export const YT_TITLE_MAX = 100;
export const YT_DESCRIPTION_MAX_BYTES = 5000;
export const YT_TAGS_MAX_CHARS = 500;
export const YT_SHORTS_MAX_SECONDS = 180;

export function charCount(text: string): number {
  return Array.from(text).length;
}

export function byteCount(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function hashtagCount(text: string): number {
  return (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
}

// YouTube counts each tag's length, plus quotes for tags with spaces, plus commas.
export function tagsLength(tags: string[]): number {
  return tags.reduce((sum, t) => sum + charCount(t) + (t.includes(" ") ? 2 : 0), 0) + Math.max(0, tags.length - 1);
}

export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of input.split(/[,،\n]/)) {
    const tag = raw.replace(/^#/, "").replace(/[<>]/g, "").trim();
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
  }
  return tags;
}

export function isShortsEligible(width?: number, height?: number, duration?: number): boolean {
  if (!width || !height || duration === undefined) return false;
  return height >= width && duration <= YT_SHORTS_MAX_SECONDS;
}
