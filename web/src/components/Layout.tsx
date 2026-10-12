import { signOut } from "firebase/auth";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { auth } from "../firebase";
import { aiStatusLabel } from "../format";
import { listenForeground } from "../push";
import { useSession } from "../session";

const NAV = [
  { to: "/", label: "首頁", icon: "⌂", end: true },
  { to: "/drafts", label: "草稿", icon: "✎" },
  { to: "/settings", label: "海巡設定", icon: "⚙" },
  { to: "/stats", label: "數據", icon: "▤" },
  { to: "/more", label: "更多", icon: "☰" },
];

const SIDE_EXTRA = [
  { to: "/accounts", label: "帳號管理" },
  { to: "/history", label: "歷史紀錄" },
  { to: "/profile", label: "帳戶設定" },
];

export function Layout() {
  const { user, isAdmin, systemPaused, aiStatus } = useSession();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    listenForeground((title, body) => {
      setToast(`${title}：${body}`);
      setTimeout(() => setToast(null), 5000);
    });
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Threads 海巡</div>
        <nav>
          {NAV.filter((n) => n.to !== "/more").map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              {n.label}
            </NavLink>
          ))}
          {SIDE_EXTRA.map((n) => (
            <NavLink key={n.to} to={n.to}>
              {n.label}
            </NavLink>
          ))}
          {isAdmin && <NavLink to="/admin">管理後台</NavLink>}
        </nav>
        <button className="link" onClick={() => signOut(auth)}>
          登出
        </button>
      </aside>

      <main className="content">
        {systemPaused && <div className="banner bad">系統維護中，海巡暫停。</div>}
        {user?.disabled && <div className="banner bad">你的帳號已被暫停，如有疑問請聯絡管理員。</div>}
        {aiStatus !== "ok" && (
          <div className="banner warn">AI 服務暫時無法使用（{aiStatusLabel[aiStatus]}），恢復後海巡會自動繼續。</div>
        )}
        <Outlet />
      </main>

      <nav className="tabbar">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <span className="tab-icon" aria-hidden>
              {n.icon}
            </span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/** 手機版「更多」頁 */
export function MorePage() {
  const { isAdmin } = useSession();
  return (
    <div className="page">
      <h1>更多</h1>
      <div className="list-links">
        {SIDE_EXTRA.map((n) => (
          <NavLink key={n.to} to={n.to}>
            {n.label}
          </NavLink>
        ))}
        {isAdmin && <NavLink to="/admin">管理後台</NavLink>}
        <button className="link danger" onClick={() => signOut(auth)}>
          登出
        </button>
      </div>
    </div>
  );
}
