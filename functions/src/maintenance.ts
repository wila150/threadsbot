// 定時維護：更新 token、抓回覆後的互動數據
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { decrypt, encrypt } from "./crypto";
import { db, getSecrets, refs } from "./db";
import { notifyUser } from "./notify";
import { markReauth } from "./status";
import { getInsights, refreshToken, ThreadsError } from "./threads";
import type { AccountDoc, DraftDoc } from "./types";

const DAY = 86_400_000;

/** 每天：10 天內到期的 token 自動 refresh；refresh 失敗就提醒用戶 */
export async function refreshExpiringTokens() {
  const soon = Timestamp.fromMillis(Date.now() + 10 * DAY);
  const snap = await db.collectionGroup("accounts").where("tokenExpiresAt", "<", soon).get();
  for (const doc of snap.docs) {
    const account = doc.data() as AccountDoc;
    if (account.status === "reauth") continue;
    const uid = account.uid;
    const secrets = await getSecrets(uid);
    const entry = secrets.accounts?.[doc.id];
    if (!entry) continue;

    if (entry.expiresAt.toMillis() < Date.now()) {
      await markReauth(uid, doc.id, account.username, "token 已過期");
      continue;
    }
    try {
      const { token, expiresIn } = await refreshToken(decrypt(entry.token));
      const expiresAt = Timestamp.fromMillis(Date.now() + expiresIn * 1000);
      await refs.secrets(uid).set(
        { accounts: { [doc.id]: { token: encrypt(token), expiresAt, issuedAt: Timestamp.now() } } },
        { merge: true },
      );
      await doc.ref.update({ tokenExpiresAt: expiresAt });
    } catch (err) {
      if (err instanceof ThreadsError && err.kind === "auth") {
        await markReauth(uid, doc.id, account.username, err.message);
      } else {
        logger.warn("token refresh 失敗", { uid, accountId: doc.id, err: String(err) });
        const days = Math.ceil((entry.expiresAt.toMillis() - Date.now()) / DAY);
        if (days <= 3) {
          await notifyUser(uid, "Threads 授權快過期", `@${account.username} 的授權 ${days} 天後到期，請重新授權。`, "/accounts");
        }
      }
    }
  }
}

/** 每 6 小時：更新最近 7 天送出回覆的讚數與回覆數 */
export async function collectInsights() {
  const since = Timestamp.fromMillis(Date.now() - 7 * DAY);
  const snap = await db.collectionGroup("drafts").where("status", "==", "sent").where("sentAt", ">", since).get();
  const tokenCache = new Map<string, string | null>();

  for (const doc of snap.docs) {
    const draft = doc.data() as DraftDoc;
    if (!draft.replyPostId) continue;
    const uid = doc.ref.parent.parent!.id;
    const cacheKey = `${uid}/${draft.accountId}`;
    if (!tokenCache.has(cacheKey)) {
      const enc = (await getSecrets(uid)).accounts?.[draft.accountId]?.token;
      tokenCache.set(cacheKey, enc ? decrypt(enc) : null);
    }
    const token = tokenCache.get(cacheKey);
    if (!token) continue;
    try {
      const insights = await getInsights(token, draft.replyPostId);
      await doc.ref.update({ insights: { ...insights, updatedAt: FieldValue.serverTimestamp() } });
    } catch (err) {
      if (err instanceof ThreadsError && (err.kind === "auth" || err.kind === "rate")) tokenCache.set(cacheKey, null);
      logger.debug("insights 失敗", { uid, draftId: doc.id, err: String(err) });
    }
  }
}

/** 每小時：清掉過期的 OAuth state、卡在 sending 太久的草稿 */
export async function cleanup() {
  const old = Timestamp.fromMillis(Date.now() - 3600_000);
  const states = await db.collection("oauthStates").where("createdAt", "<", old).get();
  await Promise.all(states.docs.map((d) => d.ref.delete()));

  const stuck = await db.collectionGroup("drafts").where("status", "==", "sending").get();
  await Promise.all(
    stuck.docs
      .filter((d) => ((d.data().updatedAt as Timestamp | undefined)?.toMillis() ?? 0) < old.toMillis())
      .map((d) => d.ref.update({ status: "failed", failReason: "送出逾時，請確認是否已送出後再重送" })),
  );
}
