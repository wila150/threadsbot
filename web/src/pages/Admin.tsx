import { collection, collectionGroup, query } from "firebase/firestore";
import { useState } from "react";
import { api, errMsg } from "../api";
import { db } from "../firebase";
import { accountStatusLabel, aiStatusLabel, fmtRelative } from "../format";
import { useQuery } from "../hooks";
import { useSession } from "../session";
import type { AccountDoc, PlanDoc, UserDoc } from "../types";

/** 管理後台：看得到狀態，碰不到 token 與 key */
export function AdminPage() {
  const { systemPaused } = useSession();
  const { data: users } = useQuery<UserDoc>(query(collection(db, "users")), "admin-users");
  const { data: accounts } = useQuery<AccountDoc>(query(collectionGroup(db, "accounts")), "admin-accounts");
  const { data: plans } = useQuery<PlanDoc>(query(collection(db, "plans")), "admin-plans");
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const count = (pred: (a: AccountDoc) => boolean) => accounts.filter(pred).length;
  const planIds = plans.length ? plans.map((p) => p.id) : ["free"];

  return (
    <div className="page">
      <h1>管理後台</h1>
      {error && <div className="banner bad">{error}</div>}

      <div className="card">
        <div className="spread">
          <div>
            <div style={{ fontWeight: 600 }}>全系統海巡</div>
            <div className="small muted">{systemPaused ? "已暫停，所有排程都不會派發" : "運作中"}</div>
          </div>
          <button
            className={systemPaused ? "primary" : "danger"}
            onClick={() =>
              (systemPaused || confirm("確定暫停全系統海巡？")) && run(() => api.adminSetSystemPaused({ paused: !systemPaused }))
            }
          >
            {systemPaused ? "恢復運作" : "全系統暫停"}
          </button>
        </div>
      </div>

      <h2>系統狀態</h2>
      <div className="grid-stats">
        <div className="card stat">
          <div className="label">用戶</div>
          <div className="value">{users.length}</div>
        </div>
        <div className="card stat">
          <div className="label">海巡中帳號</div>
          <div className="value">{count((a) => a.enabled && a.status === "ok")}</div>
        </div>
        <div className="card stat">
          <div className="label">需重新授權</div>
          <div className="value">{count((a) => a.status === "reauth")}</div>
        </div>
        <div className="card stat">
          <div className="label">限流／暫停</div>
          <div className="value">{count((a) => a.status === "throttled" || a.status === "suspended")}</div>
        </div>
      </div>

      <h2>用戶</h2>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>用戶</th>
              <th>方案</th>
              <th>AI</th>
              <th>Threads 帳號</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div>{u.email || u.displayName}</div>
                  {u.disabled && <span className="pill bad">已停用</span>}
                </td>
                <td>
                  <select
                    style={{ width: "auto" }}
                    value={u.plan}
                    onChange={(e) => run(() => api.adminUpdateUser({ uid: u.id, plan: e.target.value }))}
                  >
                    {[...new Set([u.plan, ...planIds])].map((p) => (
                      <option key={p} value={p}>
                        {plans.find((x) => x.id === p)?.name ?? p}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="small">{aiStatusLabel[u.aiStatus]}</td>
                <td>
                  {accounts
                    .filter((a) => a.uid === u.id)
                    .map((a) => {
                      const s = accountStatusLabel(a);
                      return (
                        <div key={a.id} className="row small" style={{ marginBottom: 4 }}>
                          <span>@{a.username}</span>
                          <span className={`pill ${s.tone}`}>{s.text}</span>
                          <span className="muted">巡邏 {fmtRelative(a.lastPatrolAt)}</span>
                          <button
                            className="link"
                            onClick={() =>
                              run(() =>
                                api.adminSetAccountSuspended({ uid: u.id, accountId: a.id, suspended: a.status !== "suspended" }),
                              )
                            }
                          >
                            {a.status === "suspended" ? "恢復" : "暫停"}
                          </button>
                        </div>
                      );
                    })}
                </td>
                <td>
                  <button
                    className={u.disabled ? undefined : "danger"}
                    onClick={() => run(() => api.adminUpdateUser({ uid: u.id, disabled: !u.disabled }))}
                  >
                    {u.disabled ? "啟用" : "停用"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
