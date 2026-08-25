// src/adminPlannerData.js
// ⭐ KP-Planner("나의 플래너") — 배차/오더 등 다른 어떤 화면·데이터와도 전혀
// 연관되지 않는 완전히 독립된 Firestore 컬렉션(adminPlanner)을 쓴다.
// PC(AdminPlanner.jsx)와 모바일(mobile/AdminPlannerMobile.jsx)이 이 모듈을
// 함께 사용해 동일한 데이터를 실시간으로 공유한다.
// ⚠️ 아래 함수들이 받는 companyName 파라미터/Firestore 필드는 이름만 그대로일 뿐,
// 실제로는 회사명이 아니라 planner/plannerAuth.js가 발급하는 "가족 코드"
// (groupId)가 들어온다 — 이 격리 키를 기준으로 데이터가 나뉜다.
import { useEffect, useState } from "react";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, serverTimestamp, setDoc, runTransaction, getDocs, getDoc,
} from "firebase/firestore";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { plannerDb as db, plannerAuth as fbAuth } from "./planner/plannerFirebase";
import { PLANNER_ACCOUNTS, randomGroupCode } from "./planner/plannerAuth";

export const PLANNER_COLLECTION = "adminPlanner";

// entry.type: "income" | "expense" | "schedule" | "familyBudget" | "budgetTarget" | "recurringTemplate"
export const PLANNER_TYPE_LABEL = {
  income: "수입",
  expense: "지출",
  schedule: "일정",
  familyBudget: "이벤트 예산",
  budgetTarget: "연간 총예산 목표",
  recurringTemplate: "정기 지출",
};

// ⭐ 수입/지출은 성격이 달라서 같은 분류 목록을 쓰면 어색하다("수입에 세금/공과금이
// 뜨는" 식) — 구분별로 어울리는 분류를 따로 둔다.
export const EXPENSE_CATEGORIES = ["생활비", "경조사", "명절", "세금/공과금", "보험", "여행", "자녀", "부모님", "기타"];
export const INCOME_CATEGORIES = ["급여", "부수입", "용돈", "상여금", "이자/배당", "환급/지원금", "경조사수입", "기타"];

// ⭐ "정기 지출/수입 자동등록"은 매달 반복되는 고정 지출/수입 성격이라, 위의
// 일반 내역 분류(경조사/명절/여행 등 일회성 성격)와는 어울리지 않는다는
// 피드백 — 구독료/보험료/통신비 등 실제로 매달 자동으로 나가는 항목 위주로
// 별도 분류 목록을 둔다(직접입력은 PlannerCategorySelect에서 그대로 가능).
export const RECURRING_EXPENSE_CATEGORIES = ["구독료", "보험료", "통신비", "월세/관리비", "대출/이자", "학원/교육비", "정기후원", "세금/공과금", "기타"];
export const RECURRING_INCOME_CATEGORIES = ["급여", "용돈", "부수입", "이자/배당", "연금", "기타"];

// ⭐ 사용자가 분류를 직접입력하면(기본 목록에 없는 값), 그 가족이 실제로 쓴
// entries에서 이미 저장돼 있는 값이므로 — 별도 저장 없이 entries에서 다시
// 뽑아내기만 해도 "계속 저장돼 있는" 효과가 난다. 기본 분류 + 그동안 실제로 쓴
// 분류(중복 제거)를 합쳐서 드롭다운에 보여준다.
export function mergeCategoryOptions(base, entries, entryType) {
  const used = new Set(
    (entries || [])
      .filter((e) => e.type === entryType || e.entryType === entryType)
      .map((e) => (e.category || "").trim())
      .filter(Boolean)
  );
  const extra = [...used].filter((c) => !base.includes(c));
  return [...base, ...extra];
}

export function usePlannerEntries(companyName) {
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!companyName) {
      setEntries([]);
      setLoaded(true);
      return;
    }
    const q = query(collection(db, PLANNER_COLLECTION), where("companyName", "==", companyName));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoaded(true);
      },
      () => setLoaded(true)
    );
    return () => unsub();
  }, [companyName]);

  return { entries, loaded };
}

export async function addPlannerEntry(data) {
  return addDoc(collection(db, PLANNER_COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updatePlannerEntry(id, patch) {
  return updateDoc(doc(db, PLANNER_COLLECTION, id), { ...patch, updatedAt: serverTimestamp() });
}

export async function deletePlannerEntry(id) {
  return deleteDoc(doc(db, PLANNER_COLLECTION, id));
}

// 연간 총예산 목표 — 연도당 budgetTarget 타입 문서 1개(없으면 새로 만들고, 있으면 갱신).
export async function upsertBudgetTarget({ companyName, year, amount, entries, actorName }) {
  const existing = (entries || []).find((e) => e.type === "budgetTarget" && String(e.year) === String(year));
  if (existing) {
    await updatePlannerEntry(existing.id, { amount: Number(amount) || 0, updatedByName: actorName || "" });
  } else {
    await addPlannerEntry({
      type: "budgetTarget",
      companyName,
      year: Number(year),
      amount: Number(amount) || 0,
      createdByName: actorName || "",
    });
  }
}

export function fmtWon(n) {
  const v = Number(n || 0);
  return `${v.toLocaleString("ko-KR")}원`;
}

export function todayStr() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ⭐ 금액 입력칸에 타이핑하는 동안 자동으로 천단위 콤마(,)가 보이게 한다.
// state에는 콤마 없는 순수 숫자 문자열을 저장하고, 화면에 보여줄 때만 콤마를 붙인다.
export function formatAmountInput(raw) {
  if (raw === "" || raw == null) return "";
  return Number(raw).toLocaleString("ko-KR");
}
export function parseAmountInput(displayValue) {
  return String(displayValue || "").replace(/[^0-9]/g, "");
}

// ⭐ 생일/기념일처럼 "매년 반복"되는 일정 — 저장된 날짜의 월/일만 쓰고, 연도는
// 매번 새로 계산한다. fromDateStr(기본 오늘) 기준으로 "돌아오는" 날짜를 구한다
// (이미 지난 올해 날짜면 내년으로 넘긴다).
export function nextOccurrence(dateStr, fromDateStr) {
  if (!dateStr) return dateStr;
  const from = fromDateStr || todayStr();
  const mmdd = dateStr.slice(5, 10);
  const fromYear = Number(from.slice(0, 4));
  let candidate = `${fromYear}-${mmdd}`;
  if (candidate < from) candidate = `${fromYear + 1}-${mmdd}`;
  return candidate;
}

// 달력에서 특정 연도에 매년 반복 일정이 표시될 날짜(그 해의 월/일)를 구한다.
export function recurringDateInYear(dateStr, year) {
  if (!dateStr) return dateStr;
  return `${year}-${dateStr.slice(5, 10)}`;
}

// ⭐ 예산 대비 지출 비율을 신용도/부채 현황 그래프처럼 "안정/다소 높음/높음/위험"
// 단계로 보여준다 — 퍼센트 숫자만 있는 것보다 한눈에 상태를 알아보기 쉽다.
export function budgetStatusLabel(pct) {
  if (pct >= 100) return { label: "위험", color: "#dc2626" };
  if (pct >= 90) return { label: "높음", color: "#f97316" };
  if (pct >= 70) return { label: "다소 높음", color: "#eab308" };
  return { label: "안정", color: "#22c55e" };
}

// ⭐ 일정 D-day 계산 — 오늘부터 며칠 남았는지. 지났으면 null.
export function dDayLabel(dateStr) {
  if (!dateStr) return null;
  const today = new Date(todayStr() + "T00:00:00");
  const target = new Date(dateStr + "T00:00:00");
  const diff = Math.round((target - today) / 86400000);
  if (diff < 0) return null;
  if (diff === 0) return "D-DAY";
  return `D-${diff}`;
}

// ────────────────────────────────────────────────
// 정기 지출(월세/보험료 등) 자동 반복 등록
// ────────────────────────────────────────────────
// recurringTemplate 문서: { type:"recurringTemplate", companyName, entryType:"expense"|"income",
//   title, category, amount, dayOfMonth, active, createdByName }
// 실제 내역은 companyName의 income/expense 문서로 생성되며, 템플릿에서 나온 것임을
// fromTemplateId + recurringMonth("YYYY-MM")로 표시해 같은 달에 중복 생성되지 않게 막는다.
export async function ensureRecurringInstances(companyName, entries, actorName) {
  if (!companyName) return;
  const templates = entries.filter((e) => e.type === "recurringTemplate" && e.active !== false);
  if (templates.length === 0) return;
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const already = new Set(
    entries.filter((e) => e.fromTemplateId && e.recurringMonth === ym).map((e) => e.fromTemplateId)
  );
  for (const t of templates) {
    if (already.has(t.id)) continue;
    const day = Math.min(Math.max(Number(t.dayOfMonth) || 1, 1), 28);
    const date = `${ym}-${String(day).padStart(2, "0")}`;
    await addPlannerEntry({
      type: t.entryType || "expense",
      companyName,
      title: t.title,
      category: t.category || "",
      amount: Number(t.amount) || 0,
      date,
      memo: "정기 지출 자동 등록",
      createdByName: actorName || "",
      fromTemplateId: t.id,
      recurringMonth: ym,
    });
  }
}

// ────────────────────────────────────────────────
// 영수증 사진 업로드 + OCR 금액 인식
// ────────────────────────────────────────────────
export async function uploadReceiptPhoto(groupId, file) {
  return compressToDataURL(file);
}

// 영수증 이미지에서 텍스트를 스캔하고, 가장 그럴듯한 "합계 금액"을 추정한다.
// tesseract.js는 무겁기 때문에 실제로 스캔이 실행될 때만 동적 import 한다.
export async function scanReceiptAmount(file) {
  const { default: Tesseract } = await import("tesseract.js");
  const { data } = await Tesseract.recognize(file, "kor+eng");
  const text = data?.text || "";
  return { text, amount: guessAmountFromReceiptText(text) };
}

export function guessAmountFromReceiptText(text) {
  if (!text) return null;
  const lines = text.split("\n");
  // "합계/총액/결제금액" 등의 줄과 그 근처에 있는 숫자를 우선한다.
  const totalKeywords = /(합\s*계|총\s*액|결제\s*금액|받을\s*금액|판매\s*금액|total)/i;
  const numRe = /[\d][\d,]{2,}/g;
  let best = null;
  lines.forEach((line, i) => {
    const nums = line.match(numRe);
    if (!nums) return;
    const isNearTotal = totalKeywords.test(line) || (i > 0 && totalKeywords.test(lines[i - 1]));
    nums.forEach((n) => {
      const v = Number(n.replace(/,/g, ""));
      if (!v || v < 100) return;
      if (isNearTotal) { best = { value: v, priority: 2 }; }
      else if (!best || best.priority < 1) {
        if (!best || v > (best.value || 0)) best = { value: v, priority: 1 };
      }
    });
  });
  return best ? best.value : null;
}

// ────────────────────────────────────────────────
// 생리주기 / 가임기
// ────────────────────────────────────────────────
export const PLANNER_CYCLES = "plannerCycles";

export function useCycleDoc(uid) {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!uid) { setData(null); setLoaded(true); return; }
    const unsub = onSnapshot(doc(db, PLANNER_CYCLES, uid), (snap) => {
      setData(snap.exists() ? snap.data() : null);
      setLoaded(true);
    }, () => setLoaded(true));
    return () => unsub();
  }, [uid]);
  return { data, loaded };
}

export async function saveCycleData(uid, patch) {
  await setDoc(doc(db, PLANNER_CYCLES, uid), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

// 남편 등 같은 그룹 구성원이 "읽기 전용"으로 볼 수 있게, 그룹 내 생리주기 기록을
// 모두 구독한다(입력한 사람 uid별로 문서가 나뉘어 있음).
export function useGroupCycles(groupId) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!groupId) { setRows([]); return; }
    const q = query(collection(db, PLANNER_CYCLES), where("groupId", "==", groupId));
    const unsub = onSnapshot(q, (snap) => setRows(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))), () => {});
    return () => unsub();
  }, [groupId]);
  return rows;
}

// 마지막 생리 시작일 + 평균 주기/생리 기간을 바탕으로 다음 생리 예정일, 배란일,
// 가임기(임신 확률이 높은 구간)를 계산한다 — 의학적 진단이 아닌 통상적인 계산법(28일
// 표준 기준 배란일 = 다음 생리 14일 전)을 사용한 참고용 추정치.
export function computeCycleInfo({ lastPeriodStart, cycleLength, periodLength }) {
  if (!lastPeriodStart) return null;
  const cLen = Number(cycleLength) || 28;
  const pLen = Number(periodLength) || 5;
  const start = new Date(lastPeriodStart + "T00:00:00");
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmt = (d) => {
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const today = new Date(todayStr() + "T00:00:00");

  // 오늘 이후가 되도록 다음 생리 예정일을 주기만큼 앞으로 굴린다.
  let nextPeriod = addDays(start, cLen);
  while (nextPeriod < today) nextPeriod = addDays(nextPeriod, cLen);

  const ovulation = addDays(nextPeriod, -14);
  const fertileStart = addDays(ovulation, -5);
  const fertileEnd = addDays(ovulation, 1);
  const periodEnd = addDays(start, pLen - 1);

  let phase = "일반";
  if (today >= start && today <= periodEnd) phase = "생리 중";
  else if (today >= fertileStart && today <= fertileEnd) phase = today.getTime() === ovulation.getTime() ? "배란일(임신 확률 최고)" : "가임기(임신 확률 높음)";
  else phase = "임신 확률 낮음";

  return {
    nextPeriodStart: fmt(nextPeriod),
    ovulationDate: fmt(ovulation),
    fertileStart: fmt(fertileStart),
    fertileEnd: fmt(fertileEnd),
    periodEnd: fmt(periodEnd),
    todayPhase: phase,
  };
}

// ────────────────────────────────────────────────
// 가족/커플 메신저
// ────────────────────────────────────────────────
export const PLANNER_MESSAGES = "plannerMessages";

// ⭐ where+orderBy를 같이 쓰면 Firestore 복합 색인이 필요해 배포 없이는 바로
// 동작하지 않을 수 있다 — where만 쓰고 정렬은 클라이언트에서 처리한다.
export function usePlannerMessages(groupId) {
  const [messages, setMessages] = useState([]);
  useEffect(() => {
    if (!groupId) { setMessages([]); return; }
    const q = query(collection(db, PLANNER_MESSAGES), where("groupId", "==", groupId));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setMessages(rows);
    }, () => {});
    return () => unsub();
  }, [groupId]);
  return messages;
}

// text와 imageURL 둘 중 하나만 있어도 보낼 수 있다(사진만 보내는 경우 text는 빈 문자열).
export async function sendPlannerMessage({ groupId, senderUid, senderName, text, imageURL }) {
  const trimmed = (text || "").trim();
  if (!trimmed && !imageURL) return;
  await addDoc(collection(db, PLANNER_MESSAGES), {
    groupId, senderUid, senderName: senderName || "", text: trimmed, imageURL: imageURL || "", createdAt: serverTimestamp(),
  });
}

export async function uploadMessengerImage(groupId, file) {
  return compressToDataURL(file);
}

// ────────────────────────────────────────────────
// 메신저 읽음/안읽음(카톡처럼 대화별 안읽은 숫자 + 상단 아이콘 뱃지)
// ────────────────────────────────────────────────
export const PLANNER_MESSENGER_READS = "plannerMessengerReads";

// 문서 id를 "groupId_uid"로 고정해 항상 한 사람당 문서 하나만 존재하게 한다.
function readDocId(groupId, uid) {
  return `${groupId}_${uid}`;
}

// 메신저를 열었을 때(그리고 열려있는 동안 새 메시지가 올 때) 호출해서
// "여기까지 읽었다" 시각을 저장한다.
export async function markMessengerRead(groupId, uid) {
  if (!groupId || !uid) return;
  await setDoc(doc(db, PLANNER_MESSENGER_READS, readDocId(groupId, uid)), {
    groupId, uid, lastReadAt: serverTimestamp(),
  }, { merge: true });
}

// 같은 가족(groupId) 구성원들의 "마지막으로 읽은 시각"을 실시간으로 구독한다.
// { [uid]: Timestamp } 형태의 맵으로 반환.
export function usePlannerMessengerReads(groupId) {
  const [reads, setReads] = useState({});
  useEffect(() => {
    if (!groupId) { setReads({}); return; }
    const q = query(collection(db, PLANNER_MESSENGER_READS), where("groupId", "==", groupId));
    const unsub = onSnapshot(q, (snap) => {
      const map = {};
      snap.docs.forEach((d) => { map[d.data().uid] = d.data().lastReadAt; });
      setReads(map);
    }, () => {});
    return () => unsub();
  }, [groupId]);
  return reads;
}

function tsMillis(ts) {
  if (!ts?.seconds) return 0;
  return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
}

// 상단 채팅 아이콘에 띄우는 숫자 뱃지 — 내가 아직 안 읽은(상대가 보낸) 메시지 수.
export function usePlannerUnreadCount(groupId, myUid) {
  const messages = usePlannerMessages(groupId);
  const reads = usePlannerMessengerReads(groupId);
  const myReadAt = tsMillis(reads[myUid]);
  return messages.filter((m) => m.senderUid !== myUid && tsMillis(m.createdAt) > myReadAt).length;
}

// ════════════════════════════════════════════════════════════════
// 여기서부터 — 다른 캘린더/가계부 앱에는 잘 없는, KP-Planner만의 기능들.
// 전부 위의 entries(adminPlanner) 컬렉션이나 같은 방식의 새 컬렉션을 그대로
// 재사용해서, 화면(PC/모바일 공용 컴포넌트)에서 usePlannerEntries 등 기존
// 훅으로 바로 읽고 쓸 수 있게 맞춘다.
// ════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────
// 1. 경조사 기브앤테이크 장부
// entries 컬렉션에 type:"eventMoney"로 저장 — 기존 income/expense와 같은
// 컬렉션을 쓰지만 저 두 필터에는 안 걸리니 다른 화면에 영향 없다.
// { type:"eventMoney", companyName, personName, relation, eventType,
//   direction:"give"|"receive", amount, date, memo }
// ────────────────────────────────────────────────
export const EVENT_MONEY_TYPES = ["결혼식", "장례식", "돌잔치", "회갑/칠순", "출산", "병문안", "기타"];
export const EVENT_MONEY_RELATIONS = ["본가", "처가/외가", "친구", "직장", "기타"];

// ⭐ 직접 입력한 관계/종류가 다음에도 계속 선택지에 남아있어야 한다는 요청 —
// entries는 그룹(=커플 둘 다) 공용 Firestore 데이터라, 한쪽이 새 값을 입력해 저장한
// 순간부터 두 계정 모두에서 mergeCategoryOptions와 같은 방식으로 보이게 된다.
export function mergeEventMoneyRelationOptions(entries) {
  const used = new Set((entries || []).filter((e) => e.type === "eventMoney").map((e) => (e.relation || "").trim()).filter(Boolean));
  return [...EVENT_MONEY_RELATIONS, ...[...used].filter((c) => !EVENT_MONEY_RELATIONS.includes(c))];
}
export function mergeEventMoneyTypeOptions(entries) {
  const used = new Set((entries || []).filter((e) => e.type === "eventMoney").map((e) => (e.eventType || "").trim()).filter(Boolean));
  return [...EVENT_MONEY_TYPES, ...[...used].filter((c) => !EVENT_MONEY_TYPES.includes(c))];
}

// 같은 사람에게 그동안 준 돈 - 받은 돈 = 잔액(양수면 내가 더 줬으니 받을 차례,
// 음수면 내가 더 받았으니 줄 차례). 이름으로 검색해서 그동안의 내역을 한눈에 본다.
export function eventMoneyBalanceByPerson(entries) {
  const map = new Map();
  (entries || []).filter((e) => e.type === "eventMoney").forEach((e) => {
    const key = (e.personName || "").trim();
    if (!key) return;
    if (!map.has(key)) map.set(key, { personName: key, gave: 0, received: 0, records: [] });
    const row = map.get(key);
    if (e.direction === "give") row.gave += Number(e.amount || 0);
    else row.received += Number(e.amount || 0);
    row.records.push(e);
  });
  return Array.from(map.values())
    .map((r) => ({ ...r, balance: r.gave - r.received, records: r.records.sort((a, b) => (b.date || "").localeCompare(a.date || "")) }))
    .sort((a, b) => (b.records[0]?.date || "").localeCompare(a.records[0]?.date || ""));
}

// ────────────────────────────────────────────────
// 2. 우리 부부 목표 저금통
// 목표(제목/금액)는 가족당 하나(문서 id = groupId), 기여 내역은 entries에
// type:"savingsContribution"로 쌓는다(누가 얼마 넣었는지 기록되어 같이 하는
// 느낌이 나게).
// ────────────────────────────────────────────────
export const PLANNER_SAVINGS_GOALS = "plannerSavingsGoals";

export function usePlannerSavingsGoal(groupId) {
  const [goal, setGoal] = useState(null);
  useEffect(() => {
    if (!groupId) { setGoal(null); return; }
    const unsub = onSnapshot(doc(db, PLANNER_SAVINGS_GOALS, groupId), (snap) => {
      setGoal(snap.exists() ? snap.data() : null);
    }, () => {});
    return () => unsub();
  }, [groupId]);
  return goal;
}

export async function setPlannerSavingsGoal(groupId, { title, targetAmount }) {
  await setDoc(doc(db, PLANNER_SAVINGS_GOALS, groupId), {
    groupId, title: (title || "").trim() || "우리 목표", targetAmount: Number(targetAmount) || 0,
    startedAt: serverTimestamp(),
  });
}

export function savingsContributedTotal(entries) {
  return (entries || [])
    .filter((e) => e.type === "savingsContribution")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
}

// ────────────────────────────────────────────────
// 3. 오늘의 기분 체크인 — 매일 한 번, 나/배우자가 오늘 컨디션을 가볍게 공유.
// 문서 id를 "groupId_uid_date"로 고정해 하루에 한 명당 하나만 존재하게 한다.
// ────────────────────────────────────────────────
export const PLANNER_MOOD_CHECKS = "plannerMoodChecks";
// ⭐ label은 본인이 고를 때 보이는 문장형 표현("오늘 너무너무 행복해요"), partnerLabel은
// 상대방 화면에 "오늘 OOO님은 기분이 ○○○" 한 줄로 보여줄 때 붙는 서술어다.
export const MOOD_OPTIONS = [
  { value: "happy", label: "오늘 너무너무 행복해요", partnerLabel: "매우 좋습니다" },
  { value: "good", label: "오늘 기분이 좋아요", partnerLabel: "좋습니다" },
  { value: "excited", label: "오늘 설레는 하루예요", partnerLabel: "설렙니다" },
  { value: "normal", label: "오늘 그냥 그런 하루예요", partnerLabel: "그저 그렇습니다" },
  { value: "tired", label: "오늘 조금 지쳐요", partnerLabel: "조금 지쳐 있습니다" },
  { value: "anxious", label: "오늘 마음이 좀 불안해요", partnerLabel: "조금 불안합니다" },
  { value: "sad", label: "오늘 조금 우울해요", partnerLabel: "조금 우울합니다" },
  { value: "angry", label: "오늘 화가 나요", partnerLabel: "화가 나 있습니다" },
];

export async function setPlannerMood(groupId, uid, name, date, mood) {
  await setDoc(doc(db, PLANNER_MOOD_CHECKS, `${groupId}_${uid}_${date}`), {
    groupId, uid, name: name || "", date, mood, updatedAt: serverTimestamp(),
  }, { merge: true });

  // ⭐ 기분을 바꿀 때마다 그룹의 다른 구성원에게 "하나씩 순서대로" 떴다 사라지는
  // 알림을 남긴다(PlannerMoodToast가 소비). 그룹원 조회가 실패해도 기분 저장
  // 자체는 이미 끝난 뒤라, 알림만 조용히 실패시킨다.
  try {
    const q = query(collection(db, PLANNER_ACCOUNTS), where("groupId", "==", groupId));
    const snap = await getDocs(q);
    const others = snap.docs.map((d) => d.id).filter((otherUid) => otherUid !== uid);
    await Promise.all(others.map((forUid) =>
      addDoc(collection(db, PLANNER_MOOD_NOTIFS), {
        groupId, forUid, fromUid: uid, fromName: name || "", mood, createdAt: serverTimestamp(),
      })
    ));
  } catch {}
}

// 오늘 하루치 — 같은 가족 구성원들의 체크인만 실시간 구독.
export function usePlannerTodayMoods(groupId, date) {
  const [moods, setMoods] = useState([]);
  useEffect(() => {
    if (!groupId || !date) { setMoods([]); return; }
    const q = query(collection(db, PLANNER_MOOD_CHECKS), where("groupId", "==", groupId), where("date", "==", date));
    const unsub = onSnapshot(q, (snap) => setMoods(snap.docs.map((d) => d.data())), () => {});
    return () => unsub();
  }, [groupId, date]);
  return moods;
}

// ⭐ 기분 변경 알림 — 배우자가 기분을 바꿀 때마다 하나씩 쌓이고, 화면에서 하나
// 보여준 뒤 consumeMoodNotification으로 지우면 큐의 다음 알림이 이어서 뜬다.
// (한꺼번에 다 뜨지 않고 "하나 뜨고 사라졌다가 다음 것" 요청 반영.)
export const PLANNER_MOOD_NOTIFS = "plannerMoodNotifications";

export function usePlannerMoodNotifications(groupId, myUid) {
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!groupId || !myUid) { setList([]); return; }
    const q = query(collection(db, PLANNER_MOOD_NOTIFS), where("groupId", "==", groupId), where("forUid", "==", myUid));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
      setList(rows);
    }, () => {});
    return () => unsub();
  }, [groupId, myUid]);
  return list;
}

export async function consumeMoodNotification(id) {
  await deleteDoc(doc(db, PLANNER_MOOD_NOTIFS, id));
}

// ────────────────────────────────────────────────
// 4. 이번 주 커플 미션 — 별도 서버 없이, 그 주(ISO 주차) 번호로 미션 목록에서
// 하나를 정해서 둘 다 "저절로" 같은 미션을 보게 한다(동기화용 쓰기 없이도
// 항상 같은 결과가 나옴). 완료 여부만 문서 하나에 기록.
// ────────────────────────────────────────────────
export const WEEKLY_MISSIONS = [
  "오늘 있었던 일 하나씩 나누며 저녁 먹기",
  "서로에게 고마운 점 한 가지 말해주기",
  "같이 장보고 저녁 메뉴 정하기",
  "핸드폰 없이 30분 산책하기",
  "다음 여행지 하나 같이 찾아보기",
  "서로 어릴 적 이야기 하나씩 해주기",
  "이번 주말 집안일 하나 같이 하기",
  "좋아하는 노래 하나씩 공유하기",
  "잠들기 전 오늘 하루 칭찬 한마디씩 하기",
  "다음 데이트 코스 같이 짜보기",
  "서로 사진첩에서 제일 좋아하는 사진 골라 보여주기",
  "같이 요리 하나 만들어보기",
  "손편지 짧게 한 장씩 써주기",
  "10년 뒤 우리 모습 상상해서 이야기해보기",
  "서로 좋아하는 영화 하나씩 골라서 같이 보기",
  "오늘 하루 중 제일 행복했던 순간 말해주기",
  "같이 산책하며 동네 맛집 하나 찾아보기",
  "서로에게 안마 3분씩 해주기",
  "다음 달 가계부 같이 점검하기",
  "서로의 장점 세 가지씩 말해주기",
  "같이 사진 찍고 배경화면으로 바꾸기",
  "예전에 찍은 사진/영상 같이 보며 추억 이야기하기",
  "서로에게 버킷리스트 하나씩 알려주기",
  "이번 주 제일 힘들었던 일 들어주고 위로해주기",
  "같이 새로운 카페/식당 가보기",
  "서로 어깨 마사지 3분씩 해주기",
  "같이 방 청소하고 정리하기",
  "서로에게 요즘 고민 하나씩 말해주기",
  "다음 명절/기념일 계획 같이 세워보기",
  "함께 스트레칭이나 운동 10분 하기",
  "서로 좋아하는 향수/향 소개해주기",
  "같이 드라이브하며 아무 얘기나 하기",
  "서로에게 어울리는 색 하나씩 골라주기",
  "오늘 저녁은 서로 좋아하는 메뉴로 번갈아 만들어주기",
  "함께 다음 여행 예산 짜보기",
  "서로에게 배우고 싶은 것 하나씩 알려주기",
  "잠들기 전 오늘 감사한 일 세 가지씩 말하기",
  "같이 보드게임이나 카드게임 한 판 하기",
  "서로 눈 감고 목소리만으로 표정 맞히기 놀이하기",
  "함께 좋아하는 노래로 플레이리스트 만들기",
];

// ⭐ 19금 버전 미션 — 노골적인 성적 묘사 없이, 부부/커플 사이의 스킨십·설렘을
// 자연스럽게 유도하는 수위로만 구성한다.
// ⭐ "더 야하게 바꿔달라"는 요청으로 한 단계 더 대담하게 손봤다 — 다만 특정
// 행위를 노골적으로 묘사하지 않고, 서로 솔직해지고 대담해지는 "제안/대화 주제"
// 형태는 그대로 유지했다.
export const WEEKLY_MISSIONS_ADULT = [
  "핸드폰 다 끄고, 오늘 밤은 서로에게만 완전히 집중하기",
  "귓가에 대고 오늘 밤 하고 싶은 말 솔직하게 속삭여주기",
  "따뜻한 오일로 서로 몸 구석구석 마사지해주기",
  "함께 샤워하며 서로 씻겨주는 시간 갖기",
  "촛불만 켜둔 방에서 아무 방해 없이 둘만의 시간 보내기",
  "가장 설레는 스킨십이 뭔지 솔직하게 물어보고 그대로 해주기",
  "오늘은 평소보다 훨씬 대담하게 다가가 보기",
  "서로에게 가장 매력적으로 느껴지는 순간을 솔직히 말해주기",
  "관능적인 춤이나 몸짓으로 상대를 유혹해보기",
  "눈을 가리고 상대의 손길만으로 어디인지 맞혀보는 게임하기",
  "발끝부터 천천히 입맞춤하며 올라오기",
  "은밀한 판타지 하나씩 솔직하게 이야기 나누기",
  "오늘 밤 데이트는 침실에서 마무리하기로 약속하기",
  "서로에게 야릇한 문자 한 통 미리 보내고 만나기",
  "오늘 밤은 리드를 완전히 상대방에게 맡기고 따라가 보기",
  "속삭이듯 낮은 목소리로 서로를 애칭으로만 부르기",
  "얼음이나 초콜릿처럼 색다른 소품으로 스킨십 즐기기",
  "서로 몸에 살짝살짝 입맞춤하며 사랑한다고 말해주기",
  "잠들기 전, 오늘 가장 설레고 흥분됐던 순간 나누기",
  "오늘 밤은 시간에 쫓기지 말고 천천히, 오래 사랑을 나누기",
];

// ⭐ "웃음 버전" — 로맨틱한 것보다 그냥 둘이 깔깔대고 웃을 수 있는 장난스러운 미션.
export const WEEKLY_MISSIONS_FUNNY = [
  "서로 성대모사 하나씩 해서 웃겨보기",
  "3분 동안 아무 말 없이 웃긴 표정만으로 대화하기",
  "상대방 흉내내며 오늘 하루 재연해보기",
  "이상한 억양으로 사랑한다고 말해보기",
  "말 안 하고 몸짓으로만 저녁 메뉴 설명하기",
  "서로에게 아재개그 3개씩 던지기",
  "눈 감고 상대방 목소리만 듣고 지금 기분 맞히기",
  "제일 웃긴 흑역사 사진 하나씩 공개하기",
  "즉석에서 랩으로 오늘 하루 요약해보기",
  "상대방이 정해준 이상한 포즈로 사진 찍기",
  "5초 안에 아무 동물 흉내 내기",
  "서로 별명을 웃기게 새로 지어주기",
  "말도 안 되는 이유로 서로를 칭찬해보기",
  "웃긴 표정으로 셀카 대결하기",
  "즉흥 콩트 1분씩 보여주기",
  "상대방 성대모사로 '사랑해' 말하기",
  "옛날 유행어로만 대화해보기",
  "제일 부끄러운 춤 하나씩 춰보기",
  "서로에게 엉뚱한 별명 붙여서 하루종일 불러보기",
  "말 더듬는 척하며 오늘 있었던 일 설명하기",
  "상대방 표정 따라하기 게임하기",
  "웃음 참기 대결 — 먼저 웃는 사람이 설거지하기",
  "제일 이상한 표정 사진 찾아서 서로 보여주기",
  "서로 모창으로 좋아하는 가수 노래 불러주기",
  "즉석에서 커플 은어(암호) 하나 만들기",
  "손으로만 오늘 있었던 일 설명하고 맞히기",
  "서로 애교 대결하기 — 더 웃긴 사람이 승리",
  "제일 못생기게 나온 사진 찾아서 보여주기",
  "상대방이 낸 문제로 스무고개 하기",
  "말끝마다 '~다냥'을 붙여서 대화하기",
  "서로 로봇 흉내내며 대화하기",
  "웃긴 필터로 셀카 찍고 저장하기",
  "3초 안에 아무 노래나 개사해서 부르기",
  "상대방 성대모사로 뉴스 앵커처럼 오늘 하루 브리핑하기",
  "제일 부끄러운 흑역사 이야기 하나씩 고백하기",
  "서로 눈 마주치고 안 웃기 게임하기(먼저 웃는 사람이 지는 것)",
  "이상한 나라 말투로 인사해보기",
  "손가락 하트 대신 제일 이상한 하트 포즈 만들어보기",
  "상대방이 좋아하는 밈으로만 대화하기",
  "제일 웃긴 표정으로 인생네컷 찍기",
];

// ⭐ "진솔한 버전" — 장난이나 스킨십이 아니라, 서로에게 솔직해지는 깊은 대화 주제.
export const WEEKLY_MISSIONS_HONEST = [
  "요즘 가장 힘든 고민 솔직하게 털어놓기",
  "서로에게 가장 고마웠던 순간 이야기하기",
  "연애 초반과 지금, 서로에 대한 마음이 어떻게 달라졌는지 말해보기",
  "미래에 대해 가장 걱정되는 것 솔직히 말하기",
  "서로에게 서운했던 점 하나씩 조심스럽게 이야기하기",
  "10년 후 우리는 어떤 모습일지 진지하게 이야기 나누기",
  "서로의 가족에 대해 어떻게 생각하는지 솔직히 말해보기",
  "요즘 스스로에게 가장 만족스럽지 않은 부분 이야기하기",
  "우리 관계에서 가장 소중하게 생각하는 게 뭔지 말해보기",
  "서로에게 바라는 점 하나씩 솔직하게 말하기",
  "결혼·미래 계획에 대한 생각을 솔직히 나눠보기",
  "요즘 느끼는 불안이나 두려움 이야기하기",
  "서로를 처음 만났을 때 느낌이 어땠는지 솔직히 말해주기",
  "돈·경제관념에 대한 생각 솔직하게 이야기하기",
  "서로에게 가장 배우고 싶은 점 말해주기",
  "지금 이 순간 가장 감사한 것 세 가지 나누기",
  "우리가 함께 극복한 가장 힘들었던 순간 이야기하기",
  "서로의 꿈·목표를 얼마나 지지하고 있는지 이야기하기",
  "관계에서 고치고 싶은 나의 습관 하나 고백하기",
  "서로에게 진짜 하고 싶었지만 못했던 말 해보기",
  "부모가 되는 것에 대한 생각 솔직히 나누기",
  "서로의 일·커리어에 대해 어떻게 생각하는지 말해보기",
  "지금 우리 관계에서 가장 행복한 부분이 뭔지 말하기",
  "다투고 나서 스스로 부족했다고 느낀 점 이야기하기",
  "우리 사이에서 더 노력하고 싶은 부분 이야기하기",
  "요즘 서로에게 소홀했던 부분이 있는지 솔직히 말하기",
  "인생에서 가장 후회되는 선택 이야기해보기",
  "서로에게 가장 의지가 되는 순간이 언제인지 말해주기",
  "우리 사랑을 한 문장으로 표현해보기",
  "지금 사랑이 처음과 어떻게 다른지 솔직히 이야기하기",
  "서로의 콤플렉스에 대해 어떻게 생각하는지 진솔하게 말하기",
  "우리 관계에서 바꾸고 싶은 게 있다면 솔직히 말해보기",
  "가장 최근에 상대방 때문에 울컥했던 순간 이야기하기",
  "10년 뒤에도 함께이고 싶은 이유 말해보기",
  "요즘 서로에게 느끼는 거리감이 있다면 솔직히 이야기하기",
  "특별한 날에 진짜 바라는 게 뭔지 말하기",
  "서로를 있는 그대로 받아들이고 있는지 진솔하게 이야기하기",
  "지금 이 사람과 함께여서 가장 좋은 이유 말해주기",
  "서로에게 마지막으로 하고 싶은 진심 어린 한마디 남기기",
  "오늘 이 대화를 하고 나서 드는 생각 서로 나누기",
];

// ⭐ 버전(분위기) 목록 — "버전변경" 팝업에서 고르는 선택지. random은 실제
// 저장되는 pool이 아니라 룰렛으로 넷 중 하나를 뽑는 특수 옵션이다.
export const MISSION_VERSIONS = [
  { key: "normal", label: "일상 버전" },
  { key: "funny", label: "웃음 버전" },
  { key: "honest", label: "진솔한 버전" },
  { key: "adult", label: "19금 버전" },
];

export const PLANNER_MISSION_CHECKS = "plannerMissionChecks";

function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// 문자열을 결정적인(항상 같은 결과가 나오는) 숫자로 바꾼다 — Firestore에 아직
// 아무것도 저장되지 않은 최초 상태에서도, 새로고침 전까지는 둘 다 같은 미션이
// 보이도록 하는 기본값 계산에 쓴다.
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

const MISSION_POOL_MAP = {
  normal: WEEKLY_MISSIONS,
  funny: WEEKLY_MISSIONS_FUNNY,
  honest: WEEKLY_MISSIONS_HONEST,
  adult: WEEKLY_MISSIONS_ADULT,
};
function missionPoolFor(pool) {
  return MISSION_POOL_MAP[pool] || WEEKLY_MISSIONS;
}

// 이번 주 미션 상태(문구/완료여부/버전)를 실시간 구독한다. 문서가 아직
// 없으면 weekKey를 시드로 한 결정적 기본 미션을 보여준다(둘 다 같은 걸 봄).
export function useWeekMission(groupId) {
  const weekKey = isoWeekKey();
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!groupId) { setState(null); return; }
    const unsub = onSnapshot(doc(db, PLANNER_MISSION_CHECKS, `${groupId}_${weekKey}`), (snap) => {
      setState(snap.exists() ? snap.data() : null);
    }, () => {});
    return () => unsub();
  }, [groupId, weekKey]);

  const pool = MISSION_POOL_MAP[state?.pool] ? state.pool : "normal";
  const list = missionPoolFor(pool);
  const index = Number.isInteger(state?.missionIndex) ? state.missionIndex : hashStr(weekKey) % list.length;
  const text = list[index] || list[0];

  return {
    weekKey, text, pool, index, done: !!state?.done, doneByName: state?.doneByName || "",
    versionChanged: !!state?.versionChanged, versionChangedBy: state?.versionChangedBy || "",
    pickedRandom: !!state?.pickedRandom,
  };
}

// 새로고침("다른 미션") — 같은 주, 같은 버전 안에서 다른 미션으로 무작위 교체
// (버전 자체는 안 바뀌므로 주 1회 제한과 무관하게 언제든 할 수 있다).
export async function rerollWeekMission(groupId, weekKey, pool, currentIndex) {
  const list = missionPoolFor(pool);
  let index = Math.floor(Math.random() * list.length);
  if (list.length > 1 && Number.isInteger(currentIndex)) {
    while (index === currentIndex) index = Math.floor(Math.random() * list.length);
  }
  await setDoc(doc(db, PLANNER_MISSION_CHECKS, `${groupId}_${weekKey}`), {
    groupId, weekKey, pool, missionIndex: index, done: false, doneByName: "", doneAt: null,
  }, { merge: true });
}

// ⭐ "버전변경"의 차례를 정한다 — 그룹을 먼저 만든 사람(가입일이 더 이른 쪽)이
// 짝수 주, 그 다음 합류한 사람이 홀수 주. 최고관리자는 caller 쪽에서 별도로
// 언제나 허용하므로 이 함수는 순수하게 "짝/홀 주 담당자"만 계산한다.
export function computeMissionTurnUid(members, weekKey) {
  const sorted = [...(members || [])].sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0].uid;
  const wn = Number((weekKey || "").split("-W")[1] || 0);
  return wn % 2 === 0 ? sorted[0].uid : sorted[1].uid;
}

// 버전(분위기) 변경 — 진짜 미션 교체(reroll)와 달리 "주 1회, 차례인 사람만"
// 제한이 있다(호출하는 쪽에서 이미 자격을 확인했다는 전제 — allowed=false로
// 넘어오면 여기서도 한 번 더 막는다). random으로 뽑았을 때는 룰렛이 이미
// 정한 pool/missionIndex를 그대로 넘겨받아 저장만 한다.
export async function setWeekMissionPool(groupId, weekKey, pool, { actorUid, missionIndex, pickedRandom = false, allowed = true } = {}) {
  if (!allowed) throw new Error("이번 주는 버전을 바꿀 수 없어요.");
  const list = missionPoolFor(pool);
  const index = Number.isInteger(missionIndex) ? missionIndex : Math.floor(Math.random() * list.length);
  await setDoc(doc(db, PLANNER_MISSION_CHECKS, `${groupId}_${weekKey}`), {
    groupId, weekKey, pool, missionIndex: index, done: false, doneByName: "", doneAt: null,
    versionChanged: true, versionChangedBy: actorUid || "", pickedRandom,
  }, { merge: true });
}

export async function togglePlannerMissionDone(groupId, weekKey, done, actorName) {
  await setDoc(doc(db, PLANNER_MISSION_CHECKS, `${groupId}_${weekKey}`), {
    groupId, weekKey, done, doneByName: done ? (actorName || "") : "", doneAt: done ? serverTimestamp() : null,
  }, { merge: true });
}

// ────────────────────────────────────────────────
// 5. 타임캡슐 메시지 — 정해둔 날짜가 되기 전까지는 잠겨 있다가, 그날이 되면
// 열어볼 수 있는 미래로 보내는 메시지. 발송 조건은 서버 없이 클라이언트에서
// "오늘 >= deliverDate"만 비교하면 되므로 별도 스케줄러가 필요 없다.
// ────────────────────────────────────────────────
export const PLANNER_TIME_CAPSULES = "plannerTimeCapsules";

export function usePlannerTimeCapsules(groupId) {
  const [capsules, setCapsules] = useState([]);
  useEffect(() => {
    if (!groupId) { setCapsules([]); return; }
    const q = query(collection(db, PLANNER_TIME_CAPSULES), where("groupId", "==", groupId));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (a.deliverDate || "").localeCompare(b.deliverDate || ""));
      setCapsules(rows);
    }, () => {});
    return () => unsub();
  }, [groupId]);
  return capsules;
}

export async function addPlannerTimeCapsule({ groupId, fromUid, fromName, text, deliverDate }) {
  if (!text?.trim() || !deliverDate) return;
  await addDoc(collection(db, PLANNER_TIME_CAPSULES), {
    groupId, fromUid, fromName: fromName || "", text: text.trim(), deliverDate, createdAt: serverTimestamp(),
  });
}

export async function deletePlannerTimeCapsule(id) {
  await deleteDoc(doc(db, PLANNER_TIME_CAPSULES, id));
}

// ────────────────────────────────────────────────
// 6. 이번 달 브리핑 — 저장 없이, 이미 불러온 entries에서 바로 계산해서 문장으로
// 읽어주는 요약(그래프 대신 "말"로 알려주는 느낌).
// ────────────────────────────────────────────────
export function buildMonthlyBriefing({ incomeExpense, budgetTarget, savingsGoal, savingsTotal }) {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYm = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, "0")}`;

  const thisMonth = (incomeExpense || []).filter((e) => String(e.date || "").slice(0, 7) === ym);
  const prevMonth = (incomeExpense || []).filter((e) => String(e.date || "").slice(0, 7) === prevYm);
  const sum = (rows, type) => rows.filter((r) => r.type === type).reduce((s, r) => s + Number(r.amount || 0), 0);

  const expNow = sum(thisMonth, "expense");
  const expPrev = sum(prevMonth, "expense");
  const incNow = sum(thisMonth, "income");

  const lines = [];
  lines.push(`이번 달(${now.getMonth() + 1}월) 지출은 ${fmtWon(expNow)}, 수입은 ${fmtWon(incNow)}이에요.`);

  if (expPrev > 0) {
    const diff = expNow - expPrev;
    const pct = Math.round((Math.abs(diff) / expPrev) * 100);
    if (diff > 0) lines.push(`지난달보다 지출이 ${fmtWon(diff)}(${pct}%) 늘었어요.`);
    else if (diff < 0) lines.push(`지난달보다 지출이 ${fmtWon(-diff)}(${pct}%) 줄었어요.`);
    else lines.push("지난달과 지출 규모가 거의 비슷해요.");
  }

  const byCategory = new Map();
  thisMonth.filter((r) => r.type === "expense").forEach((r) => {
    const c = r.category || "기타";
    byCategory.set(c, (byCategory.get(c) || 0) + Number(r.amount || 0));
  });
  const topCategory = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topCategory) lines.push(`가장 많이 쓴 분류는 "${topCategory[0]}"(${fmtWon(topCategory[1])})이에요.`);

  if (budgetTarget > 0) {
    const pct = Math.round((expNow / budgetTarget) * 100);
    const status = budgetStatusLabel(pct);
    lines.push(`올해 예산 목표 대비 이번 달 지출은 ${pct}% 수준 — 상태는 "${status.label}"이에요.`);
  }

  if (savingsGoal?.targetAmount > 0) {
    const pct = Math.min(100, Math.round((savingsTotal / savingsGoal.targetAmount) * 100));
    lines.push(`"${savingsGoal.title}" 저금통은 ${fmtWon(savingsTotal)} 모여서 목표의 ${pct}%를 채웠어요.`);
  }

  return lines;
}

// ────────────────────────────────────────────────
// 7. 지갑 — 기준 재산을 설정해두면, 수입·지출 내역이 실제로 등록/삭제될 때마다
// 자동으로 반영되는 잔액을 보여준다. 대출금/마이너스통장 같은 빚은 "기준 재산"
// 안의 숫자 하나로 뭉뚱그리지 않고, 종류(분류)·회차·만기일까지 따로 남길 수 있게
// 별도 항목(plannerDebts)으로 관리한다. ⭐ 자산 설정/빚 항목은 실제 "거래"가
// 아니라 잔액을 구성하는 값이라, 수입·지출 상세내역에는 일부러 안 섞는다 —
// 섞으면 "언제 얼마를 썼다"는 거래 기록과 "지금 얼마를 갖고 있다/빚졌다"는 잔액
// 정보가 뒤엉켜서 오히려 헷갈린다. 대신 지갑 화면 안에서 항목별로 다 볼 수 있다.
// ────────────────────────────────────────────────
export const PLANNER_WALLET = "plannerWallet";

export function usePlannerWallet(groupId) {
  const [wallet, setWallet] = useState(null);
  useEffect(() => {
    if (!groupId) { setWallet(null); return; }
    const unsub = onSnapshot(doc(db, PLANNER_WALLET, groupId), (snap) => {
      setWallet(snap.exists() ? snap.data() : null);
    }, () => {});
    return () => unsub();
  }, [groupId]);
  return wallet;
}

export async function setPlannerWalletBase(groupId, baseAssets, actorName) {
  await setDoc(doc(db, PLANNER_WALLET, groupId), {
    groupId, baseAssets: Number(baseAssets) || 0,
    setByName: actorName || "", updatedAt: serverTimestamp(),
  }, { merge: true });
}

// 대출금/마이너스통장/카드값 등 "빚" 항목 — 회차·만기일도 선택적으로 남길 수 있다.
export const PLANNER_DEBTS = "plannerDebts";
export const DEBT_CATEGORIES = ["마이너스통장", "대출금", "카드값", "기타"];

// 직접 입력한 빚 분류도 그룹(커플 둘 다)에 계속 남아있게 — 위 이벤트머니와 동일한 방식.
export function mergeDebtCategoryOptions(debts) {
  const used = new Set((debts || []).map((d) => (d.category || "").trim()).filter(Boolean));
  return [...DEBT_CATEGORIES, ...[...used].filter((c) => !DEBT_CATEGORIES.includes(c))];
}

export function usePlannerDebts(groupId) {
  const [debts, setDebts] = useState([]);
  useEffect(() => {
    if (!groupId) { setDebts([]); return; }
    const q = query(collection(db, PLANNER_DEBTS), where("groupId", "==", groupId));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setDebts(rows);
    }, () => {});
    return () => unsub();
  }, [groupId]);
  return debts;
}

export async function addPlannerDebt({ groupId, category, amount, installmentNo, installmentTotal, dueDate, memo, actorName }) {
  await addDoc(collection(db, PLANNER_DEBTS), {
    groupId,
    category: (category || "").trim() || "기타",
    amount: Number(amount) || 0,
    installmentNo: installmentNo ? Number(installmentNo) : null,
    installmentTotal: installmentTotal ? Number(installmentTotal) : null,
    dueDate: dueDate || "",
    memo: (memo || "").trim(),
    createdByName: actorName || "",
    createdAt: serverTimestamp(),
  });
}

export async function deletePlannerDebt(id) {
  await deleteDoc(doc(db, PLANNER_DEBTS, id));
}

export function totalDebtAmount(debts) {
  return (debts || []).reduce((s, d) => s + Number(d.amount || 0), 0);
}

// 지갑 잔액 = 기준 재산 - 빚 합계 + (그 기간의) 수입 - 지출.
// wallet이 아예 설정 안 됐으면 null(= "지갑 미설정" 의미, 화면에서 구분해서 씀).
export function computeWalletBalance(wallet, totalIncome, totalExpense, totalDebt = 0) {
  if (!wallet) return null;
  return (wallet.baseAssets || 0) - (Number(totalDebt) || 0) + (Number(totalIncome) || 0) - (Number(totalExpense) || 0);
}

// ────────────────────────────────────────────────
// 8. 미니게임(가위바위보 / 반응속도 게임) — 재미로 하는 것이지만 점수는 계속
// 누적된다. 두 사람이 동시에 뭔가를 제출하는 구조라, 승부 판정은 트랜잭션으로
// 딱 한 번만 반영되게 한다(두 기기가 거의 동시에 계산해도 중복 반영 안 됨).
// ────────────────────────────────────────────────
export const PLANNER_GAME_STATE = "plannerGameState"; // 문서 id = groupId
export const PLANNER_GAME_SCORES = "plannerGameScores"; // 문서 id = groupId

export function usePlannerGameState(groupId) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!groupId) { setState(null); return; }
    const unsub = onSnapshot(doc(db, PLANNER_GAME_STATE, groupId), (snap) => setState(snap.exists() ? snap.data() : {}), () => {});
    return () => unsub();
  }, [groupId]);
  return state || {};
}

// 내기 선택 팝업에서 고를 수 있는 항목들 — 커플이 실제로 걸어볼 만한 것 위주로
// 최대한 다양하게 준비했다. 목록에 없으면 직접 입력도 가능하다(PlannerCategorySelect류).
export const GAME_BET_OPTIONS = [
  "설거지 일주일 담당하기", "저녁 메뉴 정하기 권한 넘기기", "치킨 쏘기", "커피·디저트 사주기",
  "하루 종일 상대방 심부름 들어주기", "다음 데이트 코스 전부 맡기기", "이불 개기 한 달 담당",
  "빨래 널고 개기 일주일 담당", "청소 한 번 통째로 맡기기", "설거지+분리수거 오늘 하루 담당",
  "5만원 이하 갖고 싶은 거 사주기", "안마 10분 해주기", "하루종일 애교 부리기",
  "보고 싶은 영화·드라마 결정권 넘기기", "장보기·택배 심부름 대신 해주기", "설거지 대신 해주기(1회)",
  "다음 여행지 정하기 권한 몰아주기", "손편지 써주기", "아침밥 일주일 차려주기",
  "사진 찍을 때 원하는 포즈 다 해주기(1일)", "듣고 싶은 노래 신청하면 불러주기",
  "하루 종일 존댓말 쓰기", "다음 정주행 컨텐츠 결정권 넘기기", "설거지+요리 오늘 하루 다 맡기기",
  "SNS에 애정표현 게시물 하나 올리기", "원하는 코스요리 사주기", "차 태워다주기(원하는 곳, 1회)",
  "핸드폰 배경화면 원하는 사진으로 바꾸기(1주일)", "설거지 대신+커피 사주기", "다음 주말 계획 전부 맡기기",
  "머리 감겨주기", "발 마사지 해주기", "다음에 싸우면 무조건 먼저 화해하기",
  "포옹·뽀뽀 무제한 요청권(1일)", "다음 게임 한 번 봐주기", "설거지+청소기 돌리기 오늘 담당",
  "듣고 싶은 칭찬 5개 해주기", "치킨·피자 등 야식 쏘기", "노래방 가서 원하는 노래 다 불러주기",
  "다음 커플사진 원하는 컨셉대로 찍기",
];

// ⭐ 미니게임을 시작하기 전에 "무슨 내기를 할지" 정해두는 기능 — plannerGameState
// 문서의 bet 필드에 저장해서 둘 다 실시간으로 같은 내기를 본다.
export async function setPlannerGameBet(groupId, text, uid, name) {
  await setDoc(doc(db, PLANNER_GAME_STATE, groupId), {
    bet: { text, setByUid: uid, setByName: name || "", setAt: serverTimestamp() },
    // 새 내기 = 새 라운드 — 이전 라운드 점수는 지운다.
    matchRound: { betText: text, scores: {}, settled: false },
  }, { merge: true });
}

export function usePlannerGameScores(groupId) {
  const [scores, setScores] = useState({});
  useEffect(() => {
    if (!groupId) { setScores({}); return; }
    const unsub = onSnapshot(doc(db, PLANNER_GAME_SCORES, groupId), (snap) => setScores(snap.exists() ? snap.data() : {}), () => {});
    return () => unsub();
  }, [groupId]);
  return scores;
}

const RPS_BEATS = { 가위: "보", 바위: "가위", 보: "바위" };
export const RPS_CHOICES = ["가위", "바위", "보"];

// 가위바위보 한 수를 낸다. 상대(otherUid)가 아직 안 냈으면 내 선택만 저장해두고
// 기다리고, 둘 다 냈으면 그 자리에서 승부를 가려 점수에 반영한 뒤 라운드를 초기화한다.
export async function submitRpsChoice(groupId, uid, name, choice, otherUid) {
  const stateRef = doc(db, PLANNER_GAME_STATE, groupId);
  const scoreRef = doc(db, PLANNER_GAME_SCORES, groupId);
  await runTransaction(db, async (tx) => {
    const stateSnap = await tx.get(stateRef);
    const state = stateSnap.exists() ? stateSnap.data() : {};
    const prevChoices = state.rps?.choices || {};
    const choices = { ...prevChoices, [uid]: { choice, name: name || "" } };

    if (!otherUid || !choices[otherUid]) {
      tx.set(stateRef, { ...state, rps: { choices } }, { merge: true });
      return;
    }

    const mine = choices[uid].choice;
    const theirs = choices[otherUid].choice;
    const result = mine === theirs ? "draw" : RPS_BEATS[mine] === theirs ? "win" : "lose";

    const scoreSnap = await tx.get(scoreRef);
    const scores = scoreSnap.exists() ? { ...scoreSnap.data() } : {};
    const bump = (u, key, displayName) => {
      const cur = scores[u]?.rps || { w: 0, l: 0, d: 0 };
      scores[u] = { ...(scores[u] || {}), name: displayName || scores[u]?.name || "", rps: { ...cur, [key]: (cur[key] || 0) + 1 } };
    };
    if (result === "draw") { bump(uid, "d", name); bump(otherUid, "d", choices[otherUid].name); }
    else if (result === "win") { bump(uid, "w", name); bump(otherUid, "l", choices[otherUid].name); }
    else { bump(uid, "l", name); bump(otherUid, "w", choices[otherUid].name); }

    tx.set(scoreRef, scores, { merge: true });
    tx.set(stateRef, {
      ...state,
      rps: {
        choices: {},
        lastResult: { mine, theirs, myUid: uid, result, at: Date.now() },
      },
    }, { merge: true });
  });
}

// 반응속도 게임 — 신호가 뜨면 최대한 빨리 눌러서 반응시간(ms)을 겨루는 미니게임.
export async function startReactionRound(groupId) {
  const delayMs = 1200 + Math.floor(Math.random() * 2500);
  await setDoc(doc(db, PLANNER_GAME_STATE, groupId), {
    reaction: { phase: "waiting", startedAt: serverTimestamp(), delayMs, reactions: {} },
  }, { merge: true });
}

export async function submitReactionTime(groupId, uid, name, ms, otherUid) {
  const stateRef = doc(db, PLANNER_GAME_STATE, groupId);
  const scoreRef = doc(db, PLANNER_GAME_SCORES, groupId);
  await runTransaction(db, async (tx) => {
    const stateSnap = await tx.get(stateRef);
    const state = stateSnap.exists() ? stateSnap.data() : {};
    const prevReactions = state.reaction?.reactions || {};
    const reactions = { ...prevReactions, [uid]: { ms, name: name || "" } };

    if (!otherUid || !reactions[otherUid]) {
      tx.set(stateRef, { ...state, reaction: { ...state.reaction, phase: "waiting", reactions } }, { merge: true });
      return;
    }

    const mineMs = reactions[uid].ms;
    const theirsMs = reactions[otherUid].ms;
    const result = mineMs === theirsMs ? "draw" : mineMs < theirsMs ? "win" : "lose";

    const scoreSnap = await tx.get(scoreRef);
    const scores = scoreSnap.exists() ? { ...scoreSnap.data() } : {};
    const bump = (u, key, displayName) => {
      const cur = scores[u]?.reaction || { w: 0, l: 0, d: 0 };
      scores[u] = { ...(scores[u] || {}), name: displayName || scores[u]?.name || "", reaction: { ...cur, [key]: (cur[key] || 0) + 1 } };
    };
    if (result === "draw") { bump(uid, "d", name); bump(otherUid, "d", reactions[otherUid].name); }
    else if (result === "win") { bump(uid, "w", name); bump(otherUid, "l", reactions[otherUid].name); }
    else { bump(uid, "l", name); bump(otherUid, "w", reactions[otherUid].name); }

    tx.set(scoreRef, scores, { merge: true });
    tx.set(stateRef, {
      ...state,
      reaction: { phase: "idle", reactions: {}, lastResult: { mineMs, theirsMs, myUid: uid, result, at: Date.now() } },
    }, { merge: true });
  });
}

// ────────────────────────────────────────────────
// 9. 타임라인(옛 "우리 이야기") — 대표 사진 + 만난 지 며칠째인지, 100일/1000일
// 같은 절편 기념일이 언제인지를 계산해서 보여준다. 사진은 가족당 1장(문서
// id=groupId).
// ────────────────────────────────────────────────
export const PLANNER_TIMELINE_PHOTO = "plannerTimelinePhoto";

export function useTimelinePhoto(groupId) {
  const [photoURL, setPhotoURLState] = useState("");
  useEffect(() => {
    if (!groupId) { setPhotoURLState(""); return; }
    const unsub = onSnapshot(doc(db, PLANNER_TIMELINE_PHOTO, groupId), (snap) => {
      setPhotoURLState(snap.exists() ? snap.data().photoURL || "" : "");
    }, () => {});
    return () => unsub();
  }, [groupId]);
  return photoURL;
}

export async function setTimelinePhoto(groupId, photoURL) {
  await setDoc(doc(db, PLANNER_TIMELINE_PHOTO, groupId), { groupId, photoURL, updatedAt: serverTimestamp() });
}

// ⭐ 휴대폰 사진첩에서 고른 원본 사진은 수 MB~수십 MB(고화질/HEIC)일 수 있어서,
// 모바일 네트워크에서 업로드가 느리거나 조용히 실패하는 원인이 됐다("업로드
// 중"만 잠깐 뜨고 아무 반응 없이 원래대로 돌아감). 캔버스로 리사이즈+JPEG
// 재인코딩해서 용량을 크게 줄이고, 실패하면 원본 파일로라도 한 번 더 시도한다.
export function compressImageFile(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else { width = Math.round((width * maxDim) / height); height = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => { blob ? resolve(blob) : reject(new Error("이미지 변환 실패")); }, "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지를 불러오지 못했습니다")); };
    img.src = url;
  });
}

// ⭐ Firebase Storage 버킷이 요금제(Blaze) 연결 없이는 storage/quota-exceeded로
// 막혀 있어서(용량이 아니라 버킷 자체가 잠긴 상태), KP-Planner의 사진 업로드
// 기능(타임라인 대표사진/영수증/메신저 이미지)이 전부 이 오류로 실패했다.
// 배차프로그램의 사업자등록증 업로드(DispatchApp.jsx)에서 이미 쓰고 있는 방식과
// 동일하게 Storage를 아예 거치지 않고, 압축한 이미지를 base64로 인코딩해
// Firestore 문서에 직접 저장한다. Firestore 문서 용량 한도(1MiB)를 넘지 않도록
// 용량이 큰 경우 점점 더 세게 압축해 재시도한다.
const PLANNER_IMAGE_BYTE_BUDGET = 700 * 1024; // base64로 부풀어도 1MiB 한도 아래로 여유
const PLANNER_IMAGE_COMPRESS_STEPS = [
  { maxDim: 1280, quality: 0.75 },
  { maxDim: 960, quality: 0.65 },
  { maxDim: 720, quality: 0.55 },
  { maxDim: 480, quality: 0.45 },
];

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다"));
    reader.readAsDataURL(blob);
  });
}

export async function compressToDataURL(file) {
  let lastDataUrl = null;
  for (const step of PLANNER_IMAGE_COMPRESS_STEPS) {
    let blob;
    try {
      blob = await compressImageFile(file, step.maxDim, step.quality);
    } catch {
      continue; // 이 단계 압축 실패 — 다음(더 작은) 단계로 시도
    }
    lastDataUrl = await blobToDataURL(blob);
    if (blob.size <= PLANNER_IMAGE_BYTE_BUDGET) return lastDataUrl;
  }
  if (lastDataUrl) return lastDataUrl; // 다 커도 마지막(가장 작게 압축된) 결과라도 사용
  return blobToDataURL(file); // 압축이 전부 실패한 경우 원본으로라도 시도
}

export async function uploadTimelinePhoto(groupId, file) {
  const dataUrl = await compressToDataURL(file);
  await setTimelinePhoto(groupId, dataUrl);
  return dataUrl;
}

// 시작일 기준 "N년 M개월 D일" — 달력 상 실제 차이(윤년/월 길이 반영)로 계산한다.
export function durationParts(startStr, todayStrArg) {
  const start = new Date(startStr + "T00:00:00");
  const end = new Date((todayStrArg || todayStr()) + "T00:00:00");
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();
  if (days < 0) {
    months -= 1;
    const prevMonthLastDay = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    days += prevMonthLastDay;
  }
  if (months < 0) { years -= 1; months += 12; }
  return { years, months, days };
}

const DAY_MILESTONES = [5, 10, 30, 50, 100, 200, 300, 500, 1000, 1500, 2000, 3000, 5000, 10000];

// 시작일을 1일째로 세는 절편 기념일(5일/100일/1000일...)과 매년 돌아오는 N주년을
// 한 목록으로 합쳐 날짜순으로 반환한다.
export function generateAnniversaries(startStr) {
  const start = new Date(startStr + "T00:00:00");
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const rows = [{ label: "시작일", date: fmt(start) }];
  DAY_MILESTONES.forEach((n) => {
    const d = new Date(start); d.setDate(d.getDate() + n - 1); // 시작일 = 1일째
    rows.push({ label: `${n.toLocaleString("ko-KR")}일`, date: fmt(d) });
  });
  for (let y = 1; y <= 20; y++) {
    const d = new Date(start); d.setFullYear(d.getFullYear() + y);
    rows.push({ label: `${y}주년`, date: fmt(d) });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

// ⭐ 타임라인이 계산해서 보여주기만 하던 100일 이상 절편 기념일/N주년을, 서로
// 알림 받을 수 있게 진짜 "일정"(schedule)으로도 자동 등록해준다 — 일정에 등록되면
// PlannerAlertBanner가 이미 D-30/D-7/D-0 알림을 처리하고 있어서 여기선 등록만
// 하면 된다. anniversaryKey("100일", "1주년"...)로 각 그룹당 항목을 하나씩만
// 유지하고, 시작일이 바뀌면 날짜만 갱신한다(중복 생성 방지).
export async function syncAnniversarySchedules(groupId, coupleStartDate, entries) {
  if (!groupId || !coupleStartDate) return;
  const milestones = generateAnniversaries(coupleStartDate).filter((row) => {
    const m = row.label.match(/^([\d,]+)일$/);
    if (m) return Number(m[1].replace(/,/g, "")) >= 100; // "100일부터는 다" 요청 반영
    return /주년$/.test(row.label);
  });

  const existing = (entries || []).filter((e) => e.type === "schedule" && e.anniversaryKey && e.companyName === groupId);
  const existingByKey = new Map(existing.map((e) => [e.anniversaryKey, e]));

  const writes = milestones.map((row) => {
    const found = existingByKey.get(row.label);
    if (found) {
      existingByKey.delete(row.label);
      if (found.date !== row.date) return updatePlannerEntry(found.id, { date: row.date });
      return null;
    }
    return addPlannerEntry({
      type: "schedule", companyName: groupId, title: `사랑한지 ${row.label}`,
      date: row.date, memo: "", recurring: false, anniversaryKey: row.label, createdByName: "타임라인",
    });
  }).filter(Boolean);

  // 목록에 더 이상 없는(예: 계산 규칙이 바뀐) 옛 자동등록 항목은 정리.
  existingByKey.forEach((e) => writes.push(deletePlannerEntry(e.id)));

  await Promise.all(writes);
}

// 매월 14일마다 이름 붙은 "커플 기념일" 시리즈 — 오늘 기준 다음 순서가 언제인지,
// 지난 14일부터 얼마나 진행됐는지(%)를 계산한다.
const DAY14_NAMES = ["다이어리데이", "발렌타인데이", "화이트데이", "블랙데이", "로즈데이", "키스데이", "실버데이", "그린데이", "포토데이", "와인데이", "무비데이", "허그데이"];

export function next14DayInfo(todayStrArg) {
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = new Date((todayStrArg || todayStr()) + "T00:00:00");
  let candidate = new Date(today.getFullYear(), today.getMonth(), 14);
  if (candidate < today) candidate = new Date(today.getFullYear(), today.getMonth() + 1, 14);
  const prevCandidate = new Date(candidate.getFullYear(), candidate.getMonth() - 1, 14);
  const cycleLen = Math.max(1, Math.round((candidate - prevCandidate) / 86400000));
  const elapsed = Math.round((today - prevCandidate) / 86400000);
  const daysLeft = Math.round((candidate - today) / 86400000);
  const pct = Math.min(100, Math.max(0, Math.round((elapsed / cycleLen) * 100)));
  return { name: DAY14_NAMES[candidate.getMonth()], daysLeft, pct, date: fmt(candidate) };
}

// ────────────────────────────────────────────────
// 10. 매치 게임(구슬 터뜨리기) — 각자 60초 동안 혼자 플레이하고, 최고 점수를
// 기록해서 배우자와 점수로 겨룬다(동시 조작이 아니라 "누가 더 잘 터뜨렸나" 비교
// 방식이라 실시간 트랜잭션 없이 내 점수만 기록하면 된다).
// ────────────────────────────────────────────────
// ⭐ 라운드(=지금 걸린 내기 단위) 점수도 같이 남긴다 — 둘 다 이번 라운드에 점수를
// 남기면 그 순간 승부가 갈리고 승/패/무 전적에 반영된다. otherUid를 안 넘기면
// (배우자가 아직 없는 등) 라운드 판정 없이 누적 기록만 남긴다.
export async function submitMatchGameScore(groupId, uid, name, score, otherUid) {
  const scoreRef = doc(db, PLANNER_GAME_SCORES, groupId);
  const stateRef = doc(db, PLANNER_GAME_STATE, groupId);
  await runTransaction(db, async (tx) => {
    const scoreSnap = await tx.get(scoreRef);
    const stateSnap = await tx.get(stateRef);
    const scores = scoreSnap.exists() ? { ...scoreSnap.data() } : {};
    const state = stateSnap.exists() ? stateSnap.data() : {};
    const cur = scores[uid]?.matchGame || { best: 0, plays: 0, wins: 0, losses: 0, draws: 0 };
    scores[uid] = {
      ...(scores[uid] || {}),
      name: name || scores[uid]?.name || "",
      matchGame: { ...cur, best: Math.max(cur.best || 0, score), lastScore: score, plays: (cur.plays || 0) + 1 },
    };

    const round = state.matchRound || { scores: {} };
    const roundScores = { ...(round.scores || {}), [uid]: score };
    let nextRound = { ...round, scores: roundScores };

    if (otherUid && roundScores[otherUid] != null && !round.settled) {
      const mine = roundScores[uid], theirs = roundScores[otherUid];
      const myGame = scores[uid].matchGame;
      const otherPrev = scores[otherUid]?.matchGame || { best: 0, plays: 0, wins: 0, losses: 0, draws: 0 };
      if (mine > theirs) {
        scores[uid].matchGame = { ...myGame, wins: (myGame.wins || 0) + 1 };
        scores[otherUid] = { ...(scores[otherUid] || {}), matchGame: { ...otherPrev, losses: (otherPrev.losses || 0) + 1 } };
      } else if (mine < theirs) {
        scores[uid].matchGame = { ...myGame, losses: (myGame.losses || 0) + 1 };
        scores[otherUid] = { ...(scores[otherUid] || {}), matchGame: { ...otherPrev, wins: (otherPrev.wins || 0) + 1 } };
      } else {
        scores[uid].matchGame = { ...myGame, draws: (myGame.draws || 0) + 1 };
        scores[otherUid] = { ...(scores[otherUid] || {}), matchGame: { ...otherPrev, draws: (otherPrev.draws || 0) + 1 } };
      }
      nextRound.settled = true;
    }

    tx.set(scoreRef, scores, { merge: true });
    tx.set(stateRef, { ...state, matchRound: nextRound }, { merge: true });
  });
}

// 라운드가 끝난 뒤(둘 다 플레이 완료) 다시 도전할 때 — 같은 내기로 점수만 새로
// 초기화한다. 아직 아무도 안 낸 라운드에서는 호출할 필요 없다(이미 비어있음).
export async function startNewMatchRound(groupId, betText) {
  await setDoc(doc(db, PLANNER_GAME_STATE, groupId), {
    matchRound: { betText: betText || "", scores: {}, settled: false },
  }, { merge: true });
}

// ⭐ 상대가 기다리는 동안 "지켜보기"를 누르면 실시간으로 화면을 볼 수 있게,
// 플레이 중인 사람의 보드/점수/남은시간을 짧은 주기로 같이 저장해둔다. 조작하는
// 사람 쪽에서만 쓰고, 게임이 끝나면(닫기/시간종료) 지워서 다음 판 대기화면과
// 안 섞이게 한다. 실패해도(오프라인 등) 게임 자체 진행에는 영향 없어야 해서
// 에러는 조용히 무시한다.
export async function updateLiveMatchSnapshot(groupId, uid, name, snapshot) {
  if (!groupId) return;
  try {
    await setDoc(doc(db, PLANNER_GAME_STATE, groupId), {
      liveMatch: { uid, name: name || "", ...snapshot, updatedAt: serverTimestamp() },
    }, { merge: true });
  } catch {}
}
export async function clearLiveMatchSnapshot(groupId) {
  if (!groupId) return;
  try {
    await setDoc(doc(db, PLANNER_GAME_STATE, groupId), { liveMatch: null }, { merge: true });
  } catch {}
}

// ────────────────────────────────────────────────
// 10. 연동 끊기 — 한쪽이 요청하면 상대방이 동의해야 실제로 끊어진다. 동의하면
// 이 가족(groupId)의 모든 데이터(가계부·일정·경조사·사이클·메신저·기분·
// 미션·타임캡슐·빚·지갑·미니게임·타임라인 사진 등)를 전부 지우고, 두 사람
// 모두 각자 새(빈) 그룹으로 분리된다. 되돌릴 수 없는 작업이다. 상대방이
// 거절하면 연동은 그대로 유지되고, 요청한 사람은 최고관리자에게 문의(에스컬
// 레이션)할 수 있다 — 관리자는 상대방 동의 없이 강제로 끊을 수 있다.
// ────────────────────────────────────────────────
export const PLANNER_UNLINK_REQUESTS = "plannerUnlinkRequests"; // 문서 id = groupId

export function usePlannerUnlinkRequest(groupId) {
  const [req, setReq] = useState(null);
  useEffect(() => {
    if (!groupId) { setReq(null); return; }
    const unsub = onSnapshot(doc(db, PLANNER_UNLINK_REQUESTS, groupId), (snap) => {
      setReq(snap.exists() ? snap.data() : null);
    }, () => {});
    return () => unsub();
  }, [groupId]);
  return req;
}

// 최고관리자가 관리자 메뉴에서 "관리자에게 문의"된 요청들을 한눈에 보기 위한 구독.
export function useEscalatedUnlinkRequests() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const q = query(collection(db, PLANNER_UNLINK_REQUESTS), where("adminRequested", "==", true));
    const unsub = onSnapshot(q, (snap) => {
      setRows(snap.docs.map((d) => ({ groupId: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, []);
  return rows;
}

// 비밀번호로 본인 확인(재인증) — 되돌릴 수 없는 연동 끊기 요청 전에 반드시 거친다.
async function verifyMyPassword(password) {
  const user = fbAuth.currentUser;
  if (!user || !user.email) throw new Error("로그인 정보를 확인할 수 없어요.");
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  } catch {
    throw new Error("비밀번호가 올바르지 않아요.");
  }
}

// 연동 끊기 요청 — 비밀번호 확인 후 상대방의 동의를 기다리는 상태가 된다.
export async function requestUnlink(groupId, uid, name, password) {
  await verifyMyPassword(password);
  await setDoc(doc(db, PLANNER_UNLINK_REQUESTS, groupId), {
    groupId, requestedByUid: uid, requestedByName: name || "",
    status: "pending", requestedAt: serverTimestamp(), respondedAt: null,
    adminRequested: false, adminRequestedAt: null,
  });
}

// 요청한 사람이 답이 오기 전에 스스로 취소한다.
export async function cancelUnlinkRequest(groupId) {
  await deleteDoc(doc(db, PLANNER_UNLINK_REQUESTS, groupId)).catch(() => {});
}

// 그룹의 모든 데이터를 지운다 — connectedGroupId 기준으로 흩어진 모든 컬렉션을
// 훑어서 지우는 되돌릴 수 없는 작업. 연동 끊기(동의/관리자 승인) 경로에서만 호출한다.
async function deleteAllGroupData(groupId) {
  if (!groupId) return;
  const byField = [
    [PLANNER_COLLECTION, "companyName"],
    [PLANNER_CYCLES, "groupId"],
    [PLANNER_MESSAGES, "groupId"],
    [PLANNER_MESSENGER_READS, "groupId"],
    [PLANNER_MOOD_CHECKS, "groupId"],
    [PLANNER_MOOD_NOTIFS, "groupId"],
    [PLANNER_MISSION_CHECKS, "groupId"],
    [PLANNER_TIME_CAPSULES, "groupId"],
    [PLANNER_DEBTS, "groupId"],
  ];
  for (const [name, field] of byField) {
    const snap = await getDocs(query(collection(db, name), where(field, "==", groupId)));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  }
  const singletonDocs = [PLANNER_SAVINGS_GOALS, PLANNER_WALLET, PLANNER_GAME_STATE, PLANNER_GAME_SCORES, PLANNER_TIMELINE_PHOTO];
  await Promise.all(singletonDocs.map((name) => deleteDoc(doc(db, name, groupId)).catch(() => {})));
}

// 두 사람 각자를 완전히 분리된 새(빈) 그룹으로 되돌린다 — 이후 서로 다시
// 만나지 않도록 각자 새 무작위 코드를 받는다.
async function detachMembersToFreshGroups(memberUids) {
  await Promise.all(
    (memberUids || []).map((uid) => updateDoc(doc(db, PLANNER_ACCOUNTS, uid), { groupId: randomGroupCode() }).catch(() => {}))
  );
}

// 상대방이 요청에 응답한다 — 동의하면 실제로 모든 데이터를 지우고 완전히
// 분리하고, 거절하면 연동은 그대로 유지된 채 상태만 남긴다.
export async function respondUnlink(groupId, memberUids, agree) {
  if (agree) {
    await deleteAllGroupData(groupId);
    await detachMembersToFreshGroups(memberUids);
    await deleteDoc(doc(db, PLANNER_UNLINK_REQUESTS, groupId)).catch(() => {});
  } else {
    await setDoc(doc(db, PLANNER_UNLINK_REQUESTS, groupId), { status: "declined", respondedAt: serverTimestamp() }, { merge: true });
  }
}

// 상대방이 거절했을 때, 요청한 사람이 최고관리자에게 문의(에스컬레이션)한다.
export async function escalateUnlinkToAdmin(groupId) {
  await setDoc(doc(db, PLANNER_UNLINK_REQUESTS, groupId), { adminRequested: true, adminRequestedAt: serverTimestamp() }, { merge: true });
}

// 최고관리자가 상대방 동의 없이 강제로 끊는다.
export async function adminForceUnlink(groupId, memberUids) {
  await deleteAllGroupData(groupId);
  await detachMembersToFreshGroups(memberUids);
  await deleteDoc(doc(db, PLANNER_UNLINK_REQUESTS, groupId)).catch(() => {});
}
