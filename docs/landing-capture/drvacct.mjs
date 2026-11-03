process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const admin = require("firebase-admin"); admin.initializeApp({ projectId: "demo-kpflow" });
const u = await admin.auth().getUserByEmail("driver2@hangyeol.demo");
await admin.auth().updateUser(u.uid, { email: "경기82아7712@driver.run25.kr", password: "경기82아7712" });
await admin.firestore().doc(`users/${u.uid}`).set({ email: "경기82아7712@driver.run25.kr" }, { merge: true });
console.log("ok", u.uid); process.exit(0);
