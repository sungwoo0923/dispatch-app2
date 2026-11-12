// ======================= src/CarrierMigratePanel.jsx =======================
// 🚚 2026-11-12 운송사 일괄 이전(최고관리자 › 구글시트 가져오기 › 운송사 일괄 이전)
//  새 운송사가 쓰던 구글시트(또는 엑셀) 전체를 한 번에 이 프로그램으로 옮긴다.
//   1) 운송사 이름(없으면 새로 입력) + 시트 주소 → [시트 읽기] (서버 sheetImport readRaw: 맨 윗줄부터 · 병합 칸 포함)
//   2) 탭마다 무엇으로 읽었는지 보여 준다 — 거래처(기본 = 탭 이름 · 고칠 수 있음) · 칸 연결 · 상단 메모 주소 · 주소 못 찾은 곳
//   3) 회사 설정 — 배차방식 별칭(전국특송 → 24시콜 …) · 이 회사 배차방식 목록 · 고정노선 후보 · 기사 등급(분양 등)
//   4) [한 번에 가져오기] — 오더 · 거래처 · 상하차지 · 기사 · 고정노선(운행 OFF) · 회사 배차방식 목록 · 이전 설정 저장
//  변환 규칙은 functions/carrierMigrateCore.mjs(테스트 scripts/carrierMigrate.test.mjs). 가져온 것은 importBatchId로 [가져오기 취소] 가능.
import React from "react";
import * as XLSX from "xlsx";
import { auth, db, FUNCTIONS_BASE } from "./firebase";
import { collection, doc, getDoc, getDocs, query, where, writeBatch, setDoc, serverTimestamp } from "firebase/firestore";
import { applyMerges } from "../functions/sheetProfileCore.mjs";
import { buildMigration, DEFAULT_PRESET, PRESET_SUGGESTIONS, forOrderDoc, forRouteDoc, forRateSheetDoc, nm } from "../functions/carrierMigrateCore.mjs";
import { coDocKey } from "./coKey";
import { kpConfirm } from "./kpDialog";
import CustomDatePicker from "./CustomDatePicker"; // 📅 날짜는 프로그램 달력으로

const SERVICE_EMAIL = "dispatch-app-9b92f@appspot.gserviceaccount.com";
const CARD = "bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)]";
const input = "w-full border border-[#DCE3EE] rounded-xl px-3.5 py-2.5 text-[14.5px] outline-none focus:border-[#1B2B4B] bg-white";
const btn = "h-11 px-5 rounded-xl text-[14.5px] font-black whitespace-nowrap disabled:opacity-50";
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random().toString(36).slice(2)}`);
const won = (n) => Number(n || 0).toLocaleString("ko-KR");
const placeKey = (name) => nm(name);
const KIND = { orders: "오더", places: "상하차지", drivers: "기사", skip: "건너뜀" };

async function callApi(fn, body) {
  const token = await auth.currentUser?.getIdToken();
  let res;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/${fn}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` }, body: JSON.stringify(body) });
  } catch { throw new Error("서버 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요."); }
  let data = {}; try { data = await res.json(); } catch { /* 무시 */ }
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}
// 별칭 글자("전국특송=24시콜" 한 줄씩) ↔ 객체
const aliasText = (o) => Object.entries(o || {}).map(([k, v]) => `${k}=${v}`).join("\n");
const parseAlias = (t) => Object.fromEntries(String(t || "").split("\n").map((l) => l.split("=").map((x) => x.trim())).filter(([k, v]) => k && v));

const Head = ({ eyebrow, title, desc, right }) => (
  <div className="flex items-start gap-3 pb-4 mb-5 border-b border-[#EEF1F6] flex-wrap">
    <div className="flex-1 min-w-[220px]">
      <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">{eyebrow}</div>
      <div className="mt-0.5 text-[18px] font-black text-[#0F1A30] tracking-tight">{title}</div>
      {desc && <div className="text-[13.5px] text-gray-500 mt-1">{desc}</div>}
    </div>
    {right}
  </div>
);
const Stat = ({ label, value, sub }) => (
  <div className="rounded-2xl border border-[#E3E8F0] bg-[#F8FAFD] px-4 py-3 min-w-[120px]">
    <div className="text-[12.5px] font-bold text-[#5B6B85]">{label}</div>
    <div className="text-[22px] font-black text-[#0F1A30] tabular-nums">{value}</div>
    {sub && <div className="text-[12px] text-[#7A8AA6]">{sub}</div>}
  </div>
);

export default function CarrierMigratePanel({ companies = [] }) {
  const [company, setCompany] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [book, setBook] = React.useState(null); // { title, tabs:[{title, rows}] }
  const [preset, setPreset] = React.useState(DEFAULT_PRESET);
  const [aliasDraft, setAliasDraft] = React.useState(aliasText(DEFAULT_PRESET.dispatchAliases));
  const [result, setResult] = React.useState(null);
  const [routeOn, setRouteOn] = React.useState({}); // 고정노선 후보 index → 만들지
  const [optOn, setOptOn] = React.useState({}); // 배차방식 값 → 회사 목록에 넣을지
  const [rateOn, setRateOn] = React.useState({}); // 단가표 index → 가져올지
  const [ovDraft, setOvDraft] = React.useState({}); // "탭|이름" → 직접 입력한 주소(적용 전)
  const [opts, setOpts] = React.useState({ from: "", to: "", skipDup: true, saveOptions: true, makeRoutes: true, registerDrivers: true, rates: true });
  const [openTab, setOpenTab] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const [progress, setProgress] = React.useState(null);
  const excelRef = React.useRef(null);
  const co = company.trim();

  // 회사를 고르면 저장된 이전 설정(companySettings/{회사}.migrationPreset) → 없으면 회사별 시작 설정 → 기본
  React.useEffect(() => {
    if (!co) return;
    let alive = true;
    getDoc(doc(db, "companySettings", co)).then((s) => {
      if (!alive) return;
      const saved = s.exists() ? s.data().migrationPreset : null;
      const base = saved || PRESET_SUGGESTIONS[co] || {};
      const p = { ...DEFAULT_PRESET, ...base, dispatchAliases: { ...DEFAULT_PRESET.dispatchAliases, ...(base.dispatchAliases || {}) } };
      setPreset(p); setAliasDraft(aliasText(p.dispatchAliases)); setOvDraft(p.placeOverrides || {}); setResult(null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [co]);

  const run = React.useCallback((tabs, p) => {
    try {
      const r = buildMigration(tabs, p);
      setResult(r);
      setRouteOn(Object.fromEntries(r.routes.map((_, i) => [i, true])));
      setRateOn(Object.fromEntries((r.rateSheets || []).map((_, i) => [i, true])));
      setOptOn(Object.fromEntries(r.dispatchOptions.map((d) => [d.value, d.use])));
    } catch (e) { setErr(`변환 중 오류: ${e?.message || e}`); }
  }, []);

  const openSheet = async () => {
    if (!url.trim()) return setErr("구글시트 주소를 붙여넣어 주세요.");
    setErr(""); setBusy("open"); setResult(null); setProgress(null);
    try {
      const d = await callApi("sheetImport", { action: "readRaw", url: url.trim() });
      const tabs = d.tabs.map((t) => ({ title: t.title, rows: applyMerges(t.rows, t.merges) }));
      setBook({ title: d.title, tabs, source: "sheet" });
      run(tabs, preset);
    } catch (e) { setErr(e.message); } finally { setBusy(""); }
  };
  const openExcel = async (file) => {
    if (!file) return;
    setErr(""); setBusy("open"); setResult(null); setProgress(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const tabs = wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }).map((r) => r.map((c) => String(c ?? "")));
        const merges = (ws["!merges"] || []).map((m) => ({ startRowIndex: m.s.r, endRowIndex: m.e.r + 1, startColumnIndex: m.s.c, endColumnIndex: m.e.c + 1 }));
        return { title: name, rows: applyMerges(rows, merges) };
      });
      setBook({ title: file.name, tabs, source: "excel" });
      run(tabs, preset);
    } catch (e) { setErr(`엑셀 파일을 읽지 못했습니다: ${e?.message || e}`); } finally { setBusy(""); }
  };
  const recalc = (patch = {}) => {
    const p = { ...preset, ...patch, dispatchAliases: parseAlias(aliasDraft), placeOverrides: Object.fromEntries(Object.entries(ovDraft).filter(([, v]) => String(v || "").trim())) };
    setPreset(p);
    if (book) run(book.tabs, p);
  };
  const setTabClient = (title, v) => setPreset((p) => ({ ...p, tabClients: { ...(p.tabClients || {}), [title]: v } }));
  const toggleSkip = (title) => recalc({ skipTabs: preset.skipTabs?.includes(title) ? preset.skipTabs.filter((x) => x !== title) : [...(preset.skipTabs || []), title] });

  const inRange = (o) => (!opts.from || o.상차일 >= opts.from) && (!opts.to || o.상차일 <= opts.to);
  const orders = result ? result.orders.filter(inRange) : [];
  const routes = result ? result.routes.filter((_, i) => routeOn[i]) : [];
  const optValues = result ? result.dispatchOptions.filter((d) => optOn[d.value]).map((d) => d.value) : [];
  const rates = result ? (result.rateSheets || []).filter((_, i) => rateOn[i]) : [];

  // ── 저장 ──
  const runImport = async () => {
    if (!co) return setErr("가져올 운송사 이름을 정해 주세요.");
    if (!orders.length) return setErr("가져올 오더가 없습니다.");
    const known = companies.some((c) => c.name === co);
    if (!(await kpConfirm(`${co}${known ? "" : "(새 운송사)"}에 한 번에 가져올까요?\n\n오더 ${won(orders.length)}건 · 거래처 ${won(result.clients.length)} · 상하차지 ${won(result.places.length)} · 기사 ${opts.registerDrivers ? won(result.drivers.length) : 0} · 고정노선 후보 ${opts.makeRoutes ? routes.length : 0}(운행 OFF) · 단가표 ${opts.rates ? rates.length : 0}\n\n알림은 보내지 않고, 아래 [가져오기 기록]에서 한 번에 되돌릴 수 있어요.`))) return;
    const batchId = `imp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const me = auth.currentUser?.email || "";
    const base = { companyName: co, importBatchId: batchId };
    setErr(""); setProgress({ pct: 1, step: "준비 중" });
    try {
      await setDoc(doc(db, "importBatches", batchId), { companyName: co, by: me, at: serverTimestamp(), source: book.source === "excel" ? "excel" : "carrierMigrate", sheetTitle: book.title || "", spreadsheetId: (url.match(/\/d\/([a-zA-Z0-9_-]+)/) || [])[1] || "", tabs: result.tabs.filter((t) => t.kind === "orders").map((t) => t.title), status: "importing", count: 0 });
      // 1) 회사 설정 — 배차방식 목록 · 기사 등급(분양 등) · 이전 설정(다음에 같은 시트를 다시 옮길 때)
      setProgress({ pct: 2, step: "회사 설정 저장 중" });
      const cs = { companyName: co, migrationPreset: { ...preset, dispatchAliases: parseAlias(aliasDraft) }, migrationAt: serverTimestamp() };
      delete cs.migrationPreset.year;
      if (opts.saveOptions && optValues.length) cs.dropdownOptions = { 배차방식: optValues };
      const extraGrades = result.grades.filter((g) => !["지입", "직영", "임대"].includes(g));
      if (extraGrades.length) cs.fleetGrades = extraGrades;
      await setDoc(doc(db, "companySettings", co), cs, { merge: true });
      // 2) 없는 것만 만들기(거래처 · 상하차지 · 기사) — 문서 이름 = 회사별 키
      const createMissing = async (coll, list, idOf, make, label, p0, p1) => {
        let n = 0;
        for (let i = 0; i < list.length; i += 300) {
          const chunk = list.slice(i, i + 300);
          const snaps = await Promise.all(chunk.map((x) => getDoc(doc(db, coll, idOf(x))).catch(() => null)));
          const b = writeBatch(db);
          chunk.forEach((x, j) => { if (snaps[j] && !snaps[j].exists()) { b.set(doc(db, coll, idOf(x)), make(x)); n += 1; } });
          await b.commit();
          setProgress({ pct: Math.round(p0 + ((p1 - p0) * Math.min(list.length, i + 300)) / Math.max(1, list.length)), step: `${label} 등록 중 ${won(Math.min(list.length, i + 300))} / ${won(list.length)}` });
        }
        return n;
      };
      const registered = {};
      registered.clients = await createMissing("clients", result.clients, (c) => coDocKey(co, c.거래처명), (c) => ({ id: coDocKey(co, c.거래처명), 거래처명: c.거래처명, 등급: "일반", 메모: c.메모 || "", 등록경로: "구글시트 이전", ...base }), "거래처", 3, 6);
      registered.places = await createMissing("places", result.places, (p) => coDocKey(co, placeKey(p.업체명)), (p) => ({
        업체명: p.업체명, 주소: p.주소, 담당자: p.담당자 || "", 담당자번호: p.담당자번호 || "",
        contacts: p.담당자 || p.담당자번호 ? [{ name: p.담당자 || "", phone: p.담당자번호 || "", isPrimary: true }] : [],
        메모: p.메모 || "", 등급: "일반", 팝업표시: true, isActive: true, 등록경로: "구글시트 이전", ...base, createdAt: serverTimestamp(),
      }), "상하차지", 6, 10);
      if (opts.registerDrivers) {
        // 이미 이 회사에 있는 차량번호는 건너뜀(기사앱 가입 기사 문서 포함)
        const have = new Set((await getDocs(query(collection(db, "drivers"), where("companyName", "==", co)))).docs.map((d) => String(d.data().차량번호 || "").replace(/\s+/g, "")));
        const list = result.drivers.filter((d) => !have.has(d.차량번호));
        registered.drivers = await createMissing("drivers", list, (d) => coDocKey(co, d.차량번호), (d) => ({
          id: coDocKey(co, d.차량번호), 차량번호: d.차량번호, 이름: d.이름 || "", 전화번호: d.전화번호 || "", 소속: d.소속 || "", 등급: d.등급 || "일반",
          차량구분: d.차량구분 || "", 메모: d.메모 || "", 등록경로: "구글시트 이전", ...base, createdAt: serverTimestamp(),
        }), "기사", 10, 18);
      }
      // 3) 고정노선 후보(운행 OFF)
      if (opts.makeRoutes && routes.length) {
        const b = writeBatch(db);
        routes.forEach((rt) => b.set(doc(db, "fixedRoutes", newId()), { ...forRouteDoc(rt, { company: co, batchId, me, payMethod: preset.defaultPayMethod || "계산서" }), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
        await b.commit();
        registered.routes = routes.length;
      }
      // 3-2) 단가표 → 단가표 메뉴 › 다목적지 단가표
      if (opts.rates && rates.length) {
        const b = writeBatch(db);
        rates.forEach((rt) => b.set(doc(db, "multiRateSheets", newId()), { ...forRateSheetDoc(rt, { company: co, batchId }), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
        await b.commit();
        registered.rateSheets = rates.length;
      }
      // 4) 오더(이미 옮긴 줄은 건너뜀: 같은 탭!줄 · 상차일 · 차량번호)
      let list = orders;
      let skippedDup = 0;
      if (opts.skipDup) {
        setProgress({ pct: 19, step: "이미 옮긴 오더 확인 중" });
        const ex = await getDocs(query(collection(db, "orders"), where("companyName", "==", co), where("등록기기", "==", "구글시트 이전")));
        const keys = new Set(ex.docs.map((d) => { const x = d.data(); return `${x.이전출처}|${x.상차일}|${x.차량번호 || ""}`; }));
        list = orders.filter((o) => !keys.has(`${o.이전출처}|${o.상차일}|${o.차량번호 || ""}`));
        skippedDup = orders.length - list.length;
      }
      let done = 0;
      for (let i = 0; i < list.length; i += 400) {
        const b = writeBatch(db);
        list.slice(i, i + 400).forEach((o) => { const _id = newId(); b.set(doc(db, "orders", _id), { ...forOrderDoc(o, { company: co, batchId, me }), _id }); });
        await b.commit();
        done = Math.min(list.length, i + 400);
        setProgress({ pct: 20 + Math.round((done / Math.max(1, list.length)) * 78), step: `오더 저장 중 ${won(done)} / ${won(list.length)}` });
      }
      const res = { count: done, skippedDup, registered };
      await setDoc(doc(db, "importBatches", batchId), { status: "done", ...res }, { merge: true });
      await setDoc(doc(db, "systemConfig", "dataVersion"), { [co]: serverTimestamp() }, { merge: true }).catch(() => {});
      setProgress({ pct: 100, step: "완료", done: true, result: res });
    } catch (e) {
      await setDoc(doc(db, "importBatches", batchId), { status: "error", error: String(e?.message || e) }, { merge: true }).catch(() => {});
      setProgress({ pct: 0, step: "", error: `가져오기 실패: ${e?.message || e} — 일부만 저장됐다면 아래 [가져오기 기록]에서 [가져오기 취소]로 지울 수 있습니다.` });
    }
  };

  const orderTabs = result ? result.tabs.filter((t) => t.kind === "orders") : [];
  const gradeCount = result ? result.drivers.reduce((m, d) => ({ ...m, [d.등급]: (m[d.등급] || 0) + 1 }), {}) : {};
  const sample = (title) => result.orders.filter((o) => o.__tab === title).slice(0, 8);

  return (
    <div className="space-y-6">
      {/* STEP 1 */}
      <section className={`${CARD} p-6`}>
        <Head eyebrow="STEP 1" title="운송사 일괄 이전" desc="새 운송사가 쓰던 구글시트 전체(배차일지 탭 · 상하차지 · 기사 정보)를 한 번에 옮깁니다. 탭마다 모양이 달라도 매출 · 매입 묶음과 위쪽 메모(주소 · 담당자)를 자동으로 읽어요." />
        <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-5">
          <label className="block">
            <span className="text-[13px] font-semibold text-gray-600">운송사 이름(목록에 없으면 새로 입력)</span>
            <input list="cm-companies" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="예: JY로지스틱스" className={`mt-1.5 ${input} h-[46px] font-semibold`} />
            <datalist id="cm-companies">{companies.map((c) => <option key={c.name} value={c.name} />)}</datalist>
            {co && !companies.some((c) => c.name === co) && <div className="mt-1.5 text-[12.5px] font-bold text-[#B45309]">새 운송사로 만들어요. 직원 가입 때 회사명을 똑같이 "{co}"로 적어야 이 데이터가 보입니다.</div>}
          </label>
          <div>
            <span className="text-[13px] font-semibold text-gray-600">구글시트 주소</span>
            <div className="mt-1.5 flex gap-2 flex-wrap sm:flex-nowrap">
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className={input} />
              <button onClick={openSheet} disabled={busy === "open"} className={`${btn} bg-[#1B2B4B] text-white`}>{busy === "open" ? "읽는 중…" : "시트 읽기"}</button>
              <button onClick={() => excelRef.current?.click()} disabled={busy === "open"} className={`${btn} border border-[#DCE3EE] text-[#1B2B4B] bg-white`}>엑셀 파일</button>
              <input ref={excelRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { openExcel(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            <div className="mt-2.5 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-4 py-3 text-[13px] text-gray-700 leading-relaxed">
              시트가 "링크가 있는 모든 사용자 보기"가 아니면 공유에 아래 주소를 <b>뷰어</b>로 추가해 주세요.
              <div className="mt-1.5 flex items-center gap-2 flex-wrap"><code className="px-2 py-1 rounded-md bg-white border border-[#E3E8F0] text-[12.5px] text-[#1B2B4B] break-all">{SERVICE_EMAIL}</code>
                <button onClick={() => navigator.clipboard?.writeText(SERVICE_EMAIL)} className="px-2.5 py-1 rounded-md border border-[#DCE3EE] text-[12px] font-bold text-gray-600 bg-white">복사</button></div>
            </div>
          </div>
        </div>
        {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-semibold text-red-700 whitespace-pre-line">{err}</div>}
      </section>

      {result && (
        <>
          {/* STEP 2 탭별 결과 */}
          <section className={`${CARD} p-6`}>
            <Head eyebrow="STEP 2" title="탭별로 읽은 결과" desc={`${book.title} — 거래처는 우선 탭 이름으로 넣어요(줄에 "화주" 칸이 있으면 그 값). 고친 뒤 [다시 계산]을 눌러 주세요.`}
              right={<button onClick={() => recalc()} className={`${btn} bg-[#EEF3FF] text-[#2D4C82]`}>다시 계산</button>} />
            <div className="flex flex-wrap gap-3 mb-5">
              <Stat label="오더" value={won(orders.length)} sub={opts.from || opts.to ? `전체 ${won(result.orders.length)} 중 기간 안` : `${orderTabs.length}개 탭`} />
              <Stat label="거래처" value={won(result.clients.length)} />
              <Stat label="상하차지" value={won(result.places.length)} sub="주소 있는 곳" />
              <Stat label="기사" value={won(result.drivers.length)} sub={Object.entries(gradeCount).filter(([g]) => g !== "일반").map(([g, n]) => `${g} ${n}`).join(" · ") || "일반"} />
              <Stat label="고정노선 후보" value={result.routes.length} sub="운행 OFF로 만듦" />
              <Stat label="단가표" value={(result.rateSheets || []).length} sub={`${won((result.rateSheets || []).reduce((a, r) => a + r.rows.length, 0))}곳`} />
            </div>
            <div className="space-y-2.5">
              {result.tabs.map((t) => {
                const skip = preset.skipTabs?.includes(t.title);
                const open = openTab === t.title;
                return (
                  <div key={t.title} className={`rounded-2xl border ${skip ? "border-gray-200 bg-gray-50" : "border-[#DCE3EE]"} px-4 py-3`}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-md text-[12px] font-black ${t.kind === "orders" ? "bg-[#1B2B4B] text-white" : "bg-[#EEF1F6] text-[#5B6B85]"}`}>{skip ? "건너뜀" : KIND[t.kind]}</span>
                      <span className="text-[15.5px] font-black text-[#0F1A30]">{t.title}</span>
                      {t.kind === "orders" && !skip && (
                        <>
                          <span className="text-[13px] font-bold text-[#2D4C82]">{won(t.orders)}건</span>
                          <span className="text-[12.5px] text-gray-500">빈 줄 {won(t.skipped["빈 줄"] || 0)} 뺌 · 머리줄 {t.headerRow}행</span>
                          <label className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-600 ml-auto">거래처
                            <input value={preset.tabClients?.[t.title] ?? ""} placeholder={t.title} onChange={(e) => setTabClient(t.title, e.target.value)} onBlur={() => recalc()} className="w-[180px] border border-[#DCE3EE] rounded-lg px-2 py-1 text-[13.5px]" />
                          </label>
                        </>
                      )}
                      <button onClick={() => toggleSkip(t.title)} className="text-[12.5px] font-bold text-gray-500 underline">{skip ? "가져오기" : "빼기"}</button>
                      {t.kind === "orders" && !skip && <button onClick={() => setOpenTab(open ? "" : t.title)} className="text-[12.5px] font-bold text-[#2D4C82] underline">{open ? "접기" : "자세히"}</button>}
                    </div>
                    {t.kind === "orders" && !skip && (
                      <div className="mt-2 text-[12.5px] text-gray-600 leading-relaxed">
                        {t.memo.places.length > 0 && <div>📍 위쪽 메모 주소: {t.memo.places.map((p) => `${p.role ? `${p.role} ` : ""}${p.name}(${p.address})`).join(" · ")}</div>}
                        {t.memo.defaultFrom && <div>🏭 기본 상차지: {t.memo.defaultFrom.address}</div>}
                        {t.memo.blocked.length > 0 && <div className="text-[#B42318]">⚠ {t.memo.blocked.join(" · ")} (거래처 메모에 남김)</div>}
                        {t.unresolved.length > 0 && (
                          <div className="mt-1.5 rounded-xl border border-[#F5D9B0] bg-[#FFF8EE] px-3 py-2">
                            <div className="text-[#B45309] font-bold">주소 못 찾음 {t.unresolved.length}곳 — 시트 어디에도 주소가 없는 이름이에요. 아는 곳은 주소를 넣고 [주소 적용]을 눌러 주세요.</div>
                            <div className="mt-1.5 grid grid-cols-1 md:grid-cols-2 gap-1.5">
                              {t.unresolved.slice(0, 12).map((u) => {
                                const k = `${t.title}|${u.name}`;
                                return (
                                  <label key={k} className="flex items-center gap-2 min-w-0">
                                    <span className="shrink-0 w-[150px] truncate font-semibold text-[#3A4A66]" title={u.name}>{u.role} {u.name} <span className="text-gray-400">{u.n}건</span></span>
                                    <input value={ovDraft[k] || ""} onChange={(e) => setOvDraft((m) => ({ ...m, [k]: e.target.value }))} placeholder="주소 입력" className="flex-1 min-w-0 border border-[#DCE3EE] rounded-lg px-2 py-1 text-[12.5px] bg-white" />
                                  </label>
                                );
                              })}
                            </div>
                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                              <button onClick={() => recalc()} className="h-8 px-3 rounded-lg bg-[#B45309] text-white text-[12.5px] font-black">주소 적용</button>
                              {t.unresolved.length > 12 && <span className="text-gray-500">외 {t.unresolved.length - 12}곳은 지역 이름 그대로 넣어요</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {open && (
                      <div className="mt-3 space-y-3">
                        <div className="flex flex-wrap gap-1.5">{t.columns.map((c) => <span key={c.col + c.to} className="px-2 py-0.5 rounded-md bg-[#F5F8FD] border border-[#E3E8F0] text-[12px] text-[#3A4A66]"><b>{c.col}</b> {c.header} → {c.to}</span>)}</div>
                        <div className="overflow-x-auto rounded-xl border border-[#E3E8F0]">
                          <table className="min-w-full text-[12.5px]">
                            <thead className="bg-[#F4F6FA] text-[#5B6B85]"><tr>{["줄", "상차일", "거래처", "상차지", "하차지", "차량", "기사(소속)", "청구", "기사운임", "특수운임", "배차방식", "마감월", "메모"].map((h) => <th key={h} className="px-2 py-1.5 text-left font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
                            <tbody>
                              {sample(t.title).map((o) => (
                                <tr key={o.__row} className="border-t border-[#EEF1F6] align-top">
                                  <td className="px-2 py-1.5 text-gray-400">{o.__row}</td>
                                  <td className="px-2 py-1.5 whitespace-nowrap">{o.상차일}</td>
                                  <td className="px-2 py-1.5 whitespace-nowrap">{o.거래처명}</td>
                                  <td className="px-2 py-1.5"><div className="font-semibold">{o.상차지명}</div><div className="text-gray-400">{o.상차지주소}</div></td>
                                  <td className="px-2 py-1.5"><div className="font-semibold">{o.하차지명}</div><div className="text-gray-400">{o.하차지주소}</div></td>
                                  <td className="px-2 py-1.5 whitespace-nowrap">{o.차량번호}<div className="text-gray-400">{o.차량톤수} {o.차량종류}</div></td>
                                  <td className="px-2 py-1.5 whitespace-nowrap">{o.이름}{o.기사소속 ? ` (${o.기사소속})` : ""}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">{won(o.청구운임)}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">{won(o.기사운임)}</td>
                                  <td className="px-2 py-1.5 whitespace-nowrap">{(o.특수운임 || []).map((x) => `${x.이름} ${won(x.금액)}(${x.부담 === "청구" ? "청구" : "회사"})`).join(", ")}</td>
                                  <td className="px-2 py-1.5 whitespace-nowrap">{o.배차방식}</td>
                                  <td className="px-2 py-1.5 whitespace-nowrap">{o.마감월}{o.마감이월 ? " ↪" : ""}</td>
                                  <td className="px-2 py-1.5 min-w-[200px] text-gray-600">{o.메모}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* STEP 3 회사 설정 */}
          <section className={`${CARD} p-6`}>
            <Head eyebrow="STEP 3" title={`${co || "이 운송사"} 맞춤 설정`} desc="배차방식 · 지급방식은 회사마다 다릅니다. 이 시트의 운송사 칸에 나온 값으로 이 회사 배차방식 목록을 만들어요(다른 회사 목록은 그대로)." />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div>
                <div className="text-[14px] font-black text-[#0F1A30] mb-1.5">배차방식 별칭 <span className="text-[12.5px] font-semibold text-gray-500">한 줄에 하나 · 시트 값=프로그램 값</span></div>
                <textarea value={aliasDraft} onChange={(e) => setAliasDraft(e.target.value)} rows={7} className={`${input} font-mono text-[13px]`} />
                <div className="mt-2 flex gap-2 flex-wrap items-center">
                  <button onClick={() => recalc()} className={`${btn} h-10 bg-[#EEF3FF] text-[#2D4C82]`}>별칭 적용</button>
                  <label className="text-[13px] font-semibold text-gray-600 flex items-center gap-1.5">기본 지급방식
                    <input value={preset.defaultPayMethod || ""} onChange={(e) => setPreset((p) => ({ ...p, defaultPayMethod: e.target.value }))} onBlur={() => recalc()} className="w-[110px] border border-[#DCE3EE] rounded-lg px-2 py-1" />
                  </label>
                  <span className="text-[12.5px] text-gray-500">착불 표시가 있는 줄은 착불</span>
                </div>
              </div>
              <div>
                <div className="text-[14px] font-black text-[#0F1A30] mb-1.5">이 회사 배차방식 목록 <span className="text-[12.5px] font-semibold text-gray-500">체크한 값만 선택 목록에 · 오더에는 시트 값 그대로</span></div>
                <div className="flex flex-wrap gap-1.5 max-h-[220px] overflow-y-auto">
                  {result.dispatchOptions.map((d) => (
                    <label key={d.value} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[13px] font-semibold cursor-pointer ${optOn[d.value] ? "border-[#1B2B4B] bg-[#F5F8FD] text-[#0F1A30]" : "border-gray-200 text-gray-400"}`}>
                      <input type="checkbox" checked={!!optOn[d.value]} onChange={(e) => setOptOn((m) => ({ ...m, [d.value]: e.target.checked }))} />{d.value} <span className="text-[11.5px] text-gray-400">{won(d.n)}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-3 text-[13px] text-gray-600 leading-relaxed">
                  기사 등급: {Object.entries(gradeCount).map(([g, n]) => `${g} ${won(n)}`).join(" · ")}
                  {result.grades.includes("분양") && <div className="text-[#2D4C82] font-bold">분양 차량은 이 회사 전용 지입차 구분 "분양"으로 등록해요(고정차 → 지입 · 직영차 → 직영 · 임대 → 임대).</div>}
                  {result.carriers.length > 0 && <div>기사 소속으로 쓰는 업체: {[...new Set(result.drivers.map((d) => d.소속).filter(Boolean))].join(" · ") || "-"}</div>}
                </div>
              </div>
            </div>
            {(result.rateSheets || []).length > 0 && (
              <div className="mt-6">
                <div className="text-[14px] font-black text-[#0F1A30] mb-1.5">단가표 <span className="text-[12.5px] font-semibold text-gray-500">탭 오른쪽에 붙어 있는 톤수별 운임표 → 단가표 메뉴 › 다목적지 단가표(기준지 = 그 탭 상차지)</span></div>
                <div className="space-y-2">
                  {result.rateSheets.map((rt, i) => (
                    <label key={rt.baseName + i} className={`block rounded-xl border px-3.5 py-2.5 cursor-pointer ${rateOn[i] ? "border-[#1B2B4B] bg-[#F5F8FD]" : "border-gray-200"}`}>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <input type="checkbox" checked={!!rateOn[i]} onChange={(e) => setRateOn((m) => ({ ...m, [i]: e.target.checked }))} />
                        <span className="text-[14px] font-black text-[#0F1A30]">{rt.baseName}</span>
                        <span className="text-[12.5px] font-bold text-[#2D4C82]">{won(rt.rows.length)}곳 · {rt.labels.join(" · ")}</span>
                        {rt.groups.length > 0 && <span className="text-[12px] text-gray-500">{rt.groups.join(" · ")}</span>}
                      </div>
                      <div className="mt-1 text-[12px] text-gray-500 line-clamp-2">{rt.note}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">{rt.rows.slice(0, 4).map((r) => <span key={r.name + r.group} className="px-2 py-0.5 rounded-md bg-white border border-[#E3E8F0] text-[11.5px] text-[#3A4A66]">{r.name} {Object.entries(r.prices).slice(0, 3).map(([l, n]) => `${l} ${won(n)}`).join(" · ")}</span>)}</div>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-6">
              <div className="text-[14px] font-black text-[#0F1A30] mb-1.5">고정노선 후보 <span className="text-[12.5px] font-semibold text-gray-500">같은 구간 · 같은 운임이 {preset.routeMinCount}건 이상 — 운행 OFF로 만들고, 요일 · 기사를 확인한 뒤 고정노선 화면에서 켜요</span></div>
              <div className="overflow-x-auto rounded-xl border border-[#E3E8F0]">
                <table className="min-w-full text-[13px]">
                  <thead className="bg-[#F4F6FA] text-[#5B6B85]"><tr>{["", "노선", "건수", "하루 평균", "청구", "기사", "같은 운임", "요일", "기사"].map((h, i) => <th key={i} className="px-2.5 py-2 text-left font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
                  <tbody>
                    {result.routes.map((rt, i) => (
                      <tr key={rt.name} className="border-t border-[#EEF1F6]">
                        <td className="px-2.5 py-1.5"><input type="checkbox" checked={!!routeOn[i]} onChange={(e) => setRouteOn((m) => ({ ...m, [i]: e.target.checked }))} /></td>
                        <td className="px-2.5 py-1.5 font-semibold whitespace-nowrap">{rt.name}</td>
                        <td className="px-2.5 py-1.5 tabular-nums">{won(rt.count)}</td>
                        <td className="px-2.5 py-1.5 tabular-nums">{rt.avgPerDay}대</td>
                        <td className="px-2.5 py-1.5 tabular-nums">{won(rt.fareClient)}</td>
                        <td className="px-2.5 py-1.5 tabular-nums">{rt.fareDriver ? won(rt.fareDriver) : "-"}</td>
                        <td className="px-2.5 py-1.5 tabular-nums">{rt.fareShare}%</td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap">{rt.days.join("")}</td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap">{rt.driver ? `${rt.driver.name} ${rt.driver.carNo}` : "여러 기사"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* STEP 4 가져오기 */}
          <section className={`${CARD} p-6`}>
            <Head eyebrow="STEP 4" title="한 번에 가져오기" desc="오더 · 거래처 · 상하차지 · 기사 · 고정노선 후보 · 단가표 · 회사 배차방식 목록을 한꺼번에 저장합니다." />
            <div className="flex flex-wrap gap-x-6 gap-y-3 items-center text-[14px] font-semibold text-gray-700">
              <span className="flex items-center gap-2">상차일 <CustomDatePicker showIcon value={opts.from} onChange={(e) => setOpts((o) => ({ ...o, from: e.target.value }))} className="h-10 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold text-[#0F1A30]" /> ~ <CustomDatePicker showIcon value={opts.to} onChange={(e) => setOpts((o) => ({ ...o, to: e.target.value }))} className="h-10 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold text-[#0F1A30]" /> <span className="text-[12.5px] text-gray-400">비우면 전체</span></span>
              {[["skipDup", "이미 옮긴 줄 건너뛰기"], ["registerDrivers", "기사 등록"], ["makeRoutes", "고정노선 후보 만들기"], ["rates", "단가표 옮기기"], ["saveOptions", "배차방식 목록 저장"]].map(([k, l]) => (
                <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={opts[k]} onChange={(e) => setOpts((o) => ({ ...o, [k]: e.target.checked }))} className="w-[18px] h-[18px]" />{l}</label>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-3 flex-wrap">
              <button onClick={runImport} disabled={!!progress && !progress.done && !progress.error} className={`${btn} h-12 px-8 bg-[#1B2B4B] text-white text-[15.5px]`}>{co || "운송사"}에 오더 {won(orders.length)}건 가져오기</button>
              <span className="text-[13px] text-gray-500">특수운임: 매출 · 매입 추가 칸(야상 · 대행료 · 계근비 · 경유) → 오더의 [특수운임 적용]과 같은 칸</span>
            </div>
            {progress && (
              <div className="mt-5">
                {progress.error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-semibold text-red-700">{progress.error}</div> : (
                  <>
                    <div className="h-3 rounded-full bg-[#EEF1F6] overflow-hidden"><div className="h-full bg-[#1B2B4B] transition-all" style={{ width: `${progress.pct}%` }} /></div>
                    <div className="mt-2 text-[13.5px] font-bold text-[#3A4A66]">{progress.step}</div>
                    {progress.done && <div className="mt-2 rounded-xl bg-[#E8F7EF] border border-[#BFE6CF] px-4 py-3 text-[14px] font-bold text-[#0F7A43]">오더 {won(progress.result.count)}건 저장{progress.result.skippedDup ? ` · 이미 옮긴 ${won(progress.result.skippedDup)}건 건너뜀` : ""} · 거래처 {won(progress.result.registered.clients)} · 상하차지 {won(progress.result.registered.places)} · 기사 {won(progress.result.registered.drivers || 0)} · 고정노선 {progress.result.registered.routes || 0}(운행 OFF) · 단가표 {progress.result.registered.rateSheets || 0}</div>}
                  </>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
