// src/driverVehicleHistory.js
// ⭐ 2026-11-11 기사 차량이력 — 기사는 그대로인데 타는 차량이 바뀌는 운송사(이번 주 3333, 다음 주 3434)용.
//  drivers/{id}.차량이력 = [{ 차량번호, 시작:"YYYY-MM-DD"|"", 종료:"YYYY-MM-DD"|"" }] (서버 driverChangeVehicle이 쓴다)
//  오더에는 차량번호만 남으므로, "그 날짜에 그 차량을 누가 탔는지"를 이력으로 판단해 정산·운행일지를 기사 기준으로 묶는다.
//  이력이 없는 기사는 예전처럼 지금 차량번호 하나로 본다.
export const normPlate = (v) => String(v || "").replace(/\s+/g, "");

// 기사가 탄 차량 구간 목록 — [{ plate, from, to }] (from "" = 처음부터, to "" = 지금까지)
export function platePeriods(d) {
  const h = Array.isArray(d?.차량이력) ? d.차량이력.filter((e) => e && normPlate(e.차량번호)) : [];
  if (h.length) return h.map((e) => ({ plate: normPlate(e.차량번호), from: e.시작 || "", to: e.종료 || "" }));
  const cur = normPlate(d?.차량번호 || d?.carNo);
  return cur && cur !== "-" ? [{ plate: cur, from: "", to: "" }] : [];
}

// 그 날짜에 그 차량을 이 기사가 탔으면 해당 구간, 아니면 null (날짜가 없는 오더는 지금 타는 차량일 때만)
export function periodFor(d, plate, day) {
  const p = normPlate(plate);
  if (!p) return null;
  const ps = platePeriods(d).filter((x) => x.plate === p);
  if (!day) return ps.find((x) => !x.to) || null;
  return ps.find((x) => (!x.from || day >= x.from) && (!x.to || day <= x.to)) || null;
}

// 여러 기사 중 이 오더(차량번호·날짜)의 주인 — 구간 시작일이 가장 늦은(가장 분명한) 기사.
//  예: A가 3333을 11/8까지 타고, 새로 가입한 B(이력 없음)가 3333을 타면 11/8 이전 건은 A, 이후 건은 B.
export function makeTripOwner(drivers) {
  const byPlate = new Map();
  (drivers || []).forEach((d) => platePeriods(d).forEach((x) => {
    if (!byPlate.has(x.plate)) byPlate.set(x.plate, []);
    byPlate.get(x.plate).push({ id: d.id, ...x });
  }));
  const covers = (x, day) => (day ? (!x.from || day >= x.from) && (!x.to || day <= x.to) : !x.to);
  return (driverId, plate, day) => {
    const list = (byPlate.get(normPlate(plate)) || []).filter((x) => covers(x, day));
    if (!list.some((x) => x.id === driverId)) return false;
    const best = list.reduce((m, x) => (x.from > m ? x.from : m), "");
    // 닫힌 구간(종료 있음)이 이 날짜를 덮으면 열린 구간(처음부터~지금)보다 우선한다
    const closed = list.filter((x) => x.to);
    if (closed.length && closed.some((x) => x.id !== driverId) && !closed.some((x) => x.id === driverId)) {
      const mine = list.filter((x) => x.id === driverId);
      if (mine.every((x) => !x.from)) return false;
    }
    return list.some((x) => x.id === driverId && x.from === best);
  };
}

// 화면 표시용 — 최근 구간부터
export function historyRows(d) {
  return platePeriods(d).slice().reverse().map((x) => ({ ...x, label: `${x.from || "처음"} ~ ${x.to || "현재"}` }));
}
