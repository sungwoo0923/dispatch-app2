import { collection, doc, getDocs, query, where, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

// 여러 화면(신규가입 승인대기/휴가신청/사직서제출/문의등록/안전교육이수)에서
// 반복되는 "회사의 모든 관리자에게 알림 발행" 로직을 한 곳에 모은다. 이
// 함수는 항상 직원(비관리자) 세션에서 호출되는데, users 컬렉션의 list
// 조회는 보안규칙상 관리자만 허용되어 있어 users에서 관리자 목록을
// 가져오려 하면 permission-denied로 조용히 실패한다(이전에 이미
// useGeofenceCheckIn.js의 지각알림이 바로 이 이유로 항상 조용히 실패하고
// 있었다). 대신 회사 구성원 누구나 읽을 수 있는 chat_profiles
// 컬렉션(company/role 필드 보유, 로그인 시 자동 생성)에서 role==admin인
// 사람을 찾는다.
export async function notifyAdmins(companyId, { title, message = "", link = "" }) {
  if (!companyId) return;
  const snap = await getDocs(query(collection(db, "chat_profiles"), where("company", "==", companyId), where("role", "==", "admin")));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => {
    batch.set(doc(collection(db, "notifications")), {
      companyId, uid: d.id, title, message, link, read: false, createdAt: serverTimestamp(),
    });
  });
  await batch.commit();
}
