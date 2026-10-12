/* global importScripts, firebase */
// FCM 背景推播用的 service worker。config 由 push.ts 以 query string 帶入。
importScripts("https://www.gstatic.com/firebasejs/11.2.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.2.0/firebase-messaging-compat.js");

const config = JSON.parse(new URL(self.location.href).searchParams.get("config") || "{}");
firebase.initializeApp(config);
// 有 notification 欄位的訊息由 FCM 自動顯示；點擊連結由 webpush.fcmOptions.link 處理
firebase.messaging();
