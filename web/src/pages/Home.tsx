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
