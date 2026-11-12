// ======================= src/fetchTimeout.js =======================
// ⏱ 2026-11-12 정해진 시간 안에 답이 없으면 포기하는 fetch · Promise
//  가입 화면에서 서버 함수가 깨어나는 데 오래 걸리거나(콜드 스타트) 503을 주면 버튼이 "처리 중…"으로 멈춰 있던 문제
export async function fetchT(url, ms = 6000, init = {}) {
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const t = setTimeout(() => ctl?.abort(), ms);
  try { return await fetch(url, { ...init, ...(ctl ? { signal: ctl.signal } : {}) }); } finally { clearTimeout(t); }
}
// p가 ms 안에 끝나지 않으면 code "kp/timeout" · step(어느 단계) 오류
export function withTimeout(p, ms, step) {
  let t;
  return Promise.race([
    p,
    new Promise((_, no) => { t = setTimeout(() => no(Object.assign(new Error(`${step} 시간 초과`), { code: "kp/timeout", step })), ms); }),
  ]).finally(() => clearTimeout(t));
}
