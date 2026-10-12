// Meta 要求的兩個回呼：用戶在 Threads 端撤銷授權（uninstall）、要求刪除資料（delete）。
// 兩者都會 POST 一個 signed_request，用 App Secret 驗證簽章。
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { APP_URL, THREADS_APP_SECRET } from "./config";
import { db, refs } from "./db";
import { notifyUser } from "./notify";

const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** 驗證 signed_request，回傳其中的 Threads user_id；驗證失敗回傳 null */
export function parseSignedRequest(signed: string): string | null {
  const [sig, payload] = signed.split(".");
  if (!sig || !payload) return null;
  const expected = createHmac("sha256", THREADS_APP_SECRET.value()).update(payload).digest();
  const actual = b64url(sig);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(b64url(payload).toString("utf8"));
    return data.user_id ? String(data.user_id) : null;
  } catch {
    return null;
  }
}

async function findAccounts(threadsUserId: string) {
  return (await db.collectionGroup("accounts").where("threadsUserId", "==", threadsUserId).get()).docs;
}

/** 用戶在 Threads 撤銷授權：刪掉 token，帳號標成需重新授權 */
export async function handleUninstall(threadsUserId: string) {
  for (const doc of await findAccounts(threadsUserId)) {
    const uid = doc.data().uid as string;
    await refs.secrets(uid).set({ accounts: { [doc.id]: FieldValue.delete() } }, { merge: true });
    await doc.ref.update({ status: "reauth", statusReason: "已在 Threads 撤銷授權", enabled: false });
    await notifyUser(uid, "Threads 授權已撤銷", `@${doc.data().username} 已停止海巡，需要時可重新授權。`, "/accounts");
  }
  logger.info("Threads uninstall", { threadsUserId });
}

/** 用戶要求刪除資料：刪掉 token 與該帳號的所有資料。回傳 Meta 要求的確認碼與查詢網址。 */
export async function handleDataDeletion(threadsUserId: string) {
  for (const doc of await findAccounts(threadsUserId)) {
    const uid = doc.data().uid as string;
    await refs.secrets(uid).set({ accounts: { [doc.id]: FieldValue.delete() } }, { merge: true });
    await db.recursiveDelete(doc.ref);
    const drafts = await refs.drafts(uid).where("accountId", "==", doc.id).get();
    await Promise.all(drafts.docs.map((d) => d.ref.delete()));
  }
  const code = randomBytes(8).toString("hex");
  logger.info("Threads data deletion", { threadsUserId, code });
  return { url: new URL(`/?deletion=${code}`, APP_URL.value()).toString(), confirmation_code: code };
}
