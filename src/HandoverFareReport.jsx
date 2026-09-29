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

// 톤수 — DispatchApp.jsx의 combineTonStringDA와 동일한 규칙(차량톤수에 이미
// 단위가 있으면 그대로, 없으면 톤수타입(기본 "톤")을 붙임). 톤수가 없으면
// 화물내용만으로는(예: "변압기") 몇 톤 차량에 얼마를 청구했는지 알 수 없어서
// 묶을 때 반드시 같이 봐야 한다는 요청에 따라 그룹핑 키에 추가.
// 단, 오토바이/다마스·라보는 "0.001톤"/"2kg"처럼 사실상 의미 없는 값이
// 오더마다 제각각 입력돼 있어서 톤수로 나누면 오히려 똑같은 건이 쓸데없이
// 여러 줄로 쪼개진다 — 이 차량구분은 톤수를 그룹핑에서 아예 빼고 "-"로 둔다.
const tonOf = (r, vehicleCategory) => {
  if (vehicleCategory === "오토바이" || vehicleCategory === "다마스/라보") return "-";
  const ton = String(r.차량톤수 || "").trim();
  if (!ton) return "미입력";
  if (/톤|kg|킬로/.test(ton)) return ton;
  const unit = String(r.톤수타입 || "톤").trim();
  return `${ton}${unit}`;
};
const tonSortKey = (s) => {
  const m = String(s).match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : Infinity;
};

// 화물내용에서 "단위"와 "개수"를 따로 뽑는다 — 묶을 때는 단위만 쓰고(20박스든
// 28박스든 같은 "박스"), 개수는 따로 모아뒀다가 화면에는 범위로 보여준다
// (아래 cargoRangeLabel 참고). 정형화된 단위가 없는 자유서술형 화물내용은
// 원문 그대로 하나의 단위로 본다(개수 없음). 빈 값은 "없음".
const cargoUnitOf = (raw = "") => {
  const s = String(raw || "").trim();
  if (!s) return { unit: "없음", count: null };
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(파레트|파렛트|박스|통|롤테이너|백)/);
  if (m) return { unit: m[2] === "파렛트" ? "파레트" : m[2], count: Number(m[1]) };
  return { unit: s, count: null };
};

// ⭐ 같은 단위(예: "박스")로 묶인 오더들의 개수를 최소~최대로 요약한다 —
// 20~28박스처럼 개수가 조금씩 달라도(운임이 같다면) 실질적으로 같은 화물로
// 보고 한 줄로 보여달라는 요청에 따른 것. 다 같으면 "26박스", 다르면
// "20~28박스"처럼 표시. 개수가 없는(자유서술형/없음) 단위는 그대로 둔다.
const cargoRangeLabel = (unit, counts) => {
  const nums = counts.filter((c) => c != null);
  if (nums.length === 0) return unit;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return min === max ? `${min}${unit}` : `${min}~${max}${unit}`;
};

// 주소 표기가 "강원도"/"강원특별자치도", "경북"/"경상북도", "부산"/"부산광역시"/
// "부산시"처럼 오더마다 제각각이라 같은 지역인데도 다른 값으로 갈라져 보이는
// 문제가 있었다 — 시/도 표기를 하나로 통일한다.
const SIDO_ALIASES = {
  "서울특별시": "서울", "서울시": "서울", "서울": "서울",
  "부산광역시": "부산", "부산시": "부산", "부산": "부산",
  "대구광역시": "대구", "대구시": "대구", "대구": "대구",
  "인천광역시": "인천", "인천시": "인천", "인천": "인천",
  "광주광역시": "광주", "광주시": "광주", "광주": "광주",
  "대전광역시": "대전", "대전시": "대전", "대전": "대전",
  "울산광역시": "울산", "울산시": "울산", "울산": "울산",
  "세종특별자치시": "세종", "세종시": "세종", "세종": "세종",
  "경기도": "경기", "경기": "경기",
  "강원특별자치도": "강원", "강원도": "강원", "강원": "강원",
  "충청북도": "충북", "충북": "충북",
  "충청남도": "충남", "충남": "충남",
  "전북특별자치도": "전북", "전라북도": "전북", "전북": "전북",
  "전라남도": "전남", "전남": "전남",
  "경상북도": "경북", "경북": "경북",
  "경상남도": "경남", "경남": "경남",
  "제주특별자치도": "제주", "제주도": "제주", "제주": "제주",
};

// 주소 앞 두 토큰(시/도, 시군구)을 지역 기준으로 쓴다 — "인천 서구"처럼.
const regionPartsOf = (addr = "") => {
  const parts = String(addr || "").trim().split(/\s+/).filter(Boolean);
  const sidoRaw = parts[0] || "";
  return {
    sido: SIDO_ALIASES[sidoRaw] || sidoRaw || "미입력",
    sigungu: parts[1] || "-",
  };
};

const onlyNum = (v) => Number(String(v ?? "0").replace(/[^\d]/g, "")) || 0;
const fmt = (v) => onlyNum(v).toLocaleString();

// ⭐ 같은 그룹으로 묶인 오더들의 청구운임을 최소~최대로 요약한다 — 다 같으면
// "240,000원", 다르면(예: 24만원짜리 여러 건 + 25만원짜리 한 건) "240,000 ~
// 250,000원". 그룹별 건수/최근상차일도 같이 계산해둔다.
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
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // ⭐ 기본거래처 목록 — "거래처 선택" 팝업에서 체크한 거래처만 결과에 나온다.
  // selectedClients가 비어있으면(아무것도 안 골랐으면) 필터 없이 전체를 보여준다.
  const [clientOptions, setClientOptions] = useState([]);
  const [selectedClients, setSelectedClients] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDraft, setPickerDraft] = useState([]);
  const [pickerSearch, setPickerSearch] = useState("");
  const [sendingSheet, setSendingSheet] = useState(false);
  const [sheetResult, setSheetResult] = useState("");

  const resolveCompany = () => role === "totalMaster"
    ? (localStorage.getItem("loginCompany") || userCompany || "돌캐")
    : (userCompany || localStorage.getItem("userCompany") || "돌캐");

  useEffect(() => {
    const myCompany = resolveCompany();
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
      const myCompany = resolveCompany();
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

  const openPicker = () => { setPickerDraft(selectedClients); setPickerSearch(""); setPickerOpen(true); };
  const applyPicker = () => { setSelectedClients(pickerDraft); setPickerOpen(false); };
  const pickerFilteredOptions = useMemo(() => {
    const q = pickerSearch.trim();
    return q ? clientOptions.filter((c) => c.includes(q)) : clientOptions;
  }, [pickerSearch, clientOptions]);

  const selectedSet = useMemo(() => new Set(selectedClients), [selectedClients]);

  const filteredRows = useMemo(() => {
    let base = rawRows;
    if (startDate) base = base.filter((r) => (r.상차일 || "") >= startDate);
    if (endDate) base = base.filter((r) => (r.상차일 || "") <= endDate);
    if (selectedSet.size > 0) {
      base = base.filter((r) => selectedSet.has(r.거래처명 || ""));
    }
    return base;
  }, [rawRows, startDate, endDate, selectedSet]);

  // 거래처 > 상차지명 > 하차지명 > 차량구분 > 화물단위 순으로 크게 나눠
  // 나열한다 — "기본거래처별로 지역별로 쫙" 정렬해달라는 요청 그대로. 화물
  // 단위(박스/파레트 등)가 같으면 개수가 조금씩 달라도(20~28박스처럼) 한
  // 줄로 묶고, 화면에는 개수 범위로 보여준다(cargoRangeLabel).
  const clientReport = useMemo(() => {
    const groups = groupBy(filteredRows, (r) => {
      const 차량구분 = vehicleCategoryOf(r.차량종류 || r.차종);
      return [r.거래처명 || "(미입력)", r.상차지명 || "(미입력)", r.하차지명 || "(미입력)",
        차량구분, tonOf(r, 차량구분), cargoUnitOf(r.화물내용).unit].join("\u0000");
    });
    return [...groups.entries()]
      .map(([key, list]) => {
        const [거래처명, 상차지명, 하차지명, 차량구분, 톤수, 화물단위] = key.split("\u0000");
        const counts = list.map((r) => cargoUnitOf(r.화물내용).count);
        return {
          거래처명, 상차지명, 하차지명, 차량구분, 톤수,
          화물내용: cargoRangeLabel(화물단위, counts),
          ...summarizeFares(list),
        };
      })
      .sort((a, b) =>
        a.거래처명.localeCompare(b.거래처명) ||
        a.상차지명.localeCompare(b.상차지명) ||
        a.하차지명.localeCompare(b.하차지명) ||
        a.차량구분.localeCompare(b.차량구분) ||
        (tonSortKey(a.톤수) - tonSortKey(b.톤수)) || a.톤수.localeCompare(b.톤수) ||
        a.화물내용.localeCompare(b.화물내용)
      );
  }, [filteredRows]);

  // 거래처 > 상차 시/도·시군구 > 하차 시/도·시군구 > 차량구분 > 화물단위
  // 순서로 나열 — 거래처를 가장 먼저 나눈 뒤 그 안에서 지역별로 쫙 정리된다.
  const regionReport = useMemo(() => {
    const groups = groupBy(filteredRows, (r) => {
      const from = regionPartsOf(r.상차지주소);
      const to = regionPartsOf(r.하차지주소);
      const 차량구분 = vehicleCategoryOf(r.차량종류 || r.차종);
      return [r.거래처명 || "(미입력)", from.sido, from.sigungu, to.sido, to.sigungu,
        차량구분, tonOf(r, 차량구분), cargoUnitOf(r.화물내용).unit].join("\u0000");
    });
    return [...groups.entries()]
      .map(([key, list]) => {
        const [거래처명, 상차시도, 상차시군구, 하차시도, 하차시군구, 차량구분, 톤수, 화물단위] = key.split("\u0000");
        const counts = list.map((r) => cargoUnitOf(r.화물내용).count);
        return {
          거래처명, 상차시도, 상차시군구, 하차시도, 하차시군구, 차량구분, 톤수,
          화물내용: cargoRangeLabel(화물단위, counts),
          ...summarizeFares(list),
        };
      })
      .sort((a, b) =>
        a.거래처명.localeCompare(b.거래처명) ||
        a.상차시도.localeCompare(b.상차시도) ||
        a.상차시군구.localeCompare(b.상차시군구) ||
        a.하차시도.localeCompare(b.하차시도) ||
        a.하차시군구.localeCompare(b.하차시군구) ||
        a.차량구분.localeCompare(b.차량구분) ||
        (tonSortKey(a.톤수) - tonSortKey(b.톤수)) || a.톤수.localeCompare(b.톤수) ||
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
        : { 거래처명: r.거래처명, 상차시도: r.상차시도, 상차시군구: r.상차시군구, 하차시도: r.하차시도, 하차시군구: r.하차시군구 };
      return { ...base, 차량구분: r.차량구분, 톤수: r.톤수, 화물내용: r.화물내용, 청구운임: r.청구운임표시, 최근상차일: r.최근상차일 };
    });
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tab === "client" ? "거래처기준" : "지역기준");
    XLSX.writeFile(wb, `인수인계_운임_${tab === "client" ? "거래처기준" : "지역기준"}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ⭐ "구글시트 백필"과 같은 방식(Cloud Function + key)으로, 화면에 지금 계산돼
  // 있는 결과(거래처·상하차지명 기준 + 거래처·지역 기준 둘 다, 현재 보고 있는
  // 탭과 무관하게)를 "운임표(명칭)"/"운임표(주소)" 시트 탭에 그대로 전송한다.
  // 그룹핑/묶음 계산은 전부 화면(clientReport/regionReport)에서 이미 끝난
  // 결과라 서버는 받아 적기만 한다.
  const sendToGsheet = async () => {
    if (!clientReport.length && !regionReport.length) { alert("먼저 이력을 불러와주세요."); return; }
    if (!window.confirm('구글시트의 "운임표(명칭)"/"운임표(주소)" 탭을 통째로 비우고, 지금 조회된 내용으로 다시 채웁니다.\n계속할까요?')) return;
    setSendingSheet(true);
    setSheetResult("");
    try {
      const nameRows = clientReport.map((r) => ({
        거래처명: r.거래처명, 상차지명: r.상차지명, 하차지명: r.하차지명,
        차량구분: r.차량구분, 톤수: r.톤수, 화물내용: r.화물내용,
        청구운임: r.청구운임표시, 최근상차일: r.최근상차일,
      }));
      const addressRows = regionReport.map((r) => ({
        거래처명: r.거래처명, 상차시도: r.상차시도, 상차시군구: r.상차시군구,
        하차시도: r.하차시도, 하차시군구: r.하차시군구,
        차량구분: r.차량구분, 톤수: r.톤수, 화물내용: r.화물내용,
        청구운임: r.청구운임표시, 최근상차일: r.최근상차일,
      }));
      const res = await fetch("https://us-central1-dispatch-app-9b92f.cloudfunctions.net/backfillGsheetFareHistory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "dolkae-backfill-2026", nameRows, addressRows }),
      });
      const text = await res.text();
      setSheetResult(text);
    } catch (e) {
      setSheetResult(`요청 실패: ${e?.message || e}`);
    } finally {
      setSendingSheet(false);
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-4">
        <h1 className="text-[20px] font-bold text-[#1B2B4B]">인수인계 자료 — 운임 이력</h1>
        <p className="text-[12px] text-gray-500 mt-0.5">
          거래처 → 상하차지(또는 지역) → 차량구분 → 화물내용 순서로 정리합니다. 같은 조건에서 금액이 다르면 최소~최대로 표시됩니다. (청구운임 0원·취소 건은 제외)
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
          거래처 · 지역 기준 (전체 지역 한 번에)
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
          <label className="block text-[11px] font-bold text-gray-500 mb-1">거래처 선택 (선택)</label>
          <button
            type="button"
            onClick={openPicker}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-[13px] bg-white hover:bg-gray-50 min-w-[160px] text-left"
          >
            {selectedClients.length === 0 ? "전체 거래처" : `${selectedClients.length}개 거래처 선택됨`}
          </button>
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
          <button
            onClick={sendToGsheet}
            disabled={sendingSheet}
            className="px-5 py-2 rounded-lg border border-[#1B2B4B] text-[#1B2B4B] text-[13px] font-bold hover:bg-[#1B2B4B] hover:text-white transition disabled:opacity-50"
          >
            {sendingSheet ? "전송 중..." : "구글시트로 보내기 (명칭+주소)"}
          </button>
        )}
        {loaded && (
          <span className="text-[12px] text-gray-500">
            <b className="text-[#1B2B4B]">{activeData.length}</b>개 그룹 · 원본 <b className="text-[#1B2B4B]">{totalOrders}</b>건
          </span>
        )}
      </div>
      {sheetResult && (
        <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-[12px] text-gray-700 whitespace-pre-wrap break-words">
          {sheetResult}
        </div>
      )}

      {/* 거래처 선택 팝업 */}
      {pickerOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]" onClick={() => setPickerOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[420px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="font-bold text-[15px] text-[#1B2B4B] mb-2">거래처 선택</div>
              <input
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="거래처명 검색"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-[13px]"
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setPickerDraft(pickerFilteredOptions)}
                  className="text-[11px] font-semibold text-[#1B2B4B] hover:underline"
                >
                  {pickerSearch.trim() ? "검색결과 전체선택" : "전체선택"}
                </button>
                <button
                  type="button"
                  onClick={() => setPickerDraft([])}
                  className="text-[11px] font-semibold text-gray-500 hover:underline"
                >
                  전체해제
                </button>
                <span className="text-[11px] text-gray-400 ml-auto self-center">{pickerDraft.length}개 선택</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {pickerFilteredOptions.length === 0 && (
                <div className="text-center text-gray-400 text-[13px] py-8">거래처가 없습니다.</div>
              )}
              {pickerFilteredOptions.map((name) => {
                const checked = pickerDraft.includes(name);
                return (
                  <label key={name} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-[13px]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setPickerDraft((p) => checked ? p.filter((n) => n !== name) : [...p, name])}
                      className="w-4 h-4 accent-[#1B2B4B]"
                    />
                    {name}
                  </label>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-[13px] font-semibold hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={applyPicker}
                className="flex-1 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60]"
              >
                적용 {pickerDraft.length > 0 ? `(${pickerDraft.length})` : "(전체)"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <th className="px-3 py-2 text-center font-bold text-gray-600">거래처명</th>
                  {tab === "client" ? (
                    <>
                      <th className="px-3 py-2 text-center font-bold text-gray-600">상차지명</th>
                      <th className="px-3 py-2 text-center font-bold text-gray-600">하차지명</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-2 text-center font-bold text-gray-600">상차 시/도</th>
                      <th className="px-3 py-2 text-center font-bold text-gray-600">상차 시군구</th>
                      <th className="px-3 py-2 text-center font-bold text-gray-600">하차 시/도</th>
                      <th className="px-3 py-2 text-center font-bold text-gray-600">하차 시군구</th>
                    </>
                  )}
                  <th className="px-3 py-2 text-center font-bold text-gray-600">차량구분</th>
                  <th className="px-3 py-2 text-center font-bold text-gray-600">톤수</th>
                  <th className="px-3 py-2 text-center font-bold text-gray-600">화물내용</th>
                  <th className="px-3 py-2 text-center font-bold text-gray-600">청구운임</th>
                  <th className="px-3 py-2 text-center font-bold text-gray-600">최근상차일</th>
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
                    <td className="px-3 py-1.5 text-center font-semibold">{r.거래처명}</td>
                    {tab === "client" ? (
                      <>
                        <td className="px-3 py-1.5 text-center">{r.상차지명}</td>
                        <td className="px-3 py-1.5 text-center">{r.하차지명}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-1.5 text-center">{r.상차시도}</td>
                        <td className="px-3 py-1.5 text-center">{r.상차시군구}</td>
                        <td className="px-3 py-1.5 text-center">{r.하차시도}</td>
                        <td className="px-3 py-1.5 text-center">{r.하차시군구}</td>
                      </>
                    )}
                    <td className="px-3 py-1.5 text-center">{r.차량구분}</td>
                    <td className="px-3 py-1.5 text-center">{r.톤수}</td>
                    <td className="px-3 py-1.5 text-center">{r.화물내용}</td>
                    <td className="px-3 py-1.5 text-center font-semibold">{r.청구운임표시}</td>
                    <td className="px-3 py-1.5 text-center text-gray-500">{r.최근상차일}</td>
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
