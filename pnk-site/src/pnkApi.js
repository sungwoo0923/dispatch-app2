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
import { auth, callFn, db } from "./firebase";

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

// 사내메일 주소 — 구성원마다 pnkMembers.mailId(예: pathkey) → pathkey@pnkproject.com
//  지금은 구성원끼리만 오간다(인트라넷 안에 저장). 외부 주소로 보내기 · 받기는 도메인(DNS) 연결 후 켠다(pnkCompany/info.mailExternal).
export const MAIL_DOMAIN = "pnkproject.com"; // PnK PROJECT 회사 도메인(가비아)
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

// ───────────────────────── 전자결재 ─────────────────────────
//  pnkApprovals: { form, title, body, fields{}, amount, authorUid, authorName, authorEmpNo, dept,
//                  line:[{ uid, name, title, status: wait|approved|rejected, at, comment }], step, cc:[{uid,name}], viewers:[uid],
//                  status: pending|approved|rejected|canceled, docNo, createdAt, doneAt }
export const APPROVAL_FORMS = [
  { key: "general", label: "일반 품의서", icon: "file", hint: "업무 진행 · 결정이 필요한 내용" },
  { key: "expense", label: "지출 결의서", icon: "receipt", hint: "비용 사용 · 정산", amount: true },
  { key: "purchase", label: "구매 요청서", icon: "wallet", hint: "장비 · 소프트웨어 · 소모품 구매", amount: true },
  { key: "leave", label: "휴가 신청서", icon: "calendar", hint: "연차 · 반차 · 병가 · 경조사" },
  { key: "trip", label: "출장 신청서", icon: "route", hint: "외근 · 출장 · 고객사 방문" },
  { key: "report", label: "업무 보고서", icon: "chart", hint: "주간 · 월간 · 프로젝트 보고" },
  { key: "contract", label: "계약 검토 요청", icon: "stamp", hint: "고객 · 협력사 계약서 검토" },
];
export const formLabel = (k) => APPROVAL_FORMS.find((f) => f.key === k)?.label || "문서";
export const APPROVAL_STATUS = { pending: "진행 중", approved: "승인 완료", rejected: "반려", canceled: "회수" };

// ───────────────────────── 근태 · 휴가 ─────────────────────────
//  pnkAttendance/{uid}_{날짜}: { uid, name, empNo, dept, date, inAt(ms), outAt(ms), place: office|remote|outside, late, workMin, note }
//  휴가는 전자결재(form "leave")로 신청 → 승인 완료된 것만 사용 일수 · 일정에 반영
export const LEAVE_KINDS = [
  { key: "annual", label: "연차", days: 1 },
  { key: "half_am", label: "오전 반차", days: 0.5 },
  { key: "half_pm", label: "오후 반차", days: 0.5 },
  { key: "sick", label: "병가", days: 1, free: true },
  { key: "family", label: "경조사", days: 1, free: true },
  { key: "official", label: "공가(예비군 등)", days: 1, free: true },
  { key: "etc", label: "기타", days: 1 },
];
export const leaveLabel = (k) => LEAVE_KINDS.find((x) => x.key === k)?.label || "휴가";
export const PLACES = [{ key: "office", label: "사무실" }, { key: "remote", label: "재택" }, { key: "outside", label: "외근 · 출장" }];
export const DEFAULT_WORK = { start: "09:00", end: "18:00", annual: 15 };
// 휴가 일수(주말 빼고). 반차는 0.5
export function leaveDays(kind, from, to) {
  const k = LEAVE_KINDS.find((x) => x.key === kind);
  if (!from) return 0;
  if (k && k.days === 0.5) return 0.5;
  let n = 0;
  const end = Date.parse(`${to || from}T12:00:00Z`);
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= end && n < 400; t += 86400e3) { const w = new Date(t).getUTCDay(); if (w !== 0 && w !== 6) n += 1; }
  return n;
}

// 대시보드 바로가기 기본값 — 회사 정보 화면에서 바꿀 수 있다(pnkCompany/info.links)
export const DEFAULT_LINKS = [
  { label: "PnK PROJECT", sub: "회사 홈페이지", url: "https://www.pnkproject.com" },
  { label: "로지스웹", sub: "운송 프로그램", url: "https://app.logisweb.co.kr" },
  { label: "로지스웹 허브", sub: "오더 공유", url: "https://hub.logisweb.co.kr" },
  { label: "로지스웹 홈페이지", sub: "logisweb.co.kr", url: "https://www.logisweb.co.kr" },
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
// ⭐ 사번 — "PNK-0001" 형식. 대표(최고관리자)는 PNK-0001, 부관리자(관리자센터 subAdmin)는 다음 번호를 자동으로 받는다.
//  직원은 [가입 요청] → 대표 · 관리자가 승인하면서 사번을 준다(구성원 화면). 사번 색인 pnkEmpIndex/{사번} = { uid, email }
export const EMP_PREFIX = "PNK-";
export const normEmpNo = (v) => {
  const t = String(v || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return "";
  if (/^\d{1,6}$/.test(t)) return `${EMP_PREFIX}${t.padStart(4, "0")}`;
  const m = t.match(/^PNK-?(\d{1,6})$/);
  return m ? `${EMP_PREFIX}${m[1].padStart(4, "0")}` : t;
};
export async function nextEmpNo(prefer = 0) {
  const s = await getDocs(collection(db, "pnkEmpIndex"));
  const used = new Set(s.docs.map((d) => d.id));
  let n = prefer || 1;
  while (used.has(`${EMP_PREFIX}${String(n).padStart(4, "0")}`)) n += 1;
  return `${EMP_PREFIX}${String(n).padStart(4, "0")}`;
}
// 사번을 색인에 올리고 구성원 문서에 적는다(색인은 같은 번호를 두 번 못 만든다 — 규칙)
export async function assignEmpNo(member, empNo) {
  const no = normEmpNo(empNo);
  if (!/^PNK-\d{4,6}$/.test(no)) throw new Error("사번은 PNK-0001 형식으로 넣어 주세요");
  const idx = await getDoc(doc(db, "pnkEmpIndex", no)).catch(() => null);
  if (idx?.exists() && idx.data().uid !== member.uid) throw new Error(`${no} 은(는) 이미 다른 구성원의 사번입니다`);
  if (!idx?.exists()) await setDoc(doc(db, "pnkEmpIndex", no), { uid: member.uid, email: String(member.email || "").toLowerCase(), at: Date.now() });
  if (member.empNo && member.empNo !== no) await deleteDoc(doc(db, "pnkEmpIndex", member.empNo)).catch(() => {});
  return no;
}
// 로그인 칸에 사번을 넣으면 이메일로 바꾼다
export async function emailOfLogin(v) {
  const t = String(v || "").trim();
  if (t.includes("@")) return t;
  const s = await getDoc(doc(db, "pnkEmpIndex", normEmpNo(t)));
  if (!s.exists()) throw Object.assign(new Error("등록되지 않은 사번입니다"), { code: "pnk/no-empno" });
  return s.data().email;
}

// ───────────────────────── 로그인 · 내 구성원 정보 ─────────────────────────
// 반환: { loading, stage(0~4, 로딩 화면 단계), user, member, owner, isOwner, isAdmin, active, needEmpNo }
//  · 대표(최고관리자) · 부관리자는 처음 들어오면 구성원 문서 + 사번이 자동으로 생긴다
//  · 다른 계정은 [가입 요청] → pending, 관리자가 승인하면서 사번을 주면 active
export function useMe() {
  const [st, setSt] = React.useState({ loading: true, stage: 0, user: null, member: null });
  const resume = React.useRef(null);
  React.useEffect(() => {
    let unsubMember = null;
    let alive = true;
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubMember) { unsubMember(); unsubMember = null; }
      resume.current = null;
      if (!user) { setSt({ loading: false, stage: 1, user: null, member: null }); return; }
      setSt((p) => ({ ...p, loading: true, stage: 1, user, mfa: null }));
      let owner = OWNER_EMAILS.includes(String(user.email || "").toLowerCase());
      let sub = false;
      if (!owner) {
        try { const u = await getDoc(doc(db, "users", user.uid)); const d = u.exists() ? u.data() : {}; if (d.role === "totalMaster") { owner = true; sub = d.subAdmin === true; } } catch { /* 권한 없음 = 대표 아님 */ }
      }
      setSt((p) => ({ ...p, stage: 2 }));
      const startMember = () => {
        const ref = doc(db, "pnkMembers", user.uid);
        let fixing = false;
        unsubMember = onSnapshot(ref, async (s) => {
          // 대표 · 부관리자 자동 등록 / 사번 자동 발급
          if (owner && (!s.exists() || !s.data().empNo) && !fixing) {
            fixing = true;
            try {
              const base = s.exists() ? s.data() : {
                uid: user.uid, email: user.email || "", name: user.displayName || (sub ? "부관리자" : "대표"), dept: "경영", title: sub ? "부관리자" : "대표",
                phone: "", role: sub ? "admin" : "owner", status: "active", tm: true, annual: 15, createdAt: serverTimestamp(),
              };
              const want = sub ? await nextEmpNo(2) : (await getDoc(doc(db, "pnkEmpIndex", `${EMP_PREFIX}0001`))).exists() ? await nextEmpNo(2) : `${EMP_PREFIX}0001`;
              const no = await assignEmpNo({ ...base, uid: user.uid }, want);
              await setDoc(ref, { ...base, empNo: no, status: "active", tm: true, updatedAt: serverTimestamp() }, { merge: true });
            } catch (e) { console.warn("[PnK] 자동 등록 실패", e); setSt({ loading: false, stage: 4, user, owner, sub, member: s.exists() ? { id: s.id, ...s.data() } : null }); }
            return;
          }
          setSt({ loading: false, stage: 4, user, owner, sub, mfa: owner ? "ok" : null, member: s.exists() ? { id: s.id, ...s.data() } : null });
        }, () => setSt({ loading: false, stage: 4, user, owner, sub, member: null }));
      };
      // 🔐 최고관리자 · 부관리자 — 2차 인증(8자리)을 마쳐야 인트라넷 데이터를 연다(규칙도 같은 기준 — functions/pnkMfa.js)
      if (owner) {
        let r = null;
        try {
          r = (await Promise.race([callFn("pnkMfa")({ action: "status" }), new Promise((_, no) => setTimeout(() => no(new Error("서버 응답이 늦습니다")), 10000))])).data;
        } catch (e) { r = { required: true, error: e.message || "서버 연결 실패" }; }
        if (!alive) return;
        if (r.required && !r.valid) {
          resume.current = startMember;
          setSt({ loading: false, stage: 2, user, owner, sub, member: null, mfa: "need", mfaInfo: r });
          return;
        }
      }
      startMember();
    });
    return () => { alive = false; unsubAuth(); if (unsubMember) unsubMember(); };
  }, []);
  const passMfa = React.useCallback(() => { setSt((p) => ({ ...p, loading: true, mfa: "ok", stage: 3 })); resume.current?.(); }, []);
  const m = st.member;
  const hasNo = !!m?.empNo;
  const active = st.mfa !== "need" && m?.status === "active" && hasNo;
  const isAdmin = active && (!!st.owner || m?.role === "owner" || m?.role === "admin");
  return { ...st, passMfa, needMfa: st.mfa === "need", active, isAdmin, isOwner: active && (!!st.owner || m?.role === "owner"), needEmpNo: m?.status === "active" && !hasNo };
}

export function requestJoin(user, info) {
  return setDoc(doc(db, "pnkMembers", user.uid), {
    uid: user.uid, email: user.email || "", name: info.name.trim(), dept: info.dept.trim(), title: info.title.trim(),
    phone: info.phone.trim(), role: "staff", status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    ...(info.terms ? { terms: info.terms } : {}),
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
