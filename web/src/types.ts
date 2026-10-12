import type { Timestamp } from "firebase/firestore";

export type AiStatus = "ok" | "no_credits" | "invalid_key";

export interface UserDoc {
  displayName: string;
  email: string;
  plan: string;
  disabled: boolean;
  onboarded: boolean;
  pushEnabled: boolean;
  fcmTokens: string[];
  createdAt?: Timestamp;
}

export type AccountStatus = "ok" | "throttled" | "reauth" | "suspended";

export interface AccountSettings {
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
  mode: "draft" | "auto";
  enabled: boolean;
  includeOwnPosts?: boolean;
}

export interface AccountDoc extends AccountSettings {
  id: string;
  uid: string;
  username: string;
  profilePictureUrl: string | null;
  status: AccountStatus;
  statusReason: string | null;
  pausedUntil: Timestamp | null;
  limitOverride: number | null;
  tokenExpiresAt: Timestamp;
  lastPatrolAt: Timestamp | null;
  lastPatrolSummary?: {
    searches: number;
    fetched: number;
    candidates: number;
    aiCalls: number;
    irrelevant: number;
    drafts: number;
    zeroKeywords: string[];
    filtered?: { own: number; old: number; excluded: number; seen: number; cooldown: number };
  };
  lastSentAt: Timestamp | null;
}

export type DraftStatus = "pending" | "queued" | "sending" | "sent" | "skipped" | "failed";

export interface DraftDoc {
  id: string;
  accountId: string;
  accountUsername: string;
  postId: string;
  postText: string;
  postAuthor: string;
  postPermalink: string | null;
  keyword: string;
  replyText: string;
  aiReason: string;
  status: DraftStatus;
  failReason: string | null;
  scheduledAt: Timestamp | null;
  replyPostId: string | null;
  insights: { likes: number; replies: number } | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  sentAt: Timestamp | null;
}

export interface UsageDoc {
  id: string;
  searches?: number;
  found?: number;
  drafts?: number;
  sent?: number;
  irrelevant?: number;
  aiCalls?: number;
  lastPatrolAt?: Timestamp;
}

export interface PlanDoc {
  name: string;
  maxAccounts: number;
  dailyLimit: number;
  allowAutoSend: boolean;
}

export const DEFAULT_PLAN: PlanDoc = { name: "免費", maxAccounts: 1, dailyLimit: 20, allowAutoSend: false };

/** 2026-10 用共用 key 實測可用；glm-5.3-flash 最快（約 9 秒） */
export const MODEL_SUGGESTIONS = ["z-ai/glm-5.3-flash", "deepseek-ai/deepseek-v4.1-flash", "z-ai/glm-5.3"];
