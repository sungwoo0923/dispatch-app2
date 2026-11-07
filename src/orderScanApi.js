// ======================= src/orderScanApi.js =======================
// 🧠 2026-11-07 배차 프로그램(PC · 모바일)용 오더 스캔 정밀 인식 연결 — 내용은 src/orderScanClient.js
//  회사 키 = "lw:" + 내 계정(users/{uid})의 회사명 — 로지스웹 계정으로 들어온 허브 회원과 같은 키라 학습 기록을 같이 쓴다
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, orderBy, limit, serverTimestamp } from "firebase/firestore";
import { auth, db, FUNCTIONS_BASE, DEFAULT_COMPANY } from "./firebase";
import { createScanAi } from "./orderScanClient";

let keyCache = { uid: "", key: "" };
async function myKey() {
  const uid = auth.currentUser?.uid;
  if (!uid) return "";
  if (keyCache.uid === uid && keyCache.key) return keyCache.key;
  try {
    const s = await getDoc(doc(db, "users", uid));
    const d = s.exists() ? s.data() : {};
    const co = d.role === "shipper" ? String(d.companyName || "") : String(d.companyName || DEFAULT_COMPANY);
    keyCache = { uid, key: co && !co.includes("/") ? `lw:${co}` : "" };
  } catch { keyCache = { uid, key: "" }; }
  return keyCache.key;
}

export const mainScanAi = createScanAi({
  base: FUNCTIONS_BASE,
  getToken: () => auth.currentUser?.getIdToken() || "",
  getUid: () => auth.currentUser?.uid || "",
  getKey: myKey,
  db,
  fs: { collection, doc, getDocs, setDoc, deleteDoc, query, where, orderBy, limit, serverTimestamp },
});
