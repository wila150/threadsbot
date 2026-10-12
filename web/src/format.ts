import type { Timestamp } from "firebase/firestore";
import type { AccountDoc, AiStatus, DraftStatus } from "./types";

const TZ = "Asia/Taipei";

export function todayKey(d = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d);
}

export function dayKeys(days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(todayKey(new Date(Date.now() - i * 86_400_000)));
  return out;
}

export function fmtTime(ts: Timestamp | Date | null | undefined): string {
  if (!ts) return "—";
  const d = ts instanceof Date ? ts : ts.toDate();
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TZ,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function fmtRelative(ts: Timestamp | null | undefined): string {
  if (!ts) return "尚未";
  const diff = (Date.now() - ts.toMillis()) / 1000;
  if (diff < 60) return "剛剛";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

export function accountStatusLabel(a: AccountDoc): { text: string; tone: "ok" | "warn" | "bad" | "muted" } {
  if (a.status === "reauth") return { text: "需重新授權", tone: "bad" };
  if (a.status === "suspended") return { text: "已被暫停", tone: "bad" };
  if (a.status === "throttled") return { text: `限流中，${fmtTime(a.pausedUntil)} 恢復`, tone: "warn" };
  if (!a.enabled) return { text: "海巡關閉", tone: "muted" };
  if (!a.keywords.length) return { text: "尚未設定關鍵字", tone: "warn" };
  return { text: "海巡中", tone: "ok" };
}

export const aiStatusLabel: Record<AiStatus, string> = {
  ok: "正常",
  no_key: "尚未填入 NVIDIA key",
  no_credits: "AI 點數用完，生成已暫停",
  invalid_key: "NVIDIA key 無效，生成已暫停",
};

export const draftStatusLabel: Record<DraftStatus, string> = {
  pending: "待審",
  queued: "排隊送出中",
  sending: "送出中",
  sent: "已送出",
  skipped: "已略過",
  failed: "失敗",
};
