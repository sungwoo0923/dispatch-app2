// ===================== 노선-거래처 불일치 경고 =====================
// ⭐ 사용자 요청 — 오더복사로 "노선은 같은데 거래처명이 다른" 과거 오더를 불러와 그대로 등록하는 실수 방지.
// 같은 상차지명 → 하차지명 노선의 과거 오더에서 거래처명을 세어, 지금 입력한 거래처보다
// 훨씬 자주 쓰인 거래처가 있으면 등록 직전에 알려준다(저장을 막지는 않음).
import React from "react";

const NAVY = "#1B2B4B";
const norm = (v) => String(v || "").replace(/\s+/g, "").toLowerCase();
const isCanceled = (r) => r?.배차상태 === "배차취소" || r?.상태 === "취소" || r?.지급방식 === "취소";

export function findClientRouteMismatch(form, rows = []) {
  const p = norm(form?.상차지명), d = norm(form?.하차지명), cur = norm(form?.거래처명);
  if (!p || !d || !cur) return null;
  const counts = new Map(); // norm → { name, count, last }
  let total = 0;
  for (const r of rows || []) {
    if (isCanceled(r)) continue;
    if (norm(r.상차지명) !== p || norm(r.하차지명) !== d) continue;
    const k = norm(r.거래처명);
    if (!k) continue;
    total++;
    const e = counts.get(k) || { name: String(r.거래처명).trim(), count: 0, last: "" };
    e.count++;
    if (String(r.상차일 || "") > e.last) e.last = String(r.상차일 || "");
    counts.set(k, e);
  }
  const curCount = counts.get(cur)?.count || 0;
  const others = [...counts.entries()].filter(([k]) => k !== cur).map(([, v]) => v).sort((a, b) => b.count - a.count);
  const top = others[0];
  // 다른 거래처로 2건 이상 + 지금 거래처보다 2배 이상 많이 쓰인 노선이면 경고
  if (!top || top.count < 2 || top.count < curCount * 2) return null;
  return {
    current: String(form.거래처명).trim(),
    curCount,
    suggest: top.name,
    total,
    list: [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 5),
  };
}

export function ClientMismatchModal({ info, pickup, drop, onChange, onKeep, onCancel }) {
  if (!info) return null;
  const btn = { height: 48, borderRadius: 10, fontSize: 16, fontWeight: 900, cursor: "pointer", padding: "0 16px" };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000000, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif" }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: "92vw", background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,.3)" }}>
        <div style={{ background: "#b45309", color: "#fff", padding: "14px 20px", fontSize: 18, fontWeight: 900 }}>⚠️ 거래처명을 확인해주세요</div>
        <div style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", lineHeight: 1.6 }}>
            <b style={{ color: NAVY }}>{pickup} → {drop}</b> 노선은<br />
            보통 <b style={{ color: "#047857", fontSize: 18 }}>{info.suggest}</b>(으)로 등록됐습니다.<br />
            지금 거래처명은 <b style={{ color: "#b91c1c", fontSize: 18 }}>{info.current}</b>입니다.
          </div>
          <div style={{ marginTop: 14, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px", background: "#f4f6f9", padding: "8px 12px", fontSize: 14, fontWeight: 800, color: "#374151" }}>
              <div>이 노선의 거래처</div><div style={{ textAlign: "right" }}>건수</div><div style={{ textAlign: "right" }}>최근 상차일</div>
            </div>
            {info.list.map((c) => {
              const isCur = norm(c.name) === norm(info.current), isSug = c.name === info.suggest;
              return (
                <div key={c.name} style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px", padding: "9px 12px", borderTop: "1px solid #eef1f5", fontSize: 15, fontWeight: 700, color: isCur ? "#b91c1c" : isSug ? "#047857" : "#111827", background: isCur ? "#fef2f2" : isSug ? "#ecfdf5" : "#fff" }}>
                  <div>{c.name}{isCur ? " (지금 입력)" : ""}</div>
                  <div style={{ textAlign: "right" }}>{c.count}건</div>
                  <div style={{ textAlign: "right" }}>{c.last || "-"}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            <button onClick={onChange} style={{ ...btn, border: "none", background: NAVY, color: "#fff" }}>“{info.suggest}”(으)로 바꾸기</button>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onKeep} style={{ ...btn, flex: 1, border: "1.5px solid #d1d5db", background: "#fff", color: "#374151" }}>“{info.current}” 그대로 등록</button>
              <button onClick={onCancel} style={{ ...btn, border: "1.5px solid #d1d5db", background: "#fff", color: "#6b7280" }}>취소</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
