// ======================= src/ContractSign.jsx =======================
// ✍ 전자계약 서명 화면(공개, /sign/{계약ID}) — 고객이 로그인 없이 링크로 열어 계약서를 읽고 서명한다.
//  - 계약 ID 자체가 추측 불가능한 열쇠 역할(링크를 받은 사람만 열람)
//  - 서명 시: 서명 이미지 + 서명자 이름·직위·연락처 + 동의 + 서명 시각 + 문서 지문(SHA-256)을 남기고 상태를 "서명완료"로
//  - firestore.rules: "발송" 상태일 때만, 서명 관련 칸만 바꿀 수 있다
import React from "react";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { CONTRACT_CSS, C_MONO, printContract, signBlockHtml } from "./ContractCenter";

async function sha256(text) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return ""; }
}

function SignPad({ onChange }) {
  const ref = React.useRef(null);
  const drawing = React.useRef(false);
  const last = React.useRef(null);
  const [empty, setEmpty] = React.useState(true);
  React.useEffect(() => {
    const c = ref.current; const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr; c.height = r.height * dpr;
    const g = c.getContext("2d"); g.scale(dpr, dpr); g.lineWidth = 2.6; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#0F1A30";
  }, []);
  const pos = (e) => { const r = ref.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e) => { e.preventDefault(); ref.current.setPointerCapture?.(e.pointerId); drawing.current = true; last.current = pos(e); };
  const move = (e) => {
    if (!drawing.current) return;
    const g = ref.current.getContext("2d"); const [x, y] = pos(e); const [lx, ly] = last.current;
    g.beginPath(); g.moveTo(lx, ly); g.lineTo(x, y); g.stroke(); last.current = [x, y];
    if (empty) setEmpty(false);
  };
  const up = () => { if (!drawing.current) return; drawing.current = false; onChange(ref.current.toDataURL("image/png")); };
  const clear = () => { const c = ref.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); setEmpty(true); onChange(""); };
  return (
    <div>
      <div className="relative rounded-2xl border-2 border-dashed border-[#8FB0F0] bg-[#F7F9FC]" style={{ touchAction: "none" }}>
        <canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} className="w-full h-[170px] block cursor-crosshair" />
        {empty && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[14px] font-bold text-[#9AA9C3]">여기에 서명해 주세요 (손가락 · 마우스)</div>}
      </div>
      <div className="flex justify-end mt-1.5"><button type="button" onClick={clear} className="text-[12.5px] font-bold text-[#5B6B85]">다시 쓰기</button></div>
    </div>
  );
}

function Shell({ c, children }) {
  return (
    <div className="min-h-screen bg-[#EEF1F6]">
      <header className="relative overflow-hidden text-white" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <span className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
        <div className="relative max-w-[920px] mx-auto px-5 py-6">
          <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: C_MONO }}>KP-FLOW · E-CONTRACT</div>
          <div className="text-[22px] font-black mt-1">전자계약 서명</div>
          {c && <div className="text-[13px] text-white/60 mt-0.5" style={{ fontFamily: C_MONO }}>No. {c.no}</div>}
        </div>
      </header>
      <main className="max-w-[920px] mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

export default function ContractSign({ id }) {
  const [c, setC] = React.useState(undefined);
  const [signer, setSigner] = React.useState({ name: "", title: "", phone: "" });
  const [agree, setAgree] = React.useState(false);
  const [sig, setSig] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const load = React.useCallback(async () => {
    try {
      const s = await getDoc(doc(db, "contracts", id));
      setC(s.exists() ? { id: s.id, ...s.data() } : null);
    } catch { setC(null); }
  }, [id]);
  React.useEffect(() => { load(); }, [load]);
  // 처음 열어 본 시각 기록(서명 대기일 때만, 실패해도 무시)
  React.useEffect(() => { if (c?.status === "발송" && !c.viewedAt) updateDoc(doc(db, "contracts", id), { viewedAt: serverTimestamp() }).catch(() => {}); }, [c, id]);

  const submit = async () => {
    setErr("");
    if (!signer.name.trim()) { setErr("서명자 이름을 입력해 주세요."); return; }
    if (!agree) { setErr("계약 내용 확인 및 전자서명 동의에 체크해 주세요."); return; }
    if (!sig) { setErr("서명 칸에 서명해 주세요."); return; }
    setBusy(true);
    try {
      const at = new Date().toISOString();
      const hash = await sha256(`${c.bodyHtml}|${signer.name}|${signer.title}|${signer.phone}|${at}`);
      await updateDoc(doc(db, "contracts", id), {
        status: "서명완료", signedAt: serverTimestamp(), signer: { name: signer.name.trim(), title: signer.title.trim(), phone: signer.phone.trim() },
        signatureImg: sig, signerAgent: navigator.userAgent.slice(0, 300), signedHash: hash, consent: { agreed: true, at },
      });
      await load();
    } catch (e) { setErr(`서명 저장에 실패했습니다: ${e.message}`); } finally { setBusy(false); }
  };


  if (c === undefined) return <Shell c={c}><div className="py-24 text-center text-[#9AA9C3]">계약서를 불러오는 중…</div></Shell>;
  if (!c) return <Shell c={c}><div className="py-24 text-center"><div className="text-[18px] font-black text-[#0F1A30]">계약서를 찾을 수 없습니다</div><div className="text-[13.5px] text-[#7A89A3] mt-1">링크 주소를 다시 확인해 주세요.</div></div></Shell>;
  if (c.status === "취소") return <Shell c={c}><div className="py-24 text-center"><div className="text-[18px] font-black text-[#0F1A30]">취소된 계약서입니다</div><div className="text-[13.5px] text-[#7A89A3] mt-1">공급자에게 문의해 주세요.</div></div></Shell>;
  if (c.status === "작성") return <Shell c={c}><div className="py-24 text-center"><div className="text-[18px] font-black text-[#0F1A30]">아직 서명 요청 전인 계약서입니다</div></div></Shell>;

  const signed = c.status === "서명완료";
  return (
    <Shell c={c}>
      <style>{CONTRACT_CSS}</style>
      {signed && (
        <div className="mb-4 rounded-2xl bg-[#0F1A30] text-white px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div><div className="text-[16px] font-black">서명이 완료되었습니다</div><div className="text-[12.5px] text-white/60">{c.signer?.name} · {c.signedAt?.toDate ? c.signedAt.toDate().toLocaleString("ko-KR") : ""}</div></div>
          <button type="button" onClick={() => printContract(c)} className="h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black">계약서 저장 · 인쇄</button>
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-[0_10px_30px_rgba(15,26,48,0.1)] px-6 sm:px-10 py-8">
        <div className="kp-contract" dangerouslySetInnerHTML={{ __html: c.bodyHtml || "" }} />
        <div dangerouslySetInnerHTML={{ __html: signBlockHtml(c) }} />
      </div>
      {!signed && (
        <div className="mt-5 bg-white rounded-2xl shadow-[0_10px_30px_rgba(15,26,48,0.1)] p-6">
          <div className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#4B6CB7]" style={{ fontFamily: C_MONO }}>SIGNATURE</div>
          <div className="text-[18px] font-black text-[#0F1A30]">고객 서명</div>
          <div className="grid sm:grid-cols-3 gap-2.5 mt-3">
            {[["name", "서명자 이름 *"], ["title", "직위 (예: 대표이사)"], ["phone", "연락처"]].map(([k, l]) => (
              <label key={k} className="block"><span className="text-[12px] font-bold text-[#7A879C]">{l}</span>
                <input value={signer[k]} onChange={(e) => setSigner((p) => ({ ...p, [k]: e.target.value }))} className="mt-1 h-11 w-full px-3 rounded-xl border border-[#DCE3EE] text-[15px] font-semibold outline-none focus:border-[#4B6CB7]" /></label>
            ))}
          </div>
          <div className="mt-3"><SignPad onChange={setSig} /></div>
          <label className="mt-2 flex items-start gap-2.5 text-[14px] font-bold text-[#0F1A30] cursor-pointer">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 w-4 h-4" />
            <span>위 계약서의 내용을 모두 확인하였으며, 「전자서명법」에 따른 전자서명으로 계약을 체결하는 데 동의합니다.</span>
          </label>
          {err && <div className="mt-3 rounded-xl border border-[#DCE3EE] px-4 py-2.5 text-[13.5px] font-bold text-[#1B2B4B]">⚠ {err}</div>}
          <button type="button" onClick={submit} disabled={busy} className="mt-4 w-full h-14 rounded-2xl text-white text-[16px] font-black disabled:opacity-50 shadow-[0_12px_26px_rgba(15,26,48,0.3)]" style={{ background: "linear-gradient(135deg,#0F1A30,#1B2B4B 55%,#2D4C82)" }}>{busy ? "서명 저장 중…" : "서명하고 계약 체결"}</button>
          <div className="mt-3 text-[11.5px] text-[#9AA9C3] leading-relaxed">서명하면 서명 시각과 문서 지문(SHA-256)이 함께 기록되며, 서명 후에는 내용을 바꿀 수 없습니다.</div>
        </div>
      )}
    </Shell>
  );
}
