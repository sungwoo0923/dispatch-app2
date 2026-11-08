// ======================= src/driver/DriverPopups.jsx =======================
// ⭐ 2026-11-05 기사앱 — 연세 있는 기사님도 놓치지 않게 "화면 가운데 큰 팝업"들을 모았다.
//  · CheckinPrompt     : 출근 시간대인데 출근을 안 눌렀으면 "출근하시겠어요?" + 아주 큰 [출근하기] 버튼
//  · NewOrderPopup     : 새 오더가 오면 오더 내용 + 큰 [승인] [거절] (거절은 사유 고르기/쓰기 — 선택)
//  · DeletedOrdersPopup: 담당자가 내 오더를 삭제했으면 그 오더 요약 + [확인] 하나
//  · PushSetupCard     : 알림(푸시)이 꺼져 있거나 아이폰에서 홈 화면 앱이 아니면 켜는 방법 안내
//  · RedBadge          : 카카오톡처럼 빨간 숫자 배지(#FF3B30 + 흰 숫자)
//  · useEmergencyContact: 긴급상황 때 전화할 곳 — 이 차량 담당자(기사관리 담당자) → 없으면 회사 대표 연락처
//  글자: 본문 16px 이상, 기본 고딕(sans) — 숫자 전용·고정폭 글꼴은 쓰지 않는다. 색: 남색(#0F1A30/#1B2B4B/#2D4C82, 포인트 #8FB0F0)
import React, { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

export const KP_RED = "#FF3B30";
const NAVY0 = "#0F1A30";
const NAVY1 = "#1B2B4B";
const NAVY2 = "#2D4C82";
const ACC = "#8FB0F0";
const FONT = '"Noto Sans KR", "Pretendard", sans-serif';

// ─────────────────────────────── 공통 ───────────────────────────────
export function RedBadge({ n, style }) {
  if (!n || n <= 0) return null;
  return (
    <span style={{ minWidth: 22, height: 22, padding: "0 6px", borderRadius: 11, background: KP_RED, color: "#fff", fontSize: 13, fontWeight: 900,
      display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1, boxShadow: "0 0 0 2px #fff", fontFamily: FONT, ...style }}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

function Overlay({ children, z = 10050 }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: z, background: "rgba(8,14,28,0.62)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", fontFamily: FONT }}>
      <div className="kpd-sheet" style={{ width: "100%", maxWidth: 440, maxHeight: "calc(100vh - 32px)", overflowY: "auto", borderRadius: 28, background: "#fff", boxShadow: "0 30px 70px rgba(8,14,28,0.55), 0 0 0 1px rgba(160,190,255,.18)" }}>
        {children}
      </div>
    </div>
  );
}

function Head({ en, title, sub }) {
  return (
    <div style={{ padding: "22px 22px 20px", color: "#fff", borderRadius: "28px 28px 0 0", position: "relative", overflow: "hidden",
      background: "radial-gradient(420px 180px at 90% -30px, rgba(111,160,255,0.42), transparent 70%), linear-gradient(160deg, #070D1C 0%, #0F1D3A 52%, #1F3A6E 100%)" }}>
      <span style={{ position: "absolute", inset: 0, opacity: 0.08, pointerEvents: "none", backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "18px 18px" }} />
      <div style={{ position: "relative" }}>
        {en && <div style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: "0.18em", color: ACC }}>{en}</div>}
        <div style={{ fontSize: 24, fontWeight: 900, marginTop: en ? 4 : 0, letterSpacing: "-0.5px" }}>{title}</div>
        {sub && <div style={{ fontSize: 17, color: "rgba(255,255,255,0.78)", marginTop: 4, lineHeight: 1.45 }}>{sub}</div>}
      </div>
    </div>
  );
}

const bigBtn = (primary) => ({
  width: "100%", minHeight: 64, borderRadius: 18, fontSize: 23, fontWeight: 900, cursor: "pointer", fontFamily: FONT, letterSpacing: "-0.3px",
  border: primary ? "none" : `2px solid ${NAVY1}`,
  background: primary ? "radial-gradient(260px 90px at 85% 0%, rgba(111,160,255,.45), transparent 70%), linear-gradient(135deg,#070D1C,#0F1D3A 50%,#2D4C82)" : "#fff",
  color: primary ? "#fff" : NAVY0,
  boxShadow: primary ? "0 12px 26px rgba(27,43,75,0.35)" : "none",
});

// ─────────────────────────────── 출근 ───────────────────────────────
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
export function kstNowInfo(now = Date.now()) {
  const k = new Date(now + 9 * 3600e3);
  return { ymd: k.toISOString().slice(0, 10), min: k.getUTCHours() * 60 + k.getUTCMinutes(), dow: k.getUTCDay(), hm: k.toISOString().slice(11, 16) };
}
export function parseHM(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}
// 출근 안내를 띄울 때인가 — 서버 출근 알림(functions remindDriverCheckin)과 같은 기준 + 시간대
//  · 출근시간이 있으면: 출근 1시간 전 ~ 5시간 뒤 · 없으면: 오전 5시 ~ 12시
export function shouldPromptCheckin(driver, info = kstNowInfo()) {
  if (!driver) return false;
  const st = String(driver.status || "").trim();
  if (st && st !== "퇴근" && st !== "대기") return false; // 출근·운행중·휴차
  if (driver.isFinalCheckout && driver.workDate === info.ymd) return false; // 오늘 일 끝
  if (Array.isArray(driver.근무요일) && driver.근무요일.length && !driver.근무요일.includes(DOW[info.dow])) return false;
  const start = parseHM(driver.출근시간);
  if (start != null) return info.min >= start - 60 && info.min <= start + 300;
  return info.min >= 300 && info.min <= 720;
}

export function CheckinPrompt({ driver, nearCheckIn, loading, onCheckin, onLater, onSetTime }) {
  const info = kstNowInfo();
  const start = driver?.출근시간 && parseHM(driver.출근시간) != null ? driver.출근시간 : "";
  return (
    <Overlay>
      <Head en="GOOD MORNING" title={nearCheckIn ? "출근지에 도착하셨어요" : "출근하시겠어요?"}
        sub={nearCheckIn ? "아래 버튼을 누르면 바로 출근 처리됩니다." : "출근 버튼을 아직 안 누르셨어요."} />
      <div style={{ padding: "20px 20px 22px" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          <div style={{ flex: 1, borderRadius: 16, background: "#F5F8FD", border: "1px solid #DCE3EF", padding: "12px 14px" }}>
            <div style={{ fontSize: 17, color: "#5B6B85", fontWeight: 700 }}>지금</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: NAVY0, marginTop: 2 }}>{info.hm}</div>
          </div>
          <div style={{ flex: 1, borderRadius: 16, background: "#F5F8FD", border: "1px solid #DCE3EF", padding: "12px 14px" }}>
            <div style={{ fontSize: 17, color: "#5B6B85", fontWeight: 700 }}>출근 시간</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: start ? NAVY0 : "#9AA9C3", marginTop: 2 }}>{start || "미정"}</div>
          </div>
        </div>
        <button type="button" disabled={loading} onClick={onCheckin} style={{ ...bigBtn(true), minHeight: 84, fontSize: 28, opacity: loading ? 0.6 : 1 }}>
          {loading ? "처리중…" : "출근하기"}
        </button>
        <button type="button" onClick={onLater} style={{ width: "100%", marginTop: 12, minHeight: 52, borderRadius: 16, border: "1.5px solid #DCE3EF", background: "#fff", color: "#3A4A66", fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>
          나중에 (30분 뒤 다시 알려드려요)
        </button>
        {!start && (
          <button type="button" onClick={onSetTime} style={{ width: "100%", marginTop: 10, border: "none", background: "transparent", color: NAVY2, fontSize: 17, fontWeight: 800, textDecoration: "underline", cursor: "pointer", fontFamily: FONT }}>
            매일 출근 시간에 알림 받기 (시간 정하기)
          </button>
        )}
      </div>
    </Overlay>
  );
}

// 설정 탭 — 출근 시간 + 알림 켜기/끄기(drivers/{uid}.출근시간 · 출근알림)
const TIME_OPTS = (() => { const a = []; for (let m = 4 * 60; m <= 14 * 60; m += 10) a.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`); return a; })();
export function WorkStartSetting({ driver, onSave }) {
  const cur = driver?.출근시간 && parseHM(driver.출근시간) != null ? driver.출근시간 : "";
  const on = driver?.출근알림 !== false;
  return (
    <div style={{ background: "#fff", borderRadius: 20, padding: "16px", marginBottom: 14, border: "1px solid #E6EBF3", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", fontFamily: FONT }}>
      <div style={{ fontSize: 19, fontWeight: 900, color: NAVY0 }}>출근 알림</div>
      <div style={{ fontSize: 17, color: "#5B6B85", marginTop: 4, lineHeight: 1.5 }}>출근 10분 전과 출근 시간에 휴대폰 알림으로 알려드려요. (출근을 누르면 오지 않아요)</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
        <select aria-label="출근 시간" value={cur} onChange={(e) => onSave({ 출근시간: e.target.value, ...(e.target.value ? { 출근알림: true } : {}) })}
          style={{ flex: 1, minWidth: 0, height: 52, borderRadius: 14, border: `1.5px solid ${NAVY1}`, padding: "0 12px", fontSize: 21, fontWeight: 900, color: NAVY0, background: "#fff", fontFamily: FONT }}>
          <option value="">출근 시간 선택</option>
          {TIME_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
          {cur && !TIME_OPTS.includes(cur) && <option value={cur}>{cur}</option>}
        </select>
        <button type="button" disabled={!cur} onClick={() => onSave({ 출근알림: !on })}
          style={{ height: 52, padding: "0 16px", borderRadius: 14, border: "none", fontSize: 18, fontWeight: 900, cursor: cur ? "pointer" : "default", fontFamily: FONT,
            background: cur && on ? NAVY1 : "#EEF2F8", color: cur && on ? "#fff" : "#9AA9C3" }}>
          {cur && on ? "알림 켜짐" : "알림 꺼짐"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────── 새 오더 ───────────────────────────────
const won = (v) => { const n = Number(String(v ?? "").replace(/[^\d]/g, "")); return n > 0 ? `${n.toLocaleString()}원` : ""; };
const when = (d, t) => [String(d || "").slice(5).replace("-", "/"), t || (d ? "즉시" : "")].filter(Boolean).join(" ");
function Row({ k, v, strong }) {
  if (!v) return null;
  return (
    <div style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid #EEF2F8", alignItems: "baseline" }}>
      <span style={{ width: 64, flexShrink: 0, fontSize: 17, fontWeight: 800, color: "#5B6B85" }}>{k}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: strong ? 21 : 18, fontWeight: strong ? 900 : 700, color: NAVY0, wordBreak: "break-word", lineHeight: 1.4 }}>{v}</span>
    </div>
  );
}
function Place({ tag, name, addr, at }) {
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid #EEF2F8" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 17, fontWeight: 900, color: "#fff", background: tag === "상차" ? NAVY1 : NAVY2, borderRadius: 8, padding: "3px 10px", flexShrink: 0 }}>{tag}</span>
        <span style={{ fontSize: 21, fontWeight: 900, color: NAVY0, minWidth: 0, wordBreak: "break-word" }}>{name || "-"}</span>
      </div>
      {addr && <div style={{ fontSize: 17, color: "#3A4A66", marginTop: 4, lineHeight: 1.45, wordBreak: "break-word" }}>{addr}</div>}
      {at && <div style={{ fontSize: 18, fontWeight: 800, color: NAVY2, marginTop: 4 }}>{at}</div>}
    </div>
  );
}
export const REJECT_REASONS = ["차량 정비 중이에요", "거리가 너무 멀어요", "시간이 안 맞아요", "다른 운행 중이에요"];

export function NewOrderPopup({ order: o, count = 1, loading, onAccept, onReject, onLater }) {
  const [step, setStep] = useState("view"); // view | reject
  const [reason, setReason] = useState("");
  useEffect(() => { setStep("view"); setReason(""); }, [o?._id]);
  if (!o) return null;
  const tonType = [o.차량톤수, o.차량종류].filter(Boolean).join(" ");
  const pay = [won(o.기사운임), o.지급방식].filter(Boolean).join(" · ");
  return (
    <Overlay z={10060}>
      <Head en="NEW ORDER" title="새 오더가 도착했어요" sub={[o.거래처명, count > 1 ? `수락 대기 ${count}건` : ""].filter(Boolean).join(" · ")} />
      {step === "view" ? (
        <div style={{ padding: "8px 20px 20px" }}>
          <Place tag="상차" name={o.상차지명} addr={o.상차지주소} at={when(o.상차일, o.상차시간)} />
          <Place tag="하차" name={o.하차지명} addr={o.하차지주소} at={when(o.하차일, o.하차시간)} />
          <Row k="화물" v={o.화물내용} />
          <Row k="톤수" v={tonType} />
          <Row k="운임" v={pay} strong />
          <Row k="메모" v={o.전달사항 || o.메모} />
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button type="button" disabled={loading} onClick={() => setStep("reject")} style={{ ...bigBtn(false), flex: 1, opacity: loading ? 0.6 : 1 }}>거절</button>
            <button type="button" disabled={loading} onClick={onAccept} style={{ ...bigBtn(true), flex: 1.4, opacity: loading ? 0.6 : 1 }}>{loading ? "처리중…" : "승인"}</button>
          </div>
          <button type="button" onClick={onLater} style={{ width: "100%", marginTop: 12, border: "none", background: "transparent", color: "#5B6B85", fontSize: 17, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
            나중에 보기 (홈 화면 오더 카드에서 다시 볼 수 있어요)
          </button>
        </div>
      ) : (
        <div style={{ padding: "18px 20px 20px" }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: NAVY0 }}>거절하는 이유 (선택)</div>
          <div style={{ fontSize: 17, color: "#5B6B85", marginTop: 4 }}>고르거나 적어 주시면 담당자에게 전달됩니다. 비워도 됩니다.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
            {REJECT_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} style={{ minHeight: 52, borderRadius: 14, fontSize: 17, fontWeight: 800, cursor: "pointer", fontFamily: FONT,
                border: `1.5px solid ${reason === r ? NAVY1 : "#DCE3EF"}`, background: reason === r ? NAVY1 : "#fff", color: reason === r ? "#fff" : NAVY0 }}>{r}</button>
            ))}
          </div>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="직접 적기"
            style={{ width: "100%", marginTop: 10, boxSizing: "border-box", border: "1.5px solid #DCE3EF", borderRadius: 14, padding: "12px", fontSize: 18, fontFamily: FONT, resize: "none", outline: "none" }} />
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button type="button" disabled={loading} onClick={() => setStep("view")} style={{ ...bigBtn(false), flex: 1, fontSize: 20 }}>돌아가기</button>
            <button type="button" disabled={loading} onClick={() => onReject(reason.trim())} style={{ ...bigBtn(true), flex: 1.4, fontSize: 20, opacity: loading ? 0.6 : 1 }}>{loading ? "처리중…" : "거절하기"}</button>
          </div>
        </div>
      )}
    </Overlay>
  );
}

// ─────────────────────────────── 삭제된 오더 ───────────────────────────────
export function DeletedOrdersPopup({ notices, onConfirm, busy }) {
  if (!notices?.length) return null;
  return (
    <Overlay z={10070}>
      <Head en="ORDER CANCELED" title="오더가 취소되었어요" sub={notices.length > 1 ? `담당자가 오더 ${notices.length}건을 삭제했습니다.` : "담당자가 이 오더를 삭제했습니다. 운행하지 않으셔도 됩니다."} />
      <div style={{ padding: "8px 20px 20px" }}>
        {notices.map((n) => {
          const o = n.order || {};
          return (
            <div key={n.id} style={{ borderRadius: 20, border: "1.5px solid #DCE3EF", background: "#F5F8FD", padding: "12px 14px", marginTop: 12 }}>
              {o.거래처명 && <div style={{ fontSize: 17, fontWeight: 800, color: "#5B6B85" }}>{o.거래처명}</div>}
              <div style={{ fontSize: 20, fontWeight: 900, color: NAVY0, marginTop: 2, lineHeight: 1.4, wordBreak: "break-word" }}>
                {o.상차지명 || "-"} → {o.하차지명 || "-"}
              </div>
              <div style={{ fontSize: 17, color: "#3A4A66", marginTop: 4 }}>
                {[o.상차일 || o.상차시간 ? `상차 ${when(o.상차일, o.상차시간)}` : "", [o.차량톤수, o.화물내용].filter(Boolean).join(" · ")].filter(Boolean).join("  ·  ") || n.body || ""}
              </div>
            </div>
          );
        })}
        <button type="button" disabled={busy} onClick={onConfirm} style={{ ...bigBtn(true), marginTop: 18, minHeight: 68, opacity: busy ? 0.6 : 1 }}>확인</button>
      </div>
    </Overlay>
  );
}

// ─────────────────────────────── 알림(푸시) 켜기 안내 ───────────────────────────────
// kind: "ios-browser"(아이폰 Safari 탭 — 홈 화면 앱이 아님) | "ios-old"(iOS 16.4 미만) | "default"(아직 안 물어봄) | "denied"(거부)
export function PushSetupCard({ kind, onEnable, onClose }) {
  if (!kind) return null;
  const T = {
    "ios-browser": ["알림을 받으려면 홈 화면에 추가해 주세요", ["Safari 아래 [공유] 버튼(네모에 화살표)을 누르고", "[홈 화면에 추가]를 누른 뒤", "홈 화면에 생긴 [LogisWeb 기사] 아이콘으로 다시 들어오세요"]],
    "ios-old": ["아이폰을 업데이트하면 알림을 받을 수 있어요", ["설정 › 일반 › 소프트웨어 업데이트에서 iOS 16.4 이상으로 올려 주세요"]],
    default: ["새 오더 알림을 켜 주세요", ["앱을 꺼 두어도 새 오더·출근 시간을 휴대폰 알림으로 알려드려요"]],
    denied: ["알림이 꺼져 있어요", ["휴대폰 설정 › 알림에서 이 앱(또는 브라우저)의 알림을 [허용]으로 바꿔 주세요"]],
  }[kind];
  if (!T) return null;
  return (
    <div style={{ borderRadius: 18, border: `2px solid ${NAVY1}`, background: "#fff", padding: "14px 16px", marginBottom: 14, fontFamily: FONT, boxShadow: "0 6px 18px rgba(27,43,75,0.12)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ width: 40, height: 40, borderRadius: 14, background: NAVY1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="22" height="22" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 900, color: NAVY0 }}>{T[0]}</div>
          {T[1].map((l, i) => <div key={i} style={{ fontSize: 17, color: "#3A4A66", marginTop: 4, lineHeight: 1.45 }}>{T[1].length > 1 ? `${i + 1}. ` : ""}{l}</div>)}
        </div>
        {onClose && <button type="button" aria-label="닫기" onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 21, color: "#9AA9C3", cursor: "pointer", padding: 4 }}>✕</button>}
      </div>
      {kind === "default" && (
        <button type="button" onClick={onEnable} style={{ ...bigBtn(true), marginTop: 12, minHeight: 56, fontSize: 21 }}>알림 켜기</button>
      )}
    </div>
  );
}

// ─────────────────────────────── 긴급 연락처 ───────────────────────────────
// 기사관리에서 이 차량에 정한 담당자(drivers.담당자 {uid, name}) → users/{uid}.전화번호 · 없으면 회사 대표 연락처(회사정보)
export function useEmergencyContact(driver, companyContact) {
  const mgrUid = driver?.담당자 && typeof driver.담당자 === "object" ? driver.담당자.uid || "" : "";
  const mgrName = driver?.담당자 && typeof driver.담당자 === "object" ? driver.담당자.name || "" : "";
  const [mgr, setMgr] = useState(null); // { name, phone }
  useEffect(() => {
    let off = false;
    if (!mgrUid) { setMgr(null); return undefined; }
    getDoc(doc(db, "users", mgrUid)).then((s) => {
      if (off) return;
      const u = s.exists() ? s.data() : {};
      const phone = String(u.전화번호 || u.phone || u.휴대폰 || "").trim();
      setMgr(phone ? { name: String(u.name || u.이름 || mgrName || "담당자").trim(), phone } : null);
    }).catch(() => { if (!off) setMgr(null); });
    return () => { off = true; };
  }, [mgrUid, mgrName]);
  if (mgr) return { kind: "manager", label: "차량 담당자", name: mgr.name, phone: mgr.phone };
  if (companyContact?.phone) return { kind: "company", label: "회사 대표전화", name: companyContact.name || "회사", phone: companyContact.phone };
  return null;
}
