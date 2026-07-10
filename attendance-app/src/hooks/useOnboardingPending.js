import { useEffect, useState } from "react";
import { collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

// Home.jsx(체크 탭)의 미완료 근로계약서/안전교육 카운트를 그대로 읽기만
// 하는 버전 — EmployeeLayout(모든 탭에서 항상 마운트)에서 "완료해야 할
// 항목이 있습니다" 팝업을 띄우는 데 쓴다. Home.jsx는 계약서 자동발송 같은
// 쓰기 부수효과도 갖고 있어 그 로직까지 여기로 옮기면 중복 실행될 수
// 있으므로, 이 훅은 순수 조회만 한다.
export function useOnboardingPending(user, companyId) {
  const [pendingContracts, setPendingContracts] = useState(0);
  const [pendingSafetyCount, setPendingSafetyCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "contracts"), where("uid", "==", user.uid))).then((snap) => {
      setPendingContracts(snap.docs.filter((d) => d.data().status !== "signed").length);
    });
  }, [user]);

  useEffect(() => {
    if (!companyId || !user) return;
    let materialIds = [];
    let completedIds = new Set();
    const recompute = () => setPendingSafetyCount(materialIds.filter((id) => !completedIds.has(id)).length);
    const unsub1 = onSnapshot(
      query(collection(db, "safetyMaterials"), where("companyId", "==", companyId), where("active", "==", true)),
      (snap) => {
        materialIds = snap.docs.map((d) => d.id);
        recompute();
      }
    );
    const unsub2 = onSnapshot(query(collection(db, "safetyCompletions"), where("uid", "==", user.uid)), (snap) => {
      completedIds = new Set(snap.docs.map((d) => d.data().materialId));
      recompute();
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, [companyId, user]);

  return { pendingContracts, pendingSafetyCount };
}
