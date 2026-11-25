// ======================= src/voiceGlossary.js =======================
// 📞 2026-11-25 AI 상담원 용어 사전 — 회사마다 쓰는 줄임말 · 다른 이름을 AI에 알려 준다(Firestore voiceGlossary/{회사})
//  items: [{ from: "에이제이", to: "AJ네트웍스" }] — AI 상담원이 [용어 사전]으로 AI에 같이 보낸다
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "./firebase";

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
export const normGlossary = (items) => {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).map((x) => ({ from: clean(x?.from), to: clean(x?.to) }))
    .filter((x) => x.from && x.to && x.from !== x.to && !seen.has(x.from) && seen.add(x.from)).slice(0, 500);
};

export function subscribeGlossary(co, cb) {
  if (!co) { cb([]); return () => {}; }
  return onSnapshot(doc(db, "voiceGlossary", co), (s) => cb(normGlossary(s.exists() ? s.data()?.items : [])), () => cb([]));
}

export async function saveGlossary(co, items) {
  if (!co) throw new Error("회사 정보를 찾지 못했어요");
  await setDoc(doc(db, "voiceGlossary", co), { items: normGlossary(items), updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid || "" });
}
