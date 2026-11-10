// ======================= src/DriverContextMenu.jsx =======================
// 🖱 2026-11-10 기사관리 목록 오른쪽 클릭 메뉴(고정노선현황 메뉴와 같은 모양)
//  · 기사 복사 ▸ 차량번호 · 이름 · 전화번호 / 배차 안내용(여러 줄) / 차량번호만 / 이름만 / 전화번호만 — 여러 명 선택이면 한 줄에 한 명씩
//  · 수정 · 등급 변경 ▸ · 앱 안내 보내기(지입·직영·임대) · 전화 걸기 · 선택 삭제
import React from "react";
import { createPortal } from "react-dom";

const fmtPhone = (p) => {
  const d = String(p || "").replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return d.startsWith("02") ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return String(p || "");
};
const carText = (r) => [r.차량톤수, r.차량종류].filter(Boolean).join(" ");
// 복사 형식 — 메뉴 순서 그대로
export const DRIVER_COPY_FORMATS = [
  { k: "all", label: "차량번호 · 이름 · 전화번호", hint: "한 줄", make: (r) => [r.차량번호, r.이름, fmtPhone(r.전화번호)].filter(Boolean).join(" ") },
  { k: "dispatch", label: "배차 안내용", hint: "여러 줄 · 차종 포함", make: (r) => [`차량번호: ${r.차량번호 || "-"}`, `기사명: ${r.이름 || "-"}`, `연락처: ${fmtPhone(r.전화번호) || "-"}`, ...(carText(r) ? [`차종: ${carText(r)}`] : [])].join("\n") },
  { k: "plate", label: "차량번호만", make: (r) => r.차량번호 || "" },
  { k: "name", label: "이름만", make: (r) => r.이름 || "" },
  { k: "phone", label: "전화번호만", make: (r) => fmtPhone(r.전화번호) },
  { k: "plateName", label: "차량번호 · 이름", make: (r) => [r.차량번호, r.이름].filter(Boolean).join(" ") },
];
export function driverCopyText(rows, k) {
  const f = DRIVER_COPY_FORMATS.find((x) => x.k === k) || DRIVER_COPY_FORMATS[0];
  return rows.map(f.make).filter((t) => String(t).trim()).join(k === "dispatch" ? "\n\n" : "\n");
}
export async function copyToClipboard(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch { /* 아래로 */ }
  try {
    const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch { return false; }
}

const GRADES = ["일반", "지입", "직영", "임대", "블랙"];
const FLEET = ["지입", "직영", "임대"];

export default function DriverContextMenu({ x, y, rows = [], readOnly = false, onClose, onCopied, onEdit, onGrade, onGuide, onDelete }) {
  const [sub, setSub] = React.useState(""); // "" | copy | grade
  const ref = React.useRef(null);
  React.useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const esc = (e) => { if (e.key === "Escape") { if (sub) setSub(""); else onClose(); } };
    document.addEventListener("mousedown", down, true); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", down, true); document.removeEventListener("keydown", esc); };
  }, [onClose, sub]);
  const first = rows[0] || {};
  const many = rows.length > 1;
  const cnt = many ? ` (${rows.length}명)` : "";
  const z = (() => { try { return parseFloat(document.getElementById("root")?.style.zoom) || 1; } catch { return 1; } })();
  const vw = window.innerWidth / z; const vh = window.innerHeight / z;
  const W = 248;
  const pos = { left: Math.min(x, vw - W - 8), ...(y > vh * 0.55 ? { bottom: Math.max(8, vh - y) } : { top: y }), maxHeight: vh - 16 };
  const item = "w-full text-left px-3 h-9 rounded-lg text-[13.5px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#2A3852]";
  const I = ({ d }) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">{d}</svg>;
  const Chev = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="ml-auto opacity-60"><path d="M9 18l6-6-6-6" /></svg>;
  const copy = async (k) => {
    const t = driverCopyText(rows, k);
    const ok = t ? await copyToClipboard(t) : false;
    onClose();
    onCopied?.(ok, t, DRIVER_COPY_FORMATS.find((f) => f.k === k)?.label || "");
  };
  const phone = String(first.전화번호 || "").replace(/\D/g, "");
  const fleetRows = rows.filter((r) => FLEET.includes(r.등급));
  const back = <button type="button" onClick={() => setSub("")} className="h-8 px-2 rounded-lg text-[13px] font-black text-[#2D4C82] hover:bg-[#F5F8FD]">‹ 뒤로</button>;

  return createPortal(
    <div ref={ref} data-kp="drv-ctx" className="fixed z-[999999] bg-white border border-[#DCE3EE] rounded-2xl shadow-[0_18px_44px_rgba(11,20,40,0.28)] p-1.5 select-none overflow-y-auto"
      style={{ ...pos, width: W, zoom: z }} onContextMenu={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()}>
      <div className="px-3 pt-1.5 pb-2 border-b border-[#EEF2F7] mb-1">
        <div className="text-[10px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">DRIVER</div>
        <div className="text-[13px] font-black text-[#0F1A30] truncate tabular-nums">{first.차량번호 || "-"} · {first.이름 || "-"}{many ? ` 외 ${rows.length - 1}명` : ""}</div>
        <div className="text-[11.5px] font-semibold text-[#7A8AA6] truncate tabular-nums">{[fmtPhone(first.전화번호), carText(first), first.등급 || "일반"].filter(Boolean).join(" · ")}</div>
      </div>

      {sub === "" && (
        <>
          <button type="button" className={item} onClick={() => setSub("copy")} data-kp="drv-ctx-copy"><I d={<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>} />기사 복사{cnt}<Chev /></button>
          {!many && <button type="button" className={item} onClick={() => { onClose(); onEdit?.(first); }}><I d={<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></>} />기사 정보 수정<span className="ml-auto text-[11px] text-gray-500">더블클릭</span></button>}
          <button type="button" className={item} disabled={readOnly} onClick={() => setSub("grade")} data-kp="drv-ctx-grade"><I d={<><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" /><circle cx="7" cy="7" r="1.5" /></>} />등급 변경{cnt}<Chev /></button>
          {fleetRows.length > 0 && onGuide && <button type="button" className={item} onClick={() => { onClose(); onGuide(fleetRows); }}><I d={<><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></>} />기사앱 안내 보내기{fleetRows.length > 1 ? ` (${fleetRows.length}명)` : ""}</button>}
          {!many && phone && <a href={`tel:${phone}`} onClick={() => onClose()} className={item}><I d={<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />} />전화 걸기<span className="ml-auto text-[11px] text-gray-500 tabular-nums">{fmtPhone(phone)}</span></a>}
          <div className="border-t border-[#EEF2F7] my-1" />
          <button type="button" disabled={readOnly} className="w-full text-left px-3 h-9 rounded-lg text-[13.5px] font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2.5 disabled:opacity-40" onClick={() => { onClose(); onDelete?.(rows); }}>
            <I d={<><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" /></>} />{many ? `선택 삭제${cnt}` : "삭제"}
          </button>
        </>
      )}

      {sub === "copy" && (
        <div data-kp="drv-ctx-copy-menu">
          <div className="flex items-center gap-1.5 px-1 pb-1">{back}<span className="text-[12px] font-black text-[#5B6B85]">복사할 내용{cnt}</span></div>
          {DRIVER_COPY_FORMATS.map((f) => (
            <button key={f.k} type="button" className={`${item} h-auto py-2`} onClick={() => copy(f.k)} data-kp={`drv-copy-${f.k}`}>
              <span className="flex-1 min-w-0">
                <span className="block">{f.label}</span>
                <span className="block text-[11.5px] font-medium opacity-60 truncate tabular-nums">{String(f.make(first)).split("\n").join(" / ") || "-"}</span>
              </span>
            </button>
          ))}
          {many && <div className="px-3 pt-1 pb-1.5 text-[11.5px] font-semibold text-[#7A8AA6]">선택한 {rows.length}명이 한 줄에 한 명씩 복사돼요</div>}
        </div>
      )}

      {sub === "grade" && (
        <div data-kp="drv-ctx-grade-menu">
          <div className="flex items-center gap-1.5 px-1 pb-1">{back}<span className="text-[12px] font-black text-[#5B6B85]">등급 변경{cnt}</span></div>
          {GRADES.map((g) => {
            const now = !many && (first.등급 || "일반") === g;
            return (
              <button key={g} type="button" className={item} disabled={now} onClick={() => { onClose(); onGrade?.(rows, g); }}>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${g === "블랙" ? "bg-[#0F1A30]" : FLEET.includes(g) ? "bg-[#2D4C82]" : "bg-[#C9D2E0]"}`} />
                <span className="flex-1">{g}</span>{now && <span className="text-[11px] font-bold text-[#4B6CB7]">지금</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>, document.body);
}
