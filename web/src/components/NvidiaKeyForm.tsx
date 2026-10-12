import { useState, type FormEvent } from "react";
import { api, errMsg } from "../api";

export function NvidiaKeyForm({ onSaved, submitLabel = "儲存" }: { onSaved?: () => void; submitLabel?: string }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.saveNvidiaKey({ key });
      setKey("");
      onSaved?.();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <label className="field">
        <span>NVIDIA API key</span>
        <input
          type="password"
          autoComplete="off"
          placeholder="nvapi-…"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          required
        />
        <small>key 會加密保存，之後畫面上只會顯示末 4 碼。</small>
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy || !key.trim()}>
        {busy ? "驗證中…" : submitLabel}
      </button>
    </form>
  );
}

export function NvidiaKeyGuide() {
  return (
    <details className="small">
      <summary>怎麼申請 NVIDIA API key？</summary>
      <ol>
        <li>
          到{" "}
          <a href="https://build.nvidia.com" target="_blank" rel="noreferrer">
            build.nvidia.com
          </a>{" "}
          註冊或登入（免費）。
        </li>
        <li>任選一個模型頁面（例如 Llama 3.3 70B），按右上角「Get API Key」。</li>
        <li>按「Generate Key」，複製以 nvapi- 開頭的字串，貼到這裡。</li>
        <li>新帳號有 1,000 點免費額度，可在 NVIDIA 後台申請增加到 5,000 點。</li>
      </ol>
    </details>
  );
}
