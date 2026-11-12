// ======================= src/freight/freightStore.js =======================
// 🚢 2026-11-12 컨테이너 · 해상 · 항공 구간 문서(freightJobs) — 회사별 실시간 구독 하나를 모든 화면이 같이 쓴다
//  회사 분리: src/fsTenant.js STRICT(읽기 거르기 · 쓰기 회사명 자동) + firestore.rules freightJobs
import React from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { nextJobNo, nextRefNo, buildHandoff, HANDOFF_STATUS, statusList } from "./freightCore";

const COL = "freightJobs";
let state = { jobs: [], loaded: false };
let unsub = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
// 둘러보기(/preview)는 저장이 막혀 있어 화면 안에서만 반영한다
const isPreview = () => { try { return window.__kpPreviewDemo === true; } catch { return false; } };
const tsMs = (v) => (typeof v === "number" ? v : v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0);
const sortJobs = (l) => l.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));

function start() {
  if (unsub) return;
  try {
    unsub = onSnapshot(collection(db, COL), (snap) => {
      const local = isPreview() ? state.jobs.filter((j) => j._local) : [];
      const jobs = snap.docs.map((d) => { const x = d.data() || {}; return { ...x, id: d.id, createdAtMs: tsMs(x.createdAtMs) || tsMs(x.createdAt) }; });
      state = { jobs: sortJobs([...local, ...jobs.filter((j) => !local.some((l) => l.id === j.id))]), loaded: true };
      emit();
    }, () => { state = { ...state, loaded: true }; emit(); });
  } catch { state = { ...state, loaded: true }; emit(); }
}
function stopSoon() {
  setTimeout(() => { if (!listeners.size && unsub) { try { unsub(); } catch { /* 무시 */ } unsub = null; state = { jobs: [], loaded: false }; } }, 5000);
}
const subscribe = (cb) => { listeners.add(cb); start(); return () => { listeners.delete(cb); if (!listeners.size) stopSoon(); }; };
const get = () => state;
// { jobs, loaded } — 회사가 바뀌면(최고관리자) 화면이 다시 열리며 새로 구독된다
export function useFreightJobs() { return React.useSyncExternalStore(subscribe, get, get); }

const me = (by) => by || auth?.currentUser?.displayName || auth?.currentUser?.email || "";
const hist = (text, by) => ({ at: Date.now(), by: me(by), text });
const clean = (o) => { const out = {}; Object.keys(o || {}).forEach((k) => { if (o[k] !== undefined && !k.startsWith("_") && k !== "id") out[k] = o[k]; }); return out; };

function localUpsert(job) {
  const i = state.jobs.findIndex((j) => j.id === job.id);
  const jobs = [...state.jobs];
  if (i >= 0) jobs[i] = { ...jobs[i], ...job, _local: true }; else jobs.unshift({ ...job, _local: true });
  state = { ...state, jobs: sortJobs(jobs) }; emit();
}

// 새 구간 — jobNo 가 없으면 새 Job. 돌려주는 값: 저장한 문서(id 포함)
export async function createLeg(data, by) {
  const now = Date.now();
  const jobs = state.jobs;
  const row = clean({
    ...data,
    jobNo: data.jobNo || nextJobNo(jobs, now),
    refNo: data.refNo || nextRefNo(data.mode, jobs, now),
    status: data.status || statusList(data.mode)[0],
    createdAtMs: now, updatedAtMs: now, createdBy: me(by),
    history: [hist(data.status === HANDOFF_STATUS ? "인계 요청" : "등록", by)],
  });
  if (isPreview()) { const id = `local-${now}-${Math.random().toString(36).slice(2, 6)}`; localUpsert({ ...row, id }); return { ...row, id }; }
  const ref = await addDoc(collection(db, COL), row);
  return { ...row, id: ref.id };
}
// 수량만큼 같은 내용으로 여러 건(컨테이너 여러 대) — 같은 Job 번호
export async function createLegs(data, qty, by) {
  const n = Math.max(1, Math.min(30, Number(qty) || 1));
  const out = [];
  let jobNo = data.jobNo || "";
  for (let i = 0; i < n; i++) {
    // 번호가 겹치지 않게 한 건씩 차례로
    // eslint-disable-next-line no-await-in-loop
    const leg = await createLeg({ ...data, jobNo }, by);
    if (!isPreview()) localBump(leg);
    jobNo = leg.jobNo; out.push(leg);
  }
  return out;
}
// 서버 반영 전에도 다음 번호가 겹치지 않게 방금 만든 것을 목록에 잠깐 넣어 둔다
function localBump(leg) { if (!state.jobs.some((j) => j.id === leg.id)) state = { ...state, jobs: [leg, ...state.jobs] }; }

export async function updateLeg(job, patch, note, by) {
  const p = clean({ ...patch, updatedAtMs: Date.now() });
  if (note) p.history = [...(Array.isArray(job.history) ? job.history : []), hist(note, by)].slice(-60);
  if (isPreview() || job._local) { localUpsert({ ...job, ...p }); return; }
  await updateDoc(doc(db, COL, job.id), p);
}
export const setLegStatus = (job, status, by) => updateLeg(job, { status }, `상태: ${job.status || "-"} → ${status}`, by);
export async function removeLeg(job) {
  if (isPreview() || job._local) { state = { ...state, jobs: state.jobs.filter((j) => j.id !== job.id) }; emit(); return; }
  await deleteDoc(doc(db, COL, job.id));
}
// 다음 구간 인계 — 받는 팀 인계함에 "인계요청"으로 뜬다
export async function requestHandoff(from, toMode, extra, by) {
  const leg = await createLeg(buildHandoff(from, toMode, extra), by);
  await updateLeg(from, { handoffs: [...(Array.isArray(from.handoffs) ? from.handoffs : []), { to: toMode, legId: leg.id, refNo: leg.refNo, at: Date.now() }] }, `인계 요청 → ${toMode} (${leg.refNo})`, by);
  return leg;
}
