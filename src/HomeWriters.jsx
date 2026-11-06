// ======================= src/HomeWriters.jsx =======================
// ✍ 공지사항·인수인계 글쓰기 화면(2026-10-28) — 작은 팝업 대신 자유게시판처럼 넓은 글쓰기 화면
//  - 공지사항: 작성자는 올리는 사람으로 고정, 관리자(관리자·인사관리자·최고관리자)만 작성
//    ⭐ 2026-11-03 받는 사람: 전체 / 팀 선택(teams) / 직원 선택(targetUids·targetNames) — 한 가지만 저장
//  - 인수인계: 받는 사람 여러 명 / 부서 단위 선택(주소록), 기준 날짜는 공휴일 달력
//    handovers: receivers[{uid,name}], receiverUids[] 추가 — 예전 화면(모바일)과 맞추려고 receiver(이름들)·receiverUid(첫 사람)도 함께 저장
import React from "react";
import { db } from "./firebase";
import { addDoc, collection, doc, serverTimestamp, updateDoc, onSnapshot, setDoc } from "firebase/firestore";
import { ShellIcon } from "./AdminShell";
import { RecipientPicker, useCompanyStaff, compressImage } from "./InternalMail";
import CustomDatePicker from "./CustomDatePicker";
import { useHrOptions } from "./hrConstants"; // ⭐ 2026-11-02 점검 — 고정 TEAM_OPTIONS 대신 회사별 부서 목록 사용
import { isTMUser } from "./staffFilter";
import { createPortal } from "react-dom";
import ObituaryWriter from "./ObituaryWriter"; // ⭐ 2026-11-03 분류 "부고" → 부고장 화면
import { RichTextEditor, htmlToText, textToHtml, sanitizeHtml } from "./richText"; // ⭐ 2026-11-03 글자 꾸미기
import { TimeSelect } from "./kpInputs"; // ⭐ 2026-11-03 예약 게시 시각

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const inp = "w-full px-4 rounded-xl border border-[#DCE3EE] bg-white text-[14.5px] text-[#0F1A30] outline-none focus:border-[#4B6CB7]";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const NOTICE_WRITER_ROLES = ["admin", "totalMaster", "hrManager", "superadmin"];
// ⭐ 2026-11-03 공지 작성 권한 — 회사마다 마스터가 정한다(companySettings/{회사}.noticeWriters)
//   admin(기본) = 관리자·인사관리자·마스터 · exec = + 임원(부서 "임원") · all = 직원 누구나(조회전용·기사·화주 제외)
export const NOTICE_POLICIES = [["admin", "관리자만", "관리자 · 인사관리자 · 마스터"], ["exec", "임원까지", "관리자 + 임원 부서"], ["all", "누구나", "직원 누구나(조회전용 제외)"]];
export function useNoticePolicy(company) {
  const [p, setP] = React.useState("admin");
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(doc(db, "companySettings", company), (x) => setP((x.exists() && x.data()?.noticeWriters) || "admin"), () => setP("admin"));
  }, [company]);
  return p;
}
export async function setNoticePolicy(company, value) {
  await setDoc(doc(db, "companySettings", company), { companyName: company, noticeWriters: value, noticeWritersAt: serverTimestamp() }, { merge: true });
}
export function canWriteNoticeFor(me, policy) {
  const role = me?.role || "";
  if (!role || ["viewer", "driver", "shipper", "cafeUser"].includes(role)) return false;
  if (NOTICE_WRITER_ROLES.includes(role) || ["hrAcct", "allMgr"].includes(role) || me?.isMaster) return true;
  if (policy === "all") return true;
  if (policy === "exec") return String(me?.team || "").trim() === "임원";
  return false;
}
// 공지 작성 권한 고르기(마스터·최고관리자만 보임)
export function NoticePolicyPicker({ company, policy, dark = false }) {
  const [busy, setBusy] = React.useState(false);
  const pick = async (v) => { if (v === policy) return; setBusy(true); try { await setNoticePolicy(company, v); } catch (e) { window.alert(`저장하지 못했습니다: ${e?.message || e}`); } finally { setBusy(false); } };
  return (
    <div className={`inline-flex items-center gap-1 p-1 rounded-xl ${dark ? "bg-white/[0.08] border border-white/15" : "bg-[#EEF2F8] border border-[#E3E8F0]"}`} title="공지사항을 쓸 수 있는 사람(마스터만 바꿀 수 있어요)">
      <span className={`px-2 text-[11.5px] font-black ${dark ? "text-white/60" : "text-[#5B6B85]"}`}>공지 작성</span>
      {NOTICE_POLICIES.map(([k, label, desc]) => (
        <button key={k} type="button" disabled={busy} onClick={() => pick(k)} title={desc}
          className={`h-7 px-2.5 rounded-lg text-[12px] font-black transition ${policy === k ? (dark ? "bg-white text-[#0F1A30]" : "bg-[#0F1A30] text-white") : dark ? "text-white/70 hover:text-white" : "text-[#5B6B85] hover:text-[#0F1A30]"}`}>{label}</button>
      ))}
    </div>
  );
}
export const handoverReceivers = (h) => (Array.isArray(h?.receiverUids) && h.receiverUids.length ? h.receiverUids : h?.receiverUid ? [h.receiverUid] : []);

function Hero({ en, title, desc, children }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] px-4 py-4 md:px-7 md:py-5 text-white flex items-center justify-between gap-4 flex-wrap shadow-[0_14px_32px_rgba(15,26,48,0.25)]"
      style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
      <div>
        <div className="text-[11px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{en}</div>
        <div className="text-[20px] md:text-[24px] font-black mt-0.5">{title}</div>
        <div className="text-[13px] text-white/60 mt-0.5">{desc}</div>
      </div>
      {children}
    </div>
  );
}
const Label = ({ children, hint }) => <div className="text-[13px] font-black text-[#0F1A30] mb-2">{children}{hint && <span className="ml-1.5 text-[12px] font-semibold text-[#9AA9C3]">{hint}</span>}</div>;

// ─────────────────────────── 공지사항 ───────────────────────────
// ⭐ 2026-11-03 공지 작성 화면 개편
//  · 분류 — 남색 드롭다운(↑/↓ 이동 · Enter 선택 · Esc 닫기 · 글자 입력하면 그 글자로 시작하는 항목으로). "부고"를 고르면 부고장 화면(ObituaryWriter)으로 바뀐다
//  · 공개 대상 — 여러 개 고르기(내부용(직원) · 화주사 · 기사). 저장: audiences[] + 예전 화면용 audience("internal" | "shipper")
//  · 직원 선택 — 칩 + [직원 선택] 버튼 → 창에서 검색 · 부서 탭 · 부서 전체 선택 · 체크(저장 필드는 그대로 teams / targetUids / targetNames)
//  · 예약 게시 — publishAt(ms, 한국 시각) + pushPending(서버 sendScheduledNotices가 그 시각에 푸시)
//  · 내용 — 글자 꾸미기(richText): contentHtml(꾸민 글) + content(글자만, 푸시·검색·예전 화면용)
export const NOTICE_CATEGORIES = [["공지사항", "공지사항", "일반 공지"], ["업데이트", "업데이트", "기능·제도 변경"], ["안내", "안내", "참고 안내"], ["긴급", "긴급", "바로 확인이 필요한 글"], ["인사발령", "인사발령", "인사 소식"], ["부고", "부고", "부고장 양식으로 작성(왼쪽 입력 · 오른쪽 미리보기)"]];
export const NOTICE_AUDIENCES = [["internal", "내부용(직원)", "운송사 직원"], ["shipper", "화주사", "화주 화면 공지사항"], ["driver", "기사", "기사 앱 공지사항"]];
// 예전 audience 값으로부터(audiences가 없던 글)
export const audiencesOf = (n) => (Array.isArray(n?.audiences) && n.audiences.length ? n.audiences : n?.audience === "shipper" || n?.audience === "all" ? ["internal", "shipper"] : ["internal"]);
// 예전 화면·규칙이 보는 audience — 화주사가 들어 있으면 "shipper"(화주 화면은 audience=="shipper"로 찾는다), 아니면 "internal"
export const legacyAudience = (list) => (list.includes("shipper") ? "shipper" : "internal");
const pubMsOf = (d, t) => (d ? Date.parse(`${d}T${t || "09:00"}:00+09:00`) || 0 : 0);
const kstParts = (ms) => { const k = new Date(ms + 9 * 3600e3).toISOString(); return { pubDate: k.slice(0, 10), pubTime: k.slice(11, 16) }; };
const pubLabel = (ms) => new Date(ms).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });

// 드롭다운 목록 위치 — 버튼 바로 아래(공간이 없으면 위), 화면 기준 fixed 로 띄워서 스크롤 칸에 잘리지 않게
function usePopover(open, btnRef, menuRef, onClose) {
  const [rect, setRect] = React.useState(null);
  const place = React.useCallback(() => {
    const el = btnRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const up = below < 260 && r.top > below;
    setRect({ left: Math.min(r.left, window.innerWidth - Math.max(r.width, 260) - 8), width: r.width, top: up ? undefined : r.bottom + 6, bottom: up ? window.innerHeight - r.top + 6 : undefined, maxHeight: Math.min(360, Math.max(160, (up ? r.top : below) - 16)) });
  }, [btnRef]);
  React.useEffect(() => {
    if (!open) return undefined;
    place();
    const onScroll = (e) => { if (menuRef.current && e?.target && menuRef.current.contains(e.target)) return; place(); };
    const onDown = (e) => { if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return; onClose(); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", place); };
  }, [open, place]); // eslint-disable-line react-hooks/exhaustive-deps
  return rect;
}
const Chevron = ({ open }) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={`shrink-0 text-[#7A879C] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden><path d="M6 9l6 6 6-6" /></svg>;
const menuCls = "z-[999999] overflow-auto rounded-2xl bg-white border border-[#DCE3EE] shadow-[0_18px_44px_rgba(15,26,48,0.22)] p-1.5";

// 한 개 고르기 — ↑/↓ 는 하이라이트만 옮기고 Enter·클릭으로 확정(부고처럼 화면이 바뀌는 항목을 지나가기만 해도 바뀌지 않게)
export function KpSelect({ value, options, onChange, ariaLabel, className = "", disabledValues = [] }) {
  const [open, setOpen] = React.useState(false);
  const [act, setAct] = React.useState(0);
  const btnRef = React.useRef(null); const menuRef = React.useRef(null); const typed = React.useRef({ s: "", t: 0 });
  const rect = usePopover(open, btnRef, menuRef, () => setOpen(false));
  const idxOf = (v) => Math.max(0, options.findIndex(([k]) => k === v));
  const ok = (i) => options[i] && !disabledValues.includes(options[i][0]);
  const step = (from, d) => { for (let i = from + d; i >= 0 && i < options.length; i += d) if (ok(i)) return i; return from; };
  const openMenu = () => { setAct(idxOf(value)); setOpen(true); };
  const pick = (i) => { if (!ok(i)) return; onChange(options[i][0]); setOpen(false); btnRef.current?.focus(); };
  React.useEffect(() => { if (open) menuRef.current?.children[act]?.scrollIntoView?.({ block: "nearest" }); }, [act, open]);
  const onKey = (e) => {
    if (e.key === "Tab") { setOpen(false); return; }
    if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey) {
      // 글자 입력 — 그 글자로 시작하는 항목으로(이어서 치면 이어진 글자로)
      const now = Date.now(); typed.current = { s: (now - typed.current.t < 700 ? typed.current.s : "") + e.key, t: now };
      const i = options.findIndex(([, l], j) => ok(j) && String(l).startsWith(typed.current.s));
      if (i >= 0) { setAct(i); if (!open) setOpen(true); }
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Enter", " ", "Escape", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    if (!open) { if (e.key !== "Escape") openMenu(); return; }
    if (e.key === "ArrowDown") setAct((i) => step(i, 1));
    else if (e.key === "ArrowUp") setAct((i) => step(i, -1));
    else if (e.key === "Home") setAct(step(-1, 1));
    else if (e.key === "End") setAct(step(options.length, -1));
    else if (e.key === "Enter" || e.key === " ") pick(act);
    else if (e.key === "Escape") { e.stopPropagation(); setOpen(false); }
  };
  const cur = options.find(([k]) => k === value);
  return (
    <>
      <button ref={btnRef} type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} onClick={() => (open ? setOpen(false) : openMenu())} onKeyDown={onKey}
        className={`h-[46px] w-full px-4 rounded-xl border bg-white flex items-center justify-between gap-2 text-left outline-none transition ${open ? "border-[#4B6CB7] ring-4 ring-[#4B6CB7]/12" : "border-[#DCE3EE] hover:border-[#4B6CB7] focus:border-[#4B6CB7]"} ${className}`}>
        <span className="min-w-0 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${value === "부고" ? "bg-[#1A1A1A]" : value === "긴급" ? "bg-[#0F1A30]" : "bg-[#8FB0F0]"}`} />
          <span className="truncate text-[14.5px] font-black text-[#0F1A30]">{cur ? cur[1] : "선택"}</span>
        </span>
        <Chevron open={open} />
      </button>
      {open && rect && createPortal(
        <div ref={menuRef} role="listbox" data-kp-popup="1" onMouseDown={(e) => e.preventDefault()} className={menuCls}
          style={{ position: "fixed", left: rect.left, top: rect.top, bottom: rect.bottom, minWidth: Math.max(rect.width, 240), maxHeight: rect.maxHeight }}>
          {options.map(([k, l, d], i) => {
            const dis = !ok(i); const on = k === value; const hi = i === act;
            return (
              <div key={k} role="option" aria-selected={on} aria-disabled={dis} onMouseEnter={() => !dis && setAct(i)} onClick={() => pick(i)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer select-none ${dis ? "opacity-40 cursor-not-allowed" : hi ? "bg-[#0F1A30] text-white" : "text-[#0F1A30] hover:bg-[#F3F6FB]"}`}>
                <span className="flex-1 min-w-0"><span className="block text-[14px] font-black leading-tight">{l}</span>{d && <span className={`block text-[11.5px] leading-tight mt-0.5 ${hi ? "text-white/60" : "text-[#9AA9C3]"}`}>{dis ? "수정 중에는 바꿀 수 없어요" : d}</span>}</span>
                {on && <span className={`text-[13px] font-black ${hi ? "text-[#8FB0F0]" : "text-[#2D4C82]"}`}>✓</span>}
              </div>
            );
          })}
        </div>, document.body)}
    </>
  );
}

// 여러 개 고르기 — 칸에는 칩, 목록에는 체크. ↑/↓ 이동 · Enter/Space 체크 · Esc 닫기 · 1개 이상 필수
export function KpMultiSelect({ values, options, onChange, ariaLabel, min = 1 }) {
  const [open, setOpen] = React.useState(false);
  const [act, setAct] = React.useState(0);
  const [warn, setWarn] = React.useState(false);
  const btnRef = React.useRef(null); const menuRef = React.useRef(null);
  const rect = usePopover(open, btnRef, menuRef, () => setOpen(false));
  const toggle = (k) => {
    const on = values.includes(k);
    if (on && values.length <= min) { setWarn(true); setTimeout(() => setWarn(false), 1600); return; }
    onChange(on ? values.filter((x) => x !== k) : options.map(([o]) => o).filter((o) => o === k || values.includes(o)));
  };
  const onKey = (e) => {
    if (e.key === "Tab") { setOpen(false); return; }
    if (!["ArrowDown", "ArrowUp", "Enter", " ", "Escape"].includes(e.key)) return;
    e.preventDefault();
    if (!open) { if (e.key !== "Escape") { setAct(0); setOpen(true); } return; }
    if (e.key === "ArrowDown") setAct((i) => Math.min(options.length, i + 1));
    else if (e.key === "ArrowUp") setAct((i) => Math.max(0, i - 1));
    else if (e.key === "Enter" || e.key === " ") { if (act === options.length) setOpen(false); else toggle(options[act][0]); }
    else if (e.key === "Escape") { e.stopPropagation(); setOpen(false); }
  };
  const chosen = options.filter(([k]) => values.includes(k));
  return (
    <>
      <button ref={btnRef} type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} onClick={() => { setAct(0); setOpen((v) => !v); }} onKeyDown={onKey}
        className={`min-h-[46px] w-full pl-2 pr-3 py-1.5 rounded-xl border bg-white flex items-center gap-2 text-left outline-none transition ${open ? "border-[#4B6CB7] ring-4 ring-[#4B6CB7]/12" : "border-[#DCE3EE] hover:border-[#4B6CB7] focus:border-[#4B6CB7]"}`}>
        <span className="flex-1 min-w-0 flex flex-wrap gap-1">
          {chosen.map(([k, l]) => <span key={k} className="h-[30px] px-2.5 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black inline-flex items-center whitespace-nowrap">{l}</span>)}
        </span>
        <Chevron open={open} />
      </button>
      {open && rect && createPortal(
        <div ref={menuRef} role="listbox" aria-multiselectable="true" data-kp-popup="1" onMouseDown={(e) => e.preventDefault()} className={menuCls}
          style={{ position: "fixed", left: rect.left, top: rect.top, bottom: rect.bottom, minWidth: Math.max(rect.width, 260), maxHeight: rect.maxHeight }}>
          <div className="px-3 pt-1.5 pb-1 text-[10.5px] font-extrabold tracking-[0.22em] text-[#9AA9C3]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>AUDIENCE · 여러 개 선택</div>
          {options.map(([k, l, d], i) => {
            const on = values.includes(k); const hi = i === act;
            return (
              <div key={k} role="option" aria-selected={on} onMouseEnter={() => setAct(i)} onClick={() => toggle(k)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer select-none ${hi ? "bg-[#F1F5FC]" : ""}`}>
                <span className={`w-5 h-5 rounded-md border-2 grid place-items-center shrink-0 transition ${on ? "bg-[#0F1A30] border-[#0F1A30]" : "bg-white border-[#C9D2E0]"}`}>
                  {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8FB0F0" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>}
                </span>
                <span className="flex-1 min-w-0"><span className="block text-[14px] font-black text-[#0F1A30] leading-tight">{l}</span><span className="block text-[11.5px] text-[#9AA9C3] leading-tight mt-0.5">{d}</span></span>
              </div>
            );
          })}
          <div className="flex items-center justify-between gap-2 px-2 pt-2 mt-1 border-t border-[#EEF1F6]">
            <span className={`text-[11.5px] font-bold ${warn ? "text-[#B42318]" : "text-[#9AA9C3]"}`}>{warn ? "1개 이상 골라야 합니다" : `${values.length}개 선택`}</span>
            <button type="button" onMouseEnter={() => setAct(options.length)} onClick={() => setOpen(false)} className={`h-8 px-3.5 rounded-lg text-[12.5px] font-black ${act === options.length ? "bg-[#2D4C82] text-white" : "bg-[#0F1A30] text-white"}`}>완료</button>
          </div>
        </div>, document.body)}
    </>
  );
}

export function NoticeWriter({ me, company, initial, onCancel, onSaved }) {
  const [audiences, setAudiences] = React.useState(() => audiencesOf(initial));
  const [category, setCategory] = React.useState(initial?.category || "공지사항");
  const [title, setTitle] = React.useState(initial?.title || "");
  const [html, setHtml] = React.useState(() => initial?.contentHtml || textToHtml(initial?.content || ""));
  const [image, setImage] = React.useState(initial?.image || "");
  const [teams, setTeams] = React.useState(Array.isArray(initial?.teams) ? initial.teams : []); // 비면 전체 직원
  // ⭐ 2026-11-03 받는 사람 — 전체 / 팀 선택 / 직원 선택(targetUids). 팀과 직원은 섞지 않는다(한 가지만)
  const initUids = Array.isArray(initial?.targetUids) ? initial.targetUids.filter(Boolean) : [];
  const [mode, setMode] = React.useState(initUids.length ? "staff" : (Array.isArray(initial?.teams) && initial.teams.length ? "team" : "all"));
  const [targets, setTargets] = React.useState(() => new Set(initUids));
  const initNames = React.useMemo(() => { const m = {}; initUids.forEach((u, i) => { m[u] = (initial?.targetNames || [])[i] || ""; }); return m; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const staffAll = useCompanyStaff(mode === "staff" ? company : "");
  // 기사·화주·카페·최고관리자·퇴사·승인 대기는 빼고(작성자 본인은 항상 보이므로 목록에서 뺀다)
  const staff = React.useMemo(() => (staffAll === null ? null : (staffAll || []).filter((u) => u.uid !== me.uid && !["driver", "shipper", "cafeUser", "totalMaster"].includes(u.role) && !isTMUser(u) && u.approved !== false && u.employmentStatus !== "퇴사")), [staffAll, me.uid]);
  const [picker, setPicker] = React.useState(false);
  const [pinned, setPinned] = React.useState(!!initial?.pinned);
  const initPub = Number(initial?.publishAt) || 0;
  const [sched, setSched] = React.useState(() => ({ on: initPub > Date.now(), ...(initPub > 0 ? kstParts(initPub) : { pubDate: "", pubTime: "" }) }));
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef(null);
  // ⭐ 2026-11-02 점검 — 직책·부서 설정에서 회사가 추가한 부서도 공개 대상으로 고를 수 있게 useHrOptions 사용
  const { teams: teamOptions } = useHrOptions(company);
  const internal = audiences.includes("internal");
  const editing = !!initial?.id;

  // ⭐ 2026-11-03 분류 "부고" — 부고장 화면(왼쪽 입력 · 오른쪽 미리보기)으로. 이미 올린 부고를 고칠 때도 이 화면
  const catPicker = (
    <KpSelect ariaLabel="분류" value={category} options={NOTICE_CATEGORIES} onChange={setCategory}
      disabledValues={editing ? (initial?.obit ? NOTICE_CATEGORIES.map(([k]) => k).filter((k) => k !== "부고") : ["부고"]) : []} />
  );
  if (category === "부고") {
    return (
      <div className="space-y-3">
        {!initial?.obit && (
          <div className="rounded-2xl bg-white border border-[#E3E8F0] px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-[13px] font-black text-[#0F1A30]">분류</span>
            <div className="w-[220px]">{catPicker}</div>
            <span className="text-[12.5px] font-semibold text-[#7A879C]">부고는 부고장 양식으로 작성합니다 · 다른 분류를 고르면 일반 공지 작성으로 돌아갑니다</span>
          </div>
        )}
        <ObituaryWriter company={company} me={me} initial={initial?.obit ? initial : null} onCancel={onCancel} onSaved={onSaved} />
      </div>
    );
  }

  const d = new Date();
  const autoTitle = `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일 ${category}`;
  const pubMs = sched.on ? pubMsOf(sched.pubDate, sched.pubTime) : 0;
  const save = async () => {
    const safe = sanitizeHtml(html || "");
    const text = htmlToText(safe);
    if (!text.trim()) { window.alert("내용을 입력해 주세요."); return; }
    if (sched.on && !pubMs) { window.alert("예약 게시 날짜를 골라 주세요."); return; }
    if (sched.on && pubMs <= Date.now()) { window.alert("예약 시각이 이미 지났습니다. 지금 게시하려면 '예약 게시'를 끄세요."); return; }
    // ⭐ 2026-11-03 받는 사람 — 직원 선택이면 teams는 비우고 targetUids·targetNames만, 팀 선택이면 teams만, 전체면 둘 다 비움
    const pickedUids = internal && mode === "staff" ? [...targets] : [];
    if (internal && mode === "staff" && !pickedUids.length) { window.alert("받는 직원을 1명 이상 골라 주세요."); return; }
    if (internal && mode === "team" && !teams.length) { window.alert("받을 팀을 1개 이상 골라 주세요. (전체 직원에게는 [전체]를 고르세요)"); return; }
    setBusy(true);
    try {
      const nameOf = (uid) => { const u = (staffAll || []).find((x) => x.uid === uid); return (u && (u.name || u.email)) || initNames[uid] || ""; };
      // 예약이면 그 시각에 서버(sendScheduledNotices)가 푸시 — 수정할 때는 아직 푸시 안 한 예약 글만
      const pushPending = !!pubMs && (!editing || initial?.pushPending === true || initPub > Date.now());
      const data = { title: (title.trim() || autoTitle).slice(0, 200), category, content: text, contentHtml: safe, audience: legacyAudience(audiences), audiences, image: image || null,
        teams: internal && mode === "team" ? teams : [], targetUids: pickedUids, targetNames: pickedUids.map(nameOf),
        publishAt: pubMs || 0, pushPending,
        pinned, ...(pinned && !initial?.pinned ? { pinnedAt: Date.now() } : {}) };
      if (editing) await updateDoc(doc(db, "notices", initial.id), { ...data, editedAt: serverTimestamp() });
      else await addDoc(collection(db, "notices"), { ...data, author: me.name, authorUid: me.uid, createdAt: serverTimestamp(), companyName: company });
      onSaved?.();
    } catch (e) { window.alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const submitLabel = busy ? "저장 중…" : editing ? "수정 저장" : pubMs ? "예약 등록" : "공지 등록";
  const byUid = new Map((staff || []).map((u) => [u.uid, u]));
  const chosen = [...targets].map((uid) => byUid.get(uid) || { uid, name: initNames[uid] || "(목록에 없는 직원)", _gone: true });
  return (
    <div className="space-y-4">
      <Hero en="BOARD · NOTICE · WRITE" title={editing ? "공지사항 수정" : "공지사항 작성"} desc="관리자만 작성할 수 있습니다 · 작성자는 올리는 사람으로 자동 기록됩니다">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="h-11 px-5 rounded-xl bg-white/10 border border-white/20 text-white text-[13.5px] font-bold">취소</button>
          <button type="button" onClick={save} disabled={busy} className="h-11 px-6 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black inline-flex items-center gap-2 disabled:opacity-50"><ShellIcon name="send" size={15} />{submitLabel}</button>
        </div>
      </Hero>
      {/* ⭐ 2026-10-29 — "누구에게 → 어떤 글 → 제목 → 내용" 순서로 위에서 아래로만 입력하면 된다. */}
      <div className="rounded-2xl bg-white border border-[#E3E8F0] p-5 sm:p-6 space-y-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-end">
          <div className="min-w-0">
            <Label hint="(여러 개 선택)">공개 대상</Label>
            <KpMultiSelect ariaLabel="공개 대상" values={audiences} options={NOTICE_AUDIENCES} onChange={setAudiences} />
          </div>
          <div className="min-w-0">
            <Label>분류</Label>
            {catPicker}
          </div>
          <div className="flex items-center gap-2.5 h-[46px] px-3 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0]" title="작성자는 올리는 사람으로 자동 기록됩니다">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[13px] font-black" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}>{String(initial?.author || me.name || "?").slice(0, 1)}</span>
            <div className="leading-tight"><div className="text-[13.5px] font-black text-[#0F1A30]">{initial?.author || me.name}</div><div className="text-[11px] text-[#7A879C]">작성자 · 자동</div></div>
          </div>
        </div>
        {internal && (
          <div>
            {/* ⭐ 2026-11-03 받는 사람 — 전체 / 팀 선택 / 직원 선택(고른 직원·작성자·관리자만 보이고, 휴대폰 알림도 고른 직원에게만) */}
            <Label hint={mode === "all" ? "(운송사 직원 전체에게 보입니다)" : mode === "team" ? "(고른 팀에만 보입니다 · 작성자·관리자는 항상 보임)" : `(고른 직원에게만 보입니다 · 작성자·관리자는 항상 보임${targets.size ? ` · ${targets.size}명` : ""})`}>받는 직원</Label>
            <div role="radiogroup" aria-label="받는 직원" className="inline-grid grid-cols-3 gap-1 p-1 mb-3 rounded-xl bg-[#F1F4F9] border border-[#E3E8F0] w-full max-w-[420px]">
              {[["all", "전체"], ["team", "팀 선택"], ["staff", "직원 선택"]].map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => { setMode(v); if (v === "staff" && !targets.size) setPicker(true); }}
                  className={`h-9 rounded-lg text-[13px] font-black transition ${mode === v ? "bg-[#0F1A30] text-white shadow-[0_4px_12px_rgba(15,26,48,0.25)]" : "text-[#3A4A66] hover:bg-white"}`}>{l}</button>
              ))}
            </div>
            {mode === "staff" && (
              <div className="min-h-[50px] px-2.5 py-2 rounded-xl border border-[#DCE3EE] bg-white flex flex-wrap gap-1.5 items-center">
                {chosen.length ? <>
                  {chosen.slice(0, 12).map((u) => (
                    <span key={u.uid} className={`h-8 pl-3 pr-1 rounded-lg border text-[12.5px] font-bold inline-flex items-center gap-1 max-w-full ${u._gone ? "bg-[#F5F6F8] border-[#E3E8F0] text-[#9AA9C3]" : "bg-[#EEF3FB] border-[#D5E0F2] text-[#1B2B4B]"}`}>
                      <span className="truncate">{u.name || u.email}{u.team ? <span className="text-[#7A879C] font-semibold"> · {u.team}</span> : null}</span>
                      <button type="button" aria-label={`${u.name || ""} 빼기`} onClick={() => setTargets((p) => { const n = new Set(p); n.delete(u.uid); return n; })} className="w-6 h-6 shrink-0 text-[#7A879C] hover:text-[#0F1A30]">✕</button>
                    </span>
                  ))}
                  {chosen.length > 12 && <span className="h-8 px-2.5 rounded-lg bg-[#F1F4F9] text-[12.5px] font-black text-[#5B6B85] inline-flex items-center">+{chosen.length - 12}명</span>}
                </> : <span className="text-[13px] text-[#9AA9C3] px-1">받을 직원을 고르세요</span>}
                <button type="button" onClick={() => setPicker(true)} className="ml-auto h-9 px-4 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black inline-flex items-center gap-1.5 hover:bg-[#1B2B4B]">
                  <ShellIcon name="users" size={14} />직원 선택{targets.size ? ` · ${targets.size}명` : ""}
                </button>
              </div>
            )}
            {mode === "team" && (
            <div className="flex flex-wrap gap-1.5">
              {/* ⭐ 2026-11-02 점검 — 회사별 부서 목록 + (숨김 처리된 등) 이미 선택돼 있던 팀도 표시해 해제할 수 있게 */}
              {[...teamOptions, ...teams.filter((t) => !teamOptions.includes(t))].map((t) => {
                const on = teams.includes(t);
                return <button key={t} type="button" onClick={() => setTeams((p) => (on ? p.filter((x) => x !== t) : [...p, t]))} className={`h-10 px-4 rounded-xl text-[13px] font-black border ${on ? "bg-[#2D4C82] text-white border-[#2D4C82]" : "bg-white text-[#3A4A66] border-[#DCE3EE] hover:border-[#2D4C82]"}`}>{on ? "✓ " : ""}{t}</button>;
              })}
            </div>
            )}
          </div>
        )}
        {picker && <StaffPickerModal staff={staff} selected={targets} nameHint={initNames} onClose={() => setPicker(false)} onDone={(s) => { setTargets(s); setPicker(false); }} />}
        <label className="inline-flex items-center gap-2 text-[13.5px] font-black text-[#0F1A30] cursor-pointer">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="w-4 h-4 accent-[#1B2B4B]" />
          • 상단 고정 <span className="text-[12px] font-semibold text-[#9AA9C3]">(최대 5개 — 넘으면 오래된 고정은 목록으로 내려갑니다)</span>
        </label>
        {/* ⭐ 2026-11-03 예약 게시 — 정한 시각부터 보이고(그 전에는 작성자·관리자만 "예약" 표시로), 푸시도 그때 */}
        <div className={`flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border ${sched.on ? "bg-[#F5F8FD] border-[#C9D6EE]" : "bg-white border-[#E3E8F0]"}`}>
          <label className="inline-flex items-center gap-2 text-[14px] font-black text-[#0F1A30] cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={sched.on} onChange={(e) => setSched((p) => (e.target.checked ? { ...p, on: true, ...(p.pubDate ? {} : kstParts(Math.ceil((Date.now() + 3600e3) / 600e3) * 600e3)) } : { ...p, on: false }))} className="w-4 h-4 accent-[#1B2B4B]" />
            예약 게시 <span className="text-[13px] font-semibold text-[#9AA9C3]">(정한 시각에 올라가고 푸시도 그때)</span>
          </label>
          {sched.on && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-[150px]"><CustomDatePicker value={sched.pubDate || ""} onChange={(e) => setSched((p) => ({ ...p, pubDate: e.target.value }))} className="h-10 w-full px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold" /></span>
              <TimeSelect value={sched.pubTime || ""} onChange={(v) => setSched((p) => ({ ...p, pubTime: v }))} emptyLabel="시각 선택" minuteStep={10} />
              {pubMs > 0 && <span className={`text-[13px] font-bold ${pubMs <= Date.now() ? "text-[#B42318]" : "text-[#2D4C82]"}`}>{pubLabel(pubMs)}에 게시{pubMs <= Date.now() ? " · 이미 지난 시각" : ""}</span>}
            </div>
          )}
        </div>
        <div>
          <Label hint="(비우면 날짜 + 분류로 자동)">제목</Label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={autoTitle} className={`${inp} h-12 text-[16px] font-bold`} />
        </div>
        <div>
          <Label>내용</Label>
          <RichTextEditor value={html} onChange={setHtml} placeholder="공지할 내용을 입력하세요 — 위 단추로 굵게·크기·색·형광펜·정렬·목록" minHeight={360} />
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <Label hint="(1장)">이미지</Label>
            <div className="flex items-center gap-3">
              {image ? (
                <div className="relative w-40 h-28 rounded-xl overflow-hidden border border-[#E3E8F0]">
                  <img src={image} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setImage("")} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[#0F1A30]/80 text-white text-[12px]">✕</button>
                </div>
              ) : <button type="button" onClick={() => fileRef.current?.click()} className="w-40 h-28 rounded-xl border-2 border-dashed border-[#C9D2E0] text-[#7A879C] text-[13px] font-bold hover:border-[#4B6CB7]">+ 이미지 첨부</button>}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setImage(await compressImage(f, 1400, 0.8).catch(() => "")); }} />
            </div>
          </div>
          {/* 입력을 마친 자리에서 바로 등록 — 위 머리줄까지 마우스를 올리지 않아도 된다 */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCancel} className="h-11 px-5 rounded-xl bg-white border border-[#DCE3EE] text-[#3A4A66] text-[13.5px] font-bold">취소</button>
            <button type="button" onClick={save} disabled={busy} className="h-11 px-6 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black inline-flex items-center gap-2 disabled:opacity-50"><ShellIcon name="send" size={15} />{submitLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ⭐ 2026-11-03 공지 받는 직원 고르기 — 창(모달): 검색 · 부서 탭 · 부서 전체 선택 · 체크 · 선택 수 · [완료]
//  키보드: 검색칸에서 ↓ 로 목록으로 · ↑/↓ 이동 · Enter/Space 체크 · Esc 닫기(바꾼 것 버림)
export function StaffPickerModal({ staff, selected, onDone, onClose, nameHint = {} }) {
  const [sel, setSel] = React.useState(() => new Set(selected));
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState("__all");
  const [act, setAct] = React.useState(-1);
  const listRef = React.useRef(null); const searchRef = React.useRef(null);
  const people = staff || [];
  const teamOf = (u) => String(u.team || "").trim() || "미배정";
  const teams = React.useMemo(() => [...new Set(people.map(teamOf))].sort((a, b) => (a === "미배정") - (b === "미배정") || a.localeCompare(b, "ko")), [people]);
  const kw = q.trim().toLowerCase();
  const hit = (u) => !kw || [u.name, u.email, u.team, u.position].some((v) => String(v || "").toLowerCase().includes(kw));
  const groups = React.useMemo(() => teams.filter((t) => tab === "__all" || t === tab).map((t) => [t, people.filter((u) => teamOf(u) === t && hit(u))]).filter(([, l]) => l.length), [teams, tab, people, kw]); // eslint-disable-line react-hooks/exhaustive-deps
  // 키보드로 옮겨 다닐 줄 — 부서 머리줄(전체 선택)과 직원 줄
  const lines = React.useMemo(() => groups.flatMap(([t, l]) => [{ kind: "team", t, uids: l.map((u) => u.uid) }, ...l.map((u) => ({ kind: "user", u }))]), [groups]);
  const toggle = (uids, on) => setSel((p) => { const n = new Set(p); uids.forEach((x) => (on ? n.add(x) : n.delete(x))); return n; });
  const hitLine = (ln) => { if (!ln) return; if (ln.kind === "team") toggle(ln.uids, !ln.uids.every((x) => sel.has(x))); else toggle([ln.u.uid], !sel.has(ln.u.uid)); };
  React.useEffect(() => { searchRef.current?.focus(); }, []);
  React.useEffect(() => { setAct(-1); }, [q, tab]);
  React.useEffect(() => { if (act >= 0) listRef.current?.querySelector(`[data-ln="${act}"]`)?.scrollIntoView({ block: "nearest" }); }, [act]);
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setAct((i) => Math.min(lines.length - 1, i + 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setAct((i) => Math.max(-1, i - 1)); if (act <= 0) searchRef.current?.focus(); return; }
    if ((e.key === "Enter" || (e.key === " " && act >= 0)) && act >= 0) { e.preventDefault(); hitLine(lines[act]); return; }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onDone(sel); }
  };
  const tabCount = (t) => people.filter((u) => (t === "__all" || teamOf(u) === t) && sel.has(u.uid)).length;
  const gone = [...sel].filter((uid) => !people.some((u) => u.uid === uid));
  let li = -1;
  return createPortal(
    <div className="fixed inset-0 z-[99990] bg-[#0B1428]/55 backdrop-blur-[2px] flex items-center justify-center p-3" onMouseDown={onClose} onKeyDown={onKey}>
      <div role="dialog" aria-modal="true" aria-label="받는 직원 선택" className="w-full max-w-[640px] max-h-[88vh] flex flex-col rounded-[22px] bg-white shadow-[0_30px_80px_rgba(11,20,40,0.45)] overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 text-white flex items-center gap-3" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)" }}>
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>RECIPIENTS · SELECT</div>
            <div className="text-[18px] font-black">받는 직원 선택</div>
          </div>
          <div className="text-right leading-tight"><div className="text-[22px] font-black tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{sel.size}</div><div className="text-[11px] text-white/60 font-bold">명 선택</div></div>
          <button type="button" aria-label="닫기" onClick={onClose} className="w-9 h-9 rounded-lg text-white/60 hover:text-white hover:bg-white/10 font-black">✕</button>
        </div>
        <div className="px-5 pt-4 pb-3 space-y-3 border-b border-[#EEF1F6]">
          <div className="relative">
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 부서 · 직책 검색  (↓ 로 목록 이동)" className={`${inp} h-11 pl-10 text-[14px]`} />
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9AA9C3]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="부서">
            {[["__all", "전체"], ...teams.map((t) => [t, t])].map(([k, l]) => {
              const on = tab === k; const c = tabCount(k);
              return <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setTab(k)} className={`h-9 px-3.5 rounded-xl text-[13px] font-black whitespace-nowrap border transition ${on ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE] hover:border-[#4B6CB7]"}`}>{l}{c ? <span className={`ml-1.5 ${on ? "text-[#8FB0F0]" : "text-[#2D4C82]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{c}</span> : null}</button>;
            })}
          </div>
        </div>
        <div ref={listRef} className="flex-1 min-h-[200px] overflow-y-auto px-3 py-2">
          {staff === null ? <div className="py-10 text-center text-[13px] text-[#9AA9C3]">직원 목록 불러오는 중…</div>
            : !groups.length ? <div className="py-10 text-center text-[13px] text-[#9AA9C3]">{kw ? "검색 결과가 없습니다" : "고를 수 있는 직원이 없습니다"}</div>
            : groups.map(([t, list]) => {
              li += 1; const tIdx = li;
              const all = list.every((u) => sel.has(u.uid)); const some = !all && list.some((u) => sel.has(u.uid));
              return (
                <div key={t} className="mb-2">
                  <div data-ln={tIdx} onMouseEnter={() => setAct(tIdx)} onClick={() => hitLine(lines[tIdx])}
                    className={`sticky top-0 z-[1] flex items-center gap-3 px-3 h-10 rounded-xl cursor-pointer select-none ${act === tIdx ? "bg-[#E8EEF9]" : "bg-[#F5F8FD]"}`}>
                    <Box on={all} part={some} />
                    <span className="flex-1 text-[13px] font-black text-[#1B2B4B]">{t} <span className="text-[#9AA9C3] font-bold" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{list.length}</span></span>
                    <span className="text-[11.5px] font-bold text-[#7A879C]">{all ? "부서 전체 해제" : "부서 전체 선택"}</span>
                  </div>
                  {list.map((u) => {
                    li += 1; const idx = li; const on = sel.has(u.uid);
                    return (
                      <div key={u.uid} data-ln={idx} role="checkbox" aria-checked={on} onMouseEnter={() => setAct(idx)} onClick={() => toggle([u.uid], !on)}
                        className={`flex items-center gap-3 pl-6 pr-3 h-11 rounded-xl cursor-pointer select-none ${act === idx ? "bg-[#F1F5FC] ring-1 ring-[#C9D6EE]" : "hover:bg-[#F8FAFD]"}`}>
                        <Box on={on} />
                        <span className="w-8 h-8 rounded-lg grid place-items-center text-white text-[12.5px] font-black shrink-0" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}>{String(u.name || u.email || "?").slice(0, 1)}</span>
                        <span className="flex-1 min-w-0 truncate text-[14px] font-black text-[#0F1A30]">{u.name || u.email}<span className="ml-1.5 text-[12.5px] font-semibold text-[#7A879C]">{u.position || ""}</span></span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          {gone.length > 0 && <div className="px-3 py-2 text-[12px] text-[#9AA9C3]">목록에 없는 직원 {gone.length}명(퇴사 등)이 선택되어 있습니다 — {gone.map((u) => nameHint[u] || "이름 없음").join(", ")} <button type="button" onClick={() => toggle(gone, false)} className="ml-1 font-black text-[#2D4C82] underline">빼기</button></div>}
        </div>
        <div className="px-5 py-3.5 border-t border-[#EEF1F6] flex items-center gap-2 bg-[#FAFBFD]">
          <span className="text-[13px] font-black text-[#0F1A30] tabular-nums"><span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{sel.size}</span>명 선택 <span className="text-[#9AA9C3] font-bold">/ 전체 {people.length}명</span></span>
          {sel.size > 0 && <button type="button" onClick={() => setSel(new Set())} className="h-9 px-3 rounded-lg text-[12.5px] font-black text-[#7A879C] hover:text-[#0F1A30]">모두 해제</button>}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-bold text-[#3A4A66]">취소</button>
          <button type="button" onClick={() => onDone(sel)} className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black hover:bg-[#1B2B4B]">완료</button>
        </div>
      </div>
    </div>, document.body);
}
const Box = ({ on, part }) => (
  <span className={`w-5 h-5 rounded-md border-2 grid place-items-center shrink-0 transition ${on || part ? "bg-[#0F1A30] border-[#0F1A30]" : "bg-white border-[#C9D2E0]"}`}>
    {on ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8FB0F0" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg> : part ? <span className="w-2.5 h-[3px] rounded bg-[#8FB0F0]" /> : null}
  </span>
);

// ─────────────────────────── 인수인계 ───────────────────────────
export function HandoverWriter({ me, company, initial, onCancel, onSaved }) {
  const staff = useCompanyStaff(company);
  const [to, setTo] = React.useState(() => new Set(handoverReceivers(initial)));
  const [date, setDate] = React.useState(initial?.date || today());
  const [text, setText] = React.useState(initial?.text || "");
  const [busy, setBusy] = React.useState(false);
  const picked = (staff || []).filter((u) => to.has(u.uid));
  const save = async () => {
    if (!picked.length) { window.alert("받는 사람을 골라 주세요."); return; }
    if (!text.trim()) { window.alert("인수인계 내용을 입력해 주세요."); return; }
    setBusy(true);
    try {
      const receivers = picked.map((u) => ({ uid: u.uid, name: u.name || u.email || "" }));
      const data = {
        text, date, receivers, receiverUids: receivers.map((r) => r.uid),
        receiver: receivers.map((r) => r.name).join(", "), receiverUid: receivers[0].uid,
        author: initial?.author || me.name, authorUid: initial?.authorUid || me.uid,
      };
      if (initial?.id) await updateDoc(doc(db, "handovers", initial.id), data);
      else await addDoc(collection(db, "handovers"), { ...data, createdAt: serverTimestamp(), readBy: [], companyName: company });
      onSaved?.();
    } catch (e) { window.alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <Hero en="COMMS · HANDOVER · WRITE" title={initial?.id ? "인수인계 수정" : "인수인계 작성"} desc="여러 명 또는 부서 단위로 넘길 수 있습니다 · 받는 사람마다 확인 여부가 표시됩니다">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="h-11 px-5 rounded-xl bg-white/10 border border-white/20 text-white text-[13.5px] font-bold">취소</button>
          <button type="button" onClick={save} disabled={busy} className="h-11 px-6 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black inline-flex items-center gap-2 disabled:opacity-50"><ShellIcon name="send" size={15} />{busy ? "저장 중…" : initial?.id ? "수정 저장" : `인수인계 등록${picked.length ? ` (${picked.length}명)` : ""}`}</button>
        </div>
      </Hero>
      <div className="kp-writer-split grid gap-5" style={{ gridTemplateColumns: "1fr 400px" }}>
        <div className="rounded-2xl bg-white border border-[#E3E8F0] p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>보내는 사람</Label>
              <div className="h-12 px-4 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] flex items-center gap-2 text-[14.5px]"><b className="text-[#0F1A30]">{initial?.author || me.name}</b><span className="text-[12.5px] text-[#7A879C]">{me.position || ""} · 자동 기록</span></div>
            </div>
            <div>
              <Label>기준 날짜</Label>
              <CustomDatePicker value={date} onChange={(e) => setDate(e.target.value || today())} className={`${inp} h-12 font-bold`} showIcon />
            </div>
          </div>
          <div>
            <Label hint={picked.length ? `${picked.length}명` : ""}>받는 사람</Label>
            <div className="min-h-[48px] px-3 py-2 rounded-xl border border-[#DCE3EE] flex flex-wrap gap-1.5 items-center">
              {picked.length ? picked.map((u) => (
                <span key={u.uid} className="h-8 pl-3 pr-1 rounded-lg bg-[#EEF3FB] border border-[#D5E0F2] text-[13px] font-bold text-[#1B2B4B] inline-flex items-center gap-1">
                  {u.name}<span className="text-[#7A879C] font-semibold">{u.team || ""}</span>
                  <button type="button" onClick={() => setTo((p) => { const n = new Set(p); n.delete(u.uid); return n; })} className="w-6 h-6 text-[#7A879C]">✕</button>
                </span>
              )) : <span className="text-[13.5px] text-[#9AA9C3]">오른쪽 주소록에서 사람이나 부서를 고르세요</span>}
            </div>
          </div>
          <div>
            <Label>인수인계 내용</Label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={16} placeholder={"예)\n· 내일 오전 평택항 상차 3건 — 기사 배정 완료, 도착 확인만 필요\n· ○○물류 운임 정산 요청 회신 대기 중\n· 미배차 2건(오후 상차) 콜 계속 진행 부탁드립니다"} className={`${inp} py-3.5 leading-[1.85] resize-y min-h-[360px]`} />
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-[#E3E8F0] p-5 h-fit">
          <Label hint="부서 이름을 누르면 부서 전체 선택">주소록</Label>
          <RecipientPicker staff={staff} selected={to} setSelected={setTo} excludeUid={me.uid} />
        </div>
      </div>
    </div>
  );
}
