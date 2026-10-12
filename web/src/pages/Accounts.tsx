import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, errMsg } from "../api";
import { ConnectThreadsButton } from "../components/ConnectThreads";
import { accountStatusLabel, fmtTime } from "../format";
import { useSession } from "../session";
import type { AccountDoc } from "../types";

export function AccountsPage() {
  const { accounts, plan } = useSession();
  const [params] = useSearchParams();
  const canAdd = accounts.length < plan.maxAccounts;

  return (
    <div className="page">
      <h1>帳號管理</h1>
      {params.get("linked") && <div className="banner ok">已綁定 @{params.get("linked")}</div>}
      {params.get("error") && <div className="banner bad">{params.get("error")}</div>}

      {accounts.map((a) => (
        <AccountCard key={a.id} account={a} />
      ))}

      <div className="card" style={{ marginTop: 12 }}>
        <div className="spread">
          <div>
            <div style={{ fontWeight: 600 }}>新增 Threads 帳號</div>
            <div className="small muted">
              已綁定 {accounts.length} / {plan.maxAccounts}（{plan.name}方案）
            </div>
          </div>
          {canAdd ? <ConnectThreadsButton label="新增綁定" /> : <span className="pill muted">已達上限</span>}
        </div>
      </div>
    </div>
  );
}

function AccountCard({ account }: { account: AccountDoc }) {
  const status = accountStatusLabel(account);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const daysLeft = Math.ceil((account.tokenExpiresAt.toMillis() - Date.now()) / 86_400_000);

  const unlink = async () => {
    if (!confirm(`確定要解除綁定 @${account.username}？授權 token 會立即刪除，設定與用量紀錄也會一併刪除（已產生的草稿會保留）。`)) return;
    setBusy(true);
    try {
      await api.unlinkAccount({ accountId: account.id });
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="spread">
        <div className="row">
          {account.profilePictureUrl ? <img className="avatar" src={account.profilePictureUrl} alt="" /> : <div className="avatar" />}
          <div>
            <div style={{ fontWeight: 600 }}>@{account.username}</div>
            <div className="small muted">
              授權到期：{fmtTime(account.tokenExpiresAt)}（{daysLeft > 0 ? `剩 ${daysLeft} 天，會自動更新` : "已過期"}）
            </div>
          </div>
        </div>
        <span className={`pill ${status.tone}`}>{status.text}</span>
      </div>
      {account.statusReason && account.status !== "ok" && <p className="small muted" style={{ marginTop: 8 }}>原因：{account.statusReason}</p>}
      <div className="row" style={{ marginTop: 12 }}>
        <Link className="btn" to={`/settings/${account.id}`}>
          海巡設定
        </Link>
        <ConnectThreadsButton label="重新授權" primary={account.status === "reauth"} />
        <button className="danger" disabled={busy} onClick={unlink}>
          解除綁定
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
