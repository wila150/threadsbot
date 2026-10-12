// 海巡引擎：排程派發 → 每個帳號一個獨立任務 → 搜尋 → 過濾去重 → AI 判斷與產生 → 草稿／自動送出
import { getFunctions } from "firebase-admin/functions";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { AiError, generateReply } from "./ai";
import {
  AUTHOR_COOLDOWN_HOURS,
  MAX_DRAFTS_PER_RUN,
  MAX_POST_AGE_HOURS,
  REGION,
  THREADS_SEARCH_DAILY_CAP,
} from "./config";
import { decrypt } from "./crypto";
import {
  bumpUsage,
  db,
  effectiveDailyLimit,
  getPlan,
  getSecrets,
  inActiveHours,
  isSystemPaused,
  refs,
} from "./db";
import { notifyUser } from "./notify";
import { scheduleSend } from "./send";
import { handleAiError, handleThreadsError } from "./status";
import { keywordSearch, ThreadsError, type ThreadsPost } from "./threads";
import type { AccountDoc, DraftDoc, UserDoc } from "./types";

export interface PatrolTask {
  uid: string;
  accountId: string;
}

/** 排程每 10 分鐘呼叫：只派發「已開啟、在巡邏時段內、沒被暫停」的帳號 */
export async function dispatchPatrols(): Promise<number> {
  if (await isSystemPaused()) {
    logger.info("系統已暫停，跳過本輪");
    return 0;
  }
  const snap = await db.collectionGroup("accounts").where("enabled", "==", true).get();
  const queue = getFunctions().taskQueue<PatrolTask>(`locations/${REGION}/functions/patrolAccountTask`);
  const userCache = new Map<string, UserDoc | undefined>();
  const slot = Math.floor(Date.now() / 600_000); // 10 分鐘一個槽，避免同一輪重複派發
  let count = 0;

  for (const doc of snap.docs) {
    const account = doc.data() as AccountDoc;
    const uid = account.uid;
    if (!readyToPatrol(account)) continue;
    if (!userCache.has(uid)) userCache.set(uid, (await refs.user(uid).get()).data() as UserDoc | undefined);
    const user = userCache.get(uid);
    if (!user || user.disabled || user.aiStatus !== "ok") continue;

    try {
      await queue.enqueue({ uid, accountId: doc.id }, { id: `p-${uid}-${doc.id}-${slot}`, dispatchDeadlineSeconds: 300 });
      count++;
    } catch (err: any) {
      // 同 id 已派發過
      if (err?.code !== "functions/task-already-exists") logger.error("派發失敗", { uid, accountId: doc.id, err });
    }
  }
  logger.info(`本輪派發 ${count} 個帳號`);
  return count;
}

function readyToPatrol(account: AccountDoc, now = new Date()) {
  if (!account.enabled || !account.keywords?.length) return false;
  if (account.status === "reauth" || account.status === "suspended") return false;
  if (account.pausedUntil && account.pausedUntil.toMillis() > now.getTime()) return false;
  return inActiveHours(account.activeHours, now);
}

/** 單一帳號的一輪海巡。出錯只影響這個帳號。 */
export async function patrolAccount({ uid, accountId }: PatrolTask): Promise<void> {
  const accountRef = refs.account(uid, accountId);
  const [userSnap, accountSnap, secrets, usageSnap] = await Promise.all([
    refs.user(uid).get(),
    accountRef.get(),
    getSecrets(uid),
    refs.usage(uid, accountId).get(),
  ]);
  const user = userSnap.data() as UserDoc | undefined;
  const account = accountSnap.data() as AccountDoc | undefined;
  if (!user || !account || user.disabled || user.aiStatus !== "ok") return;
  if (!readyToPatrol(account)) return;
  if (await isSystemPaused()) return;

  // 限流期滿，恢復正常
  if (account.status === "throttled") {
    await accountRef.update({ status: "ok", statusReason: null, pausedUntil: null });
    account.status = "ok";
  }

  const plan = await getPlan(user.plan);
  const usage = usageSnap.data() ?? {};
  const limit = effectiveDailyLimit(account, plan);
  let draftBudget = Math.min(MAX_DRAFTS_PER_RUN, limit - ((usage.drafts as number) ?? 0));
  let searchBudget = THREADS_SEARCH_DAILY_CAP - ((usage.searches as number) ?? 0);
  if (draftBudget <= 0 || searchBudget <= 0) {
    await bumpUsage(uid, accountId, {});
    return;
  }

  const tokenEnc = secrets.accounts?.[accountId]?.token;
  const keyEnc = secrets.nvidiaKey;
  if (!tokenEnc || !keyEnc) return;
  const token = decrypt(tokenEnc);
  const apiKey = decrypt(keyEnc);

  // 1. 搜尋
  const found: { post: ThreadsPost; keyword: string }[] = [];
  let searches = 0;
  for (const keyword of shuffle(account.keywords)) {
    if (searchBudget-- <= 0) break;
    try {
      const posts = await keywordSearch(token, keyword);
      searches++;
      for (const post of posts) found.push({ post, keyword });
    } catch (err) {
      searches++;
      if (err instanceof ThreadsError && (await handleThreadsError(uid, accountId, account, err))) {
        await bumpUsage(uid, accountId, { searches });
        return;
      }
      logger.warn("搜尋失敗", { uid, accountId, keyword, err: String(err) });
    }
  }

  // 2. 過濾與去重
  const candidates = await filterPosts(uid, accountId, account, found);

  // 3. AI 判斷與產生
  let drafts = 0;
  let irrelevant = 0;
  let aiCalls = 0;
  const newDraftIds: string[] = [];
  for (const { post, keyword } of candidates) {
    if (draftBudget <= 0) break;
    const seenRef = refs.seen(uid, accountId, post.id);
    try {
      aiCalls++;
      const result = await generateReply(apiKey, account, { text: post.text ?? "", author: post.username ?? "" });
      if (!result.relevant) {
        irrelevant++;
        await seenRef.set({ result: "irrelevant", reason: result.reason, at: FieldValue.serverTimestamp() });
        continue;
      }
      const draftRef = refs.drafts(uid).doc();
      const draft: Omit<DraftDoc, "createdAt" | "updatedAt"> & Record<string, unknown> = {
        accountId,
        accountUsername: account.username,
        postId: post.id,
        postText: post.text ?? "",
        postAuthor: post.username ?? "",
        postPermalink: post.permalink ?? null,
        postTimestamp: post.timestamp ?? null,
        keyword,
        replyText: result.reply,
        aiReason: result.reason,
        model: account.model,
        status: "pending",
        failReason: null,
        scheduledAt: null,
        replyPostId: null,
        insights: null,
        sentAt: null,
      };
      await Promise.all([
        draftRef.set({ ...draft, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }),
        seenRef.set({ result: "drafted", draftId: draftRef.id, at: FieldValue.serverTimestamp() }),
        refs.author(uid, accountId, post.username ?? "").set({ lastDraftAt: FieldValue.serverTimestamp() }, { merge: true }),
      ]);
      newDraftIds.push(draftRef.id);
      drafts++;
      draftBudget--;
    } catch (err) {
      if (err instanceof AiError) {
        if (await handleAiError(uid, err)) break;
        continue; // 格式錯誤之類，下一輪會再試這篇
      }
      throw err;
    }
  }

  await Promise.all([
    bumpUsage(uid, accountId, { searches, found: candidates.length, drafts, irrelevant, aiCalls }),
    refs.usage(uid, accountId).set({ lastPatrolAt: FieldValue.serverTimestamp() }, { merge: true }),
    accountRef.update({ lastPatrolAt: FieldValue.serverTimestamp() }),
  ]);

  // 4. 依模式處理
  if (!newDraftIds.length) return;
  if (account.mode === "auto" && plan.allowAutoSend) {
    for (const id of newDraftIds) await scheduleSend(uid, id, { auto: true });
  } else {
    await notifyUser(uid, `${newDraftIds.length} 則新草稿待審`, `@${account.username} 巡到新的貼文，點此審核。`, "/drafts");
  }
}

async function filterPosts(
  uid: string,
  accountId: string,
  account: AccountDoc,
  found: { post: ThreadsPost; keyword: string }[],
) {
  const minTime = Date.now() - MAX_POST_AGE_HOURS * 3600_000;
  const exclude = account.excludeWords.map((w) => w.toLowerCase()).filter(Boolean);
  const own = account.username.toLowerCase();

  // 同一輪內去重 + 基本過濾
  const unique = new Map<string, { post: ThreadsPost; keyword: string }>();
  for (const item of found) {
    const { post } = item;
    const text = (post.text ?? "").trim();
    if (!text || unique.has(post.id)) continue;
    if ((post.username ?? "").toLowerCase() === own) continue;
    if (post.timestamp && Date.parse(post.timestamp) < minTime) continue;
    const lower = text.toLowerCase();
    if (exclude.some((w) => lower.includes(w))) continue;
    unique.set(post.id, item);
  }
  if (!unique.size) return [];

  // 已看過的跳過
  const items = [...unique.values()];
  const seenSnaps = await db.getAll(...items.map((i) => refs.seen(uid, accountId, i.post.id)));
  const fresh = items.filter((_, i) => !seenSnaps[i].exists);

  // 作者冷卻：同一位作者短時間內不重複回
  const authors = [...new Set(fresh.map((i) => i.post.username ?? ""))];
  const authorSnaps = authors.length ? await db.getAll(...authors.map((a) => refs.author(uid, accountId, a))) : [];
  const cooldown = Date.now() - AUTHOR_COOLDOWN_HOURS * 3600_000;
  const cooling = new Set(
    authors.filter((_, i) => {
      const d = authorSnaps[i].data();
      const last = Math.max(d?.lastDraftAt?.toMillis?.() ?? 0, d?.lastRepliedAt?.toMillis?.() ?? 0);
      return last > cooldown;
    }),
  );
  // 同一輪也只取同作者一篇
  const picked = new Set<string>();
  return fresh.filter((i) => {
    const a = i.post.username ?? "";
    if (cooling.has(a) || picked.has(a)) return false;
    picked.add(a);
    return true;
  });
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 方便測試或首頁「立即巡一次」用 */
export async function enqueuePatrolNow(uid: string, accountId: string) {
  await getFunctions()
    .taskQueue<PatrolTask>(`locations/${REGION}/functions/patrolAccountTask`)
    .enqueue({ uid, accountId }, { id: `m-${uid}-${accountId}-${Date.now()}` });
}
