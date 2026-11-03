process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const admin = require("firebase-admin"); admin.initializeApp({ projectId: "demo-kpflow" });
const db = admin.firestore();
const banks = [["국민은행", "1234"], ["신한은행", "110"], ["농협은행", "302"], ["우리은행", "1002"], ["하나은행", "620"]];
let i = 0;
for (const d of (await db.collection("drivers").get()).docs) {
  const [bank, p] = banks[i % banks.length];
  const acct = (p + String(48213759 + i * 7311)).padEnd(12, "7").slice(0, 12);
  await d.ref.set({ 정산계좌: { bank, acct, holder: d.data().이름 }, 사업자번호: `${310 + i}-${20 + i}-${String(41000 + i * 37).slice(0,5)}`, 사업자상호: `${d.data().이름}운수` }, { merge: true });
  i++;
}
console.log(i); process.exit(0);
