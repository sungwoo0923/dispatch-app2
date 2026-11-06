// ======================= functions/hubSync.js =======================
// ⭐ 2026-11-06 로지스웹 허브 → 로지스웹 배차 프로그램 연동(서버 전용)
//  허브 오더 등록자가 로지스웹 운송사 직원(posterSource "logisweb-staff")이면 그 회사 배차 프로그램에 오더를 하나 만들고(orders/hub_{허브오더id})
//  진행을 따라 채운다 — 오더마켓(functions/orderMarket.js)과 같은 방식·같은 필드 이름.
//   · 배차 확정  → 오더 생성(상·하차지 · 화물 · 차량 · 운임) + 기사 차량번호 · 이름 · 전화번호 · 배차완료
//   · 상차완료   → 상차완료일시     · 운송완료 → 기사확인상태 "완료" · 기사완료일시
//   · 배차 취소 후 재모집 → 기사 비우고 배차중 · 오더 취소 → 배차취소
//   · 인수증(사진 · 서류 여러 장) → 그 오더의 첨부(orders/{id}/attachments — 배차 화면 첨부 보기와 같은 자리) + attachCount
//  첨부는 화면이 base64 || url 로 읽는다 → 작은 파일(700KB 이하)은 base64도 같이 넣어 어디서든 바로 보이게.

const MARKET_NAME = "로지스웹 허브";
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const lwId = (id) => `hub_${id}`;
// 허브 화면(cafe-site/src/firebase.js)이 쓰는 Storage 버킷 — 배포 환경이 다르면 HUB_STORAGE_BUCKET 으로 바꾼다
const HUB_BUCKET = process.env.HUB_STORAGE_BUCKET || "dispatch-app-9b92f.firebasestorage.app";

function isLinkedPoster(o) {
  return o && o.posterSource === "logisweb-staff" && !!o.posterCompany;
}

function buildLwOrder(o, id, detail, match, posterEmail) {
  const memo = [`[${MARKET_NAME}] 허브 오더`, o.공개메모 || "", detail?.메모 || ""].filter(Boolean).join("\n");
  return {
    _id: lwId(id),
    companyName: o.posterCompany,
    등록일: kstToday(),
    등록기기: MARKET_NAME,
    작성자: posterEmail || "",
    source: "hub",
    허브오더Id: id,
    거래처명: o.posterCompany || "",
    상차일: o.상차일 || kstToday(), 상차시간: o.상차시간 || "",
    하차일: o.하차일 || o.상차일 || kstToday(), 하차시간: o.하차시간 || "",
    상차지명: detail?.상차지명 || "", 상차지주소: detail?.상차지주소 || [o.상차시도, o.상차시군구].filter(Boolean).join(" "),
    하차지명: detail?.하차지명 || "", 하차지주소: detail?.하차지주소 || [o.하차시도, o.하차시군구].filter(Boolean).join(" "),
    상차지담당자: detail?.상차담당자 || "", 상차지담당자번호: detail?.상차연락처 || "",
    하차지담당자: detail?.하차담당자 || "", 하차지담당자번호: detail?.하차연락처 || "",
    화물내용: [o.화물내용, o.파레트 ? `${o.파레트}파레트` : "", o.중량 || ""].filter(Boolean).join(" "),
    차량톤수: o.차량톤수 || "", 차량종류: o.차량종류 || "",
    지급방식: o.지급방식 || "", 상차방법: o.상차방법 || "", 하차방법: o.하차방법 || "",
    혼적: o.적재 === "혼적", 운행유형: o.운행유형 || "편도", 긴급: !!o.긴급,
    메모: memo,
    청구운임: 0,
    기사운임: Number(o.운임) || 0,
    수수료: Number(o.수수료) || 0,
    ...driverPatch(match),
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

// 허브 오더가 바뀔 때마다(hubOrderOnWrite) — 필요한 일만
async function syncToLogisweb(db, FieldValue, storage, id, before, after) {
  if (!after || !isLinkedPoster(after)) return;
  const b = before || {};
  const ref = db.collection("orders").doc(lwId(id));
  const confirmedNow = after.status === "assigned" && after.confirmed === true && b.confirmed !== true;
  const exists = async () => (await ref.get()).exists;

  if (confirmedNow || (after.takerUid && ["loaded", "delivered"].includes(after.status) && !after.lwOrderId)) {
    const [dS, mS, uS] = await Promise.all([
      db.collection("hubOrders").doc(id).collection("private").doc("detail").get(),
      db.collection("hubOrders").doc(id).collection("private").doc("match").get(),
      db.collection("users").doc(after.posterUid).get(),
    ]);
    const detail = dS.exists ? dS.data() : null, match = mS.exists ? mS.data() : null;
    if (await exists()) await ref.update({ ...driverPatch(match), 기사운임: Number(after.운임) || 0, updatedAt: FieldValue.serverTimestamp() });
    else await ref.set({ ...buildLwOrder(after, id, detail, match, uS.exists ? uS.data().email : ""), createdAt: FieldValue.serverTimestamp() });
    if (after.lwOrderId !== ref.id) await db.collection("hubOrders").doc(id).update({ lwOrderId: ref.id });
  }
  if (!after.lwOrderId && !confirmedNow) return;
  if (!(await exists())) return;
  if ((after.releaseCount || 0) > (b.releaseCount || 0) && after.status === "open") {
    await ref.update({ 배차상태: "배차중", 차량번호: "", 이름: "", 전화번호: "", 허브재모집: FieldValue.increment(1) });
  }
  if (after.status === "loaded" && b.status !== "loaded") await ref.update({ 상차완료일시: Date.now(), 상차완료근거: MARKET_NAME });
  if (after.status === "delivered" && b.status !== "delivered") await ref.update({ 기사확인상태: "완료", 기사완료일시: Date.now() });
  if (after.status === "cancelled" && b.status !== "cancelled") await ref.update({ 배차상태: "배차취소", 허브취소: true });

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

module.exports = { syncToLogisweb, buildLwOrder, driverPatch, lwId, isLinkedPoster, HUB_BUCKET };
