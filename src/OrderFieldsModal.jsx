// ======================= src/OrderFieldsModal.jsx =======================
// 🧩 2026-11-26 오더등록 [입력칸 설정] 팝업 — PC 배차관리 · 모바일 오더등록이 같이 쓴다(src/orderFormFields.js)
//  [회사 전체] 탭: 체크를 끈 칸은 우리 회사 모든 계정의 오더등록에서 사라진다(개인 설정을 켠 계정 제외)
//  [내 설정] 탭: 나만 따로 — 다른 계정은 그대로 · [회사 설정 따르기]로 되돌린다
//  거래처명 · 운임은 늘 켜져 있다(끌 수 없음) · [전체 선택] · [전체 해제] · [적용]을 누르면 바로 바뀐다
import React from "react";
import { createPortal } from "react-dom";
import { ORDER_FIELDS, LOCKED, cleanHidden, saveCompanyFields, saveMyFields } from "./orderFormFields";

const GROUPS = [...new Set(ORDER_FIELDS.map((f) => f.group))];

export default function OrderFieldsModal({ state, onClose, mobile = false, canCompany = true }) {
  const [tab, setTab] = React.useState(state.src === "mine" ? "mine" : (canCompany ? "company" : "mine"));
  const initial = (t) => cleanHidden(t === "mine" ? (state.mine?.mode === "mine" ? state.mine.hidden : state.company?.hidden) : state.company?.hidden);
  const [hidden, setHidden] = React.useState(() => new Set(initial(tab)));
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const switchTab = (t) => { setTab(t); setHidden(new Set(initial(t))); setMsg(""); };
  const toggle = (k) => { if (LOCKED.has(k)) return; setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; }); };
  const all = () => setHidden(new Set());
  const none = () => setHidden(new Set(ORDER_FIELDS.filter((f) => !f.locked).map((f) => f.key)));
  const shownN = ORDER_FIELDS.length - hidden.size;
  const apply = async () => {
    setBusy(true); setMsg("");
    try {
      if (tab === "company") await saveCompanyFields([...hidden]);
      else await saveMyFields("mine", [...hidden]);
      onClose?.();
    } catch (e) { setMsg(String(e?.code || "").includes("permission") ? "저장할 권한이 없어요" : (e?.message || "저장하지 못했어요")); }
    finally { setBusy(false); }
  };
  const followCompany = async () => {
    setBusy(true); setMsg("");
    try { await saveMyFields("company", []); onClose?.(); } catch (e) { setMsg(e?.message || "저장하지 못했어요"); } finally { setBusy(false); }
  };
  const mineOn = state.mine?.mode === "mine";

  const box = mobile
    ? { position: "fixed", left: 0, right: 0, bottom: 0, maxHeight: "92dvh", borderRadius: "24px 24px 0 0", paddingBottom: "max(14px, env(safe-area-inset-bottom))" }
    : { position: "relative", width: 560, maxWidth: "calc(100vw - 32px)", maxHeight: "86vh", borderRadius: 22 };
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="오더등록 입력칸 설정" onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 2147482000, background: "rgba(8,14,30,.5)", display: "flex", alignItems: mobile ? "flex-end" : "center", justifyContent: "center", fontFamily: "inherit" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...box, background: "#fff", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 30px 80px rgba(8,14,30,.45)" }}>
        <div style={{ padding: "18px 20px 14px", background: "linear-gradient(135deg,#0B1428,#1B2B4B 60%,#2D4C82)", color: "#fff" }}>
          <div style={{ fontSize: 11, letterSpacing: ".22em", fontWeight: 800, color: "#8FB0F0" }}>ORDER FORM</div>
          <div style={{ fontSize: 19, fontWeight: 900, marginTop: 2 }}>입력칸 설정</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.72)", marginTop: 3, lineHeight: 1.45 }}>체크를 끈 칸은 오더등록에서 사라지고 남은 칸이 앞으로 당겨져요. 거래처명 · 운임은 늘 보여요.</div>
          <div style={{ display: "flex", gap: 6, marginTop: 12, background: "rgba(255,255,255,.1)", borderRadius: 12, padding: 3, width: "fit-content" }}>
            {[["company", "회사 전체"], ["mine", "내 설정"]].filter(([k]) => k !== "company" || canCompany).map(([k, l]) => (
              <button key={k} type="button" onClick={() => switchTab(k)}
                style={{ border: 0, borderRadius: 9, padding: "7px 14px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", background: tab === k ? "#fff" : "transparent", color: tab === k ? "#0F1A30" : "rgba(255,255,255,.8)" }}>
                {l}{k === "mine" && mineOn ? " · 사용 중" : ""}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: "12px 20px 4px", fontSize: 13, color: "#5B6B85", lineHeight: 1.5 }}>
          {tab === "company"
            ? <>우리 회사 모든 계정에 적용돼요{state.company?.by ? <> · 마지막 변경 <b style={{ color: "#1B2B4B" }}>{state.company.by}</b></> : null}{mineOn ? <span style={{ color: "#B45309" }}> · 지금 나는 [내 설정]을 쓰는 중이에요</span> : null}</>
            : <>나만 따로 적용돼요 · 다른 계정은 바뀌지 않아요{mineOn ? null : <span style={{ color: "#5B6B85" }}> · 지금은 회사 설정을 따르는 중</span>}</>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 20px 8px" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#1B2B4B" }}>{shownN} / {ORDER_FIELDS.length}칸 보임</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button type="button" onClick={all} style={chip}>전체 선택</button>
            <button type="button" onClick={none} style={chip}>전체 해제</button>
          </span>
        </div>
        <div style={{ overflowY: "auto", padding: "0 20px 8px", flex: 1 }}>
          {GROUPS.map((g) => (
            <div key={g} style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#9AA9C3", letterSpacing: ".06em", margin: "4px 2px 6px" }}>{g}</div>
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 6 }}>
                {ORDER_FIELDS.filter((f) => f.group === g).map((f) => {
                  const on = !hidden.has(f.key);
                  return (
                    <button key={f.key} type="button" onClick={() => toggle(f.key)} aria-pressed={on} disabled={f.locked}
                      title={f.locked ? "꼭 필요한 칸이라 끌 수 없어요" : undefined}
                      style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", padding: "10px 11px", borderRadius: 12, cursor: f.locked ? "default" : "pointer", fontFamily: "inherit",
                        border: `1.5px solid ${on ? "#1B2B4B" : "#E3E8F0"}`, background: on ? "#F2F5FB" : "#fff", color: on ? "#0F1A30" : "#9AA9C3", fontSize: 13.5, fontWeight: 800 }}>
                      <span style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0, display: "grid", placeItems: "center", background: on ? (f.locked ? "#5B6B85" : "#1B2B4B") : "#fff", border: on ? "none" : "1.5px solid #C9D3E4" }}>
                        {on && (f.locked
                          ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                          : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>)}
                      </span>
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {msg && <div style={{ padding: "0 20px 6px", fontSize: 13, fontWeight: 800, color: "#B4342A" }}>{msg}</div>}
        <div style={{ display: "flex", gap: 8, padding: "12px 20px 16px", borderTop: "1px solid #EEF1F6" }}>
          {tab === "mine" && mineOn && <button type="button" onClick={followCompany} disabled={busy} style={{ ...btn, background: "#fff", color: "#1B2B4B", border: "1px solid #C9D5EA" }}>회사 설정 따르기</button>}
          <button type="button" onClick={onClose} style={{ ...btn, background: "#fff", color: "#5B6B85", border: "1px solid #E3E8F0", marginLeft: "auto" }}>취소</button>
          <button type="button" onClick={apply} disabled={busy} style={{ ...btn, background: "linear-gradient(120deg,#0F1A30,#2D4C82)", color: "#fff", border: 0, minWidth: 110 }}>{busy ? "적용 중…" : tab === "company" ? "회사 전체 적용" : "내 화면에 적용"}</button>
        </div>
      </div>
    </div>,
    document.body);
}
const chip = { border: "1px solid #DCE3EE", background: "#fff", borderRadius: 9, padding: "6px 11px", fontSize: 12.5, fontWeight: 800, color: "#1B2B4B", cursor: "pointer", fontFamily: "inherit" };
const btn = { height: 44, padding: "0 16px", borderRadius: 12, fontSize: 14.5, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" };
