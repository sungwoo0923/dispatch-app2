process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const admin = require("firebase-admin"); admin.initializeApp({ projectId: "demo-kpflow" });
const db = admin.firestore();
const s = await db.collection("orders").where("긴급", "==", true).get();
const b = db.batch(); s.docs.forEach((d) => b.update(d.ref, { 긴급: false })); await b.commit(); console.log(s.size); process.exit(0);
