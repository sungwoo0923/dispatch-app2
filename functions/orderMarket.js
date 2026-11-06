// ======================= functions/orderMarket.js =======================
// ⭐ 2026-11-06 오더마켓(운송사 간 오더 거래) 서버 쪽 — 화면(cafe-site/src/cafeApi.js)과 같은 규칙
//  ① 게시글이 매칭완료(matched)가 되면 → 받은 운송사 배차 프로그램에 오더(orders/mkt_{게시글id}) 생성 + 게시글에 번호 기록
//                                         + 올린 운송사 원래 오더에 "오더마켓 매칭완료 · 수행사" 표시
//  ② 받은 운송사 오더(source: "ordermarket")의 배차/운송 상태가 바뀌면 → 게시글 단계(배차완료/운송완료)와
//     올린 운송사 원래 오더(기사·배차상태·운송완료)에 반영 + 양쪽에 알림(marketNotices)
//  화면도 같은 일을 하므로(함수가 배포되기 전 대비) 문서 이름을 고정(mkt_{id})하고, 값이 같으면 쓰지 않는다.

// 화면에 보이는 서비스 이름(cafe-site/src/cafeConstants.js MARKET_NAME 과 같게)
const MARKET_NAME = "로지스웹 허브";
const STATUS = {
  open: { label: "모집중", step: 0 },
  matched: { label: "매칭완료", step: 1 },
  dispatched: { label: "배차완료", step: 2 },
  delivered: { label: "운송완료", step: 3 },
};
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const takerOrderDocId = (id) => `mkt_${id}`;
const maskPlate = (p) => { const s = String(p || "").replace(/\s+/g, ""); return s.length > 2 ? `${s.slice(0, -2)}**` : s; };
const routeLabel = (o) => {
  const a = [o.상차시도, o.상차시군구].filter(Boolean).join(" ") || "상차지";
  const b = [o.하차시도, o.하차시군구].filter(Boolean).join(" ") || "하차지";
  return `${a} → ${b}`;
};

function stageOfOrder(o) {
  if (!o || o.배차상태 === "배차취소") return null;
  if (o.기사확인상태 === "완료" || o.기사완료일시) return "delivered";
  if (String(o.차량번호 || "").trim()) return "dispatched";
  return "matched";
}

function buildTakerOrder(listing, id, detail, req, takerCompany) {
  const car = String(req?.차량번호 || "").trim();
  const memo = [`[${MARKET_NAME}] ${listing.companyName || ""} 오더`, req?.메시지 ? `요청메모: ${req.메시지}` : "", detail?.메모 || "", listing.공개메모 || ""].filter(Boolean).join("\n");
  return {
    _id: takerOrderDocId(id),
    companyName: takerCompany,
    등록일: kstToday(),
    등록기기: MARKET_NAME,
    작성자: "",
    source: "ordermarket",
    오더마켓Id: id,
    오더마켓원청: listing.companyName || "",
    오더마켓원청Uid: listing.posterUid || "",
    오더마켓원청오더Id: listing.posterOrderId || "",
    오더마켓상태: car ? "배차완료" : "매칭완료",
    거래처명: listing.companyName || "",
    상차일: listing.상차일 || kstToday(), 상차시간: listing.상차시간 || "",
    하차일: listing.하차일 || listing.상차일 || kstToday(), 하차시간: listing.하차시간 || "",
    상차지명: detail?.상차지명 || "", 상차지주소: detail?.상차지주소 || "",
    하차지명: detail?.하차지명 || "", 하차지주소: detail?.하차지주소 || "",
    상차지담당자: detail?.상차지담당자 || "", 상차지담당자번호: detail?.상차지담당자번호 || "",
    하차지담당자: detail?.하차지담당자 || "", 하차지담당자번호: detail?.하차지담당자번호 || "",
    화물내용: listing.화물내용 || "", 차량톤수: listing.차량톤수 || "", 차량종류: listing.차량종류 || "",
    지급방식: listing.지급방식 || "", 상차방법: listing.상차방법 || "", 하차방법: listing.하차방법 || "",
    혼적: !!listing.혼적, 운행유형: listing.운행유형 || "편도", 긴급: !!listing.긴급,
    메모: memo,
    청구운임: Number(listing.운임값) || 0,
    기사운임: 0,
    배차상태: car ? "배차완료" : "배차중",
    차량번호: car, 이름: String(req?.기사명 || "").trim(), 전화번호: String(req?.기사연락처 || "").trim(),
    ...(car ? { 배차완료일시: Date.now() } : {}),
  };
}

function mirrorPatch(po, to, listing, status) {
  const label = STATUS[status]?.label || "";
  const patch = {};
  if (po.오더마켓상태 !== label) patch.오더마켓상태 = label;
  if (po.오더마켓수행사 !== (listing.takerCompany || "")) patch.오더마켓수행사 = listing.takerCompany || "";
  if (po.오더마켓Id !== listing._id) patch.오더마켓Id = listing._id;
  const linked = po.오더마켓기사연동 === true || !String(po.차량번호 || "").trim();
  if (to && linked && String(to.차량번호 || "").trim()) {
    if (po.차량번호 !== to.차량번호) patch.차량번호 = to.차량번호;
    if (po.이름 !== (to.이름 || "")) patch.이름 = to.이름 || "";
    if (po.전화번호 !== (to.전화번호 || "")) patch.전화번호 = to.전화번호 || "";
    if (po.배차상태 !== "배차완료") { patch.배차상태 = "배차완료"; if (!po.배차완료일시) patch.배차완료일시 = Date.now(); }
    if (po.오더마켓기사연동 !== true) patch.오더마켓기사연동 = true;
    if (status === "delivered" && po.기사확인상태 !== "완료") { patch.기사확인상태 = "완료"; if (!po.기사완료일시) patch.기사완료일시 = Date.now(); }
  }
  return Object.keys(patch).length ? patch : null;
}

function notice(db, FieldValue, { toUid, orderId, type, title, body, fromCompany = "" }) {
  if (!toUid) return Promise.resolve();
  return db.collection("marketNotices").add({ toUid, fromUid: "system", fromCompany, orderId, type, title, body, read: false, createdAt: FieldValue.serverTimestamp() });
}

// ① 게시글 변경 — 매칭되면 받은 운송사 프로그램에 오더를 만든다
async function onListingUpdate(db, FieldValue, id, before, after) {
  if (!after || Number(after.v || 0) < 2) return;
  if (after.status !== "matched" || !after.takerUid) return;
  if (before?.status === "matched" && before?.takerUid === after.takerUid && after.takerOrderId) return;
  const listing = { ...after, _id: id };
  const lref = db.collection("cafeOrders").doc(id);
  const [detailSnap, reqSnap, takerSnap] = await Promise.all([
    lref.collection("private").doc("detail").get(),
    lref.collection("requests").doc(after.takerUid).get(),
    db.collection("users").doc(after.takerUid).get(),
  ]);
  const takerCompany = takerSnap.exists ? (takerSnap.data().companyName || after.takerCompany) : after.takerCompany;
  if (!takerCompany) return;
  const oref = db.collection("orders").doc(takerOrderDocId(id));
  await db.runTransaction(async (tx) => {
    const o = await tx.get(oref);
    if (!o.exists) {
      tx.set(oref, { ...buildTakerOrder(listing, id, detailSnap.exists ? detailSnap.data() : null, reqSnap.exists ? reqSnap.data() : null, takerCompany), 작성자: takerSnap.exists ? (takerSnap.data().email || "") : "", createdAt: FieldValue.serverTimestamp() });
    }
    if (after.takerOrderId !== oref.id) tx.update(lref, { takerOrderId: oref.id, updatedAt: FieldValue.serverTimestamp() });
  });
  if (after.posterOrderId) {
    const pref = db.collection("orders").doc(after.posterOrderId);
    const ps = await pref.get();
    if (ps.exists) {
      const p = mirrorPatch(ps.data(), null, listing, "matched");
      if (p) await pref.update(p);
    }
  }
}

// ② 받은 운송사 오더 변경 — 진행 단계를 게시글과 올린 운송사 원래 오더에 반영
async function onTakerOrderUpdate(db, FieldValue, orderId, before, after) {
  if (!after || after.source !== "ordermarket" || !after.오더마켓Id) return;
  const stage = stageOfOrder(after);
  const prevStage = stageOfOrder(before);
  const lref = db.collection("cafeOrders").doc(after.오더마켓Id);
  const ls = await lref.get();
  if (!ls.exists) return;
  const listing = { ...ls.data(), _id: ls.id };
  // 매칭이 살아 있고(매칭취소·재모집이 아니고) 이 오더가 그 매칭의 오더일 때만
  if (!["matched", "dispatched", "delivered"].includes(listing.status)) return;
  if (listing.takerOrderId ? listing.takerOrderId !== orderId : orderId !== takerOrderDocId(ls.id)) return;
  if (listing.takerCompany && after.companyName && listing.takerCompany !== after.companyName) return;
  const curStep = STATUS[listing.status]?.step ?? -1;
  if (stage && STATUS[stage].step > curStep) {
    await lref.update({
      status: stage,
      driverMasked: maskPlate(after.차량번호),
      ...(listing.dispatchedAt ? {} : { dispatchedAt: FieldValue.serverTimestamp() }),
      ...(stage === "delivered" ? { deliveredAt: FieldValue.serverTimestamp() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    listing.status = stage;
  }
  // 알림은 받은 운송사 오더의 단계가 실제로 바뀐 순간 한 번(화면이 먼저 게시글을 바꿨어도)
  if (stage && stage !== prevStage && (stage === "dispatched" || stage === "delivered")) {
    await notice(db, FieldValue, {
        toUid: listing.posterUid, orderId: ls.id, type: stage, fromCompany: listing.takerCompany || "",
        title: stage === "delivered" ? "운송이 완료되었습니다" : "배차가 완료되었습니다",
      body: `${listing.takerCompany || "수행 운송사"} · ${routeLabel(listing)} 오더가 ${STATUS[stage].label} 되었습니다${stage === "dispatched" ? ` (차량 ${maskPlate(after.차량번호)})` : ""}.`,
    });
  }
  if (listing.posterOrderId) {
    const pref = db.collection("orders").doc(listing.posterOrderId);
    const ps = await pref.get();
    if (ps.exists) {
      const p = mirrorPatch(ps.data(), after, listing, listing.status);
      if (p) await pref.update(p);
    }
  }
}

module.exports = { onListingUpdate, onTakerOrderUpdate, stageOfOrder, buildTakerOrder, mirrorPatch };
