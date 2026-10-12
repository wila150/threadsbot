import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { auth } from "../firebase";

const ERRORS: Record<string, string> = {
  "auth/invalid-credential": "Email 或密碼錯誤",
  "auth/email-already-in-use": "這個 Email 已經註冊過了",
  "auth/weak-password": "密碼至少 6 個字元",
  "auth/invalid-email": "Email 格式不正確",
  "auth/popup-closed-by-user": "登入視窗已關閉",
};

export function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err: any) {
      setError(ERRORS[err?.code] ?? err?.message ?? "登入失敗");
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(() =>
      mode === "login"
        ? signInWithEmailAndPassword(auth, email, password)
        : createUserWithEmailAndPassword(auth, email, password),
    );
  };

  return (
    <div className="login">
      <div className="card">
        <h1>Threads海巡鼠</h1>
        <p className="muted">依關鍵字找到相關貼文，AI 幫你寫好回覆草稿。</p>

        <button className="full" disabled={busy} onClick={() => run(() => signInWithPopup(auth, new GoogleAuthProvider()))}>
          使用 Google 登入
        </button>

        <div className="divider">或使用 Email</div>

        <form onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>密碼</span>
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="error">{error}</p>}
          {info && <p className="muted small">{info}</p>}
          <button className="primary full" disabled={busy}>
            {mode === "login" ? "登入" : "註冊"}
          </button>
        </form>

        <div className="spread small" style={{ marginTop: 16 }}>
          <button className="link" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "還沒有帳號？註冊" : "已有帳號？登入"}
          </button>
          {mode === "login" && (
            <button
              className="link"
              onClick={() =>
                email
                  ? run(async () => {
                      await sendPasswordResetEmail(auth, email);
                      setInfo("已寄出重設密碼信");
                    })
                  : setError("請先輸入 Email")
              }
            >
              忘記密碼
            </button>
          )}
        </div>
        <p className="small muted" style={{ marginTop: 16, textAlign: "center" }}>
          登入即表示你同意<Link to="/terms">服務條款</Link>與<Link to="/privacy">隱私政策</Link>
        </p>
      </div>
    </div>
  );
}
