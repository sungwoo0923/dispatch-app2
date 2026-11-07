// ======================= src/SheetConnectWizard.jsx =======================
// 🔗 2026-11-07 구글시트 연결 마법사 — 관리자메뉴 › 구글시트 연동 · 배차표 양식 만들기에서 연다
//  1) 시트 주소 → 2) 탭 고르기(한 탭 · 월별 탭 자동 · 전체 탭 합치기) → 3) 머리줄 확인(제목 줄 · 두 줄 머리줄 자동)
//  → 4) 칸 맞추기(동의어 사전 + 값 살펴보기 + AI · 확신도 · 값 바꾸기) → 5) 중복 확인 칸 · 저장(시트 프로필)
//  규칙은 functions/sheetProfileCore.mjs(서버와 같은 파일)
import React from "react";
import {
  PROGRAM_FIELDS, FIELD_BY_KEY, MODES, ENUM_OPTIONS, SPECIAL_TARGETS, DEFAULT_VALUE_MAPS,
  applyMerges, detectHeader, autoMapColumns, ambiguousColumns, applyAiSuggestions, missingRequired, duplicateFields,
  detectMonthlyTabs, suggestDedupe, buildProfile, distinctValues, colLetter, norm, mapEnum, combineHeader,
} from "../functions/sheetProfileCore.mjs";
import { sheetConnectApi, saveSheetProfile, SERVICE_EMAIL, sheetDemo, isOfficeFileError } from "./sheetConnectApi";
import OfficeSheetCard from "./OfficeSheetCard"; // 📗 2026-11-07 엑셀(xlsx) 파일 안내
import { CustomSelect } from "./CustomSelect";

const card = "rounded-[18px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_20px_rgba(16,24,40,0.05)]";
const inp = "h-11 w-full px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[14.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
const sel = "h-9 px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[13.5px] font-semibold outline-none";
const btn = "h-11 px-5 rounded-xl text-[14px] font-black whitespace-nowrap disabled:opacity-40";
const STEPS = ["시트 주소", "탭 고르기", "머리줄 확인", "칸 맞추기", "저장"];
const ENUM_FIELDS = ["지급방식", "배차방식", "배차상태"];

function Badge({ c }) {
  if (c.mode === "calc") return <span className="px-2 py-0.5 rounded-md bg-[#F1F3F7] text-[#5B6B85] text-[12px] font-black">계산열</span>;
  if (!c.field) return <span className="px-2 py-0.5 rounded-md bg-[#F5F6F8] text-[#9AA4B5] text-[12px] font-black">연결 안 함</span>;
  const p = Math.round((c.confidence || 0) * 100);
  const tone = c.source === "user" ? "bg-[#EEF3FF] text-[#2D4C82]" : p >= 80 ? "bg-[#E8F7EF] text-[#0F7A43]" : p >= 60 ? "bg-[#FFF6E5] text-[#A35F00]" : "bg-[#FDECEC] text-[#C2352B]";
  const src = { dict: "이름", sniff: "값", ai: "AI", user: "직접", legacy: "기존" }[c.source] || "";
  return <span className={`px-2 py-0.5 rounded-md text-[12px] font-black tabular-nums ${tone}`}>{c.source === "user" ? "직접" : `${p}% · ${src}`}</span>;
}

export default function SheetConnectWizard({ company, initial = null, onClose, onSaved, title = "구글시트 연결" }) {
  const editing = !!initial?.id;
  const [step, setStep] = React.useState(editing ? 3 : 0);
  const [url, setUrl] = React.useState(initial?.sheetUrl || (sheetDemo() ? "https://docs.google.com/spreadsheets/d/demo-sheet/edit" : ""));
  const [book, setBook] = React.useState(null); // { title, spreadsheetId, tabs:[{title,rows,cols}] }
  const [tabMode, setTabMode] = React.useState(initial?.tabMode || "single");
  const [picked, setPicked] = React.useState(initial?.tabs || []);
  const [sampleTab, setSampleTab] = React.useState("");
  const [sample, setSample] = React.useState(null); // { rows(병합 펼침), formulas }
  const [header, setHeader] = React.useState(initial ? { headerRow: initial.headerRow, depth: initial.headerDepth, dataStart: initial.dataStart, headers: initial.columns.map((c) => c.header), titleRows: [] } : null);
  const [cols, setCols] = React.useState(initial?.columns || []);
  const [valueMaps, setValueMaps] = React.useState(initial?.valueMaps || {});
  const [dedupe, setDedupe] = React.useState(initial?.dedupe || null);
  const [name, setName] = React.useState(initial?.name || "");
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const [office, setOffice] = React.useState(null); // 📗 엑셀(xlsx) 파일이면 { fileName }
  const [aiNote, setAiNote] = React.useState("");

  const monthly = React.useMemo(() => (book ? detectMonthlyTabs(book.tabs.map((t) => t.title)) : null), [book]);

  // 수정할 때 — 시트를 다시 읽어 예시 값을 보여 준다
  React.useEffect(() => {
    if (!editing) return;
    (async () => {
      try {
        const d = await sheetConnectApi({ action: "tabs", url: initial.sheetUrl });
        setBook(d);
        const t = initial.tabMode === "monthly" ? (detectMonthlyTabs(d.tabs.map((x) => x.title))?.tabs.slice(-1)[0]?.title) : initial.tabs?.[0];
        if (t) await loadSample(t, false);
      } catch (e) { setErr(e.message); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openSheet = async (u = url) => {
    if (!String(u || "").trim()) return setErr("구글시트 주소를 붙여넣어 주세요.");
    setErr(""); setBusy("tabs"); setOffice(null);
    try {
      const d = await sheetConnectApi({ action: "tabs", url: u.trim() });
      setBook(d);
      setOffice(d.office ? { fileName: d.fileName || "" } : null);
      if (!name) setName(d.title || "");
      const m = detectMonthlyTabs(d.tabs.map((t) => t.title));
      if (m) { setTabMode("monthly"); setPicked(m.tabs.map((t) => t.title)); setSampleTab(m.tabs[m.tabs.length - 1].title); }
      else { const big = [...d.tabs].sort((a, b) => b.rows - a.rows)[0]; setTabMode("single"); setPicked(big ? [big.title] : []); setSampleTab(big?.title || ""); }
      setStep(1);
    } catch (e) { if (isOfficeFileError(e)) setOffice({ fileName: "" }); else setErr(e.message); } finally { setBusy(""); }
  };
  // 📗 엑셀 파일 → 구글 시트로 변환(같은 폴더 사본 · 원본 그대로) → 새 주소로 다시 열기(수정 중인 연결이면 서버가 주소도 바꾼다)
  const convertOffice = () => sheetConnectApi({ action: "convert", url: url.trim() || initial?.sheetUrl, ...(initial?.id ? { profileId: initial.id } : {}) });
  const onConverted = (r) => { if (!r?.url) return; setUrl(r.url); setTimeout(() => openSheet(r.url), 0); };
  const officeCard = office && <OfficeSheetCard key={url} className="mb-4" fileName={office.fileName} onConvert={convertOffice} onConverted={onConverted} />;

  const loadSample = async (tab, auto = true) => {
    setBusy("sample"); setErr("");
    try {
      const d = await sheetConnectApi({ action: "sample", url: url.trim() || initial?.sheetUrl, tab });
      const rows = applyMerges(d.rows || [], d.merges || []);
      const s = { tab, rows, formulas: d.formulas || [] };
      setSample(s);
      if (auto) remap(s, detectHeader(rows));
      return s;
    } catch (e) { setErr(e.message); return null; } finally { setBusy(""); }
  };
  // 머리줄이 정해지면 칸 자동 맞추기
  const remap = (s, h) => {
    setHeader(h);
    const data = s.rows.slice(h.dataStart, h.dataStart + 40);
    const forms = (s.formulas || []).slice(h.dataStart, h.dataStart + 40);
    const auto = autoMapColumns(h.headers, data, forms);
    setCols(auto);
    setDedupe(suggestDedupe(auto));
    setAiNote("");
  };
  const setHeaderRow = (r, depth) => {
    if (!sample) return;
    const rows = sample.rows;
    const headers = depth === 2 ? combineHeader(rows[r] || [], rows[r + 1] || []) : (rows[r] || []).map((x) => String(x || "").trim());
    let ds = r + depth; while (ds < rows.length && !(rows[ds] || []).some((x) => String(x || "").trim())) ds++;
    remap(sample, { headerRow: r, depth, headers, dataStart: ds, titleRows: [] });
  };

  const goTabs = async () => {
    if (!picked.length) return setErr("탭을 하나 이상 골라 주세요.");
    const t = sampleTab && picked.includes(sampleTab) ? sampleTab : picked[picked.length - 1];
    const s = await loadSample(t);
    if (s) setStep(2);
  };
  const setCol = (idx, patch) => setCols((cs) => cs.map((c) => (c.idx === idx ? { ...c, ...patch } : c)));
  const pickField = (c, field) => {
    const f = FIELD_BY_KEY[field];
    const mode = !field ? (c.mode === "calc" ? "calc" : "readonly") : f.calc ? "calc" : field === "순번" ? "readonly" : field === "오더ID" ? "id" : c.mode === "calc" || c.mode === "ignore" || c.mode === "readonly" ? "data" : c.mode;
    // 같은 프로그램 칸이 다른 시트 칸에 있으면 그 칸은 연결을 푼다
    setCols((cs) => cs.map((x) => {
      if (x.idx === c.idx) return { ...x, field, mode, source: "user", confidence: 1, transform: f?.type === "date" ? { date: "auto", fillDown: field === "상차일" } : f?.type === "money" ? { unit: "원" } : undefined };
      if (field && x.field === field) return { ...x, field: "", mode: x.mode === "calc" ? "calc" : "readonly", confidence: 0, source: "" };
      return x;
    }));
  };
  const runAi = async () => {
    const amb = ambiguousColumns(cols);
    if (!amb.length) { setAiNote("헷갈리는 칸이 없어요."); return; }
    setBusy("ai");
    try {
      const d = await sheetConnectApi({ action: "aiMap", columns: amb.map((c) => ({ idx: c.idx, header: c.header, samples: c.samples || [] })) });
      if (d.engine === "none") { setAiNote("AI 키가 없어서 이름과 값으로만 맞췄어요."); return; }
      const next = applyAiSuggestions(cols, d.suggestions || []);
      const n = next.filter((c, i) => c.field !== cols[i].field).length;
      setCols(next);
      setAiNote(n ? `AI가 ${n}칸을 더 맞췄어요. 확인해 주세요.` : "AI도 확실한 짝을 못 찾았어요. 그대로 두거나 직접 골라 주세요.");
    } catch (e) { setAiNote(`AI 맞추기 실패: ${e.message}`); } finally { setBusy(""); }
  };

  const missing = missingRequired(cols);
  const dups = duplicateFields(cols);
  const save = async () => {
    if (missing.length) return setErr(`필수 칸을 연결해 주세요: ${missing.map((k) => FIELD_BY_KEY[k].label).join(", ")}`);
    if (dups.length) return setErr(`한 프로그램 칸에 두 시트 칸이 연결돼 있어요: ${dups.join(", ")}`);
    if (!dedupe?.cols?.length) return setErr("중복 확인 칸을 하나 이상 골라 주세요.");
    setBusy("save"); setErr("");
    try {
      const sid = book?.spreadsheetId || initial?.spreadsheetId || ((url.match(/\/d\/([a-zA-Z0-9_-]+)/) || [])[1] || "");
      const p = buildProfile({
        companyName: company, name, sheetUrl: url.trim() || initial?.sheetUrl, spreadsheetId: sid, tabMode,
        tabs: tabMode === "monthly" ? [] : picked, tabPattern: tabMode === "monthly" ? { kind: monthly?.kind || initial?.tabPattern?.kind, sample: monthly?.sample || initial?.tabPattern?.sample } : null,
        header, columns: cols, valueMaps, dedupe,
      });
      const id = await saveSheetProfile({ ...(initial || {}), ...p, id: initial?.id });
      onSaved?.({ id, ...p });
    } catch (e) { setErr(`저장 실패: ${e.message}`); } finally { setBusy(""); }
  };

  const enumCols = cols.filter((c) => ENUM_FIELDS.includes(c.field) && c.mode === "data");
  const dataRows = sample && header ? sample.rows.slice(header.dataStart) : [];
  const counts = { auto: cols.filter((c) => c.field && c.confidence >= 0.8).length, check: cols.filter((c) => c.mode !== "calc" && c.mode !== "ignore" && (!c.field || c.confidence < 0.8)).length, calc: cols.filter((c) => c.mode === "calc").length };

  return (
    <div className="fixed inset-0 z-[95] bg-black/40 flex items-start justify-center overflow-auto p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`${card} w-full max-w-[1280px] my-6 p-6`} data-testid="sheet-wizard">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">GOOGLE SHEETS</div>
            <div className="text-[20px] font-black text-[#0F1A30]">{editing ? "매핑 수정" : title}</div>
          </div>
          <button onClick={onClose} className={`${btn} text-[#5B6B85]`}>닫기</button>
        </div>
        {/* 단계 */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {STEPS.map((s, i) => (
            <button key={s} disabled={i > step || busy} onClick={() => setStep(i)} className={`h-9 px-3.5 rounded-full text-[13.5px] font-black flex items-center gap-2 ${i === step ? "bg-[#0F1A30] text-white" : i < step ? "bg-[#EEF3FF] text-[#2D4C82]" : "bg-[#F4F6F9] text-[#9AA4B5]"}`}>
              <span className={`w-5 h-5 rounded-full text-[11.5px] flex items-center justify-center ${i === step ? "bg-white text-[#0F1A30]" : i < step ? "bg-[#2D4C82] text-white" : "bg-[#DDE2EA] text-white"}`}>{i < step ? "✓" : i + 1}</span>{s}
            </button>
          ))}
        </div>
        {err && <div className="mb-4 px-4 py-3 rounded-xl bg-[#FDECEC] text-[#C2352B] text-[14px] font-bold">{err}</div>}

        {step === 0 && (
          <div className="max-w-[760px]">
            {officeCard}
            <div className="text-[15px] font-black text-[#0F1A30] mb-2">배차일지 구글시트 주소</div>
            <div className="flex gap-2">
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className={inp} data-testid="sheet-url" />
              <button onClick={() => openSheet()} disabled={busy === "tabs"} className={`${btn} bg-[#0F1A30] text-white`}>{busy === "tabs" ? "여는 중…" : "시트 열기"}</button>
            </div>
            <div className="mt-3 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-4 py-3 text-[13.5px] text-[#3A4A66] leading-relaxed">
              시트 <b>공유</b>에 아래 주소를 추가해 주세요. 가져오기만 하면 <b>뷰어</b>, 보내기도 하면 <b>편집자</b>예요.
              <div className="mt-2 flex items-center gap-2">
                <code className="px-2 py-1 rounded-md bg-white border border-[#E3E8F0] text-[13px] text-[#1B2B4B] break-all">{SERVICE_EMAIL}</code>
                <button onClick={() => navigator.clipboard?.writeText(SERVICE_EMAIL)} className="shrink-0 px-2.5 py-1 rounded-md border border-[#DCE3EE] text-[12.5px] font-bold text-[#3A4A66] bg-white">복사</button>
              </div>
            </div>
          </div>
        )}

        {step === 1 && book && (
          <div>
            {officeCard}
            <div className="text-[15px] font-black text-[#0F1A30] mb-1">{book.title} <span className="text-[#7A8AA6] font-bold">· 탭 {book.tabs.length}개</span></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-4">
              {[["single", "탭 하나", "한 탭에 모든 오더를 적어요"], ["monthly", "월별 탭 자동", monthly ? `${monthly.tabs.map((t) => t.title).slice(-3).join(" · ")} 처럼 달마다 탭. 상차일로 탭을 골라요` : "달 이름 탭을 못 찾았어요"], ["all", "전체 탭 합치기", "고른 탭을 모두 읽어 한 번에 가져와요"]].map(([k, l, d]) => (
                <button key={k} disabled={k === "monthly" && !monthly} onClick={() => { setTabMode(k); if (k === "monthly" && monthly) setPicked(monthly.tabs.map((t) => t.title)); }} className={`text-left p-4 rounded-2xl border-2 disabled:opacity-40 ${tabMode === k ? "border-[#2D4C82] bg-[#F5F8FF]" : "border-[#E3E8F0] bg-white"}`}>
                  <div className="text-[15px] font-black text-[#0F1A30]">{l}</div>
                  <div className="text-[13px] text-[#5B6B85] mt-1 leading-snug">{d}</div>
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-[#E3E8F0] overflow-hidden">
              <table className="w-full text-[14px]">
                <thead className="bg-[#F7F9FC] text-[#5B6B85] text-[13px]"><tr><th className="w-12 py-2.5"></th><th className="text-left px-3">탭 이름</th><th className="text-right px-3">줄 수</th><th className="text-right px-3">칸 수</th><th className="text-left px-3">구분</th><th className="px-3 text-left">머리줄 보기</th></tr></thead>
                <tbody>
                  {book.tabs.map((t) => {
                    const isMonth = monthly?.tabs.some((x) => x.title === t.title);
                    const on = picked.includes(t.title);
                    return (
                      <tr key={t.title} className="border-t border-[#EEF1F6]">
                        <td className="text-center py-2">
                          <input type={tabMode === "single" ? "radio" : "checkbox"} checked={on} disabled={tabMode === "monthly"} onChange={() => setPicked((p) => (tabMode === "single" ? [t.title] : on ? p.filter((x) => x !== t.title) : [...p, t.title]))} className="w-[18px] h-[18px] accent-[#1B2B4B]" />
                        </td>
                        <td className="px-3 font-bold text-[#0F1A30]">{t.title}</td>
                        <td className="px-3 text-right tabular-nums">{(t.rows || 0).toLocaleString()}</td>
                        <td className="px-3 text-right tabular-nums">{t.cols || 0}</td>
                        <td className="px-3">{isMonth ? <span className="px-2 py-0.5 rounded-md bg-[#EEF3FF] text-[#2D4C82] text-[12px] font-black">월별 탭</span> : <span className="text-[#9AA4B5] text-[13px]">-</span>}</td>
                        <td className="px-3"><input type="radio" name="sampletab" checked={sampleTab === t.title} onChange={() => setSampleTab(t.title)} className="w-4 h-4 accent-[#2D4C82]" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setStep(0)} className={`${btn} border border-[#DCE3EE] text-[#3A4A66]`}>이전</button>
              <button onClick={goTabs} disabled={busy === "sample"} className={`${btn} bg-[#0F1A30] text-white`}>{busy === "sample" ? "읽는 중…" : "다음"}</button>
            </div>
          </div>
        )}

        {step === 2 && sample && header && (
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <div className="text-[15px] font-black text-[#0F1A30]">‘{sample.tab}’ 탭 앞부분</div>
              <div className="text-[13.5px] text-[#5B6B85]">{header.titleRows?.length ? `제목 줄 ${header.titleRows.length}개를 건너뛰고 ` : ""}{header.headerRow + 1}번째 줄을 머리줄로 찾았어요{header.depth === 2 ? "(두 줄)" : ""}.</div>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[13px] font-bold text-[#3A4A66]">머리줄</span>
                <CustomSelect value={header.headerRow} onChange={(e) => setHeaderRow(+e.target.value, header.depth)} className={`${sel} w-[110px]`}>
                  {sample.rows.slice(0, 20).map((_, i) => <option key={i} value={i}>{i + 1}번째 줄</option>)}
                </CustomSelect>
                <label className="flex items-center gap-1.5 text-[13px] font-bold text-[#3A4A66]"><input type="checkbox" checked={header.depth === 2} onChange={(e) => setHeaderRow(header.headerRow, e.target.checked ? 2 : 1)} className="w-4 h-4 accent-[#1B2B4B]" />두 줄 머리줄</label>
              </div>
            </div>
            <div className="rounded-xl border border-[#E3E8F0] overflow-auto max-h-[460px]">
              <table className="text-[13px] border-collapse">
                <thead className="sticky top-0 bg-[#F7F9FC] z-10"><tr><th className="w-12 px-2 py-1.5 text-[#9AA4B5]"></th>{(sample.rows[header.headerRow] || []).map((_, i) => <th key={i} className="px-2 py-1.5 text-[#9AA4B5] font-bold min-w-[84px]">{colLetter(i)}</th>)}</tr></thead>
                <tbody>
                  {sample.rows.slice(0, Math.min(sample.rows.length, header.dataStart + 8)).map((r, i) => {
                    const isHead = i >= header.headerRow && i < header.headerRow + header.depth;
                    const isTitle = i < header.headerRow;
                    return (
                      <tr key={i} className={isHead ? "bg-[#EAF1FF]" : isTitle ? "bg-[#FAFAFB]" : ""}>
                        <td className={`px-2 py-1.5 text-right font-bold ${isHead ? "text-[#2D4C82]" : "text-[#B4BDCB]"}`}>{i + 1}</td>
                        {(sample.rows[header.headerRow] || r).map((_, j) => {
                          const v = String(r[j] ?? "");
                          return <td key={j} className={`px-2 py-1.5 border-t border-[#EEF1F6] whitespace-nowrap max-w-[180px] truncate ${isHead ? "font-black text-[#0F1A30]" : isTitle ? "text-[#9AA4B5]" : /^#/.test(v) ? "text-[#C2352B] font-bold" : "text-[#3A4A66]"}`}>{v}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setStep(1)} className={`${btn} border border-[#DCE3EE] text-[#3A4A66]`}>이전</button>
              <button onClick={() => setStep(3)} className={`${btn} bg-[#0F1A30] text-white`}>다음</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="px-3 h-8 inline-flex items-center rounded-full bg-[#E8F7EF] text-[#0F7A43] text-[13px] font-black">자동 {counts.auto}</span>
              <span className="px-3 h-8 inline-flex items-center rounded-full bg-[#FFF6E5] text-[#A35F00] text-[13px] font-black">확인 필요 {counts.check}</span>
              <span className="px-3 h-8 inline-flex items-center rounded-full bg-[#F1F3F7] text-[#5B6B85] text-[13px] font-black">계산열 {counts.calc}</span>
              {missing.length ? <span className="px-3 h-8 inline-flex items-center rounded-full bg-[#FDECEC] text-[#C2352B] text-[13px] font-black">필수 칸 없음: {missing.map((k) => FIELD_BY_KEY[k].label).join(", ")}</span> : <span className="px-3 h-8 inline-flex items-center rounded-full bg-[#EEF3FF] text-[#2D4C82] text-[13px] font-black">필수 칸 확인 완료</span>}
              <div className="ml-auto flex items-center gap-2">
                {aiNote && <span className="text-[13px] font-bold text-[#5B6B85]">{aiNote}</span>}
                <button onClick={runAi} disabled={busy === "ai"} className={`${btn} h-9 border border-[#C9D6F2] text-[#2D4C82] bg-[#F5F8FF]`}>{busy === "ai" ? "AI 확인 중…" : "AI로 나머지 맞추기"}</button>
              </div>
            </div>
            <div className="text-[13px] text-[#7A8AA6] mb-2">계산열(수식 · #REF! · 조회 칸)은 가져오지도, 덮어쓰지도 않아요. 읽기전용은 중복 확인에만 써요.</div>
            <div className="rounded-xl border border-[#E3E8F0] overflow-auto max-h-[560px]" data-testid="mapping-table">
              <table className="w-full text-[14px]">
                <thead className="sticky top-0 bg-[#F7F9FC] text-[#5B6B85] text-[13px] z-10">
                  <tr><th className="px-3 py-2.5 w-12 text-left">열</th><th className="px-3 text-left">시트 칸</th><th className="px-3 text-left">예시 값</th><th className="px-3 text-left w-[170px]">프로그램 칸</th><th className="px-3 text-left w-[150px]">처리</th><th className="px-3 text-left w-[110px]">확신도</th><th className="px-3 text-left w-[170px]">값 바꾸기</th></tr>
                </thead>
                <tbody>
                  {cols.map((c) => {
                    const f = FIELD_BY_KEY[c.field];
                    const samples = (c.samples?.length ? c.samples : dataRows.map((r) => String(r?.[c.idx] ?? "").trim()).filter(Boolean)).slice(0, 3);
                    const dim = c.mode === "calc" || c.mode === "ignore";
                    return (
                      <tr key={c.idx} className={`border-t border-[#EEF1F6] ${dim ? "bg-[#FAFBFC]" : ""}`}>
                        <td className="px-3 py-2 font-black text-[#9AA4B5]">{colLetter(c.idx)}</td>
                        <td className="px-3 font-black text-[#0F1A30] whitespace-nowrap">{c.header || <span className="text-[#B4BDCB] font-bold">(이름 없음)</span>}</td>
                        <td className="px-3 text-[13px] text-[#5B6B85] max-w-[260px]"><div className="truncate">{samples.map((s, i) => <span key={i} className={`mr-2 ${/^#/.test(s) ? "text-[#C2352B] font-bold" : ""}`}>{s}</span>)}</div></td>
                        <td className="px-3"><CustomSelect value={c.field} onChange={(e) => pickField(c, e.target.value)} className={`${sel} w-full`}>
                          <option value="">연결 안 함</option>
                          {PROGRAM_FIELDS.map((x) => <option key={x.key} value={x.key}>{x.label}{x.req ? " (필수)" : ""}</option>)}
                        </CustomSelect></td>
                        <td className="px-3"><CustomSelect value={c.mode} onChange={(e) => setCol(c.idx, { mode: e.target.value, source: "user" })} className={`${sel} w-full`}>
                          {MODES.filter(([k]) => k !== "data" || c.field).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </CustomSelect></td>
                        <td className="px-3"><Badge c={c} /></td>
                        <td className="px-3">
                          {f?.type === "date" && c.mode === "data" && (
                            <div className="flex items-center gap-1.5">
                              <CustomSelect value={c.transform?.date || "auto"} onChange={(e) => setCol(c.idx, { transform: { ...c.transform, date: e.target.value } })} className={`${sel} w-[96px]`}>
                                <option value="auto">자동</option><option value="mdy">월/일</option><option value="dmy">일/월</option>
                              </CustomSelect>
                              <label className="text-[12.5px] font-bold text-[#5B6B85] flex items-center gap-1 whitespace-nowrap" title="빈 칸이면 윗줄 날짜"><input type="checkbox" checked={!!c.transform?.fillDown} onChange={(e) => setCol(c.idx, { transform: { ...c.transform, fillDown: e.target.checked } })} className="accent-[#1B2B4B]" />위 값</label>
                            </div>
                          )}
                          {f?.type === "money" && c.mode === "data" && (
                            <CustomSelect value={c.transform?.unit || "원"} onChange={(e) => setCol(c.idx, { transform: { ...c.transform, unit: e.target.value } })} className={`${sel} w-[110px]`}>
                              <option value="원">원 단위</option><option value="천원">천원 단위</option><option value="만원">만원 단위</option>
                            </CustomSelect>
                          )}
                          {ENUM_FIELDS.includes(c.field) && c.mode === "data" && <span className="text-[12.5px] font-bold text-[#2D4C82]">아래 표에서</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* 값 바꾸기(지급방식 · 배차방식 · 배차상태) */}
            {enumCols.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-4">
                {enumCols.map((c) => {
                  const vals = distinctValues(dataRows, c.idx, 12);
                  const table = { ...(DEFAULT_VALUE_MAPS[c.field] || {}), ...(valueMaps[c.field] || {}) };
                  return (
                    <div key={c.idx} className="rounded-xl border border-[#E3E8F0] p-3">
                      <div className="text-[14px] font-black text-[#0F1A30] mb-2">{c.header} → {FIELD_BY_KEY[c.field].label}</div>
                      {!vals.length && <div className="text-[13px] text-[#9AA4B5]">예시 값이 없어요</div>}
                      {vals.map(([v, n]) => {
                        const hit = Object.entries(table).find(([k]) => norm(k) === norm(v));
                        const cur = hit ? hit[1] : (ENUM_OPTIONS[c.field].find((o) => norm(o) === norm(v)) || "__keep");
                        const warn = !!mapEnum(c.field, v, valueMaps).warn;
                        return (
                          <div key={v} className="flex items-center gap-2 py-1">
                            <span className={`flex-1 min-w-0 truncate text-[13.5px] font-bold ${warn ? "text-[#A35F00]" : "text-[#3A4A66]"}`}>{v} <span className="text-[#B4BDCB] font-semibold">{n}건</span></span>
                            <span className="text-[#B4BDCB]">→</span>
                            <CustomSelect value={cur} onChange={(e) => setValueMaps((m) => ({ ...m, [c.field]: { ...(m[c.field] || {}), [v]: e.target.value } }))} className={`${sel} w-[140px]`}>
                              {ENUM_OPTIONS[c.field].map((o) => <option key={o} value={o}>{o}</option>)}
                              {SPECIAL_TARGETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </CustomSelect>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              {!editing && <button onClick={() => setStep(2)} className={`${btn} border border-[#DCE3EE] text-[#3A4A66]`}>이전</button>}
              <button onClick={() => { if (missing.length) return setErr(`필수 칸을 연결해 주세요: ${missing.map((k) => FIELD_BY_KEY[k].label).join(", ")}`); setErr(""); setStep(4); }} className={`${btn} bg-[#0F1A30] text-white`}>다음</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <label className="block mb-4"><span className="text-[14px] font-black text-[#0F1A30]">연결 이름</span><input value={name} onChange={(e) => setName(e.target.value)} className={`${inp} mt-1.5`} placeholder="예: 배차현황 시트" /></label>
              <div className="text-[14px] font-black text-[#0F1A30] mb-1">중복 확인 칸</div>
              <div className="text-[13px] text-[#7A8AA6] mb-2">같은 줄을 두 번 가져오지 않게, 줄마다 다른 값이 든 칸을 골라요. 순번+날짜처럼 여러 칸도 돼요.</div>
              <div className="flex flex-wrap gap-1.5">
                {cols.filter((c) => c.mode !== "calc" && c.mode !== "ignore" && c.header).map((c) => {
                  const on = dedupe?.cols?.includes(c.idx);
                  return <button key={c.idx} onClick={() => setDedupe((d) => { const cs = on ? (d?.cols || []).filter((x) => x !== c.idx) : [...(d?.cols || []), c.idx]; return { cols: cs, label: cs.map((i) => cols.find((x) => x.idx === i)?.header).join("+") }; })}
                    className={`h-9 px-3 rounded-lg text-[13.5px] font-bold border ${on ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`}>{c.header}</button>;
                })}
              </div>
            </div>
            <div className="rounded-2xl bg-[#F7F9FC] border border-[#E3E8F0] p-4 text-[14px] text-[#3A4A66] leading-relaxed">
              <div className="text-[15px] font-black text-[#0F1A30] mb-2">이렇게 연결해요</div>
              <div>탭: <b>{tabMode === "monthly" ? `월별 탭 자동(${monthly?.kind || initial?.tabPattern?.kind || ""})` : tabMode === "all" ? `전체 탭 합치기(${picked.length}개)` : picked[0]}</b></div>
              <div>머리줄: <b>{(header?.headerRow ?? 0) + 1}번째 줄{header?.depth === 2 ? "(두 줄)" : ""}</b></div>
              <div>가져오기·보내기 칸: <b>{cols.filter((c) => c.mode === "data").length}개</b> · 계산열(안 씀): <b>{counts.calc}개</b></div>
              <div>중복 확인: <b>{dedupe?.label || "-"}</b></div>
              <div className="mt-2 text-[13px] text-[#7A8AA6]">프로그램이 기준이에요. 보내기는 연결한 칸만 쓰고, 수식 칸과 연결 안 한 칸은 절대 덮어쓰지 않아요.</div>
            </div>
            <div className="lg:col-span-2 flex justify-end gap-2">
              <button onClick={() => setStep(3)} className={`${btn} border border-[#DCE3EE] text-[#3A4A66]`}>이전</button>
              <button onClick={save} disabled={busy === "save"} className={`${btn} bg-[#2D4C82] text-white px-7`}>{busy === "save" ? "저장 중…" : "시트 프로필 저장"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
