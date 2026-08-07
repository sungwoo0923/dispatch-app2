// ===================== src/RateCard.jsx =====================
import React, { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { db } from "./firebase";
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, serverTimestamp } from "firebase/firestore";

// 단가표 메뉴 전체에서 쓰는 표준 차량톤수 목록 — 다목적지 단가표의 기본(삭제 불가) 컬럼으로도 사용된다.
const STANDARD_TON_LABELS = ["다마스/라보","1톤","1.4톤","2.5톤","3.5톤","3.5톤광폭","5톤","5톤축","5톤플축","8톤","11톤","11톤축","15톤","18톤","25톤"];

const COMPANY = {
  name: "RUN25",
  manager: "박성우 팀장",
  phone: "010-5504-1821",
  email: "sungwoo0923@nate.com",
  address: "인천 서구 청마로19번길 21 (성주빌딩) 4층",
  tel: "1533-2525",
};

const TON_BUCKETS = [
  { label: "다마스/라보", min: 0,    max: 0.6,  display: "다마스/라보" },
  { label: "1톤",         min: 0.6,  max: 1.2,  display: "1톤" },
  { label: "1.4톤",       min: 1.2,  max: 1.9,  display: "1.4톤" },
  { label: "2.5톤",       min: 1.9,  max: 3.0,  display: "2.5톤" },
  { label: "3.5톤",       min: 3.0,  max: 4.5,  display: "3.5톤" },
  { label: "5톤",         min: 4.5,  max: 6.5,  display: "5톤" },
  { label: "7.5톤",       min: 6.5,  max: 9.5,  display: "7.5톤" },
  { label: "11톤",        min: 9.5,  max: 13.5, display: "11톤" },
  { label: "15톤",        min: 13.5, max: 17.0, display: "15톤" },
  { label: "18톤",        min: 17.0, max: 22.0, display: "18톤" },
  { label: "25톤",        min: 22.0, max: 99,   display: "25톤" },
];

const VEHICLE_GROUPS = [
  { label: "냉장/냉동 (탑·윙)", value: "COLD",  keywords: ["냉장","냉동"] },
  { label: "카고/윙바디/탑차",   value: "TRUCK", keywords: ["카고","윙바디","탑차","윙"] },
  { label: "다마스/라보",        value: "SMALL", keywords: ["다마스","라보"] },
  { label: "오토바이",           value: "BIKE",  keywords: ["오토바이"] },
  { label: "리프트",             value: "LIFT",  keywords: ["리프트"] },
];

const clean = (s) => String(s || "").replace(/\s/g, "").toLowerCase();
const extractTon = (text) => { const m = String(text||"").replace(/톤|t/gi,"").match(/(\d+(\.\d+)?)/); return m ? Number(m[1]) : null; };
const getTonBucket = (t) => { if (t==null) return null; return TON_BUCKETS.find(b => t>=b.min && t<b.max)||null; };

// 파렛트 수 추출 (3파, 3p, 3파렛, 3파렛트, 3파레트 등 통합)
const extractPallet = (text) => {
  const s = String(text || "").replace(/\s/g, "").toLowerCase();
  const m = s.match(/(\d+)\s*(파레트|파렛트|파렛|파레|파|pallet|p)/i);
  return m ? Number(m[1]) : null;
};

// 파렛수 버킷 (1~18파렛)
const PALLET_BUCKETS = Array.from({ length: 18 }, (_, i) => ({
  label: `${i + 1}파렛`,
  count: i + 1,
  display: `${i + 1}파렛`,
}));
const getVehicleGroup = (v) => { const s=String(v||"").toLowerCase(); for (const g of VEHICLE_GROUPS) { if (g.keywords.some(k=>s.includes(k))) return g.value; } return "ETC"; };
const roundDown10k = (n) => Math.floor(n/10000)*10000;

const trimmedStats = (fares, rawRows) => {
  if (!fares.length) return null;
  if (fares.length <= 2) {
    const avg = roundDown10k(fares.reduce((a,b)=>a+b,0)/fares.length);
    return { avg, min:Math.min(...fares), max:Math.max(...fares), count:fares.length, trimmed:false, variance:0, rows:rawRows };
  }
  const sorted = [...fares].sort((a,b)=>a-b);
  const q1=sorted[Math.floor(sorted.length*0.25)], q3=sorted[Math.floor(sorted.length*0.75)];
  const iqr=q3-q1, lo=q1-1.5*iqr, hi=q3+1.5*iqr;
  const filtered=sorted.filter(v=>v>=lo&&v<=hi);
  const useFares=filtered.length>=2?filtered:sorted;
  const avg=roundDown10k(useFares.reduce((a,b)=>a+b,0)/useFares.length);
  return { avg, min:Math.min(...fares), max:Math.max(...fares), count:fares.length, trimmedCount:useFares.length, trimmed:useFares.length<fares.length, variance:avg>0?Math.round(((Math.max(...useFares)-Math.min(...useFares))/avg)*100):0, rows:rawRows };
};

const confidence = (c) => {
  if (c>=10) return { label:"높음", color:"text-gray-700", bg:"bg-gray-100 border-gray-300" };
  if (c>=4)  return { label:"보통", color:"text-gray-600",   bg:"bg-gray-100 border-gray-200" };
  return           { label:"낮음", color:"text-gray-500",    bg:"bg-gray-50 border-gray-200" };
};

function OrderDetailModal({ rows, bucket, fareField, onClose }) {
  if (!rows||!rows.length) return null;
  const avgFare = roundDown10k(rows.reduce((s,r)=>s+Number(String(r.청구운임||0).replace(/[^\d]/g,"")),0)/rows.length);
  const avgDriver = roundDown10k(rows.reduce((s,r)=>s+Number(String(r.기사운임||0).replace(/[^\d]/g,"")),0)/rows.length);
  const avgMargin = roundDown10k(rows.reduce((s,r)=>{const f=Number(String(r.청구운임||0).replace(/[^\d]/g,"")); const d=Number(String(r.기사운임||0).replace(/[^\d]/g,"")); return s+(f-d);},0)/rows.length);
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[999999]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[820px] max-h-[82vh] overflow-hidden flex flex-col" onClick={e=>e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-[15px]">{bucket} 구간 상세 내역</h3>
            <p className="text-white/60 text-[12px] mt-0.5">총 {rows.length}건 · {fareField} 기준</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                {["상차일","거래처","상차지","하차지","차량","톤수","화물","청구운임","기사운임","수수료","혼적"].map(h=>(
                  <th key={h} className="px-3 py-2.5 text-center font-semibold text-gray-600 text-[12px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r,i)=>{
                const fare=Number(String(r.청구운임||0).replace(/[^\d]/g,"")); const driver=Number(String(r.기사운임||0).replace(/[^\d]/g,"")); const margin=fare-driver;
                return (
                  <tr key={i} className={`hover:bg-blue-50/40 transition ${i%2===0?"bg-white":"bg-gray-50/40"}`}>
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-500 whitespace-nowrap">{r.상차일||"-"}</td>
                    <td className="px-3 py-2.5 text-center text-[13px] font-medium text-gray-800 whitespace-nowrap">{r.거래처명||"-"}</td>
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-600 max-w-[80px] truncate" title={r.상차지명}>{r.상차지명||"-"}</td>
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-600 max-w-[80px] truncate" title={r.하차지명}>{r.하차지명||"-"}</td>
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-600 whitespace-nowrap">{r.차량종류||"-"}</td>
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-600 whitespace-nowrap">{r.차량톤수||"-"}</td>
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-600 whitespace-nowrap">{r.화물내용||"-"}</td>
                    <td className="px-3 py-2.5 text-center text-[13px] font-bold text-blue-700 whitespace-nowrap">{fare.toLocaleString()}원</td>
                    <td className="px-3 py-2.5 text-center text-[13px] text-emerald-600 font-medium whitespace-nowrap">{driver.toLocaleString()}원</td>
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-500 whitespace-nowrap">{margin.toLocaleString()}원</td>
                    <td className="px-3 py-2.5 text-center">
                      {r.혼적 ? <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[11px] font-semibold">혼적</span>
                               : <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[11px]">독차</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex gap-6 text-[12px] text-gray-600">
          <span>평균 청구: <b className="text-blue-700">{avgFare.toLocaleString()}원</b></span>
          <span>평균 기사: <b className="text-emerald-600">{avgDriver.toLocaleString()}원</b></span>
          <span>평균 수수료: <b className="text-gray-800">{avgMargin.toLocaleString()}원</b></span>
        </div>
      </div>
    </div>
  );
}

export default function RateCard({ dispatchData = [], userCompany = "" }) {
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [vGroup, setVGroup] = useState("");
  const [mixedFilter, setMixedFilter] = useState("전체");
  const [fareField, setFareField] = useState("청구운임");
  const [result, setResult] = useState(null);
  const [searched, setSearched] = useState(false);
const [detailModal, setDetailModal] = useState(null);
  const [viewMode, setViewMode] = useState("톤수별"); // 톤수별 | 파렛수별
  const [printHistory, setPrintHistory] = useState(() => JSON.parse(localStorage.getItem("rateCardHistory") || "[]"));
  const [historyModal, setHistoryModal] = useState(false);
  const [historySelected, setHistorySelected] = useState(new Set());
  const [historyDetailModal, setHistoryDetailModal] = useState(null); // history entry to show
  // 🔥 거래처 제외 필터
  const [excludeQuery, setExcludeQuery] = useState("");
  const [excludeList, setExcludeList] = useState([]);       // 제외할 거래처명 배열
  const [excludeDropdown, setExcludeDropdown] = useState([]); // 검색 드롭다운 후보
  const excludeRef = useRef(null);

  // ===================== 다목적지 단가표 (기준지 1곳 → 하차지 여러 곳 × 차량톤수별 단가) =====================
  // 거래처별로 Firestore(multiRateSheets)에 저장해 다른 직원도 보고 언제든 수정할 수 있게 한다.
  const [pageMode, setPageMode] = useState("노선별"); // 노선별 | 다목적지
  const [multiSheets, setMultiSheets] = useState([]);
  const [multiSelectedId, setMultiSelectedId] = useState(null);
  const [multiUploadOpen, setMultiUploadOpen] = useState(false);
  const [multiSaving, setMultiSaving] = useState(false);
  const multiFileRef = useRef(null);

  useEffect(() => {
    const co = (userCompany || "").trim();
    if (!co) { setMultiSheets([]); return; }
    const q = query(collection(db, "multiRateSheets"), where("companyName", "==", co));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      setMultiSheets(list);
    }, () => {});
    return () => unsub();
  }, [userCompany]);

  const selectedSheet = multiSheets.find(s => s.id === multiSelectedId) || null;
  const uid = () => Math.random().toString(36).slice(2, 10);

  const createMultiSheet = async () => {
    const co = (userCompany || "").trim();
    if (!co) { alert("회사 정보를 확인할 수 없습니다."); return; }
    setMultiSaving(true);
    try {
      const ref = await addDoc(collection(db, "multiRateSheets"), {
        companyName: co,
        baseName: "새 기준지",
        baseAddress: "",
        note: "",
        // 단가표 메뉴 표준 차량톤수를 기본 컬럼으로 항상 포함 — 삭제 불가, 이름 고정.
        // 필요한 톤수만 값을 채우고 나머지는 비워두면 된다. 목록에 없는 구간은 "+ 구간 추가"로 늘리면 된다.
        columns: STANDARD_TON_LABELS.map(label => ({ id: uid(), label, isDefault: true })),
        rows: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setMultiSelectedId(ref.id);
    } catch (e) {
      console.error(e); alert("단가표 생성에 실패했습니다.");
    } finally { setMultiSaving(false); }
  };

  const patchSheet = (id, patch) => {
    updateDoc(doc(db, "multiRateSheets", id), { ...patch, updatedAt: serverTimestamp() }).catch(e => console.error(e));
  };

  const removeMultiSheet = async (id) => {
    if (!window.confirm("이 단가표를 삭제할까요?")) return;
    try {
      await deleteDoc(doc(db, "multiRateSheets", id));
      if (multiSelectedId === id) setMultiSelectedId(null);
    } catch (e) { console.error(e); alert("삭제에 실패했습니다."); }
  };

  const addMultiColumn = () => {
    if (!selectedSheet) return;
    patchSheet(selectedSheet.id, { columns: [...(selectedSheet.columns || []), { id: uid(), label: "새 구간" }] });
  };
  const removeMultiColumn = (colId) => {
    if (!selectedSheet) return;
    const target = (selectedSheet.columns || []).find(c => c.id === colId);
    if (target?.isDefault) return; // 기본 톤수 컬럼은 삭제 불가
    const nextCols = (selectedSheet.columns || []).filter(c => c.id !== colId);
    const nextRows = (selectedSheet.rows || []).map(r => {
      const prices = { ...(r.prices || {}) };
      delete prices[colId];
      return { ...r, prices };
    });
    patchSheet(selectedSheet.id, { columns: nextCols, rows: nextRows });
  };
  const updateMultiColumnLabel = (colId, label) => {
    if (!selectedSheet) return;
    const target = (selectedSheet.columns || []).find(c => c.id === colId);
    if (target?.isDefault) return; // 기본 톤수 컬럼은 이름 고정
    patchSheet(selectedSheet.id, { columns: (selectedSheet.columns || []).map(c => c.id === colId ? { ...c, label } : c) });
  };
  // 컬럼 순서 이동(좌/우) — 값은 컬럼 id로 저장되어 있어 순서만 바뀌고 데이터는 그대로 따라간다.
  const moveMultiColumn = (colId, dir) => {
    if (!selectedSheet) return;
    const cols = [...(selectedSheet.columns || [])];
    const idx = cols.findIndex(c => c.id === colId);
    const nextIdx = idx + dir;
    if (idx < 0 || nextIdx < 0 || nextIdx >= cols.length) return;
    [cols[idx], cols[nextIdx]] = [cols[nextIdx], cols[idx]];
    patchSheet(selectedSheet.id, { columns: cols });
  };

  const addMultiRow = () => {
    if (!selectedSheet) return;
    patchSheet(selectedSheet.id, { rows: [...(selectedSheet.rows || []), { id: uid(), name: "", address: "", prices: {} }] });
  };
  const removeMultiRow = (rowId) => {
    if (!selectedSheet) return;
    patchSheet(selectedSheet.id, { rows: (selectedSheet.rows || []).filter(r => r.id !== rowId) });
  };
  const updateMultiRowField = (rowId, field, value) => {
    if (!selectedSheet) return;
    patchSheet(selectedSheet.id, { rows: (selectedSheet.rows || []).map(r => r.id === rowId ? { ...r, [field]: value } : r) });
  };
  const updateMultiRowPrice = (rowId, colId, value) => {
    if (!selectedSheet) return;
    const n = String(value).replace(/[^\d]/g, "");
    patchSheet(selectedSheet.id, { rows: (selectedSheet.rows || []).map(r => r.id === rowId ? { ...r, prices: { ...(r.prices || {}), [colId]: n } } : r) });
  };

  const normColLabel = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();

  // 업로드 양식(템플릿) 다운로드 — 현재 단가표의 컬럼명을 헤더로 그대로 내려주므로,
  // 값만 채워서 업로드하면 컬럼명이 100% 일치해 정확히 매칭된다.
  const downloadMultiTemplate = (sheet) => {
    if (!sheet) return;
    const header = ["하차지", "주소", ...(sheet.columns || []).map(c => c.label)];
    const example = ["예: 쿠팡(인천13센터)", "인천 서구 북항로 28-23", ...(sheet.columns || []).map(() => "")];
    const ws = XLSX.utils.aoa_to_sheet([header, example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "단가표양식");
    XLSX.writeFile(wb, `단가표_업로드양식_${sheet.baseName || "기준지"}.xlsx`);
  };

  // 엑셀 파일 업로드 — 1열:하차지명 2열:주소 3열부터:톤수별 단가.
  // 헤더(1행)의 톤수명을 현재 컬럼명과 정확히 매칭해 해당 컬럼에만 값을 넣는다.
  // 매칭되는 컬럼이 없으면(예: 표준 목록에 없는 톤수) 새 컬럼을 만들어 추가한다 — 데이터 유실 방지.
  const handleMultiFileUpload = (file) => {
    if (!selectedSheet || !file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (!rows.length) { alert("빈 파일입니다."); return; }
        const header = rows[0].map(h => String(h || "").trim());
        const headerLabels = header.slice(2).filter(h => h);
        if (!headerLabels.length) { alert("3번째 열부터 톤수(구간) 이름이 있어야 합니다. 업로드 양식을 먼저 다운로드해 사용해주세요."); return; }

        let columns = [...(selectedSheet.columns || [])];
        // 헤더의 각 톤수명을 기존 컬럼명과 정확히 매칭 → 없으면 새 컬럼(삭제 가능) 추가
        const colForHeaderIdx = headerLabels.map(label => {
          let col = columns.find(c => normColLabel(c.label) === normColLabel(label));
          if (!col) { col = { id: uid(), label, isDefault: false }; columns = [...columns, col]; }
          return col;
        });

        const dataRows = rows.slice(1).filter(r => String(r[0] || "").trim());
        const newRows = dataRows.map(r => {
          const prices = {};
          colForHeaderIdx.forEach((col, i) => {
            const raw = String(r[i + 2] ?? "").replace(/[^\d]/g, "");
            if (raw) prices[col.id] = raw;
          });
          return { id: uid(), name: String(r[0] || "").trim(), address: String(r[1] || "").trim(), prices };
        });
        if (!newRows.length) { alert("인식할 수 있는 데이터가 없습니다. 1열(하차지명)이 비어있지 않은지 확인해주세요."); return; }

        const doReplace = (selectedSheet.rows || []).length === 0 || window.confirm(`기존에 등록된 하차지 ${selectedSheet.rows.length}곳이 있습니다.\n확인: 업로드한 내용으로 전체 교체 / 취소: 기존 목록 뒤에 추가`);
        const finalRows = doReplace ? newRows : [...(selectedSheet.rows || []), ...newRows];
        patchSheet(selectedSheet.id, { columns, rows: finalRows });
        setMultiUploadOpen(false);
      } catch (e) {
        console.error(e); alert("엑셀 파싱 중 오류가 발생했습니다. 업로드 양식 형식을 확인해주세요.");
      } finally {
        if (multiFileRef.current) multiFileRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleMultiPrint = (sheet) => {
    if (!sheet) return;
    const todayStr = new Date().toLocaleDateString("ko-KR");
    const cols = sheet.columns || [];
    const esc = (s) => String(s || "").replace(/</g, "&lt;");
    const fileBase = `단가표_${(sheet.baseName || "기준지").replace(/[\\/:*?"<>|]/g, "")}`;
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>${esc(sheet.baseName)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Malgun Gothic',sans-serif;}
body{background:#f3f4f6;color:#111;}
.wrapper{width:max-content;min-width:100%;margin:0 auto;padding:36px 40px;background:white;}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:3px solid #1B2B4B;}
.doc-title{font-size:20px;font-weight:900;color:#1B2B4B;}
.doc-sub{font-size:12px;color:#666;margin-top:4px;}
.base-bar{display:flex;gap:16px;align-items:center;background:#F0F4FF;border:1px solid #C7D9FF;border-radius:10px;padding:12px 18px;margin-bottom:18px;font-size:12.5px;color:#374151;white-space:nowrap;}
.base-bar b{color:#1B2B4B;}
.notice{white-space:pre-wrap;margin-bottom:16px;padding:12px 16px;background:#F8FAFF;border:1px solid #E0E7FF;border-radius:8px;font-size:11.5px;color:#374151;line-height:1.75;}
table{border-collapse:collapse;font-size:12px;border:1px solid #C6CCD8;}
thead tr{background:#1B2B4B;}
thead th{color:white;padding:8px 9px;text-align:center;font-weight:700;white-space:nowrap;border:1px solid #2c3d61;}
tbody tr:nth-child(even){background:#F9FAFB;}
td{padding:7px 9px;text-align:center;border:1px solid #D9DEE8;white-space:nowrap;}
.td-name{font-weight:700;color:#1B2B4B;text-align:left;}
.td-addr{color:#6B7280;font-size:11px;text-align:left;white-space:nowrap;}
.td-price{font-weight:800;color:#2563EB;}
.footer{margin-top:24px;font-size:10.5px;color:#aaa;}
@media print{
  .no-print{display:none!important;}
  @page{size:A4 landscape;margin:10mm;}
  body{background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  table{font-size:10.5px;}
  td,th{padding:5px 7px;}
}
</style></head><body>
<div class="no-print" id="toolbar" style="padding:14px 40px;display:flex;justify-content:flex-end;gap:8px;">
  <button onclick="window.print()" style="padding:8px 20px;background:#1B2B4B;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">인쇄</button>
  <button id="pdfBtn" onclick="savePDF()" style="padding:8px 20px;background:#2563EB;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">PDF 저장</button>
  <button id="imgBtn" onclick="saveImage()" style="padding:8px 20px;background:#059669;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">이미지 저장</button>
</div>
<div class="wrapper" id="captureArea">
<div class="header"><div><div class="doc-title">운송 단가표</div><div class="doc-sub">발행일: ${todayStr}</div></div></div>
<div class="base-bar"><span>기준지 <b>${esc(sheet.baseName) || "-"}</b></span>${sheet.baseAddress ? `<span>${esc(sheet.baseAddress)}</span>` : ""}</div>
${sheet.note ? `<div class="notice">${esc(sheet.note)}</div>` : ""}
<table>
  <thead><tr><th style="text-align:left;">하차지</th><th style="text-align:left;">주소</th>${cols.map(c => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>
  <tbody>${(sheet.rows || []).map(r => `<tr>
    <td class="td-name">${esc(r.name) || "-"}</td>
    <td class="td-addr">${esc(r.address)}</td>
    ${cols.map(c => { const v = Number(r.prices?.[c.id] || 0); return `<td class="td-price">${v ? v.toLocaleString() + "원" : "-"}</td>`; }).join("")}
  </tr>`).join("")}</tbody>
</table>
<div class="footer">본 자료는 영업 참고용이며 정식 계약서가 아닙니다.</div>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script>
  function withHiddenToolbar(fn) {
    var toolbar = document.getElementById('toolbar');
    toolbar.style.display = 'none';
    return Promise.resolve().then(fn).finally(function () { toolbar.style.display = 'flex'; });
  }
  function saveImage() {
    withHiddenToolbar(function () {
      return html2canvas(document.getElementById('captureArea'), { scale: 2, backgroundColor: '#ffffff', useCORS: true }).then(function (canvas) {
        var a = document.createElement('a');
        a.download = '${fileBase}.png';
        a.href = canvas.toDataURL('image/png');
        a.click();
      });
    });
  }
  function savePDF() {
    withHiddenToolbar(function () {
      return html2canvas(document.getElementById('captureArea'), { scale: 2, backgroundColor: '#ffffff', useCORS: true }).then(function (canvas) {
        var jsPDF = window.jspdf.jsPDF;
        var imgData = canvas.toDataURL('image/png');
        var pdf = new jsPDF('l', 'mm', 'a4');
        var pageW = 297, pageH = 210;
        var imgW = pageW, imgH = canvas.height * imgW / canvas.width;
        var heightLeft = imgH, position = 0;
        pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
        heightLeft -= pageH;
        while (heightLeft > 0) {
          position = heightLeft - imgH;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
          heightLeft -= pageH;
        }
        pdf.save('${fileBase}.pdf');
      });
    });
  }
</script>
</body></html>`);
    w.document.close();
    w.focus();
  };

  // 전체 거래처 목록 (중복 제거)
  const allClients = useMemo(() => {
    const set = new Set();
    dispatchData.forEach(r => {
      const name = (r.거래처명 || "").trim();
      if (name) set.add(name);
    });
    return [...set].sort();
  }, [dispatchData]);

  // 거래처 검색
  const handleExcludeSearch = (q) => {
    setExcludeQuery(q);
    if (!q.trim()) { setExcludeDropdown([]); return; }
    const nq = clean(q);
    const matched = allClients.filter(name =>
      clean(name).includes(nq) && !excludeList.includes(name)
    ).slice(0, 10);
    setExcludeDropdown(matched);
  };

  // 거래처 선택 (체크)
  const addExclude = (name) => {
    if (!excludeList.includes(name)) {
      setExcludeList(prev => [...prev, name]);
    }
    setExcludeQuery("");
    setExcludeDropdown([]);
  };

  // 거래처 제외 해제
  const removeExclude = (name) => {
    setExcludeList(prev => prev.filter(n => n !== name));
  };
  // 🔥 인쇄 미리보기 편집 모드
  const [editMode, setEditMode] = useState(false);
  const [editRows, setEditRows] = useState(null); // result.rows 복사본

  // 편집모드 진입
  const startEdit = () => {
    if (!result) return;
    setEditRows(result.rows.map(r => ({
      ...r,
      display: r.display,
      stats: { ...r.stats },
      _editAvg: String(r.stats.avg),
      _editMin: String(roundDown10k(r.stats.min)),
      _editMax: String(roundDown10k(r.stats.max)),
      _editVariance: r.stats.variance > 40 ? "높음" : r.stats.variance > 20 ? "보통" : "낮음",
      _editConfidence: r.stats.count >= 10 ? "높음" : r.stats.count >= 4 ? "보통" : "낮음",
    })));
    setEditMode(true);
  };

  // 편집 값 변경
  const updateEditRow = (idx, field, value) => {
    setEditRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  // 편집 저장 → result에 반영
  const saveEdit = () => {
    if (!editRows) return;
    const newRows = editRows.map(r => {
      const avg = Number(String(r._editAvg).replace(/[^\d]/g, "")) || 0;
      const min = Number(String(r._editMin).replace(/[^\d]/g, "")) || 0;
      const max = Number(String(r._editMax).replace(/[^\d]/g, "")) || 0;
      const varianceLabel = r._editVariance;
      const confLabel = r._editConfidence;
      return {
        ...r,
        display: r.display,
        stats: {
          ...r.stats,
          avg,
          min,
          max,
          variance: varianceLabel === "높음" ? 50 : varianceLabel === "보통" ? 30 : 10,
          count: confLabel === "높음" ? 10 : confLabel === "보통" ? 5 : 2,
        },
        _editAvg: String(avg),
        _editMin: String(min),
        _editMax: String(max),
        _editVariance: varianceLabel,
        _editConfidence: confLabel,
      };
    });
    setEditRows(newRows);
    setResult(prev => ({ ...prev, rows: newRows }));
    setEditMode(false);
  };

  // 숫자 포맷 (입력용)
  const fmtEditNum = (v) => {
    const num = Number(String(v).replace(/[^\d]/g, ""));
    return num ? num.toLocaleString() : "0";
  };
  const handleSearch = () => {
    if (!pickup.trim()||!drop.trim()||!vGroup) { alert("상차지역, 하차지역, 차량종류를 모두 입력하세요."); return; }
    const pu=clean(pickup), dr=clean(drop);

    let matched = dispatchData.filter(r => {
      const pm=clean(r.상차지명||"")+clean(r.상차지주소||"");
      const dm=clean(r.하차지명||"")+clean(r.하차지주소||"");
      if (!pm.includes(pu)||!dm.includes(dr)) return false;
      if (getVehicleGroup(r.차량종류)!==vGroup) return false;
      return !!Number(String(r[fareField]||0).replace(/[^\d]/g,""));
    });


    if (mixedFilter==="혼적") matched=matched.filter(r=>r.혼적===true||r.혼적==="true"||r.혼적===1);
    else if (mixedFilter==="독차") matched=matched.filter(r=>!r.혼적||r.혼적===false||r.혼적==="false"||r.혼적===0);

    // 🔥 거래처 제외 필터
    if (excludeList.length > 0) {
      matched = matched.filter(r => !excludeList.includes((r.거래처명 || "").trim()));
    }

  const bucketMap={}, bucketRowMap={};
    const BUCKETS = viewMode === "파렛수별" ? PALLET_BUCKETS : TON_BUCKETS;
    BUCKETS.forEach(b=>{bucketMap[b.label]=[];bucketRowMap[b.label]=[];});

    matched.forEach(r=>{
      const fare=Number(String(r[fareField]||0).replace(/[^\d]/g,""));
      if (!fare) return;

      if (viewMode === "파렛수별") {
        const p = extractPallet(r.화물내용);
        if (!p || p < 1 || p > 18) return;
        const key = `${p}파렛`;
        if (!bucketMap[key]) return;
        bucketMap[key].push(fare);
        bucketRowMap[key].push(r);
      } else {
        const ton=extractTon(r.차량톤수), bucket=getTonBucket(ton); if (!bucket) return;
        bucketMap[bucket.label].push(fare);
        bucketRowMap[bucket.label].push(r);
      }
    });

    const rows=BUCKETS.map(b=>({...b, stats:trimmedStats(bucketMap[b.label],bucketRowMap[b.label])})).filter(b=>b.stats!==null);
    const groupLabel=VEHICLE_GROUPS.find(g=>g.value===vGroup)?.label||vGroup;
        setResult({rows, totalCount:matched.length, groupLabel, pickup:pickup.trim(), drop:drop.trim(), fareField, mixedFilter, viewMode});
    setSearched(true);
    setEditMode(false);
    setEditRows(null);
  };

  // ===================== 직접 단가표 작성 모달 =====================
  const [manualModal, setManualModal] = useState(false);
  const [manualInfo, setManualInfo] = useState({ pickup: "", drop: "", vehicle: "", note: "", fareField: "청구운임", mixedFilter: "전체", client: "" });
  const [manualRows, setManualRows] = useState([
    { display: "", avg: "", min: "", max: "", varianceLabel: "낮음", confLabel: "보통" }
  ]);

  const openManualModal = () => {
    if (result && result.rows.length > 0) {
      setManualInfo({ pickup: result.pickup, drop: result.drop, vehicle: result.groupLabel, note: "", fareField: result.fareField, mixedFilter: result.mixedFilter, client: "" });
      setManualRows(result.rows.map(r => ({
        display: r.display,
        avg: r.stats.avg ? r.stats.avg.toLocaleString() : "",
        min: r.stats.min ? roundDown10k(r.stats.min).toLocaleString() : "",
        max: r.stats.max ? roundDown10k(r.stats.max).toLocaleString() : "",
        varianceLabel: r.stats.variance > 40 ? "높음" : r.stats.variance > 20 ? "보통" : "낮음",
        confLabel: r.stats.count >= 10 ? "높음" : r.stats.count >= 4 ? "보통" : "낮음",
      })));
    } else {
      setManualInfo({ pickup: "", drop: "", vehicle: "", note: "", fareField: "청구운임", mixedFilter: "전체", client: "" });
      setManualRows([{ display: "", avg: "", min: "", max: "", varianceLabel: "낮음", confLabel: "보통" }]);
    }
    setManualModal(true);
  };

  const addManualRow = () => setManualRows(prev => [...prev, { display: "", avg: "", min: "", max: "", varianceLabel: "낮음", confLabel: "보통" }]);
  const removeManualRow = (idx) => setManualRows(prev => prev.filter((_, i) => i !== idx));
  const updateManualRow = (idx, field, value) => setManualRows(prev => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });

  const addHistoryEntry = (entry) => {
    const next = [{ ...entry, ts: new Date().toISOString() }, ...JSON.parse(localStorage.getItem("rateCardHistory") || "[]")].slice(0, 100);
    localStorage.setItem("rateCardHistory", JSON.stringify(next));
    setPrintHistory(next);
  };

  const handleManualPrint = () => {
    addHistoryEntry({ source: "manual", pickup: manualInfo.pickup, drop: manualInfo.drop, vehicle: manualInfo.vehicle, fareField: manualInfo.fareField, mixedFilter: manualInfo.mixedFilter, rowCount: manualRows.length, client: manualInfo.client, savedRows: manualRows.map(r => ({ display: r.display, avg: Number(String(r.avg).replace(/[^\d]/g,""))||0, min: Number(String(r.min).replace(/[^\d]/g,""))||0, max: Number(String(r.max).replace(/[^\d]/g,""))||0, count: 1, variance: 0 })) });
    const today = new Date().toLocaleDateString("ko-KR");
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>단가표_${manualInfo.pickup}_${manualInfo.drop}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Malgun Gothic',sans-serif;}
body{background:white;color:#111;}
.wrapper{width:794px;margin:0 auto;padding:40px 48px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #1B2B4B;}
.logo{font-size:28px;font-weight:900;color:#1B2B4B;}
.logo span{color:#3B82F6;}
.company-info{text-align:right;font-size:12px;color:#555;line-height:1.7;}
.doc-title{font-size:22px;font-weight:900;color:#1B2B4B;margin-bottom:4px;}
.doc-sub{font-size:13px;color:#666;margin-bottom:24px;}
.route-bar{display:flex;gap:12px;align-items:center;background:#F0F4FF;border:1px solid #C7D9FF;border-radius:10px;padding:14px 20px;margin-bottom:24px;}
.route-item{font-size:13px;color:#444;}
.route-item b{color:#1B2B4B;font-size:15px;}
.route-arrow{font-size:20px;color:#3B82F6;font-weight:900;}
table{width:100%;border-collapse:collapse;font-size:13px;}
thead tr{background:#1B2B4B;}
thead th{color:white;padding:11px 14px;text-align:center;font-weight:700;}
tbody tr:nth-child(even){background:#F9FAFB;}
td{padding:10px 14px;text-align:center;border-bottom:1px solid #E5E7EB;}
.td-ton{font-weight:700;color:#1B2B4B;font-size:14px;}
.td-price{font-weight:800;color:#2563EB;font-size:15px;}
.badge-high{background:#E5E7EB;color:#374151;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;}
.badge-mid{background:#E5E7EB;color:#4B5563;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;}
.badge-low{background:#F3F4F6;color:#6B7280;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;}
.var-high{color:#374151;font-weight:700;font-size:12px;}
.var-mid{color:#4B5563;font-weight:700;font-size:12px;}
.var-low{color:#6B7280;font-weight:700;font-size:12px;}
.notice{margin-top:28px;padding:14px 18px;background:#F8FAFF;border:1px solid #C7D9FF;border-radius:8px;font-size:11.5px;color:#374151;line-height:1.8;}
.footer{margin-top:36px;padding-top:16px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:flex-end;}
.stamp{width:64px;height:64px;border:2.5px solid #1B2B4B;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#1B2B4B;margin-left:16px;text-align:center;line-height:1.3;}
@media print{.no-print{display:none!important;}}
</style></head><body>
<div class="wrapper">
<div class="no-print" style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#F8FAFF;border:1px solid #E0E7FF;border-radius:10px;">
  <span style="font-size:12px;color:#6B7280;">인쇄 또는 PDF로 저장하려면 아래 버튼을 클릭하세요</span>
  <div style="display:flex;gap:8px;">
    <button onclick="window.print()" style="padding:8px 20px;background:#1B2B4B;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">인쇄</button>
    <button onclick="window.print()" style="padding:8px 20px;background:#2563EB;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">PDF 저장</button>
  </div>
</div>
<div class="header">
  <div><div class="logo">RU<span>N</span>25</div><div style="font-size:11px;color:#888;margin-top:4px;">화물 운송 전문</div></div>
  <div class="company-info"><div><b>${COMPANY.manager}</b></div><div>📞 ${COMPANY.phone} | ☎ ${COMPANY.tel}</div><div>✉ ${COMPANY.email}</div><div>${COMPANY.address}</div></div>
</div>
<div class="doc-title">운송 단가표</div>
<div class="doc-sub">Vehicle Rate Card | 발행일: ${today}</div>
<div class="route-bar">
  <div class="route-item"><b>${manualInfo.pickup || "출발지"}</b></div>
  <div class="route-arrow">→</div>
  <div class="route-item"><b>${manualInfo.drop || "도착지"}</b></div>
  <div style="flex:1"></div>
  ${manualInfo.client ? `<div class="route-item">거래처: <b>${manualInfo.client}</b></div>` : ""}
  ${manualInfo.vehicle ? `<div class="route-item" style="margin-left:12px;">차량: <b>${manualInfo.vehicle}</b></div>` : ""}
  ${manualInfo.mixedFilter !== "전체" ? `<div class="route-item" style="margin-left:12px;">[${manualInfo.mixedFilter}]</div>` : ""}
  <div class="route-item" style="margin-left:12px;">조회기준: <b>${manualInfo.fareField}</b></div>
</div>
<table>
  <thead><tr>
    <th>차량 톤수</th><th>권장 단가</th><th>운임 범위</th><th>변동성</th><th>신뢰도</th>
  </tr></thead>
  <tbody>${manualRows.map(row => {
    const vClass = row.varianceLabel === "높음" ? "var-high" : row.varianceLabel === "보통" ? "var-mid" : "var-low";
    const cClass = row.confLabel === "높음" ? "badge-high" : row.confLabel === "보통" ? "badge-mid" : "badge-low";
    const avgNum = Number(String(row.avg).replace(/[^\d]/g, ""));
    return `<tr>
      <td class="td-ton">${row.display || "-"}</td>
      <td class="td-price">${avgNum ? avgNum.toLocaleString() + "원" : "-"}</td>
      <td style="color:#374151;font-size:13px;font-weight:600;">${row.min && row.max ? row.min + " ~ " + row.max + "원" : "-"}</td>
      <td><span class="${vClass}">${row.varianceLabel}</span></td>
      <td><span class="${cClass}">${row.confLabel}</span></td>
    </tr>`;
  }).join("")}</tbody>
</table>
${manualInfo.note ? `<div class="notice"><b>※ 특이사항</b><br>${manualInfo.note.replace(/\n/g, "<br>")}</div>` : ""}
<div class="notice" style="margin-top:${manualInfo.note ? "12px" : "28px"}"><b>※ 안내사항</b><br>• 위 단가는 ${manualInfo.pickup || "출발지"} ↔ ${manualInfo.drop || "도착지"} 구간 참고 단가입니다 (1만원 단위 절사).<br>• 유가 변동, 차량 수급 상황에 따라 실제 운임은 달라질 수 있습니다.<br>• 신뢰도 '낮음'은 변동 가능성이 높으니 참고용으로만 활용하시기 바랍니다.<br>• 정확한 견적은 담당자에게 직접 문의해 주시기 바랍니다.</div>
<div class="footer">
  <div style="font-size:11px;color:#aaa;">본 자료는 영업 참고용이며 정식 계약서가 아닙니다.</div>
  <div style="display:flex;align-items:center;">
    <div style="text-align:right;font-size:13px;color:#555;line-height:1.6;">
      <b style="color:#1B2B4B;font-size:15px;">${COMPANY.name}</b><br>${COMPANY.manager} ${COMPANY.phone}
    </div>
    <div class="stamp">RUN<br>25</div>
  </div>
</div>
</div></body></html>`);
    w.document.close();
    w.focus();
  };

  const handlePrint = () => {
    if (!result) return;
    addHistoryEntry({ source: "auto", pickup: result.pickup, drop: result.drop, vehicle: result.groupLabel, fareField: result.fareField, mixedFilter: result.mixedFilter, rowCount: result.rows.length, client: "", savedRows: result.rows });
    const today = new Date().toLocaleDateString("ko-KR");
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>단가표_${result.pickup}_${result.drop}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Malgun Gothic',sans-serif;}
body{background:white;color:#111;}
.wrapper{width:794px;margin:0 auto;padding:40px 48px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #1B2B4B;}
.logo{font-size:28px;font-weight:900;color:#1B2B4B;}
.logo span{color:#3B82F6;}
.company-info{text-align:right;font-size:12px;color:#555;line-height:1.7;}
.doc-title{font-size:22px;font-weight:900;color:#1B2B4B;margin-bottom:4px;}
.doc-sub{font-size:13px;color:#666;margin-bottom:24px;}
.route-bar{display:flex;gap:12px;align-items:center;background:#F0F4FF;border:1px solid #C7D9FF;border-radius:10px;padding:14px 20px;margin-bottom:24px;}
.route-item{font-size:13px;color:#444;}
.route-item b{color:#1B2B4B;font-size:15px;}
.route-arrow{font-size:20px;color:#3B82F6;font-weight:900;}
table{width:100%;border-collapse:collapse;font-size:13px;}
thead tr{background:#1B2B4B;}
thead th{color:white;padding:11px 14px;text-align:center;font-weight:700;}
tbody tr:nth-child(even){background:#F9FAFB;}
td{padding:10px 14px;text-align:center;border-bottom:1px solid #E5E7EB;}
.td-ton{font-weight:700;color:#1B2B4B;font-size:14px;}
.td-price{font-weight:800;color:#2563EB;font-size:15px;}
.badge-high{background:#D1FAE5;color:#065F46;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;}
.badge-mid{background:#FEF3C7;color:#92400E;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;}
.badge-low{background:#FEE2E2;color:#991B1B;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;}
.var-high{color:#374151;font-weight:700;font-size:12px;}
.var-mid{color:#4B5563;font-weight:700;font-size:12px;}
.var-low{color:#6B7280;font-weight:700;font-size:12px;}
.notice{margin-top:28px;padding:14px 18px;background:#F8FAFF;border:1px solid #C7D9FF;border-radius:8px;font-size:11.5px;color:#374151;line-height:1.8;}
.footer{margin-top:36px;padding-top:16px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:flex-end;}
.stamp{width:64px;height:64px;border:2.5px solid #1B2B4B;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#1B2B4B;margin-left:16px;text-align:center;line-height:1.3;}
@media print{.no-print{display:none!important;}}
</style></head><body>
<div class="wrapper">
<div class="no-print" style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#F8FAFF;border:1px solid #E0E7FF;border-radius:10px;">
  <button onclick="document.querySelectorAll('.edit-cell').forEach(el=>{el.style.display=el.style.display==='none'?'inline-block':'none';document.querySelectorAll('.view-cell').forEach(v=>{v.style.display=v.style.display==='none'?'inline':'none'});})" style="padding:8px 20px;background:#1B2B4B;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">수정</button>
  <div style="display:flex;gap:8px;">
    <button onclick="window.print()" style="padding:8px 20px;background:#1B2B4B;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">인쇄</button>
    <button onclick="window.print()" style="padding:8px 20px;background:#2563EB;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">PDF 저장</button>
  </div>
</div>
<div class="header">
  <div><div class="logo">RU<span>N</span>25</div><div style="font-size:11px;color:#888;margin-top:4px;">화물 운송 전문</div></div>
  <div class="company-info"><div><b>${COMPANY.manager}</b></div><div>📞 ${COMPANY.phone} | ☎ ${COMPANY.tel}</div><div>✉ ${COMPANY.email}</div><div>${COMPANY.address}</div></div>
</div>
<div class="doc-title">운송 단가표</div>
<div class="doc-sub">Vehicle Rate Card | 발행일: ${today}</div>
<div class="route-bar">
  <div class="route-item"><b>${result.pickup}</b></div>
  <div class="route-arrow">→</div>
  <div class="route-item"><b>${result.drop}</b></div>
  <div style="flex:1"></div>
  <div class="route-item">차량: <b>${result.groupLabel}</b></div>
  ${result.mixedFilter !== "전체" ? `<div class="route-item" style="margin-left:12px;">[${result.mixedFilter}]</div>` : ""}
  <div class="route-item" style="margin-left:12px;">조회기준: <b>${result.fareField}</b></div>
  <div class="route-item" style="margin-left:12px;">근거 <b>${result.totalCount}</b>건</div>
</div>
<table>
  <thead><tr>
    <th>${result.viewMode === "파렛수별" ? "파렛 수" : "차량 톤수"}</th>
    <th>권장 단가</th>
    <th>운임 범위</th>
    <th>변동성</th>
    <th>신뢰도</th>
  </tr></thead>
  <tbody>${result.rows.map((row, i) => {
    const s = row.stats;
    const vLabel = s.variance > 40 ? "높음" : s.variance > 20 ? "보통" : "낮음";
    const vClass = s.variance > 40 ? "var-high" : s.variance > 20 ? "var-mid" : "var-low";
    const cLabel = s.count >= 10 ? "높음" : s.count >= 4 ? "보통" : "낮음";
    const cClass = s.count >= 10 ? "badge-high" : s.count >= 4 ? "badge-mid" : "badge-low";
    const rowId = `row-${i}`;
    const tonOptions = result.viewMode === "파렛수별"
      ? PALLET_BUCKETS.map(b => b.display)
      : TON_BUCKETS.map(b => b.display);
    return `<tr>
      <td class="td-ton">
        <span class="view-cell">${row.display}</span>
        <select class="edit-cell" style="display:none;padding:4px;font-size:13px;font-weight:700;" onchange="this.parentElement.querySelector('.view-cell').textContent=this.value">
          ${tonOptions.map(o => `<option value="${o}" ${o === row.display ? "selected" : ""}>${o}</option>`).join("")}
        </select>
      </td>
      <td class="td-price">
        <span class="view-cell">${s.avg.toLocaleString()}원</span>
        <input autoComplete="off" class="edit-cell" type="text" style="display:none;width:120px;text-align:right;padding:4px;font-size:14px;font-weight:800;color:#2563EB;" value="${s.avg.toLocaleString()}" oninput="var n=this.value.replace(/[^\\d]/g,'');this.value=n?Number(n).toLocaleString():'0'" onchange="this.parentElement.querySelector('.view-cell').textContent=this.value+'원'">
      </td>
      <td>
        <span class="view-cell" style="color:#374151;font-size:13px;font-weight:600;">${roundDown10k(s.min).toLocaleString()} ~ ${roundDown10k(s.max).toLocaleString()}원</span>
        <span class="edit-cell" style="display:none;font-size:11px;">
          <input autoComplete="off" type="text" style="width:80px;text-align:right;padding:3px;font-size:11px;" value="${roundDown10k(s.min).toLocaleString()}" oninput="var n=this.value.replace(/[^\\d]/g,'');this.value=n?Number(n).toLocaleString():'0'">
          ~
          <input autoComplete="off" type="text" style="width:80px;text-align:right;padding:3px;font-size:11px;" value="${roundDown10k(s.max).toLocaleString()}" oninput="var n=this.value.replace(/[^\\d]/g,'');this.value=n?Number(n).toLocaleString():'0'">
          원
        </span>
      </td>
      <td>
        <span class="view-cell ${vClass}">${vLabel}</span>
        <select class="edit-cell" style="display:none;padding:4px;font-size:12px;font-weight:700;" onchange="var v=this.value;var el=this.parentElement.querySelector('.view-cell');el.textContent=v;el.className='view-cell '+(v==='높음'?'var-high':v==='보통'?'var-mid':'var-low')">
          ${["낮음", "보통", "높음"].map(o => `<option value="${o}" ${o === vLabel ? "selected" : ""}>${o}</option>`).join("")}
        </select>
      </td>
      <td>
        <span class="view-cell"><span class="${cClass}">${cLabel}</span></span>
        <select class="edit-cell" style="display:none;padding:4px;font-size:12px;font-weight:700;" onchange="var v=this.value;var el=this.parentElement.querySelector('.view-cell');el.innerHTML='<span class=\\'badge-'+(v==='높음'?'high':v==='보통'?'mid':'low')+'\\'>' +v+'</span>'">
          ${["낮음", "보통", "높음"].map(o => `<option value="${o}" ${o === cLabel ? "selected" : ""}>${o}</option>`).join("")}
        </select>
      </td>
    </tr>`;
  }).join("")}</tbody>
</table>
<div class="notice"><b>※ 안내사항</b><br>• 위 단가는 ${result.pickup} ↔ ${result.drop} 구간의 과거 실적(${result.fareField}) 기반 참고 단가입니다 (1만원 단위 절사).<br>• 유가 변동, 차량 수급 상황에 따라 실제 운임은 달라질 수 있습니다.<br>• 신뢰도 '낮음'은 데이터 샘플이 적어 변동 가능성이 높으니 참고용으로만 활용하시기 바랍니다.<br>• 정확한 견적은 담당자에게 직접 문의해 주시기 바랍니다.</div>
<div class="footer">
  <div style="font-size:11px;color:#aaa;">본 자료는 영업 참고용이며 정식 계약서가 아닙니다.</div>
  <div style="display:flex;align-items:center;">
    <div style="text-align:right;font-size:13px;color:#555;line-height:1.6;">
      <b style="color:#1B2B4B;font-size:15px;">${COMPANY.name}</b><br>${COMPANY.manager} ${COMPANY.phone}
    </div>
    <div class="stamp">RUN<br>25</div>
  </div>
</div>
</div></body></html>`);
    w.document.close();
    w.focus();
  };


  const today=new Date().toLocaleDateString("ko-KR");
  const inputCls="w-full px-1 py-2 text-[13px] font-medium border-0 border-b-2 border-gray-300 bg-transparent focus:border-[#1B2B4B] focus:outline-none placeholder:text-gray-300 transition";
  const labelCls="block text-[12px] font-bold text-gray-900 mb-1";

  return (
    <div className="p-5 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[18px] font-bold text-[#1B2B4B]">운송 단가표 생성</h2>
          <p className="text-[12px] text-gray-400 mt-0.5">
            {pageMode === "노선별" ? "노선별 톤수 단가표를 자동 생성하여 고객사에 제공하세요" : "기준지 1곳 → 하차지 여러 곳의 파렛/차량 구간별 단가를 한 표로 관리하세요"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pageMode === "노선별" ? (
            <>
              <button onClick={() => setHistoryModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-600 text-[13px] font-semibold rounded-xl hover:bg-gray-50 transition shadow-sm">
                발행 이력
                {printHistory.length > 0 && <span className="ml-1 px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded-full text-[11px] font-bold">{printHistory.length}</span>}
              </button>
              <button onClick={openManualModal} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-[13px] font-bold rounded-xl hover:bg-emerald-700 transition shadow-sm">
                단가표 작성
              </button>
              <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2.5 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-xl hover:bg-[#243a60] transition shadow-sm">
                🖨 인쇄 / PDF 저장
              </button>
            </>
          ) : (
            selectedSheet && (
              <>
                <button onClick={() => setMultiUploadOpen(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-600 text-[13px] font-semibold rounded-xl hover:bg-gray-50 transition shadow-sm">
                  엑셀업로드
                </button>
                <button onClick={() => handleMultiPrint(selectedSheet)} className="flex items-center gap-2 px-5 py-2.5 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-xl hover:bg-[#243a60] transition shadow-sm">
                  🖨 인쇄 / PDF 저장
                </button>
              </>
            )
          )}
        </div>
      </div>

      {/* 노선별 단가표 / 다목적지 단가표 전환 탭 */}
      <div className="flex gap-2 mb-4">
        {["노선별", "다목적지"].map(m => (
          <button key={m} onClick={() => setPageMode(m)}
            className={`px-5 py-2 text-[13px] font-bold rounded-lg transition border ${
              pageMode === m ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-[#1B2B4B] border-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white"
            }`}>
            {m === "노선별" ? "노선별 단가표" : "다목적지 단가표"}
          </button>
        ))}
      </div>

      {pageMode === "노선별" && (
      <>
      {/* 좌우 분할: 왼쪽 검색/입력, 오른쪽 결과 (자사운임표와 동일한 레이아웃) */}
      <div className="grid grid-cols-[320px_1fr] gap-4 items-start">

        {/* 왼쪽: 검색 패널 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="text-[13px] font-bold text-[#1B2B4B] mb-4">노선 조건 입력</div>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>상차지역 <span className="text-red-400">*</span></label>
              <input autoComplete="off" className={inputCls} placeholder="예: 인천" value={pickup} onChange={e=>setPickup(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSearch()} />
            </div>
            <div>
              <label className={labelCls}>하차지역 <span className="text-red-400">*</span></label>
              <input autoComplete="off" className={inputCls} placeholder="예: 부산" value={drop} onChange={e=>setDrop(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSearch()} />
            </div>
            <div>
              <label className={labelCls}>차량종류 <span className="text-red-400">*</span></label>
              <select className={inputCls} value={vGroup} onChange={e=>setVGroup(e.target.value)}>
                <option value="">선택</option>
                {VEHICLE_GROUPS.map(g=><option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>조회 방식</label>
              <select
                className={inputCls}
                value={viewMode}
                onChange={e => setViewMode(e.target.value)}
              >
                <option value="톤수별">톤수별</option>
                <option value="파렛수별">파렛수별 (1~18파렛)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>혼적 여부</label>
              <div className="flex gap-1 mt-1">
                {["전체","독차","혼적"].map(opt=>(
                  <button key={opt} type="button" onClick={()=>setMixedFilter(opt)}
                    className={`flex-1 py-2 text-[12px] font-semibold rounded-lg border transition-all ${mixedFilter===opt?"bg-[#1B2B4B] text-white border-[#1B2B4B]":"bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>조회 기준</label>
              <div className="flex gap-1 mt-1">
                {[["청구운임","청구가"],["기사운임","기사운임"]].map(([val,label])=>(
                  <button key={val} type="button" onClick={()=>setFareField(val)}
                    className={`flex-1 py-2 text-[12px] font-semibold rounded-lg border transition-all ${fareField===val?"bg-[#1B2B4B] text-white border-[#1B2B4B]":"bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 🔥 거래처 제외 필터 */}
            <div>
              <label className={labelCls}>거래처 제외 (선택)</label>
              <div className="relative" ref={excludeRef}>
                <input autoComplete="off"
                  className={inputCls}
                  placeholder="제외할 거래처 검색"
                  value={excludeQuery}
                  onChange={e => handleExcludeSearch(e.target.value)}
                  onFocus={() => { if (excludeQuery) handleExcludeSearch(excludeQuery); }}
                  onBlur={() => setTimeout(() => setExcludeDropdown([]), 200)}
                />
                {excludeDropdown.length > 0 && (
                  <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {excludeDropdown.map(name => (
                      <button
                        key={name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50 transition flex items-center gap-2"
                        onMouseDown={() => addExclude(name)}
                      >
                        <span className="w-4 h-4 rounded border border-gray-300 flex items-center justify-center text-[10px]">
                          {excludeList.includes(name) ? "✓" : ""}
                        </span>
                        <span>{name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {excludeList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {excludeList.map(name => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-[12px] font-semibold text-red-700"
                    >
                      {name}
                      <button
                        type="button"
                        onClick={() => removeExclude(name)}
                        className="text-red-400 hover:text-red-600 text-[14px] leading-none ml-0.5"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-5">
            <button onClick={handleSearch} className="flex-1 py-2 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] transition">단가표 생성</button>
            <button onClick={()=>{setPickup("");setDrop("");setVGroup("");setMixedFilter("전체");setFareField("청구운임");setViewMode("톤수별");setExcludeQuery("");setExcludeList([]);setExcludeDropdown([]);setResult(null);setSearched(false);}} className="px-3 py-2 bg-white border border-gray-200 text-gray-500 text-[13px] rounded-lg hover:bg-gray-50 transition">초기화</button>
          </div>
          <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">※ 냉장/냉동 통합 · 카고/윙바디 통합 · 다마스/라보 통합 · 단가는 1만원 단위 절사 · 데이터 수(건) 클릭 시 상세 오더 확인 가능
            {viewMode==="파렛수별" && " · 파렛수별 조회 시 화물내용에 파렛수가 입력된 데이터만 집계됩니다"}
          </p>
        </div>

        {/* 오른쪽: 결과 패널 */}
        <div className="min-w-0">
          {!searched && (
            <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 text-gray-400">
              <div className="text-[14px] font-semibold mb-1">왼쪽에서 노선 조건을 입력하고 단가표를 생성하세요</div>
              <div className="text-[12px]">노선·차량 조건에 맞는 단가표를 자동으로 계산해 보여드립니다</div>
            </div>
          )}

          {searched && result && (
        <div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 overflow-hidden">
            <div className="bg-[#1B2B4B] px-6 py-5 flex justify-between items-center">
              <div>
                <div className="text-[22px] font-black text-white tracking-tight">RUN25</div>
                <div className="text-[11px] text-white/60 mt-0.5">화물 운송 전문</div>
              </div>
              <div className="text-right text-[12px] text-white/80 leading-6">
                <div className="font-bold text-white text-[14px]">{COMPANY.manager}</div>
                <div>📞 {COMPANY.phone} &nbsp;|&nbsp; ☎ {COMPANY.tel}</div>
                <div>✉ {COMPANY.email}</div>
                <div className="text-white/60">{COMPANY.address}</div>
              </div>
            </div>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2 overflow-x-auto">
              <div className="shrink-0">
                <div className="text-[16px] font-bold text-[#1B2B4B]">운송 단가표</div>
                <div className="text-[11px] text-gray-400">발행일: {today}</div>
              </div>
              <div className="flex items-center gap-1.5 flex-nowrap">
                <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 whitespace-nowrap">
                  <span className="text-[13px] font-bold text-[#1B2B4B]">{result.pickup}</span>
                  <span className="text-blue-500 font-bold">→</span>
                  <span className="text-[13px] font-bold text-[#1B2B4B]">{result.drop}</span>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 text-[11px] text-gray-600 whitespace-nowrap">차량: <b className="text-[#1B2B4B]">{result.groupLabel}</b></div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-2 text-[11px] font-bold text-indigo-700 whitespace-nowrap">{result.viewMode}</div>
                {result.mixedFilter!=="전체" && <div className="bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-2 text-[11px] font-bold text-violet-700 whitespace-nowrap">{result.mixedFilter}</div>}
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-2 text-[11px] text-blue-600 font-semibold whitespace-nowrap">{result.fareField==="청구운임"?"청구가 기준":"기사운임 기준"}</div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 text-[11px] text-gray-500 whitespace-nowrap">조회 <b className="text-[#1B2B4B]">{result.totalCount}</b>건</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-4">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[#1B2B4B]">
                  {[result.viewMode==="파렛수별"?"파렛 수":"차량 톤수","권장 단가","운임 범위","데이터 수","신뢰도","변동성"].map(h=>(
                    <th key={h} className="px-4 py-3.5 text-center text-[13px] font-bold text-white border-b border-white/10">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.length===0 ? (
                  <tr><td colSpan={6} className="py-16 text-center text-gray-400 text-[13px]">해당 조건에 맞는 데이터가 없습니다</td></tr>
                ) : result.rows.map((row,i)=>{
                  const s=row.stats; const conf=confidence(s.count);
                  const vLevel=s.variance>40?"높음":s.variance>20?"보통":"낮음";
                  const vColor=s.variance>40?"text-gray-700":s.variance>20?"text-gray-600":"text-gray-500";
                  return (
                    <tr key={i} className={`border-b border-gray-100 hover:bg-blue-50/30 transition ${i%2===0?"bg-white":"bg-gray-50/40"}`}>
                      <td className="px-4 py-3.5 text-center font-bold text-[#1B2B4B] text-[15px]">{row.display}</td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-[17px] font-black text-blue-700">{s.avg.toLocaleString()}</span>
                        <span className="text-[12px] text-gray-400 ml-1">원</span>
                      </td>
                      <td className="px-4 py-3.5 text-center text-[13px] text-gray-700 font-semibold">{roundDown10k(s.min).toLocaleString()} ~ {roundDown10k(s.max).toLocaleString()}원</td>
                      <td className="px-4 py-3.5 text-center">
                        <button onClick={()=>setDetailModal({rows:s.rows, bucket:row.display})}
                          className="text-[13px] font-bold text-blue-600 hover:underline hover:text-blue-800 transition px-2 py-1 rounded-lg hover:bg-blue-50">
                          {s.count}건
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${conf.bg} ${conf.color}`}>{conf.label}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`text-[12px] font-semibold ${vColor}`}>{vLevel}{s.trimmed&&<span className="ml-1 text-[10px] text-gray-400">(보정)</span>}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="text-[13px] font-bold text-gray-700 mb-2">안내사항</div>
              <ul className="text-[12px] text-gray-600 space-y-1 leading-relaxed">
                <li>• 위 단가는 과거 실적 기반 참고 단가입니다 (1만원 단위 절사)</li>
                <li>• 유가·수급 상황에 따라 실제 운임은 달라질 수 있습니다</li>
                <li>• 신뢰도 "낮음"은 데이터 샘플이 적어 변동 가능성이 높습니다</li>
                <li>• 데이터 수(건) 클릭 시 상세 오더 내역을 확인할 수 있습니다</li>
              </ul>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="text-[13px] font-bold text-gray-700 mb-2">변동성 기준</div>
              <div className="space-y-1.5 text-[12px]">
                {[["낮음","bg-gray-200 text-gray-700","평균 ±20% 이내, 안정적"],["보통","bg-gray-200 text-gray-600","평균 ±20~40% 수준"],["높음","bg-gray-300 text-gray-700","연휴·수급에 따라 변동 큼, 협의 권장"]].map(([l,cls,desc])=>(
                  <div key={l} className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded font-semibold text-[11px] ${cls}`}>{l}</span>
                    <span className="text-gray-600">{desc}</span>
                  </div>
                ))}
                <div className="text-[11px] text-gray-400 mt-1">※ IQR 방식으로 극단값 자동 제거 후 산출</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-4 flex items-center justify-between">
            <div className="text-[11px] text-gray-400">본 자료는 영업 참고용이며 정식 계약서가 아닙니다.</div>
            <div className="flex items-center gap-4">
              <div className="text-right text-[13px] text-gray-600 leading-6">
                <div className="font-bold text-[#1B2B4B] text-[15px]">{COMPANY.name}</div>
                <div>{COMPANY.manager} &nbsp; {COMPANY.phone}</div>
              </div>
              <div className="w-14 h-14 rounded-full border-2 border-[#1B2B4B] flex items-center justify-center text-[11px] font-black text-[#1B2B4B] text-center leading-tight">RUN<br/>25</div>
            </div>
          </div>
        </div>
          )}

          {searched && result && result.rows.length===0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-16 text-center text-gray-400 text-[13px]">
              조건에 맞는 데이터가 없습니다. 상/하차 지역명을 더 넓게 입력하거나 혼적 여부를 "전체"로 변경해보세요.
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {pageMode === "다목적지" && (
        <div className="grid grid-cols-[280px_1fr] gap-4 items-start">
          {/* 왼쪽: 저장된 단가표 목록 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <button onClick={createMultiSheet} disabled={multiSaving}
              className="w-full py-2.5 mb-3 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] transition disabled:opacity-50">
              + 새 단가표 만들기
            </button>
            {multiSheets.length === 0 ? (
              <div className="text-center text-gray-400 text-[12px] py-8">
                아직 만든 다목적지 단가표가 없습니다.<br/>기준지(상차지) 1곳을 기준으로 여러 하차지의 단가를 관리해보세요.
              </div>
            ) : (
              <div className="space-y-1.5">
                {multiSheets.map(s => (
                  <button key={s.id} onClick={() => setMultiSelectedId(s.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition ${
                      multiSelectedId === s.id ? "bg-[#1B2B4B] border-[#1B2B4B] text-white" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}>
                    <div className="font-bold text-[13px] truncate">{s.baseName || "이름 없음"}</div>
                    <div className={`text-[11px] mt-0.5 ${multiSelectedId === s.id ? "text-white/60" : "text-gray-400"}`}>하차지 {(s.rows || []).length}곳</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 오른쪽: 선택된 단가표 편집/미리보기 */}
          <div className="min-w-0">
            {!selectedSheet ? (
              <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 text-gray-400">
                <div className="text-[14px] font-semibold mb-1">왼쪽에서 단가표를 선택하거나 새로 만드세요</div>
                <div className="text-[12px]">기준지 1곳(예: 화주사 창고) 기준으로 하차지 여러 곳의 단가를 한 표로 관리합니다</div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 기준지 정보 */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-[13px] font-bold text-[#1B2B4B]">기준지(상차지) 정보</div>
                    <button onClick={() => removeMultiSheet(selectedSheet.id)} className="text-[12px] text-red-400 hover:text-red-600 transition">단가표 삭제</button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>기준지명</label>
                      <input autoComplete="off" className={inputCls} placeholder="예: 태양이엔에스"
                        defaultValue={selectedSheet.baseName || ""}
                        onBlur={e => patchSheet(selectedSheet.id, { baseName: e.target.value })}
                        key={selectedSheet.id + "-base"}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>주소</label>
                      <input autoComplete="off" className={inputCls} placeholder="기준지 주소"
                        defaultValue={selectedSheet.baseAddress || ""}
                        onBlur={e => patchSheet(selectedSheet.id, { baseAddress: e.target.value })}
                        key={selectedSheet.id + "-addr"}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className={labelCls}>안내사항 (줄바꿈으로 여러 줄 입력, 표 상단에 그대로 표시됩니다)</label>
                    <textarea
                      className="w-full px-3 py-2 text-[12.5px] rounded-lg border border-gray-200 focus:border-[#1B2B4B] focus:outline-none leading-relaxed"
                      rows={3}
                      placeholder={"예: 1. 파레트(1100*1100), 배차 시 파레트 크기 공지\n2. 하차 후 거래명세서/파레트전표 서명 후 문자 전송"}
                      defaultValue={selectedSheet.note || ""}
                      onBlur={e => patchSheet(selectedSheet.id, { note: e.target.value })}
                      key={selectedSheet.id + "-note"}
                    />
                  </div>
                </div>

                {/* 단가 매트릭스 표 */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                    <div className="text-[13px] font-bold text-[#1B2B4B]">하차지별 단가표</div>
                    <div className="flex items-center gap-2">
                      <button onClick={addMultiColumn} className="px-3 py-1.5 text-[12px] font-semibold text-[#1B2B4B] border border-[#1B2B4B]/30 rounded-lg hover:bg-[#1B2B4B]/5 transition">+ 구간 추가</button>
                      <button onClick={addMultiRow} className="px-3 py-1.5 text-[12px] font-semibold text-white bg-[#1B2B4B] rounded-lg hover:bg-[#243a60] transition">+ 하차지 추가</button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px] border-collapse">
                      <thead>
                        <tr className="bg-[#1B2B4B]">
                          <th className="px-3 py-2.5 text-left text-white font-bold whitespace-nowrap min-w-[140px] border border-white/15">하차지</th>
                          <th className="px-3 py-2.5 text-left text-white font-bold whitespace-nowrap min-w-[200px] border border-white/15">주소</th>
                          {(selectedSheet.columns || []).map((c, ci, arr) => (
                            <th key={c.id} className="px-2 py-2 text-center text-white font-bold whitespace-nowrap min-w-[110px] border border-white/15">
                              <div className="flex items-center justify-center gap-0.5">
                                <button onClick={() => moveMultiColumn(c.id, -1)} disabled={ci === 0}
                                  className="text-white/40 hover:text-white text-[10px] leading-none shrink-0 disabled:opacity-0 disabled:pointer-events-none" title="왼쪽으로 이동">◀</button>
                                {c.isDefault ? (
                                  <span className="text-white text-[12px] px-0.5">{c.label}</span>
                                ) : (
                                  <input autoComplete="off"
                                    className="w-full bg-transparent text-white text-center font-bold text-[12px] border-b border-white/30 focus:border-white focus:outline-none placeholder:text-white/40"
                                    defaultValue={c.label}
                                    onBlur={e => updateMultiColumnLabel(c.id, e.target.value)}
                                    key={c.id + "-label"}
                                  />
                                )}
                                <button onClick={() => moveMultiColumn(c.id, 1)} disabled={ci === arr.length - 1}
                                  className="text-white/40 hover:text-white text-[10px] leading-none shrink-0 disabled:opacity-0 disabled:pointer-events-none" title="오른쪽으로 이동">▶</button>
                                {!c.isDefault && (
                                  <button onClick={() => removeMultiColumn(c.id)} className="text-white/50 hover:text-white text-[12px] leading-none shrink-0 ml-0.5">✕</button>
                                )}
                              </div>
                            </th>
                          ))}
                          <th className="px-2 py-2 text-white w-8 border border-white/15"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedSheet.rows || []).length === 0 ? (
                          <tr><td colSpan={(selectedSheet.columns || []).length + 3} className="py-12 text-center text-gray-400 border border-gray-200">
                            하차지를 추가하거나, 엑셀업로드로 한번에 가져오세요
                          </td></tr>
                        ) : (selectedSheet.rows || []).map((r, i) => (
                          <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                            <td className="px-2 py-1.5 border border-gray-200">
                              <input autoComplete="off" className="w-full px-2 py-1.5 text-[12.5px] font-semibold text-[#1B2B4B] rounded border border-transparent hover:border-gray-200 focus:border-[#1B2B4B] focus:outline-none"
                                defaultValue={r.name} onBlur={e => updateMultiRowField(r.id, "name", e.target.value)} key={r.id + "-name"} />
                            </td>
                            <td className="px-2 py-1.5 border border-gray-200">
                              <input autoComplete="off" className="w-full px-2 py-1.5 text-[12px] text-gray-600 rounded border border-transparent hover:border-gray-200 focus:border-[#1B2B4B] focus:outline-none"
                                defaultValue={r.address} onBlur={e => updateMultiRowField(r.id, "address", e.target.value)} key={r.id + "-addr"} />
                            </td>
                            {(selectedSheet.columns || []).map(c => (
                              <td key={c.id} className="px-2 py-1.5 border border-gray-200">
                                <input autoComplete="off" className="w-full px-2 py-1.5 text-[12.5px] font-bold text-blue-700 text-right rounded border border-transparent hover:border-gray-200 focus:border-[#1B2B4B] focus:outline-none"
                                  placeholder="-"
                                  defaultValue={r.prices?.[c.id] ? Number(r.prices[c.id]).toLocaleString() : ""}
                                  onBlur={e => updateMultiRowPrice(r.id, c.id, e.target.value)}
                                  key={r.id + c.id + "-price"} />
                              </td>
                            ))}
                            <td className="px-2 py-1.5 text-center border border-gray-200">
                              <button onClick={() => removeMultiRow(r.id)} className="w-6 h-6 rounded-full bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 text-[12px] leading-none flex items-center justify-center mx-auto transition">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="px-5 py-3 text-[11px] text-gray-400 border-t border-gray-100">※ 입력칸에서 벗어나면(포커스 아웃) 자동 저장됩니다 · 연락처는 별도로 관리하지 않습니다</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 엑셀업로드 모달 */}
      {multiUploadOpen && selectedSheet && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[999998]" onClick={() => setMultiUploadOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[560px] max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-[15px]">엑셀업로드</h3>
                <p className="text-white/60 text-[12px] mt-0.5">양식을 내려받아 값을 채운 뒤 그대로 업로드하세요</p>
              </div>
              <button onClick={() => setMultiUploadOpen(false)} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-[12px] text-gray-600 leading-relaxed mb-3">
                  ① 먼저 업로드 양식을 내려받으세요. 지금 이 단가표의 컬럼(하차지·주소·톤수)이 그대로 헤더로 채워져 있습니다.<br/>
                  ② 양식의 값 칸에 하차지명·주소·톤수별 단가를 채워 넣으세요 (톤수 헤더 이름은 그대로 두어야 정확히 매칭됩니다).<br/>
                  ③ 완성한 파일을 아래에서 업로드하면 톤수 컬럼명이 일치하는 칸에 자동으로 들어갑니다. 목록에 없는 톤수명을 새로 쓰면 새 구간이 자동으로 추가됩니다.
                </p>
                <button onClick={() => downloadMultiTemplate(selectedSheet)} className="w-full py-2 bg-white border border-blue-300 text-blue-700 text-[13px] font-bold rounded-lg hover:bg-blue-100 transition">
                  업로드 양식 다운로드
                </button>
              </div>
              <div>
                <label className={labelCls}>완성한 엑셀 파일 업로드</label>
                <input autoComplete="off" ref={multiFileRef} type="file" accept=".xlsx,.xls,.csv"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleMultiFileUpload(f); }}
                  className="w-full text-[13px] text-gray-600 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-[#1B2B4B] file:text-white file:text-[12px] file:font-bold file:cursor-pointer hover:file:bg-[#243a60]"
                />
                <p className="text-[11px] text-gray-400 mt-2">※ 연락처는 업로드 항목에 포함하지 않습니다</p>
              </div>
            </div>
            <div className="border-t border-gray-100 px-6 py-4 bg-gray-50 flex items-center justify-end">
              <button onClick={() => setMultiUploadOpen(false)} className="px-4 py-2 text-[13px] text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">닫기</button>
            </div>
          </div>
        </div>
      )}

{/* ===================== 직접 단가표 작성 모달 ===================== */}
      {manualModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[999998]" onClick={() => setManualModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[860px] max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* 모달 헤더 */}
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-[16px]">직접 단가표 작성</h3>
                <p className="text-white/60 text-[12px] mt-0.5">노선 정보와 단가를 직접 입력하여 단가표를 만드세요</p>
              </div>
              <button onClick={() => setManualModal(false)} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {/* 노선 정보 입력 */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="text-[13px] font-bold text-[#1B2B4B] mb-3">노선 정보</div>
                <datalist id="manual-vehicle-types">
                  {VEHICLE_GROUPS.map(g => <option key={g.value} value={g.label} />)}
                </datalist>
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">거래처명</label>
                    <input autoComplete="off" className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100" placeholder="예: (주)홍길동물류" value={manualInfo.client} onChange={e => setManualInfo(p => ({ ...p, client: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">상차지역 <span className="text-red-400">*</span></label>
                    <input autoComplete="off" className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100" placeholder="예: 인천" value={manualInfo.pickup} onChange={e => setManualInfo(p => ({ ...p, pickup: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">하차지역 <span className="text-red-400">*</span></label>
                    <input autoComplete="off" className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100" placeholder="예: 부산" value={manualInfo.drop} onChange={e => setManualInfo(p => ({ ...p, drop: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">차량종류</label>
                    <input autoComplete="off" list="manual-vehicle-types" className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100" placeholder="선택 또는 직접 입력" value={manualInfo.vehicle} onChange={e => setManualInfo(p => ({ ...p, vehicle: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">혼적 여부</label>
                    <div className="flex gap-1">
                      {["전체", "독차", "혼적"].map(opt => (
                        <button key={opt} type="button" onClick={() => setManualInfo(p => ({ ...p, mixedFilter: opt }))}
                          className={`flex-1 py-2 text-[12px] font-semibold rounded-lg border transition-all ${manualInfo.mixedFilter === opt ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">단가 기준</label>
                    <div className="flex gap-1">
                      {[["청구운임", "청구가"], ["기사운임", "기사운임"]].map(([val, label]) => (
                        <button key={val} type="button" onClick={() => setManualInfo(p => ({ ...p, fareField: val }))}
                          className={`flex-1 py-2 text-[12px] font-semibold rounded-lg border transition-all ${manualInfo.fareField === val ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">특이사항 / 메모</label>
                    <input autoComplete="off" className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100" placeholder="단가표 하단에 추가될 메모 (선택)" value={manualInfo.note} onChange={e => setManualInfo(p => ({ ...p, note: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* 단가 행 입력 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[13px] font-bold text-[#1B2B4B]">단가 행 입력</div>
                  <button onClick={addManualRow} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-[12px] font-bold rounded-lg hover:bg-blue-700 transition">
                    + 행 추가
                  </button>
                </div>
                <datalist id="manual-ton-options">
                  {STANDARD_TON_LABELS.map(t => <option key={t} value={t} />)}
                </datalist>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-[#1B2B4B]">
                        {["차량 톤수 / 구분", "권장 단가 (원)", "최소 운임 (원)", "최대 운임 (원)", "변동성", "신뢰도", ""].map(h => (
                          <th key={h} className="px-3 py-2.5 text-center text-[11px] font-bold text-white whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {manualRows.map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                          <td className="px-2 py-2">
                            <input autoComplete="off"
                              list="manual-ton-options"
                              className="w-full px-2 py-1.5 text-[12px] rounded border border-gray-200 focus:border-blue-400 focus:outline-none text-center font-bold text-[#1B2B4B]"
                              placeholder="선택 또는 직접 입력"
                              value={row.display}
                              onChange={e => updateManualRow(i, "display", e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input autoComplete="off"
                              className="w-full px-2 py-1.5 text-[12px] rounded border border-gray-200 focus:border-blue-400 focus:outline-none text-right font-bold text-blue-700"
                              placeholder="예: 150,000"
                              value={row.avg}
                              onChange={e => { const n = e.target.value.replace(/[^\d]/g, ""); updateManualRow(i, "avg", n ? Number(n).toLocaleString() : ""); }}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input autoComplete="off"
                              className="w-full px-2 py-1.5 text-[12px] rounded border border-gray-200 focus:border-blue-400 focus:outline-none text-right text-gray-600"
                              placeholder="예: 130,000"
                              value={row.min}
                              onChange={e => { const n = e.target.value.replace(/[^\d]/g, ""); updateManualRow(i, "min", n ? Number(n).toLocaleString() : ""); }}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input autoComplete="off"
                              className="w-full px-2 py-1.5 text-[12px] rounded border border-gray-200 focus:border-blue-400 focus:outline-none text-right text-gray-600"
                              placeholder="예: 180,000"
                              value={row.max}
                              onChange={e => { const n = e.target.value.replace(/[^\d]/g, ""); updateManualRow(i, "max", n ? Number(n).toLocaleString() : ""); }}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <select
                              className="w-full px-2 py-1.5 text-[12px] rounded border border-gray-200 focus:border-blue-400 focus:outline-none text-center"
                              value={row.varianceLabel}
                              onChange={e => updateManualRow(i, "varianceLabel", e.target.value)}
                            >
                              <option value="낮음">낮음</option>
                              <option value="보통">보통</option>
                              <option value="높음">높음</option>
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <select
                              className="w-full px-2 py-1.5 text-[12px] rounded border border-gray-200 focus:border-blue-400 focus:outline-none text-center"
                              value={row.confLabel}
                              onChange={e => updateManualRow(i, "confLabel", e.target.value)}
                            >
                              <option value="낮음">낮음</option>
                              <option value="보통">보통</option>
                              <option value="높음">높음</option>
                            </select>
                          </td>
                          <td className="px-2 py-2 text-center">
                            {manualRows.length > 1 && (
                              <button onClick={() => removeManualRow(i)} className="w-6 h-6 rounded-full bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 text-[13px] leading-none flex items-center justify-center mx-auto transition">✕</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-gray-400 mt-2">※ 권장 단가만 입력해도 인쇄 가능합니다. 운임 범위·변동성·신뢰도는 선택 입력입니다.</p>
              </div>
            </div>

            {/* 모달 하단 버튼 */}
            <div className="border-t border-gray-100 px-6 py-4 bg-gray-50 flex items-center justify-between">
              <button onClick={() => setManualModal(false)} className="px-4 py-2 text-[13px] text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">닫기</button>
              <div className="flex gap-2">
                <button onClick={addManualRow} className="px-4 py-2 text-[13px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition">+ 행 추가</button>
                <button onClick={handleManualPrint} className="flex items-center gap-2 px-5 py-2 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] transition shadow-sm">
                  🖨 인쇄 / PDF 저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {detailModal && (
        <OrderDetailModal rows={detailModal.rows} bucket={detailModal.bucket} fareField={result?.fareField||"청구운임"} onClose={()=>setDetailModal(null)} />
      )}
      {historyModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-[16px] font-bold text-[#1B2B4B]">단가표 발행 이력</h3>
                <p className="text-[12px] text-gray-400 mt-0.5">인쇄/PDF 저장 버튼을 누른 내역이 기록됩니다 · 더블클릭 시 상세보기</p>
              </div>
              <div className="flex items-center gap-2">
                {historySelected.size > 0 && (
                  <button onClick={() => {
                    const next = printHistory.filter((_, i) => !historySelected.has(i));
                    localStorage.setItem("rateCardHistory", JSON.stringify(next));
                    setPrintHistory(next);
                    setHistorySelected(new Set());
                  }} className="px-3 py-1.5 text-[12px] text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition">선택 삭제 ({historySelected.size})</button>
                )}
                {printHistory.length > 0 && (
                  <button onClick={() => { if(window.confirm("전체 이력을 삭제할까요?")) { localStorage.removeItem("rateCardHistory"); setPrintHistory([]); setHistorySelected(new Set()); }}} className="px-3 py-1.5 text-[12px] text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition">전체 삭제</button>
                )}
                <button onClick={() => { setHistoryModal(false); setHistorySelected(new Set()); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-[18px] transition">×</button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {printHistory.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-[14px]">아직 발행 이력이 없습니다</div>
              ) : (
                <div className="space-y-2">
                  {printHistory.map((h, i) => {
                    const dt = new Date(h.ts);
                    const dateStr = dt.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
                    const timeStr = dt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border transition cursor-pointer ${historySelected.has(i) ? "border-[#1B2B4B] bg-gray-50" : "border-gray-100 bg-white hover:bg-gray-50"}`}
                        onClick={() => setHistorySelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                        onDoubleClick={() => setHistoryDetailModal(h)}>
                        <input autoComplete="off" type="checkbox" readOnly checked={historySelected.has(i)} className="mt-1 w-4 h-4 rounded border-gray-300 accent-[#1B2B4B] shrink-0" />
                        <div className="mt-0.5 w-6 h-6 rounded flex items-center justify-center text-[11px] font-bold flex-shrink-0 bg-gray-200 text-gray-600">
                          {h.source === "manual" ? "수" : "자"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {h.client && <span className="text-[13px] font-bold text-gray-500 mr-1">[{h.client}]</span>}
                            <span className="text-[14px] font-bold text-[#1B2B4B]">{h.pickup || "-"}</span>
                            <span className="text-gray-400">→</span>
                            <span className="text-[14px] font-bold text-[#1B2B4B]">{h.drop || "-"}</span>
                            {h.vehicle && <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px]">{h.vehicle}</span>}
                            {h.mixedFilter && h.mixedFilter !== "전체" && <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px]">{h.mixedFilter}</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[12px] text-gray-500">
                            <span>{dateStr} {timeStr}</span>
                            <span>기준: {h.fareField}</span>
                            <span>{h.rowCount}개 차종</span>
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-600">{h.source === "manual" ? "수동작성" : "자동생성"}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex justify-end">
              <button onClick={() => setHistoryModal(false)} className="px-5 py-2 text-[13px] text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 발행이력 상세 팝업 */}
      {historyDetailModal && (() => {
        const h = historyDetailModal;
        const dt = new Date(h.ts);
        const dateStr = dt.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
        const timeStr = dt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
        const ff = h.fareField || "청구운임";
        // Use saved rows from publish time (not reconstructed from current data)
        const rows = h.savedRows || [];
        return (
          <div className="fixed inset-0 bg-black/60 z-[999999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
              <div className="bg-[#1B2B4B] px-6 py-4 rounded-t-2xl flex items-center justify-between">
                <div>
                  <div className="text-white font-bold text-[15px]">발행 이력 상세</div>
                  <div className="text-white/55 text-[11px] mt-0.5">{dateStr} {timeStr} 발행 · {h.source === "manual" ? "수동작성" : "자동생성"}</div>
                </div>
                <button onClick={() => setHistoryDetailModal(null)} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-lg">×</button>
              </div>
              <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap text-[12px]">
                <span className="font-bold text-[#1B2B4B] text-[14px]">{h.pickup}</span>
                <span className="text-gray-400">→</span>
                <span className="font-bold text-[#1B2B4B] text-[14px]">{h.drop}</span>
                {h.client && <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-600">[{h.client}]</span>}
                {h.vehicle && <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-600">{h.vehicle}</span>}
                {h.mixedFilter && h.mixedFilter !== "전체" && <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-600">{h.mixedFilter}</span>}
                <span className="px-2 py-0.5 bg-[#1B2B4B]/10 text-[#1B2B4B] rounded font-semibold">{ff}</span>
              </div>
              <div className="overflow-y-auto flex-1 p-4">
                {rows.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-[13px]">해당 조건의 데이터를 찾을 수 없습니다</div>
                ) : (
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-[#1B2B4B]">
                        {["차량 톤수","권장 단가","운임 범위","데이터 수","변동성"].map(h2=>(
                          <th key={h2} className="px-3 py-3 text-center text-[12px] font-bold text-white">{h2}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row,i) => (
                        <tr key={i} className={`border-b border-gray-100 ${i%2===0?"bg-white":"bg-gray-50/40"}`}>
                          <td className="px-3 py-3 text-center font-bold text-[#1B2B4B]">{row.display}</td>
                          <td className="px-3 py-3 text-center font-bold text-[#1B2B4B] text-[15px]">{row.avg.toLocaleString()}원</td>
                          <td className="px-3 py-3 text-center text-gray-500">{row.min.toLocaleString()} ~ {row.max.toLocaleString()}원</td>
                          <td className="px-3 py-3 text-center text-gray-500">{row.count}건</td>
                          <td className="px-3 py-3 text-center text-gray-500">{row.variance > 40 ? "높음" : row.variance > 20 ? "보통" : "낮음"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex justify-end rounded-b-2xl">
                <button onClick={() => setHistoryDetailModal(null)} className="px-5 py-2 text-[13px] text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">닫기</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}