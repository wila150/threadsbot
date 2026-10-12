// 登入狀態 + 目前用戶的 users/{uid}、帳號列表、方案、系統狀態
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, orderBy, query } from "firebase/firestore";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { auth, db } from "./firebase";
import { useDoc, useQuery } from "./hooks";
import { DEFAULT_PLAN, type AccountDoc, type PlanDoc, type UserDoc } from "./types";

interface Session {
  authUser: User | null;
  authLoading: boolean;
  isAdmin: boolean;
  user: (UserDoc & { id: string }) | null;
  accounts: AccountDoc[];
  plan: PlanDoc;
  systemPaused: boolean;
  ready: boolean;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        setAuthUser(u);
        setBootstrapped(false);
        if (u) {
          const token = await u.getIdTokenResult();
          setIsAdmin(token.claims.admin === true);
          try {
            await api.bootstrapUser();
          } catch (err) {
            console.error("bootstrapUser 失敗", err);
          }
          setBootstrapped(true);
        } else {
          setIsAdmin(false);
        }
        setAuthLoading(false);
      }),
    [],
  );

  const uid = authUser && bootstrapped ? authUser.uid : null;
  const { data: user, loading: userLoading } = useDoc<UserDoc>(uid ? `users/${uid}` : null);
  const { data: accounts, loading: accountsLoading } = useQuery<AccountDoc>(
    uid ? query(collection(db, `users/${uid}/accounts`), orderBy("createdAt")) : null,
    `accounts-${uid}`,
  );
  const { data: planDoc } = useDoc<PlanDoc>(user ? `plans/${user.plan}` : null);
  const { data: system } = useDoc<{ paused?: boolean }>(uid ? "system/config" : null);

  const value: Session = {
    authUser,
    authLoading,
    isAdmin,
    user,
    accounts,
    plan: planDoc ? { ...DEFAULT_PLAN, ...planDoc } : DEFAULT_PLAN,
    systemPaused: system?.paused === true,
    ready: !authLoading && (!authUser || (bootstrapped && !userLoading && !accountsLoading)),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession 必須在 SessionProvider 內");
  return s;
}
