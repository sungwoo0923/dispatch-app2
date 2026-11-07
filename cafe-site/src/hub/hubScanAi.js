// ======================= cafe-site/src/hub/hubScanAi.js =======================
// 🧠 2026-11-07 허브 오더 등록용 오더 스캔 정밀 인식 연결 — 내용은 src/orderScanClient.js
//  회사 키 = 허브 회사 키(companyKeyOf · 규칙 hubKeyOf) — 같은 회사 회원끼리만 학습 기록을 나눈다
import { collection, doc, getDocs, setDoc, deleteDoc, query, where, orderBy, limit, serverTimestamp } from "firebase/firestore";
import { auth, db, USE_EMU } from "../firebase";
import { createScanAi } from "../../../src/orderScanClient";
import { companyKeyOf } from "./hubConstants";

const BASE = USE_EMU ? "http://127.0.0.1:5001/demo-kpflow/us-central1" : `https://us-central1-${auth.app.options.projectId}.cloudfunctions.net`;
const cache = new Map();
export function hubScanAi(member) {
  const key = companyKeyOf(member);
  if (!key || key.includes("/")) return null;
  if (cache.has(key)) return cache.get(key);
  const api = createScanAi({
    base: BASE,
    getToken: () => auth.currentUser?.getIdToken() || "",
    getUid: () => auth.currentUser?.uid || "",
    getKey: async () => key,
    db,
    fs: { collection, doc, getDocs, setDoc, deleteDoc, query, where, orderBy, limit, serverTimestamp },
  });
  cache.set(key, api);
  return api;
}
