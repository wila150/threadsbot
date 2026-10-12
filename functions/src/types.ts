import type { Timestamp } from "firebase-admin/firestore";

export type AiStatus = "ok" | "no_key" | "no_credits" | "invalid_key";

export interface UserDoc {
  displayName: string;
  email: string;
  plan: string;
  createdAt: Timestamp;
  disabled: boolean;
  onboarded: boolean;
  aiStatus: AiStatus;
  nvidiaKeyLast4: string | null;
  pushEnabled: boolean;
  fcmTokens: string[];
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
  // 狀態（只有後端寫）
  status: AccountStatus;
  statusReason: string | null;
  pausedUntil: Timestamp | null;
  /** 被限流後自動降低的上限；null 表示沒降 */
  limitOverride: number | null;
  tokenExpiresAt: Timestamp;
  nextSendAt: Timestamp | null;
  lastPatrolAt: Timestamp | null;
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

export interface PlanDoc {
  name: string;
  maxAccounts: number;
  dailyLimit: number;
  allowAutoSend: boolean;
}

export interface SecretsDoc {
  nvidiaKey?: string;
  accounts?: Record<string, { token: string; expiresAt: Timestamp; issuedAt: Timestamp }>;
}

export const DEFAULT_PLAN: PlanDoc = {
  name: "免費",
  maxAccounts: 1,
  dailyLimit: 20,
  allowAutoSend: false,
};
