import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall, onRequest, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import * as accounts from "./accounts";
import * as admin from "./admin";
import { ALL_SECRETS, ENCRYPTION_KEY, NVIDIA_API_KEY, REGION, TIMEZONE } from "./config";
import { getAccount, refs } from "./db";
import * as drafts from "./drafts";
import * as maintenance from "./maintenance";
import { handleDataDeletion, handleUninstall, parseSignedRequest } from "./metaCallbacks";
import { dispatchPatrols, enqueuePatrolNow, patrolAccount, type PatrolTask } from "./patrol";
import { cancelQueuedSend, deleteSentReply, sendDraftNow } from "./send";

setGlobalOptions({ region: REGION, maxInstances: 20 });

const callOpts = { secrets: ALL_SECRETS, enforceAppCheck: false };

function uidOf(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError("unauthenticated", "請先登入");
  return req.auth.uid;
}

function str(v: unknown, name: string): string {
  if (typeof v !== "string" || !v) throw new HttpsError("invalid-argument", `缺少 ${name}`);
  return v;
}

// ---------- 帳號 ----------

export const bootstrapUser = onCall(callOpts, async (req) => {
  await accounts.bootstrapUser(uidOf(req));
  return { ok: true };
});

export const getThreadsAuthUrl = onCall(callOpts, (req) => accounts.startThreadsAuth(uidOf(req)));

export const threadsAuthCallback = onRequest({ secrets: ALL_SECRETS }, async (req, res) => {
  const code = String(req.query.code ?? "");
  const state = String(req.query.state ?? "");
  try {
    if (req.query.error || !code || !state) {
      res.redirect(302, `/accounts?error=${encodeURIComponent(String(req.query.error_description ?? "授權已取消"))}`);
      return;
    }
    res.redirect(302, await accounts.completeThreadsAuth(code, state));
  } catch (err) {
    logger.error("Threads OAuth 失敗", err);
    res.redirect(302, `/accounts?error=${encodeURIComponent("綁定失敗，請稍後再試")}`);
  }
});

export const threadsUninstall = onRequest({ secrets: ALL_SECRETS }, async (req, res) => {
  const threadsUserId = parseSignedRequest(String(req.body?.signed_request ?? ""));
  if (!threadsUserId) {
    res.status(400).send("invalid signed_request");
    return;
  }
  await handleUninstall(threadsUserId);
  res.status(200).send("ok");
});

export const threadsDataDeletion = onRequest({ secrets: ALL_SECRETS }, async (req, res) => {
  const threadsUserId = parseSignedRequest(String(req.body?.signed_request ?? ""));
  if (!threadsUserId) {
    res.status(400).send("invalid signed_request");
    return;
  }
  res.json(await handleDataDeletion(threadsUserId));
});

export const unlinkAccount = onCall(callOpts, async (req) => {
  await accounts.unlinkAccount(uidOf(req), str(req.data?.accountId, "accountId"));
  return { ok: true };
});

export const registerPushToken = onCall(callOpts, async (req) => {
  const uid = uidOf(req);
  const token = str(req.data?.token, "token");
  await refs.user(uid).update({ fcmTokens: FieldValue.arrayUnion(token), pushEnabled: true });
  return { ok: true };
});

export const deleteMyData = onCall(callOpts, async (req) => {
  await accounts.deleteMyData(uidOf(req));
  return { ok: true };
});

// ---------- 草稿 ----------

export const sendDraft = onCall(callOpts, (req) => drafts.sendDraft(uidOf(req), str(req.data?.draftId, "draftId")));

export const cancelSend = onCall(callOpts, async (req) => {
  try {
    await cancelQueuedSend(uidOf(req), str(req.data?.draftId, "draftId"));
  } catch (err) {
    throw new HttpsError("failed-precondition", err instanceof Error ? err.message : String(err));
  }
  return { ok: true };
});

export const deleteReply = onCall(callOpts, async (req) => {
  try {
    await deleteSentReply(uidOf(req), str(req.data?.draftId, "draftId"));
  } catch (err) {
    throw new HttpsError("failed-precondition", err instanceof Error ? err.message : String(err));
  }
  return { ok: true };
});

export const regenerateDraft = onCall({ ...callOpts, timeoutSeconds: 120 }, (req) =>
  drafts.regenerateDraft(uidOf(req), str(req.data?.draftId, "draftId")),
);

export const testGenerate = onCall({ ...callOpts, timeoutSeconds: 120 }, (req) =>
  drafts.testGenerate(uidOf(req), req.data?.settings ?? {}, req.data?.postText),
);

export const runPatrolNow = onCall(callOpts, async (req) => {
  const uid = uidOf(req);
  const accountId = str(req.data?.accountId, "accountId");
  const account = await getAccount(uid, accountId);
  if (!account) throw new HttpsError("not-found", "找不到這個帳號");
  const last = account.lastPatrolAt?.toMillis() ?? 0;
  // 每日搜尋上限與每輪 AI 上限已經保護額度，這裡只防連點
  if (Date.now() - last < 60_000) throw new HttpsError("resource-exhausted", "1 分鐘內只能手動巡一次");
  await enqueuePatrolNow(uid, accountId);
  return { ok: true };
});

// ---------- 管理員 ----------

export const adminUpdateUser = onCall(callOpts, async (req) => {
  admin.requireAdmin(req);
  await admin.adminUpdateUser(str(req.data?.uid, "uid"), req.data ?? {});
  return { ok: true };
});

export const adminSetAccountSuspended = onCall(callOpts, async (req) => {
  admin.requireAdmin(req);
  await admin.adminSetAccountSuspended(
    str(req.data?.uid, "uid"),
    str(req.data?.accountId, "accountId"),
    req.data?.suspended === true,
  );
  return { ok: true };
});

export const adminSetSystemPaused = onCall(callOpts, async (req) => {
  admin.requireAdmin(req);
  await admin.adminSetSystemPaused(req.data?.paused === true, req.auth!.uid);
  return { ok: true };
});

// ---------- 海巡引擎 ----------

export const patrolScheduler = onSchedule({ schedule: "every 10 minutes", timeZone: TIMEZONE }, async () => {
  await dispatchPatrols();
});

export const patrolAccountTask = onTaskDispatched<PatrolTask>(
  {
    secrets: [ENCRYPTION_KEY, NVIDIA_API_KEY],
    // 較慢的模型一則要 30～40 秒，留足時間
    timeoutSeconds: 540,
    memory: "512MiB",
    retryConfig: { maxAttempts: 2, minBackoffSeconds: 60 },
    // 共用 AI key 每模型每分鐘 40 次，同時只跑少量帳號
    rateLimits: { maxConcurrentDispatches: 4 },
  },
  async (req) => {
    await patrolAccount(req.data);
  },
);

export const sendReplyTask = onTaskDispatched<{ uid: string; draftId: string; scheduledAt?: number }>(
  {
    secrets: [ENCRYPTION_KEY],
    retryConfig: { maxAttempts: 1 },
    rateLimits: { maxConcurrentDispatches: 10 },
  },
  async (req) => {
    await sendDraftNow(req.data.uid, req.data.draftId, req.data.scheduledAt);
  },
);

// ---------- 維護 ----------

export const refreshTokens = onSchedule(
  { schedule: "every day 04:00", timeZone: TIMEZONE, secrets: ALL_SECRETS },
  () => maintenance.refreshExpiringTokens(),
);

export const collectInsights = onSchedule(
  { schedule: "every 6 hours", timeZone: TIMEZONE, secrets: [ENCRYPTION_KEY] },
  () => maintenance.collectInsights(),
);

export const cleanup = onSchedule({ schedule: "every 60 minutes", timeZone: TIMEZONE }, () => maintenance.cleanup());
