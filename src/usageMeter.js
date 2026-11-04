// ======================= src/usageMeter.js =======================
// 💰 2026-11-04 회사별 서버 사용량 표본(관리센터 › 비용·손익의 "운송사별 원가" 배분용)
//  · fsTenant.js(앱 전체의 Firestore 통로)가 서버에서 받은 문서 수(읽기)·저장 횟수(쓰기)를 여기 숫자로만 더한다.
//  · 10분에 한 번(그리고 창을 닫을 때) usageCounters/{회사}_{YYYY-MM} 한 문서에 increment로 더한다 — 기기당 하루 수십 번의 쓰기.
//  · 최고관리자 · 둘러보기(미리보기) · 화주사 · 로그인 전에는 꺼져 있다. 어떤 오류가 나도 앱 동작에는 영향이 없다.
//  · 서버(Cloud Functions)·안드로이드 기사앱 네이티브 위치 기록은 여기 안 잡힌다 → 화면은 "앱 표본"으로 표시하고 배분 비율로만 쓴다.
import { doc as baseDoc, setDoc as baseSetDoc, increment as baseIncrement, serverTimestamp as baseTs } from "kp-firestore-base";

const FLUSH_MS = 10 * 60 * 1000;
let co = ""; let on = false; let reads = 0; let writes = 0; let sessions = 0;
let lastFlush = Date.now(); let timer = null; let busy = false; let dead = false; let hooked = false;

const kstMonth = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
export function setUsageMeter({ company = "", enabled = false } = {}) {
  try {
    const c = String(company || "").trim();
    const next = !!enabled && !!c && !dead;
    if (on && (c !== co || !next)) flush(); // 회사가 바뀌거나 꺼지면 지금까지 숫자를 먼저 보낸다
    if (next && c !== co) { sessions += 1; }
    co = c; on = next;
    if (on && !timer && typeof window !== "undefined") {
      timer = setInterval(() => { if (Date.now() - lastFlush >= FLUSH_MS) flush(); }, 60 * 1000);
      if (!hooked) { hooked = true; window.addEventListener("pagehide", () => flush()); }
    }
  } catch { /* 무시 */ }
}
export function meterRead(k) { if (on && k > 0) reads += k; }
export function meterWrite(k = 1) { if (on && k > 0) writes += k; }

async function flush() {
  if (!on || busy || dead || (!reads && !writes && !sessions)) return;
  const r = reads, w = writes, s = sessions, c = co, ym = kstMonth();
  reads = 0; writes = 0; sessions = 0; lastFlush = Date.now(); busy = true;
  try {
    const { db } = await import("./firebase");
    // 저장소(영구 캐시)에 먼저 들어가므로 창을 닫는 순간이어도 다음 접속 때 이어서 보내진다
    await baseSetDoc(baseDoc(db, "usageCounters", `${c.replace(/\//g, "_")}_${ym}`), {
      company: c, month: ym, reads: baseIncrement(r), writes: baseIncrement(w + 1), sessions: baseIncrement(s), updatedAt: baseTs(),
    }, { merge: true });
  } catch (e) {
    if (e?.code === "permission-denied") dead = true; // 규칙이 아직 배포 전 — 이번 접속 동안은 끈다
    else { reads += r; writes += w; sessions += s; }
  } finally { busy = false; }
}
