import { collection, doc, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { useState } from "react";
import { api, errMsg } from "../api";
import { db } from "../firebase";
import { draftStatusLabel, fmtRelative, fmtTime } from "../format";
import { useQuery } from "../hooks";
import { useSession } from "../session";
import type { DraftDoc } from "../types";

export function DraftsPage() {
  const { user, accounts } = useSession();
  const uid = user!.id;
  const [filter, setFilter] = useState<string>("all");
  const { data, loading } = useQuery<DraftDoc>(
    query(
      collection(db, `users/${uid}/drafts`),
      where("status", "in", ["pending", "queued", "sending", "failed"]),
      orderBy("createdAt", "desc"),
    ),
    `drafts-${uid}`,
  );
  const drafts = filter === "all" ? data : data.filter((d) => d.accountId === filter);

  return (
    <div className="page">
      <div className="spread">
        <h1>草稿審核</h1>
        {accounts.length > 1 && (
          <select style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">全部帳號</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                @{a.username}
              </option>
            ))}
          </select>
        )}
      </div>
      {loading && <div className="empty">載入中…</div>}
      {!loading && drafts.length === 0 && <div className="card empty">目前沒有待審草稿 🎉</div>}
      {drafts.map((d) => (
        <DraftCard
          key={d.id}
          uid={uid}
          draft={d}
          showAccount={accounts.length > 1}
          testMode={accounts.find((a) => a.id === d.accountId)?.includeOwnPosts === true}
        />
      ))}
    </div>
  );
}

function DraftCard({
  uid,
  draft,
  showAccount,
  testMode,
}: {
  uid: string;
  draft: DraftDoc;
  showAccount: boolean;
  testMode: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft.replyText);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = doc(db, `users/${uid}/drafts/${draft.id}`);
  const actionable = draft.status === "pending" || draft.status === "failed";

  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      setMsg(errMsg(err));
    } finally {
      setBusy(null);
    }
  };

  const saveEdit = () =>
    act("save", async () => {
      await updateDoc(ref, { replyText: text.trim(), editedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setEditing(false);
    });

  const send = () =>
    act("send", async () => {
      if (editing && text.trim() !== draft.replyText) {
        await updateDoc(ref, { replyText: text.trim(), editedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        setEditing(false);
      }
      const res = await api.sendDraft({ draftId: draft.id });
      if (!res.immediate) setMsg(`為了避免連發，已排入佇列，預計 ${fmtTime(new Date(res.sendAt))} 送出`);
      else if (res.status === "failed") setMsg(`送出失敗：${res.failReason}`);
    });

  const skip = () => act("skip", () => updateDoc(ref, { status: "skipped", skippedAt: serverTimestamp(), updatedAt: serverTimestamp() }));

  const regenerate = () =>
    act("regen", async () => {
      const res = await api.regenerateDraft({ draftId: draft.id });
      setText(res.replyText);
      setEditing(false);
    });

  return (
    <div className="card draft">
      <div className="post-meta spread">
        <span>
          {showAccount && <>@{draft.accountUsername} · </>}
          命中「{draft.keyword}」 · {fmtRelative(draft.createdAt)}
        </span>
        {draft.status !== "pending" && (
          <span className={`pill ${draft.status === "failed" ? "bad" : "warn"}`}>{draftStatusLabel[draft.status]}</span>
        )}
      </div>
      <div className="post">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>@{draft.postAuthor}</div>
        {draft.postText}
        {draft.postPermalink && (
          <div style={{ marginTop: 6 }}>
            <a className="small muted" href={draft.postPermalink} target="_blank" rel="noreferrer">
              在 Threads 開啟 ↗
            </a>
          </div>
        )}
      </div>

      <div className="reply">
        <div className="small muted">AI 回覆</div>
        {editing ? (
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} autoFocus />
        ) : (
          <div className="reply-text">{draft.replyText}</div>
        )}
        {draft.failReason && <p className="error small">{draft.failReason}</p>}
        {draft.status === "queued" && draft.scheduledAt && (
          <p className="small muted">預計 {fmtTime(draft.scheduledAt)} 送出</p>
        )}
      </div>

      {actionable && (
        <div className="actions">
          <button className="primary" disabled={!!busy || !text.trim()} onClick={send}>
            {busy === "send" ? "送出中…" : draft.status === "failed" ? "重送" : "送出"}
          </button>
          {editing ? (
            <button disabled={!!busy} onClick={saveEdit}>
              儲存
            </button>
          ) : (
            <button disabled={!!busy} onClick={() => setEditing(true)}>
              編輯
            </button>
          )}
          <button disabled={!!busy} onClick={regenerate}>
            {busy === "regen" ? "生成中…" : "重新生成"}
          </button>
          <button disabled={!!busy} onClick={skip}>
            略過
          </button>
        </div>
      )}
      {draft.status === "queued" && testMode && (
        <div className="actions">
          <button className="primary" disabled={!!busy} onClick={send}>
            {busy === "send" ? "送出中…" : "立即送出（測試模式）"}
          </button>
        </div>
      )}
      {msg && <p className="small muted" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  );
}
