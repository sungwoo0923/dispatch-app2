// ======================= src/dispatch/Settlement.jsx =======================
// 🧩 2026-11-27 src/DispatchApp.jsx 에서 그대로 옮긴 코드(동작 · 화면 그대로) — 큰 파일을 화면별로 나눠 로그인 직후 받는 JS 를 줄였다.
import { csvCell } from "../htmlSafe";
import { html2canvas, loadJsPDF } from "../lazyLoad";
import React from "react";
import { getTenant } from "../fsTenant";
import { createPortal } from "react-dom";
import { isSalesOrder, fixedSalesRow, salesMonthOf } from "../salesRule";
import { EditableText } from "../EditMode";
import { CustomSelect } from "../CustomSelect";
import { monthStartAgo, useLoadOrderRange, kstToday as histToday, useLoadFullOrderHistory } from "../orderHistory";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { setDoc } from "../orderWrite";
import { auth, db } from "../firebase";
import KpSubNav from "../KpSubNav";
import RevenueDashboard from "../RevenueDashboard";
import { TargetPage, ClientsPage, TrendPage, YearlyPage, QueryPage } from "../RevenuePages";
import { useFareRules, FareTypeBreakdown } from "../fareRules";
import { fkNum, orderProfit, paidOut, profitTotals } from "../forklift";
import { useTableSort, sortRows, SortTh } from "../tableSort";
import { profitCls } from "../marginPct";
import { MonthCompareAnalysis, MonthlyReport, StaffPerformance, buildNetRevenueExclusionLookup, getNetRevenueExcludedNames } from "./shared/dispatchCommon.jsx";


// ⭐ 매출순위제외 — 위 순수매출제외와 완전히 별개인 플래그. "총 매출/순수 운송료/
// 신규·이탈 거래처"에는 그대로 남기고 싶지만, 매출관리의 "월매출 TOP10"·"매출 감소
// TOP10" 순위 집계에서만 빼고 싶은 거래처(예: 월 단위로 몰아서 합산 청구하는 거래처
// 등, 실제 배차 흐름과 다르게 순위를 왜곡시키는 경우)를 위한 것이다. 레거시 이름
// 폴백은 없다(신규 기능이라 과거 데이터가 없음) — 명시적으로 체크한 거래처만 빠진다.
function buildRankingExclusionLookup(clientsList, placesList) {
  const map = new Map();
  (placesList || []).forEach((p) => {
    const nm = String(p.업체명 || "").trim();
    if (nm && typeof p.매출순위제외 === "boolean") map.set(nm, p.매출순위제외);
  });
  (clientsList || []).forEach((c) => {
    const nm = String(c.거래처명 || "").trim();
    if (nm && typeof c.매출순위제외 === "boolean") map.set(nm, c.매출순위제외);
  });
  return (name) => {
    const n = String(name || "").trim();
    if (!n) return false;
    return map.get(n) || false;
  };
}
const RevenueTeamReport = React.lazy(() => import("../TeamReport")); // 📑 2026-11-15 매출관리 › 팀 실적 보고서

// ⭐ 매출관리 "예상 매출/건수/수익" 계산에 쓰는 국가공휴일 목록 — 설날/추석처럼
// 음력 기준이라 매년 날짜가 바뀌므로, 새해가 되면 이 목록을 그 해 날짜로 다시
// 채워야 한다(연도별로 키를 두어 여러 해를 같이 등록해둘 수 있다). 여기 없는
// 연도는 공휴일 보정 없이(평일처럼) 계산한다.
const KR_HOLIDAYS_BY_YEAR = {
  2026: [
    "2026-01-01", // 신정
    "2026-02-16", "2026-02-17", "2026-02-18", // 설날 연휴
    "2026-03-01", // 삼일절
    "2026-05-05", // 어린이날
    "2026-05-24", "2026-05-25", // 부처님오신날 + 대체공휴일
    "2026-06-06", // 현충일
    "2026-08-15", "2026-08-17", // 광복절 + 대체공휴일
    "2026-09-24", "2026-09-25", "2026-09-26", // 추석 연휴
    "2026-10-03", "2026-10-05", // 개천절 + 대체공휴일
    "2026-10-09", // 한글날
    "2026-12-25", // 성탄절
  ],
};
const isKrHoliday = (dateStr) => {
  const year = Number(String(dateStr || "").slice(0, 4));
  return (KR_HOLIDAYS_BY_YEAR[year] || []).includes(dateStr);
};

// ===================== DispatchApp.jsx (PART 6/8 — Settlement Premium) — START =====================
// 🔒 2026-11-10 비공개 청구운임 — 창은 열 때만 받는다 · 권한 확인은 가벼운 문서 하나 읽기
const PrivateFaresModal = React.lazy(() => import("../PrivateFares"));
function usePrivateFareAccessLazy(company, ver = 0) {
  const [st, setSt] = React.useState({ loading: true, exists: false, viewer: false, settings: null });
  React.useEffect(() => {
    const uid = auth.currentUser?.uid || "";
    if (!company || !uid) { setSt({ loading: false, exists: false, viewer: false, settings: null }); return undefined; }
    const ref = doc(db, "privateFareSettings", company.replace(/\//g, "_"));
    let unsub = null; let off = false;
    getDoc(ref).then((s) => {
      if (off) return;
      if (!s.exists()) { setSt({ loading: false, exists: false, viewer: false, settings: null }); return; }
      unsub = onSnapshot(ref, (x) => { const d = x.exists() ? x.data() : null; setSt({ loading: false, exists: true, viewer: !!d && (d.viewers || []).includes(uid), settings: d }); },
        () => setSt({ loading: false, exists: true, viewer: false, settings: null }));
    }).catch(() => { if (!off) setSt({ loading: false, exists: true, viewer: false, settings: null }); }); // 권한 없음 = 켜져 있지만 담당자가 아님
    return () => { off = true; unsub?.(); };
  }, [company, ver]);
  return st;
}
export default function Settlement({ dispatchData, fixedRows = [], clients = [], places = [], isViewer = false, role, userCompany = "", showAlert = (m) => alert(m) }) {
  const fareRS = useFareRules(getTenant() || userCompany); // ⭐ 2026-11-02 운임규칙 — 운임구분별 합계·내보내기(규칙 사용 회사만)

  // ⭐ 연간 매출 목표(순수 운송료 목표 금액 / 제외 거래처 성장률)는 회사마다 다르므로
  // 하드코딩하지 않고 매출 대시보드 › 목표 달성 카드에서 설정한 값을 불러온다.
  // 아직 설정한 적 없으면 0(미설정)으로 표시하고, "달성률" 계산은 0으로 처리한다.
  const [revenueTarget, setRevenueTarget] = React.useState({ pureTarget: 0, excludedGrowthRate: 3 });
  const [revenueTargetRaw, setRevenueTargetRaw] = React.useState(null); // 설정 편집기 초기값(저장 형식 그대로)
  // ⭐ 2026-10-29 — 목표 설정은 매출 대시보드의 "목표 달성" 카드에서(관리자 이상). 예전엔 회사관리 › 운영 설정.
  const canEditRevenueTarget = role === "admin" || role === "totalMaster";
  const saveRevenueTarget = React.useCallback(async (t) => {
    await setDoc(doc(db, "companySettings", userCompany.trim()), { 매출목표: t }, { merge: true });
  }, [userCompany]);
  React.useEffect(() => {
    if (!userCompany) return;
    const unsub = onSnapshot(doc(db, "companySettings", userCompany.trim()), (snap) => {
      const t = snap.data()?.매출목표 || {};
      setRevenueTargetRaw(t);
      setRevenueTarget({
        pureTarget: Number(t.순수매출목표) || 0,
        excludedGrowthRate: t.제외거래처매출성장률 != null ? Number(t.제외거래처매출성장률) : 3,
      });
    });
    return () => unsub();
  }, [userCompany]);

  const [activeTab, setActiveTab] = React.useState(() => { try { return localStorage.getItem("rvPage") || "dashboard"; } catch { return "dashboard"; } });
  React.useEffect(() => { try { localStorage.setItem("rvPage", activeTab); } catch { /* 무시 */ } }, [activeTab]);
  const [targetMonth, setTargetMonth] = React.useState(
    new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7)
  );
  const [selectedYear, setSelectedYear] = React.useState(
    new Date().getFullYear()
  );
  const [detailClient, setDetailClient] = React.useState(null);
  const [monthCompareOpen, setMonthCompareOpen] = React.useState(false); // ★ 월 비교 분석
  const [marginReportOpen, setMarginReportOpen] = React.useState(false); // ★ 매익률 원인 보고서
  const [staffPerfOpen, setStaffPerfOpen] = React.useState(false); // ★ 배차담당자별 실적(관리자 전용)
  // 🔒 2026-11-10 비공개 청구운임 — 정한 담당자만(처음 켜기는 관리자) · 금액은 별도 보관(src/PrivateFares.jsx · firestore.rules)
  const pfCompany = String(getTenant() || userCompany || "").trim(); // 최고관리자는 지금 보고 있는 회사
  const pfShowOld = false;
  const [pfVer, setPfVer] = React.useState(0);
  React.useEffect(() => { const h = () => setPfVer((n) => n + 1); window.addEventListener("kp-private-fare-changed", h); return () => window.removeEventListener("kp-private-fare-changed", h); }, []);
  const pfAccess = usePrivateFareAccessLazy(pfShowOld ? pfCompany : "", pfVer); // 🔐 2026-11-18 예전 창은 쓰지 않음(빈 회사 → 읽지 않음)
  const [pfOpen, setPfOpen] = React.useState(false);
  const pfShow = !pfAccess.loading && (pfAccess.viewer || (!pfAccess.exists && (role === "admin" || role === "totalMaster") && !isViewer)); // 처음 켜기: 그 회사 관리자 · 최고관리자(대신 켜 주기)
  // ⭐ 매출관리 — 선택한 연도 전체 + 고른 달 기준 3개월 전(전월 비교·마감 점검·담당자 실적)까지만 불러온다.
  // 월 비교 분석은 아무 달이나 고를 수 있어 열 때 전체를 불러온다.
  {
    const yStart = `${Number(selectedYear) - 1}-12-01`; // 🗓 2026-11-25 청구월(마감월) 기준 — 지난해 12월 상차 · 1월 마감(이월) 오더도 1월 매출에 들어오게 한 달 앞부터
    const mStart = monthStartAgo(targetMonth, 3) || yStart;
    useLoadOrderRange(yStart < mStart ? yStart : mStart, histToday());
  }
  useLoadFullOrderHistory(monthCompareOpen || marginReportOpen);
  // ⭐ 거래처 동향(12개월 히트맵)·목표/연간(작년 비교) 화면을 열면 필요한 기간만 더 불러온다
  useLoadOrderRange(monthStartAgo(targetMonth, 12), histToday(), activeTab === "trend"); // 🗓 청구월 기준이라 한 달 더 앞부터(이월 오더)
  useLoadOrderRange(`${(activeTab === "yearly" ? selectedYear : Number(targetMonth.slice(0, 4))) - 2}-12-01`, histToday(), activeTab === "target" || activeTab === "yearly"); // 🗓 작년 1월 청구분(재작년 12월 상차 이월)까지
  const canSeeStaffPerf = role === "admin" || role === "totalMaster";
  // ⭐ AI 월간비교분석 탭에서 선택한 두 달 — 탭을 옮겨도(activeTab 전환으로
  // MonthCompareInsight가 unmount/remount 되어도) 선택이 유지되도록 상위인
  // Settlement가 들고 있는다.
  const [aiCompareMonthA, setAiCompareMonthA] = React.useState("");
  const [aiCompareMonthB, setAiCompareMonthB] = React.useState("");

  // ⭐ 성능 최적화 — 이 화면은 오더 수천 건을 순수매출제외 여부로 여러 번 걸러내는데,
  // 매번 clients/places 배열을 find()로 스캔하면 렉이 걸린다. clients/places가
  // 실제로 바뀔 때만 이름→플래그 Map을 새로 만들고, 그 외 렌더(탭 전환, 월 변경
  // 등)에서는 이미 만들어둔 O(1) 조회 함수를 재사용한다.
  const isExcludedFast = React.useMemo(
    () => buildNetRevenueExclusionLookup(clients, places),
    [clients, places]
  );
  // ⭐ 순수매출제외와 별개 — "월매출 TOP10"·"매출 감소 TOP10" 순위에서만 빼고 싶은
  // 거래처(매출순위제외) 조회용. 총 매출/순수 운송료/신규·이탈 리스트는 이 값과
  // 무관하게 그대로 유지된다.
  const isRankingExcludedFast = React.useMemo(
    () => buildRankingExclusionLookup(clients, places),
    [clients, places]
  );

  const toInt = (v) => fkNum(v); // 🛠 2026-11-25 수수료(orderProfit)와 같은 금액 읽기(소수점 반올림)
  const sum = (list, key) => list.reduce((a, r) => a + toInt(r[key]), 0);
  const profitRate = (sale, profit) =>
    sale === 0 ? 0 : (profit / sale) * 100;
  const ratePct = (n) => `${n.toFixed(1)}%`;

  // ================================
  // 📸 매출관리 화면 전체 캡쳐 (PNG / PDF)
  // ================================
  const exportSettlementCapture = async (type = "png") => {
    const el = document.getElementById("settlement-capture");
    if (!el) { showAlert("캡처 영역을 찾을 수 없습니다."); return; }
    // 넓은 모니터용 확대(zoom)는 캡쳐할 때만 잠시 끈다 — html2canvas가 확대를 제대로 그리지 못한다
    el.classList.add("kp-rv-nozoom");
    let canvas;
    try { canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" }); } finally { el.classList.remove("kp-rv-nozoom"); }
    if (type === "png") {
      const link = document.createElement("a");
      link.download = `매출관리_${targetMonth}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      return;
    }
    const imgData = canvas.toDataURL("image/png");
    const pdf = new (await loadJsPDF())("p", "mm", "a4");
    const pdfWidth = 210;
    const pdfHeight = 297;
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }
    pdf.save(`매출관리_${targetMonth}.pdf`);
  };

  const [yearKey, monthNum] = targetMonth.split("-").map(Number);
  const monthKey = targetMonth;

  const kpiDay = (() => {
    const today = new Date();
    const maxDay = new Date(yearKey, monthNum, 0).getDate();
    const safeDay = Math.min(today.getDate(), maxDay);
    return `${targetMonth}-${String(safeDay).padStart(2, "0")}`;
  })();

  const prevMonthDate = new Date(yearKey, monthNum - 2, 1);
  const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(
    prevMonthDate.getMonth() + 1
  ).padStart(2, "0")}`;

  // ⭐ 성능 최적화 — dispatchData는 회사 전체 이력(수천 건)이라 이 매핑 자체가
  // 무겁다. useMemo 없이 plain const로 두면 activeTab 전환·팝업 열기 등 이
  // 컴포넌트의 모든 리렌더마다 다시 돌아서 렉의 큰 원인이 됐다. dispatchData/
  // fixedRows가 실제로 바뀔 때만 다시 계산한다.
  const dispatchRows = React.useMemo(() => (
    Array.isArray(dispatchData)
      ? dispatchData
          .filter(isSalesOrder) // 📏 2026-11-25 functions/salesRule.mjs — 배차완료 · 취소/화주사 사본 제외(모든 매출 화면이 같은 함수)
          .map((r) => {
            return {
              ...r,
              // ⭐ 2026-11-17 지게차·특수운임이 있는 오더는 배차현황 표와 같은 식(청구 − 기사 − 회사 지급분)으로 — 저장된 수수료가 예전 식(청구 − 기사)으로 남아 있을 수 있다
              // ⭐ 2026-11-17 지게차·특수운임이 없는 오더도 저장된 수수료(예전 식 · 고친 뒤 안 맞춘 값일 수 있음) 대신 늘 다시 계산 — 배차현황 표 · 칩과 같은 숫자
              수수료: orderProfit(r),
            };
          })
      : []
  ), [dispatchData]);

  // 📏 2026-11-25 고정거래처 → 매출 줄(functions/salesRule.mjs fixedSalesRow — 예전 이 자리의 식 그대로 · __fixed: 월 비교 분석에서 "고정거래처"로 구분)
  const fixedMapped = React.useMemo(() => (fixedRows || []).map(fixedSalesRow), [fixedRows]);

  const rows = React.useMemo(() => [...dispatchRows, ...fixedMapped], [dispatchRows, fixedMapped]);

  const dayRows = React.useMemo(() => rows.filter((r) => (r.상차일 || "") === kpiDay), [rows, kpiDay]);
  // 🗓 2026-11-25 달 · 연 매출은 청구월(마감월 → 없으면 상차일 달 · functions/arCore.mjs monthOf) 기준 — 미수금 · 회계와 같은 달. 일 매출(dayRows)은 상차일 그대로
  const monthRows = React.useMemo(() => rows.filter((r) => salesMonthOf(r) === monthKey), [rows, monthKey]);

  const startKey = `${yearKey}-01`;
  const endKey = targetMonth;
  const yearRows = React.useMemo(() => rows.filter((r) => {
    const m = salesMonthOf(r);
    if (!m) return false;
    return m >= startKey && m <= endKey;
  }), [rows, startKey, endKey]);

  const prevMonthRows = React.useMemo(() => rows.filter((r) => salesMonthOf(r) === prevMonthKey), [rows, prevMonthKey]);

  const isValidClientName = (c) => c && !/^2\d{1,2}년/.test(c) && !isExcludedFast(c);
  // ⭐ firstAppearMap/newClients도 매번 전체 rows(수천 건)를 순회하는데, activeTab
  // 전환 등 targetMonth와 무관한 리렌더에서는 다시 계산할 필요가 없다.
  const { firstAppearMap, newClients } = React.useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const c = r.거래처명 || "";
      const d = r.상차일 || "";
      if (!isValidClientName(c) || !d) return;
      if (!map.has(c) || d < map.get(c)) map.set(c, d);
    });

    const basicNames = new Set((clients || []).map(c => (c.거래처명 || "").trim()).filter(Boolean));
    const list = [];
    map.forEach((firstDate, client) => {
      if (firstDate.startsWith(monthKey) && basicNames.has(client.trim())) {
        const clientRows = monthRows.filter((r) => r.거래처명 === client);
        const sale = sum(clientRows, "청구운임");
        const driver = sum(clientRows, "기사운임");
        const fee = sum(clientRows, "수수료");
        const profit = sale - driver - clientRows.reduce((a, r) => a + paidOut(r), 0); // ⭐ 2026-11-17 = 줄 수수료 합
        list.push({ client, firstDate, cnt: clientRows.length, sale, profit, fee });
      }
    });
    return { firstAppearMap: map, newClients: list };
  }, [rows, clients, monthKey, monthRows, isExcludedFast]);

  const won = (n) => `${(n || 0).toLocaleString()}원`;
  const isFresh = (r) => isExcludedFast(r.거래처명);
  const isExcludedClient = (name = "") => isExcludedFast(name);
  const excludedClientNames = getNetRevenueExcludedNames(clients, places);
  const hasExcludedClients = excludedClientNames.length > 0;

  const stat = (list) => {
    const sale = sum(list, "청구운임");
    const driver = sum(list, "기사운임");
    const profit = sale - driver - list.reduce((a, r) => a + paidOut(r), 0); // ⭐ 2026-11-17 지게차·특수운임(회사 지급분)도 뺀다
    return { sale, driver, profit };
  };

  const d = stat(dayRows);
  const m = stat(monthRows);
  const y = stat(yearRows);
  const pm = stat(prevMonthRows);

  const monthSummary = {
    sale: sum(monthRows, "청구운임"),
    driver: sum(monthRows, "기사운임"),
    fee: sum(monthRows, "수수료"),
  };
  const monthProfit = monthSummary.fee;
  const monthProfitRate = monthSummary.sale === 0 ? 0 : (monthProfit / monthSummary.sale) * 100;

  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const daysInMonth = new Date(yearKey, monthNum, 0).getDate();
  const elapsedDays =
    new Set(monthRows.map((r) => r.상차일).filter((d) => d && d <= today)).size || 1;

  const pmPure = stat(prevMonthRows.filter((r) => !isFresh(r)));
  const dPure = stat(dayRows.filter((r) => !isFresh(r)));
  const monthPureRows = monthRows.filter((r) => !isFresh(r));
  const mPure = stat(monthPureRows);
  const yPure = stat(yearRows.filter((r) => !isFresh(r)));

  // ⭐ "예상 매출/건수/수익" — 예전엔 (1) 거래처관리에서 "순수 운송료 매출
  // 통계에서 제외"로 체크한 거래처까지 그대로 포함한 전체 매출을 기준으로,
  // (2) "지금까지의 하루 평균 × 이번달 총 일수"로만 단순 계산했다. 그 결과
  // 제외 거래처가 예상치에 그대로 섞여 들어갔고, 추석 같은 연휴로 실제
  // 영업일이 줄거나 명절 전후로 물량이 몰리는 흐름은 전혀 반영되지 않았다.
  // 이제는 (1) 제외 거래처를 뺀 "순수 운송 매출" 기준으로, (2) 남은 날짜를
  // 하루하루 요일별 평균(최근 90일, 공휴일 제외)으로 채우고, (3) 공휴일은
  // 매출 0으로, 연휴 앞뒤 영업일은 물량 증가를 가산해서 계산한다.
  const forecast = (() => {
    // 최근 90일 요일별(0=일~6=토) 평균 매출/건수 — 공휴일은 패턴을 왜곡하므로 제외
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const recentPureRows = rows.filter((r) => {
      const d = r.상차일;
      return d && d >= cutoffStr && d <= today && !isKrHoliday(d) && !isFresh(r);
    });
    const byWeekday = Array.from({ length: 7 }, () => ({ sale: 0, cnt: 0, days: new Set() }));
    recentPureRows.forEach((r) => {
      const wd = new Date(r.상차일).getDay();
      byWeekday[wd].sale += toInt(r.청구운임);
      byWeekday[wd].cnt += 1;
      byWeekday[wd].days.add(r.상차일);
    });
    const weekdayAvgSale = byWeekday.map((w) => (w.days.size ? w.sale / w.days.size : 0));
    const weekdayAvgCnt = byWeekday.map((w) => (w.days.size ? w.cnt / w.days.size : 0));
    // 최근 데이터가 부족해 특정 요일 평균이 0이면(신규 회사 등) 지금까지의 하루
    // 평균으로 대신한다.
    const fallbackAvgSale = mPure.sale / elapsedDays;
    const fallbackAvgCnt = monthPureRows.length / elapsedDays;

    // 연휴 앞뒤 영업일 가산 배수 — 물류 특성상 연휴 직전엔 미리 발주가 몰리고
    // (선적 러시), 연휴 직후엔 밀렸던 물량이 다시 풀린다. 회사별 실측치가 아닌
    // 업계 통상치이므로 필요하면 조정한다.
    const PRE_HOLIDAY_BOOST = 1.2;
    const POST_HOLIDAY_BOOST = 1.1;
    const isNearHoliday = (dateStr, dayOffset) => {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + dayOffset);
      return isKrHoliday(d.toISOString().slice(0, 10));
    };

    // 조회 중인 달이 이번 달이 아닐 수도 있다(과거/미래 월 선택) — elapsedDays는
    // "매출이 실제로 찍힌 날짜 수"라 중간에 매출 0인 날이 있으면 오늘 날짜와
    // 어긋난다. 남은 날짜 루프는 반드시 실제 오늘 날짜 기준으로 시작해야 한다.
    const startDay = today < monthKey ? 1
      : today.slice(0, 7) === monthKey ? Number(today.slice(8, 10)) + 1
      : daysInMonth + 1; // 이미 다 지난 달 → 남은 날짜 없음(예상=실적)

    let projectedSale = 0;
    let projectedCnt = 0;
    for (let day = startDay; day <= daysInMonth; day++) {
      const dateStr = `${monthKey}-${String(day).padStart(2, "0")}`;
      if (isKrHoliday(dateStr)) continue; // 공휴일 = 매출 0으로 가정

      const wd = new Date(dateStr).getDay();
      let daySale = weekdayAvgSale[wd] || fallbackAvgSale;
      let dayCnt = weekdayAvgCnt[wd] || fallbackAvgCnt;

      if (isNearHoliday(dateStr, 1) || isNearHoliday(dateStr, 2)) {
        daySale *= PRE_HOLIDAY_BOOST; dayCnt *= PRE_HOLIDAY_BOOST;
      } else if (isNearHoliday(dateStr, -1)) {
        daySale *= POST_HOLIDAY_BOOST; dayCnt *= POST_HOLIDAY_BOOST;
      }

      projectedSale += daySale;
      projectedCnt += dayCnt;
    }

    const forecastSale = Math.round(mPure.sale + projectedSale);
    const forecastCount = Math.round(monthPureRows.length + projectedCnt);
    const pureProfitRate = mPure.sale > 0 ? mPure.profit / mPure.sale : 0;
    const forecastProfit = Math.round(forecastSale * pureProfitRate);

    return { sale: forecastSale, count: forecastCount, profit: forecastProfit };
  })();

  const baseYear = yearKey - 1;
  const lastYearRows = rows.filter((r) => salesMonthOf(r).startsWith(String(baseYear))); // 🗓 청구월 기준

  const lastYearFreshByMonth = Array.from({ length: 12 }, (_, i) => ({
    month: `${i + 1}월`,
    sale: 0,
    profit: 0,
  }));
  lastYearRows.forEach((r) => {
    if (!isFresh(r)) return;
    const d = salesMonthOf(r); // 🗓 청구월 기준
    if (!d) return;
    const mIdx = Number(d.slice(5, 7)) - 1;
    const sale = toInt(r.청구운임);
    const driver = toInt(r.기사운임);
    lastYearFreshByMonth[mIdx].sale += sale;
    lastYearFreshByMonth[mIdx].profit += sale - driver - paidOut(r); // ⭐ 2026-11-17 회사 지급분 빼기
  });

  const lastYearPure = stat(lastYearRows.filter((r) => !isFresh(r)));
  const PURE_TARGET_2026 = revenueTarget.pureTarget;
  const lastYearFresh = stat(lastYearRows.filter((r) => isFresh(r)));
  const yFresh = stat(yearRows.filter((r) => isFresh(r)));
  const FRESH_GROWTH_RATE = (revenueTarget.excludedGrowthRate || 0) / 100;
  const FRESH_TARGET_2026 = Math.round(lastYearFresh.sale * (1 + FRESH_GROWTH_RATE));
  const achieveRate = (cur, target) => (target > 0 ? (cur / target) * 100 : 0);
  const baseYearSale = lastYearPure.sale;
  const growth2026 = { conservative: 0.05, normal: 0.1, aggressive: 0.18 };
  const forecast2026 = {
    conservative: Math.round(baseYearSale * (1 + growth2026.conservative)),
    normal: Math.round(baseYearSale * (1 + growth2026.normal)),
    aggressive: Math.round(baseYearSale * (1 + growth2026.aggressive)),
  };

  const todayKey2 = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜
  const prevMonthSameDay = (() => {
    // ⭐ 2026-11-07 한국 날짜 문자열로 계산(예전엔 지역 자정 → toISOString(UTC)이라 하루 앞 날짜와 비교됐다)
    const y = Number(todayKey2.slice(0, 4));
    const mo = Number(todayKey2.slice(5, 7)); // 1~12
    const dd = Number(todayKey2.slice(8, 10));
    const p = new Date(Date.UTC(y, mo - 2, 1));
    const lastDay = new Date(Date.UTC(y, mo - 1, 0)).getUTCDate();
    return `${p.toISOString().slice(0, 7)}-${String(Math.min(dd, lastDay)).padStart(2, "0")}`;
  })();

  const groupByClientDay = (list) => {
    const map = {};
    list.forEach((r) => {
      const c = r.거래처명 || "미지정";
      if (!map[c]) map[c] = { sale: 0, cnt: 0 };
      map[c].sale += toInt(r.청구운임);
      map[c].cnt += 1;
    });
    return map;
  };
  const todayMap = groupByClientDay(rows.filter((r) => r.상차일 === todayKey2));
  const prevMap = groupByClientDay(rows.filter((r) => r.상차일 === prevMonthSameDay));
  const dayDropTop10 = Object.keys({ ...todayMap, ...prevMap })
    .map((client) => {
      const t = todayMap[client] || { sale: 0, cnt: 0 };
      const p = prevMap[client] || { sale: 0, cnt: 0 };
      return { client, todaySale: t.sale, todayCnt: t.cnt, prevSale: p.sale, prevCnt: p.cnt, diff: t.sale - p.sale };
    })
    .filter((r) => r.diff < 0)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 10);

  const diffRate = (cur, prev) => (prev === 0 ? 0 : ((cur - prev) / prev) * 100);
  const vr = { month: diffRate(m.profit, pm.profit) };
  const vrPure = { month: diffRate(mPure.profit, pmPure.profit) };
  const rateText = (n) => `${n >= 0 ? "▲" : "▼"} ${Math.abs(n).toFixed(1)}%`;
  const rateClass = (n) => (n >= 0 ? "text-emerald-600" : "text-rose-600");

  // ================================
  // 🧩 UI RENDER
  // ================================
  // ⭐ 2026-10-28 리디자인 — 왼쪽 사이드바(분석 화면 6개 + 리포트 도구) + 디지털 대시보드
  const RV_PAGES = {
    dashboard: { label: "매출 대시보드", en: "DASHBOARD", icon: "dashboard" },
    target: { label: "목표·전망", en: "TARGET", icon: "trend" },
    clients: { label: "거래처 순위·신규", en: "RANKING", icon: "list" },
    trend: { label: "거래처 동향 분석", en: "TRENDS", icon: "pulse" },
    yearly: { label: "연간 요약", en: "YEARLY", icon: "chart" },
    query: { label: "거래처 기간 조회", en: "QUERY", icon: "history" },
  };
  // 📑 2026-11-15 팀 실적 보고서 — 전자결재에서 매출관리로 옮겼다(사용자 요청). [전자결재로 올리기]를 누르면 결재 작성 화면이 열린다
  const RV_REPORT = { teamreport: { label: "팀 실적 보고서", en: "TEAM REPORT", icon: "file" } };
  const rvPage = RV_PAGES[activeTab] || RV_REPORT[activeTab] ? activeTab : "dashboard";
  const exportCsv = () => {
    const headers = ["상차일","거래처명","상차지명","하차지명","청구운임","기사운임","수수료",...(fareRS.on ? ["운임구분"] : []),"배차상태"];
                const csvRows = [headers.join(",")];
                monthRows.forEach((r) => {
                  csvRows.push(headers.map((h) => csvCell(r[h] || "")).join(","));
                });
                const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `매출관리_${targetMonth}.csv`;
                a.click();
  };
  const rvBtn = "h-9 px-3.5 rounded-[10px] text-[13px] font-bold border transition inline-flex items-center gap-1.5";
  return (
    <KpSubNav code="REVENUE" title="매출관리" icon="chart" active={rvPage} onSelect={setActiveTab}
      groups={[{ label: "분석", items: Object.entries(RV_PAGES).map(([key, v]) => ({ key, ...v })) }, { label: "보고", items: Object.entries(RV_REPORT).map(([key, v]) => ({ key, ...v })) }]}
      actionsLabel="리포트 도구"
      actions={[
        // ⭐ 2026-11-10 월 비교 분석 · 월 마감 점검은 메뉴에서 뺐다(요청)
        { key: "a2", label: "월간 경영 보고서", icon: "file", onClick: () => setMarginReportOpen(true) },
        ...(canSeeStaffPerf ? [{ key: "a4", label: "담당자별 실적", icon: "users", onClick: () => setStaffPerfOpen(true) }] : []),
        // 🔐 2026-11-18 [비공개 청구]는 임원 화면 › 비공개 운임으로 옮겼다(최고관리자가 관리자센터에서 지정한 사람만 · 예전 내용은 그 화면에서 불러오기)
      ]}>
    {pfOpen && pfShow && <React.Suspense fallback={null}><PrivateFaresModal company={pfCompany} dispatchData={dispatchData} clients={clients} access={pfAccess} onClose={() => setPfOpen(false)} /></React.Suspense>}
    {rvPage === "teamreport" ? (
      <React.Suspense fallback={<div className="py-16 text-center text-[14px] font-bold text-[#7A879C]">보고서 화면을 여는 중…</div>}>
        <RevenueTeamReport company={userCompany || localStorage.getItem("userCompany") || ""} me={{ uid: auth.currentUser?.uid || "", name: auth.currentUser?.displayName || "" }} />
      </React.Suspense>
    ) : (
    /* ⭐ 2026-10-29 — 최대폭(1560px) 제한을 없애 넓은 모니터에서도 좌우 여백 없이 꽉 채운다 */
    <div id="settlement-capture" className="kp-rv-zoom w-full">

      {/* ── 머리줄: 화면 제목 + 기준 월 + 내보내기 ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <div style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }} className="text-[11px] font-extrabold tracking-[0.24em] text-[#4B6CB7]">REVENUE · {RV_PAGES[rvPage].en}</div>
          <h1 className="text-[22px] font-black text-[#0F1A30] tracking-tight mt-0.5">{RV_PAGES[rvPage].label}</h1>
          {/* 📏 2026-11-25 매출 기준 한 규칙(functions/salesRule.mjs) — 홈 · 경영 브리핑 · 일일 경영 보고 · 팀 실적 · 경영 분석 · AI 비서도 같은 기준 */}
          <div className="text-[12.5px] font-bold text-[#7A879C] mt-0.5" data-kp="rv-basis">배차완료 오더 + 고정거래처 · 청구월(마감월) 기준(배차중·미배차·취소 제외 · 일 매출은 상차일) · 홈 · 경영 브리핑 · 일일 경영 보고도 같은 기준</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {rvPage === "yearly" ? (
            <CustomSelect className="h-9 bg-white border border-[#DCE3EF] text-[#1B2B4B] rounded-[10px] px-3 text-[14px] font-bold focus:outline-none" value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
              {Array.from(new Set(rows.map((r) => r.상차일?.slice(0, 4)).filter(Boolean))).sort((a, b) => b - a).map((yy) => (
                <option key={yy} value={Number(yy)}>{yy}년</option>
              ))}
            </CustomSelect>
          ) : (
            <CustomSelect className="h-9 bg-white border border-[#DCE3EF] text-[#1B2B4B] rounded-[10px] px-3 text-[14px] font-bold focus:outline-none" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)}>
              {Array.from({ length: 12 }, (_, i) => {
                // ⭐ 2026-11-07 한국 날짜 기준 · 매달 1일로 계산(예전엔 31일에 setMonth가 넘쳐 같은 달이 두 번 나오거나 빠졌고, 1일 새벽엔 지난달이 맨 위였다)
                const k = new Date(Date.now() + 9 * 3600e3);
                const dd = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() - i, 1));
                return <option key={i}>{dd.toISOString().slice(0, 7)}</option>;
              })}
            </CustomSelect>
          )}
          <div className="w-px h-6 bg-[#E3E8F0] mx-1" />
          <button onClick={() => exportSettlementCapture("png")} className={`${rvBtn} bg-white border-[#DCE3EF] text-[#1B2B4B] hover:bg-[#F4F7FC]`}>PNG</button>
          <button onClick={() => exportSettlementCapture("pdf")} className={`${rvBtn} bg-white border-[#DCE3EF] text-[#1B2B4B] hover:bg-[#F4F7FC]`}>PDF</button>
          <button onClick={exportCsv} className={`${rvBtn} bg-[#1B2B4B] border-[#1B2B4B] text-white hover:bg-[#24396A]`}>CSV 내보내기</button>
        </div>
      </div>

      {rvPage === "dashboard" && (
        <RevenueDashboard
          rows={rows}
          targetMonth={targetMonth}
          forecast={forecast}
          yearTarget={PURE_TARGET_2026}
          yearPureSale={yPure.sale}
          targetConfig={revenueTargetRaw}
          onSaveTarget={canEditRevenueTarget && userCompany ? saveRevenueTarget : null}
          lastYearSale={lastYearPure.sale}
          hasExcluded={hasExcludedClients}
          rankRows={monthRows.filter((r) => !isExcludedClient(r.거래처명) && !isRankingExcludedFast(r.거래처명))}
          isRankExcluded={(n) => isExcludedClient(n) || isRankingExcludedFast(n)}
          onOpenClient={setDetailClient}
        />
      )}
      {/* ⭐ 2026-11-02 운임규칙 — 이번 달 운임구분별 합계(규칙 사용 회사만) */}
      {rvPage === "dashboard" && fareRS.on && <FareTypeBreakdown className="mt-4" rows={monthRows} title={`${targetMonth} 운임구분별 합계`} />}

      {rvPage === "target" && (
        <TargetPage rows={rows} targetMonth={targetMonth} yearTarget={PURE_TARGET_2026} isExcluded={isExcludedFast} hasExcluded={hasExcludedClients}
          forecast={forecast} forecast2026={forecast2026} excludedTarget={FRESH_TARGET_2026} />
      )}

      {rvPage === "clients" && (
        <ClientsPage rows={rows} targetMonth={targetMonth} isRankExcluded={(n) => isExcludedClient(n) || isRankingExcludedFast(n)} onOpenClient={setDetailClient} />
      )}

      {rvPage === "trend" && (
        <TrendPage rows={rows} targetMonth={targetMonth} isRankExcluded={(n) => isExcludedClient(n) || isRankingExcludedFast(n)} />
      )}

      {rvPage === "yearly" && <YearlyPage rows={rows} year={selectedYear} />}

      {rvPage === "query" && <QueryPage rows={rows} clients={clients} />}

              {staffPerfOpen && canSeeStaffPerf && createPortal(
                <StaffPerformance
                  rows={rows}
                  isExcluded={isExcludedFast}
                  hasExcluded={getNetRevenueExcludedNames(clients, places).length > 0}
                  onClose={() => setStaffPerfOpen(false)}
                />, document.body
              )}
              {marginReportOpen && createPortal(
                <MonthlyReport
                  rows={rows}
                  isExcluded={isExcludedFast}
                  hasExcluded={getNetRevenueExcludedNames(clients, places).length > 0}
                  onClose={() => setMarginReportOpen(false)}
                />, document.body
              )}
              {monthCompareOpen && createPortal(
                <MonthCompareAnalysis
                  rows={rows}
                  isExcluded={isExcludedFast}
                  hasExcluded={getNetRevenueExcludedNames(clients, places).length > 0}
                  onClose={() => setMonthCompareOpen(false)}
                />, document.body
              )}


        {detailClient && (
          <SettlementDetailPopup
            client={detailClient}
            rows={monthRows.filter((r) => r.거래처명 === detailClient)}
            onClose={() => setDetailClient(null)}
          />
        )}
    </div>
    )}
    </KpSubNav>
  );
}

function SettlementDetailPopup({ client, rows = [], onClose }) {
  const toInt = (v) => parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;
  const sale = rows.reduce((a, r) => a + toInt(r.청구운임), 0);
  const driver = rows.reduce((a, r) => a + toInt(r.기사운임), 0);
  const profit = profitTotals(rows).fee; // ⭐ 2026-11-17 청구 − 기사 − 회사 지급분(지게차·외부 특수운임)
  // ⭐ 머리글 클릭 정렬 — 이 브라우저에만 기억
  const dpSort = useTableSort("settlement.detailPopup");
  const dpRows = React.useMemo(() => sortRows(rows, dpSort.sort, (r, k) => (k === "매출" ? toInt(r.청구운임) : k === "수익" ? orderProfit(r) : r[k])), [rows, dpSort.sort]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white rounded-2xl w-[480px] max-h-[80vh] overflow-hidden shadow-2xl">
        <div className="bg-[#1B2B4B] px-6 py-4 flex justify-between items-center">
          <h3 className="text-[14px] font-bold text-white"><EditableText id="settlement.detailPopup.title" defaultText="거래처 상세" /> · {client}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition">✕</button>
        </div>
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-60px)]">
          <div className="space-y-2 text-[13px] mb-4">
            <div className="flex justify-between"><span><EditableText id="settlement.detailPopup.총매출" defaultText="총 매출" /></span><span className="font-semibold">{sale.toLocaleString()}원</span></div>
            <div className="flex justify-between"><span><EditableText id="settlement.detailPopup.총운반비" defaultText="총 운반비" /></span><span>{driver.toLocaleString()}원</span></div>
            <div className="flex justify-between font-semibold"><span><EditableText id="settlement.detailPopup.총수익" defaultText="총 수익" /></span><span className={profitCls(profit)}>{profit.toLocaleString()}원</span></div>
          </div>
          <table className="w-full text-[12px] border-collapse text-center">
            <thead className="bg-gray-50">
              <tr>
                {["상차일","매출","수익"].map((h) => (
                  <SortTh key={h} k={h} sort={dpSort.sort} onSort={dpSort.toggle} className="border p-1.5"><EditableText id={`settlement.byLoadDate.header.${h}`} defaultText={h} /></SortTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {dpRows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="border p-1.5">{r.상차일}</td>
                  <td className="border p-1.5">{toInt(r.청구운임).toLocaleString()}</td>
                  <td className={`border p-1.5 ${profitCls(orderProfit(r))}`}>{orderProfit(r).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
