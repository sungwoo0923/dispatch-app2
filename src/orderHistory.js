// ===================== 예전 오더 불러오기 통로 =====================
// 실시간 구독은 최근 7일~만 한다. 그보다 예전 오더는 각 화면이 날짜를 바꾸거나 검색할 때,
// 또는 오더복사·운임조회처럼 전체 이력이 필요한 기능을 쓸 때만 불러온다.
// (Firestore는 오래 끊겼다 다시 연결될 때 구독 범위 전체를 다시 읽은 것으로 과금 → 범위 축소)
import React from "react";
import { collection, doc, onSnapshot, query, where, setDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { db } from "./firebase";

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

// ===================== 여러 사용자 실시간 일치 =====================
// 실시간 구독 범위(최근 7일~) 밖의 오더도 모두가 같은 내용을 보도록, 아래 3가지는 날짜와 상관없이
// 실시간으로 받는다(바뀐 건수만큼만 읽어서 비용이 작다).
//   ① 미배차(배차상태 "배차중") 오더 전부
//   ② 앱을 연 이후 누군가 등록·수정한 오더(날짜 무관) — 수정시각 필드가 서버시각/숫자 두 형식이라 둘 다
//   ③ 삭제 기록(deletedOrders) — 오더는 완전삭제라 조회로 알 수 없어, 지울 때 기록을 남긴다

export function subscribeOrderSync({ since, onRows, onDeleted }) {
  const sinceTs = Timestamp.fromMillis(since);
  const unsubs = [];
  ["orders", "dispatch"].forEach((col) => {
    [
      where("배차상태", "==", "배차중"),
      where("updatedAt", ">=", since), where("updatedAt", ">=", sinceTs),
      where("_lastModified", ">=", since),
      where("createdAt", ">=", since), where("createdAt", ">=", sinceTs),
    ].forEach((w) => {
      unsubs.push(onSnapshot(query(collection(db, col), w), (snap) => {
        // removed(조건에서 빠짐)는 문서가 지워졌다는 뜻이 아니므로 무시 — 실제 삭제는 ③으로 처리
        const rows = snap.docChanges().filter((c) => c.type !== "removed").map((c) => ({ col, id: c.doc.id, data: c.doc.data() || {} }));
        if (rows.length) onRows(rows);
      }, () => {}));
    });
  });
  unsubs.push(onSnapshot(query(collection(db, "deletedOrders"), where("at", ">=", since)), (snap) => {
    const keys = snap.docChanges().filter((c) => c.type !== "removed").map((c) => { const d = c.doc.data() || {}; return `${d.col}/${d.id}`; });
    if (keys.length) onDeleted(keys);
  }, () => {}));
  return () => unsubs.forEach((u) => u && u());
}

// 오더 삭제 + 삭제 기록(다른 사용자 화면에서도 바로 사라지게)
export async function deleteOrderWithLog(col, id) {
  if (!col || !id) return;
  setDoc(doc(db, "deletedOrders", `${col}_${id}`), { col, id, at: Date.now() }).catch(() => {});
  await deleteDoc(doc(db, col, id));
}
