// ======================= functions/alimtalkCore.mjs =======================
// 💬 2026-11-08 카카오 알림톡 배차 알림 공용 규칙(화면과 서버가 같은 파일을 쓴다 — arCore.mjs와 같은 방식)
//  · 화면: src/popbillAuto.js가 다시 내보냄(회사정보 설정 · 배차등록 토글 · 오더 상태 칩)
//  · 서버: functions/alimtalk.js가 import()로 읽음(오더 트리거 · 수동 보내기)
//
//  규칙
//  · 회사 설정 popbillSettings/{회사}.alimtalk { enabled(전체 기본값), toClient, toDriver, templates{client,driver}, senderNumber, contactPhone, smsFallback }
//  · 오더마다 알림톡: true/false — 새 오더는 회사 기본값(enabled)을 따르고 그 오더만 바꿀 수 있다
//  · 보내는 때: 오더가 배차완료(차량번호 있음 · 승인대기 아님)가 되는 순간 + 알림톡: true + 그 배차(오더 + 차량번호)로 아직 안 보냄
//  · 알림톡이 실패하면 문자로 다시 보낸다(smsFallback이 꺼져 있지 않으면)
import { dispatchStatusOf } from "./dispatchStatusCore.mjs";

export const ALIMTALK_COST_NOTE = "건당 약 8~15원(실패해서 문자로 가면 문자 요금)";
export const ALIMTALK_TARGETS = ["client", "driver"];
export const ALIMTALK_TARGET_LABEL = { client: "거래처 담당자", driver: "기사" };

// 카카오에 미리 등록(검수)해야 하는 템플릿 — 글자 하나라도 다르면 발송이 막힌다. #{변수}는 보낼 때 채운다.
export const ALIMTALK_TEMPLATES = {
  client: {
    name: "배차 확정 안내",
    text: [
      "[#{회사명}] 배차 확정 안내",
      "",
      "#{거래처명} 담당자님, 요청하신 운송의 배차가 확정됐어요.",
      "",
      "- 상차일시: #{상차일시}",
      "- 상차지: #{상차지}",
      "- 하차지: #{하차지}",
      "- 차량번호: #{차량번호}",
      "- 기사님: #{기사명} #{기사연락처}",
      "",
      "문의: #{회사연락처}",
    ].join("\n"),
    vars: ["회사명", "거래처명", "상차일시", "상차지", "하차지", "차량번호", "기사명", "기사연락처", "회사연락처"],
  },
  driver: {
    name: "배차 안내",
    text: [
      "[#{회사명}] 배차 안내",
      "",
      "#{기사명} 기사님, 배차가 확정됐어요.",
      "",
      "- 상차일시: #{상차일시}",
      "- 상차지: #{상차지주소}",
      "- 상차 담당자: #{상차담당자연락처}",
      "- 하차일시: #{하차일시}",
      "- 하차지: #{하차지주소}",
      "- 하차 담당자: #{하차담당자연락처}",
      "",
      "문의: #{회사연락처}",
    ].join("\n"),
    vars: ["회사명", "기사명", "상차일시", "상차지주소", "상차담당자연락처", "하차일시", "하차지주소", "하차담당자연락처", "회사연락처"],
  },
};

// 💸 2026-11-11 기사 운임 지급 안내(용차지급관리 [지급완료]) — 카카오 검수용 문안. 검수 통과 후 받은 템플릿 코드를 넣으면
//  지금 문자로 가는 "지급 시 기사 문자"(src/CallPay.jsx queuePayNotice)를 알림톡으로 바꿔 보낼 수 있다(실패하면 문자).
export const ALIMTALK_PAYOUT_TEMPLATE = {
  name: "운임 지급 안내",
  text: [
    "[#{회사명}] 운임 지급 안내",
    "",
    "#{기사명} 기사님, 운임이 입금되었습니다.",
    "",
    "- 지급일: #{지급일}",
    "- 운행: #{운행내역}",
    "- 지급액: #{지급액}원",
    "",
    "문의: #{회사연락처}",
  ].join("\n"),
  vars: ["회사명", "기사명", "지급일", "운행내역", "지급액", "회사연락처"],
};

export const DEFAULT_ALIMTALK = { enabled: false, toClient: true, toDriver: true, templates: { client: "", driver: "" }, senderNumber: "", contactPhone: "", smsFallback: true };
export function alimtalkSettingsOf(doc) {
  const a = (doc && typeof doc === "object" ? doc.alimtalk || doc : {}) || {};
  return {
    ...DEFAULT_ALIMTALK, ...a,
    enabled: a.enabled === true,
    toClient: a.toClient !== false, toDriver: a.toDriver !== false, smsFallback: a.smsFallback !== false,
    templates: { ...DEFAULT_ALIMTALK.templates, ...(a.templates || {}) },
  };
}

// 새 오더 "알림톡 보내기" 처음 값 = 회사 전체 설정(켜짐 → 켜짐 · 꺼짐 → 꺼짐)
export const alimtalkOrderDefault = (settings) => alimtalkSettingsOf(settings).enabled === true;
// 오더에 저장할 값 — 사용자가 이 오더만 바꿨으면(true/false) 그 값, 아니면 회사 기본값
export const alimtalkFlagFor = (choice, settings) => (typeof choice === "boolean" ? choice : alimtalkOrderDefault(settings));
// 서버가 보낼지 볼 때 — 오더에 저장된 값만 본다(값이 없는 예전 오더 · 가져오기 · 화주 요청은 보내지 않는다)
export const orderWantsAlimtalk = (o) => o?.알림톡 === true;

const CANCELED = ["취소", "배차취소", "오더취소", "취소됨"];
export const normPlate = (s) => String(s ?? "").replace(/[\s-]/g, "").toUpperCase();
export const onlyDigits = (v) => String(v ?? "").replace(/[^\d]/g, "");
// 배차완료(공용 규칙) + 취소 아님
export const isAssignedDone = (o) => !!o && dispatchStatusOf(o) === "배차완료" && o.배차상태 !== "배차취소" && !CANCELED.includes(String(o.상태 ?? "").trim());

// 이번 쓰기로 "새 배차"가 생겼는지 — 배차완료가 됐거나, 차량이 바뀌었거나, 배차완료 상태에서 알림톡을 켰을 때
export function isNewAssignment(before, after) {
  if (!after || !isAssignedDone(after)) return false;
  if (!before || !isAssignedDone(before)) return true;
  if (normPlate(before.차량번호) !== normPlate(after.차량번호)) return true;
  return before.알림톡 !== true && after.알림톡 === true;
}
// 한 배차(오더 + 차량번호)에 한 번 — 받는 사람마다 따로
export const alimtalkKey = (col, orderId, plate, target) => `${col}_${orderId}_${normPlate(plate) || "none"}${target ? `_${target}` : ""}`.replace(/\//g, "_");
// 이미 보낸 배차인지(오더에 남긴 결과로 먼저 걸러서 기록 조회를 줄인다)
export const alreadySentFor = (o) => !!o?.알림톡결과?.plate && normPlate(o.알림톡결과.plate) === normPlate(o.차량번호) && ["sent", "sms", "partial"].includes(o.알림톡결과.status);

// 서버 트리거가 이번 쓰기에 보낼지
export function shouldSendAlimtalk(before, after) {
  if (!after) return { send: false, reason: "deleted" };
  if (!orderWantsAlimtalk(after)) return { send: false, reason: "off" };
  if (after.source === "transport_transmit") return { send: false, reason: "copy" };
  if (after.블라인드 === true) return { send: false, reason: "blind" };
  if (!isNewAssignment(before, after)) return { send: false, reason: "no-change" };
  if (alreadySentFor(after)) return { send: false, reason: "already" };
  return { send: true, reason: "", plate: normPlate(after.차량번호) };
}

// 휴대폰 번호(010 등)만 알림톡 · 문자를 받는다
export function mobileOf(v) {
  const d = onlyDigits(v);
  return /^01[016789]\d{7,8}$/.test(d) ? d : "";
}
export const maskPhone = (v) => { const d = onlyDigits(v); return d.length >= 8 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : d ? "****" : ""; };
const fmtPhone = (v) => { const d = onlyDigits(v); if (!d) return ""; if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`; if (d.length === 10) return d.startsWith("02") ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`; return String(v).trim(); };
const when = (date, time) => [String(date || "").trim(), String(time || "").trim()].filter(Boolean).join(" ");
const place = (name, addr) => [String(name || "").trim(), String(addr || "").trim()].filter(Boolean).join(" ");
const contact = (name, phone) => [String(name || "").trim(), fmtPhone(phone)].filter(Boolean).join(" ");

// 템플릿 변수 값 — 비면 "-"(카카오는 빈 변수를 막는다)
export function buildAlimtalkVars(order = {}, { company = "", contactPhone = "", driverName = "", driverPhone = "" } = {}) {
  const o = order || {};
  const dName = String(o.이름 || o.기사명 || driverName || "").trim();
  const dPhone = o.전화번호 || o.기사연락처 || driverPhone || "";
  return {
    회사명: company,
    거래처명: String(o.거래처명 || "").trim(),
    상차일시: when(o.상차일, o.상차시간),
    하차일시: when(o.하차일 || o.상차일, o.하차시간),
    상차지: place(o.상차지명, o.상차지주소),
    하차지: place(o.하차지명, o.하차지주소),
    상차지주소: place(o.상차지명, o.상차지주소),
    하차지주소: place(o.하차지명, o.하차지주소),
    상차담당자연락처: contact(o.상차지담당자, o.상차지담당자번호),
    하차담당자연락처: contact(o.하차지담당자, o.하차지담당자번호),
    차량번호: String(o.차량번호 || "").trim(),
    기사명: dName,
    기사연락처: fmtPhone(dPhone),
    회사연락처: fmtPhone(contactPhone),
  };
}
export function fillTemplate(text, vars = {}) {
  return String(text || "").replace(/#\{([^}]+)\}/g, (_, k) => {
    const v = String(vars[k.trim()] ?? "").trim();
    return v || "-";
  });
}
export const templateMissing = (text, vars) => [...String(text || "").matchAll(/#\{([^}]+)\}/g)].map((m) => m[1].trim()).filter((k) => !String(vars[k] ?? "").trim());
export const alimtalkContent = (target, vars) => fillTemplate(ALIMTALK_TEMPLATES[target]?.text || "", vars);
// 문자 대체 내용(알림톡이 실패했을 때) — 같은 내용을 장문 문자로
export const alimtalkSmsContent = (target, vars) => alimtalkContent(target, vars);

// 받는 사람 번호 — 거래처: 오더의 거래처 연락처 → 거래처 관리(담당자 연락처) · 기사: 오더 기사 연락처 → 기사 관리
export function recipientFor(target, order = {}, { client = null, driver = null } = {}) {
  if (target === "client") {
    const cs = Array.isArray(client?.contacts) ? client.contacts : [];
    const prim = cs.find((c) => c?.isPrimary) || cs[0] || {};
    const cands = [order.거래처연락처, order.거래처담당자번호, client?.담당자연락처, client?.연락처, client?.담당자번호, prim.phone];
    const phone = cands.map(mobileOf).find(Boolean) || "";
    return { phone, name: String(order.거래처담당자 || client?.담당자 || prim.name || order.거래처명 || "").trim(), reason: phone ? "" : "거래처 담당자 휴대폰 번호가 없어요" };
  }
  const phone = [order.전화번호, order.기사연락처, driver?.전화번호, driver?.phone].map(mobileOf).find(Boolean) || "";
  return { phone, name: String(order.이름 || order.기사명 || driver?.이름 || "").trim(), reason: phone ? "" : "기사 휴대폰 번호가 없어요" };
}

// 결과 묶기 — items: { client: {status, channel, error, at}, driver: {...} }
//  status: sent(알림톡) · sms(문자로 대체) · failed · skipped(번호 없음 등) · off(팝빌 연결 전)
export function overallStatus(items = {}) {
  const v = Object.values(items || {});
  if (!v.length) return "skipped";
  const ok = v.filter((x) => x.status === "sent" || x.status === "sms");
  if (v.every((x) => x.status === "off")) return "off";
  if (ok.length === v.length) return ok.some((x) => x.status === "sms") ? "sms" : "sent";
  if (ok.length) return "partial";
  if (v.some((x) => x.status === "failed")) return "failed";
  if (v.some((x) => x.status === "off")) return "off";
  return "skipped";
}
const hhmm = (ms) => { if (!ms) return ""; const d = new Date(Number(ms) + 9 * 3600e3); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
// 오더 칩 글자 · 색
export function alimtalkChipOf(result) {
  if (!result || !result.status) return null;
  const t = hhmm(result.at);
  const firstErr = Object.values(result.items || {}).map((x) => x.error).find(Boolean) || result.error || "";
  switch (result.status) {
    case "sent": return { tone: "ok", label: `알림톡 보냄${t ? ` ${t}` : ""}` };
    case "sms": return { tone: "ok", label: `문자로 보냄${t ? ` ${t}` : ""}` };
    case "partial": return { tone: "warn", label: `일부만 보냄${t ? ` ${t}` : ""}`, detail: firstErr };
    case "failed": return { tone: "error", label: "알림톡 실패", detail: firstErr };
    case "off": return { tone: "muted", label: "팝빌 연결 전", detail: "팝빌이 연결되면 그다음 배차부터 보내요" };
    case "sending": return { tone: "muted", label: "보내는 중" };
    default: return { tone: "muted", label: "보낼 번호 없음", detail: firstErr };
  }
}
