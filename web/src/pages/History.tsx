import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { useState } from "react";
import { api, errMsg } from "../api";
import { db } from "../firebase";
import { draftStatusLabel, fmtTime } from "../format";
import { useQuery } from "../hooks";
import { useSession } from "../session";
import type { DraftDoc } from "../types";

export function HistoryPage() {
  const { user, accounts } = useSession();
  const uid = user!.id;
  const [tab, setTab] = useState<"sent" | "skipped">("sent");
  const [filter, setFilter] = useState("all");
  const [max, setMax] = useState(50);
  const { data, loading } = useQuery<DraftDoc>(
    query(collection(db, `users/${uid}/drafts`), where("status", "==", tab), orderBy("updatedAt", "desc"), limit(max)),
    `history-${uid}-${tab}-${max}`,
  );
  const rows = filter === "all" ? data : data.filter((d) => d.accountId === filter);

  return (
    <div className="page">
      <h1>歷史紀錄</h1>
      <div className="spread" style={{ marginBottom: 12 }}>
        <div className="segmented">
          <button className={tab === "sent" ? "active" : ""} onClick={() => setTab("sent")}>
            已送出
          </button>
          <button className={tab === "skipped" ? "active" : ""} onClick={() => setTab("skipped")}>
            已略過
          </button>
        </div>
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
      {!loading && rows.length === 0 && <div className="card empty">還沒有{draftStatusLabel[tab]}的回覆</div>}
      {rows.map((d) => (
        <div key={d.id} className="card draft">
          <div className="post-meta spread">
            <span>
              @{d.accountUsername} → @{d.postAuthor}
            </span>
            <span>{fmtTime(d.sentAt ?? d.updatedAt)}</span>
          </div>
          <div className="post small">{d.postText}</div>
          <div className="reply">
            <div className="reply-text" style={d.deletedAt ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>
              {d.replyText}
            </div>
            {d.deletedAt && <span className="pill muted">已從 Threads 刪除</span>}
            {d.failReason && <div className="small muted">{d.failReason}</div>}
          </div>
          <div className="row small muted" style={{ marginTop: 8 }}>
            {d.insights && (
              <span>
                ♥ {d.insights.likes} · 💬 {d.insights.replies}
              </span>
            )}
            {d.postPermalink && (
              <a href={d.postPermalink} target="_blank" rel="noreferrer">
                原貼文 ↗
              </a>
            )}
            {tab === "sent" && !d.deletedAt && <DeleteReplyButton draftId={d.id} />}
          </div>
        </div>
      ))}
      {data.length >= max && (
        <button className="full" style={{ marginTop: 12 }} onClick={() => setMax(max + 50)}>
          載入更多
        </button>
      )}
    </div>
  );
}

/** 從 Threads 刪除已送出的回覆 */
function DeleteReplyButton({ draftId }: { draftId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        className="link danger"
        disabled={busy}
        onClick={async () => {
          if (!confirm("確定要從 Threads 刪除這則回覆？刪除後無法復原。")) return;
          setBusy(true);
          setError(null);
          try {
            await api.deleteReply({ draftId });
          } catch (err) {
            setError(errMsg(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "刪除中…" : "從 Threads 刪除"}
      </button>
      {error && <span className="error">{error}</span>}
    </>
  );
}
