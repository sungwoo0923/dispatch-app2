import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  collection, addDoc, onSnapshot, query, orderBy, limit,
  serverTimestamp, doc, setDoc, getDoc, updateDoc, deleteDoc,
  getDocs, where
} from "firebase/firestore";
import { db, auth } from "./firebase";

const CHANNELS_COLL = "messenger_channels";
const MESSAGES_COLL = "messenger_messages";
const READS_COLL = "messenger_reads";

function timeAgo(ts) {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

function fullTime(ts) {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const MM = d.getMonth() + 1;
  const DD = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${MM}/${DD} ${hh}:${mm}`;
}

export default function InternalMessenger({ user, userCompany = "", role = "" }) {
  const myUid = user?.uid || "";
  const myEmail = user?.email || "";
  const myName = auth.currentUser?.displayName || myEmail.split("@")[0] || "나";
  const company = userCompany || localStorage.getItem("userCompany") || "";

  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [newChModal, setNewChModal] = useState(false);
  const [newChName, setNewChName] = useState("");
  const [newChDesc, setNewChDesc] = useState("");
  const [newChType, setNewChType] = useState("public");
  const [dmTarget, setDmTarget] = useState("");
  const [dmUsers, setDmUsers] = useState([]);
  const [unreadMap, setUnreadMap] = useState({});
  const [editMsg, setEditMsg] = useState(null);
  const [editText, setEditText] = useState("");
  const [search, setSearch] = useState("");
  const [showMemberList, setShowMemberList] = useState(false);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const msgUnsub = useRef(null);

  // Load channels for this company
  useEffect(() => {
    if (!company) return;
    const q = query(collection(db, CHANNELS_COLL), where("company", "==", company));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          if (a.type === "dm" && b.type !== "dm") return 1;
          if (a.type !== "dm" && b.type === "dm") return -1;
          return (a.name || "").localeCompare(b.name || "");
        });
      setChannels(list);
      // Auto-select first public channel
      setActiveChannel(prev => {
        if (prev) return prev;
        const first = list.find(c => c.type !== "dm");
        return first || null;
      });
    });
    return unsub;
  }, [company]);

  // Load DM-able users
  useEffect(() => {
    if (!company) return;
    const q = query(collection(db, "users"), where("company", "==", company));
    getDocs(q).then(snap => {
      setDmUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.uid !== myUid));
    }).catch(() => {});
  }, [company, myUid]);

  // Load messages for active channel
  useEffect(() => {
    if (msgUnsub.current) { msgUnsub.current(); msgUnsub.current = null; }
    if (!activeChannel) { setMessages([]); return; }

    const q = query(
      collection(db, MESSAGES_COLL),
      where("channelId", "==", activeChannel.id),
      orderBy("createdAt", "asc"),
      limit(200)
    );
    msgUnsub.current = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      // Mark as read
      markRead(activeChannel.id);
    });
    return () => { if (msgUnsub.current) msgUnsub.current(); };
  }, [activeChannel?.id]);

  // Track unread counts
  useEffect(() => {
    if (!myUid || !channels.length) return;
    const map = {};
    const unsubs = channels.map(ch => {
      const readDocId = `${ch.id}_${myUid}`;
      return onSnapshot(doc(db, READS_COLL, readDocId), (snap) => {
        const lastRead = snap.data()?.lastRead || null;
        // Count messages after lastRead
        const q = lastRead
          ? query(collection(db, MESSAGES_COLL), where("channelId", "==", ch.id), where("createdAt", ">", lastRead))
          : query(collection(db, MESSAGES_COLL), where("channelId", "==", ch.id));
        getDocs(q).then(s => {
          const count = s.docs.filter(d => d.data().senderUid !== myUid).length;
          setUnreadMap(prev => ({ ...prev, [ch.id]: count }));
        }).catch(() => {});
      });
    });
    return () => unsubs.forEach(u => u());
  }, [channels.length, myUid]);

  const markRead = useCallback(async (channelId) => {
    if (!myUid || !channelId) return;
    const readDocId = `${channelId}_${myUid}`;
    await setDoc(doc(db, READS_COLL, readDocId), { lastRead: serverTimestamp(), uid: myUid, channelId }, { merge: true });
    setUnreadMap(prev => ({ ...prev, [channelId]: 0 }));
  }, [myUid]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !activeChannel || sending) return;
    setSending(true);
    const text = input.trim();
    setInput("");
    try {
      await addDoc(collection(db, MESSAGES_COLL), {
        channelId: activeChannel.id,
        text,
        senderUid: myUid,
        senderName: myName,
        senderEmail: myEmail,
        company,
        createdAt: serverTimestamp(),
        edited: false,
      });
      // Update channel lastMessage
      await updateDoc(doc(db, CHANNELS_COLL, activeChannel.id), {
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
        lastSender: myName,
      });
    } catch (e) {
      console.error(e);
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const saveEdit = async () => {
    if (!editMsg || !editText.trim()) return;
    await updateDoc(doc(db, MESSAGES_COLL, editMsg.id), { text: editText.trim(), edited: true });
    setEditMsg(null);
    setEditText("");
  };

  const deleteMessage = async (msgId) => {
    if (!window.confirm("메시지를 삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, MESSAGES_COLL, msgId));
  };

  const createChannel = async () => {
    if (!newChName.trim()) return;
    await addDoc(collection(db, CHANNELS_COLL), {
      name: newChName.trim(),
      desc: newChDesc.trim(),
      type: newChType,
      company,
      createdBy: myUid,
      createdAt: serverTimestamp(),
      lastMessage: "",
      lastMessageAt: serverTimestamp(),
      members: [myUid],
    });
    setNewChName("");
    setNewChDesc("");
    setNewChModal(false);
  };

  const startDM = async () => {
    if (!dmTarget) return;
    const target = dmUsers.find(u => u.uid === dmTarget);
    if (!target) return;
    const dmId = [myUid, dmTarget].sort().join("_");
    const existing = channels.find(c => c.dmId === dmId);
    if (existing) { setActiveChannel(existing); return; }
    const ref = await addDoc(collection(db, CHANNELS_COLL), {
      name: target.displayName || target.email?.split("@")[0] || target.uid,
      type: "dm",
      dmId,
      company,
      members: [myUid, dmTarget],
      createdAt: serverTimestamp(),
      lastMessage: "",
      lastMessageAt: serverTimestamp(),
    });
    const ch = { id: ref.id, name: target.displayName || target.email?.split("@")[0], type: "dm", dmId };
    setActiveChannel(ch);
    setDmTarget("");
  };

  const filteredMessages = search
    ? messages.filter(m => m.text?.includes(search))
    : messages;

  const publicChannels = channels.filter(c => c.type !== "dm");
  const dmChannels = channels.filter(c => c.type === "dm");
  const totalUnread = Object.values(unreadMap).reduce((a, b) => a + b, 0);

  return (
    <div className="flex h-[calc(100vh-60px)] bg-gray-50 overflow-hidden">
      {/* ── 왼쪽 사이드바 ── */}
      <aside className="w-[240px] flex-shrink-0 flex flex-col bg-[#1B2B4B] text-white border-r border-[#243a60]">
        {/* 헤더 */}
        <div className="px-4 pt-5 pb-3 border-b border-white/10">
          <div className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1">사내 메신저</div>
          <div className="text-[15px] font-bold text-white truncate">{company}</div>
        </div>

        {/* 채널 목록 */}
        <div className="flex-1 overflow-y-auto py-2" style={{ scrollbarWidth: "none" }}>
          {/* 채널 섹션 */}
          <div className="px-3 pt-3 pb-1 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/40">채널</span>
            <button onClick={() => setNewChModal(true)}
              className="text-white/40 hover:text-white text-lg leading-none transition" title="채널 추가">+</button>
          </div>
          {publicChannels.map(ch => {
            const unread = unreadMap[ch.id] || 0;
            const isActive = activeChannel?.id === ch.id;
            return (
              <button key={ch.id} onClick={() => setActiveChannel(ch)}
                className={`w-full text-left px-4 py-2 rounded-lg mx-1 my-0.5 flex items-center justify-between transition text-[13px]
                  ${isActive ? "bg-white/15 text-white font-semibold" : "text-white/60 hover:text-white hover:bg-white/10"}`}
                style={{ width: "calc(100% - 8px)" }}>
                <span className="truncate"># {ch.name}</span>
                {unread > 0 && !isActive && (
                  <span className="ml-1 flex-shrink-0 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </button>
            );
          })}

          {/* DM 섹션 */}
          <div className="px-3 pt-4 pb-1 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/40">다이렉트</span>
          </div>
          {dmUsers.length > 0 && (
            <div className="px-3 mb-1 flex gap-1">
              <select value={dmTarget} onChange={e => setDmTarget(e.target.value)}
                className="flex-1 text-[12px] bg-white/10 border border-white/20 text-white rounded px-2 py-1 outline-none appearance-none">
                <option value="">대화 상대 선택</option>
                {dmUsers.map(u => (
                  <option key={u.uid} value={u.uid} style={{ background: "#1B2B4B" }}>
                    {u.displayName || u.email?.split("@")[0] || u.uid}
                  </option>
                ))}
              </select>
              <button onClick={startDM}
                className="px-2 py-1 bg-white/15 hover:bg-white/25 rounded text-[12px] font-bold transition">DM</button>
            </div>
          )}
          {dmChannels.map(ch => {
            const unread = unreadMap[ch.id] || 0;
            const isActive = activeChannel?.id === ch.id;
            return (
              <button key={ch.id} onClick={() => setActiveChannel(ch)}
                className={`w-full text-left px-4 py-2 rounded-lg mx-1 my-0.5 flex items-center justify-between transition text-[13px]
                  ${isActive ? "bg-white/15 text-white font-semibold" : "text-white/60 hover:text-white hover:bg-white/10"}`}
                style={{ width: "calc(100% - 8px)" }}>
                <span className="truncate">@ {ch.name}</span>
                {unread > 0 && !isActive && (
                  <span className="ml-1 flex-shrink-0 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 하단 내 정보 */}
        <div className="px-4 py-3 border-t border-white/10 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0">
            {myName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-white truncate">{myName}</div>
            <div className="text-[11px] text-white/40 truncate">{myEmail}</div>
          </div>
        </div>
      </aside>

      {/* ── 메인 채팅 영역 ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {activeChannel ? (
          <>
            {/* 채널 헤더 */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-white flex-shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-[#1B2B4B]">
                    {activeChannel.type === "dm" ? `@ ${activeChannel.name}` : `# ${activeChannel.name}`}
                  </span>
                  {activeChannel.desc && (
                    <span className="text-[12px] text-gray-400 truncate">{activeChannel.desc}</span>
                  )}
                </div>
              </div>
              {/* 검색 */}
              <div className="flex items-center gap-2">
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="메시지 검색..."
                  className="h-[30px] px-3 rounded-lg border border-gray-200 text-[12px] outline-none focus:border-[#1B2B4B] w-[160px]"
                />
              </div>
            </div>

            {/* 메시지 목록 */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}>
              {filteredMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-gray-300">
                  <div className="text-[40px] mb-3 font-light text-gray-200">#</div>
                  <div className="text-[14px] font-semibold text-gray-400">
                    {activeChannel.type === "dm" ? `${activeChannel.name}와의 대화` : `#${activeChannel.name}`}
                  </div>
                  <div className="text-[12px] text-gray-300 mt-1">첫 메시지를 보내보세요.</div>
                </div>
              )}
              {(() => {
                let prevDate = "";
                return filteredMessages.map((msg, i) => {
                  const isMine = msg.senderUid === myUid;
                  const prev = filteredMessages[i - 1];
                  const isContinued = prev && prev.senderUid === msg.senderUid
                    && msg.createdAt && prev.createdAt
                    && (msg.createdAt?.toDate ? msg.createdAt.toDate() : new Date(msg.createdAt))
                    - (prev.createdAt?.toDate ? prev.createdAt.toDate() : new Date(prev.createdAt)) < 120000;

                  const msgDate = msg.createdAt?.toDate
                    ? msg.createdAt.toDate().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
                    : "";
                  const showDate = msgDate && msgDate !== prevDate;
                  if (showDate) prevDate = msgDate;

                  return (
                    <React.Fragment key={msg.id}>
                      {showDate && (
                        <div className="flex items-center gap-3 py-2">
                          <div className="flex-1 h-px bg-gray-100" />
                          <span className="text-[11px] text-gray-400 font-semibold whitespace-nowrap">{msgDate}</span>
                          <div className="flex-1 h-px bg-gray-100" />
                        </div>
                      )}
                      <div className={`group flex gap-3 ${isMine ? "flex-row-reverse" : ""} ${isContinued ? "mt-0.5" : "mt-3"}`}>
                        {/* 아바타 */}
                        {!isContinued ? (
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0 mt-0.5
                            ${isMine ? "bg-[#1B2B4B] text-white" : "bg-gray-100 text-gray-600"}`}>
                            {(msg.senderName || "?").charAt(0).toUpperCase()}
                          </div>
                        ) : (
                          <div className="w-8 flex-shrink-0" />
                        )}
                        <div className={`flex flex-col max-w-[65%] ${isMine ? "items-end" : "items-start"}`}>
                          {!isContinued && (
                            <div className={`flex items-baseline gap-2 mb-0.5 ${isMine ? "flex-row-reverse" : ""}`}>
                              <span className="text-[12px] font-bold text-[#1B2B4B]">{msg.senderName || msg.senderEmail}</span>
                              <span className="text-[11px] text-gray-400">{fullTime(msg.createdAt)}</span>
                            </div>
                          )}
                          <div className={`relative px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed break-words
                            ${isMine
                              ? "bg-[#1B2B4B] text-white rounded-tr-sm"
                              : "bg-gray-100 text-gray-800 rounded-tl-sm"}`}>
                            {editMsg?.id === msg.id ? (
                              <div className="flex gap-2 items-center">
                                <input
                                  className="bg-white/10 outline-none border-b border-white/40 text-white text-[13px] px-1 min-w-[120px]"
                                  value={editText}
                                  onChange={e => setEditText(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditMsg(null); }}
                                  autoFocus
                                />
                                <button onClick={saveEdit} className="text-[11px] font-bold text-green-300 hover:text-green-100">저장</button>
                                <button onClick={() => setEditMsg(null)} className="text-[11px] text-white/50 hover:text-white">취소</button>
                              </div>
                            ) : (
                              <span className="whitespace-pre-wrap">{msg.text}</span>
                            )}
                            {msg.edited && <span className="text-[10px] opacity-50 ml-1">(수정됨)</span>}
                          </div>
                          {isContinued && (
                            <span className="text-[10px] text-gray-300 mt-0.5 px-1 opacity-0 group-hover:opacity-100 transition">
                              {fullTime(msg.createdAt)}
                            </span>
                          )}
                        </div>
                        {/* 메시지 액션 (내 메시지만) */}
                        {isMine && editMsg?.id !== msg.id && (
                          <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1 self-center">
                            <button onClick={() => { setEditMsg(msg); setEditText(msg.text); }}
                              className="text-[11px] text-gray-400 hover:text-[#1B2B4B] px-1.5 py-0.5 rounded hover:bg-gray-100 transition">수정</button>
                            <button onClick={() => deleteMessage(msg.id)}
                              className="text-[11px] text-gray-400 hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-red-50 transition">삭제</button>
                          </div>
                        )}
                      </div>
                    </React.Fragment>
                  );
                });
              })()}
              <div ref={bottomRef} />
            </div>

            {/* 입력창 */}
            <div className="px-5 pb-4 pt-3 flex-shrink-0 border-t border-gray-100 bg-white">
              <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 focus-within:border-[#1B2B4B] transition">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                  }}
                  placeholder={`#${activeChannel.name}에 메시지 보내기`}
                  rows={1}
                  className="flex-1 bg-transparent outline-none resize-none text-[13px] text-gray-800 placeholder-gray-400 max-h-[120px] leading-relaxed"
                  style={{ overflowY: "auto" }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#1B2B4B] disabled:bg-gray-200 disabled:cursor-not-allowed text-white flex items-center justify-center hover:bg-[#243a60] transition">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
              <div className="text-[11px] text-gray-300 mt-1 px-1">Enter 전송 · Shift+Enter 줄바꿈</div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="text-[15px] font-semibold text-gray-400">채널을 선택하세요</div>
            <div className="text-[12px] text-gray-300 mt-1">왼쪽에서 채널을 선택하거나 새 채널을 만드세요.</div>
            <button onClick={() => setNewChModal(true)}
              className="mt-4 px-5 py-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition">
              새 채널 만들기
            </button>
          </div>
        )}
      </div>

      {/* ── 새 채널 팝업 ── */}
      {newChModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => setNewChModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[440px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-[15px]">새 채널 만들기</h3>
              <button onClick={() => setNewChModal(false)} className="text-white/50 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">채널 이름 *</label>
                <input
                  value={newChName}
                  onChange={e => setNewChName(e.target.value)}
                  placeholder="예: 배차팀, 공지사항"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B]"
                  onKeyDown={e => e.key === "Enter" && createChannel()}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">설명 (선택)</label>
                <input
                  value={newChDesc}
                  onChange={e => setNewChDesc(e.target.value)}
                  placeholder="채널 설명..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">공개 범위</label>
                <div className="flex gap-2">
                  {["public", "private"].map(t => (
                    <button key={t} onClick={() => setNewChType(t)}
                      className={`flex-1 py-2 rounded-lg text-[13px] font-semibold border transition
                        ${newChType === t ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-200 hover:border-[#1B2B4B]"}`}>
                      {t === "public" ? "공개" : "비공개"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => setNewChModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition">취소</button>
              <button onClick={createChannel} disabled={!newChName.trim()}
                className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white font-bold hover:bg-[#243a60] disabled:opacity-40 transition">만들기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
