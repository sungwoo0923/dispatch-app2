// ======================= functions/roleMirror.js =======================
// 🔒 2026-11-23 역할별 오더 사본 — 사용자 요청: "기사는 기사운임만 · 본인에게 내려진 오더만", "화주는 청구운임만(기사운임 · 수수료 안 보이게)"
//  Firestore 보안 규칙은 문서 단위로만 막을 수 있고 "칸"을 숨기지 못한다. 그래서 기사 · 화주가 운송사 원본 오더(orders · dispatch)를 읽으면
//  화면에서 안 보여도 청구운임 · 기사운임 · 수수료가 휴대폰/브라우저에 그대로 왔다.
//  이제 서버가 오더가 바뀔 때마다 역할별 사본을 만든다(원본은 운송사 직원만 읽는다 — firestore.rules):
//   · driverOrders/{col}__{id}  — 배정된 기사 한 명(driverUid)만 읽는다. 기사운임은 남기고 청구 · 수수료 · 이익 · 매출 · 계산서 등은 뺀다
//   · shipperOrders/{col}__{id} — 그 오더의 화주(shipperCompany + 연동 운송사, 또는 등록한 화주 본인)만 읽는다. 청구운임은 남기고 기사운임 · 수수료 등은 뺀다
//  쓰기(수락 · 거절 · 완료 · 수정 요청)는 지금처럼 원본에 하고, 보안 규칙이 "그 기사 · 화주가 바꿔도 되는 칸"만 허용한다.

// 기사에게 보내지 않는 칸(이름에 이 글자가 들어가면 뺀다 — 안쪽 목록 · 묶음 칸까지)
const DRIVER_DROP = /청구|수수료|이익|수익|마진|매출|매입|원가|공급가|부가세|계산서|입금|미수|미지급|외부지급|운임보정|운임수동|운임구분|할증|산재|보험료|세금|사업자|거래처단가|업로드토큰|uploadToken|^_gsheet|^_sheet|기사운임합|화주|shipper(?!Company)|totalPrice|billing|invoice|profit|margin|fee$/i;
const DRIVER_DROP_EXACT = new Set(["운임", "정산상태", "정산일", "정산완료", "정산관리", "단가", "금액", "합계", "총액"]);
// 화주에게 보내지 않는 칸
const SHIPPER_DROP = /기사운임|기사단가|기사지급|기사정산|^지급(상태|완료|일)$|미지급|외부지급|수수료|이익|수익|마진|원가|매입|운임보정|운임수동|구간운임|정산계좌|업로드토큰|uploadToken|^_gsheet|^_sheet|기사타임라인|기사확인값|기사거절사유|배차확정자|createdByUid|등록자|^작성자$|내부메모|^메모$|담당자Uid|routeOwner|fee$|profit|margin/i;
const SHIPPER_DROP_EXACT = new Set(["기사", "지급", "지급액"]);

function clean(v, dropRe, dropExact, depth = 0) {
  if (v === null || v === undefined) return v;
  if (depth > 6) return undefined;
  if (Array.isArray(v)) return v.map((x) => clean(x, dropRe, dropExact, depth + 1)).filter((x) => x !== undefined);
  if (typeof v === "object") {
    // Firestore 시각(Timestamp) · 위치(GeoPoint) 등 그대로 두는 값
    if (typeof v.toMillis === "function" || typeof v.latitude === "number" || v.constructor?.name === "FieldValue") return v;
    const out = {};
    for (const k of Object.keys(v)) {
      if (dropRe.test(k) || dropExact.has(k)) continue;
      const c = clean(v[k], dropRe, dropExact, depth + 1);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return v;
}
const driverView = (o) => clean(o || {}, DRIVER_DROP, DRIVER_DROP_EXACT);
const shipperView = (o) => clean(o || {}, SHIPPER_DROP, SHIPPER_DROP_EXACT);

const normPlate = (v) => String(v ?? "").replace(/[^0-9가-힣A-Za-z]/g, "").toUpperCase();
const cancelled = (o) => o.배차상태 === "배차취소" || ["취소", "배차취소", "오더취소", "취소됨"].includes(o.상태);

// 이 오더를 받을 기사 계정(uid) — 같은 회사 · 지금 그 차량번호인 기사(가입한 계정만). 차량을 바꾼 기사는 차량이력 기간으로 판단
async function driverOwnerOf(db, o) {
  const plate = normPlate(o.차량번호);
  const co = String(o.companyName || "").trim();
  if (!plate || !co) return null;
  const raw = String(o.차량번호 || "").trim();
  const variants = [...new Set([raw, raw.replace(/\s+/g, "")].filter(Boolean))];
  const snap = await db.collection("drivers").where("companyName", "==", co).where("차량번호", "in", variants).limit(20).get().catch(() => ({ docs: [] }));
  const day = String(o.상차일 || "").slice(0, 10);
  const cands = snap.docs.map((d) => ({ id: d.id, x: d.data() || {} }))
    .filter(({ x }) => normPlate(x.차량번호 || x.carNo) === plate && x.uid && x.approved !== false);
  if (!cands.length) return null;
  // 차량이력이 있으면 그 날짜에 이 차량을 탄 기사
  const covers = ({ x }) => {
    const h = Array.isArray(x.차량이력) ? x.차량이력.filter((e) => normPlate(e?.차량번호) === plate) : [];
    if (!h.length || !day) return true;
    return h.some((e) => (!e.시작 || day >= e.시작) && (!e.종료 || day <= e.종료));
  };
  // 🔒 2026-11-23 그 계정이 지금도 승인된 같은 회사 기사여야(승인 전 · 퇴사 · 다른 회사로 옮긴 계정에 오더가 가지 않게)
  for (const c of [cands.find(covers), ...cands].filter(Boolean)) {
    const u = await db.collection("users").doc(String(c.x.uid)).get().catch(() => null);
    const x = u?.exists ? u.data() || {} : null;
    if (x && x.approved === true && x.role === "driver" && String(x.companyName || "").trim() === co) return c.x.uid;
  }
  return null;
}

// 기사에게 보여 줄 담당자(오더를 배차한 직원) — 이름 · 회사 대표 전화 대신 그 직원 전화(업무용)
async function contactOf(db, o) {
  const uid = o.createdByUid || o.배차확정자Uid || "";
  const email = String(o.createdByEmail || o.작성자 || "").trim().toLowerCase();
  let x = null;
  if (uid) { const u = await db.collection("users").doc(String(uid)).get().catch(() => null); x = u?.exists ? u.data() || {} : null; }
  else if (email.includes("@")) { const q = await db.collection("users").where("email", "==", email).limit(1).get().catch(() => null); x = q?.docs?.[0]?.data() || null; }
  if (!x) return null;
  if (String(x.companyName || "").trim() !== String(o.companyName || "").trim()) return null;
  return { name: x.name || "", phone: x.phone || x.전화번호 || "", position: x.position || "" };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 원본 한 건이 바뀌었을 때 사본 맞추기
async function syncOne(db, FieldValue, col, id, before, after, { force = false } = {}) {
  const key = `${col}__${id}`;
  // 기사 · 화주에게 보이는 칸이 하나도 안 바뀌었으면(위치 · 내부 칸만 바뀜) 아무것도 안 한다
  if (!force && before && after && same(driverView(before), driverView(after)) && same(shipperView(before), shipperView(after))
    && before.companyName === after.companyName && before.shipperCompany === after.shipperCompany) return;
  const dRef = db.collection("driverOrders").doc(key);
  const sRef = db.collection("shipperOrders").doc(key);
  const jobs = [];
  // ── 기사 사본
  const dWant = after && !after._seed && after.블라인드 !== true && !cancelled(after) && String(after.차량번호 || "").trim();
  if (!dWant) {
    if (before) jobs.push(dRef.delete().catch(() => {}));
  } else {
    const owner = await driverOwnerOf(db, after);
    if (!owner) jobs.push(dRef.delete().catch(() => {}));
    else {
      const view = driverView(after);
      const prev = await dRef.get().catch(() => null);
      const pd = prev?.exists ? prev.data() : null;
      const contact = pd && pd._contactFor === (after.createdByUid || after.배차확정자Uid || after.createdByEmail || after.작성자 || "") ? pd.담당자 || null : await contactOf(db, after);
      const doc = { ...view, id, _id: id, orderId: id, col, driverUid: owner, companyName: after.companyName || "", 담당자: contact, _contactFor: after.createdByUid || after.배차확정자Uid || after.createdByEmail || after.작성자 || "" };
      if (!pd || pd.driverUid !== owner || !same({ ...pd, mirroredAt: null }, { ...doc, mirroredAt: null })) {
        jobs.push(dRef.set({ ...doc, mirroredAt: FieldValue.serverTimestamp() }));
      }
    }
  }
  // ── 화주 사본
  const sWant = after && !after._seed && after.블라인드 !== true && String(after.shipperCompany || "").trim();
  if (!sWant) {
    if (before && String(before.shipperCompany || "").trim()) jobs.push(sRef.delete().catch(() => {}));
  } else {
    const view = shipperView(after);
    // id · _id = 원본 오더 번호(화면이 그 번호로 수정 · 취소 요청을 원본에 쓴다)
    const doc = { ...view, id, _id: id, orderId: id, col, shipperCompany: String(after.shipperCompany).trim(), companyName: after.companyName || "", shipperUid: after.shipperUid || "" };
    const changed = !before || !same(shipperView(before), view) || before.shipperCompany !== after.shipperCompany || before.companyName !== after.companyName;
    if (changed) jobs.push(sRef.set({ ...doc, mirroredAt: FieldValue.serverTimestamp() }));
  }
  await Promise.all(jobs);
}

module.exports = { driverView, shipperView, syncOne, driverOwnerOf, normPlate, DRIVER_DROP, SHIPPER_DROP };
