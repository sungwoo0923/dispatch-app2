// src/utils/storageUpload.js
import { db, storage } from "../firebase";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  increment,
} from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";

// 날짜 YYYYMMDD
const todayKey = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

export async function uploadProofImage(dispatchId, file, carNo) {
  const fileId = uuidv4();
  const ext = file.name.split(".").pop();
  const fileName = `${todayKey()}_${carNo}_${fileId}.${ext}`;

  // Storage 경로
  const storageRef = ref(storage, `proof/${dispatchId}/${fileName}`);

  // 업로드
  await uploadBytes(storageRef, file);

  // URL 획득
  const url = await getDownloadURL(storageRef);

  // Firestore 저장 (attachments 서브컬렉션)
  await addDoc(collection(db, "dispatch", dispatchId, "attachments"), {
    url,
    name: fileName,
    size: file.size,
    createdAt: serverTimestamp(),
    uploadedBy: carNo,
  });

  // 🔥🔥 첨부 개수 +1 (중요!)
  await updateDoc(doc(db, "dispatch", dispatchId), {
    attachmentsCount: increment(1),
  });

  return true;
}
