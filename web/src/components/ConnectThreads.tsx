import { useState } from "react";
import { api, errMsg } from "../api";

/** 導向 Threads OAuth；回來後會落在 /accounts?linked=... */
export function ConnectThreadsButton({ label = "綁定 Threads 帳號", primary = true }: { label?: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        className={primary ? "primary" : undefined}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { url } = await api.getThreadsAuthUrl();
            window.location.href = url;
          } catch (err) {
            setError(errMsg(err));
            setBusy(false);
          }
        }}
      >
        {busy ? "前往 Threads…" : label}
      </button>
      {error && <p className="error">{error}</p>}
    </>
  );
}
