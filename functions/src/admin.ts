// 管理員操作。管理員看得到狀態、能調方案與暫停，但碰不到 token 與 key。
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { refs } from "./db";
import { notifyUser } from "./notify";

export function requireAdmin(req: CallableRequest) {
  if (req.auth?.token.admin !== true) throw new HttpsError("permission-denied", "需要管理員權限");
}

export async function adminUpdateUser(uid: string, patch: { plan?: string; disabled?: boolean }) {
  const data: Record<string, unknown> = {};
  if (typeof patch.plan === "string") {
    if (!(await refs.plan(patch.plan).get()).exists && patch.plan !== "free") {
      throw new HttpsError("invalid-argument", "方案不存在");
    }
    data.plan = patch.plan;
  }
  if (typeof patch.disabled === "boolean") data.disabled = patch.disabled;
  if (!Object.keys(data).length) throw new HttpsError("invalid-argument", "沒有要更新的欄位");
  await refs.user(uid).update(data);
  if (patch.disabled === true) await notifyUser(uid, "帳號已被暫停", "你的海巡已被管理員暫停，如有疑問請聯絡管理員。");
}

export async function adminSetAccountSuspended(uid: string, accountId: string, suspended: boolean) {
  await refs.account(uid, accountId).update(
    suspended
      ? { status: "suspended", statusReason: "管理員暫停" }
      : { status: "ok", statusReason: null, pausedUntil: null },
  );
  if (suspended) await notifyUser(uid, "帳號被暫停", "你的一個 Threads 帳號已被管理員暫停海巡。", "/accounts");
}

export async function adminSetSystemPaused(paused: boolean, byUid: string) {
  await refs.system().set({ paused, updatedAt: FieldValue.serverTimestamp(), updatedBy: byUid }, { merge: true });
}
