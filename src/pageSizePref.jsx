// ======================= src/pageSizePref.jsx =======================
// 📄 2026-11-17 한 페이지에 몇 개씩 볼지 — 계정마다 따로(운송사 전체가 아니라 나만) · 다른 PC · 휴대폰에서도 같게
//  · 저장: 이 브라우저(localStorage) + 내 users 문서 pageSizes.{목록 이름}
//  · 화면: 페이지 번호(1 / 5) 바로 옆 작은 선택칸 "100개씩 ▾" — 버튼을 새로 늘리지 않는다
import React from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db, auth } from "./firebase";

export const PAGE_SIZE_OPTIONS = [20, 30, 50, 100, 200];
const lsKey = (uid, key) => `kpPageSize:${uid || "me"}:${key}`;
const valid = (n) => (PAGE_SIZE_OPTIONS.includes(Number(n)) ? Number(n) : 0);

export function usePageSize(key, fallback = 100) {
  const uid = auth.currentUser?.uid || "";
  const [size, setSize] = React.useState(() => { try { return valid(localStorage.getItem(lsKey(uid, key))) || fallback; } catch { return fallback; } });
  React.useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(doc(db, "users", uid), (d) => {
      const v = valid(d.data()?.pageSizes?.[key]);
      if (v) { setSize(v); try { localStorage.setItem(lsKey(uid, key), String(v)); } catch { /* 무시 */ } }
    }, () => {});
  }, [uid, key]);
  const save = React.useCallback((n) => {
    const v = valid(n); if (!v) return;
    setSize(v);
    try { localStorage.setItem(lsKey(uid, key), String(v)); } catch { /* 무시 */ }
    if (uid) setDoc(doc(db, "users", uid), { pageSizes: { [key]: v } }, { merge: true }).catch(() => {});
  }, [uid, key]);
  return [size, save];
}

// 페이지 번호 옆에 붙는 작은 선택칸
export function PageSizeSelect({ value, onChange, className = "", dark = false }) {
  return (
    <label className={`inline-flex items-center flex-shrink-0 ${className}`} title="한 페이지에 볼 개수 — 내 계정에만 적용돼요">
      <select value={value} onChange={(e) => onChange?.(Number(e.target.value))} data-kp="page-size"
        className={`h-[26px] pl-1.5 pr-5 rounded-lg border text-[11px] font-semibold cursor-pointer outline-none appearance-none bg-no-repeat ${dark ? "bg-gray-800 border-gray-600 text-gray-200" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"}`}
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundPosition: "right 5px center" }}>
        {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}개씩</option>)}
      </select>
    </label>
  );
}
