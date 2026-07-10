import { doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { toDateKey } from "./dateUtils";

// 근로자 소프트삭제(users.deleted=true)와 짝을 이루는 chat_profiles 문서도
// 같이 지워둔다 — 안 그러면 삭제된 직원이 메신저 친구목록/문의 담당자
// 선택창 등 chat_profiles를 조회하는 화면에 계속 남아있게 된다. users
// 갱신이 핵심 동작이므로 그건 예외를 던지게 두고, chat_profiles 쪽은
// (아직 로그인 전이라 문서가 없는 등) 실패해도 삭제 자체를 막지 않도록
// best-effort로 처리한다.
export async function softDeleteEmployee(uid) {
  await updateDoc(doc(db, "users", uid), { deleted: true, deletedAt: toDateKey() });
  setDoc(doc(db, "chat_profiles", uid), { deleted: true }, { merge: true }).catch(() => {});
}

export async function softDeleteEmployees(uids) {
  for (const uid of uids) {
    await updateDoc(doc(db, "users", uid), { deleted: true, deletedAt: toDateKey() });
    setDoc(doc(db, "chat_profiles", uid), { deleted: true }, { merge: true }).catch(() => {});
  }
}

// 관리자가 근로자등록 화면에서 이름/직책/연락처를 바꿔도 chat_profiles는
// 로그인 시점에 한 번만 생성되고 그 뒤로는 갱신되지 않아, 메신저 친구목록에
// 옛 이름이 계속 남는다. users 문서를 고치는 모든 지점에서 이 함수도 같이
// 불러 chat_profiles를 최신 상태로 맞춘다 — 아직 한 번도 로그인 안 해 문서가
// 없는 사용자도 있을 수 있으니 best-effort(merge)로 처리한다.
export function syncChatProfileFields(uid, fields) {
  const patch = {};
  if (fields.name !== undefined) patch.name = fields.name;
  if (fields.position !== undefined) patch.position = fields.position;
  if (fields.phone !== undefined) patch.phone = fields.phone;
  if (Object.keys(patch).length === 0) return;
  setDoc(doc(db, "chat_profiles", uid), patch, { merge: true }).catch(() => {});
}
