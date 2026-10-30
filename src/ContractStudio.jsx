// ======================= src/ContractStudio.jsx =======================
// 📜 홈 › 전자결재 › 계약서 — 운송계약서(지입·직영·임대) · 거래처 운송계약서 · 자율양식 계약서
//  왼쪽: 유형 고르기 → 입력칸 → 조항(자동 셋팅, 자유롭게 수정·추가·삭제) / 오른쪽: A4 미리보기
//  저장하면 보관함(companyContracts)에 남고, 이미지·PDF로 내려받거나 인쇄한다.
import React from "react";
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import { kpAlert, kpConfirm } from "./kpDialog";
import CustomSelect from "./CustomSelect";
import CustomDatePicker from "./CustomDatePicker";
import { DRIVER_KINDS, FREE_TOPICS, contractSpec, fillVars } from "./contractTemplates";
import { useFleetDrivers } from "./FleetPayDocs";
import { savePng, savePdf, printA4 } from "./a4Export";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const card = "rounded-[18px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_20px_rgba(16,24,40,0.05)]";
const inp = "h-11 w-full px-3 rounded-xl border border-[#D3DBE8] bg-white text-[14.5px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15";
const lab = "block text-[13px] font-black text-[#3A4A66] mb-1.5";
const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const korDate = (d) => (d ? `${d.slice(0, 4)}년 ${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일` : "");
const KIND_LABEL = { driver: "운송계약서", client: "거래처 운송계약서", free: "자율양식 계약서" };

// 입력값 → 문서에 넣을 글자(금액은 콤마+원, 날짜는 한글)
function displayVals(spec, vals) {
  const out = { ...vals };
  (spec.fields || []).forEach((f) => {
    const v = vals[f.k];
    if (f.type === "money") out[f.k] = toInt(v) ? `금 ${toInt(v).toLocaleString()}원` : "";
    if (f.type === "date") out[f.k] = korDate(v);
  });
  return out;
}

// A4 한 장 = 794×1123px(96dpi). 조항이 장 경계에서 잘리지 않게 장마다 나눠 담는다.
const PAGE_W = 794, PAGE_H = 1123, PAD_Y = 60, PAD_X = 70, FOOT = 30;
const CAP = PAGE_H - PAD_Y * 2 - FOOT;
export function ContractPaper({ title, spec, vals, clauses, paperRef }) {
  const dv = displayVals(spec, vals);
  const isClient = spec === contractSpec("client");
  const left = isClient ? { role: "갑 (화주)", name: vals.을상호, ceo: vals.을대표, biz: vals.을사업자번호, addr: vals.을주소 } : { role: "갑", name: vals.갑상호, ceo: vals.갑대표, biz: vals.갑사업자번호, addr: vals.갑주소, tel: vals.갑연락처 };
  const right = isClient ? { role: "을 (운송사)", name: vals.갑상호, ceo: vals.갑대표, biz: vals.갑사업자번호, addr: vals.갑주소 } : { role: "을", name: vals.을상호, ceo: vals.을대표, biz: vals.을사업자번호, addr: vals.을주소, tel: vals.을연락처 };
  const blocks = [
    <div key="h" style={{ textAlign: "center", borderBottom: "3px double #0F1A30", paddingBottom: 18, marginBottom: 24 }}>
      <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.3em", color: "#2D4C82", fontWeight: 800 }}>CONTRACT</div>
      <div style={{ fontSize: 27, fontWeight: 900, letterSpacing: "0.06em", marginTop: 6 }}>{title}</div>
    </div>,
    ...clauses.map((cl, i) => (
      <div key={`c${i}`} style={{ paddingBottom: 14, fontSize: 14.5, lineHeight: 1.9, color: "#0B1428" }}>
        {cl.title && <div style={{ fontWeight: 900, fontSize: 15 }}>{fillVars(cl.title, dv)}</div>}
        <div style={{ whiteSpace: "pre-wrap", textAlign: "justify" }}>{fillVars(cl.body, dv)}</div>
      </div>
    )),
    <div key="close" style={{ paddingTop: 10, paddingBottom: 18, textAlign: "center", fontSize: 14.5, lineHeight: 1.9 }}>
      위 계약의 내용을 증명하기 위하여 계약서 2부를 작성하고, 서명 날인 후 각 1부씩 보관한다.
      <div style={{ fontSize: 16, fontWeight: 900, marginTop: 10 }}>{korDate(vals.계약일) || "＿＿＿＿년 ＿＿월 ＿＿일"}</div>
    </div>,
    <div key="sign" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      {[left, right].map((p, i) => (
        <div key={i} style={{ border: "1.5px solid #0F1A30", borderRadius: 4, padding: "14px 16px", fontSize: 13.5, lineHeight: 1.9, color: "#0B1428" }}>
          <div style={{ fontWeight: 900, fontSize: 14.5, borderBottom: "1px solid #DCE3EE", paddingBottom: 6, marginBottom: 6 }}>{p.role}</div>
          <div>상호·성명 : <b>{p.name || ""}</b></div>
          <div>대 표 자 : {p.ceo || ""}</div>
          <div>사업자번호 : {p.biz || ""}</div>
          <div style={{ overflowWrap: "anywhere" }}>주 소 : {p.addr || ""}</div>
          {p.tel !== undefined && <div>연 락 처 : {p.tel || ""}</div>}
          <div style={{ textAlign: "right", marginTop: 10, fontWeight: 800 }}>(서명 또는 인) <span style={{ display: "inline-block", width: 44, height: 44, border: "1px dashed #7A879C", borderRadius: "50%", verticalAlign: "middle", marginLeft: 6 }} /></div>
        </div>
      ))}
    </div>,
  ];
  // 블록 높이를 재서 장을 나눈다
  const measureRef = React.useRef(null);
  const [pages, setPages] = React.useState([blocks.map((_, i) => i)]);
  const sig = JSON.stringify([title, vals, clauses]);
  React.useLayoutEffect(() => {
    const box = measureRef.current; if (!box) return;
    const hs = [...box.children].map((el) => el.offsetHeight);
    const out = []; let cur = []; let used = 0;
    hs.forEach((h, i) => {
      // 마지막 두 블록(맺음말+서명)은 한 장에 같이 — 서명 칸만 다음 장으로 넘어가지 않게
      const need = i === hs.length - 2 ? h + hs[hs.length - 1] : h;
      if (cur.length && used + need > CAP) { out.push(cur); cur = []; used = 0; }
      cur.push(i); used += h;
    });
    if (cur.length) out.push(cur);
    setPages(out);
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageStyle = { width: PAGE_W, height: PAGE_H, background: "#fff", color: "#0F1A30", padding: `${PAD_Y}px ${PAD_X}px`, fontFamily: "'Noto Sans KR',sans-serif", boxSizing: "border-box", position: "relative", overflow: "hidden" };
  return (
    <>
      <div ref={measureRef} aria-hidden style={{ position: "absolute", left: -10000, top: 0, width: PAGE_W - PAD_X * 2, fontFamily: "'Noto Sans KR',sans-serif", visibility: "hidden" }}>{blocks}</div>
      <div ref={paperRef} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {pages.map((idxs, pi) => (
          <div key={pi} className="kp-a4page" style={pageStyle}>
            {idxs.map((i) => blocks[i])}
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 26, textAlign: "center", fontSize: 12, color: "#5B6B85", fontFamily: MONO }}>- {pi + 1} / {pages.length} -</div>
          </div>
        ))}
      </div>
    </>
  );
}

// 🔎 기사님 찾기 — 이름·차량번호·전화번호로 검색하거나 ▾로 전체 목록(70명이어도 바로)
function DriverSearch({ drivers, onPick }) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const key = q.replace(/\s/g, "");
  const list = drivers.filter((d) => !key || `${d.이름}${d.차량번호}${d.전화번호}${d.사업자상호 || ""}`.replace(/\s/g, "").includes(key)).slice(0, 50);
  const pick = (d) => { onPick(d.id); setQ(`${d.이름} · ${d.차량번호}`); setOpen(false); };
  return (
    <div className="relative">
      <div className="flex">
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => { if (!open || !list.length) return; if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(list.length - 1, h + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); } else if (e.key === "Enter") { e.preventDefault(); pick(list[hi]); } }}
          placeholder="이름 · 차량번호 · 전화번호로 검색" className={`${inp} !rounded-r-none`} autoComplete="off" />
        <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((v) => !v)} className="h-11 w-11 shrink-0 rounded-r-xl bg-[#0F1A30] text-white text-[13px]" aria-label="전체 목록">▾</button>
      </div>
      {open && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 rounded-xl border border-[#DCE3EE] bg-white shadow-[0_18px_40px_rgba(15,26,48,.18)] max-h-[320px] overflow-y-auto">
          {list.map((d, i) => (
            <button key={d.id} type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(d)} onMouseEnter={() => setHi(i)}
              className={`w-full text-left px-3.5 py-2.5 border-b border-[#EEF1F6] last:border-0 flex items-center gap-2 ${i === hi ? "bg-[#EEF3FC]" : "bg-white"}`}>
              <span className="text-[14.5px] font-black text-[#0F1A30]">{d.이름}</span>
              <span className="text-[13px] font-bold text-[#3A4A66]">{d.차량번호}</span>
              <span className="text-[12.5px] text-[#5B6B85]">{d.전화번호 !== "-" ? d.전화번호 : ""}</span>
              <span className="ml-auto text-[11.5px] font-black px-1.5 py-0.5 rounded bg-[#EEF3FC] text-[#1B2B4B]">{d.등급}</span>
            </button>
          ))}
          {!list.length && <div className="px-4 py-6 text-center text-[13.5px] font-bold text-[#5B6B85]">찾는 기사님이 없습니다</div>}
        </div>
      )}
    </div>
  );
}

export default function ContractStudio({ company = "", me = {} }) {
  const co = String(company || "").trim();
  const [tab, setTab] = React.useState("driver");
  const [sub, setSub] = React.useState("지입");
  const [freeKey, setFreeKey] = React.useState(FREE_TOPICS[0].key);
  const [vals, setVals] = React.useState({});
  const [clauses, setClauses] = React.useState([]);
  const [editId, setEditId] = React.useState(null);
  const [saved, setSaved] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const paperRef = React.useRef(null);
  const drivers = useFleetDrivers();
  const kind = tab === "box" ? null : tab;
  const subKey = kind === "driver" ? sub : kind === "free" ? freeKey : "";
  const spec = kind ? contractSpec(kind, subKey) : null;

  // 갑(우리 회사) 정보는 한 번 넣으면 기억
  const aKey = `kpContractA_${co}`;
  const loadA = () => { try { return JSON.parse(localStorage.getItem(aKey) || "{}"); } catch { return {}; } };
  const resetDoc = React.useCallback(() => {
    if (!spec) return;
    const a = loadA();
    const base = { 계약일: kstToday(), 시작일: kstToday() };
    // 거래처 계약서는 우리 회사가 "을(운송사)" 칸 → 갑상호 키를 그대로 운송사로 쓴다
    setVals({ ...base, 갑상호: a.갑상호 || co, 갑대표: a.갑대표 || "", 갑사업자번호: a.갑사업자번호 || "", 갑주소: a.갑주소 || "", 갑연락처: a.갑연락처 || "" });
    setClauses(spec.clauses.map((x) => ({ ...x })));
    setEditId(null);
  }, [tab, subKey]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { resetDoc(); }, [resetDoc]);
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(query(collection(db, "companyContracts"), where("companyName", "==", co)), (s) => setSaved(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))), () => setSaved([]));
  }, [co]);

  const set = (k, v) => setVals((p) => ({ ...p, [k]: v }));
  const setCl = (i, patch) => setClauses((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const moveCl = (i, d) => setClauses((p) => { const a = [...p]; const j = i + d; if (j < 0 || j >= a.length) return p; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const pickDriver = (id) => {
    const d = drivers.find((x) => x.id === id); if (!d) return;
    setVals((p) => ({ ...p, 을상호: d.사업자상호 || d.이름, 을대표: d.사업자상호 ? d.이름 : p.을대표, 을사업자번호: d.사업자번호 || p.을사업자번호, 을연락처: d.전화번호 !== "-" ? d.전화번호 : "", 차량번호: d.차량번호 !== "-" ? d.차량번호 : "", 차종: [d.차량톤수, d.차량종류].filter(Boolean).join(" ") }));
  };
  const title = spec ? (spec.title) : "";

  const fileBase = () => `${title}_${vals.을상호 || ""}_${vals.계약일 || ""}`.replace(/[\\/:*?"<>|]/g, "");
  const saveImage = () => savePng(paperRef.current, fileBase());
  const savePdfFile = () => savePdf(paperRef.current, fileBase());
  const print = () => printA4(paperRef.current, title);
  const missing = spec ? spec.fields.filter((f) => f.req && !String(vals[f.k] || "").trim()).map((f) => f.label) : [];
  const save = async () => {
    if (missing.length) return kpAlert(`필수 입력: ${missing.join(", ")}`);
    setBusy(true);
    try {
      try { localStorage.setItem(aKey, JSON.stringify({ 갑상호: vals.갑상호, 갑대표: vals.갑대표, 갑사업자번호: vals.갑사업자번호, 갑주소: vals.갑주소, 갑연락처: vals.갑연락처 })); } catch { /* 무시 */ }
      const data = { companyName: co, kind, sub: subKey, title, vals, clauses, party: vals.을상호 || "", contractDate: vals.계약일 || "", updatedAt: serverTimestamp(), by: me.name || "" };
      if (editId) await updateDoc(doc(db, "companyContracts", editId), data);
      else { const r = await addDoc(collection(db, "companyContracts"), { ...data, createdAt: serverTimestamp() }); setEditId(r.id); }
      kpAlert("보관함에 저장했습니다.");
    } catch (e) { kpAlert(`저장 실패: ${e?.message || e}`); } finally { setBusy(false); }
  };
  const openSaved = (d) => {
    setTab(d.kind); if (d.kind === "driver") setSub(d.sub); if (d.kind === "free") setFreeKey(d.sub);
    setTimeout(() => { setVals(d.vals || {}); setClauses(d.clauses || []); setEditId(d.id); }, 0);
  };
  const removeSaved = async (d) => { if (await kpConfirm(`「${d.title}」(${d.party || "-"})을 보관함에서 지울까요?`, { title: "계약서 삭제", okText: "삭제", danger: true })) await deleteDoc(doc(db, "companyContracts", d.id)); };

  const groups = [...new Set(FREE_TOPICS.map((t) => t.group))];
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[22px] px-7 py-5 text-white flex items-center justify-between gap-4 flex-wrap shadow-[0_14px_32px_rgba(15,26,48,0.25)]"
        style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div>
          <div className="text-[12px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>E-APPROVAL · CONTRACT</div>
          <div className="text-[24px] font-black mt-0.5">계약서</div>
          <div className="text-[14px] text-white/60 mt-0.5">유형을 고르면 조항이 자동으로 셋팅됩니다 · 모든 조항은 자유롭게 고칠 수 있어요 · 이미지·PDF 저장</div>
        </div>
        <div className="inline-flex p-1 rounded-2xl bg-white/10 border border-white/15 gap-1 flex-wrap">
          {[["driver", "운송계약서"], ["client", "거래처 운송계약서"], ["free", "자율양식 계약서"], ["box", `보관함 ${saved.length}`]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`h-10 px-4 rounded-xl text-[14px] font-black whitespace-nowrap ${tab === k ? "bg-white text-[#0F1A30]" : "text-white/80 hover:bg-white/10"}`}>{l}</button>
          ))}
        </div>
      </div>

      {tab === "box" ? (
        <div className={`${card} overflow-hidden`}>
          <div className="grid grid-cols-[60px_minmax(0,1.4fr)_minmax(0,1fr)_120px_130px_160px] gap-3 px-5 h-11 items-center bg-[#F3F6FA] border-b border-[#E3E8F0] text-[14px] font-black text-[#1B2B4B]">
            <span>번호</span><span>계약서</span><span>상대방</span><span>유형</span><span>계약일</span><span />
          </div>
          {saved.map((d, i) => (
            <div key={d.id} className="grid grid-cols-[60px_minmax(0,1.4fr)_minmax(0,1fr)_120px_130px_160px] gap-3 px-5 h-[56px] items-center border-b border-[#F1F4F9] hover:bg-[#F8FAFD]">
              <span className="text-[14px] font-bold text-[#5B6B85] tabular-nums" style={{ fontFamily: MONO }}>{saved.length - i}</span>
              <button type="button" onClick={() => openSaved(d)} className="text-left text-[15px] font-black text-[#0F1A30] truncate hover:underline">{d.title}</button>
              <span className="text-[14px] font-bold text-[#1B2B4B] truncate">{d.party || "-"}</span>
              <span className="text-[13px] font-black text-[#2D4C82]">{KIND_LABEL[d.kind]}{d.kind === "driver" ? `·${d.sub}` : ""}</span>
              <span className="text-[14px] text-[#3A4A66] tabular-nums" style={{ fontFamily: MONO }}>{d.contractDate || "-"}</span>
              <span className="flex gap-1.5 justify-end">
                <button type="button" onClick={() => openSaved(d)} className="h-9 px-3.5 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black">열기</button>
                <button type="button" onClick={() => removeSaved(d)} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[13px] font-bold text-[#5B6B85]">삭제</button>
              </span>
            </div>
          ))}
          {!saved.length && <div className="py-20 text-center text-[15px] font-bold text-[#7A879C]">저장한 계약서가 없습니다</div>}
        </div>
      ) : spec && (
        <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(460px, 560px) minmax(0,1fr)" }}>
          <div className="space-y-4 min-w-0">
            <div className={`${card} p-5 space-y-3.5`}>
              {tab === "driver" && (
                <>
                  <div>
                    <span className={lab}>계약 형태</span>
                    <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#EEF2F8]">
                      {Object.keys(DRIVER_KINDS).map((k) => <button key={k} type="button" onClick={() => setSub(k)} className={`h-11 rounded-lg text-[15px] font-black ${sub === k ? "bg-[#0F1A30] text-white shadow" : "text-[#3A4A66]"}`}>{k}</button>)}
                    </div>
                  </div>
                  <div>
                    <span className={lab}>기사님 불러오기 <span className="font-semibold text-[#7A879C]">(지입·직영·임대 등록 기사님)</span></span>
                    <DriverSearch drivers={drivers} onPick={pickDriver} />
                  </div>
                </>
              )}
              {tab === "free" && (
                <div>
                  <span className={lab}>계약서 주제</span>
                  <CustomSelect value={freeKey} onChange={(e) => setFreeKey(e.target.value)} className={inp}>
                    {groups.map((g) => <optgroup key={g} label={g}>{FREE_TOPICS.filter((t) => t.group === g).map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}</optgroup>)}
                  </CustomSelect>
                </div>
              )}
              <div className="text-[16px] font-black text-[#0F1A30] pt-1">{title}</div>
              <div className="grid grid-cols-2 gap-x-2.5 gap-y-3">
                {spec.fields.map((f) => (
                  <label key={f.k} className={`block min-w-0 ${f.half ? "" : "col-span-2"}`}>
                    <span className={lab}>{f.label}{f.req && <span className="text-[#2D4C82]"> *</span>}</span>
                    {f.type === "date" ? <CustomDatePicker value={vals[f.k] || ""} onChange={(e) => set(f.k, e.target.value)} className={inp} showIcon placeholder="날짜 선택" />
                      : f.type === "money" ? <input inputMode="numeric" value={vals[f.k] ? toInt(vals[f.k]).toLocaleString() : ""} onChange={(e) => set(f.k, e.target.value.replace(/[^\d]/g, ""))} placeholder="0" className={`${inp} text-right tabular-nums`} />
                        : f.type === "textarea" ? <textarea value={vals[f.k] || ""} onChange={(e) => set(f.k, e.target.value)} rows={3} placeholder={f.ph || "없음"} className={`${inp} h-auto py-2.5 leading-relaxed`} />
                          : <input value={vals[f.k] || ""} onChange={(e) => set(f.k, e.target.value)} placeholder={f.ph || ""} className={inp} />}
                  </label>
                ))}
              </div>
            </div>
            <div className={`${card} p-5`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="text-[16px] font-black text-[#0F1A30]">조항 <span className="text-[13px] font-bold text-[#7A879C]">{clauses.length}개 · {"{{항목}}"} 은 위 입력값으로 바뀝니다</span></div>
                <button type="button" onClick={async () => { if (await kpConfirm("조항을 양식 처음 상태로 되돌릴까요?")) setClauses(spec.clauses.map((x) => ({ ...x }))); }} className="ml-auto h-9 px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-bold text-[#3A4A66]">양식으로 되돌리기</button>
              </div>
              <div className="space-y-2.5">
                {clauses.map((cl, i) => (
                  <div key={i} className="rounded-xl border border-[#E3E8F0] bg-[#F8FAFD] p-3">
                    <div className="flex gap-1.5 mb-1.5">
                      <input value={cl.title} onChange={(e) => setCl(i, { title: e.target.value })} placeholder="조항 제목" className={`${inp} !h-10 font-black`} />
                      <button type="button" onClick={() => moveCl(i, -1)} disabled={i === 0} className="w-10 h-10 shrink-0 rounded-lg border border-[#DCE3EE] bg-white disabled:opacity-30" aria-label="위로">↑</button>
                      <button type="button" onClick={() => moveCl(i, 1)} disabled={i === clauses.length - 1} className="w-10 h-10 shrink-0 rounded-lg border border-[#DCE3EE] bg-white disabled:opacity-30" aria-label="아래로">↓</button>
                      <button type="button" onClick={() => setClauses((p) => p.filter((_, j) => j !== i))} className="w-10 h-10 shrink-0 rounded-lg text-[#7A879C] hover:bg-white" aria-label="조항 삭제">✕</button>
                    </div>
                    <textarea value={cl.body} onChange={(e) => setCl(i, { body: e.target.value })} rows={Math.min(8, Math.max(3, Math.ceil(String(cl.body).length / 48)))} className={`${inp} h-auto py-2.5 leading-relaxed text-[14px]`} />
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setClauses((p) => [...p, { title: `제${p.length + 1}조 ( )`, body: "" }])} className="mt-2.5 w-full h-11 rounded-xl border-2 border-dashed border-[#C9D2E0] text-[14px] font-black text-[#5B6B85] hover:bg-[#F7F9FC]">+ 조항 추가</button>
            </div>
            <div className="text-[12.5px] text-[#5B6B85] leading-relaxed px-1">※ 양식은 일반적인 기준으로 만든 초안입니다. 금액이 크거나 분쟁 가능성이 있는 계약은 전문가(노무사·변호사) 검토를 권장합니다.</div>
          </div>
          <div className="min-w-0">
            <div className="sticky top-3 space-y-3">
              <div className={`${card} p-3 flex items-center gap-2 flex-wrap`}>
                <span className="text-[12px] font-extrabold tracking-[0.2em] text-[#2D4C82] px-1" style={{ fontFamily: MONO }}>LIVE PREVIEW</span>
                {editId && <span className="text-[12.5px] font-black px-2 py-1 rounded-md bg-[#EEF3FC] text-[#1B2B4B]">보관함 문서 수정 중</span>}
                <div className="ml-auto flex gap-1.5 flex-wrap">
                  <button type="button" onClick={resetDoc} className="h-10 px-3.5 rounded-xl border border-[#DCE3EE] text-[13.5px] font-bold text-[#3A4A66]">새로 쓰기</button>
                  <button type="button" onClick={print} className="h-10 px-3.5 rounded-xl border border-[#DCE3EE] text-[13.5px] font-black text-[#1B2B4B]">인쇄</button>
                  <button type="button" onClick={saveImage} className="h-10 px-3.5 rounded-xl border border-[#DCE3EE] text-[13.5px] font-black text-[#1B2B4B]">이미지 저장</button>
                  <button type="button" onClick={savePdfFile} className="h-10 px-3.5 rounded-xl border border-[#DCE3EE] text-[13.5px] font-black text-[#1B2B4B]">PDF 저장</button>
                  <button type="button" onClick={save} disabled={busy} className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black disabled:opacity-50">{busy ? "저장 중…" : "보관함 저장"}</button>
                </div>
              </div>
              <div className="relative rounded-2xl bg-[#E9EDF3] p-4 overflow-auto max-h-[calc(100vh-180px)]">
                <div className="mx-auto [&_.kp-a4page]:shadow-[0_10px_30px_rgba(15,26,48,.18)]" style={{ width: 794 }}>
                  <ContractPaper title={title} spec={spec} vals={vals} clauses={clauses} paperRef={paperRef} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
