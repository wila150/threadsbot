// 送出回覆。所有送出都經過這裡：遵守最短間隔＋隨機延遲、每日上限，並由後端用 token 發出。
import { getFunctions } from "firebase-admin/functions";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { REGION } from "./config";
import { decrypt } from "./crypto";
import { bumpUsage, db, effectiveDailyLimit, getAccount, getPlan, getSecrets, getUser, refs } from "./db";
import { handleThreadsError } from "./status";
import { deletePost, publishReply, ThreadsError } from "./threads";
import type { AccountDoc, DraftDoc } from "./types";

/** 間隔上加 0～50% 的隨機延遲，避免規律連發 */
function jitteredIntervalMs(account: AccountDoc) {
  const base = account.intervalMinutes * 60_000;
  return base + Math.floor(Math.random() * base * 0.5);
}

/**
 * 把草稿排進送出時段：如果距上次送出已超過間隔就立即送，否則排進 Cloud Tasks。
 * 回傳預計送出時間。
 */
export async function scheduleSend(uid: string, draftId: string, opts: { auto: boolean }): Promise<{ sendAt: Date; immediate: boolean }> {
  const draft = (await refs.draft(uid, draftId).get()).data() as DraftDoc | undefined;
  if (!draft) throw new Error("草稿不存在");
  const accountRef = refs.account(uid, draft.accountId);

  const sendAt = await db.runTransaction(async (tx) => {
    const current = (await tx.get(refs.draft(uid, draftId))).data() as DraftDoc | undefined;
    const account = (await tx.get(accountRef)).data() as AccountDoc | undefined;
    if (!account) throw new Error("帳號已解除綁定");
    // 測試模式下手動送出不受回覆間隔限制，排隊中的也可以立即送出
    const testSendNow = !opts.auto && account.includeOwnPosts === true;
    const allowed = testSendNow ? ["pending", "failed", "queued"] : ["pending", "failed"];
    if (!current || !allowed.includes(current.status)) throw new Error("這則草稿已處理過");
    const now = Date.now();
    if (testSendNow) {
      tx.update(refs.draft(uid, draftId), {
        status: "queued",
        scheduledAt: Timestamp.fromMillis(now),
        failReason: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return now;
    }
    const next = account.nextSendAt?.toMillis() ?? 0;
    // 手動送出且已過間隔：立即送；自動送出一律加隨機延遲
    const at = !opts.auto && next <= now ? now : Math.max(now + 30_000, next) + Math.floor(Math.random() * 60_000);
    tx.update(accountRef, { nextSendAt: Timestamp.fromMillis(at + jitteredIntervalMs(account)) });
    tx.update(refs.draft(uid, draftId), {
      status: "queued",
      scheduledAt: Timestamp.fromMillis(at),
      failReason: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return at;
  });

  const immediate = sendAt <= Date.now() + 1000;
  if (immediate) {
    await sendDraftNow(uid, draftId);
  } else {
    await getFunctions()
      .taskQueue(`locations/${REGION}/functions/sendReplyTask`)
      .enqueue({ uid, draftId, scheduledAt: sendAt }, { scheduleTime: new Date(sendAt) });
  }
  return { sendAt: new Date(sendAt), immediate };
}

/** 真的發出去。草稿必須是 queued（或手動重送的 failed）。 */
/**
 * expectedAt：排程任務帶來的預定時間。草稿若被取消後又重新排隊，預定時間會不同，舊任務就不送。
 */
export async function sendDraftNow(uid: string, draftId: string, expectedAt?: number): Promise<void> {
  const draftRef = refs.draft(uid, draftId);

  // 先搶鎖：queued → sending，避免重複送出
  const draft = await db.runTransaction(async (tx) => {
    const d = (await tx.get(draftRef)).data() as DraftDoc | undefined;
    if (!d || d.status !== "queued") return null;
    if (expectedAt !== undefined && Math.abs((d.scheduledAt?.toMillis() ?? 0) - expectedAt) > 1000) return null;
    tx.update(draftRef, { status: "sending", updatedAt: FieldValue.serverTimestamp() });
    return d;
  });
  if (!draft) return;

  const fail = async (reason: string, status: "failed" | "skipped" = "failed") => {
    await draftRef.update({ status, failReason: reason, updatedAt: FieldValue.serverTimestamp() });
  };

  const [user, account, secrets] = await Promise.all([
    getUser(uid),
    getAccount(uid, draft.accountId),
    getSecrets(uid),
  ]);
  if (!user || user.disabled) return fail("帳號已停用");
  if (!account) return fail("Threads 帳號已解除綁定");
  if (account.status !== "ok") return fail(`帳號狀態為 ${account.status}，暫時無法送出`);

  const plan = await getPlan(user.plan);
  const sentToday = ((await refs.usage(uid, draft.accountId).get()).data()?.sent as number) ?? 0;
  if (sentToday >= effectiveDailyLimit(account, plan)) return fail("已達今日送出上限，明天可重送");

  const enc = secrets.accounts?.[draft.accountId]?.token;
  if (!enc) return fail("找不到授權，請重新授權");

  try {
    const replyPostId = await publishReply(decrypt(enc), draft.postId, draft.replyText);
    await draftRef.update({
      status: "sent",
      replyPostId,
      sentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      failReason: null,
    });
    await Promise.all([
      bumpUsage(uid, draft.accountId, { sent: 1 }),
      refs.account(uid, draft.accountId).update({ lastSentAt: FieldValue.serverTimestamp() }),
      refs.author(uid, draft.accountId, draft.postAuthor).set(
        { lastRepliedAt: FieldValue.serverTimestamp(), count: FieldValue.increment(1) },
        { merge: true },
      ),
      refs.seen(uid, draft.accountId, draft.postId).set({ result: "replied" }, { merge: true }),
    ]);
  } catch (err) {
    if (err instanceof ThreadsError) {
      if (err.kind === "gone") return fail("原貼文已刪除", "skipped");
      await handleThreadsError(uid, draft.accountId, account, err);
      return fail(err.message);
    }
    logger.error("送出失敗", { uid, draftId, err });
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/** 取消排隊中的送出，草稿回到待審。已排的 Cloud Task 到時會因狀態不符而略過。 */
export async function cancelQueuedSend(uid: string, draftId: string): Promise<void> {
  const draftRef = refs.draft(uid, draftId);
  await db.runTransaction(async (tx) => {
    const d = (await tx.get(draftRef)).data() as DraftDoc | undefined;
    if (!d) throw new Error("草稿不存在");
    if (d.status !== "queued") throw new Error(d.status === "sending" ? "正在送出，來不及取消" : "這則草稿不在排隊中");
    tx.update(draftRef, { status: "pending", scheduledAt: null, updatedAt: FieldValue.serverTimestamp() });
  });
}

/** 從 Threads 刪除已送出的回覆；草稿保留在歷史紀錄並標記已刪除 */
export async function deleteSentReply(uid: string, draftId: string): Promise<void> {
  const draftRef = refs.draft(uid, draftId);
  const draft = (await draftRef.get()).data() as DraftDoc | undefined;
  if (!draft) throw new Error("草稿不存在");
  if (draft.status !== "sent" || !draft.replyPostId) throw new Error("這則回覆還沒送出");
  if (draft.deletedAt) throw new Error("已經刪除過了");
  const enc = (await getSecrets(uid)).accounts?.[draft.accountId]?.token;
  if (!enc) throw new Error("找不到授權，請到帳號管理重新授權");
  try {
    await deletePost(decrypt(enc), draft.replyPostId);
  } catch (err) {
    if (err instanceof ThreadsError) {
      // 已經不存在（例如在 Threads App 刪過）也算刪除成功
      if (err.kind !== "gone") {
        if (err.code === 10 || err.code === 200 || err.status === 403) {
          throw new Error("缺少刪除權限，請到「帳號管理」按「重新授權」後再試");
        }
        throw new Error(`Threads 刪除失敗：${err.message}`);
      }
    } else {
      throw err;
    }
  }
  await draftRef.update({ deletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
}
