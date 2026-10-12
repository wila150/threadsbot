// 建立預設方案（數字待決定，先放範例值）：
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/seed-plans.mjs
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PLANS = {
  free: { name: "免費", maxAccounts: 1, dailyLimit: 20, allowAutoSend: false },
  pro: { name: "進階", maxAccounts: 3, dailyLimit: 50, allowAutoSend: true },
  team: { name: "團隊", maxAccounts: 10, dailyLimit: 100, allowAutoSend: true },
};

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
for (const [id, plan] of Object.entries(PLANS)) {
  await db.doc(`plans/${id}`).set(plan, { merge: true });
  console.log(`plans/${id}`, plan);
}
await db.doc("system/config").set({ paused: false }, { merge: true });
console.log("完成");
