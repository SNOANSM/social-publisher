// YouTube channel stats for the dashboard (uses the youtube.readonly scope we already have).
// Results are cached in Blobs for 15 minutes to save API quota.
import { dataStore } from "./stores";
import { getYouTubeAccessToken, getYouTubeTokens } from "./tokens";
import { PublishError, youtubeError } from "./errors";

export interface VideoStat {
  id: string;
  title: string;
  publishedAt: string;
  thumbnail?: string;
  views: number;
  likes: number;
  comments: number;
  durationSec: number;
}

export interface YouTubeStats {
  channelTitle: string;
  subscribers: number;
  totalViews: number;
  videoCount: number;
  videos: VideoStat[]; // newest first, up to 50
  fetchedAt: string;
}

const CACHE_KEY = "cache/youtube-stats";
const CACHE_MS = 15 * 60 * 1000;

function isoDurationToSeconds(iso: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso ?? "");
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

async function yt<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw youtubeError(res.status, body);
  return body as T;
}

export async function getYouTubeStats(force = false): Promise<YouTubeStats | null> {
  if (!(await getYouTubeTokens())) return null;
  const store = dataStore();
  if (!force) {
    const cached = (await store.get(CACHE_KEY, { type: "json" })) as YouTubeStats | null;
    if (cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_MS) return cached;
  }

  const token = await getYouTubeAccessToken(5 * 60 * 1000);
  const channels = await yt<{
    items?: {
      snippet: { title: string };
      statistics: { subscriberCount?: string; viewCount?: string; videoCount?: string };
      contentDetails: { relatedPlaylists: { uploads: string } };
    }[];
  }>("channels?part=snippet,statistics,contentDetails&mine=true", token);
  const channel = channels.items?.[0];
  if (!channel) throw new PublishError("ما لقيت قناة يوتيوب في الحساب المربوط.");

  const uploads = await yt<{ items?: { contentDetails: { videoId: string } }[] }>(
    `playlistItems?part=contentDetails&maxResults=50&playlistId=${encodeURIComponent(channel.contentDetails.relatedPlaylists.uploads)}`,
    token,
  );
  const ids = (uploads.items ?? []).map((i) => i.contentDetails.videoId);

  let videos: VideoStat[] = [];
  if (ids.length) {
    const details = await yt<{
      items?: {
        id: string;
        snippet: { title: string; publishedAt: string; thumbnails?: Record<string, { url: string }> };
        statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
        contentDetails: { duration: string };
      }[];
    }>(`videos?part=snippet,statistics,contentDetails&id=${ids.join(",")}`, token);
    videos = (details.items ?? [])
      .map((v) => ({
        id: v.id,
        title: v.snippet.title,
        publishedAt: v.snippet.publishedAt,
        thumbnail: v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url,
        views: Number(v.statistics.viewCount ?? 0),
        likes: Number(v.statistics.likeCount ?? 0),
        comments: Number(v.statistics.commentCount ?? 0),
        durationSec: isoDurationToSeconds(v.contentDetails.duration),
      }))
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  }

  const stats: YouTubeStats = {
    channelTitle: channel.snippet.title,
    subscribers: Number(channel.statistics.subscriberCount ?? 0),
    totalViews: Number(channel.statistics.viewCount ?? 0),
    videoCount: Number(channel.statistics.videoCount ?? 0),
    videos,
    fetchedAt: new Date().toISOString(),
  };
  await store.setJSON(CACHE_KEY, stats);
  return stats;
}
