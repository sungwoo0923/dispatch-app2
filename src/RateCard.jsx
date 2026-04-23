// ===================== src/RateCard.jsx =====================
import React, { useState, useMemo, useRef } from "react";

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
  if (c>=10) return { label:"높음", color:"text-emerald-600", bg:"bg-emerald-50 border-emerald-200" };
  if (c>=4)  return { label:"보통", color:"text-amber-600",   bg:"bg-amber-50 border-amber-200" };
  return           { label:"낮음", color:"text-red-500",    bg:"bg-red-50 border-red-200" };
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

export default function RateCard({ dispatchData = [] }) {
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [vGroup, setVGroup] = useState("");
  const [mixedFilter, setMixedFilter] = useState("전체");
  const [fareField, setFareField] = useState("청구운임");
  const [result, setResult] = useState(null);
  const [searched, setSearched] = useState(false);
const [detailModal, setDetailModal] = useState(null);
  const [viewMode, setViewMode] = useState("톤수별"); // 톤수별 | 파렛수별
  // 🔥 거래처 제외 필터
  const [excludeQuery, setExcludeQuery] = useState("");
  const [excludeList, setExcludeList] = useState([]);       // 제외할 거래처명 배열
  const [excludeDropdown, setExcludeDropdown] = useState([]); // 검색 드롭다운 후보
  const excludeRef = useRef(null);

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

    // 🔥 경유지 판별: "1.반찬 2.송원" 같은 패턴 제외
    const isTransitStop = (text) => /\d+\./.test(String(text || ""));

    let matched = dispatchData.filter(r => {
      // 🔥 상차지명 또는 하차지명에 "1." "2." 등 경유 번호가 있으면 제외
      if (isTransitStop(r.상차지명) || isTransitStop(r.하차지명)) return false;

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
  const [manualInfo, setManualInfo] = useState({ pickup: "", drop: "", vehicle: "", note: "", fareField: "청구운임", mixedFilter: "전체" });
  const [manualRows, setManualRows] = useState([
    { display: "", avg: "", min: "", max: "", varianceLabel: "낮음", confLabel: "보통" }
  ]);

  const openManualModal = () => {
    if (result && result.rows.length > 0) {
      setManualInfo({ pickup: result.pickup, drop: result.drop, vehicle: result.groupLabel, note: "", fareField: result.fareField, mixedFilter: result.mixedFilter });
      setManualRows(result.rows.map(r => ({
        display: r.display,
        avg: r.stats.avg ? r.stats.avg.toLocaleString() : "",
        min: r.stats.min ? roundDown10k(r.stats.min).toLocaleString() : "",
        max: r.stats.max ? roundDown10k(r.stats.max).toLocaleString() : "",
        varianceLabel: r.stats.variance > 40 ? "높음" : r.stats.variance > 20 ? "보통" : "낮음",
        confLabel: r.stats.count >= 10 ? "높음" : r.stats.count >= 4 ? "보통" : "낮음",
      })));
    } else {
      setManualInfo({ pickup: "", drop: "", vehicle: "", note: "", fareField: "청구운임", mixedFilter: "전체" });
      setManualRows([{ display: "", avg: "", min: "", max: "", varianceLabel: "낮음", confLabel: "보통" }]);
    }
    setManualModal(true);
  };

  const addManualRow = () => setManualRows(prev => [...prev, { display: "", avg: "", min: "", max: "", varianceLabel: "낮음", confLabel: "보통" }]);
  const removeManualRow = (idx) => setManualRows(prev => prev.filter((_, i) => i !== idx));
  const updateManualRow = (idx, field, value) => setManualRows(prev => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });

  const handleManualPrint = () => {
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
.badge-high{background:#D1FAE5;color:#065F46;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;}
.badge-mid{background:#FEF3C7;color:#92400E;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;}
.badge-low{background:#FEE2E2;color:#991B1B;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;}
.var-high{color:#EF4444;font-weight:700;font-size:12px;}
.var-mid{color:#F59E0B;font-weight:700;font-size:12px;}
.var-low{color:#10B981;font-weight:700;font-size:12px;}
.notice{margin-top:28px;padding:14px 18px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;font-size:11.5px;color:#78350F;line-height:1.8;}
.footer{margin-top:36px;padding-top:16px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:flex-end;}
.stamp{width:64px;height:64px;border:2.5px solid #1B2B4B;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#1B2B4B;margin-left:16px;text-align:center;line-height:1.3;}
@media print{.no-print{display:none!important;}}
</style></head><body>
<div class="wrapper">
<div class="no-print" style="margin-bottom:16px;text-align:right;">
  <button onclick="window.print()" style="padding:8px 20px;background:#2563EB;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">🖨 인쇄</button>
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
  ${manualInfo.vehicle ? `<div class="route-item">차량: <b>${manualInfo.vehicle}</b></div>` : ""}
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
      <td style="color:#888;font-size:11px;">${row.min && row.max ? row.min + " ~ " + row.max + "원" : "-"}</td>
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
    setTimeout(() => w.print(), 500);
  };

  const handlePrint = () => {
    if (!result) return;
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
.var-high{color:#EF4444;font-weight:700;font-size:12px;}
.var-mid{color:#F59E0B;font-weight:700;font-size:12px;}
.var-low{color:#10B981;font-weight:700;font-size:12px;}
.notice{margin-top:28px;padding:14px 18px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;font-size:11.5px;color:#78350F;line-height:1.8;}
.footer{margin-top:36px;padding-top:16px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:flex-end;}
.stamp{width:64px;height:64px;border:2.5px solid #1B2B4B;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#1B2B4B;margin-left:16px;text-align:center;line-height:1.3;}
@media print{.no-print{display:none!important;}}
</style></head><body>
<div class="wrapper">
<div class="no-print" style="margin-bottom:16px;text-align:right;">
  <button onclick="document.querySelectorAll('.edit-cell').forEach(el=>{el.style.display=el.style.display==='none'?'inline-block':'none';document.querySelectorAll('.view-cell').forEach(v=>{v.style.display=v.style.display==='none'?'inline':'none'});})" style="padding:8px 20px;background:#1B2B4B;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">✏ 수정</button>
  <button onclick="window.print()" style="padding:8px 20px;margin-left:8px;background:#2563EB;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">🖨 인쇄</button>
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
        <input class="edit-cell" type="text" style="display:none;width:120px;text-align:right;padding:4px;font-size:14px;font-weight:800;color:#2563EB;" value="${s.avg.toLocaleString()}" oninput="var n=this.value.replace(/[^\\d]/g,'');this.value=n?Number(n).toLocaleString():'0'" onchange="this.parentElement.querySelector('.view-cell').textContent=this.value+'원'">
      </td>
      <td>
        <span class="view-cell" style="color:#888;font-size:11px;">${roundDown10k(s.min).toLocaleString()} ~ ${roundDown10k(s.max).toLocaleString()}원</span>
        <span class="edit-cell" style="display:none;font-size:11px;">
          <input type="text" style="width:80px;text-align:right;padding:3px;font-size:11px;" value="${roundDown10k(s.min).toLocaleString()}" oninput="var n=this.value.replace(/[^\\d]/g,'');this.value=n?Number(n).toLocaleString():'0'">
          ~
          <input type="text" style="width:80px;text-align:right;padding:3px;font-size:11px;" value="${roundDown10k(s.max).toLocaleString()}" oninput="var n=this.value.replace(/[^\\d]/g,'');this.value=n?Number(n).toLocaleString():'0'">
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
    setTimeout(() => w.print(), 500);
  };


  const today=new Date().toLocaleDateString("ko-KR");
  const inputCls="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100 transition";
  const labelCls="block text-[12px] font-semibold text-gray-500 mb-1";

  return (
    <div className="p-5 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[18px] font-bold text-[#1B2B4B]">운송 단가표 생성</h2>
          <p className="text-[12px] text-gray-400 mt-0.5">노선별 톤수 단가표를 자동 생성하여 고객사에 제공하세요</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openManualModal} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-[13px] font-bold rounded-xl hover:bg-emerald-700 transition shadow-sm">
            단가표 작성
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2.5 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-xl hover:bg-[#243a60] transition shadow-sm">
            🖨 인쇄 / PDF 저장
          </button>
        </div>
      </div>

      {/* 검색 카드 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-5 overflow-hidden">
        <div className="bg-[#1B2B4B] px-5 py-3"><h3 className="text-[13px] font-bold text-white">노선 조건 입력</h3></div>
        <div className="p-5">
          <div className="grid grid-cols-6 gap-3 mb-3">
            <div>
              <label className={labelCls}>상차지역 <span className="text-red-400">*</span></label>
              <input className={inputCls} placeholder="예: 인천" value={pickup} onChange={e=>setPickup(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSearch()} />
            </div>
            <div>
              <label className={labelCls}>하차지역 <span className="text-red-400">*</span></label>
              <input className={inputCls} placeholder="예: 부산" value={drop} onChange={e=>setDrop(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSearch()} />
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
                    className={`flex-1 py-2 text-[12px] font-semibold rounded-lg border transition-all ${fareField===val?"bg-blue-600 text-white border-blue-600":"bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <button onClick={handleSearch} className="flex-1 py-2 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] transition">단가표 생성</button>
                            <button onClick={()=>{setPickup("");setDrop("");setVGroup("");setMixedFilter("전체");setFareField("청구운임");setViewMode("톤수별");setExcludeQuery("");setExcludeList([]);setExcludeDropdown([]);setResult(null);setSearched(false);}} className="px-3 py-2 bg-white border border-gray-200 text-gray-500 text-[13px] rounded-lg hover:bg-gray-50 transition">초기화</button>

            </div>
          </div>
            {/* 🔥 거래처 제외 필터 */}
          <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <label className={labelCls}>거래처 제외 (선택)</label>
            <div className="flex items-start gap-3">
              {/* 검색 입력 + 드롭다운 */}
              <div className="relative w-64" ref={excludeRef}>
                <input
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
                        className="w-full text-left px-3 py-2 text-[13px] hover:bg-blue-50 transition flex items-center gap-2"
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

              {/* 선택된 제외 거래처 태그 */}
              <div className="flex-1 flex flex-wrap gap-1.5 min-h-[36px] items-center">
                {excludeList.length === 0 && (
                  <span className="text-[12px] text-gray-400">제외할 거래처를 검색하여 선택하세요</span>
                )}
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
            </div>
          </div>
          <p className="text-[11px] text-gray-400">※ 냉장/냉동 통합 · 카고/윙바디 통합 · 다마스/라보 통합 &nbsp;|&nbsp; 단가는 1만원 단위 절사 · 데이터 수(건) 클릭 시 상세 오더 확인 가능
            {viewMode==="파렛수별" && " · 파렛수별 조회 시 화물내용에 파렛수가 입력된 데이터만 집계됩니다"}
          </p>
        </div>
      </div>

      {/* 결과 */}
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
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-[18px] font-bold text-[#1B2B4B]">운송 단가표</div>
                <div className="text-[12px] text-gray-400">발행일: {today}</div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                  <span className="text-[15px] font-bold text-[#1B2B4B]">{result.pickup}</span>
                  <span className="text-blue-500 font-bold text-lg">→</span>
                  <span className="text-[15px] font-bold text-[#1B2B4B]">{result.drop}</span>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[12px] text-gray-600">차량: <b className="text-[#1B2B4B]">{result.groupLabel}</b></div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 text-[12px] font-bold text-indigo-700">{result.viewMode}</div>
                {result.mixedFilter!=="전체" && <div className="bg-violet-50 border border-violet-200 rounded-xl px-3 py-2 text-[12px] font-bold text-violet-700">{result.mixedFilter}</div>}
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-[12px] text-blue-600 font-semibold">{result.fareField==="청구운임"?"청구가 기준":"기사운임 기준"}</div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[12px] text-gray-500">조회 <b className="text-[#1B2B4B]">{result.totalCount}</b>건</div>
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
                  const vColor=s.variance>40?"text-red-500":s.variance>20?"text-amber-500":"text-emerald-600";
                  return (
                    <tr key={i} className={`border-b border-gray-100 hover:bg-blue-50/30 transition ${i%2===0?"bg-white":"bg-gray-50/40"}`}>
                      <td className="px-4 py-3.5 text-center font-bold text-[#1B2B4B] text-[15px]">{row.display}</td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-[17px] font-black text-blue-700">{s.avg.toLocaleString()}</span>
                        <span className="text-[12px] text-gray-400 ml-1">원</span>
                      </td>
                      <td className="px-4 py-3.5 text-center text-[12px] text-gray-500">{roundDown10k(s.min).toLocaleString()} ~ {roundDown10k(s.max).toLocaleString()}원</td>
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
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="text-[13px] font-bold text-amber-800 mb-2">📌 안내사항</div>
              <ul className="text-[12px] text-amber-700 space-y-1 leading-relaxed">
                <li>• 위 단가는 과거 실적 기반 참고 단가입니다 (1만원 단위 절사)</li>
                <li>• 유가·수급 상황에 따라 실제 운임은 달라질 수 있습니다</li>
                <li>• 신뢰도 "낮음"은 데이터 샘플이 적어 변동 가능성이 높습니다</li>
                <li>• 데이터 수(건) 클릭 시 상세 오더 내역을 확인할 수 있습니다</li>
              </ul>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="text-[13px] font-bold text-gray-700 mb-2">📊 변동성 기준</div>
              <div className="space-y-1.5 text-[12px]">
                {[["낮음","bg-emerald-100 text-emerald-700","평균 ±20% 이내, 안정적"],["보통","bg-amber-100 text-amber-700","평균 ±20~40% 수준"],["높음","bg-red-100 text-red-600","연휴·수급에 따라 변동 큼, 협의 권장"]].map(([l,cls,desc])=>(
                  <div key={l} className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full font-semibold text-[11px] ${cls}`}>{l}</span>
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
{/* ===================== 직접 단가표 작성 모달 ===================== */}
      {manualModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[999998]" onClick={() => setManualModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[860px] max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* 모달 헤더 */}
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-[16px]">✏️ 직접 단가표 작성</h3>
                <p className="text-white/60 text-[12px] mt-0.5">노선 정보와 단가를 직접 입력하여 단가표를 만드세요</p>
              </div>
              <button onClick={() => setManualModal(false)} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {/* 노선 정보 입력 */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="text-[13px] font-bold text-[#1B2B4B] mb-3">노선 정보</div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">상차지역 <span className="text-red-400">*</span></label>
                    <input className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100" placeholder="예: 인천" value={manualInfo.pickup} onChange={e => setManualInfo(p => ({ ...p, pickup: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">하차지역 <span className="text-red-400">*</span></label>
                    <input className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100" placeholder="예: 부산" value={manualInfo.drop} onChange={e => setManualInfo(p => ({ ...p, drop: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">차량종류</label>
                    <input className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100" placeholder="예: 카고/윙바디/탑차" value={manualInfo.vehicle} onChange={e => setManualInfo(p => ({ ...p, vehicle: e.target.value }))} />
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
                    <input className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100" placeholder="단가표 하단에 추가될 메모 (선택)" value={manualInfo.note} onChange={e => setManualInfo(p => ({ ...p, note: e.target.value }))} />
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
                            <input
                              className="w-full px-2 py-1.5 text-[12px] rounded border border-gray-200 focus:border-blue-400 focus:outline-none text-center font-bold text-[#1B2B4B]"
                              placeholder="예: 1톤"
                              value={row.display}
                              onChange={e => updateManualRow(i, "display", e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-full px-2 py-1.5 text-[12px] rounded border border-gray-200 focus:border-blue-400 focus:outline-none text-right font-bold text-blue-700"
                              placeholder="예: 150,000"
                              value={row.avg}
                              onChange={e => { const n = e.target.value.replace(/[^\d]/g, ""); updateManualRow(i, "avg", n ? Number(n).toLocaleString() : ""); }}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-full px-2 py-1.5 text-[12px] rounded border border-gray-200 focus:border-blue-400 focus:outline-none text-right text-gray-600"
                              placeholder="예: 130,000"
                              value={row.min}
                              onChange={e => { const n = e.target.value.replace(/[^\d]/g, ""); updateManualRow(i, "min", n ? Number(n).toLocaleString() : ""); }}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
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
    </div>
  );
}