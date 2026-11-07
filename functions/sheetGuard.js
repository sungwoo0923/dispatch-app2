// ======================= functions/sheetGuard.js =======================
// 🔒 2026-11-07 보안 점검 — 구글시트는 "한 회사 것"만 읽고 쓴다.
//  모든 운송사가 같은 서비스 계정(dispatch-app-9b92f@appspot.gserviceaccount.com)에 시트를 공유하므로,
//  서버가 화면이 보낸 시트 주소를 그대로 열면 다른 회사 시트 주소를 아는 직원이 그 회사 시트를 읽거나 쓸 수 있었다
//  (배차표 routeBoardSheet tabs·read·write · 시트 연결 sheetConnect tabs·sample·read · 내보내기 export).
//  규칙: 시트(spreadsheetId)마다 주인 회사를 sheetRegistry/{spreadsheetId} = { companyName } 에 기록한다.
//   · 처음 쓰는 시트 — 다른 회사의 배차표 양식(routeBoards.sheetUrl)·시트 연결(sheetProfiles)이 이 시트를 쓰고 있으면 거절,
//     아니면 지금 회사가 주인이 된다(서버만 쓰는 컬렉션 — 규칙에서 화면은 못 읽고 못 쓴다).
//   · 이미 주인이 있으면 같은 회사만(최고관리자는 확인만 하고 통과 — 관리 화면).
//   · 주인을 바꾸려면 최고관리자가 sheetRegistry 문서를 지운다(관리자 SDK/콘솔).
//   · 한 화주 시트를 두 운송사가 함께 쓰는 경우(정말 같은 화주 시트를 둘 다 공유받은 경우)는 최고관리자가
//     sheetRegistry/{spreadsheetId}.companies 배열에 회사 이름을 더해 허용한다. 이 기록이 생기기 전에 이미
//     여러 회사 양식이 같은 시트를 쓰고 있었다면 — 어느 쪽이 진짜 주인인지 서버가 알 수 없어 모두 거절하고 로그에 남긴다.
"use strict";

const OWNER_CACHE_MS = 5 * 60 * 1000;

function makeSheetGuard({ db, FieldValue, parseSpreadsheetId, fixedOwners = {} }) {
  let cache = { at: 0, map: null };
  // 지금 등록돼 있는 양식·시트 연결에서 시트 → 회사 목록(5분 기억)
  async function knownOwners() {
    if (cache.map && Date.now() - cache.at < OWNER_CACHE_MS) return cache.map;
    const map = new Map();
    const add = (sid, co) => {
      const id = String(sid || "").trim(); const c = String(co || "").trim();
      if (!id || !c) return;
      if (!map.has(id)) map.set(id, new Set());
      map.get(id).add(c);
    };
    Object.entries(fixedOwners).forEach(([sid, co]) => add(sid, co));
    const [rb, sp] = await Promise.all([
      db.collection("routeBoards").select("sheetUrl", "companyName").get().catch(() => ({ docs: [] })),
      db.collection("sheetProfiles").select("sheetUrl", "spreadsheetId", "companyName").get().catch(() => ({ docs: [] })),
    ]);
    rb.docs.forEach((d) => { const x = d.data() || {}; add(parseSpreadsheetId(x.sheetUrl), x.companyName); });
    sp.docs.forEach((d) => { const x = d.data() || {}; add(x.spreadsheetId || parseSpreadsheetId(x.sheetUrl), x.companyName); });
    cache = { at: Date.now(), map };
    return map;
  }
  const deny = (msg) => Object.assign(new Error(msg || "다른 회사에 연결된 구글시트예요. 이 시트는 쓸 수 없습니다."), { status: 403, code: "SHEET_OTHER_COMPANY" });

  // sid 시트를 company가 써도 되는지 — 안 되면 403 오류를 던진다. isTM(최고관리자)은 기록만 확인하고 통과
  async function assertSheetOwner(sid, company, { isTM = false, by = "" } = {}) {
    const id = String(sid || "").trim();
    const co = String(company || "").trim();
    if (!id) throw Object.assign(new Error("구글시트 주소가 올바르지 않습니다."), { status: 400 });
    if (!co && !isTM) throw deny();
    const ref = db.collection("sheetRegistry").doc(id);
    const snap = await ref.get();
    if (snap.exists) {
      const owner = String(snap.data()?.companyName || "").trim();
      const shared = Array.isArray(snap.data()?.companies) ? snap.data().companies.map((x) => String(x || "").trim()) : [];
      if (isTM || owner === co || shared.includes(co)) return { owner };
      console.warn(`[시트 잠금] ${co} → ${id} 거절(주인 ${owner})`);
      throw deny();
    }
    const owners = (await knownOwners()).get(id) || new Set();
    const others = [...owners].filter((c) => c !== co);
    if (isTM) return { owner: owners.size === 1 ? [...owners][0] : "" };
    if (others.length) {
      console.warn(`[시트 잠금] ${co} → ${id} 거절 — 다른 회사 양식·연결이 같은 시트를 씀: ${others.join(", ")} (최고관리자가 sheetRegistry에서 허용 가능)`);
      throw deny();
    }
    // 처음 쓰는 시트 — 지금 회사를 주인으로(동시에 두 회사가 처음 쓰면 먼저 쓴 쪽)
    try {
      await ref.create({ companyName: co, by: String(by || "").slice(0, 120), at: FieldValue.serverTimestamp() });
    } catch {
      const again = await ref.get();
      if (String(again.data()?.companyName || "").trim() !== co) throw deny();
    }
    cache.at = 0; // 다음 확인 때 목록 새로
    return { owner: co };
  }
  // 시트 주소(또는 id)를 받아 확인
  async function assertSheetUrlOwner(url, company, opts) {
    return assertSheetOwner(parseSpreadsheetId(url), company, opts);
  }
  return { assertSheetOwner, assertSheetUrlOwner, knownOwners };
}

module.exports = { makeSheetGuard };
