import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { AI_RETRY_AFTER_MINUTES, TIMEZONE } from "./config";
import {
  DEFAULT_PLAN,
  type AccountDoc,
  type DraftDoc,
  type PlanDoc,
  type SecretsDoc,
  type SystemDoc,
  type UserDoc,
} from "./types";

initializeApp();
export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

export const refs = {
  user: (uid: string) => db.doc(`users/${uid}`),
  account: (uid: string, accountId: string) => db.doc(`users/${uid}/accounts/${accountId}`),
  accounts: (uid: string) => db.collection(`users/${uid}/accounts`),
  usage: (uid: string, accountId: string, date = todayKey()) =>
    db.doc(`users/${uid}/accounts/${accountId}/usage/${date}`),
  seen: (uid: string, accountId: string, postId: string) =>
    db.doc(`users/${uid}/accounts/${accountId}/seen/${postId}`),
  author: (uid: string, accountId: string, username: string) =>
    db.doc(`users/${uid}/accounts/${accountId}/authors/${encodeURIComponent(username)}`),
  draft: (uid: string, draftId: string) => db.doc(`users/${uid}/drafts/${draftId}`),
  drafts: (uid: string) => db.collection(`users/${uid}/drafts`),
  secrets: (uid: string) => db.doc(`secrets/${uid}`),
  plan: (planId: string) => db.doc(`plans/${planId}`),
  system: () => db.doc("system/config"),
};

export async function getUser(uid: string) {
  return (await refs.user(uid).get()).data() as UserDoc | undefined;
}
export async function getAccount(uid: string, accountId: string) {
  return (await refs.account(uid, accountId).get()).data() as AccountDoc | undefined;
}
export async function getDraft(uid: string, draftId: string) {
  return (await refs.draft(uid, draftId).get()).data() as DraftDoc | undefined;
}
export async function getSecrets(uid: string) {
  return ((await refs.secrets(uid).get()).data() ?? {}) as SecretsDoc;
}
export async function getPlan(planId: string): Promise<PlanDoc> {
  const snap = await refs.plan(planId).get();
  return snap.exists ? { ...DEFAULT_PLAN, ...(snap.data() as PlanDoc) } : DEFAULT_PLAN;
}
export async function getSystem(): Promise<SystemDoc> {
  return ((await refs.system().get()).data() ?? {}) as SystemDoc;
}
export async function isSystemPaused() {
  return (await getSystem()).paused === true;
}
/** 共用 AI key 可不可以用：正常，或出問題已超過重試間隔 */
export function aiAvailable(system: SystemDoc): boolean {
  if (!system.aiStatus || system.aiStatus === "ok") return true;
  const at = system.aiStatusAt?.toMillis() ?? 0;
  return Date.now() - at > AI_RETRY_AFTER_MINUTES * 60_000;
}

/** 台北時間的日期字串，例如 2026-10-12 */
export function todayKey(d = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TIMEZONE }).format(d);
}

/** 台北時間的小時 0-23 */
export function currentHour(d = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, hour: "numeric", hourCycle: "h23" }).format(d));
}

export function inActiveHours(hours: { start: number; end: number }, d = new Date()): boolean {
  const h = currentHour(d);
  // 支援跨午夜，例如 20 → 2
  return hours.start <= hours.end ? h >= hours.start && h < hours.end : h >= hours.start || h < hours.end;
}

export function effectiveDailyLimit(account: AccountDoc, plan: PlanDoc): number {
  return Math.min(account.dailyLimit, plan.dailyLimit, account.limitOverride ?? Infinity);
}

export async function bumpUsage(uid: string, accountId: string, fields: Partial<Record<UsageField, number>>) {
  const data: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  for (const [k, v] of Object.entries(fields)) if (v) data[k] = FieldValue.increment(v);
  await refs.usage(uid, accountId).set(data, { merge: true });
}
/** found：通過過濾去重的新貼文數（「今日巡到」） */
export type UsageField = "searches" | "found" | "drafts" | "sent" | "irrelevant" | "aiCalls";
