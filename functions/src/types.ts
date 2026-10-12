import type { Timestamp } from "firebase-admin/firestore";

export type AiStatus = "ok" | "no_credits" | "invalid_key";

export interface UserDoc {
  displayName: string;
  email: string;
  plan: string;
  createdAt: Timestamp;
  disabled: boolean;
  onboarded: boolean;
  pushEnabled: boolean;
  fcmTokens: string[];
}

export interface PatrolSummary {
  searches: number;
  /** Threads 回傳的貼文數 */
  fetched: number;
  /** 過濾去重後的新貼文數 */
  candidates: number;
  aiCalls: number;
  irrelevant: number;
  drafts: number;
  zeroKeywords: string[];
  /** 各過濾原因擋掉的篇數 */
  filtered?: { own: number; old: number; excluded: number; seen: number; cooldown: number; blocked: number; short: number; notQuestion: number };
}

export type AccountStatus = "ok" | "throttled" | "reauth" | "suspended";
export type PatrolMode = "draft" | "auto";

export interface AccountDoc {
  uid: string;
  threadsUserId: string;
  username: string;
  profilePictureUrl: string | null;
  // 設定（用戶可改）
  keywords: string[];
  excludeWords: string[];
  region: string;
  persona: string;
  tone: string;
  model: string;
  maxChars: number;
  dailyLimit: number;
  intervalMinutes: number;
  activeHours: { start: number; end: number };
  mode: PatrolMode;
  enabled: boolean;
  /** 測試模式：也處理自己發的貼文（App 審核前搜尋只找得到自己的貼文） */
  includeOwnPosts?: boolean;
  // 過濾規則（舊帳號可能沒有這些欄位，用 config 的預設值）
  maxPostAgeHours?: number;
  /** 0 表示不限制 */
  authorCooldownHours?: number;
  blockedAuthors?: string[];
  minTextLength?: number;
  questionsOnly?: boolean;
  /** 補充給 AI 的判斷標準，例如「不回抱怨文」 */
  aiExtraRules?: string;
  // 狀態（只有後端寫）
  status: AccountStatus;
  statusReason: string | null;
  pausedUntil: Timestamp | null;
  /** 被限流後自動降低的上限；null 表示沒降 */
  limitOverride: number | null;
  tokenExpiresAt: Timestamp;
  nextSendAt: Timestamp | null;
  lastPatrolAt: Timestamp | null;
  /** 上一輪海巡的結果，給首頁顯示 */
  lastPatrolSummary?: PatrolSummary;
  lastSentAt: Timestamp | null;
  createdAt: Timestamp;
}

export type DraftStatus = "pending" | "queued" | "sending" | "sent" | "skipped" | "failed";

export interface DraftDoc {
  accountId: string;
  accountUsername: string;
  postId: string;
  postText: string;
  postAuthor: string;
  postPermalink: string | null;
  postTimestamp: string | null;
  keyword: string;
  replyText: string;
  aiReason: string;
  model: string;
  status: DraftStatus;
  failReason: string | null;
  scheduledAt: Timestamp | null;
  replyPostId: string | null;
  insights: { likes: number; replies: number; updatedAt: Timestamp } | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  sentAt: Timestamp | null;
}

export interface SystemDoc {
  paused?: boolean;
  aiStatus?: AiStatus;
  aiStatusAt?: Timestamp;
  aiStatusReason?: string;
}

export interface PlanDoc {
  name: string;
  maxAccounts: number;
  dailyLimit: number;
  allowAutoSend: boolean;
}

export interface SecretsDoc {
  accounts?: Record<string, { token: string; expiresAt: Timestamp; issuedAt: Timestamp }>;
}

export const DEFAULT_PLAN: PlanDoc = {
  name: "免費",
  maxAccounts: 1,
  dailyLimit: 20,
  allowAutoSend: false,
};
