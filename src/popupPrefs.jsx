// ======================= src/popupPrefs.jsx =======================
// 🔕 2026-11-07 팝업 알림 켜고 끄기(계정별)
//  화면 가운데에 저절로 뜨는 팝업을 종류별로 끌 수 있다. 꺼도 내용은 사라지지 않는다:
//  읽음 처리를 하지 않으니 공지사항·전자결재·인수인계 목록과 메뉴 숫자에는 그대로 남는다.
//  저장: users/{uid}.popupPrefs = { approval, notice, briefing, hr, etc } (false만 꺼짐 · 값이 없으면 켜짐)
//   · 이 기기 localStorage(kpPopupPrefs:{uid})에도 바로 적어 다시 켜도 즉시 반영
//   · users/{uid} 문서를 실시간으로 구독해 PC에서 바꾸면 모바일에도 바로 반영
//  필수 안내(연차 사용 촉진 법정 통지 · 계약 종료 차단 · 로그인 보안 확인)는 여기서 끌 수 없다.
import React from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export const POPUP_CATS = [
  { key: "approval", label: "결재 요청·결과", sub: "결재할 차례, 내가 올린 문서의 승인·반려" },
  { key: "notice", label: "공지사항", sub: "회사 공지, 운영팀 공지, 부고" },
  { key: "briefing", label: "일일 경영 보고", sub: "아침에 받는 경영 요약", execOnly: true },
  { key: "hr", label: "인사 공지", sub: "인사발령 공문, 발령 안내, 급여명세서" },
  { key: "etc", label: "기타 시스템 안내", sub: "인수인계, 생일 안내" },
];
export const POPUP_REQUIRED = ["연차 사용 촉진 통지", "이용 계약 종료 안내", "로그인 보안 확인"];

const LS_KEY = (uid) => `kpPopupPrefs:${uid}`;
const readLs = (uid) => { try { const v = JSON.parse(localStorage.getItem(LS_KEY(uid)) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
const writeLs = (uid, v) => { try { localStorage.setItem(LS_KEY(uid), JSON.stringify(v)); } catch { /* 무시 */ } };
const clean = (v) => Object.fromEntries(Object.entries(v || {}).filter(([k, x]) => POPUP_CATS.some((c) => c.key === k) && typeof x === "boolean"));

export const isPopupOn = (prefs, cat) => !cat || prefs?.[cat] !== false;

// NotifyCenter 대기열 한 건 → 종류(null = 필수 안내라 끌 수 없음)
export function popupCatOfNotify(it) {
  if (!it) return "etc";
  if (it.src === "approval") return "approval";
  if (it.src === "notice") return it.kind === "hr" ? "hr" : "notice";
  if (it.src === "platform") return "notice";
  if (it.src === "handover") return "etc";
  if (it.src === "hrNotice") return it.kind === "leave1" || it.kind === "leave2" ? null : "hr"; // 근로기준법 61조 통지는 필수
  return "etc";
}

// uid마다 구독 하나를 화면 전체가 같이 쓴다
const stores = new Map(); // uid → { prefs, subs:Set, unsub, refs }
function storeOf(uid) {
  let s = stores.get(uid);
  if (!s) { s = { prefs: readLs(uid), subs: new Set(), unsub: null, refs: 0 }; stores.set(uid, s); }
  return s;
}
const emit = (s) => s.subs.forEach((f) => f(s.prefs));

export function usePopupPrefs(uid) {
  const [prefs, setPrefs] = React.useState(() => (uid ? storeOf(uid).prefs : {}));
  React.useEffect(() => {
    if (!uid) { setPrefs({}); return undefined; }
    const s = storeOf(uid);
    setPrefs(s.prefs);
    s.subs.add(setPrefs);
    s.refs += 1;
    if (!s.unsub) {
      s.unsub = onSnapshot(doc(db, "users", uid), (snap) => {
        const server = snap?.exists?.() ? snap.data()?.popupPrefs : undefined;
        if (!server || typeof server !== "object") return; // 서버에 아직 없으면(처음·둘러보기) 이 기기 값 유지
        s.prefs = { ...s.prefs, ...clean(server) };
        writeLs(uid, s.prefs);
        emit(s);
      }, () => { /* 권한·연결 문제 — 이 기기 값으로 계속 */ });
    }
    return () => {
      s.subs.delete(setPrefs);
      s.refs -= 1;
      if (s.refs <= 0 && s.unsub) { try { s.unsub(); } catch { /* 무시 */ } s.unsub = null; }
    };
  }, [uid]);
  return prefs;
}

export async function setPopupPref(uid, cat, on) {
  if (!uid || !POPUP_CATS.some((c) => c.key === cat)) return;
  const s = storeOf(uid);
  s.prefs = { ...s.prefs, [cat]: !!on };
  writeLs(uid, s.prefs);
  emit(s);
  try { await setDoc(doc(db, "users", uid), { popupPrefs: { [cat]: !!on } }, { merge: true }); }
  catch (e) { console.warn("팝업 알림 설정 저장 실패(이 기기에는 적용됨):", e?.message || e); }
}

function Toggle({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      data-testid={`popup-pref-${label}`}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${on ? "bg-[#1B2B4B]" : "bg-[#D5DCE7]"}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

// 설정 화면 한 덩어리(PC 내 정보 패널 · 모바일 설정 공용)
//  flush: 모바일 카드 안처럼 테두리 없이 줄만 그린다
export function PopupPrefsSection({ uid, showBriefing = false, flush = false }) {
  const prefs = usePopupPrefs(uid);
  const cats = POPUP_CATS.filter((c) => !c.execOnly || showBriefing);
  const rows = (
    <>
      {cats.map((c) => (
        <div key={c.key} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#EEF1F6]">
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold text-[#0F1A30]">{c.label}</div>
            <div className="text-[11.5px] text-[#7A879C] mt-0.5 leading-snug">{c.sub}</div>
          </div>
          <Toggle on={isPopupOn(prefs, c.key)} label={c.label} onChange={(v) => setPopupPref(uid, c.key, v)} />
        </div>
      ))}
      <div className="px-4 py-3 bg-[#F8FAFD]">
        <div className="text-[12px] font-bold text-[#3A4A66]">필수 안내는 끌 수 없어요</div>
        <div className="text-[11.5px] text-[#7A879C] mt-0.5 leading-snug">{POPUP_REQUIRED.join(", ")}</div>
      </div>
    </>
  );
  if (flush) return <div data-testid="popup-prefs">{rows}</div>;
  return (
    <div data-testid="popup-prefs">
      <p className="text-[12px] font-semibold text-gray-500 mb-1">팝업 알림</p>
      <p className="text-[11px] text-gray-500 mb-2">끄면 화면 가운데에 뜨지 않아요. 내용은 목록과 메뉴 숫자에 그대로 남아요.</p>
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">{rows}</div>
    </div>
  );
}
