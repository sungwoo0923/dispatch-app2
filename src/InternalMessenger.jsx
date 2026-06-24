import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  collection, addDoc, onSnapshot, query, orderBy, limit,
  serverTimestamp, doc, setDoc, getDoc, updateDoc, deleteDoc,
  getDocs, where, arrayUnion, arrayRemove
} from "firebase/firestore";
import { db, auth, storage } from "./firebase";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

const ROOMS_COLL = "chat_rooms";
const MSGS_COLL = "chat_messages";
const PROFILES_COLL = "chat_profiles";
const USERS_COLL = "users";

// ── 날짜/시간 포맷 ──
function fmtTime(ts) {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function fmtDate(ts) {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
}
function fmtLastMsg(ts) {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "방금";
  if (diff < 3600000) return `${Math.floor(diff/60000)}분 전`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= today) return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  return `${d.getMonth()+1}/${d.getDate()}`;
}

// ── 아바타 ──
function Avatar({ name = "", photo = "", size = 36, bgColor = "#1B2B4B" }) {
  const [err, setErr] = useState(false);
  if (photo && !err) {
    return <img src={photo} onError={() => setErr(true)}
      style={{ width: size, height: size, borderRadius: "30%", objectFit: "cover", flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "30%", background: bgColor,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 700, color: "white", flexShrink: 0,
      textTransform: "uppercase"
    }}>
      {(name || "?").charAt(0)}
    </div>
  );
}

export default function InternalMessenger({ user, userCompany = "", role = "" }) {
  const myUid = user?.uid || "";
  const myEmail = user?.email || "";
  const company = userCompany || localStorage.getItem("userCompany") || "";

  // ── 상태 ──
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("friends"); // friends | chat | profile | newGroup | search
  const [myProfile, setMyProfile] = useState(null);
  const [friends, setFriends] = useState([]); // all users in same company
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [unreadMap, setUnreadMap] = useState({});
  const [editMsg, setEditMsg] = useState(null);
  const [editText, setEditText] = useState("");
  const [profileView, setProfileView] = useState(null); // 다른 사람 프로필 보기
  const [newGroupModal, setNewGroupModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState([]);
  const [msgSearch, setMsgSearch] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);

  // 프로필 편집
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editStatusMsg, setEditStatusMsg] = useState("");

  const msgUnsub = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const photoFileRef = useRef(null);

  // ── 내 프로필 로드 ──
  useEffect(() => {
    if (!myUid) return;
    const unsub = onSnapshot(doc(db, PROFILES_COLL, myUid), (snap) => {
      if (snap.exists()) {
        setMyProfile(snap.data());
      } else {
        const defaultProfile = {
          uid: myUid, email: myEmail, company,
          name: auth.currentUser?.displayName || myEmail.split("@")[0] || "나",
          statusMsg: "", photo: "", createdAt: serverTimestamp(),
        };
        setDoc(doc(db, PROFILES_COLL, myUid), defaultProfile);
        setMyProfile(defaultProfile);
      }
    });
    return unsub;
  }, [myUid]);

  // ── 같은 회사 사용자 목록 ──
  useEffect(() => {
    if (!company) return;
    const q = query(collection(db, PROFILES_COLL), where("company", "==", company));
    const unsub = onSnapshot(q, (snap) => {
      setFriends(snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.uid !== myUid));
    });
    return unsub;
  }, [company, myUid]);

  // ── 채팅방 목록 ──
  useEffect(() => {
    if (!myUid) return;
    const q = query(collection(db, ROOMS_COLL), where("members", "array-contains", myUid));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.lastAt?.toMillis?.() || 0;
          const tb = b.lastAt?.toMillis?.() || 0;
          return tb - ta;
        });
      setRooms(list);
    });
    return unsub;
  }, [myUid]);

  // ── 메시지 구독 ──
  useEffect(() => {
    if (msgUnsub.current) { msgUnsub.current(); msgUnsub.current = null; }
    if (!activeRoom) { setMessages([]); return; }
    const q = query(
      collection(db, MSGS_COLL),
      where("roomId", "==", activeRoom.id),
      orderBy("createdAt", "asc"),
      limit(300)
    );
    msgUnsub.current = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      markRead(activeRoom.id);
    });
    return () => { if (msgUnsub.current) msgUnsub.current(); };
  }, [activeRoom?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (view === "chat") inputRef.current?.focus();
  }, [view]);

  // ── 안읽음 계산 ──
  useEffect(() => {
    if (!myUid || !rooms.length) return;
    const map = {};
    rooms.forEach(room => {
      const myLastRead = room.lastRead?.[myUid]?.toMillis?.() || 0;
      const lastMsgAt = room.lastAt?.toMillis?.() || 0;
      if (lastMsgAt > myLastRead && room.lastSenderUid !== myUid) {
        map[room.id] = (room.unreadCount?.[myUid] || 1);
      } else {
        map[room.id] = 0;
      }
    });
    setUnreadMap(map);
  }, [rooms, myUid]);

  const totalUnread = Object.values(unreadMap).reduce((a, b) => a + b, 0);

  const markRead = useCallback(async (roomId) => {
    if (!myUid || !roomId) return;
    await updateDoc(doc(db, ROOMS_COLL, roomId), {
      [`lastRead.${myUid}`]: serverTimestamp(),
      [`unreadCount.${myUid}`]: 0,
    }).catch(() => {});
    setUnreadMap(prev => ({ ...prev, [roomId]: 0 }));
  }, [myUid]);

  // ── 1:1 채팅 시작 ──
  const openDM = async (friend) => {
    const existing = rooms.find(r => r.type === "dm" && r.members.includes(friend.uid) && r.members.length === 2);
    if (existing) { setActiveRoom(existing); setView("chat"); return; }
    const roomRef = await addDoc(collection(db, ROOMS_COLL), {
      type: "dm",
      members: [myUid, friend.uid],
      memberProfiles: {
        [myUid]: { name: myProfile?.name || myEmail.split("@")[0], photo: myProfile?.photo || "" },
        [friend.uid]: { name: friend.name, photo: friend.photo || "" },
      },
      company,
      lastMsg: "",
      lastAt: serverTimestamp(),
      lastSenderUid: "",
      [`lastRead.${myUid}`]: serverTimestamp(),
      [`unreadCount.${myUid}`]: 0,
    });
    setActiveRoom({ id: roomRef.id, type: "dm", members: [myUid, friend.uid], memberProfiles: {} });
    setView("chat");
  };

  // ── 단체 채팅방 만들기 ──
  const createGroup = async () => {
    if (!groupName.trim() || groupMembers.length === 0) return;
    const allMembers = [myUid, ...groupMembers];
    const profiles = { [myUid]: { name: myProfile?.name || myEmail.split("@")[0], photo: myProfile?.photo || "" } };
    groupMembers.forEach(uid => {
      const f = friends.find(x => x.uid === uid);
      if (f) profiles[uid] = { name: f.name, photo: f.photo || "" };
    });
    const roomRef = await addDoc(collection(db, ROOMS_COLL), {
      type: "group",
      name: groupName.trim(),
      members: allMembers,
      memberProfiles: profiles,
      company,
      createdBy: myUid,
      lastMsg: "",
      lastAt: serverTimestamp(),
      lastSenderUid: "",
    });
    setActiveRoom({ id: roomRef.id, type: "group", name: groupName.trim(), members: allMembers });
    setGroupName("");
    setGroupMembers([]);
    setNewGroupModal(false);
    setView("chat");
  };

  // ── 메시지 전송 ──
  const sendMessage = async () => {
    if (!input.trim() || !activeRoom) return;
    const text = input.trim();
    setInput("");
    const senderName = myProfile?.name || myEmail.split("@")[0];
    await addDoc(collection(db, MSGS_COLL), {
      roomId: activeRoom.id, text, type: "text",
      senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
      createdAt: serverTimestamp(), edited: false,
    });
    // 안읽음 카운트 업
    const others = activeRoom.members?.filter(uid => uid !== myUid) || [];
    const unreadUpdate = {};
    others.forEach(uid => { unreadUpdate[`unreadCount.${uid}`] = (activeRoom.unreadCount?.[uid] || 0) + 1; });
    await updateDoc(doc(db, ROOMS_COLL, activeRoom.id), {
      lastMsg: text, lastAt: serverTimestamp(), lastSenderUid: myUid,
      [`lastRead.${myUid}`]: serverTimestamp(),
      ...unreadUpdate,
    }).catch(() => {});
  };

  // ── 이미지 전송 ──
  const sendImage = async (file) => {
    if (!file || !activeRoom) return;
    const path = `chat_images/${activeRoom.id}/${Date.now()}_${file.name}`;
    const snap = await uploadBytes(storageRef(storage, path), file);
    const url = await getDownloadURL(snap.ref);
    const senderName = myProfile?.name || myEmail.split("@")[0];
    await addDoc(collection(db, MSGS_COLL), {
      roomId: activeRoom.id, text: "", type: "image", imageUrl: url,
      senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, ROOMS_COLL, activeRoom.id), {
      lastMsg: "[사진]", lastAt: serverTimestamp(), lastSenderUid: myUid,
      [`lastRead.${myUid}`]: serverTimestamp(),
    }).catch(() => {});
  };

  // ── 메시지 수정/삭제 ──
  const saveEdit = async () => {
    if (!editMsg || !editText.trim()) return;
    await updateDoc(doc(db, MSGS_COLL, editMsg.id), { text: editText.trim(), edited: true });
    setEditMsg(null); setEditText("");
  };
  const deleteMessage = async (msgId) => {
    if (!window.confirm("메시지를 삭제하시겠습니까?")) return;
    await updateDoc(doc(db, MSGS_COLL, msgId), { text: "(삭제된 메시지)", type: "deleted" });
  };

  // ── 프로필 저장 ──
  const saveProfile = async () => {
    if (!myUid) return;
    await updateDoc(doc(db, PROFILES_COLL, myUid), { name: editName, statusMsg: editStatusMsg });
    setEditingProfile(false);
  };

  // ── 프로필 사진 업로드 ──
  const uploadProfilePhoto = async (file) => {
    if (!file || !myUid) return;
    setPhotoUploading(true);
    try {
      const path = `profile_photos/${myUid}`;
      const snap = await uploadBytes(storageRef(storage, path), file);
      const url = await getDownloadURL(snap.ref);
      await updateDoc(doc(db, PROFILES_COLL, myUid), { photo: url });
    } catch (e) { console.error(e); }
    setPhotoUploading(false);
  };

  // ── 채팅방 이름 (DM이면 상대방 이름) ──
  const getRoomName = (room) => {
    if (room.type === "dm") {
      const otherUid = room.members?.find(uid => uid !== myUid);
      return room.memberProfiles?.[otherUid]?.name || "알 수 없음";
    }
    return room.name || "그룹";
  };
  const getRoomPhoto = (room) => {
    if (room.type === "dm") {
      const otherUid = room.members?.find(uid => uid !== myUid);
      return room.memberProfiles?.[otherUid]?.photo || "";
    }
    return "";
  };

  const myName = myProfile?.name || myEmail.split("@")[0] || "나";
  const filteredMsgs = msgSearch ? messages.filter(m => m.text?.includes(msgSearch)) : messages;

  // ── 패널 크기 & 위치 ──
  const PANEL_W = 360;
  const PANEL_H = 580;
  const BTN_BOTTOM = 152; // AI: 24, 계산기: 88, 메신저: 152

  return (
    <>
      {/* 플로팅 버튼 */}
      <button
        onClick={() => setOpen(p => !p)}
        title="메신저"
        style={{
          position: "fixed", bottom: BTN_BOTTOM, right: 24, zIndex: 99998,
          width: 56, height: 56, borderRadius: "50%",
          background: open ? "#243a60" : "#1B2B4B",
          color: "white", border: "none", cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.2s",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {totalUnread > 0 && !open && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            background: "#ef4444", color: "white", fontSize: 10, fontWeight: 700,
            borderRadius: "50%", minWidth: 18, height: 18,
            display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
          }}>
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      {/* 메신저 패널 */}
      {open && (
        <div style={{
          position: "fixed", bottom: BTN_BOTTOM + 64, right: 24,
          width: PANEL_W, height: PANEL_H, zIndex: 99997,
          borderRadius: 20, overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.28)",
          display: "flex", flexDirection: "column",
          background: "#fff", border: "1px solid #e2e8f0",
          fontFamily: "'Noto Sans KR', sans-serif",
        }}>

          {/* ─── 친구 목록 뷰 ─── */}
          {view === "friends" && (
            <FriendsView
              myProfile={myProfile}
              friends={friends}
              rooms={rooms}
              unreadMap={unreadMap}
              totalUnread={totalUnread}
              getRoomName={getRoomName}
              getRoomPhoto={getRoomPhoto}
              onOpenDM={openDM}
              onOpenRoom={(room) => { setActiveRoom(room); setView("chat"); }}
              onOpenProfile={() => setView("profile")}
              onOpenPeerProfile={(f) => setProfileView(f)}
              onNewGroup={() => setNewGroupModal(true)}
              onClose={() => setOpen(false)}
            />
          )}

          {/* ─── 채팅 뷰 ─── */}
          {view === "chat" && activeRoom && (
            <ChatView
              room={activeRoom}
              roomName={getRoomName(activeRoom)}
              roomPhoto={getRoomPhoto(activeRoom)}
              messages={filteredMsgs}
              myUid={myUid}
              myProfile={myProfile}
              input={input}
              setInput={setInput}
              onSend={sendMessage}
              onBack={() => setView("friends")}
              onClose={() => setOpen(false)}
              editMsg={editMsg}
              setEditMsg={setEditMsg}
              editText={editText}
              setEditText={setEditText}
              onSaveEdit={saveEdit}
              onDeleteMsg={deleteMessage}
              msgSearch={msgSearch}
              setMsgSearch={setMsgSearch}
              bottomRef={bottomRef}
              inputRef={inputRef}
              fileRef={fileRef}
              onSendImage={sendImage}
            />
          )}

          {/* ─── 내 프로필 뷰 ─── */}
          {view === "profile" && (
            <ProfileView
              myProfile={myProfile}
              editingProfile={editingProfile}
              editName={editName}
              editStatusMsg={editStatusMsg}
              setEditName={setEditName}
              setEditStatusMsg={setEditStatusMsg}
              onEdit={() => { setEditName(myProfile?.name || ""); setEditStatusMsg(myProfile?.statusMsg || ""); setEditingProfile(true); }}
              onSave={saveProfile}
              onCancel={() => setEditingProfile(false)}
              onBack={() => setView("friends")}
              onClose={() => setOpen(false)}
              onPhotoUpload={uploadProfilePhoto}
              photoUploading={photoUploading}
              photoFileRef={photoFileRef}
            />
          )}
        </div>
      )}

      {/* ─── 다른 사람 프로필 팝업 ─── */}
      {profileView && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setProfileView(null)}>
          <div style={{ background: "#fff", borderRadius: 20, width: 280, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
            onClick={e => e.stopPropagation()}>
            {/* 헤더 배경 */}
            <div style={{ background: "#1B2B4B", padding: "28px 20px 20px", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                <Avatar name={profileView.name} photo={profileView.photo} size={64} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{profileView.name}</div>
              {profileView.statusMsg && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>{profileView.statusMsg}</div>
              )}
            </div>
            <div style={{ padding: "16px 20px", display: "flex", gap: 10 }}>
              <button onClick={() => { openDM(profileView); setProfileView(null); }}
                style={{ flex: 1, padding: "9px 0", background: "#1B2B4B", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                1:1 대화
              </button>
              <button onClick={() => setProfileView(null)}
                style={{ flex: 1, padding: "9px 0", background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 단체 채팅방 만들기 팝업 ─── */}
      {newGroupModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setNewGroupModal(false)}>
          <div style={{ background: "#fff", borderRadius: 20, width: 360, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ background: "#1B2B4B", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>단체 채팅방 만들기</span>
              <button onClick={() => setNewGroupModal(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: "20px 20px 16px" }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 5 }}>채팅방 이름 *</label>
                <input value={groupName} onChange={e => setGroupName(e.target.value)}
                  placeholder="채팅방 이름 입력"
                  style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 12px", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 8 }}>
                멤버 선택 ({groupMembers.length}명 선택됨)
              </label>
              <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {friends.map(f => {
                  const checked = groupMembers.includes(f.uid);
                  return (
                    <label key={f.uid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 10, cursor: "pointer", background: checked ? "#eff6ff" : "transparent" }}>
                      <input type="checkbox" checked={checked}
                        onChange={() => setGroupMembers(prev => checked ? prev.filter(u => u !== f.uid) : [...prev, f.uid])}
                        style={{ accentColor: "#1B2B4B", width: 15, height: 15 }} />
                      <Avatar name={f.name} photo={f.photo} size={30} />
                      <span style={{ fontSize: 13, fontWeight: checked ? 700 : 400, color: "#1B2B4B" }}>{f.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div style={{ padding: "0 20px 20px", display: "flex", gap: 10 }}>
              <button onClick={() => setNewGroupModal(false)}
                style={{ flex: 1, padding: "10px 0", background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>취소</button>
              <button onClick={createGroup} disabled={!groupName.trim() || groupMembers.length === 0}
                style={{ flex: 1, padding: "10px 0", background: "#1B2B4B", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: (!groupName.trim() || groupMembers.length === 0) ? 0.4 : 1 }}>만들기</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ════════════════ 친구 목록 뷰 ════════════════
function FriendsView({ myProfile, friends, rooms, unreadMap, totalUnread, getRoomName, getRoomPhoto, onOpenDM, onOpenRoom, onOpenProfile, onOpenPeerProfile, onNewGroup, onClose }) {
  const [tab, setTab] = useState("chats"); // chats | friends
  const [search, setSearch] = useState("");

  const filteredFriends = search ? friends.filter(f => f.name?.includes(search) || f.email?.includes(search)) : friends;
  const filteredRooms = search ? rooms.filter(r => getRoomName(r)?.includes(search)) : rooms;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 헤더 */}
      <div style={{ background: "#1B2B4B", padding: "14px 16px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>메신저</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={onNewGroup} title="단체 채팅" style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "rgba(255,255,255,0.8)", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 0 }}>✕</button>
          </div>
        </div>
        {/* 탭 */}
        <div style={{ display: "flex", gap: 0 }}>
          {[["chats","채팅"], ["friends","친구"]].map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "8px 0", border: "none", cursor: "pointer",
              background: "none", color: tab === t ? "#fff" : "rgba(255,255,255,0.5)",
              fontWeight: tab === t ? 700 : 400, fontSize: 13,
              borderBottom: tab === t ? "2px solid #fff" : "2px solid transparent",
              transition: "all 0.15s",
            }}>
              {l}{t === "chats" && totalUnread > 0 ? ` (${totalUnread})` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* 검색 */}
      <div style={{ padding: "10px 12px", background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={tab === "chats" ? "채팅방 검색..." : "친구 검색..."}
          style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 20, padding: "6px 14px", fontSize: 12, outline: "none", boxSizing: "border-box", background: "#fff" }} />
      </div>

      {/* 목록 */}
      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}>
        {tab === "chats" ? (
          filteredRooms.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              채팅방이 없습니다<br />
              <span style={{ fontSize: 12 }}>친구 탭에서 대화를 시작하세요</span>
            </div>
          ) : filteredRooms.map(room => {
            const unread = unreadMap[room.id] || 0;
            const name = getRoomName(room);
            const photo = getRoomPhoto(room);
            return (
              <div key={room.id} onClick={() => onOpenRoom(room)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", borderBottom: "1px solid #f3f4f6", transition: "background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Avatar name={name} photo={photo} size={44} bgColor={room.type === "group" ? "#374151" : "#1B2B4B"} />
                  {room.type === "group" && (
                    <div style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16, background: "#1B2B4B", borderRadius: "50%", border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", truncate: true }}>{name}</span>
                    <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0, marginLeft: 4 }}>{fmtLastMsg(room.lastAt)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{room.lastMsg || ""}</span>
                    {unread > 0 && (
                      <span style={{ background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 20, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", flexShrink: 0, marginLeft: 4 }}>
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <>
            {/* 내 프로필 */}
            <div onClick={onOpenProfile}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", borderBottom: "1px solid #e5e7eb", background: "#f8fafc" }}
              onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
              onMouseLeave={e => e.currentTarget.style.background = "#f8fafc"}>
              <Avatar name={myProfile?.name || "나"} photo={myProfile?.photo} size={44} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#1B2B4B" }}>{myProfile?.name || "나"} <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400 }}>(나)</span></div>
                {myProfile?.statusMsg && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{myProfile.statusMsg}</div>}
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </div>
            <div style={{ padding: "8px 14px 4px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              친구 {filteredFriends.length}명
            </div>
            {filteredFriends.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>같은 회사 사용자가 없습니다</div>
            ) : filteredFriends.map(f => (
              <div key={f.uid}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
                onClick={() => onOpenPeerProfile(f)}
                onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <Avatar name={f.name} photo={f.photo} size={40} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{f.name}</div>
                  {f.statusMsg && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>{f.statusMsg}</div>}
                </div>
                <button onClick={e => { e.stopPropagation(); onOpenDM(f); }}
                  style={{ background: "#1B2B4B", color: "#fff", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>대화</button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════ 채팅 뷰 ════════════════
function ChatView({ room, roomName, roomPhoto, messages, myUid, myProfile, input, setInput, onSend, onBack, onClose, editMsg, setEditMsg, editText, setEditText, onSaveEdit, onDeleteMsg, msgSearch, setMsgSearch, bottomRef, inputRef, fileRef, onSendImage }) {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 헤더 */}
      <div style={{ background: "#1B2B4B", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <Avatar name={roomName} photo={roomPhoto} size={32} bgColor={room.type === "group" ? "#374151" : "#243a60"} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{roomName}</div>
          {room.type === "group" && room.members && (
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{room.members.length}명</div>
          )}
        </div>
        <button onClick={() => setShowSearch(p => !p)} style={{ background: "none", border: "none", color: showSearch ? "#fff" : "rgba(255,255,255,0.5)", cursor: "pointer", padding: 4 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>

      {/* 검색바 */}
      {showSearch && (
        <div style={{ padding: "8px 12px", background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
          <input value={msgSearch} onChange={e => setMsgSearch(e.target.value)}
            placeholder="메시지 검색..."
            style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 20, padding: "5px 12px", fontSize: 12, outline: "none", boxSizing: "border-box" }}
            autoFocus />
        </div>
      )}

      {/* 메시지 영역 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 8px", display: "flex", flexDirection: "column", gap: 2, scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent", background: "#f0f4f8" }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>
            대화를 시작해보세요.
          </div>
        )}
        {(() => {
          let prevDate = "";
          return messages.map((msg, i) => {
            const isMine = msg.senderUid === myUid;
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const isContinued = prev?.senderUid === msg.senderUid
              && msg.createdAt && prev.createdAt
              && (msg.createdAt?.toMillis?.() || 0) - (prev.createdAt?.toMillis?.() || 0) < 120000;
            const isLast = !next || next.senderUid !== msg.senderUid
              || (next.createdAt?.toMillis?.() || 0) - (msg.createdAt?.toMillis?.() || 0) >= 120000;

            const dateStr = msg.createdAt ? fmtDate(msg.createdAt) : "";
            const showDate = dateStr && dateStr !== prevDate;
            if (showDate) prevDate = dateStr;

            return (
              <React.Fragment key={msg.id}>
                {showDate && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 4px" }}>
                    <div style={{ flex: 1, height: 1, background: "#d1d5db" }} />
                    <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>{dateStr}</span>
                    <div style={{ flex: 1, height: 1, background: "#d1d5db" }} />
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 6, marginTop: isContinued ? 1 : 8 }}>
                  {/* 상대방 아바타 */}
                  {!isMine && (
                    <div style={{ width: 32, flexShrink: 0, alignSelf: "flex-end", marginBottom: 2 }}>
                      {!isContinued && <Avatar name={msg.senderName} photo={msg.senderPhoto} size={32} />}
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", maxWidth: "70%" }}>
                    {!isContinued && !isMine && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 3, paddingLeft: 4 }}>{msg.senderName}</span>
                    )}
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, flexDirection: isMine ? "row-reverse" : "row" }}>
                      {/* 말풍선 */}
                      {msg.type === "deleted" ? (
                        <div style={{ padding: "8px 12px", borderRadius: 14, background: "#e5e7eb", fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>
                          (삭제된 메시지)
                        </div>
                      ) : msg.type === "image" ? (
                        <div style={{ borderRadius: 12, overflow: "hidden", maxWidth: 200 }}>
                          <img src={msg.imageUrl} style={{ width: "100%", display: "block", cursor: "pointer" }}
                            onClick={() => window.open(msg.imageUrl, "_blank")} />
                        </div>
                      ) : editMsg?.id === msg.id ? (
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input value={editText} onChange={e => setEditText(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") onSaveEdit(); if (e.key === "Escape") setEditMsg(null); }}
                            style={{ border: "1px solid #1B2B4B", borderRadius: 10, padding: "6px 10px", fontSize: 13, outline: "none", minWidth: 120 }}
                            autoFocus />
                          <button onClick={onSaveEdit} style={{ background: "#1B2B4B", color: "#fff", border: "none", borderRadius: 8, padding: "5px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>저장</button>
                          <button onClick={() => setEditMsg(null)} style={{ background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 8, padding: "5px 8px", fontSize: 11, cursor: "pointer" }}>취소</button>
                        </div>
                      ) : (
                        <div
                          style={{
                            padding: "8px 12px",
                            borderRadius: isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                            background: isMine ? "#1B2B4B" : "#fff",
                            color: isMine ? "#fff" : "#111827",
                            fontSize: 13, lineHeight: 1.5,
                            wordBreak: "break-word", whiteSpace: "pre-wrap",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                          }}>
                          {msg.text}
                          {msg.edited && <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>(수정됨)</span>}
                        </div>
                      )}
                      {/* 시간 + 액션 */}
                      {isLast && msg.type !== "deleted" && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", gap: 2, flexShrink: 0 }}>
                          <span style={{ fontSize: 10, color: "#9ca3af", whiteSpace: "nowrap" }}>{fmtTime(msg.createdAt)}</span>
                          {isMine && msg.type !== "deleted" && (
                            <div style={{ display: "flex", gap: 2 }}>
                              <button onClick={() => { setEditMsg(msg); setEditText(msg.text); }}
                                style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 10, cursor: "pointer", padding: "1px 3px" }}>수정</button>
                              <button onClick={() => onDeleteMsg(msg.id)}
                                style={{ background: "none", border: "none", color: "#fca5a5", fontSize: 10, cursor: "pointer", padding: "1px 3px" }}>삭제</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          });
        })()}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div style={{ padding: "8px 12px 12px", background: "#fff", borderTop: "1px solid #e5e7eb", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 20, padding: "6px 6px 6px 12px" }}>
          {/* 사진 첨부 */}
          <button onClick={() => fileRef.current?.click()}
            style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onSendImage(f); e.target.value = ""; }} />
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder="메시지 입력..."
            rows={1}
            style={{ flex: 1, background: "none", border: "none", outline: "none", resize: "none", fontSize: 13, color: "#111827", maxHeight: 90, overflowY: "auto", lineHeight: 1.5 }}
          />
          <button onClick={onSend} disabled={!input.trim()}
            style={{
              width: 32, height: 32, borderRadius: "50%", background: input.trim() ? "#1B2B4B" : "#e5e7eb",
              border: "none", cursor: input.trim() ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              transition: "background 0.15s",
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? "#fff" : "#9ca3af"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════ 내 프로필 뷰 ════════════════
function ProfileView({ myProfile, editingProfile, editName, editStatusMsg, setEditName, setEditStatusMsg, onEdit, onSave, onCancel, onBack, onClose, onPhotoUpload, photoUploading, photoFileRef }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ background: "#1B2B4B", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: "#fff" }}>내 프로필</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* 프로필 배경 */}
        <div style={{ background: "linear-gradient(160deg, #1B2B4B 0%, #243a60 100%)", padding: "30px 20px 24px", textAlign: "center" }}>
          <div style={{ position: "relative", display: "inline-block", marginBottom: 12 }}>
            <Avatar name={myProfile?.name || "나"} photo={myProfile?.photo} size={80} />
            <button onClick={() => photoFileRef.current?.click()}
              style={{ position: "absolute", bottom: -2, right: -2, width: 24, height: 24, borderRadius: "50%", background: "#fff", border: "2px solid #1B2B4B", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {photoUploading ? <span style={{ fontSize: 10 }}>...</span> : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1B2B4B" strokeWidth="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              )}
            </button>
            <input ref={photoFileRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) onPhotoUpload(f); e.target.value = ""; }} />
          </div>
          {editingProfile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
              <input value={editName} onChange={e => setEditName(e.target.value)}
                placeholder="이름"
                style={{ textAlign: "center", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 10, padding: "6px 12px", color: "#fff", fontSize: 16, fontWeight: 700, outline: "none", width: "80%" }} />
              <input value={editStatusMsg} onChange={e => setEditStatusMsg(e.target.value)}
                placeholder="상태 메시지 입력..."
                style={{ textAlign: "center", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "5px 12px", color: "rgba(255,255,255,0.8)", fontSize: 13, outline: "none", width: "80%" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button onClick={onSave} style={{ background: "#fff", color: "#1B2B4B", border: "none", borderRadius: 10, padding: "6px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>저장</button>
                <button onClick={onCancel} style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 10, padding: "6px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>취소</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 6 }}>{myProfile?.name || "이름 없음"}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", minHeight: 18 }}>{myProfile?.statusMsg || "상태 메시지를 입력해보세요"}</div>
              <button onClick={onEdit}
                style={{ marginTop: 12, background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 20, padding: "6px 20px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                프로필 편집
              </button>
            </>
          )}
        </div>

        {/* 정보 */}
        <div style={{ padding: "16px 20px" }}>
          <div style={{ background: "#f8fafc", borderRadius: 12, overflow: "hidden", border: "1px solid #e5e7eb" }}>
            {[["이메일", myProfile?.email || ""], ["회사", myProfile?.company || ""]].map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #e5e7eb" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>{label}</span>
                <span style={{ fontSize: 13, color: "#111827", fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
