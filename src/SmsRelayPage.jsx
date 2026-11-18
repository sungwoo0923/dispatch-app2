// ======================= src/SmsRelayPage.jsx =======================
// 📱 2026-11-18 /t/{코드} — PC 'QR로 내 폰에서 보내기'의 링크 QR을 휴대폰으로 찍으면 열리는 화면(로그인 없음)
//  기사 번호 · 내용을 보여주고 [문자 앱 열기]를 누르면 휴대폰 문자 앱이 받는 사람 · 내용까지 채워서 열린다
//  링크는 만든 지 하루가 지나면 열리지 않는다(기사 번호가 오래 남아 돌지 않게)
import React from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

const DAY = 24 * 3600e3;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const fmt = (n) => String(n).replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
export const smsHref = (to, body) => `sms:${to.join(",")}${isIOS() ? "&" : "?"}body=${encodeURIComponent(body || "")}`;

export default function SmsRelayPage({ code }) {
  const [d, setD] = React.useState(null);
  const [st, setSt] = React.useState("loading");
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => {
    let alive = true;
    getDoc(doc(db, "smsRelay", code)).then((s) => {
      if (!alive) return;
      if (!s.exists()) { setSt("notfound"); return; }
      const v = s.data() || {};
      const at = v.createdAt?.toMillis ? v.createdAt.toMillis() : 0;
      if (at && Date.now() - at > DAY) { setSt("expired"); return; }
      setD({ to: (v.to || []).map(String), body: String(v.body || "") }); setSt("ok");
    }).catch(() => { if (alive) setSt("error"); });
    return () => { alive = false; };
  }, [code]);
  const wrap = { minHeight: "100vh", background: "#F2F5FA", fontFamily: "'Noto Sans KR',sans-serif", padding: "28px 18px", boxSizing: "border-box", color: "#0F1A30" };
  if (st !== "ok") {
    const t = { loading: "불러오는 중이에요…", notfound: "문자 정보를 찾을 수 없어요.\nPC에서 QR을 다시 띄워 주세요.", expired: "만든 지 하루가 지난 QR이에요.\nPC에서 QR을 다시 띄워 주세요.", error: "불러오지 못했어요.\n인터넷 연결을 확인하고 다시 찍어 주세요." }[st];
    return <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", whiteSpace: "pre-line", fontSize: 16, fontWeight: 700 }}>{t}</div>;
  }
  const copy = async () => { try { await navigator.clipboard.writeText(d.body); setMsg("내용을 복사했어요"); } catch { setMsg("복사하지 못했어요. 내용을 길게 눌러 복사해 주세요."); } };
  return (
    <div style={wrap} data-testid="sms-relay">
      <div style={{ maxWidth: 440, margin: "0 auto" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.24em", color: "#2D4C82" }}>LOGISWEB · 문자</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>기사님께 문자 보내기</div>
        <div style={{ fontSize: 14, color: "#5B6B85", marginTop: 4 }}>아래 버튼을 누르면 문자 앱이 열려요. 보내기만 누르면 돼요.</div>
        <div style={{ marginTop: 18, background: "#fff", borderRadius: 18, border: "1px solid #E3E8F0", padding: 16 }}>
          <div style={{ fontSize: 13, color: "#5B6B85", fontWeight: 700 }}>받는 사람 {d.to.length}명</div>
          <div style={{ fontSize: 17, fontWeight: 900, marginTop: 2, wordBreak: "keep-all" }}>{d.to.map(fmt).join(", ")}</div>
          <div style={{ marginTop: 12, fontSize: 15, lineHeight: 1.65, whiteSpace: "pre-wrap", userSelect: "text" }}>{d.body || "(내용 없음)"}</div>
        </div>
        <a href={smsHref(d.to, d.body)} data-testid="sms-relay-open" style={{ display: "flex", alignItems: "center", justifyContent: "center", marginTop: 16, height: 56, borderRadius: 16, background: "#1B2B4B", color: "#fff", fontSize: 17, fontWeight: 900, textDecoration: "none" }}>문자 앱 열기</a>
        <button type="button" onClick={copy} style={{ width: "100%", marginTop: 10, height: 48, borderRadius: 14, border: "1px solid #DCE3EE", background: "#fff", color: "#3A4A66", fontSize: 15, fontWeight: 800 }}>내용만 복사</button>
        {msg && <div style={{ marginTop: 10, fontSize: 13.5, color: "#5B6B85", fontWeight: 700, textAlign: "center" }}>{msg}</div>}
      </div>
    </div>
  );
}
