// ======================= src/orderScanClient.js =======================
// 🧠 2026-11-07 오더 스캔 정밀 인식 — 화면 쪽 연결(배차 프로그램 · 허브가 같이 쓴다)
//  firebase를 직접 부르지 않는다(허브와 배차 프로그램은 firebase 묶음이 따로라 섞으면 안 된다) — 각 화면이 자기 것을 넘긴다.
//   · ocr(이미지)        서버 orderScanOcr(Google Vision) 호출
//   · extract(글, 예시)   서버 orderScanExtract(Claude) 호출
//   · 학습 기록 scanLearn/{회사 키}/items — 같은 회사만 읽고 쓴다(firestore.rules), 양식마다 최근 MAX_PER_TEMPLATE건만 둔다
//   · setPending(스캔 결과) → 오더를 저장할 때 commit(저장한 값) — 고친 칸이 있을 때만 기록
import { buildLearnRecord, collectRemaps, fnv1a, pickExamples, templateFingerprint } from "./orderScanAi.js";

export const MAX_PER_TEMPLATE = 5;
const LOAD_LIMIT = 200;

// 호출형 함수(callable) 규약 그대로 — { data } 보내고 { result } 받는다
async function callFn(base, name, data, token, ms) {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), ms) : null;
  try {
    const res = await fetch(`${base}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ data }),
      signal: ctl?.signal,
    });
    let j = {};
    try { j = await res.json(); } catch { /* 무시 */ }
    if (!res.ok || j.error) throw Object.assign(new Error(j.error?.message || `요청 실패(${res.status})`), { code: j.error?.status || res.status });
    return j.result;
  } finally { if (timer) clearTimeout(timer); }
}

// fs: { collection, doc, query, where, orderBy, limit, getDocs, setDoc, deleteDoc, serverTimestamp }
export function createScanAi({ base, getToken, getKey, getUid, db, fs, call = null }) {
  let learnCache = null; let learnKey = "";
  let pending = null;
  const invoke = async (name, data, ms) => (call ? call(name, data) : callFn(base, name, data, await getToken(), ms));
  const itemsCol = (key) => fs.collection(db, "scanLearn", key, "items");

  const api = {
    async ocr(image) { return invoke("orderScanOcr", { image }, 25000); },
    async extract(text, examples = []) { return invoke("orderScanExtract", { text, examples }, 30000); },
    async loadLearn() {
      const key = await getKey();
      if (!key || !db) return [];
      if (learnCache && learnKey === key) return learnCache;
      try {
        const s = await fs.getDocs(fs.query(itemsCol(key), fs.orderBy("updatedAtMs", "desc"), fs.limit(LOAD_LIMIT)));
        learnCache = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (e) { console.warn("[오더 스캔] 학습 기록을 읽지 못했어요:", e?.message || e); learnCache = []; }
      learnKey = key;
      return learnCache;
    },
    // 이 글에 쓸 예시 · 바로 적용할 규칙
    async hintsFor(text, client = "") {
      const items = await api.loadLearn();
      const cur = { ...templateFingerprint(text), text, client };
      return { examples: pickExamples(items, cur), remaps: collectRemaps(items), fp: cur.fp };
    },
    async saveLearn(rec) {
      const key = await getKey();
      if (!key || !db || !rec) return null;
      const id = `${rec.fp}_${fnv1a(rec.text)}`;
      const row = { ...rec, companyKey: key, uid: (await getUid?.()) || "", updatedAtMs: Date.now(), updatedAt: fs.serverTimestamp() };
      await fs.setDoc(fs.doc(db, "scanLearn", key, "items", id), row);
      if (learnCache && learnKey === key) learnCache = [{ id, ...row }, ...learnCache.filter((x) => x.id !== id)];
      // 같은 양식은 최근 몇 건만
      try {
        const s = await fs.getDocs(fs.query(itemsCol(key), fs.where("fp", "==", rec.fp)));
        const old = s.docs.map((d) => ({ id: d.id, t: d.data().updatedAtMs || 0 })).sort((a, b) => b.t - a.t).slice(MAX_PER_TEMPLATE);
        await Promise.all(old.map((o) => fs.deleteDoc(fs.doc(db, "scanLearn", key, "items", o.id))));
        if (learnCache && old.length) learnCache = learnCache.filter((x) => !old.some((o) => o.id === x.id));
      } catch (e) { console.warn("[오더 스캔] 오래된 학습 기록 정리 실패:", e?.message || e); }
      return id;
    },
    // 스캔 창 [적용] 때 — { text, scanned(스캔 직후 값), applied(창에서 고친 뒤 값) }
    setPending(p) { pending = p ? { ...p, at: Date.now() } : null; },
    getPending() { return pending; },
    // 오더 저장 때 — final: 저장한 오더(배차 등록 칸 이름). 30분 넘게 지난 스캔은 버린다
    async commit(final = {}) {
      const p = pending; pending = null;
      if (!p || Date.now() - p.at > 30 * 60 * 1000) return null;
      // 다른 오더를 저장한 것이면(상·하차지가 하나도 안 맞으면) 버린다
      const same = ["상차지명", "상차지주소", "하차지명", "하차지주소"].some((k) => p.applied?.[k] && final?.[k] && String(p.applied[k]).replace(/\s+/g, "") === String(final[k]).replace(/\s+/g, ""));
      if (Object.keys(final || {}).length && !same) return null;
      const merged = { ...(p.applied || {}) };
      Object.entries(final || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") merged[k] = v; });
      const rec = buildLearnRecord({ text: p.text, scanned: p.scanned, final: merged });
      if (!rec) return null;
      try { return await api.saveLearn(rec); } catch (e) { console.warn("[오더 스캔] 학습 기록 저장 실패:", e?.message || e); return null; }
    },
  };
  return api;
}
