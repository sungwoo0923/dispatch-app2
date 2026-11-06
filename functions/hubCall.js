// ======================= functions/hubCall.js =======================
// ⭐ 2026-11-06 로지스웹 허브 콜(hubOrders) — 서버 쪽 집계. 화면 설명은 cafe-site/src/hub/hubApi.js 맨 위.
//  hubStats/{uid} 는 회원이 쓸 수 없고(규칙 write: false) 여기서만 쓴다 → 평점·완료 건수를 꾸밀 수 없다.
//   · 운송완료(delivered)가 되면 배차된 회원 completed +1, 등록자 postedDone +1
//   · 등록자 평가(ratingByPoster) → 배차된 회원 ratingSum/ratingCount, 배차된 회원 평가(ratingByTaker) → 등록자
//   · 10초 안 취소(cancelCount 증가) → 취소한 회원 quickCancels +1 (반복하면 관리자가 패널티)
//   · 등록자가 배차 취소(releaseCount 증가) → 등록자 releases +1, 그때 배차돼 있던 회원 releasedBy +1
//   · 새 오더 → 등록자 posted +1
//  화면은 hubStats가 없으면 오더에서 직접 계산해 보여주므로(함수 배포 전 대비) 둘 다 같은 기준이다.

function bump(db, FieldValue, uid, patch) {
  if (!uid) return Promise.resolve();
  const inc = {};
  for (const [k, v] of Object.entries(patch)) inc[k] = FieldValue.increment(v);
  inc.updatedAt = FieldValue.serverTimestamp();
  return db.collection("hubStats").doc(uid).set(inc, { merge: true });
}

async function onHubOrderWrite(db, FieldValue, id, before, after) {
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
  return Promise.all(jobs);
}

module.exports = { onHubOrderWrite };
