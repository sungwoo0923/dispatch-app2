// ======================= src/errorReport.js =======================
// 🧯 2026-11-10 오류 보내기 — 오류 화면의 [오류 보내기] 버튼이 errorReports에 한 줄을 남긴다
//  · 보내기: 로그인한 누구나(직원·기사·화주) · 보기·처리: 최고관리자(관리센터 › 보안·데이터 › 오류 신고)만 — firestore.rules
//  · 보낸 뒤 화면에 짧은 오류 번호(문서 ID 앞 6자리)를 보여 준다 — 전화로 "오류 번호 ○○○○○○" 하고 말하면 바로 찾는다
/* global __APP_VERSION__ */
import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

const cut = (v, n) => String(v == null ? "" : v).slice(0, n);
export const errorCode = (id) => String(id || "").slice(0, 6).toUpperCase();

export async function sendErrorReport(error, section = "") {
  const u = auth.currentUser;
  if (!u) throw new Error("로그인한 뒤에 보낼 수 있어요.");
  let me = {};
  try { const s = await getDoc(doc(db, "users", u.uid)); me = s.exists() ? s.data() : {}; } catch { /* 내 정보를 못 읽어도 보낸다 */ }
  const ref = await addDoc(collection(db, "errorReports"), {
    uid: u.uid,
    email: cut(u.email, 120),
    name: cut(me.name || me.이름 || u.displayName || "", 60),
    role: cut(me.role || "", 30),
    companyName: cut(me.companyName || "", 80),
    section: cut(section || "전체 화면", 80),
    message: cut(error?.message || error || "", 1000),
    stack: cut(error?.stack || "", 4000),
    url: cut(typeof location !== "undefined" ? location.pathname + location.search : "", 300),
    ua: cut(typeof navigator !== "undefined" ? navigator.userAgent : "", 300),
    version: cut(typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "", 30),
    status: "new",
    createdAt: serverTimestamp(),
  });
  return errorCode(ref.id);
}
