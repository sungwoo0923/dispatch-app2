// ======================= src/driverDeleteNotice.js =======================
// ⭐ 2026-11-05 기사앱 "삭제된 오더" 안내 팝업 — 배차담당자가 지입 기사에게 준 오더를 삭제하면
//  driver_notifications/orderDeleted_{오더id} 문서 하나를 남긴다(오더 요약 + popup:true + popupAck:false).
//  기사앱(DriverHome)은 popupAck가 아닌 이 문서를 화면 가운데 팝업으로 보여주고 [확인]을 누르면 popupAck:true로 바꾼다.
//  - 앱이 꺼져 있을 때 지워도 다음에 앱을 열면 팝업이 뜬다(문서로 남기 때문).
//  - 서버(functions notifyDispatchDeleted)도 같은 문서 id로 merge 저장 → 알림함에 두 줄로 쌓이지 않는다.
//  - 삭제 자체를 막지 않도록 호출부는 기다리지 않는다(실패해도 무시).
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export const orderDeletedNoticeId = (orderId) => `orderDeleted_${orderId}`;

// 기사에게 보여줄 오더 요약(운임은 기사운임만 — 청구운임은 넣지 않는다)
export function orderNoticeSummary(d = {}) {
  const pick = (k) => (d?.[k] == null ? "" : String(d[k]));
  return {
    거래처명: pick("거래처명"), 상차지명: pick("상차지명"), 하차지명: pick("하차지명"),
    상차일: pick("상차일"), 상차시간: pick("상차시간"), 하차일: pick("하차일"), 하차시간: pick("하차시간"),
    화물내용: pick("화물내용"), 차량톤수: pick("차량톤수"), 기사운임: pick("기사운임"),
  };
}

export function writeOrderDeletedNotice(db, { driverId, orderId, data, companyName }) {
  if (!db || !driverId || !orderId) return Promise.resolve();
  const st = data?.기사확인상태;
  // 운송까지 끝난(완료) 오더를 정리 삭제한 건 팝업 없이 알림함에만 남긴다
  const popup = st === "대기" || st === "수락";
  return setDoc(doc(db, "driver_notifications", orderDeletedNoticeId(orderId)), {
    driverId,
    type: "canceled",
    deleted: true,
    popup,
    popupAck: false,
    orderId,
    title: "배차가 취소되었습니다",
    body: `담당자가 ${data?.거래처명 || ""} ${data?.상차지명 || "-"} → ${data?.하차지명 || "-"} 오더를 삭제했습니다.`,
    order: orderNoticeSummary(data),
    ...(companyName || data?.companyName ? { companyName: companyName || data.companyName } : {}),
    createdAt: serverTimestamp(),
    read: false,
  }, { merge: true }).catch(() => {});
}
