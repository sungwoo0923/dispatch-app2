import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  collection, addDoc, onSnapshot, query, orderBy, limit,
  serverTimestamp, doc, setDoc, getDoc, updateDoc, deleteDoc,
  getDocs, where, arrayUnion, arrayRemove, increment
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

export default function InternalMessenger({ user, userCompany = "", role = "", mobileMode = false, mobileVisible = false, onClose, onUnreadChange, controlledOpen, onOpenChange }) {
  const myUid = user?.uid || "";
  const myEmail = user?.email || "";
  const company = userCompany || localStorage.getItem("userCompany") || "";

  // ── 상태 ──
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v) => {
    const val = typeof v === "function" ? v(open) : v;
    if (onOpenChange) onOpenChange(val);
    else setInternalOpen(val);
  };
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
  const [editPosition, setEditPosition] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const [fileUploading, setFileUploading] = useState(false);
  const [contactPickModal, setContactPickModal] = useState(false);
  const [noticeInput, setNoticeInput] = useState("");
  const [showNoticeInput, setShowNoticeInput] = useState(false);

  const msgUnsub = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const fileAllRef = useRef(null);
  const photoFileRef = useRef(null);
  const prevUnreadRef = useRef(0);
  // 채팅창이 실제로 보이는지 추적 (읽음 처리 기준)
  const isVisibleRef = useRef(false);

  // ── 내 프로필 로드 & 자동 생성 ──
  useEffect(() => {
    if (!myUid) return;
    const unsub = onSnapshot(doc(db, PROFILES_COLL, myUid), (snap) => {
      if (snap.exists()) {
        setMyProfile(snap.data());
      } else {
        getDoc(doc(db, "users", myUid)).then(userSnap => {
          const u = userSnap.exists() ? userSnap.data() : {};
          const effectiveCompany = company || u.companyName || "";
          const defaultProfile = {
            uid: myUid, email: myEmail, company: effectiveCompany,
            name: u.name || u.displayName || auth.currentUser?.displayName || myEmail.split("@")[0] || "나",
            statusMsg: "", photo: "",
            position: u.position || u.직책 || "",
            phone: u.phone || u.phoneNumber || u.전화번호 || "",
            createdAt: serverTimestamp(),
          };
          setDoc(doc(db, PROFILES_COLL, myUid), defaultProfile);
          setMyProfile(defaultProfile);
        }).catch(() => {});
      }
    });
    return unsub;
  }, [myUid]);

  // ── 같은 회사 사용자 목록 (users 컬렉션 companyName 기반, chat_profiles 머지) ──
  useEffect(() => {
    if (!company) return;
    // users 컬렉션: companyName 필드 사용
    const unsub = onSnapshot(
      query(collection(db, "users"), where("companyName", "==", company)),
      async (userSnap) => {
        const userList = userSnap.docs
          .map(d => ({ uid: d.id || d.uid, ...d.data() }))
          .filter(u => (u.uid || u.id) !== myUid && u.approved !== false);

        // chat_profiles 머지 (사진, 상태메시지, 직책, 전화번호)
        const profileSnap = await getDocs(query(collection(db, PROFILES_COLL), where("company", "==", company)));
        const profileMap = {};
        profileSnap.docs.forEach(d => { profileMap[d.id] = d.data(); });

        const merged = userList.map(u => {
          const uid = u.uid || u.id;
          const p = profileMap[uid] || {};
          return {
            uid,
            email: u.email || "",
            name: p.name || u.name || u.displayName || u.email?.split("@")[0] || uid,
            photo: p.photo || u.photo || "",
            statusMsg: p.statusMsg || "",
            position: p.position || u.position || u.직책 || "",
            phone: p.phone || u.phone || u.phoneNumber || u.전화번호 || "",
            company,
          };
        });
        setFriends(merged);
      }
    );
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
    // orderBy 없이 where만 사용 (복합 인덱스 불필요), 클라이언트에서 정렬
    const q = query(
      collection(db, MSGS_COLL),
      where("roomId", "==", activeRoom.id),
      limit(300)
    );
    msgUnsub.current = onSnapshot(q, (snap) => {
      const serverMsgs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
      setMessages(prev => {
        // 서버에 없는 optimistic 메시지만 유지 (중복 방지)
        const pendingOpt = prev.filter(m => m._optimistic && !serverMsgs.some(
          r => r.senderUid === m.senderUid && r.text === m.text &&
          Math.abs((r.createdAt?.toMillis?.() || 0) - (m.createdAt?.toMillis?.() || 0)) < 15000
        ));
        const all = [...serverMsgs, ...pendingOpt];
        return all.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
      });
      if (isVisibleRef.current) markRead(activeRoom.id);
    });
    return () => { if (msgUnsub.current) msgUnsub.current(); };
  }, [activeRoom?.id]);

  // 메시지 컨테이너 직접 스크롤 (scrollIntoView는 모바일에서 키보드 내림)
  const msgContainerRef = useRef(null);
  useEffect(() => {
    const el = msgContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    // PC에서만 자동 포커스 (모바일은 키보드 자동 열림 방지)
    if (view === "chat" && !mobileMode) inputRef.current?.focus();
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

  // 모바일 부모에게 안읽음 수 전달
  useEffect(() => { onUnreadChange?.(totalUnread); }, [totalUnread]);

  // 새 메시지 진동 알림 (안읽음 수 증가 시)
  useEffect(() => {
    if (totalUnread > prevUnreadRef.current && "vibrate" in navigator) {
      navigator.vibrate([100, 60, 100]);
    }
    prevUnreadRef.current = totalUnread;
  }, [totalUnread]);

  // 채팅창 실제 가시성 추적 (읽음 처리 기준)
  useEffect(() => {
    const visible = mobileMode
      ? (mobileVisible && view === "chat")
      : (open && view === "chat");
    isVisibleRef.current = visible;
    // 채팅창이 새로 보이게 되면 즉시 읽음 처리
    if (visible && activeRoom) markRead(activeRoom.id);
  }, [open, view, mobileVisible, mobileMode, activeRoom?.id]);

  const markRead = useCallback(async (roomId) => {
    if (!myUid || !roomId) return;
    await updateDoc(doc(db, ROOMS_COLL, roomId), {
      [`lastRead.${myUid}`]: serverTimestamp(),
      [`unreadCount.${myUid}`]: 0,
    }).catch(() => {});
    setUnreadMap(prev => ({ ...prev, [roomId]: 0 }));
    // 안읽은 메시지들에 readBy 추가 (복합 인덱스 없이)
    getDocs(query(
      collection(db, MSGS_COLL),
      where("roomId", "==", roomId),
      limit(50)
    )).then(snap => {
      snap.docs.forEach(d => {
        const readBy = d.data().readBy || [];
        if (!readBy.includes(myUid)) {
          updateDoc(d.ref, { readBy: arrayUnion(myUid) }).catch(() => {});
        }
      });
    }).catch(() => {});
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

  // ── 메시지 전송 (optimistic update - 딜레이 없이 즉시 표시) ──
  const sendMessage = () => {
    if (!input.trim() || !activeRoom) return;
    const text = input.trim();
    setInput("");
    const senderName = myProfile?.name || myEmail.split("@")[0];
    const now = new Date();

    // 즉시 로컬 상태에 추가
    const tempId = `_opt_${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId, _optimistic: true,
      roomId: activeRoom.id, text, type: "text",
      senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
      createdAt: { toMillis: () => now.getTime(), toDate: () => now },
      edited: false, readBy: [myUid],
      totalMembers: activeRoom.members?.length || 1,
    }]);

    const others = activeRoom.members?.filter(uid => uid !== myUid) || [];
    // fire-and-forget
    addDoc(collection(db, MSGS_COLL), {
      roomId: activeRoom.id, text, type: "text",
      senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
      createdAt: serverTimestamp(), edited: false,
      readBy: [myUid],
      totalMembers: activeRoom.members?.length || 1,
    }).catch(() => {});
    const unreadUpdate = {};
    others.forEach(uid => { unreadUpdate[`unreadCount.${uid}`] = increment(1); });
    updateDoc(doc(db, ROOMS_COLL, activeRoom.id), {
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
      createdAt: serverTimestamp(), readBy: [myUid],
      totalMembers: activeRoom.members?.length || 1,
    });
    const others2 = activeRoom.members?.filter(uid => uid !== myUid) || [];
    const unreadUpdate2 = {};
    others2.forEach(uid => { unreadUpdate2[`unreadCount.${uid}`] = increment(1); });
    await updateDoc(doc(db, ROOMS_COLL, activeRoom.id), {
      lastMsg: "[사진]", lastAt: serverTimestamp(), lastSenderUid: myUid,
      [`lastRead.${myUid}`]: serverTimestamp(),
      ...unreadUpdate2,
    }).catch(() => {});
  };

  // ── 파일 전송 ──
  const sendFile = async (file) => {
    if (!file || !activeRoom) return;
    setFileUploading(true);
    try {
      const path = `chat_files/${activeRoom.id}/${Date.now()}_${file.name}`;
      const snap = await uploadBytes(storageRef(storage, path), file);
      const url = await getDownloadURL(snap.ref);
      const senderName = myProfile?.name || myEmail.split("@")[0];
      const others = activeRoom.members?.filter(u => u !== myUid) || [];
      await addDoc(collection(db, MSGS_COLL), {
        roomId: activeRoom.id, text: file.name, type: "file",
        fileUrl: url, fileName: file.name, fileSize: file.size,
        senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
        createdAt: serverTimestamp(), readBy: [myUid],
        totalMembers: activeRoom.members?.length || 1,
      });
      const upd = {};
      others.forEach(u => { upd[`unreadCount.${u}`] = increment(1); });
      await updateDoc(doc(db, ROOMS_COLL, activeRoom.id), {
        lastMsg: `[파일] ${file.name}`, lastAt: serverTimestamp(), lastSenderUid: myUid,
        [`lastRead.${myUid}`]: serverTimestamp(), ...upd,
      }).catch(() => {});
    } catch (e) { console.error(e); }
    setFileUploading(false);
  };

  // ── 위치 전송 ──
  const sendLocation = () => {
    if (!activeRoom) return;
    if (!navigator.geolocation) { alert("위치 기능을 지원하지 않는 브라우저입니다."); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude.toFixed(6);
      const lng = pos.coords.longitude.toFixed(6);
      const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
      const senderName = myProfile?.name || myEmail.split("@")[0];
      const others = activeRoom.members?.filter(u => u !== myUid) || [];
      await addDoc(collection(db, MSGS_COLL), {
        roomId: activeRoom.id, text: mapsUrl, type: "location", lat, lng,
        senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
        createdAt: serverTimestamp(), readBy: [myUid],
        totalMembers: activeRoom.members?.length || 1,
      });
      const upd = {};
      others.forEach(u => { upd[`unreadCount.${u}`] = increment(1); });
      await updateDoc(doc(db, ROOMS_COLL, activeRoom.id), {
        lastMsg: "[위치]", lastAt: serverTimestamp(), lastSenderUid: myUid,
        [`lastRead.${myUid}`]: serverTimestamp(), ...upd,
      }).catch(() => {});
    }, () => alert("위치 정보를 가져올 수 없습니다."));
  };

  // ── 연락처 카드 전송 ──
  const sendContact = async (friend) => {
    if (!friend || !activeRoom) return;
    const senderName = myProfile?.name || myEmail.split("@")[0];
    const others = activeRoom.members?.filter(u => u !== myUid) || [];
    await addDoc(collection(db, MSGS_COLL), {
      roomId: activeRoom.id, text: friend.name, type: "contact",
      contactName: friend.name, contactPhone: friend.phone || "",
      contactPosition: friend.position || "", contactPhoto: friend.photo || "",
      contactUid: friend.uid,
      senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
      createdAt: serverTimestamp(), readBy: [myUid],
      totalMembers: activeRoom.members?.length || 1,
    });
    const upd = {};
    others.forEach(u => { upd[`unreadCount.${u}`] = increment(1); });
    await updateDoc(doc(db, ROOMS_COLL, activeRoom.id), {
      lastMsg: `[연락처] ${friend.name}`, lastAt: serverTimestamp(), lastSenderUid: myUid,
      [`lastRead.${myUid}`]: serverTimestamp(), ...upd,
    }).catch(() => {});
    setContactPickModal(false);
  };

  // ── 공지 전송 ──
  const sendNotice = async () => {
    if (!noticeInput.trim() || !activeRoom) return;
    const text = noticeInput.trim();
    setNoticeInput(""); setShowNoticeInput(false);
    const senderName = myProfile?.name || myEmail.split("@")[0];
    const others = activeRoom.members?.filter(u => u !== myUid) || [];
    await addDoc(collection(db, MSGS_COLL), {
      roomId: activeRoom.id, text, type: "notice",
      senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
      createdAt: serverTimestamp(), readBy: [myUid],
      totalMembers: activeRoom.members?.length || 1,
    });
    const upd = {};
    others.forEach(u => { upd[`unreadCount.${u}`] = increment(1); });
    await updateDoc(doc(db, ROOMS_COLL, activeRoom.id), {
      lastMsg: `[공지] ${text}`, lastAt: serverTimestamp(), lastSenderUid: myUid,
      [`lastRead.${myUid}`]: serverTimestamp(), ...upd,
    }).catch(() => {});
  };

  // ── 채팅방 나가기 ──
  const leaveRoom = async (roomId) => {
    if (!window.confirm("채팅방에서 나가시겠습니까?\n나가면 대화 내용이 삭제됩니다.")) return;
    await updateDoc(doc(db, ROOMS_COLL, roomId), {
      members: arrayRemove(myUid),
    }).catch(() => {});
    if (activeRoom?.id === roomId) {
      setActiveRoom(null);
      setView("friends");
    }
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
    await updateDoc(doc(db, PROFILES_COLL, myUid), {
      name: editName, statusMsg: editStatusMsg, position: editPosition, phone: editPhone,
    });
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

  // ── 테마 (A형=블루/화이트, B형=네이비) ──
  const isThemeA = localStorage.getItem("cardVersion") !== "B";
  const themeHdr = isThemeA ? "linear-gradient(135deg, #3b82f6, #1d4ed8)" : "#1B2B4B";
  const themeMyBubble = isThemeA ? "#2563eb" : "#1B2B4B";
  const themeChatBg = isThemeA ? "#eff6ff" : "#f0f4f8";

  // ── 패널 크기 & 위치 ──
  const PANEL_W = mobileMode ? 360 : 700;
  const PANEL_H = 580;
  const BTN_BOTTOM = 152;

  // ── 공통 ChatView props ──
  const chatViewProps = activeRoom ? {
    room: activeRoom,
    roomName: getRoomName(activeRoom),
    roomPhoto: getRoomPhoto(activeRoom),
    messages: filteredMsgs,
    myUid,
    myProfile,
    input,
    setInput,
    onSend: sendMessage,
    onBack: () => { setActiveRoom(null); if (mobileMode) setView("friends"); },
    onClose: mobileMode ? onClose : () => setOpen(false),
    editMsg, setEditMsg, editText, setEditText,
    onSaveEdit: saveEdit,
    onDeleteMsg: deleteMessage,
    msgSearch, setMsgSearch, msgContainerRef, inputRef,
    onSendImage: sendImage,
    onSendFile: sendFile,
    onSendLocation: sendLocation,
    onSendContact: () => setContactPickModal(true),
    onSendNotice: () => setShowNoticeInput(true),
    fileUploading, friends, mobileMode,
    themeHdr, themeMyBubble, themeChatBg,
  } : null;

  const friendsViewProps = {
    myProfile, friends, rooms, unreadMap, totalUnread,
    getRoomName, getRoomPhoto,
    onOpenDM: openDM,
    onOpenRoom: (room) => { setActiveRoom(room); if (mobileMode) setView("chat"); },
    onOpenProfile: () => setView("profile"),
    onOpenPeerProfile: (f) => setProfileView(f),
    onNewGroup: () => setNewGroupModal(true),
    onClose: mobileMode ? onClose : () => setOpen(false),
    onLeaveRoom: leaveRoom,
    myUid, mobileMode,
    themeHdr,
    activeRoomId: activeRoom?.id,
  };

  // ── PC: 좌우 분할 레이아웃 ──
  const pcSplitContent = (
    <div style={{
      width: "100%", height: "100%",
      display: "flex",
      background: "#fff",
      fontFamily: "'Noto Sans KR', sans-serif",
      borderRadius: 20, overflow: "hidden",
      boxShadow: "0 20px 60px rgba(0,0,0,0.28)",
      border: "1px solid #e2e8f0",
    }}>
      {/* 왼쪽: 친구/채팅 목록 */}
      <div style={{ width: 240, flexShrink: 0, borderRight: "1px solid #e5e7eb", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {view === "profile" ? (
          <ProfileView
            myProfile={myProfile}
            editingProfile={editingProfile}
            editName={editName} editStatusMsg={editStatusMsg}
            editPosition={editPosition} editPhone={editPhone}
            setEditName={setEditName} setEditStatusMsg={setEditStatusMsg}
            setEditPosition={setEditPosition} setEditPhone={setEditPhone}
            onEdit={() => { setEditName(myProfile?.name || ""); setEditStatusMsg(myProfile?.statusMsg || ""); setEditPosition(myProfile?.position || ""); setEditPhone(myProfile?.phone || ""); setEditingProfile(true); }}
            onSave={saveProfile}
            onCancel={() => setEditingProfile(false)}
            onBack={() => setView("friends")}
            onClose={() => setOpen(false)}
            onPhotoUpload={uploadProfilePhoto}
            photoUploading={photoUploading}
            photoFileRef={photoFileRef}
            themeHdr={themeHdr}
          />
        ) : (
          <FriendsView {...friendsViewProps} />
        )}
      </div>
      {/* 오른쪽: 채팅 */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {activeRoom && chatViewProps ? (
          <ChatView {...chatViewProps} />
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#9ca3af", gap: 12 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span style={{ fontSize: 14 }}>채팅방을 선택해주세요</span>
          </div>
        )}
      </div>
    </div>
  );

  // ── 모바일: 기존 단일 뷰 ──
  const mobileContent = (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fff", fontFamily: "'Noto Sans KR', sans-serif" }}>
      {view === "friends" && <FriendsView {...friendsViewProps} />}
      {view === "chat" && activeRoom && chatViewProps && <ChatView {...chatViewProps} />}
      {view === "profile" && (
        <ProfileView
          myProfile={myProfile}
          editingProfile={editingProfile}
          editName={editName} editStatusMsg={editStatusMsg}
          editPosition={editPosition} editPhone={editPhone}
          setEditName={setEditName} setEditStatusMsg={setEditStatusMsg}
          setEditPosition={setEditPosition} setEditPhone={setEditPhone}
          onEdit={() => { setEditName(myProfile?.name || ""); setEditStatusMsg(myProfile?.statusMsg || ""); setEditPosition(myProfile?.position || ""); setEditPhone(myProfile?.phone || ""); setEditingProfile(true); }}
          onSave={saveProfile}
          onCancel={() => setEditingProfile(false)}
          onBack={() => setView("friends")}
          onClose={onClose}
          onPhotoUpload={uploadProfilePhoto}
          photoUploading={photoUploading}
          photoFileRef={photoFileRef}
          themeHdr={themeHdr}
        />
      )}
    </div>
  );

  const panelContent = mobileMode ? mobileContent : pcSplitContent;

  if (mobileMode) {
    return (
      <>
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {panelContent}
        </div>
        {/* 다른 사람 프로필 팝업 */}
        {profileView && (
          <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setProfileView(null)}>
            <div style={{ background: "#fff", borderRadius: 20, width: 280, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ background: "#1B2B4B", padding: "28px 20px 20px", textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                  <Avatar name={profileView.name} photo={profileView.photo} size={64} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{profileView.name}</div>
                {profileView.position && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>{profileView.position}</div>}
                {profileView.statusMsg && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>{profileView.statusMsg}</div>}
              </div>
              {(profileView.phone || profileView.email) && (
                <div style={{ padding: "12px 20px 0", borderBottom: "1px solid #f3f4f6" }}>
                  {profileView.phone && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12 }}>
                      <span style={{ color: "#6b7280", fontWeight: 600 }}>전화번호</span>
                      <a href={`tel:${profileView.phone}`} style={{ color: "#1B2B4B", fontWeight: 600, textDecoration: "none" }}>{profileView.phone}</a>
                    </div>
                  )}
                  {profileView.email && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12 }}>
                      <span style={{ color: "#6b7280", fontWeight: 600 }}>이메일</span>
                      <span style={{ color: "#374151", fontWeight: 500 }}>{profileView.email}</span>
                    </div>
                  )}
                </div>
              )}
              <div style={{ padding: "12px 20px 16px", display: "flex", gap: 10 }}>
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
        {newGroupModal && (
          <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setNewGroupModal(false)}>
            <div style={{ background: "#fff", borderRadius: 20, width: "90%", maxWidth: 360, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
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

        {/* 연락처 카드 전송 모달 */}
        {contactPickModal && (
          <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            onClick={() => setContactPickModal(false)}>
            <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, overflow: "hidden", maxHeight: "60vh", display: "flex", flexDirection: "column" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ background: "#1B2B4B", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>연락처 공유</span>
                <button onClick={() => setContactPickModal(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 20, cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {friends.map(f => (
                  <div key={f.uid} onClick={() => sendContact(f)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <Avatar name={f.name} photo={f.photo} size={40} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{f.name}</div>
                      {f.position && <div style={{ fontSize: 12, color: "#6b7280" }}>{f.position}</div>}
                    </div>
                    {f.phone && <span style={{ fontSize: 12, color: "#9ca3af" }}>{f.phone}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 공지 입력 모달 */}
        {showNoticeInput && (
          <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setShowNoticeInput(false)}>
            <div style={{ background: "#fff", borderRadius: 16, width: "90%", maxWidth: 360, padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1B2B4B", marginBottom: 12 }}>공지사항 전송</div>
              <textarea value={noticeInput} onChange={e => setNoticeInput(e.target.value)}
                placeholder="공지 내용을 입력하세요..."
                rows={4} autoFocus
                style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={() => setShowNoticeInput(false)}
                  style={{ flex: 1, padding: "10px 0", background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>취소</button>
                <button onClick={sendNotice} disabled={!noticeInput.trim()}
                  style={{ flex: 1, padding: "10px 0", background: "#1B2B4B", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: noticeInput.trim() ? 1 : 0.4 }}>전송</button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

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
        }}>
          {panelContent}
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
              {profileView.position && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>{profileView.position}</div>}
              {profileView.statusMsg && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>{profileView.statusMsg}</div>
              )}
            </div>
            {/* 연락처 정보 */}
            {(profileView.phone || profileView.email) && (
              <div style={{ padding: "12px 20px 0", borderBottom: "1px solid #f3f4f6" }}>
                {profileView.phone && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12 }}>
                    <span style={{ color: "#6b7280", fontWeight: 600 }}>전화번호</span>
                    <a href={`tel:${profileView.phone}`} style={{ color: "#1B2B4B", fontWeight: 600, textDecoration: "none" }}>{profileView.phone}</a>
                  </div>
                )}
                {profileView.email && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12 }}>
                    <span style={{ color: "#6b7280", fontWeight: 600 }}>이메일</span>
                    <span style={{ color: "#374151", fontWeight: 500 }}>{profileView.email}</span>
                  </div>
                )}
              </div>
            )}
            <div style={{ padding: "12px 20px 16px", display: "flex", gap: 10 }}>
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

      {/* 연락처 카드 전송 모달 */}
      {contactPickModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setContactPickModal(false)}>
          <div style={{ background: "#fff", borderRadius: 20, width: 320, maxHeight: 480, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ background: "#1B2B4B", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>연락처 공유</span>
              <button onClick={() => setContactPickModal(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {friends.map(f => (
                <div key={f.uid} onClick={() => sendContact(f)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <Avatar name={f.name} photo={f.photo} size={40} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{f.name}</div>
                    {f.position && <div style={{ fontSize: 12, color: "#6b7280" }}>{f.position}</div>}
                  </div>
                  {f.phone && <span style={{ fontSize: 12, color: "#9ca3af" }}>{f.phone}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 공지 입력 모달 */}
      {showNoticeInput && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowNoticeInput(false)}>
          <div style={{ background: "#fff", borderRadius: 16, width: 320, padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1B2B4B", marginBottom: 12 }}>공지사항 전송</div>
            <textarea value={noticeInput} onChange={e => setNoticeInput(e.target.value)}
              placeholder="공지 내용을 입력하세요..." rows={4} autoFocus
              style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setShowNoticeInput(false)}
                style={{ flex: 1, padding: "10px 0", background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>취소</button>
              <button onClick={sendNotice} disabled={!noticeInput.trim()}
                style={{ flex: 1, padding: "10px 0", background: "#1B2B4B", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: noticeInput.trim() ? 1 : 0.4 }}>전송</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ════════════════ 친구 목록 뷰 ════════════════
function FriendsView({ myProfile, friends, rooms, unreadMap, totalUnread, getRoomName, getRoomPhoto, onOpenDM, onOpenRoom, onOpenProfile, onOpenPeerProfile, onNewGroup, onClose, onLeaveRoom, myUid, mobileMode, themeHdr, activeRoomId }) {
  const [tab, setTab] = useState("chats"); // chats | friends
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState(null); // { room, x, y }
  const longPressTimer = useRef(null);

  const closeContext = () => setContextMenu(null);

  // 길게 누르기 (모바일) - iOS 네이티브 메뉴 방지
  const touchInfoRef = useRef(null);
  const handleTouchStart = (room, e) => {
    const touch = e.touches[0];
    touchInfoRef.current = { x: touch.clientX, y: touch.clientY, room, fired: false };
    longPressTimer.current = setTimeout(() => {
      if (!touchInfoRef.current) return;
      touchInfoRef.current.fired = true;
      navigator.vibrate?.(60);
      setContextMenu({ room, x: touch.clientX, y: touch.clientY - 60 });
    }, 600);
  };
  const handleTouchEnd = (room) => {
    clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  // 우클릭 (PC)
  const handleContextMenu = (room, e) => {
    e.preventDefault();
    setContextMenu({ room, x: e.clientX, y: e.clientY });
  };

  const filteredFriends = search ? friends.filter(f => f.name?.includes(search) || f.email?.includes(search)) : friends;
  const filteredRooms = search ? rooms.filter(r => getRoomName(r)?.includes(search)) : rooms;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 헤더 */}
      <div style={{ background: themeHdr, padding: "14px 16px 0", flexShrink: 0 }}>
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
              <div key={room.id}
                onClick={() => { if (!touchInfoRef.current?.fired) onOpenRoom(room); }}
                onContextMenu={e => handleContextMenu(room, e)}
                onTouchStart={e => handleTouchStart(room, e)}
                onTouchEnd={() => handleTouchEnd(room)}
                onTouchMove={() => { clearTimeout(longPressTimer.current); longPressTimer.current = null; }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", borderBottom: "1px solid #f3f4f6", transition: "background 0.1s", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", background: room.id === activeRoomId ? "#eff6ff" : "transparent" }}
                onMouseEnter={e => { if (room.id !== activeRoomId) e.currentTarget.style.background = "#f8fafc"; }}
                onMouseLeave={e => { e.currentTarget.style.background = room.id === activeRoomId ? "#eff6ff" : "transparent"; }}>
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

      {/* ─── 컨텍스트 메뉴 (우클릭/길게 누르기) ─── */}
      {contextMenu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 100001 }} onClick={closeContext} />
          <div style={{
            position: "fixed",
            left: Math.min(contextMenu.x, window.innerWidth - 200),
            top: Math.min(contextMenu.y, window.innerHeight - 160),
            zIndex: 100002,
            background: "#fff", borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            border: "1px solid #e5e7eb",
            overflow: "hidden", minWidth: 180,
          }}>
            {[
              {
                label: "대화 입장",
                icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
                action: () => { onOpenRoom(contextMenu.room); closeContext(); },
                color: "#111827",
              },
              {
                label: "채팅방 나가기",
                icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
                action: () => { onLeaveRoom(contextMenu.room.id); closeContext(); },
                color: "#ef4444",
              },
            ].map((item) => (
              <button key={item.label} onClick={item.action}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 16px", background: "none", border: "none", cursor: "pointer", color: item.color, fontSize: 13, fontWeight: 600, textAlign: "left" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                onMouseLeave={e => e.currentTarget.style.background = "none"}>
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════ 채팅 뷰 ════════════════
function ChatView({ room, roomName, roomPhoto, messages, myUid, myProfile, input, setInput, onSend, onBack, onClose, editMsg, setEditMsg, editText, setEditText, onSaveEdit, onDeleteMsg, msgSearch, setMsgSearch, msgContainerRef, inputRef, onSendImage, onSendFile, onSendLocation, onSendContact, onSendNotice, fileUploading, friends, mobileMode, themeHdr, themeMyBubble, themeChatBg }) {
  const [showSearch, setShowSearch] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [imgPreview, setImgPreview] = useState(null);
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 헤더 */}
      <div style={{ background: themeHdr, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
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
      <div ref={msgContainerRef} style={{ flex: 1, overflowY: "auto", padding: "12px 12px 8px", display: "flex", flexDirection: "column", gap: 2, scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent", background: themeChatBg }}>
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
                      ) : msg.type === "notice" ? (
                        <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 12, padding: "10px 14px", maxWidth: 240 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#d97706", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>공지사항</div>
                          <div style={{ fontSize: 13, color: "#111827", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.text}</div>
                        </div>
                      ) : msg.type === "image" ? (
                        <div style={{ borderRadius: 12, overflow: "hidden", maxWidth: 200 }}>
                          <img src={msg.imageUrl} style={{ width: "100%", display: "block", cursor: "pointer" }}
                            onClick={() => setImgPreview(msg.imageUrl)} />
                        </div>
                      ) : msg.type === "file" ? (
                        <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, background: isMine ? themeMyBubble : "#fff", border: isMine ? "none" : "1px solid #e5e7eb", maxWidth: 220, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: isMine ? "rgba(255,255,255,0.15)" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isMine ? "#fff" : "#1B2B4B"} strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: isMine ? "#fff" : "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg.fileName}</div>
                              <div style={{ fontSize: 10, color: isMine ? "rgba(255,255,255,0.6)" : "#9ca3af", marginTop: 2 }}>{msg.fileSize ? `${(msg.fileSize / 1024).toFixed(1)} KB` : ""}</div>
                            </div>
                          </div>
                        </a>
                      ) : msg.type === "location" ? (
                        <a href={msg.text} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                          <div style={{ borderRadius: 12, overflow: "hidden", width: 180, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
                            <div style={{ background: "#1B2B4B", padding: "28px 16px", textAlign: "center" }}>
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            </div>
                            <div style={{ background: "#fff", padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#1B2B4B", textAlign: "center", borderTop: "1px solid #e5e7eb" }}>
                              위치 보기
                            </div>
                          </div>
                        </a>
                      ) : msg.type === "contact" ? (
                        <div style={{ background: isMine ? themeMyBubble : "#fff", border: isMine ? "none" : "1px solid #e5e7eb", borderRadius: 14, padding: "12px 14px", minWidth: 160, maxWidth: 220, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${isMine ? "rgba(255,255,255,0.15)" : "#f3f4f6"}` }}>
                            <Avatar name={msg.contactName} photo={msg.contactPhoto} size={36} />
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: isMine ? "#fff" : "#111827" }}>{msg.contactName}</div>
                              {msg.contactPosition && <div style={{ fontSize: 11, color: isMine ? "rgba(255,255,255,0.6)" : "#9ca3af" }}>{msg.contactPosition}</div>}
                            </div>
                          </div>
                          {msg.contactPhone && (
                            <a href={`tel:${msg.contactPhone}`} style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isMine ? "rgba(255,255,255,0.7)" : "#6b7280"} strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.19h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 17z"/></svg>
                              <span style={{ fontSize: 12, color: isMine ? "rgba(255,255,255,0.8)" : "#1B2B4B", fontWeight: 600 }}>{msg.contactPhone}</span>
                            </a>
                          )}
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
                            background: isMine ? themeMyBubble : "#fff",
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
                          {/* 읽음 표시 */}
                          {isMine && msg.type !== "deleted" && (() => {
                            const total = msg.totalMembers || room.members?.length || 1;
                            const readCount = (msg.readBy || []).length;
                            const unreadCount = total - readCount;
                            if (unreadCount > 0) {
                              return <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, whiteSpace: "nowrap" }}>{unreadCount}</span>;
                            }
                            return <span style={{ fontSize: 10, color: "#6b7280", whiteSpace: "nowrap" }}>읽음</span>;
                          })()}
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
        <div />
      </div>

      {/* + 첨부 메뉴 */}
      {showAttachMenu && (
        <div style={{ padding: "10px 12px", background: "#f8fafc", borderTop: "1px solid #e5e7eb", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* 사진: label+input (iOS Safari 호환) */}
          <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 14px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, cursor: "pointer", color: "#1B2B4B", minWidth: 60 }}
            onClick={() => setShowAttachMenu(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span style={{ fontSize: 11, fontWeight: 600 }}>사진</span>
            <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) onSendImage(f); e.target.value = ""; }} />
          </label>
          {/* 파일: label+input */}
          <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 14px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, cursor: "pointer", color: "#1B2B4B", minWidth: 60 }}
            onClick={() => setShowAttachMenu(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span style={{ fontSize: 11, fontWeight: 600 }}>파일</span>
            <input ref={fileInputRef} type="file" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) onSendFile(f); e.target.value = ""; }} />
          </label>
          {[
            { label: "위치", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>, action: () => { onSendLocation(); setShowAttachMenu(false); } },
            { label: "연락처", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>, action: () => { onSendContact(); setShowAttachMenu(false); } },
            { label: "공지", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>, action: () => { onSendNotice(); setShowAttachMenu(false); } },
          ].map(item => (
            <button key={item.label} onClick={item.action}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 14px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, cursor: "pointer", color: "#1B2B4B", minWidth: 60 }}>
              {item.icon}
              <span style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 입력창 */}
      <div style={{ padding: "8px 12px 12px", background: "#fff", borderTop: showAttachMenu ? "none" : "1px solid #e5e7eb", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 20, padding: "6px 6px 6px 4px" }}>
          {/* + 버튼 - onTouchStart preventDefault로 iOS 키보드 유지 */}
          <button
            onMouseDown={e => e.preventDefault()}
            onTouchStart={e => e.preventDefault()}
            onTouchEnd={e => { e.stopPropagation(); setShowAttachMenu(p => !p); }}
            onClick={() => setShowAttachMenu(p => !p)}
            style={{ width: 32, height: 32, borderRadius: "50%", background: showAttachMenu ? "#1B2B4B" : "none", border: "none", color: showAttachMenu ? "#fff" : "#6b7280", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s", marginLeft: 2 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          {(fileUploading) && <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>업로드 중...</span>}
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder="메시지 입력..."
            rows={1}
            style={{ flex: 1, background: "none", border: "none", outline: "none", resize: "none", fontSize: 13, color: "#111827", maxHeight: 90, overflowY: "auto", lineHeight: 1.5 }}
          />
          <button
            onMouseDown={e => e.preventDefault()}
            onTouchStart={e => e.preventDefault()}
            onTouchEnd={e => { e.stopPropagation(); if (input.trim()) onSend(); }}
            onClick={onSend}
            disabled={!input.trim()}
            style={{
              width: 32, height: 32, borderRadius: "50%", background: input.trim() ? themeMyBubble : "#e5e7eb",
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

      {/* 이미지 미리보기 모달 */}
      {imgPreview && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200000, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
          onClick={() => setImgPreview(null)}
          onKeyDown={e => {
            if (e.key === "Escape") setImgPreview(null);
            if ((e.ctrlKey || e.metaKey) && e.key === "c") {
              fetch(imgPreview).then(r => r.blob()).then(blob => {
                navigator.clipboard?.write?.([new ClipboardItem({ [blob.type]: blob })]).catch(() => {});
              }).catch(() => {});
            }
          }}
          tabIndex={0}
          ref={el => el?.focus()}
        >
          <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 10 }} onClick={e => e.stopPropagation()}>
            <a href={imgPreview} download target="_blank" rel="noopener noreferrer"
              style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              저장
            </a>
            <button
              onClick={() => {
                fetch(imgPreview).then(r => r.blob()).then(blob => {
                  navigator.clipboard?.write?.([new ClipboardItem({ [blob.type]: blob })]).then(() => {
                    alert("이미지가 복사되었습니다.");
                  }).catch(() => alert("이 브라우저에서는 복사가 지원되지 않습니다."));
                }).catch(() => {});
              }}
              style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              복사
            </button>
            <button onClick={() => setImgPreview(null)}
              style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              닫기
            </button>
          </div>
          <img src={imgPreview} style={{ maxWidth: "90vw", maxHeight: "80vh", borderRadius: 12, objectFit: "contain" }}
            onClick={e => e.stopPropagation()} />
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 12 }}>Ctrl+C 복사 · ESC 닫기</div>
        </div>
      )}
    </div>
  );
}

// ════════════════ 내 프로필 뷰 ════════════════
function ProfileView({ myProfile, editingProfile, editName, editStatusMsg, editPosition, editPhone, setEditName, setEditStatusMsg, setEditPosition, setEditPhone, onEdit, onSave, onCancel, onBack, onClose, onPhotoUpload, photoUploading, photoFileRef, themeHdr }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ background: themeHdr || "#1B2B4B", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
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
            <input ref={photoFileRef} type="file" accept="image/*" style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) onPhotoUpload(f); e.target.value = ""; }} />
          </div>
          {editingProfile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", width: "100%" }}>
              <input value={editName} onChange={e => setEditName(e.target.value)}
                placeholder="이름"
                style={{ textAlign: "center", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 10, padding: "6px 12px", color: "#fff", fontSize: 16, fontWeight: 700, outline: "none", width: "80%" }} />
              <input value={editStatusMsg} onChange={e => setEditStatusMsg(e.target.value)}
                placeholder="상태 메시지..."
                style={{ textAlign: "center", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "5px 12px", color: "rgba(255,255,255,0.8)", fontSize: 13, outline: "none", width: "80%" }} />
              <input value={editPosition} onChange={e => setEditPosition(e.target.value)}
                placeholder="직책 (예: 팀장, 과장...)"
                style={{ textAlign: "center", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "5px 12px", color: "rgba(255,255,255,0.8)", fontSize: 13, outline: "none", width: "80%" }} />
              <input value={editPhone} onChange={e => setEditPhone(e.target.value)}
                placeholder="전화번호"
                style={{ textAlign: "center", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "5px 12px", color: "rgba(255,255,255,0.8)", fontSize: 13, outline: "none", width: "80%" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button onClick={onSave} style={{ background: "#fff", color: "#1B2B4B", border: "none", borderRadius: 10, padding: "6px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>저장</button>
                <button onClick={onCancel} style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 10, padding: "6px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>취소</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{myProfile?.name || "이름 없음"}</div>
              {myProfile?.position && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>{myProfile.position}</div>}
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
            {[
              ["이메일", myProfile?.email || ""],
              ["회사", myProfile?.company || ""],
              ["직책", myProfile?.position || "-"],
              ["전화번호", myProfile?.phone || "-"],
            ].map(([label, value], idx, arr) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: idx < arr.length - 1 ? "1px solid #e5e7eb" : "none" }}>
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
