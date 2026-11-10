// ======================= src/vehicleExpense.js =======================
// 🧾 2026-11-10 차량 비용 영수증 · 정기 차량 사진 — Firebase 읽기·쓰기(계산은 src/vehicleExpenseCore.js)
//  저장 위치
//   vehicleExpenses/{자동 id}   { companyName, driverId(기사 uid), driverName, carNo, kinds[], memo, amount, pay, vendor, bizNo, phone, date, time,
//                                cardApproval, cardLast4, km, items[], image(압축 사진), imgHash, takenAt, captured, scan{…읽은 값}, status,
//                                rejectReason, checkedBy, checkedAt, approvalId, apDocNo, createdAt, updatedAt }
//   vehiclePhotoSettings/{회사}  { companyName, on, cycle, dueDow, dueDay, parts[], target, updatedBy, updatedAt }
//   vehiclePhotos/{uid_기간_부위} { companyName, driverId, driverName, carNo, periodKey, part, image, km, takenAt, captured, createdAt }
//  사진은 문서 안에 압축해서 넣는다(장당 약 150~250KB · 문서 1MB 한도 안) — 기사앱이 Storage 권한 없이도 올리고, 전자결재 증빙으로 그대로 넘긴다.
import React from "react";
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, arrayUnion, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";
import { DEFAULT_PHOTO_SETTINGS, HASH_W, HASH_H, hashFromGray, parseReceiptText, photoDocId } from "./vehicleExpenseCore";

const tsMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);
const kstYmd = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// ── 사진 준비 ── 파일 → 압축 사진(dataURL) · 지문(같은 사진 찾기) · 찍은 시각
function loadImg(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
export async function prepPhoto(file, { max = 1280, quality = 0.72 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const im = await loadImg(url);
    const r = Math.min(1, max / Math.max(im.width, im.height));
    const c = document.createElement("canvas");
    c.width = Math.round(im.width * r); c.height = Math.round(im.height * r);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
    let q = quality; let dataUrl = c.toDataURL("image/jpeg", q);
    while (dataUrl.length > 330000 && q > 0.4) { q -= 0.08; dataUrl = c.toDataURL("image/jpeg", q); } // 문서 한도 안으로
    const h = document.createElement("canvas"); h.width = HASH_W; h.height = HASH_H;
    const hg = h.getContext("2d"); hg.drawImage(im, 0, 0, HASH_W, HASH_H);
    const px = hg.getImageData(0, 0, HASH_W, HASH_H).data; const gray = [];
    for (let i = 0; i < px.length; i += 4) gray.push(Math.round(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114));
    return { dataUrl, hash: hashFromGray(gray), takenAt: Number(file.lastModified) || Date.now() };
  } finally { URL.revokeObjectURL(url); }
}

// ── 영수증 글자 읽기 ── ① 서버(오더 스캔과 같은 Google Vision) → ② 안 되면 휴대폰 안에서(한글 인식) → 칸 정리
export async function scanReceipt(dataUrl, onProgress) {
  let text = "";
  let engine = "";
  try {
    onProgress?.("영수증 읽는 중");
    const { mainScanAi } = await import("./orderScanApi");
    const r = await mainScanAi.ocr(dataUrl);
    text = String(r?.text || (r?.lines || []).map((l) => l.text || "").join("\n") || "");
    engine = "vision";
  } catch { /* 서버가 안 되면 아래로 */ }
  if (!text.trim()) {
    try {
      const { createWorker } = await import("tesseract.js");
      onProgress?.("영수증 읽는 중(처음 한 번은 조금 걸려요)");
      const worker = await createWorker("kor+eng", 1, { errorHandler: () => {} });
      await worker.setParameters({ preserve_interword_spaces: "1" }).catch(() => {});
      const { data } = await worker.recognize(dataUrl);
      worker.terminate().catch(() => {});
      text = String(data?.text || ""); engine = "device";
    } catch { /* 못 읽어도 직접 입력으로 */ }
  }
  return { ...parseReceiptText(text), text: text.slice(0, 3000), engine };
}

// ── 기사: 영수증 보내기 ──
export async function submitExpense({ uid, driver, photo, captured, kinds, memo, f, scan }) {
  const by = `${driver?.name || driver?.이름 || "기사"}(기사)`;
  const km = Number(String(f.km || "").replace(/[^\d]/g, "")) || null;
  const amount = Number(String(f.amount || "").replace(/[^\d]/g, "")) || 0;
  const data = {
    companyName: String(driver?.companyName || "").trim(), driverId: uid, driverName: driver?.name || driver?.이름 || "", carNo: driver?.차량번호 || driver?.carNo || "",
    kinds: kinds || [], memo: String(memo || "").trim(), amount, pay: f.pay || "personalCard", vendor: String(f.vendor || "").trim(), bizNo: String(f.bizNo || "").replace(/[^\d]/g, ""),
    phone: f.phone || "", date: f.date || kstYmd(), time: f.time || "", cardApproval: f.cardApproval || "", cardLast4: f.cardLast4 || "", km, items: f.items || [],
    image: photo.dataUrl, imgHash: photo.hash || "", takenAt: photo.takenAt || 0, captured: !!captured,
    scan: { vendor: scan?.vendor || "", amount: Number(scan?.amount) || 0, date: scan?.date || "", bizNo: scan?.bizNo || "", engine: scan?.engine || "", count: scan?.count || 0 },
    status: "접수", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, "vehicleExpenses"), data);
  // 엔진오일 · 타이어는 차량관리 › 정비 교체 기록에도 그대로(다음 교환 알림이 맞게)
  const careItems = {};
  if ((kinds || []).includes("engineOil")) careItems.engineOil = { km, date: data.date };
  if ((kinds || []).includes("tire")) careItems.tire = { km, date: data.date };
  const odo = Number(driver?.care?.odometer) || 0;
  if (Object.keys(careItems).length || (km && km > odo)) {
    const patch = { care: { ...(Object.keys(careItems).length ? { items: careItems } : {}), ...(km && km > odo ? { odometer: km, odometerAt: data.date } : {}) }, careUpdatedAt: serverTimestamp(), careUpdatedBy: by };
    patch.careLogs = arrayUnion({ at: Date.now(), by, kind: "정비", item: Object.keys(careItems)[0] || "repair", itemLabel: "영수증", date: data.date, km, cost: amount, shop: data.vendor, memo: `영수증 ${ref.id}` });
    await setDoc(doc(db, "drivers", uid), patch, { merge: true }).catch(() => {});
  }
  return ref.id;
}
// 반려된 영수증을 다시 찍어 올리기
export async function resubmitExpense(id, photo, captured) {
  await updateDoc(doc(db, "vehicleExpenses", id), { image: photo.dataUrl, imgHash: photo.hash || "", takenAt: photo.takenAt || 0, captured: !!captured, status: "접수", rejectReason: "", updatedAt: serverTimestamp() });
}
export const deleteExpense = (id) => deleteDoc(doc(db, "vehicleExpenses", id));

// ── 기사앱 알림함(driver_notifications — 기사앱이 이미 구독 중) ──
export const notifyDriver = (driverId, company, title, body, type = "vehicle_care") => (driverId
  ? addDoc(collection(db, "driver_notifications"), { driverId, companyName: company || "", type, orderId: null, title, body, createdAt: serverTimestamp(), read: false }).catch(() => {})
  : Promise.resolve());

// ── 사무실: 확인 · 반려 · 고치기 ──
export async function setExpenseStatus(ids, status, { by = "", reason = "" } = {}) {
  const b = writeBatch(db);
  ids.forEach((id) => b.update(doc(db, "vehicleExpenses", id), { status, ...(status === "반려" ? { rejectReason: reason } : {}), ...(status === "확인" ? { checkedBy: by, checkedAt: serverTimestamp() } : {}), updatedAt: serverTimestamp() }));
  await b.commit();
}
export const patchExpense = (id, patch) => updateDoc(doc(db, "vehicleExpenses", id), { ...patch, updatedAt: serverTimestamp() });

// ── 전자결재와 연결 ── 상신 → 결재중 · 최종 승인 → 승인 · 반려/회수/취소 → 확인(다시 결의할 수 있게)
export async function syncExpensesWithApproval(ap, status) {
  const ids = Array.isArray(ap?.data?.vexIds) ? ap.data.vexIds.filter(Boolean) : [];
  if (!ids.length) return;
  const st = status === "pending" ? "결재중" : status === "approved" ? "승인" : ["rejected", "withdrawn", "cancelled"].includes(status) ? "확인" : null;
  if (!st) return;
  const b = writeBatch(db);
  ids.forEach((id) => b.update(doc(db, "vehicleExpenses", id), {
    status: st, approvalId: st === "확인" ? "" : (ap.id || ""), apDocNo: st === "확인" ? "" : (ap.docNo || ""),
    ...(st === "확인" ? { apNote: status === "rejected" ? `지출결의 반려(${ap.docNo || ""})` : status === "cancelled" ? `지출결의 취소(${ap.docNo || ""})` : `지출결의 회수(${ap.docNo || ""})` } : { apNote: "" }),
    updatedAt: serverTimestamp(),
  }));
  await b.commit().catch((e) => console.warn("[차량 비용 영수증] 결재 상태 반영 실패:", e?.message || e));
}
// 💸 2026-11-10 지급 완료 처리(전자결재) → 영수증 "지급완료"(지급일) · 지급 취소 → 다시 "승인"
export async function syncExpensesPaid(ap, paid) {
  const ids = Array.isArray(ap?.data?.vexIds) ? ap.data.vexIds.filter(Boolean) : [];
  if (!ids.length) return;
  const b = writeBatch(db);
  ids.forEach((id) => b.update(doc(db, "vehicleExpenses", id), paid
    ? { status: "지급완료", paidDate: paid.date || "", paidAt: paid.at || Date.now(), paidBy: paid.byName || "", approvalId: ap.id || "", apDocNo: ap.docNo || "", updatedAt: serverTimestamp() }
    : { status: "승인", paidDate: "", paidAt: 0, paidBy: "", updatedAt: serverTimestamp() }));
  await b.commit().catch((e) => console.warn("[차량 비용 영수증] 지급 상태 반영 실패:", e?.message || e));
}
// 영수증 → 전자결재 지출결의서 화면 열기(PC 홈 › 전자결재 · 모바일 전자결재 둘 다)
export function openSpendComposer(preset) {
  try { sessionStorage.setItem("kpApPreset", JSON.stringify(preset)); } catch { /* 사진이 너무 크면 사진만 빼고 */
    try { sessionStorage.setItem("kpApPreset", JSON.stringify({ ...preset, images: [] })); } catch { /* 무시 */ }
  }
  window.__kpOpenApproval = { page: "expense" };
  window.dispatchEvent(new Event("kp-open-approval"));
  setTimeout(() => window.dispatchEvent(new Event("kp-ap-preset")), 60);
}

// ── 구독 ──
const sortNew = (a, b) => (tsMs(b.createdAt) || Date.now()) - (tsMs(a.createdAt) || Date.now());
export function useDriverExpenses(uid) {
  const [list, setList] = React.useState(null);
  React.useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(query(collection(db, "vehicleExpenses"), where("driverId", "==", uid)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortNew)), () => setList([]));
  }, [uid]);
  return list;
}
export function useCompanyExpenses(company) {
  const [list, setList] = React.useState(null);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "vehicleExpenses"), where("companyName", "==", company)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortNew)), () => setList([]));
  }, [company]);
  return list;
}
export function usePhotoSettings(company) {
  const [s, setS] = React.useState(null);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(doc(db, "vehiclePhotoSettings", company), (d) => setS(d.exists() ? { ...DEFAULT_PHOTO_SETTINGS, ...d.data() } : { ...DEFAULT_PHOTO_SETTINGS }), () => setS({ ...DEFAULT_PHOTO_SETTINGS }));
  }, [company]);
  return s;
}
export const savePhotoSettings = (company, v, by) => setDoc(doc(db, "vehiclePhotoSettings", company), { ...v, companyName: company, updatedBy: by || "", updatedAt: serverTimestamp() }, { merge: true });
export function useDriverPeriodPhotos(uid, periodKey) {
  const [list, setList] = React.useState(null);
  React.useEffect(() => {
    if (!uid || !periodKey) return undefined;
    return onSnapshot(query(collection(db, "vehiclePhotos"), where("driverId", "==", uid)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.periodKey === periodKey)), () => setList([]));
  }, [uid, periodKey]);
  return list;
}
export function useCompanyPeriodPhotos(company, periodKey) {
  const [list, setList] = React.useState(null);
  React.useEffect(() => {
    if (!company || !periodKey) return undefined;
    return onSnapshot(query(collection(db, "vehiclePhotos"), where("companyName", "==", company), where("periodKey", "==", periodKey)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([]));
  }, [company, periodKey]);
  return list;
}
export async function savePeriodPhoto({ uid, driver, periodKey, part, photo, captured, km }) {
  const id = photoDocId(uid, periodKey, part);
  await setDoc(doc(db, "vehiclePhotos", id), {
    companyName: String(driver?.companyName || "").trim(), driverId: uid, driverName: driver?.name || driver?.이름 || "", carNo: driver?.차량번호 || "",
    periodKey, part, image: photo.dataUrl, imgHash: photo.hash || "", takenAt: photo.takenAt || 0, captured: !!captured, km: km || null, createdAt: serverTimestamp(),
  });
  const odo = Number(driver?.care?.odometer) || 0;
  if (km && km > odo) {
    const by = `${driver?.name || driver?.이름 || "기사"}(기사)`;
    await setDoc(doc(db, "drivers", uid), { care: { odometer: km, odometerAt: kstYmd() }, careUpdatedAt: serverTimestamp(), careUpdatedBy: by, careLogs: arrayUnion({ at: Date.now(), by, kind: "주행거리", date: kstYmd(), km, cost: 0, memo: "정기 차량 사진(계기판)" }) }, { merge: true }).catch(() => {});
  }
}
