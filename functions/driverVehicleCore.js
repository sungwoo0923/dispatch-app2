// functions/driverVehicleCore.js
// ⭐ 2026-11-11 기사 차량 변경 · 휴대폰번호 로그인 — 계산만(서버 연결 없이 단위 시험 가능)
//  · 기사 계정은 사람 기준으로 하나, 차량번호는 바뀌는 값. 차량이 바뀌면 로그인 계정(차량번호@…)도 새 차량번호로 맞춘다.
//  · 차량이력: drivers/{id}.차량이력 = [{ 차량번호, 시작:"YYYY-MM-DD"|"", 종료:"YYYY-MM-DD"|"", by, at }] (정산이 날짜별로 어느 기사 건인지 판단)
"use strict";

const DOMAIN = "driver.run25.kr";
const DEFAULT_CO = "돌캐";
const HISTORY_MAX = 60;

const plateOf = (v) => String(v || "").replace(/\s+/g, "");
const normText = (v) => String(v || "").replace(/\s+/g, "").toLowerCase();
const digits = (v) => String(v || "").replace(/\D/g, "");
// 휴대폰번호 전체(01x로 시작하는 10~11자리)
const phoneValid = (v) => /^01[016789]\d{7,8}$/.test(digits(v));
// 저장 형식이 섞여 있다(가입: 010-1234-5678 / PC 등록: 01012345678) — 둘 다 찾는다
function phoneVariants(v) {
  const d = digits(v);
  if (!d) return [];
  const hy = d.length < 8 ? d : `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
  return [...new Set([d, hy])];
}
// 차량번호 형식 — 한글·숫자·영문만, 6~12자(로그인 비밀번호로도 쓰여 6자 이상)
const plateValid = (v) => /^[0-9A-Za-z가-힣]{6,12}$/.test(plateOf(v));

// 화면(src/driver/driverEmail.js)과 같은 계산이어야 한다
const coHash = (co) => {
  let h = 5381;
  for (const ch of String(co || "").replace(/\s+/g, "")) h = (Math.imul(h, 33) ^ ch.codePointAt(0)) >>> 0;
  return h.toString(36);
};
const legacyEmail = (plate) => `${plateOf(plate)}@${DOMAIN}`.toLowerCase();
const scopedEmail = (co, plate) => `${plateOf(plate)}.c${coHash(co)}@${DOMAIN}`.toLowerCase();
// 차량 미배정 계정 — 휴대폰번호로만 로그인(비밀번호 = 메일 앞부분)
const nocarLocal = (uid) => `nocar.${String(uid || "").toLowerCase()}`;
const nocarEmail = (uid) => `${nocarLocal(uid)}@${DOMAIN}`;
// 새 차량번호 메일을 다른 기사 계정이 아직 쓰고 있을 때 — 이 기사 전용 메일(휴대폰번호 로그인으로 찾아 들어온다)
const uniqueEmail = (plate, uid) => `${plateOf(plate)}.u${String(uid || "").toLowerCase()}@${DOMAIN}`.toLowerCase();
const isNocarEmail = (e) => /^nocar\.[^@]+@driver\.run25\.kr$/i.test(String(e || ""));

const coOf = (v) => String(v || "").trim() || DEFAULT_CO;
const sameCo = (a, b) => normText(coOf(a)) === normText(coOf(b));

const kstDay = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const dayValid = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

// 차량이력 갱신 — oldPlate를 date 전날까지로 닫고 newPlate를 date부터 연다(newPlate가 ""면 닫기만 = 미배정)
function applyHistory(hist, { oldPlate, newPlate, date, by = "", at = Date.now() }) {
  const h = (Array.isArray(hist) ? hist : []).filter((e) => e && plateOf(e.차량번호)).map((e) => ({ ...e, 차량번호: plateOf(e.차량번호), 시작: e.시작 || "", 종료: e.종료 || "" }));
  const op = plateOf(oldPlate);
  const np = plateOf(newPlate);
  // 이력이 처음이면 지금까지 타던 차량을 "처음부터"로 남긴다
  if (!h.length && op) h.push({ 차량번호: op, 시작: "", 종료: "" });
  const prev = addDays(date, -1);
  const out = [];
  for (const e of h) {
    if (e.종료) { out.push(e); continue; }
    // 같은 날 다시 바꾸면(시작이 적용일 이후) 그 구간은 실제로 탄 적이 없으니 지운다
    if (e.시작 && e.시작 >= date) continue;
    out.push({ ...e, 종료: prev });
  }
  if (np) out.push({ 차량번호: np, 시작: date, 종료: "", by: String(by || "").slice(0, 80), at });
  return out.slice(-HISTORY_MAX);
}

// 휴대폰번호로 찾은 후보 중 로그인할 기사 고르기
//  cands: [{ uid?, pre?, companyName, name, carNo, approved, retired, createdAt(ms) }]
//  결과: { ok:true, pick } | { ok:false, code: NOT_FOUND | COMPANY_MISMATCH | NAME_MISMATCH }
function pickPhoneMatch(cands, { companyName, name }) {
  const list = (cands || []).filter(Boolean);
  if (!list.length) return { ok: false, code: "NOT_FOUND" };
  const inCo = list.filter((c) => sameCo(c.companyName, companyName));
  if (!inCo.length) return { ok: false, code: "COMPANY_MISMATCH" };
  const named = inCo.filter((c) => normText(c.name) === normText(name));
  if (!named.length) return { ok: false, code: "NAME_MISMATCH" };
  const score = (c) => (c.pre ? 0 : 100) + (c.retired ? 0 : 10) + (c.approved ? 1 : 0);
  named.sort((a, b) => score(b) - score(a) || Number(b.createdAt || 0) - Number(a.createdAt || 0));
  return { ok: true, pick: named[0] };
}

// 기사 합치기 — 같은 기사가 두 줄(예: 예전 차량 1019로 쓰던 계정 + 새 차량 4931로 다시 가입한 계정)일 때
//  남길 기사(keep)의 차량이력 앞에 지울 기사(old)의 차량 구간을 붙인다. date = 기준일(그 전날까지의 old 차량 운행분을 이 기사 건으로 본다).
//  오더의 차량번호는 그대로 둔다. 줄이 셋 이상이면 한 줄씩 여러 번 합친다.
function mergeHistory(keep, old, date) {
  const periods = (d) => {
    const h = (Array.isArray(d?.차량이력) ? d.차량이력 : []).filter((e) => e && plateOf(e.차량번호)).map((e) => ({ ...e, 차량번호: plateOf(e.차량번호), 시작: e.시작 || "", 종료: e.종료 || "" }));
    if (h.length) return h;
    const cur = plateOf(d?.차량번호 || d?.carNo);
    return cur ? [{ 차량번호: cur, 시작: "", 종료: "" }] : [];
  };
  const prev = addDays(date, -1);
  const kp = periods(keep);
  const op = periods(old)
    // 남길 기사가 이미 같은 구간을 갖고 있으면 겹치게 넣지 않는다
    .filter((e) => !(e.시작 && e.시작 >= date))
    .map((e) => ({ ...e, 종료: e.종료 && e.종료 < prev ? e.종료 : prev }));
  // 남길 기사의 구간은 그대로 둔다 — 한 기사가 줄 여러 개(차량번호 오타 줄 포함)였던 경우라 기간이 겹쳐도 모두 이 기사 운행분이다.
  //  (예전엔 남길 기사 구간을 date부터로 좁혀서, 두 번째 줄을 합칠 때 먼저 합친 줄의 구간이 사라졌다)
  const kk = kp;
  const samePlateOnly = op.length && kk.length && op.every((e) => kk.some((k) => k.차량번호 === e.차량번호)) && new Set([...op, ...kk].map((e) => e.차량번호)).size === 1;
  if (samePlateOnly) return Array.isArray(keep?.차량이력) ? keep.차량이력 : []; // 같은 차량 중복 줄 — 이력을 만들 필요 없음
  return [...op, ...kk].slice(-HISTORY_MAX);
}
// 지울 기사 줄에서 남길 기사 줄로 옮겨 올 값(남길 쪽이 비어 있을 때만)
const MERGE_FILL = ["정산계좌", "사업자번호", "사업자상호", "공제항목", "담당자", "근무요일", "메모", "거주지", "차량종류", "차량톤수", "vehicleType", "입사일", "hireDate"];
function mergeFill(keep, old) {
  const out = {};
  const empty = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
  MERGE_FILL.forEach((k) => { if (empty(keep?.[k]) && !empty(old?.[k])) out[k] = old[k]; });
  return out;
}

module.exports = {
  DOMAIN, DEFAULT_CO, plateOf, normText, digits, phoneValid, phoneVariants, plateValid, coHash, legacyEmail, scopedEmail,
  nocarLocal, nocarEmail, uniqueEmail, isNocarEmail, coOf, sameCo, kstDay, dayValid, addDays, applyHistory, pickPhoneMatch, mergeHistory, mergeFill, MERGE_FILL,
};
