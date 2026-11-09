// ======================= src/contractInputs.jsx =======================
// ⭐ 2026-11-10 계약서 입력 도우미 — 계약서(ContractStudio) 입력칸을 직접 입력 → 드롭다운으로
//  · ComboInput      : 자주 쓰는 값 목록(▾) + 직접 입력(목록에 없는 값도 그대로)
//  · TimeRangeInput  : "09:00 ~ 18:00" — 시작·끝 시간을 프로그램 시간 선택(TimeSelect)으로
//  · BreakRangeInput : "12:00 ~ 13:00 (1시간)" — 휴게 시간(길이 자동 표기)
//  · PickList        : 사람·거래처 찾기 — 검색 + ▾ 전체 목록, multi면 체크해서 여러 명 고르기
//  · useStaffPeople / useClientRows : 같은 회사 직원(가입·수정된 인사 정보 포함) · 기본거래처 목록
import React from "react";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "./firebase";
import { TimeSelect } from "./kpTimePick";

const inp0 = "h-11 w-full px-3 rounded-xl border border-[#D3DBE8] bg-white text-[14.5px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15";

// 바깥을 누르면 닫히는 떠 있는 목록
function useOutside(ref, on, close) {
  React.useEffect(() => {
    if (!on) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    document.addEventListener("mousedown", h); document.addEventListener("touchstart", h);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h); };
  }, [ref, on, close]);
}

export function ComboInput({ value = "", onChange, opts = [], placeholder = "", className = inp0 }) {
  const [open, setOpen] = React.useState(false);
  const box = React.useRef(null);
  useOutside(box, open, () => setOpen(false));
  return (
    <div ref={box} className="relative">
      <div className="flex">
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "직접 입력 또는 ▾에서 선택"} className={`${className} !rounded-r-none`} autoComplete="off" />
        <button type="button" tabIndex={-1} onClick={() => setOpen((v) => !v)} aria-label="목록 열기" className="h-11 w-11 shrink-0 rounded-r-xl bg-[#0F1A30] text-white text-[13px]">▾</button>
      </div>
      {open && (
        <div className="absolute z-40 left-0 right-0 top-full mt-1 rounded-xl border border-[#DCE3EE] bg-white shadow-[0_18px_40px_rgba(15,26,48,.18)] max-h-[280px] overflow-y-auto overscroll-contain">
          {opts.map((o) => (
            <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); }}
              className={`w-full text-left px-3.5 py-2.5 border-b border-[#EEF1F6] last:border-0 text-[14px] font-bold ${o === value ? "bg-[#EEF3FC] text-[#0F1A30]" : "text-[#1B2B4B] hover:bg-[#F5F8FD]"}`}>
              {o === value ? "✓ " : ""}{o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// "09:00 ~ 18:00" 형태 ↔ [시작, 끝]
const RANGE_RE = /(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/;
const pad2 = (t) => (t && t.length === 4 ? `0${t}` : t);
const mins = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
const durLabel = (a, b) => {
  let d = mins(b) - mins(a); if (d <= 0) d += 1440;
  const h = Math.floor(d / 60), m = d % 60;
  return `${h ? `${h}시간` : ""}${m ? ` ${m}분` : ""}`.trim();
};
function parseRange(v) { const m = RANGE_RE.exec(String(v || "")); return m ? [pad2(m[1]), pad2(m[2])] : ["", ""]; }

export function TimeRangeInput({ value = "", onChange, withDuration = false, defaults = ["09:00", "18:00"] }) {
  const [a0, b0] = parseRange(value);
  const extra = String(value || "").replace(RANGE_RE, "").replace(/^\s*\(.*?\)\s*/, "").trim(); // "(휴게 1시간)" 같은 뒤 글자는 길이 표기로 대신
  const emit = (a, b) => {
    if (!a || !b) { onChange(a || b ? `${a || defaults[0]} ~ ${b || defaults[1]}` : ""); return; }
    onChange(`${a} ~ ${b}${withDuration ? ` (${durLabel(a, b)})` : ""}`);
  };
  const cls = "h-11 w-full px-3 rounded-xl border border-[#D3DBE8] bg-white text-[14.5px] font-semibold text-[#0F1A30]";
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-1.5 items-center">
        <TimeSelect value={a0} onChange={(e) => emit(e.target.value, b0)} className={cls} placeholder="시작" />
        <span className="text-[14px] font-black text-[#5B6B85]">~</span>
        <TimeSelect value={b0} onChange={(e) => emit(a0, e.target.value)} className={cls} placeholder="끝" />
      </div>
      {a0 && b0 && <div className="text-[12px] font-bold text-[#5B6B85] mt-1">{withDuration ? `휴게 ${durLabel(a0, b0)}` : `하루 ${durLabel(a0, b0)}`}{extra && !withDuration ? ` · ${extra}` : ""}</div>}
    </div>
  );
}

// 🔎 사람·거래처 찾기 — rows: [{ id, title, sub, search }]
export function PickList({ rows = [], multi = false, selected = [], onPick, onToggle, onToggleAll, placeholder = "이름으로 검색", empty = "목록이 없습니다" }) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const box = React.useRef(null);
  useOutside(box, open, () => setOpen(false));
  const key = q.replace(/\s/g, "").toLowerCase();
  const list = rows.filter((r) => !key || String(r.search || `${r.title}${r.sub || ""}`).replace(/\s/g, "").toLowerCase().includes(key)).slice(0, 80);
  const sel = new Set(selected);
  const choose = (r) => {
    if (multi) { onToggle?.(r.id); return; }
    onPick?.(r.id); setQ(r.title); setOpen(false);
  };
  return (
    <div ref={box} className="relative">
      <div className="flex">
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!open || !list.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(list.length - 1, h + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
            else if (e.key === "Enter") { e.preventDefault(); choose(list[hi]); }
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder} className={`${inp0} !rounded-r-none`} autoComplete="off" />
        <button type="button" tabIndex={-1} onClick={() => setOpen((v) => !v)} className="h-11 w-11 shrink-0 rounded-r-xl bg-[#0F1A30] text-white text-[13px]" aria-label="전체 목록">▾</button>
      </div>
      {open && (
        <div className="absolute z-40 left-0 right-0 top-full mt-1 rounded-xl border border-[#DCE3EE] bg-white shadow-[0_18px_40px_rgba(15,26,48,.18)] max-h-[340px] overflow-y-auto overscroll-contain">
          {multi && list.length > 0 && (
            <div className="sticky top-0 z-10 flex items-center gap-2 px-3.5 h-10 bg-[#F3F6FA] border-b border-[#E3E8F0]">
              <span className="text-[12.5px] font-black text-[#3A4A66]">{sel.size}명 선택</span>
              <button type="button" onClick={() => onToggleAll?.(list.map((r) => r.id))} className="ml-auto h-7 px-2.5 rounded-lg bg-white border border-[#DCE3EE] text-[12px] font-black text-[#1B2B4B]">
                {list.every((r) => sel.has(r.id)) ? "보이는 목록 해제" : "보이는 목록 전체 선택"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="h-7 px-2.5 rounded-lg bg-[#0F1A30] text-white text-[12px] font-black">완료</button>
            </div>
          )}
          {list.map((r, i) => (
            <button key={r.id} type="button" onClick={() => choose(r)} onMouseEnter={() => setHi(i)}
              className={`w-full text-left px-3.5 py-2.5 border-b border-[#EEF1F6] last:border-0 flex items-center gap-2 ${i === hi ? "bg-[#EEF3FC]" : "bg-white"}`}>
              {multi && <span className={`w-5 h-5 shrink-0 rounded-md border-2 grid place-items-center text-[11px] font-black ${sel.has(r.id) ? "bg-[#0F1A30] border-[#0F1A30] text-white" : "border-[#C9D2E0] text-transparent"}`}>✓</span>}
              <span className="text-[14.5px] font-black text-[#0F1A30] truncate">{r.title}</span>
              {r.sub && <span className="text-[12.5px] font-bold text-[#5B6B85] truncate">{r.sub}</span>}
              {r.badge && <span className="ml-auto shrink-0 text-[11px] font-black px-1.5 py-0.5 rounded-md bg-[#EEF3FC] text-[#2D4C82]">{r.badge}</span>}
            </button>
          ))}
          {!list.length && <div className="px-3.5 py-6 text-center text-[13.5px] font-bold text-[#8E9BB2]">{empty}</div>}
        </div>
      )}
    </div>
  );
}

// 👥 같은 회사 직원(기사·화주·최고관리자·퇴사자 제외)
export function useStaffPeople(company) {
  const co = String(company || "").trim();
  const [rows, setRows] = React.useState([]);
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(query(collection(db, "users"), where("companyName", "==", co)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => !["driver", "shipper", "cafeUser", "totalMaster"].includes(u.role) && u.employmentStatus !== "퇴사" && u.approved !== false && String(u.name || "").trim())
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"))), () => setRows([]));
  }, [co]);
  return rows;
}
// 직원 한 명의 인사 정보(가입 때 · 이후 수정한 값) — users + userProfiles(입사일) + hrResumes(생년월일·주소)
export async function staffDetail(u) {
  if (!u?.id) return {};
  const [p, r] = await Promise.all([getDoc(doc(db, "userProfiles", u.id)).catch(() => null), getDoc(doc(db, "hrResumes", u.id)).catch(() => null)]);
  const pd = p?.exists?.() ? p.data() || {} : {};
  const rd = r?.exists?.() ? r.data() || {} : {};
  return {
    name: String(u.name || "").trim(),
    birth: String(u.birthDate || rd.birthDate || rd.birth || "").slice(0, 10),
    addr: String(rd.address || u.address || u.주소 || "").trim(),
    phone: String(u.phone || u.전화번호 || "").trim(),
    team: String(u.team || "").trim(), position: String(u.position || "").trim(),
    hireDate: String(pd.hireDate || u.hireDate || "").slice(0, 10),
    employType: String(u.employType || rd.employType || "").trim(),
    workStart: String(u.workStartTime || "").trim(), workEnd: String(u.workEndTime || "").trim(),
  };
}

// 🏢 기본거래처(같은 회사)
export function useClientRows(company) {
  const co = String(company || "").trim();
  const [rows, setRows] = React.useState([]);
  React.useEffect(() => {
    if (!co) return undefined;
    const mine = (x) => (String(x.companyName || "").trim() || DEFAULT_COMPANY) === co;
    return onSnapshot(collection(db, "clients"), (s) => {
      const seen = new Set();
      setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter(mine).map((c) => ({ ...c, 거래처명: String(c.거래처명 || c.업체명 || c.name || c.상호 || "").trim() }))
        .filter((c) => c.거래처명 && !seen.has(c.거래처명) && seen.add(c.거래처명))
        .sort((a, b) => a.거래처명.localeCompare(b.거래처명, "ko")));
    }, () => setRows([]));
  }, [co]);
  return rows;
}
