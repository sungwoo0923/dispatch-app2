// ======================= src/sheetConnectApi.js =======================
// 🔗 2026-11-07 구글시트 연동 — 서버(functions/sheetConnect.js) 호출 · 시트 프로필(sheetProfiles) 읽기/저장
//  개발 서버의 /preview?...&demo=1 에서는 서버 대신 가짜 시트(src/devSheetFixture.js)를 쓴다(배포 빌드에는 안 들어감)
import React from "react";
import { auth, db, FUNCTIONS_BASE } from "./firebase";
import { collection, doc, onSnapshot, query, where, setDoc, deleteDoc, serverTimestamp, addDoc } from "firebase/firestore";
import { isDemoOn } from "./devDemoData";

export const SERVICE_EMAIL = "dispatch-app-9b92f@appspot.gserviceaccount.com";
export const sheetDemo = () => { try { return !!(import.meta.env.DEV && isDemoOn()); } catch { return false; } };

export async function sheetConnectApi(body) {
  if (import.meta.env.DEV && sheetDemo()) {
    const { fixtureResponse } = await import("./devSheetFixture.js");
    await new Promise((r) => setTimeout(r, 250));
    return fixtureResponse(body);
  }
  const token = await auth.currentUser?.getIdToken();
  let res;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/sheetConnect`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` }, body: JSON.stringify(body) });
  } catch { throw new Error("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."); }
  let data = {};
  try { data = await res.json(); } catch { /* 무시 */ }
  if (!res.ok) throw Object.assign(new Error(data.error || `요청 실패(${res.status})`), { code: data.code || "", help: data.help || "" });
  return data;
}
// 📗 2026-11-07 엑셀(xlsx) 파일 오류인가(새 서버: code "office-file" · 예전 서버: Sheets API 영어 문구)
export const isOfficeFileError = (e) => e?.code === "office-file" || /must not be an Office file|not supported for this document/i.test(String(e?.message || e || ""));

// 데모(가짜 시트)에서 저장한 프로필 — 화면 안에서만
let demoStore = [];
const demoSubs = new Set();
const demoEmit = () => demoSubs.forEach((f) => f([...demoStore]));

// 이 회사의 시트 연결 목록(실시간)
export function useSheetProfiles(company) {
  const [list, setList] = React.useState(null);
  React.useEffect(() => {
    if (sheetDemo()) { demoSubs.add(setList); setList([...demoStore]); return () => demoSubs.delete(setList); }
    if (!company) { setList([]); return undefined; }
    return onSnapshot(query(collection(db, "sheetProfiles"), where("companyName", "==", company)),
      (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"))),
      () => setList([]));
  }, [company]);
  return list;
}

export async function saveSheetProfile(profile) {
  const { id, ...data } = profile;
  const rec = { ...data, updatedAt: sheetDemo() ? Date.now() : serverTimestamp(), updatedBy: auth.currentUser?.email || "" };
  if (sheetDemo()) {
    const nid = id || `demo_${Date.now().toString(36)}`;
    demoStore = [...demoStore.filter((p) => p.id !== nid), { id: nid, ...rec }];
    demoEmit();
    return nid;
  }
  if (id) { await setDoc(doc(db, "sheetProfiles", id), rec, { merge: false }); return id; }
  return (await addDoc(collection(db, "sheetProfiles"), { ...rec, createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || "" })).id;
}
export async function patchSheetProfile(id, patch) {
  if (sheetDemo()) { demoStore = demoStore.map((p) => (p.id === id ? { ...p, ...patch } : p)); demoEmit(); return; }
  await setDoc(doc(db, "sheetProfiles", id), patch, { merge: true });
}
export async function removeSheetProfile(id) {
  if (sheetDemo()) { demoStore = demoStore.filter((p) => p.id !== id); demoEmit(); return; }
  await deleteDoc(doc(db, "sheetProfiles", id));
}
