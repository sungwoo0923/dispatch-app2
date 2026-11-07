// ======================= src/hubShare.js =======================
// ⭐ 2026-11-07 오더 등록의 [저장 + 허브 등록] — 저장한 그 오더를 로지스웹 허브(화물 콜 앱)에 올리고 연결한다.
//  허브 오더는 서버(functions/hubSync.js handlePostRequest)가 만든다:
//   · 원래 오더(orders/{저장된 id})에 연결(허브오더Id · 허브상태) — 새 배차 오더를 따로 만들지 않는다
//   · 차주가 배차 확정하면 이 오더에 차량번호 · 기사명 · 전화 · 배차방식 "로지스허브" · 기사운임 · 지급방식이 채워지고
//     처음 보는 기사는 기사관리에 자동 등록된다. 운송완료 · 취소 · 인수증도 따라온다.
//  허브 운임 = 기사운임(없으면 청구운임) · 지불방식 = 선불/착불은 그대로, 그 밖은 인수증(허브 잔액에서 운임 보류)
//  주소 → 허브 지역(시·도 / 시·군·구)은 여기서 계산해 보낸다(오더마켓 공유 src/orderMarketShare.js toRegion과 같은 규칙).
import { collection, addDoc, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { toRegion } from "./orderMarketShare";

const num = (v) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;
const sggOf = (r) => String(r.sigungu || "").split(" ")[0];
const PAY = (p) => (p === "선불" || p === "착불" ? p : "인수증");

export function hubOrderFromRec(rec) {
  const up = toRegion(rec.상차지주소), dn = toRegion(rec.하차지주소);
  const fare = num(rec.기사운임) || num(rec.청구운임);
  const pay = PAY(rec.지급방식);
  const fee = pay === "인수증" ? 0 : Math.max(0, num(rec.청구운임) - num(rec.기사운임));
  return {
    상차시도: up.sido, 상차시군구: up.sido === "세종" ? "세종시" : sggOf(up), 하차시도: dn.sido, 하차시군구: dn.sido === "세종" ? "세종시" : sggOf(dn),
    상차일: rec.상차일 || "", 상차시간: rec.상차시간 || "", 하차일: rec.하차일 || "", 하차시간: rec.하차시간 || "",
    화물내용: rec.화물내용 || "", 차량톤수: rec.차량톤수 || "", 차량종류: rec.차량종류 || "", 상차방법: rec.상차방법 || "", 하차방법: rec.하차방법 || "",
    운임: fare, 수수료: fee, 지급방식: pay, 긴급: !!rec.긴급, 혼적: !!rec.혼적, 운행유형: rec.운행유형 === "왕복" ? "왕복" : "편도", 공개메모: "",
  };
}

// 결과를 기다려 { ok, hubOrderId } 또는 { ok: false, reason }을 돌려준다(최대 20초)
export async function shareToHub(db, { rec, savedIds = [], uid, profile = {} }) {
  const ids = (savedIds || []).flat(3).filter((x) => typeof x === "string" && x);
  if (!ids[0]) return { ok: false, reason: "저장된 오더가 없어요" };
  const ref = await addDoc(collection(db, "hubPostRequests"), {
    uid, companyName: rec.companyName || profile.companyName || "", lwOrderId: ids[0], order: hubOrderFromRec(rec), status: "requested", createdAt: serverTimestamp(),
  });
  return new Promise((resolve) => {
    let off = () => {};
    const t = setTimeout(() => { off(); resolve({ ok: true, pending: true, requestId: ref.id }); }, 20000);
    off = onSnapshot(doc(db, "hubPostRequests", ref.id), (s) => {
      const d = s.data();
      if (!d || d.status === "requested") return;
      clearTimeout(t); off();
      resolve(d.status === "ok" ? { ok: true, hubOrderId: d.hubOrderId, requestId: ref.id } : { ok: false, reason: d.reason || "허브에 올리지 못했어요", requestId: ref.id });
    }, () => {});
  });
}
