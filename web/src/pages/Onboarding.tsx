import { doc, updateDoc } from "firebase/firestore";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ConnectThreadsButton } from "../components/ConnectThreads";
import { ListInput } from "../components/ListInput";
import { NvidiaKeyForm, NvidiaKeyGuide } from "../components/NvidiaKeyForm";
import { db } from "../firebase";
import { useSession } from "../session";

/** 三步驟：綁定 Threads → 填 NVIDIA key → 設定第一組關鍵字 */
export function OnboardingPage() {
  const { user, accounts } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const account = accounts[0];
  const [keywords, setKeywords] = useState<string[]>(account?.keywords ?? []);
  const [busy, setBusy] = useState(false);

  const step1 = accounts.length > 0;
  const step2 = !!user?.nvidiaKeyLast4 && user.aiStatus === "ok";
  const current = !step1 ? 1 : !step2 ? 2 : 3;

  const finish = async (withKeywords: boolean) => {
    if (!user) return;
    setBusy(true);
    if (withKeywords && account && keywords.length) {
      await updateDoc(doc(db, `users/${user.id}/accounts/${account.id}`), { keywords, enabled: true });
    }
    await updateDoc(doc(db, `users/${user.id}`), { onboarded: true });
    navigate(withKeywords ? "/" : "/settings", { replace: true });
  };

  return (
    <div className="login">
      <div className="card" style={{ maxWidth: 480 }}>
        <div className="steps">
          {[1, 2, 3].map((n) => (
            <div key={n} className={n <= current ? "done" : ""} />
          ))}
        </div>

        {params.get("error") && <div className="banner bad">{params.get("error")}</div>}

        {current === 1 && (
          <div className="stack">
            <h1>1. 綁定 Threads 帳號</h1>
            <p className="muted">
              海巡和回覆都會用這個帳號進行。系統只使用 Meta 官方 Threads API，你可以隨時在 Threads 設定中撤銷授權。
            </p>
            <ConnectThreadsButton />
          </div>
        )}

        {current === 2 && (
          <div className="stack">
            <h1>2. 填入 NVIDIA API key</h1>
            {params.get("linked") && <div className="banner ok">已綁定 @{params.get("linked")}</div>}
            <p className="muted">AI 回覆會用你自己的 key 與額度產生，費用與額度跟其他用戶互不影響。</p>
            <NvidiaKeyGuide />
            <NvidiaKeyForm submitLabel="驗證並儲存" />
          </div>
        )}

        {current === 3 && (
          <div className="stack">
            <h1>3. 設定第一組關鍵字</h1>
            <p className="muted">
              系統每 10 分鐘會用這些關鍵字搜尋 @{account?.username} 可以回覆的貼文。之後可以在「海巡設定」調整人設、時段與上限。
            </p>
            <label className="field">
              <span>關鍵字（最多 10 個）</span>
              <ListInput value={keywords} onChange={setKeywords} placeholder="例如：早午餐推薦，按 Enter 新增" max={10} />
            </label>
            <button className="primary full" disabled={busy || !keywords.length} onClick={() => finish(true)}>
              完成，開始海巡
            </button>
            <button className="link" disabled={busy} onClick={() => finish(false)}>
              稍後再設定
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
