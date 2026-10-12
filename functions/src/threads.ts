// Meta Threads 官方 API 的薄包裝。只走官方 API，不做瀏覽器自動化。
import { THREADS_APP_ID, THREADS_APP_SECRET, THREADS_SCOPES } from "./config";

const GRAPH = "https://graph.threads.net";
const VERSION = "v1.0";

/** auth：token 失效/被撤銷；rate：被限流；gone：貼文不存在；other：其他 */
export type ThreadsErrorKind = "auth" | "rate" | "gone" | "other";

export class ThreadsError extends Error {
  constructor(
    message: string,
    public kind: ThreadsErrorKind,
    public status: number,
    public code?: number,
  ) {
    super(message);
  }
}

function classify(status: number, code?: number, subcode?: number): ThreadsErrorKind {
  if (code === 190 || status === 401) return "auth";
  // 4/17/32/613 是 Graph API 的各種限流代碼
  if (status === 429 || code === 4 || code === 17 || code === 32 || code === 613) return "rate";
  if (code === 100 && (subcode === 33 || status === 404)) return "gone";
  if (status === 404) return "gone";
  return "other";
}

async function call<T>(method: "GET" | "POST", path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH}/${path}`);
  const init: RequestInit = { method };
  if (method === "GET") {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  } else {
    init.body = new URLSearchParams(params);
  }
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok || body.error) {
    const err = body.error ?? {};
    throw new ThreadsError(
      err.message ?? `Threads API ${res.status}`,
      classify(res.status, err.code, err.error_subcode),
      res.status,
      err.code,
    );
  }
  return body as T;
}

// ---------- OAuth ----------

export function authorizeUrl(redirectUri: string, state: string): string {
  const url = new URL("https://threads.net/oauth/authorize");
  url.searchParams.set("client_id", THREADS_APP_ID.value());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", THREADS_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

/** code → 短效 token → 長效 token（約 60 天） */
export async function exchangeCode(code: string, redirectUri: string) {
  const short = await call<{ access_token: string; user_id: string | number }>("POST", "oauth/access_token", {
    client_id: THREADS_APP_ID.value(),
    client_secret: THREADS_APP_SECRET.value(),
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const long = await call<{ access_token: string; expires_in: number }>("GET", "access_token", {
    grant_type: "th_exchange_token",
    client_secret: THREADS_APP_SECRET.value(),
    access_token: short.access_token,
  });
  return { token: long.access_token, expiresIn: long.expires_in, userId: String(short.user_id) };
}

/** 長效 token 至少發出 24 小時後才能 refresh；refresh 後再延 60 天 */
export async function refreshToken(token: string) {
  const res = await call<{ access_token: string; expires_in: number }>("GET", "refresh_access_token", {
    grant_type: "th_refresh_token",
    access_token: token,
  });
  return { token: res.access_token, expiresIn: res.expires_in };
}

// ---------- 讀取 ----------

export interface ThreadsProfile {
  id: string;
  username: string;
  threads_profile_picture_url?: string;
}

export function getMe(token: string) {
  return call<ThreadsProfile>("GET", `${VERSION}/me`, {
    fields: "id,username,threads_profile_picture_url",
    access_token: token,
  });
}

export interface ThreadsPost {
  id: string;
  text?: string;
  username?: string;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
}

export async function keywordSearch(token: string, q: string, limit = 25): Promise<ThreadsPost[]> {
  const res = await call<{ data: ThreadsPost[] }>("GET", `${VERSION}/keyword_search`, {
    q,
    search_type: "RECENT",
    fields: "id,text,username,permalink,timestamp,media_type",
    limit: String(limit),
    access_token: token,
  });
  return res.data ?? [];
}

export async function getInsights(token: string, mediaId: string) {
  const res = await call<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
    "GET",
    `${VERSION}/${mediaId}/insights`,
    { metric: "likes,replies", access_token: token },
  );
  const pick = (name: string) => {
    const m = res.data.find((d) => d.name === name);
    return m?.total_value?.value ?? m?.values?.[0]?.value ?? 0;
  };
  return { likes: pick("likes"), replies: pick("replies") };
}

// ---------- 發文 ----------

/** 回覆一則貼文：先建 container，再 publish。回傳新貼文 ID。 */
export async function publishReply(token: string, replyToId: string, text: string): Promise<string> {
  const container = await call<{ id: string }>("POST", `${VERSION}/me/threads`, {
    media_type: "TEXT",
    text,
    reply_to_id: replyToId,
    access_token: token,
  });
  const published = await call<{ id: string }>("POST", `${VERSION}/me/threads_publish`, {
    creation_id: container.id,
    access_token: token,
  });
  return published.id;
}
