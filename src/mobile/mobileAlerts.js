// src/mobile/mobileAlerts.js — 모바일 메뉴 숫자 · 앱 안 알림 배너(2026-10-31)
//  전자결재(내 결재 차례) · 인수인계(내 미확인) · 가입 신청(관리자 이상) · 공지사항(안 읽은 글)
//  숫자는 메뉴 옆에 보이고, 앱을 켜 둔 동안 새로 생기면 위쪽에 잠깐 알림 배너를 띄운다(onAlert).
//  휴대폰 푸시는 서버(functions › notifyApproval·notifyNotice·notifySignup)가 보낸다.
import { subscribeUsersLive } from "../usersLive"; // ⭐ 2026-11-02 속도 — 직원 명부 구독 공유
import React from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "../firebase";
import { isNoticeUnread, noticePublished, useMinuteTick, canSeeTargetedNotice } from "../notifyCore";

const ADMIN_ROLES = ["admin", "totalMaster", "superadmin", "allMgr"];
const myTurn = (d, uid) => (d.status === "pending" && d.line?.[d.step]?.uid === uid)
  || (d.status === "approved" && d.cancel?.status === "pending" && d.cancel.line?.[d.cancel.step]?.uid === uid);
const handoverTo = (h) => (Array.isArray(h?.receiverUids) && h.receiverUids.length ? h.receiverUids : h?.receiverUid ? [h.receiverUid] : []);
// ⭐ 2026-11-03 지정 공지 비공개 — 지정된 사람(팀원)·작성자·최고관리자만(notifyCore.canSeeTargetedNotice — PC와 같은 기준)
const canSeeNotice = (n, me) => canSeeTargetedNotice(n, me);

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
      ids.forEach((id) => { if (!seen.ids.has(id)) { seen.ids.add(id); const msg = make(id); if (msg) { if (typeof msg === "object") alertRef.current?.(msg.text, key, msg.id); else alertRef.current?.(msg, key, id); } } });
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
      w([...byKey.keys()], (k) => { const d = byKey.get(k); return `✎ 결재 요청 · ${d.drafter?.name || ""} — ${d.title || d.formLabel || "결재 문서"}`; });
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
      w([...byId.keys()], (id) => `↻ 인수인계 · ${byId.get(id).author || ""}님이 업무를 넘겼습니다`);
    }, () => set("handover", 0));
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🙋 가입 신청 — 관리자 이상(조회전용 포함 관리자 메뉴를 보는 사람)
  const isAdmin = ADMIN_ROLES.includes(role) || role === "viewer" || role === "test" || role === "hrManager" || role === "hrAcct" || role === "allMgr"; // 경리·인사도 직원·기사 승인
  React.useEffect(() => {
    if (!uid || !isAdmin || !company) return undefined;
    const w = watch("signup");
    // ⭐ 2026-11-02 속도 — 앱 공용 users 구독(usersLive)을 같이 쓴다(받는 데이터 동일)
    return subscribeUsersLive((_l, raw) => {
      const p = raw.map(({ id, data }) => ({ id, ...data }))
        .filter((u) => u.approved === false && u.employmentStatus !== "퇴사" && (u.companyName || DEFAULT_COMPANY) === company && !["shipper", "cafeUser", "totalMaster"].includes(u.role));
      set("signupDriver", p.filter((u) => u.role === "driver").length);
      set("signupStaff", p.filter((u) => u.role !== "driver").length);
      const byId = new Map(p.map((u) => [u.id, u]));
      w([...byId.keys()], (id) => { const u = byId.get(id); return u.role === "driver" ? `▸ 기사 가입 신청 · ${u.name || ""} ${u.carNo || ""}` : `◆ 직원 가입 신청 · ${u.name || u.email || ""}`; });
    });
  }, [uid, isAdmin, company]); // eslint-disable-line react-hooks/exhaustive-deps

  // 📢 공지사항 — 볼 수 있는 글 중 안 읽은 것
  // ⭐ 2026-11-03 알림 통합 — PC·모바일 같은 기준(notifyCore.isNoticeUnread): 게시된(예약 시각이 지난) 최근 30일 글 중 readBy에 내가 없는 것
  //  예약 공지가 게시 시각을 넘기면 1분 안에 숫자·위쪽 알림줄에 나타난다
  const [noticeRaw, setNoticeRaw] = React.useState(null);
  const noticeWatch = React.useRef(null);
  const now = useMinuteTick();
  React.useEffect(() => {
    if (!uid) return undefined;
    noticeWatch.current = watch("notice");
    return onSnapshot(collection(db, "notices"), (s) => setNoticeRaw(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setNoticeRaw([]));
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!uid || !noticeRaw) { set("notice", 0); return; }
    const me = { uid, role, team };
    const vis = noticeRaw.filter((n) => n.authorUid !== uid && canSeeNotice(n, me) && noticePublished(n, now));
    set("notice", vis.filter((n) => isNoticeUnread(n, uid, now)).length);
    const byId = new Map(vis.map((n) => [n.id, n]));
    noticeWatch.current?.([...byId.keys()], (id) => { const n = byId.get(id); return (n.readBy || []).includes(uid) ? null : { text: `◆ ${n.category || "공지사항"} · ${n.title || ""}`, id }; });
  }, [noticeRaw, now, uid, role, team]); // eslint-disable-line react-hooks/exhaustive-deps

  return counts;
}
