// ===================== firebaseUpload.js — START =====================
import { storage, db } from "./firebase";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import {
  collection,
  addDoc,
  serverTimestamp,
  deleteDoc,
  doc,
} from "firebase/firestore";

/**
 * ✅ 단일 파일 업로드 (10MB 제한)
 * @param {string} dispatchId - 배차 ID (_id)
 * @param {File} file - 업로드할 파일 객체
 * @returns {Promise<string>} - 업로드 후 다운로드 URL
 */
export async function uploadAttachment(dispatchId, file) {
  if (!dispatchId) throw new Error("dispatchId 없음");
  if (!file) throw new Error("file 없음");

  if (file.size > 10 * 1024 * 1024) {
    throw new Error("파일 크기 초과 (최대 10MB 가능)");
  }

  const path = `dispatch/${dispatchId}/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, path);

  const task = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      null,
      (err) => reject(err),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);

        await addDoc(collection(db, "dispatch", dispatchId, "attachments"), {
          url,
          createdAt: serverTimestamp(),
        });

        resolve(url);
      }
    );
  });
}

/**
 * ✅ 파일 삭제 (Storage + Firestore 동시 삭제)
 */
export async function removeAttachment(dispatchId, attachId, fileUrl) {
  try {
    if (fileUrl) {
      const fileRef = ref(storage, fileUrl);
      await deleteObject(fileRef); // storage 삭제
    }
  } catch (e) {
    console.warn("⚠ Storage 파일 삭제 실패 (이미 없음 가능)", e);
  }

  await deleteDoc(doc(db, "dispatch", dispatchId, "attachments", attachId));
}
// ===================== firebaseUpload.js — END =====================
