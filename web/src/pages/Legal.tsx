import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const APP_NAME = "Threads海巡鼠";
const CONTACT = "xiechengfang1@gmail.com";
const UPDATED = "2026 年 10 月 12 日";

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="legal">
      <div className="legal-inner">
        <Link to="/" className="small muted">
          ← 回到 {APP_NAME}
        </Link>
        <h1>{title}</h1>
        <p className="muted small">最後更新：{UPDATED}</p>
        {children}
        <hr />
        <p className="small muted">
          如有任何問題，請來信 <a href={`mailto:${CONTACT}`}>{CONTACT}</a>。
          <br />
          <Link to="/privacy">隱私政策</Link> · <Link to="/terms">服務條款</Link>
        </p>
      </div>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="隱私政策">
      <p>
        {APP_NAME}（以下稱「本服務」）協助用戶依自訂關鍵字找到相關的 Threads 公開貼文，並以 AI 產生回覆草稿，由用戶審核後送出。本政策說明本服務蒐集哪些資料、如何使用與保護，以及你如何刪除資料。
      </p>

      <h2>我們蒐集的資料</h2>
      <ul>
        <li>
          <b>登入資料</b>：你以 Google 或 Email 登入時的 Email 與顯示名稱。
        </li>
        <li>
          <b>Threads 帳號資料</b>：你授權後，我們取得你的 Threads 使用者 ID、使用者名稱、大頭貼網址，以及存取權杖（access token）。
        </li>
        <li>
          <b>海巡設定</b>：你設定的關鍵字、排除詞、人設、語氣、過濾規則等。
        </li>
        <li>
          <b>貼文與回覆</b>：搜尋到的公開貼文內容、作者名稱、連結，AI 產生的回覆草稿，以及你送出的回覆與其讚數、回覆數。
        </li>
        <li>
          <b>使用紀錄</b>：每日搜尋次數、草稿數、送出數等統計。
        </li>
        <li>
          <b>推播權杖</b>：若你開啟推播通知，會儲存瀏覽器的推播權杖。
        </li>
      </ul>

      <h2>我們如何使用資料</h2>
      <ul>
        <li>依你的關鍵字搜尋 Threads 公開貼文，並過濾、去除重複。</li>
        <li>將貼文內容與你的人設設定交給 AI，判斷是否相關並產生回覆草稿。</li>
        <li>在你按下送出（或你自行開啟自動送出）後，以你的 Threads 帳號發出回覆。</li>
        <li>顯示數據統計、傳送狀態通知（例如新草稿待審、授權過期）。</li>
      </ul>
      <p>我們不會出售你的資料，也不會將資料用於廣告。</p>

      <h2>第三方服務</h2>
      <ul>
        <li>
          <b>Meta Threads API</b>：用於帳號授權、搜尋貼文、發出回覆、讀取回覆的互動數據。
        </li>
        <li>
          <b>NVIDIA AI API</b>：產生回覆時，會將貼文內容與你的人設、語氣、判斷標準傳送給 NVIDIA 的 AI 模型。不會傳送你的登入資料或存取權杖。
        </li>
        <li>
          <b>Google Firebase</b>：提供登入、資料庫、後端運算、網站代管與推播服務，資料存放於 Google Cloud（台灣區域）。
        </li>
      </ul>

      <h2>資料保護</h2>
      <ul>
        <li>Threads 存取權杖以 AES-256-GCM 加密後儲存，只有後端伺服器能解密，網頁前端與管理員都無法讀取。</li>
        <li>每位用戶只能存取自己的資料。</li>
        <li>所有傳輸皆使用 HTTPS 加密。</li>
      </ul>

      <h2>資料保存與刪除</h2>
      <ul>
        <li>
          <b>解除綁定</b>：在「帳號管理」解除綁定 Threads 帳號時，會立即刪除該帳號的存取權杖、設定與使用紀錄；已產生的草稿會保留在你的歷史紀錄中。
        </li>
        <li>
          <b>刪除帳戶</b>：在「帳戶設定」選擇刪除帳戶，會永久刪除你的所有資料，包含存取權杖、設定、草稿與紀錄。
        </li>
        <li>
          <b>從 Threads 撤銷授權</b>：你也可以在 Threads 的「設定 → 帳號 → 網站權限」移除本服務。我們收到 Meta 的通知後會刪除你的存取權杖；收到資料刪除要求時，會刪除該 Threads 帳號的所有相關資料。
        </li>
        <li>
          <b>來信要求</b>：寄信至 <a href={`mailto:${CONTACT}`}>{CONTACT}</a>，我們會在 30 天內處理。
        </li>
      </ul>

      <h2>兒童隱私</h2>
      <p>本服務不提供給未滿 13 歲的兒童使用，也不會刻意蒐集兒童的資料。</p>

      <h2>政策變更</h2>
      <p>本政策若有重大變更，會在此頁面更新並標示最後更新日期。</p>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="服務條款">
      <p>使用 {APP_NAME}（以下稱「本服務」）即表示你同意以下條款。</p>

      <h2>服務內容</h2>
      <p>
        本服務依你設定的關鍵字搜尋 Threads 公開貼文，以 AI 產生回覆草稿，並在你同意後以你的 Threads 帳號發出回覆。預設模式為「只產草稿」，所有回覆都需要你審核後才會送出。
      </p>

      <h2>你的責任</h2>
      <ul>
        <li>你必須遵守 Meta 與 Threads 的使用條款及社群守則。</li>
        <li>你對以你的帳號送出的所有回覆內容負責，包含 AI 產生後經你確認送出的內容。</li>
        <li>不得使用本服務發送垃圾訊息、廣告、騷擾、詐騙、不實或違法內容。</li>
        <li>不得試圖規避本服務的頻率限制或安全機制。</li>
      </ul>

      <h2>AI 產生的內容</h2>
      <p>
        AI 產生的回覆可能不正確或不恰當。送出前請自行確認內容。若你開啟自動送出，即表示你了解回覆將在未經人工確認的情況下發出，並自行承擔相關風險。
      </p>

      <h2>帳號安全與限制</h2>
      <p>
        本服務設有每日上限與回覆間隔，以降低帳號被 Threads 限流或停權的風險，但無法保證完全避免。若帳號遭 Threads 限制，本服務會自動暫停該帳號的海巡。
      </p>

      <h2>服務的變更與終止</h2>
      <ul>
        <li>我們可能隨時調整、暫停或終止本服務的部分或全部功能。</li>
        <li>若你違反本條款，我們可能暫停或終止你的使用權限。</li>
        <li>你可以隨時在「帳戶設定」刪除帳戶並停止使用。</li>
      </ul>

      <h2>免責聲明</h2>
      <p>
        本服務依「現況」提供，不保證不中斷或無錯誤。在法律允許的範圍內，對於因使用本服務所生的任何間接或衍生損害，我們不負賠償責任。
      </p>

      <h2>與 Meta 的關係</h2>
      <p>本服務為獨立的第三方應用程式，與 Meta Platforms, Inc. 及 Threads 沒有隸屬或合作關係，亦未獲其背書。</p>

      <h2>條款變更</h2>
      <p>本條款若有變更，會在此頁面更新並標示最後更新日期。變更後繼續使用本服務，即表示你同意修改後的條款。</p>
    </LegalLayout>
  );
}
