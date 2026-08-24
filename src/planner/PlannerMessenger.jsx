// src/planner/PlannerMessenger.jsx — 가족/커플 메신저 (PC/모바일 공용).
// 초대한 사람과 초대받은 사람(같은 가족 코드 구성원)끼리만 대화가 오간다.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  usePlannerMessages, sendPlannerMessage, uploadMessengerImage,
  markMessengerRead, usePlannerMessengerReads,
} from "../adminPlannerData";
import { useGroupMembers } from "./plannerAuth";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

function tsMillis(ts) {
  if (!ts?.seconds) return 0;
  return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
}

function tsLabel(ts) {
  if (!ts?.seconds) return "";
  const d = new Date(ts.seconds * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function dayKey(ts) {
  if (!ts?.seconds) return "";
  const d = new Date(ts.seconds * 1000);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(ts) {
  if (!ts?.seconds) return "";
  const d = new Date(ts.seconds * 1000);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (isToday) return "오늘";
  if (d.toDateString() === yesterday.toDateString()) return "어제";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default function PlannerMessenger({ groupId, myUid, myName }) {
  const messages = usePlannerMessages(groupId);
  const reads = usePlannerMessengerReads(groupId);
  const members = useGroupMembers(groupId);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // ⭐ 메신저를 열어둔 동안엔("마운트돼 있는 동안") 새 메시지가 와도 바로바로
  // "읽음" 처리되게 한다 — 카톡처럼 대화창을 보고 있으면 안읽음 숫자가 즉시 사라져야 함.
  useEffect(() => {
    markMessengerRead(groupId, myUid);
  }, [groupId, myUid, messages.length]);

  // 나 말고 이 가족의 다른 구성원들 — 내가 보낸 메시지를 "몇 명이 아직 안 읽었는지" 계산할 때 씀.
  const otherMembers = useMemo(() => members.filter((m) => m.uid !== myUid), [members, myUid]);
  const unreadByOthers = (createdAt) => {
    const sentAt = tsMillis(createdAt);
    if (!sentAt) return otherMembers.length; // 방금 보내서 서버 시각이 아직 안 붙은 경우 = 당연히 안읽음
    return otherMembers.filter((m) => tsMillis(reads[m.uid]) < sentAt).length;
  };

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await sendPlannerMessage({ groupId, senderUid: myUid, senderName: myName, text });
      setText("");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handlePickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadMessengerImage(groupId, file);
      await sendPlannerMessage({ groupId, senderUid: myUid, senderName: myName, text: "", imageURL: url });
    } catch (err) {
      // ⭐ 예전엔 실패해도 아무 알림 없이 그냥 사라져서 왜 안 보내졌는지 알 수
      // 없었다 — 실패 사유를 눈에 보이게 알려준다.
      alert(err?.message ? `사진 전송에 실패했어요 (${err.message})` : "사진 전송에 실패했어요. 다시 시도해 주세요.");
    } finally {
      setUploading(false);
    }
  };

  // 하루 단위로 묶어서 "오늘/어제/YYYY.MM.DD" 구분선을 넣는다.
  const grouped = useMemo(() => {
    const out = [];
    let lastDay = null;
    messages.forEach((m) => {
      const k = dayKey(m.createdAt);
      if (k !== lastDay) { out.push({ divider: true, key: `d-${m.id}`, label: dayLabel(m.createdAt) }); lastDay = k; }
      out.push(m);
    });
    return out;
  }, [messages]);

  return (
    <div className="h-full max-w-xl flex flex-col mx-auto">
      <div className="flex-1 overflow-y-auto bg-white border rounded-xl p-3.5 space-y-2.5" style={{ borderColor: ACCENT_BORDER }}>
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-[12.5px] text-gray-500">아직 대화가 없어요. 첫 메시지를 보내보세요!</div>
        )}
        {grouped.map((item) =>
          item.divider ? (
            <div key={item.key} className="flex items-center justify-center py-1">
              <span className="text-[10.5px] font-semibold text-gray-500 bg-gray-100 rounded-full px-3 py-1">{item.label}</span>
            </div>
          ) : (
            <div key={item.id} className={`flex ${item.senderUid === myUid ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] ${item.senderUid === myUid ? "items-end" : "items-start"} flex flex-col`}>
                {item.senderUid !== myUid && <div className="text-[10.5px] text-gray-500 mb-0.5 px-1">{item.senderName}</div>}
                <div className={`flex items-end gap-1 ${item.senderUid === myUid ? "flex-row" : "flex-row-reverse"}`}>
                  {item.senderUid === myUid && (() => {
                    const n = unreadByOthers(item.createdAt);
                    return n > 0 ? <span className="text-[10px] font-bold shrink-0 mb-0.5" style={{ color: ACCENT }}>{n}</span> : null;
                  })()}
                  {item.imageURL ? (
                    <img
                      src={item.imageURL}
                      alt="첨부 이미지"
                      className="max-w-[220px] max-h-[220px] rounded-2xl object-cover border cursor-pointer"
                      style={{ borderColor: ACCENT_BORDER }}
                      onClick={() => {
                        // ⭐ 사진이 이제 Storage URL이 아니라 base64 data URL이라서,
                        // window.open(dataURL)은 브라우저가 팝업 보안상 막아버린다
                        // (about:blank#blocked). 빈 창을 먼저 띄운 뒤 그 안에
                        // <img>로 그려 넣으면 우회할 수 있다.
                        const win = window.open("", "_blank");
                        if (win) {
                          win.document.write(
                            `<title>사진</title><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${item.imageURL}" style="max-width:100%;max-height:100vh"/></body>`
                          );
                        }
                      }}
                    />
                  ) : (
                    <div
                      className="px-3 py-2 rounded-2xl text-[13px] leading-relaxed break-words"
                      style={item.senderUid === myUid ? { background: ACCENT, color: "#fff", borderBottomRightRadius: 4 } : { background: ACCENT_SOFT, color: "#374151", borderBottomLeftRadius: 4 }}
                    >
                      {item.text}
                    </div>
                  )}
                </div>
                <div className="text-[9.5px] text-gray-400 mt-0.5 px-1">{tsLabel(item.createdAt)}</div>
              </div>
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 mt-2.5 shrink-0 items-center">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickImage} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="shrink-0 w-10 h-10 rounded-full border flex items-center justify-center disabled:opacity-50"
          style={{ borderColor: ACCENT_BORDER, color: ACCENT }}
          title="사진 첨부"
        >
          {uploading ? (
            <span className="text-[11px] font-bold">…</span>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
              <circle cx="12" cy="14" r="3.5" />
            </svg>
          )}
        </button>
        <input
          ref={inputRef}
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
