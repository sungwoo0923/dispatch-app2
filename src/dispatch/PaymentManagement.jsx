// ======================= src/dispatch/PaymentManagement.jsx =======================
// 🧩 2026-11-27 src/DispatchApp.jsx 에서 그대로 옮긴 코드(동작 · 화면 그대로) — 큰 파일을 화면별로 나눠 로그인 직후 받는 JS 를 줄였다.
import { kpConfirm, kpChoose } from "../kpDialog";
import { runBulkTask } from "../DeleteProgress";
import React, { useState, useEffect, useMemo } from "react";
import { getTenant } from "../fsTenant";
import { makeClientMatcher } from "../clientMatch";
import CustomDatePicker from "../CustomDatePicker";
import { formatAccountView as fmtAcctByBank } from "../bankUtil";
import { EditableText } from "../EditMode";
import { CompanyOptionPicker } from "../companyOptionPicker";
import { CustomSelect } from "../CustomSelect";
import { useLoadOrderRange } from "../orderHistory";
import { onSnapshot, collection, doc } from "firebase/firestore";
import { setDoc } from "../orderWrite";
import { DEFAULT_COMPANY, db } from "../firebase";
import { bumpDriverPayout, setDriverPayAdjust, payFundInfo, setPayFundDefault } from "../ledgerAuto";
import { isPaidThenCanceled, payLedgerPlan, PAY_VAT_RATE, payTransferOf, settleGapPlan, paidVatOf, payGapOf } from "../payCore";
import { useFareRules } from "../fareRules";
import { profitTotals, orderProfit, paidOut } from "../forklift";
import { useTableSort, sortRows, SortTh } from "../tableSort";
import { marginPctText, profitCls, MarginPct } from "../marginPct";
import { useBetaOn, isCaughtCall, queuePayNotice, PayNoticeToggle, DateField } from "../CallPay";
import PrepayImportModal, { TransferPreviewModal } from "../PrepayImport";
import { isPrepaySheet, parsePrepayRows, normPlate as prepayPlate, yongchaTransferRows } from "../prepayCore";
import { isFleetGrade } from "../DriverAppGuide";
import { KP_MONO, loadXLSX, normalizePlate } from "./shared/dispatchCommon.jsx";


// ===================== DispatchApp.jsx (PART 8/8) — END =====================

// ===================== DispatchApp.jsx (PART 9/9) — START =====================
export default function PaymentManagement({ dispatchData = [], patchDispatch, clients = [], drivers: driversProp = null, companyName = "", canEditPayDay = false, mobile = false }) {
  const fareRP = useFareRules(companyName); // ⭐ 2026-11-02 운임규칙 — 엑셀에 운임구분 열(규칙 사용 회사만)
  const payNoticeBeta = useBetaOn(getTenant() || companyName); // 📩 2026-11-11 지급 시 기사 자동 문자(시험 기능)

  const todayStr9 = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const thisMonthStr = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
  const lastMonthStr = () => { // ⭐ 2026-11-07 한국 날짜 · 1일 기준(31일 넘침 방지)
    const k = new Date(Date.now() + 9 * 3600e3);
    return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  };
  const toInt = (v) => { const n = parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10); return isNaN(n) ? 0 : n; };
  const won = (n) => toInt(n).toLocaleString();

  // ─── 탭 ───
  const [activeTab, setActiveTab] = useState("list"); // list | driver

  // ─── 필터 ───
  const [statusFilter, setStatusFilter] = useState("전체");
  const [payMethodFilter, setPayMethodFilter] = useState("전체");
  const [dispatchMethodFilter, setDispatchMethodFilter] = useState("전체");
  const [loadStart, setLoadStart] = useState(() => `${thisMonthStr()}-01`);
  // 🛠 2026-11-27 기본 기간 = 이번 달 1일 ~ 말일(예전엔 오늘까지라 내일 · 이번 달 남은 날 상차 오더가 빠져 정산 홈 '기사 지급'과 숫자가 달랐다)
  const [loadEnd, setLoadEnd] = useState(() => { const d = new Date(); return `${thisMonthStr()}-${String(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()).padStart(2, "0")}`; });
  useLoadOrderRange(loadStart || null, loadEnd); // ★ 고른 기간만 불러오기
  const [carNoQ, setCarNoQ] = useState("");
  const [nameQ, setNameQ] = useState("");
  const [clientQ, setClientQ] = useState("");
  const [selectedPayDate, setSelectedPayDate] = useState(todayStr9());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editRow, setEditRow] = useState(null); // { id, data }
  // 조회 버튼 눌러야 결과 표시 — 🛠 2026-11-27 정산 홈 [기사 지급]으로 들어오면 바로 조회된 상태(src/SettleHome.jsx 가 kpPayOpenNow 를 남긴다)
  const [searched, setSearched] = useState(() => { try { const t = Number(sessionStorage.getItem("kpPayOpenNow") || 0); sessionStorage.removeItem("kpPayOpenNow"); return Date.now() - t < 10000; } catch { return false; } });
  const [vatRate] = useState(0.1); // 부가세 10%
  const [insuranceRate, setInsuranceRate] = useState(1.27); // 산재보험료율 (%)
  const [payExcelOpen, setPayExcelOpen] = useState(false);
  const [payExcelPreview, setPayExcelPreview] = useState(null); // { matched, unmatched }
  const [payExcelConfirming, setPayExcelConfirming] = useState(false);
  const [payExcelDone, setPayExcelDone] = useState(null); // { excelCount, dispatchCount, totalAmt }
  const [prepay, setPrepay] = useState(null); // 💳 2026-11-20 선정산 파일 { fileName, items }

  // 빠른 기간 선택
  const setThisMonth = () => {
    const ym = thisMonthStr();
    const lastDay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    setLoadStart(`${ym}-01`); setLoadEnd(`${ym}-${lastDay}`);
    setSearched(true);
  };
  const setLastMonth = () => {
    const ym = lastMonthStr();
    const d = new Date(ym + "-01");
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    setLoadStart(`${ym}-01`); setLoadEnd(`${ym}-${lastDay}`);
    setSearched(true);
  };

  // ─── 기초 데이터 ───
  // 🚚 용차지급관리 — 지입·직영·임대 기사님 오더는 빼고(지입정산관리에서 따로) 일반 용차만
  // ⭐ 2026-11-02 용차 = 일반 차량. 기사관리에서 지입·직영·임대로 등록된 차량(우리 회사 기사 목록, 차량번호 공백·하이픈 무시)의
  //   오더는 빼고, 일반·블랙·미등록 차량 오더만 보인다.
  //   예전엔 ① 기사 목록이 늦게 도착해도 목록을 다시 계산하지 않아(의존성 누락) 처음엔 지입·직영·임대 오더까지 보였다가
  //   지급상태 버튼을 누르는 등 다른 값이 바뀐 뒤에야 걸러졌고(6건 → 1건), ② 다른 회사 기사까지 섞여 있었다.
  const [ownDrivers, setOwnDrivers] = useState(null);
  const needOwnDrivers = !Array.isArray(driversProp);
  useEffect(() => {
    if (!needOwnDrivers) return undefined;
    const co = String(companyName || "").trim() || DEFAULT_COMPANY;
    return onSnapshot(collection(db, "drivers"), (snap) => {
      setOwnDrivers(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => (d.companyName || DEFAULT_COMPANY) === co));
    }, () => setOwnDrivers([]));
  }, [needOwnDrivers, companyName]);
  const payDrivers = needOwnDrivers ? ownDrivers : driversProp;
  const fleetPlates = useMemo(() => {
    const set = new Set();
    (payDrivers || []).forEach((d) => {
      if (!isFleetGrade(d.등급)) return;
      const pl = normalizePlate(d.차량번호 || d.carNo || "");
      if (pl && pl !== "-") set.add(pl);
    });
    return set;
  }, [payDrivers]);
  // 💸 2026-11-27 세금계산서 받는 기사(기사관리 '세금계산서 발행') — 지급완료 때 부가세 포함 이체액으로 장부에
  const invoicePlates = useMemo(() => {
    const set = new Set();
    (payDrivers || []).forEach((d) => { if (d.세금계산서발행 !== true) return; const pl = normalizePlate(d.차량번호 || d.carNo || ""); if (pl && pl !== "-") set.add(pl); });
    return set;
  }, [payDrivers]);
  const isInvoiceRow = (r) => invoicePlates.has(normalizePlate(r?.차량번호 || ""));
  const driversReady = Array.isArray(payDrivers); // 기사 목록이 오기 전엔 지입 차량을 가려낼 수 없어 잠깐 비워 둔다
  const base = useMemo(
    // 💳 2026-11-11 IN(우리 오더를 용차 기사가 잡은 것)만 — OUT(외부 콜을 잡은 오더)은 정산관리 › 입금 확인에서 본다(시험 기능 운송사)
    // 💸 2026-11-25 지급 후 취소된 오더(배차완료가 아니어도)도 남겨 [지급 취소]할 수 있게 · 지입 지급명세서로 지급한 오더는 빼기
    () => (!driversReady ? [] : (Array.isArray(dispatchData) ? dispatchData : []).filter(r => ((r.배차상태 || "") === "배차완료" || isPaidThenCanceled(r)) && !r.지급명세서ID && !fleetPlates.has(normalizePlate(r.차량번호 || "")) && !(payNoticeBeta && isCaughtCall(r)))),
    [dispatchData, fleetPlates, driversReady, payNoticeBeta]
  );

  const filtered = useMemo(() => {
    if (!searched) return [];
    let rows = [...base];
    // 지급완료가 아니면 모두 미지급(지급중·빈 값·"미지급" 등 예전 값 포함)
    if (statusFilter !== "전체") rows = rows.filter(r => ((r.지급상태 || "") === "지급완료" ? "지급완료" : "지급중") === statusFilter);
    if (loadStart) rows = rows.filter(r => (r.상차일 || "") >= loadStart);
    if (loadEnd) rows = rows.filter(r => (r.상차일 || "") <= loadEnd);
    if (payMethodFilter !== "전체") rows = rows.filter(r => r.지급방식 === payMethodFilter);
    if (dispatchMethodFilter !== "전체") rows = rows.filter(r => r.배차방식 === dispatchMethodFilter);
    const car = carNoQ.trim().toLowerCase();
    const name = nameQ.trim().toLowerCase();
    const cl = clientQ.trim().toLowerCase();
    if (car) rows = rows.filter(r => String(r.차량번호 || "").toLowerCase().includes(car));
    if (name) rows = rows.filter(r => String(r.이름 || "").toLowerCase().includes(name));
    if (cl) { const pmNameM = makeClientMatcher(cl, rows.map((r) => r.거래처명)); rows = rows.filter(r => pmNameM(r.거래처명)); } // ⭐ 정확히 같은 거래처가 있으면 그것만
    return rows.sort((a, b) => (a.상차일 || "").localeCompare(b.상차일 || ""));
  }, [searched, base, statusFilter, loadStart, loadEnd, payMethodFilter, dispatchMethodFilter, carNoQ, nameQ, clientQ]);

  // ─── KPI ───
  const kpi = useMemo(() => {
    const sale = filtered.reduce((s, r) => s + toInt(r.청구운임), 0);
    const driver = filtered.reduce((s, r) => s + toInt(r.기사운임), 0);
    const paid = profitTotals(filtered).paid; // ⭐ 2026-11-17 회사가 따로 준 지게차·특수운임 — 수수료 합계를 줄 수수료 합과 맞춘다
    const done = filtered.filter(r => (r.지급상태 || "지급중") === "지급완료").length;
    const undone = filtered.length - done;
    const undoneAmt = filtered.filter(r => (r.지급상태 || "지급중") !== "지급완료").reduce((s, r) => s + toInt(r.기사운임), 0);
    const vatTotal = Math.round(driver * vatRate);
    const insuranceTotal = Math.round(driver * (insuranceRate / 100));
    return { cnt: filtered.length, sale, driver, fee: sale - driver - paid, done, undone, undoneAmt, vatTotal, insuranceTotal };
  }, [filtered, vatRate, insuranceRate]);

  // ─── 기사별 집계 ───
  const driverSummary = useMemo(() => {
    const map = new Map();
    filtered.forEach(r => {
      const key = r.차량번호 || "미등록";
      if (!map.has(key)) map.set(key, { 차량번호: key, 이름: r.이름 || "", 전화번호: r.전화번호 || "", cnt: 0, 기사운임합: 0, 지급완료: 0, 미지급: 0, 미지급액: 0, rows: [] });
      const e = map.get(key);
      e.cnt++; e.기사운임합 += toInt(r.기사운임); e.rows.push(r);
      if ((r.지급상태 || "지급중") === "지급완료") e.지급완료++;
      else { e.미지급++; e.미지급액 += toInt(r.기사운임); }
    });
    return Array.from(map.values()).sort((a, b) => b.기사운임합 - a.기사운임합);
  }, [filtered]);

  // ─── ⭐ 머리글 클릭 정렬(▲→▼→해제) — 이 브라우저에만 기억. 걸러진 목록만 따로 정렬 ───
  const paySort = useTableSort("payment.list");
  const paySorted = useMemo(() => sortRows(filtered, paySort.sort, (r, key, i) => {
    switch (key) {
      case "순번": return i;
      case "상차지": return r.상차지명;
      case "하차지": return r.하차지명;
      case "기사명": return r.이름;
      case "청구운임": return toInt(r.청구운임);
      case "기사운임": return toInt(r.기사운임);
      case "부가세(10%)": return Math.round(toInt(r.기사운임) * vatRate);
      case "산재보험료": return Math.round(toInt(r.기사운임) * insuranceRate / 100);
      case "수수료": return orderProfit(r);
      case "지급상태": return r.지급상태 || "지급중";
      default: return r[key];
    }
  }), [filtered, paySort.sort, vatRate, insuranceRate]); // eslint-disable-line react-hooks/exhaustive-deps
  const payDrvSort = useTableSort("payment.byDriver");
  const payDrvSorted = useMemo(() => sortRows(driverSummary, payDrvSort.sort, (d, key) => {
    switch (key) {
      case "기사명": return d.이름;
      case "총 건수": return d.cnt;
      case "기사운임 합계": return d.기사운임합;
      case "미지급 건수": return d.미지급;
      case "미지급 금액": return d.미지급액;
      default: return d[key];
    }
  }), [driverSummary, payDrvSort.sort]);

  // ─── 지급 처리 ───
  // 🔗 2026-11-01 지급완료/취소 → 수입·지출 장부(지급일별 "기사운임 지급")에 자동 반영
  // 💸 2026-11-25 장부는 오더에 남긴 지급액(지급완료 때 기사운임)으로 더하고 뺀다 — 지급 뒤 운임을 고쳐도 장부가 틀어지지 않게(src/payCore.js)
  //   row = 바꾸기 전 오더 · keepAmount = 지급일만 옮기기
  const syncPayLedger = (row, nextStatus, nextDate, { keepAmount = false, fundId = "" } = {}) => {
    if (!row) return;
    const wasPaid = (row.지급상태 || "지급중") === "지급완료";
    const co = companyName || row.companyName || "";
    const plan = payLedgerPlan(row, { status: nextStatus, date: nextDate, keepAmount, vatRate: isInvoiceRow(row) ? PAY_VAT_RATE : 0 }, todayStr9());
    plan.bumps.forEach((b) => bumpDriverPayout(db, { ...b, company: co, fundId }).catch(() => {}));
    if (plan.adjAmount != null && row._id) setDriverPayAdjust(db, { orderId: row._id, amount: plan.adjAmount, date: todayStr9(), company: co, who: row.이름 || "" }).catch(() => {});
    // 📩 2026-11-11 지급완료 → 기사에게 입금 안내 문자(시험 기능 · 스위치를 켠 경우만 · 같은 기사는 한 통으로 묶음)
    if (nextStatus === "지급완료" && !wasPaid && payNoticeBeta) queuePayNotice({ row, date: nextDate, company: co, patchDispatch });
  };
  // 오더에 저장할 칸(지급상태 · 지급일 · 지급액 · 지급액기록일 …) — 오더를 못 찾으면 예전처럼 상태 · 날짜만
  const payPatchOf = (row, status, date, keepAmount = false) => (row
    ? { ...payLedgerPlan(row, { status, date, keepAmount, vatRate: isInvoiceRow(row) ? PAY_VAT_RATE : 0 }, todayStr9()).patch, __system: true }
    : { 지급상태: status, 지급일: date, __system: true });
  // 💸 2026-11-27 출금 통장 — 자금관리에 '기사운임 지급' 기본 통장이 없으면 지급완료 때 고르게 한다(고른 통장은 기본 통장으로 정해 둠)
  //  → { fundId, label } · 취소하면 null. 통장 목록을 못 읽는 계정이면 빈칸(장부에만 기록)
  const askPayFund = async () => {
    const info = await payFundInfo(db, companyName, "drvpay");
    if (info.def) return { fundId: info.def.id, label: info.def.name || "기본 통장" };
    if (!info.readable) return { fundId: "", label: "정해지지 않음(통장 잔액엔 반영 안 돼요)" };
    if (!info.funds.length) {
      const go = await kpConfirm("기사운임을 내보낼 통장이 아직 없어요.\n이대로 지급완료하면 장부에만 기록되고 통장 잔액은 그대로예요.\n자금관리 › 통장 설정에서 통장을 등록하고 ‘기사운임 지급’ 기본 통장으로 정해 주세요.", { title: "출금 통장 없음", okText: "통장 없이 기록", cancelText: "취소" });
      return go ? { fundId: "", label: "없음(통장 잔액엔 반영 안 돼요)" } : null;
    }
    const NONE = "__none__";
    const v = await kpChoose("기사운임을 어느 통장에서 보냈나요?\n고른 통장이 ‘기사운임 지급’ 기본 통장으로 정해져서 다음부터는 묻지 않아요(자금관리 › 통장 설정에서 바꿀 수 있어요).", [
      ...info.funds.map((f) => ({ value: f.id, label: f.name || f.bank || "통장", sub: [f.bank, f.number ? `끝자리 ${String(f.number).slice(-4)}` : ""].filter(Boolean).join(" · ") })),
      { value: NONE, label: "통장 없이 기록", sub: "장부에만 남고 통장 잔액은 그대로예요" },
    ], { title: "출금 통장 고르기", okText: "이 통장으로" });
    if (v == null) return null;
    if (v === NONE) return { fundId: "", label: "없음(통장 잔액엔 반영 안 돼요)" };
    const f = info.funds.find((x) => x.id === v);
    await setPayFundDefault(db, v, "drvpay");
    return { fundId: v, label: f?.name || "고른 통장" };
  };
  // 💸 2026-11-27 지급완료 확인 문구 — 이체 합계(부가세 포함 여부) · 지급일 · 출금 통장
  const payConfirmText = (rows, date, fund) => {
    const t = rows.reduce((a, r) => { const x = payTransferOf(r, isInvoiceRow(r)); return { supply: a.supply + x.supply, vat: a.vat + x.vat, inv: a.inv + (x.vat ? 1 : 0) }; }, { supply: 0, vat: 0, inv: 0 });
    return [
      `이체 합계 ${won(t.supply + t.vat)}원`,
      t.vat ? `기사운임 ${won(t.supply)}원 + 부가세 ${won(t.vat)}원(세금계산서 받는 기사 ${t.inv}건)` : `기사운임 ${won(t.supply)}원(부가세 없음)`,
      `지급일 ${date} · 출금 통장 ${fund.label}`,
      "수입·지출 장부에 지출로 기록돼요.",
    ].join("\n");
  };
  // 지급일만 고치기(지급완료 상태 그대로)
  const changePayDate = async (row, d) => {
    if (!patchDispatch || !row || !d || d === (row.지급일 || "")) return;
    if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return; // ✅ 2026-11-23 지급일 바꾸기 전에 한 번 묻기
    await patchDispatch(row._id, payPatchOf(row, "지급완료", d, true));
    syncPayLedger(row, "지급완료", d, { keepAmount: true });
  };
  const pay = async (id, status, fundId = "") => {
    if (!patchDispatch) return alert("저장 기능이 연결되지 않아 처리할 수 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.");
    const row = (dispatchData || []).find((r) => r._id === id);
    const date = status === "지급완료" ? (selectedPayDate || todayStr9()) : "";
    if (row && (row.지급상태 || "지급중") === status && (row.지급일 || "") === date) return; // 바뀐 게 없으면 장부도 그대로
    await patchDispatch(id, payPatchOf(row, status, date));
    syncPayLedger(row, status, date, { fundId });
  };
  // 💸 지급 후 운임 변경 — [추가 지급]/[환수 처리]: 차액만 조정 한 줄로(같은 오더는 한 줄 · 누적 금액이라 두 번 눌러도 같은 값)
  const settleGap = async (row) => {
    if (!patchDispatch || !row) return;
    const plan = settleGapPlan(row, todayStr9());
    if (!plan) return;
    const who = `${row.이름 || "기사"}${row.차량번호 ? ` (${row.차량번호})` : ""}`;
    const plus = plan.gap > 0;
    const gapVat = paidVatOf(row) ? Math.round(Math.abs(plan.gap) * PAY_VAT_RATE) : 0; // 💸 2026-11-27 부가세 포함 이체한 오더면 차액도 부가세 포함
    const gapTxt = `${won(Math.abs(plan.gap) + gapVat)}원${gapVat ? `(차액 ${won(Math.abs(plan.gap))} + 부가세 ${won(gapVat)})` : ""}`;
    if (!(await kpConfirm(`${plus ? "추가 지급" : "환수 처리"}할까요?\n${who} · ${row.상차일 || ""}\n지급한 돈 ${won(toInt(row.기사운임) - plan.gap)}원 → 지금 기사운임 ${won(row.기사운임)}원\n${plus ? `${gapTxt}을 더 드린 것으로` : `${gapTxt}을 돌려받은 것으로`} 장부에 남겨요.\n장부 날짜 ${todayStr9()}`, { title: plus ? "추가 지급" : "환수 처리", okText: "네", cancelText: "취소" }))) return;
    await patchDispatch(row._id, { ...plan.patch, __system: true });
    setDriverPayAdjust(db, { orderId: row._id, amount: plan.adjAmount, vat: plan.adjVat, date: todayStr9(), company: companyName || row.companyName || "", who: row.이름 || "" }).catch(() => {});
  };

  const bulkPay = async (ids, status) => {
    if (!ids.length) return alert("처리할 건을 먼저 선택해 주세요.");
    let fund = { fundId: "" };
    if (status === "지급완료") {
      fund = await askPayFund(); if (!fund) return;
      const rows = ids.map((id) => (dispatchData || []).find((r) => r._id === id)).filter(Boolean);
      if (!(await kpConfirm(`${ids.length}건을 지급완료하시겠습니까?\n${payConfirmText(rows, selectedPayDate || todayStr9(), fund)}`, { title: "지급완료", okText: "네", cancelText: "취소" }))) return;
    } else if (!(await kpConfirm(`${ids.length}건을 ${status}하시겠습니까?`, { title: status, okText: "네", cancelText: "취소" }))) return;
    await runBulkTask({ count: ids.length, label: "오더", verb: status === "지급완료" ? "지급 처리" : `${status} 처리`, task: (progress) => { let k = 0; return Promise.all(ids.map(id => pay(id, status, fund.fundId).finally(() => progress(++k)))); } });
    setSelectedIds(new Set());
    alert(`${ids.length}건을 ${status} 처리했습니다.`);
  };

  // 기사 전체 미지급 일괄 지급
  const payAllByDriver = async (rows) => {
    const unpaid = rows.filter(r => (r.지급상태 || "지급중") !== "지급완료");
    if (!unpaid.length) return alert("미지급 건이 없습니다.");
    const unpaidSum = unpaid.reduce((s, r) => s + toInt(r.기사운임), 0);
    const fund = await askPayFund(); if (!fund) return;
    if (!(await kpConfirm(`${rows[0]?.이름 || "이 기사"}의 미지급 ${unpaid.length}건(기사운임 ${unpaidSum.toLocaleString()}원)을 지급완료 처리하시겠습니까?\n${payConfirmText(unpaid, selectedPayDate || todayStr9(), fund)}`, { title: "지급완료", okText: "지급완료", cancelText: "취소" }))) return;
    await runBulkTask({ count: unpaid.length, label: "오더", verb: "지급 처리", task: (progress) => { let k = 0; return Promise.all(unpaid.map(r => pay(r._id, "지급완료", fund.fundId).finally(() => progress(++k)))); } });
    alert(`${unpaid.length}건을 지급완료 처리했습니다.`);
  };

  // ─── 선택 ───
  const toggleAll = () => selectedIds.size === filtered.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(filtered.map(r => r._id)));
  const toggleOne = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ─── 엑셀 ───
  const downloadExcel = async () => {
    const XLSX = await loadXLSX(); // ⚡ 엑셀 라이브러리는 누를 때 받는다
    if (!filtered.length) return alert("다운로드할 내역이 없습니다.");
    const rows = filtered.map((r, i) => ({
      순번: i + 1, 상차일: r.상차일 || "", 지급상태: r.지급상태 || "지급중", 지급일: r.지급일 || "",
      거래처명: r.거래처명 || "", 상차지명: r.상차지명 || "", 하차지명: r.하차지명 || "",
      차량번호: r.차량번호 || "", 기사명: r.이름 || "", 전화번호: r.전화번호 || "",
      청구운임: toInt(r.청구운임), 기사운임: toInt(r.기사운임),
      수수료: toInt(r.청구운임) - toInt(r.기사운임) - paidOut(r), // 🏗 지게차
      수수료율: marginPctText(toInt(r.청구운임) - toInt(r.기사운임) - paidOut(r), toInt(r.청구운임)), // ⭐ 2026-11-17 매출 대비 %
      ...(fareRP.on ? { 운임구분: r.운임구분 || "" } : {}),
      지급방식: r.지급방식 || "", 배차방식: r.배차방식 || "", 메모: r.메모 || "",
      국세청승인번호: r.국세청승인번호 || "", 계산서일자: r.계산서일자 || "", // 💳 2026-11-20 선정산 파일 반영분
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "지급관리");
    XLSX.writeFile(wb, `지급관리_${loadStart}~${loadEnd}.xlsx`);
  };

  // ── 엑셀 업로드 매칭 ──
  const handlePayExcelUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const XLSX = await loadXLSX(); // ⚡ 엑셀 라이브러리는 누를 때 받는다
      try {
        // cellDates 없이 원본 시리얼로 읽어야 timezone 왜곡 없음
        const wb = XLSX.read(new Uint8Array(evt.target.result), { type: "array" });

        // 실제 헤더 행 찾기 (첫 행이 제목일 수 있어 동적으로 감지)
        const rawArr = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
        // 💳 2026-11-20 선정산 마감 파일(국세청승인번호 · 선정산 신청액 양식)은 상차일이 없다 → 계산서 날짜 · 금액으로 맞추는 창으로
        if (isPrepaySheet(rawArr)) {
          const items = parsePrepayRows(rawArr);
          if (!items.length) { alert("선정산 파일에 내용이 없어요."); return; }
          if (!driversReady) { alert("기사 목록을 불러오는 중이에요. 잠시 뒤 다시 올려 주세요."); return; }
          setPrepay({ fileName: file.name, items });
          return;
        }
        const headerRowIdx = rawArr.findIndex(row =>
          row.some(cell => ["차량번호", "차주이름", "상차일", "운송료"].includes(String(cell || "").trim()))
        );
        if (headerRowIdx === -1) {
          alert("헤더 행을 찾을 수 없습니다. (차량번호/차주이름/상차일 컬럼이 필요합니다)");
          return;
        }
        const headerRow = rawArr[headerRowIdx].map(h => String(h || "").trim());
        const dataRows = rawArr.slice(headerRowIdx + 1);

        const norm = (s) => String(s || "").replace(/[\s\-]/g, "").toLowerCase();
        const toDateStr = (v) => {
          if (!v && v !== 0) return "";
          if (v instanceof Date) {
            const y = v.getFullYear();
            const mo = String(v.getMonth() + 1).padStart(2, "0");
            const d = String(v.getDate()).padStart(2, "0");
            return `${y}-${mo}-${d}`;
          }
          if (typeof v === "number" && v > 40000) {
            const n = Math.floor(v);
            const d = XLSX.SSF.parse_date_code(n);
            if (d) return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
          }
          const s = String(v).trim();
          const m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
          if (m) return `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;
          return s.slice(0, 10);
        };
        const toDateTimeFull = (v) => {
          if (!v) return "";
          if (v instanceof Date) return v.toLocaleString("ko-KR");
          return String(v);
        };

        // 헤더 인덱스로 컬럼 찾기 (정확 매칭 우선, 부분 포함 fallback)
        const colIdx = (...names) => {
          for (const n of names) {
            const i = headerRow.indexOf(n);
            if (i !== -1) return i;
          }
          for (const n of names) {
            const i = headerRow.findIndex(h => h.includes(n));
            if (i !== -1) return i;
          }
          return -1;
        };

        const idxPlate = colIdx("차량번호", "차량");
        const idxName = colIdx("차주이름", "기사명", "이름", "차주");
        const idxDate = colIdx("상차일", "상차일자", "오더일자", "오더일");
        const idxPayDate = colIdx("정산처리일시", "지급일", "지급일자");
        const idxAmt = colIdx("운송료", "기사운임", "운임", "금액");
        const idxInsurance = colIdx("산재보험료 차주분", "산재보험료", "산재");

        const matched = [];
        const unmatched = [];
        const debugKeys = headerRow.slice();

        dataRows.forEach((rowArr, idx) => {
          const getByIdx = (i) => (i !== -1 ? rowArr[i] : undefined);

          const excelPlateRaw = String(getByIdx(idxPlate) || "");
          const excelNameRaw = String(getByIdx(idxName) || "");
          const excelPlate = norm(excelPlateRaw);
          const excelName = norm(excelNameRaw);

          const rawDate = getByIdx(idxDate) ?? "";
          const excelDate = toDateStr(rawDate);

          const excelPayRaw = getByIdx(idxPayDate) ?? "";
          const excelPayDate = toDateStr(excelPayRaw);
          const excelPayDateTimeFull = toDateTimeFull(excelPayRaw);
          const excelAmt = toInt(getByIdx(idxAmt) || 0);
          const excelInsurance = toInt(getByIdx(idxInsurance) || 0);

          if (!excelPlate && !excelName) return; // 빈 행 스킵

          // 동일 기사/날짜로 배차 레코드 검색
          const sameDriverSameDay = base.filter(r => {
            const plateMatch = excelPlate && norm(r.차량번호).includes(excelPlate);
            const nameMatch = excelName && norm(r.이름).includes(excelName);
            const dateMatch = excelDate && (r.상차일 || "").startsWith(excelDate);
            return dateMatch && (plateMatch || nameMatch);
          });

          if (sameDriverSameDay.length === 1) {
            // 1:1 매칭
            const found = sameDriverSameDay[0];
            const amtMatch = excelAmt === 0 || Math.abs(excelAmt - toInt(found.기사운임)) < 1000;
            matched.push({
              excelRow: headerRowIdx + idx + 2,
              dispatch: found, isSumMatch: false,
              excelDate, excelPayDate, excelPayDateTimeFull,
              excelAmt, amtMatch, excelInsurance,
              차량번호: excelPlateRaw, 기사명: excelNameRaw, 운송료: excelAmt, 지급일: excelPayDate,
            });
          } else if (sameDriverSameDay.length >= 2) {
            // 합산 매칭 시도: 여러 오더를 한 건 계산서로 발행한 경우
            const sumAmt = sameDriverSameDay.reduce((s, r) => s + toInt(r.기사운임), 0);
            if (excelAmt === 0 || Math.abs(excelAmt - sumAmt) < 1000) {
              matched.push({
                excelRow: headerRowIdx + idx + 2,
                dispatch: sameDriverSameDay[0], isSumMatch: true,
                sumRecords: sameDriverSameDay, sumTotal: sumAmt,
                excelDate, excelPayDate, excelPayDateTimeFull,
                excelAmt, amtMatch: true, excelInsurance,
                차량번호: excelPlateRaw, 기사명: excelNameRaw, 운송료: excelAmt, 지급일: excelPayDate,
              });
            } else {
              unmatched.push({
                excelRow: headerRowIdx + idx + 2,
                차량번호: excelPlateRaw, 기사명: excelNameRaw, 상차일: excelDate || String(rawDate), 운송료: excelAmt,
                사유: `합산불일치 (${sameDriverSameDay.length}건 합계 ${sumAmt.toLocaleString()}원 ≠ 엑셀 ${excelAmt.toLocaleString()}원)`,
              });
            }
          } else {
            const 사유 = !excelDate
              ? `상차일 없음 (원본값: "${String(rawDate)}")`
              : !excelPlate && !excelName
              ? "차량번호/기사명 없음"
              : "배차 데이터 없음 (차량번호/이름+날짜 불일치)";
            unmatched.push({ excelRow: headerRowIdx + idx + 2, 차량번호: excelPlateRaw, 기사명: excelNameRaw, 상차일: excelDate || String(rawDate), 운송료: excelAmt, 사유 });
          }
        });
        setPayExcelPreview({ matched, unmatched, debugKeys });
        setPayExcelOpen(true);
      } catch (err) {
        alert("엑셀 파싱 오류: " + err.message);
      } finally { e.target.value = ""; }
    };
    reader.readAsArrayBuffer(file);
  };

  // 🏦 2026-11-20 용차 정산계좌(기사관리) — 기사별 집계 · 대량이체 엑셀
  const payDriverByPlate = useMemo(() => {
    const m = new Map();
    (payDrivers || []).forEach((d) => { const k = prepayPlate(d.차량번호 || d.carNo || ""); if (k && !m.has(k)) m.set(k, d); });
    return m;
  }, [payDrivers]);
  const acctOf = (plate) => { const a = payDriverByPlate.get(prepayPlate(plate))?.정산계좌; return a && typeof a === "object" && a.acct ? a : null; };
  // 🏦 대량이체 — 확인 문구 대신 게시판(표) 미리보기 창 → [엑셀 받기]
  const [transferPlan, setTransferPlan] = useState(null); // { period, plan }
  const exportTransfer = () => {
    if (!searched) return alert("기간을 정하고 조회한 뒤에 받아 주세요.");
    const period = loadStart && loadEnd ? `${loadStart.slice(5).replace("-", "/")}~${loadEnd.slice(5).replace("-", "/")}` : "";
    const plan = yongchaTransferRows(driverSummary, payDriverByPlate, { period, payer: getTenant() || companyName, vatRate });
    if (!plan.rows.length && !plan.missingDetail.length) return alert("이 기간에 지급할(미지급) 용차 운임이 없어요.");
    setTransferPlan({ period, plan });
  };
  const downloadTransfer = async (plan) => {
    const XLSX = await loadXLSX(); // ⚡ 엑셀 라이브러리는 누를 때 받는다
    const { rows } = plan;
    const ws = XLSX.utils.json_to_sheet(rows, { header: ["은행", "계좌번호", "예금주", "금액", "받는분 통장표시", "내 통장표시", "메모"] });
    ws["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 40 }];
    rows.forEach((_, i) => { const c = ws[XLSX.utils.encode_cell({ r: i + 1, c: 1 })]; if (c) { c.t = "s"; c.v = String(c.v); } }); // 계좌번호 앞자리 0 보존
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "대량이체");
    XLSX.writeFile(wb, `용차지급_이체_${loadStart || ""}_${loadEnd || ""}.xlsx`);
  };

  const confirmPayExcel = async () => {
    if (!payExcelPreview?.matched?.length) return;
    setPayExcelConfirming(true);
    try {
      let dispatchCount = 0;
      let totalAmt = 0;
      const _n = payExcelPreview.matched.reduce((n, m) => n + (m.isSumMatch ? m.sumRecords.length : 1), 0);
      await runBulkTask({ count: _n, label: "오더", verb: "지급 처리", task: async (progress) => {
      for (const m of payExcelPreview.matched) {
        const payDay = m.지급일 || selectedPayDate;
        const patchOf = (r) => ({ ...payPatchOf(r, "지급완료", payDay), ...(m.excelInsurance > 0 ? { 산재보험료: m.excelInsurance } : {}) }); // 💸 지급액도 같이
        if (m.isSumMatch) {
          for (const r of m.sumRecords) { await patchDispatch(r._id, patchOf(r)); syncPayLedger(r, "지급완료", payDay); dispatchCount++; }
        } else {
          await patchDispatch(m.dispatch._id, patchOf(m.dispatch)); syncPayLedger(m.dispatch, "지급완료", payDay); dispatchCount++;
        }
        totalAmt += m.excelAmt || 0;
        progress(dispatchCount);
      }
      } });
      setPayExcelPreview(null);
      setPayExcelDone({ excelCount: payExcelPreview.matched.length, dispatchCount, totalAmt });
    } catch (err) {
      alert("처리 중 오류: " + err.message);
    } finally { setPayExcelConfirming(false); }
  };


  return (
    <div className="kp-settle space-y-4">{/* ⭐ 2026-11-05 용차지급 — 정산 화면 글씨 크게(index.css kp-settle) */}

      {/* ── 헤더(네이비 히어로) ── */}
      <div className="relative overflow-hidden rounded-[22px] px-6 py-5 text-white flex items-center justify-between gap-4 flex-wrap"
        style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div>
          <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>SETTLEMENT · PAYOUT</div>
          <h2 className="text-[22px] font-black"><EditableText id="payment.title2" defaultText="용차지급관리" /></h2>
          <p className="text-[12.5px] text-white/60"><EditableText id="payment.subtitle" defaultText="배차완료 오더의 기사운임 지급 현황 관리" /></p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <PaymentDateRuleChip companyName={companyName} canEdit={canEditPayDay} />
          {payNoticeBeta && <PayNoticeToggle company={getTenant() || companyName} />}
          <div className="flex items-center gap-1.5 rounded-xl px-3 h-10 bg-white/10 border border-white/20 text-[12px]">
            <span className="text-white/70 font-bold">산재보험료율</span>
            <input autoComplete="off" type="number" min={0} max={10} step={0.01}
              className="w-16 rounded-lg px-2 py-1 text-[12.5px] text-center outline-none bg-white text-[#0F1A30] font-black"
              value={insuranceRate} onChange={e => setInsuranceRate(Number(e.target.value))} />
            <span className="text-white/70">%</span>
          </div>
          {!mobile && <label className="h-10 px-4 rounded-xl bg-white/10 border border-white/20 text-white text-[13px] font-black hover:bg-white/15 transition cursor-pointer inline-flex items-center">
            지급 매칭 업로드
            <input autoComplete="off" type="file" accept=".xlsx,.xls" className="hidden" onChange={handlePayExcelUpload} />
          </label>} {/* ⭐ 2026-11-03 모바일에서는 지급 매칭 업로드 없음 */}
          {!mobile && <button type="button" onClick={exportTransfer} title="기사별 미지급 합계를 은행 대량이체 양식(은행 · 계좌번호 · 예금주 · 금액 · 통장표시)으로 받아요. 계좌는 기사관리 정산계좌를 써요." className="h-10 px-4 rounded-xl bg-white/10 border border-white/20 text-white text-[13px] font-black hover:bg-white/15 transition">대량이체 엑셀</button>}
          <button onClick={downloadExcel} className="h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[13px] font-black hover:brightness-95 transition"><EditableText id="misc.btn.52296.엑셀 다운로드" defaultText="엑셀 다운로드" /></button>
        </div>
      </div>

      {/* ── KPI 카드(네이비) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "총 건수", en: "COUNT", val: `${kpi.cnt}건` },
          { label: "총 청구운임", en: "BILLED", val: `${won(kpi.sale)}원` },
          { label: "총 기사운임", en: "DRIVER FARE", val: `${won(kpi.driver)}원` },
          { label: "부가세(10%)", en: "VAT", val: `${won(kpi.vatTotal)}원` },
          { label: `산재보험료(${insuranceRate}%)`, en: "INSURANCE", val: `${won(kpi.insuranceTotal)}원` },
          { label: "지급완료", en: "PAID", val: `${kpi.done}건` },
          { label: "미지급 금액", en: "UNPAID", val: `${won(kpi.undoneAmt)}원`, hot: true },
        ].map(({ label, en, val, hot }) => (
          <div key={label} className={`rounded-2xl p-4 border ${hot ? "bg-[#0F1A30] border-[#0F1A30]" : "bg-white border-[#E3E8F0]"}`}>
            <div className={`text-[9.5px] font-extrabold tracking-[0.22em] ${hot ? "text-[#8FB0F0]" : "text-[#9AA9C3]"}`} style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>{en}</div>
            <div className={`text-[11.5px] font-bold ${hot ? "text-white/70" : "text-[#5B6B85]"}`}>{label}</div>
            <div className={`text-[16px] font-black tabular-nums ${hot ? "text-white" : "text-[#0F1A30]"}`} style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>{val}</div>
          </div>
        ))}
      </div>

      {/* ── 탭 ── */}
      <div className="flex gap-2 border-b border-gray-200 pb-0">
        {[["list", "전체 목록"], ["driver", "기사별 집계"]].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-5 py-2.5 text-[13px] font-bold rounded-t-lg transition -mb-px ${activeTab === key ? "bg-[#1B2B4B] text-white" : "text-gray-500 hover:text-[#1B2B4B]"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── 필터 바 ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* 빠른 기간 */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-500">조회 기간</label>
            <div className="flex gap-1">
              <button onClick={setThisMonth} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-[12px] font-semibold hover:bg-gray-200 transition"><EditableText id="misc.btn.52335.이번달" defaultText="이번달" /></button>
              <button onClick={setLastMonth} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-[12px] font-semibold hover:bg-gray-200 transition"><EditableText id="misc.btn.52336.지난달" defaultText="지난달" /></button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-500">상차일</label>
            <div className="flex items-center gap-1">
              <CustomDatePicker className="border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-[#1B2B4B]" value={loadStart} onChange={e => setLoadStart(e.target.value)} />
              <span className="text-gray-500 text-[12px]">~</span>
              <CustomDatePicker className="border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-[#1B2B4B]" value={loadEnd} onChange={e => setLoadEnd(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-500">지급상태</label>
            <CustomSelect className="border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-[#1B2B4B]" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="전체">전체</option>
              <option value="지급중">미지급</option>
              <option value="지급완료">지급완료</option>
            </CustomSelect>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-500">지급방식</label>
            <CompanyOptionPicker optKey="지급방식" noneValue="전체" placeholder="전체" noneLabel="전체" className="min-w-[96px] border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] bg-white outline-none focus:border-[#1B2B4B]" value={payMethodFilter} onChange={(v) => setPayMethodFilter(v || "전체")} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-500">배차방식</label>
            <CompanyOptionPicker optKey="배차방식" noneValue="전체" placeholder="전체" noneLabel="전체" className="min-w-[96px] border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] bg-white outline-none focus:border-[#1B2B4B]" value={dispatchMethodFilter} onChange={(v) => setDispatchMethodFilter(v || "전체")} />
          </div>
          <input autoComplete="off" placeholder="차량번호" className="border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] w-28 outline-none focus:border-[#1B2B4B]" value={carNoQ} onChange={e => setCarNoQ(e.target.value)} />
          <input autoComplete="off" placeholder="기사명" className="border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] w-24 outline-none focus:border-[#1B2B4B]" value={nameQ} onChange={e => setNameQ(e.target.value)} />
          <input autoComplete="off" placeholder="거래처명" className="border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] w-28 outline-none focus:border-[#1B2B4B]" value={clientQ} onChange={e => setClientQ(e.target.value)} />
          <button onClick={() => setSearched(true)}
            className="px-4 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-bold hover:bg-[#243a60] transition"><EditableText id="misc.btn.52373.조회" defaultText="조회" /></button>
          <button onClick={() => { setStatusFilter("전체"); setPayMethodFilter("전체"); setDispatchMethodFilter("전체"); setCarNoQ(""); setNameQ(""); setClientQ(""); setSearched(false); }}
            className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-[12px] font-semibold hover:bg-gray-200 transition"><EditableText id="misc.btn.52375.초기화" defaultText="초기화" /></button>

          {/* 우측 */}
          <div className="ml-auto flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-500">지급일(적용)</label>
              <CustomDatePicker className="border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-[#1B2B4B]" value={selectedPayDate} onChange={e => setSelectedPayDate(e.target.value)} />
            </div>
            <button onClick={() => bulkPay(Array.from(selectedIds), "지급완료")} disabled={!selectedIds.size}
              className={`px-4 py-2 rounded-lg text-[13px] font-bold text-white transition ${selectedIds.size ? "bg-[#0F1A30] hover:bg-[#1B2B4B]" : "bg-gray-200 text-gray-500 cursor-not-allowed"}`}>
              선택 지급완료
            </button>
            <button onClick={() => bulkPay(Array.from(selectedIds), "지급중")} disabled={!selectedIds.size}
              className={`px-4 py-2 rounded-lg text-[13px] font-bold text-white transition ${selectedIds.size ? "bg-[#2D4C82] hover:bg-[#1B2B4B]" : "bg-gray-200 text-gray-500 cursor-not-allowed"}`}>
              선택 미지급
            </button>
            <button onClick={() => bulkPay(filtered.filter(r => (r.지급상태 || "지급중") !== "지급완료").map(r => r._id), "지급완료")}
              className="px-4 py-2 rounded-lg bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition">
              미지급 전체 지급
            </button>
          </div>
        </div>

        {/* 선택 상태 */}
        {activeTab === "list" && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
            <input autoComplete="off" type="checkbox" onChange={toggleAll} checked={selectedIds.size > 0 && selectedIds.size === filtered.length} className="w-4 h-4" />
            <span className="text-[12px] text-gray-500">전체선택</span>
            {selectedIds.size > 0 && <span className="text-[12px] font-bold text-[#1B2B4B]">{selectedIds.size}건 선택됨</span>}
          </div>
        )}
      </div>

      {/* 💸 2026-11-25 지급 후 운임 변경 · 지급 후 취소 — 장부는 지급한 금액 그대로, 아래 표의 [추가 지급]/[환수 처리]/[지급 취소]로 맞춰요 */}
      {activeTab === "list" && (() => {
        const gapRows = filtered.filter((r) => payGapOf(r) !== 0);
        const cancelRows = filtered.filter((r) => isPaidThenCanceled(r));
        if (!gapRows.length && !cancelRows.length) return null;
        const gapSum = gapRows.reduce((a, r) => a + payGapOf(r), 0);
        return (
          <div className="rounded-xl border border-[#F5C98B] bg-[#FFF9F0] px-4 py-3 text-[12.5px] text-[#5C3A00] flex flex-wrap items-center gap-x-4 gap-y-1">
            {gapRows.length > 0 && <span><b>지급 후 운임 변경 {gapRows.length}건</b> · 차액 {gapSum > 0 ? "+" : ""}{won(gapSum)}원: 지급상태 칸의 [추가 지급]/[환수 처리]를 누르면 장부에 들어가요.</span>}
            {cancelRows.length > 0 && <span><b>지급 후 취소 {cancelRows.length}건</b>: 돈을 돌려받았다면 [✓ 지급완료]를 눌러 지급 취소해 주세요.</span>}
          </div>
        );
      })()}
      {/* ══ 전체 목록 탭 ══ */}
      {activeTab === "list" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-[#0B1428]">
                  {["", "순번", "상차일", "거래처명", "상차지", "하차지", "차량번호", "기사명", "전화번호", "청구운임", "기사운임", "부가세(10%)", `산재보험료(${insuranceRate}%)`, "수수료", "지급방식", "배차방식", "지급상태", "지급일", "국세청승인번호"].map((h, hi) => (
                    <SortTh key={h || "_chk"} k={h ? (hi === 12 ? "산재보험료" : h) : ""} sort={paySort.sort} onSort={paySort.toggle} className="px-3 py-3 text-white font-bold text-center whitespace-nowrap border-b border-white/10">{h ? <EditableText id={`settlement.table.header.${h}`} defaultText={h} /> : h}</SortTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!searched ? (
                  <tr><td colSpan={19} className="text-center py-20 text-gray-500 text-[13px]">이번달 / 지난달 버튼 또는 날짜를 설정하고 <b className="text-[#1B2B4B]">조회</b> 버튼을 눌러주세요.</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={19} className="text-center py-16 text-gray-500 text-[13px]">조회된 데이터가 없습니다.</td></tr>
                ) : paySorted.map((r, i) => {
                  const isDone = (r.지급상태 || "지급중") === "지급완료";
                  const fee = orderProfit(r); // ⭐ 2026-11-17 한 식(청구 − 기사 − 지게차·특수운임 회사 지급분)
                  return (
                    <tr key={r._id || i} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50/60"} hover:bg-[#EEF3FC]/40 transition`}>
                      <td className="px-3 py-2.5 text-center border-b border-gray-100">
                        <input autoComplete="off" type="checkbox" checked={selectedIds.has(r._id)} onChange={() => toggleOne(r._id)} className="w-4 h-4" />
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-500 border-b border-gray-100">{i + 1}</td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap border-b border-gray-100">{r.상차일 || ""}</td>
                      <td className="px-3 py-2.5 text-center font-semibold border-b border-gray-100">{r.거래처명 || ""}</td>
                      <td className="px-3 py-2.5 text-center border-b border-gray-100">{r.상차지명 || ""}</td>
                      <td className="px-3 py-2.5 text-center border-b border-gray-100">{r.하차지명 || ""}</td>
                      <td className="px-3 py-2.5 text-center border-b border-gray-100">{r.차량번호 || ""}</td>
                      <td className="px-3 py-2.5 text-center border-b border-gray-100">{r.이름 || ""}</td>
                      <td className="px-3 py-2.5 text-center border-b border-gray-100">{r.전화번호 || ""}</td>
                      <td className="px-3 py-2.5 text-right border-b border-gray-100">{won(r.청구운임)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b border-gray-100">{won(r.기사운임)}</td>
                      <td className="px-3 py-2.5 text-right text-[#2D4C82] font-semibold border-b border-gray-100">{won(Math.round(toInt(r.기사운임) * vatRate))}</td>
                      <td className="px-3 py-2.5 text-right text-[#1B2B4B] font-semibold border-b border-gray-100">{won(Math.round(toInt(r.기사운임) * insuranceRate / 100))}</td>
                      <td className={`px-3 py-2.5 text-right font-bold border-b border-gray-100 ${profitCls(fee, "text-[#0B1428]")}`}>{won(fee)}<MarginPct profit={fee} sales={toInt(r.청구운임)} /></td>{/* ⭐ 2026-11-17 수수료 옆 매출(청구운임) 대비 % */}
                      <td className="px-3 py-2.5 text-center border-b border-gray-100">{r.지급방식 || ""}</td>
                      <td className="px-3 py-2.5 text-center border-b border-gray-100">{r.배차방식 || ""}</td>
                      <td className="px-3 py-2.5 text-center border-b border-gray-100">
                        <button data-pay-toggle onClick={async () => {
                          // 💳 2026-11-11 화면 가운데 확인 창 — Enter · [네] = 바로 적용, Esc · [취소] = 닫기
                          const who = `${r.이름 || "기사"}${r.차량번호 ? ` (${r.차량번호})` : ""}`;
                          const fund = isDone ? { fundId: "" } : await askPayFund(); // 💸 2026-11-27 출금 통장(기본 통장이 없으면 고르기)
                          if (!fund) return;
                          const ok = isDone
                            ? await kpConfirm(`지급완료를 취소하시겠습니까?\n${who} · ${won(toInt(r.기사운임) - payGapOf(r) + paidVatOf(r))}원 → 미지급으로 돌립니다`, { title: "지급 취소", okText: "네", cancelText: "취소", danger: true })
                            : await kpConfirm(`지급완료하시겠습니까?\n${who} · ${r.상차일 || ""} ${r.상차지명 || ""} → ${r.하차지명 || ""}\n${payConfirmText([r], selectedPayDate || todayStr9(), fund)}`, { title: "지급완료", okText: "네", cancelText: "취소" });
                          if (ok) pay(r._id, isDone ? "지급중" : "지급완료", fund.fundId);
                        }}
                          className={`px-3 py-1 rounded-lg text-[11px] font-bold text-white transition ${isDone ? "bg-[#0F1A30] hover:bg-[#1B2B4B]" : "bg-[#2D4C82] hover:bg-[#1B2B4B]"}`}>
                          {isDone ? "✓ 지급완료" : "미지급"}
                        </button>
                        {/* 💸 2026-11-25 지급 뒤 운임이 바뀌었거나 취소된 오더 — 장부는 그대로, 차액은 직접 처리 */}
                        {isDone && payGapOf(r) !== 0 && (
                          <div className="mt-1 flex flex-col items-center gap-1">
                            <span className="px-1.5 py-0.5 rounded-md bg-[#FFF4E5] border border-[#F5C98B] text-[#8A4B00] text-[10.5px] font-bold whitespace-nowrap" title={`지급한 돈 ${won(toInt(r.기사운임) - payGapOf(r))}원 · 지금 기사운임 ${won(r.기사운임)}원`}>지급 후 운임 변경 {payGapOf(r) > 0 ? "+" : ""}{won(payGapOf(r))}원</span>
                            <button type="button" onClick={() => settleGap(r)} className="px-2 py-0.5 rounded-md border border-[#C9D6EE] bg-white text-[#1B2B4B] text-[10.5px] font-bold hover:bg-[#EEF3FC] whitespace-nowrap">{payGapOf(r) > 0 ? "추가 지급" : "환수 처리"}</button>
                          </div>
                        )}
                        {isPaidThenCanceled(r) && (
                          <div className="mt-1"><span className="px-1.5 py-0.5 rounded-md bg-[#FDECEC] border border-[#F1B8B8] text-[#9B1C1C] text-[10.5px] font-bold whitespace-nowrap" title={`취소일 ${r.지급후취소?.at || "-"} · 돈을 돌려받았다면 [지급 취소]를 눌러 주세요`}>지급 후 취소{r.지급후취소?.이름 ? ` · ${r.지급후취소.이름}` : ""}</span></div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-500 border-b border-gray-100">
                        {/* 💳 2026-11-11 지급완료한 뒤에도 지급일을 고칠 수 있다(직접 입력 · 달력) — 장부의 지급 합계도 그 날짜로 옮긴다 */}
                        {payNoticeBeta && (r.지급상태 || "지급중") === "지급완료"
                          ? <DateField value={r.지급일 || ""} width={140} onChange={(d) => changePayDate(r, d)} />
                          : (r.지급일 || "-")}
                      </td>
                      {/* 💳 2026-11-20 선정산 파일로 지급한 오더 — 세금계산서 국세청승인번호(앞 8자리 = 계산서 작성일) */}
                      <td className="px-3 py-2.5 text-center text-gray-500 border-b border-gray-100 whitespace-nowrap text-[11px]" title={r.계산서일자 ? `계산서 작성일 ${r.계산서일자}` : undefined}>{r.국세청승인번호 || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
              {/* 합계 행 */}
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-[#0B1428]">
                    <td colSpan={9} className="px-3 py-3 text-white font-bold text-center">합 계 ({filtered.length}건)</td>
                    <td className="px-3 py-3 text-right text-white font-bold">{won(kpi.sale)}</td>
                    <td className="px-3 py-3 text-right text-yellow-300 font-bold">{won(kpi.driver)}</td>
                    <td className="px-3 py-3 text-right text-[#8FB0F0] font-bold">{won(kpi.vatTotal)}</td>
                    <td className="px-3 py-3 text-right text-[#8FB0F0] font-bold">{won(kpi.insuranceTotal)}</td>
                    <td className={`px-3 py-3 text-right font-bold ${kpi.fee > 0 ? "text-[#FF8A8E]" : kpi.fee < 0 ? "text-[#8FB0F0]" : "text-white"}`}>{won(kpi.fee)}<MarginPct dark profit={kpi.fee} sales={kpi.sale} /></td>{/* ⭐ 2026-11-17 수수료 합계 — 플러스 빨강 · 마이너스 파랑 */}
                    <td colSpan={5} className="px-3 py-3 text-center text-white/60 text-[11px]">
                      지급완료 {kpi.done}건 / 미지급 {kpi.undone}건 (미지급액 {won(kpi.undoneAmt)}원)
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ══ 기사별 집계 탭 ══ */}
      {activeTab === "driver" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-[#0B1428]">
                  {["차량번호", "기사명", "전화번호", "정산계좌", "총 건수", "기사운임 합계", "지급완료", "미지급 건수", "미지급 금액", "일괄 지급"].map(h => (
                    <SortTh key={h} k={h === "일괄 지급" ? "" : h} sort={payDrvSort.sort} onSort={payDrvSort.toggle} className="px-3 py-3 text-white font-bold text-center whitespace-nowrap border-b border-white/10"><EditableText id={`settlement.byDriver.header.${h}`} defaultText={h} /></SortTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!searched ? (
                  <tr><td colSpan={10} className="text-center py-20 text-gray-500 text-[13px]">이번달 / 지난달 버튼 또는 날짜를 설정하고 <b className="text-[#1B2B4B]">조회</b> 버튼을 눌러주세요.</td></tr>
                ) : driverSummary.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-16 text-gray-500 text-[13px]">데이터가 없습니다.</td></tr>
                ) : payDrvSorted.map((d, i) => (
                  <tr key={d.차량번호} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50/60"} hover:bg-[#EEF3FC]/40 transition`}>
                    <td className="px-3 py-3 text-center border-b border-gray-100">{d.차량번호}</td>
                    <td className="px-3 py-3 text-center font-semibold border-b border-gray-100">{d.이름 || "-"}</td>
                    <td className="px-3 py-3 text-center border-b border-gray-100">{d.전화번호 || "-"}</td>
                    {/* 🏦 2026-11-20 기사관리 정산계좌 — 없으면 '미등록'(대량이체 엑셀에서 빠짐) */}
                    <td className="px-3 py-3 text-center border-b border-gray-100 whitespace-nowrap" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {acctOf(d.차량번호) ? <span title={acctOf(d.차량번호).holder ? `예금주 ${acctOf(d.차량번호).holder}` : undefined}><b className="text-[#1B2B4B]">{acctOf(d.차량번호).bank}</b> {fmtAcctByBank(acctOf(d.차량번호).bank, acctOf(d.차량번호).acct)}</span> : <span className="text-gray-400">미등록</span>}
                    </td>
                    <td className="px-3 py-3 text-center border-b border-gray-100">{d.cnt}건</td>
                    <td className="px-3 py-3 text-right font-bold text-[#1B2B4B] border-b border-gray-100">{won(d.기사운임합)}원</td>
                    <td className="px-3 py-3 text-center border-b border-gray-100">
                      <span className="px-2 py-0.5 rounded-full bg-[#EEF3FC] text-[#0F1A30] font-bold text-[11px]">{d.지급완료}건</span>
                    </td>
                    <td className="px-3 py-3 text-center border-b border-gray-100">
                      {d.미지급 > 0 ? <span className="px-2 py-0.5 rounded-full bg-[#F3F6FA] text-[#2D4C82] font-bold text-[11px]">{d.미지급}건</span> : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-bold border-b border-gray-100">
                      {d.미지급액 > 0 ? <span className="text-[#0B1428]">{won(d.미지급액)}원</span> : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-3 py-3 text-center border-b border-gray-100">
                      {d.미지급 > 0 ? (
                        <button onClick={() => payAllByDriver(d.rows)}
                          className="px-3 py-1.5 rounded-lg bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[11px] font-bold transition">
                          미지급 {d.미지급}건 지급
                        </button>
                      ) : (
                        <span className="text-[#0F1A30] font-bold text-[11px]">✓ 완료</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {driverSummary.length > 0 && (
                <tfoot>
                  <tr className="bg-[#0B1428]">
                    <td colSpan={4} className="px-3 py-3 text-white font-bold text-center">합 계 ({driverSummary.length}명)</td>
                    <td className="px-3 py-3 text-right text-yellow-300 font-bold">{won(kpi.driver)}원</td>
                    <td className="px-3 py-3 text-center text-[#8FB0F0] font-bold">{kpi.done}건</td>
                    <td className="px-3 py-3 text-center text-[#8FB0F0] font-bold">{kpi.undone}건</td>
                    <td className="px-3 py-3 text-right text-[#8FB0F0] font-bold">{won(kpi.undoneAmt)}원</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
      {/* ── 엑셀 업로드 미리보기 / 완료 모달 ── */}
      {transferPlan && <TransferPreviewModal period={transferPlan.period} plan={transferPlan.plan} onDownload={() => downloadTransfer(transferPlan.plan)} onClose={() => setTransferPlan(null)} />}
      {prepay && (
        <PrepayImportModal fileName={prepay.fileName} items={prepay.items} pool={base} allOrders={dispatchData} fleetPlates={fleetPlates}
          drivers={payDrivers || []} defaultPayDate={selectedPayDate} patchDispatch={patchDispatch}
          onPaid={(o, d) => syncPayLedger(o, "지급완료", d)} onClose={() => setPrepay(null)} />
      )}
      {payExcelOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[99999]">
          <div className="bg-white rounded-2xl shadow-2xl w-[860px] max-h-[90vh] flex flex-col overflow-hidden">

            {/* 완료 화면 */}
            {payExcelDone ? (
              <>
                <div className="bg-[#1B2B4B] px-6 py-4">
                  <div className="text-white font-bold text-[16px]">엑셀 지급완료 처리 결과</div>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center py-12 gap-4">
                  <div className="w-16 h-16 rounded-full bg-[#EEF3FC] flex items-center justify-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <div className="text-[18px] font-bold text-gray-800">지급완료 처리되었습니다</div>
                  <div className="text-[14px] text-gray-500 text-center leading-relaxed">
                    엑셀 {payExcelDone.excelCount}건 → 배차 {payExcelDone.dispatchCount}건 처리<br/>
                    총 금액: <span className="font-bold text-[#1B2B4B]">{payExcelDone.totalAmt.toLocaleString()}원</span>
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-gray-100">
                  <button onClick={() => { setPayExcelOpen(false); setPayExcelDone(null); }} className="w-full py-2.5 rounded-xl bg-[#1B2B4B] text-white font-bold text-[13px] hover:bg-[#243a60] transition">
                    확인
                  </button>
                </div>
              </>
            ) : payExcelPreview ? (
              <>
                <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
                  <div>
                    <div className="text-white font-bold text-[16px]">엑셀 업로드 매칭 결과</div>
                    <div className="text-white/60 text-[12px] mt-0.5">
                      매칭 {payExcelPreview.matched.length}건
                      {payExcelPreview.matched.some(m=>m.isSumMatch) && <span className="ml-1 text-[#8FB0F0]">(합산 {payExcelPreview.matched.filter(m=>m.isSumMatch).length}건 포함)</span>}
                      &nbsp;/ 미매칭 {payExcelPreview.unmatched.length}건
                    </div>
                  </div>
                  <button className="text-white/60 hover:text-white text-xl" onClick={() => { setPayExcelOpen(false); setPayExcelPreview(null); }}>×</button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* 1:1 매칭 */}
                  {payExcelPreview.matched.filter(m=>!m.isSumMatch).length > 0 && (
                    <div>
                      <div className="text-[13px] font-bold text-[#0F1A30] mb-2">
                        1:1 매칭 ({payExcelPreview.matched.filter(m=>!m.isSumMatch).length}건): 지급완료로 처리돼요
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[12px] border-collapse">
                          <thead>
                            <tr className="bg-[#EEF3FC]">
                              {["엑셀행","차량번호","기사명","상차일","운송료(엑셀)","기사운임(프로그램)","금액일치","산재보험료","지급일"].map(h=>(
                                <th key={h} className="px-3 py-2 text-center font-bold text-[#0F1A30] border border-[#8FB0F0]"><EditableText id={`settlement.match.header.${h}`} defaultText={h} /></th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {payExcelPreview.matched.filter(m=>!m.isSumMatch).map((m,i)=>(
                              <tr key={i} className={i%2===0?"bg-white":"bg-[#EEF3FC]/30"}>
                                <td className="px-3 py-2 text-center border border-gray-100 text-gray-500">{m.excelRow}</td>
                                <td className="px-3 py-2 text-center border border-gray-100">{m.차량번호}</td>
                                <td className="px-3 py-2 text-center border border-gray-100 font-semibold">{m.기사명}</td>
                                <td className="px-3 py-2 text-center border border-gray-100">{m.excelDate}</td>
                                <td className="px-3 py-2 text-right border border-gray-100">{won(m.운송료)}</td>
                                <td className="px-3 py-2 text-right border border-gray-100">{won(m.dispatch.기사운임)}</td>
                                <td className="px-3 py-2 text-center border border-gray-100">
                                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${m.amtMatch?"bg-[#EEF3FC] text-[#0F1A30]":"bg-[#F3F6FA] text-[#2D4C82]"}`}>
                                    {m.amtMatch?"일치":"차이있음"}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-right border border-gray-100">{m.excelInsurance>0?won(m.excelInsurance):"-"}</td>
                                <td className="px-3 py-2 text-center border border-gray-100">{m.지급일||selectedPayDate}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 합산 매칭 */}
                  {payExcelPreview.matched.filter(m=>m.isSumMatch).length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[13px] font-bold text-[#1B2B4B]">합산 매칭 ({payExcelPreview.matched.filter(m=>m.isSumMatch).length}건)</span>
                        <span className="px-2 py-0.5 bg-[#EEF3FC] text-[#1B2B4B] text-[11px] rounded-full font-semibold">오더 여러 건을 1장 계산서로 합산 지급</span>
                      </div>
                      <div className="space-y-3">
                        {payExcelPreview.matched.filter(m=>m.isSumMatch).map((m,i)=>(
                          <div key={i} className="border border-[#C9D6EE] rounded-lg overflow-hidden">
                            <div className="bg-[#EEF3FC] px-4 py-2 flex items-center justify-between">
                              <div className="text-[12px] font-bold text-[#0F1A30]">
                                {m.기사명} ({m.차량번호}) · {m.excelDate} · 엑셀: {won(m.excelAmt)}원 = {m.sumRecords.length}건 합산 ({won(m.sumTotal)}원)
                              </div>
                              <span className="px-2 py-0.5 bg-[#1B2B4B] text-white text-[11px] rounded-full font-bold">합산일치</span>
                            </div>
                            <table className="w-full text-[11px] border-collapse">
                              <thead>
                                <tr className="bg-gray-50">
                                  {["#","상차일","상차지","하차지","기사운임"].map(h=>(
                                    <th key={h} className="px-3 py-1.5 text-center font-semibold text-gray-500 border-b border-gray-200"><EditableText id={`settlement.matchDetail.header.${h}`} defaultText={h} /></th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {m.sumRecords.map((r,j)=>(
                                  <tr key={j} className="border-b border-gray-100">
                                    <td className="px-3 py-1.5 text-center text-gray-500">{j+1}</td>
                                    <td className="px-3 py-1.5 text-center">{r.상차일}</td>
                                    <td className="px-3 py-1.5 text-center">{r.상차지명||r.출발지||""}</td>
                                    <td className="px-3 py-1.5 text-center">{r.하차지명||r.도착지||""}</td>
                                    <td className="px-3 py-1.5 text-right font-semibold text-[#1B2B4B]">{won(r.기사운임)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {payExcelPreview.debugKeys && (
                    <div className="p-2 bg-gray-50 border border-gray-200 rounded text-[11px] text-gray-500">
                      <span className="font-bold text-gray-700">인식된 컬럼명: </span>{payExcelPreview.debugKeys.join(", ")}
                    </div>
                  )}

                  {/* 미매칭 */}
                  {payExcelPreview.unmatched.length > 0 && (
                    <div>
                      <div className="text-[13px] font-bold text-[#0B1428] mb-2">미매칭 ({payExcelPreview.unmatched.length}건): 처리되지 않아요</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[12px] border-collapse">
                          <thead>
                            <tr className="bg-[#F3F6FA]">
                              {["엑셀행","차량번호","기사명","상차일","운송료","미매칭 사유"].map(h=>(
                                <th key={h} className="px-3 py-2 text-center font-bold text-[#0B1428] border border-[#C9D6EE]"><EditableText id={`settlement.unmatched.header.${h}`} defaultText={h} /></th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {payExcelPreview.unmatched.map((m,i)=>(
                              <tr key={i} className={i%2===0?"bg-white":"bg-[#F3F6FA]/30"}>
                                <td className="px-3 py-2 text-center border border-gray-100 text-gray-500">{m.excelRow}</td>
                                <td className="px-3 py-2 text-center border border-gray-100">{m.차량번호}</td>
                                <td className="px-3 py-2 text-center border border-gray-100">{m.기사명}</td>
                                <td className="px-3 py-2 text-center border border-gray-100">{m.상차일}</td>
                                <td className="px-3 py-2 text-right border border-gray-100">{won(m.운송료)}</td>
                                <td className="px-3 py-2 text-center border border-gray-100 text-[#0B1428] text-[11px]">{m.사유}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
                  <button onClick={() => { setPayExcelOpen(false); setPayExcelPreview(null); }} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold text-[13px] hover:bg-gray-200"><EditableText id="misc.btn.52703.취소" defaultText="취소" /></button>
                  <button
                    disabled={!payExcelPreview.matched.length || payExcelConfirming}
                    onClick={confirmPayExcel}
                    className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white font-bold text-[13px] hover:bg-[#243a60] disabled:opacity-50 transition flex items-center justify-center gap-2"
                  >
                    {payExcelConfirming ? (
                      <>
                        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" /></svg>
                        처리 중...
                      </>
                    ) : `매칭된 ${payExcelPreview.matched.length}건 지급완료 처리`}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 11/11) — END =====================

// ===================== 회사 정보 관리 =====================
// ─────────── 결제일(계산서 발행 → 입금) 설정 섹션 ───────────
// ⭐ 2026-10-27 — 예전의 평일/금요일/주말 규칙(최대 14일)을 없애고 "계산서 발행 후 N일" 하나로 통일했다.
//    30일·60일처럼 회사가 직접 정한다. 기사업로드링크(UploadPage.jsx)의 "결제일 정보"가 이 값을 그대로 읽는다.
//    (예전 설정만 있는 회사는 평일 일수를 그대로 이어서 쓴다)
const payDaysOf = (rule) => Math.max(0, Number(rule?.payDays ?? rule?.weekdayDays ?? 3) || 0);
function PaymentDateRuleSection({ companyName }) {
  const [days, setDays] = React.useState("");
  const [loaded, setLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => {
    if (!companyName) return;
    const unsub = onSnapshot(doc(db, "companySettings", companyName.trim()), (snap) => {
      setDays(String(payDaysOf(snap.data()?.결제일규칙)));
      setLoaded(true);
    });
    return () => unsub();
  }, [companyName]);

  const handleSave = async () => {
    const n = Math.round(Number(days));
    if (!Number.isFinite(n) || n < 0 || n > 365) { setMsg("0~365 사이 숫자로 입력해 주세요."); return; }
    if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "companySettings", companyName.trim()), { 결제일규칙: { payDays: n } }, { merge: true });
      setMsg("저장되었습니다.");
      setTimeout(() => setMsg(""), 2500);
    } catch (e) {
      setMsg("저장 실패: " + e.message);
    }
    setSaving(false);
  };

  return (
    <div>
      <p className="text-[16px] font-black text-[#0F1A30] mb-1">결제일</p>
      <p className="text-[13.5px] text-gray-500 mb-5 leading-relaxed">
        계산서 발행일로부터 며칠 뒤에 입금하는지 정합니다. 기사 업로드 링크의 "결제일 정보"에 그대로 안내됩니다(주말이면 다음 월요일).
      </p>
      {!loaded ? <div className="text-[13px] text-gray-500">로딩 중...</div> : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-[14.5px] text-gray-800 font-semibold">계산서 발행 후</span>
            <input type="number" min={0} max={365} value={days} onChange={(e) => setDays(e.target.value.replace(/[^\d]/g, ""))}
              className="w-24 border border-gray-200 rounded-lg px-2.5 py-2 text-[16px] font-black text-center text-[#0F1A30] focus:outline-none focus:border-[#1B2B4B]" />
            <span className="text-[14.5px] text-gray-800 font-semibold">일 후 입금</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[3, 7, 15, 30, 45, 60, 90].map((n) => (
              <button key={n} type="button" onClick={() => setDays(String(n))}
                className={`h-8 px-3 rounded-lg text-[12.5px] font-bold border ${String(n) === days ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:border-[#1B2B4B]"}`}>{n}일</button>
            ))}
          </div>
          {msg && <div className="text-[12px] font-medium text-[#1B2B4B]">{msg}</div>}
          <button onClick={handleSave} disabled={saving}
            className="w-full py-3 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[14px] font-bold transition disabled:opacity-40">
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────── 결제일 칩(정산관리 › 지급관리 머리줄) ───────────
// ⭐ 2026-10-29 — 결제일은 "기사에게 언제 입금하나"를 정하는 지급 규칙이라 회사관리에서
//    지급관리로 옮겼다. 현재 값을 늘 보여주고, 관리자만 눌러서 바꾼다(저장 위치·형식은 그대로).
function PaymentDateRuleChip({ companyName, canEdit }) {
  const [days, setDays] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (!companyName) return;
    const unsub = onSnapshot(doc(db, "companySettings", companyName.trim()), (snap) => setDays(payDaysOf(snap.data()?.결제일규칙)), () => setDays(null));
    return () => unsub();
  }, [companyName]);
  return (
    <>
      <button type="button" onClick={() => canEdit && setOpen(true)} disabled={!canEdit}
        title={canEdit ? "결제일 설정" : "결제일 설정은 관리자만 변경할 수 있습니다"}
        className={`flex items-center gap-2 h-[34px] pl-2 pr-3 rounded-lg border text-[12px] bg-white ${canEdit ? "border-[#C9D4E6] hover:border-[#1B2B4B] cursor-pointer" : "border-gray-200 cursor-default"}`}>
        <span className="px-1.5 py-0.5 rounded-md bg-[#1B2B4B] text-white text-[10px] font-extrabold tracking-[0.12em]">PAYDAY</span>
        <span className="text-gray-500 font-semibold">결제일</span>
        <span className="font-black text-[#0F1A30]">{days == null ? "…" : `계산서 발행 후 ${days}일`}</span>
        {canEdit && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5B6B85" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>}
      </button>
      {open && (
        <div className="fixed inset-0 z-[99999] bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-[460px] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 bg-[#1B2B4B]">
              <div>
                <div className="text-[10px] font-extrabold tracking-[0.22em] text-[#8FB0F0]">PAYOUT RULE</div>
                <div className="text-white font-bold text-[15px]">결제일 설정</div>
              </div>
              <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="p-6"><PaymentDateRuleSection companyName={companyName} /></div>
          </div>
        </div>
      )}
    </>
  );
}
