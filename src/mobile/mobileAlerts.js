// src/mobile/mobileAlerts.js — 모바일 메뉴 숫자 · 앱 안 알림 배너(2026-10-31)
//  전자결재(내 결재 차례) · 인수인계(내 미확인) · 가입 신청(관리자 이상) · 공지사항(안 읽은 글)
//  숫자는 메뉴 옆에 보이고, 앱을 켜 둔 동안 새로 생기면 위쪽에 잠깐 알림 배너를 띄운다(onAlert).
//  휴대폰 푸시는 서버(functions › notifyApproval·notifyNotice·notifySignup)가 보낸다.
import React from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "../firebase";

const ADMIN_ROLES = ["admin", "totalMaster", "superadmin"];
const myTurn = (d, uid) => (d.status === "pending" && d.line?.[d.step]?.uid === uid)
  || (d.status === "approved" && d.cancel?.status === "pending" && d.cancel.line?.[d.cancel.step]?.uid === uid);
const handoverTo = (h) => (Array.isArray(h?.receiverUids) && h.receiverUids.length ? h.receiverUids : h?.receiverUid ? [h.receiverUid] : []);
const canSeeNotice = (n, me) => {
  const teams = Array.isArray(n.teams) ? n.teams : [];
  if (!teams.length) return true;
  if (n.authorUid && n.authorUid === me.uid) return true;
  if (ADMIN_ROLES.includes(me.role)) return true;
  return teams.includes(String(me.team || "").trim());
};

export function useMobileAlerts({ uid, role, team = "", company = "", onAlert }) {
  const [counts, setCounts] = React.useState({ approval: 0, handover: 0, signupStaff: 0, signupDriver: 0, notice: 0 });
  const alertRef = React.useRef(onAlert);
  alertRef.current = onAlert;
  const set = (k, v) => setCounts((c) => (c[k] === v ? c : { ...c, [k]: v }));
  // 처음 받은 목록은 기준으로만(이미 있던 것으로 알림을 띄우지 않는다)
  const watch = (key) => {
    const seen = { ready: false, ids: new Set() };
    return (ids, make) => {
      if (!seen.ready) { ids.forEach((id) => seen.ids.add(id)); seen.ready = true; return; }
      ids.forEach((id) => { if (!seen.ids.has(id)) { seen.ids.add(id); const msg = make(id); if (msg) alertRef.current?.(msg, key); } });
    };
  };

  // 📝 전자결재 — 내 결재 차례
  React.useEffect(() => {
    if (!uid) return undefined;
    const w = watch("approval");
    return onSnapshot(query(collection(db, "approvals"), where("participants", "array-contains", uid)), (s) => {
      const todo = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => myTurn(d, uid) && !(d.hiddenBy || []).includes(uid));
      set("approval", todo.length);
      const byKey = new Map(todo.map((d) => [`${d.id}_${d.step}_${d.cancel?.step ?? ""}`, d]));
      w([...byKey.keys()], (k) => { const d = byKey.get(k); return `📝 결재 요청 · ${d.drafter?.name || ""} — ${d.title || d.formLabel || "결재 문서"}`; });
    }, () => set("approval", 0));
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🔁 인수인계 — 내가 받은 것 중 안 본 것
  React.useEffect(() => {
    if (!uid) return undefined;
    const w = watch("handover");
    return onSnapshot(collection(db, "handovers"), (s) => {
      const un = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((h) => handoverTo(h).includes(uid) && !(h.readBy || []).includes(uid));
      set("handover", un.length);
      const byId = new Map(un.map((h) => [h.id, h]));
      w([...byId.keys()], (id) => `🔁 인수인계 · ${byId.get(id).author || ""}님이 업무를 넘겼습니다`);
    }, () => set("handover", 0));
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🙋 가입 신청 — 관리자 이상(조회전용 포함 관리자 메뉴를 보는 사람)
  const isAdmin = ADMIN_ROLES.includes(role) || role === "viewer" || role === "test" || role === "hrManager"; // 경리·인사도 직원·기사 승인
  React.useEffect(() => {
    if (!uid || !isAdmin || !company) return undefined;
    const w = watch("signup");
    return onSnapshot(collection(db, "users"), (s) => {
      const p = s.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => u.approved === false && u.employmentStatus !== "퇴사" && (u.companyName || DEFAULT_COMPANY) === company && !["shipper", "cafeUser", "totalMaster"].includes(u.role));
      set("signupDriver", p.filter((u) => u.role === "driver").length);
      set("signupStaff", p.filter((u) => u.role !== "driver").length);
      const byId = new Map(p.map((u) => [u.id, u]));
      w([...byId.keys()], (id) => { const u = byId.get(id); return u.role === "driver" ? `🚚 기사 가입 신청 · ${u.name || ""} ${u.carNo || ""}` : `🙋 직원 가입 신청 · ${u.name || u.email || ""}`; });
    }, () => { set("signupDriver", 0); set("signupStaff", 0); });
  }, [uid, isAdmin, company]); // eslint-disable-line react-hooks/exhaustive-deps

  // 📢 공지사항 — 볼 수 있는 글 중 안 읽은 것
  React.useEffect(() => {
    if (!uid) return undefined;
    const w = watch("notice");
    const me = { uid, role, team };
    return onSnapshot(collection(db, "notices"), (s) => {
      const vis = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((n) => n.authorUid !== uid && canSeeNotice(n, me));
      const un = vis.filter((n) => !(n.readBy || []).includes(uid));
      set("notice", un.length);
      const byId = new Map(vis.map((n) => [n.id, n]));
      w([...byId.keys()], (id) => { const n = byId.get(id); return `📢 ${n.category || "공지사항"} · ${n.title || ""}`; });
    }, () => set("notice", 0));
  }, [uid, role, team]); // eslint-disable-line react-hooks/exhaustive-deps

  return counts;
}
