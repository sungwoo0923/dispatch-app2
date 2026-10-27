// ===================== 예전 오더 불러오기 통로 =====================
// 실시간 구독은 최근 7일~만 한다. 그보다 예전 오더는 각 화면이 날짜를 바꾸거나 검색할 때,
// 또는 오더복사·운임조회처럼 전체 이력이 필요한 기능을 쓸 때만 불러온다.
// (Firestore는 오래 끊겼다 다시 연결될 때 구독 범위 전체를 다시 읽은 것으로 과금 → 범위 축소)
import React from "react";
import { collection, doc, onSnapshot, query, where, setDoc, deleteDoc, getDoc, Timestamp, serverTimestamp } from "firebase/firestore";
import { db, auth } from "./firebase";

export const PC_LIVE_DAYS = 7;
export const pcLiveWindowStart = () => new Date(Date.now() + 9 * 3600e3 - PC_LIVE_DAYS * 86400e3).toISOString().slice(0, 10);
export const pcPrevDay = (ymd) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
export const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const isYm = (ym) => /^\d{4}-\d{2}$/.test(String(ym || ""));
// "YYYY-MM" 기준 n개월 전 1일 (입력이 비었거나 잘못되면 null — 월 입력칸을 지웠을 때 화면이 깨지지 않게)
export const monthStartAgo = (ym, n) => { if (!isYm(ym)) return null; const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 10); };
// "YYYY-MM"의 말일 (잘못된 입력이면 null)
export const monthEnd = (ym) => { if (!isYm(ym)) return null; const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
// "YYYY-MM"의 1일 (잘못된 입력이면 null)
export const monthStart = (ym) => (isYm(ym) ? `${ym}-01` : null);
// 오더복사·운임조회용 "전체 이력"의 시작 — 예전 PC와 같은 최근 13개월
export const historyStartDate = () => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCMonth(d.getUTCMonth() - 13); return d.toISOString().slice(0, 10); };

export const OrderHistoryContext = React.createContext({ loadRange: async () => [], loadFullHistory: async () => {} });
export const useOrderHistory = () => React.useContext(OrderHistoryContext);
// 화면이 열리거나 기간이 바뀔 때 그 기간만 불러오기
export const useLoadOrderRange = (from, to, enabled = true) => {
  const { loadRange } = useOrderHistory();
  React.useEffect(() => { if (enabled && from && /^\d{4}-\d{2}-\d{2}$/.test(from)) loadRange(from, to); }, [from, to, enabled, loadRange]);
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

export function subscribeOrderSync({ since: sinceIn, onRows, onDeleted }) {
  // 기기마다 시계가 조금씩 달라 숫자 시각(ms)은 5분 여유를 둔다(서버 시각 필드는 정확)
  const since = sinceIn - 5 * 60 * 1000;
  const sinceTs = Timestamp.fromMillis(since);
  const unsubs = [];
  ["orders", "dispatch"].forEach((col) => {
    // ① 미배차 — 조건에서 빠진(removed) 오더는 배차·취소된 것이므로 그 오더만 다시 읽어 반영한다
    //    (기사앱 수락·화주 취소처럼 수정시각을 남기지 않는 저장도 놓치지 않게)
    unsubs.push(onSnapshot(query(collection(db, col), where("배차상태", "==", "배차중")), (snap) => {
      const changes = snap.docChanges();
      const rows = changes.filter((c) => c.type !== "removed").map((c) => ({ col, id: c.doc.id, data: c.doc.data() || {} }));
      if (rows.length) onRows(rows);
      changes.filter((c) => c.type === "removed").forEach((c) => {
        getDoc(doc(db, col, c.doc.id)).then((d) => {
          if (d.exists()) onRows([{ col, id: d.id, data: d.data() || {} }]);
          else onDeleted([`${col}/${c.doc.id}`]);
        }).catch(() => {});
      });
    }, () => {}));
    // ② 앱을 연 뒤 등록·수정된 오더(날짜 무관)
    [
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
  // ③ 삭제 기록 — 서버 시각(at) 기준
  unsubs.push(onSnapshot(query(collection(db, "deletedOrders"), where("at", ">=", sinceTs)), (snap) => {
    const keys = snap.docChanges().filter((c) => c.type !== "removed").map((c) => { const d = c.doc.data() || {}; return `${d.col}/${d.id}`; });
    if (keys.length) onDeleted(keys);
  }, () => {}));
  return () => unsubs.forEach((u) => u && u());
}

// 삭제 기록만 남기기(삭제는 호출한 쪽이 직접 하는 경우)
export function logOrderDeletion(col, id) {
  if (!col || !id) return;
  // by: 지운 사람(휴지통 화면에 표시)
  setDoc(doc(db, "deletedOrders", `${col}_${id}`), { col, id, at: serverTimestamp(), by: auth.currentUser?.email || "" }).catch(() => {});
}

// 오더 삭제 + 삭제 기록(다른 사용자 화면에서도 바로 사라지게)
export async function deleteOrderWithLog(col, id) {
  if (!col || !id) return;
  logOrderDeletion(col, id);
  await deleteDoc(doc(db, col, id));
}
