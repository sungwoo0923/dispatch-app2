process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const admin = require("firebase-admin"); admin.initializeApp({ projectId: "demo-kpflow" });
const db = admin.firestore();
const c = process.argv[2];
const s = await db.collection(c).get(); for (const d of s.docs) await d.ref.delete(); console.log("cleared", c, s.size); process.exit(0);
