// ======================= src/driverDocs.jsx =======================
// 🧾 기사에게 보내는 서류 공용 — 지급명세서 양식 · 과태료/사고 서류 양식 · 전체화면 사진 보기
//  PC(지입차관리)에서 미리보기·발송하고, 기사앱(서류함)에서 똑같은 모양으로 본다.
//   driverStatements/{driverId}_{기간}: { companyName, driverId, driverName, carNo, period, from, to,
//       trips:[{date, client, from, to, fare}], gross, vat, deductions:[{label, amount}], deductTotal, net,
//       bank:{bank,acct,holder}, bizNo, memo, status:"sent"|"read"|"confirmed", sentAt, sentBy, readAt, confirmedAt }
//   fleetPenalties/{id}: { companyName, driverId, driverName, carNo, phone, kind, date, time, place, detail, docNo, agency,
//       amount, dueDate, payer, status, memo, photos:[dataUrl], createdAt, by, published, readAt }
import React from "react";
import { createPortal } from "react-dom";
import { bankText, formatAccount } from "./bankUtil";

export const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
export const won = (n) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}`;
const NAVY = "#0F1A30";

// ───────────── 지급명세서 ─────────────
export function StatementDoc({ st, supplier = {} }) {
  const trips = st.trips || [];
  const ded = st.deductions || [];
  return (
    <div style={{ background: "#fff", color: "#0F1A30", fontFamily: "'Noto Sans KR',sans-serif", width: "100%", maxWidth: 760, margin: "0 auto", borderRadius: 14, overflow: "hidden", border: "1px solid #E3E8F0" }}>
      <div style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)", color: "#fff", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.26em", color: "#8FB0F0" }}>PAYMENT STATEMENT</div>
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "0.12em" }}>지 급 명 세 서</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 12, color: "rgba(255,255,255,.75)", lineHeight: 1.6 }}>
          <div>정산 기간 <b style={{ color: "#fff" }}>{st.from} ~ {st.to}</b></div>
          <div>{supplier.name || st.companyName || ""}</div>
        </div>
      </div>
      <div style={{ padding: "18px 24px" }}>
        {/* 기사님 정보 — 2줄 배치, 줄임표 없이 전부 보이게 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[["기사", st.driverName], ["차량번호", st.carNo], ["사업자번호", st.bizNo ? String(st.bizNo).replace(/(\d{3})(\d{2})(\d{5})/, "$1-$2-$3") : "-"], ["입금 계좌", st.bank ? bankText(st.bank) : "미등록"]].map(([k, v]) => (
            <div key={k} style={{ background: "#F5F8FD", border: "1px solid #DCE3EE", borderRadius: 10, padding: "9px 13px", minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "#5B6B85", fontWeight: 800 }}>{k}</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#0B1428", wordBreak: "keep-all", overflowWrap: "anywhere", lineHeight: 1.45, marginTop: 2 }}>{v || "-"}</div>
            </div>
          ))}
        </div>
        <div style={{ borderRadius: 14, background: NAVY, color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#8FB0F0" }}>실 지급액</span>
          <span style={{ fontSize: 28, fontWeight: 900, fontFamily: MONO }}>{won(st.net)}<span style={{ fontSize: 14, marginLeft: 3 }}>원</span></span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, color: "#0B1428" }}>
          <thead>
            <tr style={{ background: "#EEF3FC" }}>
              {["일자", "거래처", "상차", "하차", "운임"].map((h, i) => <th key={h} style={{ padding: "9px 10px", textAlign: i === 4 ? "right" : "left", fontWeight: 900, fontSize: 13.5, color: "#1B2B4B", borderBottom: "1.5px solid #C9D6EE", whiteSpace: "nowrap" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {trips.map((t, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #E3E8F0" }}>
                <td style={{ padding: "8px 10px", whiteSpace: "nowrap", fontFamily: MONO, fontWeight: 700 }}>{String(t.date || "").slice(5)}</td>
                <td style={{ padding: "8px 10px", fontWeight: 700 }}>{t.client}</td>
                <td style={{ padding: "8px 10px", fontWeight: 600 }}>{t.from}</td>
                <td style={{ padding: "8px 10px", fontWeight: 600 }}>{t.to}{t.via ? <div style={{ fontSize: 12, color: "#3A4A66", marginTop: 2 }}>경유 {t.via}</div> : null}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 900, fontFamily: MONO, whiteSpace: "nowrap" }}>{won(t.fare)}</td>
              </tr>
            ))}
            {!trips.length && <tr><td colSpan={5} style={{ padding: 14, textAlign: "center", color: "#5B6B85", fontWeight: 700 }}>운행 내역 없음</td></tr>}
          </tbody>
        </table>
        <div style={{ marginTop: 16, display: "grid", gap: 2, fontSize: 15 }}>
          {[["운행 건수", `${trips.length}건`], ["운임 합계(공급가액)", `${won(st.gross)}원`], ...(st.vat ? [["부가세(10%)", `${won(st.vat)}원`]] : []),
            ...ded.map((d) => [`공제 · ${d.label}`, `- ${won(d.amount)}원`]), ["공제 합계", `- ${won(st.deductTotal)}원`]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 2px", borderBottom: "1px solid #E3E8F0" }}>
              <span style={{ color: "#1B2B4B", fontWeight: 800 }}>{k}</span><b style={{ fontFamily: MONO, color: "#0B1428", whiteSpace: "nowrap" }}>{v}</b>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 2px 2px" }}>
            <span style={{ color: "#0B1428", fontWeight: 900, fontSize: 16 }}>실 지급액</span><b style={{ fontFamily: MONO, color: "#0B1428", fontSize: 17 }}>{won(st.net)}원</b>
          </div>
        </div>
        {st.memo && <div style={{ marginTop: 12, padding: "10px 12px", background: "#F5F8FD", borderRadius: 10, fontSize: 12.5, color: "#3A4A66", whiteSpace: "pre-wrap" }}>{st.memo}</div>}
        <div style={{ marginTop: 14, fontSize: 12.5, color: "#3A4A66", fontWeight: 700, textAlign: "right" }}>{supplier.name || st.companyName}{supplier.contact ? ` · ${supplier.contact}` : ""}</div>
      </div>
    </div>
  );
}

// ───────────── 과태료·사고 서류 ─────────────
export const PENALTY_KINDS = ["과태료", "범칙금", "통행료 미납", "주정차 위반", "속도위반", "신호위반", "사고 처리", "보험료 할증", "기타"];
export const PENALTY_PAYERS = ["기사 부담(지급액 공제)", "기사 직접 납부", "회사 부담"];
export function PenaltyDoc({ p, supplier = {}, onPhoto, wide }) {
  const photos = p.photos || [];
  const rows = [
    ["구분", p.kind], ["발생 일시", [p.date, p.time].filter(Boolean).join(" ")], ["발생 장소", p.place], ["위반·사고 내용", p.detail],
    ["고지 기관", p.agency], ["고지서 번호", p.docNo], ["금액", p.amount ? `${won(p.amount)}원` : "-"], ["납부 기한", p.dueDate],
    ["부담 방식", p.payer], ["처리 상태", p.status],
  ];
  const ts = (v) => { const ms = v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0; if (!ms) return ""; const d = new Date(ms + 9 * 3600e3); return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`; };
  const hist = [["기사님 확인", ts(p.confirmedAt || p.readAt)], ["납부 완료", ts(p.paidAt) + (p.settledBy ? ` (${p.settledBy})` : "")], ["이의 신청", ts(p.objectedAt)]].filter(([, v]) => v.trim());
  if (hist.length) rows.push(["처리 이력", hist.map(([k, v]) => `${k} · ${v}`).join("\n")]);
  return (
    <div style={{ background: "#fff", color: NAVY, fontFamily: "'Noto Sans KR',sans-serif", width: "100%", maxWidth: wide ? "none" : 760, margin: "0 auto", borderRadius: 14, overflow: "hidden", border: "1px solid #E3E8F0" }}>
      <div style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)", color: "#fff", padding: "18px 22px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.26em", color: "#8FB0F0" }}>VEHICLE NOTICE · {p.docId || ""}</div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.08em" }}>{p.kind || "과태료"} 처리 안내서</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 12, color: "rgba(255,255,255,.75)" }}>{supplier.name || p.companyName}<br />작성 {p.by || ""}</div>
      </div>
      <div style={{ padding: "16px 22px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginBottom: 14 }}>
          {[["대상 기사", p.driverName], ["차량번호", p.carNo], ["연락처", p.phone]].map(([k, v]) => (
            <div key={k} style={{ background: "#F5F8FD", border: "1px solid #E3E8F0", borderRadius: 10, padding: "8px 12px" }}>
              <div style={{ fontSize: 12, color: "#5B6B85", fontWeight: 800 }}>{k}</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#0B1428", overflowWrap: "anywhere" }}>{v || "-"}</div>
            </div>
          ))}
        </div>
        <div style={{ border: "1px solid #E3E8F0", borderRadius: 12, overflow: "hidden" }}>
          {rows.map(([k, v], i) => (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "120px 1fr", borderTop: i ? "1px solid #EEF1F6" : "none" }}>
              <div style={{ background: "#F3F6FA", padding: "9px 12px", fontSize: 13.5, fontWeight: 800, color: "#1B2B4B" }}>{k}</div>
              <div style={{ padding: "9px 12px", fontSize: 14.5, fontWeight: k === "금액" ? 900 : 700, color: "#0B1428", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{v || "-"}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, fontSize: 12.5, fontWeight: 900, color: "#1B2B4B" }}>첨부 — 고지서·사진</div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: photos.length > 1 ? "1fr 1fr" : "1fr", gap: 8 }}>
          {photos.length ? photos.map((src, i) => (
            <button key={i} type="button" onClick={() => onPhoto?.(i)} style={{ padding: 0, border: "1px solid #DCE3EE", borderRadius: 12, overflow: "hidden", background: "#F3F6FA", cursor: onPhoto ? "zoom-in" : "default", aspectRatio: "4 / 3" }}>
              <img src={src} alt={`첨부 ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
            </button>
          )) : <div style={{ border: "2px dashed #DCE3EE", borderRadius: 12, padding: 28, textAlign: "center", color: "#9AA9C3", fontSize: 13, fontWeight: 700 }}>첨부된 사진이 없습니다</div>}
        </div>
        {p.memo && <div style={{ marginTop: 12, padding: "10px 12px", background: "#F5F8FD", borderRadius: 10, fontSize: 12.5, color: "#3A4A66", whiteSpace: "pre-wrap" }}>{p.memo}</div>}
      </div>
    </div>
  );
}

// ───────────── 전체화면 사진 보기(확대·축소·이동·회전·저장) ─────────────
export function ImageViewer({ images = [], index = 0, onClose, name = "사진" }) {
  const [i, setI] = React.useState(index);
  const [z, setZ] = React.useState(1);
  const [rot, setRot] = React.useState(0);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const drag = React.useRef(null);
  const pinch = React.useRef(null);
  React.useEffect(() => { setZ(1); setRot(0); setPos({ x: 0, y: 0 }); }, [i]);
  React.useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") setI((v) => Math.min(images.length - 1, v + 1)); if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1)); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [images.length, onClose]);
  const src = images[i];
  if (!src) return null;
  const save = () => { const a = document.createElement("a"); a.href = src; a.download = `${name}_${i + 1}.jpg`; a.click(); };
  const btn = { width: 44, height: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 18, fontWeight: 900, cursor: "pointer" };
  const onTouchStart = (e) => {
    if (e.touches.length === 2) { const [a, b] = e.touches; pinch.current = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z }; }
    else if (e.touches.length === 1) drag.current = { x: e.touches[0].clientX - pos.x, y: e.touches[0].clientY - pos.y };
  };
  const onTouchMove = (e) => {
    if (e.touches.length === 2 && pinch.current) { const [a, b] = e.touches; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); setZ(Math.min(6, Math.max(1, pinch.current.z * (d / pinch.current.d)))); }
    else if (e.touches.length === 1 && drag.current && z > 1) setPos({ x: e.touches[0].clientX - drag.current.x, y: e.touches[0].clientY - drag.current.y });
  };
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483600, background: "rgba(6,12,26,.96)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", paddingTop: "max(12px, env(safe-area-inset-top))", color: "#fff" }}>
        <span style={{ fontSize: 14, fontWeight: 800, flex: 1 }}>{name} {images.length > 1 ? `${i + 1} / ${images.length}` : ""}</span>
        <button type="button" style={btn} onClick={save} title="저장">⤓</button>
        <button type="button" style={btn} onClick={onClose} title="닫기">✕</button>
      </div>
      <div style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none", cursor: z > 1 ? "grab" : "zoom-in" }}
        onWheel={(e) => setZ((v) => Math.min(6, Math.max(1, v * (e.deltaY < 0 ? 1.15 : 0.87))))}
        onDoubleClick={() => { setZ((v) => (v > 1 ? 1 : 2.5)); setPos({ x: 0, y: 0 }); }}
        onMouseDown={(e) => { drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }; }}
        onMouseMove={(e) => { if (drag.current && z > 1 && e.buttons) setPos({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }); }}
        onMouseUp={() => { drag.current = null; }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={() => { pinch.current = null; drag.current = null; }}>
        <img src={src} alt="" draggable={false} style={{ maxWidth: "100%", maxHeight: "100%", transform: `translate(${pos.x}px,${pos.y}px) scale(${z}) rotate(${rot}deg)`, transition: drag.current || pinch.current ? "none" : "transform .15s", userSelect: "none" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "12px", paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}>
        <button type="button" style={btn} onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0}>‹</button>
        <button type="button" style={btn} onClick={() => setZ((v) => Math.max(1, v / 1.4))}>−</button>
        <button type="button" style={{ ...btn, width: 64, fontSize: 13 }} onClick={() => { setZ(1); setPos({ x: 0, y: 0 }); setRot(0); }}>{Math.round(z * 100)}%</button>
        <button type="button" style={btn} onClick={() => setZ((v) => Math.min(6, v * 1.4))}>+</button>
        <button type="button" style={btn} onClick={() => setRot((r) => r + 90)} title="회전">⟳</button>
        <button type="button" style={btn} onClick={() => setI((v) => Math.min(images.length - 1, v + 1))} disabled={i >= images.length - 1}>›</button>
      </div>
    </div>,
    document.body,
  );
}

export const acctLine = (b) => (b && b.acct ? `${b.bank} ${formatAccount(b.bank, b.acct)} ${b.holder || ""}`.trim() : "");
