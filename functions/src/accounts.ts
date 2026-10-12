// 系統帳號、Threads 綁定、NVIDIA key
import { randomBytes } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { APP_URL, DEFAULT_MODEL } from "./config";
import { encrypt } from "./crypto";
import { db, getPlan, getUser, refs } from "./db";
import { authorizeUrl, exchangeCode, getMe } from "./threads";
import type { AccountDoc, UserDoc } from "./types";

export const redirectUri = () => new URL("/api/threads/callback", APP_URL.value()).toString();

export async function bootstrapUser(uid: string) {
  const ref = refs.user(uid);
  const snap = await ref.get();
  if (snap.exists) return snap.data() as UserDoc;
  const auth = await getAuth().getUser(uid);
  const user: Omit<UserDoc, "createdAt"> = {
    displayName: auth.displayName ?? auth.email?.split("@")[0] ?? "",
    email: auth.email ?? "",
    plan: "free",
    disabled: false,
    onboarded: false,
    pushEnabled: true,
    fcmTokens: [],
  };
  await ref.set({ ...user, createdAt: FieldValue.serverTimestamp() });
  return user;
}

// ---------- Threads OAuth ----------

export async function startThreadsAuth(uid: string) {
  const user = await getUser(uid);
  if (!user) throw new HttpsError("failed-precondition", "請先完成註冊");
  if (user.disabled) throw new HttpsError("permission-denied", "帳號已停用");
  const state = randomBytes(24).toString("hex");
  await db.doc(`oauthStates/${state}`).set({ uid, createdAt: FieldValue.serverTimestamp() });
  return { url: authorizeUrl(redirectUri(), state) };
}

/** OAuth callback（HTTP）。成功或失敗都導回 /accounts 並帶結果參數。 */
export async function completeThreadsAuth(code: string, state: string): Promise<string> {
  const back = (params: Record<string, string>) => {
    const u = new URL("/accounts", APP_URL.value());
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  };

  const stateRef = db.doc(`oauthStates/${state}`);
  const stateSnap = await stateRef.get();
  if (!stateSnap.exists) return back({ error: "授權連結已失效，請重試" });
  const { uid, createdAt } = stateSnap.data() as { uid: string; createdAt: Timestamp };
  await stateRef.delete();
  if (Date.now() - createdAt.toMillis() > 15 * 60_000) return back({ error: "授權逾時，請重試" });

  const { token, expiresIn } = await exchangeCode(code, redirectUri());
  const me = await getMe(token);
  const accountId = me.id;

  const [user, existing] = await Promise.all([getUser(uid), refs.account(uid, accountId).get()]);
  if (!user) return back({ error: "找不到使用者" });
  if (!existing.exists) {
    const plan = await getPlan(user.plan);
    const count = (await refs.accounts(uid).count().get()).data().count;
    if (count >= plan.maxAccounts) return back({ error: `目前方案最多綁定 ${plan.maxAccounts} 個 Threads 帳號` });
  }

  const expiresAt = Timestamp.fromMillis(Date.now() + expiresIn * 1000);
  await refs.secrets(uid).set(
    { accounts: { [accountId]: { token: encrypt(token), expiresAt, issuedAt: Timestamp.now() } } },
    { merge: true },
  );

  if (existing.exists) {
    // 重新授權：恢復狀態，保留設定
    await existing.ref.update({
      username: me.username,
      profilePictureUrl: me.threads_profile_picture_url ?? null,
      status: "ok",
      statusReason: null,
      tokenExpiresAt: expiresAt,
    });
  } else {
    const account: Omit<AccountDoc, "createdAt"> = {
      uid,
      threadsUserId: accountId,
      username: me.username,
      profilePictureUrl: me.threads_profile_picture_url ?? null,
      keywords: [],
      excludeWords: [],
      region: "台灣",
      persona: "",
      tone: "自然、口語、友善",
      model: DEFAULT_MODEL,
      maxChars: 50,
      dailyLimit: 10,
      intervalMinutes: 15,
      activeHours: { start: 9, end: 23 },
      mode: "draft",
      enabled: false,
      maxPostAgeHours: 48,
      authorCooldownHours: 24,
      blockedAuthors: [],
      minTextLength: 0,
      questionsOnly: false,
      aiExtraRules: "",
      status: "ok",
      statusReason: null,
      pausedUntil: null,
      limitOverride: null,
      tokenExpiresAt: expiresAt,
      nextSendAt: null,
      lastPatrolAt: null,
      lastSentAt: null,
    };
    await existing.ref.set({ ...account, createdAt: FieldValue.serverTimestamp() });
  }
  return back({ linked: me.username });
}

export async function unlinkAccount(uid: string, accountId: string) {
  const ref = refs.account(uid, accountId);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "找不到這個帳號");
  // 先刪 token，再刪帳號資料（含 usage／seen／authors）。草稿保留作為歷史紀錄。
  await refs.secrets(uid).set({ accounts: { [accountId]: FieldValue.delete() } }, { merge: true });
  await db.recursiveDelete(ref);
}

/** 刪除自己的所有資料（含 token），並刪除登入帳號 */
export async function deleteMyData(uid: string) {
  await refs.secrets(uid).delete();
  await db.recursiveDelete(refs.user(uid));
  await getAuth().deleteUser(uid);
}
