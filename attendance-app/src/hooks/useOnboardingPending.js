import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

// Home.jsx(체크 탭)의 미완료 근로계약서/안전교육 카운트를 그대로 읽기만
// 하는 버전 — EmployeeLayout(모든 탭에서 항상 마운트)에서 "완료해야 할
// 항목이 있습니다" 팝업을 띄우는 데 쓴다. Home.jsx는 계약서 자동발송 같은
// 쓰기 부수효과도 갖고 있어 그 로직까지 여기로 옮기면 중복 실행될 수
// 있으므로, 이 훅은 순수 조회만 한다.
export function useOnboardingPending(user, companyId) {
  const [pendingContracts, setPendingContracts] = useState(0);
  const [pendingSafetyCount, setPendingSafetyCount] = useState(0);
  // 초기값 0은 "미완료 0건(=완료)"과 "아직 안 불러옴"을 구분하지 못해,
  // 계약서를 안 봤는데도 최초 렌더에 잠깐 "완료"로 표시됐다가 실제 데이터가
  // 도착하면 "서명하세요"로 뒤집히는 깜빡임 버그가 있었다 — 두 조회가 실제로
  // 완료됐는지를 별도 플래그로 추적해, 호출부가 로딩 중에는 "완료" 판정을
  // 내리지 않도록 한다.
  const [contractsLoaded, setContractsLoaded] = useState(false);
  const [safetyLoaded, setSafetyLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    setContractsLoaded(false);
    // 예전에는 getDocs로 한 번만 조회해서, EmployeeLayout이 계속 마운트된
    // 상태로 근로자가 계약서에 서명해도 이 훅의 pendingContracts 값이 갱신되지
    // 않았다 — 그래서 서명을 마쳤는데도 "근로계약서 서명하기" 안내 팝업이
    // 계속 떴고, 앱을 완전히 나갔다 재실행해 컴포넌트가 다시 마운트돼야만
    // (useEffect가 재실행돼야만) 반영됐다. onSnapshot으로 바꿔 서명 즉시
    // 실시간으로 갱신되게 한다.
    const unsub = onSnapshot(query(collection(db, "contracts"), where("uid", "==", user.uid)), (snap) => {
      // status는 회사 쪽 서명(도장)까지 합쳐진 상태라, 회사가 아직 도장을
      // 안 찍었으면(companySignatureDataUrl 없음) 직원이 이미 서명해도
      // "sent"에 머무른다 — 그 경우까지 미완료로 세면 직원은 자기 몫을
      // 다 했는데도 "완료해야 할 항목" 팝업이 계속 뜬다. 직원 입장의
      // 완료 여부는 본인 서명(employeeSignatureDataUrl) 존재 여부로만
      // 판단한다.
      setPendingContracts(snap.docs.filter((d) => !d.data().employeeSignatureDataUrl).length);
      setContractsLoaded(true);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!companyId || !user) return;
    let materialIds = null;
    let completedIds = null;
    const recompute = () => {
      if (materialIds == null || completedIds == null) return;
      setPendingSafetyCount(materialIds.filter((id) => !completedIds.has(id)).length);
      setSafetyLoaded(true);
    };
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

  return { pendingContracts, pendingSafetyCount, loading: !contractsLoaded || !safetyLoaded };
}
