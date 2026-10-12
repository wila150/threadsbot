import { signOut } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { useState } from "react";
import { api, errMsg } from "../api";
import { auth, db } from "../firebase";
import { enablePush } from "../push";
import { useSession } from "../session";

export function ProfilePage() {
  const { user, plan, accounts } = useSession();
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  if (!user) return null;
  const pushOn = user.pushEnabled && user.fcmTokens.length > 0;

  const togglePush = async () => {
    setPushMsg(null);
    if (pushOn) {
      await updateDoc(doc(db, `users/${user.id}`), { pushEnabled: false });
      return;
    }
    try {
      const res = await enablePush();
      if (res === "unsupported") {
        setPushMsg("這個瀏覽器不支援推播。iPhone 請先用 Safari「加入主畫面」，再從主畫面開啟後設定。");
      } else if (res === "denied") {
        setPushMsg("通知權限被拒絕，請到瀏覽器設定開啟。");
      }
    } catch (err) {
      setPushMsg(errMsg(err));
    }
  };

  const deleteAll = async () => {
    if (!confirm("確定要刪除帳戶？所有 Threads 授權、設定、草稿與紀錄都會永久刪除，無法復原。")) return;
    try {
      await api.deleteMyData();
      await signOut(auth);
    } catch (err) {
      alert(errMsg(err));
    }
  };

  return (
    <div className="page">
      <h1>帳戶設定</h1>

      <div className="card">
        <div className="small muted">登入身分</div>
        <div style={{ fontWeight: 600 }}>{user.email || user.displayName}</div>
      </div>

      <h2>推播通知</h2>
      <div className="card">
        <div className="spread">
          <div>
            <div>新草稿、授權過期、點數用完時通知我</div>
            <div className="small muted">需要先把網站「加入主畫面」才能在手機上收到</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={pushOn} onChange={togglePush} />
          </label>
        </div>
        {pushMsg && <p className="small error" style={{ marginTop: 8 }}>{pushMsg}</p>}
      </div>

      <h2>方案</h2>
      <div className="card">
        <div style={{ fontWeight: 600 }}>{plan.name}</div>
        <ul className="small muted" style={{ margin: "8px 0 0", paddingLeft: 20 }}>
          <li>
            可綁定 {plan.maxAccounts} 個 Threads 帳號（目前 {accounts.length} 個）
          </li>
          <li>每個帳號每日最多 {plan.dailyLimit} 則</li>
          <li>{plan.allowAutoSend ? "可使用自動送出" : "不含自動送出"}</li>
        </ul>
      </div>

      <p className="small muted" style={{ marginTop: 24 }}>
        <a href="/privacy">隱私政策</a> · <a href="/terms">服務條款</a>
      </p>

      <h2>危險區域</h2>
      <div className="card">
        <button className="danger" onClick={deleteAll}>
          刪除帳戶與所有資料
        </button>
      </div>
    </div>
  );
}
