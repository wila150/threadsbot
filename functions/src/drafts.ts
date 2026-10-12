// 草稿審核相關：送出、重新生成、試產一則
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { AiError, generateReply, type PersonaSettings } from "./ai";
import { decrypt } from "./crypto";
import { getAccount, getDraft, getSecrets, getUser, refs } from "./db";
import { scheduleSend } from "./send";
import { handleAiError } from "./status";

async function requireApiKey(uid: string) {
  const [user, secrets] = await Promise.all([getUser(uid), getSecrets(uid)]);
  if (!user || user.disabled) throw new HttpsError("permission-denied", "帳號已停用");
  if (!secrets.nvidiaKey) throw new HttpsError("failed-precondition", "請先填入 NVIDIA API key");
  return decrypt(secrets.nvidiaKey);
}

async function runAi(uid: string, apiKey: string, settings: PersonaSettings, post: { text: string; author: string }) {
  try {
    return await generateReply(apiKey, settings, post);
  } catch (err) {
    if (err instanceof AiError) {
      await handleAiError(uid, err);
      throw new HttpsError("unavailable", err.message);
    }
    throw err;
  }
}

export async function sendDraft(uid: string, draftId: string) {
  const user = await getUser(uid);
  if (!user || user.disabled) throw new HttpsError("permission-denied", "帳號已停用");
  try {
    const { sendAt, immediate } = await scheduleSend(uid, draftId, { auto: false });
    const draft = await getDraft(uid, draftId);
    return { status: draft?.status, failReason: draft?.failReason ?? null, immediate, sendAt: sendAt.toISOString() };
  } catch (err) {
    throw new HttpsError("failed-precondition", err instanceof Error ? err.message : String(err));
  }
}

export async function regenerateDraft(uid: string, draftId: string) {
  const draft = await getDraft(uid, draftId);
  if (!draft) throw new HttpsError("not-found", "草稿不存在");
  if (!["pending", "failed"].includes(draft.status)) throw new HttpsError("failed-precondition", "這則草稿已處理過");
  const account = await getAccount(uid, draft.accountId);
  if (!account) throw new HttpsError("failed-precondition", "帳號已解除綁定");
  const apiKey = await requireApiKey(uid);
  const result = await runAi(uid, apiKey, account, { text: draft.postText, author: draft.postAuthor });
  if (!result.reply) throw new HttpsError("failed-precondition", `AI 判斷這篇不適合回覆：${result.reason}`);
  await refs.draft(uid, draftId).update({
    replyText: result.reply,
    aiReason: result.reason,
    model: account.model,
    status: "pending",
    failReason: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { replyText: result.reply, reason: result.reason };
}

const SAMPLE_POST = "最近想找台中好吃的早午餐，有沒有人推薦？不要網美店，想吃實在一點的";

/** 海巡設定頁的「試產一則」：用尚未儲存的設定預覽 AI 語氣 */
export async function testGenerate(uid: string, settings: Partial<PersonaSettings>, postText?: string) {
  const apiKey = await requireApiKey(uid);
  const s: PersonaSettings = {
    persona: String(settings.persona ?? "").slice(0, 500),
    tone: String(settings.tone ?? "").slice(0, 200),
    region: String(settings.region ?? "").slice(0, 50),
    keywords: Array.isArray(settings.keywords) ? settings.keywords.map(String).slice(0, 10) : [],
    maxChars: Math.min(300, Math.max(10, Number(settings.maxChars) || 50)),
    model: String(settings.model || ""),
  };
  if (!s.model) throw new HttpsError("invalid-argument", "請選擇模型");
  const text = (postText ?? "").trim().slice(0, 1000) || SAMPLE_POST;
  const result = await runAi(uid, apiKey, s, { text, author: "sample_user" });
  return { postText: text, ...result };
}
