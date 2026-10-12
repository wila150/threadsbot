// 把某個用戶設為管理員：
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/set-admin.mjs you@example.com
// 設定後該用戶需要登出再登入才會生效。
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const email = process.argv[2];
const revoke = process.argv.includes("--revoke");
if (!email) {
  console.error("用法：node scripts/set-admin.mjs <email> [--revoke]");
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const user = await getAuth().getUserByEmail(email);
await getAuth().setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), admin: !revoke });
console.log(`${email} 已${revoke ? "移除" : "設為"}管理員（uid: ${user.uid}）`);
