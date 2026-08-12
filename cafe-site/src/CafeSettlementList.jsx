// ======================= cafe-site/src/CafeSettlementList.jsx =======================
// "정산현황" 탭 — 내가 게시자거나 신청자였던, 배차완료 이상 단계까지 간 오더들의
// 정산 상태(정산대기/정산완료)를 한눈에 보여준다. 실제 업로드/정산완료 처리는
// 오더 상세(CafeOrderDetail)의 정산 섹션에서 하고, 여기서는 목록/현황만 본다.
import React, { useEffect, useMemo, useState } from "react";
import { getDoc } from "firebase/firestore";
import { settlementRef } from "./cafeApi";
import Pagination from "./Pagination";
import { PAGE_SIZE } from "./cafeConstants";

export default function CafeSettlementList({ orders, profile, onOpen }) {
  const relevant = useMemo(() => (
    orders.filter(o =>
      (o.posterUid === profile.uid || o.applicantUid === profile.uid) &&
      ["confirmed"].includes(o.status)
    ).sort((a, b) => (b.confirmedAt?.toMillis?.() || 0) - (a.confirmedAt?.toMillis?.() || 0))
  ), [orders, profile.uid]);

  const [settlements, setSettlements] = useState({});
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(relevant.map(async (o) => {
        try {
          const snap = await getDoc(settlementRef(o.id));
          return [o.id, snap.exists() ? snap.data() : null];
        } catch { return [o.id, null]; }
      }));
      if (!cancelled) setSettlements(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [relevant.map(o => o.id).join(",")]);

  useEffect(() => { setPage(1); }, [relevant.length]);

  const totalPages = Math.max(1, Math.ceil(relevant.length / PAGE_SIZE));
  const pageRows = relevant.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const parseAmount = (o) => Number(String(o.운임 || "").replace(/[^\d]/g, "")) || 0;
  const totalPending = relevant.reduce((sum, o) => {
    const s = settlements[o.id];
    return s?.settled ? sum : sum + parseAmount(o);
  }, 0);
  const totalSettled = relevant.reduce((sum, o) => {
    const s = settlements[o.id];
    return s?.settled ? sum + parseAmount(o) : sum;
  }, 0);

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <div className="text-[11px] font-bold text-gray-400">정산대기 금액</div>
          <div className="text-[20px] font-black text-amber-600 mt-0.5">{totalPending.toLocaleString()}원</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <div className="text-[11px] font-bold text-gray-400">정산완료 금액</div>
          <div className="text-[20px] font-black text-emerald-600 mt-0.5">{totalSettled.toLocaleString()}원</div>
        </div>
      </div>

      {relevant.length === 0 ? (
        <div className="py-24 text-center text-[13px] text-gray-400">정산 대상 오더가 없습니다. 배차완료된 오더가 여기 표시됩니다.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full border-collapse table-fixed">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2.5 text-center text-[11px] font-bold text-gray-500 border-b border-gray-200 w-[15%]">구분</th>
                <th className="px-3 py-2.5 text-center text-[11px] font-bold text-gray-500 border-b border-gray-200 w-[35%]">오더</th>
                <th className="px-3 py-2.5 text-center text-[11px] font-bold text-gray-500 border-b border-gray-200 w-[20%]">상대</th>
                <th className="px-3 py-2.5 text-center text-[11px] font-bold text-gray-500 border-b border-gray-200 w-[15%]">운임</th>
                <th className="px-3 py-2.5 text-center text-[11px] font-bold text-gray-500 border-b border-gray-200 w-[15%]">정산상태</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(o => {
                const isPoster = o.posterUid === profile.uid;
                const s = settlements[o.id];
                return (
                  <tr key={o.id} onClick={() => onOpen(o)} className="cursor-pointer hover:bg-gray-50 transition">
                    <td className="px-3 py-2.5 text-center text-[12.5px] font-bold text-gray-700 border-b border-gray-100">{isPoster ? "게시자" : "신청자"}</td>
                    <td className="px-3 py-2.5 text-center text-[12.5px] font-bold text-gray-900 border-b border-gray-100 truncate">{o.상차지명} → {o.하차지명}</td>
                    <td className="px-3 py-2.5 text-center text-[12.5px] text-gray-700 border-b border-gray-100 truncate">{isPoster ? (o.applicantNickname || o.applicantName || "-") : o.companyName}</td>
                    <td className="px-3 py-2.5 text-center text-[12.5px] font-bold text-[#1B2B4B] border-b border-gray-100">{o.운임 || "협의"}</td>
                    <td className="px-3 py-2.5 text-center border-b border-gray-100">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${s?.settled ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {s?.settled ? "정산완료" : "정산대기"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
