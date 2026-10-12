import { doc, onSnapshot, type DocumentReference, type Query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "./firebase";

/** 即時訂閱單一文件；path 為 null 時不訂閱 */
export function useDoc<T>(path: string | null): { data: (T & { id: string }) | null; loading: boolean } {
  const [state, setState] = useState<{ data: (T & { id: string }) | null; loading: boolean }>({
    data: null,
    loading: !!path,
  });
  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false });
      return;
    }
    const ref = doc(db, path) as DocumentReference<T>;
    return onSnapshot(
      ref,
      (snap) => setState({ data: snap.exists() ? { ...(snap.data() as T), id: snap.id } : null, loading: false }),
      () => setState({ data: null, loading: false }),
    );
  }, [path]);
  return state;
}

/** 即時訂閱查詢；key 改變時重新訂閱（query 物件每次 render 都不同，所以用 key） */
export function useQuery<T>(q: Query | null, key: string): { data: (T & { id: string })[]; loading: boolean } {
  const [state, setState] = useState<{ data: (T & { id: string })[]; loading: boolean }>({ data: [], loading: true });
  useEffect(() => {
    if (!q) {
      setState({ data: [], loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ ...(d.data() as T), id: d.id })), loading: false }),
      (err) => {
        console.error(err);
        setState({ data: [], loading: false });
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
