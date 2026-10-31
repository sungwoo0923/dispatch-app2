// ======================= src/userNames.js =======================
// 👤 사람 이름 찾기(2026-10-31) — 전자결재·인수인계·공지에 기안자/작성자가 계정 아이디(이메일 앞부분)로
//  보이던 문제. 직원 목록(회사로 걸러진 목록)에 본인이 없거나(최고관리자가 다른 운송사로 로그인)
//  이름 칸이 비어 있으면 이메일 앞부분으로 대신 적혔다 → 본인 문서를 직접 읽어 실제 이름을 쓴다.
import React from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

export const personName = (u) => String(u?.name || u?.이름 || u?.담당자명 || u?.displayName || "").trim();

// 내 사용자 문서(실시간)
export function useMyProfile(uid) {
  const [p, setP] = React.useState(null);
  React.useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(doc(db, "users", uid), (s) => setP(s.exists() ? s.data() : {}), () => setP({}));
  }, [uid]);
  return p;
}

// 여러 사람의 이름(한 번 읽은 이름은 기억)
const cache = new Map();
export function useUserNames(uids) {
  const key = [...new Set((uids || []).filter(Boolean))].sort().join("|");
  const [ver, bump] = React.useState(0);
  React.useEffect(() => {
    const need = key ? key.split("|").filter((u) => !cache.has(u)) : [];
    if (!need.length) return undefined;
    let alive = true;
    need.forEach((u) => cache.set(u, null));
    Promise.all(need.map((u) => getDoc(doc(db, "users", u)).then((s) => cache.set(u, s.exists() ? personName(s.data()) || null : null)).catch(() => {})))
      .then(() => { if (alive) bump((n) => n + 1); });
    return () => { alive = false; };
  }, [key]);
  return React.useCallback((uid) => (uid && cache.get(uid)) || "", [key, ver]); // eslint-disable-line react-hooks/exhaustive-deps
}
