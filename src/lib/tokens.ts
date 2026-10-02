// Encrypted token storage + automatic refresh for YouTube (Google) and Instagram (Meta).
// Tokens never leave the server: only ConnectionStatus (names/dates) is sent to the browser.
import { dataStore } from "./stores";
import { decryptJSON, encryptJSON } from "./crypto";
import { graphVersion, optionalEnv, requireEnv } from "./env";
import { PublishError, instagramError, youtubeError } from "./errors";
import type { ConnectionStatus, InstagramTokens, YouTubeTokens } from "./types";

const YT_KEY = "tokens/youtube";
const IG_KEY = "tokens/instagram";
const DAY = 24 * 60 * 60 * 1000;

async function readEncrypted<T>(key: string): Promise<T | null> {
  const raw = (await dataStore().get(key, { type: "text" })) as string | null;
  if (!raw) return null;
  try {
    return decryptJSON<T>(raw);
  } catch (err) {
    console.error(`Failed to decrypt ${key}`, err);
    return null;
  }
}

async function writeEncrypted(key: string, value: unknown): Promise<void> {
  await dataStore().set(key, encryptJSON(value));
}

/* ----------------------------- YouTube ----------------------------- */

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export function googleClient() {
  return { id: requireEnv("AUTH_GOOGLE_ID"), secret: requireEnv("AUTH_GOOGLE_SECRET") };
}

export const getYouTubeTokens = () => readEncrypted<YouTubeTokens>(YT_KEY);
export const saveYouTubeTokens = (t: YouTubeTokens) => writeEncrypted(YT_KEY, t);
export const deleteYouTubeTokens = () => dataStore().delete(YT_KEY);

async function refreshYouTube(tokens: YouTubeTokens): Promise<YouTubeTokens> {
  const { id, secret } = googleClient();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: tokens.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const err = youtubeError(res.status, body);
    await saveYouTubeTokens({ ...tokens, lastRefreshError: err.userMessage });
    throw err;
  }
  const updated: YouTubeTokens = {
    ...tokens,
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? tokens.refreshToken,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    lastRefreshError: undefined,
  };
  await saveYouTubeTokens(updated);
  return updated;
}

// Returns an access token that stays valid for at least `minValidityMs`.
export async function getYouTubeAccessToken(minValidityMs = 20 * 60 * 1000): Promise<string> {
  const tokens = await getYouTubeTokens();
  if (!tokens) throw new PublishError("حساب يوتيوب غير مربوط. اربطه من صفحة الإعدادات.");
  if (tokens.expiresAt - Date.now() > minValidityMs) return tokens.accessToken;
  return (await refreshYouTube(tokens)).accessToken;
}

export async function forceRefreshYouTube(): Promise<void> {
  const tokens = await getYouTubeTokens();
  if (tokens) await refreshYouTube(tokens);
}

/* ---------------------------- Instagram ---------------------------- */

export function metaApp() {
  return { id: requireEnv("META_APP_ID"), secret: requireEnv("META_APP_SECRET") };
}

export const INSTAGRAM_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
];

export const getInstagramTokens = () => readEncrypted<InstagramTokens>(IG_KEY);
export const saveInstagramTokens = (t: InstagramTokens) => writeEncrypted(IG_KEY, t);
export const deleteInstagramTokens = () => dataStore().delete(IG_KEY);

export async function graphGet<T = Record<string, unknown>>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw instagramError(res.status, body);
  return body as T;
}

export async function graphPost<T = Record<string, unknown>>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`https://graph.facebook.com/${graphVersion()}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw instagramError(res.status, body);
  return body as T;
}

// Short-lived or long-lived user token -> long-lived user token (~60 days).
export async function exchangeForLongLivedToken(userToken: string): Promise<{ token: string; expiresAt: number | null }> {
  const { id, secret } = metaApp();
  const body = await graphGet<{ access_token: string; expires_in?: number }>("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: id,
    client_secret: secret,
    fb_exchange_token: userToken,
  });
  return { token: body.access_token, expiresAt: body.expires_in ? Date.now() + body.expires_in * 1000 : null };
}

interface DebugTokenData {
  expires_at?: number;
  data_access_expires_at?: number;
  is_valid?: boolean;
}

export async function debugToken(token: string): Promise<DebugTokenData> {
  const { id, secret } = metaApp();
  const body = await graphGet<{ data: DebugTokenData }>("debug_token", {
    input_token: token,
    access_token: `${id}|${secret}`,
  });
  return body.data ?? {};
}

interface PageWithIg {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
}

// Finds the Facebook Page linked to an Instagram Business/Creator account.
// A Page token derived from a long-lived user token does not expire.
export async function resolveInstagramAccount(longLivedUserToken: string) {
  const body = await graphGet<{ data: PageWithIg[] }>("me/accounts", {
    fields: "id,name,access_token,instagram_business_account{id,username}",
    limit: "100",
    access_token: longLivedUserToken,
  });
  const pages = (body.data ?? []).filter((p) => p.instagram_business_account?.id);
  const wanted = optionalEnv("INSTAGRAM_PAGE_ID");
  const page = wanted ? pages.find((p) => p.id === wanted) : pages[0];
  if (!page) {
    throw new PublishError(
      wanted
        ? `ما لقيت صفحة فيسبوك بالمعرّف ${wanted} مربوطة بحساب انستقرام.`
        : "ما لقيت صفحة فيسبوك مربوطة بحساب Instagram Business أو Creator. تأكد من الربط واختيار الصفحة أثناء تسجيل الدخول.",
    );
  }
  return {
    pageId: page.id,
    pageName: page.name,
    pageToken: page.access_token,
    igUserId: page.instagram_business_account!.id,
    igUsername: page.instagram_business_account!.username ?? "",
  };
}

function toMs(seconds?: number): number | null {
  return seconds ? seconds * 1000 : null;
}

export async function buildInstagramTokens(longLived: { token: string; expiresAt: number | null }, previous?: InstagramTokens | null): Promise<InstagramTokens> {
  const account = await resolveInstagramAccount(longLived.token);
  const [userInfo, pageInfo] = await Promise.all([
    debugToken(longLived.token).catch(() => ({}) as DebugTokenData),
    debugToken(account.pageToken).catch(() => ({}) as DebugTokenData),
  ]);
  return {
    userToken: longLived.token,
    userTokenExpiresAt: toMs(userInfo.expires_at) ?? longLived.expiresAt,
    ...account,
    pageTokenExpiresAt: toMs(pageInfo.expires_at),
    dataAccessExpiresAt: toMs(pageInfo.data_access_expires_at ?? userInfo.data_access_expires_at),
    connectedAt: previous?.connectedAt ?? new Date().toISOString(),
    refreshedAt: new Date().toISOString(),
  };
}

// Renews the long-lived user token (and the Page token derived from it) when it gets close to expiring.
export async function refreshInstagramIfNeeded(force = false): Promise<void> {
  const tokens = await getInstagramTokens();
  if (!tokens) return;
  const soonest = [tokens.userTokenExpiresAt, tokens.pageTokenExpiresAt].filter((x): x is number => !!x);
  const needs = force || soonest.some((t) => t - Date.now() < 20 * DAY);
  if (!needs) return;
  try {
    const longLived = await exchangeForLongLivedToken(tokens.userToken);
    await saveInstagramTokens(await buildInstagramTokens(longLived, tokens));
  } catch (err) {
    const message = err instanceof PublishError ? err.userMessage : String(err);
    await saveInstagramTokens({ ...tokens, lastRefreshError: message });
    throw err;
  }
}

export async function getInstagramCredentials(): Promise<{ igUserId: string; token: string }> {
  const tokens = await getInstagramTokens();
  if (!tokens) throw new PublishError("حساب انستقرام غير مربوط. اربطه من صفحة الإعدادات.");
  const expiry = tokens.pageTokenExpiresAt;
  if (expiry && expiry - Date.now() < 2 * DAY) {
    await refreshInstagramIfNeeded(true).catch(() => undefined);
    const fresh = await getInstagramTokens();
    if (fresh) return { igUserId: fresh.igUserId, token: fresh.pageToken };
  }
  return { igUserId: tokens.igUserId, token: tokens.pageToken };
}

/* --------------------------- Status (safe) -------------------------- */

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const [yt, ig] = await Promise.all([getYouTubeTokens(), getInstagramTokens()]);
  const igExpiry = ig ? [ig.pageTokenExpiresAt, ig.dataAccessExpiresAt].filter((x): x is number => !!x).sort((a, b) => a - b)[0] ?? null : null;
  return {
    youtube: yt
      ? { connected: true, name: yt.channelTitle, connectedAt: yt.connectedAt, warning: yt.lastRefreshError }
      : { connected: false },
    instagram: ig
      ? {
          connected: true,
          name: ig.igUsername,
          pageName: ig.pageName,
          connectedAt: ig.connectedAt,
          expiresInDays: igExpiry ? Math.floor((igExpiry - Date.now()) / DAY) : null,
          warning: ig.lastRefreshError,
        }
      : { connected: false },
  };
}
