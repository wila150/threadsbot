// AI 回覆：用 OpenAI 相容格式呼叫 NVIDIA Build API（用用戶自己的 key）。
import { AI_BASE_URL } from "./config";

/** no_credits：402；invalid_key：401/403；rate：429 重試後仍失敗；other：其他 */
export type AiErrorKind = "no_credits" | "invalid_key" | "rate" | "other";

export class AiError extends Error {
  constructor(message: string, public kind: AiErrorKind) {
    super(message);
  }
}

const MAX_RETRIES = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chat(apiKey: string, model: string, messages: { role: string; content: string }[], maxTokens: number) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${AI_BASE_URL.value()}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: maxTokens }),
    });
    if (res.ok) {
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return body.choices?.[0]?.message?.content ?? "";
    }
    const detail = await res.text().catch(() => "");
    if (res.status === 402) throw new AiError("AI 點數已用完", "no_credits");
    if (res.status === 401 || res.status === 403) throw new AiError("AI API key 無效", "invalid_key");
    if (res.status === 429) {
      if (attempt >= MAX_RETRIES) throw new AiError("AI 呼叫太頻繁", "rate");
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2 ** attempt * 2) * 1000);
      continue;
    }
    throw new AiError(`AI API ${res.status}: ${detail.slice(0, 200)}`, "other");
  }
}

export interface PersonaSettings {
  persona: string;
  tone: string;
  region: string;
  keywords: string[];
  maxChars: number;
  model: string;
}

export interface ReplyResult {
  relevant: boolean;
  reason: string;
  reply: string;
}

function systemPrompt(s: PersonaSettings) {
  return [
    `你是一位真實的 Threads 用戶，正在瀏覽和「${s.keywords.join("、")}」相關的貼文，看到適合的就留言互動。`,
    `你的人設：${s.persona || "親切、懂這個主題的一般人"}`,
    `你的語氣：${s.tone || "自然、口語、友善"}`,
    s.region ? `你只關心和「${s.region}」相關或該地區的人發的貼文。` : "",
    "",
    "任務分兩步：",
    "1. 判斷這篇貼文是否值得回覆。以下情況一律判為不相關：和主題無關、廣告或業配、求職詐騙、政治或宗教爭議、內容不明、只有連結或貼圖、明顯情緒低落需要專業協助。",
    `2. 若相關，寫一則回覆：使用繁體中文、${s.maxChars} 字以內、針對貼文內容具體回應（不要泛泛稱讚）、像真人隨口留言、不像廣告、不放任何連結或 hashtag、不要提到自己是 AI、不要推銷。`,
    "",
    '只輸出 JSON，不要其他文字：{"relevant": true 或 false, "reason": "一句話說明判斷理由", "reply": "回覆內容；不相關時為空字串"}',
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function parseResult(raw: string, maxChars: number): ReplyResult {
  // 部分推理模型會輸出 <think>…</think>
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new AiError(`AI 回傳格式錯誤：${text.slice(0, 100)}`, "other");
  let obj: Partial<ReplyResult>;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    throw new AiError(`AI 回傳不是合法 JSON：${match[0].slice(0, 100)}`, "other");
  }
  const reply = sanitizeReply(String(obj.reply ?? ""), maxChars);
  return {
    relevant: obj.relevant === true && reply.length > 0,
    reason: String(obj.reason ?? ""),
    reply,
  };
}

/** 保險：拿掉連結、hashtag、引號，並截斷長度 */
export function sanitizeReply(text: string, maxChars: number): string {
  let t = text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/#[^\s#]+/g, "")
    .replace(/^["「『]+|["」』]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(t);
  if (chars.length > maxChars) t = chars.slice(0, maxChars).join("");
  return t;
}

export async function generateReply(
  apiKey: string,
  settings: PersonaSettings,
  post: { text: string; author: string },
): Promise<ReplyResult> {
  const raw = await chat(
    apiKey,
    settings.model,
    [
      { role: "system", content: systemPrompt(settings) },
      { role: "user", content: `貼文作者：@${post.author}\n貼文內容：\n${post.text}` },
    ],
    // 推理模型需要多一點 token
    Math.max(400, settings.maxChars * 4),
  );
  return parseResult(raw, settings.maxChars);
}
