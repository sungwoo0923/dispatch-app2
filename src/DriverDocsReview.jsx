// ======================= src/DriverDocsReview.jsx =======================
// 📑 기사 서류 관리 — 기사앱에서 올라온 필수 서류를 확인·반려·저장한다. PC·모바일 공용.
//  2026-10-31 리디자인: 왼쪽 기사 목록(완비율 링) + 오른쪽 서류 갤러리(큰 미리보기), 칸마다 [저장] · 기사별 [전체 저장]
import React from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db, auth, DEFAULT_COMPANY } from "./firebase";
import { DRIVER_REQUIRED_DOCS, useCompanyDriverDocs, docState, TONE, docProblems } from "./driverRequiredDocs";
import { ImageViewer } from "./driverDocs";
import { compressImage } from "./InternalMail";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const HERO = "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)";
const REQ = DRIVER_REQUIRED_DOCS.filter((d) => d.required);

// 서류 파일 저장(이미지·PDF)
export function saveDocFile(x, who, label) {
  if (!x?.dataUrl) return;
  const ext = String(x.fileType || "").includes("pdf") || String(x.dataUrl).startsWith("data:application/pdf") ? "pdf" : "jpg";
  const a = document.createElement("a");
  a.href = x.dataUrl;
  a.download = `${who || "기사"}_${label}${x.만료일 ? `_~${x.만료일}` : ""}.${ext}`;
  document.body.appendChild(a); a.click(); a.remove();
}
function Ring({ v, size = 44 }) {
  const r = (size - 6) / 2; const c = 2 * Math.PI * r; const p = Math.max(0, Math.min(1, v));
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#E3E8F0" strokeWidth="4.5" fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={p >= 1 ? "#12B76A" : "#1B2B4B"} strokeWidth="4.5" fill="none" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize="11" fontWeight="900" fill="#0F1A30" fontFamily={MONO}>{Math.round(p * 100)}</text>
    </svg>
  );
}

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
    bad: rows.filter((r) => r.p.bad > 0 || r.p.warn > 0).length,
  };
  const rate = rows.length ? rows.reduce((s, r) => s + r.done / REQ.length, 0) / rows.length : 0;
  const kw = q.trim();
  const shown = rows.filter((r) => {
    if (filter === "wait" && !r.p.wait) return false;
    if (filter === "missing" && !r.p.missing) return false;
    if (filter === "bad" && !(r.p.bad || r.p.warn)) return false;
    if (filter === "done" && !(r.done === REQ.length && !r.p.bad)) return false;
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
  const saveAll = (r) => { DRIVER_REQUIRED_DOCS.forEach((def, i) => { const x = r.byType[def.key]; if (x) setTimeout(() => saveDocFile(x, r.d.name, def.label), i * 350); }); };

  const statusOf = (r) => (r.p.bad ? ["반려·만료", "#B42318", "#FEF3F2"] : r.p.wait ? ["검토 대기", "#2D4C82", "#EEF3FC"] : r.p.missing ? ["미제출", "#7A879C", "#F3F6FA"] : r.p.warn ? ["만료 임박", "#B54708", "#FFF4E5"] : ["완비", "#067647", "#ECFDF3"]);

  const list = (
    <div className="rounded-[20px] bg-white border border-[#E3E8F0] overflow-hidden flex flex-col min-h-0">
      <div className="px-3.5 py-3 border-b border-[#EEF1F6] space-y-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="기사명·차량번호·전화 검색" className="h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-[#F8FAFD] text-[13.5px] outline-none focus:border-[#2D4C82]" />
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {[["all", "전체", kpi.all], ["wait", "검토 대기", kpi.wait], ["missing", "미제출", kpi.missing], ["bad", "반려·만료", kpi.bad], ["done", "완비", kpi.complete]].map(([k, l, n]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={`h-8 px-3 rounded-full text-[12.5px] font-black border whitespace-nowrap shrink-0 ${filter === k ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#5B6B85] border-[#DCE3EE]"}`}>{l} <span className="tabular-nums opacity-70" style={{ fontFamily: MONO }}>{n}</span></button>
          ))}
        </div>
      </div>
      {drivers === null || docsBy === null ? <div className="py-16 text-center text-[13.5px] font-bold text-[#9AA9C3]">불러오는 중…</div>
        : !shown.length ? <div className="py-16 text-center text-[13.5px] font-bold text-[#9AA9C3]">해당하는 기사님이 없습니다</div> : (
        <div className="divide-y divide-[#F1F4F9] overflow-y-auto lg:max-h-[calc(100vh-330px)]">
          {shown.map((r) => {
            const [sl, sc, sb] = statusOf(r);
            return (
              <button key={r.d.uid} type="button" onClick={() => setSel(r.d.uid)} className={`w-full text-left px-3.5 py-3 flex items-center gap-3 transition ${sel === r.d.uid ? "bg-[#F2F6FD] shadow-[inset_3px_0_0_#1B2B4B]" : "hover:bg-[#F8FAFD]"}`}>
                <Ring v={r.done / REQ.length} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5"><span className="text-[14.5px] font-black text-[#0F1A30] truncate">{r.d.name || "-"}</span>{r.d.approved === false && <span className="text-[10px] font-black text-[#2D4C82]">가입 대기</span>}</span>
                  <span className="block text-[12px] text-[#7A879C] truncate" style={{ fontFamily: MONO }}>{[r.d.carNo, r.d.vehicleType].filter(Boolean).join(" · ") || "-"}</span>
                </span>
                <span className="shrink-0 h-6 px-2 rounded-md text-[11px] font-black grid place-items-center whitespace-nowrap" style={{ color: sc, background: sb }}>{sl}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const detail = cur && (
    <div className="rounded-[20px] bg-white border border-[#E3E8F0] overflow-hidden">
      <div className="px-4 md:px-6 py-4 border-b border-[#EEF1F6] flex items-center gap-3 flex-wrap">
        <button type="button" onClick={() => setSel(null)} className="lg:hidden h-9 px-3 rounded-xl border border-[#DCE3EE] text-[13px] font-black text-[#1B2B4B]">← 목록</button>
        <Ring v={cur.done / REQ.length} size={52} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>DRIVER FILE</div>
          <div className="text-[19px] font-black text-[#0F1A30] truncate">{cur.d.name} {cur.d.carNo && <span className="text-[14px] font-black text-[#5B6B85]" style={{ fontFamily: MONO }}>· {cur.d.carNo}</span>}</div>
          <div className="text-[12.5px] text-[#7A879C] truncate">필수 {cur.done}/{REQ.length} · {[cur.d.vehicleType, cur.d.phone].filter(Boolean).join(" · ")}</div>
        </div>
        <button type="button" onClick={() => saveAll(cur)} className="h-10 px-4 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black whitespace-nowrap">⬇ 전체 저장</button>
      </div>
      {/* ⭐ 2026-10-31 보관함형 — 작은 썸네일 + 서류명·상태·만료일 + 저장/확인/반려를 한 줄로 */}
      <div className="p-3 md:p-4">
        {!isViewer && <div className="mb-3 rounded-xl bg-[#EEF3FC] border border-[#C9D6EE] px-3.5 py-2.5 text-[13px] text-[#1B2B4B] leading-relaxed">기사님이 기사앱으로 올리지 않은 서류는 <b>⬆ 직접 올리기</b>(또는 빈 칸 <b>＋</b>)로 관리자가 사진·PDF를 올릴 수 있습니다. 관리자가 올린 서류는 바로 <b>확인</b> 상태가 되고 기사앱에도 보입니다.</div>}
        <div className="rounded-2xl border border-[#E3E8F0] overflow-hidden divide-y divide-[#EEF2F8]">
          {DRIVER_REQUIRED_DOCS.map((def, idx) => {
            const x = cur.byType[def.key]; const st = docState(x); const t = TONE[st.tone];
            const isImg = x && String(x.fileType || "").startsWith("image");
            return (
              <div key={def.key} className={`flex items-center gap-3 px-3 md:px-4 py-2.5 ${idx % 2 ? "bg-[#FBFCFE]" : "bg-white"}`}>
                <span className="w-6 text-[11px] font-black text-[#9AA9C3] tabular-nums shrink-0" style={{ fontFamily: MONO }}>{String(idx + 1).padStart(2, "0")}</span>
                <button type="button" disabled={!x && isViewer} title={x ? "크게 보기" : "직접 올리기"} onClick={() => (!x ? (upTarget.current = { uid: cur.d.uid, def }, fileRef.current?.click()) : isImg ? setViewer({ images: [x.dataUrl], name: def.label }) : window.open(x.dataUrl))}
                  className="w-12 h-12 rounded-xl shrink-0 border border-[#E3E8F0] bg-[#F3F6FA] bg-cover bg-center grid place-items-center text-[10px] font-black text-[#9AA9C3]"
                  style={x && isImg ? { backgroundImage: `url(${x.dataUrl})` } : undefined}>{x ? (isImg ? "" : "PDF") : <span className="text-[18px] text-[#2D4C82]">＋</span>}</button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[14px] font-black text-[#0F1A30]">{def.label}</span>
                    <span className={`text-[10px] font-black ${def.required ? "text-[#B42318]" : "text-[#9AA9C3]"}`}>{def.required ? "필수" : "선택"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="h-5 px-1.5 rounded-md text-[10.5px] font-black grid place-items-center whitespace-nowrap" style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}` }}>{st.label}</span>
                    {x?.만료일 && <span className="text-[11px] font-bold text-[#5B6B85] tabular-nums" style={{ fontFamily: MONO }}>~{x.만료일}</span>}
                    {x?.rejectReason && x.status === "반려" && <span className="text-[11px] text-[#B42318] truncate">사유: {x.rejectReason}</span>}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                  {x && <button type="button" onClick={() => saveDocFile(x, cur.d.name, def.label)} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] text-[#1B2B4B] text-[12px] font-black whitespace-nowrap">⬇ 저장</button>}
                  {!isViewer && x && x.status !== "확인" && <button type="button" disabled={busy === x.id} onClick={() => review(x, "확인")} className="h-8 px-2.5 rounded-lg bg-[#0F1A30] text-white text-[12px] font-black whitespace-nowrap">확인</button>}
                  {!isViewer && x && x.status !== "반려" && <button type="button" disabled={busy === x.id} onClick={() => review(x, "반려")} className="h-8 px-2.5 rounded-lg border border-[#FECDCA] text-[#B42318] text-[12px] font-black whitespace-nowrap">반려</button>}
                  {!isViewer && <button type="button" disabled={busy === def.key} onClick={() => { upTarget.current = { uid: cur.d.uid, def }; fileRef.current?.click(); }} className={`h-8 px-2.5 rounded-lg text-[12px] font-black whitespace-nowrap ${x ? "border border-[#DCE3EE] text-[#5B6B85]" : "bg-[#2D4C82] text-white"}`}>{busy === def.key ? "올리는 중…" : x ? "⬆ 교체" : "⬆ 직접 올리기"}</button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[22px] px-4 py-4 md:px-7 md:py-5 text-white shadow-[0_14px_32px_rgba(15,26,48,0.25)] flex flex-wrap items-center gap-5" style={{ background: HERO }}>
        <div className="flex-1 min-w-[220px]">
          <div className="text-[11px] md:text-[12px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>DRIVER · DOCUMENTS</div>
          <div className="text-[20px] md:text-[24px] font-black mt-0.5">기사 제출 서류</div>
          <div className="text-[12.5px] md:text-[14px] text-white/60 mt-0.5">기사앱에서 올라온 면허증·자격증·통장 사본 등 — 확인·반려·저장</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right"><div className="text-[11px] font-bold text-white/55">필수 서류 완비율</div><div className="text-[30px] font-black tabular-nums leading-none" style={{ fontFamily: MONO }}>{Math.round(rate * 100)}<span className="text-[15px] text-white/50">%</span></div></div>
          <div className="grid grid-cols-2 gap-1.5">
            {[["완비", kpi.complete], ["검토 대기", kpi.wait], ["미제출", kpi.missing], ["반려·만료", kpi.bad]].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-white/[0.07] border border-white/10 px-3 py-1.5 min-w-[92px]"><div className="text-[10.5px] font-bold text-white/55 whitespace-nowrap">{l}</div><div className="text-[17px] font-black tabular-nums" style={{ fontFamily: MONO }}>{v}</div></div>
            ))}
          </div>
        </div>
      </div>
      {/* PC: 목록 + 상세 나란히 / 휴대폰: 목록 → 상세 */}
      <div className="hidden lg:grid grid-cols-[360px_minmax(0,1fr)] gap-4 items-start">
        {list}
        {detail || <div className="rounded-[20px] border-2 border-dashed border-[#DCE3EE] bg-white py-24 text-center text-[14px] font-bold text-[#9AA9C3]">왼쪽에서 기사님을 고르면 서류가 보입니다</div>}
      </div>
      <div className="lg:hidden">{cur ? detail : list}</div>
      <input ref={fileRef} type="file" accept="image/*,.pdf" hidden onChange={uploadFor} />
      {viewer && <ImageViewer images={viewer.images} index={0} name={viewer.name} onClose={() => setViewer(null)} />}
    </div>
  );
}
