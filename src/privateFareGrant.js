// ======================= src/privateFareGrant.js =======================
// 🔐 2026-11-18 비공개 운임 — 이 계정이 지정됐는지(메뉴를 보일지)만 아는 작은 도우미(화면 본체 PrivateFareVault 는 열 때만 받는다)
import React from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

export const PF_MENU = "비공개운임";
export function usePrivateFareGrant(uid) {
  const [st, setSt] = React.useState({ loading: !!uid, on: false, grant: null });
  React.useEffect(() => {
    if (!uid) { setSt({ loading: false, on: false, grant: null }); return undefined; }
    return onSnapshot(doc(db, "privateFareGrants", uid), (s) => { const g = s.exists() ? s.data() : null; setSt({ loading: false, on: g?.on === true, grant: g }); }, () => setSt({ loading: false, on: false, grant: null }));
  }, [uid]);
  return st;
}
