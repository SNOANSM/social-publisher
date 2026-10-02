// Shared types used by the Next.js app and the Netlify functions.
// Keep this file free of runtime imports so it can be used anywhere.

export type Platform = "instagram" | "youtube";
export const PLATFORMS: Platform[] = ["instagram", "youtube"];

export type MediaKind = "video" | "image";
export type YouTubePrivacy = "public" | "unlisted" | "private";

export type ResultStatus = "pending" | "processing" | "success" | "failed";

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

export interface Post {
  id: string;
  createdAt: string;
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
