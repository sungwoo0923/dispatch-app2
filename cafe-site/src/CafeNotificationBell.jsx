// ======================= cafe-site/src/CafeNotificationBell.jsx =======================
// 헤더의 알림벨 — 배차취소/오더삭제처럼 "내 등록 오더" 목록만으로는 드러나지 않는
// 알림(상대방이 배정을 취소했을 때 등)까지 함께 보여준다. 안 읽은 알림이 있으면
// 빨간 점이 깜빡인다.
import React, { useState, useRef, useEffect } from "react";
import { markNotificationsRead } from "./cafeApi";

export default function CafeNotificationBell({ notifications, onGoto }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const unread = notifications.filter(n => !n.read);

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const toggle = () => {
    setOpen(o => !o);
    if (!open && unread.length) markNotificationsRead(unread.map(n => n.id));
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} className="relative w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:bg-white/10 transition">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center animate-cafe-blink">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[320px] max-h-[420px] overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-50">
          {notifications.length === 0 ? (
            <div className="py-10 text-center text-[12.5px] text-gray-400">알림이 없습니다.</div>
          ) : notifications.slice(0, 30).map(n => (
            <button key={n.id} onClick={() => { setOpen(false); onGoto?.(n); }}
              className="w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition">
              <div className="text-[12.5px] font-bold text-gray-900">{n.title}</div>
              <div className="text-[11.5px] text-gray-500 mt-0.5">{n.body}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
