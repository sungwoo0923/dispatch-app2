// ===================== 노선-거래처 불일치 경고 =====================
// ⭐ 사용자 요청 — 오더복사로 "노선은 같은데 거래처명이 다른" 과거 오더를 불러와 그대로 등록하는 실수 방지.
// 판단 기준(취소 오더 제외, 지금 불러와진 오더 데이터 기준):
//  ① 같은 노선 — 상차지·하차지가 같은(이름 또는 주소) 과거 오더에서 다른 거래처가
//     2건 이상이고, 지금 거래처보다 2배 이상 많으면 경고
//  ② 같은 하차지 — 하차지가 같은(이름 또는 주소) 과거 오더 4건 이상 중 한 거래처가 70% 이상이고,
//     지금 거래처보다 3배 이상 많으면 경고(상차지명이 달라도 잡힌다)
// 저장을 막지는 않는다.
import React from "react";

const NAVY = "#1B2B4B";
const norm = (v) => String(v || "").replace(/\s+/g, "").toLowerCase();
const normAddr = (v) => String(v || "").replace(/\(.*?\)/g, "").replace(/\s+/g, "").toLowerCase();
const isCanceled = (r) => r?.배차상태 === "배차취소" || r?.상태 === "취소" || r?.지급방식 === "취소";

const _cache = new WeakMap();
function getIndex(rows) {
  let ix = _cache.get(rows);
  if (ix) return ix;
  ix = { route: new Map(), drop: new Map(), rows };
  const add = (m, k, i) => { if (!k) return; let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(i); };
  rows.forEach((r, i) => {
    if (!r || isCanceled(r) || !norm(r.거래처명)) return;
    const p = norm(r.상차지명), d = norm(r.하차지명), pa = normAddr(r.상차지주소), da = normAddr(r.하차지주소);
    if (p && d) add(ix.route, `n:${p}|${d}`, i);
    if (pa && da) add(ix.route, `a:${pa}|${da}`, i);
    if (d) add(ix.drop, `n:${d}`, i);
    if (da) add(ix.drop, `a:${da}`, i);
  });
  _cache.set(rows, ix);
  return ix;
}

function tally(ix, lists, cur) {
  const seen = new Set(), counts = new Map();
  let total = 0;
  for (const list of lists) for (const i of list || []) {
    if (seen.has(i)) continue;
    seen.add(i);
    const r = ix.rows[i], k = norm(r.거래처명);
    total++;
    const e = counts.get(k) || { name: String(r.거래처명).trim(), count: 0, last: "" };
    e.count++;
    if (String(r.상차일 || "") > e.last) e.last = String(r.상차일 || "");
    counts.set(k, e);
  }
  const curCount = counts.get(cur)?.count || 0;
  const top = [...counts.entries()].filter(([k]) => k !== cur).map(([, v]) => v).sort((a, b) => b.count - a.count)[0];
  return { total, curCount, top, list: [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 6) };
}

export function findClientRouteMismatch(form, rows = []) {
  const cur = norm(form?.거래처명);
  if (!cur || !Array.isArray(rows) || !rows.length) return null;
  const ix = getIndex(rows);
  const p = norm(form.상차지명), d = norm(form.하차지명), pa = normAddr(form.상차지주소), da = normAddr(form.하차지주소);

  // ① 같은 노선
  const rt = tally(ix, [p && d ? ix.route.get(`n:${p}|${d}`) : null, pa && da ? ix.route.get(`a:${pa}|${da}`) : null], cur);
  if (rt.top && rt.top.count >= 2 && rt.top.count >= rt.curCount * 2) {
    return { basis: "route", current: String(form.거래처명).trim(), curCount: rt.curCount, suggest: rt.top.name, total: rt.total, list: rt.list };
  }
  // ② 같은 하차지
  const dp = tally(ix, [d ? ix.drop.get(`n:${d}`) : null, da ? ix.drop.get(`a:${da}`) : null], cur);
  if (dp.top && dp.total >= 4 && dp.top.count / dp.total >= 0.7 && dp.top.count >= Math.max(dp.curCount, 1) * 3) {
    return { basis: "drop", current: String(form.거래처명).trim(), curCount: dp.curCount, suggest: dp.top.name, total: dp.total, list: dp.list };
  }
  return null;
}

// 오더복사 목록용 작은 경고 표시
export function ClientMismatchTag({ row, rows }) {
  const info = React.useMemo(() => findClientRouteMismatch(row, rows), [row, rows]);
  if (!info) return null;
  return (
    <span title={`${info.basis === "route" ? "같은 노선" : "같은 하차지"} 과거 오더 ${info.total}건 중 ${info.list[0]?.count}건이 "${info.suggest}" 거래처입니다`}
      style={{ display: "inline-block", marginLeft: 6, padding: "1px 7px", borderRadius: 99, background: "#fef3c7", border: "1px solid #f59e0b", color: "#92400e", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", verticalAlign: "middle" }}>
      ⚠ 보통 {info.suggest}
    </span>
  );
}

export function ClientMismatchModal({ info, pickup, drop, onChange, onKeep, onCancel }) {
  if (!info) return null;
  const btn = { height: 48, borderRadius: 10, fontSize: 16, fontWeight: 900, cursor: "pointer", padding: "0 16px" };
  const top = info.list.find((c) => c.name === info.suggest);
  const pct = top && info.total ? Math.round((top.count / info.total) * 100) : 0;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000000, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif" }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 500, maxWidth: "92vw", background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,.3)" }}>
        <div style={{ background: "#b45309", color: "#fff", padding: "14px 20px", fontSize: 18, fontWeight: 900 }}>⚠️ 거래처명을 확인해주세요</div>
        <div style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", lineHeight: 1.65 }}>
            {info.basis === "route"
              ? <><b style={{ color: NAVY }}>{pickup} → {drop}</b> 노선은</>
              : <><b style={{ color: NAVY }}>{drop}</b>(으)로 가는 오더는</>}<br />
            보통 <b style={{ color: "#047857", fontSize: 18 }}>{info.suggest}</b> 거래처로 등록됐습니다 ({info.total}건 중 {top?.count}건, {pct}%).<br />
            지금 거래처명은 <b style={{ color: "#b91c1c", fontSize: 18 }}>{info.current}</b>입니다.
          </div>
          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: "#4b5563" }}>
            기준: {info.basis === "route" ? "상차지·하차지가 같은 과거 오더" : "하차지가 같은 과거 오더"} {info.total}건 (취소 제외)
          </div>
          <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px", background: "#f4f6f9", padding: "8px 12px", fontSize: 14, fontWeight: 800, color: "#374151" }}>
              <div>거래처</div><div style={{ textAlign: "right" }}>건수</div><div style={{ textAlign: "right" }}>최근 상차일</div>
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
            <button onClick={onChange} style={{ ...btn, border: "none", background: NAVY, color: "#fff" }}>“{info.suggest}”(으)로 바꿔서 등록</button>
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
