// ======================= functions/hubSync.js =======================
// ⭐ 2026-11-06 로지스웹 허브 → 로지스웹 배차 프로그램 연동(서버 전용)
// ⭐ 2026-11-07 (3차) 연결 방식 정리
//  ① 배차 프로그램 [저장 + 허브 등록] → hubPostRequests/{id} → 서버(handlePostRequest)가 허브 오더를 만들고
//     "그 원래 오더"(orders/{저장된 id})에 연결한다(lwOrderId, lwLinked "existing") — 새 오더를 만들지 않는다.
//  ② 로지스웹 운송사 직원이 허브 앱에서 직접 올린 오더 → 등록하자마자 배차 프로그램에도 일반 오더로 만든다
//     (orders/hub_{허브오더id}, lwLinked "hub", 배차상태 배차중)
//  진행을 따라 같은 필드 이름(배차 화면이 쓰는 이름)으로 채운다:
//   · 배차 확정 → 차량번호 · 이름 · 전화번호 · 배차상태 배차완료 · 배차방식 "로지스허브" · 기사운임 = 허브 운임
//       · 지급방식: 선불/착불 그대로, 인수증 → 계산서 · 선불/착불이면 청구운임 = 운임 + 수수료(예: 60 + 2 = 62만), 수수료 = 수수료
//       · 인수증이면 청구운임은 로지스웹 사용자가 정한다(건드리지 않음)
//       · 처음 보는 기사면 기사관리(drivers)에 자동 등록(배차 화면 upsertDriver와 같은 문서 이름 · 필드)
//   · 운송완료 → 기사확인상태 "완료" · 기사완료일시(회차면 기사운임 = 회차비)
//   · 배차 취소 후 재모집 → 기사 비우고 배차중 · 바꿨던 운임 · 지급방식 · 배차방식 되돌림
//   · 허브 오더 취소 → ① 원래 오더는 기사만 비우고 되돌림(허브상태 "허브취소") ② 허브에서 만든 오더는 배차취소
//   · 인수증(여러 장) → 그 오더의 첨부(orders/{id}/attachments) + attachCount
//  상·하차지 저장: 허브 전용 회원은 고객관리(hubPlaces, 같은 회사 키끼리만), 로지스웹 운송사는 상하차지거래처(places, 같은 회사)

const MARKET_NAME = "로지스웹 허브";
const LW_DISPATCH = "로지스허브"; // 배차방식 목록에 추가한 값(src/companyDropdownOptions.jsx)
const DEFAULT_COMPANY = "돌캐";
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const lwId = (id) => `hub_${id}`;
const num = (v) => Math.round(Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0);
// 허브 화면(cafe-site/src/firebase.js)이 쓰는 Storage 버킷 — 배포 환경이 다르면 HUB_STORAGE_BUCKET 으로 바꾼다
const HUB_BUCKET = process.env.HUB_STORAGE_BUCKET || "dispatch-app-9b92f.firebasestorage.app";
const CASH = ["선불", "착불"];
const lwPay = (p) => (CASH.includes(p) ? p : p === "계좌이체" ? "계좌이체" : "계산서");
const coDocKey = (co, key) => { const c = String(co || "").trim(); return c && c !== DEFAULT_COMPANY ? `${c}__${key}` : key; };
const normPlate = (s = "") => String(s).replace(/\s+/g, "").toUpperCase();
const makePlaceKey = (name = "") => String(name).toLowerCase().replace(/\(주\)|㈜/g, "").replace(/\s+/g, "").replace(/[^가-힣a-z0-9]/gi, "").trim();

// 회사 키 — 같은 회사끼리만 오더 기록 · 고객관리 · 오더복사를 나눈다(규칙 hubKeyOf와 같은 계산)
function companyKeyOf(m, uid) {
  if (m?.companyKey) return m.companyKey;
  if (m?.source && m.source !== "signup") return `lw:${m.companyName || ""}`;
  const d = String(m?.bizNo || "").replace(/[^\d]/g, "");
  return d ? `biz:${d}` : `uid:${uid}`;
}
function isLinkedPoster(o) {
  return !!o && o.posterSource === "logisweb-staff" && !!o.posterCompany;
}

function buildLwOrder(o, id, detail, posterEmail) {
  const memo = [`[${MARKET_NAME}] 허브에서 등록`, o.공개메모 || "", detail?.메모 || ""].filter(Boolean).join("\n");
  const cash = CASH.includes(o.지급방식);
  return {
    _id: lwId(id),
    companyName: o.posterCompany,
    등록일: kstToday(),
    등록기기: MARKET_NAME,
    작성자: posterEmail || "",
    source: "hub",
    허브오더Id: id,
    허브상태: "모집중",
    거래처명: detail?.의뢰자명 || o.posterCompany || "",
    상차일: o.상차일 || kstToday(), 상차시간: o.상차시간 || "",
    하차일: o.하차일 || o.상차일 || kstToday(), 하차시간: o.하차시간 || "",
    상차지명: detail?.상차지명 || "", 상차지주소: detail?.상차지주소 || [o.상차시도, o.상차시군구].filter(Boolean).join(" "),
    하차지명: detail?.하차지명 || "", 하차지주소: detail?.하차지주소 || [o.하차시도, o.하차시군구].filter(Boolean).join(" "),
    상차지담당자: detail?.상차담당자 || "", 상차지담당자번호: detail?.상차연락처 || "",
    하차지담당자: detail?.하차담당자 || "", 하차지담당자번호: detail?.하차연락처 || "",
    화물내용: [o.화물내용, o.파레트 ? `${o.파레트}파레트` : "", o.중량 || ""].filter(Boolean).join(" "),
    차량톤수: o.차량톤수 || "", 차량종류: o.차량종류 || "",
    지급방식: lwPay(o.지급방식), 상차방법: o.상차방법 || "", 하차방법: o.하차방법 || "",
    혼적: o.적재 === "혼적", 운행유형: o.운행유형 || "편도", 긴급: !!o.긴급,
    메모: memo,
    청구운임: cash ? num(o.운임) + num(o.수수료) : "", // 인수증이면 청구운임은 로지스웹 사용자가 정한다
    기사운임: num(o.운임),
    수수료: cash ? num(o.수수료) : 0,
    배차상태: "배차중", 차량번호: "", 이름: "", 전화번호: "",
  };
}
function driverPatch(match) {
  const car = String(match?.vehicle?.plate || "").trim();
  return {
    배차상태: car || match?.name ? "배차완료" : "배차중",
    차량번호: car, 이름: String(match?.name || "").trim(), 전화번호: String(match?.phone || "").trim(),
    ...(car || match?.name ? { 배차완료일시: Date.now(), 허브기사구분: match?.role === "carrier" ? "운송사" : "차주", 허브기사소속: match?.companyName || "" } : {}),
  };
}
const CLEAR_DRIVER = { 차량번호: "", 이름: "", 전화번호: "", 배차상태: "배차중", 기사확인상태: null };
// 배차 확정 때 바꾼 칸의 원래 값(되돌리기용) — 처음 한 번만 남긴다
const PREV_KEYS = ["청구운임", "기사운임", "지급방식", "배차방식", "수수료"];
const prevOf = (cur) => Object.fromEntries(PREV_KEYS.map((k) => [k, cur?.[k] ?? ""]));

async function fileAttachment(storage, path) {
  const bucket = storage.bucket(HUB_BUCKET);
  const file = bucket.file(path);
  const [md] = await file.getMetadata();
  const token = String(md?.metadata?.firebaseStorageDownloadTokens || "").split(",")[0];
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  const base = host ? `http://${host}` : "https://firebasestorage.googleapis.com";
  const url = `${base}/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media${token ? `&token=${token}` : ""}`;
  const size = Number(md?.size) || 0;
  const type = md?.contentType || "";
  let base64 = "";
  if (size && size <= 700000) {
    const [buf] = await file.download();
    base64 = `data:${type || "application/octet-stream"};base64,${buf.toString("base64")}`;
  }
  return { url, base64, size, type };
}

const detailOf = async (db, id) => { const s = await db.collection("hubOrders").doc(id).collection("private").doc("detail").get(); return s.exists ? s.data() : null; };

// ② 허브 앱에서 직접 올린 로지스웹 운송사 오더 → 배차 프로그램에 일반 오더로
async function ensureLwOrder(db, FieldValue, id, o) {
  if (!isLinkedPoster(o) || o.lwOrderId) return o?.lwOrderId || null;
  const [detail, us] = await Promise.all([detailOf(db, id), db.collection("users").doc(o.posterUid).get()]);
  const ref = db.collection("orders").doc(lwId(id));
  try { await ref.create({ ...buildLwOrder(o, id, detail, us.exists ? us.data().email : ""), createdAt: FieldValue.serverTimestamp() }); }
  catch (e) { if (!/already exists/i.test(String(e?.message || "")) && e?.code !== 6) throw e; }
  await db.collection("hubOrders").doc(id).update({ lwOrderId: ref.id, lwLinked: "hub" });
  return ref.id;
}

// 처음 보는 기사 → 기사관리(drivers) 자동 등록(배차 화면 pcUpsertDriver와 같은 문서 이름)
async function ensureDriverMaster(db, FieldValue, co, match) {
  const plate = String(match?.vehicle?.plate || "").trim();
  if (!co || !plate) return null;
  const key = coDocKey(co, normPlate(plate));
  const ref = db.collection("drivers").doc(key);
  const s = await ref.get();
  if (s.exists) {
    const d = s.data();
    if (!d.전화번호 && match.phone) await ref.update({ 전화번호: match.phone, updatedAt: FieldValue.serverTimestamp() }).catch(() => {});
    return { id: key, created: false };
  }
  const q = await db.collection("drivers").where("companyName", "==", co).where("차량번호", "in", [...new Set([plate, normPlate(plate)])]).limit(1).get();
  if (!q.empty) return { id: q.docs[0].id, created: false };
  await ref.set({
    id: key, 차량번호: plate, 이름: String(match.name || "").trim(), 전화번호: String(match.phone || "").trim(), companyName: co,
    차량종류: match.vehicle?.type || "", 차량톤수: match.vehicle?.ton || "", 등록자: MARKET_NAME, 메모: "로지스웹 허브에서 자동 등록",
    허브회원Uid: match.takerUid || "", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { id: key, created: true };
}

// 상·하차지 자동 저장
async function savePlacesFromOrder(db, FieldValue, id, o) {
  if (o.lwLinked === "existing") return; // 배차 프로그램에서 올린 오더는 거기서 이미 저장했다
  const detail = await detailOf(db, id);
  if (!detail) return;
  const sides = [["상차", o.상차시도, o.상차시군구], ["하차", o.하차시도, o.하차시군구]].map(([s, sd, sg]) => ({
    이름: String(detail[`${s}지명`] || "").trim(), 주소: String(detail[`${s}지주소`] || "").trim(), 담당자: String(detail[`${s}담당자`] || "").trim(), 연락처: String(detail[`${s}연락처`] || "").trim(), 시도: sd || "", 시군구: sg || "",
  })).filter((p) => p.주소);
  if (!sides.length) return;
  if (o.posterSource === "logisweb-staff" || o.posterSource === "logisweb-shipper") {
    const co = o.posterCompany;
    for (const p of sides) {
      if (!p.이름 || !co) continue; // 상하차지거래처는 업체명이 있어야
      const ref = db.collection("places").doc(coDocKey(co, makePlaceKey(p.이름)));
      const s = await ref.get();
      if (s.exists) continue;
      const dup = await db.collection("places").where("업체명", "==", p.이름).where("companyName", "==", co).limit(1).get();
      if (!dup.empty) continue;
      await ref.set({
        업체명: p.이름, 주소: p.주소, 담당자: p.담당자, 담당자번호: p.연락처, contacts: p.담당자 ? [{ name: p.담당자, phone: p.연락처, isPrimary: true }] : [],
        등급: "일반", 팝업표시: true, isActive: true, companyName: co, ...(o.posterSource === "logisweb-shipper" ? { userId: o.posterUid } : {}),
        등록경로: MARKET_NAME, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return;
  }
  const ck = o.posterCompanyKey || `uid:${o.posterUid}`;
  for (const p of sides) {
    const h = Buffer.from(`${p.이름}|${p.이름 ? "" : p.주소}`).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 60);
    const ref = db.collection("hubPlaces").doc(`${ck.replace(/[^\w:-]/g, "").replace(/:/g, "_")}_${h}`);
    await ref.set({ companyKey: ck, uid: o.posterUid, ...p, count: FieldValue.increment(1), lastUsedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
}

// ① 배차 프로그램 [저장 + 허브 등록] 요청 처리
async function handlePostRequest(db, FieldValue, reqId, r) {
  const reqRef = db.collection("hubPostRequests").doc(reqId);
  const fail = (reason) => reqRef.update({ status: "failed", reason, doneAt: FieldValue.serverTimestamp() });
  if (!r || r.status !== "requested") return null;
  const [us, os] = await Promise.all([db.collection("users").doc(r.uid).get(), db.collection("orders").doc(String(r.lwOrderId || "_")).get()]);
  if (!us.exists) return fail("로지스웹 계정이 없어요");
  const u = us.data();
  if (u.approved === false || ["driver", "shipper", "cafeUser"].includes(u.role)) return fail("등록할 수 없는 계정이에요");
  if (!os.exists) return fail("원래 오더가 없어요");
  const lw = os.data();
  const co = String(lw.companyName || u.companyName || "").trim();
  if (u.role !== "totalMaster" && co !== String(u.companyName || "").trim()) return fail("다른 회사 오더예요");
  if (lw.허브오더Id && lw.허브상태 && lw.허브상태 !== "허브취소") return fail("이미 허브에 올린 오더예요");
  // 허브 회원(없으면 로지스웹 운송사로 바로 만든다 — 허브 로그인과 같은 내용)
  const mref = db.collection("hubMembers").doc(r.uid);
  let m = (await mref.get()).data();
  if (!m) {
    m = { uid: r.uid, role: "carrier", source: "logisweb-staff", status: "approved", docsVerified: true, email: u.email || "", name: u.name || "", phone: u.phone || "", companyName: co, bizNo: u.bizNo || u.사업자번호 || "", prefs: {}, createdAt: FieldValue.serverTimestamp(), linkedAt: FieldValue.serverTimestamp() };
    await mref.set(m);
  }
  if (m.status !== "approved") return fail("허브 이용이 멈춘 계정이에요");
  const p = r.order || {};
  const F = num(p.운임), C = num(p.수수료);
  const pay = ["인수증", "선불", "착불"].includes(p.지급방식) ? p.지급방식 : "인수증";
  if (pay === "인수증" && F > 0) {
    const w = (await db.collection("hubWallets").doc(r.uid).get()).data() || {};
    if (num(w.available) < F) return fail(`잔액이 부족해요(필요 ${F.toLocaleString("ko-KR")}원)`);
  }
  const s = (v, n = 60) => String(v ?? "").slice(0, n);
  const ref = db.collection("hubOrders").doc();
  const pub = {
    상차시도: s(p.상차시도, 10), 상차시군구: s(p.상차시군구, 20), 하차시도: s(p.하차시도, 10), 하차시군구: s(p.하차시군구, 20),
    상차지역: [s(p.상차시도, 10), p.상차시군구 ? `${s(p.상차시도, 10)} ${s(p.상차시군구, 20)}` : ""].filter(Boolean),
    상차일: s(p.상차일, 10) || kstToday(), 상차시간: s(p.상차시간, 10), 하차일: s(p.하차일, 10) || s(p.상차일, 10) || kstToday(), 하차시간: s(p.하차시간, 10),
    화물내용: s(p.화물내용, 200), 중량: s(p.중량, 20), 파레트: num(p.파레트), 차량종류: s(p.차량종류, 20), 차량톤수: s(p.차량톤수, 20), 톤수값: Number(String(p.차량톤수 || "").match(/[\d.]+/)?.[0]) || 0,
    상차방법: s(p.상차방법, 20), 하차방법: s(p.하차방법, 20), 운임: F, 수수료: C, 지급방식: pay, 긴급: !!p.긴급, 운행유형: p.운행유형 === "왕복" ? "왕복" : "편도",
    적재: p.혼적 ? "혼적" : "독차", 공개메모: s(p.공개메모, 300), 거리km: num(p.거리km), 대수: s(p.대수 || "1대", 6), 예약: false, showAt: null,
  };
  const b = db.batch();
  b.set(ref, {
    ...pub, v: 3, posterUid: r.uid, posterRole: m.role, posterSource: m.source, posterCompany: m.companyName || co, posterName: m.name || "", posterVerified: m.docsVerified === true,
    posterCompanyKey: companyKeyOf(m, r.uid), lwOrderId: os.id, lwLinked: "existing",
    status: "open", takerUid: null, takerRole: null, assignedAt: null, cancelCount: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  b.set(ref.collection("private").doc("detail"), {
    상차지명: s(lw.상차지명), 상차지주소: s(lw.상차지주소, 200), 상차담당자: s(lw.상차지담당자), 상차연락처: s(lw.상차지담당자번호, 20),
    하차지명: s(lw.하차지명), 하차지주소: s(lw.하차지주소, 200), 하차담당자: s(lw.하차지담당자), 하차연락처: s(lw.하차지담당자번호, 20),
    메모: s(lw.메모, 500), 의뢰자구분: "운수사", 의뢰자명: s(lw.거래처명), posterPhone: m.phone || "", posterName: m.name || "", posterCompany: m.companyName || co,
  });
  b.update(os.ref, { 허브오더Id: ref.id, 허브상태: "모집중", 허브등록일시: Date.now() });
  b.update(reqRef, { status: "ok", hubOrderId: ref.id, doneAt: FieldValue.serverTimestamp() });
  await b.commit();
  return ref.id;
}

// 허브 오더가 바뀔 때마다(hubOrderOnWrite) — 필요한 일만
async function syncToLogisweb(db, FieldValue, storage, id, before, after) {
  if (!after) return;
  const b = before || {};
  let lwOrder = after.lwOrderId;
  if (!lwOrder && isLinkedPoster(after)) lwOrder = await ensureLwOrder(db, FieldValue, id, after);
  if (!lwOrder) return;
  const ref = db.collection("orders").doc(lwOrder);
  const snap = await ref.get();
  if (!snap.exists) return;
  const cur = snap.data();
  const F = num(after.운임), C = num(after.수수료);
  const cash = CASH.includes(after.지급방식);
  const confirmedNow = after.status === "assigned" && after.confirmed === true && b.confirmed !== true;
  const restore = () => (cur.허브이전 ? { ...cur.허브이전 } : {});

  if (confirmedNow || (after.takerUid && after.status === "delivered" && !cur.차량번호)) {
    const ms = await db.collection("hubOrders").doc(id).collection("private").doc("match").get();
    const match = ms.exists ? ms.data() : null;
    const patch = {
      ...driverPatch(match), 배차방식: LW_DISPATCH, 기사운임: F, 지급방식: lwPay(after.지급방식), 허브상태: "배차완료", 허브오더Id: id,
      ...(cash ? { 청구운임: F + C, 수수료: C } : {}),
      ...(cur.허브이전 ? {} : { 허브이전: prevOf(cur) }),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await ref.update(patch);
    if (match) {
      const dm = await ensureDriverMaster(db, FieldValue, cur.companyName || after.posterCompany, match).catch((e) => { console.warn("[허브 연동] 기사 등록 실패:", e?.message || e); return null; });
      if (dm?.created) await ref.update({ 허브기사등록: dm.id }).catch(() => {});
    }
  }
  if ((after.releaseCount || 0) > (b.releaseCount || 0) && after.status === "open") {
    await ref.update({ ...CLEAR_DRIVER, ...restore(), 허브상태: "모집중", 허브재모집: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
  }
  if (after.status === "delivered" && b.status !== "delivered") {
    const ret = after.회차?.status === "accepted";
    await ref.update({
      기사확인상태: "완료", 기사완료일시: Date.now(), 허브상태: ret ? "회차" : "운송완료",
      ...(ret ? { 기사운임: num(after.회차.amount), 메모: [cur.메모 || "", `[${MARKET_NAME}] 회차 ${num(after.회차.amount).toLocaleString("ko-KR")}원`].filter(Boolean).join("\n") } : {}),
    });
  }
  if (after.status === "cancelled" && b.status !== "cancelled") {
    if (after.lwLinked === "existing") await ref.update({ ...CLEAR_DRIVER, ...restore(), 허브상태: "허브취소", updatedAt: FieldValue.serverTimestamp() });
    else await ref.update({ 배차상태: "배차취소", 허브취소: true, 허브상태: "허브취소" });
  }

  // 인수증 → 첨부
  const pods = Array.isArray(after.pod) ? after.pod : [];
  const prev = new Set((Array.isArray(b.pod) ? b.pod : []).map((p) => p.path));
  const fresh = pods.filter((p) => p?.path && (!prev.has(p.path) || confirmedNow));
  for (const p of fresh) {
    const attId = `hubpod_${Buffer.from(p.path).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(-40)}`;
    const aref = ref.collection("attachments").doc(attId);
    if ((await aref.get()).exists) continue;
    let f = { url: "", base64: "", size: p.size || 0, type: p.type || "" };
    try { f = await fileAttachment(storage, p.path); } catch (e) { console.warn("[허브 연동] 인수증 파일 정보 실패:", p.path, e?.message || e); }
    try {
      await aref.create({
        ...(f.base64 ? { base64: f.base64 } : {}), url: f.url, name: p.name || "인수증", type: f.type || p.type || "", size: f.size || p.size || 0,
        sizeKB: Math.round((f.size || p.size || 0) / 1024), uploadedBy: "hub", 허브경로: p.path, 종류: p.kind || "인수증", createdAt: FieldValue.serverTimestamp(),
      });
      await ref.update({ attachCount: FieldValue.increment(1) });
    } catch (e) { if (!/already exists/i.test(String(e?.message || ""))) console.error("[허브 연동] 첨부 저장 실패:", e?.message || e); }
  }
}

module.exports = {
  syncToLogisweb, buildLwOrder, driverPatch, lwId, lwPay, isLinkedPoster, ensureLwOrder, ensureDriverMaster, savePlacesFromOrder, handlePostRequest,
  companyKeyOf, coDocKey, HUB_BUCKET, LW_DISPATCH,
};
