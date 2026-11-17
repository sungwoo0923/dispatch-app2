// ======================= functions/teamMigrate.js =======================
// ⭐ 2026-11-17 예전 부서 이름 → 새 부서 이름(사용자 요청: 예전에 올린 서류 · 전자결재 · 모든 곳이 바뀐 팀으로 보여야 한다)
//  · 운영팀 · 인사팀 · 경리/회계팀 · 경리팀 · 회계팀 → 경영지원팀 / 운송팀 → 물류운송팀 (src/teamNames.js LEGACY_TEAMS 와 같은 표)
//  · 문서 안 어디에 있든(결재선 · 작성자 · 받는 팀 목록 …) 부서 칸(team · teams · drafterTeam …)만 바꾼다. 다른 글자는 그대로
//  · 직원(users) 문서는 바꾸기 전 이름을 legacyTeam 에 남긴다 — 예전 부서 이름으로 받던 경리 · 인사 권한이 그대로 유지되게(functions/authClaims.js)
//  · 처음 한 번은 아래 컬렉션 전체를 훑고(systemConfig/teamMigrate.fullDone), 그다음부터는 예전 이름이 남은 직원 · 결재 문서만 찾아 바꾼다(예전 화면이 다시 적어도 고쳐진다)
"use strict";

const LEGACY_TEAMS = { 운영팀: "경영지원팀", 인사팀: "경영지원팀", "경리/회계팀": "경영지원팀", 경리팀: "경영지원팀", 회계팀: "경영지원팀", 운송팀: "물류운송팀" };
const LEGACY_LIST = Object.keys(LEGACY_TEAMS);
// 부서 이름이 들어가는 칸 이름
const TEAM_KEYS = new Set(["team", "drafterTeam", "authorTeam", "writerTeam", "teamName", "fromTeam", "toTeam", "myTeam", "dept", "department", "부서"]);
const TEAMS_KEYS = new Set(["teams", "targetTeams", "toTeams"]);
// 부서 이름이 적힐 수 있는 컬렉션(src 에서 team 을 적는 곳)
const COLLECTIONS = ["users", "userProfiles", "approvals", "approvalLines", "notices", "hrNotices", "payrollEmployees", "payslips", "payrollRuns",
  "leavePromotions", "handovers", "schedules", "retireCases", "hrResumes", "salesPlans", "salesIncentives", "boardPosts", "attendanceRequests"];

const mapTeam = (v) => (typeof v === "string" && LEGACY_TEAMS[v.trim()] ? LEGACY_TEAMS[v.trim()] : v);
const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

// 값 안의 부서 칸을 새 이름으로 — 바뀐 게 없으면 같은 값(===)을 돌려준다
function convert(v, key = "", depth = 0) {
  if (depth > 8) return v;
  if (typeof v === "string") return TEAM_KEYS.has(key) ? mapTeam(v) : v;
  if (Array.isArray(v)) {
    let changed = false;
    const out = v.map((x) => { const y = TEAMS_KEYS.has(key) && typeof x === "string" ? mapTeam(x) : convert(x, "", depth + 1); if (y !== x) changed = true; return y; });
    if (!changed) return v;
    return TEAMS_KEYS.has(key) ? [...new Set(out)] : out;
  }
  if (isPlain(v)) {
    let changed = false; const out = {};
    for (const [k, x] of Object.entries(v)) { const y = convert(x, k, depth + 1); if (y !== x) changed = true; out[k] = y; }
    return changed ? out : v;
  }
  return v;
}
// 문서 데이터 → 바꿀 칸만 { 칸: 새 값 } (없으면 null)
function patchFor(data, { isUser = false } = {}) {
  if (!isPlain(data)) return null;
  const patch = {};
  for (const [k, v] of Object.entries(data)) { const y = convert(v, k, 0); if (y !== v) patch[k] = y; }
  if (!Object.keys(patch).length) return null;
  if (isUser && typeof data.team === "string" && patch.team && !data.legacyTeam) patch.legacyTeam = data.team.trim();
  return patch;
}

function makeTeamMigrator({ db }) {
  const flagRef = db.collection("systemConfig").doc("teamMigrate");
  async function applyDocs(docs, coll, stat) {
    let batch = db.batch(); let n = 0;
    for (const d of docs) {
      const p = patchFor(d.data(), { isUser: coll === "users" });
      if (!p) continue;
      batch.update(d.ref, p); n += 1; stat.changed += 1; stat.by[coll] = (stat.by[coll] || 0) + 1;
      if (n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
    }
    if (n) await batch.commit();
  }
  // 한 컬렉션 전체를 400개씩
  async function scanAll(coll, stat, deadline) {
    let last = null;
    for (;;) {
      if (deadline()) return false;
      let q = db.collection(coll).orderBy("__name__").limit(400);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) return true;
      stat.scanned += snap.size;
      await applyDocs(snap.docs, coll, stat);
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < 400) return true;
    }
  }
  // 빠른 길 — 예전 이름이 남은 직원 · 결재 문서만
  async function quick(stat) {
    for (const [coll, field] of [["users", "team"], ["userProfiles", "team"], ["approvals", "drafter.team"]]) {
      const snap = await db.collection(coll).where(field, "in", LEGACY_LIST).limit(400).get().catch(() => null);
      if (!snap || snap.empty) continue;
      stat.scanned += snap.size;
      await applyDocs(snap.docs, coll, stat);
    }
  }
  return async function run({ deadline = () => false, force = false } = {}) {
    const stat = { scanned: 0, changed: 0, by: {}, full: false };
    const flag = (await flagRef.get()).data() || {};
    if (!flag.fullDone || force) {
      const done = new Set(flag.collsDone || []);
      for (const c of COLLECTIONS) {
        if (done.has(c)) continue;
        const ok = await scanAll(c, stat, deadline);
        if (!ok) break;
        done.add(c);
        await flagRef.set({ collsDone: [...done] }, { merge: true });
      }
      stat.full = COLLECTIONS.every((c) => done.has(c));
      await flagRef.set({ fullDone: stat.full, lastRunAt: Date.now(), lastChanged: stat.changed }, { merge: true });
    } else {
      await quick(stat);
      await flagRef.set({ lastRunAt: Date.now(), lastChanged: stat.changed }, { merge: true });
    }
    return stat;
  };
}

module.exports = { LEGACY_TEAMS, convert, patchFor, makeTeamMigrator };
