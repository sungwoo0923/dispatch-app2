// ======================= functions/seedTestCompany.js =======================
// 🧪 2026-11-08 테스트 회사 가짜 데이터(관리센터 › 보안·데이터 › 테스트 데이터) · 호출형 seedTestCompany
//  · 최고관리자만. 대상 회사는 SEED_ALLOWED_COMPANIES(= ["테스트운송사"])만 · 다른 이름은 요청해도 거절한다.
//  · action
//     seed    없는 것만 채운다(문서 번호가 정해져 있어 몇 번 눌러도 중복 없음)
//     reset   이 도구가 만든 문서(_seed: "test-v1" + companyName 같은 것)만 지우고 다시 채운다
//     refresh 날짜를 오늘 기준으로 다시 맞춘다(테스트 문서만 덮어쓰고, 새 목록에 없는 테스트 문서는 지움) · 매주 자동 실행
//     clear   테스트 문서만 지운다(다시 채우지 않음)
//     status  컬렉션별 테스트 문서 수
//  · 이어서 하기: 한 번 호출은 budgetMs(기본 50초)만 일하고 { partial: true, cursor }를 돌려준다 → 화면이 cursor를 넣어 다시 부른다.
//  · 한 묶음 400건 이하. 실제 직원 문서는 비어 있는 인사 칸(부서 · 직책 · 입사일)만 채우고 채운 값을 _seedFilled에 적어 둔다
//    (reset · clear 때 그 값이 그대로일 때만 되돌린다 · 역할 · 승인 · 로그인 계정은 건드리지 않음).
//  · 실제 직원의 출근기록 · 급여 설정 · 급여명세서는 "없을 때만" 만든다(이미 있는 실제 기록은 덮어쓰지 않음).
//  · 로그인 계정(Firebase Auth)은 만들지 않는다. 가짜 직원은 users 문서만(이메일 seedNN@test.logisweb.co.kr · 로그인 불가).
//  · 알림: 테스트 문서에는 _seed 표시가 있어 알림 함수들이 건너뛴다(index.js). 오더 알림은 대량 작업 표시(bulkMode)로도 한 번 더 막는다.

const SEED_STATE_COL = "seedState";
const BATCH_MAX = 400;
const READ_CHUNK = 300;
const SUPER_EMAIL = "tjddnqkf@naver.com";
const NON_STAFF = ["driver", "shipper", "cafeUser", "totalMaster"];
const ACTIONS = ["seed", "reset", "refresh", "clear", "status"];
const FILL_FIELDS = ["team", "position", "hireDate"];

let _core = null;
const loadCore = () => (_core || (_core = import("./seedTestData.mjs")));

class SeedError extends Error { constructor(code, message) { super(message); this.code = code; } }

// 대상 회사 확인(순수) · 테스트 대상 이름과 정확히 같아야 한다
function checkTargetCompany(company, allowed) {
  const co = String(company ?? "").trim();
  if (!co) throw new SeedError("invalid-argument", "회사를 골라 주세요");
  if (!allowed.includes(co) || co !== String(company)) throw new SeedError("permission-denied", `가짜 데이터는 ${allowed.join(", ")}에만 넣을 수 있어요`);
  return co;
}

// { __ts: ms } → Timestamp (배열 · 객체 안까지)
function toFs(v, Timestamp) {
  if (Array.isArray(v)) return v.map((x) => toFs(x, Timestamp));
  if (v && typeof v === "object") {
    if (typeof v.__ts === "number" && Object.keys(v).length === 1) return Timestamp.fromMillis(v.__ts);
    const o = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = toFs(x, Timestamp);
    return o;
  }
  return v;
}
const sameVal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function makeSeedTestCompany({ db, FieldValue, Timestamp, setBulkMode = async () => {}, now = () => Date.now(), budgetMs = 50000, log = console }) {
  async function requireTM(auth) {
    const uid = auth?.uid;
    if (!uid) throw new SeedError("unauthenticated", "로그인이 필요해요");
    const email = String(auth.token?.email || "");
    if (email === SUPER_EMAIL) return { uid, email };
    const u = await db.collection("users").doc(uid).get();
    if (!u.exists || u.data().role !== "totalMaster") throw new SeedError("permission-denied", "최고관리자만 쓸 수 있어요");
    return { uid, email };
  }

  async function realUsersOf(co, core) {
    const snap = await db.collection("users").where("companyName", "==", co).get();
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
      .filter((u) => u._seed !== core.SEED_TAG && !NON_STAFF.includes(u.role) && u.approved !== false && u.employmentStatus !== "퇴사")
      .sort((a, b) => String(a.uid).localeCompare(String(b.uid)))
      .map((u) => ({ uid: u.uid, name: u.name || "", role: u.role || "", team: u.team || "", position: u.position || "", email: u.email || "", hireDate: u.hireDate || "" }));
  }

  // 테스트 문서 목록(회사 · 표시가 둘 다 맞는 것만)
  async function seedRefsOf(col, co, core, max = 1000) {
    const snap = await db.collection(col).where("_seed", "==", core.SEED_TAG).where("companyName", "==", co).limit(max).get();
    return snap.docs.filter((d) => core.isSeedDoc(d.data(), co));
  }
  // 테스트 고정노선에서 앱이 만든 오더(번호 fr_seed_fr_N_날짜 · 표시 없음) · 테스트 노선에서 나온 것이라 함께 지운다
  async function routeOrderRefsOf(co, core, routeIds) {
    if (!routeIds.length) return [];
    const snap = await db.collection("orders").where("고정노선Id", "in", routeIds.slice(0, 10)).get();
    return snap.docs.filter((d) => {
      const x = d.data() || {};
      return x.companyName === co && x._seed !== core.SEED_TAG && String(x.고정노선Id || "").startsWith("seed_fr_") && d.id.startsWith(`fr_${x.고정노선Id}_`);
    });
  }

  async function status(co, core) {
    const counts = {};
    await Promise.all(core.SEED_COLLECTIONS.map(async (c) => {
      const q = db.collection(c).where("_seed", "==", core.SEED_TAG).where("companyName", "==", co);
      try { counts[c] = (await q.count().get()).data().count; } catch { counts[c] = (await q.get()).size; }
    }));
    const st = await db.collection(SEED_STATE_COL).doc(co).get().catch(() => null);
    const filled = (await db.collection("users").where("companyName", "==", co).get()).docs.filter((d) => d.data()._seedFilled).length;
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return { company: co, counts, total, filledUsers: filled, state: st?.exists ? (({ lastAction, enabled, running, lastBy }) => ({ lastAction: lastAction || "", enabled: !!enabled, running: running || null, lastBy: lastBy || "", lastAtMs: st.data().lastAt?.toMillis?.() || 0 }))(st.data()) : null };
  }

  // 한 번 실행(시간이 다 되면 cursor와 함께 멈춤)
  async function run({ action, company, cursor = null, by = "" }) {
    const core = await loadCore();
    const co = checkTargetCompany(company, core.SEED_ALLOWED_COMPANIES);
    if (!ACTIONS.includes(action)) throw new SeedError("invalid-argument", "알 수 없는 작업이에요");
    if (action === "status") return status(co, core);
    const t0 = now();
    const out = () => now() - t0 > budgetMs;
    const cur = { phase: cursor?.phase || (["reset", "clear"].includes(action) ? "delete" : "write"), ci: Number(cursor?.ci) || 0, off: Number(cursor?.off) || 0, done: { ...(cursor?.done || {}) } };
    const bump = (k, n) => { cur.done[k] = (cur.done[k] || 0) + n; };
    const ROUTE_IDS = ["seed_fr_1", "seed_fr_2", "seed_fr_3"];
    if (!cursor) {
      await setBulkMode(co, true);
      await db.collection(SEED_STATE_COL).doc(co).set({ companyName: co, running: action, startedAt: FieldValue.serverTimestamp(), by }, { merge: true });
    }
    const commitDeletes = async (refs) => {
      for (let i = 0; i < refs.length; i += BATCH_MAX) { const b = db.batch(); refs.slice(i, i + BATCH_MAX).forEach((r) => b.delete(r)); await b.commit(); }
    };

    // ① 지우기(reset · clear)
    if (cur.phase === "delete") {
      while (cur.ci < core.SEED_COLLECTIONS.length) {
        const col = core.SEED_COLLECTIONS[cur.ci];
        const list = await seedRefsOf(col, co, core, BATCH_MAX);
        if (!list.length) { cur.ci += 1; continue; }
        await commitDeletes(list.map((d) => d.ref));
        bump(`deleted:${col}`, list.length);
        if (out()) return { partial: true, cursor: cur, action, company: co };
      }
      const ro = await routeOrderRefsOf(co, core, ROUTE_IDS);
      if (ro.length) { await commitDeletes(ro.map((d) => d.ref)); bump("deleted:orders", ro.length); }
      // 실제 직원 · 채워 넣은 인사 칸 되돌리기(값이 그대로일 때만)
      const us = (await db.collection("users").where("companyName", "==", co).get()).docs.filter((d) => d.data()._seedFilled && d.data()._seed !== core.SEED_TAG);
      for (const d of us) {
        const x = d.data(); const patch = { _seedFilled: FieldValue.delete() };
        Object.entries(x._seedFilled || {}).forEach(([k, v]) => { if (FILL_FIELDS.includes(k) && sameVal(x[k], v)) patch[k] = FieldValue.delete(); });
        await d.ref.update(patch);
        bump("restored:users", 1);
      }
      if (action === "clear") { cur.phase = "finish"; } else { cur.phase = "write"; cur.ci = 0; cur.off = 0; }
      if (out() && cur.phase !== "finish") return { partial: true, cursor: cur, action, company: co };
    }

    // ② 쓰기(seed · reset · refresh)
    let built = null;
    const getBuilt = async () => (built || (built = core.buildSeedData({ now: now(), company: co, realUsers: await realUsersOf(co, core) })));
    if (cur.phase === "write") {
      const B = await getBuilt();
      const cols = Object.keys(B.docs);
      const overwrite = action === "refresh";
      const runGuard = new Map(); // 실제 급여 실행이 이미 있으면 그 달 테스트 명세서는 만들지 않는다
      while (cur.ci < cols.length) {
        const col = cols[cur.ci];
        if (core.SEED_NEVER.has(col)) { cur.ci += 1; cur.off = 0; continue; }
        const list = B.docs[col];
        const part = list.slice(cur.off, cur.off + READ_CHUNK);
        if (!part.length) { cur.ci += 1; cur.off = 0; continue; }
        const snaps = await db.getAll(...part.map((e) => db.collection(col).doc(e.id)));
        const batch = db.batch(); let n = 0;
        for (let i = 0; i < part.length; i++) {
          const e = part[i]; const s = snaps[i];
          if (e.runGuard) {
            if (!runGuard.has(e.runGuard)) { const r = await db.collection("payrollRuns").doc(e.runGuard).get(); runGuard.set(e.runGuard, !r.exists || core.isSeedDoc(r.data(), co)); }
            if (!runGuard.get(e.runGuard)) continue;
          }
          if (s.exists) {
            const mine = core.isSeedDoc(s.data(), co);
            if (!mine || !overwrite) continue; // 실제 문서는 절대 덮어쓰지 않는다 · seed는 있는 것은 그대로
          }
          batch.set(s.ref, toFs(e.data, Timestamp));
          n += 1;
        }
        if (n) { await batch.commit(); bump(`written:${col}`, n); }
        cur.off += part.length;
        if (out()) return { partial: true, cursor: cur, action, company: co };
      }
      // 실제 직원 · 비어 있는 인사 칸만
      for (const f of B.userFill) {
        const ref = db.collection("users").doc(f.uid);
        const s = await ref.get();
        if (!s.exists) continue;
        const x = s.data() || {};
        if (x.companyName !== co || x._seed === core.SEED_TAG) continue;
        const add = {}; Object.entries(f.fields).forEach(([k, v]) => { if (FILL_FIELDS.includes(k) && !x[k]) add[k] = v; });
        if (!Object.keys(add).length) continue;
        await ref.update({ ...add, _seedFilled: { ...(x._seedFilled || {}), ...add } });
        bump("filled:users", 1);
      }
      cur.phase = action === "refresh" ? "prune" : "finish"; cur.ci = 0; cur.off = 0;
      if (out()) return { partial: true, cursor: cur, action, company: co };
    }

    // ③ 정리(refresh) · 새 목록에 없는 테스트 문서 지우기(예: 지난주 날짜의 노선 오더)
    if (cur.phase === "prune") {
      const B = await getBuilt();
      while (cur.ci < core.SEED_COLLECTIONS.length) {
        const col = core.SEED_COLLECTIONS[cur.ci];
        const keep = new Set((B.docs[col] || []).map((e) => e.id));
        const all = await seedRefsOf(col, co, core, 5000);
        const gone = all.filter((d) => !keep.has(d.id)).map((d) => d.ref);
        if (gone.length) { await commitDeletes(gone); bump(`pruned:${col}`, gone.length); }
        cur.ci += 1;
        if (out()) return { partial: true, cursor: cur, action, company: co };
      }
      cur.phase = "finish";
    }

    await setBulkMode(co, false);
    const st = await status(co, core);
    await db.collection(SEED_STATE_COL).doc(co).set({ companyName: co, running: null, lastAction: action, lastAt: FieldValue.serverTimestamp(), lastBy: by, enabled: action !== "clear", counts: st.counts, total: st.total, done: cur.done, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { partial: false, action, company: co, done: cur.done, ...st, state: { ...(st.state || {}), lastAction: action, enabled: action !== "clear", running: null, lastBy: by, lastAtMs: now() } };
  }

  // 호출형 함수 본문
  async function handle(data = {}, auth) {
    const me = await requireTM(auth);
    const core = await loadCore();
    const company = checkTargetCompany(data.company, core.SEED_ALLOWED_COMPANIES);
    const action = String(data.action || "status");
    const r = await run({ action, company, cursor: data.cursor || null, by: me.email || me.uid });
    log.log?.(`[테스트 데이터] ${company} ${action}${r.partial ? " (이어서)" : " 끝"}`);
    return r;
  }

  // 매주 날짜 맞추기 · 이미 테스트 데이터를 넣은 회사만(시간 안에 끝까지 이어서)
  async function weekly() {
    const core = await loadCore();
    const res = {};
    for (const co of core.SEED_ALLOWED_COMPANIES) {
      const st = await db.collection(SEED_STATE_COL).doc(co).get();
      if (!st.exists || st.data().enabled !== true) continue;
      let cursor = null; let r = null; let guard = 0;
      do { r = await run({ action: "refresh", company: co, cursor, by: "weekly" }); cursor = r.cursor; guard += 1; } while (r.partial && guard < 8);
      res[co] = { total: r.total, partial: !!r.partial };
    }
    return res;
  }

  return { handle, run, status: async (company) => { const core = await loadCore(); return status(checkTargetCompany(company, core.SEED_ALLOWED_COMPANIES), core); }, weekly };
}

module.exports = { makeSeedTestCompany, checkTargetCompany, toFs, SeedError };
