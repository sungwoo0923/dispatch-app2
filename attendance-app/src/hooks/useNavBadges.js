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
    { collection: "resignationRequests", filter: (d) => !d.deleted && ["submitted", "manager_signed", "ceo_pending"].includes(d.status) },
  ],
  "/leaves": [{ collection: "leaves", filter: (d) => d.status === "pending" }],
  "/employees/inquiries": [
    // 문의함(Inquiries.jsx)은 "받는사람"으로 지정된 관리자만이 아니라 회사의
    // 모든 관리자가 전체 문의를 보고 답변할 수 있게 되어 있다 — 배지도 그와
    // 일관되게, toUid로 좁히지 않고 회사 전체의 미답변 건수를 잡는다.
    { collection: "inquiries", filter: (d) => d.status === "답변대기" },
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
    const unsub = onSnapshot(doc(db, "adminReadState", adminUid), (snap) => {
      const data = snap.data() || {};
      // markSeen()으로 방금 이 클라이언트가 직접 쓴 필드는 서버 확인 전
      // 잠깐 로컬 캐시에서 serverTimestamp()가 null로 되돌아오는 시점이
      // 있다(펜딩 쓰기 echo). 이때 그대로 덮어쓰면 lastSeen이 순간적으로
      // 0으로 리셋되어 배지가 "전체 항목 수"로 확 늘었다가 서버 확인 직후
      // 다시 정상치로 돌아오는 깜빡임이 생긴다 — 그게 "나타났다가
      // 사라진다"는 증상의 원인이었다. null 값은 무시하고 이전 값을
      // 유지해 이 깜빡임을 없앤다.
      setReadState((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(data)) {
          if (v != null) next[k] = v;
        }
        return next;
      });
    });
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
