// ======================= src/adminCenter/GuideLibrary.jsx =======================
// 📚 2026-11-25 관리자센터 › 운영 › 사용법 보관함 — 업체에 보내는 사용법 이미지를 게시판처럼 모아 본다(사용자 요청)
//  · 분류(오더 · 배차 / 기사앱 / 전자결재 · 지급 / 계정 · 권한) · 검색 · 카드형 / 목록형
//  · 누르면 크게 보기 — [이미지 복사] · [내려받기] · [안내 글 복사](업체에 같이 보낼 글) · 이전 / 다음
//  · 자료는 src/guideLibrary.js 한 곳(이미지는 public/howto) — 서버에 쓰는 것은 없다
import React from "react";
import { createPortal } from "react-dom";
import { G, NUM, GOLD_BTN, AdmHero, AdmPanel, Seg } from "./admUi";
import { GUIDES, GUIDE_CATS, guideImage, guideThumb, guideCat, filterGuides } from "../guideLibrary";

const VIEW_KEY = "kpGuideLibView";
const isNew = (g) => { const t = Date.parse(`${g.date}T00:00:00+09:00`); return Number.isFinite(t) && Date.now() - t < 7 * 86400e3; };
const fileNameOf = (g) => `LogisWeb_사용법_${g.title.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim()}.png`;

async function copyImage(src) {
  const blob = await (await fetch(src)).blob();
  if (!navigator.clipboard || typeof window.ClipboardItem === "undefined") throw new Error("no-clipboard");
  await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
}
async function downloadImage(src, name) {
  const blob = await (await fetch(src)).blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function Chip({ children, gold = false }) {
  return <span className="inline-flex items-center h-[21px] px-2 rounded-[6px] text-[11.5px] font-black whitespace-nowrap" style={gold ? { ...GOLD_BTN } : { color: G.iceHi, background: "rgba(143,176,240,.10)", border: `1px solid ${G.line2}` }}>{children}</span>;
}

function Thumb({ g, height }) {
  const [bad, setBad] = React.useState(false);
  return (
    <span className="relative block overflow-hidden" style={{ height, background: "#EEF2F8" }}>
      {!bad && <img src={guideThumb(g)} alt="" loading="lazy" onError={() => setBad(true)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block" }} />}
      <span className="absolute inset-x-0 bottom-0 h-10" style={{ background: "linear-gradient(180deg, rgba(7,12,24,0), rgba(7,12,24,.55))" }} />
    </span>
  );
}

function Viewer({ list, index, onIndex, onClose }) {
  const g = list[index];
  const [note, setNote] = React.useState("");
  const say = (t) => { setNote(t); window.clearTimeout(say.t); say.t = window.setTimeout(() => setNote(""), 2600); };
  React.useEffect(() => {
    const k = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < list.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", k, true);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k, true); document.body.style.overflow = prev; };
  }, [index, list.length, onClose, onIndex]);
  if (!g) return null;
  const src = guideImage(g);
  const btn = { height: 40, padding: "0 14px", borderRadius: 12, fontSize: 13.5, fontWeight: 900, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", background: "rgba(255,255,255,.07)", color: G.ink, border: `1px solid ${G.goldLine}` };
  const nav = (on) => ({ ...btn, width: 40, padding: 0, justifyContent: "center", opacity: on ? 1 : 0.3, cursor: on ? "pointer" : "default" });
  return createPortal(
    <div data-kp="guide-viewer" style={{ position: "fixed", inset: 0, zIndex: 100060, background: "rgba(4,7,14,.9)", backdropFilter: "blur(4px)", display: "flex", flexDirection: "column", fontFamily: NUM.fontFamily }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 16px", borderBottom: `1px solid ${G.goldLine}`, background: "linear-gradient(180deg,#0E1A33,#070C18)" }}>
        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
          <div style={{ ...NUM, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.26em", color: G.gold }}>GUIDE · {guideCat(g.cat).en} · {index + 1} / {list.length}</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: "#fff", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.title}</div>
        </div>
        {note && <span style={{ fontSize: 13, fontWeight: 800, color: G.ok }}>{note}</span>}
        <button type="button" style={nav(index > 0)} disabled={index <= 0} onClick={() => onIndex(index - 1)} aria-label="이전 사용법">‹</button>
        <button type="button" style={nav(index < list.length - 1)} disabled={index >= list.length - 1} onClick={() => onIndex(index + 1)} aria-label="다음 사용법">›</button>
        {g.message && <button type="button" data-kp="guide-copy-text" style={btn} onClick={() => navigator.clipboard?.writeText(g.message).then(() => say("안내 글을 복사했어요"), () => say("복사하지 못했어요"))}>안내 글 복사</button>}
        <button type="button" data-kp="guide-copy-image" style={btn} onClick={() => copyImage(src).then(() => say("이미지를 복사했어요 · 메신저에 붙여 넣으세요"), () => say("이 브라우저는 이미지 복사가 안 돼요 · 내려받기를 눌러 주세요"))}>이미지 복사</button>
        <button type="button" data-kp="guide-download" style={{ ...btn, ...GOLD_BTN, border: "1px solid transparent" }} onClick={() => downloadImage(src, fileNameOf(g)).then(() => say("내려받았어요"), () => say("내려받지 못했어요"))}>내려받기</button>
        <button type="button" style={btn} onClick={onClose}>닫기 ✕</button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "18px 12px 40px" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {g.message && (
          <div style={{ maxWidth: 860, margin: "0 auto 14px", padding: "12px 16px", borderRadius: 14, border: `1px solid ${G.goldLine}`, background: "rgba(215,188,130,.06)" }}>
            <div style={{ ...NUM, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.22em", color: G.goldDim, marginBottom: 6 }}>MESSAGE · 업체에 같이 보낼 글</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.7, color: G.sub, whiteSpace: "pre-wrap" }}>{g.message}</div>
          </div>
        )}
        <img key={g.id} src={src} alt={g.title} style={{ display: "block", width: "100%", maxWidth: 860, margin: "0 auto", borderRadius: 16, boxShadow: "0 30px 80px rgba(0,0,0,.55)", background: "#EEF2F8" }} />
      </div>
    </div>,
    document.body,
  );
}

export default function GuideLibrary() {
  const [cat, setCat] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [view, setView] = React.useState(() => { try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "card"; } catch { return "card"; } });
  const [openIdx, setOpenIdx] = React.useState(-1);
  const setViewKeep = (v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* 무시 */ } };
  const list = React.useMemo(() => filterGuides(GUIDES, { cat, q }), [cat, q]);
  const countOf = (k) => filterGuides(GUIDES, { cat: k, q }).length;
  const latest = GUIDES.map((g) => g.date).sort().pop() || "";
  const close = React.useCallback(() => setOpenIdx(-1), []);

  return (
    <div data-kp="guide-library">
      <AdmHero en="OPERATIONS · GUIDE LIBRARY" title="사용법 보관함" desc="업체에 보내려고 만든 사용법 이미지를 모아 둔 곳이에요. 누르면 크게 보고, 이미지를 복사하거나 내려받아 바로 보낼 수 있어요."
        right={<div className="flex items-center gap-4 shrink-0">
          <div className="text-right"><div className="text-[10.5px] font-extrabold tracking-[0.2em]" style={{ ...NUM, color: G.goldDim }}>TOTAL</div><div className="text-[24px] font-black leading-none mt-1" style={{ ...NUM, color: G.goldHi }}>{GUIDES.length}<span className="text-[13px] ml-1" style={{ color: G.dim }}>건</span></div></div>
          <div className="text-right hidden sm:block"><div className="text-[10.5px] font-extrabold tracking-[0.2em]" style={{ ...NUM, color: G.goldDim }}>LATEST</div><div className="text-[15px] font-black leading-none mt-2" style={{ ...NUM, color: "#fff" }}>{latest}</div></div>
        </div>} />

      <AdmPanel bodyClass="p-3 sm:p-4" className="mb-3 sm:mb-4">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Seg value={cat} onChange={setCat} items={[["all", "전체", countOf("all")], ...GUIDE_CATS.map((c) => [c.key, c.label, countOf(c.key)])]} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="사용법 찾기 (예: 회전, 기사앱, 권한)" data-kp="guide-search"
            className="h-10 flex-1 min-w-[180px] px-3.5 rounded-xl text-[14px] font-semibold outline-none" />
          <Seg value={view} onChange={setViewKeep} items={[["card", "카드형"], ["list", "목록형"]]} />
        </div>
      </AdmPanel>

      {!list.length && <AdmPanel><div className="py-10 text-center text-[14.5px] font-semibold" style={{ color: G.dim }}>찾는 사용법이 없어요. 검색어를 줄이거나 분류를 [전체]로 바꿔 보세요.</div></AdmPanel>}

      {view === "card" && !!list.length && (
        <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))" }}>
          {list.map((g, i) => (
            <button key={g.id} type="button" data-kp="guide-card" onClick={() => setOpenIdx(i)}
              className="adm-kpi adm-in text-left rounded-[18px] overflow-hidden min-w-0 cursor-pointer flex flex-col">
              <span className="relative block">
                <Thumb g={g} height={158} />
                <span className="absolute left-2.5 top-2.5 flex gap-1.5">{isNew(g) && <Chip gold>NEW</Chip>}</span>
                <span className="absolute right-2.5 bottom-2 text-[11.5px] font-black" style={{ ...NUM, color: "#fff" }}>{g.device}</span>
              </span>
              <span className="block px-4 pt-3 pb-3.5 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-extrabold tracking-[0.2em] whitespace-nowrap" style={{ ...NUM, color: G.gold }}>{guideCat(g.cat).label}</span>
                  <span className="text-[11.5px] font-bold whitespace-nowrap" style={{ ...NUM, color: G.dim }}>{g.date}</span>
                </span>
                <span className="block text-[15.5px] font-black leading-snug mt-1.5" style={{ color: G.ink }}>{g.title}</span>
                <span className="block text-[12.5px] leading-relaxed mt-1.5" style={{ color: G.dim, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{g.desc}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {view === "list" && !!list.length && (
        <AdmPanel bodyClass="p-0">
          <div className="hidden sm:grid items-center gap-3 px-5 h-10 text-[11.5px] font-extrabold tracking-[0.14em]" style={{ gridTemplateColumns: "44px 120px 1fr 110px 96px 84px", color: G.goldDim, borderBottom: `1px solid ${G.line}`, ...NUM }}>
            <span>NO</span><span>분류</span><span>제목</span><span>기기</span><span>등록일</span><span />
          </div>
          {list.map((g, i) => (
            <button key={g.id} type="button" data-kp="guide-row" onClick={() => setOpenIdx(i)}
              className="adm-row w-full text-left grid items-center gap-3 px-4 sm:px-5 py-3 sm:grid-cols-[44px_120px_1fr_110px_96px_84px] grid-cols-[1fr_auto]" style={{ borderBottom: `1px solid rgba(215,188,130,.08)` }}>
              <span className="hidden sm:block text-[13px] font-black" style={{ ...NUM, color: G.dim }}>{String(list.length - i).padStart(2, "0")}</span>
              <span className="hidden sm:block"><Chip>{guideCat(g.cat).label}</Chip></span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 min-w-0"><span className="text-[14.5px] font-black truncate" style={{ color: G.ink }}>{g.title}</span>{isNew(g) && <Chip gold>NEW</Chip>}</span>
                <span className="block text-[12.5px] truncate mt-0.5" style={{ color: G.dim }}><span className="sm:hidden">{guideCat(g.cat).label} · {g.device} · </span>{g.desc}</span>
              </span>
              <span className="hidden sm:block text-[12.5px] font-bold" style={{ color: G.sub }}>{g.device}</span>
              <span className="hidden sm:block text-[12.5px] font-bold" style={{ ...NUM, color: G.dim }}>{g.date}</span>
              <span className="text-[12.5px] font-black whitespace-nowrap text-right" style={{ color: G.gold }}>크게 보기 ›</span>
            </button>
          ))}
        </AdmPanel>
      )}

      <div className="mt-3 text-[12.5px] leading-relaxed" style={{ color: G.dim }}>새 사용법 이미지를 만들면 여기에 함께 올려요. 크게 보기에서 ← → 키로 넘길 수 있어요.</div>

      {openIdx >= 0 && <Viewer list={list} index={Math.min(openIdx, list.length - 1)} onIndex={setOpenIdx} onClose={close} />}
    </div>
  );
}
