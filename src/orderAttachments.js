// ======================= src/orderAttachments.js =======================
// 📎 2026-11-22 오더 첨부파일 모아 보기 — 카드에 📎1 이 보이는데 눌러 보면 "0장"이던 문제.
//  첨부는 오더 문서의 attachments 아래에 있지만, 경우에 따라 다른 곳에 있다:
//   ① 오더가 다른 컬렉션(orders ↔ dispatch)에 있는데 화면이 컬렉션을 잘못 짐작한 경우(모바일 카드는 dispatch, 상세는 orders로 짐작했다)
//   ② 화주사 전송 · 원본 연결 오더(_transmittedOrderId → orders, originCol/originId)에 기사가 올린 경우 — PC는 두 곳을 같이 본다
//  그래서 이 오더 · 같은 번호의 다른 컬렉션 · 연결 오더의 attachments 를 모두 구독해 하나로 합친다(같은 파일 번호는 한 번만).
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

export function attachSources(order) {
  const id = order?._id || order?.id;
  if (!id) return [];
  const main = order.__col || order._col || "orders";
  const list = [{ col: main, id }, { col: main === "orders" ? "dispatch" : "orders", id }];
  if (order._transmittedOrderId) list.push({ col: "orders", id: order._transmittedOrderId });
  if (order.originCol && order.originId) list.push({ col: order.originCol, id: order.originId });
  const seen = new Set();
  return list.filter((s) => { const k = `${s.col}/${s.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// cb(items) — 처음엔 모든 곳의 첫 응답을 기다렸다가 한 번, 그 뒤엔 바뀔 때마다. 돌려받은 함수로 구독을 끈다.
export function watchOrderAttachments(order, cb) {
  const srcs = attachSources(order);
  if (!srcs.length) { cb([]); return () => {}; }
  const got = srcs.map(() => null);
  const emit = () => {
    if (got.some((g) => g === null)) return;
    const map = new Map();
    got.forEach((rows, i) => rows.forEach((r) => { if (!map.has(r.id)) map.set(r.id, { ...r, __from: i === 0 ? "" : `${srcs[i].col}/${srcs[i].id}` }); }));
    cb([...map.values()]);
  };
  const offs = srcs.map((s, i) => onSnapshot(collection(db, s.col, s.id, "attachments"),
    (snap) => { got[i] = snap.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); },
    () => { got[i] = []; emit(); })); // 권한 없음 · 문서 없음은 빈 것으로
  return () => offs.forEach((f) => { try { f(); } catch { /* 무시 */ } });
}
