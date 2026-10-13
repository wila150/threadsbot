# Threads海巡鼠

多用戶的 Threads海巡鼠 webapp（PWA）。每個用戶綁定自己的 Threads 帳號，系統依各自的關鍵字自動搜尋貼文，再用 AI（全系統共用一組 NVIDIA API key）產生回覆草稿，用戶審核後送出。

架構文件：[Threads海巡鼠 — 系統架構](https://claude.ai/code/artifact/02ad0977-d21c-4160-9d89-056a530c74a2)

## 專案結構

```
firebase.json            Hosting / Functions / Firestore 設定
firestore.rules          Security Rules（用戶只能讀寫自己的資料；secrets 前端完全讀不到）
firestore.indexes.json   查詢索引
functions/src/
  index.ts               所有 Cloud Functions 進入點
  patrol.ts              海巡引擎：排程派發 → 搜尋 → 過濾去重 → AI → 草稿／自動送出
  send.ts                送出回覆（最短間隔＋隨機延遲、每日上限、搶鎖防重送）
  threads.ts             Meta Threads 官方 API（OAuth、關鍵字搜尋、回覆、insights）
  ai.ts                  NVIDIA Build API（OpenAI 相容格式；相關性判斷＋產生回覆一次完成；共用 key）
  accounts.ts            註冊、Threads 綁定／解除
  drafts.ts              送出、重新生成、試產一則
  status.ts              錯誤 → 帳號狀態 + 通知（token 失效、限流）；共用 AI key 狀態（402、key 無效）記在 system/config
  maintenance.ts         token 自動更新、互動數據、清理
  admin.ts               管理員操作
  crypto.ts              AES-256-GCM 加密 token 與 key
web/src/
  pages/                 10 個頁面：登入、新手引導、首頁、帳號管理、海巡設定、草稿審核、歷史、數據、帳戶設定、管理後台
scripts/
  set-admin.mjs          設定管理員
  seed-plans.mjs         建立方案資料
```

## 後端排程

| Function | 頻率 | 做什麼 |
|---|---|---|
| `patrolScheduler` | 每 10 分鐘 | 派發「已開啟、在巡邏時段、沒被暫停」的帳號到 Cloud Tasks |
| `patrolAccountTask` | Cloud Tasks | 單一帳號的一輪海巡；出錯只影響這個帳號 |
| `sendReplyTask` | Cloud Tasks | 依排定時間送出回覆 |
| `refreshTokens` | 每天 04:00 | 10 天內到期的 Threads token 自動更新 |
| `collectInsights` | 每 6 小時 | 抓最近 7 天回覆的讚數與留言數 |
| `cleanup` | 每小時 | 清除過期 OAuth state、卡住的送出 |

## 第一次部署

### 1. Firebase 專案

1. 到 [Firebase console](https://console.firebase.google.com) 建立專案，升級為 **Blaze**（Cloud Functions、Cloud Tasks 需要）。
2. 啟用 **Authentication** → 登入方式：Google、電子郵件/密碼。
3. 建立 **Firestore**（建議位置 `asia-east1`）。
4. 新增一個 **網頁應用程式**，把設定填進 `web/.env.local`（參考 `web/.env.example`）。
5. **Cloud Messaging** → 網路推播憑證 → 產生金鑰組，填入 `VITE_FIREBASE_VAPID_KEY`。

```bash
npm install
npx firebase login
npx firebase use --add          # 選你的專案
```

### 2. Meta Threads App

1. 到 [Meta for Developers](https://developers.facebook.com/apps) 建立 App，使用案例選「Access the Threads API」。
2. 權限加上：`threads_basic`、`threads_content_publish`、`threads_keyword_search`、`threads_manage_replies`、`threads_manage_insights`、`threads_delete`。
3. **Redirect callback URL** 填：`https://<你的網域>/api/threads/callback`
4. 開發階段：在「App roles → Roles」把要測試的 Threads 帳號加為 **Threads Tester**，並在該帳號的 Threads 設定 → 帳號 → 網站權限 接受邀請。
5. 記下 Threads App ID 與 App Secret。

> 對外開放前需要通過 Meta App Review（第三階段）。

### 3. 設定參數與密鑰

```bash
# 加密金鑰（32 bytes），產生後妥善保存，遺失會無法解密已存的 token
npm run gen-key
npx firebase functions:secrets:set ENCRYPTION_KEY
npx firebase functions:secrets:set THREADS_APP_SECRET
# 全系統共用的 NVIDIA API key（build.nvidia.com → Get API Key）
npx firebase functions:secrets:set NVIDIA_API_KEY
```

更換 NVIDIA key：重新執行 `secrets:set NVIDIA_API_KEY` 後再 `npm run deploy`。

建立 `functions/.env`：

```
THREADS_APP_ID=你的 Threads App ID
APP_URL=https://你的專案.web.app
```

### 4. 部署

```bash
npm run deploy
```

部署後：

```bash
# 讓 Functions 的服務帳號可以排入 Cloud Tasks（第一次需要）
gcloud projects add-iam-policy-binding threadsbot-a7a63 \
  --member="serviceAccount:86370739761-compute@developer.gserviceaccount.com" \
  --role="roles/cloudtasks.enqueuer"

# 建立方案與系統設定（需要服務帳號金鑰）
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/seed-plans.mjs

# 把自己設成管理員（登出再登入生效）
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/set-admin.mjs you@example.com
```

## 本機開發

```bash
npm run dev                     # 前端，連正式 Firebase
```

要連 emulator：`web/.env.local` 設 `VITE_USE_EMULATORS=true`，另開一個終端機跑 `npm run emulators`（需要安裝 Java）。注意 Threads OAuth 需要公開網址，本機測綁定可以用 ngrok 之類的工具，並把 `APP_URL` 與 Meta 後台的 redirect URL 一起改掉。

## 安全與防濫用（實作對照）

- Threads token 以 AES-256-GCM 加密存在 `secrets/{uid}`，Security Rules 全面禁止前端讀寫。共用的 NVIDIA key 放在 Secret Manager，只有後端讀得到。
- 送出一律走後端 `sendDraft`；前端只能編輯或略過草稿。
- 每帳號每日上限（取帳號設定、方案、限流後降低值三者最小）＋最短回覆間隔＋ 0～50% 隨機延遲；手動送出若未過間隔也會排隊。
- 同一帳號不重複回同一篇（`seen`），同一作者 24 小時內只回一次（`authors`），每輪最多產 3 則草稿、最多呼叫 AI 6 次。
- 共用 AI key：點數用完（402）或 key 無效時全系統暫停 AI，每小時自動重試一次；同時最多 4 個帳號在跑海巡，避免超過每分鐘 40 次的限制。
- AI 一次呼叫同時判斷相關性與產生回覆；不相關就不產草稿；回覆會再過濾掉連結與 hashtag 並截斷字數。
- 自動送出預設關閉，需方案允許，開啟時跳出風險提醒。
- 被限流：暫停該帳號 24 小時、每日上限減半。管理員可暫停個別帳號、停用用戶或全系統暫停。

## 已知限制／待決定

- Threads 關鍵字搜尋沒有地區篩選，「地區」設定是交給 AI 判斷相關性時參考。
- 方案的實際數字與是否收費尚未決定（`scripts/seed-plans.mjs` 內為範例值）；目前沒有金流。
- 第四階段（自動回覆自己貼文的留言、排程發文）尚未實作。
