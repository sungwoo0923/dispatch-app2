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
  query, where, serverTimestamp, setDoc, runTransaction,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { plannerDb as db, plannerStorage as storage } from "./planner/plannerFirebase";

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
  const path = `kp-planner/${groupId}/receipts/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const r = ref(storage, path);
  await uploadBytes(r, file);
  return getDownloadURL(r);
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
  const path = `kp-planner/${groupId}/messages/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const r = ref(storage, path);
  await uploadBytes(r, file);
  return getDownloadURL(r);
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
export const MOOD_OPTIONS = [
  { value: "happy", label: "행복" },
  { value: "good", label: "좋음" },
  { value: "excited", label: "설렘" },
  { value: "normal", label: "보통" },
  { value: "tired", label: "지침" },
  { value: "anxious", label: "불안" },
  { value: "sad", label: "우울" },
  { value: "angry", label: "분노" },
];

export async function setPlannerMood(groupId, uid, name, date, mood) {
  await setDoc(doc(db, PLANNER_MOOD_CHECKS, `${groupId}_${uid}_${date}`), {
    groupId, uid, name: name || "", date, mood, updatedAt: serverTimestamp(),
  }, { merge: true });
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
export const WEEKLY_MISSIONS_ADULT = [
  "핸드폰 내려놓고 서로에게만 집중하는 밤 보내기",
  "서로에게 은밀한 칭찬 한마디씩 속삭여주기",
  "평소보다 오래, 진하게 안아주기",
  "서로 좋아하는 향으로 마사지 오일 발라 마사지해주기",
  "함께 샤워하거나 반신욕하며 오붓한 시간 보내기",
  "서로에게 듣고 싶은 말 한마디씩 해주기",
  "불 끄고 촛불만 켜둔 채 둘만의 시간 보내기",
  "서로 눈 맞추고 1분간 아무 말 없이 안아주기",
  "오늘 밤은 평소보다 스킨십에 조금 더 대담해지기",
  "서로에게 매력적이라고 생각하는 부분 말해주기",
  "잠들기 전 서로 귀에 대고 사랑한다고 속삭여주기",
  "함께 야한 농담 하나씩 주고받으며 웃기",
  "서로가 좋아하는 스킨십 방식 솔직하게 이야기해보기",
  "오늘 하루는 애칭으로만 서로 부르기",
  "서로에게 관능적인 춤 한 소절씩 춰주기",
  "손 마사지하며 서로 눈 계속 마주치기",
  "오늘 밤 데이트는 침대 위에서 마무리하기",
  "서로 옷 입은 채로 뒤에서 꼭 안아주고 목에 입맞춤하기",
  "서로에게 판타지(하고 싶은 것) 하나씩 살짝 말해보기",
  "오늘은 평소보다 애정표현을 스킨십으로 더 많이 하기",
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

function missionPoolFor(pool) {
  return pool === "adult" ? WEEKLY_MISSIONS_ADULT : WEEKLY_MISSIONS;
}

// 이번 주 미션 상태(문구/완료여부/성인모드 여부)를 실시간 구독한다. 문서가 아직
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

  const pool = state?.pool === "adult" ? "adult" : "normal";
  const list = missionPoolFor(pool);
  const index = Number.isInteger(state?.missionIndex) ? state.missionIndex : hashStr(weekKey) % list.length;
  const text = list[index] || list[0];

  return { weekKey, text, pool, index, done: !!state?.done, doneByName: state?.doneByName || "" };
}

// 새로고침 — 같은 주 안에서 다른 미션으로 무작위 교체(완료 여부는 초기화).
export async function rerollWeekMission(groupId, weekKey, pool, currentIndex) {
  const list = missionPoolFor(pool);
  let index = Math.floor(Math.random() * list.length);
  // 방금 본 것과 똑같은 게 다시 나오면 새로고침한 느낌이 안 나니, 목록이 2개
  // 이상이면 현재 인덱스와 겹치지 않을 때까지 다시 뽑는다.
  if (list.length > 1 && Number.isInteger(currentIndex)) {
    while (index === currentIndex) index = Math.floor(Math.random() * list.length);
  }
  await setDoc(doc(db, PLANNER_MISSION_CHECKS, `${groupId}_${weekKey}`), {
    groupId, weekKey, pool, missionIndex: index, done: false, doneByName: "", doneAt: null,
  }, { merge: true });
}

// 성인 모드 on/off — 바뀌는 즉시 그 모드의 미션으로 새로 하나 뽑아준다.
export async function setWeekMissionPool(groupId, weekKey, pool) {
  await rerollWeekMission(groupId, weekKey, pool);
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
// 7. 지갑 — 기준 재산(+마이너스통장 채무)을 설정해두면, 수입·지출 내역이 실제로
// 등록/삭제될 때마다 자동으로 반영되는 잔액을 보여준다. 예전엔 입금/출금을
// 따로 기록해서 누적하는 방식이었는데, "수입·지출 내역과 연동돼야 한다"는
// 피드백으로 폐기 — 기준 재산·마이너스통장은 가족당 문서 하나(id=groupId)만
// 두고, 잔액은 그때그때 income/expense 합계로 계산한다(별도 내역 없음).
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

// overdraftDebt(마이너스통장으로 쓴 빚)는 잔액에서 빼야 하는 금액이라 항상
// 0 이상의 절대값으로 저장한다(양수로 입력받아 계산할 때만 빼줌).
export async function setPlannerWallet(groupId, { baseAssets, overdraftDebt }, actorName) {
  await setDoc(doc(db, PLANNER_WALLET, groupId), {
    groupId,
    baseAssets: Number(baseAssets) || 0,
    overdraftDebt: Math.abs(Number(overdraftDebt) || 0),
    setByName: actorName || "", updatedAt: serverTimestamp(),
  }, { merge: true });
}

// 지갑 잔액 = 기준 재산 - 마이너스통장 빚 + (그 기간의) 수입 - 지출.
// wallet이 아예 설정 안 됐으면 null(= "지갑 미설정" 의미, 화면에서 구분해서 씀).
export function computeWalletBalance(wallet, totalIncome, totalExpense) {
  if (!wallet) return null;
  return (wallet.baseAssets || 0) - (wallet.overdraftDebt || 0) + (Number(totalIncome) || 0) - (Number(totalExpense) || 0);
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

export async function uploadTimelinePhoto(groupId, file) {
  const path = `kp-planner/${groupId}/timeline/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const r = ref(storage, path);
  await uploadBytes(r, file);
  const url = await getDownloadURL(r);
  await setTimelinePhoto(groupId, url);
  return url;
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
export async function submitMatchGameScore(groupId, uid, name, score) {
  const scoreRef = doc(db, PLANNER_GAME_SCORES, groupId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(scoreRef);
    const scores = snap.exists() ? { ...snap.data() } : {};
    const cur = scores[uid]?.matchGame || { best: 0, plays: 0 };
    scores[uid] = {
      ...(scores[uid] || {}),
      name: name || scores[uid]?.name || "",
      matchGame: { best: Math.max(cur.best || 0, score), lastScore: score, plays: (cur.plays || 0) + 1 },
    };
    tx.set(scoreRef, scores, { merge: true });
  });
}
