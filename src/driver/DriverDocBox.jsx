// ======================= src/driver/DriverDocBox.jsx =======================
// 📂 기사앱 "서류함" — 회사가 보낸 지급명세서 · 과태료/사고 서류를 본다.
//  열면 읽음 표시, 명세서는 [확인했습니다]로 회사에 확인을 알린다. 첨부 사진은 눌러서 전체화면(확대·이동·저장).
// 💳 "정산 정보" 카드 — 가입 때 넣은 계좌·사업자번호를 보고 고친다(사업자등록증 사진도 교체 가능).
import React from "react";
import { collection, doc, onSnapshot, query, updateDoc, where, setDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { StatementDoc, PenaltyDoc, ImageViewer, won, MONO, acctLine } from "../driverDocs";
import BankAccountInput from "../BankAccountInput";
import { validateAccount, onlyDigits } from "../bankUtil";
import { compressImage } from "../InternalMail";

const toMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0);
const card = { background: "#fff", borderRadius: 16, border: "1px solid #E3E8F0", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" };
const Sec = ({ en, title }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "4px 0 8px 4px" }}>
    <span style={{ width: 6, height: 6, background: "#2D4C82", transform: "rotate(45deg)" }} />
    <span style={{ fontSize: 9.5, fontWeight: 800, color: "#9AA9C3", letterSpacing: "0.22em", fontFamily: MONO }}>{en}</span>
    <span style={{ fontSize: 13.5, fontWeight: 900, color: "#0F1A30" }}>{title}</span>
  </div>
);

export function useDriverInbox(uid) {
  const [st, setSt] = React.useState([]);
  const [pen, setPen] = React.useState([]);
  React.useEffect(() => {
    if (!uid) return undefined;
    const u1 = onSnapshot(query(collection(db, "driverStatements"), where("driverId", "==", uid)), (s) => setSt(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setSt([]));
    const u2 = onSnapshot(query(collection(db, "fleetPenalties"), where("driverId", "==", uid)), (s) => setPen(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.published !== false)), () => setPen([]));
    return () => { u1(); u2(); };
  }, [uid]);
  const unread = st.filter((x) => !x.readAt).length + pen.filter((x) => !x.readAt).length;
  return { statements: st, penalties: pen, unread };
}

export default function DriverDocBox({ uid, inbox }) {
  const [tab, setTab] = React.useState("pay");
  const [open, setOpen] = React.useState(null); // { type, item }
  const [viewer, setViewer] = React.useState(null);
  const statements = [...(inbox?.statements || [])].sort((a, b) => String(b.period).localeCompare(String(a.period)));
  const penalties = [...(inbox?.penalties || [])].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const openItem = (type, item) => {
    setOpen({ type, item });
    if (!item.readAt) updateDoc(doc(db, type === "pay" ? "driverStatements" : "fleetPenalties", item.id), { readAt: serverTimestamp(), ...(type === "pay" && item.status === "sent" ? { status: "read" } : {}) }).catch(() => {});
  };
  const confirmPay = async (item) => {
    await updateDoc(doc(db, "driverStatements", item.id), { status: "confirmed", confirmedAt: serverTimestamp() }).catch(() => {});
    setOpen((o) => (o ? { ...o, item: { ...o.item, status: "confirmed" } } : o));
  };

  if (open) {
    const it = open.item;
    return (
      <div style={{ padding: 14 }}>
        <button type="button" onClick={() => setOpen(null)} style={{ height: 38, padding: "0 14px", borderRadius: 12, border: "1px solid #DCE3EE", background: "#fff", fontSize: 13.5, fontWeight: 800, color: "#1B2B4B", marginBottom: 12 }}>← 서류함</button>
        {open.type === "pay" ? <StatementDoc st={it} /> : <PenaltyDoc p={it} onPhoto={(i) => setViewer({ images: it.photos || [], index: i })} />}
        {open.type === "pay" && (
          <button type="button" disabled={it.status === "confirmed"} onClick={() => confirmPay(it)}
            style={{ width: "100%", height: 52, marginTop: 14, borderRadius: 14, border: "none", background: it.status === "confirmed" ? "#E3E8F0" : "linear-gradient(120deg,#0B1428,#2D4C82)", color: it.status === "confirmed" ? "#5B6B85" : "#fff", fontSize: 15.5, fontWeight: 900 }}>
            {it.status === "confirmed" ? "✓ 확인 완료" : "내용을 확인했습니다"}
          </button>
        )}
        {viewer && <ImageViewer images={viewer.images} index={viewer.index} onClose={() => setViewer(null)} name={it.kind || "서류"} />}
      </div>
    );
  }

  const list = tab === "pay" ? statements : penalties;
  return (
    <div style={{ padding: 14 }}>
      <div style={{ borderRadius: 20, padding: "18px 18px 14px", color: "#fff", marginBottom: 12, background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "0.26em", color: "#8FB0F0" }}>DOCUMENTS</div>
        <div style={{ fontSize: 21, fontWeight: 900 }}>서류함</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>회사가 보낸 지급명세서와 과태료·사고 서류</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 12, padding: 4, borderRadius: 14, background: "rgba(255,255,255,.08)" }}>
          {[["pay", "지급명세서", statements.filter((x) => !x.readAt).length], ["pen", "과태료·사고", penalties.filter((x) => !x.readAt).length]].map(([k, l, n]) => (
            <button key={k} type="button" onClick={() => setTab(k)} style={{ height: 38, borderRadius: 11, border: "none", background: tab === k ? "#fff" : "transparent", color: tab === k ? "#0F1A30" : "rgba(255,255,255,.75)", fontSize: 13.5, fontWeight: 900 }}>
              {l}{n ? <span style={{ marginLeft: 6, display: "inline-flex", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#8FB0F0", color: "#0B1428", fontSize: 11, alignItems: "center", justifyContent: "center" }}>{n}</span> : null}
            </button>
          ))}
        </div>
      </div>
      {!list.length ? (
        <div style={{ ...card, padding: "40px 16px", textAlign: "center", color: "#9AA9C3", fontSize: 13.5, fontWeight: 700 }}>{tab === "pay" ? "받은 지급명세서가 없습니다" : "받은 서류가 없습니다"}</div>
      ) : list.map((it) => (
        <button key={it.id} type="button" onClick={() => openItem(tab, it)} style={{ ...card, width: "100%", textAlign: "left", padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: it.readAt ? "#EEF2F8" : "#0F1A30", color: it.readAt ? "#5B6B85" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, fontFamily: MONO }}>
            {tab === "pay" ? String(it.period || "").slice(5) + "월" : (it.kind || "").slice(0, 2)}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14.5, fontWeight: it.readAt ? 700 : 900, color: "#0F1A30" }}>
              {tab === "pay" ? `${it.period} 지급명세서` : `${it.kind} · ${it.date || ""}`}
              {!it.readAt && <span style={{ marginLeft: 6, fontSize: 10.5, padding: "1px 6px", borderRadius: 6, background: "#1B2B4B", color: "#fff" }}>NEW</span>}
            </span>
            <span style={{ display: "block", fontSize: 12, color: "#7A89A3", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {tab === "pay" ? `${(it.trips || []).length}건 · ${it.status === "confirmed" ? "확인 완료" : "확인 필요"}` : (it.detail || it.place || it.payer || "")}
            </span>
          </span>
          <span style={{ fontSize: 15, fontWeight: 900, color: "#0B1428", fontFamily: MONO, whiteSpace: "nowrap" }}>{won(tab === "pay" ? it.net : it.amount)}<span style={{ fontSize: 11 }}>원</span></span>
        </button>
      ))}
    </div>
  );
}

// 💳 정산 정보 카드(설정 탭)
export function DriverPayInfoCard({ uid, driver = {} }) {
  const [edit, setEdit] = React.useState(false);
  const [bank, setBank] = React.useState(driver.정산계좌 || { bank: "", acct: "", holder: "" });
  const [bizNo, setBizNo] = React.useState(driver.사업자번호 || "");
  const [bizName, setBizName] = React.useState(driver.사업자상호 || "");
  const [img, setImg] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef(null);
  React.useEffect(() => { if (!edit) { setBank(driver.정산계좌 || { bank: "", acct: "", holder: "" }); setBizNo(driver.사업자번호 || ""); setBizName(driver.사업자상호 || ""); } }, [driver.정산계좌, driver.사업자번호, driver.사업자상호, edit]);
  const save = async () => {
    if (bank.acct) { const v = validateAccount(bank.bank, bank.acct, bank.holder); if (!v.ok) { window.alert(v.msg); return; } }
    if (bizNo && onlyDigits(bizNo).length !== 10) { window.alert("사업자등록번호는 10자리입니다."); return; }
    setBusy(true);
    try {
      const data = { 정산계좌: bank.acct ? { bank: bank.bank, acct: onlyDigits(bank.acct), holder: String(bank.holder || "").trim() } : null, 사업자번호: onlyDigits(bizNo), 사업자상호: bizName.trim(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, "drivers", uid), data, { merge: true });
      await setDoc(doc(db, "users", uid), { 정산계좌: data.정산계좌, 사업자번호: data.사업자번호, 사업자상호: data.사업자상호 }, { merge: true }).catch(() => {});
      if (img) await addDoc(collection(db, "driver_documents"), { driverId: uid, companyName: driver.companyName || "", docType: "사업자등록증", fileName: "사업자등록증.jpg", fileType: "image/jpeg", dataUrl: img, uploadedAt: { seconds: Math.floor(Date.now() / 1000) }, by: "기사" }).catch(() => {});
      setImg(""); setEdit(false);
    } catch (e) { window.alert(`저장 실패: ${e?.message || e}`); } finally { setBusy(false); }
  };
  const fmtBiz = (v) => { const d = onlyDigits(v).slice(0, 10); return d.length > 5 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d; };
  const chk = driver.정산계좌?.acct ? validateAccount(driver.정산계좌.bank, driver.정산계좌.acct) : null;
  return (
    <div style={{ marginBottom: 20 }}>
      <Sec en="SETTLEMENT" title="정산 정보" />
      <div style={{ ...card, padding: 16 }}>
        {!edit ? (
          <>
            {[["입금 계좌", acctLine(driver.정산계좌) || "미등록"], ["사업자번호", driver.사업자번호 ? fmtBiz(driver.사업자번호) : "-"], ["상호", driver.사업자상호 || "-"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid #EEF2F8" }}>
                <span style={{ fontSize: 13, color: "#5B6B85", fontWeight: 600 }}>{k}</span>
                <span style={{ fontSize: 13, color: "#1B2B4B", fontWeight: 800, textAlign: "right" }}>{v}</span>
              </div>
            ))}
            {chk && <div style={{ fontSize: 12, fontWeight: 700, color: chk.level === "ok" ? "#2D4C82" : "#7A89A3", marginTop: 8 }}>{chk.level === "ok" ? "✓ 계좌 형식 확인됨" : `! ${chk.msg}`}</div>}
            <button type="button" onClick={() => setEdit(true)} style={{ width: "100%", height: 44, marginTop: 12, borderRadius: 12, border: "none", background: "#0F1A30", color: "#fff", fontSize: 14, fontWeight: 900 }}>정산 정보 수정</button>
          </>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <BankAccountInput value={bank} onChange={setBank} compact noFav />
            <input inputMode="numeric" value={fmtBiz(bizNo)} onChange={(e) => setBizNo(e.target.value)} placeholder="사업자등록번호 (선택)" style={{ height: 42, borderRadius: 12, border: "1px solid #DCE3EE", padding: "0 12px", fontSize: 14, fontWeight: 700 }} />
            <input value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="상호 (선택)" style={{ height: 42, borderRadius: 12, border: "1px solid #DCE3EE", padding: "0 12px", fontSize: 14, fontWeight: 700 }} />
            <button type="button" onClick={() => fileRef.current?.click()} style={{ height: 42, borderRadius: 12, border: "1.5px dashed #C9D2E0", background: "#fff", color: "#5B6B85", fontSize: 13, fontWeight: 800 }}>{img ? "✓ 사업자등록증 사진 선택됨" : "+ 사업자등록증 사진 (선택)"}</button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setImg(await compressImage(f, 1400, 0.8).catch(() => "")); }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
              <button type="button" onClick={() => setEdit(false)} style={{ height: 44, borderRadius: 12, border: "1px solid #DCE3EE", background: "#fff", fontSize: 14, fontWeight: 800, color: "#5B6B85" }}>취소</button>
              <button type="button" onClick={save} disabled={busy} style={{ height: 44, borderRadius: 12, border: "none", background: "#0F1A30", color: "#fff", fontSize: 14, fontWeight: 900 }}>{busy ? "저장 중…" : "저장"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
