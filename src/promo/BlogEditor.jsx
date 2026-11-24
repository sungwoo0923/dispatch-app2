// ======================= src/promo/BlogEditor.jsx =======================
// 📝 2026-11-23 관리자센터 › 홍보 › 블로그 원고 (사용자 요청: 블로그 글을 직접 고치고 미리 보고 올리기)
//  · 목록: 상태(검토 대기 · 작성 중 · 발행/예약 · 내림) · 앞으로 8주 달력 · 검색 점수 · 네이버 올림 표시
//  · 편집: 본문(마크다운 + 도구 단추 + AI 다듬기) / 미리보기(홈페이지 · 네이버 · 휴대폰) · 카드 이미지 3장 · 검색 점검 · 정보 · 네이버 올리기 · 고친 기록
//  · 발행: 카드 JPG 를 Storage 에 올리고 status=publish → GitHub "블로그 홈페이지 반영"이 매시 17분에 logisweb.co.kr/blog 로 올린다
//  · 매주 월요일 07:13 서버가 다음 주제로 AI 초안을 "검토 대기"로 넣는다(홍보 설정에서 끄기 · 주제 바꾸기)
import React from "react";
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { ref as sref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { G, NUM, GOLD_BTN, AdmPanel, AdmEmpty, kstToday } from "../adminCenter/admUi";
import { kpConfirm } from "../kpDialog";
import { LIBRARY, libUrl, isVideoSrc, mktCall } from "./promoKit";
import { md2html, NAVER_STYLE, SITE_STYLE, seoCheck, slugify, cardIdx, stripMd } from "./blogFormat";
import { CardView, CardThumb, CARD_KINDS, cardToBlob } from "./BlogCard";

const inp = { background: "rgba(255,255,255,.04)", border: `1px solid ${G.line2}`, color: G.ink };
const lbl = "block text-[11.5px] font-extrabold tracking-[0.04em] mb-1";
const clean = (x) => JSON.parse(JSON.stringify(x, (k, v) => (v === undefined ? null : v)));
const STATUS = { draft: ["작성 중", G.sub], review: ["검토 대기", G.warn], publish: ["발행", G.ok], hidden: ["내림", G.dim] };
const statusOf = (p, today = kstToday()) => (p.status === "publish" && p.date > today ? ["예약 " + p.date.slice(5), G.ice] : STATUS[p.status] || STATUS.draft);
const hashCards = (c) => { const s = JSON.stringify(c || []); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h >>> 0); };
const mondayOf = (d) => { const x = new Date(d + "T00:00:00Z"); const w = (x.getUTCDay() + 6) % 7; return new Date(x - w * 864e5).toISOString().slice(0, 10); };
const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const DEFAULT_CARDS = (title = "") => [
  { kind: "cover", cat: "배차 실무 팁", title: title || "제목을\n**여기에**", img: "real-board.jpg", label: "LogisWeb · 실시간배차현황", crop: "50% 20%" },
  { kind: "shot", cat: "실제 화면", title: "화면 **한 장**으로", sub: "한 줄 설명", img: "real-scan.jpg", label: "LogisWeb · 오더 스캔", crop: "50% 30%" },
  { kind: "points", cat: "한눈에 정리", title: "이것만 기억하세요", points: [["핵심 1", "짧은 설명"], ["핵심 2", "짧은 설명"], ["핵심 3", "짧은 설명"], ["핵심 4", "짧은 설명"]] },
];
export const newPost = (o = {}) => ({ title: "", slug: "", date: mondayOf(addDays(kstToday(), 7)), status: "draft", keywords: "", tags: ["로지스웹"], summary: "", body: "![대표 이미지](card-1)\n\n첫 문단에 현장 장면을 적어 주세요.\n\n## 소제목\n\n본문\n\n![실제 화면](card-2)\n\n## 무료로 먼저 써 보세요\n\n👉 무료 체험 신청: **logisweb.co.kr** (검색창에 \"로지스웹\")\n", cards: DEFAULT_CARDS(), naverDone: false, ...o });

function Btn({ gold, children, className = "", small, ...p }) {
  return <button type="button" {...p} className={`${small ? "h-8 px-2.5 text-[12px]" : "h-9 px-3.5 text-[13px]"} rounded-xl font-black whitespace-nowrap disabled:opacity-40 ${className}`} style={gold ? GOLD_BTN : { border: `1px solid ${G.line}`, color: G.ink, background: "rgba(255,255,255,.03)", ...(p.style || {}) }}>{children}</button>;
}
function Field({ label, children, hint }) { return <div className="block mb-3"><span className={lbl} style={{ color: G.dim }}>{label}</span>{children}{hint && <span className="block text-[11px] mt-1" style={{ color: G.dim }}>{hint}</span>}</div>; }
function Text({ value, onChange, rows, ...p }) {
  return rows ? <textarea rows={rows} value={value || ""} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg px-3 py-2 text-[13px] leading-relaxed" style={inp} {...p} />
    : <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="w-full h-9 rounded-lg px-3 text-[13px]" style={inp} {...p} />;
}
async function upload(path, blob, type) { const r = sref(storage, path); await uploadBytes(r, blob, { contentType: type || blob.type, cacheControl: "public,max-age=31536000" }); return getDownloadURL(r); }
const blogSeeds = import.meta.glob("/marketing/blog/posts/*/post.md", { query: "?raw", import: "default" });
const cardSeeds = import.meta.glob("/marketing/blog/posts/*/cards.json", { import: "default" });
function parseFront(raw) {
  const m = String(raw).match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/); if (!m) return null; const meta = {};
  for (const l of m[1].split("\n")) { const i = l.indexOf(":"); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"(.*)"$/, "$1"); }
  return { ...meta, tags: String(meta.tags || "").split(",").map((x) => x.trim()).filter(Boolean), body: m[2].trim().replace(/\]\(card-([1-9])\.(jpg|png)\)/g, "](card-$1)") };
}

// ───────────── 목록 ─────────────
export default function BlogEditor({ onMakeVideo }) {
  const [list, setList] = React.useState(null); const [openId, setOpenId] = React.useState(""); const [f, setF] = React.useState("all");
  const [busy, setBusy] = React.useState(""); const [ai, setAi] = React.useState(null);
  React.useEffect(() => onSnapshot(query(collection(db, "mktBlog"), orderBy("date", "desc")), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([])), []);
  const create = async (p) => { const r = await addDoc(collection(db, "mktBlog"), clean({ ...p, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })); setOpenId(r.id); };
  const seed = async () => {
    setBusy("기존 글 4편을 불러오는 중…");
    try {
      for (const [path, load] of Object.entries(blogSeeds)) {
        const p = parseFront(await load()); if (!p) continue; const cl = cardSeeds[path.replace("post.md", "cards.json")];
        const cards = cl ? await cl() : DEFAULT_CARDS(p.title);
        await addDoc(collection(db, "mktBlog"), clean({ ...newPost(), ...p, status: "publish", cards, seed: true, naverDone: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
      }
    } finally { setBusy(""); }
  };
  const weeklyNow = async () => { setBusy("이번 주 초안을 쓰는 중… (30초~1분)"); try { const r = await mktCall("weeklyNow", { force: true }); setBusy(r.title ? `초안을 만들었어요: ${r.title}` : `건너뜀: ${r.skipped || ""}`); } catch (e) { setBusy(e.message); } };
  if (openId) return <Editor id={openId} onBack={() => setOpenId("")} onMakeVideo={onMakeVideo} />;
  if (!list) return <AdmEmpty>블로그 원고를 불러오는 중이에요…</AdmEmpty>;
  const today = kstToday(); const counts = { review: list.filter((p) => p.status === "review").length };
  const shown = list.filter((p) => f === "all" || (f === "publish" ? p.status === "publish" : p.status === f));
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(mondayOf(today), i * 7));
  return (
    <div className="space-y-4">
      <AdmPanel code="BLOG" title="블로그 원고" right={<div className="flex flex-wrap gap-2">
        <Btn gold onClick={() => create(newPost())}>＋ 새 글</Btn>
        <Btn onClick={() => setAi({ topic: "", keywords: "", angle: "" })}>✨ AI 초안 쓰기</Btn>
        <Btn onClick={weeklyNow}>이번 주 자동 초안 지금 만들기</Btn>
        {!list.some((p) => p.seed) && <Btn onClick={seed}>기존 글 4편 불러오기</Btn>}
      </div>}>
        {busy && <div className="mb-3 text-[13px]" style={{ color: G.gold }}>{busy}</div>}
        <div className="mb-4"><div className={lbl} style={{ color: G.dim }}>앞으로 8주 (매주 월요일 1편)</div>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>{weeks.map((w) => { const ps = list.filter((p) => p.date >= w && p.date <= addDays(w, 6) && p.status !== "hidden"); return (
            <div key={w} className="rounded-xl p-2" style={{ border: `1px solid ${ps.length ? G.line : "rgba(255,138,122,.35)"}`, background: "rgba(255,255,255,.02)" }}>
              <div className="text-[11px] font-black" style={{ ...NUM, color: w === mondayOf(today) ? G.gold : G.dim }}>{w.slice(5).replace("-", "/")} 주{w === mondayOf(today) ? " · 이번 주" : ""}</div>
              {ps.length ? ps.map((p) => <button key={p.id} type="button" onClick={() => setOpenId(p.id)} className="block text-left text-[12px] font-bold truncate w-full" style={{ color: statusOf(p, today)[1] }}>{p.title || "(제목 없음)"}</button>)
                : <button type="button" onClick={() => create(newPost({ date: w }))} className="text-[12px] font-bold" style={{ color: G.bad }}>비어 있음 · 쓰기 ＋</button>}
            </div>); })}</div></div>
        <div className="flex flex-wrap gap-1 mb-3">{[["all", "전체"], ["review", `검토 대기${counts.review ? ` ${counts.review}` : ""}`], ["draft", "작성 중"], ["publish", "발행 · 예약"], ["hidden", "내림"]].map(([k, l]) => <button key={k} type="button" onClick={() => setF(k)} className="h-8 px-3 rounded-lg text-[12px] font-black" style={f === k ? GOLD_BTN : { border: `1px solid ${G.line2}`, color: G.sub }}>{l}</button>)}</div>
        {!shown.length ? <div className="py-8 text-center text-[13.5px]" style={{ color: G.sub }}>글이 없어요. [기존 글 4편 불러오기] 또는 [✨ AI 초안 쓰기]로 시작해 보세요.</div> : (
          <div className="divide-y" style={{ borderColor: G.line2 }}>{shown.map((p) => { const [sl, sc] = statusOf(p, today); const seo = seoCheck(p); return (
            <div key={p.id} className="flex items-center gap-3 py-2.5 cursor-pointer" onClick={() => setOpenId(p.id)} style={{ borderColor: G.line2 }}>
              <span className="text-[12px] w-[84px] shrink-0" style={{ ...NUM, color: G.dim }}>{p.date}</span>
              <span className="text-[11px] font-black px-2 py-0.5 rounded-full shrink-0" style={{ color: sc, border: `1px solid ${sc}` }}>{sl}</span>
              <span className="flex-1 min-w-0 truncate text-[13.5px] font-bold" style={{ color: G.ink }}>{p.title || "(제목 없음)"}{p.auto ? <span className="ml-1.5 text-[10.5px] font-black" style={{ color: G.ice }}>AI</span> : null}</span>
              <span className="text-[11.5px] shrink-0 hidden sm:inline" style={{ ...NUM, color: seo.score >= 80 ? G.ok : seo.score >= 60 ? G.warn : G.bad }}>검색 {seo.score}점</span>
              <span className="text-[11.5px] shrink-0 hidden sm:inline" style={{ color: p.naverDone ? G.ok : G.dim }}>{p.naverDone ? "네이버 ✓" : "네이버 -"}</span>
              <button type="button" className="text-[12px] px-1 shrink-0" style={{ color: G.bad }} onClick={async (e) => { e.stopPropagation(); if (await kpConfirm(`"${p.title}" 글을 지울까요?`)) await deleteDoc(doc(db, "mktBlog", p.id)); }}>✕</button>
            </div>); })}</div>)}
      </AdmPanel>
      {ai && <AiDraftModal v={ai} set={setAi} onDone={(p) => { setAi(null); create(p); }} />}
    </div>
  );
}
function Modal({ title, children, onClose }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(2,6,14,.72)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
    <div className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-2xl p-5" style={{ background: G.panel, border: `1px solid ${G.line}` }}>
      <div className="flex items-center justify-between mb-4"><div className="text-[16px] font-black" style={{ color: G.ink }}>{title}</div><button type="button" onClick={onClose} className="text-[20px]" style={{ color: G.dim }}>×</button></div>{children}</div></div>;
}
function AiDraftModal({ v, set, onDone }) {
  const [busy, setBusy] = React.useState(false); const [err, setErr] = React.useState("");
  const go = async () => {
    if (!v.topic.trim()) { setErr("주제를 적어 주세요."); return; }
    setBusy(true); setErr("");
    try { const r = await mktCall("blogDraft", v); const o = r.out; onDone(newPost({ title: o.title, summary: o.summary, tags: o.tags, body: o.body, cards: o.cards?.length ? o.cards : DEFAULT_CARDS(o.title), keywords: v.keywords, slug: slugify(v.slug || ""), status: "review", auto: "manual" })); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return <Modal title="✨ AI 블로그 초안" onClose={() => set(null)}>
    <Field label="주제" hint="예: 인수증 사진, 카톡으로 다시 보내지 마세요"><Text value={v.topic} onChange={(x) => set({ ...v, topic: x })} /></Field>
    <Field label="검색 키워드(쉼표로)" hint="네이버에서 사람들이 칠 말 — 예: 인수증 관리, 화물 인수증"><Text value={v.keywords} onChange={(x) => set({ ...v, keywords: x })} /></Field>
    <Field label="관점 · 꼭 넣을 내용(선택)"><Text rows={3} value={v.angle} onChange={(x) => set({ ...v, angle: x })} /></Field>
    <Field label="추천 사진"><select value={v.img || ""} onChange={(e) => set({ ...v, img: e.target.value })} className="w-full h-9 rounded-lg px-2 text-[13px]" style={inp}><option value="">AI가 고르기</option>{LIBRARY.filter(([k]) => !isVideoSrc(k)).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Field>
    {err && <div className="text-[12.5px] mb-2" style={{ color: G.bad }}>{err}</div>}
    <div className="flex justify-end gap-2"><Btn onClick={() => set(null)}>닫기</Btn><Btn gold onClick={go} disabled={busy}>{busy ? "쓰는 중… (30초~1분)" : "초안 쓰기"}</Btn></div>
  </Modal>;
}

// ───────────── 편집기 ─────────────
function Editor({ id, onBack, onMakeVideo }) {
  const [P, setP] = React.useState(null); const [saved, setSaved] = React.useState("저장됨"); const [tab, setTab] = React.useState("preview");
  const [toast, setToast] = React.useState(""); const [cardUrls, setCardUrls] = React.useState({}); const [busy, setBusy] = React.useState("");
  const taRef = React.useRef(null); const timer = React.useRef(0); const hist = React.useRef({ past: [], future: [] }); const lastPush = React.useRef(0);
  const say = React.useCallback((m) => { setToast(m); setTimeout(() => setToast(""), 3500); }, []);
  React.useEffect(() => { getDoc(doc(db, "mktBlog", id)).then((d) => { if (!d.exists()) { onBack(); return; } setP({ ...newPost(), ...d.data() }); }); }, [id, onBack]);
  const persist = React.useCallback((next) => {
    setSaved("저장 중…"); clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const { id: _i, createdAt: _c, ...rest } = next;
        const h = Array.isArray(rest.history) ? rest.history : []; const last = h[0]?.at || 0;
        const history = Date.now() - last > 10 * 60000 ? [{ at: Date.now(), title: rest.title, body: rest.body }, ...h].slice(0, 15) : h;
        await setDoc(doc(db, "mktBlog", id), clean({ ...rest, history, updatedAt: serverTimestamp() }), { merge: true });
        if (history !== h) setP((c) => ({ ...c, history }));
        setSaved("저장됨");
      } catch (e) { setSaved("저장 실패"); say(e.message); }
    }, 1000);
  }, [id, say]);
  const update = React.useCallback((fn) => setP((cur) => {
    const next = typeof fn === "function" ? fn(cur) : { ...cur, ...fn };
    const now = Date.now(); if (now - lastPush.current > 800) { hist.current.past.push(JSON.stringify(cur)); if (hist.current.past.length > 80) hist.current.past.shift(); } lastPush.current = now; hist.current.future = [];
    persist(next); return next;
  }), [persist]);
  const undo = () => { const h = hist.current; if (!h.past.length) return; setP((cur) => { h.future.push(JSON.stringify(cur)); const v = JSON.parse(h.past.pop()); persist(v); return v; }); };
  const redo = () => { const h = hist.current; if (!h.future.length) return; setP((cur) => { h.past.push(JSON.stringify(cur)); const v = JSON.parse(h.future.pop()); persist(v); return v; }); };
  // 카드 그림 미리 만들기(미리보기용) — 카드가 바뀌면 1.2초 뒤
  const cardsKey = P ? JSON.stringify(P.cards || []) : "";
  React.useEffect(() => {
    if (!P) return undefined; let alive = true;
    const t = setTimeout(async () => { const out = {}; for (let i = 0; i < (P.cards || []).length; i++) { try { const b = await cardToBlob(P.cards[i]); if (b) out[i + 1] = URL.createObjectURL(b); } catch (e) { console.warn(e); } } if (alive) setCardUrls((old) => { Object.values(old).forEach((u) => URL.revokeObjectURL(u)); return out; }); }, 1200);
    return () => { alive = false; clearTimeout(t); };
  }, [cardsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!P) return <AdmEmpty>글을 여는 중이에요…</AdmEmpty>;

  const imgSrc = (src) => { const k = cardIdx(src); if (k) return cardUrls[k] || ""; return libUrl(src); };
  const seo = seoCheck(P); const [sl, sc] = statusOf(P);
  // 본문 도구 — 고른 글자를 감싸거나 줄을 넣는다
  const wrapSel = (before, after = "", ph = "") => {
    const ta = taRef.current; if (!ta) return; const { selectionStart: a, selectionEnd: b, value } = ta; const sel = value.slice(a, b) || ph;
    const next = value.slice(0, a) + before + sel + after + value.slice(b); update({ body: next });
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(a + before.length, a + before.length + sel.length); });
  };
  const line = (text) => { const ta = taRef.current; const v = P.body || ""; const a = ta ? ta.selectionStart : v.length; const pre = v.slice(0, a); const nl = pre && !pre.endsWith("\n\n") ? (pre.endsWith("\n") ? "\n" : "\n\n") : ""; update({ body: pre + nl + text + "\n\n" + v.slice(a) }); };
  const rewrite = async (how) => {
    const ta = taRef.current; const a = ta?.selectionStart ?? 0, b = ta?.selectionEnd ?? 0; const part = b > a ? P.body.slice(a, b) : P.body;
    setBusy(`AI가 "${how}" 고치는 중…`);
    try { const r = await mktCall("rewrite", { text: part, how }); const t = r.out.text; update({ body: b > a ? P.body.slice(0, a) + t + P.body.slice(b) : t }); say("고쳤어요. 마음에 안 들면 ↶ 되돌리기"); }
    catch (e) { say(e.message); } finally { setBusy(""); }
  };
  const makeCardImgs = async () => {
    const urls = []; for (let i = 0; i < (P.cards || []).length; i++) { const b = await cardToBlob(P.cards[i]); urls.push(await upload(`marketing/blog/${id}/card-${i + 1}-${hashCards(P.cards)}.jpg`, b, "image/jpeg")); }
    return urls;
  };
  const publish = async () => {
    if (!P.slug) { say("정보 탭에서 주소(영문)를 먼저 넣어 주세요."); setTab("info"); return; }
    if (seo.score < 60 && !(await kpConfirm(`검색 점수가 ${seo.score}점이에요. 그래도 발행할까요?`))) return;
    setBusy("카드 그림을 만들어 올리는 중…");
    try { const cardImgs = await makeCardImgs(); update({ status: "publish", cardImgs, cardsHash: hashCards(P.cards), publishedAt: Date.now() }); say(P.date > kstToday() ? `${P.date}에 홈페이지에 올라가요(예약).` : "발행했어요. 1시간 안에 logisweb.co.kr/blog 에 올라가요."); }
    catch (e) { say(e.message); } finally { setBusy(""); }
  };
  const tabs = [["preview", "미리보기"], ["cards", "카드 이미지"], ["seo", `검색 점검 ${seo.score}`], ["info", "정보"], ["naver", "네이버"], ["hist", "기록"]];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl p-3" style={{ background: G.panel, border: `1px solid ${G.line}` }}>
        <Btn onClick={onBack}>← 목록</Btn>
        <span className="text-[11.5px] font-black px-2 py-1 rounded-full" style={{ color: sc, border: `1px solid ${sc}` }}>{sl}</span>
        <input type="date" value={P.date} onChange={(e) => update({ date: e.target.value })} className="h-9 rounded-lg px-2 text-[13px]" style={inp} title="발행 날짜(이 날짜가 되면 홈페이지에 올라가요)" />
        <span className="text-[12px] font-bold" style={{ color: saved === "저장됨" ? G.ok : saved === "저장 실패" ? G.bad : G.warn }}>{saved}</span>
        <Btn small onClick={undo} title="되돌리기">↶</Btn><Btn small onClick={redo} title="다시">↷</Btn>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {onMakeVideo && <Btn small onClick={() => onMakeVideo(P)}>🎬 이 글로 숏츠 만들기</Btn>}
          {P.status === "publish" ? <Btn small onClick={() => update({ status: "hidden" })} style={{ color: G.bad }}>홈페이지에서 내리기</Btn> : <Btn small onClick={() => update({ status: P.status === "review" ? "draft" : "review" })}>{P.status === "review" ? "작성 중으로" : "검토 대기로"}</Btn>}
          <Btn gold onClick={publish} disabled={!!busy}>{P.status === "publish" ? "다시 발행(고친 내용 반영)" : P.date > kstToday() ? "예약 발행" : "발행하기"}</Btn>
        </div>
      </div>
      {busy && <div className="text-[13px] font-bold" style={{ color: G.gold }}>{busy}</div>}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl p-3 min-w-0" style={{ background: G.panel, border: `1px solid ${G.line}` }}>
          <div className="flex items-center gap-2 mb-2"><input value={P.title} onChange={(e) => update({ title: e.target.value })} placeholder="제목(검색 키워드를 앞쪽에)" className="flex-1 h-10 rounded-lg px-3 text-[15px] font-black" style={inp} /><span className="text-[11.5px]" style={{ ...NUM, color: P.title.length > 40 ? G.warn : G.dim }}>{P.title.length}자</span></div>
          <div className="flex flex-wrap gap-1 mb-2">
            {[["소제목", () => line("## 소제목")], ["굵게", () => wrapSel("**", "**", "강조할 말")], ["• 목록", () => line("- 항목 1\n- 항목 2")], ["1. 번호", () => line("1. 첫째\n2. 둘째")], ["인용", () => line("> 인용할 말")], ["표", () => line("| 일 | 엑셀 | 로지스웹 |\n|---|---|---|\n| 오더 입력 | 다시 입력 | 붙여넣기 |")], ["체험 안내", () => line("👉 무료 체험 신청: **logisweb.co.kr** (검색창에 \"로지스웹\")")]].map(([n, fn]) => <Btn key={n} small onClick={fn}>{n}</Btn>)}
            <ImgMenu onPick={(src, alt) => line(`![${alt}](${src})`)} say={say} postId={id} />
            <select onChange={(e) => { if (e.target.value) rewrite(e.target.value); e.target.value = ""; }} className="h-8 rounded-xl px-2 text-[12px] font-black" style={{ ...inp, color: G.gold }} defaultValue=""><option value="">✨ AI 다듬기</option>{["더 읽기 쉽게", "더 짧게", "더 친근하게", "더 전문적으로", "맞춤법 · 띄어쓰기만", "네이버 검색에 맞게(키워드 자연스럽게)"].map((x) => <option key={x} value={x}>{x}</option>)}</select>
          </div>
          <textarea ref={taRef} value={P.body} onChange={(e) => update({ body: e.target.value })} spellCheck={false} className="w-full rounded-lg px-3 py-2.5 text-[13.5px] leading-[1.75]" style={{ ...inp, minHeight: "62vh" }} />
          <div className="text-[11.5px] mt-1.5" style={{ color: G.dim }}>{stripMd(P.body).length.toLocaleString()}자 · 글자를 골라 놓고 [굵게] · [AI 다듬기]를 누르면 고른 부분만 바뀌어요 · 그림 자리 card-1~3 은 [카드 이미지] 탭의 그림이에요</div>
        </div>
        <div className="rounded-2xl p-3 min-w-0" style={{ background: G.panel, border: `1px solid ${G.line}` }}>
          <div className="flex flex-wrap gap-1 mb-3">{tabs.map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className="h-8 px-2.5 rounded-lg text-[12px] font-black" style={tab === k ? GOLD_BTN : { border: `1px solid ${G.line2}`, color: G.sub }}>{l}</button>)}</div>
          {tab === "preview" && <Preview P={P} imgSrc={imgSrc} />}
          {tab === "cards" && <CardsPanel P={P} update={update} cardUrls={cardUrls} />}
          {tab === "seo" && <SeoPanel seo={seo} />}
          {tab === "info" && <InfoPanel P={P} update={update} say={say} />}
          {tab === "naver" && <NaverPanel P={P} update={update} say={say} makeCardImgs={makeCardImgs} cardUrls={cardUrls} />}
          {tab === "hist" && <HistPanel P={P} update={update} />}
        </div>
      </div>
      {toast && <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[90] px-4 py-2.5 rounded-xl text-[13px] font-bold" style={{ background: "#1B2B4B", color: "#fff", border: `1px solid ${G.line}` }}>{toast}</div>}
    </div>
  );
}
function ImgMenu({ onPick, say, postId }) {
  const [open, setOpen] = React.useState(false); const [up, setUp] = React.useState("");
  const uploadImg = async (f) => { if (!f || !/^image\//.test(f.type)) return; setUp("올리는 중…"); try { const url = await upload(`marketing/blog/${postId}/img-${Date.now()}-${f.name.replace(/[^\w.가-힣-]/g, "_")}`, f, f.type); onPick(url, "사진 설명"); setOpen(false); } catch (e) { say(e.message); } finally { setUp(""); } };
  return <span className="relative"><Btn small onClick={() => setOpen(!open)}>🖼 그림</Btn>
    {open && <div className="absolute z-30 left-0 top-9 w-[320px] rounded-xl p-2 shadow-2xl" style={{ background: G.panel2, border: `1px solid ${G.line}` }}>
      <div className="flex gap-1 mb-2">{[1, 2, 3].map((k) => <Btn key={k} small onClick={() => { onPick(`card-${k}`, k === 1 ? "대표 이미지" : "그림 설명"); setOpen(false); }}>카드 {k}</Btn>)}
        <label className="h-8 px-2.5 text-[12px] rounded-xl font-black flex items-center cursor-pointer" style={{ border: `1px solid ${G.line}`, color: G.ink }}>{up || "내 사진 올리기"}<input type="file" accept="image/*" className="hidden" onChange={(e) => uploadImg(e.target.files?.[0])} /></label></div>
      <div className="grid grid-cols-3 gap-1 max-h-[240px] overflow-auto">{LIBRARY.filter(([k]) => !isVideoSrc(k)).map(([k, n]) => <button key={k} type="button" onClick={() => { onPick(k, n); setOpen(false); }} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${G.line2}` }}><img src={libUrl(k)} alt="" className="w-full h-14 object-cover" loading="lazy" /><span className="block text-[10px] px-1 truncate" style={{ color: G.sub }}>{n}</span></button>)}</div>
    </div>}</span>;
}
function Preview({ P, imgSrc }) {
  const [mode, setMode] = React.useState("site");
  const st = mode === "naver" ? NAVER_STYLE : SITE_STYLE;
  const html = md2html(P.body, st, imgSrc);
  return <div>
    <div className="flex gap-1 mb-2">{[["site", "홈페이지"], ["naver", "네이버 블로그"], ["phone", "휴대폰"]].map(([k, l]) => <button key={k} type="button" onClick={() => setMode(k)} className="h-8 px-3 rounded-lg text-[12px] font-black" style={mode === k ? GOLD_BTN : { border: `1px solid ${G.line2}`, color: G.sub }}>{l}</button>)}</div>
    <div className="rounded-xl overflow-auto mx-auto" style={{ background: "#fff", maxWidth: mode === "phone" ? 390 : "100%", maxHeight: "70vh", border: mode === "phone" ? "10px solid #111" : "none", borderRadius: mode === "phone" ? 32 : 12 }}>
      {mode !== "naver" && <div style={{ background: "#0F1A30", color: "#fff", padding: "12px 16px", fontWeight: 900, fontSize: 18 }}>Logis<span style={{ color: "#4F8BFF" }}>Web</span> <span style={{ fontSize: 12, fontWeight: 600, color: "#A9C0EC", marginLeft: 8 }}>블로그</span></div>}
      <div style={{ padding: mode === "phone" ? "20px 16px" : "28px 32px", fontFamily: mode === "naver" ? "'Nanum Gothic', sans-serif" : "Pretendard, 'Noto Sans KR', sans-serif", wordBreak: "keep-all" }}>
        <div style={{ color: "#5b6b88", fontSize: 13 }}>{P.date} · {(P.tags || []).slice(0, 3).map((t) => `#${t}`).join(" ")}</div>
        <h1 style={{ fontSize: mode === "phone" ? 24 : 30, lineHeight: 1.35, margin: "6px 0 24px", color: "#0F1A30", fontWeight: 800 }}>{P.title || "(제목)"}</h1>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
    <div className="text-[11.5px] mt-2" style={{ color: G.dim }}>글을 고치면 바로 바뀌어요. 카드 그림은 고친 뒤 1~2초 뒤에 바뀌어요.</div>
  </div>;
}
function CardsPanel({ P, update, cardUrls }) {
  const [k, setK] = React.useState(0); const cards = P.cards || []; const c = cards[k] || {};
  const setC = (patch) => update((x) => ({ ...x, cards: (x.cards || []).map((y, i) => (i === k ? { ...y, ...patch } : y)) }));
  return <div>
    <div className="flex gap-2 mb-3 overflow-x-auto">{cards.map((x, i) => <div key={i} className="text-center"><CardThumb c={x} size={120} active={i === k} onClick={() => setK(i)} /><div className="text-[11px] mt-1" style={{ color: G.dim }}>card-{i + 1}</div></div>)}
      {cards.length < 5 && <button type="button" onClick={() => { update((x) => ({ ...x, cards: [...(x.cards || []), { kind: "shot", cat: "실제 화면", title: "제목", img: "real-home.jpg", label: "LogisWeb" }] })); setK(cards.length); }} className="w-[120px] h-[120px] rounded-xl text-[13px] font-black shrink-0" style={{ border: `1px dashed ${G.gold}`, color: G.gold }}>＋ 카드</button>}</div>
    <div className="rounded-xl overflow-hidden mb-3 mx-auto" style={{ width: 360, height: 360 }}><div style={{ transform: "scale(0.3333)", transformOrigin: "0 0", width: 1080, height: 1080 }}><CardView c={c} /></div></div>
    <Field label="모양"><div className="grid grid-cols-4 gap-1">{CARD_KINDS.map(([kk, n]) => <button key={kk} type="button" onClick={() => setC({ kind: kk })} className="h-8 rounded-lg text-[12px] font-black" style={c.kind === kk ? GOLD_BTN : { border: `1px solid ${G.line2}`, color: G.ink }}>{n}</button>)}</div></Field>
    <Field label="꼬리표"><Text value={c.cat} onChange={(v) => setC({ cat: v })} /></Field>
    <Field label="제목" hint="**글자** 강조 · Enter 줄바꿈"><Text rows={3} value={c.title} onChange={(v) => setC({ title: v })} /></Field>
    {c.kind !== "points" && c.kind !== "vs" && <Field label="한 줄 설명"><Text value={c.sub} onChange={(v) => setC({ sub: v })} /></Field>}
    {(c.kind === "cover" || c.kind === "shot") && <>
      <Field label="화면 사진"><div className="grid grid-cols-4 gap-1 max-h-[180px] overflow-auto">{LIBRARY.filter(([x]) => !isVideoSrc(x)).map(([x, n]) => <button key={x} type="button" onClick={() => setC({ img: x })} className="rounded-md overflow-hidden" style={{ border: `2px solid ${c.img === x ? G.gold : "transparent"}` }} title={n}><img src={libUrl(x)} alt="" className="w-full h-12 object-cover" loading="lazy" /></button>)}</div></Field>
      <Field label="창 위 글자"><Text value={c.label} onChange={(v) => setC({ label: v })} /></Field>
      <Field label="사진에서 보여 줄 곳" hint="가로 % 세로 % — 예: 60% 30%"><Text value={c.crop} onChange={(v) => setC({ crop: v })} /></Field></>}
    {c.kind === "points" && <Field label="항목(한 줄에 하나 · 제목 | 설명)"><textarea rows={5} value={(c.points || []).map((p) => p.filter(Boolean).join(" | ")).join("\n")} onChange={(e) => setC({ points: e.target.value.split("\n").map((l) => l.split("|").map((x) => x.trim())) })} className="w-full rounded-lg px-3 py-2 text-[13px]" style={inp} /></Field>}
    {c.kind === "vs" && <div className="grid grid-cols-2 gap-2"><Field label="왼쪽(불편)"><textarea rows={5} value={(c.a || []).join("\n")} onChange={(e) => setC({ a: e.target.value.split("\n") })} className="w-full rounded-lg px-2 py-2 text-[12.5px]" style={inp} /></Field><Field label="오른쪽(로지스웹)"><textarea rows={5} value={(c.b || []).join("\n")} onChange={(e) => setC({ b: e.target.value.split("\n") })} className="w-full rounded-lg px-2 py-2 text-[12.5px]" style={inp} /></Field></div>}
    <div className="flex flex-wrap gap-1.5">{cardUrls[k + 1] && <a href={cardUrls[k + 1]} download={`card-${k + 1}.jpg`} className="h-8 px-3 text-[12px] rounded-xl font-black flex items-center" style={GOLD_BTN}>⬇ 이 카드 JPG</a>}
      {cards.length > 1 && <Btn small onClick={() => { update((x) => ({ ...x, cards: x.cards.filter((_, i) => i !== k) })); setK(0); }} style={{ color: G.bad }}>이 카드 빼기</Btn>}</div>
    <div className="text-[11.5px] mt-2" style={{ color: G.dim }}>카드는 1080×1080이라 네이버 · 인스타그램 · 카카오 채널에 그대로 올릴 수 있어요.</div>
  </div>;
}
function SeoPanel({ seo }) {
  return <div>
    <div className="flex items-center gap-3 mb-3"><div className="text-[34px] font-black" style={{ ...NUM, color: seo.score >= 80 ? G.ok : seo.score >= 60 ? G.warn : G.bad }}>{seo.score}</div><div className="text-[12.5px] leading-relaxed" style={{ color: G.sub }}>점 · 네이버 · 구글 검색에 잘 잡히는지 점검했어요.<br />80점 이상이면 좋아요.</div></div>
    <div className="space-y-1.5">{seo.items.map(([n, ok, note]) => <div key={n} className="flex gap-2 rounded-lg px-2.5 py-2" style={{ border: `1px solid ${ok ? "rgba(127,209,174,.3)" : "rgba(255,138,122,.35)"}` }}>
      <span className="text-[13px]" style={{ color: ok ? G.ok : G.bad }}>{ok ? "✓" : "✕"}</span><div><div className="text-[12.5px] font-black" style={{ color: G.ink }}>{n}</div>{note && <div className="text-[11.5px]" style={{ color: G.dim }}>{note}</div>}</div></div>)}</div>
  </div>;
}
function InfoPanel({ P, update, say }) {
  const [tb, setTb] = React.useState(false); const [titles, setTitles] = React.useState([]);
  const rec = async () => { setTb(true); try { const r = await mktCall("titles", { text: P.body, keywords: P.keywords }); setTitles(r.out.titles || []); } catch (e) { say(e.message); } finally { setTb(false); } };
  return <div>
    <Field label="검색 키워드(쉼표로 · 첫 번째가 가장 중요)" hint="네이버 검색창에 사람들이 칠 말"><Text value={P.keywords} onChange={(v) => update({ keywords: v })} /></Field>
    <div className="mb-3"><Btn small onClick={rec} disabled={tb}>{tb ? "추천 중…" : "✨ 제목 5개 추천받기"}</Btn>
      {titles.map((x) => <button key={x} type="button" onClick={() => update({ title: x })} className="block w-full text-left text-[12.5px] mt-1.5 rounded-lg px-2.5 py-1.5" style={{ border: `1px solid ${G.line2}`, color: G.ink }}>{x} <span style={{ color: G.dim }}>({x.length}자 · 누르면 바꿈)</span></button>)}</div>
    <Field label="한 줄 요약" hint="홈페이지 목록 · 검색 결과 설명에 나와요"><Text rows={2} value={P.summary} onChange={(v) => update({ summary: v })} /></Field>
    <Field label="태그(쉼표로)"><Text value={(P.tags || []).join(", ")} onChange={(v) => update({ tags: v.split(",").map((x) => x.trim()).filter(Boolean) })} /></Field>
    <Field label="홈페이지 주소(영문)" hint={`logisweb.co.kr/blog/${P.slug || "주소"}/ — 발행한 뒤에는 바꾸지 않는 게 좋아요`}><div className="flex gap-1.5"><Text value={P.slug} onChange={(v) => update({ slug: slugify(v) })} /><Btn small onClick={() => update({ slug: slugify(P.keywords.split(",")[0]) || `post-${P.date}` })}>자동</Btn></div></Field>
  </div>;
}
function NaverPanel({ P, update, say, makeCardImgs, cardUrls }) {
  const [busy, setBusy] = React.useState(""); const [naverId, setNaverId] = React.useState("");
  React.useEffect(() => onSnapshot(doc(db, "siteConfig/mktSettings"), (d) => setNaverId(String(d.data()?.naverBlogId || "").replace(/@.*$/, "")), () => {}), []);
  const tags = (P.tags || []).map((t) => "#" + t.replace(/\s/g, "")).join(" ");
  const copyHtml = async () => {
    setBusy("카드 그림을 올리고 복사하는 중…");
    try {
      const urls = await makeCardImgs(); const html = `<h2 style="font-size:28px;font-weight:700">${P.title}</h2>` + md2html(P.body, NAVER_STYLE, (s) => { const k = cardIdx(s); return k ? urls[k - 1] || "" : libUrl(s).startsWith("/") ? location.origin + libUrl(s) : libUrl(s); });
      const plain = `${P.title}\n\n${stripMd(P.body)}`;
      if (window.ClipboardItem) await navigator.clipboard.write([new window.ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([plain], { type: "text/plain" }) })]);
      else await navigator.clipboard.writeText(plain);
      say("복사했어요. 네이버 글쓰기 본문에 붙여 넣으세요(Ctrl+V).");
    } catch (e) { say(`복사 실패: ${e.message}`); } finally { setBusy(""); }
  };
  const zip = async () => {
    setBusy("카드 그림을 묶는 중…");
    try { const { default: JSZip } = await import("jszip"); const z = new JSZip(); for (const [k, u] of Object.entries(cardUrls)) z.file(`card-${k}.jpg`, await (await fetch(u)).blob()); const b = await z.generateAsync({ type: "blob" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `${P.slug || "blog"}-cards.zip`; a.click(); }
    catch (e) { say(e.message); } finally { setBusy(""); }
  };
  const step = (n, t, body) => <div className="flex gap-2.5 mb-3"><span className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-black shrink-0" style={GOLD_BTN}>{n}</span><div className="flex-1 min-w-0"><div className="text-[13px] font-black mb-1" style={{ color: G.ink }}>{t}</div>{body}</div></div>;
  return <div>
    <div className="text-[12px] mb-3 leading-relaxed" style={{ color: G.sub }}>네이버는 블로그 자동 글쓰기를 공식으로 열어 두지 않아서, 아래 순서로 붙여 넣으면 돼요(5분).</div>
    {step(1, "제목 복사", <Btn small onClick={() => { navigator.clipboard?.writeText(P.title); say("제목을 복사했어요."); }}>📋 제목 복사</Btn>)}
    {step(2, "본문 복사(글자 모양 · 그림 포함)", <Btn small gold onClick={copyHtml} disabled={!!busy}>{busy || "📋 본문 복사"}</Btn>)}
    {step(3, "네이버 글쓰기 열고 붙여넣기", <div className="flex flex-wrap gap-1.5"><a href={naverId ? `https://blog.naver.com/${naverId}/postwrite` : "https://blog.naver.com/GoBlogWrite.naver"} target="_blank" rel="noreferrer" className="h-8 px-3 text-[12px] rounded-xl font-black flex items-center" style={{ background: "#03C75A", color: "#fff" }}>N 네이버 글쓰기 열기</a><span className="text-[11.5px] self-center" style={{ color: G.dim }}>그림이 안 붙으면 ⬇ 카드 묶음으로 끌어다 놓기</span></div>)}
    {step(4, "그림 · 태그", <div className="flex flex-wrap gap-1.5"><Btn small onClick={zip} disabled={!Object.keys(cardUrls).length}>⬇ 카드 묶음(ZIP)</Btn><Btn small onClick={() => { navigator.clipboard?.writeText(tags); say("태그를 복사했어요."); }}>📋 태그 복사</Btn></div>)}
    {step(5, "발행하고 표시", <label className="flex items-center gap-2 text-[12.5px]" style={{ color: G.sub }}><input type="checkbox" checked={!!P.naverDone} onChange={(e) => update({ naverDone: e.target.checked, naverAt: e.target.checked ? Date.now() : null })} />네이버에 올렸어요</label>)}
    <Field label="네이버 글 주소(올린 뒤 · 선택)"><Text value={P.naverUrl} onChange={(v) => update({ naverUrl: v })} placeholder="https://blog.naver.com/…" /></Field>
    <div className="text-[11.5px] leading-relaxed" style={{ color: G.dim }}>팁: 월요일 오전 7~9시에 올리고, 글마다 우리 회사 이야기 한 줄을 손으로 더하면 네이버 검색 점수가 올라가요.</div>
  </div>;
}
function HistPanel({ P, update }) {
  const h = P.history || [];
  return <div>{!h.length ? <div className="text-[12.5px]" style={{ color: G.sub }}>고친 기록이 아직 없어요. 10분마다 하나씩 남아요(최근 15개).</div> : h.map((x) => (
    <div key={x.at} className="flex items-center gap-2 py-2 border-b" style={{ borderColor: G.line2 }}><span className="text-[12px]" style={{ ...NUM, color: G.dim }}>{new Date(x.at).toLocaleString("ko-KR")}</span><span className="flex-1 truncate text-[12.5px]" style={{ color: G.ink }}>{x.title}</span>
      <Btn small onClick={async () => { if (await kpConfirm("이 때 글로 되돌릴까요? (지금 글은 기록에 남아요)")) update((c) => ({ ...c, history: [{ at: Date.now(), title: c.title, body: c.body }, ...(c.history || [])].slice(0, 15), title: x.title, body: x.body })); }}>되돌리기</Btn></div>))}</div>;
}
