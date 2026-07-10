import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

const seconds = (ts) => ts?.seconds ?? 0;

// 모바일 내정보 > 서류함/안전교육/안전교육자료 메뉴에 "새로 생긴 것"을
// 숫자로 표시한다. 서류함/안전교육자료는 마지막으로 그 메뉴를 열어본
// 시각(users/{uid}.subItemReadState) 이후 새로 생긴 항목 수, 안전교육은
// 완료(서명)하지 않으면 자연스럽게 줄지 않는 "이수필요" 건수를 그대로
// 쓴다(완료 즉시 사라지는 것이 "읽으면 없어짐"과 동일한 효과).
export function useMyInfoBadges(uid, companyId) {
  const [documents, setDocuments] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [readState, setReadState] = useState({});

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(query(collection(db, "documents"), where("uid", "==", uid)), (snap) =>
      setDocuments(snap.docs.map((d) => d.data()))
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!companyId || !uid) return;
    const unsubs = [
      onSnapshot(query(collection(db, "safetyMaterials"), where("companyId", "==", companyId)), (snap) =>
        setMaterials(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "safetyCompletions"), where("uid", "==", uid)), (snap) =>
        setCompletions(snap.docs.map((d) => d.data()))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [companyId, uid]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
      const data = snap.data()?.subItemReadState || {};
      setReadState((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(data)) {
          if (v != null) next[k] = v;
        }
        return next;
      });
    });
    return () => unsub();
  }, [uid]);

  const completedIds = useMemo(() => new Set(completions.map((c) => c.materialId)), [completions]);

  const counts = useMemo(() => {
    const documentsUnread = documents.filter(
      (d) => d.uploadedBy === "admin" && seconds(d.uploadedAt) > seconds(readState.documents)
    ).length;
    const safetyPending = materials.filter((m) => m.active && !completedIds.has(m.id)).length;
    const archiveUnread = materials.filter((m) => seconds(m.createdAt) > seconds(readState.safetyArchive)).length;
    return { documents: documentsUnread, safety: safetyPending, safetyArchive: archiveUnread };
  }, [documents, materials, completedIds, readState]);

  const markSeen = (key) => {
    if (!uid || key === "safety") return; // 안전교육은 완료 여부로만 줄어든다(읽음 처리 없음)
    updateDoc(doc(db, "users", uid), { [`subItemReadState.${key}`]: new Date() }).catch(() => {});
  };

  return { counts, markSeen };
}
