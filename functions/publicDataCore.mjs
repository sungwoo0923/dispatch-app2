// ======================= functions/publicDataCore.mjs =======================
// 🏛 2026-11-07 공공데이터(data.go.kr) 연동 규칙 — 서버(functions/publicData.js)와 화면(src · cafe-site)이 같은 파일을 쓴다.
//  Firebase · fetch를 부르지 않는 순수 함수만 둔다(테스트: node scripts/publicData.test.mjs).
//   ① 국세청 사업자등록 상태조회: 번호 검증식 · 응답 정리(계속/휴업/폐업)
//   ② 기상청 단기예보: 위경도 → 격자(nx, ny) · 주소 → 시군구 · 발표시각 · 응답 정리 · 날씨 표시(비/눈/강풍/폭염)
//   ③ 기상특보(getPwnStatus): 발효 현황 글 → 지역 목록 · 주소가 특보 지역인지

// ─────────────────────────── ① 사업자등록번호 ───────────────────────────
export const bizNoDigits = (v) => String(v ?? "").replace(/[^\d]/g, "");
// 국세청 검증식(가중치 1,3,7,1,3,7,1,3,5 + 9번째 자리×5의 십의 자리)
export function bizNoValid(v) {
  const d = bizNoDigits(v);
  if (d.length !== 10 || /^0+$/.test(d)) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let s = 0;
  for (let i = 0; i < 9; i++) s += Number(d[i]) * w[i];
  s += Math.floor((Number(d[8]) * 5) / 10);
  return (10 - (s % 10)) % 10 === Number(d[9]);
}
export const fmtBizNoDigits = (v) => { const d = bizNoDigits(v).slice(0, 10); return d.length <= 3 ? d : d.length <= 5 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`; };

// state: active(계속) · suspended(휴업) · closed(폐업) · unregistered(국세청에 없음) · invalid(번호 틀림) · unknown
export const BIZ_STATE_LABEL = { active: "계속", suspended: "휴업", closed: "폐업", unregistered: "미등록", invalid: "번호 오류", unknown: "확인 불가" };
const STT_CD = { "01": "active", "02": "suspended", "03": "closed" };
export function normBizRow(r) {
  const bNo = bizNoDigits(r?.b_no);
  const code = String(r?.b_stt_cd || "").trim();
  let state = STT_CD[code];
  if (!state) {
    const stt = String(r?.b_stt || "");
    state = /폐업/.test(stt) ? "closed" : /휴업/.test(stt) ? "suspended" : /계속/.test(stt) ? "active"
      : /등록되지/.test(String(r?.tax_type || "")) ? "unregistered" : "unknown";
  }
  const endDt = String(r?.end_dt || "").replace(/[^\d]/g, "");
  return {
    bNo, state, label: BIZ_STATE_LABEL[state], code,
    taxType: state === "unregistered" ? "" : String(r?.tax_type || "").trim(),
    endDt: endDt.length === 8 ? `${endDt.slice(0, 4)}-${endDt.slice(4, 6)}-${endDt.slice(6)}` : "",
  };
}
// 국세청 응답 { status_code: "OK", data: [...] } → { ok, rows, error }
export function parseNtsStatus(json) {
  if (!json || typeof json !== "object") return { ok: false, rows: [], error: "응답이 비어 있어요" };
  if (json.status_code && json.status_code !== "OK") return { ok: false, rows: [], error: String(json.status_code) };
  if (!Array.isArray(json.data)) {
    // 공공데이터포털 게이트웨이 오류 { code: -4, msg: "등록되지 않은 인증키 입니다." }
    if (json.code !== undefined || json.msg) return { ok: false, rows: [], error: String(json.msg || json.code), keyError: Number(json.code) === -4 || /인증키/.test(String(json.msg || "")) };
    return { ok: false, rows: [], error: "응답 형식이 달라요" };
  }
  return { ok: true, rows: json.data.map(normBizRow).filter((r) => r.bNo) };
}
// 저장 전 경고 문구(휴업 · 폐업만)
export function bizWarnText(row) {
  if (!row) return "";
  if (row.state === "closed") return `국세청 조회 결과 폐업한 사업자예요${row.endDt ? `(${row.endDt})` : ""}.`;
  if (row.state === "suspended") return `국세청 조회 결과 휴업 중인 사업자예요${row.endDt ? `(${row.endDt})` : ""}.`;
  return "";
}

// ─────────────────────────── ② 기상청 격자(LCC DFS) ───────────────────────────
// 기상청 동네예보 격자 변환 공식(Lambert Conformal Conic, 5km 격자)
const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
export function latLonToGrid(lat, lon) {
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD, olon = OLON * DEGRAD, olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + Number(lat) * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = Number(lon) * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  return { nx: Math.floor(ra * Math.sin(theta) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5) };
}

// 시도 · 시군구 대표 좌표(시청 · 군청 부근). 특별시 · 광역시 · 세종은 한 점으로 본다(구마다 날씨 차이가 작다).
const SIDO = {
  서울: [37.5665, 126.978], 부산: [35.1796, 129.0756], 대구: [35.8714, 128.6014], 인천: [37.4563, 126.7052], 광주: [35.1595, 126.8526],
  대전: [36.3504, 127.3845], 울산: [35.5384, 129.3114], 세종: [36.48, 127.289], 경기: [37.2636, 127.0286], 강원: [37.8813, 127.7298],
  충북: [36.6424, 127.489], 충남: [36.6011, 126.6608], 전북: [35.8242, 127.148], 전남: [34.9904, 126.4817], 경북: [36.5684, 128.7294],
  경남: [35.228, 128.6811], 제주: [33.4996, 126.5312],
};
export const SIDO_FULL = { 서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시", 인천: "인천광역시", 광주: "광주광역시", 대전: "대전광역시", 울산: "울산광역시", 세종: "세종특별자치시", 경기: "경기도", 강원: "강원특별자치도", 충북: "충청북도", 충남: "충청남도", 전북: "전북특별자치도", 전남: "전라남도", 경북: "경상북도", 경남: "경상남도", 제주: "제주특별자치도" };
const METRO = new Set(["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종"]);
// [이름(시·군 글자 뺀 것), 위도, 경도]
const SGG = {
  경기: [["수원", 37.2636, 127.0286], ["성남", 37.42, 127.1265], ["고양", 37.6584, 126.832], ["용인", 37.2411, 127.1776], ["부천", 37.5034, 126.766], ["안산", 37.3219, 126.8309],
    ["안양", 37.3943, 126.9568], ["남양주", 37.636, 127.2165], ["화성", 37.1995, 126.8312], ["평택", 36.9921, 127.1129], ["의정부", 37.7381, 127.0337], ["시흥", 37.38, 126.8029],
    ["파주", 37.76, 126.78], ["김포", 37.6153, 126.7156], ["광명", 37.4786, 126.8646], ["광주", 37.4295, 127.255], ["군포", 37.3617, 126.9352], ["하남", 37.5393, 127.2148],
    ["오산", 37.1499, 127.0773], ["이천", 37.272, 127.435], ["안성", 37.008, 127.2797], ["의왕", 37.3447, 126.9683], ["양주", 37.7853, 127.0459], ["구리", 37.5943, 127.1296],
    ["포천", 37.8949, 127.2003], ["여주", 37.2983, 127.637], ["동두천", 37.9036, 127.0606], ["과천", 37.4292, 126.9876], ["가평", 37.8315, 127.5105], ["양평", 37.4917, 127.4875], ["연천", 38.0966, 127.0748]],
  강원: [["춘천", 37.8813, 127.7298], ["원주", 37.3422, 127.9202], ["강릉", 37.7519, 128.8761], ["동해", 37.5247, 129.1143], ["태백", 37.1641, 128.9856], ["속초", 38.207, 128.5918],
    ["삼척", 37.45, 129.1652], ["홍천", 37.697, 127.8888], ["횡성", 37.4917, 127.985], ["영월", 37.1837, 128.4617], ["평창", 37.3708, 128.3903], ["정선", 37.3807, 128.6608],
    ["철원", 38.1467, 127.3133], ["화천", 38.1062, 127.7082], ["양구", 38.11, 127.9897], ["인제", 38.0697, 128.1707], ["고성", 38.3806, 128.4678], ["양양", 38.0754, 128.619]],
  충북: [["청주", 36.6424, 127.489], ["충주", 36.991, 127.9259], ["제천", 37.1326, 128.191], ["보은", 36.4894, 127.7295], ["옥천", 36.3064, 127.5714], ["영동", 36.175, 127.7764],
    ["증평", 36.7853, 127.5815], ["진천", 36.8554, 127.4356], ["괴산", 36.8154, 127.7867], ["음성", 36.9403, 127.6905], ["단양", 36.9845, 128.3655]],
  충남: [["천안", 36.8151, 127.1139], ["공주", 36.4465, 127.119], ["보령", 36.3334, 126.6129], ["아산", 36.7898, 127.0019], ["서산", 36.7848, 126.4503], ["논산", 36.1872, 127.0987],
    ["계룡", 36.2745, 127.2487], ["당진", 36.8898, 126.6459], ["금산", 36.1088, 127.4882], ["부여", 36.2757, 126.9099], ["서천", 36.0803, 126.6918], ["청양", 36.4591, 126.8022],
    ["홍성", 36.6011, 126.6608], ["예산", 36.6827, 126.8448], ["태안", 36.7456, 126.2979]],
  전북: [["전주", 35.8242, 127.148], ["군산", 35.9677, 126.7366], ["익산", 35.9483, 126.9577], ["정읍", 35.5699, 126.8559], ["남원", 35.4164, 127.3904], ["김제", 35.8036, 126.8809],
    ["완주", 35.9046, 127.1622], ["진안", 35.7917, 127.4249], ["무주", 36.0068, 127.6608], ["장수", 35.6473, 127.5212], ["임실", 35.6178, 127.289], ["순창", 35.3744, 127.1374],
    ["고창", 35.4358, 126.702], ["부안", 35.7317, 126.7335]],
  전남: [["목포", 34.8118, 126.3922], ["여수", 34.7604, 127.6622], ["순천", 34.9506, 127.4872], ["나주", 35.0159, 126.7108], ["광양", 34.9407, 127.6959], ["담양", 35.3211, 126.9882],
    ["곡성", 35.282, 127.292], ["구례", 35.2025, 127.4627], ["고흥", 34.6111, 127.2852], ["보성", 34.7714, 127.08], ["화순", 35.0645, 126.9864], ["장흥", 34.6817, 126.907],
    ["강진", 34.642, 126.7672], ["해남", 34.5735, 126.5991], ["영암", 34.8002, 126.6968], ["무안", 34.9904, 126.4817], ["함평", 35.066, 126.5165], ["영광", 35.2772, 126.512],
    ["장성", 35.3018, 126.7849], ["완도", 34.311, 126.755], ["진도", 34.4868, 126.2635], ["신안", 34.8335, 126.3516]],
  경북: [["포항", 36.019, 129.3435], ["경주", 35.8562, 129.2247], ["김천", 36.1398, 128.1136], ["안동", 36.5684, 128.7294], ["구미", 36.1195, 128.3446], ["영주", 36.8057, 128.624],
    ["영천", 35.9733, 128.9386], ["상주", 36.4109, 128.159], ["문경", 36.5865, 128.1867], ["경산", 35.8251, 128.7414], ["의성", 36.3527, 128.697], ["청송", 36.436, 129.0572],
    ["영양", 36.6667, 129.1124], ["영덕", 36.415, 129.3653], ["청도", 35.6474, 128.734], ["고령", 35.7262, 128.263], ["성주", 35.9193, 128.2829], ["칠곡", 35.9955, 128.4017],
    ["예천", 36.6577, 128.4529], ["봉화", 36.8932, 128.7325], ["울진", 36.993, 129.4004], ["울릉", 37.4844, 130.9058], ["군위", 36.2428, 128.5728]],
  경남: [["창원", 35.228, 128.6811], ["진주", 35.18, 128.1076], ["통영", 34.8544, 128.4331], ["사천", 35.0037, 128.0642], ["김해", 35.2285, 128.8894], ["밀양", 35.5038, 128.7466],
    ["거제", 34.8806, 128.6211], ["양산", 35.335, 129.0373], ["의령", 35.3222, 128.2617], ["함안", 35.2725, 128.4065], ["창녕", 35.5444, 128.4924], ["고성", 34.973, 128.3222],
    ["남해", 34.8377, 127.8924], ["하동", 35.0674, 127.7513], ["산청", 35.4156, 127.8734], ["함양", 35.5205, 127.7251], ["거창", 35.6867, 127.9095], ["합천", 35.5666, 128.1658]],
  제주: [["제주", 33.4996, 126.5312], ["서귀포", 33.2541, 126.56]],
};
// 주소 첫 글자 → 시도
const SIDO_ALIAS = [
  [/^서울/, "서울"], [/^부산/, "부산"], [/^대구/, "대구"], [/^인천/, "인천"], [/^광주(광역시|$|\s)/, "광주"], [/^대전/, "대전"], [/^울산/, "울산"], [/^세종/, "세종"],
  [/^경기/, "경기"], [/^강원/, "강원"], [/^(충청북|충북)/, "충북"], [/^(충청남|충남)/, "충남"], [/^(전라북|전북)/, "전북"], [/^(전라남|전남)/, "전남"],
  [/^(경상북|경북)/, "경북"], [/^(경상남|경남)/, "경남"], [/^제주/, "제주"],
];
const SGG_INDEX = (() => {
  const m = new Map();
  for (const [sido, list] of Object.entries(SGG)) for (const [n, lat, lon] of list) {
    const arr = m.get(n) || []; arr.push({ sido, n, lat, lon }); m.set(n, arr);
  }
  return m;
})();
const sggBase = (tok) => String(tok || "").replace(/(특별자치시|특별자치도|광역시|특별시)$/, "").replace(/(시|군)$/, "");
const mkRegion = (sido, sgg, lat, lon) => {
  const { nx, ny } = latLonToGrid(lat, lon);
  const key = sgg ? `${sido}_${sgg}` : sido;
  return { key, sido, sgg: sgg || "", name: sgg ? `${sido} ${sgg}` : sido, short: sgg || sido, lat, lon, nx, ny };
};
// 주소(또는 "경기 화성" · "화성시") → 날씨 지역 { key, sido, sgg, name, short, nx, ny } · 모르면 null
export function regionOfAddress(addr) {
  const s = String(addr || "").replace(/[()[\],]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const toks = s.split(" ");
  let sido = "";
  for (const [re, k] of SIDO_ALIAS) if (re.test(toks[0])) { sido = k; break; }
  if (sido) {
    if (METRO.has(sido)) {
      // 대구 군위군(2023 편입)은 날씨가 달라 따로
      if (sido === "대구" && /^군위/.test(toks[1] || "")) return mkRegion("대구", "군위", 36.2428, 128.5728);
      return mkRegion(sido, "", ...SIDO[sido]);
    }
    const b = sggBase(toks[1]);
    const hit = (SGG_INDEX.get(b) || []).find((x) => x.sido === sido);
    if (hit) return mkRegion(sido, hit.n, hit.lat, hit.lon);
    return mkRegion(sido, "", ...SIDO[sido]);
  }
  // 시도 없이 "화성시 ..." · "평택 포승읍" — 시군구 이름이 하나뿐일 때만
  for (let i = 0; i < Math.min(2, toks.length); i++) {
    const t = toks[i];
    if (i > 0 && !/(시|군)$/.test(t)) continue;
    const b = sggBase(t);
    const hits = SGG_INDEX.get(b) || [];
    if (hits.length === 1) return mkRegion(hits[0].sido, hits[0].n, hits[0].lat, hits[0].lon);
    if (b === "광주" && /시$/.test(t)) { const g = hits.find((x) => x.sido === "경기"); if (g) return mkRegion("경기", "광주", g.lat, g.lon); }
  }
  return null;
}
// 지역 키 → 지역(서버가 키만 받았을 때)
export function regionOfKey(key) {
  const [sido, sgg] = String(key || "").split("_");
  if (!SIDO[sido]) return null;
  if (!sgg) return mkRegion(sido, "", ...SIDO[sido]);
  if (sido === "대구" && sgg === "군위") return mkRegion("대구", "군위", 36.2428, 128.5728);
  const hit = (SGG[sido] || []).find(([n]) => n === sgg);
  return hit ? mkRegion(sido, hit[0], hit[1], hit[2]) : null;
}
export const ALL_REGION_KEYS = () => [...Object.keys(SIDO).filter((k) => METRO.has(k)), ...Object.entries(SGG).flatMap(([s, l]) => l.map(([n]) => `${s}_${n}`))];

// ─────────────────────────── ② 발표시각 · 응답 정리 ───────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const kst = (ms) => { const d = new Date(ms + 9 * 3600e3); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() }; };
const ymdOf = (t) => `${t.y}${pad(t.m)}${pad(t.d)}`;
// 단기예보: 02 05 08 11 14 17 20 23시 발표, 10분쯤 뒤부터 받을 수 있다
export function vilageBase(nowMs = Date.now()) {
  const t = kst(nowMs - 15 * 60e3);
  const hours = [23, 20, 17, 14, 11, 8, 5, 2];
  const h = hours.find((x) => x <= t.h);
  if (h === undefined) return { base_date: ymdOf(kst(nowMs - 15 * 60e3 - 24 * 3600e3)), base_time: "2300" };
  return { base_date: ymdOf(t), base_time: `${pad(h)}00` };
}
// 초단기예보: 매시 30분 발표, 45분쯤부터
export function ultraBase(nowMs = Date.now()) {
  const t = kst(nowMs - 45 * 60e3);
  return { base_date: ymdOf(t), base_time: `${pad(t.h)}30` };
}
// 응답 { response: { header: { resultCode }, body: { items: { item: [...] } } } } → { ok, items, error }
export function kmaItems(json) {
  const h = json?.response?.header;
  if (!h) {
    const msg = typeof json === "string" ? json : json?.msg || json?.message || "";
    return { ok: false, items: [], error: String(msg || "응답 형식이 달라요"), keyError: /SERVICE_KEY|인증키|NOT_REGISTERED/i.test(String(msg)) };
  }
  if (h.resultCode !== "00") return { ok: h.resultCode === "03", items: [], error: h.resultCode === "03" ? "" : `${h.resultCode} ${h.resultMsg || ""}`.trim(), noData: h.resultCode === "03", keyError: ["30", "31", "32", "20"].includes(String(h.resultCode)) };
  const it = json?.response?.body?.items?.item;
  return { ok: true, items: Array.isArray(it) ? it : it ? [it] : [] };
}
const num = (v) => { const n = parseFloat(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : null; };
// "강수없음" · "1mm 미만" · "30.0~50.0mm" → mm 숫자
const mm = (v) => { const s = String(v ?? ""); if (!s || /없음|^0$/.test(s)) return 0; if (/미만/.test(s)) return 0.5; const n = num(s.split("~").pop()); return n || 0; };
// 단기 · 초단기 예보 항목 → 시간별 { "YYYYMMDDHH": { t, pty, sky, pop, wsd, pcp, sno } } (초단기가 같은 시간을 덮는다)
export function mergeForecast(vilItems = [], ultraItems = []) {
  const hours = {};
  const put = (it, ultra) => {
    const k = `${it.fcstDate}${String(it.fcstTime || "").slice(0, 2)}`;
    if (!/^\d{10}$/.test(k)) return;
    const h = hours[k] || (hours[k] = {});
    const v = it.fcstValue;
    switch (it.category) {
      case "TMP": if (!ultra) h.t = num(v); break;
      case "T1H": h.t = num(v); break;
      case "PTY": h.pty = Number(v) || 0; break;
      case "SKY": h.sky = Number(v) || 0; break;
      case "POP": h.pop = num(v); break;
      case "WSD": h.wsd = num(v); break;
      case "PCP": h.pcp = mm(v); break;
      case "RN1": h.pcp = mm(v); break;
      case "SNO": h.sno = mm(v); break;
      default: break;
    }
  };
  vilItems.forEach((it) => put(it, false));
  ultraItems.forEach((it) => put(it, true));
  return hours;
}
// 지난 시간은 빼고 앞으로 maxHours시간만
export function trimHours(hours, nowMs = Date.now(), maxHours = 80) {
  const t = kst(nowMs); const from = `${ymdOf(t)}${pad(t.h)}`;
  const out = {};
  Object.keys(hours).sort().filter((k) => k >= from).slice(0, maxHours).forEach((k) => { out[k] = hours[k]; });
  return out;
}

// ─────────────────────────── ② 날씨 표시 ───────────────────────────
// "2026-11-07" + "14:30" · "오후 2시" · "즉시" → "2026110714"
export function slotKey(ymd, time, nowMs = Date.now()) {
  const d = String(ymd || "").replace(/[^\d]/g, "").slice(0, 8);
  if (d.length !== 8) return "";
  let h = null;
  const s = String(time || "");
  const m = s.match(/(\d{1,2})\s*[:시]/) || s.match(/^(\d{1,2})$/);
  if (m) { h = Number(m[1]); if (/오후|PM/i.test(s) && h < 12) h += 12; if (/오전|AM/i.test(s) && h === 12) h = 0; }
  if (h === null || h > 23) {
    const t = kst(nowMs);
    h = d === ymdOf(t) ? Math.max(t.h, 9) : 9; // 시간 없는 오더(즉시 · 미정)는 오늘이면 지금, 아니면 오전 9시
  }
  return `${d}${pad(h)}`;
}
// 시간별 자료에서 그 시각(없으면 가장 가까운 시각, 3시간 안)
export function weatherAt(hours, key) {
  if (!hours || !key) return null;
  if (hours[key]) return { ...hours[key], at: key };
  const ks = Object.keys(hours).sort();
  const toMs = (k) => Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8), +k.slice(8, 10));
  const target = toMs(key);
  let best = null, bd = Infinity;
  for (const k of ks) { const dd = Math.abs(toMs(k) - target); if (dd < bd) { bd = dd; best = k; } }
  return best && bd <= 3 * 3600e3 ? { ...hours[best], at: best } : null;
}
// 비 · 눈 · 강풍 · 폭염 · 한파 표시(아무것도 없으면 맑음/흐림 정도만)
export function weatherFlags(h) {
  if (!h) return { kinds: [], label: "", sky: "" };
  const kinds = [];
  const pty = Number(h.pty) || 0;
  if ([1, 2, 4, 5, 6].includes(pty) || (h.pcp || 0) >= 1) kinds.push("rain");
  if ([2, 3, 6, 7].includes(pty) || (h.sno || 0) > 0) kinds.push("snow");
  if ((h.wsd || 0) >= 9) kinds.push("wind");
  if (h.t !== null && h.t !== undefined && h.t >= 33) kinds.push("heat");
  if (h.t !== null && h.t !== undefined && h.t <= -10) kinds.push("cold");
  const sky = Number(h.sky) === 4 ? "흐림" : Number(h.sky) === 3 ? "구름많음" : Number(h.sky) === 1 ? "맑음" : "";
  const L = { rain: "비", snow: "눈", wind: "강풍", heat: "폭염", cold: "한파" };
  const label = kinds.length ? kinds.map((k) => L[k]).join("·") : sky;
  return { kinds, label, sky };
}
export const WEATHER_KIND_LABEL = { rain: "비", snow: "눈", wind: "강풍", heat: "폭염", cold: "한파" };

// ─────────────────────────── ③ 기상특보 ───────────────────────────
const SIDO_WARN_ALIAS = [
  [/^서울/, "서울"], [/^부산/, "부산"], [/^대구/, "대구"], [/^인천/, "인천"], [/^광주/, "광주"], [/^대전/, "대전"], [/^울산/, "울산"], [/^세종/, "세종"],
  [/^경기/, "경기"], [/^강원/, "강원"], [/^(충청북|충북)/, "충북"], [/^(충청남|충남)/, "충남"], [/^(전라북|전북)/, "전북"], [/^(전라남|전남)/, "전남"],
  [/^(경상북|경북)/, "경북"], [/^(경상남|경남)/, "경남"], [/^제주/, "제주"],
];
// 바깥 쉼표로만 나누기("강원도(강릉시평지, 동해시평지), 경상북도(포항)" → 2개)
function splitTop(s) {
  const out = []; let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
// getPwnStatus item.t6(발효 현황) 글 → [{ type: "호우주의보", kind: "호우", level: "주의보", sido: "경기", subs: ["화성", ...] }]
export function parseWarnText(text) {
  const out = [];
  String(text || "").split(/\r?\n/).forEach((line) => {
    const m = line.replace(/^\s*o\s*/, "").match(/^([가-힣]+(?:주의보|경보))\s*:\s*(.+)$/);
    if (!m) return;
    const type = m[1];
    const level = /경보$/.test(type) ? "경보" : "주의보";
    const kind = type.replace(/(주의보|경보)$/, "");
    splitTop(m[2]).forEach((part) => {
      const pm = part.match(/^([^(]+)(?:\((.*)\))?$/);
      if (!pm) return;
      const head = pm[1].trim();
      let sido = "";
      for (const [re, k] of SIDO_WARN_ALIAS) if (re.test(head)) { sido = k; break; }
      if (!sido) return; // 바다(서해중부앞바다 등) · 모르는 구역은 빼고
      const subs = pm[2] ? pm[2].split(/[,·]/).map((x) => x.trim()).filter(Boolean) : [];
      out.push({ type, kind, level, sido, subs });
    });
  });
  return out;
}
// getPwnStatus 응답 항목 → 발효 중인 특보 목록(가장 최근 발표 하나)
export function parseWarnStatus(items = []) {
  const list = [...items].sort((a, b) => String(b.tmFc || "").localeCompare(String(a.tmFc || "")));
  const top = list[0];
  if (!top) return { tmFc: "", active: [], text: "" };
  return { tmFc: String(top.tmFc || ""), active: parseWarnText(top.t6), text: String(top.t6 || "").trim(), pre: String(top.t7 || "").trim() };
}
// 이 지역에 걸린 특보(시도가 같고 · 괄호 안 구역 이름에 시군구가 들어 있거나, 시군구를 알 수 없는 넓은 구역이면 걸린 것으로)
export function warningsFor(region, active = []) {
  if (!region) return [];
  const known = new Set((SGG[region.sido] || []).map(([n]) => n));
  return active.filter((w) => {
    if (w.sido !== region.sido) return false;
    if (!w.subs.length || METRO.has(region.sido) || !region.sgg) return true;
    if (w.subs.some((s) => s.startsWith(region.sgg))) return true;
    // 괄호 안이 시군구 이름이 아닌 넓은 구역(북부 · 남부 · 산지 · 동부 등)뿐이면 도 전체로 본다
    return !w.subs.some((s) => [...known].some((n) => s.startsWith(n)));
  });
}
export const warnShort = (ws) => [...new Set((ws || []).map((w) => w.type))].join(" · ");
