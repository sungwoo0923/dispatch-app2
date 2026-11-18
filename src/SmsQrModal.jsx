// ======================= src/SmsQrModal.jsx =======================
// 📱 2026-11-18 QR로 내 폰에서 문자 보내기 — '휴대폰과 연결'을 못 쓰는 PC용(설치 없음 · 무료)
//  PC에 QR이 뜬다 → 업무폰 카메라로 찍는다 → 기사 번호 · 내용이 채워진 문자 앱이 열린다 → 보내기만 누르면 끝
//  · 받는 사람 1명: QR 안에 문자 내용을 바로 담는다(SMSTO — 인터넷 없이 카메라만으로 열림)
//  · 여러 명이거나 '링크 QR'을 고른 PC: smsRelay/{코드}에 잠깐 올려두고 /t/{코드} 주소를 QR로(폰 브라우저에서 [문자 앱 열기])
import React from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

const LINK_KEY = "kpSmsQrLink"; // "1"이면 이 PC는 늘 링크 QR(문자 QR 글자가 깨지는 휴대폰용)
const lsGet = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const lsSet = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* 무시 */ } };
const fmt = (n) => String(n).replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
const newCode = () => {
  const a = new Uint8Array(12);
  (window.crypto || window.msCrypto).getRandomValues(a);
  return Array.from(a, (b) => "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 56]).join("");
};

async function makeLink(list, body) {
  const code = newCode();
  await setDoc(doc(db, "smsRelay", code), { to: list.map((x) => x.phone).slice(0, 50), body: String(body || "").slice(0, 2000), by: auth.currentUser?.uid || "", createdAt: serverTimestamp() });
  return `${window.location.origin}/t/${code}`;
}

function QrDialog({ list, body, onDone, onUsePhone }) {
  const [useLink, setUseLink] = React.useState(list.length > 1 || lsGet(LINK_KEY) === "1");
  const [img, setImg] = React.useState("");
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    let alive = true;
    setImg(""); setErr("");
    (async () => {
      try {
        const text = useLink ? await makeLink(list, body) : `SMSTO:${list[0].phone}:${body || ""}`;
        const url = await QRCode.toDataURL(text, { errorCorrectionLevel: "L", margin: 2, width: 560, color: { dark: "#0B1428", light: "#FFFFFF" } });
        if (alive) setImg(url);
      } catch (e) {
        if (alive) setErr(useLink ? "링크를 만들지 못했어요. 인터넷 연결을 확인해 주세요." : "내용이 너무 길어 QR에 다 담지 못했어요. 아래 '링크 QR로 보기'를 눌러 주세요.");
      }
    })();
    return () => { alive = false; };
  }, [useLink, list, body]);
  React.useEffect(() => {
    const k = (e) => { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onDone(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onDone]);
  const copy = async () => { try { await navigator.clipboard.writeText(body || ""); setErr("내용을 복사했어요"); } catch { setErr("복사하지 못했어요"); } };
  const link = { background: "none", border: "none", padding: 0, color: "#2D4C82", fontSize: 13, fontWeight: 800, cursor: "pointer", textDecoration: "underline" };
  return (
    <div data-kp-dialog="1" data-testid="sms-qr" style={{ position: "fixed", inset: 0, zIndex: 2147483646, background: "rgba(11,20,40,.55)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Noto Sans KR',sans-serif" }}>
      <div role="dialog" aria-modal="true" aria-label="내 폰으로 문자 보내기" style={{ width: "min(460px,100%)", maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", borderRadius: 22, overflow: "hidden", background: "#fff", boxShadow: "0 30px 80px rgba(11,20,40,.45)" }}>
        <div style={{ padding: "18px 22px 14px", color: "#fff", background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)", flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.26em", color: "#8FB0F0" }}>SMS · QR</div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>휴대폰 카메라로 찍어 주세요</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.7)", marginTop: 2 }}>{useLink ? "뜨는 주소를 누르고 → [문자 앱 열기]를 누르면 돼요" : "뜨는 알림을 누르면 → 문자 앱이 내용까지 채워서 열려요"}</div>
        </div>
        <div style={{ padding: "16px 22px 4px", overflowY: "auto" }}>
          <div style={{ width: 280, height: 280, margin: "0 auto", borderRadius: 16, border: "1px solid #E3E8F0", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
            {img ? <img src={img} alt="문자 보내기 QR" style={{ width: 272, height: 272, imageRendering: "pixelated" }} /> : <span style={{ fontSize: 13, color: "#7A879C", fontWeight: 700, padding: 16, textAlign: "center" }}>{err || "QR 만드는 중…"}</span>}
          </div>
          <div style={{ marginTop: 14, fontSize: 13, color: "#5B6B85", fontWeight: 700 }}>받는 사람 {list.length}명</div>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#0F1A30", wordBreak: "keep-all" }}>{list.map((x) => `${x.name ? `${x.name} ` : ""}${fmt(x.phone)}`).join(", ")}</div>
          <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 12, background: "#F5F8FD", border: "1px solid #E3E8F0", fontSize: 13.5, color: "#2A3852", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 140, overflowY: "auto" }}>{body || "(내용 없음)"}</div>
          {img && err && <div style={{ marginTop: 6, fontSize: 12.5, color: "#5B6B85", fontWeight: 700 }}>{err}</div>}
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 14 }}>
            {list.length === 1 && <button type="button" style={link} data-testid="sms-qr-toggle" onClick={() => { const v = !useLink; lsSet(LINK_KEY, v ? "1" : ""); setUseLink(v); }}>{useLink ? "문자 QR로 보기" : "글자가 깨지면 → 링크 QR로 보기"}</button>}
            <button type="button" style={link} onClick={copy}>내용 복사</button>
            <button type="button" style={link} data-testid="sms-qr-use-phone" onClick={onUsePhone}>이 PC는 휴대폰과 연결로 보내기</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, padding: "16px 22px 20px", flexShrink: 0 }}>
          <button type="button" onClick={onDone} style={{ flex: 1, height: 46, borderRadius: 13, border: "none", background: "#1B2B4B", color: "#fff", fontSize: 14.5, fontWeight: 900, cursor: "pointer" }}>다 보냈어요</button>
        </div>
      </div>
    </div>
  );
}

/** QR 창 띄우기 — 닫히면 "done" · '휴대폰과 연결로' 누르면 "phone" */
export function openSmsQr(list, body) {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const end = (v) => { resolve(v); setTimeout(() => { root.unmount(); host.remove(); }, 0); };
    root.render(<QrDialog list={list} body={body} onDone={() => end("done")} onUsePhone={() => end("phone")} />);
  });
}
