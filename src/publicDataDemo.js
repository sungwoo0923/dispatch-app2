// ======================= src/publicDataDemo.js =======================
// 🧪 개발 전용(import.meta.env.DEV + URL demo=1) — 국세청 · 기상청 · 연동 설정 화면 점검용 가짜 응답.
//  배포 빌드에서는 부르는 곳(src/publicDataMain.jsx)의 import.meta.env.DEV 분기가 빠져 이 파일도 포함되지 않는다.
import { bizNoDigits, bizNoValid, normBizRow, regionOfKey, regionOfAddress } from "../functions/publicDataCore.mjs";

const pad = (n) => String(n).padStart(2, "0");
const kstNow = () => new Date(Date.now() + 9 * 3600e3);
const ymdK = (off = 0) => { const d = new Date(Date.now() + 9 * 3600e3 + off * 86400e3); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`; };

// 지역별 날씨 성격(둘러보기 오더의 상하차지)
const PROFILE = {
  부산: { pty: 1, sky: 4, pop: 80, t: 14, wsd: 4, pcp: 6 },
  경남_김해: { pty: 1, sky: 4, pop: 70, t: 13, wsd: 10.5, pcp: 4 },
  인천: { pty: 0, sky: 3, pop: 20, t: 9, wsd: 11.2 },
  광주: { pty: 2, sky: 4, pop: 60, t: 2, wsd: 5, sno: 0.5 },
  대전: { pty: 0, sky: 3, pop: 20, t: 10, wsd: 3 },
  경기_평택: { pty: 0, sky: 1, pop: 0, t: 11, wsd: 3 },
  경기_이천: { pty: 0, sky: 1, pop: 10, t: 9, wsd: 2 },
  경기_화성: { pty: 0, sky: 3, pop: 20, t: 10, wsd: 4 },
};
function demoRegion(key) {
  const r = regionOfKey(key);
  if (!r) return null;
  const p = PROFILE[key] || { pty: 0, sky: 3, pop: 10, t: 10, wsd: 3 };
  const hours = {};
  for (let day = 0; day < 3; day++) {
    for (let h = 0; h < 24; h++) {
      const k = `${ymdK(day)}${pad(h)}`;
      const swing = Math.round(Math.sin(((h - 9) / 24) * Math.PI * 2) * 4);
      const wet = p.pty && h >= 6 && h <= 21;
      hours[k] = { t: p.t + swing - day, pty: wet ? p.pty : 0, sky: p.sky, pop: wet ? p.pop : Math.min(p.pop, 20), wsd: p.wsd, pcp: wet ? p.pcp || 0 : 0, sno: wet ? p.sno || 0 : 0 };
    }
  }
  const t = kstNow();
  return { key: r.key, name: r.name, sido: r.sido, sgg: r.sgg, nx: r.nx, ny: r.ny, hours, base: `${ymdK(0)}${pad(Math.max(2, Math.floor((t.getUTCHours() - 2) / 3) * 3 + 2))}00`, fetchedAt: Date.now() };
}
export const DEMO_WARN = {
  active: [
    { type: "강풍주의보", kind: "강풍", level: "주의보", sido: "인천", subs: [] },
    { type: "강풍주의보", kind: "강풍", level: "주의보", sido: "경남", subs: ["김해", "창원", "거제"] },
    { type: "호우주의보", kind: "호우", level: "주의보", sido: "부산", subs: [] },
  ],
  text: "o 강풍주의보 : 인천, 경상남도(김해, 창원, 거제)\no 호우주의보 : 부산",
  titles: ["[특보] 제11-12호 : 2026.11.07.14:00 / 강풍주의보 발표"],
  fetchedAt: Date.now(),
};

export function demoReadDoc(key) {
  if (key === "_warn") return DEMO_WARN;
  return demoRegion(key);
}

// 국세청: 끝자리로 상태를 정한다(0·7 폐업 · 1 휴업 · 나머지 계속)
function demoBiz(bNos) {
  const results = {};
  bNos.map(bizNoDigits).forEach((n) => {
    if (!bizNoValid(n)) { results[n] = { bNo: n, state: "invalid", label: "번호 오류" }; return; }
    const last = Number(n[9]);
    const row = last === 0 || last === 7 ? { b_no: n, b_stt: "폐업자", b_stt_cd: "03", tax_type: "부가가치세 일반과세자", end_dt: "20260930" }
      : last === 1 ? { b_no: n, b_stt: "휴업자", b_stt_cd: "02", tax_type: "부가가치세 간이과세자", end_dt: "20261015" }
        : { b_no: n, b_stt: "계속사업자", b_stt_cd: "01", tax_type: "부가가치세 일반과세자", end_dt: "" };
    results[n] = { ...normBizRow(row), cached: false, checkedAt: Date.now() };
  });
  return { results, disabled: false };
}

export async function demoCall(name, data) {
  await new Promise((r) => setTimeout(r, 250));
  if (name === "bizStatusCheck") return demoBiz(data?.bNos || []);
  if (name === "weatherFor") {
    const keys = [...(data?.regions || []), ...(data?.addresses || []).map((a) => regionOfAddress(a)?.key)].filter(Boolean);
    return { regions: Object.fromEntries(keys.map((k) => [k, demoRegion(k)]).filter(([, v]) => v)), warn: DEMO_WARN, disabled: false };
  }
  if (name === "integrationStatus") {
    const base = { nts: { status: "ready", lastAt: Date.now() - 40 * 60e3 }, kma: { status: "ready", lastAt: Date.now() - 70 * 60e3 } };
    if (data?.test === "nts") base.nts = { ...base.nts, status: "ok" };
    if (data?.test === "kma") base.kma = { ...base.kma, status: "ok" };
    return base;
  }
  if (name === "popbillAdmin") {
    const members = [{ company: "테스트운송", corpNum: "1088112342", corpName: "(주)테스트운송", ceo: "홍길동", status: "신청중", updatedAt: Date.now() - 86400e3 }];
    if (data?.action === "getMember") return { company: data.company || "테스트운송", member: members[0] };
    if (data?.action === "saveMember") return { company: data.company || "테스트운송", member: { ...members[0], ...data, status: "신청중" } };
    if (data?.action === "checkMember") return { company: "테스트운송", member: members[0], result: { ok: false, disabled: true, reason: "no-key" } };
    return { enabled: false, reason: "no-key", hasKeys: false, config: { enabled: false, isTest: true }, members, test: null };
  }
  throw Object.assign(new Error("둘러보기에서는 쓸 수 없어요"), { code: "unavailable" });
}
