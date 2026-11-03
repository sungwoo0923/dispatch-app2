// ======================= src/notifyCore.js =======================
// 🔔 2026-11-03 알림 통합 — PC·모바일 가운데 팝업(NotifyCenter) · 메뉴 숫자 · 맨 위 공지 띠가 함께 쓰는 기준
//  · 공지 예약 게시(publishAt, ms): 게시 시각 전 공지는 팝업·띠·숫자 모두 없는 것으로 본다(없으면 바로 게시된 글)
//  · 안 읽은 공지 = 내가 쓴 글이 아니고 · 게시됐고 · readBy에 내가 없고 · 최근 30일 안의 글
//  · 1분마다 다시 계산(useMinuteTick) — 예약 시각이 지나면 저절로 나타난다
import React from "react";

export const toMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : typeof v === "string" && v ? (Date.parse(v) || 0) : 0);
export const DAY_MS = 86400e3;
export const NOTICE_UNREAD_WINDOW = 30 * DAY_MS;

// 게시 시각(예약이면 예약 시각, 아니면 작성 시각)
export const noticeAtMs = (n) => toMs(n?.publishAt) || toMs(n?.createdAt);
// 게시됐는지(예약 시각 전이면 false)
export const noticePublished = (n, now = Date.now()) => !(toMs(n?.publishAt) > now);
// 나에게 "안 읽은 공지"인지(숫자·팝업 공용 기준)
export function isNoticeUnread(n, uid, now = Date.now(), windowMs = NOTICE_UNREAD_WINDOW) {
  if (!n || !uid) return false;
  if (n.authorUid && n.authorUid === uid) return false;
  if (!noticePublished(n, now)) return false;
  if ((n.readBy || []).includes(uid)) return false;
  const at = noticeAtMs(n);
  return !at || now - at < windowMs;
}

// 1분마다 바뀌는 시각 — 예약 공지가 게시 시각을 넘기면 다시 그리게
export function useMinuteTick(ms = 60000) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

// 카톡처럼 진한 빨간 숫자 동그라미(테마가 bg-rose-500을 남색으로 바꿔도 그대로 빨갛게 — 색은 style로)
export const RED = "#E5332A";
export const redPillStyle = { background: RED, color: "#fff" };
