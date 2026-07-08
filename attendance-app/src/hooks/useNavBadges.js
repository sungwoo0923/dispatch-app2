import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

// 사이드바 배지(카톡 안읽음 숫자처럼)는 "관리자 계정별로" 마지막으로 그
// 메뉴를 확인한 시점을 adminReadState/{uid}에 저장해두고, 그 시점 이후에
// 생성된 항목 수를 badge로 보여준다. 한 관리자가 봤다고 다른 관리자
// 계정의 배지가 사라지면 안 되므로(카톡 단톡방과 동일한 개념), 읽음 상태는
// 회사 전체가 아니라 로그인한 admin의 uid 기준으로 개별 저장한다.
//
// 한 메뉴(navPath)에 여러 컬렉션을 합산해야 하는 경우가 있어(예: 근로자
// 메뉴는 신규가입 대기 + 기본정보 수정요청 둘 다 알려야 함) 값은 소스
// 배열이다.
const BADGE_SOURCES = {
  "/employees": [
    { collection: "pendingEmployees", filter: () => true },
    { collection: "infoChangeRequests", filter: (d) => d.status === "pending" },
  ],
  "/employees/contracts": [
    { collection: "resignationRequests", filter: (d) => ["submitted", "manager_signed"].includes(d.status) },
  ],
  "/leaves": [{ collection: "leaves", filter: (d) => d.status === "pending" }],
  "/employees/inquiries": [
    // 문의는 회사 전체가 아니라 "나에게" 온 것만 배지로 잡는다.
    { collection: "inquiries", filter: (d, adminUid) => d.status === "답변대기" && d.toUid === adminUid },
  ],
};

const seconds = (ts) => ts?.seconds ?? 0;

export function useNavBadges(companyId, adminUid) {
  const [items, setItems] = useState({}); // { navPath: { collectionName: docs[] } }
  const [readState, setReadState] = useState({});

  useEffect(() => {
    if (!companyId) return;
    const unsubs = [];
    for (const [navPath, sources] of Object.entries(BADGE_SOURCES)) {
      for (const { collection: col } of sources) {
        unsubs.push(
          onSnapshot(query(collection(db, col), where("companyId", "==", companyId)), (snap) =>
            setItems((prev) => ({
              ...prev,
              [navPath]: { ...(prev[navPath] || {}), [col]: snap.docs.map((d) => d.data()) },
            }))
          )
        );
      }
    }
    return () => unsubs.forEach((u) => u());
  }, [companyId]);

  useEffect(() => {
    if (!adminUid) return;
    const unsub = onSnapshot(doc(db, "adminReadState", adminUid), (snap) => setReadState(snap.data() || {}));
    return () => unsub();
  }, [adminUid]);

  const badgeCounts = useMemo(() => {
    const out = {};
    for (const [navPath, sources] of Object.entries(BADGE_SOURCES)) {
      const lastSeen = seconds(readState[navPath]);
      let count = 0;
      for (const { collection: col, filter } of sources) {
        const list = (items[navPath]?.[col] || []).filter((d) => filter(d, adminUid));
        count += list.filter((d) => seconds(d.createdAt) > lastSeen).length;
      }
      out[navPath] = count;
    }
    return out;
  }, [items, readState, adminUid]);

  const markSeen = (navPath) => {
    if (!adminUid || !BADGE_SOURCES[navPath]) return;
    setDoc(doc(db, "adminReadState", adminUid), { [navPath]: serverTimestamp() }, { merge: true });
  };

  return { badgeCounts, markSeen };
}
