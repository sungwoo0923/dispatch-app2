// ======================= src/itsCore.js =======================
// 🚦 2026-11-22 ITS(국가교통정보센터) 응답 정리 · 브라우저에서 바로 부르기
//  ⚠️ ITS는 클라우드 서버(Vercel · AWS)의 접속을 받지 않는다(서울 리전도 연결 시간 초과 — 2026-11-22 점검).
//     사무실 PC · 휴대폰(국내 인터넷)에서는 잘 열린다 → 사장님 결정(2026-11-22)으로 브라우저가 ITS를 직접 부른다.
//  정리 함수는 api/traffic.js 와 같은 내용(api 폴더는 commonjs 라 따로 둔다 — scripts/controlTower.test.mjs 가 둘이 같은지 검사).
export const ITS = "https://openapi.its.go.kr:9443";
export const KOREA = { minX: 124.5, maxX: 131.9, minY: 33.0, maxY: 38.7 };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const str = (v) => String(v ?? "").trim();

// "20261122143000" → ISO(KST)
export function itsTime(v) {
  const s = str(v).replace(/\D/g, "");
  if (s.length < 12) return "";
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14) || "00"}+09:00`;
}

export function eventKind(type, detail = "", msg = "") {
  const t = `${type} ${detail}`;
  if (/사고/.test(t)) return "accident";
  if (/공사|작업|보수/.test(t)) return "work";
  if (/기상|눈|비|안개|결빙|강풍/.test(t)) return "weather";
  if (/재난|화재|산사태|침수|낙석/.test(t)) return "disaster";
  if (/고장|정체|낙하물|돌발/.test(t) || /고장|낙하물/.test(msg)) return "hazard";
  return "etc";
}

export function normalizeEvent(it, i = 0) {
  const lng = num(it.coordX ?? it.coordx), lat = num(it.coordY ?? it.coordy);
  if (lat == null || lng == null || lat < 32 || lat > 40 || lng < 123 || lng > 133) return null;
  const type = str(it.eventType), detail = str(it.eventDetailType), msg = str(it.message);
  const lanes = str(it.lanesBlocked), blockType = str(it.lanesBlockType);
  // 전면통제 — 차로 칸 · 세부 유형 · 설명 글(ITS는 "전면통제"를 설명 글에만 적는 경우가 많다)에서 찾는다. "부분통제"만 있으면 아님
  const blocked = /전면\s*(통제|차단)|전\s*차로\s*(통제|차단)/.test(`${blockType} ${lanes} ${detail} ${msg}`)
    || (/전면|전차로|차단/.test(`${blockType} ${lanes}`) && !/부분/.test(`${blockType} ${lanes}`));
  const start = itsTime(it.startDate);
  return {
    id: `${str(it.linkId) || "x"}-${lat.toFixed(4)}-${lng.toFixed(4)}-${str(it.startDate) || i}`,
    kind: eventKind(type, detail, msg), type, detail, blocked,
    road: str(it.roadName), roadNo: str(it.roadNo), dir: str(it.roadDrcType), lanes, msg,
    lat, lng, start, end: itsTime(it.endDate), src: str(it.type),
  };
}

export function normalizeCctv(it) {
  const lng = num(it.coordx ?? it.coordX), lat = num(it.coordy ?? it.coordY);
  const url = str(it.cctvurl ?? it.cctvUrl);
  if (lat == null || lng == null || !url) return null;
  return { name: str(it.cctvname ?? it.cctvName) || "CCTV", lat, lng, url, format: str(it.cctvformat ?? it.cctvFormat), type: str(it.cctvtype ?? it.cctvType) };
}

// ITS 설명 글 정리 — "<공사>::국회대로::목동9137::목동9137::양방향 전체차로::[공사/통제]…/장소 : …/통제 : …::지하시설 작업 서울청"
//  → { where: "국회대로", lanes: "양방향 전체차로", lines: ["…폐쇄", "장소: …", "통제: …"], org: "지하시설 작업 서울청" }
const isNodeCode = (v) => !v || /\d{3,}/.test(v);
export function prettyMessage(msg = "", road = "") {
  const raw = String(msg || "").trim();
  if (!raw) return { where: road, lanes: "", lines: [], org: "" };
  if (!raw.includes("::")) return { where: road, lanes: "", lines: raw.split(/\s*\/\s*/).filter(Boolean), org: "" };
  const p = raw.split("::").map((x) => x.trim());
  const head = /^<.*>$/.test(p[0]) ? p.shift() : "";
  void head;
  const [r = road, from = "", to = "", lanes = "", body = "", ...rest] = p;
  const span = !isNodeCode(from) && !isNodeCode(to) && from !== to ? ` (${from} → ${to})` : !isNodeCode(from) ? ` (${from})` : "";
  const lines = String(body).replace(/^\[[^\]]*\]\s*/, "").split(/\s*\/\s*/).map((x) => x.replace(/\s*:\s*/, ": ").trim()).filter(Boolean);
  return { where: `${r || road}${span}`, lanes, lines, org: rest.join(" ").replace(/\s+/g, " ").trim() };
}

export function eventsUrl(key, box = KOREA) {
  const q = new URLSearchParams({ apiKey: key, type: "all", eventType: "all", getType: "json", ...Object.fromEntries(Object.entries(box).map(([k, v]) => [k, String(v)])) });
  return `${ITS}/eventInfo?${q}`;
}
export function cctvUrl(key, type, cctvType, box) {
  const q = new URLSearchParams({ apiKey: key, type, cctvType: String(cctvType), getType: "json", ...Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Number(v).toFixed(5)])) });
  return `${ITS}/cctvInfo?${q}`;
}
// ITS 돌발 응답(JSON) → 정리된 목록
export function parseEvents(data) {
  const code = data?.header?.resultCode;
  if (code != null && Number(code) !== 0) throw new Error(`ITS ${code} ${str(data?.header?.resultMsg)}`);
  const items = data?.body?.items || data?.items || [];
  const list = (Array.isArray(items) ? items : [items]).map(normalizeEvent).filter(Boolean);
  const seen = new Set();
  return list.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true))).slice(0, 1500);
}
export function parseCctv(data) {
  const arr = data?.response?.data || data?.data || [];
  return (Array.isArray(arr) ? arr : [arr]).map(normalizeCctv).filter(Boolean);
}
