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
  };

  const handlePrint = () => {
    if (!result) return;
    const today=new Date().toLocaleDateString("ko-KR");
    const w=window.open("","_blank");
    w.document.write(`<html><head><title>단가표_${result.pickup}_${result.drop}</title><style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Malgun Gothic',sans-serif;}body{background:white;color:#111;}.wrapper{width:794px;margin:0 auto;padding:40px 48px;}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #1B2B4B;}.logo{font-size:28px;font-weight:900;color:#1B2B4B;}.logo span{color:#3B82F6;}.company-info{text-align:right;font-size:12px;color:#555;line-height:1.7;}.doc-title{font-size:22px;font-weight:900;color:#1B2B4B;margin-bottom:4px;}.doc-sub{font-size:13px;color:#666;margin-bottom:24px;}.route-bar{display:flex;gap:12px;align-items:center;background:#F0F4FF;border:1px solid #C7D9FF;border-radius:10px;padding:14px 20px;margin-bottom:24px;}.route-item{font-size:13px;color:#444;}.route-item b{color:#1B2B4B;font-size:15px;}.route-arrow{font-size:20px;color:#3B82F6;font-weight:900;}table{width:100%;border-collapse:collapse;font-size:13px;}thead tr{background:#1B2B4B;}thead th{color:white;padding:11px 14px;text-align:center;font-weight:700;}tbody tr:nth-child(even){background:#F9FAFB;}td{padding:10px 14px;text-align:center;border-bottom:1px solid #E5E7EB;}.td-ton{font-weight:700;color:#1B2B4B;font-size:14px;}.td-price{font-weight:800;color:#2563EB;font-size:15px;}.badge-high{background:#D1FAE5;color:#065F46;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;}.badge-mid{background:#FEF3C7;color:#92400E;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;}.badge-low{background:#FEE2E2;color:#991B1B;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;}.notice{margin-top:28px;padding:14px 18px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;font-size:11.5px;color:#78350F;line-height:1.8;}.footer{margin-top:36px;padding-top:16px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:flex-end;}.stamp{width:64px;height:64px;border:2.5px solid #1B2B4B;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#1B2B4B;margin-left:16px;text-align:center;line-height:1.3;}</style></head><body><div class="wrapper"><div class="header"><div><div class="logo">RU<span>N</span>25</div><div style="font-size:11px;color:#888;margin-top:4px;">화물 운송 전문</div></div><div class="company-info"><div><b>${COMPANY.manager}</b></div><div>📞 ${COMPANY.phone} | ☎ ${COMPANY.tel}</div><div>✉ ${COMPANY.email}</div><div>${COMPANY.address}</div></div></div><div class="doc-title">운송 단가표</div><div class="doc-sub">Vehicle Rate Card | 발행일: ${today}</div><div class="route-bar"><div class="route-item"><b>${result.pickup}</b></div><div class="route-arrow">→</div><div class="route-item"><b>${result.drop}</b></div><div style="flex:1"></div><div class="route-item">차량: <b>${result.groupLabel}</b></div>${result.mixedFilter!=="전체"?`<div class="route-item" style="margin-left:12px;">[${result.mixedFilter}]</div>`:""}<div class="route-item" style="margin-left:12px;">조회기준: <b>${result.fareField}</b></div><div class="route-item" style="margin-left:12px;">근거 <b>${result.totalCount}</b>건</div></div><table><thead><tr><th>차량 톤수</th><th>권장 단가</th><th>운임 범위</th><th>데이터 수</th><th>신뢰도</th></tr></thead><tbody>${result.rows.map(row=>{const s=row.stats;const c=s.count>=10?"high":s.count>=4?"mid":"low";const cl=s.count>=10?"높음":s.count>=4?"보통":"낮음";return`<tr><td class="td-ton">${row.display}</td><td class="td-price">${s.avg.toLocaleString()}원</td><td style="color:#888;font-size:11px;">${roundDown10k(s.min).toLocaleString()} ~ ${roundDown10k(s.max).toLocaleString()}원</td><td style="color:#aaa;font-size:11px;">${s.count}건</td><td><span class="badge-${c}">${cl}</span></td></tr>`;}).join("")}</tbody></table><div class="notice"><b>※ 안내사항</b><br>• 위 단가는 ${result.pickup} ↔ ${result.drop} 구간의 과거 실적(${result.fareField}) 기반 참고 단가입니다 (1만원 단위 절사).<br>• 유가 변동, 차량 수급 상황에 따라 실제 운임은 달라질 수 있습니다.<br>• 신뢰도 '낮음'은 데이터 샘플이 적어 변동 가능성이 높으니 참고용으로만 활용하시기 바랍니다.<br>• 정확한 견적은 담당자에게 직접 문의해 주시기 바랍니다.</div><div class="footer"><div style="font-size:11px;color:#aaa;">본 자료는 영업 참고용이며 정식 계약서가 아닙니다.</div><div style="display:flex;align-items:center;"><div style="text-align:right;font-size:13px;color:#555;line-height:1.6;"><b style="color:#1B2B4B;font-size:15px;">${COMPANY.name}</b><br>${COMPANY.manager} ${COMPANY.phone}</div><div class="stamp">RUN<br>25</div></div></div></div></body></html>`);
    w.document.close(); w.focus(); setTimeout(()=>w.print(),500);
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
        {result && (
          <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2.5 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-xl hover:bg-[#243a60] transition shadow-sm">
            🖨 인쇄 / PDF 저장
          </button>
        )}
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
              <button onClick={()=>{setPickup("");setDrop("");setVGroup("");setMixedFilter("전체");setFareField("청구운임");setViewMode("톤수별");setResult(null);setSearched(false);}} className="px-3 py-2 bg-white border border-gray-200 text-gray-500 text-[13px] rounded-lg hover:bg-gray-50 transition">초기화</button>
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

      {detailModal && (
        <OrderDetailModal rows={detailModal.rows} bucket={detailModal.bucket} fareField={result?.fareField||"청구운임"} onClose={()=>setDetailModal(null)} />
      )}
    </div>
  );
}