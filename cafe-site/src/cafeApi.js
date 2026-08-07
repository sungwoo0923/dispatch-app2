// ======================= cafe-site/src/cafeApi.js =======================
// 배차마당(카페형 오더 공유 사이트) — Firestore 접근 공용 함수.
// cafeOrders 컬렉션: 게시글 본문(연락처 제외). cafeOrders/{id}/contact/info
// 서브컬렉션: 연락처(배차완료 상태일 때만, 당사자만 조회 가능하도록 firestore.rules에서 제한).

import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, runTransaction, setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { APPLY_CANCEL_WINDOW_MS } from "./cafeConstants";

export const CAFE_ORDERS_COL = "cafeOrders";

// 게시글 작성(카페 직접등록 / 운송프로그램 자동공유 공용)
export async function createCafeOrder(fields, contact) {
  const ref = await addDoc(collection(db, CAFE_ORDERS_COL), {
    ...fields,
    status: "open",
    applicantUid: null,
    applicantName: null,
    applicantNickname: null,
    applyRequestedAt: null,
    confirmedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (contact) {
    await setDoc(doc(db, CAFE_ORDERS_COL, ref.id, "contact", "info"), contact);
  }
  return ref.id;
}

export async function updateCafeOrder(id, fields) {
  await updateDoc(doc(db, CAFE_ORDERS_COL, id), { ...fields, updatedAt: serverTimestamp() });
}

export async function deleteCafeOrder(id) {
  // 연락처 서브문서까지 함께 정리(베스트에포트 — 실패해도 상위 글 삭제는 진행)
  try { await deleteDoc(doc(db, CAFE_ORDERS_COL, id, "contact", "info")); } catch {}
  await deleteDoc(doc(db, CAFE_ORDERS_COL, id));
}

export async function cancelCafeOrder(id) {
  await updateDoc(doc(db, CAFE_ORDERS_COL, id), { status: "cancelled", updatedAt: serverTimestamp() });
}

// 배차신청 — "open" 상태에서만 성공, 트랜잭션으로 동시신청 경합을 막는다.
// 신청자의 연락처는 연락처 서브문서(contact/info)에 함께 저장해, 배차완료 후
// 게시자가 신청자에게 바로 전화/문자할 수 있게 한다.
export async function applyToCafeOrder(orderId, applicant) {
  const ref = doc(db, CAFE_ORDERS_COL, orderId);
  const contactRef = doc(db, CAFE_ORDERS_COL, orderId, "contact", "info");
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("존재하지 않는 오더입니다.");
    const data = snap.data();
    if (data.status !== "open") throw new Error("이미 신청되었거나 마감된 오더입니다.");
    tx.update(ref, {
      status: "applying",
      applicantUid: applicant.uid,
      applicantName: applicant.name || "",
      applicantNickname: applicant.nickname || "",
      applyRequestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.set(contactRef, {
      applicantPhone: applicant.phone || "",
      applicantName: applicant.name || "",
    }, { merge: true });
  });
}

// 10초 이내 취소 — 신청 당사자만 가능
export async function cancelCafeApply(orderId, uid) {
  const ref = doc(db, CAFE_ORDERS_COL, orderId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.status !== "applying" || data.applicantUid !== uid) return;
    tx.update(ref, {
      status: "open", applicantUid: null, applicantName: null, applicantNickname: null,
      applyRequestedAt: null, updatedAt: serverTimestamp(),
    });
  });
}

// 10초가 지난 "신청중" 상태를 "배차완료"로 확정 — 신청자 본인이 화면에 머물러 있을 때
// 자동으로 호출되지만, 신청 직후 탭을 닫아버리는 경우까지 대비해 이 오더를 보고 있는
// 다른 방문자의 화면에서도(리스트/상세 어디서든) 동일하게 지나가면서 확정을 시도한다.
export async function finalizeCafeApplyIfDue(orderId) {
  const ref = doc(db, CAFE_ORDERS_COL, orderId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.status !== "applying") return;
    const requestedMs = data.applyRequestedAt?.toMillis ? data.applyRequestedAt.toMillis() : 0;
    if (!requestedMs || Date.now() - requestedMs < APPLY_CANCEL_WINDOW_MS) return;
    tx.update(ref, { status: "confirmed", confirmedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
}

export function subscribeCafeOrders(cb) {
  const q = query(collection(db, CAFE_ORDERS_COL), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
}

export function subscribeMyCafeOrders(uid, cb) {
  const q = query(collection(db, CAFE_ORDERS_COL), where("posterUid", "==", uid));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    cb(rows);
  }, () => {});
}

// 확정(배차완료) 상태일 때만 firestore.rules가 조회를 허용한다.
export async function fetchCafeContact(orderId) {
  try {
    const snap = await getDoc(doc(db, CAFE_ORDERS_COL, orderId, "contact", "info"));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}
