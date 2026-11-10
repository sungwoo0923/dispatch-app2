// ===================== 월 마감 점검 =====================
// ⭐ 마감 전에 매출 숫자를 틀리게 만드는 오더(운임 미입력·역마진·지급방식 누락 등)를
// 한 화면에 모아 바로 고치게 한다. 운임·지급방식은 이 화면에서 바로 수정·저장된다.
import React, { useMemo, useState, useEffect } from "react";
import {
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { updateDoc } from "./orderWrite"; // ★ 오더 수정시각 자동 기록(여러 사용자 실시간 일치)
import { db } from "./firebase";
import { toWon } from "./monthCompare";
import { useLoadOrderRange, monthEnd } from "./orderHistory";
import { CustomSelect } from "./CustomSelect";
import { CompanyOptionPicker } from "./companyOptionPicker"; // 🧾 2026-11-02 지급방식·배차방식·상/하차방법 공용 선택기(＋ 추가)
import { fmtMoney } from "./formatInput";

const NAVY = "#1B2B4B";
const kstMonth = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
const shiftMonth = (m, d) => { const [y, mm] = m.split("-").map(Number); const t = new Date(y, mm - 1 + d, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`; };
const isCanceled = (r) => r?.배차상태 === "배차취소" || r?.상태 === "취소";

export const CLOSE_CHECKS = [
  { key: "noSale", label: "청구운임 미입력", tone: "bad", desc: "기사운임만 있고 청구운임이 0원이라 매출이 빠져요", test: (r) => toWon(r.청구운임) === 0 && toWon(r.기사운임) > 0 },
  { key: "noDriverFare", label: "기사운임 미입력", tone: "bad", desc: "청구운임만 있고 기사운임이 0원이라 수익이 부풀려져요", test: (r) => toWon(r.청구운임) > 0 && toWon(r.기사운임) === 0 },
  { key: "negative", label: "역마진", tone: "bad", desc: "기사운임이 청구운임보다 큼", test: (r) => toWon(r.청구운임) > 0 && toWon(r.청구운임) < toWon(r.기사운임) },
  { key: "zero", label: "수익 0원", tone: "warn", desc: "청구운임 = 기사운임", test: (r) => toWon(r.청구운임) > 0 && toWon(r.청구운임) === toWon(r.기사운임) },
  { key: "noPay", label: "지급방식 미입력", tone: "warn", desc: "지급방식이 비어 있음", test: (r) => !String(r.지급방식 || "").trim() },
  { key: "noFare", label: "운임 둘 다 미입력", tone: "bad", desc: "청구·기사운임 모두 0원", test: (r) => toWon(r.청구운임) === 0 && toWon(r.기사운임) === 0 },
  { key: "unassigned", label: "배차 미완료", tone: "warn", desc: "지난 날짜인데 아직 배차중(차량 미배정)", test: (r, today) => (r.배차상태 || "") !== "배차완료" && String(r.상차일 || "") < today },
  { key: "noClient", label: "거래처 미입력", tone: "warn", desc: "거래처명이 비어 있음", test: (r) => !String(r.거래처명 || "").trim() },
];

export default function MonthCloseCheck({ dispatchData = [], onClose, isViewer = false }) {
  const [month, setMonth] = useState(() => shiftMonth(kstMonth(), -1));
  useLoadOrderRange(`${month}-01`, monthEnd(month)); // ★ 고른 달만 불러오기
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

  // ⭐ 2026-11-07 디자인 통일 — 남색 팔레트(초록·노랑 대신) · 머리말 그라데이션 · 가는 테두리 카드
  const toneColor = { bad: { c: "#B42318", bg: "#FEF3F2", bd: "#FECDCA" }, warn: { c: "#2D4C82", bg: "#F5F8FD", bd: "#C9D6EE" } };
  const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
  const eyebrow = (light) => ({ fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: "0.24em", textTransform: "uppercase", color: light ? "#8FB0F0" : "#2D4C82" });
  const inp = { width: 110, height: 36, border: "1px solid #DCE3EE", borderRadius: 10, fontVariantNumeric: "tabular-nums", padding: "0 8px", fontSize: 14, fontWeight: 700, textAlign: "right", outline: "none" };
  const editable = !["unassigned", "noClient"].includes(cur.key);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99990, background: "rgba(11,20,40,.55)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12, fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif", wordBreak: "keep-all" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#F4F7FB", width: "min(1500px, 100%)", height: "min(95vh, 1200px)", borderRadius: 22, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 30px 80px rgba(11,20,40,.45)" }}>
        <div style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)", padding: "18px 24px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={eyebrow(true)}>Revenue · Month Close</div>
            <div style={{ color: "#fff", fontSize: 20, fontWeight: 900, marginTop: 2 }}>월 마감 점검</div>
          </div>
          <CustomSelect value={month} onChange={(e) => setMonth(e.target.value)} style={{ height: 38, borderRadius: 11, border: "none", padding: "0 26px 0 10px", fontSize: 15, fontWeight: 800, background: "#fff", color: "#0F1A30" }}>
            {(months.length ? months : [month]).map((m) => <option key={m} value={m}>{m.slice(0, 4)}년 {Number(m.slice(5))}월</option>)}
          </CustomSelect>
          <button onClick={onClose} aria-label="닫기" title="닫기" style={{ width: 38, height: 38, borderRadius: 11, border: "1px solid rgba(143,176,240,.35)", background: "rgba(255,255,255,.06)", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* 요약 */}
          <div style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)", borderRadius: 18, padding: "18px 22px", fontSize: 17, fontWeight: 900, color: "#fff", flexShrink: 0, lineHeight: 1.5, boxShadow: "0 12px 30px rgba(11,20,40,.18)" }}>
            <div style={{ ...eyebrow(true), marginBottom: 4, color: total ? "#FFB4AB" : "#8FB0F0" }}>{total ? "Check · Action Needed" : "Check · All Clear"}</div>
            {total ? `${Number(month.slice(5))}월 오더 ${list.length.toLocaleString()}건 중 확인이 필요한 항목이 ${total.toLocaleString()}건 있습니다. 마감 전에 고쳐주세요.` : `${Number(month.slice(5))}월 오더 ${list.length.toLocaleString()}건, 확인이 필요한 오더가 없어요. 마감해도 돼요.`}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, flexShrink: 0 }}>
            {CLOSE_CHECKS.map((c) => {
              const n = result[c.key].length, on = c.key === active, t = toneColor[c.tone];
              return (
                <button key={c.key} onClick={() => setActive(c.key)} style={{ textAlign: "left", cursor: "pointer", borderRadius: 12, padding: "12px 14px", border: `1px solid ${on ? NAVY : n ? t.bd : "#E3E8F0"}`, boxShadow: on ? `0 0 0 2px ${NAVY}, 0 8px 20px rgba(15,26,48,.12)` : "0 1px 2px rgba(15,26,48,.04)", background: n ? t.bg : "#fff", borderRadius: 16, transition: "box-shadow .12s" }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: n ? t.c : "#3A4A66" }}>{c.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: n ? t.c : "#9AA8C2", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{n}<span style={{ fontSize: 15, marginLeft: 2 }}>건</span></div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#5B6B86", marginTop: 2 }}>{c.desc}</div>
                </button>
              );
            })}
          </div>
          {/* 목록 */}
          <div style={{ background: "#fff", border: "1px solid #E3E8F0", borderRadius: 16, padding: 20, flexShrink: 0, boxShadow: "0 1px 2px rgba(15,26,48,.04)" }}>
            <div style={eyebrow(false)}>Orders</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: "#0F1A30", margin: "2px 0 12px" }}>{cur.label} ({rows.length}건){editable && rows.length > 0 && <span style={{ fontSize: 13.5, fontWeight: 700, color: "#5B6B86", marginLeft: 8 }}>운임·지급방식을 고치고 [저장]을 누르면 바로 반영됩니다</span>}</div>
            {rows.length === 0 ? (
              <div style={{ fontSize: 15, fontWeight: 700, color: "#5B6B86", padding: "22px 0", textAlign: "center", border: "1px dashed #DCE3EE", borderRadius: 14, background: "#FAFBFD" }}>해당 오더가 없습니다.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 1000 }}>
                  <thead>
                    <tr style={{ background: "#F4F7FB", color: NAVY }}>
                      {["상차일", "거래처", "상차지 → 하차지", "차량번호 · 기사", "배차상태", "청구운임", "기사운임", "수익", "지급방식", ""].map((h) => (
                        <th key={h} style={{ padding: "10px 8px", fontWeight: 900, textAlign: "center", borderBottom: "1px solid #E3E8F0", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const s = toWon(val(r, "청구운임")), d = toWon(val(r, "기사운임"));
                      const dirty = !!edits[r._id];
                      const fixed = !r._id || r.__fixed;
                      return (
                        <tr key={r._id || `${r.상차일}-${r.거래처명}-${r.청구운임}`} style={{ borderBottom: "1px solid #EEF2F7", background: savedIds[r._id] ? "#F5F8FD" : undefined }}>
                          <td style={{ padding: "8px", textAlign: "center", whiteSpace: "nowrap", fontWeight: 700 }}>{r.상차일}</td>
                          <td style={{ padding: "8px", textAlign: "center", fontWeight: 800 }}>{r.거래처명 || "-"}</td>
                          <td style={{ padding: "8px", textAlign: "center", fontWeight: 600 }}>{r.상차지명 || "-"} → {r.하차지명 || "-"}</td>
                          <td style={{ padding: "8px", textAlign: "center", whiteSpace: "nowrap", fontWeight: 600 }}>{r.차량번호 || "-"} {r.이름 || ""}</td>
                          <td style={{ padding: "8px", textAlign: "center", whiteSpace: "nowrap", fontWeight: 700 }}>{r.배차상태 || "-"}</td>
                          <td style={{ padding: "8px", textAlign: "center" }}>{editable && !fixed ? <input style={inp} inputMode="numeric" value={fmtMoney(val(r, "청구운임"))} onChange={(e) => setVal(r, "청구운임", e.target.value.replace(/[^\d]/g, ""))} /> : toWon(r.청구운임).toLocaleString()}</td>
                          <td style={{ padding: "8px", textAlign: "center" }}>{editable && !fixed ? <input style={inp} inputMode="numeric" value={fmtMoney(val(r, "기사운임"))} onChange={(e) => setVal(r, "기사운임", e.target.value.replace(/[^\d]/g, ""))} /> : toWon(r.기사운임).toLocaleString()}</td>
                          <td style={{ padding: "8px", textAlign: "center", fontWeight: 900, color: s - d < 0 ? "#D92D20" : s - d === 0 ? "#6B7588" : "#0F1A30", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{(s - d).toLocaleString()}</td>
                          <td style={{ padding: "8px", textAlign: "center" }}>
                            {editable && !fixed ? (
                              <CompanyOptionPicker optKey="지급방식" placeholder="미입력" noneLabel="미입력" value={val(r, "지급방식")} onChange={(v) => setVal(r, "지급방식", v)} style={{ height: 36, minWidth: 96, borderRadius: 10, border: "1px solid #DCE3EE", padding: "0 8px", fontSize: 14, fontWeight: 700, background: "#fff", color: "#0F1A30" }} />
                            ) : (r.지급방식 || "-")}
                          </td>
                          <td style={{ padding: "8px", textAlign: "center", whiteSpace: "nowrap" }}>
                            {fixed ? <span style={{ fontSize: 13, color: "#5B6B86", fontWeight: 700 }}>고정거래처</span>
                              : savedIds[r._id] && !dirty ? <span style={{ fontSize: 13, color: "#1B2B4B", fontWeight: 900, background: "#EEF3FB", borderRadius: 99, padding: "3px 10px" }}>저장됨</span>
                              : editable ? <button onClick={() => save(r)} disabled={!dirty || saving[r._id]} style={{ height: 36, padding: "0 16px", borderRadius: 10, border: "none", background: dirty ? NAVY : "#EEF2F7", color: dirty ? "#fff" : "#9AA8C2", fontSize: 14, fontWeight: 800, cursor: dirty ? "pointer" : "default" }}>{saving[r._id] ? "저장 중…" : "저장"}</button>
                              : <span style={{ fontSize: 13, color: "#5B6B86", fontWeight: 700 }}>오더등록에서 수정</span>}
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
