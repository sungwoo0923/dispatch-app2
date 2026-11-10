// ======================= src/salesData.js =======================
// 💼 2026-11-10 영업팀 — 자료 불러오기(영업관리 화면 · 영업 대시보드 · 모바일 공용)
//  · useSalesOrders: 최근 12개월 배차완료 오더(우리 회사만 · 화면을 열 때 한 번, 10분 동안 기억) + 오늘 실시간 오더 + 고정거래처 매출
//  · useSalesPlan: 인센티브 규정 · 사람별 월 목표(salesPlans/{회사})
//  · useSalesRows: 거래처 담당(salesAccounts) · 영업 기회(salesLeads) · 활동(salesActivities) · 인센티브 확정(salesIncentives)
import React from "react";
import { collection, doc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db, auth, DEFAULT_COMPANY } from "./firebase";
import { useMyProfile, personName } from "./userNames";
import { useCompanyStaff } from "./InternalMail";
import { useCompanyRows } from "./companyColStore";
import { isPreviewMode } from "./fsTenant";
import { useRouteCarrierFilter } from "./routeCarriers";
import { normPolicy, ymOf, kstDay, orderDate, calcIncentive, clientHealth, canManageSales, isSalesUser, pipelineSummary } from "./salesCore";

// 회사 데이터 컬렉션(거래처·고정거래처) — 회사명이 없는 예전 문서도 있어 조건 없이 구독하고 회사 거르기는 fsTenant가 한다
//  (배차 화면이 이미 같은 구독을 갖고 있어 다시 내려받지 않는다)
export function useTenantCol(name, company) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(collection(db, name), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([]));
  }, [name, company]);
  return rows;
}
const cache = new Map(); // 회사 → { at, rows }
const KEEP_MS = 10 * 60 * 1000;
const slim = (id, r, paid = null) => ({ _id: id, 수금: paid != null ? paid : (r.정산상태 && typeof r.정산상태 === "object" ? r.정산상태[orderDate(r).slice(0, 7)] : "") === "정산완료", 상차일: orderDate(r), 거래처명: r.거래처명 || "", 청구운임: r.청구운임 || 0, 기사운임: r.기사운임 || 0, 상차지명: r.상차지명 || "", 하차지명: r.하차지명 || "", 차량종류: r.차량종류 || "", 차량톤수: r.차량톤수 || "" });

export function useSalesOrders(company, liveRows = []) {
  const co = String(company || "").trim();
  const fixedRows = useTenantCol("fixedClients", co); // 고정거래처 매출(회사 것만)
  const carrierF = useRouteCarrierFilter(co);
  const [state, setState] = React.useState(() => { const c = cache.get(co); return c && Date.now() - c.at < KEEP_MS ? c : null; });
  const [loading, setLoading] = React.useState(false);
  const load = React.useCallback(async (force = false) => {
    if (!co) return;
    const c = cache.get(co);
    if (!force && c && Date.now() - c.at < KEEP_MS) { setState(c); return; }
    setLoading(true);
    try {
      const from = `${ymOf(-11)}-01`; const to = `${ymOf(0)}-31`;
      const snaps = await Promise.all(["orders", "dispatch"].map((col) => getDocs(query(collection(db, col), where("상차일", ">=", from), where("상차일", "<=", to)))));
      const seen = new Set(); const rows = [];
      snaps.forEach((sn) => sn.docs.forEach((d) => {
        if (seen.has(d.id)) return; seen.add(d.id);
        const r = d.data() || {};
        if ((r.companyName || DEFAULT_COMPANY) === co && r.배차상태 === "배차완료" && r.source !== "transport_transmit" && carrierF.isCountable(r)) rows.push(slim(d.id, r));
      }));
      const next = { at: Date.now(), rows };
      cache.set(co, next); setState(next);
    } catch { setState((s) => s || { at: 0, rows: [] }); } finally { setLoading(false); }
  }, [co, carrierF]);
  React.useEffect(() => { if (co && carrierF.ready) load(false); }, [co, carrierF.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = React.useMemo(() => {
    if (!state) return null;
    const seen = new Set(state.rows.map((r) => r._id));
    // 불러온 뒤에 배차완료된 오늘 오더(실시간) — 같은 오더는 한 번만
    const live = (liveRows || []).filter((r) => (r._id || r.id) && !seen.has(r._id || r.id) && r.배차상태 === "배차완료" && r.source !== "transport_transmit" && carrierF.isCountable(r)).map((r) => slim(r._id || r.id, r));
    const fixed = (fixedRows || []).filter((r) => (r.companyName || DEFAULT_COMPANY) === co).map((r, i) => slim(`fx-${r.id || i}`, { ...r, 상차일: r.날짜 || r.상차일 }, true));
    return [...state.rows, ...live, ...fixed];
  }, [state, liveRows, fixedRows, carrierF]);
  return { rows, loading, at: state?.at || 0, reload: () => load(true), today: kstDay() };
}

export function useSalesPlan(company) {
  const co = String(company || "").trim();
  const [plan, setPlan] = React.useState(null);
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(doc(db, "salesPlans", co), (s) => setPlan(s.exists() ? s.data() : {}), () => setPlan({}));
  }, [co]);
  return React.useMemo(() => ({ ready: plan != null, raw: plan || {}, policy: normPolicy(plan?.policy), targets: plan?.targets || {}, saved: !!plan?.policy }), [plan]);
}
// 사람·달 목표(없으면 그 사람 기본 목표 → 0)
export const targetOf = (targets, uid, ym) => Number(targets?.[uid]?.[ym] ?? targets?.[uid]?.default ?? 0) || 0;

// 인센티브 확정 기록 — 영업 관리 권한은 회사 전체, 그 밖에는 본인 것만(보안 규칙도 같은 기준)
function useIncentiveRows(company, uid, all) {
  const co = String(company || "").trim();
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!co || (!all && !uid)) { setRows([]); return undefined; }
    const qs = [where("companyName", "==", co), ...(all ? [] : [where("uid", "==", uid)])];
    return onSnapshot(query(collection(db, "salesIncentives"), ...qs), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([]));
  }, [co, uid, all]);
  return rows;
}
export function useSalesRows(company, who = null) {
  const accounts = useCompanyRows("salesAccounts", company);
  const leads = useCompanyRows("salesLeads", company);
  const activities = useCompanyRows("salesActivities", company);
  const incentives = useIncentiveRows(company, who?.uid || "", !!who?.canManage);
  return { accounts: accounts || [], leads: leads || [], activities: activities || [], incentives: incentives || [], ready: !!accounts && !!leads && !!activities && !!incentives };
}

// ─── 나 · 영업 담당자 목록 · 한 번에 계산 ───

// 지금 로그인한 사람 — 영업 관리 권한(영업관리자·운송관리자·통합관리자·최고관리자·회사 마스터·임원 화면)
export function useSalesMe({ exec = false } = {}) {
  const uid = auth?.currentUser?.uid || (isPreviewMode() ? "preview" : ""); // 둘러보기(승인 전·화면 점검)는 가짜 계정
  const prof = useMyProfile(auth?.currentUser?.uid || "");
  let role = ""; try { role = localStorage.getItem("role") || ""; } catch { /* 무시 */ }
  role = prof?.role || role;
  return React.useMemo(() => ({ uid, name: personName(prof) || auth?.currentUser?.displayName || "", role, team: prof?.team || "", canManage: canManageSales({ role, isMaster: prof?.isMaster === true, exec }) }), [uid, prof, role, exec]);
}
// 영업 담당자 — 영업팀(부서·권한) + 거래처를 맡고 있는 사람
export function useSalesReps(company, accounts = []) {
  const staff = useCompanyStaff(company);
  return React.useMemo(() => {
    const list = staff || [];
    const has = new Set((accounts || []).map((a) => a.uid));
    const reps = list.filter((u) => isSalesUser(u) || has.has(u.uid)).map((u) => ({ uid: u.uid, name: personName(u) || u.email || "", team: u.team || "", position: u.position || "", role: u.role || "" }));
    // 퇴사 등으로 명부에 없는 담당자도 실적은 남긴다
    (accounts || []).forEach((a) => { if (a.uid && !reps.some((r) => r.uid === a.uid)) reps.push({ uid: a.uid, name: a.name || "(명부에 없음)", team: "", position: "", role: "", gone: true }); });
    return { reps, staff: list.map((u) => ({ uid: u.uid, name: personName(u) || u.email || "", team: u.team || "", position: u.position || "" })), ready: !!staff };
  }, [staff, accounts]);
}
// 화면에서 바로 쓰는 묶음 — 오더 · 규정 · 담당 · 기회 · 활동 + calc(uid, ym) · team(ym)
export function useSalesBoard(company, liveRows = [], clients = null, who = null) {
  const O = useSalesOrders(company, liveRows);
  const plan = useSalesPlan(company);
  const R = useSalesRows(company, who);
  const clientRows = useTenantCol("clients", clients ? "" : company);
  const cl = React.useMemo(() => (clients || clientRows || []).filter((c) => (c.companyName || DEFAULT_COMPANY) === String(company || "").trim()), [clients, clientRows, company]);
  const { reps, staff, ready: staffReady } = useSalesReps(company, R.accounts);
  return React.useMemo(() => {
    const orders = O.rows || [];
    const calc = (uid, ym) => calcIncentive({ orders, accounts: R.accounts, policy: plan.policy, uid, ym, target: targetOf(plan.targets, uid, ym) });
    const team = (ym) => reps.map((r) => ({ ...r, ...calc(r.uid, ym) })).sort((a, b) => b.sale - a.sale);
    const health = (ym) => clientHealth({ orders, accounts: R.accounts, clients: cl, ym, policy: plan.policy });
    const pipe = (uid) => pipelineSummary(uid ? R.leads.filter((l) => l.ownerUid === uid) : R.leads);
    return { ...R, orders, clients: cl, plan, policy: plan.policy, targets: plan.targets, reps, staff, calc, team, health, pipe, ready: !!O.rows && plan.ready && R.ready && staffReady, loading: O.loading, at: O.at, reload: O.reload };
  }, [O.rows, O.loading, O.at, plan, R, cl, reps, staff, staffReady]); // eslint-disable-line react-hooks/exhaustive-deps
}
