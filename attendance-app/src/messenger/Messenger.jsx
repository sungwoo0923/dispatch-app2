import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  collection, addDoc, onSnapshot, query, limit,
  serverTimestamp, doc, setDoc, getDoc, updateDoc,
  getDocs, where, arrayUnion, arrayRemove, increment,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";

const ROOMS_COLL = "chat_rooms";
const MSGS_COLL = "chat_messages";
const PROFILES_COLL = "chat_profiles";

// KP-Work 블루/화이트 팔레트에 맞춘 메신저 테마 (KP-Flow 메신저의 기능/구성을
// 그대로 가져오되 색감만 이 프로그램에 맞게 재적용했다).
const HDR_GRADIENT = "linear-gradient(135deg, #3b82f6, #1d4ed8)";
const ACCENT = "#1d4ed8";
const ACCENT_HOVER = "#1e40af";
const MY_BUBBLE = "#2563eb";
const CHAT_BG = "#eff6ff";

function fmtTime(ts) {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function fmtDate(ts) {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}
function fmtLastMsg(ts) {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "방금";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= today) return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function Avatar({ name = "", photo = "", size = 36, bgColor = ACCENT }) {
  const [err, setErr] = useState(false);
  if (photo && !err) {
    return (
      <img
        src={photo}
        onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: "30%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "30%", background: bgColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.38, fontWeight: 700, color: "white", flexShrink: 0,
        textTransform: "uppercase",
      }}
    >
      {(name || "?").charAt(0)}
    </div>
  );
}

export default function Messenger({ mobileMode = false, mobileVisible = false, onClose, onUnreadChange, controlledOpen, onOpenChange }) {
  const { user, profile } = useAuth();
  const confirm = useConfirm();
  const myUid = user?.uid || "";
  const myEmail = user?.email || "";
  const company = profile?.companyId || "";

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v) => {
    const val = typeof v === "function" ? v(open) : v;
    if (onOpenChange) onOpenChange(val);
    else setInternalOpen(val);
  };
  const [view, setView] = useState("friends"); // friends | chat | profile
  const [myProfile, setMyProfile] = useState(null);
  const [friends, setFriends] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [unreadMap, setUnreadMap] = useState({});
  const [editMsg, setEditMsg] = useState(null);
  const [editText, setEditText] = useState("");
  const [profileView, setProfileView] = useState(null);
  const [newGroupModal, setNewGroupModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState([]);
  const [msgSearch, setMsgSearch] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);

  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editStatusMsg, setEditStatusMsg] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const [fileUploading, setFileUploading] = useState(false);
  const [contactPickModal, setContactPickModal] = useState(false);
  const [noticeInput, setNoticeInput] = useState("");
  const [showNoticeInput, setShowNoticeInput] = useState(false);
  const [pendingRoom, setPendingRoom] = useState(null);
  const [replyTo, setReplyTo] = useState(null);

  const msgUnsub = useRef(null);
  const inputRef = useRef(null);
  const photoFileRef = useRef(null);
  const prevUnreadRef = useRef(0);
  const isVisibleRef = useRef(false);

  useEffect(() => {
    if (!myUid) return;
    const unsub = onSnapshot(doc(db, PROFILES_COLL, myUid), (snap) => {
      if (snap.exists()) {
        setMyProfile(snap.data());
      } else {
        getDoc(doc(db, "users", myUid)).then((userSnap) => {
          const u = userSnap.exists() ? userSnap.data() : {};
          const defaultProfile = {
            uid: myUid, email: myEmail, company,
            role: u.role || "employee",
            name: u.name || myEmail.split("@")[0] || "나",
            statusMsg: "", photo: "",
            position: u.position || "",
            phone: u.phone || "",
            createdAt: serverTimestamp(),
          };
          setDoc(doc(db, PROFILES_COLL, myUid), defaultProfile);
          setMyProfile(defaultProfile);
        }).catch(() => {});
      }
    });
    return unsub;
  }, [myUid]);

  useEffect(() => {
    // 회사 전체 구성원(관리자+직원) 목록을 직접 담은 users 컬렉션은 근로자
    // 개인정보(주민번호/계좌 등)를 포함하므로 규칙상 관리자만 list할 수
    // 있다. 그래서 친구목록은 이름/직책/연락처 정도만 담은 chat_profiles를
    // 대신 조회한다 — 이 문서는 로그인 시점에 useAuth에서 전 사용자에게
    // 자동 생성되므로 메신저를 한 번도 안 연 사람도 목록에 뜬다.
    if (!company) return;
    const unsub = onSnapshot(
      query(collection(db, PROFILES_COLL), where("company", "==", company)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ uid: d.id, ...d.data() }))
          .filter((p) => p.uid !== myUid && !p.deleted)
          .map((p) => ({
            uid: p.uid,
            email: p.email || "",
            name: p.name || p.email?.split("@")[0] || p.uid,
            photo: p.photo || "",
            statusMsg: p.statusMsg || "",
            position: p.position || "",
            phone: p.phone || "",
            company,
          }));
        setFriends(list);
      }
    );
    return unsub;
  }, [company, myUid]);

  useEffect(() => {
    if (!myUid) return;
    const q = query(collection(db, ROOMS_COLL), where("members", "array-contains", myUid));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.lastAt?.toMillis?.() || 0) - (a.lastAt?.toMillis?.() || 0));
      setRooms(list);
    });
    return unsub;
  }, [myUid]);

  useEffect(() => {
    if (msgUnsub.current) { msgUnsub.current(); msgUnsub.current = null; }
    if (!activeRoom) { setMessages([]); return; }
    const q = query(collection(db, MSGS_COLL), where("roomId", "==", activeRoom.id), limit(300));
    msgUnsub.current = onSnapshot(q, (snap) => {
      const serverMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
      setMessages((prev) => {
        const pendingOpt = prev.filter((m) => m._optimistic && !serverMsgs.some(
          (r) => r.senderUid === m.senderUid && r.text === m.text &&
            Math.abs((r.createdAt?.toMillis?.() || 0) - (m.createdAt?.toMillis?.() || 0)) < 15000
        ));
        return [...serverMsgs, ...pendingOpt].sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
      });
      if (isVisibleRef.current) markRead(activeRoom.id);
    });
    return () => { if (msgUnsub.current) msgUnsub.current(); };
  }, [activeRoom?.id]);

  const msgContainerRef = useRef(null);
  useEffect(() => {
    const el = msgContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (view === "chat" && !mobileMode) inputRef.current?.focus();
  }, [view]);

  useEffect(() => {
    if (!myUid || !rooms.length) return;
    const map = {};
    rooms.forEach((room) => {
      const myLastRead = room.lastRead?.[myUid]?.toMillis?.() || 0;
      const lastMsgAt = room.lastAt?.toMillis?.() || 0;
      map[room.id] = lastMsgAt > myLastRead && room.lastSenderUid !== myUid ? (room.unreadCount?.[myUid] || 1) : 0;
    });
    setUnreadMap(map);
  }, [rooms, myUid]);

  const totalUnread = Object.values(unreadMap).reduce((a, b) => a + b, 0);

  useEffect(() => { onUnreadChange?.(totalUnread); }, [totalUnread]);

  useEffect(() => {
    if (totalUnread > prevUnreadRef.current && "vibrate" in navigator) navigator.vibrate([100, 60, 100]);
    prevUnreadRef.current = totalUnread;
  }, [totalUnread]);

  useEffect(() => {
    const visible = mobileMode ? (mobileVisible && view === "chat") : (open && activeRoom !== null);
    isVisibleRef.current = visible;
    if (visible && activeRoom) markRead(activeRoom.id);
  }, [open, view, mobileVisible, mobileMode, activeRoom?.id]);

  const markRead = useCallback(async (roomId) => {
    if (!myUid || !roomId) return;
    await updateDoc(doc(db, ROOMS_COLL, roomId), {
      [`lastRead.${myUid}`]: serverTimestamp(),
      [`unreadCount.${myUid}`]: 0,
    }).catch(() => {});
    setUnreadMap((prev) => ({ ...prev, [roomId]: 0 }));
    getDocs(query(collection(db, MSGS_COLL), where("roomId", "==", roomId), limit(50))).then((snap) => {
      snap.docs.forEach((d) => {
        const readBy = d.data().readBy || [];
        if (!readBy.includes(myUid)) updateDoc(d.ref, { readBy: arrayUnion(myUid) }).catch(() => {});
      });
    }).catch(() => {});
  }, [myUid]);

  const openDM = (friend) => {
    const existing = rooms.find((r) => r.type === "dm" && r.members.includes(friend.uid) && r.members.length === 2);
    if (existing) { setActiveRoom(existing); setPendingRoom(null); if (mobileMode) setView("chat"); return; }
    setActiveRoom(null);
    setPendingRoom({
      displayName: friend.name,
      displayPhoto: friend.photo || "",
      roomData: {
        type: "dm",
        members: [myUid, friend.uid],
        memberProfiles: {
          [myUid]: { name: myProfile?.name || myEmail.split("@")[0], photo: myProfile?.photo || "" },
          [friend.uid]: { name: friend.name, photo: friend.photo || "" },
        },
        company, lastMsg: "", lastAt: serverTimestamp(), lastSenderUid: "",
        [`lastRead.${myUid}`]: serverTimestamp(), [`unreadCount.${myUid}`]: 0,
      },
    });
    if (mobileMode) setView("chat");
  };

  const openSelf = () => {
    const existing = rooms.find((r) => r.type === "self" && r.members?.includes(myUid) && r.members.length === 1);
    if (existing) { setActiveRoom(existing); setPendingRoom(null); if (mobileMode) setView("chat"); return; }
    setActiveRoom(null);
    setPendingRoom({
      displayName: "나에게",
      displayPhoto: myProfile?.photo || "",
      roomData: {
        type: "self",
        members: [myUid],
        memberProfiles: { [myUid]: { name: myProfile?.name || "나", photo: myProfile?.photo || "" } },
        company, lastMsg: "", lastAt: serverTimestamp(), lastSenderUid: "",
        [`lastRead.${myUid}`]: serverTimestamp(), [`unreadCount.${myUid}`]: 0,
      },
    });
    if (mobileMode) setView("chat");
  };

  const createGroup = async () => {
    if (!groupName.trim() || groupMembers.length === 0) return;
    const allMembers = [myUid, ...groupMembers];
    const profiles = { [myUid]: { name: myProfile?.name || myEmail.split("@")[0], photo: myProfile?.photo || "" } };
    groupMembers.forEach((uid) => {
      const f = friends.find((x) => x.uid === uid);
      if (f) profiles[uid] = { name: f.name, photo: f.photo || "" };
    });
    const roomRef = await addDoc(collection(db, ROOMS_COLL), {
      type: "group", name: groupName.trim(), members: allMembers, memberProfiles: profiles,
      company, createdBy: myUid, lastMsg: "", lastAt: serverTimestamp(), lastSenderUid: "",
    });
    setActiveRoom({ id: roomRef.id, type: "group", name: groupName.trim(), members: allMembers });
    setGroupName(""); setGroupMembers([]); setNewGroupModal(false); setView("chat");
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    if (!activeRoom && !pendingRoom) return;
    const text = input.trim();
    setInput("");
    const senderName = myProfile?.name || myEmail.split("@")[0];
    const now = new Date();
    const replyData = replyTo ? { replyToId: replyTo.id, replyToText: replyTo.text?.slice(0, 80) || "", replyToSender: replyTo.senderName } : {};
    if (replyTo) setReplyTo(null);

    let room = activeRoom;
    if (!room && pendingRoom) {
      try {
        const roomRef = await addDoc(collection(db, ROOMS_COLL), pendingRoom.roomData);
        room = { id: roomRef.id, ...pendingRoom.roomData };
        setActiveRoom(room); setPendingRoom(null);
      } catch { return; }
    }
    if (!room) return;

    const tempId = `_opt_${Date.now()}`;
    setMessages((prev) => [...prev, {
      id: tempId, _optimistic: true,
      roomId: room.id, text, type: "text",
      senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
      createdAt: { toMillis: () => now.getTime(), toDate: () => now },
      edited: false, readBy: [myUid],
      totalMembers: room.members?.length || 1,
      ...replyData,
    }]);

    const others = room.members?.filter((uid) => uid !== myUid) || [];
    addDoc(collection(db, MSGS_COLL), {
      roomId: room.id, text, type: "text",
      senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
      createdAt: serverTimestamp(), edited: false,
      readBy: [myUid], totalMembers: room.members?.length || 1,
      ...replyData,
    }).catch(() => {});
    const unreadUpdate = {};
    others.forEach((uid) => { unreadUpdate[`unreadCount.${uid}`] = increment(1); });
    updateDoc(doc(db, ROOMS_COLL, room.id), {
      lastMsg: text, lastAt: serverTimestamp(), lastSenderUid: myUid,
      [`lastRead.${myUid}`]: serverTimestamp(), ...unreadUpdate,
    }).catch(() => {});
  };

  const ensureRoom = async () => {
    let room = activeRoom;
    if (!room && pendingRoom) {
      const roomRef = await addDoc(collection(db, ROOMS_COLL), pendingRoom.roomData);
      room = { id: roomRef.id, ...pendingRoom.roomData };
      setActiveRoom(room); setPendingRoom(null);
    }
    return room;
  };

  const sendImage = async (file) => {
    if (!file) return;
    const room = await ensureRoom().catch(() => null);
    if (!room) return;
    const path = `chat_images/${room.id}/${Date.now()}_${file.name}`;
    const snap = await uploadBytes(storageRef(storage, path), file);
    const url = await getDownloadURL(snap.ref);
    const senderName = myProfile?.name || myEmail.split("@")[0];
    await addDoc(collection(db, MSGS_COLL), {
      roomId: room.id, text: "", type: "image", imageUrl: url,
      senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
      createdAt: serverTimestamp(), readBy: [myUid], totalMembers: room.members?.length || 1,
    });
    const others = room.members?.filter((uid) => uid !== myUid) || [];
    const upd = {};
    others.forEach((uid) => { upd[`unreadCount.${uid}`] = increment(1); });
    await updateDoc(doc(db, ROOMS_COLL, room.id), {
      lastMsg: "[사진]", lastAt: serverTimestamp(), lastSenderUid: myUid,
      [`lastRead.${myUid}`]: serverTimestamp(), ...upd,
    }).catch(() => {});
  };

  const sendFile = async (file) => {
    if (!file) return;
    const room = await ensureRoom().catch(() => null);
    if (!room) return;
    setFileUploading(true);
    try {
      const path = `chat_files/${room.id}/${Date.now()}_${file.name}`;
      const snap = await uploadBytes(storageRef(storage, path), file);
      const url = await getDownloadURL(snap.ref);
      const senderName = myProfile?.name || myEmail.split("@")[0];
      const others = room.members?.filter((u) => u !== myUid) || [];
      await addDoc(collection(db, MSGS_COLL), {
        roomId: room.id, text: file.name, type: "file",
        fileUrl: url, fileName: file.name, fileSize: file.size,
        senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
        createdAt: serverTimestamp(), readBy: [myUid], totalMembers: room.members?.length || 1,
      });
      const upd = {};
      others.forEach((u) => { upd[`unreadCount.${u}`] = increment(1); });
      await updateDoc(doc(db, ROOMS_COLL, room.id), {
        lastMsg: `[파일] ${file.name}`, lastAt: serverTimestamp(), lastSenderUid: myUid,
        [`lastRead.${myUid}`]: serverTimestamp(), ...upd,
      }).catch(() => {});
    } catch (e) { console.error(e); }
    setFileUploading(false);
  };

  const sendLocation = () => {
    if (!activeRoom) return;
    if (!navigator.geolocation) { alert("위치 기능을 지원하지 않는 브라우저입니다."); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude.toFixed(6);
      const lng = pos.coords.longitude.toFixed(6);
      const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
      const senderName = myProfile?.name || myEmail.split("@")[0];
      const others = activeRoom.members?.filter((u) => u !== myUid) || [];
      await addDoc(collection(db, MSGS_COLL), {
        roomId: activeRoom.id, text: mapsUrl, type: "location", lat, lng,
        senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
        createdAt: serverTimestamp(), readBy: [myUid], totalMembers: activeRoom.members?.length || 1,
      });
      const upd = {};
      others.forEach((u) => { upd[`unreadCount.${u}`] = increment(1); });
      await updateDoc(doc(db, ROOMS_COLL, activeRoom.id), {
        lastMsg: "[위치]", lastAt: serverTimestamp(), lastSenderUid: myUid,
        [`lastRead.${myUid}`]: serverTimestamp(), ...upd,
      }).catch(() => {});
    }, () => alert("위치 정보를 가져올 수 없습니다."));
  };

  const sendContact = async (friend) => {
    if (!friend || !activeRoom) return;
    const senderName = myProfile?.name || myEmail.split("@")[0];
    const others = activeRoom.members?.filter((u) => u !== myUid) || [];
    await addDoc(collection(db, MSGS_COLL), {
      roomId: activeRoom.id, text: friend.name, type: "contact",
      contactName: friend.name, contactPhone: friend.phone || "",
      contactPosition: friend.position || "", contactPhoto: friend.photo || "", contactUid: friend.uid,
      senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
      createdAt: serverTimestamp(), readBy: [myUid], totalMembers: activeRoom.members?.length || 1,
    });
    const upd = {};
    others.forEach((u) => { upd[`unreadCount.${u}`] = increment(1); });
    await updateDoc(doc(db, ROOMS_COLL, activeRoom.id), {
      lastMsg: `[연락처] ${friend.name}`, lastAt: serverTimestamp(), lastSenderUid: myUid,
      [`lastRead.${myUid}`]: serverTimestamp(), ...upd,
    }).catch(() => {});
    setContactPickModal(false);
  };

  const sendNotice = async () => {
    if (!noticeInput.trim() || !activeRoom) return;
    const text = noticeInput.trim();
    setNoticeInput(""); setShowNoticeInput(false);
    const senderName = myProfile?.name || myEmail.split("@")[0];
    const others = activeRoom.members?.filter((u) => u !== myUid) || [];
    await addDoc(collection(db, MSGS_COLL), {
      roomId: activeRoom.id, text, type: "notice",
      senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
      createdAt: serverTimestamp(), readBy: [myUid], totalMembers: activeRoom.members?.length || 1,
    });
    const upd = {};
    others.forEach((u) => { upd[`unreadCount.${u}`] = increment(1); });
    await updateDoc(doc(db, ROOMS_COLL, activeRoom.id), {
      lastMsg: `[공지] ${text}`, lastAt: serverTimestamp(), lastSenderUid: myUid,
      [`lastRead.${myUid}`]: serverTimestamp(), ...upd,
    }).catch(() => {});
  };

  const addReaction = async (msgId, emoji) => {
    if (!myUid || !msgId) return;
    const msgRef = doc(db, MSGS_COLL, msgId);
    const snap = await getDoc(msgRef).catch(() => null);
    if (!snap?.exists()) return;
    const reactions = snap.data().reactions || {};
    const emojiUsers = reactions[emoji] || [];
    const already = emojiUsers.includes(myUid);
    const newList = already ? emojiUsers.filter((u) => u !== myUid) : [...emojiUsers, myUid];
    const newReactions = { ...reactions, [emoji]: newList };
    if (newList.length === 0) delete newReactions[emoji];
    await updateDoc(msgRef, { reactions: newReactions }).catch(() => {});
  };

  const sendToSelf = async (text) => {
    if (!myUid || !text) return;
    let selfRoom = rooms.find((r) => r.type === "self" && r.members?.includes(myUid));
    if (!selfRoom) {
      const ref = await addDoc(collection(db, ROOMS_COLL), {
        type: "self", members: [myUid],
        memberProfiles: { [myUid]: { name: myProfile?.name || "", photo: myProfile?.photo || "" } },
        createdAt: serverTimestamp(), lastMsg: text, lastAt: serverTimestamp(), lastSenderUid: myUid,
      });
      selfRoom = { id: ref.id };
    }
    await addDoc(collection(db, MSGS_COLL), {
      roomId: selfRoom.id, text, type: "text",
      senderUid: myUid, senderName: myProfile?.name || "나", senderPhoto: myProfile?.photo || "",
      createdAt: serverTimestamp(), readBy: [myUid], totalMembers: 1,
    });
  };

  const leaveRoom = async (roomId) => {
    if (!(await confirm("채팅방에서 나가시겠습니까?\n나가면 대화 내용이 삭제됩니다.", "delete"))) return;
    await updateDoc(doc(db, ROOMS_COLL, roomId), { members: arrayRemove(myUid) }).catch(() => {});
    if (activeRoom?.id === roomId) { setActiveRoom(null); setView("friends"); }
  };

  const saveEdit = async () => {
    if (!editMsg || !editText.trim()) return;
    await updateDoc(doc(db, MSGS_COLL, editMsg.id), { text: editText.trim(), edited: true });
    setEditMsg(null); setEditText("");
  };
  const deleteMessage = async (msgId) => {
    if (!(await confirm("메시지를 삭제하시겠습니까?", "delete"))) return;
    await updateDoc(doc(db, MSGS_COLL, msgId), { text: "(삭제된 메시지)", type: "deleted" });
  };

  const saveProfile = async () => {
    if (!myUid) return;
    await updateDoc(doc(db, PROFILES_COLL, myUid), { name: editName, statusMsg: editStatusMsg, position: editPosition, phone: editPhone });
    setEditingProfile(false);
  };

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

  const getRoomName = (room) => {
    if (!room) return "";
    if (room.type === "self") return "나에게";
    if (room.type === "dm") {
      const otherUid = room.members?.find((uid) => uid !== myUid);
      return room.memberProfiles?.[otherUid]?.name || "알 수 없음";
    }
    return room.name || "그룹";
  };
  const getRoomPhoto = (room) => {
    if (!room) return "";
    if (room.type === "self") return myProfile?.photo || "";
    if (room.type === "dm") {
      const otherUid = room.members?.find((uid) => uid !== myUid);
      return room.memberProfiles?.[otherUid]?.photo || "";
    }
    return "";
  };

  const filteredMsgs = msgSearch ? messages.filter((m) => m.text?.includes(msgSearch)) : messages;

  const PANEL_W = mobileMode ? 360 : 700;
  const PANEL_H = 580;
  const BTN_BOTTOM = 96;
  const [panelW, setPanelW] = useState(PANEL_W);
  const [panelH, setPanelH] = useState(PANEL_H);
  const resizingRef = useRef(null);
  const startResizePanelDrag = (e) => {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY, startW = panelW, startH = panelH;
    resizingRef.current = true;
    const onMove = (ev) => {
      if (!resizingRef.current) return;
      const dx = startX - ev.clientX, dy = startY - ev.clientY;
      setPanelW(Math.max(500, Math.min(1200, startW + dx)));
      setPanelH(Math.max(400, Math.min(900, startH + dy)));
    };
    const onUp = () => {
      resizingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const displayRoom = activeRoom || (pendingRoom ? {
    id: null, type: pendingRoom.roomData.type, members: pendingRoom.roomData.members, memberProfiles: pendingRoom.roomData.memberProfiles,
  } : null);

  const chatViewProps = displayRoom ? {
    room: displayRoom,
    roomName: activeRoom ? getRoomName(activeRoom) : (pendingRoom?.displayName || ""),
    roomPhoto: activeRoom ? getRoomPhoto(activeRoom) : (pendingRoom?.displayPhoto || ""),
    messages: filteredMsgs, myUid, myProfile, input, setInput, onSend: sendMessage,
    onBack: () => { setActiveRoom(null); setPendingRoom(null); if (mobileMode) setView("friends"); },
    onClose: mobileMode ? onClose : () => { setActiveRoom(null); setPendingRoom(null); },
    editMsg, setEditMsg, editText, setEditText, onSaveEdit: saveEdit, onDeleteMsg: deleteMessage,
    msgSearch, setMsgSearch, msgContainerRef, inputRef,
    onSendImage: sendImage, onSendFile: sendFile, onSendLocation: sendLocation,
    onSendContact: () => setContactPickModal(true), onSendNotice: () => setShowNoticeInput(true),
    fileUploading, friends, mobileMode,
    replyTo, setReplyTo, onReply: (msg) => setReplyTo({ id: msg.id, text: msg.text, senderName: msg.senderName }),
    onAddReaction: addReaction, onSendToSelf: sendToSelf,
  } : null;

  const friendsViewProps = {
    myProfile, friends, rooms, unreadMap, totalUnread, getRoomName, getRoomPhoto,
    onOpenDM: openDM, onOpenSelf: openSelf,
    onOpenRoom: (room) => { setActiveRoom(room); setPendingRoom(null); if (mobileMode) setView("chat"); },
    onOpenProfile: () => setView("profile"), onOpenPeerProfile: (f) => setProfileView(f),
    onNewGroup: () => setNewGroupModal(true),
    onClose: mobileMode ? onClose : () => setOpen(false),
    onLeaveRoom: leaveRoom, myUid, mobileMode,
    activeRoomId: activeRoom?.id || (pendingRoom ? "_pending_" : null),
  };

  const profileViewProps = {
    myProfile, editingProfile, editName, editStatusMsg, editPosition, editPhone,
    setEditName, setEditStatusMsg, setEditPosition, setEditPhone,
    onEdit: () => {
      setEditName(myProfile?.name || ""); setEditStatusMsg(myProfile?.statusMsg || "");
      setEditPosition(myProfile?.position || ""); setEditPhone(myProfile?.phone || ""); setEditingProfile(true);
    },
    onSave: saveProfile, onCancel: () => setEditingProfile(false), onBack: () => setView("friends"),
    onClose: mobileMode ? onClose : () => setOpen(false),
    onPhotoUpload: uploadProfilePhoto, photoUploading, photoFileRef, mobileMode,
  };

  const pcSplitContent = (
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#fff", fontFamily: "'Pretendard','Noto Sans KR',sans-serif", borderRadius: 20, overflow: "hidden", boxShadow: "0 20px 60px rgba(15,23,42,0.28)", border: "1px solid #e2e8f0" }}>
      <div style={{ width: Math.round(panelW * 240 / 700), flexShrink: 0, borderRight: "1px solid #e5e7eb", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {view === "profile" ? <ProfileView {...profileViewProps} /> : <FriendsView {...friendsViewProps} />}
      </div>
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {(activeRoom || pendingRoom) && chatViewProps ? (
          <ChatView {...chatViewProps} />
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#94a3b8", gap: 12 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            <span style={{ fontSize: 14 }}>채팅방을 선택해주세요</span>
          </div>
        )}
      </div>
    </div>
  );

  const mobileContent = (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fff", fontFamily: "'Pretendard','Noto Sans KR',sans-serif" }}>
      {view === "friends" && <FriendsView {...friendsViewProps} />}
      {view === "chat" && (activeRoom || pendingRoom) && chatViewProps && <ChatView {...chatViewProps} />}
      {view === "profile" && <ProfileView {...profileViewProps} />}
    </div>
  );

  const panelContent = mobileMode ? mobileContent : pcSplitContent;

  const sharedModals = (
    <>
      {profileView && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setProfileView(null)}>
          <div style={{ background: "#fff", borderRadius: 20, width: 280, overflow: "hidden", boxShadow: "0 20px 60px rgba(15,23,42,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: ACCENT, padding: "28px 20px 20px", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                <Avatar name={profileView.name} photo={profileView.photo} size={64} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{profileView.name}</div>
              {profileView.position && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>{profileView.position}</div>}
              {profileView.statusMsg && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 4 }}>{profileView.statusMsg}</div>}
            </div>
            {(profileView.phone || profileView.email) && (
              <div style={{ padding: "12px 20px 0", borderBottom: "1px solid #f1f5f9" }}>
                {profileView.phone && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12 }}>
                    <span style={{ color: "#64748b", fontWeight: 600 }}>전화번호</span>
                    <a href={`tel:${profileView.phone}`} style={{ color: ACCENT, fontWeight: 600, textDecoration: "none" }}>{profileView.phone}</a>
                  </div>
                )}
                {profileView.email && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12 }}>
                    <span style={{ color: "#64748b", fontWeight: 600 }}>이메일</span>
                    <span style={{ color: "#334155", fontWeight: 500 }}>{profileView.email}</span>
                  </div>
                )}
              </div>
            )}
            <div style={{ padding: "12px 20px 16px", display: "flex", gap: 10 }}>
              <button onClick={() => { openDM(profileView); setProfileView(null); }} style={{ flex: 1, padding: "9px 0", background: ACCENT, color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>1:1 대화</button>
              <button onClick={() => setProfileView(null)} style={{ flex: 1, padding: "9px 0", background: "#f1f5f9", color: "#334155", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {newGroupModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setNewGroupModal(false)}>
          <div style={{ background: "#fff", borderRadius: 20, width: "90%", maxWidth: 360, overflow: "hidden", boxShadow: "0 20px 60px rgba(15,23,42,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: ACCENT, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>단체 채팅방 만들기</span>
              <button onClick={() => setNewGroupModal(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: "20px 20px 16px" }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 5 }}>채팅방 이름 *</label>
                <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="채팅방 이름 입력"
                  style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 8 }}>멤버 선택 ({groupMembers.length}명 선택됨)</label>
              <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {friends.map((f) => {
                  const checked = groupMembers.includes(f.uid);
                  return (
                    <label key={f.uid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 10, cursor: "pointer", background: checked ? "#eff6ff" : "transparent" }}>
                      <input type="checkbox" checked={checked} onChange={() => setGroupMembers((prev) => checked ? prev.filter((u) => u !== f.uid) : [...prev, f.uid])} style={{ accentColor: ACCENT, width: 15, height: 15 }} />
                      <Avatar name={f.name} photo={f.photo} size={30} />
                      <span style={{ fontSize: 13, fontWeight: checked ? 700 : 400, color: "#1e293b" }}>{f.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div style={{ padding: "0 20px 20px", display: "flex", gap: 10 }}>
              <button onClick={() => setNewGroupModal(false)} style={{ flex: 1, padding: "10px 0", background: "#f1f5f9", color: "#334155", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>취소</button>
              <button onClick={createGroup} disabled={!groupName.trim() || groupMembers.length === 0}
                style={{ flex: 1, padding: "10px 0", background: ACCENT, color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: (!groupName.trim() || groupMembers.length === 0) ? 0.4 : 1 }}>만들기</button>
            </div>
          </div>
        </div>
      )}

      {contactPickModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: mobileMode ? "flex-end" : "center", justifyContent: "center" }} onClick={() => setContactPickModal(false)}>
          <div style={{ background: "#fff", borderRadius: mobileMode ? "20px 20px 0 0" : 20, width: mobileMode ? "100%" : 320, maxWidth: mobileMode ? 480 : 320, maxHeight: mobileMode ? "60vh" : 480, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(15,23,42,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: ACCENT, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>연락처 공유</span>
              <button onClick={() => setContactPickModal(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {friends.map((f) => (
                <div key={f.uid} onClick={() => sendContact(f)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}>
                  <Avatar name={f.name} photo={f.photo} size={40} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{f.name}</div>
                    {f.position && <div style={{ fontSize: 12, color: "#64748b" }}>{f.position}</div>}
                  </div>
                  {f.phone && <span style={{ fontSize: 12, color: "#94a3b8" }}>{f.phone}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showNoticeInput && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowNoticeInput(false)}>
          <div style={{ background: "#fff", borderRadius: 16, width: 320, padding: 20, boxShadow: "0 20px 60px rgba(15,23,42,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, color: ACCENT, marginBottom: 12 }}>공지사항 전송</div>
            <textarea value={noticeInput} onChange={(e) => setNoticeInput(e.target.value)} placeholder="공지 내용을 입력하세요..." rows={4} autoFocus
              style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setShowNoticeInput(false)} style={{ flex: 1, padding: "10px 0", background: "#f1f5f9", color: "#334155", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>취소</button>
              <button onClick={sendNotice} disabled={!noticeInput.trim()} style={{ flex: 1, padding: "10px 0", background: ACCENT, color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: noticeInput.trim() ? 1 : 0.4 }}>전송</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (mobileMode) {
    return (
      <>
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>{panelContent}</div>
        {sharedModals}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen((p) => !p)}
        title="메신저"
        style={{
          position: "fixed", bottom: BTN_BOTTOM, right: 24, zIndex: 99998,
          width: 56, height: 56, borderRadius: "50%",
          background: open ? ACCENT_HOVER : ACCENT,
          color: "white", border: "none", cursor: "pointer",
          boxShadow: "0 4px 16px rgba(15,23,42,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.2s",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        {totalUnread > 0 && !open && (
          <span style={{ position: "absolute", top: -4, right: -4, background: "#dc2626", color: "white", fontSize: 10, fontWeight: 700, borderRadius: "50%", minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: "fixed", bottom: BTN_BOTTOM + 64, right: 24, width: panelW, height: panelH, zIndex: 99997 }}>
          <div onMouseDown={startResizePanelDrag} style={{ position: "absolute", top: 0, left: 0, width: 18, height: 18, cursor: "nw-resize", zIndex: 10, borderRadius: "8px 0 8px 0", background: "rgba(29,78,216,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }} title="드래그하여 크기 조정">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 9L9 1M1 5L5 1M5 9L9 5" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" /></svg>
          </div>
          {panelContent}
        </div>
      )}
      {sharedModals}
    </>
  );
}

function FriendsView({ myProfile, friends, rooms, unreadMap, totalUnread, getRoomName, getRoomPhoto, onOpenDM, onOpenSelf, onOpenRoom, onOpenProfile, onOpenPeerProfile, onNewGroup, onClose, onLeaveRoom, myUid, mobileMode, activeRoomId }) {
  const [tab, setTab] = useState("friends");
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const longPressTimer = useRef(null);
  const touchInfoRef = useRef(null);

  const closeContext = () => setContextMenu(null);

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
  const handleTouchEnd = () => { clearTimeout(longPressTimer.current); longPressTimer.current = null; };
  const handleContextMenu = (room, e) => { e.preventDefault(); setContextMenu({ room, x: e.clientX, y: e.clientY }); };

  const filteredFriends = search ? friends.filter((f) => f.name?.includes(search) || f.email?.includes(search)) : friends;
  const filteredRooms = search ? rooms.filter((r) => getRoomName(r)?.includes(search)) : rooms;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ background: HDR_GRADIENT, padding: mobileMode ? "calc(env(safe-area-inset-top) + 14px) 16px 0" : "14px 16px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>메신저</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={onNewGroup} title="단체 채팅" style={{ background: "rgba(255,255,255,0.16)", border: "none", color: "rgba(255,255,255,0.9)", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 0 }}>✕</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 0 }}>
          {[["friends", "친구"], ["chats", "채팅"]].map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "8px 0", border: "none", cursor: "pointer", background: "none", color: tab === t ? "#fff" : "rgba(255,255,255,0.6)", fontWeight: tab === t ? 700 : 400, fontSize: 13, borderBottom: tab === t ? "2px solid #fff" : "2px solid transparent", transition: "all 0.15s" }}>
              {l}{t === "chats" && totalUnread > 0 ? <span style={{ marginLeft: 4, background: "#dc2626", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 5px", fontWeight: 700 }}>{totalUnread}</span> : ""}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "10px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tab === "chats" ? "채팅방 검색..." : "친구 검색..."}
          style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 20, padding: "6px 14px", fontSize: 12, outline: "none", boxSizing: "border-box", background: "#fff" }} />
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "chats" ? (
          filteredRooms.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>채팅방이 없습니다<br /><span style={{ fontSize: 12 }}>친구 탭에서 대화를 시작하세요</span></div>
          ) : filteredRooms.map((room) => {
            const unread = unreadMap[room.id] || 0;
            const name = getRoomName(room);
            const photo = getRoomPhoto(room);
            return (
              <div key={room.id}
                onClick={() => { if (!touchInfoRef.current?.fired) onOpenRoom(room); }}
                onContextMenu={(e) => handleContextMenu(room, e)}
                onTouchStart={(e) => handleTouchStart(room, e)}
                onTouchEnd={handleTouchEnd}
                onTouchMove={() => { clearTimeout(longPressTimer.current); longPressTimer.current = null; }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", borderBottom: "1px solid #f1f5f9", userSelect: "none", background: room.id === activeRoomId ? "#eff6ff" : "transparent" }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Avatar name={name} photo={photo} size={44} bgColor={room.type === "group" ? "#475569" : ACCENT} />
                  {room.type === "group" && (
                    <div style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16, background: ACCENT, borderRadius: "50%", border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{name}</span>
                    <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0, marginLeft: 4 }}>{fmtLastMsg(room.lastAt)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{room.lastMsg || ""}</span>
                    {unread > 0 && <span style={{ background: "#dc2626", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 20, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", flexShrink: 0, marginLeft: 4 }}>{unread > 99 ? "99+" : unread}</span>}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <>
            <div onClick={onOpenProfile} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <Avatar name={myProfile?.name || "나"} photo={myProfile?.photo} size={44} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: ACCENT }}>{myProfile?.name || "나"} <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>(나)</span></div>
                {myProfile?.statusMsg && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{myProfile.statusMsg}</div>}
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            </div>
            <div onClick={onOpenSelf} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ width: 40, height: 40, borderRadius: "30%", background: "linear-gradient(135deg, #60a5fa, #2563eb)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: ACCENT }}>나에게</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>메모, 링크, 파일 저장</div>
              </div>
            </div>
            <div style={{ padding: "8px 14px 4px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>친구 {filteredFriends.length}명</div>
            {filteredFriends.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>같은 회사 사용자가 없습니다</div>
            ) : filteredFriends.map((f) => (
              <div key={f.uid} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }} onClick={() => onOpenPeerProfile(f)}>
                <Avatar name={f.name} photo={f.photo} size={40} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{f.name}</div>
                  {f.statusMsg && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>{f.statusMsg}</div>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); onOpenDM(f); }} style={{ background: ACCENT, color: "#fff", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>대화</button>
              </div>
            ))}
          </>
        )}
      </div>

      {contextMenu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 100001 }} onClick={closeContext} />
          <div style={{ position: "fixed", left: Math.min(contextMenu.x, window.innerWidth - 200), top: Math.min(contextMenu.y, window.innerHeight - 160), zIndex: 100002, background: "#fff", borderRadius: 12, boxShadow: "0 8px 32px rgba(15,23,42,0.18)", border: "1px solid #e2e8f0", overflow: "hidden", minWidth: 180 }}>
            {[
              { label: "대화 입장", action: () => { onOpenRoom(contextMenu.room); closeContext(); }, color: "#1e293b" },
              { label: "채팅방 나가기", action: () => { onLeaveRoom(contextMenu.room.id); closeContext(); }, color: "#dc2626" },
            ].map((item) => (
              <button key={item.label} onClick={item.action} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 16px", background: "none", border: "none", cursor: "pointer", color: item.color, fontSize: 13, fontWeight: 600, textAlign: "left" }}>{item.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ChatView({ room, roomName, roomPhoto, messages, myUid, input, setInput, onSend, onBack, onClose, editMsg, setEditMsg, editText, setEditText, onSaveEdit, onDeleteMsg, msgSearch, setMsgSearch, msgContainerRef, inputRef, onSendImage, onSendFile, onSendLocation, onSendContact, onSendNotice, fileUploading, mobileMode, replyTo, setReplyTo, onReply, onAddReaction, onSendToSelf }) {
  const [showSearch, setShowSearch] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [imgPreview, setImgPreview] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [selfSentToast, setSelfSentToast] = useState(false);
  const longPressTimer = useRef(null);
  const EMOJI_LIST = ["👍", "❤️", "😆", "😮", "😢", "✅"];

  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e) => { if (!e.target.closest("[data-ctx-menu]")) setCtxMenu(null); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("touchstart", handler); };
  }, [ctxMenu]);

  const handleMsgContextMenu = (e, msg) => {
    e.preventDefault(); e.stopPropagation();
    const x = e.clientX || (e.touches?.[0]?.clientX ?? 0);
    const y = e.clientY || (e.touches?.[0]?.clientY ?? 0);
    setCtxMenu({ msg, x, y });
  };
  const startLongPress = (e, msg) => {
    if (!mobileMode) return;
    longPressTimer.current = setTimeout(() => {
      const touch = e.touches?.[0];
      if (touch) handleMsgContextMenu({ preventDefault: () => {}, stopPropagation: () => {}, clientX: touch.clientX, clientY: touch.clientY }, msg);
    }, 500);
  };
  const cancelLongPress = () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      <div style={{ background: HDR_GRADIENT, padding: mobileMode ? "calc(env(safe-area-inset-top) + 12px) 14px 12px" : "12px 14px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <Avatar name={roomName} photo={roomPhoto} size={32} bgColor={room.type === "group" ? "#475569" : ACCENT_HOVER} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{roomName}</div>
          {room.type === "group" && room.members && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>{room.members.length}명</div>}
        </div>
        <button onClick={() => setShowSearch((p) => !p)} style={{ background: "none", border: "none", color: showSearch ? "#fff" : "rgba(255,255,255,0.6)", cursor: "pointer", padding: 4 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        </button>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>

      {showSearch && (
        <div style={{ padding: "8px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
          <input value={msgSearch} onChange={(e) => setMsgSearch(e.target.value)} placeholder="메시지 검색..." autoFocus
            style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 20, padding: "5px 12px", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
        </div>
      )}

      <div ref={msgContainerRef} style={{ flex: 1, overflowY: "auto", padding: "12px 12px 8px", display: "flex", flexDirection: "column", gap: 2, background: CHAT_BG }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>대화를 시작해보세요.</div>
        )}
        {(() => {
          let prevDate = "";
          return messages.map((msg, i) => {
            const isMine = msg.senderUid === myUid;
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const isContinued = prev?.senderUid === msg.senderUid && msg.createdAt && prev.createdAt && (msg.createdAt?.toMillis?.() || 0) - (prev.createdAt?.toMillis?.() || 0) < 120000;
            const isLast = !next || next.senderUid !== msg.senderUid || (next.createdAt?.toMillis?.() || 0) - (msg.createdAt?.toMillis?.() || 0) >= 120000;
            const dateStr = msg.createdAt ? fmtDate(msg.createdAt) : "";
            const showDate = dateStr && dateStr !== prevDate;
            if (showDate) prevDate = dateStr;

            return (
              <React.Fragment key={msg.id}>
                {showDate && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 4px" }}>
                    <div style={{ flex: 1, height: 1, background: "#cbd5e1" }} />
                    <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600, whiteSpace: "nowrap" }}>{dateStr}</span>
                    <div style={{ flex: 1, height: 1, background: "#cbd5e1" }} />
                  </div>
                )}
                <div id={`msg-${msg.id}`} style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 6, marginTop: isContinued ? 1 : 8 }}>
                  {!isMine && (
                    <div style={{ width: 32, flexShrink: 0, alignSelf: "flex-end", marginBottom: 2 }}>
                      {!isContinued && <Avatar name={msg.senderName} photo={msg.senderPhoto} size={32} />}
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", maxWidth: "70%" }}>
                    {!isContinued && !isMine && <span style={{ fontSize: 11, fontWeight: 600, color: "#334155", marginBottom: 3, paddingLeft: 4 }}>{msg.senderName}</span>}
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, flexDirection: isMine ? "row-reverse" : "row" }}>
                      {msg.type === "deleted" ? (
                        <div style={{ padding: "8px 12px", borderRadius: 14, background: "#e2e8f0", fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>(삭제된 메시지)</div>
                      ) : msg.type === "notice" ? (
                        <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 12, padding: "10px 14px", maxWidth: 240 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#b45309", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>공지사항</div>
                          <div style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.text}</div>
                        </div>
                      ) : msg.type === "image" ? (
                        <div style={{ borderRadius: 12, overflow: "hidden", maxWidth: 200 }}>
                          <img src={msg.imageUrl} style={{ width: "100%", display: "block", cursor: "pointer" }} onClick={() => setImgPreview(msg.imageUrl)} />
                        </div>
                      ) : msg.type === "file" ? (
                        <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, background: isMine ? MY_BUBBLE : "#fff", border: isMine ? "none" : "1px solid #e2e8f0", maxWidth: 220, boxShadow: "0 1px 3px rgba(15,23,42,0.08)" }}>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: isMine ? "rgba(255,255,255,0.18)" : "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isMine ? "#fff" : ACCENT} strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: isMine ? "#fff" : "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg.fileName}</div>
                              <div style={{ fontSize: 10, color: isMine ? "rgba(255,255,255,0.7)" : "#94a3b8", marginTop: 2 }}>{msg.fileSize ? `${(msg.fileSize / 1024).toFixed(1)} KB` : ""}</div>
                            </div>
                          </div>
                        </a>
                      ) : msg.type === "location" ? (
                        <a href={msg.text} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                          <div style={{ borderRadius: 12, overflow: "hidden", width: 180, boxShadow: "0 1px 3px rgba(15,23,42,0.1)" }}>
                            <div style={{ background: ACCENT, padding: "28px 16px", textAlign: "center" }}>
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                            </div>
                            <div style={{ background: "#fff", padding: "8px 12px", fontSize: 12, fontWeight: 600, color: ACCENT, textAlign: "center", borderTop: "1px solid #e2e8f0" }}>위치 보기</div>
                          </div>
                        </a>
                      ) : msg.type === "contact" ? (
                        <div style={{ background: isMine ? MY_BUBBLE : "#fff", border: isMine ? "none" : "1px solid #e2e8f0", borderRadius: 14, padding: "12px 14px", minWidth: 160, maxWidth: 220, boxShadow: "0 1px 3px rgba(15,23,42,0.08)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${isMine ? "rgba(255,255,255,0.18)" : "#f1f5f9"}` }}>
                            <Avatar name={msg.contactName} photo={msg.contactPhoto} size={36} />
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: isMine ? "#fff" : "#1e293b" }}>{msg.contactName}</div>
                              {msg.contactPosition && <div style={{ fontSize: 11, color: isMine ? "rgba(255,255,255,0.7)" : "#94a3b8" }}>{msg.contactPosition}</div>}
                            </div>
                          </div>
                          {msg.contactPhone && (
                            <a href={`tel:${msg.contactPhone}`} style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isMine ? "rgba(255,255,255,0.8)" : "#64748b"} strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.19h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 17z" /></svg>
                              <span style={{ fontSize: 12, color: isMine ? "rgba(255,255,255,0.9)" : ACCENT, fontWeight: 600 }}>{msg.contactPhone}</span>
                            </a>
                          )}
                        </div>
                      ) : editMsg?.id === msg.id ? (
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onSaveEdit(); if (e.key === "Escape") setEditMsg(null); }} autoFocus
                            style={{ border: `1px solid ${ACCENT}`, borderRadius: 10, padding: "6px 10px", fontSize: 13, outline: "none", minWidth: 120 }} />
                          <button onClick={onSaveEdit} style={{ background: ACCENT, color: "#fff", border: "none", borderRadius: 8, padding: "5px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>저장</button>
                          <button onClick={() => setEditMsg(null)} style={{ background: "#e2e8f0", color: "#334155", border: "none", borderRadius: 8, padding: "5px 8px", fontSize: 11, cursor: "pointer" }}>취소</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column" }}
                          onContextMenu={mobileMode ? undefined : (e) => handleMsgContextMenu(e, msg)}
                          onTouchStart={mobileMode ? (e) => startLongPress(e, msg) : undefined}
                          onTouchEnd={mobileMode ? cancelLongPress : undefined}
                          onTouchMove={mobileMode ? cancelLongPress : undefined}>
                          {msg.replyToText && (
                            <div onClick={() => {
                              const el = document.getElementById(`msg-${msg.replyToId}`);
                              if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.style.transition = "background 0.3s"; el.style.background = "rgba(29,78,216,0.15)"; setTimeout(() => { el.style.background = ""; }, 1200); }
                            }} style={{ padding: "6px 10px 5px", marginBottom: 3, borderRadius: "10px 10px 0 0", background: isMine ? "rgba(0,0,0,0.16)" : "#e0e7ff", borderLeft: `3px solid ${isMine ? "rgba(255,255,255,0.75)" : MY_BUBBLE}`, maxWidth: 240, cursor: "pointer" }}>
                              <div style={{ fontSize: 10, fontWeight: 800, color: isMine ? "rgba(255,255,255,0.9)" : MY_BUBBLE, marginBottom: 2 }}>{msg.replyToSender}</div>
                              <div style={{ fontSize: 11, fontWeight: 500, color: isMine ? "rgba(255,255,255,0.8)" : "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{msg.replyToText}</div>
                            </div>
                          )}
                          <div style={{ padding: "8px 12px", borderRadius: isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: isMine ? MY_BUBBLE : "#fff", color: isMine ? "#fff" : "#1e293b", fontSize: 13, lineHeight: 1.5, wordBreak: "break-word", whiteSpace: "pre-wrap", boxShadow: "0 1px 3px rgba(15,23,42,0.08)" }}>
                            {msg.text}
                            {msg.edited && <span style={{ fontSize: 10, opacity: 0.65, marginLeft: 4 }}>(수정됨)</span>}
                          </div>
                          {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3, justifyContent: isMine ? "flex-end" : "flex-start" }}>
                              {Object.entries(msg.reactions).filter(([, uids]) => uids.length > 0).map(([emoji, uids]) => (
                                <button key={emoji} onClick={() => onAddReaction?.(msg.id, emoji)} style={{ display: "flex", alignItems: "center", gap: 2, padding: "1px 5px", borderRadius: 10, fontSize: 12, background: uids.includes(myUid) ? "#dbeafe" : "#f1f5f9", border: uids.includes(myUid) ? "1px solid #93c5fd" : "1px solid #e2e8f0", cursor: "pointer", fontWeight: 600, color: "#334155" }}>
                                  <span>{emoji}</span><span style={{ fontSize: 10 }}>{uids.length}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {isLast && msg.type !== "deleted" && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", gap: 2, flexShrink: 0 }}>
                          <span style={{ fontSize: 10, color: "#94a3b8", whiteSpace: "nowrap" }}>{fmtTime(msg.createdAt)}</span>
                          {isMine && (() => {
                            const total = msg.totalMembers || room.members?.length || 1;
                            const unreadCount = total - (msg.readBy || []).length;
                            return unreadCount > 0
                              ? <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, whiteSpace: "nowrap" }}>{unreadCount}</span>
                              : <span style={{ fontSize: 10, color: "#94a3b8", whiteSpace: "nowrap" }}>읽음</span>;
                          })()}
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

      {ctxMenu && (() => {
        const { msg, x, y } = ctxMenu;
        const isMine = msg.senderUid === myUid;
        const menuW = 160, menuH = 220;
        const safeX = Math.min(x, window.innerWidth - menuW - 8);
        const safeY = y + menuH > window.innerHeight ? y - menuH : y;
        return (
          <div data-ctx-menu="1" style={{ position: "fixed", left: safeX, top: safeY, zIndex: 999999, background: "#fff", borderRadius: 14, boxShadow: "0 8px 32px rgba(15,23,42,0.18)", border: "1px solid #e2e8f0", overflow: "hidden", minWidth: menuW }}>
            <div style={{ display: "flex", gap: 2, padding: "8px 10px", borderBottom: "1px solid #f1f5f9", justifyContent: "space-between" }}>
              {EMOJI_LIST.map((em) => (
                <button key={em} onClick={() => { onAddReaction?.(msg.id, em); setCtxMenu(null); }} style={{ background: (msg.reactions?.[em] || []).includes(myUid) ? "#dbeafe" : "transparent", border: "none", fontSize: 20, cursor: "pointer", padding: "2px 3px", borderRadius: 6 }}>{em}</button>
              ))}
            </div>
            {[
              { label: "답장", action: () => { onReply?.(msg); setCtxMenu(null); } },
              { label: "나에게 보내기", action: () => { onSendToSelf?.(msg.text); setCtxMenu(null); setSelfSentToast(true); setTimeout(() => setSelfSentToast(false), 2500); } },
              { label: "복사", action: () => { navigator.clipboard?.writeText(msg.text || ""); setCtxMenu(null); } },
              ...(isMine ? [
                { label: "수정", action: () => { setEditMsg(msg); setEditText(msg.text); setCtxMenu(null); } },
                { label: "삭제", action: () => { onDeleteMsg(msg.id); setCtxMenu(null); }, danger: true },
              ] : []),
            ].map(({ label, action, danger }) => (
              <button key={label} onClick={action} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 16px", background: "none", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", color: danger ? "#dc2626" : "#1e293b", borderBottom: "1px solid #f8fafc" }}>{label}</button>
            ))}
          </div>
        );
      })()}

      {showAttachMenu && (
        <div style={{ padding: "10px 12px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, cursor: "pointer", color: ACCENT, minWidth: 60, position: "relative", overflow: "hidden" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
            <span style={{ fontSize: 11, fontWeight: 600 }}>사진</span>
            <input type="file" accept="image/*" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { onSendImage(f); setShowAttachMenu(false); } e.target.value = ""; }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, cursor: "pointer", color: ACCENT, minWidth: 60, position: "relative", overflow: "hidden" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            <span style={{ fontSize: 11, fontWeight: 600 }}>파일</span>
            <input type="file" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { onSendFile(f); setShowAttachMenu(false); } e.target.value = ""; }} />
          </label>
          {[
            { label: "위치", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>, action: () => { onSendLocation(); setShowAttachMenu(false); } },
            { label: "연락처", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>, action: () => { onSendContact(); setShowAttachMenu(false); } },
            { label: "공지", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>, action: () => { onSendNotice(); setShowAttachMenu(false); } },
          ].map((item) => (
            <button key={item.label} onClick={item.action} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, cursor: "pointer", color: ACCENT, minWidth: 60 }}>{item.icon}<span style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</span></button>
          ))}
        </div>
      )}

      {replyTo && (
        <div style={{ padding: "6px 12px 4px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ width: 3, alignSelf: "stretch", background: MY_BUBBLE, borderRadius: 2, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MY_BUBBLE }}>{replyTo.senderName}에게 답장</div>
            <div style={{ fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{replyTo.text || "[미디어]"}</div>
          </div>
          <button onClick={() => setReplyTo(null)} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 16, cursor: "pointer", padding: "0 4px" }}>✕</button>
        </div>
      )}

      <div style={{ padding: "8px 12px 12px", background: "#fff", borderTop: showAttachMenu ? "none" : "1px solid #e2e8f0", flexShrink: 0 }}>
        <form onSubmit={(e) => e.preventDefault()} style={{ display: "flex", alignItems: "flex-end", gap: 6, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 20, padding: "6px 6px 6px 4px" }}>
          <button type="button" onClick={() => setShowAttachMenu((p) => !p)}
            style={{ width: 32, height: 32, borderRadius: "50%", background: showAttachMenu ? ACCENT : "none", border: "none", color: showAttachMenu ? "#fff" : "#64748b", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 2 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
          {fileUploading && <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>업로드 중...</span>}
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder="메시지 입력..." rows={1}
            style={{ flex: 1, background: "none", border: "none", outline: "none", resize: "none", fontSize: 13, color: "#1e293b", maxHeight: 90, overflowY: "auto", lineHeight: 1.5 }} />
          <button type="button" onClick={onSend} disabled={!input.trim()}
            style={{ width: 32, height: 32, borderRadius: "50%", background: input.trim() ? MY_BUBBLE : "#e2e8f0", border: "none", cursor: input.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? "#fff" : "#94a3b8"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </form>
      </div>

      {imgPreview && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200000, background: "rgba(15,23,42,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }} onClick={() => setImgPreview(null)}>
          <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 10 }} onClick={(e) => e.stopPropagation()}>
            <a href={imgPreview} download target="_blank" rel="noopener noreferrer" style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "none" }}>저장</a>
            <button onClick={() => setImgPreview(null)} style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>닫기</button>
          </div>
          <img src={imgPreview} style={{ maxWidth: "90vw", maxHeight: "80vh", borderRadius: 12, objectFit: "contain" }} onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {selfSentToast && (
        <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 9999999, background: ACCENT, color: "#fff", borderRadius: 10, padding: "10px 22px", fontSize: 13, fontWeight: 700, boxShadow: "0 4px 16px rgba(15,23,42,0.25)", whiteSpace: "nowrap", pointerEvents: "none" }}>
          나에게 보냈습니다
        </div>
      )}
    </div>
  );
}

function ProfileView({ myProfile, editingProfile, editName, editStatusMsg, editPosition, editPhone, setEditName, setEditStatusMsg, setEditPosition, setEditPhone, onEdit, onSave, onCancel, onBack, onClose, onPhotoUpload, photoUploading, photoFileRef, mobileMode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ background: HDR_GRADIENT, padding: mobileMode ? "calc(env(safe-area-inset-top) + 12px) 14px 12px" : "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: "#fff" }}>내 프로필</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ background: "linear-gradient(160deg, #2563eb 0%, #1d4ed8 100%)", padding: "30px 20px 24px", textAlign: "center" }}>
          <div style={{ position: "relative", display: "inline-block", marginBottom: 12 }}>
            <Avatar name={myProfile?.name || "나"} photo={myProfile?.photo} size={80} />
            <button onClick={() => photoFileRef.current?.click()} style={{ position: "absolute", bottom: -2, right: -2, width: 24, height: 24, borderRadius: "50%", background: "#fff", border: `2px solid ${ACCENT}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {photoUploading ? <span style={{ fontSize: 10 }}>...</span> : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>}
            </button>
            <input ref={photoFileRef} type="file" accept="image/*" style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhotoUpload(f); e.target.value = ""; }} />
          </div>
          {editingProfile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", width: "100%" }}>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="이름"
                style={{ textAlign: "center", background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 10, padding: "6px 12px", color: "#fff", fontSize: 16, fontWeight: 700, outline: "none", width: "80%" }} />
              <input value={editStatusMsg} onChange={(e) => setEditStatusMsg(e.target.value)} placeholder="상태 메시지..."
                style={{ textAlign: "center", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 10, padding: "5px 12px", color: "rgba(255,255,255,0.85)", fontSize: 13, outline: "none", width: "80%" }} />
              <input value={editPosition} onChange={(e) => setEditPosition(e.target.value)} placeholder="직책 (예: 팀장, 과장...)"
                style={{ textAlign: "center", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 10, padding: "5px 12px", color: "rgba(255,255,255,0.85)", fontSize: 13, outline: "none", width: "80%" }} />
              <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="전화번호"
                style={{ textAlign: "center", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 10, padding: "5px 12px", color: "rgba(255,255,255,0.85)", fontSize: 13, outline: "none", width: "80%" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button onClick={onSave} style={{ background: "#fff", color: ACCENT, border: "none", borderRadius: 10, padding: "6px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>저장</button>
                <button onClick={onCancel} style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "none", borderRadius: 10, padding: "6px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>취소</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{myProfile?.name || "이름 없음"}</div>
              {myProfile?.position && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 4 }}>{myProfile.position}</div>}
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", minHeight: 18 }}>{myProfile?.statusMsg || "상태 메시지를 입력해보세요"}</div>
              <button onClick={onEdit} style={{ marginTop: 12, background: "rgba(255,255,255,0.18)", color: "#fff", border: "none", borderRadius: 20, padding: "6px 20px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>프로필 편집</button>
            </>
          )}
        </div>

        <div style={{ padding: "16px 20px" }}>
          <div style={{ background: "#f8fafc", borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0" }}>
            {[["이메일", myProfile?.email || ""], ["회사", myProfile?.company || ""], ["직책", myProfile?.position || "-"], ["전화번호", myProfile?.phone || "-"]].map(([label, value], idx, arr) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: idx < arr.length - 1 ? "1px solid #e2e8f0" : "none" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>{label}</span>
                <span style={{ fontSize: 13, color: "#1e293b", fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
