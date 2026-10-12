import { doc, updateDoc } from "firebase/firestore";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, errMsg } from "../api";
import { ListInput } from "../components/ListInput";
import { db } from "../firebase";
import { useSession } from "../session";
import { MODEL_SUGGESTIONS, type AccountDoc, type AccountSettings } from "../types";

const HOURS = Array.from({ length: 25 }, (_, i) => i);

function pickSettings(a: AccountDoc): AccountSettings {
  return {
    keywords: a.keywords,
    excludeWords: a.excludeWords,
    region: a.region,
    persona: a.persona,
    tone: a.tone,
    model: a.model,
    maxChars: a.maxChars,
    dailyLimit: a.dailyLimit,
    intervalMinutes: a.intervalMinutes,
    activeHours: a.activeHours,
    mode: a.mode,
    enabled: a.enabled,
    includeOwnPosts: a.includeOwnPosts ?? false,
    maxPostAgeHours: a.maxPostAgeHours ?? 48,
    authorCooldownHours: a.authorCooldownHours ?? 24,
    blockedAuthors: a.blockedAuthors ?? [],
    minTextLength: a.minTextLength ?? 0,
    questionsOnly: a.questionsOnly ?? false,
    aiExtraRules: a.aiExtraRules ?? "",
  };
}

export function SettingsPage() {
  const { accounts } = useSession();
  const { accountId } = useParams();
  const navigate = useNavigate();
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];

  if (!account) {
    return (
      <div className="page">
        <h1>海巡設定</h1>
        <div className="card empty">
          還沒綁定 Threads 帳號。<Link to="/accounts">前往綁定</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="spread">
        <h1>海巡設定</h1>
        {accounts.length > 1 && (
          <select style={{ width: "auto" }} value={account.id} onChange={(e) => navigate(`/settings/${e.target.value}`)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                @{a.username}
              </option>
            ))}
          </select>
        )}
      </div>
      <SettingsForm key={account.id} account={account} />
    </div>
  );
}

function SettingsForm({ account }: { account: AccountDoc }) {
  const { user, plan } = useSession();
  const [form, setForm] = useState<AccountSettings>(() => pickSettings(account));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 別處改了（例如首頁總開關）就同步開關狀態
  useEffect(() => setForm((f) => ({ ...f, enabled: account.enabled })), [account.enabled]);

  const set = <K extends keyof AccountSettings>(k: K, v: AccountSettings[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateDoc(doc(db, `users/${user!.id}/accounts/${account.id}`), {
        ...form,
        dailyLimit: Math.min(form.dailyLimit, plan.dailyLimit),
        mode: plan.allowAutoSend ? form.mode : "draft",
      });
      setSaved(true);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const chooseAuto = () => {
    if (
      confirm(
        "自動送出會在沒有人工確認的情況下以你的帳號發出回覆。\n\n回覆品質不佳或頻率太高，可能讓帳號被 Threads 限流或停權。建議先用「只產草稿」模式觀察一週。\n\n確定要開啟自動送出？",
      )
    )
      set("mode", "auto");
  };

  return (
    <form onSubmit={submit}>
      <div className="card">
        <div className="spread">
          <div>
            <div style={{ fontWeight: 600 }}>@{account.username}</div>
            <div className="small muted">{form.enabled ? "海巡開啟中" : "海巡已關閉"}</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          </label>
        </div>
      </div>

      <h2>找什麼貼文</h2>
      <div className="card">
        <label className="field">
          <span>關鍵字</span>
          <ListInput value={form.keywords} onChange={(v) => set("keywords", v)} placeholder="按 Enter 新增" max={10} />
          <small>每個關鍵字每 10 分鐘搜尋一次；越多個越快用完每日搜尋次數。</small>
        </label>
        <label className="field">
          <span>排除詞</span>
          <ListInput value={form.excludeWords} onChange={(v) => set("excludeWords", v)} placeholder="含有這些字的貼文會跳過" max={50} />
        </label>
        <label className="field">
          <span>地區</span>
          <input value={form.region} onChange={(e) => set("region", e.target.value)} placeholder="例如：台灣、台中" />
          <small>Threads 搜尋沒有地區篩選，這個設定會讓 AI 判斷相關性時優先考慮該地區。</small>
        </label>
      </div>

      <h2>過濾規則</h2>
      <div className="card">
        <div className="two-col">
          <label className="field">
            <span>只處理多新的貼文</span>
            <select value={form.maxPostAgeHours} onChange={(e) => set("maxPostAgeHours", Number(e.target.value))}>
              {[
                [6, "6 小時內"],
                [12, "12 小時內"],
                [24, "1 天內"],
                [48, "2 天內"],
                [72, "3 天內"],
                [168, "7 天內"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>同作者冷卻</span>
            <select value={form.authorCooldownHours} onChange={(e) => set("authorCooldownHours", Number(e.target.value))}>
              {[
                [0, "不限制"],
                [6, "6 小時"],
                [12, "12 小時"],
                [24, "1 天"],
                [72, "3 天"],
                [168, "7 天"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <small>同一個人在這段時間內只回一次</small>
          </label>
        </div>
        <label className="field">
          <span>最短字數</span>
          <input
            type="number"
            min={0}
            max={500}
            value={form.minTextLength}
            onChange={(e) => set("minTextLength", Math.max(0, Math.round(Number(e.target.value) || 0)))}
          />
          <small>比這更短的貼文不處理，也能省 AI 點數；0 表示不限制</small>
        </label>
        <label className="field">
          <span>封鎖作者</span>
          <ListInput
            value={form.blockedAuthors ?? []}
            onChange={(v) => set("blockedAuthors", v.map((a) => a.replace(/^@/, "")))}
            placeholder="輸入 Threads 帳號，按 Enter 新增"
            max={200}
          />
          <small>這些帳號的貼文永遠不回</small>
        </label>
        <div className="spread field">
          <div>
            <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>只回問句</div>
            <div className="small muted">只處理有問號或「請問」「推薦」「有沒有」這類求助語氣的貼文</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={!!form.questionsOnly} onChange={(e) => set("questionsOnly", e.target.checked)} />
          </label>
        </div>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>AI 判斷標準（補充）</span>
          <textarea
            value={form.aiExtraRules}
            onChange={(e) => set("aiExtraRules", e.target.value)}
            placeholder="例如：不回抱怨文、不回已經有很多人回覆的問題、只回想買東西的人"
            maxLength={500}
          />
          <small>寫給 AI 看的規則，判斷要不要回時會參考；可以用「試產一則」測試效果</small>
        </label>
      </div>

      <h2>怎麼回</h2>
      <div className="card">
        <label className="field">
          <span>人設</span>
          <textarea
            value={form.persona}
            onChange={(e) => set("persona", e.target.value)}
            placeholder="例如：住台中十年、很愛吃早午餐的上班族，常跟朋友分享私房店家"
            maxLength={500}
          />
        </label>
        <label className="field">
          <span>語氣</span>
          <input value={form.tone} onChange={(e) => set("tone", e.target.value)} placeholder="例如：輕鬆、口語、偶爾用表情符號" />
        </label>
        <div className="two-col">
          <label className="field">
            <span>模型</span>
            <input list="models" value={form.model} onChange={(e) => set("model", e.target.value)} />
            <datalist id="models">
              {MODEL_SUGGESTIONS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>字數上限</span>
            <input type="number" min={10} max={300} value={form.maxChars} onChange={(e) => set("maxChars", Number(e.target.value))} />
          </label>
        </div>
        <TestGenerate settings={form} />
      </div>

      <h2>頻率與安全</h2>
      <div className="card">
        <div className="two-col">
          <label className="field">
            <span>每日上限</span>
            <input
              type="number"
              min={1}
              max={plan.dailyLimit}
              value={form.dailyLimit}
              onChange={(e) => set("dailyLimit", Number(e.target.value))}
            />
            <small>
              方案上限 {plan.dailyLimit}
              {account.limitOverride != null && `；因限流暫時降為 ${account.limitOverride}`}
            </small>
          </label>
          <label className="field">
            <span>回覆間隔（分鐘）</span>
            <input type="number" min={3} max={240} value={form.intervalMinutes} onChange={(e) => set("intervalMinutes", Number(e.target.value))} />
            <small>實際會再加上隨機延遲</small>
          </label>
        </div>
        <label className="field">
          <span>巡邏時段（台灣時間）</span>
          <div className="row">
            <select style={{ width: "auto" }} value={form.activeHours.start} onChange={(e) => set("activeHours", { ...form.activeHours, start: Number(e.target.value) })}>
              {HOURS.slice(0, 24).map((h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </select>
            <span>～</span>
            <select style={{ width: "auto" }} value={form.activeHours.end} onChange={(e) => set("activeHours", { ...form.activeHours, end: Number(e.target.value) })}>
              {HOURS.slice(1).map((h) => (
                <option key={h} value={h % 24}>
                  {h}:00
                </option>
              ))}
            </select>
          </div>
        </label>
        <div className="field">
          <span style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 4 }}>模式</span>
          <div className="segmented">
            <button type="button" className={form.mode === "draft" ? "active" : ""} onClick={() => set("mode", "draft")}>
              只產草稿
            </button>
            <button
              type="button"
              className={form.mode === "auto" ? "active" : ""}
              disabled={!plan.allowAutoSend}
              onClick={chooseAuto}
            >
              自動送出
            </button>
          </div>
          <small className="muted" style={{ display: "block", marginTop: 4 }}>
            {plan.allowAutoSend ? "自動送出會依間隔與隨機延遲逐則發出。" : "目前方案不開放自動送出。"}
          </small>
        </div>
      </div>

      <h2>測試</h2>
      <div className="card">
        <div className="spread">
          <div>
            <div style={{ fontWeight: 600 }}>測試模式：包含自己的貼文</div>
            <div className="small muted">
              App 通過 Meta 審核前，Threads 只搜得到你自己發的貼文。開啟後海巡會處理自己的貼文、不限制貼文新舊、不套用同作者冷卻，方便測試完整流程。正式使用請關閉。
            </div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={!!form.includeOwnPosts} onChange={(e) => set("includeOwnPosts", e.target.checked)} />
          </label>
        </div>
      </div>

      <div style={{ position: "sticky", bottom: "calc(var(--tabbar-h) + 12px)", marginTop: 16 }}>
        {error && <p className="error">{error}</p>}
        <button className="primary full" disabled={saving}>
          {saving ? "儲存中…" : saved ? "已儲存 ✓" : "儲存設定"}
        </button>
      </div>
    </form>
  );
}

/** 試產一則：用尚未儲存的設定預覽 AI 語氣 */
function TestGenerate({ settings }: { settings: AccountSettings }) {
  const [postText, setPostText] = useState("");
  const [result, setResult] = useState<{ postText: string; relevant: boolean; reason: string; reply: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.testGenerate({ settings, postText }));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>試產一則，預覽 AI 語氣</summary>
      <div style={{ marginTop: 12 }}>
        <label className="field">
          <span>範例貼文（留空會用預設範例）</span>
          <textarea value={postText} onChange={(e) => setPostText(e.target.value)} maxLength={1000} />
        </label>
        <button type="button" disabled={busy} onClick={run}>
          {busy ? "產生中…" : "試產一則"}
        </button>
        {error && <p className="error">{error}</p>}
        {result && (
          <div className="draft" style={{ marginTop: 12 }}>
            <div className="post">{result.postText}</div>
            <div className="reply">
              {result.relevant ? (
                <div className="reply-text">{result.reply}</div>
              ) : (
                <div className="muted">AI 判斷不回覆：{result.reason}</div>
              )}
              {result.relevant && <div className="small muted">判斷理由：{result.reason}</div>}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
