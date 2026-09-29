// ======================= src/HandoverFareReport.jsx =======================
// 인수인계용 "운임 이력" 보고서 — 지금까지 등록된 모든 오더의 청구운임을
// (1) 거래처/상하차지명 기준, (2) 상/하차 지역 기준(전체 지역 한 번에)으로
// 정렬해 보여주고 엑셀로 내려받을 수 있게 한다. 단가표처럼 한 쌍씩 입력해
// 조회하는 대신, 등록된 데이터 전체를 한 번에 훑어 정리하는 용도.
import React, { useState, useMemo } from "react";
import { db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";

const CANCELED_STATUSES = ["취소", "배차취소", "오더취소", "취소됨"];

// 냉장/냉동 · 다마스/라보 · 오토바이 · 나머지(일반화물)로만 크게 묶는다 —
// 차량종류 원문 그대로(카고/윙바디/리프트 등)는 종류가 너무 갈려서 인수인계
// 자료로는 오히려 한눈에 비교하기 어렵다.
const vehicleCategoryOf = (raw = "") => {
  const s = String(raw || "");
  if (!s.trim()) return "미입력";
  if (/냉장|냉동/.test(s)) return "냉장/냉동";
  if (/다마스|라보/.test(s)) return "다마스/라보";
  if (/오토바이|바이크/.test(s)) return "오토바이";
  return "일반화물";
};

// "5파레트", "10박스" 처럼 숫자+단위 형태면 그 형태 그대로 묶고, 그 외
// 자유서술형 화물내용은 원문 그대로를 하나의 묶음으로 본다. 빈 값은 "없음".
const cargoBucketOf = (raw = "") => {
  const s = String(raw || "").trim();
  if (!s) return "없음";
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(파레트|파렛트|박스|통|롤테이너|백)/);
  if (m) return `${m[1]}${m[2] === "파렛트" ? "파레트" : m[2]}`;
  return s;
};

// 주소 앞 두 토큰(시/도, 시군구)을 지역 기준으로 쓴다 — "인천 서구"처럼.
const regionPartsOf = (addr = "") => {
  const parts = String(addr || "").trim().split(/\s+/).filter(Boolean);
  return { sido: parts[0] || "미입력", sigungu: parts[1] || "-" };
};

const onlyNum = (v) => Number(String(v ?? "0").replace(/[^\d]/g, "")) || 0;
const fmtMoney = (v) => onlyNum(v).toLocaleString() + "원";

export default function HandoverFareReport({ userCompany, role }) {
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [rawRows, setRawRows] = useState([]);
  const [tab, setTab] = useState("client"); // "client" | "region"
  const [clientQ, setClientQ] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fetchAll = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const myCompany = role === "totalMaster"
        ? (localStorage.getItem("loginCompany") || userCompany || "돌캐")
        : (userCompany || localStorage.getItem("userCompany") || "돌캐");
      const fetchCol = async (colName) => {
        const snap = await getDocs(collection(db, colName));
        return snap.docs.map((d) => ({ _id: d.id, __col: colName, ...d.data() }));
      };
      const [dispatchRows, orderRows] = await Promise.all([fetchCol("dispatch"), fetchCol("orders")]);
      const merged = [...dispatchRows, ...orderRows].filter((r) =>
        r.source !== "transport_transmit" &&
        r.배차상태 !== "배차취소" &&
        !CANCELED_STATUSES.includes(r.상태) &&
        (r.companyName || "돌캐") === myCompany &&
        onlyNum(r.청구운임) > 0
      );
      setRawRows(merged);
      setLoaded(true);
    } catch (e) {
      alert("조회 실패: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = useMemo(() => {
    let base = rawRows;
    if (startDate) base = base.filter((r) => (r.상차일 || "") >= startDate);
    if (endDate) base = base.filter((r) => (r.상차일 || "") <= endDate);
    if (clientQ.trim()) {
      const q = clientQ.trim();
      base = base.filter((r) => (r.거래처명 || "").includes(q));
    }
    return base;
  }, [rawRows, startDate, endDate, clientQ]);

  const clientReport = useMemo(() => {
    return filteredRows
      .map((r) => ({
        거래처명: r.거래처명 || "(미입력)",
        상차지명: r.상차지명 || "(미입력)",
        하차지명: r.하차지명 || "(미입력)",
        차량구분: vehicleCategoryOf(r.차량종류 || r.차종),
        화물내용: cargoBucketOf(r.화물내용),
        청구운임: onlyNum(r.청구운임),
        상차일: r.상차일 || "",
      }))
      .sort((a, b) =>
        a.거래처명.localeCompare(b.거래처명) ||
        a.상차지명.localeCompare(b.상차지명) ||
        a.하차지명.localeCompare(b.하차지명) ||
        a.차량구분.localeCompare(b.차량구분) ||
        a.화물내용.localeCompare(b.화물내용) ||
        a.상차일.localeCompare(b.상차일)
      );
  }, [filteredRows]);

  const regionReport = useMemo(() => {
    return filteredRows
      .map((r) => {
        const from = regionPartsOf(r.상차지주소);
        const to = regionPartsOf(r.하차지주소);
        return {
          상차시도: from.sido,
          상차시군구: from.sigungu,
          하차시도: to.sido,
          하차시군구: to.sigungu,
          차량구분: vehicleCategoryOf(r.차량종류 || r.차종),
          화물내용: cargoBucketOf(r.화물내용),
          청구운임: onlyNum(r.청구운임),
          거래처명: r.거래처명 || "",
          상차일: r.상차일 || "",
        };
      })
      .sort((a, b) =>
        a.상차시도.localeCompare(b.상차시도) ||
        a.상차시군구.localeCompare(b.상차시군구) ||
        a.하차시도.localeCompare(b.하차시도) ||
        a.하차시군구.localeCompare(b.하차시군구) ||
        a.차량구분.localeCompare(b.차량구분) ||
        a.화물내용.localeCompare(b.화물내용) ||
        a.상차일.localeCompare(b.상차일)
      );
  }, [filteredRows]);

  const activeData = tab === "client" ? clientReport : regionReport;

  const groupCountOf = (data, keys) => {
    const set = new Set(data.map((r) => keys.map((k) => r[k]).join("|")));
    return set.size;
  };
  const groupCount = tab === "client"
    ? groupCountOf(clientReport, ["거래처명", "상차지명", "하차지명"])
    : groupCountOf(regionReport, ["상차시도", "상차시군구", "하차시도", "하차시군구"]);

  const exportExcel = async () => {
    if (!activeData.length) { alert("내려받을 데이터가 없습니다."); return; }
    const XLSX = window.XLSX || (await import("xlsx"));
    const ws = XLSX.utils.json_to_sheet(activeData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tab === "client" ? "거래처기준" : "지역기준");
    XLSX.writeFile(wb, `인수인계_운임_${tab === "client" ? "거래처기준" : "지역기준"}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-4">
        <h1 className="text-[20px] font-bold text-[#1B2B4B]">인수인계 자료 — 운임 이력</h1>
        <p className="text-[12px] text-gray-500 mt-0.5">
          등록된 오더의 청구운임을 거래처/상하차지명 기준, 상·하차 지역 기준으로 정리해서 보여줍니다. (청구운임 0원·취소 건은 제외)
        </p>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("client")}
          className={`px-4 py-2 rounded-lg text-[13px] font-semibold border transition ${
            tab === "client" ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
          }`}
        >
          거래처 · 상하차지명 기준
        </button>
        <button
          onClick={() => setTab("region")}
          className={`px-4 py-2 rounded-lg text-[13px] font-semibold border transition ${
            tab === "region" ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
          }`}
        >
          지역 기준 (전체 지역 한 번에)
        </button>
      </div>

      {/* 조회 조건 */}
      <div className="flex flex-wrap items-end gap-3 mb-4 bg-gray-50 border border-gray-200 rounded-xl p-4">
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1">시작일 (선택)</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-[13px]" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1">종료일 (선택)</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-[13px]" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1">거래처명 검색 (선택)</label>
          <input value={clientQ} onChange={(e) => setClientQ(e.target.value)} placeholder="예: 반찬단지"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-[13px] w-48" />
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="px-5 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold disabled:opacity-50"
        >
          {loading ? "불러오는 중..." : loaded ? "다시 불러오기" : "전체 이력 불러오기"}
        </button>
        {loaded && (
          <button
            onClick={exportExcel}
            className="px-5 py-2 rounded-lg border border-[#1B2B4B] text-[#1B2B4B] text-[13px] font-bold hover:bg-[#1B2B4B] hover:text-white transition"
          >
            엑셀 다운로드 ({activeData.length}건)
          </button>
        )}
        {loaded && (
          <span className="text-[12px] text-gray-500">
            총 <b className="text-[#1B2B4B]">{activeData.length}</b>건 · <b className="text-[#1B2B4B]">{groupCount}</b>개 노선
          </span>
        )}
      </div>

      {!loaded && !loading && (
        <div className="py-20 text-center text-gray-400 text-sm border border-dashed border-gray-300 rounded-xl">
          "전체 이력 불러오기"를 누르면 지금까지 등록된 모든 오더의 청구운임 이력을 불러옵니다.
          <br />데이터가 많으면 시간이 다소 걸릴 수 있어요.
        </div>
      )}

      {loaded && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-auto max-h-[65vh]">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-100 sticky top-0 z-10">
                <tr>
                  {tab === "client" ? (
                    <>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">거래처명</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">상차지명</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">하차지명</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">차량구분</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">화물내용</th>
                      <th className="px-3 py-2 text-right font-bold text-gray-600">청구운임</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">상차일</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">상차 시/도</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">상차 시군구</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">하차 시/도</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">하차 시군구</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">차량구분</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">화물내용</th>
                      <th className="px-3 py-2 text-right font-bold text-gray-600">청구운임</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">거래처명</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">상차일</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {activeData.length === 0 && (
                  <tr>
                    <td colSpan={tab === "client" ? 7 : 9} className="text-center text-gray-400 py-10">
                      조건에 맞는 데이터가 없습니다.
                    </td>
                  </tr>
                )}
                {activeData.map((r, i) => {
                  const prev = activeData[i - 1];
                  const isNewGroup = tab === "client"
                    ? !prev || prev.거래처명 !== r.거래처명 || prev.상차지명 !== r.상차지명 || prev.하차지명 !== r.하차지명
                    : !prev || prev.상차시도 !== r.상차시도 || prev.상차시군구 !== r.상차시군구 || prev.하차시도 !== r.하차시도 || prev.하차시군구 !== r.하차시군구;
                  return (
                    <tr key={i} className={`border-t border-gray-100 hover:bg-gray-50 ${isNewGroup ? "border-t-2 border-t-[#1B2B4B]/30" : ""}`}>
                      {tab === "client" ? (
                        <>
                          <td className="px-3 py-1.5">{r.거래처명}</td>
                          <td className="px-3 py-1.5">{r.상차지명}</td>
                          <td className="px-3 py-1.5">{r.하차지명}</td>
                          <td className="px-3 py-1.5">{r.차량구분}</td>
                          <td className="px-3 py-1.5">{r.화물내용}</td>
                          <td className="px-3 py-1.5 text-right font-semibold">{fmtMoney(r.청구운임)}</td>
                          <td className="px-3 py-1.5 text-gray-500">{r.상차일}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-1.5">{r.상차시도}</td>
                          <td className="px-3 py-1.5">{r.상차시군구}</td>
                          <td className="px-3 py-1.5">{r.하차시도}</td>
                          <td className="px-3 py-1.5">{r.하차시군구}</td>
                          <td className="px-3 py-1.5">{r.차량구분}</td>
                          <td className="px-3 py-1.5">{r.화물내용}</td>
                          <td className="px-3 py-1.5 text-right font-semibold">{fmtMoney(r.청구운임)}</td>
                          <td className="px-3 py-1.5 text-gray-500">{r.거래처명}</td>
                          <td className="px-3 py-1.5 text-gray-500">{r.상차일}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
