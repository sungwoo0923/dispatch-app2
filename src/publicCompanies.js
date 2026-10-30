// ======================= src/publicCompanies.js =======================
// 🏢 가입 화면용 공개 운송사 목록(publicCompanies/{회사명}) — 로그인 전에도 읽을 수 있다.
//  "기존 회사 추가 가입"에서 회사명을 검색할 때 쓴다(이름·주소만 담는다).
//  · 운송사 직원이 로그인하면 자기 회사를 올리고, 최고관리자가 로그인하면 승인된 운송사 전체를 채운다.
import { collection, doc, getDocs, query, setDoc, where, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

const idOf = (name) => String(name || "").trim().replace(/[/\\.#$[\]]/g, "_").slice(0, 120);

export async function publishCompany(companyName, address = "") {
  const n = String(companyName || "").trim();
  if (!n) return;
  await setDoc(doc(db, "publicCompanies", idOf(n)), { companyName: n, ...(address ? { address: String(address).trim() } : {}), updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
}

export async function readPublicCompanies() {
  const s = await getDocs(collection(db, "publicCompanies"));
  return s.docs.map((d) => d.data()).filter((c) => c.companyName && !c.hidden);
}

// 최고관리자 로그인 때 하루 한 번 — 승인된 운송사(신규 신청서) + 요금제가 연결된 회사를 모두 올린다
export async function backfillPublicCompanies() {
  try {
    const k = "kpPubCoAt"; const last = Number(localStorage.getItem(k) || 0);
    if (Date.now() - last < 86400e3) return;
    localStorage.setItem(k, String(Date.now()));
  } catch { /* 저장 불가 — 그냥 진행 */ }
  const map = new Map();
  try {
    const a = await getDocs(query(collection(db, "transportApplications"), where("status", "==", "approved")));
    a.docs.forEach((d) => { const x = d.data(); const n = String(x.companyName || "").trim(); if (n && (!map.has(n) || (x.type === "신규" && x.address))) map.set(n, x.address || map.get(n) || ""); });
  } catch { /* 권한 없음 */ }
  try {
    const p = await getDocs(collection(db, "companyPlans"));
    p.docs.forEach((d) => { if (!map.has(d.id)) map.set(d.id, ""); });
  } catch { /* 권한 없음 */ }
  for (const [n, addr] of map) await publishCompany(n, addr);
}
