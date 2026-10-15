// ===================== 예전 오더 불러오기 통로 =====================
// 실시간 구독은 최근 7일~만 한다. 그보다 예전 오더는 각 화면이 날짜를 바꾸거나 검색할 때,
// 또는 오더복사·운임조회처럼 전체 이력이 필요한 기능을 쓸 때만 불러온다.
// (Firestore는 오래 끊겼다 다시 연결될 때 구독 범위 전체를 다시 읽은 것으로 과금 → 범위 축소)
import React from "react";

export const PC_LIVE_DAYS = 7;
export const pcLiveWindowStart = () => new Date(Date.now() + 9 * 3600e3 - PC_LIVE_DAYS * 86400e3).toISOString().slice(0, 10);
export const pcPrevDay = (ymd) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
export const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
// "YYYY-MM" 기준 n개월 전 1일
export const monthStartAgo = (ym, n) => { const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 10); };
// "YYYY-MM"의 말일
export const monthEnd = (ym) => { const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };

export const OrderHistoryContext = React.createContext({ loadRange: async () => [], loadFullHistory: async () => {} });
export const useOrderHistory = () => React.useContext(OrderHistoryContext);
// 화면이 열리거나 기간이 바뀔 때 그 기간만 불러오기
export const useLoadOrderRange = (from, to, enabled = true) => {
  const { loadRange } = useOrderHistory();
  React.useEffect(() => { if (enabled && from) loadRange(from, to); }, [from, to, enabled, loadRange]);
};
// 화면이 열려 있는 동안 전체 이력이 필요하면 1회 불러오기
export const useLoadFullOrderHistory = (enabled = true) => {
  const { loadFullHistory } = useOrderHistory();
  React.useEffect(() => { if (enabled) loadFullHistory(); }, [enabled, loadFullHistory]);
};
