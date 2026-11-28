// ======================= src/mobile/MobileDispatchHome.jsx =======================
// 📱 2026-11-28 휴대폰 운송 홈 — PC 운송 HOME(관제 데크 · HomeDeck)을 휴대폰 폭에 맞춰 그대로 보여 준다(사용자 요청)
//  · 숫자는 PC와 같은 계산: 최근(실시간 범위)은 지금 받은 오더, 그 이전 기간은 하루 1번 서버에서 받아 이 기기에 저장(PC HomeDashboard와 같은 방식)
//  · 디자인은 휴대폰 경리 홈(FINANCE DECK)과 같은 남색 데크 — HomeDeck compact(한 줄씩 쌓기)
//  · 오늘 할 일(미배차 · 오늘/내일 상차 · 운임 미입력) · 운행 지역 날씨도 PC와 같은 칸
import React from "react";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "../firebase";
import HomeDeck, { buildPastStats } from "../HomeDeck";
import { pcLiveWindowStart, pcPrevDay } from "../orderHistory";
import { useRouteCarrierFilter } from "../routeCarriers";
import { useCompanyRows } from "../companyColStore";
import { TodayTodo } from "../SmartDispatchUI";
import { OrdersWeatherDeck } from "../publicDataMain";

const LS_KEY = "mHomePastStats";
const kstMonth = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);

export default function MobileDispatchHome({ company = "", orders = [], users = [], myName = "", isMaster = false, onTodoGo }) {
  const homeCompany = (company || DEFAULT_COMPANY).trim();
  const liveStart = pcLiveWindowStart();
  const carrierF = useRouteCarrierFilter(homeCompany);
  const rows = React.useMemo(() => carrierF.filter(orders) || [], [orders, carrierF]);
  const fixedRows = useCompanyRows("fixedClients", homeCompany);
  const [past, setPast] = React.useState(() => {
    try {
      const c = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      return c && c.v === 1 && c.company === homeCompany && c.liveStart === liveStart && c.calYear === new Date().getFullYear() && (!carrierF.ready || (c.cs || "") === carrierF.sig) ? c : null;
    } catch { return null; }
  });
  React.useEffect(() => {
    if (!carrierF.ready) return undefined;
    let alive = true;
    const recompute = () => {
      const y = new Date().getFullYear();
      const end = pcPrevDay(liveStart);
      return Promise.all(["orders", "dispatch"].map((col) => getDocs(query(collection(db, col), where("상차일", ">=", `${y - 1}-12-01`), where("상차일", "<=", end)))))
        .then((snaps) => {
          const list = snaps.flatMap((sn) => sn.docs.map((d) => d.data() || {})).filter((row) =>
            (row.companyName || DEFAULT_COMPANY) === homeCompany && row.source !== "transport_transmit"
            && row.배차상태 !== "배차취소" && !["취소", "배차취소", "오더취소", "취소됨"].includes(row.상태) && carrierF.isCountable(row));
          const c = { ...buildPastStats(list, kstMonth()), v: 1, company: homeCompany, liveStart, calYear: y, savedAt: Date.now(), cs: carrierF.sig };
          try { localStorage.setItem(LS_KEY, JSON.stringify(c)); } catch { /* 용량 초과 등은 무시 */ }
          if (alive) setPast(c);
        })
        .catch((e) => console.warn("운송 홈 통계(지난 기간) 불러오기 실패:", e));
    };
    if (past && (past.cs || "") === carrierF.sig) {
      // 저장값이 있어도 그 뒤에 초기화 · 가져오기가 있었으면 다시 계산
      getDoc(doc(db, "systemConfig", "dataVersion")).then((snap) => {
        const v = snap.data()?.[homeCompany];
        const ms = v?.toMillis ? v.toMillis() : 0;
        if (ms > (past.savedAt || 0)) recompute();
      }).catch(() => {});
    } else recompute();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrierF.ready, carrierF.sig, homeCompany]);

  return (
    <div className="kp-m-home px-3 pt-3" data-testid="m-dispatch-home">
      <style>{M_HOME_CSS}</style>
      <HomeDeck compact
        dispatchData={rows} pastCache={past} liveStart={liveStart} fixedRows={fixedRows}
        users={users} myName={myName} isMaster={isMaster}
        todo={onTodoGo ? <TodayTodo rows={orders} onGo={onTodoGo} /> : null}
        weather={<OrdersWeatherDeck orders={rows} theme={isMaster ? "gold" : "navy"} />} />
    </div>
  );
}

// 휴대폰 폭 — 오늘 할 일 4칸은 2칸씩, 머리줄 시계는 줄바꿈
const M_HOME_CSS = `
.kp-m-home [data-kp="today-todo"]{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px!important}
.kp-m-home [data-kp="today-todo"] > div:first-child{grid-column:1 / -1;flex-direction:row!important;align-items:center;gap:8px;justify-content:flex-start!important;padding:0 2px!important}
.kp-m-home [data-kp="today-todo"] > button{min-width:0!important;width:auto!important}
.kp-m-home .hd-compact .hd-panel{padding:14px 14px!important}
.kp-m-home .hd-compact .hd-tile-code{display:none}
.kp-m-home [data-kp="today-todo"] > button span[style*="letter-spacing: 0.16em"]{display:none}
.kp-m-home [data-kp="today-todo"] > button{padding:9px 12px!important;gap:10px!important}
`;
