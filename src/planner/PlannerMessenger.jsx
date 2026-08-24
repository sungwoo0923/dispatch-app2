// src/planner/PlannerMessenger.jsx — 가족/커플 메신저 (PC/모바일 공용).
// 초대한 사람과 초대받은 사람(같은 가족 코드 구성원)끼리만 대화가 오간다.
import React, { useEffect, useRef, useState } from "react";
import { usePlannerMessages, sendPlannerMessage } from "../adminPlannerData";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

function tsLabel(ts) {
  if (!ts?.seconds) return "";
  const d = new Date(ts.seconds * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function PlannerMessenger({ groupId, myUid, myName }) {
  const messages = usePlannerMessages(groupId);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await sendPlannerMessage({ groupId, senderUid: myUid, senderName: myName, text });
      setText("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-xl flex flex-col" style={{ height: "min(640px, 70vh)" }}>
      <div className="flex-1 overflow-y-auto bg-white border rounded-xl p-3.5 space-y-2.5" style={{ borderColor: ACCENT_BORDER }}>
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-[12.5px] text-gray-400">아직 대화가 없어요. 첫 메시지를 보내보세요!</div>
        )}
        {messages.map((m) => {
          const mine = m.senderUid === myUid;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                {!mine && <div className="text-[10.5px] text-gray-400 mb-0.5 px-1">{m.senderName}</div>}
                <div
                  className="px-3 py-2 rounded-2xl text-[13px] leading-relaxed break-words"
                  style={mine ? { background: ACCENT, color: "#fff", borderBottomRightRadius: 4 } : { background: ACCENT_SOFT, color: "#374151", borderBottomLeftRadius: 4 }}
                >
                  {m.text}
                </div>
                <div className="text-[9.5px] text-gray-300 mt-0.5 px-1">{tsLabel(m.createdAt)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 mt-2.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="메시지 입력..."
          className="flex-1 min-w-0 border rounded-full px-4 py-2.5 text-[13px] focus:outline-none"
          style={{ borderColor: ACCENT_BORDER }}
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="shrink-0 whitespace-nowrap px-5 py-2.5 rounded-full text-white text-[13px] font-bold disabled:opacity-50"
          style={{ background: ACCENT }}
        >
          전송
        </button>
      </div>
    </div>
  );
}
