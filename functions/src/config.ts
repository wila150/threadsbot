import { defineSecret, defineString } from "firebase-functions/params";

export const REGION = "asia-east1";
export const TIMEZONE = "Asia/Taipei";

/** 32 bytes base64，用來加密 Threads token 與 NVIDIA key。`npm run gen-key` 產生。 */
export const ENCRYPTION_KEY = defineSecret("ENCRYPTION_KEY");
export const THREADS_APP_SECRET = defineSecret("THREADS_APP_SECRET");
/** 全系統共用的 NVIDIA API key */
export const NVIDIA_API_KEY = defineSecret("NVIDIA_API_KEY");
export const THREADS_APP_ID = defineString("THREADS_APP_ID");
/** 網站網址，例如 https://your-project.web.app（OAuth redirect 與推播連結用） */
export const APP_URL = defineString("APP_URL");
/** OpenAI 相容的 AI 端點；之後換供應商只要改這裡 */
export const AI_BASE_URL = defineString("AI_BASE_URL", {
  default: "https://integrate.api.nvidia.com/v1",
});

export const DEFAULT_MODEL = "z-ai/glm-5.3-flash";

/** Threads 關鍵字搜尋每個用戶 24 小時約 2,200 次，留一點緩衝 */
export const THREADS_SEARCH_DAILY_CAP = 2000;
/** 每輪每個帳號最多產幾則草稿，避免一次爆量 */
export const MAX_DRAFTS_PER_RUN = 3;
/** 每輪每個帳號最多呼叫 AI 幾次（含判斷為不相關的），保護共用點數 */
export const MAX_AI_CALLS_PER_RUN = 6;
/** 共用 key 出問題（點數用完／無效）後，多久再自動試一次 */
export const AI_RETRY_AFTER_MINUTES = 60;
/** 同一位作者多久內不重複回 */
export const AUTHOR_COOLDOWN_HOURS = 24;
/** 只處理這麼新的貼文 */
export const MAX_POST_AGE_HOURS = 48;
/** 被限流時暫停多久 */
export const THROTTLE_PAUSE_HOURS = 24;

export const ALL_SECRETS = [ENCRYPTION_KEY, THREADS_APP_SECRET, NVIDIA_API_KEY];

export const THREADS_SCOPES = [
  "threads_basic",
  "threads_content_publish",
  "threads_keyword_search",
  "threads_manage_replies",
  "threads_read_replies",
  "threads_manage_insights",
];
