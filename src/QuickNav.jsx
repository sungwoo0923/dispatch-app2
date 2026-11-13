// ======================= src/QuickNav.jsx =======================
// 🔎 2026-11-12 통합 검색(Ctrl + K) · ★ 자주 쓰는 메뉴(접었다 펴기) · 도움말 센터
//  · 목록은 따로 적어 두지 않는다 — 지금 이 계정에 실제로 보이는 상단 메뉴(menus) + 그 화면의 왼쪽 메뉴(navMenus subItemsOf)에서 자동으로 만든다
//    → 메뉴 · 세부 메뉴가 새로 생기면 검색 · 도움말에 저절로 들어간다
//  · 도움말 센터 "새 기능 · 바뀐 점" = public/updates.json(커밋 · 빌드 때마다 자동 누적, scripts/gen-updates.mjs)
//    최고관리자(관리센터 · 플랫폼 운영) 관련 내용은 뺀다(MASTER_RX) · 관리센터 메뉴도 도움말에는 넣지 않는다
//  · 자주 쓰는 메뉴 · 접힘 상태는 계정마다 기억(ColumnLayout prefs: favMenus · favOpen) · 최근 연 화면은 이 PC에(localStorage)
import React from "react";
import { createPortal } from "react-dom";
import { usePref, setPref } from "./ColumnLayout";
import { subItemsOf } from "./navMenus";
import { menuName } from "./execMenus";
import { MENU_TOURS } from "./onboardingTour";
import { HELP_DETAIL, HELP_COMMON, helpTextOf } from "./helpContent"; // 📖 메뉴별 자세한 사용법
import { HelpDemo, hasHelpDemo } from "./HelpDemos"; // 🎬 2026-11-13 움직이는 예시 화면

const FONT = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const MASTER_MENUS = new Set(["관리센터"]);
// 최고관리자 · 개발 내부 내용(도움말에 넣지 않는다)
export const MASTER_RX = /최고관리자|관리센터|플랫폼 공지|운송사 일괄 이전|테스트운송사|시험 기능|에뮬레이터|보안 규칙|서버 함수|단위 테스트|버전 커밋|^chore|^merge|^revert|totalMaster/i;

// 메뉴 한 줄 설명 — 없는 메뉴는 첫 방문 안내(MENU_TOURS) 글에서 가져온다(새 메뉴도 안내 글만 있으면 자동)
const MENU_DESC = {
  HOME: "오늘 접수 · 배차 · 매출 요약, 공지사항 · 일정 · 사내메일 · 전자결재로 가는 첫 화면",
  배차관리: "새 오더를 등록하는 화면 — 거래처 · 상하차지 · 날짜 · 차량 · 운임을 넣고 기사까지 배정",
  실시간배차현황: "어제 · 오늘 · 내일 오더를 실시간으로 보고 바로 고치는 화면",
  배차현황: "기간별 오더 조회 · 수정 · 복사, 미배차 · 고정노선 · 인수증 관리",
  단가표: "거래처에 보내는 노선별 · 다목적지 단가표 작성과 발행 이력",
  운임조회: "전국 운임 조회와 우리 회사 운임표",
  기사관리: "기사 등록 · 등급(일반 · 직영 · 지입 · 임대) · 기사앱 계정 승인 · 제출 서류",
  거래처관리: "상하차지 거래처와 기본거래처(청구처) 등록 · 수정",
  지입차관리: "지입 · 직영 차량 관제(위치) · 노선 · 출근기록 · 차량 정비 · 비용",
  매출관리: "기간별 매출 · 매입 · 수익, 거래처 순위 · 동향, 목표 대비 실적",
  정산관리: "거래처 정산(거래명세서 · 미수금) · 용차 지급 · 지입 정산 · 지게차 지급",
  인사이트: "오더 · 매출 데이터를 분석해 보여 주는 화면",
  전자결재: "기안 작성 · 결재함 · 내 기안함 · 결재선 관리",
  영업관리: "영업 현황 · 영업 기회 · 거래처 담당 · 인센티브",
  회계관리: "회계 개요 · 장부 · 급여 계산 · 퇴직 정산",
  자금관리: "자금 현황과 수입 · 지출 장부",
  비품관리: "회사 비품 등록 · 대여 · 이력",
  인사관리부: "직원 정보 · 이력서 · 근태 · 인사발령 · 연차",
  증명서발급: "재직증명서 등 증명서 발급",
  회사관리: "회사정보 · 조직도 · 운임 규칙 · 내정보 · 출근기록부",
  관리자메뉴: "회원(직원) 승인 · 권한 · 연동 화주사 · 로그인 관리 · 초기 설정",
};
const descOf = (m) => MENU_DESC[m] || (MENU_TOURS[m] || []).find((s) => !s.tour && !s.find)?.text || (MENU_TOURS[m] || [])[0]?.text || "";

// 초성 검색("ㅂㅊㅎㅎ" → 배차현황)
const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const choOf = (s) => [...String(s)].map((c) => { const n = c.charCodeAt(0) - 0xac00; return n >= 0 && n <= 11171 ? CHO[Math.floor(n / 588)] : c; }).join("");
const norm = (s) => String(s || "").toLowerCase().replace(/[\s·›>\-_/]+/g, "");
const isCho = (q) => /^[ㄱ-ㅎ]+$/.test(q);
const hit = (text, q) => { const t = norm(text); if (!q) return true; return isCho(q) ? choOf(t).includes(q) : t.includes(q); };

// 지금 보이는 메뉴 → 검색 · 도움말 항목 [{ id, menu, label, sub, code, key }]
export function buildNavIndex(menus = []) {
  const out = [];
  menus.forEach((m) => {
    const label = menuName(m);
    out.push({ id: m, menu: m, label, sub: "", code: "", key: "" });
    const conf = subItemsOf(m);
    (conf?.items || []).forEach(([k, l]) => out.push({ id: `${m}|${k}`, menu: m, label, sub: String(l), code: conf.code, key: String(k) }));
  });
  return out;
}
const titleOf = (e) => (e.sub ? `${e.label} › ${e.sub}` : e.label);

// 최근 연 화면(이 PC) — 메뉴 단위
const RECENT_KEY = "kpNavRecent";
export const readRecent = () => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
export function pushRecent(id) {
  if (!id || id === "HOME") return;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 6))); } catch { /* 무시 */ }
}
const useFavs = () => { const v = usePref("favMenus"); return Array.isArray(v) ? v : []; };
const toggleFav = (favs, id) => setPref("favMenus", favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id].slice(0, 20));

// 업데이트 내역(자동 누적) — 최고관리자 내용 제외
function useUpdates(enabled) {
  const [items, setItems] = React.useState(null);
  React.useEffect(() => {
    if (!enabled || items) return undefined;
    let off = false;
    fetch(`/updates.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => { if (!off) setItems((Array.isArray(j?.items) ? j.items : []).filter((x) => x?.s && !MASTER_RX.test(x.s))); })
      .catch(() => { if (!off) setItems([]); });
    return () => { off = true; };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return items;
}
const kstDay = (iso) => { try { return new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 10); } catch { return ""; } };
// "주제: 항목 · 항목" → { topic, lines }
const parseUpdate = (s) => {
  let t = String(s || "").trim(); let topic = "";
  const m = t.match(/^([^:·]{2,40}):\s+(.+)$/);
  if (m) { topic = m[1].trim(); t = m[2]; }
  // " · "로 나누되 괄호 안( … · … )은 한 줄로 둔다
  const lines = []; let depth = 0, buf = "";
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if ("([".includes(c)) depth++; else if (")]".includes(c)) depth = Math.max(0, depth - 1);
    if (depth === 0 && c === "·" && t[i - 1] === " " && t[i + 1] === " ") { lines.push(buf); buf = ""; continue; }
    buf += c;
  }
  lines.push(buf);
  return { topic, lines: lines.map((x) => x.trim()).filter(Boolean) };
};

const Star = ({ on, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={on ? "#F5B301" : "none"} stroke={on ? "#F5B301" : "currentColor"} strokeWidth="2" strokeLinejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></svg>
);
const SearchIco = ({ size = 14 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>);

// ───────────────────────── 통합 검색 창 ─────────────────────────
function Palette({ index, favs, onGo, onHelp, onClose }) {
  const [q, setQ] = React.useState("");
  const [cur, setCur] = React.useState(0);
  const updates = useUpdates(true);
  const listRef = React.useRef(null);
  const nq = norm(q);
  const rows = React.useMemo(() => {
    const byId = new Map(index.map((e) => [e.id, e]));
    if (!nq) {
      const fav = favs.map((id) => byId.get(id)).filter(Boolean).map((e) => ({ ...e, group: "★ 자주 쓰는 메뉴" }));
      const rec = readRecent().map((id) => byId.get(id)).filter((e) => e && !favs.includes(e.id)).map((e) => ({ ...e, group: "최근 연 화면" }));
      const all = index.filter((e) => !e.sub).map((e) => ({ ...e, group: "전체 메뉴" }));
      return [...fav, ...rec, ...all];
    }
    const menuHits = index.filter((e) => hit(titleOf(e), nq) || (!e.sub && hit(descOf(e.menu), nq)))
      .sort((a, b) => (hit(a.sub || a.label, nq) ? 0 : 1) - (hit(b.sub || b.label, nq) ? 0 : 1) || (a.sub ? 1 : 0) - (b.sub ? 1 : 0))
      .slice(0, 30).map((e) => ({ ...e, group: "메뉴 · 화면" }));
    const helpHits = isCho(nq) ? [] : (updates || []).filter((x) => hit(x.s, nq)).slice(0, 8).map((x) => ({ id: `u:${x.h}`, help: x, group: "도움말 · 바뀐 점" }));
    return [...menuHits, ...helpHits];
  }, [index, favs, nq, updates]);
  React.useEffect(() => { setCur(0); }, [nq]);
  React.useEffect(() => { listRef.current?.querySelector(`[data-i="${cur}"]`)?.scrollIntoView({ block: "nearest" }); }, [cur]);
  const run = (r) => { if (!r) return; if (r.help) { onHelp({ q: q.trim() }); return; } onGo(r); };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCur((c) => Math.min(rows.length - 1, c + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(rows[cur]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
  };
  let lastGroup = "";
  return createPortal(
    <div data-kp-dialog data-kp="quick-search" onKeyDown={onKey} className="fixed inset-0 z-[2147483000] flex items-start justify-center pt-[12vh] px-4" style={{ fontFamily: FONT }}>
      <div className="absolute inset-0 bg-[#060C1A]/55 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-[min(640px,96vw)] rounded-2xl bg-white shadow-[0_30px_80px_rgba(6,12,26,.5)] overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 h-[54px] border-b border-[#E6EBF3] text-[#5B6B85]">
          <SearchIco size={18} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="메뉴 · 기능 이름을 입력하세요 (예: 거래명세서, 지게차, ㅂㅊㅎㅎ)" autoComplete="off"
            className="flex-1 h-full bg-transparent outline-none text-[15px] font-bold text-[#0F1A30] placeholder:text-[#9AA9C3] placeholder:font-semibold" />
          <kbd className="px-1.5 py-0.5 rounded-md bg-[#EEF2F8] text-[11px] font-black text-[#5B6B85]">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {!rows.length && <div className="py-10 text-center text-[13.5px] font-bold text-[#9AA9C3]">찾는 메뉴가 없어요 — 다른 낱말로 찾아보세요</div>}
          {rows.map((r, i) => {
            const head = r.group !== lastGroup ? r.group : ""; lastGroup = r.group;
            const on = i === cur;
            return (
              <React.Fragment key={`${r.group}:${r.id}`}>
                {head && <div className="px-2.5 pt-2.5 pb-1 text-[10.5px] font-black tracking-[0.14em] text-[#8FA0BD]">{head}</div>}
                <div data-i={i} onMouseEnter={() => setCur(i)} onClick={() => run(r)}
                  className={`flex items-center gap-2.5 px-2.5 h-10 rounded-xl cursor-pointer ${on ? "bg-[#0F1A30] text-white" : "text-[#1B2B4B]"}`}>
                  {r.help ? (
                    <><span className={`shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded ${on ? "bg-white/15" : "bg-[#EEF2F8] text-[#5B6B85]"}`}>도움말</span>
                      <span className="flex-1 min-w-0 truncate text-[13px] font-semibold">{r.help.s}</span></>
                  ) : (
                    <><span className="flex-1 min-w-0 truncate text-[13.5px] font-bold">{r.sub ? <><span className={on ? "text-white/60" : "text-[#8FA0BD]"}>{r.label} › </span>{r.sub}</> : r.label}
                      {!r.sub && descOf(r.menu) && <span className={`ml-2 text-[11.5px] font-semibold ${on ? "text-white/55" : "text-[#9AA9C3]"}`}>{descOf(r.menu)}</span>}</span>
                      <button type="button" title={favs.includes(r.id) ? "자주 쓰는 메뉴에서 빼기" : "자주 쓰는 메뉴에 넣기"} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); toggleFav(favs, r.id); }}
                        className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${on ? "hover:bg-white/15" : "hover:bg-[#EEF2F8]"} ${favs.includes(r.id) ? "" : on ? "text-white/50" : "text-[#B9C4D8]"}`}><Star on={favs.includes(r.id)} /></button></>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div className="flex items-center gap-3 px-4 h-10 border-t border-[#E6EBF3] bg-[#F7F9FC] text-[11.5px] font-bold text-[#7A89A3]">
          <span>↑↓ 고르기</span><span>Enter 이동</span><span>★ 자주 쓰는 메뉴에 넣기</span>
          <button type="button" onClick={() => onHelp({})} className="ml-auto h-7 px-2.5 rounded-lg bg-white border border-[#DCE3EE] text-[#1B2B4B] font-black hover:bg-[#EEF3FB]">도움말 센터 열기</button>
        </div>
      </div>
    </div>, document.body);
}

// ───────────────────────── 도움말 센터 ─────────────────────────
function HelpCenter({ index, initial, onGo, onClose }) {
  const menus = React.useMemo(() => index.filter((e) => !e.sub && !MASTER_MENUS.has(e.menu)), [index]);
  const [sel, setSel] = React.useState(initial?.menu || "__common");
  const [q, setQ] = React.useState(initial?.q || "");
  const updates = useUpdates(true);
  const nq = norm(q);
  const subsOf = (m) => index.filter((e) => e.menu === m && e.sub);
  // 그 메뉴와 관련된 업데이트 — 메뉴 이름 · 세부 메뉴 이름이 들어간 내역
  const related = (m) => { const names = [menuName(m), m, ...subsOf(m).map((e) => e.sub.split("›").pop().trim())].filter((x) => x && x.length >= 2).map(norm); return (updates || []).filter((x) => { const t = norm(x.s); return names.some((n) => t.includes(n)); }); };
  const UpdateList = ({ list, limit = 200 }) => {
    const byDay = {}; list.slice(0, limit).forEach((x) => { const d = kstDay(x.at); (byDay[d] = byDay[d] || []).push(x); });
    const days = Object.keys(byDay).sort().reverse();
    if (!days.length) return <div className="py-8 text-center text-[13px] font-bold text-[#9AA9C3]">{updates == null ? "불러오는 중…" : "해당하는 내용이 없어요"}</div>;
    return days.map((d) => (
      <div key={d} className="mb-4">
        <div className="text-[11px] font-black tracking-[0.12em] text-[#8FA0BD] mb-1.5">{d}</div>
        {byDay[d].map((x) => { const { topic, lines } = parseUpdate(x.s); return (
          <div key={x.h} className="mb-2 rounded-xl border border-[#E6EBF3] bg-white px-3.5 py-2.5">
            {topic && <div className="text-[13px] font-black text-[#0F1A30] mb-1">{topic}</div>}
            <ul className="space-y-0.5">{lines.map((l, i) => <li key={i} className="text-[13px] leading-relaxed text-[#2A3852] pl-3 relative"><span className="absolute left-0 top-[9px] w-1 h-1 rounded-full bg-[#9AA9C3]" />{l}</li>)}</ul>
          </div>); })}
      </div>));
  };
  const searching = !!nq;
  // 📖 2026-11-13 자세한 사용법 한 묶음 = 카드 하나(번호 · 제목 · 한 줄 소개 · 움직이는 예시 화면 · [이름 | 설명] 표)
  //  items 의 "이름 — 설명"은 두 칸으로 나눠 보여 준다(— 는 화면에 나오지 않는다). 검색 중(only)에는 맞는 줄만
  const Sections = ({ list, only }) => { let no = 0; return (list || []).map((sec, si) => {
    const items = only ? sec.items.filter((t) => hit(`${sec.title} ${t}`, only)) : sec.items;
    if (!items.length) return null;
    no += 1;
    return (
      <section key={si} className="mb-6 rounded-2xl border border-[#DCE3EE] bg-white overflow-hidden shadow-[0_4px_14px_rgba(15,26,48,.05)]">
        <header className="px-5 py-4 bg-[#F7F9FC] border-b border-[#E6EBF3] flex items-start gap-3">
          <span className="shrink-0 w-8 h-8 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black grid place-items-center tabular-nums">{no}</span>
          <div className="min-w-0">
            <h3 className="text-[17px] font-black text-[#0F1A30] leading-tight">{sec.title}</h3>
            {sec.intro && !only && <p className="text-[14px] text-[#4A5A75] leading-relaxed mt-1">{sec.intro}</p>}
          </div>
        </header>
        {sec.demo && !only && hasHelpDemo(sec.demo) && <div className="px-5 pt-5"><HelpDemo id={sec.demo} /></div>}
        <dl className="px-5 py-3">
          {items.map((t, i) => { const k = t.indexOf(" — "); const name = k > 0 ? t.slice(0, k) : ""; const desc = k > 0 ? t.slice(k + 3) : t; return (
            <div key={i} className={`grid grid-cols-1 sm:grid-cols-[minmax(170px,230px)_minmax(0,1fr)] gap-x-5 gap-y-1 py-3.5 ${i ? "border-t border-[#EEF1F6]" : ""}`}>
              {name ? <dt className="text-[14.5px] font-black text-[#0F1A30] leading-snug flex items-start gap-2"><span className="mt-[7px] w-1.5 h-1.5 rotate-45 bg-[#2D4C82] shrink-0" />{name}</dt> : <dt className="hidden sm:block" />}
              <dd className="text-[14.5px] leading-[1.75] text-[#2A3852]">{desc}</dd>
            </div>); })}
        </dl>
      </section>);
  }); };
  const visibleMenus = new Set(menus.map((e) => e.menu));
  const foundDetail = searching && !isCho(nq) ? [["__common", "공통 사용법", HELP_COMMON], ...Object.keys(HELP_DETAIL).filter((m) => visibleMenus.has(m)).map((m) => [m, menuName(m), HELP_DETAIL[m]])].filter(([, , list]) => list.some((sec) => sec.items.some((t) => hit(`${sec.title} ${t}`, nq)))) : [];
  const foundMenus = searching ? index.filter((e) => !MASTER_MENUS.has(e.menu) && (hit(titleOf(e), nq) || (!e.sub && hit(descOf(e.menu), nq)) || (!e.sub && hit(helpTextOf(e.menu), nq)) || (!e.sub && (MENU_TOURS[e.menu] || []).some((s) => hit(`${s.title} ${s.text}`, nq))))) : [];
  const foundUpd = searching && !isCho(nq) ? (updates || []).filter((x) => hit(x.s, nq)) : [];
  const go = (e) => { onClose(); onGo(e); };
  return createPortal(
    <div data-kp-dialog data-kp="help-center" className="fixed inset-0 z-[2147482900] flex items-center justify-center p-4" style={{ fontFamily: FONT }}>
      <div className="absolute inset-0 bg-[#060C1A]/55 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-[min(1360px,97vw)] h-[min(920px,94vh)] rounded-2xl bg-[#F4F6FA] shadow-[0_30px_80px_rgba(6,12,26,.5)] overflow-hidden flex flex-col">
        <div className="flex items-center gap-3 px-6 h-[68px] text-white shrink-0" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div className="min-w-0">
            <div className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">HELP CENTER</div>
            <div className="text-[19px] font-black leading-tight whitespace-nowrap">도움말 센터</div>
          </div>
          <div className="ml-4 flex-1 max-w-[520px] flex items-center gap-2 h-11 px-3.5 rounded-xl bg-white/10 ring-1 ring-white/20">
            <SearchIco />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="궁금한 기능을 검색하세요 (예: 인수증, 복사, 정산)" autoComplete="off" className="flex-1 bg-transparent outline-none text-[15px] font-bold placeholder:text-white/45" />
            {q && <button type="button" onClick={() => setQ("")} className="text-white/60 hover:text-white text-[12px] font-black">지우기</button>}
          </div>
          <button type="button" onClick={onClose} className="ml-auto h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 ring-1 ring-white/25 text-[14px] font-black whitespace-nowrap">닫기</button>
        </div>
        <div className="flex-1 min-h-0 flex">
          <div className="w-[268px] shrink-0 overflow-y-auto border-r border-[#E1E7F0] bg-white p-3 hidden sm:block">
            <button type="button" onClick={() => { setSel("__new"); setQ(""); }} className={`w-full text-left px-3.5 h-11 rounded-xl text-[14.5px] font-black mb-1 whitespace-nowrap ${!searching && sel === "__new" ? "bg-[#0F1A30] text-white" : "text-[#1B2B4B] hover:bg-[#EEF3FB]"}`}>새 기능 · 바뀐 점</button>
            <button type="button" onClick={() => { setSel("__common"); setQ(""); }} className={`w-full text-left px-3.5 h-11 rounded-xl text-[14.5px] font-black mb-1 whitespace-nowrap ${!searching && sel === "__common" ? "bg-[#0F1A30] text-white" : "text-[#1B2B4B] hover:bg-[#EEF3FB]"}`}>처음 사용 안내 · 공통 사용법</button>
            <div className="px-3.5 pt-4 pb-2 mt-2 border-t border-[#EEF1F6] text-[12px] font-black tracking-[0.14em] text-[#8FA0BD]">메뉴별 사용법</div>
            {menus.map((e) => (
              <button key={e.id} type="button" onClick={() => { setSel(e.menu); setQ(""); }} className={`w-full text-left px-3.5 h-10 rounded-xl text-[14.5px] font-bold whitespace-nowrap mb-0.5 ${!searching && sel === e.menu ? "bg-[#0F1A30] text-white" : "text-[#2A3852] hover:bg-[#EEF3FB]"}`}>{e.label}</button>
            ))}
          </div>
          <div className="flex-1 min-w-0 overflow-y-auto px-6 sm:px-8 py-6">
            {searching ? (
              <>
                <div className="text-[15px] font-black text-[#0F1A30] mb-3">"{q.trim()}" 검색 결과</div>
                {!!foundMenus.length && <div className="mb-5">
                  <div className="text-[11px] font-black tracking-[0.12em] text-[#8FA0BD] mb-1.5">메뉴 · 화면</div>
                  <div className="grid grid-cols-2 gap-2">{foundMenus.slice(0, 24).map((e) => (
                    <button key={e.id} type="button" onClick={() => go(e)} className="text-left rounded-xl border border-[#E6EBF3] bg-white px-3.5 py-2.5 hover:border-[#2D4C82] hover:bg-[#F7FAFF]">
                      <div className="text-[13.5px] font-black text-[#0F1A30] truncate">{titleOf(e)}</div>
                      <div className="text-[12px] text-[#7A89A3] truncate">{e.sub ? "누르면 이 화면으로 이동" : descOf(e.menu) || "누르면 이 화면으로 이동"}</div>
                    </button>))}</div>
                </div>}
                {foundDetail.map(([m, label, list]) => (
                  <div key={m} className="mb-2">
                    <div className="text-[11px] font-black tracking-[0.12em] text-[#8FA0BD] mb-1.5">사용법 · {label}</div>
                    <Sections list={list} only={nq} />
                  </div>))}
                <div className="text-[11px] font-black tracking-[0.12em] text-[#8FA0BD] mb-1.5">새 기능 · 바뀐 점</div>
                <UpdateList list={foundUpd} />
              </>
            ) : sel === "__common" ? (
              <>
                <div className="text-[24px] font-black text-[#0F1A30] tracking-tight">처음 사용 안내 · 공통 사용법</div>
                <div className="text-[15px] text-[#4A5A75] mt-1 mb-6">어느 화면에서나 똑같이 쓰는 기능입니다. 메뉴별 사용법은 왼쪽에서 메뉴를 고르세요.</div>
                <Sections list={HELP_COMMON} />
              </>
            ) : sel === "__new" ? (
              <>
                <div className="text-[24px] font-black text-[#0F1A30] tracking-tight">새 기능 · 바뀐 점</div>
                <div className="text-[15px] text-[#4A5A75] mt-1 mb-6">프로그램이 바뀔 때마다 자동으로 쌓입니다. 왼쪽에서 메뉴를 고르면 그 메뉴의 사용법과 관련 내용만 볼 수 있어요.</div>
                <UpdateList list={updates || []} limit={120} />
              </>
            ) : (() => {
              const e = menus.find((x) => x.menu === sel); if (!e) return null;
              const steps = (MENU_TOURS[sel] || []); const subs = subsOf(sel); // 🛠 2026-11-13 메뉴별 '바뀐 점' 목록은 뺐다(사용법만)
              return (
                <>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="text-[24px] font-black text-[#0F1A30] tracking-tight">{e.label}</div>
                    <button type="button" onClick={() => go(e)} className="h-9 px-4 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black hover:bg-[#1B2B4B]">이 메뉴 열기</button>
                  </div>
                  {descOf(sel) && <div className="text-[15px] text-[#4A5A75] leading-relaxed mb-6">{String(descOf(sel)).replace(/\s+—\s+/g, ": ")}</div>}
                  {!!(HELP_DETAIL[sel] || []).length && <div className="mb-3">
                    <div className="text-[12.5px] font-black tracking-[0.12em] text-[#8FA0BD] mb-2.5">자세한 사용법</div>
                    <Sections list={HELP_DETAIL[sel]} />
                  </div>}
                  {!!steps.length && !(HELP_DETAIL[sel] || []).length && <div className="mb-5">
                    <div className="text-[11px] font-black tracking-[0.12em] text-[#8FA0BD] mb-1.5">이렇게 써요</div>
                    <div className="space-y-2">{steps.map((s, i) => (
                      <div key={i} className="rounded-xl border border-[#E6EBF3] bg-white px-3.5 py-2.5">
                        <div className="text-[13px] font-black text-[#0F1A30]">{s.title}</div>
                        <div className="text-[13px] text-[#2A3852] leading-relaxed">{s.text}</div>
                      </div>))}</div>
                  </div>}
                  {!!subs.length && <div className="mb-5">
                    <div className="text-[11px] font-black tracking-[0.12em] text-[#8FA0BD] mb-1.5">이 메뉴 안의 화면 ({subs.length})</div>
                    <div className="flex flex-wrap gap-1.5">{subs.map((x) => (
                      <button key={x.id} type="button" onClick={() => go(x)} title="누르면 이 화면으로 이동" className="h-8 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-bold text-[#1B2B4B] hover:border-[#2D4C82] hover:bg-[#F7FAFF]">{x.sub}</button>))}</div>
                  </div>}
                </>);
            })()}
          </div>
        </div>
      </div>
    </div>, document.body);
}

// ───────────────────────── 상단바 버튼 + 자주 쓰는 메뉴 줄 ─────────────────────────
// 여는 신호 — 어디서든 window.dispatchEvent(new Event("kp-quick-search")) / "kp-help-center"
export function QuickSearchButton() {
  return (
    <button type="button" data-kp="quick-search-btn" onClick={() => window.dispatchEvent(new Event("kp-quick-search"))} title="메뉴 · 기능 찾기 (Ctrl + K)"
      className="kp-chip-btn text-[12px] transition inline-flex items-center gap-1.5"><SearchIco size={13} />검색<span className="hidden min-[1500px]:inline text-[10px] font-black opacity-60">Ctrl K</span></button>
  );
}

// menus: 지금 이 계정에 보이는 상단 메뉴 · onGo(menu, code, key): 그 화면으로 이동
export default function QuickNav({ menus = [], menu = "", onGo }) {
  const index = React.useMemo(() => buildNavIndex(menus), [menus.join("|"), menu]); // eslint-disable-line react-hooks/exhaustive-deps
  const favs = useFavs();
  const open = usePref("favOpen") !== false; // 처음엔 펴 둔다
  const [pal, setPal] = React.useState(false);
  const [help, setHelp] = React.useState(null);
  React.useEffect(() => { pushRecent(menu); }, [menu]);
  React.useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() === "k") { e.preventDefault(); setPal((v) => !v); } };
    const openPal = () => setPal(true); const openHelp = () => setHelp({});
    window.addEventListener("keydown", onKey); window.addEventListener("kp-quick-search", openPal); window.addEventListener("kp-help-center", openHelp);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("kp-quick-search", openPal); window.removeEventListener("kp-help-center", openHelp); };
  }, []);
  const go = (e) => { setPal(false); pushRecent(e.menu); onGo?.(e.menu, e.code, e.key); };
  const byId = new Map(index.map((e) => [e.id, e]));
  const favRows = favs.map((id) => byId.get(id)).filter(Boolean);
  const curId = byId.has(menu) ? menu : "";
  return (
    <>
      {/* 헤더 아래 빈 줄(24px)에 놓는다 — 접으면 화면 높이가 그대로 */}
      <div data-kp="fav-bar" className={`relative z-40 px-6 flex items-center gap-1.5 ${open ? "-mt-[18px] mb-2 min-h-[30px] flex-wrap" : "-mt-[22px] h-[22px]"}`} style={{ fontFamily: FONT }}>
        <button type="button" data-kp="fav-toggle" onClick={() => setPref("favOpen", !open)} title={open ? "자주 쓰는 메뉴 접기" : "자주 쓰는 메뉴 펴기"}
          className={`shrink-0 inline-flex items-center gap-1 rounded-full font-black text-[#5B6B85] hover:text-[#0F1A30] ${open ? "h-7 px-2.5 text-[12px] bg-white border border-[#DCE3EE]" : "h-[20px] px-2 text-[10.5px] bg-white/80 border border-[#E1E7F0]"}`}>
          <Star on size={open ? 12 : 10} />자주 쓰는 메뉴{!open && favRows.length ? ` ${favRows.length}` : ""}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none" }}><path d="M6 9l6 6 6-6" /></svg>
        </button>
        {open && favRows.map((e) => (
          <span key={e.id} className="group inline-flex items-center h-7 rounded-full bg-white border border-[#DCE3EE] hover:border-[#2D4C82] text-[12.5px] font-bold text-[#1B2B4B] overflow-hidden">
            <button type="button" onClick={() => go(e)} className="h-full pl-3 pr-1.5 hover:bg-[#F3F7FF]">{e.sub ? e.sub.split("›").pop().trim() : e.label}</button>
            <button type="button" title="자주 쓰는 메뉴에서 빼기" onClick={() => toggleFav(favs, e.id)} className="h-full pr-2 pl-0.5 text-[#B9C4D8] hover:text-[#E5484D] text-[13px] leading-none">×</button>
          </span>))}
        {open && !favRows.length && <span className="text-[12px] font-semibold text-[#8FA0BD]">자주 쓰는 화면을 여기에 모아 두세요 →</span>}
        {open && curId && !favs.includes(curId) && (
          <button type="button" data-kp="fav-add" onClick={() => toggleFav(favs, curId)} className="h-7 px-2.5 rounded-full border border-dashed border-[#B9C4D8] text-[12px] font-bold text-[#5B6B85] hover:border-[#2D4C82] hover:text-[#0F1A30]">+ 지금 메뉴({menuName(curId)}) 넣기</button>)}
        {open && <>
          <button type="button" onClick={() => setPal(true)} className="h-7 px-2.5 rounded-full text-[12px] font-bold text-[#5B6B85] hover:text-[#0F1A30] hover:bg-white inline-flex items-center gap-1"><SearchIco size={11} />찾아서 넣기</button>
          <button type="button" data-kp="help-open" onClick={() => setHelp({ menu: curId && !MASTER_MENUS.has(curId) ? curId : undefined })} className="ml-auto h-7 px-3 rounded-full bg-white border border-[#DCE3EE] text-[12px] font-black text-[#1B2B4B] hover:border-[#2D4C82]">도움말 센터</button>
        </>}
      </div>
      {pal && <Palette index={index} favs={favs} onGo={go} onHelp={(init) => { setPal(false); setHelp(init || {}); }} onClose={() => setPal(false)} />}
      {help && <HelpCenter index={index} initial={help} onGo={go} onClose={() => setHelp(null)} />}
    </>
  );
}
