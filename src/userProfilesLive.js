// ======================= src/userProfilesLive.js =======================
// 🔒 2026-11-07 보안 점검 — 인사 프로필(userProfiles: 입사일·연차 조정·명함·증명서 발급 기록)을 회사별로 읽는다.
//  예전엔 화면마다 userProfiles 전체(모든 운송사 직원)를 구독하고 화면에서 골랐다 → 다른 회사 직원 정보가 브라우저로 내려왔다.
//  지금은 서버 규칙이 "같은 회사 직원 문서 한 건씩"만 허용하므로, 이미 받은 우리 회사 직원 목록(uid)으로 한 건씩 구독한다.
//  · uid 목록이 바뀌면 새로 생긴 사람만 더 구독하고, 빠진 사람은 끊는다(같은 사람은 다시 받지 않음).
//  · 최고관리자도 같은 방식(지금 보고 있는 회사 직원만).
import React from "react";
import { db } from "./firebase";
import { doc, onSnapshot } from "firebase/firestore";

// uids: 문자열 배열 → { [uid]: 프로필 데이터 } (문서가 없으면 빠진다)
export function useUserProfiles(uids) {
  const key = React.useMemo(() => [...new Set((uids || []).filter((u) => typeof u === "string" && u))].sort().join("|"), [uids]);
  const [map, setMap] = React.useState({});
  const subsRef = React.useRef(new Map());
  React.useEffect(() => {
    const want = new Set(key ? key.split("|") : []);
    const subs = subsRef.current;
    for (const [uid, un] of subs) {
      if (!want.has(uid)) {
        try { un(); } catch { /* 무시 */ }
        subs.delete(uid);
        setMap((m) => { if (!(uid in m)) return m; const n = { ...m }; delete n[uid]; return n; });
      }
    }
    want.forEach((uid) => {
      if (subs.has(uid)) return;
      const un = onSnapshot(doc(db, "userProfiles", uid), (s) => {
        setMap((m) => {
          if (!s.exists()) { if (!(uid in m)) return m; const n = { ...m }; delete n[uid]; return n; }
          return { ...m, [uid]: s.data() };
        });
      }, () => { /* 권한 없음(다른 회사 등) — 빼고 보여준다 */ });
      subs.set(uid, un);
    });
  }, [key]);
  React.useEffect(() => () => { subsRef.current.forEach((un) => { try { un(); } catch { /* 무시 */ } }); subsRef.current.clear(); }, []);
  return map;
}
