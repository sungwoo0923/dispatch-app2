import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { collection, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { storage, db } from "../firebase";

export const DOCUMENT_TYPE_OPTIONS = ["신분증 사본", "통장 사본", "자격증", "재직증명서", "기타"];

export async function uploadEmployeeDocument({ companyId, uid, employeeName, docType, file }) {
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
