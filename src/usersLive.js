// ======================= src/usersLive.js =======================
// ⭐ 2026-11-02 속도 — 직원 명부(users) 실시간 구독을 앱 전체에서 "하나"로 나눠 쓴다.
//  예전엔 PC 최상위(등록자 이름), 홈 대시보드, 직원관리, 기사관리, 기사서류, 지입차관리, 월비교,
//  모바일 최상위·알림 등이 각자 users 전체를 따로 구독해서, 누가 로그인만 해도(알림 토큰 저장 등)
//  같은 큰 목록을 화면마다 몇 번씩 다시 받아 가공·다시 그리느라 화면이 끊겼다.
//  받는 데이터는 예전과 똑같다(users 전체 — 회사 거르기는 fsTenant가 그대로 처리).
//  · 같은 목록을 한 번만 받아 모든 화면에 나눠준다(각 화면에는 배열 복사본).
//  · 회사 전환(최고관리자)·다른 계정 로그인 시 자동으로 새로 구독한다.
//  · 마지막 화면이 닫혀도 2분 동안은 유지해 메뉴를 오갈 때 다시 받지 않는다.
import { startTransition } from "react";
import { db, auth } from "./firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { getTenant, noScope } from "./fsTenant";

const live = { list: null, raw: null, unsub: null, key: "", subs: new Set(), idleTimer: null };
const keyNow = () => `${getTenant()}|${auth?.currentUser?.uid || ""}`;

function stop() {
  try { live.unsub?.(); } catch { /* 무시 */ }
  live.unsub = null;
}
// 🔒 2026-11-07 보안 점검 — 서버 규칙이 다른 회사 직원 명부를 막는다. 운송사 계정은 두 조회를 합친다:
//  ① 우리 회사 사람(companyName == 우리 회사 — fsTenant가 조건을 붙인다) ② 우리 회사에 연동된 화주(linkedTransportCompany.companyName)
//  최고관리자는 fsTenant가 조건을 붙이지 않아 예전처럼 전체를 받는다(②는 ①에 이미 들어 있어 중복 제거).
function start() {
  live.key = keyNow();
  const t = getTenant();
  const parts = [null, null];
  const emit = () => {
    const seen = new Set();
    const raw = [];
    parts.forEach((p) => (p || []).forEach((r) => { if (!seen.has(r.id)) { seen.add(r.id); raw.push(r); } }));
    // raw: 문서 번호(id)와 데이터를 따로 — 데이터에 id 필드가 있어도 문서 번호가 섞이지 않게
    live.raw = raw;
    live.list = live.raw.map((r) => ({ id: r.id, ...r.data }));
    const subs = [...live.subs];
    // 직원 목록 갱신은 급하지 않은 업데이트 — 입력·스크롤을 먼저 처리하게 한다
    startTransition(() => { subs.forEach((f) => { try { f(live.list.slice(), live.raw); } catch (e) { console.warn(e); } }); });
  };
  const toRaw = (snap) => snap.docs.map((d) => ({ id: d.id, data: d.data() || {} }));
  // 실패하면(권한 — 아직 회사가 정해지기 전 등) 다음 구독 때 다시 시작한다(예전과 같음)
  const u1 = onSnapshot(collection(db, "users"), (snap) => { parts[0] = toRaw(snap); emit(); }, () => { try { u2?.(); } catch { /* 무시 */ } live.unsub = null; });
  const u2 = t
    ? onSnapshot(noScope(query(collection(db, "users"), where("linkedTransportCompany.companyName", "==", t))), (snap) => { parts[1] = toRaw(snap); if (parts[0]) emit(); }, () => { parts[1] = []; })
    : null;
  live.unsub = () => { try { u1(); } catch { /* 무시 */ } try { u2?.(); } catch { /* 무시 */ } };
}
function ensure() {
  const k = keyNow();
  if (live.unsub && live.key !== k) { stop(); live.list = null; live.raw = null; }
  if (!live.unsub) start();
}

// fn(list, raw) — list: [{ id, ...데이터 }] (예전 AdminMenu 형식), raw: [{ id, data }]
// fn 없이 부르면 미리 받아두기만 한다. 돌려주는 함수로 구독 해제.
export function subscribeUsersLive(fn) {
  clearTimeout(live.idleTimer);
  ensure();
  if (fn) {
    live.subs.add(fn);
    if (live.list) { try { fn(live.list.slice(), live.raw); } catch (e) { console.warn(e); } }
  }
  const scheduleIdleStop = () => {
    clearTimeout(live.idleTimer);
    live.idleTimer = setTimeout(() => { if (!live.subs.size) stop(); }, 120000);
  };
  if (!fn) scheduleIdleStop();
  return () => {
    if (!fn) return;
    live.subs.delete(fn);
    if (!live.subs.size) scheduleIdleStop();
  };
}
export const getUsersLiveList = () => live.list;
