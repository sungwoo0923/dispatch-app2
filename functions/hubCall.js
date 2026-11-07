// ======================= functions/hubCall.js =======================
// ⭐ 2026-11-06 로지스웹 허브 콜(hubOrders) — 서버 쪽 집계. 화면 설명은 cafe-site/src/hub/hubApi.js 맨 위.
//  hubStats/{uid} 는 회원이 쓸 수 없고(규칙 write: false) 여기서만 쓴다 → 평점·완료 건수를 꾸밀 수 없다.
//   · 운송완료(delivered)가 되면 배차된 회원 completed +1, 등록자 postedDone +1
//   · 등록자 평가(ratingByPoster) → 배차된 회원 ratingSum/ratingCount, 배차된 회원 평가(ratingByTaker) → 등록자
//   · 10초 안 취소(cancelCount 증가) → 취소한 회원 quickCancels +1 (반복하면 관리자가 패널티)
//   · 등록자가 배차 취소(releaseCount 증가) → 등록자 releases +1, 그때 배차돼 있던 회원 releasedBy +1
//   · 새 오더 → 등록자 posted +1
//  화면은 hubStats가 없으면 오더에서 직접 계산해 보여주므로(함수 배포 전 대비) 둘 다 같은 기준이다.
//
// ⭐ 2026-11-06 (2차) 알림 · 예치금 · 로지스웹 연동 · 위치관제 정리도 여기서(단계가 바뀐 순간 한 번 — 알림 번호를 고정해 두 번 만들지 않는다)
//   배차신청 → 등록자 알림 · 10초 확정(= 운송중) → 양쪽 알림 · 운임 보류 · 로지스웹 오더에 기사 채우기
//   ⭐ 2026-11-07 (3차) 상차완료 단계 없음: 확정 → 운송중 → 차주 [운송완료] → 등록자 알림 · 위치 기록 삭제
//   회차(등록자 요청 → 차주 수락) → 회차비만 남기고 환불 · 계산서 등록 → 등록자 확인(지급예정일) → 정산
//   선불/착불 운송완료 → 차주 수수료
//   운송완료 · 취소 · 재모집 → 위치 공유(hubLive) 지우기 · 기사앱 위치 넘기기 표시(drivers.hubActiveOrderId) 끄기
const W = require("./hubWallet");
const S = require("./hubSync");

function bump(db, FieldValue, uid, patch) {
  if (!uid) return Promise.resolve();
  const inc = {};
  for (const [k, v] of Object.entries(patch)) inc[k] = FieldValue.increment(v);
  inc.updatedAt = FieldValue.serverTimestamp();
  return db.collection("hubStats").doc(uid).set(inc, { merge: true });
}

const safe = (label, p) => Promise.resolve(p).catch((e) => console.error(`[허브 콜] ${label} 실패:`, e?.message || e));

async function clearLive(db, id, takerUid) {
  try { await db.recursiveDelete(db.collection("hubLive").doc(id)); } catch (e) { console.warn("[허브 관제] 위치 지우기 실패:", e?.message || e); }
  if (takerUid) {
    const dref = db.collection("drivers").doc(takerUid);
    const d = await dref.get().catch(() => null);
    if (d?.exists && d.data().hubActiveOrderId === id) await dref.update({ hubActiveOrderId: null }).catch(() => {});
  }
}
async function markDriverActive(db, id, o) {
  // 로지스웹 소속 기사 — 기사앱(백그라운드 위치)이 drivers/{uid}에 위치를 쓰므로 그 위치를 이 오더 관제로 넘긴다(hubDriverLocMirror)
  if (!o.takerUid) return;
  const m = await db.collection("hubMembers").doc(o.takerUid).get().catch(() => null);
  if (m?.data()?.source !== "logisweb-driver") return;
  const dref = db.collection("drivers").doc(o.takerUid);
  const d = await dref.get().catch(() => null);
  if (d?.exists) await dref.update({ hubActiveOrderId: id }).catch(() => {});
}

async function onHubOrderWrite(db, FieldValue, id, before, after, deps = {}) {
  const jobs = [];
  if (!before && after) jobs.push(bump(db, FieldValue, after.posterUid, { posted: 1 }));
  if (!after) return Promise.all(jobs);
  const b = before || {};
  if (after.status === "delivered" && b.status !== "delivered") {
    jobs.push(bump(db, FieldValue, after.takerUid, { completed: 1 }));
    jobs.push(bump(db, FieldValue, after.posterUid, { postedDone: 1 }));
  }
  const rp = after.ratingByPoster?.score;
  if (rp && !b.ratingByPoster) jobs.push(bump(db, FieldValue, after.takerUid, { ratingSum: Number(rp), ratingCount: 1 }));
  const rt = after.ratingByTaker?.score;
  if (rt && !b.ratingByTaker) jobs.push(bump(db, FieldValue, after.posterUid, { ratingSum: Number(rt), ratingCount: 1 }));
  if ((after.cancelCount || 0) > (b.cancelCount || 0) && after.lastCancelUid) jobs.push(bump(db, FieldValue, after.lastCancelUid, { quickCancels: 1 }));
  if ((after.releaseCount || 0) > (b.releaseCount || 0)) {
    jobs.push(bump(db, FieldValue, after.posterUid, { releases: 1 }));
    if (b.takerUid) jobs.push(bump(db, FieldValue, b.takerUid, { releasedBy: 1 }));
  }
  if (deps.events !== false && before) jobs.push(safe("단계 처리", onHubOrderEvents(db, FieldValue, id, b, after, deps)));
  if (deps.events !== false && !before) jobs.push(safe("새 오더", onHubOrderCreate(db, FieldValue, id, after, deps)));
  return Promise.all(jobs);
}

async function onHubOrderEvents(db, FieldValue, id, b, a, deps = {}) {
  const N = (nid, x) => W.serverNotice(db, FieldValue, `${id}_${nid}`, { orderId: id, ...x });
  const route = W.routeText(a);
  const ms = (t) => W.tsMs(t) || 0;
  const tasks = [];

  // 배차신청(10초 확정 대기)
  if (b.status === "open" && a.status === "assigned" && a.takerUid) {
    tasks.push(N(`assigned_${ms(a.assignedAt)}`, { toUid: a.posterUid, type: "assigned", title: "배차신청이 들어왔어요", body: `${route} 오더. 10초 뒤에 확정돼요.` }));
  }
  // 10초 안 취소
  if (b.status === "assigned" && a.status === "open" && (a.cancelCount || 0) > (b.cancelCount || 0)) {
    tasks.push(N(`qc_${a.cancelCount}`, { toUid: a.posterUid, type: "quickCancel", title: "배차신청이 취소됐어요", body: `${route} 오더를 다시 모집하고 있어요.` }));
  }
  // 등록자가 배차 취소 → 재모집
  if ((a.releaseCount || 0) > (b.releaseCount || 0)) {
    tasks.push(N(`rel_${a.releaseCount}`, { toUid: b.takerUid, type: "released", title: "배차가 취소됐어요", body: `${route} 오더를 등록자가 취소했어요.${a.lastReleaseReason ? ` 사유: ${a.lastReleaseReason}` : ""}` }));
    tasks.push(W.releaseHold(db, FieldValue, id, "배차 취소"));
    tasks.push(clearLive(db, id, b.takerUid));
  }
  // 10초 확정 → 운송중(위치 공유 시작)
  if (a.status === "assigned" && a.confirmed === true && b.confirmed !== true && a.takerUid) {
    const k = ms(a.assignedAt);
    tasks.push(N(`confirmed_taker_${k}`, { toUid: a.takerUid, type: "confirmed", title: "배차가 확정됐어요", body: `${route} 오더. 상세주소와 연락처를 확인해 주세요.` }));
    tasks.push(N(`confirmed_poster_${k}`, { toUid: a.posterUid, type: "confirmed", title: "배차가 확정됐어요", body: `${route} 오더. 차량 위치를 볼 수 있어요.` }));
    tasks.push(W.holdForOrder(db, FieldValue, id, a));
    tasks.push(markDriverActive(db, id, a));
  }
  // 회차 — 등록자가 금액을 정해 요청 → 차주가 수락해야 확정(양쪽 합의)
  const ra = a.회차 || {}, rb = b.회차 || {};
  if (ra.status === "proposed" && (rb.status !== "proposed" || ms(ra.at) !== ms(rb.at))) {
    tasks.push(N(`return_req_${ms(ra.at)}`, { toUid: a.takerUid, type: "return", title: "회차 요청이 왔어요", body: `${route} 회차비 ${W.won(ra.amount)}. 확인하고 수락해 주세요.` }));
  }
  if (ra.status === "rejected" && rb.status !== "rejected") {
    tasks.push(N(`return_rej_${ms(ra.at)}`, { toUid: a.posterUid, type: "return", title: "차주가 회차를 거절했어요", body: `${route} 오더. 전화로 다시 이야기해 주세요.` }));
  }
  const returnedNow = ra.status === "accepted" && rb.status !== "accepted";
  if (returnedNow) {
    tasks.push(N("return_ok", { toUid: a.posterUid, type: "return", title: "회차가 확정됐어요", body: `${route} 회차비 ${W.won(ra.amount)}` }));
    tasks.push(W.adjustHoldForReturn(db, FieldValue, id));
  }
  // 운송완료(차주가 누른다) → 등록자 알림 · 위치 공유 끝 · 위치 기록 삭제
  if (a.status === "delivered" && b.status !== "delivered") {
    if (!returnedNow) tasks.push(N("delivered_poster", { toUid: a.posterUid, type: "delivered", title: "운송을 마쳤어요", body: `${route} 운송이 끝났어요.` }));
    if (W.DEPOSIT_PAY.includes(a.지급방식)) tasks.push(N("delivered_taker", { toUid: a.takerUid, type: "invoice", title: "계산서를 올려 주세요", body: `${route} 계산서를 올리면 운송료 ${W.won(W.payAmount(a))} 지급일이 정해져요.` }));
    if (W.CASH_PAY.includes(a.지급방식)) tasks.push(W.cashFeeOnDeliver(db, FieldValue, id));
    tasks.push(clearLive(db, id, a.takerUid));
  }
  if (a.status === "cancelled" && b.status !== "cancelled") {
    tasks.push(N("cancelled_poster", { toUid: a.posterUid, type: "cancelled", title: "오더를 취소했어요", body: `${route} 오더` }));
    if (b.takerUid || a.takerUid) tasks.push(N("cancelled_taker", { toUid: a.takerUid || b.takerUid, type: "cancelled", title: "오더가 취소됐어요", body: `${route} 오더를 등록자가 취소했어요.` }));
    tasks.push(W.releaseHold(db, FieldValue, id, "오더 취소"));
    tasks.push(clearLive(db, id, a.takerUid || b.takerUid));
  }
  // 인수증 · 전표(여러 장) 추가
  const pa = Array.isArray(a.pod) ? a.pod.length : 0, pb = Array.isArray(b.pod) ? b.pod.length : 0;
  if (pa > pb) {
    tasks.push(N(`pod_${pa}`, { toUid: a.posterUid, type: "pod", title: "인수증이 올라왔어요", body: `${route} ${pa - pb}장` }));
  }
  // 계산서 등록(차주) → 등록자 확인 요청
  if (a.invoice && !b.invoice) {
    tasks.push(N("invoice", { toUid: a.posterUid, type: "invoice", title: "계산서가 올라왔어요", body: `${route} 승인번호 ${a.invoice.no || "-"}. 확인하고 지급일을 정해 주세요.` }));
  }
  // 등록자가 계산서 확인(지급예정일) → 정산
  if (a.invoiceOk && !b.invoiceOk && W.DEPOSIT_PAY.includes(a.지급방식)) tasks.push(W.settleOrder(db, FieldValue, id, { by: a.posterUid }));
  // 관리자 정산 처리(계산서 없이)
  if (a.settleRequestAt && ms(a.settleRequestAt) !== ms(b.settleRequestAt)) tasks.push(W.settleOrder(db, FieldValue, id, { by: a.settleRequestBy || "admin", force: true }));

  await Promise.all(tasks.map((t) => safe("작업", t)));
  // 로지스웹 배차 프로그램 연동(등록자가 로지스웹 운송사일 때)
  if (deps.storage !== undefined) await safe("로지스웹 연동", S.syncToLogisweb(db, FieldValue, deps.storage, id, b, a));
}

// 새 오더 — 상차 지역 키(보드 지역 검색) · 회사 키 채우기 · 상·하차지 자동 저장(고객관리 또는 로지스웹 상하차지거래처) · 로지스웹 오더 만들기
async function onHubOrderCreate(db, FieldValue, id, a, deps = {}) {
  const patch = {};
  if (!Array.isArray(a.상차지역) || !a.상차지역.length) patch.상차지역 = [a.상차시도, a.상차시군구 ? `${a.상차시도} ${a.상차시군구}` : ""].filter(Boolean);
  if (Object.keys(patch).length) await db.collection("hubOrders").doc(id).update(patch).catch(() => {});
  await safe("장소 저장", S.savePlacesFromOrder(db, FieldValue, id, a));
  if (deps.storage !== undefined) await safe("로지스웹 오더 만들기", S.ensureLwOrder(db, FieldValue, id, a));
}

// 로지스웹 소속 기사 — 기사앱이 drivers/{uid}에 쓴 위치를 진행 중인 허브 오더 관제(hubLive)로 넘긴다
async function mirrorDriverLocation(db, FieldValue, uid, before, after) {
  const orderId = after?.hubActiveOrderId;
  if (!orderId || !after.location || after.location.lat == null) return;
  const bl = before?.location || {};
  if (bl.lat === after.location.lat && bl.lng === after.location.lng && W.tsMs(before?.updatedAt) === W.tsMs(after.updatedAt)) return;
  const o = (await db.collection("hubOrders").doc(orderId).get()).data();
  if (!o || o.takerUid !== uid || !(o.status === "assigned" && o.confirmed === true)) {
    await db.collection("drivers").doc(uid).update({ hubActiveOrderId: null }).catch(() => {});
    return;
  }
  const lref = db.collection("hubLive").doc(orderId);
  const cur = (await lref.get()).data() || {};
  const lat = Number(after.location.lat), lng = Number(after.location.lng);
  await lref.set({ orderId, takerUid: uid, posterUid: o.posterUid, lat, lng, speed: Math.round(Number(after.speed) || 0), source: "driverApp", status: String(after.status || ""), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const lastMs = W.tsMs(cur.lastTrackAt);
  const moved = cur.lastTrack ? Math.hypot((cur.lastTrack.lat - lat) * 111, (cur.lastTrack.lng - lng) * 88) : 999;
  if (moved > 0.05 || Date.now() - lastMs >= 30000) {
    await lref.collection("track").add({ lat, lng, speed: Math.round(Number(after.speed) || 0), timestamp: FieldValue.serverTimestamp(), source: "driverApp" });
    await lref.set({ lastTrack: { lat, lng }, lastTrackAt: FieldValue.serverTimestamp() }, { merge: true });
  }
}

module.exports = { onHubOrderWrite, onHubOrderEvents, onHubOrderCreate, mirrorDriverLocation };
