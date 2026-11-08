// ======================= functions/authClaims.js =======================
// 🎫 2026-11-08 로그인 토큰 권한(Firebase Auth custom claims)
//  보안 규칙(firestore.rules · storage.rules)이 요청마다 users/{uid} 문서를 get()으로 읽던 것을
//  로그인 토큰(request.auth.token)에 담긴 값으로 대신한다 — 빠르고, 읽기 비용이 줄고, 규칙 계산 한도(식 1,000개 · 문서 20개)에 여유가 생긴다.
//
//  토큰 값(v:1) — 1,000바이트 안
//   co  회사명(users.companyName)          r   역할(role)              ap  승인(approved !== false)
//   st  재직(employmentStatus !== '퇴사')   ce  계약종료(companyPlans/{회사}.status == 'ended', 화주는 연동 운송사)
//   tm  최고관리자·부관리자(role totalMaster)  sa  부관리자(subAdmin)   ms  회사 마스터(isMaster)
//   pm  화주사 마스터(permissions.master)   sh  화주 연동 운송사(linkedTransportCompany.companyName)
//   fin 부서 경리·회계·재무(구독·결제)       pay 부서 재무·경리·회계·총무(지급완료·급여)   hr 부서 인사
//   tx  부서 == '임원'                      xp  임원 직책(이사·상무…)   ceo 대표 직책(대표·대표이사·사장)
//   exec 권한 관리의 "임원 화면" 역할(customRoles · companyRoleOverrides)
//   fm  권한 관리의 '자금관리' 메뉴 수준(hidden | read | write)
//   at  계산 시각(ms) — users/{uid}.claimsAt 과 같다(화면이 토큰을 새로 받을지 판단)
//  허브(hubMembers/{uid}) — hv:1 · hk 회사 키(hubSync.companyKeyOf) · hs 승인 회원 · hsg 허브 가입(source signup) · hro 허브 역할
//
//  ⚠ 규칙과 같은 기준으로 계산해야 한다(firestore.rules isApproved · isExecRoleUser · fundsMenuLevel …).
//   규칙과 똑같이 계산할 수 없는 문서(회사명이 없거나 문자가 아닌 칸 등)는 v를 넣지 않는다 → 규칙이 예전처럼 문서를 읽는다.
//  ⚠ 토큰은 서버(관리자 SDK)만 쓸 수 있다 — 화면·사용자가 바꿀 수 없다. 이 파일 밖에서 setCustomUserClaims · createCustomToken(추가 값)을 쓰지 말 것.
//  ⚠ 바뀐 값은 화면이 토큰을 새로 받을 때(getIdToken(true)) 적용된다 — 화면은 users/{uid}.claimsAt 이 바뀌면 바로 새로 받는다.
//   일부러 새로 받지 않는 사용자는 최대 1시간(토큰 수명) 예전 값이 남을 수 있다. 그래서 최고관리자 권한은 규칙이 문서로 한 번 더 확인하고,
//   "거절" 쪽(미승인 · 허브 미승인)은 규칙이 문서를 다시 본다(승인 즉시 반영).
const CLAIMS_V = 1;
const MANAGED = ["v", "co", "r", "ap", "st", "ce", "tm", "sa", "ms", "pm", "sh", "fin", "pay", "hr", "tx", "xp", "ceo", "exec", "fm", "at",
  "hv", "hk", "hs", "hsg", "hro"];
const MAX_BYTES = 900; // Firebase 한도 1,000바이트 — 여유를 둔다

// firestore.rules와 같은 목록
const EXEC_POSITIONS = ["이사", "상무", "전무", "부사장", "사장", "대표", "대표이사", "본부장", "임원"];
const CEO_POSITIONS = ["대표", "대표이사", "사장"];
const EXEC_BUILTIN = ["admin", "allMgr", "hrManager", "hrAcct", "hrStaff", "user", "test", "acctStaff", "legalMgr", "legalStaff", "devMgr", "devStaff", "viewer", "totalMaster", "driver", "shipper"];
const FUNDS_BUILTIN = ["admin", "allMgr", "hrManager", "hrAcct", "user", "test", "viewer", "totalMaster", "driver", "shipper"];

const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && typeof v.toDate !== "function";
const has = (o, k) => isMap(o) && Object.prototype.hasOwnProperty.call(o, k);
const getOr = (o, k, d) => (has(o, k) ? o[k] : d);
// 규칙의 matches는 문자열 전체 일치(RE2 — '.'은 줄바꿈 제외). 줄바꿈 등이 든 값은 토큰에 넣지 않는다(규칙이 문서를 읽게).
const ODD_LINE = /[\r\n\u2028\u2029]/;
const full = (re) => new RegExp(`^.*(?:${re}).*$`);
const RE_FIN = full("경리|회계|재무");
const RE_PAY = full("재무|경리|회계|총무");
const RE_HR = full("인사");
const RE_EXEC_LABEL = full("임원");

// 계약종료를 볼 회사(firestore.rules contractCoOf)
function contractCoOf(u) {
  if (getOr(u, "role", "") === "shipper") {
    const l = getOr(u, "linkedTransportCompany", null);
    return isMap(l) ? getOr(l, "companyName", "") : "";
  }
  return getOr(u, "companyName", "돌캐");
}

// 권한 관리 — 직접 만든 역할 정보(규칙 isExecRoleUser · fundsMenuLevel과 같은 순서)
//  role: 역할 · g: customRoles/{역할} 문서(없으면 null) · ov: companyRoleOverrides/{회사} 문서(없으면 null)
function roleInfo(role, g, ov) {
  const gd = isMap(g) ? g : {};
  const o0 = isMap(ov) ? getOr(getOr(ov, "roles", {}) || {}, role, {}) : {};
  if (!isMap(o0)) return null; // 규칙에서 오류가 나는 모양 — 토큰에 넣지 않는다
  const o = o0;
  const gExists = isMap(g);
  const known = gExists || Object.keys(o).length > 0;
  const scr = has(o, "screen") ? o.screen : getOr(gd, "screen", null);
  const oLbl = getOr(o, "label", "");
  const gLbl = getOr(gd, "label", "");
  const lbl = oLbl !== "" ? oLbl : (gLbl !== "" ? gLbl : role);
  const exec = role !== "" && !EXEC_BUILTIN.includes(role) && known
    && (typeof scr === "string" ? scr === "exec" : RE_EXEC_LABEL.test(String(lbl)));
  const menus = has(o, "menus") ? o.menus : getOr(gd, "menus", {});
  let fm = "hidden";
  if (role !== "" && !FUNDS_BUILTIN.includes(role) && known) {
    if (!isMap(menus)) return null;
    const lv = getOr(menus, "자금관리", "hidden");
    fm = typeof lv === "string" ? lv : "hidden";
  }
  return { exec, fm };
}

// users/{uid} 문서 → 토큰 값. 규칙과 똑같이 계산할 수 없으면 null(규칙이 문서를 읽는다)
//  ctx: { plan: companyPlans/{계약 회사} 문서 데이터|null, customRole: customRoles/{역할}|null, roleOverride: companyRoleOverrides/{회사}|null }
function computeUserClaims(u, ctx = {}) {
  if (!isMap(u)) return { claims: null, reason: "no-user" };
  const role = getOr(u, "role", "");
  const co = getOr(u, "companyName", undefined);
  if (typeof role !== "string") return { claims: null, reason: "role" };
  if (typeof co !== "string") return { claims: null, reason: "companyName" }; // 회사명 없는 옛 문서('돌캐' 기본값)는 문서로
  const team = getOr(u, "team", "");
  const pos = getOr(u, "position", "");
  if (typeof team !== "string" || ODD_LINE.test(team)) return { claims: null, reason: "team" };
  if (typeof pos !== "string") return { claims: null, reason: "position" };
  const perms = getOr(u, "permissions", {});
  if (!isMap(perms)) return { claims: null, reason: "permissions" };
  const ltc = getOr(u, "linkedTransportCompany", null);
  const sh = isMap(ltc) ? getOr(ltc, "companyName", "") : "";
  if (typeof sh !== "string") return { claims: null, reason: "linked" };
  const ri = roleInfo(role, ctx.customRole || null, ctx.roleOverride || null);
  if (!ri) return { claims: null, reason: "roleInfo" };
  const cco = contractCoOf(u);
  const ce = typeof cco === "string" && cco !== "" && isMap(ctx.plan) && getOr(ctx.plan, "status", "") === "ended";
  const c = {
    v: CLAIMS_V,
    co,
    r: role,
    ap: getOr(u, "approved", true) !== false,
    st: getOr(u, "employmentStatus", "") !== "퇴사",
    ce,
    tm: role === "totalMaster",
    sa: getOr(u, "subAdmin", false) === true,
    ms: getOr(u, "isMaster", false) === true,
    pm: getOr(perms, "master", false) === true,
    sh,
    fin: RE_FIN.test(team),
    pay: RE_PAY.test(team),
    hr: RE_HR.test(team),
    tx: team === "임원",
    xp: EXEC_POSITIONS.includes(pos),
    ceo: CEO_POSITIONS.includes(pos),
    exec: ri.exec,
    fm: ri.fm,
  };
  return { claims: c, reason: "" };
}

// 허브 — 회사 키는 규칙 hubKeyOf(= functions/hubSync.js companyKeyOf)와 같은 계산
function computeHubClaims(m, uid) {
  if (!isMap(m)) return null;
  // 규칙 hubKeyOf는 get('companyKey','') != '' / get('source','signup') != 'signup' — 문자가 아닌 값(null 포함)이 있으면 문서로
  for (const k of ["companyKey", "source", "companyName", "bizNo", "status", "role"]) {
    if (has(m, k) && typeof m[k] !== "string") return null;
  }
  const src = getOr(m, "source", "signup");
  const key = getOr(m, "companyKey", "") !== "" ? m.companyKey
    : (src !== "signup" ? `lw:${getOr(m, "companyName", "")}`
      : (String(getOr(m, "bizNo", "") || "").replace(/[^0-9]/g, "") !== "" ? `biz:${String(m.bizNo).replace(/[^0-9]/g, "")}` : `uid:${uid}`));
  return {
    hv: CLAIMS_V,
    hk: key,
    hs: getOr(m, "status", "") === "approved",
    hsg: getOr(m, "source", "") === "signup",
    hro: String(getOr(m, "role", "") || ""),
  };
}

// 두 계산 결과를 합친다 — 기존 토큰 값 중 이 파일이 관리하지 않는 값은 그대로 둔다
function mergeClaims(existing, userClaims, hubClaims, at) {
  const keep = {};
  Object.entries(existing || {}).forEach(([k, v]) => { if (!MANAGED.includes(k)) keep[k] = v; });
  const out = { ...keep, ...(userClaims || {}), ...(hubClaims || {}) };
  if (userClaims || hubClaims) out.at = at;
  if (Buffer.byteLength(JSON.stringify(out), "utf8") > MAX_BYTES) {
    // 너무 길면(회사명이 아주 긴 경우 등) 토큰 권한은 쓰지 않는다 — 규칙이 문서를 읽는다
    return { ...keep };
  }
  return out;
}
// at(계산 시각)을 뺀 관리 값만 비교
function sameManaged(a, b) {
  const pick = (o) => JSON.stringify(MANAGED.filter((k) => k !== "at" && o && o[k] !== undefined).map((k) => [k, o[k]]));
  return pick(a) === pick(b);
}
// users 문서에서 토큰 값에 쓰이는 칸만(바뀌었는지 볼 때)
const USER_FIELDS = ["role", "companyName", "approved", "employmentStatus", "linkedTransportCompany", "isMaster", "subAdmin", "permissions", "team", "position"];
const HUB_FIELDS = ["companyKey", "source", "companyName", "bizNo", "status", "role"];
const proj = (d, fields) => JSON.stringify(fields.map((k) => [k, d ? (d[k] === undefined ? null : d[k]) : "∅"]));
const changedFields = (b, a, fields) => proj(b, fields) !== proj(a, fields);

// ───────────────────────── 서버 쪽(트리거 · 호출형 함수) ─────────────────────────
function makeClaimsService({ db, getAuth, FieldValue }) {
  const docData = async (col, id) => {
    if (typeof id !== "string" || id === "" || id.includes("/")) return null;
    const s = await db.collection(col).doc(id).get();
    return s.exists ? s.data() : null;
  };
  // uid 한 명의 토큰 값을 다시 계산해 바뀌었으면 저장 + users(또는 hubMembers)/{uid}.claimsAt 기록
  async function recompute(uid, opts = {}) {
    const [u, m] = await Promise.all([docData("users", uid), docData("hubMembers", uid)]);
    let userClaims = null; let reason = "no-user";
    if (u) {
      const role = typeof u.role === "string" ? u.role : "";
      const cco = contractCoOf(u);
      const [plan, customRole, roleOverride] = await Promise.all([
        typeof cco === "string" && cco ? docData("companyPlans", cco) : null,
        role ? docData("customRoles", role) : null,
        typeof u.companyName === "string" ? docData("companyRoleOverrides", u.companyName) : null,
      ]);
      ({ claims: userClaims, reason } = computeUserClaims(u, { plan, customRole, roleOverride }));
    }
    const hubClaims = m ? computeHubClaims(m, uid) : null;
    let rec;
    try { rec = await getAuth().getUser(uid); } catch (e) {
      if (e?.code === "auth/user-not-found") return { uid, skipped: "no-auth-user" };
      throw e;
    }
    const existing = rec.customClaims || {};
    const at = Date.now();
    const next = mergeClaims(existing, userClaims, hubClaims, at);
    if (sameManaged(existing, next) && !opts.force) return { uid, changed: false, reason };
    await getAuth().setCustomUserClaims(uid, next);
    const stamp = { claimsAt: at, claimsV: next.v === CLAIMS_V ? CLAIMS_V : 0 };
    // 화면이 이 값을 보고 토큰을 새로 받는다(트리거가 다시 돌아도 값이 같으면 아무것도 안 쓴다)
    if (u) await db.collection("users").doc(uid).set(stamp, { merge: true }).catch((e) => console.warn("[토큰 권한] users 기록 실패", uid, e?.message));
    if (m) await db.collection("hubMembers").doc(uid).set(stamp, { merge: true }).catch((e) => console.warn("[토큰 권한] hubMembers 기록 실패", uid, e?.message));
    return { uid, changed: true, reason, v: next.v || 0 };
  }
  // 여러 명 — 동시에 8명씩
  async function recomputeMany(uids, opts) {
    const list = [...new Set(uids)];
    const res = { processed: 0, changed: 0, errors: 0 };
    for (let i = 0; i < list.length; i += 8) {
      const part = await Promise.all(list.slice(i, i + 8).map((id) => recompute(id, opts).catch((e) => { console.error("[토큰 권한] 계산 실패", id, e); return { error: true }; })));
      part.forEach((r) => { res.processed += 1; if (r.changed) res.changed += 1; if (r.error) res.errors += 1; });
    }
    return res;
  }
  const uidsWhere = async (field, value) => (await db.collection("users").where(field, "==", value).select().get()).docs.map((d) => d.id);
  return { recompute, recomputeMany, uidsWhere };
}

function register({ functions, db, getAuth, FieldValue, callOpts = {} }) {
  const svc = makeClaimsService({ db, getAuth, FieldValue });
  const HttpsError = functions.https.HttpsError;
  const out = {};
  const MASTER = "tjddnqkf@naver.com";

  // users/{uid} — 권한에 쓰이는 칸이 바뀌었을 때만(claimsAt 기록 등 다른 칸은 건너뜀)
  out.claimsOnUserWrite = functions.firestore.document("users/{uid}").onWrite(async (chg, ctx) => {
    const b = chg.before.exists ? chg.before.data() : null;
    const a = chg.after.exists ? chg.after.data() : null;
    if (a && b && !changedFields(b, a, USER_FIELDS)) return null;
    try { await svc.recompute(ctx.params.uid); } catch (e) { console.error("[토큰 권한] users 트리거 실패", ctx.params.uid, e); }
    return null;
  });
  // hubMembers/{uid} — 허브 회사 키 · 승인 상태 · 역할
  out.claimsOnHubMemberWrite = functions.firestore.document("hubMembers/{uid}").onWrite(async (chg, ctx) => {
    const b = chg.before.exists ? chg.before.data() : null;
    const a = chg.after.exists ? chg.after.data() : null;
    if (a && b && !changedFields(b, a, HUB_FIELDS)) return null;
    try { await svc.recompute(ctx.params.uid); } catch (e) { console.error("[토큰 권한] hubMembers 트리거 실패", ctx.params.uid, e); }
    return null;
  });
  // companyPlans/{회사} — 계약종료(status ended)가 바뀌면 그 회사 사람 + 연동 화주 전체
  out.claimsOnPlanWrite = functions.runWith({ timeoutSeconds: 300, memory: "256MB" }).firestore.document("companyPlans/{co}").onWrite(async (chg, ctx) => {
    const st = (s) => (s.exists && s.data()?.status === "ended");
    if (st(chg.before) === st(chg.after)) return null;
    const co = ctx.params.co;
    const [staff, shippers] = await Promise.all([svc.uidsWhere("companyName", co), svc.uidsWhere("linkedTransportCompany.companyName", co)]);
    const r = await svc.recomputeMany([...staff, ...shippers]);
    console.log(`[토큰 권한] 계약 상태 변경 ${co}: ${r.changed}/${r.processed}명 갱신`);
    return null;
  });
  // customRoles/{역할} — 화면(임원)·이름·메뉴가 바뀌면 그 역할 사람 전체
  const ROLE_FIELDS = ["screen", "label", "menus"];
  out.claimsOnCustomRoleWrite = functions.runWith({ timeoutSeconds: 300, memory: "256MB" }).firestore.document("customRoles/{role}").onWrite(async (chg, ctx) => {
    const b = chg.before.exists ? chg.before.data() : null;
    const a = chg.after.exists ? chg.after.data() : null;
    if (a && b && !changedFields(b, a, ROLE_FIELDS)) return null;
    const r = await svc.recomputeMany(await svc.uidsWhere("role", ctx.params.role));
    console.log(`[토큰 권한] 역할 ${ctx.params.role} 변경: ${r.changed}/${r.processed}명 갱신`);
    return null;
  });
  // companyRoleOverrides/{회사} — 회사별 역할 설정이 바뀌면 그 회사 사람 전체
  out.claimsOnRoleOverrideWrite = functions.runWith({ timeoutSeconds: 300, memory: "256MB" }).firestore.document("companyRoleOverrides/{co}").onWrite(async (chg, ctx) => {
    const b = chg.before.exists ? chg.before.data() : null;
    const a = chg.after.exists ? chg.after.data() : null;
    if (a && b && JSON.stringify(a.roles || {}) === JSON.stringify(b.roles || {})) return null;
    const r = await svc.recomputeMany(await svc.uidsWhere("companyName", ctx.params.co));
    console.log(`[토큰 권한] 회사 역할 설정 ${ctx.params.co} 변경: ${r.changed}/${r.processed}명 갱신`);
    return null;
  });

  // 화면 → 내 토큰 권한 다시 계산(로그인 직후 토큰에 값이 없을 때 · 문제 해결용). 결과를 받은 뒤 getIdToken(true)
  out.refreshMyClaims = functions.runWith({ timeoutSeconds: 30, memory: "256MB", ...callOpts }).https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError("unauthenticated", "로그인해 주세요");
    const r = await svc.recompute(context.auth.uid, { force: data?.force === true });
    return { ok: true, changed: !!r.changed, v: r.v || 0, reason: r.reason || r.skipped || "" };
  });

  // 최고관리자 — 기존 사용자 전체 토큰 권한 채우기(한 번에 limit명, 이어서 하기: 받은 next를 cursor로 다시 호출)
  //  phase 'users'(users 문서 순서) → 'hub'(users 문서가 없는 허브 회원) → done
  out.backfillClaims = functions.runWith({ timeoutSeconds: 540, memory: "512MB", ...callOpts }).https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError("unauthenticated", "로그인해 주세요");
    const isMaster = context.auth.token?.email === MASTER
      || ((await db.collection("users").doc(context.auth.uid).get()).data()?.role === "totalMaster");
    if (!isMaster) throw new HttpsError("permission-denied", "최고관리자만 실행할 수 있습니다");
    const phase = data?.phase === "hub" ? "hub" : "users";
    const limit = Math.min(Math.max(Number(data?.limit) || 300, 1), 500);
    const cursor = typeof data?.cursor === "string" ? data.cursor : "";
    const col = phase === "hub" ? "hubMembers" : "users";
    const { FieldPath } = require("firebase-admin/firestore");
    let q = db.collection(col).orderBy(FieldPath.documentId()).select().limit(limit);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    let ids = snap.docs.map((d) => d.id);
    if (phase === "hub" && ids.length) {
      // users 문서가 있는 회원은 users 단계에서 이미 계산했다
      const us = await db.getAll(...ids.map((id) => db.collection("users").doc(id)), { fieldMask: [] });
      const hasUser = new Set(us.filter((s) => s.exists).map((s) => s.id));
      ids = ids.filter((id) => !hasUser.has(id));
    }
    const r = await svc.recomputeMany(ids, { force: data?.force === true });
    const last = snap.docs.length ? snap.docs[snap.docs.length - 1].id : "";
    const pageDone = snap.docs.length < limit;
    const next = pageDone ? (phase === "users" ? { phase: "hub", cursor: "" } : null) : { phase, cursor: last };
    return { ok: true, phase, ...r, scanned: snap.docs.length, next, done: !next };
  });
  return out;
}

module.exports = {
  CLAIMS_V, MANAGED, computeUserClaims, computeHubClaims, mergeClaims, sameManaged, roleInfo, contractCoOf,
  changedFields, USER_FIELDS, HUB_FIELDS, makeClaimsService, register,
};
