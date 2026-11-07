// ======================= src/SheetPlaceDriverImport.jsx =======================
// ⭐ 2026-11-02 구글시트(또는 엑셀) 모든 탭 → 상하차지거래처 / 기사관리 한 번에 옮기기 (최고관리자 전용)
//  - 상하차지: 업체명·주소·담당자·전화번호만 저장. 같은 업체명+주소는 1건만(탭이 달라도).
//  - 기사: 차량번호·이름·전화번호 + 등급(일반/지입 등, 미리보기에서 고름). 같은 차량번호는 1건만.
//  - 이미 프로그램에 있는 건 건너뛴다. 저장한 묶음은 importBatchId로 [가져오기 취소] 가능(SheetImportPanel 기록 표).
import React from "react";
import { auth, db, FUNCTIONS_BASE, DEFAULT_COMPANY } from "./firebase";
import { collection, doc, getDoc, getDocs, query, where, writeBatch, setDoc, serverTimestamp } from "firebase/firestore";
import { coDocKey } from "./coKey";
import { parsePlacesFromGrid, dedupePlaces, parseDriversFromGrid, dedupeDrivers, normKey, normPlate, wordsToLines, parsePlacesFromOcrLines, cleanPlaces, dedupeCleaned, placeKeyOf } from "./placeDriverParse";
import { kpConfirm } from "./kpDialog";

// ⭐ 2026-11-03 .xlsx 속 그림(캡처해서 붙인 표) 꺼내기 — 탭 이름까지(시트 → 그림판 → 그림 연결 파일을 따라감). 같은 그림은 1장만.
async function extractXlsxImages(buf) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buf);
  const txt = async (p) => (zip.file(p) ? zip.file(p).async("string") : "");
  const rels = async (p) => { const x = await txt(p); return [...x.matchAll(/<Relationship\b[^>]*>/g)].map((m) => ({ id: (m[0].match(/Id="([^"]+)"/) || [])[1], target: (m[0].match(/Target="([^"]+)"/) || [])[1] || "" })); };
  const resolve = (base, t) => { if (t.startsWith("/")) return t.slice(1); const parts = base.split("/"); parts.pop(); t.split("/").forEach((x) => { if (x === "..") parts.pop(); else if (x !== ".") parts.push(x); }); return parts.join("/"); };
  const wbXml = await txt("xl/workbook.xml");
  const wbRels = await rels("xl/_rels/workbook.xml.rels");
  const mediaTabs = {}; // 그림 파일 → [탭 이름]
  for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = ((m[0].match(/name="([^"]+)"/) || [])[1] || "").replace(/&amp;/g, "&");
    const rid = (m[0].match(/r:id="([^"]+)"/) || [])[1];
    const sheetPath = resolve("xl/workbook.xml", wbRels.find((r) => r.id === rid)?.target || "");
    if (!sheetPath) continue;
    const sp = sheetPath.split("/"); const sRels = await rels(`${sp.slice(0, -1).join("/")}/_rels/${sp[sp.length - 1]}.rels`);
    for (const d of sRels.filter((r) => /drawing/.test(r.target))) {
      const dPath = resolve(sheetPath, d.target); const dp = dPath.split("/");
      const dRels = await rels(`${dp.slice(0, -1).join("/")}/_rels/${dp[dp.length - 1]}.rels`);
      dRels.filter((r) => /media\//.test(r.target)).forEach((r) => { const mp = resolve(dPath, r.target); (mediaTabs[mp] = mediaTabs[mp] || []).push(name); });
    }
  }
  const out = new Map(); // 내용 지문 → 그림
  const files = Object.keys(zip.files).filter((p) => /^xl\/media\/.+\.(png|jpe?g|gif|bmp|webp)$/i.test(p));
  for (const p of files) {
    const data = await zip.file(p).async("uint8array");
    const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", data))).map((b) => b.toString(16).padStart(2, "0")).join("");
    const cur = out.get(h);
    if (cur) cur.tabs.push(...(mediaTabs[p] || []));
    else out.set(h, { path: p, tabs: [...(mediaTabs[p] || [])], data, type: /\.png$/i.test(p) ? "image/png" : "image/jpeg" });
  }
  return [...out.values()];
}
const toDataUrl = (img) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(new Blob([img.data], { type: img.type })); });

async function callApi(fn, body) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${FUNCTIONS_BASE}/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` },
    body: JSON.stringify(body),
  }).catch(() => { throw new Error("서버 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요."); });
  let data = {};
  try { data = await res.json(); } catch { /* 무시 */ }
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}
const makePlaceKey = (name = "") => String(name).toLowerCase().replace(/\(주\)|㈜/g, "").replace(/\s+/g, "").replace(/[^가-힣a-z0-9]/gi, "").trim();
const GRADES = ["일반", "지입", "직영", "임대"];
const CARD = "bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)]";
const input = "w-full border border-[#DCE3EE] rounded-xl px-3.5 py-2.5 text-[14.5px] outline-none focus:border-[#1B2B4B] bg-white";

// 회사 문서만(기본 회사는 companyName이 비어 있는 예전 문서 포함)
async function loadCompanyDocs(coll, company) {
  const snap = company === DEFAULT_COMPANY
    ? await getDocs(collection(db, coll))
    : await getDocs(query(collection(db, coll), where("companyName", "==", company)));
  return snap.docs.map((d) => ({ _id: d.id, ...d.data() })).filter((x) => (x.companyName || DEFAULT_COMPANY) === company);
}

export default function SheetPlaceDriverImport({ companies = [], url: initUrl = "" }) {
  const [company, setCompany] = React.useState("");
  const [source, setSource] = React.useState("sheet");
  const [url, setUrl] = React.useState(initUrl);
  const [what, setWhat] = React.useState("places"); // places | drivers
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const [res, setRes] = React.useState(null); // { title, source, tabs, places:[], drivers:[] }
  const [skip, setSkip] = React.useState({}); // 행 key → true(제외)
  const [grade, setGrade] = React.useState({}); // 차량번호 → 등급
  const [allGrade, setAllGrade] = React.useState("일반");
  const [onlyFull, setOnlyFull] = React.useState(true);
  const [done, setDone] = React.useState(null);
  const [warnOnly, setWarnOnly] = React.useState(false); // ⭐ 확인 필요만 보기
  const rawRef = React.useRef({ places: [], drivers: [], tabs: [], title: "", src: "" }); // ⭐ 그림 글자 읽기 후 다시 합칠 때 씀
  const [imgs, setImgs] = React.useState([]); // 엑셀 속 그림(같은 그림 제외)
  const [ocr, setOcr] = React.useState(null); // { done, total, found, error }
  const excelRef = React.useRef(null);
  // ⭐ 최고관리자만 — 메뉴·서버에서도 막혀 있지만 화면에서도 한 번 더 확인
  const [isMaster, setIsMaster] = React.useState(null);
  React.useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setIsMaster(false); return; }
    if (auth.currentUser?.email === "tjddnqkf@naver.com") { setIsMaster(true); return; }
    getDoc(doc(db, "users", uid)).then((s) => setIsMaster(s.data()?.role === "totalMaster")).catch(() => setIsMaster(false));
  }, []);

  // raw = { places, drivers, tabs } — 시트·엑셀에서 뽑은 후보(중복·기존 확인 전)
  const analyze = async (raw, title, src, extraPlaces = []) => {
    rawRef.current = { ...raw, title, src };
    const [exP, exD] = await Promise.all([loadCompanyDocs("places", company), loadCompanyDocs("drivers", company)]);
    const exPlaceKeys = new Set(exP.map((p) => placeKeyOf(p)));
    const exPlaceNames = new Set(exP.map((p) => normKey(p.업체명)));
    const exPlates = new Set(exD.map((d) => normPlate(d.차량번호)).filter(Boolean));
    // ⭐ 2026-11-03 정리(띄어쓰기·찌꺼기 글자·주소 띄어쓰기) → 정리 후 같은 곳 다시 합치기 → 이상한 줄은 "확인 필요"(처음엔 체크 해제)
    const places = dedupeCleaned(cleanPlaces(dedupePlaces([...raw.places, ...extraPlaces]))).map((p) => ({
      ...p, __key: placeKeyOf(p),
      __exists: exPlaceKeys.has(placeKeyOf(p)),
      __sameName: exPlaceNames.has(normKey(p.업체명)),
    }));
    const drivers = dedupeDrivers(raw.drivers).map((d) => ({ ...d, __exists: exPlates.has(d.차량번호) }));
    setRes({ title, source: src, tabs: raw.tabs, places, drivers });
    setSkip(Object.fromEntries(places.filter((p) => p.__warn?.length).map((p) => [`p:${p.__key}`, true]))); setGrade({}); setDone(null); setWarnOnly(false);
  };

  const openSheet = async () => {
    if (!company) return setErr("운송사를 먼저 선택하세요.");
    if (!url.trim()) return setErr("구글시트 주소를 붙여넣어 주세요.");
    setErr(""); setBusy("open"); setRes(null);
    try {
      const meta = await callApi("sheetImport", { action: "inspect", url: url.trim() });
      const titles = meta.tabs.map((t) => t.title);
      const grids = [];
      for (let i = 0; i < titles.length; i += 15) { // 탭이 많으면 15개씩 나눠 읽기
        setBusy(`open:${Math.min(i + 15, titles.length)}/${titles.length}`);
        const d = await callApi("sheetImport", { action: "read", url: url.trim(), tabs: titles.slice(i, i + 15).map((title) => ({ title, headerRow: 0 })) });
        d.tabs.forEach((t) => grids.push({ title: t.title, rows: [t.header, ...t.rows] }));
      }
      await analyze({ places: grids.flatMap((g) => parsePlacesFromGrid(g.rows, g.title)), drivers: grids.flatMap((g) => parseDriversFromGrid(g.rows, g.title)), tabs: grids.map((g) => g.title) }, meta.title, "sheet");
    } catch (e) { setErr(e.message); } finally { setBusy(""); }
  };
  const openExcel = async (file) => {
    if (!file) return;
    if (!company) return setErr("운송사를 먼저 선택하세요.");
    setErr(""); setBusy("open"); setRes(null); setImgs([]); setOcr(null);
    try {
      const buf = await file.arrayBuffer();
      // ⭐ 그림 꺼내기(화면 안 멈춤)와 칸 읽기(백그라운드 작업자)를 동시에
      const imgP = /\.xlsx$/i.test(file.name) ? extractXlsxImages(buf).catch(() => []) : Promise.resolve([]);
      const raw = await new Promise((ok, no) => {
        const w = new Worker(new URL("./xlsxParseWorker.js", import.meta.url), { type: "module" });
        w.onmessage = (ev) => {
          const d = ev.data || {};
          if (d.progress) setBusy(`open:${d.progress}/${d.total}`);
          else if (d.error) { w.terminate(); no(new Error(d.error)); }
          else if (d.done) { w.terminate(); ok(d); }
        };
        w.onerror = (ev) => { w.terminate(); no(new Error(ev.message || "읽기 실패")); };
        w.postMessage(buf.slice(0));
      });
      setImgs(await imgP);
      await analyze(raw, file.name, "excel");
    } catch (e) { setErr(`엑셀 파일을 읽지 못했습니다: ${e?.message || e}`); } finally { setBusy(""); }
  };

  // ⭐ 그림 글자 읽기 — 4장씩 동시에 서버(Google Vision)로 보내 업체명·주소·담당자·전화번호를 뽑아 미리보기에 합친다
  const runOcr = async () => {
    const found = [];
    setOcr({ done: 0, total: imgs.length, found: 0 });
    let next = 0; let fail = "";
    const worker = async () => {
      while (next < imgs.length && !fail) {
        const img = imgs[next++];
        try {
          const d = await callApi("sheetOcr", { image: await toDataUrl(img) });
          found.push(...parsePlacesFromOcrLines(wordsToLines(d.words), img.tabs[0] || img.path.split("/").pop()));
        } catch (e) { if (/Vision|로그인|최고관리자/.test(e.message)) fail = e.message; }
        setOcr((o) => ({ ...o, done: o.done + 1, found: found.length }));
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (fail) { setOcr((o) => ({ ...o, error: fail })); return; }
    const g = rawRef.current;
    await analyze(g, g.title, g.src, found);
    setWhat("places");
    setOcr((o) => ({ ...o, finished: true }));
  };
  const editPlace = (key, patch) => setRes((r) => r && ({ ...r, places: r.places.map((p) => {
    if (p.__key !== key) return p;
    const n = { ...p };
    if ("업체명" in patch) n.업체명 = patch.업체명;
    if ("주소" in patch) n.주소 = patch.주소;
    if ("name" in patch || "phone" in patch) { const c = [...(n.contacts.length ? n.contacts : [{ name: "", phone: "" }])]; c[0] = { ...c[0], ...patch }; n.contacts = c; }
    return n;
  }) }));

  const placeRows = res ? res.places : [];
  const driverRows = res ? res.drivers : [];
  const placesToSave = placeRows.filter((p) => !p.__exists && !skip[`p:${p.__key}`]);
  const driversToSave = driverRows.filter((d) => !d.__exists && !skip[`d:${d.차량번호}`] && (!onlyFull || d.__full));
  const gradeOf = (d) => grade[d.차량번호] || (d.운송업체 === "지입" ? "지입" : allGrade);

  const save = async () => {
    const list = what === "places" ? placesToSave : driversToSave;
    if (!list.length) return;
    const label = what === "places" ? "상하차지" : "기사";
    if (!(await kpConfirm(`${company}에 ${label} ${list.length.toLocaleString()}건을 등록할까요?\n(나중에 아래 가져오기 기록의 [가져오기 취소]로 한 번에 지울 수 있습니다)`))) return;
    const batchId = `imp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const me = auth.currentUser?.email || "";
    setBusy("save");
    try {
      await setDoc(doc(db, "importBatches", batchId), {
        companyName: company, by: me, at: serverTimestamp(), source: res.source, sheetTitle: `[${label}] ${res.title || ""}`,
        kind: what, tabs: res.tabs, status: "importing", count: 0,
      });
      const base = { companyName: company, importBatchId: batchId, createdAt: serverTimestamp() };
      // 상하차지 문서 이름: 업체명 키(같은 이름·다른 주소면 _2, _3…)
      const exIds = what === "places" ? new Set((await loadCompanyDocs("places", company)).map((p) => p._id)) : new Set();
      for (let i = 0; i < list.length; i += 400) {
        const b = writeBatch(db);
        list.slice(i, i + 400).forEach((x) => {
          if (what === "places") {
            const k0 = coDocKey(company, makePlaceKey(x.업체명) || `place${Date.now()}`);
            let id = k0; let n = 2;
            while (exIds.has(id)) id = `${k0}_${n++}`;
            exIds.add(id);
            const contacts = x.contacts.filter((c) => c.name || c.phone).map((c, ci) => ({ name: c.name || "", phone: c.phone || "", isPrimary: ci === 0 }));
            b.set(doc(db, "places", id), {
              ...base, id, 업체명: x.업체명, 주소: x.주소 || "",
              담당자: contacts[0]?.name || "", 담당자번호: contacts[0]?.phone || "", contacts,
            });
          } else {
            const id = coDocKey(company, x.차량번호);
            b.set(doc(db, "drivers", id), { ...base, id, 차량번호: x.차량번호, 이름: x.이름 || "", 전화번호: x.전화번호 || "", 등급: gradeOf(x), 등록자: me });
          }
        });
        await b.commit();
      }
      const registered = { clients: 0, places: what === "places" ? list.length : 0, drivers: what === "drivers" ? list.length : 0 };
      await setDoc(doc(db, "importBatches", batchId), { status: "done", count: 0, registered }, { merge: true });
      await setDoc(doc(db, "systemConfig", "dataVersion"), { [company]: serverTimestamp() }, { merge: true }).catch(() => {});
      setDone(`${label} ${list.length.toLocaleString()}건을 등록했습니다.`);
      // 방금 등록한 건 "이미 있음"으로 표시
      setRes((r) => r && ({
        ...r,
        places: what === "places" ? r.places.map((p) => (list.includes(p) ? { ...p, __exists: true } : p)) : r.places,
        drivers: what === "drivers" ? r.drivers.map((d) => (list.includes(d) ? { ...d, __exists: true } : d)) : r.drivers,
      }));
    } catch (e) {
      await setDoc(doc(db, "importBatches", batchId), { status: "error", error: String(e?.message || e) }, { merge: true }).catch(() => {});
      setErr(`저장 실패: ${e?.message || e} — 일부만 저장됐다면 가져오기 기록에서 [가져오기 취소]로 지울 수 있습니다.`);
    } finally { setBusy(""); }
  };

  const Badge = ({ c, children }) => <span className={`px-2 py-0.5 rounded-full text-[12px] font-bold ${c}`}>{children}</span>;
  const th = "px-3 py-2.5 text-center font-bold whitespace-nowrap";
  const td = "px-3 py-2 text-[13.5px]";

  if (isMaster === null) return null;
  if (!isMaster) return <div className={`${CARD} p-6 text-[14px] text-gray-500`}>최고관리자만 사용할 수 있습니다.</div>;

  return (
    <div className="space-y-6">
      <section className={`${CARD} p-6`}>
        <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">STEP 1</div>
        <div className="mt-0.5 text-[18px] font-black text-[#0F1A30]">상하차지 · 기사 가져오기</div>
        <div className="text-[13.5px] text-gray-500 mt-1 mb-5">시트의 <b>모든 탭</b>을 읽어 상하차지거래처(업체명·주소·담당자·전화번호)와 기사(차량번호·이름·전화번호)를 뽑습니다. 같은 건 1건만, 이미 있는 건 건너뜁니다.</div>
        <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-5">
          <label className="block">
            <span className="text-[13px] font-semibold text-gray-600">가져올 운송사</span>
            <select value={company} onChange={(e) => { setCompany(e.target.value); setRes(null); }} className={`mt-1.5 ${input} h-[46px] font-semibold`}>
              <option value="">운송사 선택</option>
              {companies.map((c) => <option key={c.name} value={c.name}>{c.name}{c.code ? ` (${c.code})` : ""}</option>)}
            </select>
          </label>
          <div>
            <div className="inline-flex rounded-xl bg-gray-100 p-1 mb-2">
              {[["sheet", "구글시트 주소"], ["excel", "엑셀 파일"]].map(([k, l]) => (
                <button key={k} onClick={() => { setSource(k); setRes(null); }} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold ${source === k ? "bg-white text-[#1B2B4B] shadow-sm" : "text-gray-500"}`}>{l}</button>
              ))}
            </div>
            {source === "sheet" ? (
              <div className="flex gap-2">
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className={input} />
                <button onClick={openSheet} disabled={!!busy} className="shrink-0 px-6 rounded-xl bg-[#1B2B4B] text-white text-[14.5px] font-bold disabled:opacity-60">{busy.startsWith("open") ? `읽는 중… ${busy.split(":")[1] || ""}` : "모든 탭 읽기"}</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button onClick={() => excelRef.current?.click()} disabled={!!busy} className="px-6 py-3 rounded-xl bg-[#1B2B4B] text-white text-[14.5px] font-bold disabled:opacity-60">{busy.startsWith("open") ? `읽는 중… ${busy.split(":")[1] || ""}` : "엑셀 파일 선택"}</button>
                <input ref={excelRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { openExcel(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
            )}
          </div>
        </div>
        {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-semibold text-red-700">{err}</div>}
      </section>

      {imgs.length > 0 && (
        <section className={`${CARD} p-6`}>
          <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">IMAGE</div>
          <div className="mt-0.5 text-[17px] font-black text-[#0F1A30]">파일 속 그림 {imgs.length.toLocaleString()}장(같은 그림 제외)</div>
          <div className="text-[13.5px] text-gray-500 mt-1 mb-4">시트에 캡처해서 붙인 표(오더표·발주서)는 칸이 아니라 그림이라 글자 인식으로 읽습니다. 읽은 결과는 아래 상하차지 미리보기에 합쳐지고, 칸마다 고칠 수 있습니다.</div>
          {ocr && (
            <div className="mb-3">
              <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-[#1B2B4B] transition-all" style={{ width: `${Math.round((ocr.done / Math.max(1, ocr.total)) * 100)}%` }} /></div>
              <div className="mt-1.5 text-[13px] text-gray-600">{ocr.done} / {ocr.total}장 · 찾은 줄 {ocr.found}{ocr.finished ? " — 완료" : ""}</div>
              {ocr.error && <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-semibold text-red-700">{ocr.error}</div>}
            </div>
          )}
          <button onClick={runOcr} disabled={!!(ocr && !ocr.finished && !ocr.error)} className="px-6 py-3 rounded-xl bg-[#1B2B4B] text-white text-[14.5px] font-bold disabled:opacity-60">{ocr && !ocr.finished && !ocr.error ? "읽는 중…" : `그림 ${imgs.length}장 글자 읽기`}</button>
        </section>
      )}

      {res && (
        <section className={`${CARD} p-6`}>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="inline-flex rounded-xl bg-gray-100 p-1">
              {[["places", `상하차지 ${placeRows.length}`], ["drivers", `기사 ${driverRows.length}`]].map(([k, l]) => (
                <button key={k} onClick={() => setWhat(k)} className={`px-4 py-1.5 rounded-lg text-[13.5px] font-bold ${what === k ? "bg-white text-[#1B2B4B] shadow-sm" : "text-gray-500"}`}>{l}</button>
              ))}
            </div>
            <div className="text-[13px] text-gray-500">{res.title} · 탭 {res.tabs.length}개</div>
          </div>

          {what === "places" ? (
            <>
              <div className="text-[13.5px] text-gray-700 mb-3">
                신규 <b className="text-[#1B2B4B]">{placesToSave.length}</b> · 이미 있음 {placeRows.filter((p) => p.__exists).length} · 제외 {placeRows.filter((p) => !p.__exists && skip[`p:${p.__key}`]).length}
                {" · "}<button type="button" onClick={() => setWarnOnly((v) => !v)} className={`px-2.5 py-0.5 rounded-full text-[12.5px] font-bold border ${warnOnly ? "bg-red-600 text-white border-red-600" : "bg-red-50 text-red-700 border-red-200"}`}>확인 필요 {placeRows.filter((p) => !p.__exists && p.__warn?.length).length}{warnOnly ? " · 전체 보기" : "만 보기"}</button>
                <span className="ml-2 text-[12.5px] text-gray-500">띄어쓰기·앞뒤 찌꺼기 글자는 자동 정리됨 · 확인 필요 줄은 체크 해제(고친 뒤 체크하면 등록)</span>
              </div>
              <div className="overflow-auto max-h-[560px] border border-[#E3E8F0] rounded-xl">
                <table className="w-full text-[13.5px]">
                  <thead className="sticky top-0 bg-[#F5F8FD] text-gray-600"><tr>{["등록", "업체명", "주소", "담당자", "전화번호", "찾은 곳", "상태"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-[#EEF1F6]">
                    {placeRows.filter((p) => !warnOnly || (!p.__exists && p.__warn?.length)).map((p) => (
                      <tr key={p.__key} className={p.__exists ? "bg-gray-50 text-gray-400" : ""}>
                        <td className={`${td} text-center`}><input type="checkbox" disabled={p.__exists} checked={!p.__exists && !skip[`p:${p.__key}`]} onChange={(e) => setSkip((s) => ({ ...s, [`p:${p.__key}`]: !e.target.checked }))} className="w-[17px] h-[17px]" /></td>
                        {p.__exists ? (<>
                          <td className={`${td} font-semibold whitespace-nowrap`}>{p.업체명}</td>
                          <td className={td}>{p.주소}</td>
                          <td className={`${td} whitespace-nowrap`}>{p.contacts.map((c) => c.name).filter(Boolean).join(", ")}</td>
                          <td className={`${td} whitespace-nowrap`}>{p.contacts.map((c) => c.phone).filter(Boolean).join(", ")}</td>
                        </>) : (<>
                          {/* ⭐ 칸마다 바로 고치기(그림 글자 인식이 틀린 글자 수정) */}
                          <td className={td}><input value={p.업체명} onChange={(e) => editPlace(p.__key, { 업체명: e.target.value })} className="w-full min-w-[80px] px-2 py-1 rounded-md border border-transparent hover:border-[#DCE3EE] focus:border-[#1B2B4B] outline-none bg-transparent text-[13.5px]" style={{ fontWeight: 600 }} /></td>
                          <td className={td}><input value={p.주소} onChange={(e) => editPlace(p.__key, { 주소: e.target.value })} className="w-full min-w-[80px] px-2 py-1 rounded-md border border-transparent hover:border-[#DCE3EE] focus:border-[#1B2B4B] outline-none bg-transparent text-[13.5px]" style={{ minWidth: 260 }} placeholder="주소 없음" /></td>
                          <td className={td}><input value={p.contacts[0]?.name || ""} onChange={(e) => editPlace(p.__key, { name: e.target.value })} className="w-full min-w-[80px] px-2 py-1 rounded-md border border-transparent hover:border-[#DCE3EE] focus:border-[#1B2B4B] outline-none bg-transparent text-[13.5px]" />{p.contacts.length > 1 && <div className="text-[12px] text-gray-500 px-2">+ {p.contacts.slice(1).map((c) => c.name).filter(Boolean).join(", ")}</div>}</td>
                          <td className={td}><input value={p.contacts[0]?.phone || ""} onChange={(e) => editPlace(p.__key, { phone: e.target.value })} className="w-full min-w-[80px] px-2 py-1 rounded-md border border-transparent hover:border-[#DCE3EE] focus:border-[#1B2B4B] outline-none bg-transparent text-[13.5px]" />{p.contacts.length > 1 && <div className="text-[12px] text-gray-500 px-2">+ {p.contacts.slice(1).map((c) => c.phone).filter(Boolean).join(", ")}</div>}</td>
                        </>)}
                        <td className={`${td} text-gray-500 whitespace-nowrap`}>{p.__tab}{p.__dupCount > 1 ? ` 외 ${p.__dupCount - 1}` : ""}</td>
                        <td className={`${td} text-center whitespace-nowrap`}>{p.__exists ? <Badge c="bg-gray-100 text-gray-500">이미 있음</Badge> : p.__sameName ? <Badge c="bg-amber-100 text-amber-700">같은 이름·다른 주소</Badge> : <Badge c="bg-emerald-100 text-emerald-700">신규</Badge>}
                          {!p.__exists && p.__warn?.length > 0 && <div className="mt-1 text-[11.5px] font-bold text-red-600 whitespace-normal">⚠ {p.__warn.join(" · ")}</div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-4 mb-3 text-[13.5px] text-gray-700">
                <span>신규 <b className="text-[#1B2B4B]">{driversToSave.length}</b> · 이미 있음 {driverRows.filter((d) => d.__exists).length} · 번호 일부(4자리) {driverRows.filter((d) => !d.__full).length}</span>
                <label className="flex items-center gap-2"><input type="checkbox" checked={onlyFull} onChange={(e) => setOnlyFull(e.target.checked)} className="w-[17px] h-[17px]" />전체 차량번호만(4자리만 적힌 건 빼기)</label>
                <label className="flex items-center gap-2">전체 등급
                  <select value={allGrade} onChange={(e) => { setAllGrade(e.target.value); setGrade({}); }} className="border border-[#DCE3EE] rounded-lg px-2 py-1 font-semibold">{GRADES.map((g) => <option key={g}>{g}</option>)}</select>
                </label>
                <span className="text-[12.5px] text-gray-500">운송업체가 "지입"인 줄은 자동으로 지입</span>
              </div>
              <div className="overflow-auto max-h-[560px] border border-[#E3E8F0] rounded-xl">
                <table className="w-full text-[13.5px]">
                  <thead className="sticky top-0 bg-[#F5F8FD] text-gray-600"><tr>{["등록", "차량번호", "이름", "전화번호", "운송업체(참고)", "등급", "찾은 곳", "상태"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-[#EEF1F6]">
                    {driverRows.map((d) => {
                      const out = d.__exists || (onlyFull && !d.__full);
                      return (
                        <tr key={d.차량번호} className={out ? "bg-gray-50 text-gray-400" : ""}>
                          <td className={`${td} text-center`}><input type="checkbox" disabled={out} checked={!out && !skip[`d:${d.차량번호}`]} onChange={(e) => setSkip((s) => ({ ...s, [`d:${d.차량번호}`]: !e.target.checked }))} className="w-[17px] h-[17px]" /></td>
                          <td className={`${td} font-semibold whitespace-nowrap`}>{d.차량번호}</td>
                          <td className={`${td} whitespace-nowrap`}>{d.이름}</td>
                          <td className={`${td} whitespace-nowrap`}>{d.전화번호}</td>
                          <td className={`${td} text-center whitespace-nowrap text-gray-500`}>{d.운송업체}</td>
                          <td className={`${td} text-center`}>
                            <select disabled={out} value={gradeOf(d)} onChange={(e) => setGrade((g) => ({ ...g, [d.차량번호]: e.target.value }))} className="border border-[#DCE3EE] rounded-lg px-2 py-1">{GRADES.map((g) => <option key={g}>{g}</option>)}</select>
                          </td>
                          <td className={`${td} text-gray-500 whitespace-nowrap`}>{d.__tab}{d.__dupCount > 1 ? ` 외 ${d.__dupCount - 1}` : ""}</td>
                          <td className={`${td} text-center whitespace-nowrap`}>{d.__exists ? <Badge c="bg-gray-100 text-gray-500">이미 있음</Badge> : !d.__full ? <Badge c="bg-amber-100 text-amber-700">번호 일부</Badge> : <Badge c="bg-emerald-100 text-emerald-700">신규</Badge>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {done && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13.5px] font-semibold text-emerald-700">{done}</div>}
          <button onClick={save} disabled={busy === "save" || !(what === "places" ? placesToSave : driversToSave).length} className="mt-5 w-full py-3.5 rounded-xl bg-[#1B2B4B] text-white text-[15.5px] font-black disabled:opacity-40">
            {busy === "save" ? "저장 중…" : `${company}에 ${what === "places" ? "상하차지" : "기사"} ${(what === "places" ? placesToSave : driversToSave).length.toLocaleString()}건 등록`}
          </button>
        </section>
      )}
    </div>
  );
}
