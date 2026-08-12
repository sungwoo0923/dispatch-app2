// ======================= cafe-site/src/CafeChatDrawer.jsx =======================
// 오더 게시자 ↔ 신청자 1:1 실시간 대화창. 배차신청~배차완료 단계에서만 열 수 있다.
// 3개월 지난 메시지는 목록에서 자동으로 걸러지고, 실제 삭제는 서버 예약작업이 처리한다.
import React, { useEffect, useRef, useState } from "react";
import { subscribeCafeChat, sendCafeChatMessage } from "./cafeApi";

export default function CafeChatDrawer({ order, profile, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    const unsub = subscribeCafeChat(order.id, setMessages);
    return () => unsub();
  }, [order.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText("");
    try {
      await sendCafeChatMessage(order.id, profile, t);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10001] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[420px] max-w-full h-[560px] max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="text-white font-bold text-[14px] truncate">{order.상차지명} → {order.하차지명}</div>
            <div className="text-white/50 text-[11px]">1:1 대화 · 메시지는 3개월 후 자동 삭제됩니다</div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none shrink-0 ml-2">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50">
          {messages.length === 0 && (
            <div className="text-center text-[12px] text-gray-400 mt-10">아직 대화가 없습니다. 첫 메시지를 보내보세요.</div>
          )}
          {messages.map(m => {
            const mine = m.senderUid === profile.uid;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                  {!mine && <div className="text-[10.5px] text-gray-400 font-semibold mb-0.5 px-1">{m.senderName}</div>}
                  <div className={`px-3 py-2 rounded-2xl text-[13px] leading-snug break-words ${
                    mine ? "bg-[#1B2B4B] text-white rounded-br-sm" : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
                  }`}>
                    {m.text}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="p-3 border-t border-gray-100 flex items-center gap-2 shrink-0">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="메시지 입력"
            className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-[#1B2B4B]"
          />
          <button onClick={send} disabled={!text.trim() || sending}
            className="px-4 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition disabled:opacity-40">
            전송
          </button>
        </div>
      </div>
    </div>
  );
}
