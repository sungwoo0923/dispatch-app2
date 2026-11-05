// ======================= src/DeleteProgress.jsx =======================
// ⭐ 2026-11-05 삭제 진행 창(모든 메뉴 공통) — 여러 줄을 지울 때 한 줄씩 스르륵 사라지던 것을 없앤다.
//   · 가운데 "삭제 중… N건" 창(진행 막대)을 띄우고 → 한 번에 지운 뒤 → 잠깐 "삭제 완료"를 보여주고 닫힌다.
//   · Firestore 삭제는 묶음(writeBatch, 450건씩)으로 한 번에 보내서 목록이 한 번에 갱신된다.
//     묶음이 여러 개면 모두 같은 순간에 보내(커밋 사이에 기다리지 않음) 화면이 조금씩 줄어들지 않는다.
//   · 창은 kpDialog처럼 document.body에 한 번만 붙는다(PC·모바일·화주사 화면 어디서 불러도 된다).
//
//  사용법
//   await runDelete({ count: ids.length, label: "기사", task: (progress) => commitDeletes(db, refs, { onProgress: progress }) });
//   await deleteDocsAtomic(db, refs, { label: "하차지" });   // 위 두 줄을 합친 지름길
//   await runDelete({ label: "공지", task: () => deleteDoc(ref) }); // 한 건 삭제(확인창은 원래대로 먼저 묻는다)
//  · runDelete 안에서 또 runDelete를 부르면 창을 새로 띄우지 않고 바깥 창을 그대로 쓴다.
//  · task가 오래 걸리면(오프라인 등) 12초 뒤 창은 닫고(서버 반영은 계속) 결과는 그대로 돌려준다.
import React from "react";
import { createRoot } from "react-dom/client";
import { writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { db as appDb, auth } from "./firebase";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
export const DELETE_BATCH_SIZE = 450;

// ── 창 상태(모듈 전역) ─────────────────────────────────────────────
let state = null; // { phase: "run"|"done"|"error", count, done, label, message }
const subs = new Set();
const setState = (s) => { state = s; subs.forEach((f) => { try { f(); } catch { /* 무시 */ } }); };
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
const getState = () => state;

function DeleteProgressModal() {
  const s = React.useSyncExternalStore(subscribe, getState, getState);
  if (!s) return null;
  const { phase, count = 0, done = 0, label = "", message = "" } = s;
  const total = Math.max(1, count);
  const pct = phase === "done" ? 100 : Math.min(98, Math.round((done / total) * 100));
  const unit = label ? `${label} ` : "";
  const title = phase === "done" ? "삭제 완료" : phase === "error" ? "삭제 실패" : "삭제 중…";
  return (
    <div data-kp-delete-progress="1" role="alertdialog" aria-live="assertive" aria-busy={phase === "run"}
      style={{ position: "fixed", inset: 0, zIndex: 2147483645, background: "rgba(11,20,40,.62)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Noto Sans KR',sans-serif" }}
      onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <style>{"@keyframes kpdelin{from{transform:translateY(8px) scale(.98);opacity:0}to{transform:none;opacity:1}}@keyframes kpdelspin{to{transform:rotate(360deg)}}@keyframes kpdelbar{0%{background-position:0 0}100%{background-position:40px 0}}"}</style>
      <div style={{ width: "min(360px,100%)", borderRadius: 18, overflow: "hidden", background: "#fff", boxShadow: "0 30px 80px rgba(11,20,40,.45)", animation: "kpdelin .16s ease-out" }}>
        <div style={{ padding: "16px 20px 14px", color: "#fff", background: "linear-gradient(120deg,#0F1A30 0%,#1B2B4B 62%,#2D4C82 100%)" }}>
          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "0.26em", color: "#8FB0F0" }}>
            {phase === "done" ? "DELETE · 삭제 완료" : phase === "error" ? "DELETE · 오류" : "DELETE · 삭제 중"}
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{title}</div>
        </div>
        <div style={{ padding: "22px 20px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          {phase === "run" && (
            <div aria-hidden="true" style={{ width: 44, height: 44, borderRadius: "50%", border: "4px solid #E4EBF7", borderTopColor: "#2D4C82", animation: "kpdelspin .8s linear infinite" }} />
          )}
          {phase === "done" && (
            <div aria-hidden="true" style={{ width: 44, height: 44, borderRadius: "50%", background: "#1B2B4B", color: "#8FB0F0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900 }}>✓</div>
          )}
          {phase === "error" && (
            <div aria-hidden="true" style={{ width: 44, height: 44, borderRadius: "50%", background: "#FDECEC", color: "#B42318", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900 }}>!</div>
          )}
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0F1A30", textAlign: "center", wordBreak: "keep-all" }}>
            {phase === "error"
              ? (message || "삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.")
              : <>{unit}<span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{count.toLocaleString()}</span>건 {phase === "done" ? "삭제했습니다" : "삭제하는 중"}</>}
          </div>
          {phase !== "error" && (
            <div style={{ width: "100%", height: 8, borderRadius: 999, background: "#E4EBF7", overflow: "hidden" }}>
              <div style={{ width: `${phase === "run" && pct < 8 ? 8 : pct}%`, height: "100%", borderRadius: 999, transition: "width .25s ease", background: phase === "done" ? "#2D4C82" : "repeating-linear-gradient(45deg,#2D4C82 0 10px,#4B6CB7 10px 20px)", backgroundSize: "40px 100%", animation: phase === "run" ? "kpdelbar .7s linear infinite" : "none" }} />
            </div>
          )}
          {phase === "run" && <div style={{ fontSize: 12, fontWeight: 700, color: "#7A879C" }}>모두 지운 뒤 한 번에 목록에 반영됩니다</div>}
        </div>
      </div>
    </div>
  );
}

// 창은 첫 사용 때 document.body에 한 번만 붙는다(전역 포털)
let mounted = false;
function ensureHost() {
  if (mounted || typeof document === "undefined") return;
  mounted = true;
  const host = document.createElement("div");
  host.id = "kp-delete-progress-host";
  document.body.appendChild(host);
  createRoot(host).render(<DeleteProgressModal />);
}
// 다른 곳에서 미리 붙여 두고 싶을 때(선택) — 앱 시작 시 한 번 불러도 되고 안 불러도 된다
export function DeleteProgressHost() { React.useEffect(() => { ensureHost(); }, []); return null; }

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let depth = 0;
let closeTimer = null;

/**
 * 삭제 진행 창을 띄우고 task를 실행한다.
 * @param {{count?:number, label?:string, task:(progress:(done:number)=>void)=>Promise<any>, minMs?:number}} opts
 * @returns task의 결과(실패하면 오류를 그대로 던진다)
 */
export async function runDelete({ count = 1, label = "", task, minMs = 450 } = {}) {
  if (typeof task !== "function") return undefined;
  // 이미 창이 떠 있으면(안쪽 호출) 창은 그대로 두고 일만 한다
  if (depth > 0) return task(() => {});
  depth += 1;
  ensureHost();
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  const n = Math.max(1, Number(count) || 1);
  setState({ phase: "run", count: n, done: 0, label });
  const progress = (done) => { if (state?.phase === "run") setState({ ...state, done: Math.min(n, Number(done) || 0) }); };
  const started = Date.now();
  const work = Promise.resolve().then(() => task(progress));
  // 오프라인 등으로 서버 확인이 늦어도 창이 계속 화면을 막지 않게(로컬 반영은 이미 끝난 상태)
  const SLOW = {};
  try {
    const r = await Promise.race([work, wait(12000).then(() => SLOW)]);
    const left = minMs - (Date.now() - started);
    if (left > 0) await wait(left);
    setState({ phase: "done", count: n, done: n, label });
    closeTimer = setTimeout(() => { setState(null); closeTimer = null; }, 650);
    depth -= 1;
    if (r === SLOW) return work; // 결과는 끝날 때 돌려준다
    return r;
  } catch (e) {
    setState({ phase: "error", count: n, done: 0, label, message: e?.message ? `삭제하지 못했습니다 — ${e.message}` : "" });
    closeTimer = setTimeout(() => { setState(null); closeTimer = null; }, 1800);
    depth -= 1;
    throw e;
  }
}

/**
 * 문서들을 묶음(writeBatch)으로 한 번에 지운다(450건씩 · 여러 묶음도 같은 순간에 보낸다).
 * items: DocumentReference 또는 (batch) => void (같은 묶음에 set/update/delete를 함께 넣을 때)
 */
export async function commitDeletes(db, items, { onProgress } = {}) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return 0;
  const batches = [];
  for (let i = 0; i < list.length; i += DELETE_BATCH_SIZE) {
    const b = writeBatch(db);
    list.slice(i, i + DELETE_BATCH_SIZE).forEach((it) => { if (typeof it === "function") it(b); else b.delete(it); });
    batches.push({ b, size: Math.min(DELETE_BATCH_SIZE, list.length - i) });
  }
  // 모든 묶음을 한꺼번에 커밋 — 사이에 await가 없어 로컬 목록이 거의 동시에 갱신된다
  let done = 0;
  await Promise.all(batches.map(({ b, size }) => b.commit().then(() => { done += size; onProgress?.(done); })));
  return list.length;
}

/** runDelete + commitDeletes 지름길 */
export function deleteDocsAtomic(db, refs, { label = "", count } = {}) {
  const list = (refs || []).filter(Boolean);
  if (!list.length) return Promise.resolve(0);
  return runDelete({ count: count ?? list.length, label, task: (p) => commitDeletes(db, list, { onProgress: p }) });
}

/**
 * 오더 삭제 + 삭제 기록(deletedOrders — 다른 사용자 화면·휴지통용)을 한 번에. orderHistory.deleteOrderWithLog의 여러 건 판.
 * items: [{ col, id }] · 삭제 기록은 예전처럼 실패해도 삭제를 막지 않게 따로 묶음으로 보낸다.
 * opts.modal === false 이면 진행 창 없이(바깥에서 runDelete로 감쌌을 때 등)
 */
export function deleteOrdersWithLogAtomic(items, { label = "오더", modal = true } = {}) {
  const list = (items || []).filter((x) => x?.col && x?.id);
  if (!list.length) return Promise.resolve(0);
  const task = async (progress) => {
    commitDeletes(appDb, list.map(({ col, id }) => (b) => b.set(doc(appDb, "deletedOrders", `${col}_${id}`), { col, id, at: serverTimestamp(), by: auth.currentUser?.email || "" }))).catch(() => {});
    return commitDeletes(appDb, list.map(({ col, id }) => doc(appDb, col, id)), { onProgress: progress });
  };
  return modal ? runDelete({ count: list.length, label, task }) : task(() => {});
}

/** 테스트용 — 지금 창 상태 */
export const _deleteProgressState = () => state;
