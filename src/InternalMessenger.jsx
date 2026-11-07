import { FabButton, SizeButtons, DOCK_BG } from "./FloatDock";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { imeFocusRef } from "./imeFocus";
import { createPortal } from "react-dom";
import {
  collection, addDoc, onSnapshot, query, orderBy, limit,
  serverTimestamp, doc, setDoc, getDoc, updateDoc, deleteDoc,
  getDocs, where, arrayUnion, arrayRemove, increment
} from "firebase/firestore";
import { db, auth, storage } from "./firebase";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { fmtPhone } from "./formatInput";
import CustomDatePicker from "./CustomDatePicker"; // 📅 2026-11-07 날짜는 프로그램 달력으로
import { kpConfirm } from "./kpDialog";

// 전화번호 하이픈 자동 포맷 (DispatchApp.jsx formatPhone과 동일 규칙)
// 전화번호 하이픈 — 공용 규칙(src/formatInput.js: 02·031·010·1588 등, 입력 중에도 적용)
const formatPhone = (phone) => fmtPhone(phone);

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

// ════════ ⭐ 2026-11-06 배차 사무실 실무 기능 공용 ════════
//  오더 공유 카드(type "order") · 공지 고정(room.pinned) · @멘션(msg.mentions, room.mentionAt.{uid}) ·
//  메시지 전달(msg.forwarded) · 자주 쓰는 문구(chat_profiles.quickReplies) · 사진·파일·오더 모아보기
const kstYmd = (offsetDays = 0) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
const won = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return n ? `${n.toLocaleString("ko-KR")}원` : ""; };
const NAVY = "#1B2B4B";
// ⭐ 2026-11-07 메신저 창 위치 — 끌어서 옮긴 자리를 기억(닫았다 열어도 그 자리). 프로그램을 다시 켜면 오른쪽 아래로
let MSG_WIN_POS = null;
export const DEFAULT_QUICK_REPLIES = [
  "확인했습니다.",
  "네 알겠습니다. 바로 처리하겠습니다.",
  "잠시만요. 확인하고 말씀드릴게요.",
  "지금 통화 중이라 끝나고 연락드릴게요.",
  "배차 넣었습니다. 확인 부탁드려요.",
  "기사님 배정 완료했습니다.",
  "차량 아직 못 잡았습니다. 계속 찾고 있어요.",
  "거래처 확인 부탁드립니다.",
  "운임 확인 부탁드립니다.",
  "결재 올렸습니다. 확인 부탁드려요.",
  "자리 비웠다가 금방 들어오겠습니다.",
  "회의 중입니다. 끝나고 연락드릴게요.",
  "점심 다녀오겠습니다.",
  "수고하셨습니다.",
]
// 오더를 메시지에 담을 때 남기는 항목(문서 전체를 복사하지 않는다 — 크기·개인정보 최소화)
const ORDER_KEYS = ["상차일", "상차시간", "상차지명", "상차지주소", "하차일", "하차시간", "하차지명", "하차지주소", "거래처명", "화물내용", "차량종류", "차량톤수", "차량번호", "이름", "기사명", "전화번호", "배차상태", "청구운임", "기사운임", "지급방식"];
export function orderSnapshot(o, col) {
  const out = { id: String(o?._id || o?.id || ""), col: col || o?.__col || "orders" };
  ORDER_KEYS.forEach((k) => { const v = o?.[k]; if (v !== undefined && v !== null && v !== "" && typeof v !== "object") out[k] = String(v).slice(0, 120); });
  return out;
}
const orderDriver = (o) => o?.이름 || o?.기사명 || "";
const orderCar = (o) => [o?.차량톤수, o?.차량종류].filter(Boolean).join(" ");
export function orderSummary(o = {}) {
  return [
    `[오더] ${o.상차일 || ""} ${o.상차시간 || ""}`.trim(),
    o.거래처명 ? `거래처 ${o.거래처명}` : "",
    `상차 ${o.상차지명 || "-"} → 하차 ${o.하차지명 || "-"}`,
    [o.차량번호, orderDriver(o), orderCar(o)].filter(Boolean).join(" · "),
    o.청구운임 || o.기사운임 ? [o.청구운임 ? `청구 ${won(o.청구운임)}` : "", o.기사운임 ? `기사 ${won(o.기사운임)}` : ""].filter(Boolean).join(" / ") : "",
  ].filter(Boolean).join("\n");
}
// Esc로 닫기(메신저·전역 Esc 처리보다 먼저 받는다)
function useEscClose(on, close) {
  const ref = useRef(close); ref.current = close;
  useEffect(() => {
    if (!on) return undefined;
    const k = (e) => { if (e.key === "Escape" && !e.isComposing) { e.preventDefault(); e.stopImmediatePropagation(); ref.current?.(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [on]);
}
const orderLast = (o = {}) => `[오더] ${o.상차지명 || "-"} → ${o.하차지명 || "-"}`;
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// @이름 부분만 굵게(내 이름이면 더 진하게)
function MentionText({ text, names = [], myName = "", isMine }) {
  const list = [...new Set(["전체", ...names.filter(Boolean)])].sort((a, b) => b.length - a.length);
  if (!text || !text.includes("@") || !list.length) return text || "";
  const re = new RegExp(`(@(?:${list.map(escRe).join("|")}))`, "g");
  return String(text).split(re).map((part, i) => {
    if (i % 2 === 0) return part;
    const me = part === `@${myName}` || part === "@전체";
    return <span key={i} data-mention style={{ fontWeight: 800, color: isMine ? "#fff" : NAVY, background: isMine ? "rgba(255,255,255,0.16)" : me ? "#DCE6F7" : "#EEF3FB", borderRadius: 5, padding: "0 3px" }}>{part}</span>;
  });
}
// 오더 공유 카드(말풍선 자리)
function OrderCard({ o = {}, isMine, onOpen, onCopy }) {
  const row = (label, value) => value ? (
    <div style={{ display: "flex", gap: 8, fontSize: 12.5, lineHeight: 1.55 }}>
      <span style={{ width: 30, flexShrink: 0, color: "#7A879C", fontWeight: 700 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, color: "#0F1A30", fontWeight: 600, wordBreak: "break-all" }}>{value}</span>
    </div>
  ) : null;
  const done = /완료/.test(o.배차상태 || "");
  return (
    <div data-order-card style={{ width: 252, borderRadius: 14, overflow: "hidden", background: "#fff", border: "1px solid #DCE3EE", boxShadow: "0 2px 8px rgba(15,26,48,0.10)" }}>
      <div style={{ background: "linear-gradient(120deg,#0F1A30 0%,#1B2B4B 62%,#2D4C82 100%)", padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8FB0F0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="6" width="14" height="11" rx="1.5" /><path d="M15 9h4l3 3.5V17h-7" /><circle cx="6" cy="18.5" r="1.8" /><circle cx="18" cy="18.5" r="1.8" /></svg>
        <span style={{ flex: 1, color: "#fff", fontSize: 13, fontWeight: 800 }}>오더 공유</span>
        {o.배차상태 && <span style={{ fontSize: 11.5, fontWeight: 800, color: done ? "#0F1A30" : "#fff", background: done ? "#8FB0F0" : "rgba(255,255,255,0.16)", borderRadius: 999, padding: "2px 8px" }}>{o.배차상태}</span>}
      </div>
      <div style={{ padding: "10px 12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#4B6CB7", marginBottom: 2 }}>{[o.상차일, o.상차시간].filter(Boolean).join(" ")}{o.거래처명 ? ` · ${o.거래처명}` : ""}</div>
        {row("상차", o.상차지명 || "-")}
        {row("하차", [o.하차지명 || "-", o.하차일 && o.하차일 !== o.상차일 ? `(${o.하차일.slice(5)})` : ""].filter(Boolean).join(" "))}
        {row("차량", [o.차량번호, orderDriver(o), orderCar(o)].filter(Boolean).join(" · ") || "미배차")}
        {row("운임", [o.청구운임 ? `청구 ${won(o.청구운임)}` : "", o.기사운임 ? `기사 ${won(o.기사운임)}` : ""].filter(Boolean).join(" / "))}
      </div>
      <div style={{ display: "flex", borderTop: "1px solid #EEF1F6" }}>
        <button type="button" data-order-open onClick={onOpen} style={{ flex: 1, height: 36, border: "none", background: "#F5F8FD", color: NAVY, fontSize: 13, fontWeight: 900, cursor: "pointer" }}>열기</button>
        <button type="button" onClick={onCopy} style={{ flex: 1, height: 36, border: "none", borderLeft: "1px solid #EEF1F6", background: "#fff", color: "#3A4A66", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>내용 복사</button>
      </div>

    </div>
  );
}
// 오더 상세(열기) — 공유한 뒤 바뀐 내용도 보이게 지금 오더를 다시 읽는다(못 읽으면 공유할 때 내용)
function OrderDetailModal({ order, onClose, mobileMode }) {
  const [live, setLive] = useState(undefined); // undefined=읽는 중 · null=못 읽음
  useEscClose(true, onClose);
  useEffect(() => {
    let off = false;
    if (!order?.id) { setLive(null); return undefined; }
    getDoc(doc(db, order.col || "orders", order.id)).then((s) => { if (!off) setLive(s?.exists?.() ? s.data() : null); }).catch(() => { if (!off) setLive(null); });
    return () => { off = true; };
  }, [order?.id, order?.col]);
  const cur = live ? { ...order, ...orderSnapshot(live, order.col), id: order.id } : order;
  const changed = (k) => live && order[k] !== undefined && String(live[k] ?? "") !== String(order[k] ?? "");
  const rows = [
    ["상차일시", [cur.상차일, cur.상차시간].filter(Boolean).join(" "), "상차일"], ["거래처", cur.거래처명, "거래처명"],
    ["상차지", [cur.상차지명, cur.상차지주소].filter(Boolean).join(" · "), "상차지명"], ["하차일시", [cur.하차일, cur.하차시간].filter(Boolean).join(" "), "하차일"],
    ["하차지", [cur.하차지명, cur.하차지주소].filter(Boolean).join(" · "), "하차지명"], ["화물", cur.화물내용, "화물내용"],
    ["차량", [orderCar(cur), cur.차량번호].filter(Boolean).join(" · "), "차량번호"], ["기사", [orderDriver(cur), cur.전화번호].filter(Boolean).join(" · "), "이름"],
    ["청구운임", won(cur.청구운임), "청구운임"], ["기사운임", won(cur.기사운임), "기사운임"], ["지급방식", cur.지급방식, "지급방식"], ["배차상태", cur.배차상태, "배차상태"],
  ].filter(([, v]) => v);
  const goBoard = () => {
    try {
      window.dispatchEvent(new CustomEvent("kp-open-order", { detail: { id: order.id, col: order.col, 상차일: cur.상차일 } }));
      window.dispatchEvent(new CustomEvent("kp-go-menu", { detail: "배차현황" }));
    } catch { /* 무시 */ }
    onClose();
  };
  return createPortal(
    <div data-kp-dialog="1" style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "rgba(11,20,40,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Noto Sans KR', sans-serif" }} onClick={onClose}>
      <div data-order-detail onClick={(e) => e.stopPropagation()} style={{ width: "min(420px,100%)", maxHeight: "86vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 60px rgba(11,20,40,0.4)" }}>
        <div style={{ padding: "14px 18px", background: "linear-gradient(120deg,#0F1A30 0%,#1B2B4B 62%,#2D4C82 100%)", color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.24em", color: "#8FB0F0" }}>ORDER</div>
            <div style={{ fontSize: 17, fontWeight: 900 }}>{cur.상차지명 || "-"} → {cur.하차지명 || "-"}</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: "12px 18px", overflowY: "auto" }}>
          {live === undefined && <div style={{ fontSize: 12.5, color: "#7A879C", marginBottom: 8 }}>지금 오더 내용을 확인하는 중…</div>}
          {live === null && <div style={{ fontSize: 12.5, color: "#7A879C", marginBottom: 8, background: "#F5F8FD", borderRadius: 10, padding: "8px 10px" }}>지금 오더를 불러오지 못해 공유할 때의 내용을 보여 줍니다. (삭제됐거나 권한이 없을 수 있습니다)</div>}
          {rows.map(([label, v, key]) => (
            <div key={label} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid #F1F4F9", fontSize: 13.5 }}>
              <span style={{ width: 64, flexShrink: 0, color: "#7A879C", fontWeight: 700 }}>{label}</span>
              <span style={{ flex: 1, color: "#0F1A30", fontWeight: 700, wordBreak: "break-all" }}>{v}{changed(key) && <span style={{ marginLeft: 6, fontSize: 11.5, fontWeight: 800, color: "#4B6CB7", background: "#EEF3FB", borderRadius: 6, padding: "1px 6px" }}>공유 후 바뀜</span>}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 18px 16px", display: "flex", gap: 8, borderTop: "1px solid #EEF1F6" }}>
          <button type="button" onClick={() => { navigator.clipboard?.writeText(orderSummary(cur)).catch(() => {}); }} style={{ flex: 1, height: 42, borderRadius: 12, border: "1px solid #DCE3EE", background: "#fff", color: "#3A4A66", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}>내용 복사</button>
          {!mobileMode && <button type="button" data-order-goboard onClick={goBoard} style={{ flex: 1.4, height: 42, borderRadius: 12, border: "none", background: NAVY, color: "#fff", fontSize: 13.5, fontWeight: 900, cursor: "pointer" }}>배차현황에서 보기</button>}
        </div>
      </div>
    </div>, document.body);
}
// 오더 고르기(오더 공유) — 상차일 하루치를 실시간으로 읽어 고른다(orders·dispatch 두 곳)
function OrderPickModal({ onPick, onClose }) {
  const [date, setDate] = useState(() => kstYmd());
  useEscClose(true, onClose);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  useEffect(() => {
    setRows(null);
    const got = { orders: null, dispatch: null };
    const done = () => {
      if (!got.orders || !got.dispatch) return;
      const m = new Map();
      [...got.orders, ...got.dispatch].forEach((o) => m.set(`${o.__col}/${o._id}`, o));
      setRows([...m.values()].sort((a, b) => String(a.상차시간 || "").localeCompare(String(b.상차시간 || ""))));
    };
    const sub = (col) => onSnapshot(query(collection(db, col), where("상차일", "==", date)), (snap) => {
      got[col] = snap.docs.map((d) => ({ ...d.data(), _id: d.id, __col: col })).filter((o) => String(o.상차일 || "") === date);
      done();
    }, () => { got[col] = []; done(); });
    const u1 = sub("orders"); const u2 = sub("dispatch");
    return () => { u1?.(); u2?.(); };
  }, [date]);
  const kw = q.trim();
  const list = (rows || []).filter((o) => !kw || [o.거래처명, o.상차지명, o.하차지명, o.차량번호, o.이름, o.기사명, o.화물내용].some((v) => String(v || "").includes(kw)));
  const shift = (d) => { const t = new Date(`${date}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + d); setDate(t.toISOString().slice(0, 10)); };
  const chip = (on) => ({ height: 32, padding: "0 12px", borderRadius: 10, border: `1px solid ${on ? NAVY : "#DCE3EE"}`, background: on ? NAVY : "#fff", color: on ? "#fff" : "#3A4A66", fontSize: 12.5, fontWeight: 800, cursor: "pointer" });
  return createPortal(
    <div data-kp-dialog="1" style={{ position: "fixed", inset: 0, zIndex: 2147482990, background: "rgba(11,20,40,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Noto Sans KR', sans-serif" }} onClick={onClose}>
      <div data-order-pick onClick={(e) => e.stopPropagation()} style={{ width: "min(480px,100%)", height: "min(620px,88vh)", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 60px rgba(11,20,40,0.4)" }}>
        <div style={{ padding: "14px 18px", background: "linear-gradient(120deg,#0F1A30 0%,#1B2B4B 62%,#2D4C82 100%)", color: "#fff", display: "flex", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.24em", color: "#8FB0F0" }}>SHARE ORDER</div>
            <div style={{ fontSize: 17, fontWeight: 900 }}>오더 공유하기</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #EEF1F6", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={() => shift(-1)} style={chip(false)}>◀</button>
            <CustomDatePicker showIcon value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ height: 32, border: "1px solid #DCE3EE", borderRadius: 10, padding: "0 10px", fontSize: 13, fontWeight: 700, color: "#0F1A30" }} />
            <button type="button" onClick={() => shift(1)} style={chip(false)}>▶</button>
            <button type="button" onClick={() => setDate(kstYmd(-1))} style={chip(date === kstYmd(-1))}>어제</button>
            <button type="button" onClick={() => setDate(kstYmd())} style={chip(date === kstYmd())}>오늘</button>
            <button type="button" onClick={() => setDate(kstYmd(1))} style={chip(date === kstYmd(1))}>내일</button>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처 · 상차지 · 하차지 · 차량번호 · 기사 검색" ref={imeFocusRef}
            style={{ height: 36, border: "1px solid #DCE3EE", borderRadius: 10, padding: "0 12px", fontSize: 13, outline: "none", background: "#F8FAFD" }} />
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {rows === null ? <div style={{ padding: 30, textAlign: "center", fontSize: 13, color: "#7A879C" }}>오더 불러오는 중…</div>
            : list.length === 0 ? <div style={{ padding: 30, textAlign: "center", fontSize: 13, color: "#7A879C" }}>{kw ? "검색 결과가 없습니다" : `${date} 상차 오더가 없습니다`}</div>
              : list.map((o) => (
                <button key={`${o.__col}/${o._id}`} type="button" data-order-pick-row onClick={() => onPick(o)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 16px", border: "none", borderBottom: "1px solid #F1F4F9", background: "#fff", cursor: "pointer" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#F5F8FD"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: "#4B6CB7", minWidth: 42 }}>{o.상차시간 || "--:--"}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800, color: "#0F1A30", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.상차지명 || "-"} → {o.하차지명 || "-"}</span>
                    {o.배차상태 && <span style={{ fontSize: 11.5, fontWeight: 800, color: /완료/.test(o.배차상태) ? "#fff" : NAVY, background: /완료/.test(o.배차상태) ? NAVY : "#EEF3FB", borderRadius: 999, padding: "2px 8px", flexShrink: 0 }}>{o.배차상태}</span>}
                  </div>
                  <div style={{ marginTop: 3, paddingLeft: 50, fontSize: 12.5, color: "#5B6B85", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[o.거래처명, [o.차량번호, orderDriver(o)].filter(Boolean).join(" "), orderCar(o), o.청구운임 ? won(o.청구운임) : ""].filter(Boolean).join(" · ")}
                  </div>
                </button>
              ))}
        </div>
        <div style={{ padding: "10px 16px", borderTop: "1px solid #EEF1F6", fontSize: 12, color: "#7A879C" }}>고른 오더가 카드로 보내집니다. 받은 사람은 [열기]로 지금 상태를 볼 수 있습니다.</div>
      </div>
    </div>, document.body);
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

// ⭐ 2026-11-03 단체방 아바타 — 카톡처럼 멤버 사진/첫 글자를 최대 4개까지 모아서 보여준다
// people: [{ name, photo }] (나를 뺀 멤버)
function GroupAvatar({ people = [], size = 44 }) {
  const list = people.slice(0, 4);
  if (list.length <= 1) return <Avatar name={list[0]?.name || "그룹"} photo={list[0]?.photo || ""} size={size} bgColor="#374151" />;
  const COLORS = ["#1B2B4B", "#374151", "#243a60", "#4b5563"];
  // 2명: 대각선 두 칸 / 3~4명: 2x2 격자
  const cell = list.length === 2 ? Math.round(size * 0.62) : Math.floor(size / 2) - 1;
  const pos = list.length === 2
    ? [{ left: 0, top: 0 }, { left: size - cell, top: size - cell }]
    : list.length === 3
      ? [{ left: (size - cell) / 2, top: 0 }, { left: 0, top: size - cell }, { left: size - cell, top: size - cell }]
      : [{ left: 0, top: 0 }, { left: size - cell, top: 0 }, { left: 0, top: size - cell }, { left: size - cell, top: size - cell }];
  return (
    <div style={{ width: size, height: size, position: "relative", flexShrink: 0 }}>
      {list.map((p, i) => (
        <div key={i} style={{ position: "absolute", ...pos[i], borderRadius: "30%", boxShadow: "0 0 0 1.5px #fff" }}>
          <Avatar name={p.name} photo={p.photo} size={cell} bgColor={COLORS[i % 4]} />
        </div>
      ))}
    </div>
  );
}

// ⭐ 2026-11-03 단체방 이름이 비어 있으면 멤버 이름으로 자동 표시 ("홍길동, 김철수, 이영희 외 2명")
function autoGroupName(names = []) {
  if (!names.length) return "대화상대 없음";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} 외 ${names.length - 3}명`;
}

export default function InternalMessenger({ user, userCompany = "", role = "", mobileMode = false, mobileVisible = false, onClose, onUnreadChange, controlledOpen, onOpenChange, linkedCompanyName = "", themeColor = "", excludeRoles = [] }) {
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
  const [view, setView] = useState("friends"); // friends | chat | profile
  // ⎋ 2026-11-01 ESC로 메신저 창 닫기(PC) — 입력 중 한글 조합(IME)·다른 팝업이 열려 있을 때는 그것부터
  const setOpenRef = useRef(setOpen); setOpenRef.current = setOpen;
  useEffect(() => {
    if (!open || mobileMode) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.isComposing) return;
      if (document.querySelector('[data-kp-dialog="1"],[data-kp-popup]')) return; // ⭐ 2026-11-06 모아보기·문구·멘션 창이 떠 있으면 그것부터
      e.preventDefault(); e.stopPropagation();
      setOpenRef.current(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, mobileMode]);
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
  // ⭐ 2026-11-03 단체방(카톡식) — 멤버 검색 · 대화상대 보기 · 초대 · 이름 바꾸기 팝업
  const [groupSearch, setGroupSearch] = useState("");
  const [membersRoom, setMembersRoom] = useState(null); // 대화상대 목록 팝업 대상 방
  const [inviteRoom, setInviteRoom] = useState(null);   // 초대 팝업 대상 방
  const [inviteSel, setInviteSel] = useState([]);
  const [inviteSearch, setInviteSearch] = useState("");
  const [renameRoom, setRenameRoom] = useState(null);   // 이름 바꾸기 팝업 대상 방
  const [renameText, setRenameText] = useState("");
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
  // 메시지 보내야 방 생성 (lazy room creation)
  const [pendingRoom, setPendingRoom] = useState(null);
  // 답장 기능
  const [replyTo, setReplyTo] = useState(null); // { id, text, senderName }
  // ⭐ 2026-11-06 오더 공유 · 메시지 전달 팝업
  const [orderPickOpen, setOrderPickOpen] = useState(false);
  const [fwdMsg, setFwdMsg] = useState(null);
  const [fwdSel, setFwdSel] = useState([]);
  const [fwdSearch, setFwdSearch] = useState("");
  const [fwdBusy, setFwdBusy] = useState(false);
  useEscClose(!!fwdMsg, () => setFwdMsg(null));

  const msgUnsub = useRef(null);
  const serverMsgsRef = useRef({ roomId: null, list: [] }); // ⭐ 2026-11-03 읽음 처리용 — 지금 방에 받아둔 메시지
  const roomsRef = useRef([]);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const fileAllRef = useRef(null);
  const photoFileRef = useRef(null);
  const prevUnreadRef = useRef(0);
  // 채팅창이 실제로 보이는지 추적 (읽음 처리 기준)
  const isVisibleRef = useRef(false);
  const audioCtxRef = useRef(null);

  // 새 메시지 알림음 (DispatchApp의 playNotifSound와 동일한 3음 차임)
  const playNotifSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const doPlay = () => {
        const notes = [
          { freq: 698.5, t: 0, dur: 0.14 },
          { freq: 880, t: 0.15, dur: 0.14 },
          { freq: 1046, t: 0.31, dur: 0.22 },
        ];
        notes.forEach(({ freq, t, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "triangle";
          osc.frequency.value = freq;
          const start = ctx.currentTime + t;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
          osc.start(start);
          osc.stop(start + dur + 0.02);
        });
      };
      if (ctx.state === "suspended") {
        ctx.resume().then(doPlay).catch(() => {});
      } else {
        doPlay();
      }
    } catch {}
  }, []);

  // ── 내 프로필 로드 & 자동 생성 ──
  // ⭐ 2026-11-01 내 직급·부서는 인사 정보(users)를 실시간으로 — 채팅 프로필에 남은 옛 직급을 덮어 맞춘다
  const [myHr, setMyHr] = useState(null);
  useEffect(() => { if (!myUid) return undefined; return onSnapshot(doc(db, "users", myUid), (s) => setMyHr(s.exists() ? s.data() : null), () => {}); }, [myUid]);
  useEffect(() => {
    if (!myUid || !myHr || !myProfile) return;
    const pos = myHr.position || myHr.직책 || "";
    if (pos && pos !== myProfile.position) setDoc(doc(db, PROFILES_COLL, myUid), { position: pos }, { merge: true }).catch(() => {});
  }, [myUid, myHr?.position, myProfile?.position]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // linkedCompanyName이 있으면(화주사<->연동 운송사) 해당 회사 구성원도 함께 불러와
  // "연동" 표시와 함께 대화 상대로 노출한다.
  const loadCompanyUsers = async (companyName, crossCompany) => {
    const userSnap = await getDocs(query(collection(db, "users"), where("companyName", "==", companyName)));
    const userList = userSnap.docs
      .map(d => ({ uid: d.id || d.uid, ...d.data() }))
      .filter(u => (u.uid || u.id) !== myUid && u.approved !== false && !excludeRoles.includes(u.role));

    const profileSnap = await getDocs(query(collection(db, PROFILES_COLL), where("company", "==", companyName)));
    const profileMap = {};
    profileSnap.docs.forEach(d => { profileMap[d.id] = d.data(); });

    return userList.map(u => {
      const uid = u.uid || u.id;
      const p = profileMap[uid] || {};
      return {
        uid,
        email: u.email || "",
        name: p.name || u.name || u.displayName || u.email?.split("@")[0] || uid,
        photo: p.photo || u.photo || "",
        statusMsg: p.statusMsg || "",
        // ⭐ 2026-11-01 직급은 인사 정보(users)가 기준 — 인사발령으로 바뀌면 바로 반영(예전엔 채팅 프로필에 복사된 옛 직급이 우선)
        position: u.position || u.직책 || p.position || "",
        team: u.team || "",
        phone: p.phone || u.phone || u.phoneNumber || u.전화번호 || "",
        company: companyName,
        crossCompany,
      };
    });
  };

  useEffect(() => {
    if (!company) return;
    let cancelled = false;
    const refresh = async () => {
      const [sameCompany, linked] = await Promise.all([
        loadCompanyUsers(company, false),
        linkedCompanyName ? loadCompanyUsers(linkedCompanyName, true) : Promise.resolve([]),
      ]);
      if (!cancelled) setFriends([...sameCompany, ...linked]);
    };
    refresh();
    const unsub1 = onSnapshot(query(collection(db, "users"), where("companyName", "==", company)), refresh);
    const unsub2 = linkedCompanyName
      ? onSnapshot(query(collection(db, "users"), where("companyName", "==", linkedCompanyName)), refresh)
      : null;
    return () => { cancelled = true; unsub1(); unsub2?.(); };
  }, [company, myUid, linkedCompanyName]);

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
      roomsRef.current = list;
    });
    return unsub;
  }, [myUid]);

  // ⭐ 2026-11-03 열려 있는 방 정보(멤버·이름)를 실시간으로 맞춘다 — 누가 초대/나가기/이름변경하면 바로 반영
  useEffect(() => {
    if (!activeRoom?.id) return;
    const live = rooms.find(r => r.id === activeRoom.id);
    if (live && live !== activeRoom) setActiveRoom(live);
  }, [rooms]); // eslint-disable-line react-hooks/exhaustive-deps

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
      serverMsgsRef.current = { roomId: activeRoom.id, list: serverMsgs };
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
        map[room.id] = (room.unreadCount?.[myUid] ?? 1);
      } else {
        map[room.id] = 0;
      }
    });
    setUnreadMap(map);
  }, [rooms, myUid]);

  const totalUnread = Object.values(unreadMap).reduce((a, b) => a + b, 0);

  // 모바일 부모에게 안읽음 수 전달
  useEffect(() => { onUnreadChange?.(totalUnread); }, [totalUnread]);

  // 앱 아이콘 배지 (홈화면에 설치된 PWA에서 안읽음 수 표시, 백그라운드 상태에서도 갱신됨)
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    if (totalUnread > 0) {
      navigator.setAppBadge(totalUnread).catch(() => {});
    } else {
      navigator.clearAppBadge?.().catch(() => {});
    }
  }, [totalUnread]);

  // 새 메시지 진동 알림 (안읽음 수 증가 시) — 설정에서 끌 수 있음
  useEffect(() => {
    const vibrateEnabled = localStorage.getItem("messengerVibrateEnabled") !== "0";
    if (vibrateEnabled && totalUnread > prevUnreadRef.current && "vibrate" in navigator) {
      navigator.vibrate([100, 60, 100]);
    }
    prevUnreadRef.current = totalUnread;
  }, [totalUnread]);

  // ── 새 메시지 전역 알림 배너 (카톡처럼 화면 상단에 표시, 메신저 창이 닫혀 있어도 동작) ──
  const [notifyEnabled, setNotifyEnabled] = useState(() => localStorage.getItem("messengerNotifyEnabled") !== "0");
  const toggleNotify = () => {
    setNotifyEnabled(prev => {
      const next = !prev;
      localStorage.setItem("messengerNotifyEnabled", next ? "1" : "0");
      return next;
    });
  };
  const [msgToast, setMsgToast] = useState(null); // { room, senderName, text }
  const roomsSeenRef = useRef(new Map());
  const roomsFirstLoadRef = useRef(true);
  useEffect(() => {
    if (!myUid || !rooms.length) return;
    // 최초 로드 시에는 기존 방들을 "이미 본 것"으로만 기록하고 알림은 띄우지 않는다
    if (roomsFirstLoadRef.current) {
      roomsFirstLoadRef.current = false;
      rooms.forEach(r => roomsSeenRef.current.set(r.id, r.lastAt?.toMillis?.() || 0));
      return;
    }
    // ⭐ 2026-11-03 이미 읽은 톡은 다시 안 띄움 — 앱을 껐다 켜면 처음엔 기기에 저장된 예전 방 목록이 왔다가 서버 최신 목록이 와서
    //   새 메시지로 착각해 읽은 톡 배너가 다시 떴다. 내가 그 방을 마지막으로 읽은 뒤의 메시지 + 이 기기에서 아직 안 띄운 것만.
    let shown = {};
    try { shown = JSON.parse(localStorage.getItem(`kpMsgToastSeen:${myUid}`) || "{}") || {}; } catch { shown = {}; }
    let shownChanged = false;
    rooms.forEach(room => {
      const ms = room.lastAt?.toMillis?.() || 0;
      const prevMs = Math.max(roomsSeenRef.current.get(room.id) || 0, Number(shown[room.id] || 0));
      const readMs = room.lastRead?.[myUid]?.toMillis?.() || 0;
      if (ms > prevMs && ms > readMs && room.lastSenderUid && room.lastSenderUid !== myUid) {
        shown[room.id] = ms; shownChanged = true;
        const alreadyViewing = isVisibleRef.current && activeRoom?.id === room.id;
        if (notifyEnabled && !alreadyViewing) {
          const senderName = room.memberProfiles?.[room.lastSenderUid]?.name
            || (room.type === "dm" ? getRoomName(room) : (friends.find(f => f.uid === room.lastSenderUid)?.name || getRoomName(room)));
          // ⭐ 2026-11-06 @멘션 — 이 메시지에서 나를 불렀으면 배너에 표시(멘션 시각 = 마지막 메시지 시각)
          const mention = (room.mentionAt?.[myUid]?.toMillis?.() || 0) >= ms - 1500;
          setMsgToast({ room, senderName, text: room.lastMsg || "", mention, roomName: room.type === "group" ? getRoomName(room) : "" });
          playNotifSound();
        }
      }
      roomsSeenRef.current.set(room.id, ms);
    });
    if (shownChanged) { try { localStorage.setItem(`kpMsgToastSeen:${myUid}`, JSON.stringify(shown)); } catch { /* 무시 */ } }
  }, [rooms, myUid, notifyEnabled]);

  useEffect(() => {
    if (!msgToast) return;
    const t = setTimeout(() => setMsgToast(null), 5000);
    return () => clearTimeout(t);
  }, [msgToast]);

  const openToastRoom = () => {
    if (!msgToast) return;
    setActiveRoom(msgToast.room);
    setPendingRoom(null);
    if (mobileMode) setView("chat");
    setOpen(true);
    setMsgToast(null);
  };

  // 채팅창 실제 가시성 추적 (읽음 처리 기준)
  useEffect(() => {
    const visible = mobileMode
      ? (mobileVisible && view === "chat")
      : (open && (activeRoom !== null));
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
    // ⭐ 2026-11-03 안읽은 메시지들에 readBy 추가 — 화면에 받아둔 메시지 기준(예전엔 아무 50개만 골라 최신 글이 빠질 수 있었음)
    //   · 안내 문구(system)는 읽음 숫자가 없으니 건너뜀
    //   · 내가 초대되기 전 메시지는 건너뜀 → 나중에 들어온 사람 때문에 옛 메시지의 "1"이 잘못 사라지지 않게
    const joinedMs = roomsRef.current.find(r => r.id === roomId)?.joinedAt?.[myUid]?.toMillis?.() || 0;
    const apply = (docs) => docs.forEach(m => {
      if (m.type === "system" || m._optimistic) return;
      if ((m.readBy || []).includes(myUid)) return;
      if (joinedMs && (m.createdAt?.toMillis?.() || 0) < joinedMs) return;
      updateDoc(doc(db, MSGS_COLL, m.id), { readBy: arrayUnion(myUid) }).catch(() => {});
    });
    if (serverMsgsRef.current.roomId === roomId) { apply(serverMsgsRef.current.list); return; }
    getDocs(query(
      collection(db, MSGS_COLL),
      where("roomId", "==", roomId),
      limit(300)
    )).then(snap => apply(snap.docs.map(d => ({ id: d.id, ...d.data() })))).catch(() => {});
  }, [myUid]);

  // ── 1:1 채팅 시작 (메시지 보내야 방 생성) ──
  const openDM = (friend) => {
    const existing = rooms.find(r => r.type === "dm" && r.members.includes(friend.uid) && r.members.length === 2);
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

  // ── 나에게 쓰기 ──
  const openSelf = () => {
    const existing = rooms.find(r => r.type === "self" && r.members?.includes(myUid) && r.members.length === 1);
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

  // ── 단체 채팅방 만들기 ──
  // ⭐ 2026-11-03 카톡식 — 방 이름은 선택(비우면 멤버 이름으로 자동 표시), 만들면 "○○님이 ○○님을 초대했습니다" 안내
  const createGroup = async () => {
    if (groupMembers.length === 0) return;
    const allMembers = [myUid, ...groupMembers];
    const profiles = { [myUid]: { name: myProfile?.name || myEmail.split("@")[0], photo: myProfile?.photo || "" } };
    groupMembers.forEach(uid => {
      const f = friends.find(x => x.uid === uid);
      if (f) profiles[uid] = { name: f.name, photo: f.photo || "" };
    });
    const name = groupName.trim();
    const sysText = `${profiles[myUid].name}님이 ${groupMembers.map(u => profiles[u]?.name || "알 수 없음").join(", ")}님을 초대했습니다.`;
    const joinedAt = {};
    allMembers.forEach(u => { joinedAt[u] = serverTimestamp(); });
    const roomData = {
      type: "group",
      name,
      members: allMembers,
      memberProfiles: profiles,
      company,
      createdBy: myUid,
      lastMsg: sysText,
      lastAt: serverTimestamp(),
      lastSenderUid: "", // 안내 문구는 보낸 사람 없음 → 알림 배너 안 뜸
      joinedAt,
      lastRead: { [myUid]: serverTimestamp() },
      unreadCount: { [myUid]: 0 },
    };
    const roomRef = await addDoc(collection(db, ROOMS_COLL), roomData);
    addDoc(collection(db, MSGS_COLL), {
      roomId: roomRef.id, type: "system", text: sysText,
      senderUid: myUid, senderName: profiles[myUid].name,
      createdAt: serverTimestamp(), readBy: [myUid], totalMembers: allMembers.length,
    }).catch(() => {});
    setActiveRoom({ id: roomRef.id, ...roomData });
    setPendingRoom(null);
    setGroupName("");
    setGroupMembers([]);
    setGroupSearch("");
    setNewGroupModal(false);
    setView("chat");
  };

  // ⭐ 2026-11-03 안내 문구(system) 남기기 — 가운데 회색 알약 모양, 푸시·알림배너·안읽음 숫자 없음
  //   lastSenderUid를 비워 두면 목록 미리보기만 바뀌고 다른 사람 안읽음 숫자는 늘지 않는다
  const postSystemMsg = async (room, text, extraRoomUpdate = {}) => {
    if (!room?.id) return;
    await addDoc(collection(db, MSGS_COLL), {
      roomId: room.id, type: "system", text,
      senderUid: myUid, senderName: myProfile?.name || myEmail.split("@")[0],
      createdAt: serverTimestamp(), readBy: [myUid], totalMembers: room.members?.length || 1,
    }).catch(() => {});
    await updateDoc(doc(db, ROOMS_COLL, room.id), {
      lastMsg: text, lastAt: serverTimestamp(), lastSenderUid: "",
      [`lastRead.${myUid}`]: serverTimestamp(),
      ...extraRoomUpdate,
    }).catch(() => {});
  };

  // ⭐ 2026-11-03 대화상대 초대 (방에 없는 친구만)
  const inviteMembers = async () => {
    const room = inviteRoom;
    if (!room?.id || inviteSel.length === 0) return;
    const newUids = inviteSel.filter(u => !(room.members || []).includes(u));
    if (!newUids.length) { setInviteRoom(null); return; }
    const upd = { members: arrayUnion(...newUids) };
    const names = [];
    newUids.forEach(uid => {
      const f = friends.find(x => x.uid === uid);
      const nm = f?.name || "알 수 없음";
      names.push(nm);
      upd[`memberProfiles.${uid}`] = { name: nm, photo: f?.photo || "" };
      upd[`joinedAt.${uid}`] = serverTimestamp();
    });
    const me = myProfile?.name || myEmail.split("@")[0];
    await updateDoc(doc(db, ROOMS_COLL, room.id), upd).catch(() => {});
    await postSystemMsg({ ...room, members: [...(room.members || []), ...newUids] }, `${me}님이 ${names.join(", ")}님을 초대했습니다.`);
    setInviteRoom(null); setInviteSel([]); setInviteSearch("");
  };

  // ⭐ 2026-11-03 채팅방 이름 바꾸기 (비우면 멤버 이름 자동 표시로 돌아감)
  const saveRename = async () => {
    const room = renameRoom;
    if (!room?.id) return;
    const name = renameText.trim();
    if (name === (room.name || "")) { setRenameRoom(null); return; }
    const me = myProfile?.name || myEmail.split("@")[0];
    const text = name
      ? `${me}님이 채팅방 이름을 '${name}'(으)로 바꾸었습니다.`
      : `${me}님이 채팅방 이름을 지웠습니다.`;
    await postSystemMsg(room, text, { name });
    setRenameRoom(null); setRenameText("");
  };

  // ── 메시지 전송 (pendingRoom이면 방 먼저 생성, optimistic update) ──
  const sendMessage = async () => {
    if (!input.trim()) return;
    if (!activeRoom && !pendingRoom) return;
    const text = input.trim();
    setInput("");
    const senderName = myProfile?.name || myEmail.split("@")[0];
    const now = new Date();
    const replyData = replyTo ? { replyToId: replyTo.id, replyToText: replyTo.text?.slice(0,80) || "", replyToSender: replyTo.senderName } : {};
    if (replyTo) setReplyTo(null);

    let room = activeRoom;

    // pendingRoom: 첫 메시지 보낼 때 방 생성
    if (!room && pendingRoom) {
      try {
        const roomRef = await addDoc(collection(db, ROOMS_COLL), pendingRoom.roomData);
        room = { id: roomRef.id, ...pendingRoom.roomData };
        setActiveRoom(room);
        setPendingRoom(null);
      } catch { return; }
    }
    if (!room) return;

    // 즉시 로컬 상태에 추가
    const tempId = `_opt_${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId, _optimistic: true,
      roomId: room.id, text, type: "text",
      senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
      createdAt: { toMillis: () => now.getTime(), toDate: () => now },
      edited: false, readBy: [myUid],
      totalMembers: room.members?.length || 1, memberUids: room.members || [],
      ...replyData,
    }]);

    const others = room.members?.filter(uid => uid !== myUid) || [];
    const mentions = findMentions(text, room); // ⭐ 2026-11-06 @멘션
    addDoc(collection(db, MSGS_COLL), {
      roomId: room.id, text, type: "text",
      senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
      createdAt: serverTimestamp(), edited: false,
      readBy: [myUid], totalMembers: room.members?.length || 1, memberUids: room.members || [],
      ...replyData,
      ...(mentions.length ? { mentions } : {}),
    }).catch(() => {});
    const unreadUpdate = {};
    others.forEach(uid => { unreadUpdate[`unreadCount.${uid}`] = increment(1); });
    mentions.forEach(uid => { unreadUpdate[`mentionAt.${uid}`] = serverTimestamp(); });
    updateDoc(doc(db, ROOMS_COLL, room.id), {
      lastMsg: text, lastAt: serverTimestamp(), lastSenderUid: myUid,
      [`lastRead.${myUid}`]: serverTimestamp(), ...unreadUpdate,
    }).catch(() => {});
  };

  // ════════ ⭐ 2026-11-06 실무 기능 — 공용 전송 · @멘션 · 오더 공유 · 공지 고정 · 전달 · 자주 쓰는 문구 ════════
  // 방이 아직 없으면(1:1 첫 메시지 전) 먼저 만든다
  const ensureRoom = async () => {
    if (activeRoom) return activeRoom;
    if (!pendingRoom) return null;
    const roomRef = await addDoc(collection(db, ROOMS_COLL), pendingRoom.roomData);
    const r = { id: roomRef.id, ...pendingRoom.roomData };
    setActiveRoom(r); setPendingRoom(null);
    return r;
  };
  // 메시지 1건 + 방 목록 갱신(다른 사람 안읽음 +1, 멘션 시각)
  const postMsg = async (room, fields, lastMsg, mentions = []) => {
    if (!room?.id) return null;
    const senderName = myProfile?.name || myEmail.split("@")[0];
    const ref = await addDoc(collection(db, MSGS_COLL), {
      roomId: room.id, senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
      createdAt: serverTimestamp(), readBy: [myUid], totalMembers: room.members?.length || 1, memberUids: room.members || [],
      ...fields, ...(mentions.length ? { mentions } : {}),
    });
    const upd = {};
    (room.members || []).filter(u => u !== myUid).forEach(u => { upd[`unreadCount.${u}`] = increment(1); });
    mentions.forEach(u => { upd[`mentionAt.${u}`] = serverTimestamp(); });
    await updateDoc(doc(db, ROOMS_COLL, room.id), {
      lastMsg: String(lastMsg || "").slice(0, 200), lastAt: serverTimestamp(), lastSenderUid: myUid,
      [`lastRead.${myUid}`]: serverTimestamp(), ...upd,
    }).catch(() => {});
    return ref;
  };
  // @멘션 — 방 멤버(나 제외) 이름과 맞으면 그 사람, @전체면 모두
  const memberNames = (room) => (room?.members || []).filter(u => u !== myUid).map(u => ({ uid: u, name: room.memberProfiles?.[u]?.name || friends.find(f => f.uid === u)?.name || "" })).filter(x => x.name);
  const findMentions = (text, room) => {
    if (!text || !text.includes("@") || room?.type !== "group") return [];
    const list = memberNames(room);
    if (/@전체(\s|$)/.test(text)) return list.map(x => x.uid);
    return list.filter(x => text.includes(`@${x.name}`)).map(x => x.uid);
  };
  // 오더 공유 카드
  const shareOrder = async (o) => {
    setOrderPickOpen(false);
    try {
      const room = await ensureRoom(); if (!room) return;
      const snap = orderSnapshot(o, o.__col);
      await postMsg(room, { type: "order", text: orderSummary(snap), order: snap }, orderLast(snap));
    } catch (e) { alert(`오더를 보내지 못했습니다 — ${e?.message || e}`); }
  };
  // 공지 고정 — 방마다 1개, 채팅창 위쪽에 계속 보인다
  const pinMessage = async (msg) => {
    const room = activeRoom; if (!room?.id || !msg) return;
    const text = msg.type === "order" ? orderSummary(msg.order || {}) : msg.type === "image" ? "[사진]" : msg.type === "file" ? `[파일] ${msg.fileName || ""}` : String(msg.text || "");
    await updateDoc(doc(db, ROOMS_COLL, room.id), {
      pinned: { msgId: msg.id || "", text: text.slice(0, 500), senderName: msg.senderName || "", by: myProfile?.name || myEmail.split("@")[0], at: Date.now() },
    }).catch((e) => alert(`공지 고정 실패 — ${e?.message || e}`));
  };
  const unpinMessage = async () => {
    if (!activeRoom?.id) return;
    if (!(await kpConfirm("이 방의 공지 고정을 해제할까요?\n(메시지는 그대로 남습니다)"))) return;
    await updateDoc(doc(db, ROOMS_COLL, activeRoom.id), { pinned: null }).catch(() => {});
  };
  // 자주 쓰는 문구 — 내 채팅 프로필에 저장(PC·휴대폰 같이)
  const quickReplies = Array.isArray(myProfile?.quickReplies) ? myProfile.quickReplies : DEFAULT_QUICK_REPLIES;
  const saveQuickReplies = async (list) => {
    if (!myUid) return;
    const clean = [...new Set((list || []).map(s => String(s || "").trim()).filter(Boolean))].slice(0, 30).map(s => s.slice(0, 300));
    setMyProfile(p => ({ ...(p || {}), quickReplies: clean }));
    await setDoc(doc(db, PROFILES_COLL, myUid), { quickReplies: clean }, { merge: true }).catch(() => {});
  };
  // 메시지 전달 — 고른 방마다 같은 내용을 "전달됨"으로 보낸다
  const FWD_KEYS = ["type", "text", "imageUrl", "fileUrl", "fileName", "fileSize", "lat", "lng", "contactName", "contactPhone", "contactPosition", "contactPhoto", "contactUid", "order"];
  const openForward = (msg) => { setFwdMsg(msg); setFwdSel([]); setFwdSearch(""); };
  const doForward = async () => {
    const m = fwdMsg; if (!m || !fwdSel.length) return;
    const copy = {};
    FWD_KEYS.forEach(k => { if (m[k] !== undefined) copy[k] = m[k]; });
    if (!copy.type || copy.type === "notice") copy.type = "text";
    copy.forwarded = true; copy.fwdFrom = m.senderName || "";
    const last = { image: "[사진]", file: `[파일] ${m.fileName || ""}`, location: "[위치]", contact: `[연락처] ${m.contactName || ""}`, order: orderLast(m.order || {}) }[copy.type] || `[전달] ${copy.text || ""}`;
    setFwdBusy(true);
    try {
      for (const rid of fwdSel) {
        const room = rooms.find(r => r.id === rid);
        if (room) await postMsg(room, copy, last);
      }
      setFwdMsg(null);
    } catch (e) { alert(`전달하지 못했습니다 — ${e?.message || e}`); } finally { setFwdBusy(false); }
  };

  // ── 이미지 전송 ──
  // ⚡ 2026-11-05 빠르게 — 보내기 전에 줄이고(긴 변 1600px · JPEG 80%, 보통 4~8MB → 200~400KB),
  //  올리는 동안 입력창 위에 미리보기(보내는 중)를 바로 띄운다. 여러 장은 동시에 올린다.
  const [sendingImgs, setSendingImgs] = useState([]); // [{ id, url }]
  const shrinkForChat = async (file) => {
    if (!/^image\/(jpeg|png|webp|heic|heif|bmp)/i.test(file.type) || file.size < 350 * 1024) return file;
    try {
      const bmp = await (window.createImageBitmap ? createImageBitmap(file) : new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); }));
      const r = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.8));
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], String(file.name || "image").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    } catch { return file; }
  };
  const sendImage = async (file0) => {
    if (!file0) return;
    const tmpId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tmpUrl = URL.createObjectURL(file0);
    setSendingImgs((p) => [...p, { id: tmpId, url: tmpUrl }]);
    try { await sendImageInner(file0); } finally {
      setSendingImgs((p) => p.filter((x) => x.id !== tmpId)); setTimeout(() => URL.revokeObjectURL(tmpUrl), 4000);
    }
  };
  const roomMakingRef = useRef(null); // 새 방에 사진 여러 장을 동시에 보내도 방은 한 번만 만든다
  const sendImageInner = async (file0) => {
    let room = activeRoom;
    if (!room && pendingRoom) {
      try {
        if (!roomMakingRef.current) {
          roomMakingRef.current = addDoc(collection(db, ROOMS_COLL), pendingRoom.roomData).then((roomRef) => {
            const r = { id: roomRef.id, ...pendingRoom.roomData }; setActiveRoom(r); setPendingRoom(null); return r;
          }).finally(() => { setTimeout(() => { roomMakingRef.current = null; }, 3000); });
        }
        room = await roomMakingRef.current;
      } catch { return; }
    }
    if (!room) return;
    const file = await shrinkForChat(file0);
    const path = `chat_images/${room.id}/${Date.now()}_${file.name}`;
    const snap = await uploadBytes(storageRef(storage, path), file, { contentType: file.type || "image/jpeg", cacheControl: "public,max-age=31536000" });
    const url = await getDownloadURL(snap.ref);
    const senderName = myProfile?.name || myEmail.split("@")[0];
    await addDoc(collection(db, MSGS_COLL), {
      roomId: room.id, text: "", type: "image", imageUrl: url,
      senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
      createdAt: serverTimestamp(), readBy: [myUid],
      totalMembers: room.members?.length || 1, memberUids: room.members || [],
    });
    const others2 = room.members?.filter(uid => uid !== myUid) || [];
    const unreadUpdate2 = {};
    others2.forEach(uid => { unreadUpdate2[`unreadCount.${uid}`] = increment(1); });
    updateDoc(doc(db, ROOMS_COLL, room.id), { // 방 목록 갱신은 기다리지 않는다
      lastMsg: "[사진]", lastAt: serverTimestamp(), lastSenderUid: myUid,
      [`lastRead.${myUid}`]: serverTimestamp(), ...unreadUpdate2,
    }).catch(() => {});
  };

  // ── 파일 전송 ──
  const sendFile = async (file) => {
    if (!file) return;
    let room = activeRoom;
    if (!room && pendingRoom) {
      try {
        const roomRef = await addDoc(collection(db, ROOMS_COLL), pendingRoom.roomData);
        room = { id: roomRef.id, ...pendingRoom.roomData };
        setActiveRoom(room); setPendingRoom(null);
      } catch { return; }
    }
    if (!room) return;
    setFileUploading(true);
    try {
      const path = `chat_files/${room.id}/${Date.now()}_${file.name}`;
      const snap = await uploadBytes(storageRef(storage, path), file);
      const url = await getDownloadURL(snap.ref);
      const senderName = myProfile?.name || myEmail.split("@")[0];
      const others = room.members?.filter(u => u !== myUid) || [];
      await addDoc(collection(db, MSGS_COLL), {
        roomId: room.id, text: file.name, type: "file",
        fileUrl: url, fileName: file.name, fileSize: file.size,
        senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
        createdAt: serverTimestamp(), readBy: [myUid], totalMembers: room.members?.length || 1, memberUids: room.members || [],
      });
      const upd = {};
      others.forEach(u => { upd[`unreadCount.${u}`] = increment(1); });
      await updateDoc(doc(db, ROOMS_COLL, room.id), {
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
        totalMembers: activeRoom.members?.length || 1, memberUids: activeRoom.members || [],
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
      totalMembers: activeRoom.members?.length || 1, memberUids: activeRoom.members || [],
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
    const noticeRef = await addDoc(collection(db, MSGS_COLL), {
      roomId: activeRoom.id, text, type: "notice",
      senderUid: myUid, senderName, senderPhoto: myProfile?.photo || "",
      createdAt: serverTimestamp(), readBy: [myUid],
      totalMembers: activeRoom.members?.length || 1, memberUids: activeRoom.members || [],
    });
    const upd = {};
    others.forEach(u => { upd[`unreadCount.${u}`] = increment(1); });
    await updateDoc(doc(db, ROOMS_COLL, activeRoom.id), {
      lastMsg: `[공지] ${text}`, lastAt: serverTimestamp(), lastSenderUid: myUid,
      [`lastRead.${myUid}`]: serverTimestamp(), ...upd,
      // ⭐ 2026-11-06 공지는 보내면서 채팅창 위쪽에 고정
      pinned: { msgId: noticeRef?.id || "", text: text.slice(0, 500), senderName, by: senderName, at: Date.now() },
    }).catch(() => {});
  };

  // ── 이모티콘 반응 ──
  const addReaction = async (msgId, emoji) => {
    if (!myUid || !msgId) return;
    const msgRef = doc(db, MSGS_COLL, msgId);
    const snap = await getDoc(msgRef).catch(() => null);
    if (!snap?.exists()) return;
    const reactions = snap.data().reactions || {};
    const emojiUsers = reactions[emoji] || [];
    const already = emojiUsers.includes(myUid);
    // 토글: 이미 있으면 제거, 없으면 추가
    const newList = already ? emojiUsers.filter(u => u !== myUid) : [...emojiUsers, myUid];
    const newReactions = { ...reactions, [emoji]: newList };
    // 빈 배열은 키 삭제
    if (newList.length === 0) delete newReactions[emoji];
    await updateDoc(msgRef, { reactions: newReactions }).catch(() => {});
  };

  // ── 나에게 보내기 ──
  const sendToSelf = async (text) => {
    if (!myUid || !text) return;
    // 나에게 방 찾거나 생성
    let selfRoom = rooms.find(r => r.type === "self" && r.members?.includes(myUid));
    if (!selfRoom) {
      const ref = await addDoc(collection(db, ROOMS_COLL), {
        type: "self", members: [myUid],
        memberProfiles: { [myUid]: { name: myProfile?.name || "", photo: myProfile?.photo || "" } },
        createdAt: serverTimestamp(), lastMsg: text, lastAt: serverTimestamp(),
        lastSenderUid: myUid,
      });
      selfRoom = { id: ref.id };
    }
    await addDoc(collection(db, MSGS_COLL), {
      roomId: selfRoom.id, text, type: "text",
      senderUid: myUid, senderName: myProfile?.name || "나",
      senderPhoto: myProfile?.photo || "",
      createdAt: serverTimestamp(), readBy: [myUid], totalMembers: 1,
    });
  };

  // ── 채팅방 나가기 ──
  // ⭐ 2026-11-03 단체방은 "○○○님이 나갔습니다." 안내를 남기고 나감 — 남은 사람들 대화는 그대로(마지막 1명이 나가도 삭제 안 함)
  const leaveRoom = async (roomId) => {
    if (!(await kpConfirm("채팅방에서 나가시겠습니까?\n나가면 내 채팅 목록에서 이 방이 사라집니다."))) return;
    const room = rooms.find(r => r.id === roomId) || (activeRoom?.id === roomId ? activeRoom : null);
    if (room?.type === "group") {
      const me = myProfile?.name || myEmail.split("@")[0];
      const left = (room.members || []).filter(u => u !== myUid);
      await postSystemMsg({ ...room, members: left }, `${me}님이 나갔습니다.`);
    }
    await updateDoc(doc(db, ROOMS_COLL, roomId), {
      members: arrayRemove(myUid),
    }).catch(() => {});
    if (activeRoom?.id === roomId) {
      setActiveRoom(null);
      setPendingRoom(null);
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
    if (!(await kpConfirm("메시지를 삭제하시겠습니까?"))) return;
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
    if (!room) return "";
    if (room.type === "self") return "나에게";
    if (room.type === "dm") {
      const otherUid = room.members?.find(uid => uid !== myUid);
      return room.memberProfiles?.[otherUid]?.name || "알 수 없음";
    }
    // ⭐ 2026-11-03 이름 없는 단체방은 나를 뺀 멤버 이름으로 자동 표시
    return room.name || autoGroupName(getGroupPeople(room).map(p => p.name));
  };
  // ⭐ 2026-11-03 단체방 멤버(나 제외) 이름·사진 — 방 목록 2x2 아바타, 자동 방 이름에 사용
  const getGroupPeople = (room) => (room?.members || [])
    .filter(uid => uid !== myUid)
    .map(uid => {
      const f = friends.find(x => x.uid === uid);
      const p = room.memberProfiles?.[uid] || {};
      return { uid, name: p.name || f?.name || "알 수 없음", photo: f?.photo || p.photo || "" };
    });
  const getRoomPhoto = (room) => {
    if (!room) return "";
    if (room.type === "self") return myProfile?.photo || "";
    if (room.type === "dm") {
      const otherUid = room.members?.find(uid => uid !== myUid);
      return room.memberProfiles?.[otherUid]?.photo || "";
    }
    return "";
  };

  const myName = myProfile?.name || myEmail.split("@")[0] || "나";
  const filteredMsgs = msgSearch ? messages.filter(m => m.text?.includes(msgSearch)) : messages;

  // ── 테마 (themeColor prop이 있으면 그 색으로 고정, 없으면 A형=블루/화이트, B형=네이비) ──
  const isThemeA = !themeColor && localStorage.getItem("cardVersionV2") === "A";
  // ⭐ 2026-10-31 프로그램 톤(네이비 디지털)으로 통일
  const themeHdr = themeColor || DOCK_BG;
  const themeMyBubble = themeColor || "#1B2B4B";
  const themeChatBg = themeColor ? "#eef1f7" : (isThemeA ? "#F4F6FA" : "#F0F4F8");

  // ── 패널 크기 & 위치 ──
  const PANEL_W = mobileMode ? 360 : 820;
  const PANEL_H = 580;
  const BTN_BOTTOM = 152;
  // 창 크기 — 작게·보통·크게 + 왼쪽 위 모서리 드래그(기억)
  const MSG_PRESETS = { S: [560, 460], M: [820, 600], L: [1120, 820] };
  const savedWin = (() => { try { return JSON.parse(localStorage.getItem("kpWin:messenger") || "null"); } catch { return null; } })();
  const [panelW, setPanelW] = useState(mobileMode ? PANEL_W : (savedWin?.w || PANEL_W));
  const [panelH, setPanelH] = useState(mobileMode ? PANEL_H : (savedWin?.h || PANEL_H));
  const [winPreset, setWinPreset] = useState(savedWin?.p || "M");
  const pickWin = (k) => {
    const [w, h] = MSG_PRESETS[k];
    const cw = Math.max(500, Math.min(w, window.innerWidth - 120)); const ch = Math.max(400, Math.min(h, window.innerHeight - 60));
    setPanelW(cw); setPanelH(ch); setWinPreset(k);
    try { localStorage.setItem("kpWin:messenger", JSON.stringify({ w: cw, h: ch, p: k })); } catch { /* 무시 */ }
  };
  // ⭐ 2026-11-07 창 끌어서 옮기기
  const [winPos, setWinPos] = useState(MSG_WIN_POS);
  const startMovePanelDrag = (e) => {
    if (mobileMode || e.button !== 0) return;
    e.preventDefault();
    const box = e.currentTarget.closest("[data-msg-win]")?.getBoundingClientRect();
    if (!box) return;
    const offX = e.clientX - box.left, offY = e.clientY - box.top;
    const onMove = (ev) => {
      const left = Math.max(0, Math.min(window.innerWidth - 120, ev.clientX - offX));
      const top = Math.max(40, Math.min(window.innerHeight - 60, ev.clientY - offY));
      MSG_WIN_POS = { left, top };
      setWinPos(MSG_WIN_POS);
    };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.userSelect = ""; };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  const resizingRef = useRef(null);
  const startResizePanelDrag = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = panelW;
    const startH = panelH;
    const startPos = MSG_WIN_POS;
    resizingRef.current = true;
    const onMove = (ev) => {
      if (!resizingRef.current) return;
      const dx = startX - ev.clientX;
      const dy = startY - ev.clientY;
      const nw = Math.max(500, Math.min(window.innerWidth - 120, startW + dx));
      const nh = Math.max(400, Math.min(window.innerHeight - 60, startH + dy));
      setPanelW(nw); setPanelH(nh); setWinPreset("");
      // 옮긴 창은 오른쪽 아래 모서리를 고정한 채 왼쪽 위로 늘어나게
      if (startPos) { MSG_WIN_POS = { left: Math.max(0, startPos.left - (nw - startW)), top: Math.max(40, startPos.top - (nh - startH)) }; setWinPos(MSG_WIN_POS); }
      try { localStorage.setItem("kpWin:messenger", JSON.stringify({ w: nw, h: nh, p: "" })); } catch { /* 무시 */ }
    };
    const onUp = () => {
      resizingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // pendingRoom일 때 표시용 가상 room 객체
  const displayRoom = activeRoom || (pendingRoom ? {
    id: null,
    type: pendingRoom.roomData.type,
    members: pendingRoom.roomData.members,
    memberProfiles: pendingRoom.roomData.memberProfiles,
  } : null);

  // ⭐ 2026-11-03 단체방 팝업 열기
  const openInvite = (room) => { setInviteRoom(room); setInviteSel([]); setInviteSearch(""); };
  const openRename = (room) => { setRenameRoom(room); setRenameText(room?.name || ""); };

  // ── 공통 ChatView props ──
  const chatViewProps = displayRoom ? {
    room: displayRoom,
    roomName: activeRoom ? getRoomName(activeRoom) : (pendingRoom?.displayName || ""),
    roomPhoto: activeRoom ? getRoomPhoto(activeRoom) : (pendingRoom?.displayPhoto || ""),
    messages: filteredMsgs,
    myUid,
    myProfile,
    input,
    setInput,
    onSend: sendMessage,
    onBack: () => { setActiveRoom(null); setPendingRoom(null); if (mobileMode) setView("friends"); },
    onClose: mobileMode ? onClose : () => { setActiveRoom(null); setPendingRoom(null); },
    editMsg, setEditMsg, editText, setEditText,
    onSaveEdit: saveEdit,
    onDeleteMsg: deleteMessage,
    msgSearch, setMsgSearch, msgContainerRef, inputRef,
    onSendImage: sendImage,
    onSendFile: sendFile,
    onSendLocation: sendLocation,
    onSendContact: () => setContactPickModal(true),
    onSendNotice: () => setShowNoticeInput(true),
    fileUploading, friends, mobileMode, sendingImgs,
    themeHdr, themeMyBubble, themeChatBg,
    replyTo, setReplyTo,
    onReply: (msg) => setReplyTo({ id: msg.id, text: msg.type === "order" ? orderLast(msg.order || {}) : msg.text, senderName: msg.senderName }),
    onAddReaction: addReaction,
    onSendToSelf: sendToSelf,
    // ⭐ 2026-11-06 실무 기능
    onShareOrder: () => setOrderPickOpen(true),
    onPin: pinMessage, onUnpin: unpinMessage,
    onForward: openForward,
    quickReplies, onSaveQuickReplies: saveQuickReplies,
    mentionPeople: displayRoom.type === "group" ? memberNames(displayRoom) : [],
    myName: myProfile?.name || myEmail.split("@")[0] || "",
    // ⭐ 2026-11-03 단체방 메뉴(≡)
    groupPeople: displayRoom.type === "group" ? getGroupPeople(displayRoom) : [],
    onShowMembers: () => activeRoom && setMembersRoom(activeRoom),
    onInvite: () => activeRoom && openInvite(activeRoom),
    onRename: () => activeRoom && openRename(activeRoom),
    onLeave: () => activeRoom && leaveRoom(activeRoom.id),
  } : null;

  const friendsViewProps = {
    myProfile, friends, rooms, unreadMap, totalUnread,
    getRoomName, getRoomPhoto,
    onOpenDM: openDM,
    onOpenSelf: openSelf,
    onOpenRoom: (room) => { setActiveRoom(room); setPendingRoom(null); if (mobileMode) setView("chat"); },
    onOpenProfile: () => setView("profile"),
    onOpenPeerProfile: (f) => setProfileView(f),
    onNewGroup: () => setNewGroupModal(true),
    onClose: mobileMode ? onClose : () => setOpen(false), // FriendsView X closes panel
    onLeaveRoom: leaveRoom,
    getGroupPeople,
    onShowMembers: (room) => setMembersRoom(room),
    onInviteRoom: openInvite,
    onRenameRoom: openRename,
    myUid, mobileMode,
    themeHdr,
    activeRoomId: activeRoom?.id || (pendingRoom ? "_pending_" : null),
    notifyEnabled, onToggleNotify: toggleNotify,
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
      <div style={{ width: Math.round(panelW * 240 / 700), flexShrink: 0, borderRight: "1px solid #e5e7eb", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {view === "profile" ? (
          <ProfileView
            myProfile={myProfile}
            editingProfile={editingProfile}
            editName={editName} editStatusMsg={editStatusMsg}
            editPosition={editPosition} editPhone={editPhone}
            setEditName={setEditName} setEditStatusMsg={setEditStatusMsg}
            setEditPosition={setEditPosition} setEditPhone={setEditPhone}
            onEdit={() => { setEditName(myProfile?.name || ""); setEditStatusMsg(myProfile?.statusMsg || ""); setEditPosition(myProfile?.position || ""); setEditPhone(formatPhone(myProfile?.phone || "")); setEditingProfile(true); }}
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
        {(activeRoom || pendingRoom) && chatViewProps ? (
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
      {view === "chat" && (activeRoom || pendingRoom) && chatViewProps && <ChatView {...chatViewProps} />}
      {view === "profile" && (
        <ProfileView
          myProfile={myProfile}
          editingProfile={editingProfile}
          editName={editName} editStatusMsg={editStatusMsg}
          editPosition={editPosition} editPhone={editPhone}
          setEditName={setEditName} setEditStatusMsg={setEditStatusMsg}
          setEditPosition={setEditPosition} setEditPhone={setEditPhone}
          onEdit={() => { setEditName(myProfile?.name || ""); setEditStatusMsg(myProfile?.statusMsg || ""); setEditPosition(myProfile?.position || ""); setEditPhone(formatPhone(myProfile?.phone || "")); setEditingProfile(true); }}
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

  // ── 새 메시지 알림 배너 (카톡 스타일, 화면 최상단 고정) ──
  // 모바일 앱은 메신저 패널을 visibility:hidden 래퍼로 감싸 항상 마운트해두는 구조라,
  // 배너가 그 안에 있으면 메신저를 열기 전까지 화면에 보이지 않는다.
  // document.body에 포탈로 그려서 메신저 창 열림 여부와 무관하게 항상 보이도록 한다.
  const msgToastEl = msgToast && createPortal(
    <div
      onClick={openToastRoom}
      style={{
        position: "fixed", top: "env(safe-area-inset-top, 0px)", left: "50%", transform: "translateX(-50%)",
        marginTop: 10, zIndex: 2147483000, cursor: "pointer",
        width: "min(360px, calc(100vw - 24px))",
        background: "#fff", borderRadius: 14, boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
        border: "1px solid #eef0f4", padding: "12px 14px",
        display: "flex", alignItems: "center", gap: 10,
        animation: "kpfMsgToastIn 0.25s ease-out",
      }}
    >
      <style>{`@keyframes kpfMsgToastIn { from { opacity:0; transform:translate(-50%,-12px); } to { opacity:1; transform:translate(-50%,0); } }`}</style>
      <Avatar name={msgToast.senderName} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#1B2B4B", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msgToast.senderName}{msgToast.roomName ? <span style={{ fontWeight: 600, color: "#7A879C" }}> · {msgToast.roomName}</span> : null}</span>
          {msgToast.mention && <span data-toast-mention style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 900, color: "#fff", background: "#1B2B4B", borderRadius: 999, padding: "1px 8px" }}>@나를 언급</span>}
        </div>
        <div style={{ fontSize: 12.5, color: "#4b5563", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{msgToast.text}</div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); setMsgToast(null); }}
        style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 16, cursor: "pointer", lineHeight: 1, padding: 4, flexShrink: 0 }}
      >×</button>
    </div>,
    document.body
  );

  // ════════ ⭐ 2026-11-03 단체방 팝업 (PC·모바일 공용) — 만들기 · 대화상대 · 초대 · 이름 바꾸기 ════════
  const matchFriend = (f, q) => !q || [f.name, f.team, f.position, f.email].some(v => String(v || "").includes(q));
  const pickRow = (f, checked, onToggle) => (
    <label key={f.uid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 10, cursor: "pointer", background: checked ? "#eff6ff" : "transparent" }}>
      <input type="checkbox" checked={checked} onChange={onToggle}
        style={{ accentColor: "#1B2B4B", width: 15, height: 15 }} />
      <Avatar name={f.name} photo={f.photo} size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: checked ? 700 : 500, color: "#1B2B4B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
        {(f.team || f.position || f.crossCompany) && (
          <div style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[f.crossCompany ? `연동 · ${f.company}` : "", f.team, f.position].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    </label>
  );
  const chipRow = (uids, onRemove) => uids.length > 0 && (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
      {uids.map(uid => {
        const f = friends.find(x => x.uid === uid);
        return (
          <span key={uid} onClick={() => onRemove(uid)} style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#1B2B4B", borderRadius: 12, padding: "3px 8px", cursor: "pointer" }}>
            {f?.name || "알 수 없음"} ✕
          </span>
        );
      })}
    </div>
  );
  const dlgOverlay = { position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" };
  const dlgBox = { background: "#fff", borderRadius: 20, width: "90%", maxWidth: 360, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" };
  const dlgHead = (title, onX) => (
    <div style={{ background: DOCK_BG, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
      <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{title}</span>
      <button onClick={onX} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
    </div>
  );
  const searchBox = (value, onChange) => (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder="이름 · 팀 · 직급 검색"
      style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 20, padding: "6px 14px", fontSize: 12, outline: "none", boxSizing: "border-box", marginBottom: 8, background: "#f8fafc" }} />
  );
  const btnGray = { flex: 1, padding: "10px 0", background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" };
  const btnNavy = (off) => ({ flex: 1, padding: "10px 0", background: "#1B2B4B", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: off ? "default" : "pointer", opacity: off ? 0.4 : 1 });

  const liveMembersRoom = membersRoom ? (rooms.find(r => r.id === membersRoom.id) || membersRoom) : null;
  const liveInviteRoom = inviteRoom ? (rooms.find(r => r.id === inviteRoom.id) || inviteRoom) : null;
  const closeNewGroup = () => { setNewGroupModal(false); setGroupSearch(""); };

  const groupModalsEl = (
    <>
      {/* 단체 채팅방 만들기 */}
      {newGroupModal && (
        <div data-kp-dialog="1" style={dlgOverlay} onClick={closeNewGroup}>
          <div style={dlgBox} onClick={e => e.stopPropagation()}>
            {dlgHead("단체 채팅방 만들기", closeNewGroup)}
            <div style={{ padding: "16px 20px 12px", display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 5 }}>채팅방 이름 <span style={{ fontWeight: 400, color: "#9ca3af" }}>(선택 · 비우면 멤버 이름으로 표시)</span></label>
                <input value={groupName} onChange={e => setGroupName(e.target.value)}
                  placeholder={groupMembers.length ? autoGroupName(groupMembers.map(u => friends.find(x => x.uid === u)?.name || "")) : "채팅방 이름 입력"}
                  style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 12px", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>
                대화상대 선택 ({groupMembers.length}명 선택됨)
              </label>
              {chipRow(groupMembers, (uid) => setGroupMembers(prev => prev.filter(u => u !== uid)))}
              {searchBox(groupSearch, setGroupSearch)}
              <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                {friends.filter(f => matchFriend(f, groupSearch.trim())).map(f => {
                  const checked = groupMembers.includes(f.uid);
                  return pickRow(f, checked, () => setGroupMembers(prev => checked ? prev.filter(u => u !== f.uid) : [...prev, f.uid]));
                })}
              </div>
            </div>
            <div style={{ padding: "0 20px 20px", display: "flex", gap: 10, flexShrink: 0 }}>
              <button onClick={closeNewGroup} style={btnGray}>취소</button>
              <button onClick={createGroup} disabled={groupMembers.length === 0} style={btnNavy(groupMembers.length === 0)}>만들기</button>
            </div>
          </div>
        </div>
      )}

      {/* 대화상대 목록 */}
      {liveMembersRoom && (
        <div data-kp-dialog="1" style={dlgOverlay} onClick={() => setMembersRoom(null)}>
          <div style={dlgBox} onClick={e => e.stopPropagation()}>
            {dlgHead(`대화상대 ${liveMembersRoom.members?.length || 0}명`, () => setMembersRoom(null))}
            <div style={{ overflowY: "auto", flex: 1 }}>
              <div onClick={() => { const r = liveMembersRoom; setMembersRoom(null); openInvite(r); }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", cursor: "pointer", borderBottom: "1px solid #f3f4f6", color: "#1B2B4B", fontWeight: 700, fontSize: 13 }}
                onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ width: 36, height: 36, borderRadius: "30%", background: "#eef1f7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#1B2B4B" }}>＋</div>
                대화상대 초대
              </div>
              {(liveMembersRoom.members || []).slice().sort((a, b) => (a === myUid ? -1 : b === myUid ? 1 : 0)).map(uid => {
                const isMe = uid === myUid;
                const f = friends.find(x => x.uid === uid);
                const p = liveMembersRoom.memberProfiles?.[uid] || {};
                const nm = isMe ? myName : (p.name || f?.name || "알 수 없음");
                const ph = isMe ? (myProfile?.photo || "") : (f?.photo || p.photo || "");
                const sub = isMe ? [myHr?.team, myProfile?.position].filter(Boolean).join(" · ") : [f?.crossCompany ? `연동 · ${f.company}` : "", f?.team, f?.position].filter(Boolean).join(" · ");
                return (
                  <div key={uid} onClick={() => { if (!isMe && f) { setMembersRoom(null); setProfileView(f); } }}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", cursor: isMe ? "default" : "pointer", borderBottom: "1px solid #f3f4f6" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <Avatar name={nm} photo={ph} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                        {nm}{isMe && <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: "#1B2B4B", borderRadius: 8, padding: "1px 6px", marginLeft: 6 }}>나</span>}
                        {liveMembersRoom.createdBy === uid && <span style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", marginLeft: 6 }}>방장</span>}
                      </div>
                      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{sub}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 대화상대 초대 */}
      {liveInviteRoom && (() => {
        const inRoom = liveInviteRoom.members || [];
        const candidates = friends.filter(f => !inRoom.includes(f.uid));
        const shown = candidates.filter(f => matchFriend(f, inviteSearch.trim()));
        const close = () => { setInviteRoom(null); setInviteSel([]); setInviteSearch(""); };
        return (
          <div data-kp-dialog="1" style={dlgOverlay} onClick={close}>
            <div style={dlgBox} onClick={e => e.stopPropagation()}>
              {dlgHead("대화상대 초대", close)}
              <div style={{ padding: "16px 20px 12px", display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>{getRoomName(liveInviteRoom)} · 지금 {inRoom.length}명</div>
                {chipRow(inviteSel, (uid) => setInviteSel(prev => prev.filter(u => u !== uid)))}
                {searchBox(inviteSearch, setInviteSearch)}
                <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                  {candidates.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "#9ca3af" }}>초대할 수 있는 친구가 없습니다</div>
                  ) : shown.map(f => {
                    const checked = inviteSel.includes(f.uid);
                    return pickRow(f, checked, () => setInviteSel(prev => checked ? prev.filter(u => u !== f.uid) : [...prev, f.uid]));
                  })}
                </div>
              </div>
              <div style={{ padding: "0 20px 20px", display: "flex", gap: 10, flexShrink: 0 }}>
                <button onClick={close} style={btnGray}>취소</button>
                <button onClick={inviteMembers} disabled={inviteSel.length === 0} style={btnNavy(inviteSel.length === 0)}>
                  초대{inviteSel.length ? ` (${inviteSel.length})` : ""}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 채팅방 이름 바꾸기 */}
      {renameRoom && (
        <div data-kp-dialog="1" style={dlgOverlay} onClick={() => setRenameRoom(null)}>
          <div style={{ ...dlgBox, maxWidth: 340 }} onClick={e => e.stopPropagation()}>
            {dlgHead("채팅방 이름 바꾸기", () => setRenameRoom(null))}
            <div style={{ padding: "16px 20px 12px" }}>
              <input value={renameText} onChange={e => setRenameText(e.target.value.slice(0, 50))}
                onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) saveRename(); }}
                placeholder={autoGroupName(getGroupPeople(renameRoom).map(p => p.name))}
                ref={imeFocusRef}
                style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 12px", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>비워 두면 멤버 이름으로 자동 표시됩니다. 모든 대화상대에게 같은 이름으로 보입니다.</div>
            </div>
            <div style={{ padding: "0 20px 20px", display: "flex", gap: 10 }}>
              <button onClick={() => setRenameRoom(null)} style={btnGray}>취소</button>
              <button onClick={saveRename} style={btnNavy(false)}>확인</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ⭐ 2026-11-06 오더 공유 · 메시지 전달 팝업(PC·모바일 공용)
  const fwdRooms = fwdMsg ? rooms.filter(r => !fwdSearch.trim() || getRoomName(r).includes(fwdSearch.trim())) : [];
  const extraModalsEl = (
    <>
      {orderPickOpen && <OrderPickModal onPick={shareOrder} onClose={() => setOrderPickOpen(false)} />}
      {fwdMsg && createPortal(
        <div data-kp-dialog="1" style={{ position: "fixed", inset: 0, zIndex: 2147482990, background: "rgba(11,20,40,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Noto Sans KR', sans-serif" }} onClick={() => setFwdMsg(null)}>
          <div data-msg-forward onClick={e => e.stopPropagation()} style={{ width: "min(380px,100%)", maxHeight: "84vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 60px rgba(11,20,40,0.4)" }}>
            <div style={{ padding: "14px 18px", background: DOCK_BG, color: "#fff", display: "flex", alignItems: "center" }}>
              <span style={{ flex: 1, fontSize: 16, fontWeight: 900 }}>메시지 전달</span>
              <button type="button" onClick={() => setFwdMsg(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ margin: "12px 16px 8px", padding: "8px 12px", borderRadius: 12, background: "#F5F8FD", border: "1px solid #E3E8F0", fontSize: 13, color: "#3A4A66", whiteSpace: "pre-wrap", maxHeight: 84, overflow: "hidden" }}>
              <b style={{ color: NAVY }}>{fwdMsg.senderName}</b> · {fwdMsg.type === "image" ? "[사진]" : fwdMsg.type === "file" ? `[파일] ${fwdMsg.fileName || ""}` : fwdMsg.type === "order" ? orderLast(fwdMsg.order || {}) : (fwdMsg.text || "")}
            </div>
            <div style={{ padding: "0 16px" }}>
              <input value={fwdSearch} onChange={e => setFwdSearch(e.target.value)} placeholder="채팅방 검색"
                style={{ width: "100%", height: 36, border: "1px solid #E3E8F0", borderRadius: 10, padding: "0 12px", fontSize: 13, outline: "none", boxSizing: "border-box", background: "#F8FAFD" }} />
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
              {fwdRooms.length === 0 ? <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: "#9ca3af" }}>보낼 채팅방이 없습니다</div> : fwdRooms.map(r => {
                const on = fwdSel.includes(r.id);
                return (
                  <label key={r.id} data-fwd-room style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, cursor: "pointer", background: on ? "#EEF3FB" : "transparent" }}>
                    <input type="checkbox" checked={on} onChange={() => setFwdSel(p => on ? p.filter(x => x !== r.id) : [...p, r.id])} style={{ width: 16, height: 16, accentColor: NAVY }} />
                    {r.type === "group" ? <GroupAvatar people={getGroupPeople(r)} size={34} /> : <Avatar name={getRoomName(r)} photo={getRoomPhoto(r)} size={34} />}
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: on ? 800 : 600, color: "#0F1A30", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getRoomName(r)}{r.type === "group" ? <span style={{ color: "#9ca3af", fontWeight: 600, marginLeft: 4 }}>{r.members?.length || 0}</span> : null}</span>
                  </label>
                );
              })}
            </div>
            <div style={{ padding: "10px 16px 16px", display: "flex", gap: 8, borderTop: "1px solid #EEF1F6" }}>
              <button type="button" onClick={() => setFwdMsg(null)} style={btnGray}>취소</button>
              <button type="button" data-fwd-send onClick={doForward} disabled={!fwdSel.length || fwdBusy} style={btnNavy(!fwdSel.length || fwdBusy)}>{fwdBusy ? "보내는 중…" : `전달${fwdSel.length ? ` (${fwdSel.length})` : ""}`}</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );

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
              <div style={{ background: DOCK_BG, padding: "28px 20px 20px", textAlign: "center" }}>
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
                      <a href={`tel:${profileView.phone}`} style={{ color: "#1B2B4B", fontWeight: 600, textDecoration: "none" }}>{formatPhone(profileView.phone)}</a>
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
        {groupModalsEl}
        {extraModalsEl}

        {/* 연락처 카드 전송 모달 */}
        {contactPickModal && (
          <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            onClick={() => setContactPickModal(false)}>
            <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, overflow: "hidden", maxHeight: "60vh", display: "flex", flexDirection: "column" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ background: DOCK_BG, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
                    {f.phone && <span style={{ fontSize: 12, color: "#9ca3af" }}>{formatPhone(f.phone)}</span>}
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
                rows={4} ref={imeFocusRef}
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
        {msgToastEl}
      </>
    );
  }

  return (
    <>
      {/* 플로팅 버튼 — 공용 독 디자인 */}
      <FabButton bottom={BTN_BOTTOM} active={open} title="메신저" badge={totalUnread} onClick={() => setOpen(p => !p)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8M8 13h5" /></svg>
      </FabButton>

      {/* 메신저 패널 */}
      {open && (
        <div data-ro-allow data-msg-win style={{
          position: "fixed", ...(winPos && !mobileMode ? { left: winPos.left, top: winPos.top } : { bottom: 24, right: 92 }),
          width: panelW, height: panelH, zIndex: 99997, borderRadius: 22, boxShadow: "0 24px 60px rgba(15,26,48,0.35)",
        }}>
          {/* 크기 버튼(작게·보통·크게) — 창 위쪽 오른편 */}
          {!mobileMode && (
            <div data-msg-move onMouseDown={startMovePanelDrag} title="끌어서 옮기기" style={{ position: "absolute", top: -34, left: 0, height: 30, display: "flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 12, background: "#0F1A30", color: "#C9D7F2", boxShadow: "0 8px 20px rgba(15,26,48,0.3)", cursor: "move", userSelect: "none", fontSize: 12, fontWeight: 800, fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3" /></svg>
              끌어서 옮기기
            </div>
          )}
          <div style={{ position: "absolute", top: -34, right: 0, display: "flex", alignItems: "center", gap: 6, padding: "3px 4px 3px 10px", borderRadius: 12, background: "#0F1A30", boxShadow: "0 8px 20px rgba(15,26,48,0.3)" }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", color: "#8FB0F0", fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>SIZE</span>
            <SizeButtons preset={winPreset} onPick={pickWin} />
          </div>
          {/* 리사이즈 핸들 (패널 왼쪽 상단 모서리) */}
          <div
            onMouseDown={startResizePanelDrag}
            style={{
              position: "absolute", top: 0, left: 0,
              width: 22, height: 22, cursor: "nw-resize",
              zIndex: 10, borderRadius: "16px 0 10px 0",
              background: "rgba(143,176,240,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            title="드래그하여 크기 조정"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 9L9 1M1 5L5 1M5 9L9 5" stroke="#1B2B4B" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
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
            <div style={{ background: DOCK_BG, padding: "28px 20px 20px", textAlign: "center" }}>
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
                    <a href={`tel:${profileView.phone}`} style={{ color: "#1B2B4B", fontWeight: 600, textDecoration: "none" }}>{formatPhone(profileView.phone)}</a>
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

      {/* ─── 단체 채팅방 팝업(만들기·대화상대·초대·이름) ─── */}
      {groupModalsEl}
      {extraModalsEl}

      {/* 연락처 카드 전송 모달 */}
      {contactPickModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setContactPickModal(false)}>
          <div style={{ background: "#fff", borderRadius: 20, width: 320, maxHeight: 480, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ background: DOCK_BG, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
                  {f.phone && <span style={{ fontSize: 12, color: "#9ca3af" }}>{formatPhone(f.phone)}</span>}
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
              placeholder="공지 내용을 입력하세요..." rows={4} ref={imeFocusRef}
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
      {msgToastEl}
    </>
  );
}

// ════════════════ 친구 목록 뷰 ════════════════
function FriendsView({ myProfile, friends, rooms, unreadMap, totalUnread, getRoomName, getRoomPhoto, onOpenDM, onOpenSelf, onOpenRoom, onOpenProfile, onOpenPeerProfile, onNewGroup, onClose, onLeaveRoom, getGroupPeople, onShowMembers, onInviteRoom, onRenameRoom, myUid, mobileMode, themeHdr, activeRoomId, notifyEnabled, onToggleNotify }) {
  const [tab, setTab] = useState("friends"); // friends | chats
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
            <button onClick={onToggleNotify} title={notifyEnabled ? "새 메시지 알림 끄기" : "새 메시지 알림 켜기"} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: notifyEnabled ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.35)", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {!notifyEnabled && <span style={{ position: "absolute", width: 22, height: 1.5, background: "rgba(255,255,255,0.9)", transform: "rotate(-45deg)" }} />}
            </button>
            <button onClick={onNewGroup} title="단체 채팅" style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "rgba(255,255,255,0.8)", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 0 }}>✕</button>
          </div>
        </div>
        {/* 탭 */}
        <div style={{ display: "flex", gap: 0 }}>
          {[["friends","친구"], ["chats","채팅"]].map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "8px 0", border: "none", cursor: "pointer",
              background: "none", color: tab === t ? "#fff" : "rgba(255,255,255,0.5)",
              fontWeight: tab === t ? 700 : 400, fontSize: 13,
              borderBottom: tab === t ? "2px solid #fff" : "2px solid transparent",
              transition: "all 0.15s",
            }}>
              {l}{t === "chats" && totalUnread > 0 ? <span style={{ marginLeft: 4, background: "#ef4444", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 5px", fontWeight: 700 }}>{totalUnread}</span> : ""}
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
                  {/* ⭐ 2026-11-03 단체방은 카톡처럼 멤버 얼굴 최대 4개(2x2) */}
                  {room.type === "group"
                    ? <GroupAvatar people={getGroupPeople(room)} size={44} />
                    : <Avatar name={name} photo={photo} size={44} bgColor="#1B2B4B" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                      {name}
                      {room.type === "group" && <span style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", marginLeft: 5 }}>{room.members?.length || 0}</span>}
                    </span>
                    <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0, marginLeft: 4 }}>{fmtLastMsg(room.lastAt)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{room.lastMsg || ""}</span>
                    {/* ⭐ 2026-11-06 나를 @멘션한 뒤 아직 안 읽은 방 */}
                    {(room.mentionAt?.[myUid]?.toMillis?.() || 0) > (room.lastRead?.[myUid]?.toMillis?.() || 0) && (
                      <span data-room-mention title="나를 언급한 메시지가 있습니다" style={{ marginLeft: "auto", background: "#1B2B4B", color: "#fff", fontSize: 11, fontWeight: 900, borderRadius: 20, height: 18, display: "flex", alignItems: "center", padding: "0 6px", flexShrink: 0 }}>@나</span>
                    )}
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
            {/* 나에게 */}
            <div onClick={onOpenSelf}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
              onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ width: 40, height: 40, borderRadius: "30%", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1B2B4B" }}>나에게</div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>메모, 링크, 파일 저장</div>
              </div>
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
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1 }}>{f.name}</span>
                    {f.crossCompany && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#1B2B4B", background: "#eef1f7", borderRadius: 6, padding: "1px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0, maxWidth: 110 }}>
                        연동 · {f.company}
                      </span>
                    )}
                  </div>
                  {f.statusMsg && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.statusMsg}</div>}
                </div>
                <button onClick={e => { e.stopPropagation(); onOpenDM(f); }}
                  style={{ background: "#1B2B4B", color: "#fff", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>대화</button>
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
            top: Math.min(contextMenu.y, window.innerHeight - (contextMenu.room?.type === "group" ? 250 : 120)),
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
              // ⭐ 2026-11-03 단체방 전용 메뉴
              ...(contextMenu.room?.type === "group" ? [
                {
                  label: `대화상대 ${contextMenu.room.members?.length || 0}명`,
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
                  action: () => { onShowMembers(contextMenu.room); closeContext(); },
                  color: "#111827",
                },
                {
                  label: "대화상대 초대",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>,
                  action: () => { onInviteRoom(contextMenu.room); closeContext(); },
                  color: "#111827",
                },
                {
                  label: "채팅방 이름 바꾸기",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
                  action: () => { onRenameRoom(contextMenu.room); closeContext(); },
                  color: "#111827",
                },
              ] : []),
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
function ChatView({ room, roomName, roomPhoto, messages, myUid, myProfile, input, setInput, onSend, onBack, onClose, editMsg, setEditMsg, editText, setEditText, onSaveEdit, onDeleteMsg, msgSearch, setMsgSearch, msgContainerRef, inputRef, onSendImage, onSendFile, onSendLocation, onSendContact, onSendNotice, fileUploading, sendingImgs = [], friends, mobileMode, themeHdr, themeMyBubble, themeChatBg, replyTo, setReplyTo, onReply, onAddReaction, onSendToSelf, groupPeople = [], onShowMembers, onInvite, onRename, onLeave, onShareOrder, onPin, onUnpin, onForward, quickReplies = [], onSaveQuickReplies, mentionPeople = [], myName = "" }) {
  const [showSearch, setShowSearch] = useState(false);
  // ⭐ 2026-11-06 오더 열기 · 공지 접기 · 자주 쓰는 문구 · @멘션 고르기 · 모아보기
  const [orderView, setOrderView] = useState(null);
  const [pinFold, setPinFold] = useState(false);
  const [pinMore, setPinMore] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [quickEdit, setQuickEdit] = useState(false);
  const [quickDraft, setQuickDraft] = useState("");
  const [mention, setMention] = useState(null); // { q, start, idx }
  const [gallery, setGallery] = useState(null); // null | "image" | "file" | "order" | "notice"
  useEffect(() => { setPinFold(false); setPinMore(false); setGallery(null); setShowQuick(false); setMention(null); }, [room?.id]);
  const mentionNames = mentionPeople.map((p) => p.name);
  // 모아보기·문구 창은 Esc로 닫는다(메신저 창 전체가 닫히지 않게 먼저 받는다)
  useEscClose(!!gallery || showQuick, () => { setGallery(null); setShowQuick(false); setQuickEdit(false); });
  const mentionHits = mention ? [{ uid: "all", name: "전체" }, ...mentionPeople].filter((p) => !mention.q || p.name.includes(mention.q)).slice(0, 7) : [];
  // 입력칸에서 커서 앞이 "@글자" 이면 멤버 고르기 창
  const trackMention = (el) => {
    if (!mentionPeople.length || !el) { if (mention) setMention(null); return; }
    const pos = el.selectionStart ?? el.value.length;
    const m = /(^|\s)@([^\s@]{0,12})$/.exec(el.value.slice(0, pos));
    if (m) setMention({ q: m[2], start: pos - m[2].length - 1, idx: 0 }); else if (mention) setMention(null);
  };
  const pickMention = (p) => {
    const el = inputRef?.current; if (!mention || !p) return;
    const pos = el?.selectionStart ?? input.length;
    const next = `${input.slice(0, mention.start)}@${p.name} ${input.slice(pos)}`;
    setInput(next); setMention(null);
    const caret = mention.start + p.name.length + 2;
    setTimeout(() => { try { el?.focus(); el?.setSelectionRange(caret, caret); } catch { /* 무시 */ } }, 0);
  };
  const insertQuick = (t) => {
    setShowQuick(false);
    const cur = input.trim() ? `${input.replace(/\s+$/, "")} ${t}` : t;
    setInput(cur);
    setTimeout(() => inputRef?.current?.focus?.(), 0);
  };
  const scrollToMsg = (id) => {
    const el = id && document.getElementById(`msg-${id}`);
    if (!el) return false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.transition = "background 0.3s"; el.style.background = "rgba(27,43,75,0.15)";
    setTimeout(() => { el.style.background = ""; }, 1200);
    return true;
  };
  const copyText = (msg) => (msg.type === "order" ? orderSummary(msg.order || {}) : msg.type === "file" ? (msg.fileUrl || msg.fileName || "") : msg.type === "image" ? (msg.imageUrl || "") : (msg.text || ""));
  const [showRoomMenu, setShowRoomMenu] = useState(false); // ⭐ 2026-11-03 단체방 ≡ 메뉴
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [imgPreview, setImgPreview] = useState(null);
  // ⭐ 2026-11-05 카카오톡처럼 — 파일을 대화창에 끌어 놓거나 Ctrl+V로 붙여넣으면 미리보기 후 전송
  const [dropOn, setDropOn] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]); // [{ file, url }]
  const dragDepth = useRef(0);
  const queueFiles = (list) => {
    const arr = [...(list || [])].filter((f) => f && f.size > 0);
    if (!arr.length) return;
    setPendingFiles((p) => [...p, ...arr.map((file) => ({ file, url: /^image\//.test(file.type) ? URL.createObjectURL(file) : "" }))].slice(0, 10));
  };
  const clearPending = () => { setPendingFiles((p) => { p.forEach((x) => x.url && URL.revokeObjectURL(x.url)); return []; }); };
  const sendPending = async () => {
    const list = pendingFiles; clearPending();
    // 사진은 동시에, 파일은 차례로
    const imgs = list.filter(({ file }) => /^image\//.test(file.type)); const others = list.filter(({ file }) => !/^image\//.test(file.type));
    await Promise.all(imgs.map(({ file }) => Promise.resolve(onSendImage(file)).catch((e) => console.error(e))));
    for (const { file } of others) { try { await onSendFile(file); } catch (e) { console.error(e); } }
    setTimeout(() => inputRef?.current?.focus?.(), 0);
  };
  useEffect(() => {
    if (!pendingFiles.length) return undefined;
    const k = (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); e.stopPropagation(); sendPending(); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); clearPending(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  const chatRootRef = useRef(null);
  const queueRef = useRef(queueFiles); queueRef.current = queueFiles;
  useEffect(() => { // Ctrl+V — 입력칸이든 대화창 아무 곳이든(다른 입력칸에 붙여넣는 건 그대로)
    const onPaste = (e) => {
      const fs = [...(e.clipboardData?.files || [])]; if (!fs.length) return;
      const t = e.target; const root = chatRootRef.current;
      const inChat = root && (root.contains(t) || t === document.body || t === document.documentElement);
      if (!inChat) return;
      e.preventDefault(); queueRef.current(fs);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [ctxMenu, setCtxMenu] = useState(null); // {msg, x, y}
  const [showEmojiPicker, setShowEmojiPicker] = useState(null); // msg
  const [selfSentToast, setSelfSentToast] = useState(false);
  const longPressTimer = useRef(null);
  const EMOJI_LIST = ["👍","❤️","😆","😮","😢","✅"];

  useEffect(() => {
    if (!ctxMenu && !showEmojiPicker) return;
    const handler = (e) => {
      if (!e.target.closest("[data-ctx-menu]") && !e.target.closest("[data-emoji-picker]")) {
        setCtxMenu(null);
        setShowEmojiPicker(null);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [ctxMenu, showEmojiPicker]);

  const handleMsgContextMenu = (e, msg) => {
    e.preventDefault();
    e.stopPropagation();
    const x = e.clientX || (e.touches?.[0]?.clientX ?? 0);
    const y = e.clientY || (e.touches?.[0]?.clientY ?? 0);
    setCtxMenu({ msg, x, y });
    setShowEmojiPicker(null);
  };

  const startLongPress = (e, msg) => {
    if (!mobileMode) return;
    longPressTimer.current = setTimeout(() => {
      const touch = e.touches?.[0];
      if (touch) handleMsgContextMenu({ preventDefault: () => {}, stopPropagation: () => {}, clientX: touch.clientX, clientY: touch.clientY }, msg);
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  return (
    <div ref={chatRootRef} style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff", position: "relative" }}
      onDragEnter={(e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current += 1; setDropOn(true); }}
      onDragOver={(e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      onDragLeave={(e) => { if (!hasFiles(e)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDropOn(false); }}
      onDrop={(e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current = 0; setDropOn(false); queueFiles(e.dataTransfer.files); }}>
      {dropOn && (
        <div data-msg-drop style={{ position: "absolute", inset: 8, zIndex: 50, border: "3px dashed #4B6CB7", borderRadius: 16, background: "rgba(238,243,251,0.92)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ textAlign: "center", color: "#1B2B4B", fontWeight: 900, fontSize: 16 }}>여기에 놓으면 보낼 준비가 됩니다<div style={{ fontSize: 12, fontWeight: 700, color: "#5B6B85", marginTop: 4 }}>사진 · 파일 (최대 10개)</div></div>
        </div>
      )}
      {pendingFiles.length > 0 && (
        <div data-msg-pending style={{ position: "absolute", inset: 0, zIndex: 60, background: "rgba(11,20,40,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={clearPending}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 360, boxShadow: "0 18px 50px rgba(0,0,0,.25)", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", fontWeight: 900, fontSize: 15, color: "#0F1A30" }}>{pendingFiles.length}개 보내기</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 16px 12px", maxHeight: 300, overflowY: "auto" }}>
              {pendingFiles.map((p, i) => (
                <div key={i} style={{ position: "relative", width: pendingFiles.length === 1 ? "100%" : 96, height: pendingFiles.length === 1 ? 220 : 96, borderRadius: 10, border: "1px solid #E3E8F0", background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {p.url ? <img src={p.url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                    : <div style={{ padding: 6, fontSize: 11, fontWeight: 700, color: "#3A4A66", textAlign: "center", wordBreak: "break-all" }}>📄 {p.file.name}</div>}
                  <button type="button" onClick={() => setPendingFiles((l) => { const n = [...l]; const [x] = n.splice(i, 1); if (x?.url) URL.revokeObjectURL(x.url); return n; })}
                    style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", border: "none", background: "rgba(15,26,48,.7)", color: "#fff", fontSize: 12, cursor: "pointer" }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, padding: "10px 16px 16px" }}>
              <button type="button" onClick={clearPending} style={{ flex: 1, height: 40, borderRadius: 12, border: "1px solid #DCE3EE", background: "#fff", fontWeight: 800, color: "#5B6B85", cursor: "pointer" }}>취소</button>
              <button type="button" onClick={sendPending} style={{ flex: 1.6, height: 40, borderRadius: 12, border: "none", background: themeMyBubble || "#1B2B4B", color: "#fff", fontWeight: 900, cursor: "pointer" }}>전송 (Enter)</button>
            </div>
          </div>
        </div>
      )}
      {/* 헤더 */}
      <div style={{ background: themeHdr, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        {room.type === "group"
          ? <GroupAvatar people={groupPeople} size={32} />
          : <Avatar name={roomName} photo={roomPhoto} size={32} bgColor="#243a60" />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{roomName}</div>
          {room.type === "group" && room.members && (
            <div onClick={() => room.id && onShowMembers?.()} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", cursor: room.id ? "pointer" : "default" }}>{room.members.length}명</div>
          )}
        </div>
        {/* ⭐ 2026-11-06 사진·파일·오더 모아보기 */}
        <button onClick={() => setGallery(g => g ? null : "image")} title="사진·파일·오더 모아보기" data-msg-gallery-btn style={{ background: "none", border: "none", color: gallery ? "#fff" : "rgba(255,255,255,0.6)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
        </button>
        <button onClick={() => setShowSearch(p => !p)} title="이 방 메시지 검색" style={{ background: "none", border: "none", color: showSearch ? "#fff" : "rgba(255,255,255,0.5)", cursor: "pointer", padding: 4 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        {/* ⭐ 2026-11-03 단체방 메뉴(≡) — 대화상대 · 초대 · 이름 바꾸기 · 나가기 */}
        {room.type === "group" && room.id && (
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowRoomMenu(p => !p)} title="채팅방 메뉴" style={{ background: "none", border: "none", color: showRoomMenu ? "#fff" : "rgba(255,255,255,0.6)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
            </button>
            {showRoomMenu && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 100001 }} onClick={() => setShowRoomMenu(false)} />
                <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100002, background: "#fff", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", border: "1px solid #e5e7eb", overflow: "hidden", minWidth: 190 }}>
                  {[
                    { label: `대화상대 ${room.members?.length || 0}명`, action: onShowMembers },
                    { label: "＋ 대화상대 초대", action: onInvite },
                    { label: "채팅방 이름 바꾸기", action: onRename },
                    { label: "채팅방 나가기", action: onLeave, danger: true },
                  ].map(item => (
                    <button key={item.label} onClick={() => { setShowRoomMenu(false); item.action?.(); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 16px", background: "none", border: "none", borderBottom: "1px solid #f9fafb", cursor: "pointer", fontSize: 13, fontWeight: 600, color: item.danger ? "#ef4444" : "#111827" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>

      {/* ⭐ 2026-11-06 고정 공지 — 방마다 1개, 누르면 그 메시지로 이동 */}
      {room.pinned?.text && (
        pinFold ? (
          <button type="button" onClick={() => setPinFold(false)} data-msg-pin-fold
            style={{ position: "absolute", top: 62, right: 12, zIndex: 20, height: 30, padding: "0 12px", borderRadius: 999, border: "1px solid #C9D6EE", background: "#fff", color: NAVY, fontSize: 12.5, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 12px rgba(15,26,48,0.12)", display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5" /><path d="M9 10.76V6a3 3 0 0 1 6 0v4.76l3 3.24H6z" /></svg>공지
          </button>
        ) : (
          <div data-msg-pin style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "#EEF3FB", borderBottom: "1px solid #D5E0F2", flexShrink: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: 9, background: NAVY, color: "#8FB0F0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5" /><path d="M9 10.76V6a3 3 0 0 1 6 0v4.76l3 3.24H6z" /></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => { if (!scrollToMsg(room.pinned.msgId)) setPinMore(v => !v); }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#4B6CB7" }}>공지 · {room.pinned.by || room.pinned.senderName || ""}</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0F1A30", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", ...(pinMore ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }) }}>{room.pinned.text}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
              <button type="button" onClick={() => setPinMore(v => !v)} style={{ height: 24, padding: "0 8px", borderRadius: 7, border: "1px solid #C9D6EE", background: "#fff", color: NAVY, fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>{pinMore ? "줄이기" : "펼치기"}</button>
              <div style={{ display: "flex", gap: 4 }}>
                <button type="button" onClick={() => setPinFold(true)} style={{ height: 24, padding: "0 8px", borderRadius: 7, border: "none", background: "transparent", color: "#5B6B85", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>접기</button>
                {room.id && <button type="button" data-msg-unpin onClick={onUnpin} style={{ height: 24, padding: "0 8px", borderRadius: 7, border: "none", background: "transparent", color: "#5B6B85", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>해제</button>}
              </div>
            </div>
          </div>
        )
      )}

      {/* ⭐ 2026-11-06 사진·파일·오더·공지 모아보기(지금 방에 받아 둔 최근 메시지 기준) */}
      {gallery && (() => {
        const pick = { image: (m) => m.type === "image" && m.imageUrl, file: (m) => m.type === "file" && m.fileUrl, order: (m) => m.type === "order" && m.order, notice: (m) => m.type === "notice" };
        const items = messages.filter((m) => !m._optimistic && pick[gallery](m)).slice().reverse();
        const tabs = [["image", "사진"], ["file", "파일"], ["order", "오더"], ["notice", "공지"]];
        return (
          <div data-msg-gallery data-kp-popup="1" style={{ position: "absolute", left: 0, right: 0, top: 56, bottom: 0, zIndex: 40, background: "#fff", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", borderBottom: "1px solid #EEF1F6" }}>
              {tabs.map(([k, l]) => {
                const n = messages.filter((m) => !m._optimistic && pick[k](m)).length;
                return <button key={k} type="button" onClick={() => setGallery(k)} style={{ height: 32, padding: "0 12px", borderRadius: 10, border: `1px solid ${gallery === k ? NAVY : "#DCE3EE"}`, background: gallery === k ? NAVY : "#fff", color: gallery === k ? "#fff" : "#3A4A66", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{l} {n}</button>;
              })}
              <button type="button" onClick={() => setGallery(null)} style={{ marginLeft: "auto", height: 32, padding: "0 12px", borderRadius: 10, border: "none", background: "#F1F4F9", color: "#3A4A66", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>닫기</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
              {items.length === 0 ? <div style={{ padding: 30, textAlign: "center", fontSize: 13, color: "#9ca3af" }}>이 방에 아직 없습니다</div>
                : gallery === "image" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(96px,1fr))", gap: 6 }}>
                    {items.map((m) => <img key={m.id} src={m.imageUrl} alt="" onClick={() => setImgPreview(m.imageUrl)} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 10, cursor: "zoom-in", background: "#F1F4F9" }} />)}
                  </div>
                ) : items.map((m) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: "1px solid #F1F4F9" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: "#0F1A30", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: gallery === "notice" ? "pre-wrap" : "nowrap" }}>
                        {gallery === "file" ? m.fileName : gallery === "order" ? orderLast(m.order) : m.text}
                      </div>
                      <div style={{ fontSize: 12, color: "#7A879C", marginTop: 2 }}>{m.senderName} · {fmtDate(m.createdAt)} {fmtTime(m.createdAt)}{gallery === "file" && m.fileSize ? ` · ${(m.fileSize / 1024).toFixed(1)} KB` : ""}</div>
                    </div>
                    {gallery === "file" && <a href={m.fileUrl} target="_blank" rel="noopener noreferrer" style={{ height: 32, padding: "0 12px", borderRadius: 10, background: NAVY, color: "#fff", fontSize: 12.5, fontWeight: 800, textDecoration: "none", display: "flex", alignItems: "center" }}>열기</a>}
                    {gallery === "order" && <button type="button" onClick={() => setOrderView(m.order)} style={{ height: 32, padding: "0 12px", borderRadius: 10, border: "none", background: NAVY, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>열기</button>}
                    <button type="button" onClick={() => { setGallery(null); setTimeout(() => scrollToMsg(m.id), 50); }} style={{ height: 32, padding: "0 10px", borderRadius: 10, border: "1px solid #DCE3EE", background: "#fff", color: "#3A4A66", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>대화로</button>
                  </div>
                ))}
            </div>
          </div>
        );
      })()}

      {/* 검색바 */}
      {showSearch && (
        <div style={{ padding: "8px 12px", background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
          <input value={msgSearch} onChange={e => setMsgSearch(e.target.value)}
            placeholder="메시지 검색..."
            style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 20, padding: "5px 12px", fontSize: 12, outline: "none", boxSizing: "border-box" }}
            ref={imeFocusRef} />
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
            // ⭐ 2026-11-03 안내 문구(system)를 사이에 두면 말풍선 묶음이 끊기도록
            const isContinued = prev?.senderUid === msg.senderUid && prev?.type !== "system"
              && msg.createdAt && prev.createdAt
              && (msg.createdAt?.toMillis?.() || 0) - (prev.createdAt?.toMillis?.() || 0) < 120000;
            const isLast = !next || next.senderUid !== msg.senderUid || next.type === "system"
              || (next.createdAt?.toMillis?.() || 0) - (msg.createdAt?.toMillis?.() || 0) >= 120000;

            const dateStr = msg.createdAt ? fmtDate(msg.createdAt) : "";
            const showDate = dateStr && dateStr !== prevDate;
            if (showDate) prevDate = dateStr;

            // ⭐ 2026-11-03 안 읽은 사람 수(카톡의 노란 숫자) — 보낼 때 멤버(memberUids) 기준,
            //   나중에 초대된 사람은 옛 메시지 숫자에 영향 없음, 나간 사람은 빼고 센다. (옛 메시지는 totalMembers - readBy)
            const readBy = msg.readBy || [];
            const unreadNum = msg.type === "system" || msg.type === "deleted" ? 0
              : Array.isArray(msg.memberUids) && msg.memberUids.length
                ? msg.memberUids.filter(u => !readBy.includes(u) && (!room.members || room.members.includes(u))).length
                : Math.max(0, (msg.totalMembers || room.members?.length || 1) - readBy.length);

            // ⭐ 2026-11-03 안내 문구 — 가운데 작은 회색 알약 (말풍선·아바타·읽음숫자 없음)
            if (msg.type === "system") {
              return (
                <React.Fragment key={msg.id}>
                  {showDate && (
                    <div data-msg-date style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 6px" }}>
                      <div style={{ flex: 1, height: 1, background: "#cbd5e1" }} />
                      <span style={{ fontSize: 13.5, color: "#334155", fontWeight: 800, whiteSpace: "nowrap", background: "rgba(255,255,255,0.85)", border: "1px solid #DCE3EE", borderRadius: 999, padding: "3px 14px" }}>{dateStr}</span>
                      <div style={{ flex: 1, height: 1, background: "#cbd5e1" }} />
                    </div>
                  )}
                  <div id={`msg-${msg.id}`} style={{ display: "flex", justifyContent: "center", margin: "8px 0 4px" }}>
                    <span style={{ fontSize: 12.5, color: "#4b5563", background: "rgba(15,26,48,0.08)", borderRadius: 12, padding: "4px 12px", maxWidth: "85%", textAlign: "center", lineHeight: 1.5, wordBreak: "keep-all" }}>{msg.text}</span>
                  </div>
                </React.Fragment>
              );
            }

            return (
              <React.Fragment key={msg.id}>
                {/* ⭐ 2026-11-06 날짜 구분선 크게(13.5px 굵게) */}
                {showDate && (
                  <div data-msg-date style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 6px" }}>
                    <div style={{ flex: 1, height: 1, background: "#cbd5e1" }} />
                    <span style={{ fontSize: 13.5, color: "#334155", fontWeight: 800, whiteSpace: "nowrap", background: "rgba(255,255,255,0.85)", border: "1px solid #DCE3EE", borderRadius: 999, padding: "3px 14px" }}>{dateStr}</span>
                    <div style={{ flex: 1, height: 1, background: "#cbd5e1" }} />
                  </div>
                )}
                <div id={`msg-${msg.id}`} style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 6, marginTop: isContinued ? 1 : 8 }}>
                  {/* 상대방 아바타 */}
                  {!isMine && (
                    <div style={{ width: 32, flexShrink: 0, alignSelf: "flex-end", marginBottom: 2 }}>
                      {!isContinued && <Avatar name={msg.senderName} photo={msg.senderPhoto} size={32} />}
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", maxWidth: "74%" }}
                    onContextMenu={mobileMode || msg.type === "deleted" ? undefined : (e) => handleMsgContextMenu(e, msg)}
                    onTouchStart={mobileMode && msg.type !== "deleted" ? (e) => startLongPress(e, msg) : undefined}
                    onTouchEnd={mobileMode ? cancelLongPress : undefined}
                    onTouchMove={mobileMode ? cancelLongPress : undefined}>
                    {!isContinued && !isMine && (
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#374151", marginBottom: 3, paddingLeft: 4 }}>{msg.senderName}</span>
                    )}
                    {msg.forwarded && msg.type !== "deleted" && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#5B6B85", marginBottom: 2, padding: "0 4px" }}>전달됨{msg.fwdFrom ? ` · ${msg.fwdFrom}` : ""}</span>
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
                              <div style={{ fontSize: 11, color: isMine ? "rgba(255,255,255,0.6)" : "#9ca3af", marginTop: 2 }}>{msg.fileSize ? `${(msg.fileSize / 1024).toFixed(1)} KB` : ""}</div>
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
                              <span style={{ fontSize: 12, color: isMine ? "rgba(255,255,255,0.8)" : "#1B2B4B", fontWeight: 600 }}>{formatPhone(msg.contactPhone)}</span>
                            </a>
                          )}
                        </div>
                      ) : msg.type === "order" ? (
                        <OrderCard o={msg.order || {}} isMine={isMine} onOpen={() => setOrderView(msg.order || {})} onCopy={() => navigator.clipboard?.writeText(orderSummary(msg.order || {})).catch(() => {})} />
                      ) : editMsg?.id === msg.id ? (
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input value={editText} onChange={e => setEditText(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") onSaveEdit(); if (e.key === "Escape") setEditMsg(null); }}
                            style={{ border: "1px solid #1B2B4B", borderRadius: 10, padding: "6px 10px", fontSize: 13, outline: "none", minWidth: 120 }}
                            ref={imeFocusRef} />
                          <button onClick={onSaveEdit} style={{ background: "#1B2B4B", color: "#fff", border: "none", borderRadius: 8, padding: "5px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>저장</button>
                          <button onClick={() => setEditMsg(null)} style={{ background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 8, padding: "5px 8px", fontSize: 11, cursor: "pointer" }}>취소</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          {/* 답장 인용 */}
                          {msg.replyToText && (
                            <div
                              onClick={() => {
                                const el = document.getElementById(`msg-${msg.replyToId}`);
                                if (el && msgContainerRef.current) {
                                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                                  el.style.transition = "background 0.3s";
                                  el.style.background = "rgba(27,43,75,0.15)";
                                  setTimeout(() => { el.style.background = ""; }, 1200);
                                }
                              }}
                              style={{
                                padding: "6px 10px 5px", marginBottom: 3,
                                borderRadius: "10px 10px 0 0",
                                background: isMine ? "rgba(0,0,0,0.18)" : "#e8edf5",
                                borderLeft: `3px solid ${isMine ? "rgba(255,255,255,0.7)" : themeMyBubble}`,
                                maxWidth: 240,
                                cursor: "pointer",
                              }}>
                              <div style={{ fontSize: 10, fontWeight: 800, color: isMine ? "rgba(255,255,255,0.85)" : themeMyBubble, marginBottom: 2 }}>{msg.replyToSender}</div>
                              <div style={{ fontSize: 11, fontWeight: 500, color: isMine ? "rgba(255,255,255,0.75)" : "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{msg.replyToText}</div>
                            </div>
                          )}
                          <div
                            style={{
                              padding: "8px 12px",
                              borderRadius: isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                              background: isMine ? themeMyBubble : "#fff",
                              color: isMine ? "#fff" : "#111827",
                              fontSize: 13.5, lineHeight: 1.55,
                              wordBreak: "break-word", whiteSpace: "pre-wrap",
                              // ⭐ 2026-11-06 나를 부른 메시지(@멘션)는 테두리로 표시
                              boxShadow: !isMine && (msg.mentions || []).includes(myUid) ? `0 0 0 2px ${NAVY}` : "0 1px 3px rgba(0,0,0,0.08)",
                            }}>
                            <MentionText text={msg.text} names={mentionNames.length ? [...mentionNames, myName] : (msg.mentions?.length ? [myName] : [])} myName={myName} isMine={isMine} />
                            {msg.edited && <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 4 }}>(수정됨)</span>}
                          </div>
                          {/* 이모티콘 반응 표시 */}
                          {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3, justifyContent: isMine ? "flex-end" : "flex-start" }}>
                              {Object.entries(msg.reactions).filter(([, uids]) => uids.length > 0).map(([emoji, uids]) => (
                                <button key={emoji}
                                  onClick={() => onAddReaction?.(msg.id, emoji)}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 2,
                                    padding: "1px 5px", borderRadius: 10, fontSize: 12,
                                    background: uids.includes(myUid) ? "#dbeafe" : "#f3f4f6",
                                    border: uids.includes(myUid) ? "1px solid #93c5fd" : "1px solid #e5e7eb",
                                    cursor: "pointer", fontWeight: 600, color: "#374151",
                                  }}>
                                  <span>{emoji}</span>
                                  <span style={{ fontSize: 10 }}>{uids.length}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {/* 시간 + 액션 */}
                      {/* ⭐ 2026-11-03 안읽음 숫자는 카톡처럼 모든 메시지에(내 것·남의 것), 시간은 묶음 마지막에만 */}
                      {msg.type !== "deleted" && (isLast || unreadNum > 0) && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", gap: 2, flexShrink: 0 }}>
                          {/* ⭐ 2026-11-06 안읽음 숫자·시간·읽음 크게(12.5px 이상, 숫자는 굵게) */}
                          {unreadNum > 0 && (
                            <span data-msg-unread style={{ fontSize: 13, color: "#D97706", fontWeight: 900, whiteSpace: "nowrap", lineHeight: 1.1 }}>{unreadNum}</span>
                          )}
                          {isLast && <span data-msg-time style={{ fontSize: 12.5, color: "#64748b", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtTime(msg.createdAt)}</span>}
                          {isLast && isMine && unreadNum === 0 && room.type !== "group" && (
                            <span data-msg-read style={{ fontSize: 12.5, color: "#1B2B4B", fontWeight: 800, whiteSpace: "nowrap" }}>읽음</span>
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

      {/* ── 컨텍스트 메뉴 ── */}
      {ctxMenu && (() => {
        const { msg, x, y } = ctxMenu;
        const isMine = msg.senderUid === myUid;
        const menuW = 180, menuH = 330;
        const safeX = Math.min(x, window.innerWidth - menuW - 8);
        const safeY = y + menuH > window.innerHeight ? y - menuH : y;
        return (
          <div data-ctx-menu="1" style={{
            position: "fixed", left: safeX, top: safeY, zIndex: 999999,
            background: "#fff", borderRadius: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            border: "1px solid #e5e7eb", overflow: "hidden", minWidth: menuW,
          }}>
            {/* 이모티콘 빠른 반응 */}
            <div style={{ display: "flex", gap: 2, padding: "8px 10px", borderBottom: "1px solid #f3f4f6", justifyContent: "space-between" }}>
              {EMOJI_LIST.map(em => (
                <button key={em} onClick={() => { onAddReaction?.(msg.id, em); setCtxMenu(null); }}
                  style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: "2px 3px", borderRadius: 6,
                    background: (msg.reactions?.[em] || []).includes(myUid) ? "#dbeafe" : "transparent" }}>
                  {em}
                </button>
              ))}
            </div>
            {[
              { label: "답장", action: () => { onReply?.(msg); setCtxMenu(null); } },
              // ⭐ 2026-11-06 전달 · 공지로 고정
              ...(room.id ? [{ label: "전달", action: () => { onForward?.(msg); setCtxMenu(null); } }] : []),
              ...(room.id && msg.type !== "system" ? [{ label: room.pinned?.msgId === msg.id ? "공지 고정 해제" : "공지로 고정", action: () => { setCtxMenu(null); if (room.pinned?.msgId === msg.id) onUnpin?.(); else onPin?.(msg); } }] : []),
              { label: "나에게 보내기", action: () => { onSendToSelf?.(copyText(msg)); setCtxMenu(null); setSelfSentToast(true); setTimeout(() => setSelfSentToast(false), 2500); } },
              { label: "복사", action: () => { navigator.clipboard?.writeText(copyText(msg)); setCtxMenu(null); } },
              ...(isMine ? [
                ...((msg.type || "text") === "text" ? [{ label: "수정", action: () => { setEditMsg(msg); setEditText(msg.text); setCtxMenu(null); } }] : []),
                { label: "삭제", action: () => { onDeleteMsg(msg.id); setCtxMenu(null); }, danger: true },
              ] : []),
            ].map(({ label, action, danger }) => (
              <button key={label} onClick={action} style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "10px 16px", background: "none", border: "none",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                color: danger ? "#ef4444" : "#111827",
                borderBottom: "1px solid #f9fafb",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}>
                {label}
              </button>
            ))}
          </div>
        );
      })()}

      {/* + 첨부 메뉴 */}
      {showAttachMenu && (
        <div style={{ padding: "10px 12px", background: "#f8fafc", borderTop: "1px solid #e5e7eb", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* 사진: label+input — display:none은 iOS Safari에서 파일다이얼로그 안 열림, opacity:0 사용 */}
          <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 14px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, cursor: "pointer", color: "#1B2B4B", minWidth: 60, position: "relative", overflow: "hidden" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span style={{ fontSize: 11, fontWeight: 600 }}>사진</span>
            <input ref={photoInputRef} type="file" accept="image/*"
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) { onSendImage(f); setShowAttachMenu(false); } e.target.value = ""; }} />
          </label>
          {/* 파일: 동일 방식 */}
          <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 14px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, cursor: "pointer", color: "#1B2B4B", minWidth: 60, position: "relative", overflow: "hidden" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span style={{ fontSize: 11, fontWeight: 600 }}>파일</span>
            <input ref={fileInputRef} type="file"
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) { onSendFile(f); setShowAttachMenu(false); } e.target.value = ""; }} />
          </label>
          {[
            { label: "위치", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>, action: () => { onSendLocation(); setShowAttachMenu(false); } },
            { label: "연락처", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>, action: () => { onSendContact(); setShowAttachMenu(false); } },
            { label: "공지", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>, action: () => { onSendNotice(); setShowAttachMenu(false); } },
            // ⭐ 2026-11-06 오더 공유 카드
            { label: "오더", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="6" width="14" height="11" rx="1.5" /><path d="M15 9h4l3 3.5V17h-7" /><circle cx="6" cy="18.5" r="1.8" /><circle cx="18" cy="18.5" r="1.8" /></svg>, action: () => { onShareOrder?.(); setShowAttachMenu(false); } },
          ].map(item => (
            <button key={item.label} onClick={item.action}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 14px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, cursor: "pointer", color: "#1B2B4B", minWidth: 60 }}>
              {item.icon}
              <span style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 답장 미리보기 */}
      {replyTo && (
        <div style={{ padding: "6px 12px 4px", background: "#f8fafc", borderTop: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ width: 3, alignSelf: "stretch", background: themeMyBubble, borderRadius: 2, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: themeMyBubble }}>{replyTo.senderName}에게 답장</div>
            <div style={{ fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{replyTo.text || "[미디어]"}</div>
          </div>
          <button onMouseDown={e => e.preventDefault()} onTouchStart={e => e.preventDefault()} onTouchEnd={e => { e.stopPropagation(); setReplyTo(null); }} onClick={() => setReplyTo(null)}
            style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 16, cursor: "pointer", padding: "0 4px" }}>✕</button>
        </div>
      )}

      {/* ⭐ 2026-11-06 @멘션 — 멤버 고르기 */}
      {mention && mentionHits.length > 0 && (
        <div data-msg-mention-list data-kp-popup="1" style={{ margin: "0 12px", background: "#fff", border: "1px solid #DCE3EE", borderRadius: 14, boxShadow: "0 -6px 20px rgba(15,26,48,0.12)", overflow: "hidden", flexShrink: 0 }}>
          <div style={{ padding: "6px 12px", fontSize: 12, fontWeight: 800, color: "#7A879C", background: "#FAFBFD" }}>멘션할 사람 (↑↓ · Enter)</div>
          {mentionHits.map((p, i) => (
            <button key={p.uid} type="button" onMouseDown={(e) => { e.preventDefault(); pickMention(p); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "7px 12px", border: "none", background: i === mention.idx ? "#EEF3FB" : "#fff", cursor: "pointer", fontSize: 13.5, fontWeight: 700, color: "#0F1A30" }}>
              <span style={{ width: 24, height: 24, borderRadius: 8, background: p.uid === "all" ? "#4B6CB7" : NAVY, color: "#fff", fontSize: 12, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{p.uid === "all" ? "@" : p.name.slice(0, 1)}</span>
              {p.uid === "all" ? "전체 (모두에게 알림)" : p.name}
            </button>
          ))}
        </div>
      )}

      {/* ⭐ 2026-11-06 자주 쓰는 문구 */}
      {showQuick && (
        <div data-msg-quick data-kp-popup="1" style={{ margin: "0 12px", background: "#fff", border: "1px solid #DCE3EE", borderRadius: 14, boxShadow: "0 -6px 20px rgba(15,26,48,0.12)", overflow: "hidden", flexShrink: 0, maxHeight: 280, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: "#FAFBFD", borderBottom: "1px solid #EEF1F6" }}>
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 900, color: "#0F1A30" }}>자주 쓰는 문구</span>
            <button type="button" onClick={() => setQuickEdit(v => !v)} style={{ height: 26, padding: "0 10px", borderRadius: 8, border: "1px solid #DCE3EE", background: quickEdit ? NAVY : "#fff", color: quickEdit ? "#fff" : "#3A4A66", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{quickEdit ? "완료" : "편집"}</button>
            <button type="button" onClick={() => { setShowQuick(false); setQuickEdit(false); }} style={{ marginLeft: 6, background: "none", border: "none", color: "#9ca3af", fontSize: 15, cursor: "pointer" }}>✕</button>
          </div>
          <div style={{ overflowY: "auto" }}>
            {quickReplies.map((t, i) => (
              <div key={`${i}-${t}`} style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #F1F4F9" }}>
                <button type="button" data-msg-quick-item onMouseDown={(e) => e.preventDefault()} onClick={() => !quickEdit && insertQuick(t)} style={{ flex: 1, textAlign: "left", padding: "9px 12px", border: "none", background: "transparent", cursor: quickEdit ? "default" : "pointer", fontSize: 13.5, color: "#0F1A30", fontWeight: 600 }}>{t}</button>
                {quickEdit && <button type="button" onClick={() => onSaveQuickReplies?.(quickReplies.filter((_, k) => k !== i))} style={{ marginRight: 8, width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F4F9", color: "#5B6B85", cursor: "pointer" }}>✕</button>}
              </div>
            ))}
          </div>
          {quickEdit && (
            <form onSubmit={(e) => { e.preventDefault(); if (quickDraft.trim()) { onSaveQuickReplies?.([...quickReplies, quickDraft.trim()]); setQuickDraft(""); } }} style={{ display: "flex", gap: 6, padding: 8, borderTop: "1px solid #EEF1F6" }}>
              <input value={quickDraft} onChange={(e) => setQuickDraft(e.target.value)} placeholder="새 문구 입력 후 추가" style={{ flex: 1, height: 32, border: "1px solid #DCE3EE", borderRadius: 8, padding: "0 10px", fontSize: 13, outline: "none" }} />
              <button type="submit" style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "none", background: NAVY, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>추가</button>
            </form>
          )}
        </div>
      )}

      {sendingImgs.length > 0 && (
        <div data-msg-sending style={{ padding: "6px 12px", background: "#fff", borderTop: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, overflowX: "auto" }}>
          {sendingImgs.map((x) => <div key={x.id} style={{ position: "relative", width: 44, height: 44, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "#f1f5f9" }}><img src={x.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.55 }} /><div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><div className="animate-spin" style={{ width: 18, height: 18, borderRadius: "50%", border: "2.5px solid #fff", borderTopColor: "#1B2B4B" }} /></div></div>)}
          <span style={{ fontSize: 12, fontWeight: 700, color: "#5B6B85", whiteSpace: "nowrap" }}>사진 보내는 중… {sendingImgs.length}장</span>
        </div>
      )}
      {/* 입력창 — form으로 감싸 iOS가 외부 date input으로 네비게이션 못 하게 차단 */}
      <div style={{ padding: "8px 12px 12px", background: "#fff", borderTop: showAttachMenu ? "none" : "1px solid #e5e7eb", flexShrink: 0 }}>
        <form onSubmit={e => e.preventDefault()} style={{ display: "flex", alignItems: "flex-end", gap: 6, background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 20, padding: "6px 6px 6px 4px" }}>
          {/* + 버튼 - onTouchStart preventDefault로 iOS 키보드 유지 */}
          <button type="button"
            onMouseDown={e => e.preventDefault()}
            onTouchStart={e => e.preventDefault()}
            onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); setShowAttachMenu(p => !p); }}
            onClick={e => { if (e.detail === 0) return; setShowAttachMenu(p => !p); }}
            style={{ width: 32, height: 32, borderRadius: "50%", background: showAttachMenu ? "#1B2B4B" : "none", border: "none", color: showAttachMenu ? "#fff" : "#6b7280", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s", marginLeft: 2 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          {/* ⭐ 2026-11-06 자주 쓰는 문구 버튼 */}
          <button type="button" title="자주 쓰는 문구" data-msg-quick-btn
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setShowQuick(v => !v); setQuickEdit(false); }}
            style={{ height: 32, padding: "0 9px", borderRadius: 16, background: showQuick ? NAVY : "#fff", border: "1px solid #DCE3EE", color: showQuick ? "#fff" : NAVY, cursor: "pointer", fontSize: 12.5, fontWeight: 800, flexShrink: 0, whiteSpace: "nowrap" }}>
            문구
          </button>
          {(fileUploading) && <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>업로드 중...</span>}
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => { setInput(e.target.value); trackMention(e.target); }}
            onKeyDown={e => {
              // ⭐ 2026-11-06 @멘션 고르는 중이면 ↑↓·Enter·Tab·Esc는 목록에 쓴다
              if (mention && mentionHits.length && !e.nativeEvent.isComposing) {
                if (e.key === "ArrowDown") { e.preventDefault(); setMention(m => ({ ...m, idx: Math.min(mentionHits.length - 1, (m?.idx || 0) + 1) })); return; }
                if (e.key === "ArrowUp") { e.preventDefault(); setMention(m => ({ ...m, idx: Math.max(0, (m?.idx || 0) - 1) })); return; }
                if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickMention(mentionHits[mention.idx] || mentionHits[0]); return; }
                if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setMention(null); return; }
              }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); setMention(null); setShowQuick(false); onSend(); }
            }}
            onClick={e => trackMention(e.target)}
            placeholder={mentionPeople.length ? "메시지 입력 (@이름으로 멘션)" : "메시지 입력..."}
            rows={1}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
            style={{ flex: 1, background: "none", border: "none", outline: "none", resize: "none", fontSize: 13.5, color: "#111827", maxHeight: 90, overflowY: "auto", lineHeight: 1.5 }}
          />
          <button type="button"
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
        </form>
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

      {orderView && <OrderDetailModal order={orderView} mobileMode={mobileMode} onClose={() => setOrderView(null)} />}

      {/* 나에게 보내기 완료 토스트 */}
      {selfSentToast && (
        <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 9999999,
          background: "#1B2B4B", color: "#fff", borderRadius: 10, padding: "10px 22px",
          fontSize: 13, fontWeight: 700, boxShadow: "0 4px 16px rgba(0,0,0,0.25)", whiteSpace: "nowrap",
          pointerEvents: "none" }}>
          나에게 보냈습니다
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
              <input value={editPhone} onChange={e => setEditPhone(formatPhone(e.target.value))}
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
              ["전화번호", myProfile?.phone ? formatPhone(myProfile.phone) : "-"],
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
