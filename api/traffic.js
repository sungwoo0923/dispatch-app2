// ======================= api/traffic.js =======================
// 🚦 2026-11-22 관제센터 1단계 — 국가교통정보센터(ITS) 오픈API 중계
//  · 브라우저에서 ITS를 바로 부르면 CORS로 막히고 인증키가 화면에 드러난다 → 여기서 대신 부른다.
//  · 인증키는 Vercel 환경변수 ITS_API_KEY 에만 둔다(코드 · 화면에 넣지 않는다).
//  · ?kind=events            : 전국 돌발상황(사고 · 공사 · 기상 · 재난 · 기타돌발) — 모든 지도가 이 1건을 같이 쓴다
//                              (CDN 60초 캐시 → 사용자가 많아도 ITS 호출은 1분에 1번 정도)
//  · ?kind=cctv&lat=&lng=&r= : 그 지점 근처 CCTV(고속도로 + 국도) — 사고 아이콘의 [CCTV 보기]
//  · 키가 없으면 { ok:false, reason:"no-key" } 를 200으로 준다(지도는 "교통정보 연결 전"만 보여 준다).
const ITS = "https://openapi.its.go.kr:9443";
const KOREA = { minX: 124.5, maxX: 131.9, minY: 33.0, maxY: 38.7 };

const withTimeout = async (url, ms = 6000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } }); } finally { clearTimeout(t); }
};
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const str = (v) => String(v ?? "").trim();

// "20261122143000" → ISO(KST)
function itsTime(v) {
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
  const blocked = /전면|전차로|차단|통제/.test(`${blockType} ${lanes} ${detail}`) && !/부분/.test(blockType);
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

async function fetchEvents(key) {
  const q = new URLSearchParams({ apiKey: key, type: "all", eventType: "all", getType: "json", ...Object.fromEntries(Object.entries(KOREA).map(([k, v]) => [k, String(v)])) });
  const r = await withTimeout(`${ITS}/eventInfo?${q}`, 12000);
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { throw new Error(`ITS 응답을 읽지 못했어요 (${r.status})`); }
  const code = data?.header?.resultCode;
  if (code != null && Number(code) !== 0) throw new Error(`ITS ${code} ${str(data?.header?.resultMsg)}`);
  const items = data?.body?.items || data?.items || [];
  const list = (Array.isArray(items) ? items : [items]).map(normalizeEvent).filter(Boolean);
  const seen = new Set();
  return list.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true))).slice(0, 1500);
}

async function fetchCctv(key, lat, lng, r) {
  const box = { minX: lng - r, maxX: lng + r, minY: lat - r, maxY: lat + r };
  const one = async (type, cctvType) => {
    const q = new URLSearchParams({ apiKey: key, type, cctvType: String(cctvType), getType: "json", ...Object.fromEntries(Object.entries(box).map(([k, v]) => [k, v.toFixed(5)])) });
    try {
      const res = await withTimeout(`${ITS}/cctvInfo?${q}`, 5000);
      const data = JSON.parse(await res.text());
      const arr = data?.response?.data || data?.data || [];
      return (Array.isArray(arr) ? arr : [arr]).map(normalizeCctv).filter(Boolean);
    } catch { return []; }
  };
  // 4 = 실시간 스트리밍(HTTPS) · 1 = 실시간 스트리밍(HLS). 로지스웹은 https 라 https 주소를 먼저 쓴다.
  const [ex4, its4] = await Promise.all([one("ex", 4), one("its", 4)]);
  let list = [...ex4, ...its4];
  if (!list.length) { const [ex1, its1] = await Promise.all([one("ex", 1), one("its", 1)]); list = [...ex1, ...its1]; }
  const d = (c) => (c.lat - lat) ** 2 + ((c.lng - lng) * 0.8) ** 2;
  return list.sort((a, b) => d(a) - d(b)).slice(0, 12);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  const key = process.env.ITS_API_KEY || "";
  const kind = str(req.query.kind || "events");
  if (!key) {
    res.setHeader("Cache-Control", "s-maxage=300");
    return res.status(200).json({ ok: false, reason: "no-key", items: [] });
  }
  try {
    // 🔧 점검용 — ITS 주소별로 연결되는지 · 몇 초 걸리는지(키 값은 내보내지 않는다)
    if (kind === "diag") {
      const box = "minX=126.9&maxX=127.2&minY=37.4&maxY=37.6";
      const targets = [
        ["https-9443", `https://openapi.its.go.kr:9443/eventInfo?apiKey=${encodeURIComponent(key)}&type=all&eventType=all&${box}&getType=json`],
        ["https-443", `https://openapi.its.go.kr/eventInfo?apiKey=${encodeURIComponent(key)}&type=all&eventType=all&${box}&getType=json`],
        ["http-9443", `http://openapi.its.go.kr:9443/eventInfo?apiKey=${encodeURIComponent(key)}&type=all&eventType=all&${box}&getType=json`],
      ];
      const out = await Promise.all(targets.map(async ([name, url]) => {
        const t0 = Date.now();
        try {
          const r = await withTimeout(url, 11000);
          const text = await r.text();
          return { name, status: r.status, ms: Date.now() - t0, body: text.slice(0, 300).split(key).join("***") };
        } catch (e) { return { name, error: String(e?.cause?.code || e?.message || e), ms: Date.now() - t0 }; }
      }));
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ok: true, keyLength: key.length, out });
    }
    if (kind === "cctv") {
      const lat = num(req.query.lat), lng = num(req.query.lng);
      const r = Math.min(0.2, Math.max(0.01, num(req.query.r) || 0.06));
      if (lat == null || lng == null) return res.status(400).json({ ok: false, reason: "bad-point", items: [] });
      const items = await fetchCctv(key, lat, lng, r);
      res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
      return res.status(200).json({ ok: true, items });
    }
    const items = await fetchEvents(key);
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json({ ok: true, at: Date.now(), items });
  } catch (e) {
    res.setHeader("Cache-Control", "s-maxage=20");
    return res.status(200).json({ ok: false, reason: "upstream", message: String(e?.message || e).slice(0, 200), items: [] });
  }
}
