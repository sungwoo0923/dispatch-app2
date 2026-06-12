// ===================== FixedClients.jsx =====================
import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { db } from "./firebase";
import { collection, onSnapshot, setDoc, doc, deleteDoc, getDocs, updateDoc } from "firebase/firestore";
import { Dialog } from "@headlessui/react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

const fmt = (n) => (n ? Number(n).toLocaleString() : "0");

// ── 첨부파일 뷰어 (고정거래처) ──
function FCAttachViewer({ row, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!row?.id) return;
    const colRef = collection(db, "fixedClients", row.id, "attachments");
    const unsub = onSnapshot(colRef, (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [row]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") { if (selected) setSelected(null); else onClose(); } };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, onClose]);

  const handleDownload = (item) => {
    const a = document.createElement("a");
    a.href = item.base64 || item.url;
    a.download = item.name || "attachment.jpg";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => { if (selected) setSelected(null); else onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-white font-bold text-[15px]">첨부파일</div>
            <div className="text-white/60 text-[12px] mt-0.5">{row.날짜} · {row.거래처명} {row.이름 ? `· ${row.이름}` : ""}</div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-[13px]">불러오는 중...</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <div className="mt-2 text-[13px]">첨부파일 없음</div>
            </div>
          ) : selected ? (
            <div className="flex flex-col items-center gap-3">
              <img src={selected.base64 || selected.url} alt={selected.name} className="max-w-full max-h-[60vh] rounded-lg object-contain"/>
              <div className="flex gap-2">
                <button onClick={() => handleDownload(selected)} className="px-4 py-2 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-semibold hover:bg-[#243a60]">다운로드</button>
                <button onClick={() => setSelected(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-[12px] font-semibold hover:bg-gray-50">목록으로</button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {items.map(item => (
                <div key={item.id} onClick={() => setSelected(item)} className="cursor-pointer rounded-xl overflow-hidden border border-gray-200 hover:border-[#1B2B4B] hover:shadow-md transition group">
                  <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                    {(item.base64 || item.url) ? (
                      <img src={item.base64 || item.url} alt={item.name} className="w-full h-full object-cover"/>
                    ) : (
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    )}
                  </div>
                  <div className="px-2 py-1.5 text-[10px] text-gray-500 truncate">{item.name || "파일"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, unit = "원", color = "blue" }) {
  const colors = {
    blue: "border-l-blue-500 bg-blue-50/50",
    green: "border-l-emerald-500 bg-emerald-50/50",
    orange: "border-l-orange-500 bg-orange-50/50",
    purple: "border-l-purple-500 bg-purple-50/50",
  };
  return (
    <div className={`bg-white rounded-xl border border-gray-200 border-l-4 ${colors[color]} shadow-sm p-4`}>
      <div className="text-[12px] font-semibold text-gray-500 mb-1">{title}</div>
      <div className="text-[20px] font-bold text-gray-900">
        {value}<span className="text-[13px] font-semibold text-gray-400 ml-1">{unit}</span>
      </div>
    </div>
  );
}

function parseTonToKg(s) {
  const str = String(s || "").trim();
  const kg = str.match(/([\d.]+)\s*kg/i);
  if (kg) return parseFloat(kg[1]);
  const ton = str.match(/([\d.]+)\s*톤/);
  if (ton) return parseFloat(ton[1]) * 1000;
  const bare = str.match(/^([\d.]+)$/);
  if (bare) return parseFloat(bare[1]) * 1000;
  return null;
}

function calcRow(row) {
  const qty = Number(row.수량 || 0);
  const d = Number(row.기사단가 || 0);
  const f = Number(row.수수료단가 || 0);
  const basis = row.수수료기준 || "수량";
  let tonNum = 0;
  if (basis === "톤수") {
    const parsed = parseTonToKg(row.톤수);
    tonNum = parsed !== null ? parsed / 1000 : 0;
  }
  const 기사운임 = qty * d;
  const 수수료 = basis === "톤수" ? Math.round(tonNum * f) : qty * f;
  const 선결제 = Number(row.선결제 || 0);
  const 실수수료 = 수수료 - 선결제;
  const 청구운임 = 기사운임 + 수수료;
  return { ...row, 기사운임, 수수료, 선결제, 실수수료, 청구운임 };
}

const thisMonthStart = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`; };
const thisMonthEnd = () => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10); };

function DriverSearchInput({ value, onChange, onSelect, drivers, placeholder = "차량번호 또는 이름 검색", className = "" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => { setQuery(value || ""); }, [value]);

  const suggestions = useMemo(() => {
    const q = (query || "").replace(/\s+/g, "").toLowerCase();
    if (!q) return [];
    return drivers.filter(d =>
      (d.차량번호 || "").replace(/\s+/g, "").toLowerCase().includes(q) ||
      (d.이름 || "").toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query, drivers]);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <input
        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-[12px] text-center"
        placeholder={placeholder}
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (query) setOpen(true); }}
        onKeyDown={e => {
          if (e.key === "Enter" && suggestions.length > 0) {
            onSelect(suggestions[0]); setQuery(suggestions[0].차량번호); setOpen(false);
          }
        }}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto min-w-[200px]">
          {suggestions.map((d, i) => (
            <div key={i} className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex items-center gap-2 text-[12px]"
              onMouseDown={() => { onSelect(d); setQuery(d.차량번호); setOpen(false); }}>
              <span className="font-bold text-[#1B2B4B]">{d.이름}</span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-600">{d.차량번호}</span>
              {d.전화번호 && <span className="text-gray-400 ml-auto">{d.전화번호}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TonnageInput({ value, onChange }) {
  const parse = (v) => {
    const s = String(v || "");
    if (s.toLowerCase().includes("kg")) return { num: s.replace(/kg/gi, "").trim(), unit: "kg" };
    if (s.includes("톤")) return { num: s.replace("톤", "").trim(), unit: "톤" };
    return { num: s, unit: "없음" };
  };
  const [num, setNum] = useState(() => parse(value).num);
  const [unit, setUnit] = useState(() => parse(value).unit);

  useEffect(() => {
    const p = parse(value);
    setNum(p.num);
    setUnit(p.unit);
  }, [value]);

  const emit = (n, u) => {
    if (!n.trim()) { onChange(""); return; }
    onChange(u === "없음" ? n : `${n}${u}`);
  };

  return (
    <div className="flex gap-1">
      <input
        type="text"
        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] min-w-0"
        value={num}
        placeholder="수치"
        onChange={e => { setNum(e.target.value); emit(e.target.value, unit); }}
      />
      <select
        className="border border-gray-200 rounded-lg px-1 py-1.5 text-[13px] shrink-0"
        value={unit}
        onChange={e => { setUnit(e.target.value); emit(num, e.target.value); }}
      >
        <option value="없음">없음</option>
        <option value="톤">톤</option>
        <option value="kg">kg</option>
      </select>
    </div>
  );
}

function FastRowCard({ idx, row, drivers, rows, getClientConfigs, onUpdate, onSelectDriver, onSelectClient, onDelete }) {
  const [searchQ, setSearchQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setSearchOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const searchResults = useMemo(() => {
    const q = (searchQ || "").toLowerCase().replace(/\s/g, "");
    if (!q) return [];
    return rows.filter(r =>
      (r.거래처명 || "").toLowerCase().replace(/\s/g, "").includes(q) ||
      (r.이름 || "").toLowerCase().replace(/\s/g, "").includes(q) ||
      (r.차량번호 || "").toLowerCase().replace(/\s/g, "").includes(q)
    ).slice(0, 8);
  }, [searchQ, rows]);

  const copyFrom = (r) => {
    const configs = getClientConfigs();
    const cfg = configs[r.거래처명] || {};
    const merged = {
      ...row,
      거래처명: r.거래처명 || row.거래처명,
      톤수: r.톤수 || row.톤수,
      수량: r.수량 || row.수량,
      차량번호: r.차량번호 || row.차량번호,
      이름: r.이름 || row.이름,
      핸드폰번호: r.핸드폰번호 || row.핸드폰번호,
      기사단가: cfg.기사단가 || r.기사단가 || row.기사단가,
      수수료단가: cfg.수수료단가 || r.수수료단가 || row.수수료단가,
      수수료기준: cfg.수수료기준 || r.수수료기준 || row.수수료기준 || "수량",
      지급방식: r.지급방식 || row.지급방식,
      선결제: 0,
    };
    const c = calcRow(merged);
    Object.entries(c).forEach(([k, v]) => { if (k !== "id" && k !== "정산완료" && k !== "날짜") onUpdate(k, v); });
    setSearchQ("");
    setSearchOpen(false);
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[13px] font-bold text-[#1B2B4B]">{idx + 1}번 등록</span>
        <div className="flex items-center gap-2">
          <div ref={wrapRef} className="relative">
            <div className="flex items-center gap-1 border border-gray-200 bg-white rounded-lg px-2 py-1 text-[12px]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                className="outline-none w-36 text-[12px] bg-transparent"
                placeholder="거래처·기사·차량번호 검색"
                value={searchQ}
                onChange={e => { setSearchQ(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
              />
            </div>
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto min-w-[260px]">
                {searchResults.map((r, i) => (
                  <div key={i} className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-[12px] flex items-center gap-2"
                    onMouseDown={() => copyFrom(r)}>
                    <span className="font-semibold text-[#1B2B4B] truncate max-w-[80px]">{r.거래처명}</span>
                    <span className="text-gray-400">|</span>
                    <span className="text-gray-600">{r.이름}</span>
                    <span className="text-gray-400">{r.차량번호}</span>
                    <span className="ml-auto text-gray-400">{r.날짜}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {idx > 0 && <button onClick={onDelete} className="text-red-500 text-[12px] hover:text-red-700">삭제</button>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">날짜</label>
          <input type="date" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={row.날짜} onChange={e => onUpdate("날짜", e.target.value)} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">거래처명</label>
          <input type="text" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={row.거래처명} onChange={e => { onUpdate("거래처명", e.target.value); onSelectClient(e.target.value); }} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">톤수</label>
          <TonnageInput value={row.톤수} onChange={v => onUpdate("톤수", v)} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">차량번호 / 기사명</label>
          <DriverSearchInput value={row.차량번호} drivers={drivers} placeholder="차량번호 또는 이름 입력" onChange={val => onUpdate("차량번호", val)} onSelect={onSelectDriver} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">기사명</label>
          <input className="w-full border border-gray-100 rounded-lg px-2 py-1.5 text-[13px] bg-gray-100" value={row.이름} readOnly />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">수량</label>
          <input type="number" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={row.수량} onChange={e => onUpdate("수량", e.target.value)} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">기사단가</label>
          <input type="number" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={row.기사단가} onChange={e => onUpdate("기사단가", e.target.value)} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">수수료단가</label>
          <input type="number" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={row.수수료단가} onChange={e => onUpdate("수수료단가", e.target.value)} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">수수료기준</label>
          <select className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={row.수수료기준 || "수량"} onChange={e => onUpdate("수수료기준", e.target.value)}>
            <option value="수량">수량 기준</option>
            <option value="톤수">톤수 기준</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">선결제</label>
          <input type="number" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={row.선결제 || 0} onChange={e => onUpdate("선결제", e.target.value)} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">지급방식</label>
          <select className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={row.지급방식 || ""} onChange={e => onUpdate("지급방식", e.target.value)}>
            <option value="">선택</option>
            <option value="계산서">계산서</option>
            <option value="착불">착불</option>
            <option value="선불">선불</option>
            <option value="손실">손실</option>
            <option value="개인">개인</option>
            <option value="취소">취소</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 pt-2 border-t border-gray-200">
        {[["기사운임","text-emerald-600"],["수수료","text-orange-600"],["선결제","text-gray-500"],["실수수료","text-[#1B2B4B]"]].map(([f, cls]) => (
          <div key={f} className="bg-white rounded-lg border border-gray-200 px-3 py-2 text-center">
            <div className="text-[10px] text-gray-400">{f}</div>
            <div className={`text-[13px] font-bold ${cls}`}>{fmt(row[f])}</div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-lg border border-gray-200 px-3 py-2 text-center">
        <div className="text-[10px] text-gray-400">청구운임</div>
        <div className="text-[15px] font-bold text-blue-600">{fmt(row.청구운임)}</div>
      </div>
    </div>
  );
}

export default function FixedClients({ drivers = [], upsertDriver, userCompany = "", role = "" }) {
  const coll = collection(db, "fixedClients");

  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [editPopupOpen, setEditPopupOpen] = useState(false);
  const [editPopupRow, setEditPopupRow] = useState(null);
  const [showDoneOnly, setShowDoneOnly] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [fastOpen, setFastOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [attachViewer, setAttachViewer] = useState(null);
  const [attachCounts, setAttachCounts] = useState({});

  const getViewCompany = () => role === "totalMaster"
    ? (localStorage.getItem("loginCompany") || userCompany || "돌캐")
    : (userCompany || localStorage.getItem("userCompany") || "돌캐");

  const getClientConfigs = () => {
    try { return JSON.parse(localStorage.getItem(`fcConfig_${getViewCompany()}`) || "{}"); } catch { return {}; }
  };
  const saveClientConfig = (clientName, config) => {
    if (!clientName) return;
    try { const all = getClientConfigs(); all[clientName] = config; localStorage.setItem(`fcConfig_${getViewCompany()}`, JSON.stringify(all)); } catch {}
  };

  const emptyFastRow = () => ({
    날짜: new Date().toISOString().slice(0, 10),
    거래처명: "", 톤수: "", 수량: 1,
    기사단가: 0, 수수료단가: 0, 수수료기준: "수량",
    차량번호: "", 이름: "", 핸드폰번호: "",
    기사운임: 0, 수수료: 0, 선결제: 0, 실수수료: 0, 청구운임: 0,
    지급방식: "",
  });

  const [fastRows, setFastRows] = useState([emptyFastRow()]);

  useEffect(() => {
    const viewCompany = role === "totalMaster"
      ? (localStorage.getItem("loginCompany") || userCompany || "돌캐")
      : (userCompany || localStorage.getItem("userCompany") || "돌캐");
    const unsub = onSnapshot(coll, (snap) => {
      const arr = snap.docs
        .map(d => d.data())
        .filter(d => (d.companyName || "돌캐") === viewCompany)
        .sort((a, b) => (b.날짜 || "").localeCompare(a.날짜 || ""));
      setRows(arr);
    });
    return () => unsub();
  }, [userCompany, role]);

  useEffect(() => {
    if (!rows.length) return;
    const load = async () => {
      try {
        const result = {};
        for (const row of rows) {
          if (!row?.id) continue;
          const snap = await getDocs(collection(db, "fixedClients", row.id, "attachments"));
          if (snap.size > 0) result[row.id] = snap.size;
        }
        setAttachCounts(result);
      } catch {}
    };
    load();
  }, [rows]);

  const saveRow = async (r) => await setDoc(doc(coll, r.id), { ...r, companyName: r.companyName || getViewCompany() }, { merge: true });
  const removeRow = async (id) => await deleteDoc(doc(coll, id));

  const filtered = useMemo(() => {
    if (!startDate && !endDate) return [];
    let list = [...rows];
    if (startDate) list = list.filter(r => r.날짜 >= startDate);
    if (endDate) list = list.filter(r => r.날짜 <= endDate);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)));
    }
    if (showDoneOnly) list = list.filter(r => r.정산완료);
    if (sortKey) {
      list.sort((a, b) => {
        let va = a[sortKey] ?? "", vb = b[sortKey] ?? "";
        if (["수량","청구운임","기사운임","수수료","선결제","실수수료"].includes(sortKey)) { va = Number(va)||0; vb = Number(vb)||0; }
        else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [rows, search, startDate, endDate, showDoneOnly, sortKey, sortDir]);

  const totalSale = filtered.reduce((a, b) => a + Number(b.청구운임 || 0), 0);
  const totalDrv = filtered.reduce((a, b) => a + Number(b.기사운임 || 0), 0);
  const totalFee = totalSale - totalDrv;
  const marginRate = totalSale ? ((totalFee / totalSale) * 100).toFixed(1) : "0";
  const totalQty = filtered.reduce((a, b) => a + Number(b.수량 || 0), 0);
  const totalTonKg = filtered.reduce((a, b) => { const kg = parseTonToKg(b.톤수); return kg !== null ? a + kg : a; }, 0);
  const totalTonDisplay = totalTonKg > 0 ? (totalTonKg >= 1000 ? `${(totalTonKg / 1000).toFixed(2)}톤` : `${totalTonKg}kg`) : null;

  const chartData = useMemo(() => {
    const map = {};
    filtered.forEach(r => { map[r.날짜] = (map[r.날짜] || 0) + Number(r.청구운임 || 0); });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([date, 매출]) => ({ date: date.slice(5), 매출 }));
  }, [filtered]);

  const topDrivers = useMemo(() => {
    const map = {};
    filtered.forEach(r => { const n = r.이름 || "미등록"; map[n] = (map[n] || 0) + Number(r.청구운임 || 0); });
    return Object.entries(map).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [filtered]);

  const markSettlement = async () => {
    if (!selected.length) return alert("정산처리할 항목을 선택하세요.");
    const targets = rows.filter(r => selected.includes(r.id));
    if (!window.confirm(`${targets.length}건의 정산상태를 변경하시겠습니까?`)) return;
    for (const r of targets) await saveRow({ ...r, 정산완료: !r.정산완료 });
    setSelected([]);
  };

  const addRow = async () => {
    const newRow = { id: crypto.randomUUID(), 날짜: new Date().toISOString().slice(0, 10), 정산완료: false, 거래처명: "", 톤수: "", 수량: "", 차량번호: "", 이름: "", 핸드폰번호: "", 청구운임: "", 기사운임: "", 수수료: "", 선결제: 0, 실수수료: 0, 지급방식: "", companyName: getViewCompany() };
    await setDoc(doc(coll, newRow.id), newRow);
  };

  const removeSelected = async () => {
    for (const id of selected) await removeRow(id);
    setSelected([]);
    setDeleteConfirm(false);
  };

  const openEditPopup = (row) => { setEditPopupRow({ ...row }); setEditPopupOpen(true); };

  const updateEditPopupField = (field, value) => {
    setEditPopupRow(prev => calcRow({ ...prev, [field]: value }));
  };

  const selectEditPopupDriver = (driver) => {
    setEditPopupRow(prev => calcRow({ ...prev, 차량번호: driver.차량번호, 이름: driver.이름, 핸드폰번호: driver.전화번호 }));
  };

  const saveEditPopup = async () => {
    if (!editPopupRow) return;
    if (editPopupRow.거래처명) {
      saveClientConfig(editPopupRow.거래처명, {
        기사단가: Number(editPopupRow.기사단가 || 0),
        수수료단가: Number(editPopupRow.수수료단가 || 0),
        수수료기준: editPopupRow.수수료기준 || "수량",
      });
    }
    await saveRow(editPopupRow);
    setEditPopupOpen(false);
    setEditPopupRow(null);
  };

  const copyEditToFast = () => {
    if (!editPopupRow) return;
    setFastRows([calcRow({ ...emptyFastRow(), ...editPopupRow, 날짜: new Date().toISOString().slice(0, 10), 정산완료: false, 선결제: 0 })]);
    setEditPopupOpen(false);
    setFastOpen(true);
  };

  const updateFastField = (idx, field, value) => {
    setFastRows(prev => { const u = [...prev]; u[idx] = calcRow({ ...u[idx], [field]: value }); return u; });
  };

  const selectFastDriver = (idx, driver) => {
    setFastRows(prev => { const u = [...prev]; u[idx] = calcRow({ ...u[idx], 차량번호: driver.차량번호, 이름: driver.이름, 핸드폰번호: driver.전화번호 }); return u; });
  };

  const selectFastClient = (idx, clientName) => {
    const cfg = getClientConfigs()[clientName];
    if (cfg) setFastRows(prev => { const u = [...prev]; u[idx] = calcRow({ ...u[idx], 거래처명: clientName, 기사단가: cfg.기사단가 || 0, 수수료단가: cfg.수수료단가 || 0, 수수료기준: cfg.수수료기준 || "수량" }); return u; });
  };

  const submitFastRows = async () => {
    const vc = getViewCompany();
    for (const row of fastRows) {
      const id = crypto.randomUUID();
      const finalRow = calcRow(row);
      await setDoc(doc(coll, id), { id, ...finalRow, 정산완료: false, companyName: vc });
      if (row.거래처명) saveClientConfig(row.거래처명, { 기사단가: Number(row.기사단가 || 0), 수수료단가: Number(row.수수료단가 || 0), 수수료기준: row.수수료기준 || "수량" });
    }
    alert(`${fastRows.length}건 등록 완료!`);
    setFastRows([emptyFastRow()]);
    setFastOpen(false);
  };

  const handleSort = (key) => {
    if (sortKey === key) { if (sortDir === "asc") setSortDir("desc"); else { setSortKey(null); setSortDir("asc"); } }
    else { setSortKey(key); setSortDir("asc"); }
  };
  const sortIcon = (key) => {
    if (sortKey !== key) return <span className="ml-1 text-white/30">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const head = "px-3 py-3 text-center text-[13px] font-semibold text-white whitespace-nowrap bg-transparent border-b border-white/10 cursor-pointer select-none hover:bg-white/10 transition";
  const cell = "px-3 py-2.5 text-[13px] text-gray-800 text-center whitespace-nowrap border-b border-gray-100 align-middle";

  const sortableHeaders = [
    ["정산","정산완료"],["날짜","날짜"],["거래처명","거래처명"],["톤수","톤수"],["수량","수량"],
    ["차량번호","차량번호"],["기사명","이름"],["핸드폰","핸드폰번호"],
    ["청구운임","청구운임"],["기사운임","기사운임"],["수수료","수수료"],
    ["선결제","선결제"],["실수수료","실수수료"],["지급방식","지급방식"],
  ];
  const COL_SPAN = sortableHeaders.length + 2; // +1 checkbox, +1 첨부

  return (
    <div className="bg-gray-50 min-h-screen p-5 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-[#1B2B4B]">고정거래처 관리</h1>
          <p className="text-[12px] text-gray-400 mt-0.5">고정 운송 계약 거래처 정산 관리</p>
        </div>
        <div className="flex items-center gap-2">
          {(startDate || endDate) && filtered.length > 0 && (
            <div className="flex items-center gap-3 mr-2 px-4 py-2 bg-white rounded-xl border border-gray-200 text-[13px]">
              <span className="text-gray-500">총 수량</span>
              <span className="font-bold text-[#1B2B4B]">{totalQty.toLocaleString()}</span>
              {totalTonDisplay && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-500">총 톤수</span>
                  <span className="font-bold text-[#1B2B4B]">{totalTonDisplay}</span>
                </>
              )}
            </div>
          )}
          <button onClick={() => setFastOpen(true)} className="px-4 py-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition">+ 빠른 등록</button>
          <button onClick={addRow} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[13px] font-semibold hover:bg-emerald-700 transition">+ 행 추가</button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard title="총 청구금액" value={fmt(totalSale)} color="blue" />
        <KpiCard title="총 기사운임" value={fmt(totalDrv)} color="green" />
        <KpiCard title="총 수수료" value={fmt(totalFee)} color="orange" />
        <KpiCard title="수익률" value={marginRate} unit="%" color="purple" />
      </div>

      {/* 검색 + 필터 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 border-2 border-[#1B2B4B] rounded-xl overflow-hidden bg-white h-[36px]">
            <svg className="w-4 h-4 text-gray-400 ml-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="거래처명 · 기사명 검색" className="flex-1 px-2 h-full text-[13px] outline-none w-48" />
          </div>
          <div className="flex items-center gap-1.5">
            <input type="date" className="border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-[#1B2B4B]" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <span className="text-gray-400 text-[13px]">~</span>
            <input type="date" className="border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-[#1B2B4B]" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <button onClick={() => { setStartDate(thisMonthStart()); setEndDate(thisMonthEnd()); }} className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] text-gray-500 hover:bg-gray-50 transition">이번 달</button>
          {(startDate || endDate) && (
            <button onClick={() => { setStartDate(""); setEndDate(""); }} className="px-3 py-1.5 rounded-lg border border-red-200 text-[13px] text-red-500 hover:bg-red-50 transition">날짜 초기화</button>
          )}
          <button onClick={() => setShowDoneOnly(p => !p)} className={`px-3 py-1.5 rounded-lg border text-[13px] font-semibold transition ${showDoneOnly ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
            정산완료만
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => {
              const selRow = selected.length === 1 ? filtered.find(r => r.id === selected[0]) : null;
              const url = selRow
                ? `${window.location.origin}/driver-upload?date=${encodeURIComponent(selRow.날짜||"")}&vehicle=${encodeURIComponent((selRow.차량번호||"").replace(/\s/g,""))}&name=${encodeURIComponent((selRow.이름||"").trim())}`
                : `${window.location.origin}/driver-upload`;
              const msg = `[인수증 업로드 안내]\n운송 완료 후 아래 링크를 통해 인수증을 업로드해 주시기 바랍니다.\n\n${url}\n\n날짜·차량번호·이름을 확인 후 검색하여 오더를 선택해 업로드해 주세요.\n미업로드 시 운임 정산이 지연될 수 있습니다.`;
              navigator.clipboard.writeText(msg).then(() => alert("업로드 안내 메시지가 복사되었습니다.\n기사에게 붙여넣기로 전달하세요.")).catch(() => alert(`링크: ${url}`));
            }} className="px-3 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-semibold hover:opacity-90 transition whitespace-nowrap">업로드링크</button>
            <button onClick={() => { if (!selected.length) return alert("수정할 항목을 선택하세요."); const row = filtered.find(r => r.id === selected[0]); if (row) openEditPopup(row); }} className="px-3 py-1.5 rounded-lg border text-[13px] font-semibold transition bg-white text-gray-600 border-gray-300 hover:bg-gray-50">수정</button>
            <button onClick={markSettlement} className="px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-700 border border-indigo-300 text-[13px] font-semibold hover:bg-indigo-200 transition">정산 처리</button>
            <button onClick={() => { if (!selected.length) return alert("삭제할 항목을 선택하세요."); setDeleteConfirm(true); }} className="px-3 py-1.5 rounded-lg bg-red-100 text-red-600 border border-red-300 text-[13px] font-semibold hover:bg-red-200 transition">삭제</button>
            <button onClick={() => { const ws = XLSX.utils.json_to_sheet(filtered); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "고정거래처"); XLSX.writeFile(wb, "고정거래처관리.xlsx"); }} className="px-3 py-1.5 rounded-lg bg-teal-100 text-teal-700 border border-teal-300 text-[13px] font-semibold hover:bg-teal-200 transition">엑셀다운</button>
          </div>
        </div>
      </div>

      {/* 메인 레이아웃 */}
      <div className="flex gap-4 items-start">
        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#1B2B4B]">
                <tr>
                  <th className="px-3 py-3 text-center text-[13px] font-semibold text-white whitespace-nowrap bg-transparent border-b border-white/10">
                    <input type="checkbox" onChange={() => selected.length === filtered.length ? setSelected([]) : setSelected(filtered.map(r => r.id))} checked={selected.length > 0 && selected.length === filtered.length} />
                  </th>
                  {sortableHeaders.map(([label, key]) => (
                    <th key={label} className={head} onClick={() => handleSort(key)}>{label}{sortIcon(key)}</th>
                  ))}
                  <th className={head}>첨부</th>
                </tr>
              </thead>
              <tbody>
                {!startDate && !endDate ? (
                  <tr>
                    <td colSpan={COL_SPAN} className="py-16 text-center text-[14px] text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-3xl">📅</span>
                        <span>조회할 기간을 설정해주세요</span>
                        <button onClick={() => { setStartDate(thisMonthStart()); setEndDate(thisMonthEnd()); }} className="mt-2 px-4 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition">이번 달 조회</button>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={COL_SPAN} className="py-16 text-center text-[13px] text-gray-400">해당 기간에 데이터가 없습니다</td></tr>
                ) : filtered.map((r, idx) => (
                  <tr key={r.id} onDoubleClick={() => openEditPopup(r)} className={`transition hover:bg-blue-50/40 cursor-pointer ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} ${r.정산완료 ? "opacity-60" : ""}`}>
                    <td className={cell} onClick={e => e.stopPropagation()}><input type="checkbox" checked={selected.includes(r.id)} onChange={() => setSelected(p => p.includes(r.id) ? p.filter(x => x !== r.id) : [...p, r.id])} /></td>
                    <td className={cell}>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${r.정산완료 ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-amber-100 text-amber-600 border-amber-300"}`}>
                        {r.정산완료 ? "완료" : "미정산"}
                      </span>
                    </td>
                    <td className={cell}>{r.날짜}</td>
                    <td className={`${cell} font-semibold`}>{r.거래처명}</td>
                    <td className={cell}>{r.톤수}</td>
                    <td className={cell}>{r.수량}</td>
                    <td className={cell}>{r.차량번호}</td>
                    <td className={`${cell} font-semibold`}>{r.이름}</td>
                    <td className={cell}>{r.핸드폰번호}</td>
                    <td className={`${cell} text-right font-semibold text-blue-600`}>{fmt(r.청구운임)}</td>
                    <td className={`${cell} text-right font-semibold text-emerald-600`}>{fmt(r.기사운임)}</td>
                    <td className={`${cell} text-right font-semibold text-orange-600`}>{fmt(r.수수료)}</td>
                    <td className={`${cell} text-right text-gray-500`}>{r.선결제 ? fmt(r.선결제) : ""}</td>
                    <td className={`${cell} text-right font-semibold text-[#1B2B4B]`}>{fmt(r.실수수료 != null ? r.실수수료 : (Number(r.수수료||0) - Number(r.선결제||0)))}</td>
                    <td className={cell}>{r.지급방식}</td>
                    <td className={cell}>
                      <button
                        onClick={e => { e.stopPropagation(); setAttachViewer(r); }}
                        className="relative inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition mx-auto"
                        title="첨부파일 보기"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                          stroke={(attachCounts[r.id]||0)>0?"#059669":"#cbd5e1"}
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        {(attachCounts[r.id]||0)>0&&(
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center">
                            {attachCounts[r.id]}
                          </span>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 사이드 대시보드 */}
        <div className="w-[300px] shrink-0 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-[#1B2B4B] px-4 py-3"><h3 className="text-[14px] font-bold text-white">일별 매출</h3></div>
            <div className="p-4 h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1B2B4B" stopOpacity={0.3}/><stop offset="100%" stopColor="#1B2B4B" stopOpacity={0.02}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={v => `${Number(v).toLocaleString()}원`} contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", fontSize: 12 }} />
                  <Area type="monotone" dataKey="매출" stroke="#1B2B4B" strokeWidth={2} fill="url(#areaGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-[#1B2B4B] px-4 py-3"><h3 className="text-[14px] font-bold text-white">기사별 매출 TOP 5</h3></div>
            <div className="p-4 space-y-2">
              {topDrivers.length === 0 ? (
                <div className="text-[13px] text-gray-400 text-center py-4">데이터 없음</div>
              ) : topDrivers.map((d, i) => {
                const max = topDrivers[0]?.total || 1;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${i < 3 ? "bg-[#1B2B4B]" : "bg-gray-400"}`}>{i + 1}</div>
                    <div className="text-[12px] font-semibold text-gray-700 w-16 truncate">{d.name}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className="h-full rounded-full bg-[#1B2B4B]" style={{ width: `${Math.round(d.total / max * 100)}%` }} />
                    </div>
                    <div className="text-[11px] font-bold text-gray-600 w-16 text-right">{d.total >= 1000000 ? `${(d.total/1000000).toFixed(1)}M` : fmt(d.total)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 삭제 확인 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-[360px] overflow-hidden">
            <div className="bg-[#1B2B4B] px-6 py-4"><h3 className="text-white font-bold text-[15px]">선택 항목을 삭제하시겠습니까?</h3><p className="text-white/60 text-[12px] mt-0.5">{selected.length}건 선택됨</p></div>
            <div className="flex gap-3 p-5">
              <button onClick={() => setDeleteConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={removeSelected} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-[13px] font-bold hover:bg-red-700">삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 수정 팝업 */}
      <Dialog open={editPopupOpen} onClose={() => setEditPopupOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/50" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between shrink-0">
              <div><Dialog.Title className="text-white font-bold text-[16px]">수정</Dialog.Title><p className="text-white/60 text-[12px] mt-0.5">선택한 항목을 수정합니다</p></div>
              <button onClick={() => setEditPopupOpen(false)} className="text-white/60 hover:text-white text-xl">✕</button>
            </div>
            {editPopupRow && (
              <div className="flex-1 overflow-y-auto p-5">
                <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">날짜</label>
                      <input type="date" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={editPopupRow.날짜 || ""} onChange={e => updateEditPopupField("날짜", e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">거래처명</label>
                      <input type="text" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={editPopupRow.거래처명 || ""} onChange={e => {
                        const v = e.target.value;
                        const cfg = getClientConfigs()[v];
                        setEditPopupRow(prev => calcRow({ ...prev, 거래처명: v, ...(cfg ? { 기사단가: cfg.기사단가, 수수료단가: cfg.수수료단가, 수수료기준: cfg.수수료기준 } : {}) }));
                      }} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">톤수</label>
                      <TonnageInput value={editPopupRow.톤수 || ""} onChange={v => updateEditPopupField("톤수", v)} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">수량</label>
                      <input type="number" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={editPopupRow.수량 || ""} onChange={e => updateEditPopupField("수량", e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">차량번호 / 기사명</label>
                      <DriverSearchInput value={editPopupRow.차량번호 || ""} drivers={drivers} placeholder="차량번호 또는 이름 입력" onChange={val => updateEditPopupField("차량번호", val)} onSelect={selectEditPopupDriver} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">기사명</label>
                      <input className="w-full border border-gray-100 rounded-lg px-2 py-1.5 text-[13px] bg-gray-100" value={editPopupRow.이름 || ""} readOnly />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">기사단가</label>
                      <input type="number" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={editPopupRow.기사단가 || 0} onChange={e => updateEditPopupField("기사단가", e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">수수료단가</label>
                      <input type="number" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={editPopupRow.수수료단가 || 0} onChange={e => updateEditPopupField("수수료단가", e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">수수료기준</label>
                      <select className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={editPopupRow.수수료기준 || "수량"} onChange={e => updateEditPopupField("수수료기준", e.target.value)}>
                        <option value="수량">수량 기준</option>
                        <option value="톤수">톤수 기준</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">선결제</label>
                      <input type="number" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={editPopupRow.선결제 || 0} onChange={e => updateEditPopupField("선결제", e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">지급방식</label>
                      <select className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={editPopupRow.지급방식 || ""} onChange={e => updateEditPopupField("지급방식", e.target.value)}>
                        <option value="">선택</option>
                        <option value="계산서">계산서</option>
                        <option value="착불">착불</option>
                        <option value="선불">선불</option>
                        <option value="손실">손실</option>
                        <option value="개인">개인</option>
                        <option value="취소">취소</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3 pt-2 border-t border-gray-200">
                    {[["기사운임","text-emerald-600"],["수수료","text-orange-600"],["선결제","text-gray-500"],["실수수료","text-[#1B2B4B]"]].map(([f, cls]) => (
                      <div key={f} className="bg-white rounded-lg border border-gray-200 px-3 py-2 text-center">
                        <div className="text-[10px] text-gray-400">{f}</div>
                        <div className={`text-[13px] font-bold ${cls}`}>{fmt(editPopupRow[f])}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 px-3 py-2 text-center">
                    <div className="text-[10px] text-gray-400">청구운임</div>
                    <div className="text-[16px] font-bold text-blue-600">{fmt(editPopupRow.청구운임)}</div>
                  </div>
                </div>
              </div>
            )}
            <div className="px-5 py-4 border-t flex items-center justify-between shrink-0">
              <button onClick={copyEditToFast} className="px-4 py-2 rounded-xl border border-[#1B2B4B] text-[#1B2B4B] text-[13px] font-semibold hover:bg-[#1B2B4B]/5 transition">오더복사</button>
              <div className="flex gap-3">
                <button onClick={() => setEditPopupOpen(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition">취소</button>
                <button onClick={saveEditPopup} className="px-5 py-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition">저장하기</button>
              </div>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* 빠른 등록 모달 */}
      <Dialog open={fastOpen} onClose={() => setFastOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/50" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between shrink-0">
              <div><Dialog.Title className="text-white font-bold text-[16px]">빠른 신규등록</Dialog.Title><p className="text-white/60 text-[12px] mt-0.5">여러 건 한 번에 등록</p></div>
              <button onClick={() => setFastOpen(false)} className="text-white/60 hover:text-white text-xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {fastRows.map((row, idx) => (
                <FastRowCard
                  key={idx}
                  idx={idx}
                  row={row}
                  drivers={drivers}
                  rows={rows}
                  getClientConfigs={getClientConfigs}
                  onUpdate={(field, value) => updateFastField(idx, field, value)}
                  onSelectDriver={(d) => selectFastDriver(idx, d)}
                  onSelectClient={(name) => selectFastClient(idx, name)}
                  onDelete={() => setFastRows(p => p.filter((_, i) => i !== idx))}
                />
              ))}
            </div>
            <div className="px-5 py-4 border-t flex items-center justify-between shrink-0">
              <button onClick={() => setFastRows(p => [...p, emptyFastRow()])} className="px-4 py-2 rounded-xl border border-[#1B2B4B] text-[#1B2B4B] text-[13px] font-semibold hover:bg-[#1B2B4B]/5 transition">+ 행 추가</button>
              <button onClick={submitFastRows} className="px-5 py-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition">저장하기</button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* 첨부파일 뷰어 */}
      {attachViewer && <FCAttachViewer row={attachViewer} onClose={() => setAttachViewer(null)} />}
    </div>
  );
}
