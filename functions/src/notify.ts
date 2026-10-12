// PWA 推播（Firebase Cloud Messaging）
import { logger } from "firebase-functions";
import { FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { APP_URL } from "./config";
import { getUser, refs } from "./db";

export async function notifyUser(uid: string, title: string, body: string, path = "/") {
  const user = await getUser(uid);
  if (!user || user.pushEnabled === false || !user.fcmTokens?.length) return;
  const link = new URL(path, APP_URL.value()).toString();
  try {
    const res = await getMessaging().sendEachForMulticast({
      tokens: user.fcmTokens,
      notification: { title, body },
      webpush: { fcmOptions: { link }, notification: { icon: "/icon-192.png", badge: "/icon-192.png" } },
      data: { path },
    });
    const dead = res.responses
      .map((r, i) => (!r.success && isDeadToken(r.error?.code) ? user.fcmTokens[i] : null))
      .filter((t): t is string => t !== null);
    if (dead.length) await refs.user(uid).update({ fcmTokens: FieldValue.arrayRemove(...dead) });
  } catch (err) {
    logger.warn("推播失敗", { uid, err });
  }
}

function isDeadToken(code?: string) {
  return code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token";
}
