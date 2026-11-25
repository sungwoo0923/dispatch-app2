// ======================= src/RouteBoardViews.jsx =======================
// 🗂 2026-11-26 지입차관리 › 노선관리 새 보기(사용자가 시안 ① 줄 보기 + ② 시간표를 고름)
//  · 줄 보기: 맨 위 칸 이름 줄 한 번 + 기사 한 명당 한 줄(이름 · 차량번호 크게 / 상태 / 그날 노선 줄마다 "상태 · 상차 시각 · 상차지 → 하차지 · 거래처 · 기사운임 · 오더확인" / 정산 예정 / 담당자 / 위치)
//    글은 자르지 않고 칸 안에서 줄을 바꾼다. [자세히 ▾]를 누르면 그 기사 원래 카드(오더 수정 · 오른쪽 메뉴 · 타임라인 · 첨부)가 바로 아래 열린다
//  · 시간표: 기사별 하루 막대(상차 → 하차 시각). 지금 시각 빨간 선. 막대를 누르면 그 기사 상세
//  · 묶음: 전체 지입차 = 담당자별(내가 맡은 묶음 맨 위 · 미지정 맨 아래), 내 담당 차량 = 내 것만
//  · 계산 · 저장 함수는 FleetManagement 가 넘긴다(statusOf · orderMeta · renderCard · timeToMin · geocode)
import React from "react";

const C = { panel: "#0B1424", panel2: "#0E1A30", line: "#1A2742", line2: "#22345A", text: "#E6EDF8", sub: "#8796AE", dim: "#6B7A95", accent: "#38BDF8" };
const won = (v) => { const n = Number(String(v ?? "").replace(/[^\d]/g, "")); return n ? `${n.toLocaleString("ko-KR")}원` : "-"; };
const STATUS_COLOR = { 운송중: "#60A5FA", 오더확인중: "#FBBF24", 배차예정: "#A5B4FC", 배차완료: "#34D399", 배차대기: "#94A3B8", 휴차: "#64748B" };
const CHECK = { 대기: ["확인대기", "#FBBF24"], 수락: ["수락", "#60A5FA"], 거절: ["거절", "#F87171"], 완료: ["완료", "#34D399"] };

const CSS = `
.rbv{container-type:inline-size;font-family:'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕',sans-serif;color:${C.text};font-variant-numeric:tabular-nums}
.rbv-grid{display:grid;grid-template-columns:260px 104px minmax(0,1fr) 128px 120px 220px 118px;align-items:stretch}
.rbv-head{position:sticky;top:0;z-index:5;background:#101E38;border:1px solid ${C.line2};border-radius:12px;margin-bottom:8px;box-shadow:0 6px 14px rgba(3,8,18,.55)}
.rbv-head>div{padding:10px 12px;font-size:13.5px;font-weight:900;color:#9FB3D6;white-space:nowrap}
.rbv-row{background:${C.panel};border:1px solid ${C.line};border-radius:14px;overflow:hidden}
.rbv-row.idle{border-color:#3A3220}
.rbv-row.alt{background:#0D182C}
.rbv-row:hover{border-color:#2B4F8C}
.rbv-row.open{border-color:#38BDF8;box-shadow:0 0 0 3px rgba(56,189,248,.12)}
.rbv-cell{padding:12px;border-left:1px solid #13213D;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:4px}
.rbv-cell:first-child{border-left:0}
.rbv-btn{height:36px;padding:0 12px;border-radius:9px;border:1px solid #2B4F8C;background:transparent;color:#CFE0FF;font:inherit;font-size:13.5px;font-weight:800;cursor:pointer;white-space:nowrap}
.rbv-btn:hover{background:#13264A}
.rbv-btn.pri{background:#2563EB;border-color:#2563EB;color:#fff}
.rbv-group{display:flex;align-items:center;gap:10px;margin:18px 2px 8px;font-size:16px;font-weight:900}
.rbv-group:first-child{margin-top:4px}
.rbv-lines{display:flex;flex-direction:column;gap:6px;max-width:1040px}
.rbv-line{display:grid;grid-template-columns:26px 84px 62px minmax(0,1fr) 128px;gap:10px;align-items:center;padding:8px 12px;border-radius:10px;background:#0E1A30;border:1px solid #1A2742}
.rbv-no{width:22px;height:22px;border-radius:7px;background:#22345A;color:#E6EDF8;font-size:12.5px;font-weight:900;display:grid;place-items:center}
.rbv-fare{justify-self:end;display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
@container (max-width:1180px){.rbv-grid{grid-template-columns:230px 96px minmax(0,1fr) 118px 112px 116px}.rbv-loc{display:none !important}}
@container (max-width:860px){.rbv-grid{grid-template-columns:1fr}.rbv-head{display:none}.rbv-cell{border-left:0;border-top:1px solid #13213D}.rbv-cell:first-child{border-top:0}.rbv-line{grid-template-columns:26px 70px 1fr}.rbv-line>:nth-child(4){grid-column:2/-1}.rbv-fare{grid-column:2/-1;justify-self:start}.rbv-loc{display:flex !important}}
.rbt-wrap{border:1px solid ${C.line};border-radius:16px;background:${C.panel};overflow:auto}
.rbt-row{display:flex;min-height:72px;border-bottom:1px solid #13213D}
.rbt-name{width:240px;flex-shrink:0;padding:10px 14px;border-right:1px solid ${C.line};display:flex;flex-direction:column;justify-content:center;gap:3px;position:sticky;left:0;background:${C.panel};z-index:2}
.rbt-blk{position:absolute;top:8px;bottom:8px;border-radius:10px;padding:4px 10px;display:flex;flex-direction:column;justify-content:center;overflow:hidden;cursor:pointer;border:1px solid rgba(255,255,255,.18)}
.rbt-blk:hover{filter:brightness(1.15)}
`;

// ── 시간표 ──
export function RouteTimelineView({ groups = [], todayStr, selectedDate, isSingleDay = true, statusOf, orderMeta, timeToMin, onOpenDetail }) {
  const all = groups.flatMap((g) => g.rows);
  const spans = (o) => {
    const s0 = timeToMin(o.상차시간);
    const s = s0 == null ? null : s0;
    const nextDay = o.하차일 && o.상차일 && o.하차일 > o.상차일;
    const e0 = timeToMin(o.하차시간);
    const start = s == null ? 8 * 60 : s;
    const end = nextDay ? 24 * 60 : e0 != null && e0 > start ? e0 : Math.min(24 * 60, start + 180);
    return { start, end, unknown: s == null, nextDay };
  };
  const mins = all.flatMap((r) => r.orders.map((o) => spans(o)));
  const lo = Math.max(0, Math.min(6 * 60, ...mins.map((x) => x.start)) - 60);
  const hi = Math.min(24 * 60, Math.max(22 * 60, ...mins.map((x) => x.end)));
  const pct = (m) => ((m - lo) / (hi - lo)) * 100;
  const hours = []; for (let h = Math.ceil(lo / 60); h <= Math.floor(hi / 60); h += 2) hours.push(h);
  const now = new Date(Date.now() + 9 * 3600e3); const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const showNow = selectedDate === todayStr && nowMin >= lo && nowMin <= hi;
  if (!isSingleDay) return <div className="rbv"><style>{CSS}</style><div style={{ padding: 40, textAlign: "center", fontSize: 16, fontWeight: 800, color: "#FCD34D", border: `1px dashed ${C.line2}`, borderRadius: 14 }}>시간표는 하루를 골랐을 때 보여요. 위에서 어제 · 오늘 · 내일 중 하나를 눌러 주세요.</div></div>;
  return (
    <div className="rbv">
      <style>{CSS}</style>
      <div className="rbt-wrap">
        <div style={{ minWidth: 1100 }}>
          <div className="rbt-row" style={{ minHeight: 44, background: "#0E1A30", position: "sticky", top: 0, zIndex: 3 }}>
            <div className="rbt-name" style={{ background: "#0E1A30", fontSize: 13.5, fontWeight: 900, color: "#9FB3D6" }}>기사 · 차량</div>
            <div style={{ flex: 1, position: "relative" }}>
              {hours.map((h) => <span key={h} style={{ position: "absolute", left: `${pct(h * 60)}%`, top: 0, bottom: 0, paddingLeft: 6, borderLeft: `1px solid ${C.line}`, display: "flex", alignItems: "center", fontSize: 13.5, fontWeight: 800, color: "#9FB3D6" }}>{h}시</span>)}
            </div>
          </div>
          {groups.map((g) => (
            <React.Fragment key={g.key}>
              {groups.length > 1 && <div style={{ padding: "8px 14px", fontSize: 14.5, fontWeight: 900, color: g.mine ? "#7DD3FC" : g.key ? C.text : "#A9B8D2", background: "#0A1222", borderBottom: "1px solid #13213D", position: "sticky", left: 0 }}>{g.title} · {g.rows.length}대</div>}
              {g.rows.map((row) => {
                const { driver: d, orders } = row;
                const st = statusOf(row);
                return (
                  <div key={d.id} className="rbt-row">
                    <div className="rbt-name">
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}><b style={{ fontSize: 17, fontWeight: 900 }}>{d.이름 || "-"}</b><span style={{ fontSize: 15, fontWeight: 900, color: "#CFE0FF" }}>{d.차량번호 || ""}</span></div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: orders.length ? STATUS_COLOR[st.label] || "#A9B8D2" : "#FCD34D" }}>{orders.length ? st.label : "배차 없음"}</span>
                    </div>
                    <div style={{ flex: 1, position: "relative" }}>
                      {hours.map((h) => <span key={h} style={{ position: "absolute", left: `${pct(h * 60)}%`, top: 0, bottom: 0, borderLeft: "1px solid #13213D" }} />)}
                      {orders.map((o, i) => {
                        const sp = spans(o); const m = orderMeta(o, orders);
                        return (
                          <button key={o._id || i} type="button" className="rbt-blk" onClick={() => onOpenDetail?.(d)}
                            title={`${m.label} · ${o.상차시간 || "시간 미정"} ${o.상차지명 || ""} → ${o.하차시간 || ""} ${o.하차지명 || ""} · ${o.거래처명 || ""} · ${won(o.기사운임)}`}
                            style={{ left: `${pct(sp.start)}%`, width: `max(${pct(sp.end) - pct(sp.start)}%, 120px)`, background: `${m.dot}33`, borderColor: `${m.dot}99`, color: C.text, font: "inherit", textAlign: "left" }}>
                            <span style={{ fontSize: 14, fontWeight: 900, lineHeight: 1.3, wordBreak: "keep-all", overflowWrap: "anywhere" }}>{o.상차지명 || "-"} → {o.하차지명 || "-"}{sp.nextDay ? " (익일)" : ""}</span>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#C9D5E8" }}>{sp.unknown ? "시간 미정" : o.상차시간} · {m.label} · {won(o.기사운임)}</span>
                          </button>
                        );
                      })}
                      {showNow && <span style={{ position: "absolute", top: 0, bottom: 0, left: `${pct(nowMin)}%`, width: 2, background: "#F87171", boxShadow: "0 0 8px #F87171", zIndex: 1 }} />}
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
