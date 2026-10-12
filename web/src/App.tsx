import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout, MorePage } from "./components/Layout";
import { AccountsPage } from "./pages/Accounts";
import { AdminPage } from "./pages/Admin";
import { DraftsPage } from "./pages/Drafts";
import { HistoryPage } from "./pages/History";
import { HomePage } from "./pages/Home";
import { LoginPage } from "./pages/Login";
import { OnboardingPage } from "./pages/Onboarding";
import { ProfilePage } from "./pages/Profile";
import { SettingsPage } from "./pages/Settings";
import { StatsPage } from "./pages/Stats";
import { useSession } from "./session";

export function App() {
  const { authUser, user, ready, isAdmin } = useSession();
  const location = useLocation();

  if (!ready) return <div className="splash">載入中…</div>;
  if (!authUser) return <LoginPage />;
  if (!user) return <div className="splash">建立帳號中…</div>;

  // 新用戶先走引導（OAuth 回來會落在 /accounts，讓引導頁接手）
  if (!user.onboarded && location.pathname !== "/onboarding") {
    return <Navigate to={`/onboarding${location.search}`} replace />;
  }

  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/:accountId" element={<SettingsPage />} />
        <Route path="drafts" element={<DraftsPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="more" element={<MorePage />} />
        {isAdmin && <Route path="admin" element={<AdminPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
