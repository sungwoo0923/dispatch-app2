// ======================= src/MgrBadge.jsx =======================
// 👤 2026-11-03 배차담당자 칸 — 칸을 늘리지 않고 "오더 올린 사람 + 차량 붙인 사람"을 함께
//  · 겹친 이니셜: 진한 남색 = 오더 올린 사람(배차담당자 · 매출 기준 · 안 바뀜), 파란색 = 차량 붙인 사람(배차확정자, 다를 때만)
//  · 옆에 오더 올린 사람 이름(한 줄) · 마우스를 올리면 담당 이력 카드(등록 → 차량 배정 → 마지막 수정)
import React from "react";
import { createPortal } from "react-dom";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
let NAME_MAP = null; // 이메일·uid → 직원 이름(DispatchApp이 넣어 줌)
export function setMgrNameMap(m) { NAME_MAP = m || null; }
const nameOf = (v) => {
  const s = String(v || "").trim();
  if (!s) return "";
  const n = NAME_MAP?.get?.(s) || NAME_MAP?.get?.(s.toLowerCase());
  if (n) return n;
  return s.includes("@") ? s.split("@")[0] : s;
};
const msOf = (t) => (t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : t?._seconds ? t._seconds * 1000 : typeof t === "number" ? t : typeof t === "string" && /^\d{4}-/.test(t) ? Date.parse(t) : 0);
const fmt = (ms) => {
  if (!ms) return "";
  const d = new Date(ms + 9 * 3600e3);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};
const first = (s) => String(s || "").replace(/\s/g, "").slice(0, 1);

export default function MgrBadge({ row, name, empty = "미지정" }) {
  const [pos, setPos] = React.useState(null);
  const ref = React.useRef(null);
  const timer = React.useRef(null);
  const reg = String(name || "").trim();
  const car = String(row?.배차확정자 || "").trim();
  const showCar = car && car !== reg && car !== "고정노선";
  const open = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = ref.current?.getBoundingClientRect(); if (!r) return;
      const w = 290; const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
      const below = window.innerHeight - r.bottom > 200;
      setPos({ left, top: below ? r.bottom + 8 : undefined, bottom: below ? undefined : window.innerHeight - r.top + 8 });
    }, 180);
  };
  const close = () => { clearTimeout(timer.current); setPos(null); };
  React.useEffect(() => () => clearTimeout(timer.current), []);
  if (!reg && !showCar) return <span className="text-[12px] font-semibold text-[#9AA9C3]">{empty}</span>;

  const ev = [];
  if (reg) ev.push({ c: "#8FB0F0", t: `오더 등록 · ${reg}`, s: [fmt(msOf(row?.createdAt) || msOf(row?.등록일시)), "배차담당자"].filter(Boolean).join(" · ") });
  if (car) ev.push({ c: "#4ADE80", t: `차량 배정 · ${car}`, s: [fmt(msOf(row?.배차확정일시) || msOf(row?.배차완료일시)), `${row?.차량번호 || ""} ${row?.이름 || ""}`.trim()].filter(Boolean).join(" · ") });
  const last = nameOf(row?.최종수정자);
  const lastMs = msOf(row?.updatedAt) || msOf(row?._lastModified);
  if (last && (last !== reg || lastMs)) ev.push({ c: "#FCD9A0", t: `마지막 수정 · ${last}`, s: fmt(lastMs) });

  return (
    <span ref={ref} onMouseEnter={open} onMouseLeave={close} className="inline-flex items-center gap-1.5 whitespace-nowrap align-middle cursor-default">
      <span className="inline-flex items-center">
        <span className="w-[22px] h-[22px] rounded-full bg-[#0F1A30] text-white text-[10.5px] font-black inline-flex items-center justify-center ring-2 ring-white">{first(reg) || "?"}</span>
        {showCar && <span className="-ml-1.5 w-[22px] h-[22px] rounded-full bg-[#4B6CB7] text-white text-[10.5px] font-black inline-flex items-center justify-center ring-2 ring-white">{first(car)}</span>}
      </span>
      <span className="text-[13.5px] font-bold text-[#0F1A30]">{reg || car}</span>
      {pos && ev.length > 0 && createPortal(
        <div className="fixed z-[2147483000] w-[290px] rounded-2xl px-4 py-3 text-white pointer-events-none" style={{ left: pos.left, top: pos.top, bottom: pos.bottom, background: "#0F1A30", boxShadow: "0 18px 40px rgba(6,12,26,.38)", border: "1px solid rgba(143,176,240,.18)" }}>
          <div className="text-[10px] font-extrabold tracking-[0.24em] text-[#8FB0F0] mb-1.5" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>ORDER TRAIL</div>
          {ev.map((e, i) => (
            <div key={i} className="flex items-start gap-2.5 py-1">
              <span className="w-2 h-2 rounded-full mt-[6px] flex-none" style={{ background: e.c }} />
              <div className="min-w-0">
                <div className="text-[12.5px] font-black">{e.t}</div>
                {e.s && <div className="text-[11px] text-white/55" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{e.s}</div>}
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}
    </span>
  );
}
