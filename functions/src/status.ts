// 錯誤 → 狀態變更 + 通知。任何錯誤只影響出錯的那個帳號／用戶。
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { THROTTLE_PAUSE_HOURS } from "./config";
import { refs } from "./db";
import { notifyUser } from "./notify";
import type { AccountDoc, AiStatus } from "./types";
import type { AiError } from "./ai";
import type { ThreadsError } from "./threads";

export async function markReauth(uid: string, accountId: string, username: string, reason: string) {
  await refs.account(uid, accountId).update({ status: "reauth", statusReason: reason });
  await notifyUser(uid, "需要重新授權", `@${username} 的 Threads 授權已失效，海巡已暫停。請點此重新授權。`, "/accounts");
}

/** 被限流：暫停 24 小時並把上限降一半 */
export async function throttle(uid: string, accountId: string, account: AccountDoc, reason: string) {
  const current = account.limitOverride ?? account.dailyLimit;
  await refs.account(uid, accountId).update({
    status: "throttled",
    statusReason: reason,
    pausedUntil: Timestamp.fromMillis(Date.now() + THROTTLE_PAUSE_HOURS * 3600_000),
    limitOverride: Math.max(1, Math.floor(current / 2)),
  });
  await notifyUser(
    uid,
    "帳號被 Threads 限流",
    `@${account.username} 暫停海巡 ${THROTTLE_PAUSE_HOURS} 小時，每日上限已自動降低。`,
    "/",
  );
}

export async function setAiStatus(uid: string, status: AiStatus) {
  await refs.user(uid).update({ aiStatus: status });
  if (status === "no_credits") {
    await notifyUser(uid, "AI 點數用完了", "所有帳號的 AI 生成已暫停。請更換 NVIDIA key 或申請更多點數。", "/profile");
  } else if (status === "invalid_key") {
    await notifyUser(uid, "NVIDIA key 無效", "AI 生成已暫停，請重新填入 NVIDIA API key。", "/profile");
  }
}

/** 處理 Threads 錯誤；回傳 true 表示這個帳號這一輪應該停下來 */
export async function handleThreadsError(uid: string, accountId: string, account: AccountDoc, err: ThreadsError) {
  logger.warn("Threads API 錯誤", { uid, accountId, kind: err.kind, status: err.status, code: err.code, msg: err.message });
  if (err.kind === "auth") {
    await markReauth(uid, accountId, account.username, err.message);
    return true;
  }
  if (err.kind === "rate") {
    await throttle(uid, accountId, account, err.message);
    return true;
  }
  return false;
}

/** 處理 AI 錯誤；回傳 true 表示整個用戶的 AI 生成應該停下來 */
export async function handleAiError(uid: string, err: AiError) {
  logger.warn("AI 錯誤", { uid, kind: err.kind, msg: err.message });
  if (err.kind === "no_credits" || err.kind === "invalid_key") {
    await setAiStatus(uid, err.kind);
    return true;
  }
  return err.kind === "rate";
}

export const serverNow = () => FieldValue.serverTimestamp();
