// ======================= pnk-site/src/pnkApi.js =======================
// PnK PROJECT 인트라넷 — 데이터 읽기/쓰기 모음.
//  컬렉션(모두 pnk 로 시작 · 규칙: firestore.rules 의 "PnK PROJECT 인트라넷" 묶음)
//   pnkMembers/{uid}   구성원  { uid, email, name, dept, title, phone, role: owner|admin|staff, status: pending|active|off }
//   pnkPosts/{id}      공지·게시판·회의록  { board, title, body, pinned, authorUid, authorName, createdAt, updatedAt }
//     └ comments/{id}  댓글  { body, authorUid, authorName, createdAt }
//   pnkFiles/{id}      자료실  { name, category, note, adminOnly, storagePath, size, contentType, uploaderUid, uploaderName, createdAt }
//   pnkTasks/{id}      업무  { title, desc, status: todo|doing|done, product, priority, assigneeUid, assigneeName, due, createdBy }
//   pnkEvents/{id}     일정  { title, date, endDate, time, type, memo, createdBy }
//   pnkCompany/info    회사 정보(구성원 모두 읽기) · pnkCompany/secure 계좌·인증 정보(관리자만)
//   pnkFinance/{id}    매출·비용 장부(관리자만)  { date, kind: income|expense, category, product, amount, memo }
import React from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { auth, db } from "./firebase";

// 최고관리자(대표) 이메일 — firestore.rules isTotalMasterUser() 와 같은 기준(규칙이 서버에서 다시 확인한다)
export const OWNER_EMAILS = ["tjddnqkf@naver.com"];

export const ROLE_LABEL = { owner: "대표", admin: "관리자", staff: "직원" };
export const STATUS_LABEL = { pending: "승인 대기", active: "사용 중", off: "사용 중지" };

export const PRODUCTS = [
  { key: "common", label: "공통" },
  { key: "logisweb", label: "로지스웹" },
  { key: "hub", label: "로지스웹 허브" },
  { key: "homepage", label: "공식 홈페이지" },
  { key: "driver", label: "기사앱" },
];
export const productLabel = (k) => PRODUCTS.find((p) => p.key === k)?.label || "공통";

export const BOARDS = [
  { key: "notice", label: "사내 공지", adminWrite: true },
  { key: "free", label: "자유게시판" },
  { key: "minutes", label: "회의록" },
];
export const boardLabel = (k) => BOARDS.find((b) => b.key === k)?.label || k;

export const FILE_CATS = ["회사 서류", "계약서", "세무·회계", "디자인·로고", "개발 문서", "기타"];
export const EVENT_TYPES = [
  { key: "meeting", label: "회의", dot: "bg-navy-700" },
  { key: "release", label: "배포·출시", dot: "bg-emerald-600" },
  { key: "deadline", label: "마감", dot: "bg-rose-600" },
  { key: "leave", label: "휴가", dot: "bg-amber-500" },
  { key: "etc", label: "기타", dot: "bg-slate-400" },
];

// 사내메일 주소 — 구성원마다 pnkMembers.mailId(예: pathkey) → pathkey@logisweb.co.kr
//  지금은 구성원끼리만 오간다(인트라넷 안에 저장). 외부 주소로 보내기 · 받기는 도메인(DNS) 연결 후 켠다(pnkCompany/info.mailExternal).
export const MAIL_DOMAIN = "logisweb.co.kr";
export const mailAddr = (m) => (m?.mailId ? `${m.mailId}@${MAIL_DOMAIN}` : "");

// 영업 단계(파이프라인)
export const SALES_STAGES = [
  { key: "lead", label: "발굴", p: 0.1 },
  { key: "contact", label: "첫 연락", p: 0.2 },
  { key: "demo", label: "시연 · 체험", p: 0.4 },
  { key: "proposal", label: "견적 · 제안", p: 0.6 },
  { key: "contract", label: "계약 진행", p: 0.85 },
  { key: "won", label: "도입 완료", p: 1 },
  { key: "lost", label: "보류 · 실패", p: 0 },
];
export const stageLabel = (k) => SALES_STAGES.find((s) => s.key === k)?.label || k;

// 서비스(제품) — 서비스 현황 화면 · 업무/영업 분류
export const SERVICES = [
  { key: "logisweb", label: "로지스웹", sub: "운송 · 배차 · 정산 프로그램", url: "https://app.logisweb.co.kr", icon: "truck" },
  { key: "hub", label: "로지스웹 허브", sub: "운송사 간 오더 공유", url: "https://hub.logisweb.co.kr", icon: "link" },
  { key: "homepage", label: "공식 홈페이지", sub: "소개 · 체험 신청", url: "https://www.logisweb.co.kr", icon: "globe" },
  { key: "driver", label: "로지스웹 기사앱", sub: "안드로이드 · 아이폰", url: "https://github.com/sungwoo0923/dispatch-app2/releases/download/driver-apk-latest/LogisWeb-Driver.apk", icon: "phone" },
];
export const SERVICE_STATUS = [
  { key: "ok", label: "정상", tone: "green" },
  { key: "check", label: "점검 중", tone: "navy" },
  { key: "issue", label: "장애", tone: "red" },
];

// 대시보드 바로가기 기본값 — 회사 정보 화면에서 바꿀 수 있다(pnkCompany/info.links)
export const DEFAULT_LINKS = [
  { label: "로지스웹", sub: "운송 프로그램", url: "https://app.logisweb.co.kr" },
  { label: "로지스웹 허브", sub: "오더 공유", url: "https://hub.logisweb.co.kr" },
  { label: "공식 홈페이지", sub: "logisweb.co.kr", url: "https://www.logisweb.co.kr" },
  { label: "관리자 관리센터", sub: "고객사 · 청구 · 운영", url: "https://app.logisweb.co.kr/platform" },
];

// ───────────────────────── 날짜 · 숫자 ─────────────────────────
const pad = (n) => String(n).padStart(2, "0");
// ⭐ 날짜 · 시각은 로지스웹 프로그램과 같이 한국 시간(KST, UTC+9) 기준 — 해외에서 접속해도 같은 날짜로 보인다
const kst = (d) => new Date(d.getTime() + 9 * 3600e3);
export const ymd = (d = new Date()) => { const k = kst(d); return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`; };
export const hm = (d = new Date()) => { const k = kst(d); return `${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`; };
export const kstDateTime = (ts) => { const d = toDate(ts); if (!d) return ""; const k = kst(d); return `${ymd(d)} ${["일", "월", "화", "수", "목", "금", "토"][k.getUTCDay()]} ${hm(d)}`; };
export const toDate = (ts) => (ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null);
export function fmtTime(ts) {
  const d = toDate(ts);
  if (!d) return "";
  const day = ymd(d);
  if (day === ymd()) return hm(d);
  return day.slice(2).replace(/-/g, ".");
}
export const won = (n) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}원`;
export const num = (v) => Number(String(v ?? "").replace(/[^\d-]/g, "")) || 0;

// ───────────────────────── 로그인 · 내 구성원 정보 ─────────────────────────
// 반환: { loading, user, member, isOwner, isAdmin, active }
//  · 대표(최고관리자)는 처음 들어오면 구성원 문서를 자동으로 만든다(role owner)
//  · 다른 계정은 [가입 요청]을 눌러야 pending 문서가 생기고, 관리자가 승인하면 active
export function useMe() {
  const [st, setSt] = React.useState({ loading: true, user: null, member: null });
  React.useEffect(() => {
    let unsubMember = null;
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubMember) { unsubMember(); unsubMember = null; }
      if (!user) { setSt({ loading: false, user: null, member: null }); return; }
      let owner = OWNER_EMAILS.includes(String(user.email || "").toLowerCase());
      if (!owner) {
        try { const u = await getDoc(doc(db, "users", user.uid)); owner = u.exists() && u.data().role === "totalMaster"; } catch { /* 권한 없음 = 대표 아님 */ }
      }
      const ref = doc(db, "pnkMembers", user.uid);
      unsubMember = onSnapshot(ref, async (s) => {
        if (!s.exists() && owner) {
          await setDoc(ref, {
            uid: user.uid, email: user.email || "", name: user.displayName || "대표", dept: "경영", title: "대표",
            phone: "", role: "owner", status: "active", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          }).catch(() => {});
          return;
        }
        setSt({ loading: false, user, owner, member: s.exists() ? { id: s.id, ...s.data() } : null });
      }, () => setSt({ loading: false, user, owner, member: null }));
    });
    return () => { unsubAuth(); if (unsubMember) unsubMember(); };
  }, []);
  const m = st.member;
  const active = !!st.owner || m?.status === "active";
  const isAdmin = !!st.owner || (active && (m?.role === "owner" || m?.role === "admin"));
  return { ...st, active, isAdmin, isOwner: !!st.owner || m?.role === "owner" };
}

export function requestJoin(user, info) {
  return setDoc(doc(db, "pnkMembers", user.uid), {
    uid: user.uid, email: user.email || "", name: info.name.trim(), dept: info.dept.trim(), title: info.title.trim(),
    phone: info.phone.trim(), role: "staff", status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

// ───────────────────────── 실시간 목록 ─────────────────────────
// useCol("pnkPosts", [where(...), orderBy(...)]) → 배열(불러오는 중이면 null)
export function useCol(name, constraints = [], deps = []) {
  const [rows, setRows] = React.useState(null);
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    if (!name) return undefined;
    setRows(null);
    return onSnapshot(query(collection(db, name), ...constraints), (s) => {
      setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })));
      setErr("");
    }, (e) => { setRows([]); setErr(e.code === "permission-denied" ? "권한이 없습니다." : e.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, ...deps]);
  return [rows, err];
}

export function useDocLive(path) {
  const [v, setV] = React.useState(undefined);
  React.useEffect(() => {
    if (!path) return undefined;
    return onSnapshot(doc(db, ...path.split("/")), (s) => setV(s.exists() ? { id: s.id, ...s.data() } : null), () => setV(null));
  }, [path]);
  return v;
}

// ───────────────────────── 쓰기 도우미 ─────────────────────────
export const by = (me) => ({ uid: me.user.uid, name: me.member?.name || me.user.email || "" });

export const addRow = (name, data) => addDoc(collection(db, name), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
export const patchRow = (name, id, data) => updateDoc(doc(db, name, id), { ...data, updatedAt: serverTimestamp() });
export const removeRow = (name, id) => deleteDoc(doc(db, name, id));
export const saveDoc = (path, data) => setDoc(doc(db, ...path.split("/")), { ...data, updatedAt: serverTimestamp() }, { merge: true });

// ───────────────────────── 고객사(가입자) 현황 — 관리자 관리센터(/platform)와 같은 데이터 ─────────────────────────
//  users · transportApplications · companyApplications · landingInquiries · companyPlans · platformInvoices · errorReports · supportRequests
//  ⚠ 규칙상 최고관리자(대표) 계정만 읽힌다. 다른 구성원은 null 이 돌아오고 화면은 "대표 계정 전용"으로 보인다.
//  읽기만 한다 — 승인 · 요금제 변경 · 청구 처리는 관리자 관리센터에서(같은 버튼을 두 곳에 두지 않는다).
const tsMs = (v) => (v?.toMillis ? v.toMillis() : typeof v === "number" ? v : v ? Date.parse(v) || 0 : 0);
const normCo = (s) => String(s || "").replace(/\s+/g, " ").trim();
const TM_EMAIL = OWNER_EMAILS[0];
let platformCache = null; // 화면을 옮겨 다닐 때 다시 읽지 않게(새로고침 버튼은 강제로 다시 읽음)
export async function loadPlatform(force = false) {
  if (platformCache && !force && Date.now() - platformCache.at < 5 * 60e3) return platformCache.data;
  const safe = async (q) => { try { return (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() })); } catch { return null; } };
  const [users, tApps, cApps, inquiries, plans, invoices, errors, support] = await Promise.all([
    safe(collection(db, "users")),
    safe(collection(db, "transportApplications")),
    safe(collection(db, "companyApplications")),
    safe(query(collection(db, "landingInquiries"), orderBy("createdAt", "desc"), limit(300))),
    safe(collection(db, "companyPlans")),
    safe(collection(db, "platformInvoices")),
    safe(query(collection(db, "errorReports"), orderBy("createdAt", "desc"), limit(200))),
    safe(query(collection(db, "supportRequests"), orderBy("createdAt", "desc"), limit(100))),
  ]);
  if (!users) return null; // 대표가 아니면 users 전체를 못 읽는다
  const companies = {};
  const rec = (name) => companies[name] || (companies[name] = { name, staff: 0, admins: 0, pending: 0, drivers: 0, quit: 0, firstAt: 0, lastSignup: 0, plan: null, invoices: [], rep: "", phone: "" });
  const monthly = {}; // YYYY-MM → { staff, drivers, companies }
  const bump = (at, k) => { if (!at) return; const m = ymd(new Date(at)).slice(0, 7); (monthly[m] || (monthly[m] = { staff: 0, drivers: 0, companies: 0 }))[k] += 1; };
  let shipperUsers = 0;
  users.forEach((u) => {
    if (u.role === "totalMaster" || u.email === TM_EMAIL || u.role === "cafeUser") return;
    if (u.role === "shipper") { shipperUsers += 1; return; }
    const c = rec(normCo(u.companyName) || "돌캐");
    const at = tsMs(u.createdAt);
    c.lastSignup = Math.max(c.lastSignup, at);
    c.firstAt = c.firstAt ? Math.min(c.firstAt, at || c.firstAt) : at;
    if (u.role === "driver") { c.drivers += 1; bump(at, "drivers"); return; }
    if (u.employmentStatus === "퇴사") { c.quit += 1; return; }
    c.staff += 1; bump(at, "staff");
    if (u.role === "admin") c.admins += 1;
    if (u.approved === false) c.pending += 1;
  });
  (tApps || []).forEach((a) => {
    const n = normCo(a.companyName); if (!n || a.status === "rejected") return;
    const c = companies[n]; if (!c) return;
    c.rep = c.rep || a.representative || a.name || ""; c.phone = c.phone || a.phone || "";
    if (a.type === "신규") { const at = tsMs(a.createdAt); if (at) c.firstAt = c.firstAt ? Math.min(c.firstAt, at) : at; }
  });
  (plans || []).forEach((p) => { const c = companies[normCo(p.id)]; if (c) c.plan = p; });
  (invoices || []).forEach((v) => { const c = companies[normCo(v.company)]; if (c) c.invoices.push(v); });
  const list = Object.values(companies).filter((c) => c.staff || c.drivers || c.pending);
  list.forEach((c) => bump(c.firstAt, "companies"));
  return (platformCache = { at: Date.now(), data: {
    at: Date.now(), companies: list, monthly, shipperUsers,
    pendingTransport: (tApps || []).filter((a) => a.status === "pending"),
    pendingShipper: (cApps || []).filter((a) => a.status === "pending"),
    inquiries: inquiries || [], invoices: invoices || [], errors: errors || [],
    support: (support || []).filter((r) => r.status === "pending"),
    totals: {
      companies: list.length,
      staff: list.reduce((a, c) => a + c.staff, 0),
      drivers: list.reduce((a, c) => a + c.drivers, 0),
      pendingStaff: list.reduce((a, c) => a + c.pending, 0),
      newInquiries: (inquiries || []).filter((q) => !q.status || q.status === "신규").length,
      openErrors: (errors || []).filter((r) => r.status !== "done").length,
    },
  } }).data;
}
export { tsMs };

// 수납 관리(platformInvoices) 월별 합계 — loadPlatform 결과에서 계산
export function invoiceByMonth(invoices) {
  const out = {};
  (invoices || []).forEach((v) => {
    if (!v.month) return;
    const o = out[v.month] || (out[v.month] = { month: v.month, billed: 0, paid: 0, overdue: 0, count: 0 });
    const amt = Number(v.amount) || 0;
    o.count += 1;
    if (v.status === "입금완료") o.paid += amt;
    if (v.status === "연체") o.overdue += amt;
    if (v.status && v.status !== "미청구") o.billed += amt;
  });
  return out;
}

export { where, orderBy, limit };
