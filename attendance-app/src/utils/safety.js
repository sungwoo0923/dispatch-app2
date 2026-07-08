import { collection, query, where, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";

// 안전교육자료(지침/영상) 업로드 — 텍스트 지침은 Firestore에 내용만 저장하면
// 되지만, 영상 파일은 Storage에 올려야 한다.
export async function uploadSafetyMaterialFile({ companyId, materialId, file }) {
  const path = `companies/${companyId}/safety-materials/${materialId}/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export const SAFETY_MANAGER_ROLES = ["총괄책임자", "안전관리자", "담당반장", "관리감독자"];

// When a site has multiple designated managers, the one whose stamp appears
// on attendance records is picked by role priority (site safety officer
// outranks a rotating team lead) with an assignment-order tiebreak.
const ROLE_PRIORITY = ["안전관리자", "총괄책임자", "관리감독자", "담당반장"];

export async function getPrimarySafetyManager(companyId, siteId) {
  if (!companyId || !siteId) return null;
  const snap = await getDocs(
    query(collection(db, "safetyManagers"), where("companyId", "==", companyId), where("siteId", "==", siteId))
  );
  const managers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (managers.length === 0) return null;
  managers.sort((a, b) => ROLE_PRIORITY.indexOf(a.role) - ROLE_PRIORITY.indexOf(b.role));
  return managers[0];
}

// Stamps a worker's own safety-education signature onto today's attendance
// record and auto-attaches the site's designated safety manager's
// pre-registered signature alongside it.
export async function signSafetyAttendance({ attendanceDocId, companyId, siteId, signatureDataUrl }) {
  const manager = await getPrimarySafetyManager(companyId, siteId);
  let supervisorSignature = null;
  let supervisorName = "";
  if (manager) {
    const sigSnap = await getDoc(doc(db, "adminSignatures", manager.adminUid));
    if (sigSnap.exists()) {
      supervisorSignature = sigSnap.data().signatureDataUrl || null;
      supervisorName = manager.adminName || sigSnap.data().name || "";
    }
  }

  await updateDoc(doc(db, "attendance", attendanceDocId), {
    safetySignature: signatureDataUrl,
    safetySignedAt: new Date().toISOString(),
    supervisorSignature,
    supervisorName,
  });
}
