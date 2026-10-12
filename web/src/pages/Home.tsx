import { collection, doc, getDoc, query, updateDoc, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errMsg } from "../api";
import { db } from "../firebase";
import { accountStatusLabel, fmtRelative, todayKey } from "../format";
import { useQuery } from "../hooks";
import { useSession } from "../session";
import type { AccountDoc, DraftDoc, UsageDoc } from "../types";

export function HomePage() {
  const { user, accounts, plan } = useSession();
  const uid = user!.id;
  const { data: pending } = useQuery<DraftDoc>(
    query(collection(db, `users/${uid}/drafts`), where("status", "==", "pending")),
    `pending-${uid}`,
  );
  const usage = useTodayUsage(uid, accounts);

  const total = (k: keyof UsageDoc) => Object.values(usage).reduce((s, u) => s + ((u?.[k] as number) ?? 0), 0);
  const limitTotal = accounts.reduce((s, a) => s + Math.min(a.dailyLimit, plan.dailyLimit, a.limitOverride ?? Infinity), 0);
  const allOn = accounts.length > 0 && accounts.every((a) => a.enabled);

  const toggleAll = async () => {
    await Promise.all(accounts.map((a) => updateDoc(doc(db, `users/${uid}/accounts/${a.id}`), { enabled: !allOn })));
  };

  return (
    <div className="page">
      <div className="spread">
        <h1>總覽</h1>
        {accounts.length > 0 && (
          <label className="switch">
            <span className="small">海巡總開關</span>
            <input type="checkbox" checked={allOn} onChange={toggleAll} />
          </label>
        )}
      </div>

      <div className="grid-stats">
        <Stat label="今日巡到" value={total("found")} unit="篇" />
        <Stat label="待審草稿" value={pending.length} unit="則" to="/drafts" />
        <Stat label="今日已送出" value={total("sent")} unit="則" />
        <Stat label="今日額度剩餘" value={Math.max(0, limitTotal - total("drafts"))} unit={`/ ${limitTotal}`} />
      </div>

      <h2>帳號狀態</h2>
      {accounts.length === 0 && (
        <div className="card empty">
          還沒綁定 Threads 帳號。<Link to="/accounts">前往綁定</Link>
        </div>
      )}
      {accounts.map((a) => (
        <AccountRow key={a.id} account={a} usage={usage[a.id]} pendingCount={pending.filter((d) => d.accountId === a.id).length} />
      ))}
    </div>
  );
}

function Stat({ label, value, unit, to }: { label: string; value: number; unit?: string; to?: string }) {
  const body = (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit && <span className="small muted"> {unit}</span>}
      </div>
    </div>
  );
  return to ? (
    <Link to={to} style={{ textDecoration: "none" }}>
      {body}
    </Link>
  ) : (
    body
  );
}

function AccountRow({ account, usage, pendingCount }: { account: AccountDoc; usage?: UsageDoc; pendingCount: number }) {
  const status = accountStatusLabel(account);
  const [msg, setMsg] = useState<string | null>(null);
  const searchCapped = (usage?.searches ?? 0) >= 2000;

  return (
    <div className="card">
      <div className="spread">
        <div className="row">
          {account.profilePictureUrl ? <img className="avatar" src={account.profilePictureUrl} alt="" /> : <div className="avatar" />}
          <div>
            <div style={{ fontWeight: 600 }}>@{account.username}</div>
            <div className="small muted">上次巡邏：{fmtRelative(account.lastPatrolAt)}</div>
          </div>
        </div>
        <span className={`pill ${status.tone}`}>{status.text}</span>
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>
        今日搜尋 {usage?.searches ?? 0} 次 · 草稿 {usage?.drafts ?? 0} · 送出 {usage?.sent ?? 0} · 待審 {pendingCount}
      </div>
      <PatrolSummary account={account} />
      {searchCapped && <div className="banner warn small" style={{ marginTop: 8 }}>今日 Threads 搜尋次數已用完，明天自動恢復。</div>}
      {account.status === "reauth" && (
        <div className="small" style={{ marginTop: 8 }}>
          <Link to="/accounts">重新授權 →</Link>
        </div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <Link className="btn" to={`/settings/${account.id}`}>
          設定
        </Link>
        <button
          disabled={account.status !== "ok" || !account.keywords.length}
          onClick={async () => {
            setMsg(null);
            try {
              await api.runPatrolNow({ accountId: account.id });
              setMsg("已開始巡邏，稍後草稿會出現在草稿頁");
            } catch (err) {
              setMsg(errMsg(err));
            }
          }}
        >
          立即巡一次
        </button>
      </div>
      {msg && <p className="small muted" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  );
}

/** 上次海巡的明細：搜到幾篇、過濾後剩幾篇、AI 判斷、產生幾則草稿 */
function PatrolSummary({ account }: { account: AccountDoc }) {
  const s = account.lastPatrolSummary;
  if (!s) return null;
  return (
    <div className="card" style={{ marginTop: 10, background: "var(--bg-soft)", padding: 12 }}>
      <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>
        上次海巡（{fmtRelative(account.lastPatrolAt)}）
      </div>
      <div className="small">
        搜尋 {s.searches} 次 → Threads 回傳 {s.fetched} 篇 → 新貼文 {s.candidates} 篇 → AI 判斷 {s.aiCalls} 篇（不相關{" "}
        {s.irrelevant}）→ 產生草稿 <b>{s.drafts}</b> 則
      </div>
      {s.searches > 0 && s.fetched === 0 && (
        <p className="small muted" style={{ margin: "6px 0 0" }}>
          所有關鍵字都搜不到貼文。App 通過 Meta 審核（threads_keyword_search）之前，Threads 只會搜尋你自己發的貼文。
        </p>
      )}
      {s.fetched > 0 && s.zeroKeywords.length > 0 && (
        <p className="small muted" style={{ margin: "6px 0 0" }}>沒有結果的關鍵字：{s.zeroKeywords.join("、")}</p>
      )}
      {s.fetched > 0 && s.fetched > s.candidates && <FilteredReasons s={s} />}
    </div>
  );
}

const FILTER_LABELS = {
  own: "自己發的（可在海巡設定開啟測試模式）",
  old: "超過設定的新舊範圍",
  excluded: "含排除詞",
  seen: "之前已處理過",
  cooldown: "同作者冷卻中",
  blocked: "封鎖的作者",
  short: "字數太少",
  notQuestion: "不是問句",
} as const;

function FilteredReasons({ s }: { s: NonNullable<AccountDoc["lastPatrolSummary"]> }) {
  const parts = s.filtered
    ? (Object.keys(FILTER_LABELS) as (keyof typeof FILTER_LABELS)[])
        .filter((k) => (s.filtered![k] ?? 0) > 0)
        .map((k) => `${FILTER_LABELS[k]} ${s.filtered![k]} 篇`)
    : [];
  return (
    <p className="small muted" style={{ margin: "6px 0 0" }}>
      被過濾：{parts.length ? parts.join("、") : "重複或沒有文字內容"}
    </p>
  );
}

/** 各帳號今日用量（每 30 秒刷新一次就夠了） */
function useTodayUsage(uid: string, accounts: AccountDoc[]) {
  const [usage, setUsage] = useState<Record<string, UsageDoc | undefined>>({});
  const ids = accounts.map((a) => a.id).join(",");
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const day = todayKey();
      const entries = await Promise.all(
        accounts.map(async (a) => {
          const snap = await getDoc(doc(db, `users/${uid}/accounts/${a.id}/usage/${day}`));
          return [a.id, snap.exists() ? ({ id: day, ...snap.data() } as UsageDoc) : undefined] as const;
        }),
      );
      if (alive) setUsage(Object.fromEntries(entries));
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, ids]);
  return usage;
}
