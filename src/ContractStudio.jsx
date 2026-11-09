// ======================= src/ContractStudio.jsx =======================
// 📜 홈 › 전자결재 › 계약서 — 운송계약서(지입·직영·임대) · 거래처 운송계약서 · 자율양식 계약서
//  왼쪽: 유형 고르기 → 입력칸 → 조항(자동 셋팅, 자유롭게 수정·추가·삭제) / 오른쪽: A4 미리보기
//  저장하면 보관함(companyContracts)에 남고, 이미지·PDF로 내려받거나 인쇄한다.
import React from "react";
import { focusField, alertAndFocus } from "./focusField"; // ⭐ 2026-11-10 필수 입력 칸으로 이동
import { runDelete } from "./DeleteProgress"; // ⭐ 2026-11-05 삭제 진행 창 + 한 번에 삭제
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import { kpAlert, kpConfirm } from "./kpDialog";
import CustomSelect from "./CustomSelect";
import CustomDatePicker from "./CustomDatePicker";
import { DRIVER_KINDS, LABOR_KINDS, FREE_TOPICS, contractSpec, fillVars } from "./contractTemplates";
import { useFleetDrivers } from "./FleetPayDocs";
import { savePng, savePdf, printA4 } from "./a4Export";
import { fmtBizNo, fmtPhone } from "./formatInput";
import { useCompanyRegInfo } from "./companyRegInfo";
import { useCompanyBiz, printInfoForBiz, BizPicker } from "./companyBiz";
import { ComboInput, TimeRangeInput, PickList, useStaffPeople, staffDetail, useClientRows } from "./contractInputs"; // ⭐ 2026-11-10 드롭다운·검색
import { DriverContractSendBar, DriverContractStatus } from "./contractSend"; // ⭐ 2026-11-10 기사앱으로 여러 명 발송

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const card = "rounded-[18px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_20px_rgba(16,24,40,0.05)]";
const inp = "h-11 w-full px-3 rounded-xl border border-[#D3DBE8] bg-white text-[14.5px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15";
const lab = "block text-[13px] font-black text-[#3A4A66] mb-1.5";
const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const korDate = (d) => (d ? `${d.slice(0, 4)}년 ${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일` : "");
// 우리 회사 칸(갑 키) ← 등록 정보 필드
const A_KEYS = [["갑상호", "name"], ["갑대표", "ceo"], ["갑사업자번호", "bizNo"], ["갑주소", "addr"], ["갑연락처", "phone"]];
const KIND_LABEL = { driver: "운송계약서", labor: "근로계약서", client: "거래처 운송계약서", free: "자율양식 계약서" };

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
export function ContractPaper({ title, spec, vals, clauses, paperRef, signs = {} }) {
  const dv = displayVals(spec, vals);
  const isClient = spec === contractSpec("client");
  const isLabor = Object.values(LABOR_KINDS).includes(spec);
  if (isLabor) {
    var leftL = { role: "사업주 (갑)", name: vals.갑상호, ceo: vals.갑대표, biz: vals.갑사업자번호, addr: vals.갑주소, tel: vals.갑연락처 }; // eslint-disable-line no-var
    var rightL = { role: "근로자 (을)", name: vals.을상호, ceo: "", biz: vals.을사업자번호, addr: vals.을주소, tel: vals.을연락처, birth: true }; // eslint-disable-line no-var
  }
  const left0 = isClient ? { role: "갑 (화주)", name: vals.을상호, ceo: vals.을대표, biz: vals.을사업자번호, addr: vals.을주소 } : { role: "갑", name: vals.갑상호, ceo: vals.갑대표, biz: vals.갑사업자번호, addr: vals.갑주소, tel: vals.갑연락처 };
  const right0 = isClient ? { role: "을 (운송사)", name: vals.갑상호, ceo: vals.갑대표, biz: vals.갑사업자번호, addr: vals.갑주소, tel: vals.갑연락처 } : { role: "을", name: vals.을상호, ceo: vals.을대표, biz: vals.을사업자번호, addr: vals.을주소, tel: vals.을연락처 };
  const left = isLabor ? leftL : left0; const right = isLabor ? rightL : right0;
  const blocks = [
    <div key="h" style={{ textAlign: "center", borderBottom: "3px double #0F1A30", paddingBottom: 18, marginBottom: 24 }}>
      <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 10.5, letterSpacing: "0.3em", color: "#2D4C82", fontWeight: 800 }}>CONTRACT</div>
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
      {[left, right].map((p, i) => { const sg = i === 0 ? signs.left : signs.right; return (
        <div key={i} style={{ border: "1.5px solid #0F1A30", borderRadius: 4, padding: "14px 16px", fontSize: 13.5, lineHeight: 1.9, color: "#0B1428" }}>
          <div style={{ fontWeight: 900, fontSize: 14.5, borderBottom: "1px solid #DCE3EE", paddingBottom: 6, marginBottom: 6 }}>{p.role}</div>
          <div>상호·성명 : <b>{p.name || ""}</b></div>
          {!p.birth && <div>대 표 자 : {p.ceo || ""}</div>}
          <div>{p.birth ? "생년월일" : "사업자번호"} : {p.biz || ""}</div>
          <div style={{ overflowWrap: "anywhere" }}>주 소 : {p.addr || ""}</div>
          {p.tel !== undefined && <div>연 락 처 : {p.tel || ""}</div>}
          <div style={{ textAlign: "right", marginTop: 10, fontWeight: 800 }}>(서명 또는 인) {sg
            ? <img src={sg} alt="서명" style={{ display: "inline-block", maxWidth: 120, height: 52, objectFit: "contain", verticalAlign: "middle", marginLeft: 6 }} />
            : <span style={{ display: "inline-block", width: 44, height: 44, border: "1px dashed #7A879C", borderRadius: "50%", verticalAlign: "middle", marginLeft: 6 }} />}</div>
        </div>
      ); })}
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
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 26, textAlign: "center", fontSize: 12, color: "#5B6B85", fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>- {pi + 1} / {pages.length} -</div>
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
  const [laborSub, setLaborSub] = React.useState("정규직");
  const [tplName, setTplName] = React.useState(null); // 내 양식 이름 입력 중
  const [freeKey, setFreeKey] = React.useState(FREE_TOPICS[0].key);
  const [vals, setVals] = React.useState({});
  const [clauses, setClauses] = React.useState([]);
  const [editId, setEditId] = React.useState(null);
  const [saved, setSaved] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const paperRef = React.useRef(null);
  const drivers = useFleetDrivers();
  const staff = useStaffPeople(co); // ⭐ 2026-11-10 근로계약서 — 사내 직원 검색
  const clientRows = useClientRows(co); // ⭐ 2026-11-10 거래처 계약서 — 기본거래처 검색
  const [picked, setPicked] = React.useState([]); // ⭐ 2026-11-10 운송계약서 — 여러 기사님 선택(발송 대상)
  const [activeId, setActiveId] = React.useState(""); // 미리보기에 보이는 기사님
  const kind = tab === "box" ? null : tab;
  const subKey = kind === "driver" ? sub : kind === "labor" ? laborSub : kind === "free" ? freeKey : "";
  const spec = kind ? contractSpec(kind, subKey) : null;

  // ⭐ 2026-11-04 갑(우리 회사) 정보 — 회사관리 › 회사정보(transportApplications)에 등록된 대표자·상호·사업자번호·주소·연락처를
  //    계약서를 새로 만들 때 / 보관함 문서를 열었는데 칸이 비어 있을 때 자동으로 채운다(사용자가 직접 입력한 값은 절대 덮지 않음).
  //    추가 사업자가 있으면 [계약 사업자]로 고른 사업자의 정보(companySettings.bizList)로 채운다.
  //    등록 정보가 없는 칸만 예전처럼 마지막으로 쓴 값(브라우저 기억)으로 채운다.
  const info = useCompanyRegInfo(co);
  const biz = useCompanyBiz(co);
  const bizName = String(vals.계약사업자 || "").trim();
  const companyA = React.useMemo(() => {
    const base = { name: co, ceo: "", bizNo: "", addr: "", phone: "", fax: "", email: "", ...(info || {}) };
    if (!base.name) base.name = co;
    const b = bizName && bizName !== co ? biz.find(bizName) : null;
    return b ? printInfoForBiz(base, b) : base;
  }, [info, biz, bizName, co]);
  const aRef = React.useRef(companyA); aRef.current = companyA;
  const autoKeys = React.useRef(new Set()); // 자동으로 채운 칸(사용자가 고치면 빠진다) — 등록 정보가 늦게 오면 이 칸만 갱신
  const forceA = React.useRef(false); // 계약 사업자를 바꿨을 때는 갑 칸 전체를 그 사업자 정보로
  const aKey = `kpContractA_${co}`;
  const loadA = () => { try { return JSON.parse(localStorage.getItem(aKey) || "{}"); } catch { return {}; } };
  const fillA = (p, force = false) => {
    const A = aRef.current; const mem = loadA(); const out = { ...p };
    A_KEYS.forEach(([k, f]) => {
      const raw = String(A[f] || "").trim();
      const reg = raw && k === "갑사업자번호" ? fmtBizNo(raw) : raw && k === "갑연락처" ? fmtPhone(raw) : raw;
      const empty = !String(out[k] || "").trim();
      if (force) { out[k] = reg; autoKeys.current.add(k); return; }
      if (!empty && !autoKeys.current.has(k)) return; // 사용자가 입력한 값 — 그대로
      const next = reg || (empty ? String(mem[k] || "").trim() : out[k]) || (k === "갑상호" ? co : "");
      if (next) { out[k] = next; autoKeys.current.add(k); }
    });
    return out;
  };
  const resetDoc = React.useCallback(() => {
    if (!spec) return;
    const base = { 계약일: kstToday(), 시작일: kstToday() };
    // 거래처 계약서는 우리 회사가 "을(운송사)" 칸 → 갑상호 키를 그대로 운송사로 쓴다
    autoKeys.current = new Set();
    setVals(fillA(base));
    setClauses(spec.clauses.map((x) => ({ ...x })));
    setEditId(null);
  }, [tab, subKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // 등록 정보가 늦게 도착하거나 계약 사업자를 바꾸면 → 자동으로 채운 칸·빈 칸만 다시 채움
  React.useEffect(() => {
    const force = forceA.current; forceA.current = false;
    setVals((p) => fillA(p, force));
  }, [companyA]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { resetDoc(); }, [resetDoc]);
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(query(collection(db, "companyContracts"), where("companyName", "==", co)), (s) => setSaved(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))), () => setSaved([]));
  }, [co]);

  const set = (k, v) => { autoKeys.current.delete(k); setVals((p) => ({ ...p, [k]: v })); };
  const pickBiz = (n) => {
    if (String(n || "").trim() === bizName) return;
    forceA.current = true; setVals((p) => ({ ...p, 계약사업자: n }));
  };
  const setCl = (i, patch) => setClauses((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const moveCl = (i, d) => setClauses((p) => { const a = [...p]; const j = i + d; if (j < 0 || j >= a.length) return p; [a[i], a[j]] = [a[j], a[i]]; return a; });
  // 기사님 한 명의 정보 → 계약서 칸(을)
  const driverPatch = (d) => ({ 을상호: d.사업자상호 || d.이름, 을대표: d.사업자상호 ? d.이름 : "", 을사업자번호: d.사업자번호 || "", 을주소: "", 을연락처: d.전화번호 !== "-" ? d.전화번호 : "", 차량번호: d.차량번호 !== "-" ? d.차량번호 : "", 차종: [d.차량톤수, d.차량종류].filter(Boolean).join(" ") });
  const pickDriver = (id) => {
    const d = drivers.find((x) => x.id === id); if (!d) return;
    setActiveId(id);
    setVals((p) => ({ ...p, ...driverPatch(d), 을대표: d.사업자상호 ? d.이름 : p.을대표, 을사업자번호: d.사업자번호 || p.을사업자번호, 을주소: p.을주소 || "" }));
  };
  const togglePick = (id) => setPicked((p) => {
    const next = p.includes(id) ? p.filter((x) => x !== id) : [...p, id];
    if (!p.includes(id) && (!activeId || !p.includes(activeId))) pickDriver(id); // 처음 고른 기사님을 미리보기로
    if (p.includes(id) && activeId === id && next[0]) pickDriver(next[0]);
    return next;
  });
  const toggleAll = (ids) => setPicked((p) => { const all = ids.every((x) => p.includes(x)); const next = all ? p.filter((x) => !ids.includes(x)) : [...new Set([...p, ...ids])]; if (!all && !activeId && next[0]) pickDriver(next[0]); return next; });
  const pickedDrivers = picked.map((id) => drivers.find((d) => d.id === id)).filter(Boolean);
  // 발송용 — 기사님마다 공통 입력값 + 그 기사님 정보(미리보기 중인 기사님은 화면에서 고친 값 그대로)
  const valsFor = (d) => (d.id === activeId ? { ...vals } : { ...vals, ...driverPatch(d) });
  const missingFor = (v) => (spec ? spec.fields.filter((f) => f.req && !String(v[f.k] || "").trim()).map((f) => f.label) : []);
  // 👥 근로계약서 — 사내 직원을 고르면 가입·수정된 인사 정보를 그대로 채운다
  const pickStaff = async (id) => {
    const u = staff.find((x) => x.id === id); if (!u) return;
    const d = await staffDetail(u);
    setVals((p) => ({
      ...p, 을상호: d.name, 을사업자번호: d.birth || p.을사업자번호 || "", 을주소: d.addr || p.을주소 || "", 을연락처: d.phone ? fmtPhone(d.phone) : p.을연락처 || "",
      ...(d.hireDate ? { 시작일: d.hireDate } : {}),
      ...(d.team || d.position ? { 업무: p.업무 || [d.team, d.position].filter(Boolean).join(" · ") } : {}),
      ...(d.workStart && d.workEnd ? { 근로시간: `${d.workStart} ~ ${d.workEnd}` } : {}),
    }));
  };
  // 🏢 거래처 계약서 — 기본거래처를 고르면 상호·대표자·사업자번호·주소를 채운다
  const clientPatch = (c) => ({ 을상호: c.거래처명, 을대표: c.대표자 || "", 을사업자번호: c.사업자번호 ? fmtBizNo(c.사업자번호) : "", 을주소: c.주소 || "", ...(c.연락처 ? { 을연락처: fmtPhone(c.연락처) } : {}) });
  const pickClient = (id) => { const c = clientRows.find((x) => x.id === id); if (c) setVals((p) => ({ ...p, ...clientPatch(c) })); };
  // 📄 자율양식 — 상대방(을)을 거래처 · 직원 · 기사님 중에서
  const partyRows = [
    ...clientRows.map((c) => ({ id: `c:${c.id}`, title: c.거래처명, sub: [c.대표자, c.사업자번호].filter(Boolean).join(" · "), badge: "거래처" })),
    ...staff.map((u) => ({ id: `s:${u.id}`, title: u.name, sub: [u.team, u.position].filter(Boolean).join(" · "), badge: "직원" })),
    ...drivers.map((d) => ({ id: `d:${d.id}`, title: d.이름, sub: d.차량번호 !== "-" ? d.차량번호 : "", badge: "기사" })),
  ];
  const pickParty = (key) => {
    const [t, id] = [key.slice(0, 1), key.slice(2)];
    if (t === "c") return pickClient(id);
    if (t === "s") return pickStaff(id);
    const d = drivers.find((x) => x.id === id); if (d) setVals((p) => ({ ...p, ...driverPatch(d) }));
    return undefined;
  };
  const title = spec ? (spec.title) : "";

  const fileBase = () => `${title}_${vals.을상호 || ""}_${vals.계약일 || ""}`.replace(/[\\/:*?"<>|]/g, "");
  const saveImage = () => savePng(paperRef.current, fileBase());
  const savePdfFile = () => savePdf(paperRef.current, fileBase());
  const print = () => printA4(paperRef.current, title);
  const missing = spec ? spec.fields.filter((f) => f.req && !String(vals[f.k] || "").trim()).map((f) => f.label) : [];
  const save = async () => {
    if (missing.length) return alertAndFocus(kpAlert, `필수 입력이 비어 있습니다.\n· ${missing.join(", ")}\n\n[확인]을 누르면 그 칸으로 이동합니다.`, { label: missing[0] }); // ⭐ 2026-11-10 빈 칸으로 이동·표시
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
    setTab(d.kind); if (d.kind === "driver") setSub(d.sub); if (d.kind === "labor") setLaborSub(d.sub); if (d.kind === "free") setFreeKey(d.sub);
    setTimeout(() => { autoKeys.current = new Set(); setVals(fillA(d.vals || {})); setClauses(d.clauses || []); setEditId(d.id); }, 0);
  };
  const removeSaved = async (d) => { if (await kpConfirm(`「${d.title}」(${d.party || "-"})을 보관함에서 지울까요?`, { title: "계약서 삭제", okText: "삭제", danger: true })) await runDelete({ label: "계약서", task: () => deleteDoc(doc(db, "companyContracts", d.id)) }); }; // ⭐ 2026-11-05 삭제 진행 창

  const groups = [...new Set(FREE_TOPICS.map((t) => t.group))];
  // 📁 내 양식 — 고친 조항·기본값을 이름 붙여 저장해 두고 다음에 그대로 불러 쓴다
  const docs = saved.filter((d) => !d.template);
  const myTpls = saved.filter((d) => d.template && d.kind === kind && d.sub === subKey);
  const saveTpl = async () => {
    const name = String(tplName || "").trim();
    if (!name) return kpAlert("양식 이름을 입력해 주세요.");
    const defaults = {}; Object.entries(vals).forEach(([k, v]) => { if (!k.startsWith("을") && !["계약일", "시작일", "종료일"].includes(k)) defaults[k] = v; });
    try {
      const same = myTpls.find((t) => t.templateName === name);
      const data = { companyName: co, template: true, templateName: name, kind, sub: subKey, title, clauses, defaults, updatedAt: serverTimestamp(), by: me.name || "" };
      if (same) await updateDoc(doc(db, "companyContracts", same.id), data); else await addDoc(collection(db, "companyContracts"), { ...data, createdAt: serverTimestamp() });
      setTplName(null); kpAlert(`「${name}」 양식으로 저장했습니다.\n다음부터 [양식]에서 고르면 그대로 불러옵니다.`);
    } catch (e) { kpAlert(`저장 실패: ${e?.message || e}`); }
  };
  const loadTpl = (id) => {
    if (id === "__base") { setClauses(spec.clauses.map((x) => ({ ...x }))); return; }
    const t = myTpls.find((x) => x.id === id); if (!t) return;
    setClauses((t.clauses || []).map((x) => ({ ...x }))); setVals((p) => ({ ...p, ...(t.defaults || {}) }));
  };
  const removeTpl = async (t) => { if (await kpConfirm(`내 양식 「${t.templateName}」을 지울까요?`, { title: "양식 삭제", okText: "삭제", danger: true })) await runDelete({ label: "양식", task: () => deleteDoc(doc(db, "companyContracts", t.id)) }); }; // ⭐ 2026-11-05 삭제 진행 창
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[22px] px-7 py-5 text-white flex items-center justify-between gap-4 flex-wrap shadow-[0_14px_32px_rgba(15,26,48,0.25)]"
        style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div>
          <div className="text-[12px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>E-APPROVAL · CONTRACT</div>
          <div className="text-[24px] font-black mt-0.5">계약서</div>
          <div className="text-[14px] text-white/60 mt-0.5">유형을 고르면 조항이 자동으로 셋팅됩니다 · 모든 조항은 자유롭게 고칠 수 있어요 · 이미지·PDF 저장</div>
        </div>
      </div>

      {/* ⭐ 2026-10-31 계약서 종류 — 오른쪽 끝 버튼 대신 왼쪽 입력칸 맨 위에 드롭다운으로(시야에 바로 들어오게) */}
      <div className="w-full max-w-[560px]">
        <label className="block">
          <span className="block text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7] mb-1.5" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>CONTRACT TYPE · 계약서 종류</span>
          <span className="relative block">
            <CustomSelect value={tab} onChange={(e) => setTab(e.target.value)}
              className="appearance-none w-full h-[52px] pl-12 pr-8 rounded-2xl border-2 border-[#1B2B4B] bg-white text-[16px] font-black text-[#0F1A30] outline-none shadow-[0_6px_18px_rgba(15,26,48,0.10)] focus:ring-4 focus:ring-[#2D4C82]/15 cursor-pointer">
              {[["driver", "운송계약서 (지입·직영·임대)"], ["labor", "근로계약서"], ["client", "거래처 운송계약서"], ["free", "자율양식 계약서"], ["box", `계약서 보관함 · ${docs.length}건`]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </CustomSelect>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-[#0F1A30] text-white grid place-items-center text-[14px]">{tab === "box" ? "▤" : "✎"}</span>
          </span>
        </label>
      </div>

      {tab === "box" ? (
        <div className={`${card} overflow-hidden`}>
          <div className="grid grid-cols-[60px_minmax(0,1.4fr)_minmax(0,1fr)_120px_130px_160px] gap-3 px-5 h-11 items-center bg-[#F3F6FA] border-b border-[#E3E8F0] text-[14px] font-black text-[#1B2B4B]">
            <span>번호</span><span>계약서</span><span>상대방</span><span>유형</span><span>계약일</span><span />
          </div>
          {docs.map((d, i) => (
            <div key={d.id} className="grid grid-cols-[60px_minmax(0,1.4fr)_minmax(0,1fr)_120px_130px_160px] gap-3 px-5 h-[56px] items-center border-b border-[#F1F4F9] hover:bg-[#F8FAFD]">
              <span className="text-[14px] font-bold text-[#5B6B85] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{docs.length - i}</span>
              <button type="button" onClick={() => openSaved(d)} className="text-left text-[15px] font-black text-[#0F1A30] truncate hover:underline">{d.title}</button>
              <span className="text-[14px] font-bold text-[#1B2B4B] truncate">{d.party || "-"}</span>
              <span className="text-[13px] font-black text-[#2D4C82]">{KIND_LABEL[d.kind]}{d.kind === "driver" || d.kind === "labor" ? `·${d.sub}` : ""}</span>
              <span className="text-[14px] text-[#3A4A66] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{d.contractDate || "-"}</span>
              <span className="flex gap-1.5 justify-end">
                <button type="button" onClick={() => openSaved(d)} className="h-9 px-3.5 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black">열기</button>
                <button type="button" onClick={() => removeSaved(d)} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[13px] font-bold text-[#5B6B85]">삭제</button>
              </span>
            </div>
          ))}
          {!docs.length && <div className="py-20 text-center text-[15px] font-bold text-[#7A879C]">저장한 계약서가 없습니다</div>}
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
                    <span className={lab}>기사님 불러오기 <span className="font-semibold text-[#7A879C]">(여러 명 체크 → 기사님마다 각자 정보로 발송)</span></span>
                    <PickList multi rows={drivers.map((d) => ({ id: d.id, title: d.이름, sub: [d.차량번호 !== "-" ? d.차량번호 : "", d.전화번호 !== "-" ? d.전화번호 : ""].filter(Boolean).join(" · "), badge: `${d.등급}${d.appUid ? "" : " · 앱 미가입"}`, search: `${d.이름}${d.차량번호}${d.전화번호}${d.사업자상호 || ""}` }))}
                      selected={picked} onToggle={togglePick} onToggleAll={toggleAll} placeholder="이름 · 차량번호 · 전화번호로 검색" empty="찾는 기사님이 없습니다" />
                    {pickedDrivers.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {pickedDrivers.map((d) => (
                          <span key={d.id} className={`h-8 pl-2.5 pr-1 rounded-lg border text-[12.5px] font-black inline-flex items-center gap-1 ${d.id === activeId ? "bg-[#0F1A30] border-[#0F1A30] text-white" : "bg-white border-[#DCE3EE] text-[#1B2B4B]"}`}>
                            <button type="button" onClick={() => pickDriver(d.id)} title="이 기사님 정보로 미리보기">{d.이름}{!d.appUid && <span className="ml-1 opacity-60">(앱 미가입)</span>}</button>
                            <button type="button" onClick={() => togglePick(d.id)} className="w-6 h-6 rounded-md opacity-70 hover:opacity-100" aria-label={`${d.이름} 빼기`}>✕</button>
                          </span>
                        ))}
                        <button type="button" onClick={() => { setPicked([]); setActiveId(""); }} className="h-8 px-2.5 rounded-lg text-[12.5px] font-bold text-[#5B6B85] hover:bg-[#F3F5F9]">모두 빼기</button>
                      </div>
                    )}
                    <div className="text-[12px] text-[#5B6B85] mt-1.5">이름을 누르면 그 기사님 정보로 미리보기가 바뀝니다 · 공통 조건(관리비·정산일 등)은 한 번만 입력하면 모두에게 같이 들어갑니다</div>
                  </div>
                </>
              )}
              {tab === "labor" && (
                <div>
                  <span className={lab}>고용 형태</span>
                  <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#EEF2F8]">
                    {Object.keys(LABOR_KINDS).map((k) => <button key={k} type="button" onClick={() => setLaborSub(k)} className={`h-11 rounded-lg text-[15px] font-black ${laborSub === k ? "bg-[#0F1A30] text-white shadow" : "text-[#3A4A66]"}`}>{k === "단시간" ? "단시간(알바)" : k}</button>)}
                  </div>
                </div>
              )}
              {tab === "labor" && (
                <div>
                  <span className={lab}>근로자 불러오기 <span className="font-semibold text-[#7A879C]">(사내 가입 직원 · 가입·수정한 인사 정보 그대로)</span></span>
                  <PickList rows={staff.map((u) => ({ id: u.id, title: u.name, sub: [u.team, u.position, u.phone].filter(Boolean).join(" · "), search: `${u.name}${u.team || ""}${u.position || ""}${u.phone || ""}${u.email || ""}` }))}
                    onPick={pickStaff} placeholder="이름 · 부서 · 직책 · 전화로 검색" empty="찾는 직원이 없습니다 — 아래 칸에 직접 입력해도 됩니다" />
                </div>
              )}
              {tab === "client" && (
                <div>
                  <span className={lab}>거래처 불러오기 <span className="font-semibold text-[#7A879C]">(거래처관리 › 기본거래처)</span></span>
                  <PickList rows={clientRows.map((c) => ({ id: c.id, title: c.거래처명, sub: [c.대표자, c.사업자번호].filter(Boolean).join(" · "), search: `${c.거래처명}${c.대표자 || ""}${c.사업자번호 || ""}` }))}
                    onPick={pickClient} placeholder="거래처명 · 대표자 · 사업자번호로 검색" empty="찾는 거래처가 없습니다 — 아래 칸에 직접 입력해도 됩니다" />
                </div>
              )}
              <div className="rounded-xl border border-[#DCE3EE] bg-[#F8FAFD] p-3">
                <span className={lab}>양식 <span className="font-semibold text-[#5B6B85]">기본 양식 또는 저장해 둔 내 양식</span></span>
                <div className="flex gap-1.5">
                  <div className="flex-1 min-w-0">
                    <CustomSelect value="" onChange={(e) => loadTpl(e.target.value)} className={inp}>
                      <option value="">{myTpls.length ? `내 양식 ${myTpls.length}개 · 골라서 불러오기` : "저장한 내 양식이 없습니다"}</option>
                      <option value="__base">기본 양식(처음 상태)</option>
                      {myTpls.map((t) => <option key={t.id} value={t.id}>▤ {t.templateName}</option>)}
                    </CustomSelect>
                  </div>
                  <button type="button" onClick={() => setTplName(tplName === null ? "" : null)} className="h-11 px-3.5 shrink-0 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black whitespace-nowrap">내 양식으로 저장</button>
                </div>
                {tplName !== null && (
                  <div className="flex gap-1.5 mt-2">
                    <input autoFocus value={tplName} onChange={(e) => setTplName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveTpl(); }} placeholder="예: 배차팀 정규직 기본" className={inp} />
                    <button type="button" onClick={saveTpl} className="h-11 px-4 shrink-0 rounded-xl bg-[#2D4C82] text-white text-[13.5px] font-black">저장</button>
                  </div>
                )}
                {myTpls.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {myTpls.map((t) => <span key={t.id} className="h-8 pl-2.5 pr-1 rounded-lg bg-white border border-[#DCE3EE] text-[12.5px] font-bold text-[#1B2B4B] inline-flex items-center gap-1">▤ {t.templateName}<button type="button" onClick={() => removeTpl(t)} className="w-6 h-6 rounded text-[#7A879C] hover:bg-[#F3F6FA]" aria-label="양식 삭제">✕</button></span>)}
                  </div>
                )}
                <div className="text-[12px] text-[#5B6B85] mt-1.5">조항을 고치거나 추가한 뒤 저장하면 다음부터 그 양식으로 바로 시작할 수 있어요(회사 공용)</div>
              </div>
              {tab === "free" && (
                <div>
                  <span className={lab}>계약서 주제</span>
                  <CustomSelect value={freeKey} onChange={(e) => setFreeKey(e.target.value)} className={inp}>
                    {groups.map((g) => <optgroup key={g} label={g}>{FREE_TOPICS.filter((t) => t.group === g).map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}</optgroup>)}
                  </CustomSelect>
                </div>
              )}
              {tab === "free" && (
                <div>
                  <span className={lab}>상대방(을) 불러오기 <span className="font-semibold text-[#7A879C]">(거래처 · 직원 · 기사님)</span></span>
                  <PickList rows={partyRows} onPick={pickParty} placeholder="이름 · 상호로 검색" empty="찾는 상대방이 없습니다 — 아래 칸에 직접 입력해도 됩니다" />
                </div>
              )}
              <div className="text-[16px] font-black text-[#0F1A30] pt-1">{title}</div>
              {biz.multi && (
                <div className="rounded-xl border border-[#DCE3EE] bg-[#F8FAFD] p-3">
                  <BizPicker biz={biz} value={vals.계약사업자 || ""} onChange={pickBiz} label="계약 사업자" />
                  <div className="text-[12px] text-[#5B6B85] mt-1.5">고른 사업자의 등록 정보(상호·대표자·사업자번호·주소·연락처)로 우리 회사 칸이 채워집니다</div>
                </div>
              )}
              {info && <div className="text-[12px] font-bold text-[#5B6B85] -mt-1">우리 회사 칸은 회사정보에 등록된 값으로 자동 입력됩니다 · 고쳐 쓸 수 있어요</div>}
              <div className="grid grid-cols-2 gap-x-2.5 gap-y-3">
                {spec.fields.map((f) => (
                  <label key={f.k} data-req-key={f.k} data-req-label={f.label} className={`block min-w-0 ${f.half ? "" : "col-span-2"}`}>
                    <span className={lab}>{f.label}{f.req && <span className="text-[#2D4C82]"> *</span>}</span>
                    {f.type === "date" ? <CustomDatePicker value={vals[f.k] || ""} onChange={(e) => set(f.k, e.target.value)} className={inp} showIcon placeholder="날짜 선택" />
                      : f.type === "birth" ? <CustomDatePicker value={/^\d{4}-\d{2}-\d{2}$/.test(String(vals[f.k] || "")) ? vals[f.k] : ""} onChange={(e) => set(f.k, e.target.value)} className={inp} showIcon placeholder={vals[f.k] && !/^\d{4}-\d{2}-\d{2}$/.test(String(vals[f.k])) ? String(vals[f.k]) : "생년월일 선택"} />
                      : f.type === "timeRange" ? <TimeRangeInput value={vals[f.k] || ""} onChange={(v) => set(f.k, v)} />
                      : f.type === "breakRange" ? <TimeRangeInput value={vals[f.k] || ""} onChange={(v) => set(f.k, v)} withDuration defaults={["12:00", "13:00"]} />
                      : f.opts ? <ComboInput value={vals[f.k] || ""} onChange={(v) => set(f.k, v)} opts={f.opts} placeholder={f.ph ? `예: ${f.ph}` : ""} className={inp} />
                      : f.type === "money" ? <input inputMode="numeric" value={vals[f.k] ? toInt(vals[f.k]).toLocaleString() : ""} onChange={(e) => set(f.k, e.target.value.replace(/[^\d]/g, ""))} placeholder="0" className={`${inp} text-right tabular-nums`} />
                        : f.type === "textarea" ? <textarea value={vals[f.k] || ""} onChange={(e) => set(f.k, e.target.value)} rows={3} placeholder={f.ph || "없음"} className={`${inp} h-auto py-2.5 leading-relaxed`} />
                          : <input value={vals[f.k] || ""} inputMode={/연락처$/.test(f.k) ? "tel" : undefined} onChange={(e) => set(f.k, /연락처$/.test(f.k) ? fmtPhone(e.target.value) : /사업자번호$/.test(f.k) && !/생년월일/.test(f.label || "") ? fmtBizNo(e.target.value) : e.target.value)} placeholder={f.ph || ""} className={inp} />}
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
            {tab === "driver" && <DriverContractStatus company={co} Paper={ContractPaper} specOf={contractSpec} />}
            <div className="text-[12.5px] text-[#5B6B85] leading-relaxed px-1">※ 양식은 일반적인 기준으로 만든 초안입니다. 금액이 크거나 분쟁 가능성이 있는 계약은 전문가(노무사·변호사) 검토를 권장합니다.</div>
          </div>
          <div className="min-w-0">
            <div className="sticky top-3 space-y-3">
              <div className={`${card} p-3 flex items-center gap-2 flex-wrap`}>
                <span className="text-[12px] font-extrabold tracking-[0.2em] text-[#2D4C82] px-1" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>LIVE PREVIEW</span>
                {editId && <span className="text-[12.5px] font-black px-2 py-1 rounded-md bg-[#EEF3FC] text-[#1B2B4B]">보관함 문서 수정 중</span>}
                <div className="ml-auto flex gap-1.5 flex-wrap">
                  <button type="button" onClick={resetDoc} className="h-10 px-3.5 rounded-xl border border-[#DCE3EE] text-[13.5px] font-bold text-[#3A4A66]">새로 쓰기</button>
                  <button type="button" onClick={print} className="h-10 px-3.5 rounded-xl border border-[#DCE3EE] text-[13.5px] font-black text-[#1B2B4B]">인쇄</button>
                  <button type="button" onClick={saveImage} className="h-10 px-3.5 rounded-xl border border-[#DCE3EE] text-[13.5px] font-black text-[#1B2B4B]">이미지 저장</button>
                  <button type="button" onClick={savePdfFile} className="h-10 px-3.5 rounded-xl border border-[#DCE3EE] text-[13.5px] font-black text-[#1B2B4B]">PDF 저장</button>
                  <button type="button" onClick={save} disabled={busy} className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black disabled:opacity-50">{busy ? "저장 중…" : "보관함 저장"}</button>
                  {tab === "driver" && <DriverContractSendBar company={co} me={me} targets={pickedDrivers} valsFor={valsFor} missingFor={missingFor} onMissing={(d, label) => { if (d.id !== activeId) pickDriver(d.id); setTimeout(() => focusField({ label }), 150); }} kind={kind} sub={subKey} title={title} clauses={clauses} />}
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
