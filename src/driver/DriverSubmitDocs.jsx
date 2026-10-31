// ======================= src/driver/DriverSubmitDocs.jsx =======================
// 📑 기사앱 › 서류함 › 제출 서류(2026-10-31) — 회사에 내야 하는 서류를 칸마다 찍어 올린다.
//  칸마다 상태(미제출·검토 대기·확인 완료·반려·만료 임박)를 보여주고, 다시 찍으면 새 서류로 교체된다.
import React from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { compressImage } from "../InternalMail";
import { DRIVER_REQUIRED_DOCS, useDriverDocs, docState, TONE, docProblems } from "../driverRequiredDocs";
import { ImageViewer, MONO } from "../driverDocs";
import { kpAlert } from "../kpDialog";

const card = { background: "#fff", borderRadius: 16, border: "1px solid #E3E8F0", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" };

export default function DriverSubmitDocs({ uid, companyName = "" }) {
  const byType = useDriverDocs(uid);
  const [busy, setBusy] = React.useState("");
  const [expiry, setExpiry] = React.useState({});
  const [viewer, setViewer] = React.useState(null);
  const fileRef = React.useRef(null);
  const target = React.useRef(null);
  const prob = docProblems(byType);
  const reqTotal = DRIVER_REQUIRED_DOCS.filter((d) => d.required).length;
  const reqDone = DRIVER_REQUIRED_DOCS.filter((d) => d.required && byType[d.key] && docState(byType[d.key]).tone !== "bad").length;

  const pick = (def) => {
    if (def.expiry && !expiry[def.key] && !byType[def.key]?.만료일) {
      kpAlert(`${def.label}의 만료일(유효기간)을 먼저 골라 주세요.`);
      return;
    }
    target.current = def;
    fileRef.current?.click();
  };
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    const def = target.current;
    if (!f || !def) return;
    setBusy(def.key);
    try {
      const dataUrl = f.type.startsWith("image/") ? await compressImage(f, 1600, 0.82) : await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
      if (String(dataUrl).length > 900000) { kpAlert("파일이 너무 큽니다. 사진으로 다시 찍어 주세요."); return; }
      const exp = expiry[def.key] || byType[def.key]?.만료일 || "";
      await addDoc(collection(db, "driver_documents"), {
        driverId: uid, ...(companyName ? { companyName } : {}),
        docType: def.key, docLabel: def.label, fileName: `${def.label}.${f.type.includes("pdf") ? "pdf" : "jpg"}`, fileType: f.type.includes("pdf") ? "application/pdf" : "image/jpeg",
        dataUrl, ...(exp ? { 만료일: exp } : {}), status: "제출",
        uploadedAt: { seconds: Math.floor(Date.now() / 1000) }, submittedAt: serverTimestamp(), by: "기사앱",
      });
    } catch (err) { kpAlert(`올리지 못했어요: ${err?.message || err}`); } finally { setBusy(""); }
  };

  return (
    <div style={{ padding: "0 0 8px" }}>
      <div style={{ ...card, padding: "14px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 54, height: 54, borderRadius: 14, background: "linear-gradient(135deg,#0F1A30,#2D4C82)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 900, fontFamily: MONO, lineHeight: 1 }}>{reqDone}<span style={{ fontSize: 11, opacity: 0.6 }}>/{reqTotal}</span></span>
          <span style={{ fontSize: 9.5, fontWeight: 800, opacity: 0.7, marginTop: 2 }}>필수</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#0F1A30" }}>{prob.missing || prob.bad ? "제출이 필요한 서류가 있어요" : "필수 서류를 모두 냈어요"}</div>
          <div style={{ fontSize: 12, color: "#7A89A3", marginTop: 2 }}>
            {[prob.missing && `미제출 ${prob.missing}`, prob.bad && `반려·만료 ${prob.bad}`, prob.warn && `만료 임박 ${prob.warn}`, prob.wait && `검토 대기 ${prob.wait}`].filter(Boolean).join(" · ") || "회사에서 확인했습니다"}
          </div>
        </div>
      </div>

      {DRIVER_REQUIRED_DOCS.map((def) => {
        const d = byType[def.key];
        const st = docState(d);
        const t = TONE[st.tone];
        const isImg = d && String(d.fileType || "").startsWith("image");
        return (
          <div key={def.key} style={{ ...card, padding: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button type="button" onClick={() => (d && isImg ? setViewer({ images: [d.dataUrl], index: 0, name: def.label }) : pick(def))}
                style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0, border: d ? "1px solid #E3E8F0" : "2px dashed #C9D2E0", background: d && isImg ? `url(${d.dataUrl}) center/cover` : "#F5F8FD", color: "#7A89A3", fontSize: 22, fontWeight: 300 }}>
                {d ? (isImg ? "" : "PDF") : "+"}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14.5, fontWeight: 900, color: "#0F1A30", whiteSpace: "nowrap" }}>{def.label}</span>
                  {def.required ? <span style={{ fontSize: 10, fontWeight: 900, color: "#B42318" }}>필수</span> : <span style={{ fontSize: 10, fontWeight: 800, color: "#9AA9C3" }}>선택</span>}
                </div>
                <div style={{ fontSize: 11.5, color: "#7A89A3", marginTop: 1 }}>{def.desc}</div>
                <span style={{ display: "inline-block", marginTop: 4, fontSize: 11, fontWeight: 900, padding: "2px 8px", borderRadius: 8, background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, whiteSpace: "nowrap" }}>{st.label}{d?.만료일 ? ` · ~${d.만료일}` : ""}</span>
                {d?.status === "반려" && d.rejectReason && <div style={{ fontSize: 11.5, color: "#B42318", marginTop: 3 }}>사유: {d.rejectReason}</div>}
              </div>
              <button type="button" disabled={busy === def.key} onClick={() => pick(def)}
                style={{ height: 38, padding: "0 12px", borderRadius: 11, border: "none", background: d && st.tone === "ok" ? "#EEF2F8" : "#0F1A30", color: d && st.tone === "ok" ? "#1B2B4B" : "#fff", fontSize: 12.5, fontWeight: 900, flexShrink: 0, whiteSpace: "nowrap", opacity: busy === def.key ? 0.5 : 1 }}>
                {busy === def.key ? "올리는 중…" : d ? "다시 제출" : "찍어서 제출"}
              </button>
            </div>
            {def.expiry && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px dashed #E3E8F0" }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#3A4A66", whiteSpace: "nowrap" }}>만료일</span>
                <input type="date" value={expiry[def.key] ?? d?.만료일 ?? ""} onChange={(e) => setExpiry((p) => ({ ...p, [def.key]: e.target.value }))}
                  style={{ flex: 1, minWidth: 0, height: 36, padding: "0 10px", border: "1px solid #DCE3EE", borderRadius: 10, fontSize: 13.5, fontWeight: 700, color: "#0F1A30", background: "#fff" }} />
              </div>
            )}
          </div>
        );
      })}
      <div style={{ fontSize: 11.5, color: "#9AA9C3", textAlign: "center", padding: "6px 0 4px" }}>사진은 글씨가 잘 보이게 밝은 곳에서 찍어 주세요 · 다시 제출하면 새 서류로 바뀝니다</div>
      <input ref={fileRef} type="file" accept="image/*,.pdf" hidden onChange={onFile} />
      {viewer && <ImageViewer images={viewer.images} index={0} name={viewer.name} onClose={() => setViewer(null)} />}
    </div>
  );
}
