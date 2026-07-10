import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { collection, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { storage, db } from "../firebase";

export const DOCUMENT_TYPE_OPTIONS = ["신분증 사본", "통장 사본", "자격증", "재직증명서", "기타"];

export async function uploadEmployeeDocument({ companyId, uid, employeeName, docType, file, uploadedBy = "employee" }) {
  const path = `companies/${companyId}/employees/${uid}/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  await addDoc(collection(db, "documents"), {
    companyId,
    uid,
    employeeName,
    docType,
    fileName: file.name,
    url,
    path,
    uploadedBy,
    uploadedAt: serverTimestamp(),
  });
}

// 근로자등록 화면(첨부서류 탭)은 아직 계정(uid)이 없는 상태에서 파일을 첨부하므로,
// 그 시점에 발급된 가입코드(pendingCode)로 보관한다. 관리자는 근로자등록/근로자현황
// 화면에서 companyId 기준으로 계속 조회할 수 있다 (uid 발급 전이라 근로자 본인 화면에는
// 아직 노출되지 않으며, 이 마이그레이션은 후속 작업으로 남겨둔다).
export async function uploadPendingEmployeeDocument({ companyId, pendingCode, employeeName, docType, file }) {
  const path = `companies/${companyId}/pending/${pendingCode}/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  await addDoc(collection(db, "documents"), {
    companyId,
    pendingCode,
    employeeName,
    docType,
    fileName: file.name,
    url,
    path,
    uploadedAt: serverTimestamp(),
  });
}

export async function deleteEmployeeDocument(document) {
  await deleteObject(ref(storage, document.path)).catch(() => {});
  await deleteDoc(doc(db, "documents", document.id));
}

// 근로자등록 사진: 문서함(documents 컬렉션)과 별개로, 프로필 사진 URL 하나만 필요하므로
// 업로드 후 다운로드 URL을 그대로 반환한다 (호출부가 pendingEmployees 문서의 photoUrl
// 필드에 저장). uid가 아직 없는 등록 단계이므로 pendingCode 기준 경로를 쓴다.
export async function uploadPendingEmployeePhoto({ companyId, pendingCode, file }) {
  const path = `companies/${companyId}/pending/${pendingCode}/photo_${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

// Same as above but for an existing employee (already has a uid), used when
// editing a previously-registered worker's 근로자등록 profile.
export async function uploadEmployeePhoto({ companyId, uid, file }) {
  const path = `companies/${companyId}/employees/${uid}/photo_${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

// 사업자(businessEntities)의 인감/서명 도장 이미지. 전자문서(계약서 등)의 갑(회사)
// 서명란에 그대로 삽입해 쓴다.
export async function uploadBusinessEntityStamp({ companyId, entityId, file }) {
  const path = `companies/${companyId}/entities/${entityId}/stamp_${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}
