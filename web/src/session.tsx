// 登入狀態 + 目前用戶的 users/{uid}、帳號列表、方案、系統狀態
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, orderBy, query } from "firebase/firestore";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, errMsg } from "./api";
import { auth, db } from "./firebase";
import { useDoc, useQuery } from "./hooks";
import { DEFAULT_PLAN, type AccountDoc, type AiStatus, type PlanDoc, type UserDoc } from "./types";

interface Session {
  authUser: User | null;
  authLoading: boolean;
  isAdmin: boolean;
  user: (UserDoc & { id: string }) | null;
  accounts: AccountDoc[];
  plan: PlanDoc;
  systemPaused: boolean;
  /** 全系統共用 AI key 的狀態 */
  aiStatus: AiStatus;
  ready: boolean;
  /** 建立帳號失敗時的錯誤訊息 */
  bootstrapError: string | null;
  retryBootstrap: () => void;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        setAuthUser(u);
        setBootstrapped(false);
        if (u) {
          const token = await u.getIdTokenResult();
          setIsAdmin(token.claims.admin === true);
        } else {
          setIsAdmin(false);
        }
        setAuthLoading(false);
      }),
    [],
  );

  // 登入後請後端建立 users/{uid}；失敗時顯示錯誤讓用戶重試
  useEffect(() => {
    if (!authUser) return;
    let alive = true;
    setBootstrapError(null);
    api
      .bootstrapUser()
      .then(() => alive && setBootstrapped(true))
      .catch((err) => {
        console.error("bootstrapUser 失敗", err);
        if (alive) setBootstrapError(errMsg(err));
      });
    return () => {
      alive = false;
    };
  }, [authUser, attempt]);

  const uid = authUser && bootstrapped ? authUser.uid : null;
  const { data: user, loading: userLoading } = useDoc<UserDoc>(uid ? `users/${uid}` : null);
  const { data: accounts, loading: accountsLoading } = useQuery<AccountDoc>(
    uid ? query(collection(db, `users/${uid}/accounts`), orderBy("createdAt")) : null,
    `accounts-${uid}`,
  );
  const { data: planDoc } = useDoc<PlanDoc>(user ? `plans/${user.plan}` : null);
  const { data: system } = useDoc<{ paused?: boolean; aiStatus?: AiStatus }>(uid ? "system/config" : null);

  const value: Session = {
    authUser,
    authLoading,
    isAdmin,
    user,
    accounts,
    plan: planDoc ? { ...DEFAULT_PLAN, ...planDoc } : DEFAULT_PLAN,
    systemPaused: system?.paused === true,
    aiStatus: system?.aiStatus ?? "ok",
    ready: !authLoading && (!authUser || !!bootstrapError || (bootstrapped && !userLoading && !accountsLoading)),
    bootstrapError,
    retryBootstrap: () => setAttempt((n) => n + 1),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession 必須在 SessionProvider 內");
  return s;
}
