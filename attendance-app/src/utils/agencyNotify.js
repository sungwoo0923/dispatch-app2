import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

// 도급사 쪽 액션(요청장 등록/수정/삭제, 배정 변경·오더삭제 요청)이 있을 때마다
// 인력사무소 쪽 알림벨(AgencyNotificationBell)에 이력을 남긴다.
export async function notifyAgency({ agencyId, companyId, type, title, message, requestId }) {
  if (!agencyId) return;
  await addDoc(collection(db, "agencyNotifications"), {
    agencyId,
    companyId: companyId || null,
    type,
    title,
    message: message || "",
    requestId: requestId || null,
    read: false,
    createdAt: serverTimestamp(),
  });
}
