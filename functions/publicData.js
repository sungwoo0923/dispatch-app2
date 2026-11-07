// ======================= functions/publicData.js =======================
// 🏛 2026-11-07 공공데이터포털(data.go.kr) 연동 — 국세청 사업자 상태 · 기상청 단기예보 · 기상특보
//  규칙(번호 검증식 · 격자 변환 · 응답 정리)은 functions/publicDataCore.mjs(화면과 같은 파일)
//  · 키: Firebase 비밀값 DATA_GO_KR_KEY 하나(공공데이터포털 "일반 인증키(Decoding)"). 세 서비스 모두 활용신청해야 한다.
//    키가 없거나 "none"이면 { disabled: true }만 돌려준다(화면은 조용히 숨기거나 "국세청 조회 키가 아직 없어요")
//  · bizStatusCache/{번호}    국세청 결과 24시간 보관(서버만)
//  · bizStatusUsage/{uid_날짜} 사람마다 하루 조회 수(서버만)
//  · weatherCache/{지역 키}    시간별 예보(서버만 쓰고, 승인된 직원 · 허브 회원이 읽는다) · weatherCache/_warn 특보 현황
//  · weatherUsage/{uid_날짜}  사람마다 하루 새로 받기 수(서버만)
//  호출하는 쪽(index.js)이 db · fetch · 키를 넘긴다 — 테스트는 가짜 db · fetch로 돌린다(scripts/publicData.test.mjs)

const SUPER_EMAIL = "tjddnqkf@naver.com";
const NTS_URL = "https://api.odcloud.kr/api/nts-businessman/v1/status";
const KMA_VIL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";
const KMA_ULTRA = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst";
const KMA_PWN = "https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus";
const KMA_WRN_LIST = "https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList";

const BIZ_TTL = 24 * 3600e3;
const WEATHER_TTL = 3600e3; // 화면에서 부르면 1시간 안 자료는 그대로
const WARN_TTL = 30 * 60e3;
// 하루 조회 수 · 한 번에 넣을 수 있는 번호 수(직원 · 허브 회원 · 가입 중)
const BIZ_TIER = { staff: { perCall: 100, perDay: 2000 }, hub: { perCall: 10, perDay: 200 }, signup: { perCall: 1, perDay: 20 } };
const WEATHER_PER_CALL = 40;
const WEATHER_PER_DAY = 400;

const kstYmd = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

class PdError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

let corePromise = null;
const loadCore = () => (corePromise || (corePromise = import("./publicDataCore.mjs")));

// 공공데이터포털 키 — Decoding 키를 넣으면 주소용으로 한 번 인코딩, 이미 인코딩된 키(%2B 등)는 그대로
const keyOk = (k) => !!k && String(k).trim() !== "" && String(k).trim().toLowerCase() !== "none";
const encKey = (k) => { const s = String(k).trim(); return /%[0-9A-F]{2}/i.test(s) ? s : encodeURIComponent(s); };

// 로그인한 사람 → { uid, tier, co, isTM, isAdmin }
async function callerOf(db, auth, { allowSignup = false } = {}) {
  const uid = auth?.uid;
  if (!uid) throw new PdError("unauthenticated", "로그인이 필요해요");
  const email = auth.token?.email || "";
  const u = await db.collection("users").doc(uid).get();
  const d = u.exists ? (u.data() || {}) : {};
  const isTM = email === SUPER_EMAIL || d.role === "totalMaster";
  if (isTM) return { uid, tier: "staff", co: d.companyName || "돌캐", isTM: true, isAdmin: true };
  if (u.exists && d.approved !== false && d.employmentStatus !== "퇴사" && d.role !== "cafeUser") {
    const co = d.companyName || "돌캐";
    if (co) {
      const plan = await db.collection("companyPlans").doc(co).get().catch(() => null);
      if (plan?.exists && plan.data()?.status === "ended") throw new PdError("permission-denied", "계약이 끝난 회사는 쓸 수 없어요");
    }
    const isAdmin = ["admin", "allMgr", "hrManager", "hrAcct"].includes(d.role) || d.isMaster === true;
    return { uid, tier: ["driver", "shipper"].includes(d.role) ? "hub" : "staff", co, isTM: false, isAdmin };
  }
  const m = await db.collection("hubMembers").doc(uid).get();
  if (m.exists && m.data()?.status === "approved") return { uid, tier: "hub", co: "", isTM: false, isAdmin: false };
  if (allowSignup) return { uid, tier: "signup", co: "", isTM: false, isAdmin: false };
  throw new PdError("permission-denied", "승인된 계정만 쓸 수 있어요");
}

// 하루 횟수(트랜잭션) — n개를 더 써도 되는지 보고 더한다
async function takeQuota(db, col, uid, field, n, limit, now) {
  if (n <= 0) return limit;
  const ref = db.collection(col).doc(`${uid}_${kstYmd(now).replace(/-/g, "")}`);
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const used = Number(s.exists ? s.data()?.[field] || 0 : 0);
    if (used + n > limit) throw new PdError("resource-exhausted", "오늘 조회를 다 썼어요. 내일 다시 해 주세요");
    tx.set(ref, { uid, date: kstYmd(now), [field]: used + n, updatedAt: now }, { merge: true });
    return limit - used - n;
  });
}

async function fetchJson(fetchFn, url, opts = {}, ms = 9000) {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), ms) : null;
  try {
    const res = await fetchFn(url, { ...opts, signal: ctl?.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    // 공공데이터포털은 키 오류를 XML로 돌려줄 때가 있다
    if (!json) {
      const msg = (text.match(/<returnAuthMsg>([^<]+)</) || text.match(/<errMsg>([^<]+)</) || [])[1] || `HTTP ${res.status}`;
      return { status: res.status, json: { msg } };
    }
    return { status: res.status, json };
  } finally { if (timer) clearTimeout(timer); }
}

function makePublicData({ db, fetch: fetchFn, getKey, now: nowFn = () => Date.now() }) {
  // ─────────────── 국세청 사업자 상태 ───────────────
  async function bizStatusCheck(data, auth) {
    const C = await loadCore();
    const who = await callerOf(db, auth, { allowSignup: true });
    const tier = BIZ_TIER[who.tier];
    const raw = Array.isArray(data?.bNos) ? data.bNos : data?.bNo ? [data.bNo] : [];
    const nums = [...new Set(raw.map(C.bizNoDigits).filter(Boolean))];
    if (!nums.length) throw new PdError("invalid-argument", "사업자번호를 넣어 주세요");
    if (nums.length > tier.perCall) throw new PdError("invalid-argument", `한 번에 ${tier.perCall}개까지 확인할 수 있어요`);
    const results = {};
    const valid = [];
    nums.forEach((n) => { if (C.bizNoValid(n)) valid.push(n); else results[n] = { bNo: n, state: "invalid", label: C.BIZ_STATE_LABEL.invalid }; });
    if (!valid.length) return { results, disabled: false };
    const key = getKey();
    const now = nowFn();
    // 24시간 안에 본 번호는 저장해 둔 값
    const snaps = await Promise.all(valid.map((n) => db.collection("bizStatusCache").doc(n).get().catch(() => null)));
    const need = [];
    snaps.forEach((s, i) => {
      const d = s?.exists ? s.data() : null;
      if (d && Number(d.checkedAt || 0) > now - BIZ_TTL) results[valid[i]] = { ...pickBiz(d), cached: true };
      else need.push(valid[i]);
    });
    if (!need.length) return { results, disabled: false };
    if (!keyOk(key)) {
      need.forEach((n) => { results[n] = { bNo: n, state: "unknown", label: C.BIZ_STATE_LABEL.unknown }; });
      return { results, disabled: true, reason: "no-key" };
    }
    await takeQuota(db, "bizStatusUsage", who.uid, "count", need.length, tier.perDay, now);
    const { status, json } = await fetchJson(fetchFn, `${NTS_URL}?serviceKey=${encKey(key)}&returnType=JSON`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ b_no: need }),
    }).catch((e) => ({ status: 0, json: { msg: String(e?.message || e) } }));
    const parsed = C.parseNtsStatus(json);
    if (!parsed.ok) {
      console.error("[국세청 조회] 실패:", status, parsed.error);
      if (parsed.keyError || status === 401) return { results: { ...results, ...Object.fromEntries(need.map((n) => [n, { bNo: n, state: "unknown", label: C.BIZ_STATE_LABEL.unknown }])) }, disabled: true, reason: "bad-key" };
      throw new PdError("unavailable", "국세청 조회가 잠시 안 돼요. 잠시 뒤 다시 해 주세요");
    }
    const batch = db.batch();
    parsed.rows.forEach((r) => {
      const doc = { ...r, checkedAt: now };
      results[r.bNo] = { ...pickBiz(doc), cached: false };
      batch.set(db.collection("bizStatusCache").doc(r.bNo), doc);
    });
    await batch.commit().catch((e) => console.error("[국세청 조회] 저장 실패:", e?.message || e));
    need.forEach((n) => { if (!results[n]) results[n] = { bNo: n, state: "unknown", label: C.BIZ_STATE_LABEL.unknown }; });
    return { results, disabled: false };
  }
  const pickBiz = (d) => ({ bNo: d.bNo, state: d.state, label: d.label, code: d.code || "", taxType: d.taxType || "", endDt: d.endDt || "", checkedAt: d.checkedAt || 0 });

  // ─────────────── 기상청 예보 ───────────────
  const kmaUrl = (base, params, key) => `${base}?serviceKey=${encKey(key)}&${new URLSearchParams({ dataType: "JSON", pageNo: "1", ...params }).toString()}`;

  async function fetchRegion(region, key, now) {
    const C = await loadCore();
    const vb = C.vilageBase(now);
    const ub = C.ultraBase(now);
    const [vil, ultra] = await Promise.all([
      fetchJson(fetchFn, kmaUrl(KMA_VIL, { numOfRows: "1000", ...vb, nx: String(region.nx), ny: String(region.ny) }, key)),
      fetchJson(fetchFn, kmaUrl(KMA_ULTRA, { numOfRows: "60", ...ub, nx: String(region.nx), ny: String(region.ny) }, key)).catch(() => ({ json: null })),
    ]);
    const v = C.kmaItems(vil.json);
    if (!v.ok) throw Object.assign(new PdError("unavailable", v.error || "기상청 응답 오류"), { keyError: v.keyError });
    const u = C.kmaItems(ultra.json);
    const hours = C.trimHours(C.mergeForecast(v.items, u.ok ? u.items : []), now);
    return { key: region.key, name: region.name, sido: region.sido, sgg: region.sgg, nx: region.nx, ny: region.ny, hours, base: `${vb.base_date}${vb.base_time}`, fetchedAt: now };
  }

  async function refreshWarnings(key, now) {
    const C = await loadCore();
    const ref = db.collection("weatherCache").doc("_warn");
    const { json } = await fetchJson(fetchFn, kmaUrl(KMA_PWN, { numOfRows: "10" }, key));
    const r = C.kmaItems(json);
    if (!r.ok) throw Object.assign(new PdError("unavailable", r.error || "특보 응답 오류"), { keyError: r.keyError });
    const st = C.parseWarnStatus(r.items);
    // 최근 특보 발표 제목(전국 108) — 띠에 한 줄로
    let titles = [];
    try {
      const from = kstYmd(now - 2 * 86400e3).replace(/-/g, "");
      const to = kstYmd(now).replace(/-/g, "");
      const l = C.kmaItems((await fetchJson(fetchFn, kmaUrl(KMA_WRN_LIST, { numOfRows: "5", stnId: "108", fromTmFc: from, toTmFc: to }, key))).json);
      titles = (l.items || []).map((x) => String(x.title || "").trim()).filter(Boolean).slice(0, 3);
    } catch { /* 제목은 없어도 된다 */ }
    const doc = { active: st.active, text: st.text.slice(0, 2000), pre: (st.pre || "").slice(0, 1000), tmFc: st.tmFc, titles, fetchedAt: now };
    await ref.set(doc);
    return doc;
  }

  // 지역 여러 곳 — 저장해 둔 값이 ttl 안이면 그대로, 아니면 새로 받는다
  async function ensureRegions(keys, { ttl = WEATHER_TTL, key, now, onFetch } = {}) {
    const C = await loadCore();
    const regions = keys.map((k) => C.regionOfKey(k)).filter(Boolean);
    const out = {};
    const snaps = await Promise.all(regions.map((r) => db.collection("weatherCache").doc(r.key).get().catch(() => null)));
    const stale = [];
    snaps.forEach((s, i) => {
      const d = s?.exists ? s.data() : null;
      if (d && Number(d.fetchedAt || 0) > now - ttl) out[regions[i].key] = d;
      else { stale.push(regions[i]); if (d) out[regions[i].key] = d; }
    });
    if (!stale.length || !keyOk(key)) return { out, fetched: 0 };
    if (onFetch) await onFetch(stale.length);
    let fetched = 0;
    let keyError = false;
    // 한 번에 4곳씩(기상청이 동시에 많이 부르면 느려진다)
    for (let i = 0; i < stale.length; i += 4) {
      const part = stale.slice(i, i + 4);
      const got = await Promise.all(part.map((r) => fetchRegion(r, key, now).catch((e) => { if (e.keyError) keyError = true; console.error("[기상청] 예보 실패:", r.key, e?.message || e); return null; })));
      const batch = db.batch();
      got.forEach((d) => { if (d) { out[d.key] = d; batch.set(db.collection("weatherCache").doc(d.key), d); fetched++; } });
      if (fetched) await batch.commit().catch((e) => console.error("[기상청] 저장 실패:", e?.message || e));
      if (keyError) break;
    }
    return { out, fetched, keyError };
  }

  async function weatherFor(data, auth) {
    const C = await loadCore();
    const who = await callerOf(db, auth);
    const key = getKey();
    const now = nowFn();
    const input = [...(Array.isArray(data?.regions) ? data.regions : []), ...(Array.isArray(data?.addresses) ? data.addresses : [])];
    const keys = [...new Set(input.map((x) => (C.regionOfKey(x) ? x : C.regionOfAddress(x)?.key)).filter(Boolean))];
    if (keys.length > WEATHER_PER_CALL) throw new PdError("invalid-argument", `한 번에 ${WEATHER_PER_CALL}곳까지 볼 수 있어요`);
    const { out, keyError } = await ensureRegions(keys, {
      key, now,
      onFetch: (n) => takeQuota(db, "weatherUsage", who.uid, "count", n, WEATHER_PER_DAY, now),
    });
    let warn = null;
    const ws = await db.collection("weatherCache").doc("_warn").get().catch(() => null);
    warn = ws?.exists ? ws.data() : null;
    if (keyOk(key) && (!warn || Number(warn.fetchedAt || 0) < now - WARN_TTL)) warn = await refreshWarnings(key, now).catch(() => warn);
    return { regions: out, warn, disabled: !keyOk(key) && !Object.keys(out).length, ...(keyError ? { reason: "bad-key" } : {}) };
  }

  // 3시간마다 — 오늘 · 내일 오더의 상차지 · 하차지 지역
  async function weatherRefresh({ maxRegions = 150 } = {}) {
    const C = await loadCore();
    const key = getKey();
    if (!keyOk(key)) return { skipped: "no-key" };
    const now = nowFn();
    const days = [kstYmd(now), kstYmd(now + 86400e3)];
    const keys = new Set();
    for (const col of ["orders", "dispatch"]) {
      const snap = await db.collection(col).where("상차일", "in", days).limit(5000).get().catch((e) => { console.error("[기상청] 오더 읽기 실패:", col, e?.message || e); return null; });
      snap?.docs?.forEach((d) => {
        const o = d.data() || {};
        if (o.배차상태 === "배차취소") return;
        [o.상차지주소, o.하차지주소].forEach((a) => { const r = C.regionOfAddress(a); if (r) keys.add(r.key); });
      });
    }
    // 허브 오더(오늘 · 내일 상차)
    const hub = await db.collection("hubOrders").where("상차일", "in", days).limit(2000).get().catch(() => null);
    hub?.docs?.forEach((d) => { const o = d.data() || {}; [[o.상차시도, o.상차시군구].filter(Boolean).join(" "), [o.하차시도, o.하차시군구].filter(Boolean).join(" ")].forEach((a) => { const r = C.regionOfAddress(a); if (r) keys.add(r.key); }); });
    const list = [...keys].slice(0, maxRegions);
    // 2시간 50분 안에 받은 지역은 건너뛴다(화면이 먼저 부른 곳)
    const { fetched, keyError } = await ensureRegions(list, { ttl: 170 * 60e3, key, now });
    const warn = await refreshWarnings(key, now).catch((e) => { console.error("[기상청] 특보 실패:", e?.message || e); return null; });
    return { regions: list.length, fetched, warn: warn ? warn.active.length : null, keyError: !!keyError };
  }

  // ─────────────── 연동 설정(관리센터) ───────────────
  async function testNts(key) {
    if (!keyOk(key)) return { status: "nokey" };
    try {
      const { status, json } = await fetchJson(fetchFn, `${NTS_URL}?serviceKey=${encKey(key)}&returnType=JSON`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ b_no: ["1208147521"] }),
      });
      const C = await loadCore();
      const p = C.parseNtsStatus(json);
      return p.ok ? { status: "ok" } : { status: "error", detail: p.keyError || status === 401 ? "키가 맞지 않거나 활용신청 승인 전이에요" : p.error };
    } catch (e) { return { status: "error", detail: String(e?.message || e) }; }
  }
  async function testKma(key) {
    if (!keyOk(key)) return { status: "nokey" };
    try {
      const C = await loadCore();
      const { json } = await fetchJson(fetchFn, kmaUrl(KMA_ULTRA, { numOfRows: "10", ...C.ultraBase(nowFn()), nx: "60", ny: "127" }, key));
      const r = C.kmaItems(json);
      if (!r.ok) return { status: "error", detail: r.keyError ? "키가 맞지 않거나 단기예보 활용신청 전이에요" : r.error };
      const { json: wj } = await fetchJson(fetchFn, kmaUrl(KMA_PWN, { numOfRows: "1" }, key));
      const w = C.kmaItems(wj);
      return w.ok ? { status: "ok" } : { status: "error", detail: w.keyError ? "기상특보 활용신청이 필요해요" : w.error };
    } catch (e) { return { status: "error", detail: String(e?.message || e) }; }
  }
  async function integrationStatus(data, auth) {
    const who = await callerOf(db, auth);
    if (!who.isTM) throw new PdError("permission-denied", "최고관리자만 볼 수 있어요");
    const key = getKey();
    const test = data?.test || "";
    const base = { nts: { status: keyOk(key) ? "ready" : "nokey" }, kma: { status: keyOk(key) ? "ready" : "nokey" } };
    if (test === "nts") base.nts = await testNts(key);
    if (test === "kma") base.kma = await testKma(key);
    const [bc, wc] = await Promise.all([
      db.collection("weatherCache").doc("_warn").get().catch(() => null),
      db.collection("bizStatusCache").orderBy("checkedAt", "desc").limit(1).get().catch(() => null),
    ]);
    base.kma.lastAt = bc?.exists ? Number(bc.data()?.fetchedAt || 0) : 0;
    base.nts.lastAt = wc?.docs?.[0] ? Number(wc.docs[0].data()?.checkedAt || 0) : 0;
    return base;
  }

  return { bizStatusCheck, weatherFor, weatherRefresh, integrationStatus, refreshWarnings, ensureRegions };
}

module.exports = { makePublicData, PdError, callerOf, keyOk, encKey, BIZ_TIER, NTS_URL, KMA_VIL, KMA_ULTRA, KMA_PWN };
