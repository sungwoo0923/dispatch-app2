// ======================= src/companyContract.js =======================
// ⭐ 2026-11-06 운송사 이용 계약(관리센터 › 고객사 › 이용 계약) — 계약 기간 · 계약종료 · 만료 안내
//  저장 위치: companyPlans/{회사명} (요금제와 같은 문서 — 로그인한 사람은 읽고, 최고관리자만 쓴다)
//   · contractStart / contractEnd : "YYYY-MM-DD" (계약 시작일 / 종료일)
//   · contractTerm : 12 | 24 | 36 … (개월, 0 = 직접 입력)
//   · status : "ended" 이면 계약종료 — 그 회사 직원·기사·화주는 PC·모바일·기사앱·화주앱 어디서도 못 쓴다
//              (최고관리자·부관리자만 예외). 서버 규칙(firestore.rules isApproved)도 같은 값을 본다.
//   · endedAt / endedBy / endReason · reactivatedAt / reactivatedBy
//   · billingEmail : 만료 안내 메일을 받을 회사 청구 담당 메일(선택)
//   · contractNotices : { "<종료일>_<30|7|1>": 보낸 시각 } — 서버(contractExpiryNotices)가 같은 안내를 두 번 보내지 않게 기록
import React from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { trialStateOf } from "./contractTerms.js"; // 📑 2026-11-13 무료 이용(계약 전에 먼저 써 보는 기간)

export const CONTRACT_NOTICE_DAYS = [30, 7, 1];
export const CONTRACT_TERMS = [[12, "1년"], [24, "2년"], [36, "3년"], [0, "직접 입력"]];
// 만료 안내를 받는 사람: 대표·임원(직책/부서) · 경리(test·acctStaff·hrAcct·allMgr) · 회사 마스터 · 운송관리자
export const CONTRACT_NOTICE_ROLES = ["test", "acctStaff", "hrAcct", "allMgr", "admin"];
export const EXEC_POSITIONS = ["이사", "상무", "전무", "부사장", "사장", "대표", "대표이사", "본부장", "임원"];
export const isContractNoticeTarget = (u) => !!u && !["totalMaster", "driver", "shipper", "cafeUser"].includes(u.role) && u.approved !== false && u.employmentStatus !== "퇴사" && (
  CONTRACT_NOTICE_ROLES.includes(u.role) || u.isMaster === true || EXEC_POSITIONS.includes(String(u.position || "").trim())
  || String(u.team || "").trim() === "임원" || /경리|회계|재무/.test(String(u.team || "")));

const pad = (n) => String(n).padStart(2, "0");
export const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
// "YYYY-MM-DD" 두 날짜 사이 일수(b - a)
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
export const addMonthsYmd = (ymd, months) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ""))) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + Number(months || 0), d));
  t.setUTCDate(t.getUTCDate() - 1); // 2026-01-01부터 1년 → 2026-12-31까지
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
// 회사 계약 상태 한눈에 — { key, label, dLeft }
export function contractStateOf(p, today = kstToday()) {
  if (!p) return { key: "none", label: "미설정", dLeft: null };
  if (p.status === "ended") return { key: "ended", label: "계약종료", dLeft: null };
  // 📑 2026-11-13 계약 기간이 아직 없고 무료 이용 기간만 정해진 회사(companyPlans.trialStart · trialEnd)
  const trial = trialStateOf(p, today);
  if (trial) return trial;
  const end = String(p.contractEnd || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return { key: "none", label: "기간 미설정", dLeft: null };
  const dLeft = daysBetween(today, end);
  if (dLeft < 0) return { key: "expired", label: `만료 ${-dLeft}일 지남`, dLeft };
  if (dLeft <= 30) return { key: "soon", label: dLeft === 0 ? "오늘 만료" : `D-${dLeft}`, dLeft };
  return { key: "active", label: "이용 중", dLeft };
}

// 회사 계약 상태 실시간 구독 — company가 비면 구독 안 함
export function useContractStatusFor(company) {
  const co = String(company || "").trim();
  const [info, setInfo] = React.useState(null);
  React.useEffect(() => {
    if (!co || co.includes("/")) { setInfo(null); return undefined; }
    return onSnapshot(doc(db, "companyPlans", co), (s) => setInfo(s.exists() ? s.data() : null), () => { /* 규칙에서 막히면(이미 종료) 아래 ended 판단은 마지막 값 유지 */ });
  }, [co]);
  return { ended: !!co && info?.status === "ended", info };
}

// 계약종료 안내 화면 — 로그아웃만 할 수 있다
export function ContractEndedScreen({ company = "", info = null, onLogout }) {
  const endedAt = info?.endedAtYmd || (info?.endedAt?.toMillis ? new Date(info.endedAt.toMillis() + 9 * 3600e3).toISOString().slice(0, 10) : "");
  return React.createElement("div", {
    role: "alertdialog", "aria-label": "계약 종료 안내", "data-contract-ended": "1",
    style: { position: "fixed", inset: 0, zIndex: 2147483646, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif",
      background: "linear-gradient(rgba(143,176,240,.05) 1px, transparent 1px) 0 0/28px 28px, linear-gradient(90deg, rgba(143,176,240,.05) 1px, transparent 1px) 0 0/28px 28px, radial-gradient(800px 360px at 80% -10%, rgba(75,108,183,.45), transparent 60%), linear-gradient(160deg,#0B1428 0%,#0F1A30 55%,#1B2B4B 100%)" },
  },
  React.createElement("div", { style: { width: "100%", maxWidth: 440, borderRadius: 24, background: "#fff", overflow: "hidden", boxShadow: "0 30px 70px rgba(0,0,0,.45)" } },
    React.createElement("div", { style: { padding: "22px 26px", background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)", color: "#fff" } },
      React.createElement("div", { style: { fontSize: 12, fontWeight: 800, letterSpacing: "0.26em", color: "#8FB0F0" } }, "SERVICE ENDED"),
      React.createElement("div", { style: { fontSize: 23, fontWeight: 900, marginTop: 6, letterSpacing: "-0.02em" } }, "계약이 종료되었습니다"),
      company ? React.createElement("div", { style: { fontSize: 14.5, color: "rgba(207,224,255,.85)", marginTop: 4, fontWeight: 700 } }, company) : null),
    React.createElement("div", { style: { padding: "22px 26px 24px" } },
      React.createElement("p", { style: { margin: 0, fontSize: 15.5, lineHeight: 1.7, color: "#1B2B4B", fontWeight: 600 } },
        "이 회사의 LogisWeb 이용 계약이 종료되어 프로그램(PC · 모바일 · 기사앱 · 화주앱)을 사용할 수 없습니다.",
        React.createElement("br"), "다시 이용하려면 관리자에게 문의해 주세요."),
      endedAt ? React.createElement("div", { style: { marginTop: 12, fontSize: 14, color: "#5B6B85", fontWeight: 700 } }, `종료일 ${endedAt}`) : null,
      React.createElement("button", { type: "button", onClick: onLogout, style: { marginTop: 20, width: "100%", height: 50, borderRadius: 14, border: "none", background: "#1B2B4B", color: "#fff", fontSize: 16, fontWeight: 900, cursor: "pointer" } }, "로그아웃"))));
}

// 만료 안내 띠 — 대표·임원·경리·마스터에게만, 종료 30일 전부터(이 회사 화면 맨 위)
export function ContractExpiryBanner({ company = "", me = null, mobile = false }) {
  const { info } = useContractStatusFor(company);
  const [closed, setClosed] = React.useState(() => { try { return sessionStorage.getItem(`kpContractBannerClosed:${company}`) || ""; } catch { return ""; } });
  if (!info || !isContractNoticeTarget(me)) return null;
  const st = contractStateOf(info);
  if (!["soon", "expired", "trialSoon", "trialOver"].includes(st.key)) return null;
  const isTrial = st.key.startsWith("trial");
  const key = `${isTrial ? `t:${info.trialEnd}` : info.contractEnd}`;
  if (closed === key) return null;
  const close = () => { try { sessionStorage.setItem(`kpContractBannerClosed:${company}`, key); } catch { /* 무시 */ } setClosed(key); };
  const text = isTrial
    ? (st.key === "trialOver" ? `무료 이용 기간(~${info.trialEnd})이 지났습니다. 계속 이용하려면 운영팀에 계약을 요청해 주세요.` : `무료 이용 기간이 ${info.trialEnd}에 끝납니다(${st.label}). 계속 이용하려면 운영팀에 계약을 요청해 주세요.`)
    : st.key === "expired"
    ? `이용 계약 기간(~${info.contractEnd})이 지났습니다. 계속 이용하려면 운영팀에 연장을 요청해 주세요.`
    : `이용 계약이 ${info.contractEnd}에 끝납니다(${st.label}). 계속 이용하려면 운영팀에 연장을 요청해 주세요.`;
  return React.createElement("div", { "data-contract-banner": "1", style: { display: "flex", alignItems: "center", gap: 10, padding: mobile ? "9px 12px" : "9px 16px", color: "#fff", fontSize: 14, fontWeight: 800,
    background: st.key === "expired" || (st.dLeft ?? 99) <= 7 ? "linear-gradient(90deg,#0B1428,#1B2B4B)" : "linear-gradient(90deg,#1B2B4B,#2D4C82)" } },
  React.createElement("span", { style: { flexShrink: 0, padding: "2px 8px", borderRadius: 7, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", fontSize: 12.5, letterSpacing: "0.12em", color: "#8FB0F0" } }, "계약"),
  React.createElement("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: mobile ? "normal" : "nowrap", lineHeight: 1.45 } }, text),
  React.createElement("button", { type: "button", onClick: close, style: { flexShrink: 0, height: 30, padding: "0 10px", borderRadius: 8, border: "none", background: "transparent", color: "rgba(255,255,255,.75)", fontSize: 13.5, fontWeight: 800, cursor: "pointer" } }, "닫기 ✕"));
}
