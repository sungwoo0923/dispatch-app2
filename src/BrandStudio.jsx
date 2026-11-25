// ======================= src/BrandStudio.jsx =======================
// 🎨 2026-11-15 관리자센터 › 운영 › 브랜드 디자인 — 로고를 올리고, 부분마다 색 · 테두리 · 굵기를 고치고,
//  로고가 들어가는 자리마다 바탕을 바꿔 보면서 미리 본 뒤 [적용하기]로 모든 화면에 반영한다.
//  그리기 = src/brandRender.js · 저장/반영 = src/brandConfig.js(siteConfig/brand · brandHistory)
import React from "react";
import { auth } from "./firebase";
import { kpConfirm, kpAlert } from "./kpDialog";
import { getBrandConfig, useBrand, saveBrand, resetBrand, listBrandHistory, MAX_BYTES } from "./brandConfig";
import {
  TONES, SPOTS, DEFAULT_TILE, sanitizeConfig, resolve, markSvg, wordSvg, iconSvg, spotBg, spotTone, toneBg,
  autoFitStyles, importFile, svgToPng, isHex, assetBytes,
  markBox,
} from "./brandRender";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const clone = (o) => JSON.parse(JSON.stringify(o || {}));
const Svg = ({ html, className = "", style }) => <span className={className} style={{ display: "inline-block", lineHeight: 0, ...style }} dangerouslySetInnerHTML={{ __html: html }} />;
const firstHex = (css, last = false) => { const m = String(css).match(/#[0-9A-Fa-f]{6}/g) || ["#0F1A30"]; return (last ? m[m.length - 1] : m[0]).toUpperCase(); };
const fmtAt = (t) => { if (!t) return ""; const d = new Date(t); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

// ── 작은 입력 부품 ──
function ColorField({ label, value, onChange, allowEmpty = false }) {
  const v = isHex(value) ? value : "";
  const [txt, setTxt] = React.useState(v);
  React.useEffect(() => setTxt(v), [v]);
  return (
    <label className="flex items-center gap-2 min-w-0">
      <span className="w-[62px] shrink-0 text-[12.5px] font-bold text-[#5B6B85]">{label}</span>
      <input type="color" value={v || "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="w-9 h-9 rounded-lg border border-[#DCE3EE] bg-white p-0.5 cursor-pointer shrink-0" aria-label={`${label} 색 고르기`} />
      <input value={txt} onChange={(e) => { const t = e.target.value.trim(); setTxt(t); if (isHex(t)) onChange(t.toUpperCase()); }}
        placeholder={allowEmpty ? "없음" : "#000000"} className="h-9 w-[92px] min-w-0 px-2 rounded-lg border border-[#DCE3EE] text-[12.5px] uppercase" style={{ fontFamily: MONO }} />
      {allowEmpty && v && <button type="button" onClick={() => onChange(null)} className="h-9 px-2 rounded-lg text-[12px] font-bold text-[#7A879C] hover:bg-[#F2F4F8]">빼기</button>}
    </label>
  );
}
function Slider({ label, value, min, max, step = 1, onChange, unit = "", hint }) {
  return (
    <label className="flex items-center gap-2 min-w-0" title={hint || ""}>
      <span className="w-[62px] shrink-0 text-[12.5px] font-bold text-[#5B6B85]">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 min-w-0 accent-[#2D4C82]" />
      <span className="w-[46px] text-right text-[12px] font-bold text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>{Number(value).toFixed(step < 1 ? 2 : 0)}{unit}</span>
    </label>
  );
}
function Seg({ value, options, onChange, size = "md" }) {
  return (
    <div role="radiogroup" className="inline-flex p-1 rounded-xl bg-[#EEF1F6] gap-1 flex-wrap">
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
          className={`${size === "sm" ? "h-8 px-2.5 text-[12.5px]" : "h-9 px-3.5 text-[13.5px]"} rounded-lg font-black whitespace-nowrap transition ${value === k ? "bg-white text-[#0F1A30] shadow-sm" : "text-[#7A879C] hover:text-[#0F1A30]"}`}>{l}</button>
      ))}
    </div>
  );
}
function Box({ step, title, desc, right, children }) {
  return (
    <section className="bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden min-w-0">
      <div className="px-4 sm:px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-[#0F1A30] text-white text-[12px] font-black flex items-center justify-center shrink-0">{step}</span><span className="text-[16px] font-black text-[#0F1A30]">{title}</span></div>
          {desc && <p className="mt-1 text-[13px] text-[#5B6B85] leading-relaxed">{desc}</p>}
        </div>
        {right}
      </div>
      <div className="px-4 sm:px-5 pb-5">{children}</div>
    </section>
  );
}
const btn = "h-10 px-4 rounded-xl text-[13.5px] font-black whitespace-nowrap transition disabled:opacity-40";
const btnGhost = `${btn} border border-[#DCE3EE] bg-white text-[#0F1A30] hover:bg-[#F5F8FD]`;
const btnDark = `${btn} bg-[#0F1A30] text-white hover:bg-[#1B2B4B]`;

// ── 자리별 가짜 화면(미리 보기) ──
function SpotMock({ spot, r, bgCss, tone }) {
  const mk = (px) => <Svg html={markSvg(r, tone, px)} />;
  const wd = (h) => <Svg html={wordSvg(r, tone, h)} />;
  const ink = tone === "light" ? "#0F1A30" : "#FFFFFF";
  const soft = tone === "light" ? "rgba(15,26,48,.08)" : "rgba(255,255,255,.1)";
  const sub = tone === "light" ? "rgba(15,26,48,.45)" : "rgba(207,214,228,.6)";
  const body = {
    splash: <div className="flex flex-col items-center gap-3 py-5 w-full">{mk(58)}{wd(13)}<span className="text-[8px] tracking-[0.3em] font-bold" style={{ color: sub }}>LOGISTICS DISPATCH NETWORK</span></div>,
    topnav: <div className="flex items-center gap-2 h-[52px] px-3 w-full"><span className="w-7 h-7 rounded-md shrink-0" style={{ background: soft }} />{mk(28)}<div className="flex flex-col gap-1">{wd(10)}<span className="text-[7px] tracking-[0.3em] font-bold" style={{ color: sub }}>DISPATCH</span></div><span className="ml-auto text-[11px] font-bold opacity-70" style={{ color: ink }}>한빛물류</span></div>,
    sidemenu: <div className="flex flex-col gap-2.5 p-3.5 w-full"><div className="flex items-center gap-2.5 pb-2.5" style={{ borderBottom: `1px solid ${soft}` }}>{mk(34)}<div className="flex flex-col gap-1">{wd(8)}<span className="text-[12px] font-black" style={{ color: ink }}>홍길동 · 배차팀</span></div></div>{["배차 현황", "정산관리"].map((t) => <span key={t} className="text-[11.5px] font-bold opacity-75" style={{ color: ink }}>{t}</span>)}</div>,
    admin: <div className="flex items-center gap-2.5 h-[56px] px-3.5 w-full">{mk(32)}<div className="flex flex-col gap-1.5">{wd(10)}<span className="text-[7.5px] tracking-[0.3em] font-black" style={{ color: "#8FB0F0" }}>PLATFORM ADMIN</span></div></div>,
    loginPanel: <div className="flex flex-col gap-4 p-4 w-full"><div className="flex items-center gap-2.5">{mk(36)}<div className="flex flex-col gap-1">{wd(12)}<span className="text-[7px] tracking-[0.25em] font-bold" style={{ color: sub }}>LOGISTICS DISPATCH NETWORK</span></div></div><span className="text-[15px] font-black leading-tight" style={{ color: ink }}>배차의 모든 순간을<br />하나의 흐름으로.</span></div>,
    loginForm: <div className="flex flex-col items-center gap-2 pt-4 pb-3 w-full">{mk(42)}{wd(12)}<div className="mt-2 w-[78%] rounded-xl bg-white shadow-sm p-2.5 flex flex-col gap-1.5"><span className="h-2 w-16 rounded bg-[#E3E8F0]" /><span className="h-6 rounded-lg bg-[#F2F4F8]" /><span className="h-6 rounded-lg bg-[#0F1A30]" /></div></div>,
    mobileMenu: <div className="flex flex-col gap-3 p-3.5 w-full"><div className="flex items-center gap-2.5">{mk(30)}<div className="flex flex-col gap-1">{wd(10)}<span className="text-[7px] tracking-[0.3em] font-bold" style={{ color: sub }}>DISPATCH</span></div></div>{["배차 등록", "배차 목록"].map((t) => <span key={t} className="h-7 rounded-lg px-2 flex items-center text-[11.5px] font-bold" style={{ background: soft, color: ink }}>{t}</span>)}</div>,
    mobileMenuDark: <div className="flex flex-col gap-3 p-3.5 w-full"><div className="flex items-center gap-2.5">{mk(32)}<div className="flex flex-col gap-1.5"><span className="text-[7px] tracking-[0.3em] font-black" style={{ color: "#8FB0F0" }}>DISPATCH · CONSOLE</span>{wd(10)}</div></div>{["배차 등록", "배차 목록"].map((t) => <span key={t} className="h-7 rounded-lg px-2 flex items-center text-[11.5px] font-bold" style={{ background: soft, color: ink }}>{t}</span>)}</div>,
  }[spot.id];
  return <div className="rounded-xl overflow-hidden border border-black/5 min-h-[112px] flex items-center" style={{ background: bgCss }}>{body}</div>;
}

// ── 앱 아이콘 미리 보기 ──
function PhoneIcons({ r, dark }) {
  const fg = dark ? "#E7ECF6" : "#14213D";
  const dummy = ["#34C759", "#FF9500", "#007AFF", "#FF3B30", "#5856D6", "#FFCC00", "#AF52DE"];
  return (
    <div className="rounded-[26px] p-4 border-[5px] border-[#0A0F1A] min-w-0" style={{ background: dark ? "linear-gradient(180deg,#1C2233,#0A0D14)" : "linear-gradient(180deg,#DCE6F5,#F4F1EC)" }}>
      <div className="text-[11px] font-black mb-3" style={{ color: fg }}>9:41</div>
      <div className="grid grid-cols-4 gap-x-2 gap-y-3">
        <div className="flex flex-col items-center gap-1"><Svg html={iconSvg(r, 46, { round: 0.22 })} /><span className="text-[9.5px] font-semibold" style={{ color: fg }}>LogisWeb</span></div>
        {["메시지", "지도", "캘린더", "사진", "설정", "메모", "카메라"].map((n, i) => <div key={n} className="flex flex-col items-center gap-1"><span className="w-[46px] h-[46px] rounded-[11px]" style={{ background: dummy[i] }} /><span className="text-[9.5px] font-semibold" style={{ color: fg }}>{n}</span></div>)}
      </div>
    </div>
  );
}

export default function BrandStudio() {
  const live = useBrand();
  const [draft, setDraft] = React.useState(() => clone(getBrandConfig() || {}));
  const [base, setBase] = React.useState(() => JSON.stringify(sanitizeConfig(getBrandConfig() || {})));
  const [assetKey, setAssetKey] = React.useState("mark"); // mark | word
  const [tone, setTone] = React.useState("dark");
  const [open, setOpen] = React.useState(null); // 펼친 부분 id
  const [hover, setHover] = React.useState(null);
  const [nParts, setNParts] = React.useState(4);
  const [busy, setBusy] = React.useState("");
  const [hist, setHist] = React.useState(null);
  const fileRef = React.useRef(null);

  const clean = React.useMemo(() => sanitizeConfig(draft), [draft]);
  const r = React.useMemo(() => resolve(clean), [clean]);
  const dirty = JSON.stringify(clean) !== base;
  const asset = assetKey === "mark" ? r.mark : r.word;
  const styles = r.st[assetKey][tone];
  const isCustom = !!draft[assetKey];
  const bytes = assetBytes(draft.mark) + assetBytes(draft.word);

  // 저장된 설정이 바뀌면(다른 관리자 · 되돌리기) 고치는 중이 아닐 때만 따라간다
  React.useEffect(() => {
    const now = JSON.stringify(sanitizeConfig(getBrandConfig() || {}));
    if (now !== base && !dirty) { setDraft(clone(getBrandConfig() || {})); setBase(now); }
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (fn) => setDraft((d) => { const n = clone(d); fn(n); return n; });
  const setPart = (pid, k, v) => edit((d) => {
    d.st = d.st || {}; d.st[assetKey] = d.st[assetKey] || {}; d.st[assetKey][tone] = d.st[assetKey][tone] || {};
    const cur = { ...(r.st[assetKey][tone][pid] || {}), ...(d.st[assetKey][tone][pid] || {}) };
    if (v === undefined) delete cur[k]; else if (v === null) { if (k === "c2" || k === "st") cur[k] = "none"; else delete cur[k]; } else cur[k] = v;
    d.st[assetKey][tone][pid] = cur;
  });
  const setTile = (k, v) => edit((d) => { d.tile = { ...DEFAULT_TILE, ...(d.tile || {}), [k]: v }; });
  const setSpot = (id, fn) => edit((d) => { d.spots = d.spots || {}; const s = { ...(d.spots[id] || {}) }; fn(s); if (!s.bg && !s.tone) delete d.spots[id]; else d.spots[id] = s; });

  // 그림 올리기 → 부분 나누기 → 바탕마다 색 자동 맞춤
  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    if (f.size > 8 * 1024 * 1024) { kpAlert("그림은 8MB 이하로 올려 주세요."); return; }
    setBusy("그림을 나누는 중…");
    try {
      const { asset: a, styles: st } = await importFile(f, { parts: nParts });
      if (assetBytes(a) + (assetKey === "mark" ? assetBytes(draft.word) : assetBytes(draft.mark)) > MAX_BYTES) throw new Error("그림이 너무 복잡해요. 부분 수를 줄이거나 더 단순한 그림을 올려 주세요.");
      const tile = { ...DEFAULT_TILE, ...(draft.tile || {}) };
      edit((d) => {
        d[assetKey] = a;
        d.st = d.st || {};
        d.st[assetKey] = { dark: autoFitStyles(st, toneBg("dark")), light: autoFitStyles(st, toneBg("light")), icon: autoFitStyles(st, tile.c1) };
      });
      setOpen(null); setHover(null);
    } catch (err) { kpAlert(err?.message || "그림을 읽지 못했어요."); }
    finally { setBusy(""); }
  };
  const resetAsset = async () => {
    if (!(await kpConfirm(`${assetKey === "mark" ? "LW 마크" : "글자 로고"}를 처음 그림으로 돌릴까요?\n이 그림에 고친 색도 같이 지워져요.`))) return;
    edit((d) => { delete d[assetKey]; if (d.st) delete d.st[assetKey]; });
  };
  const autoFit = () => {
    edit((d) => {
      d.st = d.st || {};
      for (const k of ["mark", "word"]) {
        d.st[k] = d.st[k] || {};
        const target = tone === "icon" ? (r.tile.c1) : toneBg(tone);
        d.st[k][tone] = autoFitStyles(r.st[k].dark, target);
      }
    });
  };

  const apply = async () => {
    if (!(await kpConfirm("모든 회사 화면에 이 로고 · 바탕을 적용할까요?\n바꾸기 전 설정은 [되돌리기]에 남아요."))) return;
    setBusy("적용하는 중…");
    try { await saveBrand(draft, auth.currentUser?.email || ""); setBase(JSON.stringify(sanitizeConfig(draft))); kpAlert("적용했어요. 다른 사람 화면에도 곧 바뀌어요."); }
    catch (e) { kpAlert("적용하지 못했어요: " + (e?.message || e)); }
    finally { setBusy(""); }
  };
  const resetAll = async () => {
    if (!(await kpConfirm("처음 로고(관리자센터에서 고치기 전)로 모든 화면을 돌릴까요?\n지금 설정은 [되돌리기]에 남아요."))) return;
    setBusy("되돌리는 중…");
    try { await resetBrand(auth.currentUser?.email || ""); setDraft({}); setBase(JSON.stringify(sanitizeConfig({}))); }
    catch (e) { kpAlert("되돌리지 못했어요: " + (e?.message || e)); }
    finally { setBusy(""); }
  };
  const openHist = async () => { setHist([]); try { setHist(await listBrandHistory()); } catch (e) { setHist(null); kpAlert("기록을 불러오지 못했어요: " + (e?.message || e)); } };
  const download = async (name, svg, px, ph = px) => {
    try { const url = await svgToPng(svg, Math.round(px), Math.round(ph)); const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
    catch { kpAlert("그림 파일을 만들지 못했어요."); }
  };

  // 크게 보는 판(선택한 부분 외에는 흐리게)
  const focusStyles = (k) => {
    const st = r.st[k][tone];
    if (!hover || k !== assetKey || !st[hover]) return st;
    const o = {}; for (const [id, s] of Object.entries(st)) o[id] = id === hover ? s : { ...s, op: (s.op ?? 1) * 0.18 };
    return o;
  };
  const rFocus = { ...r, st: { mark: { ...r.st.mark, [tone]: focusStyles("mark") }, word: { ...r.st.word, [tone]: focusStyles("word") } } };
  const stageBg = tone === "icon" ? null : tone === "light" ? "#F2F4F8" : "linear-gradient(120deg,#0F1A30 0%,#16243F 45%,#1F3560 100%)";

  const partLabel = (p) => ({ art: "완성 그림 · 색 고정", path: "도형", line: "선", dot: "점", svg: "도형 묶음", mask: "그림" }[p.type] || "");

  return (
    <div className="flex flex-col gap-4 pb-24">
      {/* 상단 — 상태 · 적용 */}
      <div className="sticky top-[72px] z-30 bg-white/95 backdrop-blur rounded-[16px] border border-[#E3E8F0] shadow-[0_8px_24px_rgba(15,26,48,0.08)] px-4 py-3 flex flex-wrap items-center gap-2.5">
        <span className={`h-7 px-2.5 rounded-full text-[12.5px] font-black flex items-center ${dirty ? "bg-[#FFF4E5] text-[#B54708]" : "bg-[#ECFDF3] text-[#067647]"}`}>{dirty ? "적용 안 한 변경이 있어요" : live ? "지금 화면과 같아요" : "처음 로고를 쓰는 중"}</span>
        {getBrandConfig()?.at && <span className="text-[12px] text-[#7A879C]">마지막 적용 {fmtAt(getBrandConfig().at)}{getBrandConfig().by ? ` · ${getBrandConfig().by}` : ""}</span>}
        {busy && <span className="text-[12.5px] font-bold text-[#2D4C82]">{busy}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={openHist}>되돌리기</button>
          <button type="button" className={btnGhost} onClick={() => { setDraft(clone(getBrandConfig() || {})); }} disabled={!dirty}>고친 것 취소</button>
          <button type="button" className={btnGhost} onClick={resetAll} disabled={!live}>처음 로고로</button>
          <button type="button" className={btnDark} onClick={apply} disabled={!dirty || !!busy}>적용하기</button>
        </div>
      </div>

      <div className="rounded-[16px] bg-[#EEF3FC] border border-[#C9D6EE] px-4 py-3 text-[13.5px] text-[#1B2B4B] leading-relaxed">
        <b>이렇게 쓰면 돼요</b> · ① 로고 그림을 올리면 색깔별로 부분이 나뉘고, 어두운 · 밝은 바탕에 맞는 색이 자동으로 정해져요. ② 부분을 눌러 색 · 테두리 · 굵기를 고쳐요. ③ 오른쪽에서 로고가 들어가는 자리마다 바탕을 바꿔 보며 확인해요. ④ <b>[적용하기]</b>를 누르면 모든 회사 화면에 바뀌어요.
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-4 items-start">
        {/* ── 왼쪽: 고치기 ── */}
        <div className="flex flex-col gap-4 min-w-0">
          <Box step="1" title="로고 그림" desc="SVG 를 올리면 도형 그대로, PNG · JPG 를 올리면 바탕을 지우고 비슷한 색끼리 나눠요."
            right={<Seg size="sm" value={assetKey} onChange={(k) => { setAssetKey(k); setOpen(null); }} options={[["mark", "LW 마크"], ["word", "글자 로고"]]} />}>
            <div className="rounded-xl p-4 flex items-center justify-center min-h-[120px]" style={{ background: tone === "light" ? "#F2F4F8" : "#0F1A30" }}>
              <Svg html={assetKey === "mark" ? markSvg(r, tone === "icon" ? "dark" : tone, 104) : wordSvg(r, tone === "icon" ? "dark" : tone, 30)} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp,.svg" className="hidden" onChange={onFile} />
              <button type="button" className={btnDark} onClick={() => fileRef.current?.click()} disabled={!!busy}>새 그림 올리기</button>
              <button type="button" className={btnGhost} onClick={resetAsset} disabled={!isCustom}>처음 그림으로</button>
            </div>
            <div className="mt-3"><Slider label="부분 수" value={nParts} min={2} max={8} onChange={setNParts} hint="PNG · JPG 를 올릴 때 몇 가지 색으로 나눌지" /></div>
            <p className="mt-1 text-[12px] text-[#7A879C]">PNG · JPG 는 올리기 전에 부분 수를 정해요. 그림 용량 {Math.round(bytes / 1024)}KB / {Math.round(MAX_BYTES / 1024)}KB</p>
          </Box>

          <Box step="2" title="어느 바탕용 색을 고칠까요?" desc="같은 로고라도 바탕마다 잘 보이는 색이 달라요. 한 벌씩 따로 고쳐요.">
            <Seg value={tone} onChange={setTone} options={TONES} />
            {tone !== "dark" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" className={btnGhost} onClick={autoFit}>어두운 바탕 색으로 자동 맞추기</button>
                <span className="text-[12px] text-[#7A879C]">너무 비슷한 색은 밝기를 뒤집어 잘 보이게 해요.</span>
              </div>
            )}
          </Box>

          <Box step="3" title="부분 꾸미기" desc="부분 위에 마우스를 올리면 오른쪽 큰 그림에서 그 부분만 진하게 보여요.">
            <div className="flex flex-col gap-2">
              {asset.parts.map((p) => {
                const s = styles[p.id] || {};
                const isOpen = open === p.id;
                return (
                  <div key={p.id} className={`rounded-xl border ${isOpen ? "border-[#2D4C82]" : "border-[#E3E8F0]"} overflow-hidden`} onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)}>
                    <button type="button" onClick={() => setOpen(isOpen ? null : p.id)} className="w-full flex items-center gap-2.5 px-3 h-12 text-left hover:bg-[#F7F9FC]">
                      <span className="w-6 h-6 rounded-md border border-black/10 shrink-0" style={{ background: p.type === "art" ? (s.pal === "dark" ? "linear-gradient(135deg,#FFFFFF,#5F7DBE)" : "linear-gradient(135deg,#6A88C4,#0A1A3C)") : isHex(s.c2) ? `linear-gradient(135deg,${s.c1},${s.c2})` : s.c1 || "#ccc" }} />
                      <span className={`text-[14px] font-black ${s.hide ? "text-[#AAB4C5] line-through" : "text-[#0F1A30]"}`}>{p.name}</span>
                      <span className="text-[11.5px] text-[#94A3B8]">{partLabel(p)}</span>
                      <span className="ml-auto text-[#94A3B8] text-[12px]">{isOpen ? "접기" : "고치기"}</span>
                    </button>
                    {isOpen && p.type === "art" && (
                      <div className="px-3 pb-3 pt-1 flex flex-col gap-2.5 border-t border-[#EEF1F6]">
                        <p className="text-[12.5px] text-[#5B6B85] leading-relaxed">새 LW 로고는 정해진 색 그대로 써요. 밝은 바탕엔 원래 색, 어두운 바탕 · 앱 아이콘엔 같은 모양을 밝게 바꾼 로고가 나와요. 다른 그림으로 바꾸려면 1번에서 그림을 올리면 돼요.</p>
                        <label className="flex items-center gap-2 text-[13px] font-bold text-[#0F1A30]"><input type="checkbox" checked={!s.hide} onChange={(e) => setPart(p.id, "hide", !e.target.checked)} className="w-4 h-4 accent-[#2D4C82]" />이 부분 보이기</label>
                        <Slider label="투명도" value={s.op ?? 1} min={0.1} max={1} step={0.05} onChange={(v) => setPart(p.id, "op", v >= 1 ? null : v)} />
                      </div>
                    )}
                    {isOpen && p.type !== "art" && (
                      <div className="px-3 pb-3 pt-1 flex flex-col gap-2.5 border-t border-[#EEF1F6]">
                        <label className="flex items-center gap-2 text-[13px] font-bold text-[#0F1A30]"><input type="checkbox" checked={!s.hide} onChange={(e) => setPart(p.id, "hide", !e.target.checked)} className="w-4 h-4 accent-[#2D4C82]" />이 부분 보이기</label>
                        <ColorField label={p.type === "line" ? "선 색" : "색"} value={s.c1} onChange={(v) => setPart(p.id, "c1", v)} />
                        {p.type !== "line" && <ColorField label="그러데이션" value={s.c2} onChange={(v) => setPart(p.id, "c2", v)} allowEmpty />}
                        {p.type !== "line" && isHex(s.c2) && <Slider label="방향" value={s.ang ?? 45} min={0} max={360} onChange={(v) => setPart(p.id, "ang", v)} unit="°" />}
                        {p.type === "line" ? (
                          <>
                            <Slider label="선 두께" value={s.sw ?? 6} min={1} max={40} onChange={(v) => setPart(p.id, "sw", v)} />
                            <label className="flex items-center gap-2 text-[13px] font-bold text-[#0F1A30]"><input type="checkbox" checked={!!s.fade} onChange={(e) => setPart(p.id, "fade", e.target.checked)} className="w-4 h-4 accent-[#2D4C82]" />시작 쪽을 흐리게</label>
                          </>
                        ) : (
                          <>
                            <ColorField label="테두리" value={s.st} onChange={(v) => { setPart(p.id, "st", v); if (v && !s.sw) setPart(p.id, "sw", 4); }} allowEmpty />
                            {isHex(s.st) && <Slider label="테두리 두께" value={s.sw ?? 0} min={0} max={30} step={0.5} onChange={(v) => setPart(p.id, "sw", v)} />}
                          </>
                        )}
                        <Slider label="굵기" value={s.grow ?? 0} min={-20} max={20} step={0.5} onChange={(v) => setPart(p.id, "grow", v || null)} hint="+ 는 두껍게, - 는 얇게" />
                        {p.type === "dot" && <Slider label="크기" value={s.size ?? 1} min={0.3} max={3} step={0.05} onChange={(v) => setPart(p.id, "size", v)} unit="×" />}
                        {p.type === "dot" && <label className="flex items-center gap-2 text-[13px] font-bold text-[#0F1A30]"><input type="checkbox" checked={!!s.glow} onChange={(e) => setPart(p.id, "glow", e.target.checked)} className="w-4 h-4 accent-[#2D4C82]" />빛 번짐</label>}
                        <Slider label="투명도" value={s.op ?? 1} min={0.1} max={1} step={0.05} onChange={(v) => setPart(p.id, "op", v >= 1 ? null : v)} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Box>

          <Box step="4" title="앱 아이콘 바탕" desc="휴대폰 홈 화면 · 브라우저 탭에 보이는 네모 바탕이에요. 로고 색은 2번에서 [앱 아이콘]을 골라 고쳐요.">
            <div className="flex flex-col gap-2.5">
              <ColorField label="위쪽 색" value={r.tile.c1} onChange={(v) => setTile("c1", v)} />
              <ColorField label="아래쪽 색" value={r.tile.c2} onChange={(v) => setTile("c2", v)} />
              <Slider label="방향" value={r.tile.ang} min={0} max={360} onChange={(v) => setTile("ang", v)} unit="°" />
              <ColorField label="빛 색" value={r.tile.glow} onChange={(v) => setTile("glow", v)} />
              <Slider label="빛 세기" value={r.tile.gop} min={0} max={1} step={0.01} onChange={(v) => setTile("gop", v)} />
              <Slider label="마크 크기" value={r.tile.scale} min={0.5} max={1.2} step={0.01} onChange={(v) => setTile("scale", v)} unit="×" />
            </div>
          </Box>
        </div>

        {/* ── 오른쪽: 미리 보기 ── */}
        <div className="flex flex-col gap-4 min-w-0">
          <section className="bg-white rounded-[18px] border border-[#E3E8F0] p-4 sm:p-5 min-w-0">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <span className="text-[16px] font-black text-[#0F1A30]">크게 보기 · {TONES.find((t) => t[0] === tone)[1]}</span>
              <span className="text-[12px] text-[#7A879C]">고치는 대로 바로 바뀌어요</span>
            </div>
            <div className="rounded-2xl min-h-[260px] flex items-center justify-center gap-6 flex-wrap p-6" style={{ background: stageBg || "repeating-conic-gradient(#E9EDF3 0% 25%, #F7F9FC 0% 50%) 0 0/24px 24px" }}>
              {tone === "icon"
                ? <Svg html={iconSvg(rFocus, 220, { round: 0.22 })} />
                : <><Svg html={markSvg(rFocus, tone, 200)} /><div className="flex flex-col gap-2"><Svg html={wordSvg(rFocus, tone, 34)} /><span className="text-[11px] font-bold tracking-[0.32em]" style={{ color: tone === "light" ? "rgba(20,33,61,.5)" : "rgba(207,214,228,.6)" }}>LOGISTICS DISPATCH NETWORK</span></div></>}
            </div>
          </section>

          <section className="bg-white rounded-[18px] border border-[#E3E8F0] p-4 sm:p-5 min-w-0">
            <div className="mb-3"><div className="text-[16px] font-black text-[#0F1A30]">자리별 미리 보기</div><p className="text-[13px] text-[#5B6B85] mt-0.5">바탕이 어두우면 어두운 바탕용, 밝으면 밝은 바탕용 로고가 저절로 들어가요. 바탕을 바꾸면 실제 화면 바탕도 같이 바뀌어요.</p></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {SPOTS.map((sp) => {
                const b = spotBg(r, sp.id); const t = spotTone(r, sp.id); const ov = r.spots?.[sp.id] || {};
                return (
                  <div key={sp.id} className="rounded-2xl border border-[#E3E8F0] p-3 flex flex-col gap-2.5 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap"><span className="text-[14px] font-black text-[#0F1A30]">{sp.name}</span><span className="text-[11.5px] text-[#94A3B8]">{sp.where}</span></div>
                    <SpotMock spot={sp} r={r} bgCss={b.css} tone={t} />
                    <div className="flex flex-wrap items-center gap-2">
                      <Seg size="sm" value={ov.tone || "auto"} onChange={(v) => setSpot(sp.id, (s) => { if (v === "auto") delete s.tone; else s.tone = v; })} options={[["auto", "로고 자동"], ["dark", "어두운용"], ["light", "밝은용"]]} />
                      <label className="ml-auto flex items-center gap-1.5 text-[12.5px] font-bold text-[#0F1A30]"><input type="checkbox" checked={!!ov.bg} className="w-4 h-4 accent-[#2D4C82]"
                        onChange={(e) => setSpot(sp.id, (s) => { if (e.target.checked) s.bg = { c1: firstHex(sp.css), c2: firstHex(sp.css, true), ang: 135 }; else delete s.bg; })} />바탕 바꾸기</label>
                    </div>
                    {ov.bg && (
                      <div className="flex flex-col gap-2 rounded-xl bg-[#F7F9FC] p-2.5">
                        <ColorField label="색 1" value={ov.bg.c1} onChange={(v) => setSpot(sp.id, (s) => { s.bg = { ...s.bg, c1: v }; })} />
                        <ColorField label="색 2" value={ov.bg.c2} onChange={(v) => setSpot(sp.id, (s) => { s.bg = { ...s.bg }; if (v) s.bg.c2 = v; else delete s.bg.c2; })} allowEmpty />
                        {ov.bg.c2 && <Slider label="방향" value={ov.bg.ang ?? 135} min={0} max={360} onChange={(v) => setSpot(sp.id, (s) => { s.bg = { ...s.bg, ang: v }; })} unit="°" />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="bg-white rounded-[18px] border border-[#E3E8F0] p-4 sm:p-5 min-w-0">
            <div className="mb-3"><div className="text-[16px] font-black text-[#0F1A30]">앱 아이콘</div><p className="text-[13px] text-[#5B6B85] mt-0.5">브라우저 탭 아이콘 · 아이폰 홈 화면 아이콘은 [적용하기] 하면 바로 바뀌어요. 안드로이드 설치 아이콘 · 기사 앱(APK)은 아래 파일을 개발 담당에게 전달해 배포 때 바꿔요.</p></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <PhoneIcons r={r} />
              <PhoneIcons r={r} dark />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3"><Svg html={iconSvg(r, 56, { round: 0.5, scale: 0.86 })} /><Svg html={iconSvg(r, 56, { round: 0.22 })} /><Svg html={iconSvg(r, 32, { round: 0.22 })} /><Svg html={iconSvg(r, 16, { round: 0.22 })} /></div>
              <div className="ml-auto flex flex-wrap gap-2">
                <button type="button" className={btnGhost} onClick={() => download("logisweb-icon-512.png", iconSvg(r, 512), 512)}>아이콘 512</button>
                <button type="button" className={btnGhost} onClick={() => download("logisweb-icon-maskable-512.png", iconSvg(r, 512, { scale: 0.74 }), 512)}>안드로이드용 512</button>
                <button type="button" className={btnGhost} onClick={() => { const b = markBox(r.mark, 1024); download("logisweb-mark-dark.png", markSvg(r, "dark", 1024), b.w, b.h); }}>마크(어두운 바탕용)</button>
                <button type="button" className={btnGhost} onClick={() => { const b = markBox(r.mark, 1024); download("logisweb-mark-light.png", markSvg(r, "light", 1024), b.w, b.h); }}>마크(밝은 바탕용)</button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {hist !== null && (
        <div className="fixed inset-0 z-[9995] bg-[#0F1A30]/40 flex items-center justify-center p-4" onClick={() => setHist(null)}>
          <div className="w-full max-w-[520px] max-h-[80vh] overflow-auto bg-white rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><span className="text-[17px] font-black text-[#0F1A30]">되돌리기</span><button type="button" className="text-[13px] font-bold text-[#7A879C]" onClick={() => setHist(null)}>닫기</button></div>
            <p className="text-[13px] text-[#5B6B85] mb-3">고르면 편집 화면에 불러와요. 확인한 뒤 [적용하기]를 눌러야 실제 화면이 바뀌어요.</p>
            {!hist.length ? <div className="text-[13.5px] text-[#94A3B8] py-6 text-center">아직 기록이 없어요.</div> : hist.map((h) => {
              const hr = resolve(sanitizeConfig(h.cfg));
              return (
                <div key={h.id} className="flex items-center gap-3 py-2.5 border-t border-[#EEF1F6]">
                  <span className="rounded-lg p-1.5" style={{ background: "#0F1A30" }}><Svg html={markSvg(hr, "dark", 36)} /></span>
                  <div className="min-w-0 flex-1"><div className="text-[13.5px] font-black text-[#0F1A30]">{fmtAt(h.at)}</div><div className="text-[12px] text-[#7A879C] truncate">{h.note}{h.by ? ` · ${h.by}` : ""}</div></div>
                  <button type="button" className={btnGhost} onClick={() => { setDraft(clone(h.cfg)); setHist(null); }}>불러오기</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
