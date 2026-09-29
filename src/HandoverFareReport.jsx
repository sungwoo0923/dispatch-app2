// ======================= src/HandoverFareReport.jsx =======================
// 인수인계용 "운임 이력" 보고서 — 지금까지 등록된 모든 오더의 청구운임을
// (1) 거래처/상하차지명 기준, (2) 상/하차 지역 기준(전체 지역 한 번에)으로
// 정리해 보여주고 엑셀로 내려받을 수 있게 한다. 단가표처럼 한 쌍씩 입력해
// 조회하는 대신, 등록된 데이터 전체를 한 번에 훑어 정리하는 용도.
// 최고관리자(totalMaster) 전용 — DispatchApp.jsx의 메뉴 게이팅 참고.
import React, { useState, useMemo, useEffect } from "react";
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

// ⭐ 개수(100통/105통/80통 등)는 건별로 조금씩 달라도 사실상 "같은 화물"이라,
// 개수까지 묶으면 똑같은 노선·같은 운임인데 화물 수량만 달라서 줄이 계속
// 늘어나는 문제가 있었다 — 단위 종류(파레트/박스/통 등)로만 묶고 개수는
// 버린다. 정형화된 단위가 없는 자유서술형 화물내용은 원문 그대로 하나의
// 묶음으로 본다. 빈 값은 "없음".
const cargoBucketOf = (raw = "") => {
  const s = String(raw || "").trim();
  if (!s) return "없음";
  const m = s.match(/(파레트|파렛트|박스|통|롤테이너|백)/);
  if (m) return m[1] === "파렛트" ? "파레트" : m[1];
  return s;
};

// 주소 앞 두 토큰(시/도, 시군구)을 지역 기준으로 쓴다 — "인천 서구"처럼.
const regionPartsOf = (addr = "") => {
  const parts = String(addr || "").trim().split(/\s+/).filter(Boolean);
  return { sido: parts[0] || "미입력", sigungu: parts[1] || "-" };
};

const onlyNum = (v) => Number(String(v ?? "0").replace(/[^\d]/g, "")) || 0;
const fmt = (v) => onlyNum(v).toLocaleString();

// ⭐ 같은 그룹(거래처/상하차지·차량구분·화물단위 또는 지역·차량구분·화물단위)
// 으로 묶인 오더들의 청구운임을 최소~최대로 요약한다 — 다 같으면 "240,000원",
// 다르면(예: 24만원짜리 여러 건 + 25만원짜리 한 건) "240,000 ~ 250,000원".
const summarizeFares = (list) => {
  const nums = list.map((r) => onlyNum(r.청구운임));
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return {
    건수: list.length,
    청구운임최소: min,
    청구운임최대: max,
    청구운임표시: min === max ? `${fmt(min)}원` : `${fmt(min)} ~ ${fmt(max)}원`,
    최근상차일: list.reduce((latest, r) => (r.상차일 || "") > latest ? (r.상차일 || "") : latest, ""),
  };
};

const groupBy = (rows, keyFn) => {
  const map = new Map();
  rows.forEach((r) => {
    const key = keyFn(r);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  });
  return map;
};

export default function HandoverFareReport({ userCompany, role }) {
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [rawRows, setRawRows] = useState([]);
  const [tab, setTab] = useState("client"); // "client" | "region"
  const [clientQ, setClientQ] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // ⭐ 기본거래처 목록에서 일부를 골라 "이 거래처는 결과에서 빼줘"할 수 있게
  // 한다 — 예: 이미 거래 종료된 곳, 테스트로 등록한 곳 등.
  const [clientOptions, setClientOptions] = useState([]);
  const [excludedClients, setExcludedClients] = useState([]);
  const [excludeInput, setExcludeInput] = useState("");

  useEffect(() => {
    const myCompany = role === "totalMaster"
      ? (localStorage.getItem("loginCompany") || userCompany || "돌캐")
      : (userCompany || localStorage.getItem("userCompany") || "돌캐");
    getDocs(collection(db, "clients")).then((snap) => {
      const names = snap.docs
        .map((d) => d.data())
        .filter((c) => (c.companyName || "돌캐") === myCompany)
        .map((c) => c.거래처명)
        .filter(Boolean);
      setClientOptions([...new Set(names)].sort());
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const excludedSet = useMemo(() => new Set(excludedClients), [excludedClients]);
  const excludeSuggestions = useMemo(() => {
    const q = excludeInput.trim();
    if (!q) return [];
    return clientOptions.filter((c) => c.includes(q) && !excludedSet.has(c)).slice(0, 8);
  }, [excludeInput, clientOptions, excludedSet]);

  const filteredRows = useMemo(() => {
    let base = rawRows;
    if (startDate) base = base.filter((r) => (r.상차일 || "") >= startDate);
    if (endDate) base = base.filter((r) => (r.상차일 || "") <= endDate);
    if (clientQ.trim()) {
      const q = clientQ.trim();
      base = base.filter((r) => (r.거래처명 || "").includes(q));
    }
    if (excludedSet.size > 0) {
      base = base.filter((r) => !excludedSet.has(r.거래처명 || ""));
    }
    return base;
  }, [rawRows, startDate, endDate, clientQ, excludedSet]);

  const clientReport = useMemo(() => {
    const groups = groupBy(filteredRows, (r) =>
      [r.거래처명 || "(미입력)", r.상차지명 || "(미입력)", r.하차지명 || "(미입력)",
       vehicleCategoryOf(r.차량종류 || r.차종), cargoBucketOf(r.화물내용)].join("\u0000")
    );
    return [...groups.entries()]
      .map(([key, list]) => {
        const [거래처명, 상차지명, 하차지명, 차량구분, 화물내용] = key.split("\u0000");
        return { 거래처명, 상차지명, 하차지명, 차량구분, 화물내용, ...summarizeFares(list) };
      })
      .sort((a, b) =>
        a.거래처명.localeCompare(b.거래처명) ||
        a.상차지명.localeCompare(b.상차지명) ||
        a.하차지명.localeCompare(b.하차지명) ||
        a.차량구분.localeCompare(b.차량구분) ||
        a.화물내용.localeCompare(b.화물내용)
      );
  }, [filteredRows]);

  const regionReport = useMemo(() => {
    const withRegion = filteredRows.map((r) => ({
      r,
      from: regionPartsOf(r.상차지주소),
      to: regionPartsOf(r.하차지주소),
    }));
    const groups = groupBy(withRegion, ({ r, from, to }) =>
      [from.sido, from.sigungu, to.sido, to.sigungu,
       vehicleCategoryOf(r.차량종류 || r.차종), cargoBucketOf(r.화물내용)].join("\u0000")
    );
    return [...groups.entries()]
      .map(([key, list]) => {
        const [상차시도, 상차시군구, 하차시도, 하차시군구, 차량구분, 화물내용] = key.split("\u0000");
        const rawList = list.map((x) => x.r);
        const clients = [...new Set(rawList.map((r) => r.거래처명).filter(Boolean))];
        return {
          상차시도, 상차시군구, 하차시도, 하차시군구, 차량구분, 화물내용,
          거래처명: clients.length > 1 ? `${clients[0]} 외 ${clients.length - 1}곳` : (clients[0] || ""),
          ...summarizeFares(rawList),
        };
      })
      .sort((a, b) =>
        a.상차시도.localeCompare(b.상차시도) ||
        a.상차시군구.localeCompare(b.상차시군구) ||
        a.하차시도.localeCompare(b.하차시도) ||
        a.하차시군구.localeCompare(b.하차시군구) ||
        a.차량구분.localeCompare(b.차량구분) ||
        a.화물내용.localeCompare(b.화물내용)
      );
  }, [filteredRows]);

  const activeData = tab === "client" ? clientReport : regionReport;
  const totalOrders = activeData.reduce((s, r) => s + r.건수, 0);

  const exportExcel = async () => {
    if (!activeData.length) { alert("내려받을 데이터가 없습니다."); return; }
    const XLSX = window.XLSX || (await import("xlsx"));
    const sheetRows = activeData.map((r) => {
      const base = tab === "client"
        ? { 거래처명: r.거래처명, 상차지명: r.상차지명, 하차지명: r.하차지명 }
        : { 상차시도: r.상차시도, 상차시군구: r.상차시군구, 하차시도: r.하차시도, 하차시군구: r.하차시군구, 거래처명: r.거래처명 };
      return { ...base, 차량구분: r.차량구분, 화물내용: r.화물내용, 청구운임: r.청구운임표시, 건수: r.건수, 최근상차일: r.최근상차일 };
    });
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tab === "client" ? "거래처기준" : "지역기준");
    XLSX.writeFile(wb, `인수인계_운임_${tab === "client" ? "거래처기준" : "지역기준"}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-4">
        <h1 className="text-[20px] font-bold text-[#1B2B4B]">인수인계 자료 — 운임 이력</h1>
        <p className="text-[12px] text-gray-500 mt-0.5">
          같은 거래처/상하차지(또는 지역)·차량구분·화물단위끼리 묶어서 청구운임을 정리합니다. 금액이 다르면 최소~최대로 표시됩니다. (청구운임 0원·취소 건은 제외)
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
      <div className="flex flex-wrap items-end gap-3 mb-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
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
            엑셀 다운로드 ({activeData.length}행)
          </button>
        )}
        {loaded && (
          <span className="text-[12px] text-gray-500">
            <b className="text-[#1B2B4B]">{activeData.length}</b>개 그룹 · 원본 <b className="text-[#1B2B4B]">{totalOrders}</b>건
          </span>
        )}
      </div>

      {/* 거래처 제외 */}
      <div className="mb-4 bg-gray-50 border border-gray-200 rounded-xl p-4">
        <label className="block text-[11px] font-bold text-gray-500 mb-1.5">제외할 거래처 (기본거래처 목록에서 선택)</label>
        <div className="relative w-72">
          <input
            value={excludeInput}
            onChange={(e) => setExcludeInput(e.target.value)}
            placeholder="거래처명을 입력해 검색"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-[13px] w-full"
          />
          {excludeSuggestions.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {excludeSuggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => { setExcludedClients((p) => [...p, name]); setExcludeInput(""); }}
                  className="block w-full text-left px-3 py-1.5 text-[13px] hover:bg-gray-100"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
        {excludedClients.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {excludedClients.map((name) => (
              <span key={name} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-600 text-[11px] font-semibold">
                {name}
                <button type="button" onClick={() => setExcludedClients((p) => p.filter((n) => n !== name))} className="text-red-400 hover:text-red-600">×</button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setExcludedClients([])}
              className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-[11px] font-semibold hover:bg-gray-200"
            >
              전체 해제
            </button>
          </div>
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
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">상차 시/도</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">상차 시군구</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">하차 시/도</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">하차 시군구</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">거래처명</th>
                    </>
                  )}
                  <th className="px-3 py-2 text-left font-bold text-gray-600">차량구분</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-600">화물내용</th>
                  <th className="px-3 py-2 text-right font-bold text-gray-600">청구운임</th>
                  <th className="px-3 py-2 text-right font-bold text-gray-600">건수</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-600">최근상차일</th>
                </tr>
              </thead>
              <tbody>
                {activeData.length === 0 && (
                  <tr>
                    <td colSpan={tab === "client" ? 8 : 10} className="text-center text-gray-400 py-10">
                      조건에 맞는 데이터가 없습니다.
                    </td>
                  </tr>
                )}
                {activeData.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                    {tab === "client" ? (
                      <>
                        <td className="px-3 py-1.5">{r.거래처명}</td>
                        <td className="px-3 py-1.5">{r.상차지명}</td>
                        <td className="px-3 py-1.5">{r.하차지명}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-1.5">{r.상차시도}</td>
                        <td className="px-3 py-1.5">{r.상차시군구}</td>
                        <td className="px-3 py-1.5">{r.하차시도}</td>
                        <td className="px-3 py-1.5">{r.하차시군구}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.거래처명}</td>
                      </>
                    )}
                    <td className="px-3 py-1.5">{r.차량구분}</td>
                    <td className="px-3 py-1.5">{r.화물내용}</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{r.청구운임표시}</td>
                    <td className="px-3 py-1.5 text-right text-gray-500">{r.건수}</td>
                    <td className="px-3 py-1.5 text-gray-500">{r.최근상차일}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
