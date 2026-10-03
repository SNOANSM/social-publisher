// Shared types used by the Next.js app and the Netlify functions.
// Keep this file free of runtime imports so it can be used anywhere.

export type Platform = "instagram" | "youtube";
export const PLATFORMS: Platform[] = ["instagram", "youtube"];

// "carousel" = several images in one Instagram post.
export type MediaKind = "video" | "image" | "carousel";
export type YouTubePrivacy = "public" | "unlisted" | "private";

// "scheduled" = waiting for Post.scheduledAt; the scheduler function turns it into "pending".
export type ResultStatus = "scheduled" | "pending" | "processing" | "success" | "failed";

export interface UploadMeta {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  chunkSize: number;
  chunks: number;
  createdAt: string;
  complete: boolean;
}

export interface MediaItem {
  uploadId: string;
  kind: "video" | "image";
  fileName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
}

export interface Post {
  id: string;
  createdAt: string;
  /** When set, the post is published by the scheduler at this time (ISO). */
  scheduledAt?: string;
  /** All files, in order. Older posts only have the single-file fields below. */
  items?: MediaItem[];
  hasThumb?: boolean;
  /** Email of who created it (when several people use the app). */
  createdBy?: string;
  // First file (kept for older posts and single-file code paths)
  uploadId: string;
  mediaKind: MediaKind;
  fileName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  platforms: Platform[];
  captionMode: "unified" | "separate";
  instagram?: { caption: string };
  youtube?: {
    title: string;
    description: string;
    tags: string[];
    privacy: YouTubePrivacy;
    shorts: boolean;
  };
  mediaDeleted?: boolean;
}

export interface PlatformResult {
  status: ResultStatus;
  attemptId: string;
  attempts: number;
  step?: string;
  progress?: number;
  url?: string;
  remoteId?: string;
  error?: string;
  errorDetails?: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
}

export interface PostWithResults {
  post: Post;
  results: Partial<Record<Platform, PlatformResult>>;
}

export interface YouTubeTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms epoch
  channelId: string;
  channelTitle: string;
  connectedAt: string;
  lastRefreshError?: string;
}

export interface InstagramTokens {
  userToken: string;
  userTokenExpiresAt: number | null; // ms epoch, null = unknown/never
  pageId: string;
  pageName: string;
  pageToken: string;
  pageTokenExpiresAt: number | null; // ms epoch, null = never
  dataAccessExpiresAt: number | null; // ms epoch
  igUserId: string;
  igUsername: string;
  connectedAt: string;
  refreshedAt?: string;
  lastRefreshError?: string;
}

export interface ConnectionStatus {
  youtube: { connected: boolean; name?: string; connectedAt?: string; warning?: string };
  instagram: {
    connected: boolean;
    name?: string;
    pageName?: string;
    connectedAt?: string;
    expiresInDays?: number | null;
    warning?: string;
  };
}
