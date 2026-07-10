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
      // status는 회사 쪽 서명(도장)까지 합쳐진 상태라, 회사가 아직 도장을
      // 안 찍었으면(companySignatureDataUrl 없음) 직원이 이미 서명해도
      // "sent"에 머무른다 — 그 경우까지 미완료로 세면 직원은 자기 몫을
      // 다 했는데도 "완료해야 할 항목" 팝업이 계속 뜬다. 직원 입장의
      // 완료 여부는 본인 서명(employeeSignatureDataUrl) 존재 여부로만
      // 판단한다.
      setPendingContracts(snap.docs.filter((d) => !d.data().employeeSignatureDataUrl).length);
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
