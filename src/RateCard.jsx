// ===================== src/RateCard.jsx =====================
import React, { useState, useMemo, useRef, useEffect } from "react";
import { kpConfirm } from "./kpDialog";
import * as XLSX from "xlsx";
import { useLoadFullOrderHistory } from "./orderHistory";
import { db } from "./firebase";
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, serverTimestamp } from "firebase/firestore";
import KpSubNav from "./KpSubNav";

// 단가표 메뉴 전체에서 쓰는 표준 차량톤수 목록 — 다목적지 단가표의 기본(삭제 불가) 컬럼으로도 사용된다.
const STANDARD_TON_LABELS = ["다마스/라보","1톤","1.4톤","2.5톤","3.5톤","3.5톤광폭","5톤","5톤축","5톤플축","8톤","11톤","11톤축","15톤","18톤","25톤"];

// ⚠️ 예전엔 특정 운송사(RUN25) 정보가 여기 문자열로 고정 박혀있어서, 다른 운송사가
// 로그인해도 단가표 출력물에 항상 그 정보가 찍혔다. 지금은 로그인한 회사의
// transportApplications(가입 시 등록한 사업자정보) 문서를 실시간으로 읽어와
// 회사마다 자기 정보로 찍히게 한다 — RateCard 컴포넌트 안 useCompanyInfo 훅 참고.
const EMPTY_COMPANY = { name: "", manager: "", phone: "", email: "", address: "", tel: "" };
// 🧾 단가표 인쇄 양식(가로) — 1톤부터 톤수가 가로로 쭉, 위에 거래처·구간·독차/혼적·차량종류
//  [편집] 누르면 칸을 바로 고쳐서 인쇄할 수 있다.
function rateCardHtml({ company = {}, info = {}, rows = [], today = new Date().toLocaleDateString("ko-KR") }) {
  const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = (v) => { const n = Number(String(v ?? "").replace(/[^\d]/g, "")); return n ? n.toLocaleString() : "-"; };
  const cols = rows.filter((r) => String(r.display || "").trim());
  const chip = (k, v) => `<div class="chip"><span>${k}</span><b>${esc(v || "-")}</b></div>`;
  const level = (v) => `<span class="lv lv-${v === "높음" ? "h" : v === "보통" ? "m" : "l"}">${esc(v || "-")}</span>`;
  return `<html><head><meta charset="utf-8"><title>단가표_${esc(info.client || "")}_${esc(info.pickup)}_${esc(info.drop)}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700;900&family=JetBrains+Mono:wght@600;800&display=swap" rel="stylesheet">
<style>
@page{size:A4 landscape;margin:10mm}
*{margin:0;padding:0;box-sizing:border-box;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{background:#EEF2F8;color:#0F1A30}
.page{width:1123px;margin:18px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 18px 50px rgba(15,26,48,.18)}
.hero{padding:22px 30px;color:#fff;display:flex;justify-content:space-between;align-items:flex-end;gap:20px;background:linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)}
.en{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:800;letter-spacing:.3em;color:#8FB0F0}
.title{font-size:30px;font-weight:900;letter-spacing:.06em;margin-top:2px}
.co{text-align:right;font-size:12.5px;line-height:1.7;color:rgba(255,255,255,.75)}
.co b{color:#fff;font-size:16px}
.route{display:flex;align-items:center;gap:14px;padding:18px 30px;border-bottom:1px solid #E3E8F0}
.pt{font-size:22px;font-weight:900}
.arrow{flex:0 0 auto;height:2px;width:70px;background:linear-gradient(90deg,#2D4C82,#8FB0F0);position:relative}
.arrow:after{content:"";position:absolute;right:-2px;top:-5px;border:6px solid transparent;border-left:9px solid #8FB0F0}
.chips{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
.chip{border:1px solid #DCE3EE;border-radius:10px;padding:6px 12px;background:#F5F8FD}
.chip span{display:block;font-size:10.5px;color:#7A89A3;font-weight:700}.chip b{font-size:14px;font-weight:900}
.wrap{padding:18px 30px 8px;overflow:hidden}
table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed}
th,td{text-align:center;padding:11px 4px;font-size:13px;border-bottom:1px solid #EEF1F6}
thead th{background:#0B1428;color:#fff;font-weight:900;font-size:13.5px;white-space:nowrap}
thead th:first-child{border-radius:10px 0 0 0;width:110px;background:#1B2B4B}
thead th:last-child{border-radius:0 10px 0 0}
tbody th{background:#F3F6FA;color:#3A4A66;font-size:12.5px;font-weight:900;text-align:left;padding-left:14px}
.price{font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:800;color:#0B1428}
.range{font-family:'JetBrains Mono',monospace;font-size:11.5px;color:#5B6B85;font-weight:600;line-height:1.5}
.lv{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:900}
.lv-h{background:#0F1A30;color:#fff}.lv-m{background:#DCE6F7;color:#1B2B4B}.lv-l{background:#F3F6FA;color:#7A89A3;border:1px solid #E3E8F0}
.foot{display:flex;gap:16px;padding:14px 30px 24px;align-items:stretch}
.notice{flex:1;background:#F5F8FD;border:1px solid #DCE3EE;border-radius:12px;padding:12px 16px;font-size:11.5px;line-height:1.8;color:#3A4A66}
.memo{flex:1;border:1px dashed #C9D6EE;border-radius:12px;padding:12px 16px;font-size:12.5px;line-height:1.7;white-space:pre-wrap}
.stampbox{width:190px;border-radius:12px;background:#0F1A30;color:#fff;padding:12px 16px;font-size:12px;line-height:1.7}
.stampbox b{font-size:15px}
.bar{max-width:1123px;margin:14px auto 0;display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#fff;border:1px solid #DCE3EE;border-radius:12px;font-size:12.5px;color:#5B6B85}
.bar button{height:36px;padding:0 16px;border-radius:10px;border:none;font-weight:900;font-size:13px;cursor:pointer;margin-left:6px}
.edit [contenteditable]{outline:2px dashed #8FB0F0;outline-offset:-3px;border-radius:4px}
@media print{body{background:#fff}.bar{display:none}.page{margin:0;box-shadow:none;border-radius:0;width:auto}}
</style></head><body>
<div class="bar"><span>A4 가로로 인쇄됩니다 · [편집]을 누르면 금액·문구를 바로 고칠 수 있어요</span><span>
<button style="background:#EEF3FC;color:#1B2B4B" onclick="document.body.classList.toggle('edit');document.querySelectorAll('[data-ed]').forEach(function(e){e.contentEditable=document.body.classList.contains('edit')});this.textContent=document.body.classList.contains('edit')?'편집 끝':'편집'">편집</button>
<button style="background:#0F1A30;color:#fff" onclick="window.print()">인쇄 · PDF 저장</button></span></div>
<div class="page">
  <div class="hero">
    <div><div class="en">VEHICLE RATE CARD · ${esc(today)}</div><div class="title">운송 단가표</div></div>
    <div class="co"><b>${esc(company.name || "")}</b><br>${esc(company.manager || "")} ${esc(company.phone || "")}${company.tel ? ` · ☎ ${esc(company.tel)}` : ""}<br>${esc(company.email || "")}</div>
  </div>
  <div class="route">
    <div><div class="en" style="color:#2D4C82">FROM</div><div class="pt" data-ed>${esc(info.pickup || "출발지")}</div></div>
    <div class="arrow"></div>
    <div><div class="en" style="color:#2D4C82">TO</div><div class="pt" data-ed>${esc(info.drop || "도착지")}</div></div>
    <div class="chips">${chip("거래처", info.client)}${chip("배차 형태", info.mixed && info.mixed !== "전체" ? info.mixed : "독차·혼적")}${chip("차량 종류", info.vehicle)}${chip("단가 기준", info.fareField === "기사운임" ? "기사운임" : "청구운임 (VAT 별도)")}</div>
  </div>
  <div class="wrap"><table>
    <thead><tr><th>차량 톤수</th>${cols.map((r) => `<th>${esc(r.display)}</th>`).join("")}</tr></thead>
    <tbody>
      <tr><th>권장 단가</th>${cols.map((r) => `<td><span class="price" data-ed>${money(r.avg)}</span></td>`).join("")}</tr>
      <tr><th>운임 범위</th>${cols.map((r) => `<td><div class="range" data-ed>${r.min || r.max ? `${money(r.min)}<br>~ ${money(r.max)}` : "-"}</div></td>`).join("")}</tr>
      <tr><th>변동성</th>${cols.map((r) => `<td>${level(r.varianceLabel)}</td>`).join("")}</tr>
      <tr><th>신뢰도</th>${cols.map((r) => `<td>${level(r.confLabel)}</td>`).join("")}</tr>
    </tbody>
  </table></div>
  <div class="foot">
    <div class="notice"><b>안내</b><br>· 1만원 단위 절사 참고 단가이며 부가세 별도입니다.<br>· 유가·차량 수급·상하차 조건(대기·수작업·경유)에 따라 달라질 수 있습니다.<br>· 정확한 견적은 담당자에게 문의해 주세요.</div>
    ${info.note ? `<div class="memo" data-ed><b>특이사항</b><br>${esc(info.note)}</div>` : `<div class="memo" data-ed><b>특이사항</b><br> </div>`}
    <div class="stampbox"><span style="opacity:.6">발행</span><br><b>${esc(company.name || "")}</b><br>${esc(today)}</div>
  </div>
</div></body></html>`;
}


// 전화번호 하이픈 자동 포맷 (DispatchApp.jsx formatPhone과 동일 규칙) — 단가표/견적서
// 곳곳에서 COMPANY.phone/tel을 그대로 찍어쓰므로, 여기서 한 번만 포맷해두면 모든
// 소비처(RateCard.jsx 전체, MobileApp.jsx 등)에 전부 적용된다.
function formatPhone(phone) {
  const p = String(phone ?? "").replace(/[^\d]/g, "");
  if (p.length === 11) return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
  if (p.length === 10) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
  return p;
}

export function useCompanyInfo(userCompany) {
  const [info, setInfo] = useState(EMPTY_COMPANY);
  useEffect(() => {
    const co = (userCompany || "").trim();
    if (!co) { setInfo(EMPTY_COMPANY); return; }
    const unsub = onSnapshot(collection(db, "transportApplications"), (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      let found = docs.find(d => (d.companyName || "").trim() === co && d.type === "신규" && d.status === "approved");
      if (!found) found = docs.find(d => (d.companyName || "").trim() === co && d.type === "신규");
      if (!found) found = docs.find(d => (d.companyName || "").trim() === co && d.status === "approved");
      const d = found || {};
      setInfo({
        name: co,
        manager: d.representative || d.대표자 || d.ceo || "",
        phone: formatPhone(d.phone || d.연락처 || ""),
        email: d.email || "",
        address: d.address || d.주소 || "",
        tel: formatPhone(d.fax || d.팩스 || d.팩스번호 || ""),
      });
    }, () => {});
    return () => unsub();
  }, [userCompany]);
  return info;
}

// 단가표 하단 원형 도장 글씨 — 예전엔 "RUN 25"가 고정으로 찍혀 다른 회사 단가표에도 남의 회사 도장이 나왔다.
// 로그인한 회사명을 2줄(최대 6글자)로 나눠 찍는다.
const stampLabel = (name) => {
  const s = String(name || "").replace(/\(주\)|㈜|주식회사|\s/g, "").slice(0, 6);
  if (!s) return "";
  if (s.length <= 3) return s;
  const h = Math.ceil(s.length / 2);
  return `${s.slice(0, h)}<br>${s.slice(h)}`;
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
                  <tr key={i} className={`hover:bg-[#F5F8FD] transition ${i%2===0?"bg-white":"bg-gray-50/40"}`}>
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-500 whitespace-nowrap">{r.상차일||"-"}</td>
                    <td className="px-3 py-2.5 text-center text-[13px] font-medium text-gray-800 whitespace-nowrap">{r.거래처명||"-"}</td>
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-600 max-w-[80px] truncate" title={r.상차지명}>{r.상차지명||"-"}</td>
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-600 max-w-[80px] truncate" title={r.하차지명}>{r.하차지명||"-"}</td>
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-600 whitespace-nowrap">{r.차량종류||"-"}</td>
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-600 whitespace-nowrap">{r.차량톤수||"-"}</td>
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-600 whitespace-nowrap">{r.화물내용||"-"}</td>
                    <td className="px-3 py-2.5 text-center text-[13px] font-bold text-[#1B2B4B] whitespace-nowrap">{fare.toLocaleString()}원</td>
                    <td className="px-3 py-2.5 text-center text-[13px] text-[#4B6CB7] font-medium whitespace-nowrap">{driver.toLocaleString()}원</td>
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-500 whitespace-nowrap">{margin.toLocaleString()}원</td>
                    <td className="px-3 py-2.5 text-center">
                      {r.혼적 ? <span className="px-1.5 py-0.5 bg-[#1B2B4B] text-white rounded text-[11px] font-semibold">혼적</span>
                               : <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[11px]">독차</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex gap-6 text-[12px] text-gray-600">
          <span>평균 청구: <b className="text-[#1B2B4B]">{avgFare.toLocaleString()}원</b></span>
          <span>평균 기사: <b className="text-[#4B6CB7]">{avgDriver.toLocaleString()}원</b></span>
          <span>평균 수수료: <b className="text-gray-800">{avgMargin.toLocaleString()}원</b></span>
        </div>
      </div>
    </div>
  );
}

// 기준지명 입력용 자동완성 — 기본거래처(clients) 목록에서 검색/선택하면
// 거래처명+주소가 함께 채워진다. 시트를 바꿀 때마다 부모가 key를 바꿔줘서
// (아래 selectedSheet.id 기반 key) 내부 상태가 새 시트 값으로 리셋된다.
function BaseNameAutocomplete({ initialValue, clients = [], onCommit }) {
  const [value, setValue] = useState(initialValue || "");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const opts = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = (clients || []).filter(c => c.거래처명);
    if (!q) return list.slice(0, 12);
    return list.filter(c => (c.거래처명 || "").toLowerCase().includes(q)).slice(0, 12);
  }, [value, clients]);
  const commit = (name, addr) => { setValue(name); setOpen(false); onCommit(name, addr); };
  return (
    <div className="relative">
      <input autoComplete="off"
        className="w-full h-11 px-3.5 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] text-[14px] font-semibold text-[#0F1A30] placeholder:text-[#9AA9C3] placeholder:font-medium focus:bg-white focus:outline-none transition"
        placeholder="기본거래처에서 검색 또는 직접 입력"
        value={value}
        onChange={e => { setValue(e.target.value); setOpen(true); setActiveIdx(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setTimeout(() => setOpen(false), 150); onCommit(value, undefined); }}
        onKeyDown={e => {
          if (e.key === "Escape") { setOpen(false); return; }
          if (e.key === "ArrowDown" && open) { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, opts.length - 1)); return; }
          if (e.key === "ArrowUp" && open) { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return; }
          if ((e.key === "Enter" || e.key === "Tab") && open) {
            const m = opts[activeIdx];
            if (m) { e.preventDefault(); commit(m.거래처명, m.주소 || ""); }
          }
        }}
      />
      {open && opts.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
          {opts.map((c, i) => (
            <div key={c.id || c.거래처명 || i}
              className={`px-3 py-2 text-[13px] cursor-pointer border-b border-gray-50 ${i === activeIdx ? "bg-[#EEF3FB]" : "hover:bg-[#F5F8FD]"}`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={e => { e.preventDefault(); commit(c.거래처명, c.주소 || ""); }}>
              <div className="font-semibold text-[#1B2B4B]">{c.거래처명}</div>
              {c.주소 && <div className="text-gray-500 text-[11px] truncate">{c.주소}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RateCard({ dispatchData = [], userCompany = "", clients = [] }) {
  useLoadFullOrderHistory(true); // ⭐ 단가표 운임 매칭은 예전 오더 전체가 필요 — 메뉴를 열 때 1회
  const COMPANY = useCompanyInfo(userCompany);
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
    if (!await kpConfirm("이 단가표를 삭제할까요?")) return;
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

  // ⚡ 톤수 자동셋팅 — 자주 쓰는 차량 톤수를 한 번에 줄로 깔아 금액만 넣게 한다(이미 넣은 금액은 유지)
  const TON_PRESET = ["1톤", "1.4톤", "2.5톤", "3.5톤", "3.5톤 광폭", "5톤", "5톤 플러스", "5톤 축", "8톤", "11톤", "11톤 축", "15톤", "18톤", "25톤"];
  const blankRow = (display = "") => ({ display, avg: "", min: "", max: "", varianceLabel: "낮음", confLabel: "보통" });
  const autoTonRows = () => setManualRows((prev) => {
    const had = new Map(prev.filter((r) => String(r.display || "").trim()).map((r) => [String(r.display).replace(/\s+/g, ""), r]));
    const preset = TON_PRESET.map((t) => had.get(t.replace(/\s+/g, "")) || blankRow(t));
    const extra = prev.filter((r) => String(r.display || "").trim() && !TON_PRESET.some((t) => t.replace(/\s+/g, "") === String(r.display).replace(/\s+/g, "")));
    return [...preset, ...extra];
  });
  // 📥 엑셀 대용량 — 양식을 받아 톤수별 금액을 채워 올리면 그대로 단가표가 만들어진다
  const MANUAL_XLSX_HEAD = ["거래처명", "상차지역", "하차지역", "차량종류", "차량톤수", "권장단가", "최소운임", "최대운임"];
  const downloadManualTemplate = () => {
    const rows = TON_PRESET.map((t, i) => (i === 0 ? ["(주)예시물류", "인천", "부산", "윙바디", t, 150000, 130000, 180000] : ["", "", "", "", t, "", "", ""]));
    const ws = XLSX.utils.aoa_to_sheet([MANUAL_XLSX_HEAD, ...rows]);
    ws["!cols"] = MANUAL_XLSX_HEAD.map((h) => ({ wch: h.length < 5 ? 12 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "단가표");
    XLSX.writeFile(wb, "단가표_업로드양식.xlsx");
  };
  const manualFileRef = useRef(null);
  const uploadManualXlsx = async (file) => {
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      const head = (aoa[0] || []).map((h) => String(h).replace(/\s+/g, ""));
      const col = (name) => head.findIndex((h) => h === name || h.includes(name));
      const ci = { client: col("거래처"), pick: col("상차"), drop: col("하차"), kind: col("차량종류"), ton: col("톤수"), avg: col("권장"), min: col("최소"), max: col("최대") };
      if (ci.ton < 0 || ci.avg < 0) return alert("양식이 맞지 않습니다. '양식 받기'로 받은 파일에 입력해 주세요.");
      const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d]/g, "")); return n ? n.toLocaleString() : ""; };
      const body = aoa.slice(1).filter((r) => String(r[ci.ton] ?? "").trim());
      if (!body.length) return alert("톤수가 입력된 줄이 없습니다.");
      const first = aoa.slice(1).find((r) => [ci.client, ci.pick, ci.drop, ci.kind].some((k) => k >= 0 && String(r[k] ?? "").trim())) || [];
      const pickV = (k) => (k >= 0 ? String(first[k] ?? "").trim() : "");
      setManualInfo((p) => ({ ...p, client: pickV(ci.client) || p.client, pickup: pickV(ci.pick) || p.pickup, drop: pickV(ci.drop) || p.drop, vehicle: pickV(ci.kind) || p.vehicle }));
      setManualRows(body.map((r) => ({ ...blankRow(String(r[ci.ton]).trim()), avg: num(r[ci.avg]), min: ci.min >= 0 ? num(r[ci.min]) : "", max: ci.max >= 0 ? num(r[ci.max]) : "" })));
    } catch (e) { alert("엑셀을 읽지 못했습니다: " + (e?.message || e)); }
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
    w.document.write(rateCardHtml({ company: COMPANY, info: { client: manualInfo.client, pickup: manualInfo.pickup, drop: manualInfo.drop, mixed: manualInfo.mixedFilter, vehicle: manualInfo.vehicle, fareField: manualInfo.fareField, note: manualInfo.note }, rows: manualRows, today }));
    w.document.close();
    w.focus();
  };

  const handlePrint = () => {
    if (!result) return;
    addHistoryEntry({ source: "auto", pickup: result.pickup, drop: result.drop, vehicle: result.groupLabel, fareField: result.fareField, mixedFilter: result.mixedFilter, rowCount: result.rows.length, client: "", savedRows: result.rows });
    const today = new Date().toLocaleDateString("ko-KR");
    const w = window.open("", "_blank");
    w.document.write(rateCardHtml({ company: COMPANY, info: { client: "", pickup: result.pickup, drop: result.drop, mixed: result.mixedFilter, vehicle: result.groupLabel, fareField: result.fareField }, rows: result.rows.map((r) => ({ display: r.display, avg: r.stats.avg, min: r.stats.min ? roundDown10k(r.stats.min) : "", max: r.stats.max ? roundDown10k(r.stats.max) : "", varianceLabel: r.stats.variance > 40 ? "높음" : r.stats.variance > 20 ? "보통" : "낮음", confLabel: r.stats.count >= 10 ? "높음" : r.stats.count >= 4 ? "보통" : "낮음" })), today }));
    w.document.close();
    w.focus();
  };


  const today=new Date().toLocaleDateString("ko-KR");
  const inputCls="w-full px-1 py-2 text-[13px] font-medium border-0 border-b-2 border-gray-300 bg-transparent focus:border-[#1B2B4B] focus:outline-none placeholder:text-gray-400 transition";
  const labelCls="block text-[12px] font-bold text-gray-900 mb-1";

  // ⭐ 2026-10-29 리디자인 — 매출관리·배차현황과 같은 왼쪽 속메뉴(KpSubNav) + 네이비 디지털 카드
  const RC_MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
  const seg = (on) => `flex-1 h-10 rounded-[10px] text-[13px] font-bold transition ${on ? "bg-white text-[#0F1A30] shadow-[0_2px_8px_rgba(15,26,48,0.14)]" : "text-[#5B6B85] hover:text-[#0F1A30]"}`;
  const Eyebrow = ({ children }) => <div style={{ fontFamily: RC_MONO }} className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#4B6CB7]">{children}</div>;
  const FieldLabel = ({ children, req }) => <div className="text-[12px] font-bold text-[#3A4A66] mb-1.5">{children}{req && <span className="text-[#4B6CB7] ml-0.5">*</span>}</div>;
  const boxInput = "w-full h-11 px-3.5 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] text-[14px] font-semibold text-[#0F1A30] placeholder:text-[#9AA9C3] placeholder:font-medium focus:bg-white focus:outline-none transition";
  const PrintIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v7H6z" /></svg>;
  const resetRoute = () => { setPickup(""); setDrop(""); setVGroup(""); setMixedFilter("전체"); setFareField("청구운임"); setViewMode("톤수별"); setExcludeQuery(""); setExcludeList([]); setExcludeDropdown([]); setResult(null); setSearched(false); };
  const resultRows = result?.rows || [];
  const bestRow = resultRows.length ? resultRows.reduce((a, b) => (b.stats.count > a.stats.count ? b : a), resultRows[0]) : null;

  return (
    <KpSubNav code="RATE CARD" title="단가표" icon="money" active={pageMode} onSelect={setPageMode}
      items={[
        { key: "노선별", label: "노선별 단가표", en: "ROUTE", icon: "route" },
        { key: "다목적지", label: "다목적지 단가표", en: "MULTI DEST", icon: "pin", badge: multiSheets.length, soft: true, badgeTitle: `저장된 단가표 ${multiSheets.length}개` },
      ]}
      actionsLabel="도구"
      actions={[
        { key: "manual", label: "직접 작성", icon: "pen", onClick: openManualModal },
        { key: "history", label: "발행 이력", icon: "history", onClick: () => setHistoryModal(true), badge: printHistory.length, soft: true },
      ]}>
    <div className="min-h-full">
      {/* ── 머리줄 ── */}
      <div className="flex items-end justify-between gap-3 flex-wrap mb-5">
        <div>
          <Eyebrow>RATE CARD · {pageMode === "노선별" ? "ROUTE" : "MULTI DESTINATION"}</Eyebrow>
          <h1 className="text-[22px] font-black text-[#0F1A30] tracking-tight mt-0.5">{pageMode === "노선별" ? "노선별 단가표" : "다목적지 단가표"}</h1>
          <p className="text-[13px] text-[#5B6B85] mt-0.5">
            {pageMode === "노선별" ? "과거 배차 실적으로 노선·톤수별 권장 단가를 자동 계산합니다" : "기준지 1곳 → 하차지 여러 곳의 톤수·구간별 단가를 한 표로 관리합니다"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pageMode === "노선별" ? (
            <>
              <button onClick={() => setHistoryModal(true)} className="h-10 px-4 inline-flex items-center gap-2 rounded-xl bg-white border border-[#DCE3EF] text-[#1B2B4B] text-[13px] font-bold hover:bg-[#F5F8FD] transition">
                발행 이력
                {printHistory.length > 0 && <span style={{ fontFamily: RC_MONO }} className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#EEF3FB] text-[#1B2B4B] text-[11px] font-extrabold inline-flex items-center justify-center">{printHistory.length}</span>}
              </button>
              <button onClick={openManualModal} className="h-10 px-4 rounded-xl bg-white border border-[#1B2B4B] text-[#1B2B4B] text-[13px] font-bold hover:bg-[#F5F8FD] transition">직접 작성</button>
              <button onClick={handlePrint} disabled={!result || resultRows.length === 0} className="h-10 px-5 inline-flex items-center gap-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#2D4C82] transition disabled:opacity-40 disabled:cursor-not-allowed">
                <PrintIcon />인쇄 / PDF 저장
              </button>
            </>
          ) : (
            selectedSheet && (
              <>
                <button onClick={() => setMultiUploadOpen(true)} className="h-10 px-4 rounded-xl bg-white border border-[#DCE3EF] text-[#1B2B4B] text-[13px] font-bold hover:bg-[#F5F8FD] transition">엑셀 업로드</button>
                <button onClick={() => handleMultiPrint(selectedSheet)} className="h-10 px-5 inline-flex items-center gap-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#2D4C82] transition">
                  <PrintIcon />인쇄 / PDF 저장
                </button>
              </>
            )
          )}
        </div>
      </div>

      {pageMode === "노선별" && (
      <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] gap-4 md:gap-5 items-start">

        {/* ── 왼쪽: 노선 조건 ── */}
        <div className="bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)] overflow-hidden">
          <div className="relative px-5 py-4 text-white overflow-hidden" style={{ background: "linear-gradient(120deg, #0F1A30 0%, #1B2B4B 55%, #2D4C82 100%)" }}>
            <span className="absolute inset-0 opacity-[0.10]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "14px 14px" }} />
            <div className="relative">
              <div style={{ fontFamily: RC_MONO }} className="text-[10px] font-extrabold tracking-[0.26em] text-[#8FB0F0]">ROUTE INPUT</div>
              <div className="text-[16px] font-black mt-0.5">노선 조건</div>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* 상·하차 — 연결선으로 묶은 입력 */}
            <div>
              <FieldLabel req>상 · 하차 지역</FieldLabel>
              <div className="rounded-2xl border border-[#E3E8F0] bg-[#F5F8FD] overflow-hidden">
                {[["상차", pickup, setPickup, "예: 인천"], ["하차", drop, setDrop, "예: 부산"]].map(([lb, val, set, ph], i) => (
                  <label key={lb} className={`flex items-center gap-3 px-3.5 h-12 cursor-text ${i === 0 ? "border-b border-[#E3E8F0]" : ""}`}>
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${i === 0 ? "bg-[#1B2B4B]" : "border-2 border-[#4B6CB7] bg-white"}`} />
                    <span className="text-[12px] font-extrabold text-[#5B6B85] w-8 shrink-0">{lb}</span>
                    <input autoComplete="off" className="flex-1 min-w-0 bg-transparent !border-0 !shadow-none text-[14px] font-bold text-[#0F1A30] placeholder:text-[#9AA9C3] placeholder:font-medium focus:outline-none" placeholder={ph} value={val} onChange={e => set(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} />
                  </label>
                ))}
              </div>
            </div>

            {/* 차량종류 — 선택 타일 */}
            <div>
              <FieldLabel req>차량 종류</FieldLabel>
              <div className="grid grid-cols-2 gap-1.5">
                {VEHICLE_GROUPS.map((g, i) => (
                  <button key={g.value} type="button" onClick={() => setVGroup(g.value)}
                    className={`h-11 px-3 rounded-xl border text-[12.5px] font-bold text-left transition ${i === 0 ? "col-span-2" : ""} ${
                      vGroup === g.value ? "bg-[#1B2B4B] border-[#1B2B4B] text-white shadow-[0_6px_16px_rgba(27,43,75,0.25)]" : "bg-white border-[#E3E8F0] text-[#3A4A66] hover:border-[#8FB0F0]"
                    }`}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 세그먼트 3종 */}
            {[
              ["조회 방식", viewMode, setViewMode, [["톤수별", "톤수별"], ["파렛수별", "파렛수별"]]],
              ["혼적 여부", mixedFilter, setMixedFilter, [["전체", "전체"], ["독차", "독차"], ["혼적", "혼적"]]],
              ["조회 기준", fareField, setFareField, [["청구운임", "청구가"], ["기사운임", "기사운임"]]],
            ].map(([lb, val, set, opts]) => (
              <div key={lb}>
                <FieldLabel>{lb}</FieldLabel>
                <div className="flex gap-1 p-1 rounded-xl bg-[#EEF2F8]">
                  {opts.map(([v, l]) => <button key={v} type="button" onClick={() => set(v)} className={seg(val === v)}>{l}</button>)}
                </div>
              </div>
            ))}

            {/* 거래처 제외 */}
            <div>
              <FieldLabel>거래처 제외 <span className="font-medium text-[#9AA9C3]">(선택)</span></FieldLabel>
              <div className="relative" ref={excludeRef}>
                <input autoComplete="off" className={boxInput} placeholder="제외할 거래처 검색"
                  value={excludeQuery}
                  onChange={e => handleExcludeSearch(e.target.value)}
                  onFocus={() => { if (excludeQuery) handleExcludeSearch(excludeQuery); }}
                  onBlur={() => setTimeout(() => setExcludeDropdown([]), 200)}
                />
                {excludeDropdown.length > 0 && (
                  <div className="absolute z-50 w-full bg-white border border-[#E3E8F0] rounded-xl shadow-[0_16px_40px_rgba(15,26,48,0.18)] mt-1 max-h-48 overflow-y-auto">
                    {excludeDropdown.map(name => (
                      <button key={name} type="button" className="w-full text-left px-3 py-2.5 text-[13px] font-semibold text-[#1B2B4B] hover:bg-[#F5F8FD] transition flex items-center gap-2" onMouseDown={() => addExclude(name)}>
                        <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${excludeList.includes(name) ? "bg-[#1B2B4B] border-[#1B2B4B] text-white" : "border-[#C9D2E0]"}`}>{excludeList.includes(name) ? "✓" : ""}</span>
                        <span>{name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {excludeList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {excludeList.map(name => (
                    <span key={name} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 h-7 rounded-full bg-[#EEF3FB] border border-[#DCE3EF] text-[12px] font-bold text-[#1B2B4B]">
                      {name}
                      <button type="button" onClick={() => removeExclude(name)} className="w-4 h-4 rounded-full text-[#5B6B85] hover:bg-[#1B2B4B] hover:text-white text-[11px] leading-none flex items-center justify-center">✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button onClick={handleSearch} className="flex-1 h-12 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-black hover:bg-[#2D4C82] transition">단가표 생성</button>
              <button onClick={resetRoute} className="h-12 px-4 rounded-xl bg-white border border-[#DCE3EF] text-[#5B6B85] text-[13px] font-bold hover:bg-[#F5F8FD] transition">초기화</button>
            </div>
            <p className="text-[11.5px] text-[#7A89A3] leading-relaxed">냉장/냉동 · 카고/윙바디 · 다마스/라보는 각각 통합 집계 · 단가는 1만원 단위 절사 · 데이터 수(건)를 누르면 상세 오더를 볼 수 있습니다
              {viewMode === "파렛수별" && " · 파렛수별은 화물내용에 파렛수가 적힌 오더만 집계합니다"}
            </p>
          </div>
        </div>

        {/* ── 오른쪽: 결과 ── */}
        <div className="min-w-0 space-y-4">
          {!searched && (
            <div className="relative rounded-[20px] overflow-hidden text-center py-20 px-6" style={{ background: "radial-gradient(90% 120% at 50% 0%, #22396A 0%, #0F1A30 60%, #0B1428 100%)" }}>
              <span className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "28px 28px" }} />
              <div className="relative">
                <div style={{ fontFamily: RC_MONO }} className="text-[11px] font-extrabold tracking-[0.3em] text-[#8FB0F0]">RATE ENGINE · READY</div>
                <div className="text-[18px] font-black text-white mt-2">좌측 검색 조건을 입력하여 단가표 생성</div>
                <div className="text-[13px] text-white/55 mt-1.5">배차 데이터를 분석하여 특이값을 제외한 톤수별 권장 단가를 계산합니다.</div>
              </div>
            </div>
          )}

          {searched && result && (
            <>
              {/* 결과 머리 — 회사 + 노선 */}
              <div className="relative rounded-[20px] overflow-hidden text-white" style={{ background: "linear-gradient(120deg, #0F1A30 0%, #1B2B4B 55%, #2D4C82 100%)" }}>
                <span className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "18px 18px" }} />
                <div className="relative px-6 py-5 flex items-start justify-between gap-6 flex-wrap">
                  <div className="min-w-0">
                    <div style={{ fontFamily: RC_MONO }} className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]">TRANSPORT RATE CARD · {today}</div>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="text-[28px] font-black tracking-tight">{result.pickup}</span>
                      <svg width="34" height="14" viewBox="0 0 34 14" fill="none" stroke="#8FB0F0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 7h30M25 1l6 6-6 6" /></svg>
                      <span className="text-[28px] font-black tracking-tight">{result.drop}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                      {[result.groupLabel, result.viewMode, result.mixedFilter !== "전체" ? result.mixedFilter : null, result.fareField === "청구운임" ? "청구가 기준" : "기사운임 기준"].filter(Boolean).map(t => (
                        <span key={t} className="h-7 px-2.5 inline-flex items-center rounded-lg bg-white/10 border border-white/15 text-[12px] font-bold text-white/90">{t}</span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right text-[12.5px] text-white/70 leading-6 shrink-0">
                    <div className="text-[17px] font-black text-white">{COMPANY.name}</div>
                    {COMPANY.manager && <div className="font-bold text-white/85">{COMPANY.manager}</div>}
                    {(COMPANY.phone || COMPANY.tel) && <div style={{ fontFamily: RC_MONO }} className="text-[12px]">{[COMPANY.phone, COMPANY.tel].filter(Boolean).join("  ·  ")}</div>}
                    {COMPANY.email && <div style={{ fontFamily: RC_MONO }} className="text-[12px]">{COMPANY.email}</div>}
                  </div>
                </div>
              </div>

              {/* 요약 타일 */}
              {resultRows.length > 0 && (
                <div className="grid grid-cols-4 gap-3">
                  {[
                    ["조회 오더", "ORDERS", result.totalCount, "건"],
                    ["집계 구간", "BUCKETS", resultRows.length, "개"],
                    ["최저 권장 단가", "MIN", Math.min(...resultRows.map(r => r.stats.avg)).toLocaleString(), "원"],
                    ["최다 실적 구간", "TOP", bestRow ? bestRow.display : "-", bestRow ? `${bestRow.stats.count}건` : ""],
                  ].map(([lb, en, v, unit], i) => (
                    <div key={en} className={`rounded-2xl border px-4 py-3.5 ${i === 0 ? "bg-[#0F1A30] border-[#0F1A30] text-white" : "bg-white border-[#E3E8F0]"}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-[12px] font-bold ${i === 0 ? "text-white/80" : "text-[#3A4A66]"}`}>{lb}</span>
                        <span style={{ fontFamily: RC_MONO }} className={`text-[9.5px] font-extrabold tracking-[0.2em] ${i === 0 ? "text-[#8FB0F0]" : "text-[#9AA9C3]"}`}>{en}</span>
                      </div>
                      <div className="mt-1.5 flex items-baseline gap-1">
                        <span style={{ fontFamily: RC_MONO }} className={`text-[22px] font-black tabular-nums ${i === 0 ? "text-white" : "text-[#0F1A30]"}`}>{v}</span>
                        <span className={`text-[12px] font-bold ${i === 0 ? "text-white/60" : "text-[#7A89A3]"}`}>{unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 단가 표 */}
              {resultRows.length > 0 && (
              <div className="bg-white rounded-[20px] border border-[#E3E8F0] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#EEF1F6] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" />
                  <span style={{ fontFamily: RC_MONO }} className="text-[10.5px] font-extrabold tracking-[0.22em] text-[#9AA9C3]">RATES</span>
                  <span className="text-[15px] font-black text-[#0F1A30]">{result.viewMode === "파렛수별" ? "파렛수별" : "톤수별"} 권장 단가</span>
                </div>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#F5F8FD] border-b border-[#E3E8F0]">
                      {[result.viewMode === "파렛수별" ? "파렛 수" : "차량 톤수", "권장 단가", "운임 범위", "데이터 수", "신뢰도", "변동성"].map(h => (
                        <th key={h} className="px-4 py-3 text-center text-[12px] font-extrabold text-[#5B6B85] tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resultRows.map((row, i) => {
                      const s = row.stats; const conf = confidence(s.count);
                      const vLevel = s.variance > 40 ? "높음" : s.variance > 20 ? "보통" : "낮음";
                      const confN = conf.label === "높음" ? 3 : conf.label === "보통" ? 2 : 1;
                      return (
                        <tr key={i} className="border-b border-[#EEF1F6] last:border-0 hover:bg-[#F5F8FD] transition">
                          <td className="px-4 py-4 text-center">
                            <span className="inline-flex items-center justify-center min-w-[78px] h-8 px-3 rounded-lg bg-[#EEF3FB] text-[14px] font-black text-[#1B2B4B]">{row.display}</span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span style={{ fontFamily: RC_MONO }} className="text-[19px] font-black text-[#0F1A30] tabular-nums">{s.avg.toLocaleString()}</span>
                            <span className="text-[12px] text-[#7A89A3] ml-1 font-bold">원</span>
                          </td>
                          <td style={{ fontFamily: RC_MONO }} className="px-4 py-4 text-center text-[13px] text-[#3A4A66] font-bold tabular-nums">{roundDown10k(s.min).toLocaleString()} ~ {roundDown10k(s.max).toLocaleString()}</td>
                          <td className="px-4 py-4 text-center">
                            <button onClick={() => setDetailModal({ rows: s.rows, bucket: row.display })} style={{ fontFamily: RC_MONO }}
                              className="h-8 px-3 rounded-lg border border-[#DCE3EF] text-[13px] font-extrabold text-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white hover:border-[#1B2B4B] transition tabular-nums">
                              {s.count}건
                            </button>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-center gap-2">
                              <span className="flex gap-0.5">{[1, 2, 3].map(n => <span key={n} className={`w-2 h-4 rounded-sm ${n <= confN ? "bg-[#1B2B4B]" : "bg-[#DCE3EF]"}`} />)}</span>
                              <span className="text-[12px] font-bold text-[#3A4A66] w-7">{conf.label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className={`text-[12px] font-bold ${vLevel === "높음" ? "text-[#0F1A30]" : vLevel === "보통" ? "text-[#3A4A66]" : "text-[#7A89A3]"}`}>{vLevel}</span>
                            {s.trimmed && <span className="ml-1 text-[10.5px] text-[#9AA9C3] font-bold">(보정)</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}

              {resultRows.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-[#E3E8F0] bg-[#F5F8FD] p-4">
                  <div className="text-[13px] font-black text-[#1B2B4B] mb-2">안내사항</div>
                  <ul className="text-[12.5px] text-[#3A4A66] space-y-1 leading-relaxed">
                    <li>· 위 단가는 과거 실적 기반 참고 단가입니다 (1만원 단위 절사)</li>
                    <li>· 유가·수급 상황에 따라 실제 운임은 달라질 수 있습니다</li>
                    <li>· 신뢰도 "낮음"은 데이터가 적어 변동 가능성이 높습니다</li>
                    <li>· 데이터 수(건)를 누르면 상세 오더 내역을 볼 수 있습니다</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-[#E3E8F0] bg-[#F5F8FD] p-4">
                  <div className="text-[13px] font-black text-[#1B2B4B] mb-2">변동성 기준</div>
                  <div className="space-y-1.5 text-[12.5px]">
                    {[["낮음", "평균 ±20% 이내, 안정적"], ["보통", "평균 ±20~40% 수준"], ["높음", "연휴·수급에 따라 변동 큼, 협의 권장"]].map(([l, desc]) => (
                      <div key={l} className="flex items-center gap-2">
                        <span className="w-10 h-6 rounded-md bg-white border border-[#DCE3EF] text-[11px] font-extrabold text-[#1B2B4B] flex items-center justify-center">{l}</span>
                        <span className="text-[#3A4A66]">{desc}</span>
                      </div>
                    ))}
                    <div className="text-[11.5px] text-[#7A89A3] pt-0.5">※ IQR 방식으로 극단값을 자동 제거한 뒤 산출합니다</div>
                  </div>
                </div>
              </div>
              )}

              {resultRows.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#E3E8F0] px-6 py-4 flex items-center justify-between">
                <div className="text-[11.5px] text-[#7A89A3]">본 자료는 영업 참고용이며 정식 계약서가 아닙니다.</div>
                <div className="flex items-center gap-4">
                  <div className="text-right text-[13px] text-[#3A4A66] leading-6">
                    <div className="font-black text-[#0F1A30] text-[15px]">{COMPANY.name}</div>
                    <div>{COMPANY.manager} &nbsp; {COMPANY.phone}</div>
                  </div>
                  {stampLabel(COMPANY.name) && (
                    <div className="w-14 h-14 rounded-full border-2 border-[#1B2B4B] flex items-center justify-center text-[11px] font-black text-[#1B2B4B] text-center leading-tight" dangerouslySetInnerHTML={{ __html: stampLabel(COMPANY.name) }} />
                  )}
                </div>
              </div>
              )}

              {resultRows.length === 0 && (
                <div className="bg-white rounded-[20px] border border-[#E3E8F0] py-16 text-center">
                  <div className="text-[15px] font-black text-[#0F1A30]">조건에 맞는 데이터가 없습니다</div>
                  <div className="text-[13px] text-[#5B6B85] mt-1">상·하차 지역명을 더 넓게 입력하거나 혼적 여부를 "전체"로 바꿔 보세요.</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}

      {pageMode === "다목적지" && (
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 md:gap-5 items-start">
          {/* 왼쪽: 저장된 단가표 목록 */}
          <div className="bg-white rounded-[20px] border border-[#E3E8F0] overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-[#EEF1F6]">
              <div className="flex items-center justify-between">
                <div>
                  <Eyebrow>SHEETS</Eyebrow>
                  <div className="text-[15px] font-black text-[#0F1A30]">저장된 단가표</div>
                </div>
                <span style={{ fontFamily: RC_MONO }} className="h-6 px-2 rounded-full bg-[#EEF3FB] text-[#1B2B4B] text-[11px] font-extrabold inline-flex items-center">{multiSheets.length}</span>
              </div>
              <button onClick={createMultiSheet} disabled={multiSaving}
                className="w-full h-11 mt-3 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-black hover:bg-[#2D4C82] transition disabled:opacity-50">
                + 새 단가표 만들기
              </button>
            </div>
            <div className="p-3 max-h-[calc(100vh-360px)] overflow-y-auto">
              {multiSheets.length === 0 ? (
                <div className="text-center text-[#7A89A3] text-[12.5px] py-10 leading-relaxed">
                  아직 만든 다목적지 단가표가 없습니다.<br />기준지(상차지) 1곳 기준으로<br />여러 하차지의 단가를 관리해 보세요.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {multiSheets.map(s => {
                    const on = multiSelectedId === s.id;
                    return (
                      <button key={s.id} onClick={() => setMultiSelectedId(s.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border flex items-center gap-3 transition ${on ? "bg-[#1B2B4B] border-[#1B2B4B] text-white shadow-[0_8px_20px_rgba(27,43,75,0.25)]" : "bg-white border-[#E3E8F0] text-[#1B2B4B] hover:bg-[#F5F8FD]"}`}>
                        <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-[13px] font-black shrink-0 ${on ? "bg-white/15 text-white" : "bg-[#EEF3FB] text-[#1B2B4B]"}`}>{(s.baseName || "?").slice(0, 1)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold text-[13.5px] truncate">{s.baseName || "이름 없음"}</span>
                          <span style={{ fontFamily: RC_MONO }} className={`block text-[11px] mt-0.5 ${on ? "text-white/60" : "text-[#7A89A3]"}`}>하차지 {(s.rows || []).length}곳 · 구간 {(s.columns || []).length}개</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽: 선택된 단가표 편집 */}
          <div className="min-w-0">
            {!selectedSheet ? (
              <div className="relative rounded-[20px] overflow-hidden text-center py-20 px-6" style={{ background: "radial-gradient(90% 120% at 50% 0%, #22396A 0%, #0F1A30 60%, #0B1428 100%)" }}>
                <span className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "28px 28px" }} />
                <div className="relative">
                  <div style={{ fontFamily: RC_MONO }} className="text-[11px] font-extrabold tracking-[0.3em] text-[#8FB0F0]">MULTI DESTINATION</div>
                  <div className="text-[18px] font-black text-white mt-2">좌측 패널에서 단가표를 선택하거나 새 단가표 생성</div>
                  <div className="text-[13px] text-white/55 mt-1.5">메인 상차지 기준, 다중 하차지별 운송 단가를 통합 관리합니다.</div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 기준지 정보 */}
                <div className="bg-white rounded-[20px] border border-[#E3E8F0] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <Eyebrow>BASE</Eyebrow>
                      <div className="text-[15px] font-black text-[#0F1A30]">기준지(상차지) 정보</div>
                    </div>
                    <button onClick={() => removeMultiSheet(selectedSheet.id)} className="h-9 px-3 rounded-lg border border-[#DCE3EF] text-[12.5px] font-bold text-[#5B6B85] hover:bg-[#0F1A30] hover:text-white hover:border-[#0F1A30] transition">단가표 삭제</button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>기준지명 <span className="font-medium text-[#9AA9C3]">(기본거래처에서 검색)</span></FieldLabel>
                      <BaseNameAutocomplete
                        key={selectedSheet.id + "-base"}
                        initialValue={selectedSheet.baseName || ""}
                        clients={clients}
                        onCommit={(name, addr) => {
                          const patch = { baseName: name };
                          if (addr !== undefined) patch.baseAddress = addr;
                          patchSheet(selectedSheet.id, patch);
                        }}
                      />
                    </div>
                    <div>
                      <FieldLabel>주소</FieldLabel>
                      <input autoComplete="off" className={boxInput} placeholder="기준지 주소"
                        defaultValue={selectedSheet.baseAddress || ""}
                        onBlur={e => patchSheet(selectedSheet.id, { baseAddress: e.target.value })}
                        key={selectedSheet.id + "-addr"}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <FieldLabel>안내사항 <span className="font-medium text-[#9AA9C3]">(줄바꿈으로 여러 줄 · 표 위에 그대로 표시)</span></FieldLabel>
                    <textarea
                      className="w-full px-3.5 py-3 text-[13px] rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] focus:bg-white focus:outline-none leading-relaxed text-[#0F1A30]"
                      rows={3}
                      placeholder={"예: 1. 파레트(1100*1100), 배차 시 파레트 크기 공지\n2. 하차 후 거래명세서/파레트전표 서명 후 문자 전송"}
                      defaultValue={selectedSheet.note || ""}
                      onBlur={e => patchSheet(selectedSheet.id, { note: e.target.value })}
                      key={selectedSheet.id + "-note"}
                    />
                  </div>
                </div>

                {/* 단가 매트릭스 표 */}
                <div className="bg-white rounded-[20px] border border-[#E3E8F0] overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-[#EEF1F6] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" />
                      <span style={{ fontFamily: RC_MONO }} className="text-[10.5px] font-extrabold tracking-[0.22em] text-[#9AA9C3]">MATRIX</span>
                      <span className="text-[15px] font-black text-[#0F1A30]">하차지별 단가표</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={addMultiColumn} className="h-9 px-3 rounded-lg border border-[#DCE3EF] text-[12.5px] font-bold text-[#1B2B4B] hover:bg-[#F5F8FD] transition">+ 구간 추가</button>
                      <button onClick={addMultiRow} className="h-9 px-3 rounded-lg bg-[#1B2B4B] text-[12.5px] font-bold text-white hover:bg-[#2D4C82] transition">+ 하차지 추가</button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px] border-collapse">
                      <thead>
                        <tr className="bg-[#0F1A30]">
                          <th className="px-3 py-3 text-left text-white font-bold whitespace-nowrap min-w-[150px] border-r border-white/10">하차지</th>
                          <th className="px-3 py-3 text-left text-white font-bold whitespace-nowrap min-w-[220px] border-r border-white/10">주소</th>
                          {(selectedSheet.columns || []).map((c, ci, arr) => (
                            <th key={c.id} className="px-2 py-2.5 text-center text-white font-bold whitespace-nowrap min-w-[110px] border-r border-white/10">
                              <div className="flex items-center justify-center gap-0.5">
                                <button onClick={() => moveMultiColumn(c.id, -1)} disabled={ci === 0}
                                  className="text-white/40 hover:text-white text-[10px] leading-none shrink-0 disabled:opacity-0 disabled:pointer-events-none" title="왼쪽으로 이동">◀</button>
                                {c.isDefault ? (
                                  <span className="text-white text-[12px] px-0.5">{c.label}</span>
                                ) : (
                                  <input autoComplete="off"
                                    className="w-full bg-transparent !border-0 !border-b !border-white/30 !shadow-none text-white text-center font-bold text-[12px] focus:outline-none placeholder:text-white/40"
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
                          <th className="px-2 py-2 text-white w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedSheet.rows || []).length === 0 ? (
                          <tr><td colSpan={(selectedSheet.columns || []).length + 3} className="py-14 text-center text-[#7A89A3] text-[13px]">
                            하차지를 추가하거나, 엑셀 업로드로 한 번에 가져오세요
                          </td></tr>
                        ) : (selectedSheet.rows || []).map((r) => (
                          <tr key={r.id} className="border-b border-[#EEF1F6] hover:bg-[#F5F8FD]/70">
                            <td className="px-2 py-1.5 border-r border-[#EEF1F6]">
                              <input autoComplete="off" className="w-full px-2 py-1.5 text-[13px] font-bold text-[#0F1A30] rounded-lg border border-transparent hover:border-[#DCE3EF] focus:outline-none bg-transparent"
                                defaultValue={r.name} onBlur={e => updateMultiRowField(r.id, "name", e.target.value)} key={r.id + "-name"} />
                            </td>
                            <td className="px-2 py-1.5 border-r border-[#EEF1F6]">
                              <input autoComplete="off" className="w-full px-2 py-1.5 text-[12px] text-[#5B6B85] rounded-lg border border-transparent hover:border-[#DCE3EF] focus:outline-none bg-transparent"
                                defaultValue={r.address} onBlur={e => updateMultiRowField(r.id, "address", e.target.value)} key={r.id + "-addr"} />
                            </td>
                            {(selectedSheet.columns || []).map(c => (
                              <td key={c.id} className="px-2 py-1.5 border-r border-[#EEF1F6]">
                                <input autoComplete="off" style={{ fontFamily: RC_MONO }}
                                  className="w-full px-2 py-1.5 text-[13px] font-extrabold text-[#1B2B4B] text-right tabular-nums rounded-lg border border-transparent hover:border-[#DCE3EF] focus:outline-none bg-transparent placeholder:text-[#C9D2E0]"
                                  placeholder="-"
                                  defaultValue={r.prices?.[c.id] ? Number(r.prices[c.id]).toLocaleString() : ""}
                                  onBlur={e => updateMultiRowPrice(r.id, c.id, e.target.value)}
                                  key={r.id + c.id + "-price"} />
                              </td>
                            ))}
                            <td className="px-2 py-1.5 text-center">
                              <button onClick={() => removeMultiRow(r.id)} title="하차지 삭제" className="w-7 h-7 rounded-lg border border-[#DCE3EF] text-[#7A89A3] hover:bg-[#0F1A30] hover:text-white hover:border-[#0F1A30] text-[12px] leading-none flex items-center justify-center mx-auto transition">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="px-5 py-3 text-[11.5px] text-[#7A89A3] border-t border-[#EEF1F6]">※ 입력칸에서 벗어나면 자동 저장됩니다 · 연락처는 별도로 관리하지 않습니다</p>
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
              <div className="bg-[#F5F8FD] border border-[#E3E8F0] rounded-xl p-4">
                <p className="text-[12px] text-gray-600 leading-relaxed mb-3">
                  ① 먼저 업로드 양식을 내려받으세요. 지금 이 단가표의 컬럼(하차지·주소·톤수)이 그대로 헤더로 채워져 있습니다.<br/>
                  ② 양식의 값 칸에 하차지명·주소·톤수별 단가를 채워 넣으세요 (톤수 헤더 이름은 그대로 두어야 정확히 매칭됩니다).<br/>
                  ③ 완성한 파일을 아래에서 업로드하면 톤수 컬럼명이 일치하는 칸에 자동으로 들어갑니다. 목록에 없는 톤수명을 새로 쓰면 새 구간이 자동으로 추가됩니다.
                </p>
                <button onClick={() => downloadMultiTemplate(selectedSheet)} className="w-full py-2 bg-white border border-[#1B2B4B]/30 text-[#1B2B4B] text-[13px] font-bold rounded-lg hover:bg-[#F5F8FD] transition">
                  업로드 양식 다운로드
                </button>
              </div>
              <div>
                <label className={labelCls}>완성한 엑셀 파일 업로드</label>
                <input autoComplete="off" ref={multiFileRef} type="file" accept=".xlsx,.xls,.csv"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleMultiFileUpload(f); }}
                  className="w-full text-[13px] text-gray-600 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-[#1B2B4B] file:text-white file:text-[12px] file:font-bold file:cursor-pointer hover:file:bg-[#243a60]"
                />
                <p className="text-[11px] text-gray-500 mt-2">※ 연락처는 업로드 항목에 포함하지 않습니다</p>
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
          <div className="bg-white rounded-2xl shadow-2xl w-[980px] max-w-[96vw] max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
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
              <div className="bg-[#F5F8FD] border border-[#E3E8F0] rounded-xl p-4">
                <div className="text-[13px] font-bold text-[#1B2B4B] mb-3">노선 정보</div>
                <datalist id="manual-vehicle-types">
                  {VEHICLE_GROUPS.map(g => <option key={g.value} value={g.label} />)}
                </datalist>
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">거래처명</label>
                    <input autoComplete="off" className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-white focus:outline-none" placeholder="예: (주)홍길동물류" value={manualInfo.client} onChange={e => setManualInfo(p => ({ ...p, client: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">상차지역 <span className="text-[#4B6CB7]">*</span></label>
                    <input autoComplete="off" className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-white focus:outline-none" placeholder="예: 인천" value={manualInfo.pickup} onChange={e => setManualInfo(p => ({ ...p, pickup: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">하차지역 <span className="text-[#4B6CB7]">*</span></label>
                    <input autoComplete="off" className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-white focus:outline-none" placeholder="예: 부산" value={manualInfo.drop} onChange={e => setManualInfo(p => ({ ...p, drop: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">차량종류</label>
                    <input autoComplete="off" list="manual-vehicle-types" className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-white focus:outline-none" placeholder="선택 또는 직접 입력" value={manualInfo.vehicle} onChange={e => setManualInfo(p => ({ ...p, vehicle: e.target.value }))} />
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
                          className={`flex-1 py-2 text-[12px] font-semibold rounded-lg border transition-all ${manualInfo.fareField === val ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">특이사항 / 메모</label>
                    <input autoComplete="off" className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-white focus:outline-none" placeholder="단가표 하단에 추가될 메모 (선택)" value={manualInfo.note} onChange={e => setManualInfo(p => ({ ...p, note: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* 단가 행 입력 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[13px] font-bold text-[#1B2B4B]">단가 행 입력</div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={autoTonRows} title="1톤~25톤까지 톤수별 줄을 자동으로 깝니다" className="px-3 py-1.5 bg-[#2D4C82] text-white text-[12px] font-bold rounded-lg hover:bg-[#1B2B4B] transition whitespace-nowrap">톤수 자동셋팅</button>
                    <button onClick={downloadManualTemplate} className="px-3 py-1.5 border border-[#1B2B4B]/30 text-[#1B2B4B] text-[12px] font-bold rounded-lg hover:bg-[#F3F6FA] transition whitespace-nowrap">엑셀 양식 받기</button>
                    <button onClick={() => manualFileRef.current?.click()} className="px-3 py-1.5 border border-[#1B2B4B]/30 text-[#1B2B4B] text-[12px] font-bold rounded-lg hover:bg-[#F3F6FA] transition whitespace-nowrap">엑셀 업로드</button>
                    <input ref={manualFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { uploadManualXlsx(e.target.files?.[0]); e.target.value = ""; }} />
                    <button onClick={addManualRow} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1B2B4B] text-white text-[12px] font-bold rounded-lg hover:bg-[#2D4C82] transition whitespace-nowrap">
                      + 행 추가
                    </button>
                  </div>
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
                              className="w-full px-2 py-1.5 text-[12px] rounded border border-gray-200 focus:outline-none text-center font-bold text-[#1B2B4B]"
                              placeholder="선택 또는 직접 입력"
                              value={row.display}
                              onChange={e => updateManualRow(i, "display", e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input autoComplete="off"
                              className="w-full px-2 py-1.5 text-[12px] rounded border border-gray-200 focus:outline-none text-right font-bold text-[#1B2B4B]"
                              placeholder="예: 150,000"
                              value={row.avg}
                              onChange={e => { const n = e.target.value.replace(/[^\d]/g, ""); updateManualRow(i, "avg", n ? Number(n).toLocaleString() : ""); }}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input autoComplete="off"
                              className="w-full px-2 py-1.5 text-[12px] rounded border border-gray-200 focus:outline-none text-right text-gray-600"
                              placeholder="예: 130,000"
                              value={row.min}
                              onChange={e => { const n = e.target.value.replace(/[^\d]/g, ""); updateManualRow(i, "min", n ? Number(n).toLocaleString() : ""); }}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input autoComplete="off"
                              className="w-full px-2 py-1.5 text-[12px] rounded border border-gray-200 focus:outline-none text-right text-gray-600"
                              placeholder="예: 180,000"
                              value={row.max}
                              onChange={e => { const n = e.target.value.replace(/[^\d]/g, ""); updateManualRow(i, "max", n ? Number(n).toLocaleString() : ""); }}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <select
                              className="w-full px-2 py-1.5 text-[12px] rounded border border-gray-200 focus:outline-none text-center"
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
                              className="w-full px-2 py-1.5 text-[12px] rounded border border-gray-200 focus:outline-none text-center"
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
                              <button onClick={() => removeManualRow(i)} className="w-6 h-6 rounded-full bg-white border border-[#DCE3EF] text-[#7A89A3] hover:bg-[#0F1A30] hover:text-white text-[13px] leading-none flex items-center justify-center mx-auto transition">✕</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-gray-500 mt-2">※ 권장 단가만 입력해도 인쇄 가능합니다. 운임 범위·변동성·신뢰도는 선택 입력입니다.</p>
              </div>
            </div>

            {/* 모달 하단 버튼 */}
            <div className="border-t border-gray-100 px-6 py-4 bg-gray-50 flex items-center justify-between">
              <button onClick={() => setManualModal(false)} className="px-4 py-2 text-[13px] text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">닫기</button>
              <div className="flex gap-2">
                <button onClick={addManualRow} className="px-4 py-2 text-[13px] font-semibold text-[#1B2B4B] bg-white border border-[#1B2B4B]/30 rounded-lg hover:bg-[#F5F8FD] transition">+ 행 추가</button>
                <button onClick={handleManualPrint} className="flex items-center gap-2 px-5 py-2 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] transition shadow-sm">
                  인쇄 / PDF 저장
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
                <p className="text-[12px] text-gray-500 mt-0.5">인쇄/PDF 저장 버튼을 누른 내역이 기록됩니다 · 더블클릭 시 상세보기</p>
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
                <button onClick={() => { setHistoryModal(false); setHistorySelected(new Set()); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-[18px] transition">×</button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {printHistory.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-[14px]">아직 발행 이력이 없습니다</div>
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
                            <span className="text-gray-500">→</span>
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
                <span className="text-gray-500">→</span>
                <span className="font-bold text-[#1B2B4B] text-[14px]">{h.drop}</span>
                {h.client && <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-600">[{h.client}]</span>}
                {h.vehicle && <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-600">{h.vehicle}</span>}
                {h.mixedFilter && h.mixedFilter !== "전체" && <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-600">{h.mixedFilter}</span>}
                <span className="px-2 py-0.5 bg-[#1B2B4B]/10 text-[#1B2B4B] rounded font-semibold">{ff}</span>
              </div>
              <div className="overflow-y-auto flex-1 p-4">
                {rows.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 text-[13px]">해당 조건의 데이터를 찾을 수 없습니다</div>
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
    </KpSubNav>
  );
}
