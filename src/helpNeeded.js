// ======================= src/helpNeeded.js =======================
// 🆘 2026-11-09 "도움 필요" — 계산은 functions/helpNeededCore.mjs(서버와 같은 기준), 여기선 [확인함] 저장만
//  저장: siteConfig/helpNeededAck = { acks: { 회사명: 누른 시각(ms) } } (siteConfig = 최고관리자만 읽기/쓰기)
import React from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
export { helpNeededOf, helpNeededList, HELP_WINDOW_DAYS } from "../functions/helpNeededCore.mjs";

export function useHelpAcks() {
  const [acks, setAcks] = React.useState({});
  React.useEffect(() => onSnapshot(doc(db, "siteConfig", "helpNeededAck"), (s) => setAcks((s.exists() && s.data()?.acks) || {}), () => setAcks({})), []);
  return acks;
}
export const ackHelpNeeded = (name) => setDoc(doc(db, "siteConfig", "helpNeededAck"), { acks: { [name]: Date.now() } }, { merge: true });
