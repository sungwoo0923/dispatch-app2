// ======================= src/DriverDocsReview.jsx =======================
// 📑 기사 서류 관리(2026-10-31) — 경리·인사(관리자)가 기사앱에서 올라온 필수 서류를 확인·반려한다.
//  기사별 완비율 · 검토 대기 · 반려/만료 · 만료 임박을 한눈에, 기사를 누르면 칸마다 사진을 보고 확인/반려(사유)/대신 올리기.
import React from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db, auth, DEFAULT_COMPANY } from "./firebase";
import { DRIVER_REQUIRED_DOCS, useCompanyDriverDocs, docState, TONE, docProblems } from "./driverRequiredDocs";
import { ImageViewer } from "./driverDocs";
import { compressImage } from "./InternalMail";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const HERO = "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)";
const REQ = DRIVER_REQUIRED_DOCS.filter((d) => d.required);

export default function DriverDocsReview({ company, isViewer = false }) {
  const [drivers, setDrivers] = React.useState(null);
  const docsBy = useCompanyDriverDocs(company);
  const [filter, setFilter] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState(null);
  const [viewer, setViewer] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const fileRef = React.useRef(null);
  const upTarget = React.useRef(null);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(collection(db, "users"), (s) => {
      setDrivers(s.docs.map((d) => ({ uid: d.id, ...d.data() }))
        .filter((u) => u.role === "driver" && (u.companyName || DEFAULT_COMPANY) === company)
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko")));
    }, () => setDrivers([]));
  }, [company]);

  const rows = (drivers || []).map((d) => {
    const byType = docsBy?.[d.uid] || {};
    const p = docProblems(byType);
    const done = REQ.filter((r) => byType[r.key] && docState(byType[r.key]).tone !== "bad").length;
    return { d, byType, p, done };
  });
  const kpi = {
    all: rows.length,
    complete: rows.filter((r) => r.done === REQ.length && !r.p.bad).length,
    wait: rows.filter((r) => r.p.wait > 0).length,
    missing: rows.filter((r) => r.p.missing > 0).length,
    bad: rows.filter((r) => r.p.bad > 0).length,
    warn: rows.filter((r) => r.p.warn > 0).length,
  };
  const kw = q.trim();
  const shown = rows.filter((r) => {
    if (filter === "wait" && !r.p.wait) return false;
    if (filter === "missing" && !r.p.missing) return false;
    if (filter === "bad" && !(r.p.bad || r.p.warn)) return false;
    if (kw && ![r.d.name, r.d.carNo, r.d.phone].some((v) => String(v || "").includes(kw))) return false;
    return true;
  });
  const cur = sel ? rows.find((r) => r.d.uid === sel) : null;

  const review = async (docu, status) => {
    if (isViewer || !docu) return;
    let reason = "";
    if (status === "반려") { reason = window.prompt("반려 사유를 적어 주세요(기사앱에 보입니다)", "글씨가 잘 안 보입니다. 다시 찍어 주세요") || ""; if (!reason) return; }
    setBusy(docu.id);
    try { await updateDoc(doc(db, "driver_documents", docu.id), { status, reviewedAt: serverTimestamp(), reviewedBy: auth.currentUser?.email || "", ...(status === "반려" ? { rejectReason: reason } : { rejectReason: "" }) }); } finally { setBusy(""); }
  };
  const uploadFor = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    const t = upTarget.current; if (!f || !t) return;
    setBusy(t.def.key);
    try {
      const dataUrl = f.type.startsWith("image/") ? await compressImage(f, 1600, 0.82) : await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
      const exp = t.def.expiry ? (window.prompt(`${t.def.label} 만료일(YYYY-MM-DD, 없으면 비움)`, "") || "") : "";
      await addDoc(collection(db, "driver_documents"), { driverId: t.uid, companyName: company, docType: t.def.key, docLabel: t.def.label, fileName: `${t.def.label}.jpg`, fileType: f.type.includes("pdf") ? "application/pdf" : "image/jpeg", dataUrl, ...(exp ? { 만료일: exp } : {}), status: "확인", uploadedAt: { seconds: Math.floor(Date.now() / 1000) }, by: `${auth.currentUser?.email || ""}(대신 등록)`, reviewedAt: serverTimestamp() });
    } finally { setBusy(""); }
  };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[22px] px-4 py-4 md:px-7 md:py-5 text-white shadow-[0_14px_32px_rgba(15,26,48,0.25)]" style={{ background: HERO }}>
        <div className="text-[11px] md:text-[12px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>DRIVER · DOCUMENTS</div>
        <div className="text-[20px] md:text-[24px] font-black mt-0.5">기사 서류 관리</div>
        <div className="text-[12.5px] md:text-[14px] text-white/60 mt-0.5">기사앱에서 올라온 운전면허증·자격증·통장 사본 등을 확인합니다</div>
        <div className="mt-3 grid grid-cols-3 md:grid-cols-6 gap-2">
          {[["기사", kpi.all], ["필수 완비", kpi.complete], ["검토 대기", kpi.wait], ["미제출", kpi.missing], ["반려·만료", kpi.bad], ["만료 임박", kpi.warn]].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-white/[0.07] border border-white/10 px-3 py-2 min-w-0">
              <div className="text-[11.5px] font-bold text-white/55 whitespace-nowrap">{l}</div>
              <div className="text-[19px] font-black tabular-nums" style={{ fontFamily: MONO }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {!cur ? (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden">
          <div className="px-3.5 md:px-5 py-3 border-b border-[#EEF1F6] flex flex-wrap items-center gap-2">
            {[["all", "전체"], ["wait", "검토 대기"], ["missing", "미제출 있음"], ["bad", "반려·만료·임박"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={`h-9 px-3.5 rounded-full text-[13px] font-black border whitespace-nowrap ${filter === k ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#5B6B85] border-[#DCE3EE]"}`}>{l}</button>
            ))}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="기사명·차량번호·전화 검색" className="ml-auto h-9 w-full md:w-[240px] px-3 rounded-xl border border-[#DCE3EE] bg-[#F8FAFD] text-[13.5px] outline-none focus:border-[#2D4C82]" />
          </div>
          {drivers === null || docsBy === null ? <div className="py-16 text-center text-[13.5px] font-bold text-[#9AA9C3]">불러오는 중…</div>
            : !shown.length ? <div className="py-16 text-center text-[13.5px] font-bold text-[#9AA9C3]">해당하는 기사님이 없습니다</div> : (
            <div className="divide-y divide-[#F1F4F9]">
              {shown.map(({ d, byType, p, done }) => (
                <button key={d.uid} type="button" onClick={() => setSel(d.uid)} className="w-full text-left px-3.5 md:px-5 py-3 hover:bg-[#F8FAFD] flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-[#1B2B4B] text-white grid place-items-center text-[14px] font-black shrink-0">{String(d.name || "?").slice(0, 1)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[15px] font-black text-[#0F1A30] whitespace-nowrap">{d.name || "-"}</span>
                      {d.carNo && <span className="px-1.5 h-[20px] rounded-md border border-[#0F1A30] text-[11.5px] font-black grid place-items-center whitespace-nowrap">{d.carNo}</span>}
                      {d.approved === false && <span className="px-1.5 h-[18px] rounded-md bg-[#EEF3FC] text-[#2D4C82] text-[10.5px] font-black grid place-items-center whitespace-nowrap">가입 대기</span>}
                    </div>
                    <div className="mt-1.5 flex gap-[3px]">
                      {DRIVER_REQUIRED_DOCS.map((def) => { const t = TONE[docState(byType[def.key]).tone]; return <span key={def.key} title={`${def.label} · ${docState(byType[def.key]).label}`} className="h-1.5 flex-1 rounded-full" style={{ background: byType[def.key] ? t.bg : def.required ? "#E3E8F0" : "#F3F6FA", outline: t.bd && byType[def.key] ? `1px solid ${t.bd}` : "none" }} />; })}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[13px] font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>{done}/{REQ.length}</div>
                    <div className="text-[11px] font-bold whitespace-nowrap" style={{ color: p.bad ? "#B42318" : p.wait ? "#2D4C82" : p.missing ? "#7A879C" : "#1B2B4B" }}>
                      {p.bad ? `반려·만료 ${p.bad}` : p.wait ? `검토 ${p.wait}` : p.missing ? `미제출 ${p.missing}` : p.warn ? `임박 ${p.warn}` : "완비"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden">
          <div className="px-3.5 md:px-5 py-3 border-b border-[#EEF1F6] flex items-center gap-2">
            <button type="button" onClick={() => setSel(null)} className="h-9 px-3 rounded-xl border border-[#DCE3EE] text-[13px] font-black text-[#1B2B4B] whitespace-nowrap">← 목록</button>
            <div className="min-w-0">
              <div className="text-[15px] font-black text-[#0F1A30] truncate">{cur.d.name} {cur.d.carNo ? `· ${cur.d.carNo}` : ""}</div>
              <div className="text-[12px] text-[#7A879C] truncate">{[cur.d.vehicleType, cur.d.phone].filter(Boolean).join(" · ")}</div>
            </div>
            <span className="ml-auto text-[13px] font-black text-[#0F1A30] tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>필수 {cur.done}/{REQ.length}</span>
          </div>
          <div className="p-3 md:p-4 grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {DRIVER_REQUIRED_DOCS.map((def) => {
              const x = cur.byType[def.key]; const st = docState(x); const t = TONE[st.tone];
              const isImg = x && String(x.fileType || "").startsWith("image");
              return (
                <div key={def.key} className="rounded-2xl border border-[#E3E8F0] p-3 flex gap-3">
                  <button type="button" disabled={!x} onClick={() => (isImg ? setViewer({ images: [x.dataUrl], name: def.label }) : x && window.open(x.dataUrl))}
                    className="w-[72px] h-[72px] rounded-xl shrink-0 border border-[#E3E8F0] bg-[#F5F8FD] grid place-items-center text-[12px] font-black text-[#9AA9C3] bg-cover bg-center"
                    style={x && isImg ? { backgroundImage: `url(${x.dataUrl})` } : undefined}>{x ? (isImg ? "" : "PDF") : "없음"}</button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[14px] font-black text-[#0F1A30] whitespace-nowrap">{def.label}</span>
                      <span className={`text-[10.5px] font-black ${def.required ? "text-[#B42318]" : "text-[#9AA9C3]"}`}>{def.required ? "필수" : "선택"}</span>
                    </div>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-lg text-[11px] font-black whitespace-nowrap" style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}` }}>{st.label}{x?.만료일 ? ` · ~${x.만료일}` : ""}</span>
                    {x?.rejectReason && x.status === "반려" && <div className="text-[11.5px] text-[#B42318] mt-1 truncate">사유: {x.rejectReason}</div>}
                    {!isViewer && (
                      <div className="mt-2 flex gap-1.5 flex-wrap">
                        {x && x.status !== "확인" && <button type="button" disabled={busy === x.id} onClick={() => review(x, "확인")} className="h-8 px-3 rounded-lg bg-[#0F1A30] text-white text-[12px] font-black whitespace-nowrap">확인</button>}
                        {x && x.status !== "반려" && <button type="button" disabled={busy === x.id} onClick={() => review(x, "반려")} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[#B42318] text-[12px] font-black whitespace-nowrap">반려</button>}
                        <button type="button" disabled={busy === def.key} onClick={() => { upTarget.current = { uid: cur.d.uid, def }; fileRef.current?.click(); }} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[#1B2B4B] text-[12px] font-black whitespace-nowrap">{busy === def.key ? "올리는 중…" : "대신 올리기"}</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*,.pdf" hidden onChange={uploadFor} />
      {viewer && <ImageViewer images={viewer.images} index={0} name={viewer.name} onClose={() => setViewer(null)} />}
    </div>
  );
}
