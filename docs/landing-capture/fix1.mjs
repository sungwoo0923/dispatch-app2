process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const admin = require("firebase-admin"); admin.initializeApp({ projectId: "demo-kpflow" });
const db = admin.firestore();
const s = await db.collection("users").get();
for (const d of s.docs) await d.ref.set({ tutorialDone: true, companyCode: "HG2026", onboardingDone: true }, { merge: true });
console.log(s.size); process.exit(0);
