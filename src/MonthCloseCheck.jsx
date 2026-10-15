// ===================== 월 마감 점검 =====================
// ⭐ 마감 전에 매출 숫자를 틀리게 만드는 오더(운임 미입력·역마진·지급방식 누락 등)를
// 한 화면에 모아 바로 고치게 한다. 운임·지급방식은 이 화면에서 바로 수정·저장된다.
import React, { useMemo, useState, useEffect } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { toWon } from "./monthCompare";
import { useLoadOrderRange, monthEnd } from "./orderHistory";

const NAVY = "#1B2B4B";
const kstMonth = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
const shiftMonth = (m, d) => { const [y, mm] = m.split("-").map(Number); const t = new Date(y, mm - 1 + d, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`; };
const isCanceled = (r) => r?.배차상태 === "배차취소" || r?.상태 === "취소";
const PAY_OPTIONS = ["계산서", "착불", "선불", "계좌이체", "개인", "손실"];

export const CLOSE_CHECKS = [
  { key: "noSale", label: "청구운임 미입력", tone: "bad", desc: "기사운임만 있고 청구운임이 0원 — 매출이 빠짐", test: (r) => toWon(r.청구운임) === 0 && toWon(r.기사운임) > 0 },
  { key: "noDriverFare", label: "기사운임 미입력", tone: "bad", desc: "청구운임만 있고 기사운임이 0원 — 수익이 부풀려짐", test: (r) => toWon(r.청구운임) > 0 && toWon(r.기사운임) === 0 },
  { key: "negative", label: "역마진", tone: "bad", desc: "기사운임이 청구운임보다 큼", test: (r) => toWon(r.청구운임) > 0 && toWon(r.청구운임) < toWon(r.기사운임) },
  { key: "zero", label: "수익 0원", tone: "warn", desc: "청구운임 = 기사운임", test: (r) => toWon(r.청구운임) > 0 && toWon(r.청구운임) === toWon(r.기사운임) },
  { key: "noPay", label: "지급방식 미입력", tone: "warn", desc: "지급방식이 비어 있음", test: (r) => !String(r.지급방식 || "").trim() },
  { key: "noFare", label: "운임 둘 다 미입력", tone: "bad", desc: "청구·기사운임 모두 0원", test: (r) => toWon(r.청구운임) === 0 && toWon(r.기사운임) === 0 },
  { key: "unassigned", label: "배차 미완료", tone: "warn", desc: "지난 날짜인데 아직 배차중(차량 미배정)", test: (r, today) => (r.배차상태 || "") !== "배차완료" && String(r.상차일 || "") < today },
  { key: "noClient", label: "거래처 미입력", tone: "warn", desc: "거래처명이 비어 있음", test: (r) => !String(r.거래처명 || "").trim() },
];

export default function MonthCloseCheck({ dispatchData = [], onClose, isViewer = false }) {
  const [month, setMonth] = useState(() => shiftMonth(kstMonth(), -1));
  useLoadOrderRange(`${month}-01`, monthEnd(month)); // ⭐ 고른 달만 불러오기
  const [active, setActive] = useState("noSale");
  const [edits, setEdits] = useState({}); // id → { 청구운임, 기사운임, 지급방식 }
  const [saving, setSaving] = useState({});
  const [savedIds, setSavedIds] = useState({});
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const months = useMemo(() => [...new Set((dispatchData || []).map((r) => String(r.상차일 || "").slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)))].sort().reverse(), [dispatchData]);
  const list = useMemo(() => (dispatchData || []).filter((r) => String(r.상차일 || "").startsWith(month) && !isCanceled(r)), [dispatchData, month]);
  const result = useMemo(() => {
    const m = {};
    // ⭐ 지급방식 "손실"은 원래 청구가 없는 오더라 점검 대상에서 뺀다
    const targets = list.filter((r) => String(r.지급방식 || "").trim() !== "손실");
    for (const c of CLOSE_CHECKS) m[c.key] = targets.filter((r) => c.test(r, today));
    // 운임 둘 다 미입력은 청구운임 미입력과 겹치지 않음(기사운임 0) — 그대로 둔다
    return m;
  }, [list, today]);
  const total = CLOSE_CHECKS.reduce((s, c) => s + result[c.key].length, 0);
  const cur = CLOSE_CHECKS.find((c) => c.key === active) || CLOSE_CHECKS[0];
  const rows = (result[cur.key] || []).slice().sort((a, b) => String(a.상차일).localeCompare(String(b.상차일)));

  const val = (r, k) => (edits[r._id]?.[k] !== undefined ? edits[r._id][k] : r[k] ?? "");
  const setVal = (r, k, v) => setEdits((p) => ({ ...p, [r._id]: { ...(p[r._id] || {}), [k]: v } }));
  const save = async (r) => {
    if (isViewer) return window.alert("조회전용 권한으로는 수정할 수 없습니다.");
    const e = edits[r._id];
    if (!e) return;
    const s = toWon(e.청구운임 !== undefined ? e.청구운임 : r.청구운임);
    const d = toWon(e.기사운임 !== undefined ? e.기사운임 : r.기사운임);
    const patch = { 청구운임: s, 기사운임: d, 수수료: s - d, updatedAt: serverTimestamp(), _lastModified: Date.now() };
    if (e.지급방식 !== undefined) patch.지급방식 = e.지급방식;
    setSaving((p) => ({ ...p, [r._id]: true }));
    try {
      await updateDoc(doc(db, r.__col || "dispatch", r._id), patch);
      setSavedIds((p) => ({ ...p, [r._id]: true }));
      setEdits((p) => { const n = { ...p }; delete n[r._id]; return n; });
    } catch (err) {
      console.error("월 마감 점검 저장 실패:", err);
      window.alert("저장에 실패했습니다: " + (err?.message || ""));
    } finally {
      setSaving((p) => ({ ...p, [r._id]: false }));
    }
  };

  const toneColor = { bad: { c: "#b91c1c", bg: "#fff1f2", bd: "#fecaca" }, warn: { c: "#92400e", bg: "#fffbeb", bd: "#fde68a" } };
  const inp = { width: 110, height: 34, border: "1px solid #cbd5e1", borderRadius: 7, padding: "0 8px", fontSize: 14, fontWeight: 700, textAlign: "right", outline: "none" };
  const editable = !["unassigned", "noClient"].includes(cur.key);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99990, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12, fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif", wordBreak: "keep-all" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#f4f6f9", width: "min(1500px, 100%)", height: "min(95vh, 1200px)", borderRadius: 18, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
        <div style={{ background: NAVY, padding: "16px 22px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ color: "#fff", fontSize: 19, fontWeight: 900, flex: 1 }}>월 마감 점검</div>
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ height: 36, borderRadius: 8, border: "none", padding: "0 10px", fontSize: 15, fontWeight: 800 }}>
            {(months.length ? months : [month]).map((m) => <option key={m} value={m}>{m.slice(0, 4)}년 {Number(m.slice(5))}월</option>)}
          </select>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: "rgba(255,255,255,.85)", fontSize: 24, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* 요약 */}
          <div style={{ background: total ? "#fff1f2" : "#f0fdf4", border: `1px solid ${total ? "#fecaca" : "#bbf7d0"}`, borderRadius: 14, padding: "14px 18px", fontSize: 17, fontWeight: 900, color: total ? "#991b1b" : "#065f46", flexShrink: 0 }}>
            {total ? `${Number(month.slice(5))}월 오더 ${list.length.toLocaleString()}건 중 확인이 필요한 항목이 ${total.toLocaleString()}건 있습니다. 마감 전에 고쳐주세요.` : `${Number(month.slice(5))}월 오더 ${list.length.toLocaleString()}건 — 확인이 필요한 오더가 없습니다. 마감해도 됩니다.`}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, flexShrink: 0 }}>
            {CLOSE_CHECKS.map((c) => {
              const n = result[c.key].length, on = c.key === active, t = toneColor[c.tone];
              return (
                <button key={c.key} onClick={() => setActive(c.key)} style={{ textAlign: "left", cursor: "pointer", borderRadius: 12, padding: "12px 14px", border: `2px solid ${on ? NAVY : n ? t.bd : "#e2e7ef"}`, background: on ? "#fff" : n ? t.bg : "#fff" }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: n ? t.c : "#4b5563" }}>{c.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: n ? t.c : "#9ca3af", marginTop: 2 }}>{n}건</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#4b5563", marginTop: 2 }}>{c.desc}</div>
                </button>
              );
            })}
          </div>
          {/* 목록 */}
          <div style={{ background: "#fff", border: "1px solid #e2e7ef", borderRadius: 14, padding: 16, flexShrink: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: NAVY, marginBottom: 10 }}>{cur.label} ({rows.length}건){editable && rows.length > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: "#4b5563", marginLeft: 8 }}>운임·지급방식을 고치고 [저장]을 누르면 바로 반영됩니다</span>}</div>
            {rows.length === 0 ? (
              <div style={{ fontSize: 15, fontWeight: 700, color: "#047857", padding: "10px 0" }}>해당 오더가 없습니다.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 1000 }}>
                  <thead>
                    <tr style={{ background: "#eef1f6", color: NAVY }}>
                      {["상차일", "거래처", "상차지 → 하차지", "차량번호 · 기사", "배차상태", "청구운임", "기사운임", "수익", "지급방식", ""].map((h) => (
                        <th key={h} style={{ padding: "10px 8px", fontWeight: 900, textAlign: "center", borderBottom: "2px solid #cfd8e5", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const s = toWon(val(r, "청구운임")), d = toWon(val(r, "기사운임"));
                      const dirty = !!edits[r._id];
                      const fixed = !r._id || r.__fixed;
                      return (
                        <tr key={r._id || `${r.상차일}-${r.거래처명}-${r.청구운임}`} style={{ borderBottom: "1px solid #eef1f6", background: savedIds[r._id] ? "#f0fdf4" : undefined }}>
                          <td style={{ padding: "8px", textAlign: "center", whiteSpace: "nowrap", fontWeight: 700 }}>{r.상차일}</td>
                          <td style={{ padding: "8px", textAlign: "center", fontWeight: 800 }}>{r.거래처명 || "-"}</td>
                          <td style={{ padding: "8px", textAlign: "center", fontWeight: 600 }}>{r.상차지명 || "-"} → {r.하차지명 || "-"}</td>
                          <td style={{ padding: "8px", textAlign: "center", whiteSpace: "nowrap", fontWeight: 600 }}>{r.차량번호 || "-"} {r.이름 || ""}</td>
                          <td style={{ padding: "8px", textAlign: "center", whiteSpace: "nowrap", fontWeight: 700 }}>{r.배차상태 || "-"}</td>
                          <td style={{ padding: "8px", textAlign: "center" }}>{editable && !fixed ? <input style={inp} value={val(r, "청구운임")} onChange={(e) => setVal(r, "청구운임", e.target.value.replace(/[^\d]/g, ""))} /> : toWon(r.청구운임).toLocaleString()}</td>
                          <td style={{ padding: "8px", textAlign: "center" }}>{editable && !fixed ? <input style={inp} value={val(r, "기사운임")} onChange={(e) => setVal(r, "기사운임", e.target.value.replace(/[^\d]/g, ""))} /> : toWon(r.기사운임).toLocaleString()}</td>
                          <td style={{ padding: "8px", textAlign: "center", fontWeight: 900, color: s - d < 0 ? "#b91c1c" : s - d === 0 ? "#92400e" : "#047857", whiteSpace: "nowrap" }}>{(s - d).toLocaleString()}</td>
                          <td style={{ padding: "8px", textAlign: "center" }}>
                            {editable && !fixed ? (
                              <select value={val(r, "지급방식")} onChange={(e) => setVal(r, "지급방식", e.target.value)} style={{ height: 34, borderRadius: 7, border: "1px solid #cbd5e1", fontSize: 14, fontWeight: 700 }}>
                                <option value="">미입력</option>
                                {[...new Set([...PAY_OPTIONS, r.지급방식].filter(Boolean))].map((p) => <option key={p} value={p}>{p}</option>)}
                              </select>
                            ) : (r.지급방식 || "-")}
                          </td>
                          <td style={{ padding: "8px", textAlign: "center", whiteSpace: "nowrap" }}>
                            {fixed ? <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>고정거래처</span>
                              : savedIds[r._id] && !dirty ? <span style={{ fontSize: 13, color: "#047857", fontWeight: 900 }}>저장됨</span>
                              : editable ? <button onClick={() => save(r)} disabled={!dirty || saving[r._id]} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "none", background: dirty ? NAVY : "#e5e7eb", color: dirty ? "#fff" : "#9ca3af", fontSize: 14, fontWeight: 800, cursor: dirty ? "pointer" : "default" }}>{saving[r._id] ? "저장 중…" : "저장"}</button>
                              : <span style={{ fontSize: 12, color: "#4b5563", fontWeight: 700 }}>배차관리에서 수정</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
