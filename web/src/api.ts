import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { AccountSettings } from "./types";

function fn<Req, Res>(name: string) {
  const callable = httpsCallable<Req, Res>(functions, name);
  return async (data: Req) => (await callable(data)).data;
}

export const api = {
  bootstrapUser: fn<void, { ok: boolean }>("bootstrapUser"),
  getThreadsAuthUrl: fn<void, { url: string }>("getThreadsAuthUrl"),
  unlinkAccount: fn<{ accountId: string }, { ok: boolean }>("unlinkAccount"),
  registerPushToken: fn<{ token: string }, { ok: boolean }>("registerPushToken"),
  deleteMyData: fn<void, { ok: boolean }>("deleteMyData"),
  sendDraft: fn<{ draftId: string }, { status?: string; failReason: string | null; immediate: boolean; sendAt: string }>(
    "sendDraft",
  ),
  regenerateDraft: fn<{ draftId: string }, { replyText: string; reason: string }>("regenerateDraft"),
  testGenerate: fn<
    { settings: Partial<AccountSettings>; postText?: string },
    { postText: string; relevant: boolean; reason: string; reply: string }
  >("testGenerate"),
  runPatrolNow: fn<{ accountId: string }, { ok: boolean }>("runPatrolNow"),
  adminUpdateUser: fn<{ uid: string; plan?: string; disabled?: boolean }, { ok: boolean }>("adminUpdateUser"),
  adminSetAccountSuspended: fn<{ uid: string; accountId: string; suspended: boolean }, { ok: boolean }>(
    "adminSetAccountSuspended",
  ),
  adminSetSystemPaused: fn<{ paused: boolean }, { ok: boolean }>("adminSetSystemPaused"),
};

/** Firebase callable 的錯誤訊息 */
export function errMsg(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: string }).message);
  return String(err);
}
