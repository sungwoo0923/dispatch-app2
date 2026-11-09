// ======================= src/driver/DriverContractSign.jsx =======================
// ⭐ 2026-11-10 기사앱 › 서류함 › 계약서 — 회사가 보낸 운송계약서를 읽고 서명한다
//  · 도장 사진 올리기(사진첩·카메라) 또는 손가락으로 서명 → driverContracts/{id}.signImage · status "signed"
//  · 처음 열면 "열람"으로 바뀐다(회사 화면 발송 현황에 보임)
//  · 계약서 화면은 회사 화면과 같은 A4 양식(ContractPaper)을 휴대폰 폭에 맞춰 줄여 보여 준다
import React from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { ContractPaper } from "../ContractStudio";
import { contractSpec } from "../contractTemplates";
import { compressImage } from "../InternalMail";
import { kpAlert, kpConfirm } from "../kpDialog";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";

// 손서명 패드 — 투명 배경 PNG
function SignPad({ onChange }) {
  const ref = React.useRef(null);
  const drawing = React.useRef(false);
  const dirty = React.useRef(false);
  React.useEffect(() => {
    const c = ref.current; if (!c) return;
    const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr; c.height = r.height * dpr;
    const g = c.getContext("2d"); g.scale(dpr, dpr); g.lineWidth = 3; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#0B1428";
  }, []);
  const pt = (e) => { const r = ref.current.getBoundingClientRect(); const t = e.touches?.[0] || e; return [t.clientX - r.left, t.clientY - r.top]; };
  const start = (e) => { e.preventDefault(); drawing.current = true; const g = ref.current.getContext("2d"); const [x, y] = pt(e); g.beginPath(); g.moveTo(x, y); };
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const g = ref.current.getContext("2d"); const [x, y] = pt(e); g.lineTo(x, y); g.stroke(); dirty.current = true; };
  const end = () => { if (!drawing.current) return; drawing.current = false; if (dirty.current) onChange(ref.current.toDataURL("image/png")); };
  const clear = () => { const c = ref.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(""); };
  return (
    <div>
      <canvas ref={ref} onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        style={{ width: "100%", height: 170, borderRadius: 16, border: "1.5px dashed #9AA9C3", background: "#fff", touchAction: "none", display: "block" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <span style={{ fontSize: 14, color: "#7A89A3", fontWeight: 700 }}>네모 칸 안에 손가락으로 서명하세요</span>
        <button type="button" onClick={clear} style={{ height: 34, padding: "0 12px", borderRadius: 10, border: "1px solid #DCE3EE", background: "#fff", fontSize: 14.5, fontWeight: 800, color: "#5B6B85" }}>지우기</button>
      </div>
    </div>
  );
}

export default function DriverContractSign({ item, onBack }) {
  const [method, setMethod] = React.useState("stamp");
  const [img, setImg] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [signed, setSigned] = React.useState(item.status === "signed" ? item : null);
  const fileRef = React.useRef(null);
  const wrap = React.useRef(null);
  const [scale, setScale] = React.useState(0.42);
  const inner = React.useRef(null);
  const [paperH, setPaperH] = React.useState(0); // 줄인 만큼 높이도 줄인다(transform은 자리를 그대로 차지)
  React.useEffect(() => {
    const el = inner.current; if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setPaperH(el.offsetHeight)); ro.observe(el); return () => ro.disconnect();
  }, []);
  React.useEffect(() => {
    const fit = () => { const w = wrap.current?.clientWidth || 360; setScale(Math.min(1, w / 794)); };
    fit(); window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit);
  }, []);
  React.useEffect(() => { // 처음 열면 열람
    if (item.status === "sent") updateDoc(doc(db, "driverContracts", item.id), { status: "read", readAt: serverTimestamp() }).catch(() => {});
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const spec = contractSpec(item.kind || "driver", item.sub);
  const shown = signed?.signImage || img;
  const pickStamp = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    try { setImg(await compressImage(f, 600, 0.85)); } catch { kpAlert("사진을 읽지 못했어요. 다른 사진으로 다시 해 주세요."); }
  };
  const submit = async () => {
    if (!img) return kpAlert(method === "stamp" ? "도장 사진을 먼저 올려 주세요." : "서명을 먼저 해 주세요.");
    if (!(await kpConfirm("이 계약서 내용에 동의하고 서명할까요?\n서명하면 회사에 바로 전달되고 고칠 수 없습니다.", { title: "계약서 서명", okText: "동의하고 서명" }))) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "driverContracts", item.id), { status: "signed", signedAt: serverTimestamp(), signImage: img, signMethod: method, signName: item.vals?.을상호 || item.driverName || "" });
      setSigned({ ...item, status: "signed", signImage: img, signMethod: method });
      kpAlert("서명했습니다. 회사에 전달되었어요.");
    } catch (e) { kpAlert(`서명하지 못했어요: ${e?.message || e}`); } finally { setBusy(false); }
  };
  const seg = (k, l) => (
    <button type="button" onClick={() => { setMethod(k); setImg(""); }} style={{ flex: 1, height: 42, borderRadius: 12, border: "none", background: method === k ? "#0F1A30" : "transparent", color: method === k ? "#fff" : "#3A4A66", fontSize: 15.5, fontWeight: 900 }}>{l}</button>
  );
  return (
    <div style={{ padding: 14 }}>
      <button type="button" onClick={onBack} style={{ height: 38, padding: "0 14px", borderRadius: 14, border: "1px solid #DCE3EE", background: "#fff", fontSize: 15.5, fontWeight: 800, color: "#1B2B4B", marginBottom: 12 }}>← 서류함</button>
      <div style={{ borderRadius: 20, padding: "16px 18px", color: "#fff", marginBottom: 12, background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, letterSpacing: "0.26em", color: "#8FB0F0" }}>CONTRACT</div>
        <div style={{ fontSize: 20, fontWeight: 900 }}>{item.title}</div>
        <div style={{ fontSize: 14.5, color: "rgba(255,255,255,.65)" }}>{signed ? "✓ 서명 완료" : "내용을 끝까지 읽고 아래에서 서명해 주세요"}</div>
      </div>
      <div ref={wrap} style={{ borderRadius: 16, background: "#E9EDF3", padding: 8, overflow: "hidden" }}>
        <div style={{ width: 794 * scale, height: paperH ? paperH * scale : undefined, overflow: "hidden" }}>
          <div ref={inner} style={{ width: 794, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <ContractPaper title={item.title} spec={spec} vals={item.vals || {}} clauses={item.clauses || []} signs={{ right: shown }} />
          </div>
        </div>
      </div>
      {!signed ? (
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #E6EBF3", padding: 16, marginTop: 12 }}>
          <div style={{ fontSize: 16.5, fontWeight: 900, color: "#0F1A30", marginBottom: 10 }}>서명하기</div>
          <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 14, background: "#EEF2F8", marginBottom: 12 }}>{seg("stamp", "도장 사진 올리기")}{seg("draw", "손으로 서명")}</div>
          {method === "stamp" ? (
            <>
              <button type="button" onClick={() => fileRef.current?.click()} style={{ width: "100%", height: img ? 150 : 110, borderRadius: 16, border: "1.5px dashed #9AA9C3", background: "#fff", color: "#5B6B85", fontSize: 15.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {img ? <img src={img} alt="도장" style={{ maxHeight: 130, maxWidth: "80%", objectFit: "contain" }} /> : "도장 찍은 사진 고르기 (사진첩 · 카메라)"}
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickStamp} />
              <div style={{ fontSize: 13.5, color: "#7A89A3", marginTop: 6 }}>흰 종이에 도장을 찍고 가까이서 찍은 사진이 가장 깔끔해요</div>
            </>
          ) : <SignPad onChange={setImg} />}
          <button type="button" onClick={submit} disabled={busy || !img}
            style={{ width: "100%", height: 54, marginTop: 14, borderRadius: 16, border: "none", background: img ? "linear-gradient(120deg,#0B1428,#2D4C82)" : "#E3E8F0", color: img ? "#fff" : "#8E9BB2", fontSize: 17, fontWeight: 900 }}>
            {busy ? "서명 중…" : "동의하고 서명하기"}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 12, height: 52, borderRadius: 16, background: "#E3E8F0", color: "#3A4A66", fontSize: 17, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>✓ 서명 완료 · 회사에 전달됨</div>
      )}
    </div>
  );
}
