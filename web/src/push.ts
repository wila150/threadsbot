// PWA 推播：向瀏覽器要權限、取得 FCM token、交給後端存
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { api } from "./api";
import { app, firebaseConfig } from "./firebase";

export async function pushSupported() {
  return "Notification" in window && "serviceWorker" in navigator && (await isSupported());
}

export async function enablePush(): Promise<"granted" | "denied" | "unsupported"> {
  if (!(await pushSupported())) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  // firebase-messaging-sw.js 需要 config；用 query string 帶過去
  const swUrl = `/firebase-messaging-sw.js?config=${encodeURIComponent(JSON.stringify(firebaseConfig))}`;
  const registration = await navigator.serviceWorker.register(swUrl, { scope: "/firebase-cloud-messaging-push-scope" });
  const token = await getToken(getMessaging(app), {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  await api.registerPushToken({ token });
  return "granted";
}

/** App 開著時收到的推播，用頁內提示顯示 */
export async function listenForeground(onNotify: (title: string, body: string) => void) {
  if (!(await pushSupported()) || Notification.permission !== "granted") return;
  onMessage(getMessaging(app), (payload) => {
    onNotify(payload.notification?.title ?? "", payload.notification?.body ?? "");
  });
}
