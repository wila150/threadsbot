import { collection, documentId, getDocs, query, Timestamp, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ColumnChart } from "../components/ColumnChart";
import { db } from "../firebase";
import { dayKeys, todayKey } from "../format";
import { useSession } from "../session";
import type { DraftDoc, UsageDoc } from "../types";

interface DayRow {
  day: string;
  found: number;
  drafts: number;
  sent: number;
  searches: number;
  aiCalls: number;
  engagement: number;
}

export function StatsPage() {
  const { user, accounts } = useSession();
  const uid = user!.id;
  const [range, setRange] = useState<7 | 30>(7);
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [totals, setTotals] = useState({ likes: 0, replies: 0 });

  const accountIds = (filter === "all" ? accounts : accounts.filter((a) => a.id === filter)).map((a) => a.id);
  const idsKey = accountIds.join(",");

  useEffect(() => {
    let alive = true;
    (async () => {
      const days = dayKeys(range);
      const byDay = new Map<string, DayRow>(
        days.map((d) => [d, { day: d, found: 0, drafts: 0, sent: 0, searches: 0, aiCalls: 0, engagement: 0 }]),
      );

      // 每日用量
      for (const id of accountIds) {
        const snap = await getDocs(
          query(collection(db, `users/${uid}/accounts/${id}/usage`), where(documentId(), ">=", days[0])),
        );
        for (const d of snap.docs) {
          const row = byDay.get(d.id);
          if (!row) continue;
          const u = d.data() as UsageDoc;
          row.found += u.found ?? 0;
          row.drafts += u.drafts ?? 0;
          row.sent += u.sent ?? 0;
          row.searches += u.searches ?? 0;
          row.aiCalls += u.aiCalls ?? 0;
        }
      }

      // 回覆後的互動（依送出日）
      const since = Timestamp.fromMillis(Date.now() - range * 86_400_000);
      const sent = await getDocs(
        query(collection(db, `users/${uid}/drafts`), where("status", "==", "sent"), where("sentAt", ">=", since)),
      );
      let likes = 0;
      let replies = 0;
      for (const d of sent.docs) {
        const draft = d.data() as DraftDoc;
        if (!accountIds.includes(draft.accountId) || !draft.insights || !draft.sentAt) continue;
        likes += draft.insights.likes;
        replies += draft.insights.replies;
        const row = byDay.get(todayKey(draft.sentAt.toDate()));
        if (row) row.engagement += draft.insights.likes + draft.insights.replies;
      }

      if (alive) {
        setRows([...byDay.values()]);
        setTotals({ likes, replies });
      }
    })().catch((err) => console.error(err));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, range, idsKey]);

  const sum = (k: keyof Omit<DayRow, "day">) => rows?.reduce((s, r) => s + r[k], 0) ?? 0;

  return (
    <div className="page">
      <h1>數據</h1>
      <div className="spread" style={{ marginBottom: 16 }}>
        <div className="segmented">
          <button className={range === 7 ? "active" : ""} onClick={() => setRange(7)}>
            近 7 天
          </button>
          <button className={range === 30 ? "active" : ""} onClick={() => setRange(30)}>
            近 30 天
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

      {!rows ? (
        <div className="empty">載入中…</div>
      ) : (
        <>
          <div className="grid-stats">
            <Tile label="巡到貼文" value={sum("found")} />
            <Tile label="送出回覆" value={sum("sent")} />
            <Tile label="獲得讚" value={totals.likes} />
            <Tile label="獲得留言" value={totals.replies} />
          </div>

          <h2>每日巡到篇數</h2>
          <div className="card">
            <ColumnChart data={rows.map((r) => ({ x: r.day, y: r.found }))} unit="篇" label="每日巡到篇數" />
          </div>

          <h2>每日送出回覆</h2>
          <div className="card">
            <ColumnChart data={rows.map((r) => ({ x: r.day, y: r.sent }))} unit="則" label="每日送出回覆數" />
          </div>

          <h2>回覆後的互動（讚＋留言，依送出日）</h2>
          <div className="card">
            <ColumnChart data={rows.map((r) => ({ x: r.day, y: r.engagement }))} unit="次" label="每日回覆獲得的互動數" />
          </div>

          <h2>額度使用量</h2>
          <div className="card">
            <p className="small muted" style={{ margin: 0 }}>
              Threads 搜尋 {sum("searches")} 次 · AI 呼叫 {sum("aiCalls")} 次（約等於消耗的 NVIDIA 點數）· 產生草稿 {sum("drafts")} 則
            </p>
          </div>

          <details style={{ marginTop: 16 }}>
            <summary className="small" style={{ cursor: "pointer" }}>
              表格檢視
            </summary>
            <div className="table-wrap card" style={{ marginTop: 8 }}>
              <table>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>巡到</th>
                    <th>草稿</th>
                    <th>送出</th>
                    <th>互動</th>
                    <th>搜尋</th>
                    <th>AI 呼叫</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows].reverse().map((r) => (
                    <tr key={r.day}>
                      <td>{r.day.slice(5)}</td>
                      <td>{r.found}</td>
                      <td>{r.drafts}</td>
                      <td>{r.sent}</td>
                      <td>{r.engagement}</td>
                      <td>{r.searches}</td>
                      <td>{r.aiCalls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value.toLocaleString()}</div>
    </div>
  );
}
