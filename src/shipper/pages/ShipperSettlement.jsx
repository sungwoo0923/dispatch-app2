import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { doc, getDoc } from "firebase/firestore";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const numberToKorean = (num) => {
  if (!num) return "영";
  const units = ["", "만", "억", "조"];
  const nums = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
  const tens = ["", "십", "백", "천"];
  let result = "";
  let n = Math.abs(Math.round(num));
  let unitIndex = 0;
  while (n > 0) {
    const chunk = n % 10000;
    if (chunk > 0) {
      let chunkStr = "";
      let c = chunk;
      for (let i = 0; i < 4; i++) {
        const digit = c % 10;
        if (digit > 0) {
          const digitStr = (digit === 1 && i > 0) ? "" : nums[digit];
          chunkStr = digitStr + tens[i] + chunkStr;
        }
        c = Math.floor(c / 10);
      }
      result = chunkStr + units[unitIndex] + result;
    }
    n = Math.floor(n / 10000);
    unitIndex++;
  }
  return result || "영";
};

const getTodayKST = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
};

const getMonthStart = (offset = 0) => {
  const now = new Date();
  now.setMonth(now.getMonth() + offset);
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 7) + "-01";
};

const getMonthEnd = (offset = 0) => {
  const now = new Date();
  now.setMonth(now.getMonth() + offset + 1);
  now.setDate(0);
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
};

const GROUP_LABEL = { month: "월별", client: "거래처별", transport: "운송사별" };

export default function ShipperSettlement() {
  const user = auth.currentUser;
  const [userData, setUserData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [startDate, setStartDate] = useState(getMonthStart(0));
  const [endDate, setEndDate] = useState(getMonthEnd(0));
  const [groupBy, setGroupBy] = useState("month");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [sortKey, setSortKey] = useState("상차일");
  const [sortDir, setSortDir] = useState("desc");
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceTransport, setInvoiceTransport] = useState("");
  const [invoiceSaving, setInvoiceSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) setUserData(snap.data());
    });
  }, [user]);

  useEffect(() => {
    if (!user || !userData) return;
    const isMaster = userData?.permissions?.master === true || userData?.isMaster === true;
    const isSubMaster = userData?.permissions?.subMaster === true;
    let q;
    if (isMaster || isSubMaster) {
      q = query(collection(db, "orders"), where("shipperCompany", "==", userData.companyName));
    } else {
      q = query(collection(db, "orders"), where("shipperUid", "==", user.uid));
    }
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user, userData]);

  const toYMD = (d) => {
    if (!d) return "";
    if (d?.toDate) return d.toDate().toISOString().slice(0, 10);
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    return String(d).slice(0, 10);
  };

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const d = toYMD(o.상차일);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }, [orders, startDate, endDate]);

  const activeFiltered = filtered.filter(o => o.상태 !== "취소");

  // 그룹 분석 (월별 / 거래처별 / 운송사별 공용)
  const groupKeyOf = (o) => {
    if (groupBy === "month") return toYMD(o.상차일).slice(0, 7);
    if (groupBy === "transport") return o.운송사명 || "(미지정)";
    return o.거래처명 || "(미지정)";
  };
  const groupLabelOf = (key) => {
    if (groupBy === "month") return key ? `${key.slice(0, 4)}년 ${key.slice(5)}월` : "-";
    return key;
  };

  const groups = useMemo(() => {
    const map = {};
    activeFiltered.forEach(o => {
      const k = groupKeyOf(o);
      if (!k) return;
      if (!map[k]) map[k] = { key: k, orders: [], 총청구: 0, 건수: 0 };
      map[k].orders.push(o);
      map[k].총청구 += Number(o.청구운임) || 0;
      map[k].건수++;
    });
    const list = Object.values(map);
    return groupBy === "month"
      ? list.sort((a, b) => b.key.localeCompare(a.key))
      : list.sort((a, b) => b.총청구 - a.총청구);
  }, [activeFiltered, groupBy]);

  // 지급방식별 분포
  const payBreakdown = useMemo(() => {
    const map = {};
    activeFiltered.forEach(o => {
      const k = o.지급방식 || "미지정";
      if (!map[k]) map[k] = { key: k, 건수: 0, 총청구: 0 };
      map[k].건수++;
      map[k].총청구 += Number(o.청구운임) || 0;
    });
    return Object.values(map).sort((a, b) => b.총청구 - a.총청구);
  }, [activeFiltered]);

  const totalBilling = activeFiltered.reduce((s, o) => s + (Number(o.청구운임) || 0), 0);
  const maxGroupBilling = Math.max(...groups.map(g => g.총청구), 1);

  // ── 정산 내역서 ──
  const invoiceTransportOptions = useMemo(() => {
    const set = new Set();
    activeFiltered.forEach(o => { if (o.운송사명) set.add(o.운송사명); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [activeFiltered]);

  const invoiceOrders = useMemo(() => {
    const list = invoiceTransport
      ? activeFiltered.filter(o => (o.운송사명 || "") === invoiceTransport)
      : activeFiltered;
    return [...list].sort((a, b) => (a.상차일 || "").localeCompare(b.상차일 || ""));
  }, [activeFiltered, invoiceTransport]);

  const invoiceRows = invoiceOrders.map((o, i) => ({
    idx: i + 1,
    상차일: o.상차일 || "",
    상차지: o.상차지명 || "",
    하차지: o.하차지명 || "",
    화물: o.화물내용 || "",
    차량번호: o.차량번호 || "",
    공급가액: Number(o.청구운임) || 0,
    세액: Math.round((Number(o.청구운임) || 0) * 0.1),
  }));
  const invoiceSupply = invoiceRows.reduce((s, r) => s + r.공급가액, 0);
  const invoiceTax = invoiceRows.reduce((s, r) => s + r.세액, 0);
  const invoiceTotal = invoiceSupply + invoiceTax;

  const openInvoice = () => {
    if (activeFiltered.length === 0) { alert("조회된 오더가 없습니다. 먼저 정산 기간을 확인해주세요."); return; }
    if (!invoiceTransport && invoiceTransportOptions.length === 1) setInvoiceTransport(invoiceTransportOptions[0]);
    setShowInvoice(true);
  };

  const saveInvoiceImage = async () => {
    setInvoiceSaving(true);
    try {
      const area = document.getElementById("shipperInvoiceArea");
      const canvas = await html2canvas(area, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `정산내역서_${invoiceTransport || "전체"}_${startDate}~${endDate}.png`;
      a.click();
    } catch {
      alert("이미지 저장에 실패했습니다.");
    }
    setInvoiceSaving(false);
  };

  const saveInvoicePDF = async () => {
    setInvoiceSaving(true);
    try {
      const area = document.getElementById("shipperInvoiceArea");
      const canvas = await html2canvas(area, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210, pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight, position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`정산내역서_${invoiceTransport || "전체"}_${startDate}~${endDate}.pdf`);
    } catch {
      alert("PDF 저장에 실패했습니다.");
    }
    setInvoiceSaving(false);
  };

  const handleExcel = () => {
    import("xlsx").then(XLSX => {
      const data = activeFiltered.map((o, i) => ({
        순번: i + 1,
        상차일: o.상차일 || "",
        거래처: o.거래처명 || "",
        상차지: o.상차지명 || "",
        하차지: o.하차지명 || "",
        화물: o.화물내용 || "",
        차량종류: o.차량종류 || "",
        차량번호: o.차량번호 || "",
        청구운임: o.청구운임 || 0,
        지급방식: o.지급방식 || "",
        운송사: o.운송사명 || "",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "정산내역");
      XLSX.writeFile(wb, `정산내역_${startDate}_${endDate}.xlsx`);
    });
  };

  const detailOrders = selectedGroup
    ? activeFiltered.filter(o => groupKeyOf(o) === selectedGroup)
    : activeFiltered;

  const sortedOrders = useMemo(() => {
    const list = [...detailOrders];
    list.sort((a, b) => {
      let av, bv;
      if (sortKey === "청구운임") { av = Number(a.청구운임) || 0; bv = Number(b.청구운임) || 0; }
      else { av = String(a[sortKey] || ""); bv = String(b[sortKey] || ""); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [detailOrders, sortKey, sortDir]);

  const shownOrders = selectedGroup ? sortedOrders : sortedOrders.slice(0, 100);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "청구운임" ? "desc" : "desc"); }
  };

  const SortTh = ({ label, sortField, align = "left" }) => (
    <th
      className={`px-3 py-2.5 text-${align} cursor-pointer select-none hover:text-[#1B2B4B] transition whitespace-nowrap`}
      onClick={() => toggleSort(sortField)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-[10px] ${sortKey === sortField ? "text-[#1B2B4B]" : "text-gray-300"}`}>
          {sortKey === sortField ? (sortDir === "asc" ? "▲" : "▼") : "▲▼"}
        </span>
      </span>
    </th>
  );

  return (
    <div className="space-y-6">

      {/* 필터 */}
      <div className="bg-white rounded-xl p-5 shadow-sm flex items-center gap-4 flex-wrap">
        <div className="font-bold text-gray-800">정산 기간</div>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
        <span className="text-gray-400">~</span>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />

        <div className="flex gap-2">
          {[0, -1, -2].map(offset => {
            const ym = getMonthStart(offset).slice(0, 7);
            return (
              <button key={offset} onClick={() => { setStartDate(getMonthStart(offset)); setEndDate(getMonthEnd(offset)); }}
                className="px-3 py-2 bg-[#eef1f7] text-[#1B2B4B] rounded-lg text-sm font-semibold hover:bg-[#e2e7f2]">
                {ym.slice(0, 4) + "년 " + ym.slice(5) + "월"}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 ml-auto">
          <button onClick={openInvoice} className="px-4 py-2 bg-white border border-[#1B2B4B] text-[#1B2B4B] rounded-lg text-sm font-semibold hover:bg-[#eef1f7]">정산 내역서</button>
          <button onClick={handleExcel} className="px-4 py-2 bg-[#1B2B4B] text-white rounded-lg text-sm font-semibold hover:opacity-90">엑셀 다운로드</button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <SumCard title="조회 건수" value={`${activeFiltered.length}건`} />
        <SumCard title="총 청구금액" value={`${totalBilling.toLocaleString()}원`} color="text-[#1B2B4B]" />
        <SumCard title="평균 운임" value={activeFiltered.length > 0 ? `${Math.round(totalBilling / activeFiltered.length).toLocaleString()}원` : "-"} color="text-emerald-600" />
        <SumCard title="취소 건수" value={`${filtered.filter(o => o.상태 === "취소").length}건`} color="text-rose-600" />
      </div>

      {/* 그룹 분석 + 상세 */}
      <div className="grid grid-cols-3 gap-4">

        {/* 그룹 분석 */}
        <div className="col-span-1 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div className="font-bold text-gray-800">분석</div>
            <div className="flex gap-1">
              {["month", "client", "transport"].map(g => (
                <button key={g} onClick={() => { setGroupBy(g); setSelectedGroup(null); }}
                  className={`px-2.5 py-1 rounded text-[12px] font-semibold ${groupBy === g ? "bg-[#1B2B4B] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {GROUP_LABEL[g]}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4 space-y-2 max-h-[360px] overflow-y-auto">
            {groups.map((g) => {
              const isSelected = selectedGroup === g.key;
              const pct = Math.round((g.총청구 / maxGroupBilling) * 100);
              return (
                <div key={g.key}
                  onClick={() => setSelectedGroup(isSelected ? null : g.key)}
                  className={`p-3 rounded-xl cursor-pointer transition border ${isSelected ? "border-[#1B2B4B] bg-[#eef1f7]" : "border-transparent hover:bg-gray-50"}`}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="font-semibold text-gray-800 text-sm truncate max-w-[140px]">{groupLabelOf(g.key)}</span>
                    <span className="text-[12px] text-gray-500 shrink-0">{g.건수}건</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-[#1B2B4B] h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[12px] font-bold text-[#1B2B4B] whitespace-nowrap">{(g.총청구 / 10000).toFixed(0)}만</span>
                  </div>
                </div>
              );
            })}
            {groups.length === 0 && (
              <div className="py-12 text-center text-gray-400 text-sm">해당 기간 데이터 없음</div>
            )}
          </div>

          {/* 지급방식별 분포 */}
          <div className="px-5 py-4 border-t">
            <div className="font-bold text-gray-800 text-sm mb-3">지급방식별 분포</div>
            {payBreakdown.length === 0 ? (
              <div className="text-center text-gray-400 text-xs py-4">데이터 없음</div>
            ) : (
              <div className="space-y-2">
                {payBreakdown.map(p => (
                  <div key={p.key} className="flex items-center justify-between text-[13px]">
                    <span className="text-gray-600 font-medium">{p.key}</span>
                    <span className="text-gray-800">
                      <span className="font-bold">{p.건수}건</span>
                      <span className="text-gray-400 mx-1">·</span>
                      <span className="font-semibold text-[#1B2B4B]">{p.총청구.toLocaleString()}원</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 상세 오더 */}
        <div className="col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col">
          <div className="px-5 py-4 border-b font-bold text-gray-800 flex items-center justify-between">
            <span>{selectedGroup ? `${groupLabelOf(selectedGroup)} 상세` : "전체 오더 목록"}</span>
            {selectedGroup && (
              <button onClick={() => setSelectedGroup(null)} className="text-[12px] text-gray-400 hover:text-[#1B2B4B] font-semibold">
                전체보기
              </button>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs font-semibold sticky top-0">
                  <SortTh label="상차일" sortField="상차일" />
                  <SortTh label="거래처" sortField="거래처명" />
                  <SortTh label="상차지" sortField="상차지명" />
                  <SortTh label="하차지" sortField="하차지명" />
                  <SortTh label="차량번호" sortField="차량번호" />
                  <SortTh label="청구운임" sortField="청구운임" align="right" />
                  <th className="px-3 py-2.5 text-center whitespace-nowrap">지급방식</th>
                </tr>
              </thead>
              <tbody>
                {shownOrders.map(o => (
                  <tr key={o.id} className="border-t hover:bg-gray-50 transition">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{o.상차일 || "-"}</td>
                    <td className="px-3 py-2 font-semibold text-gray-900 truncate max-w-[120px]">{o.거래처명 || "-"}</td>
                    <td className="px-3 py-2 text-gray-600 truncate max-w-[100px]">{o.상차지명 || "-"}</td>
                    <td className="px-3 py-2 text-gray-600 truncate max-w-[100px]">{o.하차지명 || "-"}</td>
                    <td className="px-3 py-2 text-gray-600">{o.차량번호 || "-"}</td>
                    <td className="px-3 py-2 text-right font-bold text-[#1B2B4B]">
                      {o.청구운임 ? Number(o.청구운임).toLocaleString() + "원" : "-"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-[11px] text-gray-600">{o.지급방식 || "-"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shownOrders.length === 0 && (
              <div className="py-12 text-center text-gray-400 text-sm">해당 기간 데이터 없음</div>
            )}
          </div>
          {!selectedGroup && detailOrders.length > 100 && (
            <div className="px-5 py-3 border-t text-[12px] text-gray-400">
              최근 100건 표시 중 (전체 {detailOrders.length}건)
            </div>
          )}
          <div className="px-5 py-3 border-t bg-gray-50 flex justify-between items-center">
            <span className="text-sm text-gray-500">{detailOrders.length}건</span>
            <span className="font-bold text-[#1B2B4B]">
              합계: {detailOrders.reduce((s, o) => s + (Number(o.청구운임) || 0), 0).toLocaleString()}원
            </span>
          </div>
        </div>
      </div>

      {/* 정산 내역서 미리보기 */}
      {showInvoice && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-6" onClick={() => setShowInvoice(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-[95vw] max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 bg-[#1B2B4B] flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-white font-bold text-[16px]">정산 내역서</h3>
                <p className="text-white/60 text-[12px] mt-0.5">{startDate} ~ {endDate}</p>
              </div>
              <div className="flex items-center gap-2">
                <select value={invoiceTransport} onChange={e => setInvoiceTransport(e.target.value)}
                  className="border-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-[#1B2B4B]">
                  <option value="">운송사 전체</option>
                  {invoiceTransportOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={() => setShowInvoice(false)} className="text-white/60 hover:text-white text-xl leading-none">×</button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6 bg-gray-100">
              <div id="shipperInvoiceArea" style={{ fontFamily: "'Malgun Gothic','Apple SD Gothic Neo',sans-serif", background: "#fff", width: 1000, margin: "0 auto", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ background: "#1B2B4B", padding: "20px 32px" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>정산 내역서</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>거래기간 : {startDate} ~ {endDate}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid #e5e7eb" }}>
                  <div style={{ padding: 20, borderRight: "1px solid #e5e7eb" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>화주사 정보</div>
                    <InvoiceInfoRow label="상호" value={userData?.companyName} />
                    <InvoiceInfoRow label="담당자" value={userData?.name} />
                    <InvoiceInfoRow label="연락처" value={userData?.phone} />
                    <InvoiceInfoRow label="이메일" value={user?.email} last />
                  </div>
                  <div style={{ padding: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>운송사 정보</div>
                    <InvoiceInfoRow label="상호" value={invoiceTransport || `전체 (${invoiceTransportOptions.length}개사)`} />
                    <InvoiceInfoRow label="거래건수" value={`${invoiceRows.length}건`} last />
                  </div>
                </div>
                <div style={{ padding: "12px 24px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#6b7280" }}>합계금액 (공급가액+부가세)</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1B2B4B" }}>
                    일금 {numberToKorean(invoiceTotal)} 원정 <span style={{ fontSize: 13, fontWeight: 400, color: "#6b7280" }}>(W {invoiceTotal.toLocaleString()})</span>
                  </div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#1B2B4B" }}>
                      {["No", "날짜", "상차지", "하차지", "화물명", "차량번호", "공급가액", "세액(10%)", "합계"].map(h => (
                        <th key={h} style={{ padding: "9px 10px", fontSize: 12, color: "#fff", fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceRows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontSize: 12, color: "#9ca3af" }}>{r.idx}</td>
                        <td style={{ padding: "7px 10px", fontSize: 12, color: "#374151" }}>{r.상차일}</td>
                        <td style={{ padding: "7px 10px", fontSize: 12, color: "#374151" }}>{r.상차지}</td>
                        <td style={{ padding: "7px 10px", fontSize: 12, color: "#374151" }}>{r.하차지}</td>
                        <td style={{ padding: "7px 10px", fontSize: 12, color: "#374151" }}>{r.화물}</td>
                        <td style={{ padding: "7px 10px", fontSize: 12, color: "#374151" }}>{r.차량번호}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", fontSize: 12, color: "#374151" }}>{r.공급가액.toLocaleString()}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", fontSize: 12, color: "#374151" }}>{r.세액.toLocaleString()}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "#1B2B4B" }}>{(r.공급가액 + r.세액).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#1B2B4B" }}>
                      <td colSpan={6} style={{ padding: "10px 16px", fontSize: 13, fontWeight: 700, color: "#fff", textAlign: "center" }}>소 계</td>
                      <td style={{ padding: "10px 10px", textAlign: "right", fontSize: 13, fontWeight: 700, color: "#fff" }}>{invoiceSupply.toLocaleString()}</td>
                      <td style={{ padding: "10px 10px", textAlign: "right", fontSize: 13, fontWeight: 700, color: "#93c5fd" }}>{invoiceTax.toLocaleString()}</td>
                      <td style={{ padding: "10px 10px", textAlign: "right", fontSize: 13, fontWeight: 700, color: "#fde68a" }}>{invoiceTotal.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
                <div style={{ padding: "14px 24px", background: "#f0f2f6", borderTop: "2px solid #1B2B4B", fontSize: 12, color: "#6b7280", textAlign: "center" }}>
                  본 내역서는 KP-Flow 화주사 프로그램에서 자동 생성되었습니다.
                </div>
                {invoiceRows.length === 0 && (
                  <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>선택한 조건에 해당하는 오더가 없습니다.</div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-white flex justify-end gap-2 shrink-0">
              <button onClick={() => setShowInvoice(false)} className="px-4 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold">닫기</button>
              <button onClick={saveInvoiceImage} disabled={invoiceSaving} className="px-4 py-2 text-sm rounded-lg bg-white border border-[#1B2B4B] text-[#1B2B4B] font-semibold hover:bg-[#eef1f7] disabled:opacity-50">이미지 저장</button>
              <button onClick={saveInvoicePDF} disabled={invoiceSaving} className="px-4 py-2 text-sm rounded-lg bg-[#1B2B4B] text-white font-semibold hover:opacity-90 disabled:opacity-50">
                {invoiceSaving ? "저장 중..." : "PDF 저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceInfoRow({ label, value, last = false }) {
  return (
    <div style={{ display: "flex", padding: "6px 0", borderBottom: last ? "none" : "1px solid #f3f4f6" }}>
      <div style={{ width: 70, color: "#6b7280", fontWeight: 600, fontSize: 13 }}>{label}</div>
      <div style={{ color: "#111827", fontWeight: 500, fontSize: 13 }}>{value || "-"}</div>
    </div>
  );
}

function SumCard({ title, value, color = "text-gray-900" }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <div className="text-sm text-gray-500 mb-1">{title}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
