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

export async function deleteEmployeeDocument(document) {
  await deleteObject(ref(storage, document.path)).catch(() => {});
  await deleteDoc(doc(db, "documents", document.id));
}
