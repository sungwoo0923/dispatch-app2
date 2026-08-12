// ======================= cafe-site/src/cafeApi.js =======================
// 배차마당(카페형 오더 공유 사이트) — Firestore 접근 공용 함수.
// cafeOrders 컬렉션: 게시글 본문(연락처 제외). cafeOrders/{id}/contact/info
// 서브컬렉션: 연락처(배차완료 상태일 때만, 당사자만 조회 가능하도록 firestore.rules에서 제한).
// cafeOrders/{id}/chat/{msgId}: 배차완료 이후 게시자↔신청자 1:1 실시간 대화.
// cafeOrders/{id}/settlement/info: 정산(인수증/명세서 업로드, 정산완료 처리) 정보.
// cafeNotifications/{id}: 신규 신청/배차취소 등 사용자별 알림.

import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs,
  onSnapshot, query, where, orderBy, limit, serverTimestamp, runTransaction, setDoc, writeBatch,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { APPLY_CANCEL_WINDOW_MS } from "./cafeConstants";

export const CAFE_ORDERS_COL = "cafeOrders";
export const CAFE_NOTIFS_COL = "cafeNotifications";

// ──────────────────────────────────────────────────────────
// 오더 CRUD
// ──────────────────────────────────────────────────────────

// 게시글 작성(카페 직접등록 / 운송프로그램 자동공유 공용)
export async function createCafeOrder(fields, contact) {
  const ref = await addDoc(collection(db, CAFE_ORDERS_COL), {
    ...fields,
    status: "open",
    applicantUid: null,
    applicantName: null,
    applicantNickname: null,
    applicantPhone: null,
    applicantVehicleNumber: null,
    applyRequestedAt: null,
    confirmedAt: null,
    posterUnread: false, // 게시자가 아직 확인하지 않은 새 신청이 있는지
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

// 오더 완전 삭제 — 배차가 잡혀있던 상태였다면(신청자가 있었다면) 삭제 전에
// 신청자에게 알림을 남긴다. 연락처/대화/정산 서브문서는 베스트에포트로 정리한다.
export async function deleteCafeOrder(id) {
  try {
    const snap = await getDoc(doc(db, CAFE_ORDERS_COL, id));
    const data = snap.exists() ? snap.data() : null;
    if (data?.applicantUid) {
      await notifyCafeUser(data.applicantUid, {
        orderId: id, type: "order_deleted",
        title: "오더가 삭제되었습니다",
        body: `${data.상차지명 || ""} → ${data.하차지명 || ""} 오더가 등록자에 의해 삭제되었습니다.`,
      });
    }
  } catch {}
  try { await deleteDoc(doc(db, CAFE_ORDERS_COL, id, "contact", "info")); } catch {}
  await deleteDoc(doc(db, CAFE_ORDERS_COL, id));
}

// 아직 신청자가 없는(open) 오더를 게시자가 스스로 취소 처리 — 상대와 협의할
// 필요가 없는 경우라 별도 확인모달 없이 바로 처리한다.
export async function cancelCafeOrder(id) {
  await updateDoc(doc(db, CAFE_ORDERS_COL, id), { status: "cancelled", updatedAt: serverTimestamp() });
}

// ──────────────────────────────────────────────────────────
// 배차신청 / 취소 / 확정
// ──────────────────────────────────────────────────────────

// 배차신청 — "open" 상태에서만 성공, 트랜잭션으로 동시신청 경합을 막는다.
// 신청자의 연락처는 연락처 서브문서(contact/info)에 함께 저장해, 배차완료 후
// 게시자가 신청자에게 바로 전화/문자할 수 있게 한다.
export async function applyToCafeOrder(orderId, applicant) {
  const ref = doc(db, CAFE_ORDERS_COL, orderId);
  const contactRef = doc(db, CAFE_ORDERS_COL, orderId, "contact", "info");
  let posterUid = null;
  let orderSummary = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("존재하지 않는 오더입니다.");
    const data = snap.data();
    if (data.status !== "open") throw new Error("이미 신청되었거나 마감된 오더입니다.");
    posterUid = data.posterUid;
    orderSummary = `${data.상차지명 || ""} → ${data.하차지명 || ""}`;
    tx.update(ref, {
      status: "applying",
      applicantUid: applicant.uid,
      applicantName: applicant.name || "",
      applicantNickname: applicant.nickname || "",
      applicantVehicleNumber: applicant.vehicleNumber || "",
      applyRequestedAt: serverTimestamp(),
      posterUnread: true,
      updatedAt: serverTimestamp(),
    });
    tx.set(contactRef, {
      applicantPhone: applicant.phone || "",
      applicantName: applicant.name || "",
    }, { merge: true });
  });
  if (posterUid) {
    await notifyCafeUser(posterUid, {
      orderId, type: "apply",
      title: "새 배차신청이 도착했습니다",
      body: `${applicant.nickname || applicant.name || "기사"}님이 "${orderSummary}" 오더에 배차신청했습니다.`,
    }).catch(() => {});
  }
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
      applicantPhone: null, applicantVehicleNumber: null, applyRequestedAt: null, updatedAt: serverTimestamp(),
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

// 배차완료(confirmed) 상태를 게시자가 취소 — 신청자와의 배정만 취소하고 오더 자체는
// "open"으로 되돌려 다시 신청받을 수 있게 한다(오더삭제와 다름). 화면에서는 반드시
// "차주와 협의됨" 체크 후에만 호출하도록 강제한다.
export async function cancelCafeAssignment(orderId, posterUid) {
  const ref = doc(db, CAFE_ORDERS_COL, orderId);
  const contactRef = doc(db, CAFE_ORDERS_COL, orderId, "contact", "info");
  let exApplicantUid = null;
  let orderSummary = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.status !== "confirmed" || data.posterUid !== posterUid) return;
    exApplicantUid = data.applicantUid;
    orderSummary = `${data.상차지명 || ""} → ${data.하차지명 || ""}`;
    tx.update(ref, {
      status: "open", applicantUid: null, applicantName: null, applicantNickname: null,
      applicantPhone: null, applicantVehicleNumber: null, applyRequestedAt: null, confirmedAt: null,
      updatedAt: serverTimestamp(),
    });
  });
  try { await deleteDoc(contactRef); } catch {}
  if (exApplicantUid) {
    await notifyCafeUser(exApplicantUid, {
      orderId, type: "assignment_cancelled",
      title: "배차가 취소되었습니다",
      body: `등록자가 "${orderSummary}" 오더의 배차를 취소했습니다.`,
    }).catch(() => {});
  }
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

// ──────────────────────────────────────────────────────────
// 알림 — 새 신청 / 배차취소 / 오더삭제를 상대방에게 즉시 알린다.
// ──────────────────────────────────────────────────────────

export async function notifyCafeUser(uid, { orderId, type, title, body }) {
  if (!uid) return;
  await addDoc(collection(db, CAFE_NOTIFS_COL), {
    uid, orderId: orderId || null, type, title, body,
    read: false, createdAt: serverTimestamp(),
  });
}

// where(uid==) 단일 조건만 쓰고 정렬은 클라이언트에서 한다 — 별도 복합 색인 배포 없이
// 바로 동작하게 하기 위함(orderBy를 함께 쓰면 Firestore 복합 색인이 필요해진다).
export function subscribeCafeNotifications(uid, cb) {
  if (!uid) return () => {};
  const q = query(collection(db, CAFE_NOTIFS_COL), where("uid", "==", uid), limit(100));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    cb(rows);
  }, () => {});
}

export async function markNotificationsRead(notifIds) {
  if (!notifIds?.length) return;
  const batch = writeBatch(db);
  notifIds.forEach(id => batch.update(doc(db, CAFE_NOTIFS_COL, id), { read: true }));
  await batch.commit().catch(() => {});
}

// ──────────────────────────────────────────────────────────
// 1:1 실시간 대화 — 배차신청~배차완료 이후 게시자↔신청자만 사용. 3개월이 지난
// 메시지는 조회 목록에서 자동으로 걸러내고(클라이언트), 실제 삭제는 서버(Cloud
// Functions의 예약 정리 작업, functions/cafeCleanup.js)가 매일 처리한다.
// ──────────────────────────────────────────────────────────

export const CHAT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 3개월

export function subscribeCafeChat(orderId, cb) {
  const q = query(collection(db, CAFE_ORDERS_COL, orderId, "chat"), orderBy("createdAt", "asc"), limit(500));
  return onSnapshot(q, (snap) => {
    const cutoff = Date.now() - CHAT_RETENTION_MS;
    const rows = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(m => !m.createdAt?.toMillis || m.createdAt.toMillis() >= cutoff);
    cb(rows);
  }, () => {});
}

export async function sendCafeChatMessage(orderId, sender, text) {
  const t = (text || "").trim();
  if (!t) return;
  await addDoc(collection(db, CAFE_ORDERS_COL, orderId, "chat"), {
    senderUid: sender.uid, senderName: sender.nickname || sender.name || "익명",
    text: t, createdAt: serverTimestamp(),
  });
}

// ──────────────────────────────────────────────────────────
// 정산 — 배차완료된 오더에 대해 신청자(기사)가 인수증/명세서를 올리고, 게시자가
// 확인 후 정산완료 처리한다. 실제 세금계산서 발행/PG결제 연동은 아니고, 내부
// 정산 장부(누가 얼마를 언제 완료·정산했는지) 기록이다.
// ──────────────────────────────────────────────────────────

export function settlementRef(orderId) {
  return doc(db, CAFE_ORDERS_COL, orderId, "settlement", "info");
}

export async function fetchSettlement(orderId) {
  const snap = await getDoc(settlementRef(orderId));
  return snap.exists() ? snap.data() : null;
}

export function subscribeSettlement(orderId, cb) {
  return onSnapshot(settlementRef(orderId), (snap) => cb(snap.exists() ? snap.data() : null), () => {});
}

export async function uploadSettlementFile(orderId, uid, file, kind) {
  const path = `cafeOrders/${orderId}/settlement/${kind}_${Date.now()}_${file.name}`;
  const sref = ref(storage, path);
  await uploadBytes(sref, file);
  const url = await getDownloadURL(sref);
  const fileMeta = { name: file.name, url, uploadedAt: Date.now(), uploadedBy: uid };
  const fieldKey = kind === "driver" ? "driverFiles" : "posterFiles";
  const existing = await fetchSettlement(orderId);
  await setDoc(settlementRef(orderId), {
    [fieldKey]: existing?.[fieldKey] ? [...existing[fieldKey], fileMeta] : [fileMeta],
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return fileMeta;
}

export async function markTripCompleted(orderId, posterUid, applicantUid, amount) {
  await setDoc(settlementRef(orderId), {
    orderId, posterUid, applicantUid, amount: amount || 0,
    tripCompleted: true, completedAt: serverTimestamp(), settled: false,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function markSettled(orderId) {
  await setDoc(settlementRef(orderId), { settled: true, settledAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
}

// ──────────────────────────────────────────────────────────
// 에러 메시지 — Firestore/Firebase 원본 에러코드를 그대로 alert에 띄우면
// "Quota exceeded" 처럼 사용자가 이해하기 어려운 문구가 그대로 노출된다.
// 자주 나오는 코드만 한국어 안내로 바꿔준다.
// ──────────────────────────────────────────────────────────
export function friendlyCafeError(e) {
  const code = e?.code || "";
  if (code.includes("resource-exhausted") || /quota/i.test(e?.message || "")) {
    return "일시적으로 서버 사용량이 많아 요청이 지연되고 있습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code.includes("permission-denied")) return "권한이 없어 처리할 수 없습니다.";
  if (code.includes("unavailable") || code.includes("network")) return "네트워크 연결을 확인해주세요.";
  return e?.message || "처리 중 오류가 발생했습니다.";
}
