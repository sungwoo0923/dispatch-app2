// ===================== 지입차 추천 (빈 지입차 / 최적 오더) =====================
// ⭐ 5) 오더 등록 시: 지금 배차가 없고 상차지에서 가까운 지입·직영 기사를 거리순으로 추천
// ⭐ 4) 지입차관리: 기사님이 하차할 곳(또는 현재 위치) 근처에서 출발하는 미배차 오더를 거리순으로 추천
// 거리는 지도상 직선거리(빠르게 비교용)이며, 주소 좌표는 fleetGeo 캐시를 함께 쓴다.
import React, { useEffect, useMemo, useState } from "react";
import { prefetchGeo } from "./fleetGeo";
import { haversineKm } from "./tmapFareCalc";

const NAVY = "#1B2B4B";
export const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const kstTomorrow = () => new Date(Date.now() + 33 * 3600e3).toISOString().slice(0, 10);
const plateKey = (v) => String(v || "").replace(/[\s-]/g, "").toUpperCase();
const tsMs = (v) => (v?.toMillis ? v.toMillis() : typeof v?.seconds === "number" ? v.seconds * 1000 : typeof v === "number" ? v : 0);
const isCanceled = (r) => r?.배차상태 === "배차취소" || r?.상태 === "취소";
const isDoneOrder = (r) => r?.기사확인상태 === "완료" || r?.배차상태 === "운송완료" || !!r?.기사완료일시;
const ago = (ms) => { if (!ms) return ""; const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "방금" : m < 60 ? `${m}분 전` : `${Math.floor(m / 60)}시간 전`; };
const won = (v) => `${(parseInt(String(v || 0).replace(/[^\d]/g, ""), 10) || 0).toLocaleString()}원`;

function useAddrGeoMap(addrs) {
  const [map, setMap] = useState({});
  const key = addrs.join("|");
  useEffect(() => {
    let alive = true;
    (async () => {
      const out = {};
      for (const a of addrs) {
        const k = String(a || "").trim();
        if (!k || k in out) continue;
        out[k] = await prefetchGeo(k).catch(() => null);
        if (!alive) return;
      }
      if (alive) setMap(out);
    })();
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return map;
}

// ── 5) 빈 지입차 추천 ────────────────────────────────────────────────
export function useIdleFleet({ drivers = [], dispatchData = [], pickupAddr = "" }) {
  const today = kstToday();
  const busy = useMemo(() => {
    const s = new Set();
    for (const r of dispatchData || []) {
      if (isCanceled(r) || isDoneOrder(r)) continue;
      if (String(r.상차일 || "").slice(0, 10) !== today) continue;
      const p = plateKey(r.차량번호);
      if (p) s.add(p);
    }
    return s;
  }, [dispatchData, today]);
  const geoMap = useAddrGeoMap(pickupAddr ? [pickupAddr] : []);
  const pg = pickupAddr ? geoMap[String(pickupAddr).trim()] : null;
  const list = useMemo(() => {
    return (drivers || [])
      .filter((d) => d.등급 === "지입" || d.등급 === "직영" || d.등급 === "임대")
      .filter((d) => d.status !== "휴차" && d.mainStatus !== "휴차")
      .map((d) => {
        const plate = (d.차량번호 || d.carNo || "").trim();
        const loc = d.location?.lat != null ? d.location : null;
        const upd = tsMs(d.updatedAt);
        return { d, plate, name: (d.이름 || d.name || "").trim(), phone: d.전화번호 || d.phone || "", loc, upd, km: pg && loc ? haversineKm(loc.lat, loc.lng, pg.lat, pg.lng) : null };
      })
      .filter((x) => x.plate && !busy.has(plateKey(x.plate)))
      .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9));
  }, [drivers, busy, pg]);
  return { list, hasPickup: !!pg };
}

export function IdleFleetButton({ drivers, dispatchData, pickupAddr, onPick }) {
  const [open, setOpen] = useState(false);
  const { list, hasPickup } = useIdleFleet({ drivers, dispatchData, pickupAddr });
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        title="오늘 배차가 없는 지입·직영 기사를 상차지와 가까운 순으로 보여줍니다"
        style={{ height: 24, padding: "0 9px", borderRadius: 6, border: `1px solid ${NAVY}`, background: open ? NAVY : "#fff", color: open ? "#fff" : NAVY, fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
        빈 지입차 {list.length}
      </button>
      {open && (
        <div style={{ position: "absolute", zIndex: 60, top: 28, left: 0, width: 340, background: "#fff", border: `2px solid ${NAVY}`, borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.2)", overflow: "hidden", fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif" }}>
          <div style={{ background: NAVY, color: "#fff", padding: "9px 12px", fontSize: 13, fontWeight: 800 }}>
            오늘 배차 없는 지입차 {list.length}대 · {hasPickup ? "상차지 가까운 순" : "상차지 주소를 입력하면 거리순 정렬"}
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {list.length === 0 && <div style={{ padding: 16, fontSize: 14, fontWeight: 700, color: "#4b5563", textAlign: "center" }}>지금 비어 있는 지입차가 없습니다</div>}
            {list.map((x) => (
              <div key={x.d.id || x.plate} onMouseDown={() => { onPick?.(x); setOpen(false); }}
                style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f6", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#eef4ff"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "#111827" }}>{x.name || "-"} <span style={{ fontSize: 13, fontWeight: 800, color: "#374151", border: "1.5px solid #111827", borderRadius: 4, padding: "0 5px", marginLeft: 4 }}>{x.plate}</span></div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#4b5563", marginTop: 2 }}>{x.loc ? (x.upd ? `위치 ${ago(x.upd)} 갱신` : "위치 있음") : "위치 정보 없음"}{x.d.등급 === "직영" ? " · 직영" : ""}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 900, color: x.km != null ? NAVY : "#9ca3af", whiteSpace: "nowrap" }}>{x.km != null ? `${x.km.toFixed(1)}km` : "-"}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: "7px 12px", fontSize: 11, fontWeight: 700, color: "#4b5563", background: "#f8f9fb" }}>거리는 현재 위치 → 상차지 직선거리 · 누르면 기사 정보가 입력됩니다</div>
        </div>
      )}
    </span>
  );
}

// ── 4) 최적 오더 추천 ──────────────────────────────────────────
// base: { lat, lng, label } — 마지막(진행중) 오더 하차지 또는 현재 위치
export function ReturnTripSuggest({ base, dispatchData = [], limit = 8 }) {
  const today = kstToday(), tomorrow = kstTomorrow();
  const candidates = useMemo(() => (dispatchData || []).filter((r) => {
    if (isCanceled(r)) return false;
    if (String(r.차량번호 || "").trim()) return false; // 아직 차량 미배정
    const d = String(r.상차일 || "").slice(0, 10);
    return (d === today || d === tomorrow) && String(r.상차지주소 || "").trim();
  }), [dispatchData, today, tomorrow]);
  const geoMap = useAddrGeoMap(candidates.map((r) => r.상차지주소));
  const ranked = useMemo(() => {
    if (!base) return [];
    return candidates.map((r) => {
      const g = geoMap[String(r.상차지주소 || "").trim()];
      return { r, km: g ? haversineKm(base.lat, base.lng, g.lat, g.lng) : null };
    }).filter((x) => x.km != null).sort((a, b) => a.km - b.km).slice(0, limit);
  }, [candidates, geoMap, base, limit]);
  const pending = candidates.length > 0 && Object.keys(geoMap).length === 0;

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
        기준: <b style={{ color: NAVY }}>{base?.label || "위치 없음"}</b> · 오늘·내일 미배차 오더 {candidates.length}건 중 가까운 순
      </div>
      {!base ? (
        <div style={{ fontSize: 14, fontWeight: 700, color: "#4b5563" }}>기준 위치(하차지 또는 현재 위치)를 알 수 없습니다.</div>
      ) : pending ? (
        <div style={{ fontSize: 14, fontWeight: 700, color: "#4b5563" }}>주소 위치 계산 중…</div>
      ) : ranked.length === 0 ? (
        <div style={{ fontSize: 14, fontWeight: 700, color: "#4b5563" }}>추천할 미배차 오더가 없습니다.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ranked.map(({ r, km }) => (
            <div key={r._id || `${r.상차일}${r.상차지명}${r.하차지명}`} style={{ border: "1px solid #e2e7ef", borderRadius: 10, padding: "10px 12px", background: "#fff", display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 62, flexShrink: 0, textAlign: "center" }}>
                <div style={{ fontSize: 17, fontWeight: 900, color: km <= 10 ? "#047857" : km <= 25 ? NAVY : "#92400e" }}>{km.toFixed(1)}</div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#4b5563" }}>km</div>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#111827" }}>{r.상차지명 || "-"} → {r.하차지명 || "-"}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginTop: 2 }}>
                  {r.상차일 === today ? "오늘" : "내일"} {r.상차시간 || "즉시"} · {r.거래처명 || "-"} · {[r.차량종류, r.차량톤수].filter(Boolean).join(" ") || "차종 미입력"}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 900, color: NAVY, whiteSpace: "nowrap" }}>{r.청구운임 ? won(r.청구운임) : ""}</div>
            </div>
          ))}
          <div style={{ fontSize: 12, fontWeight: 700, color: "#4b5563" }}>거리는 기준 위치 → 상차지 직선거리입니다. 배차는 배차관리에서 차량번호를 입력해 진행하세요.</div>
        </div>
      )}
    </div>
  );
}
