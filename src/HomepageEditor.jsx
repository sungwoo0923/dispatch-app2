// ======================= src/HomepageEditor.jsx =======================
// 🌐 2026-11-03 관리자센터 › 운영 › 홈페이지 — 소개 홈페이지(landing-site) 전체 편집기 (최고관리자 전용)
//  · 가운데: 실제 홈페이지를 편집 모드(?kpedit=1)로 띄운다. 누르면 고르기 · 두 번 누르면 글 수정 ·
//    끌어서 옮기기 · 모서리를 끌어 크기 조절 · 사진 위에 파일을 끌어다 놓으면 교체.
//  · 왼쪽: 고른 요소 속성(글자·색·크기·위치·여백·링크·사진·아이콘) / 페이지(제목·색·글꼴·CSS·찾아 바꾸기) /
//    섹션(순서·숨김·복제·추가) / 상단 메뉴 · 하단 링크 / 신청서(질문·안내 글자·필수·선택 항목·질문 추가) / 사진 / 요소 추가 / 이력.
//  · 저장: 바꿀 때마다 임시 저장(siteConfig/homepageDraft) → [게시하기]를 눌러야 방문자 화면에 반영(siteConfig/landing.homepage).
//    게시할 때마다 이전 버전을 siteConfig/homepageHistory에 남겨 되돌릴 수 있다.
//  · 홈페이지 쪽 엔진: landing-site/kp-site.js (편집 내용 구조 설명도 그 파일 위에 있음)
import React from "react";
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "./firebase";
import { kpConfirm } from "./kpDialog";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const LOCAL = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const DEFAULT_URL = LOCAL ? "http://127.0.0.1:5500/" : "https://dispatch-app2-vskk.vercel.app/";
const EMPTY = { v: 1, page: {}, ops: [], els: {} };
const DEVICES = [["pc", "PC", 1440], ["tablet", "태블릿", 820], ["mobile", "모바일", 390]];
const ANCHORS = [["#flow", "업무 흐름"], ["#control", "실시간 관제"], ["#dispatch", "배차"], ["#erp", "정산 · ERP"], ["#approval", "전자결재"], ["#mobile", "모바일 · 기사앱"], ["#groupware", "그룹웨어·보안"], ["#download", "다운로드"], ["#steps", "도입 절차"], ["#inquiry-form", "무료 체험 신청"], ["login.html", "로그인 안내 페이지"]];
const FONTS = [["", "기본(Pretendard)"], ["system-ui", "기기 기본 글꼴"], ["\"Apple SD Gothic Neo\",\"Malgun Gothic\"", "애플고딕·맑은고딕"], ["serif", "명조 계열"]];
const WEIGHTS = [["", "기본"], ["400", "보통"], ["600", "조금 굵게"], ["700", "굵게"], ["800", "더 굵게"], ["900", "가장 굵게"]];
const ADDS = [["heading", "제목"], ["text", "문장"], ["image", "사진"], ["button", "버튼"], ["card", "카드"], ["spacer", "빈 여백"]];
const SECTION_ADDS = [["section", "밝은 섹션"], ["section-dark", "어두운 섹션"], ["section-split", "사진 + 설명 섹션"]];
const COLORS = [["--btn1", "버튼 색 1", "#2D5BD8"], ["--btn2", "버튼 색 2", "#4F8BFF"], ["--accent", "강조 글자색", "#2D5BD8"], ["--hero2", "맨 위 배경", "#0F1A30"], ["--band", "숫자 띠 배경", "#13213D"], ["--dark2", "어두운 섹션 배경", "#0F1A30"], ["--bg", "연한 섹션 배경", "#F3F6FB"], ["--ink", "제목 글자색", "#0B1428"], ["--muted", "설명 글자색", "#6B7890"]];

const cls = (...a) => a.filter(Boolean).join(" ");
const toHex = (c) => {
  const m = String(c || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return /^#[0-9a-f]{6}$/i.test(c || "") ? c : "#000000";
  return "#" + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("");
};
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : ""; };
const fmtTime = (ms) => { if (!ms) return ""; const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

// 사진 줄이기(가로 2400px · 품질 0.86) — PNG 투명·GIF·SVG는 그대로
async function shrinkImage(file) {
  if (!/^image\/(jpeg|jpg|webp|png)$/i.test(file.type) || file.size < 600 * 1024) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const r = Math.min(1, 2400 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
    const g = c.getContext("2d");
    if (file.type === "image/png") g.clearRect(0, 0, c.width, c.height); else { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
    g.drawImage(img, 0, 0, c.width, c.height);
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise((res) => c.toBlob(res, type, 0.86));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, type === "image/png" ? ".png" : ".jpg"), { type }) : file;
  } finally { URL.revokeObjectURL(url); }
}

// ── 작은 부품 ──
function Sec({ title, right, children }) {
  return (
    <div className="border-b border-[#E8EDF4] px-4 py-3.5">
      <div className="flex items-center justify-between mb-2.5"><div className="text-[12.5px] font-black text-[#0F1A30]">{title}</div>{right}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Row({ label, children, hint }) {
  return (
    <label className="flex items-center gap-2 text-[12.5px]">
      <span className="w-[74px] shrink-0 text-[#5B6B85] font-bold">{label}</span>
      <div className="flex-1 min-w-0 flex items-center gap-1.5">{children}</div>
      {hint && <span className="text-[11px] text-[#9AA9C3]">{hint}</span>}
    </label>
  );
}
const inp = "w-full h-8 px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] text-[#0F1A30] outline-none focus:border-[#4B6CB7] min-w-0";
const btn = "h-8 px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[12px] font-bold text-[#1B2B4B] hover:bg-[#F3F6FB] disabled:opacity-40 whitespace-nowrap";
const btnDark = "h-8 px-3 rounded-lg bg-[#0F1A30] text-white text-[12px] font-black hover:bg-[#1B2B4B] disabled:opacity-40 whitespace-nowrap";

// 값 입력 — 엔터·포커스 아웃 때만 반영(입력 중 매번 다시 그리지 않게)
function LazyInput({ value, onCommit, className = inp, placeholder, type = "text", textarea, rows = 3 }) {
  const [v, setV] = React.useState(value ?? "");
  React.useEffect(() => { setV(value ?? ""); }, [value]);
  const done = () => { if (String(v) !== String(value ?? "")) onCommit(v); };
  if (textarea) return <textarea value={v} rows={rows} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={done} className={cls(className, "h-auto py-2 leading-relaxed resize-y")} />;
  return <input type={type} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={done} onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }} className={className} />;
}
function NumInput({ value, placeholder, onCommit, unit = "px", step = 1 }) {
  return (
    <div className="flex items-center gap-1 w-full">
      <LazyInput type="number" value={value === "" || value == null ? "" : num(value)} placeholder={placeholder} onCommit={(v) => onCommit(v === "" ? "" : `${v}${unit}`)} className={inp} />
      <span className="text-[11px] text-[#9AA9C3] w-6">{unit}</span>
      {value !== "" && value != null && <button type="button" title="원래대로" className="text-[#9AA9C3] hover:text-[#B42318] text-[13px]" onClick={() => onCommit("")}>×</button>}
      <input type="hidden" step={step} />
    </div>
  );
}
function ColorInput({ value, fallback, onCommit }) {
  const has = !!value;
  return (
    <div className="flex items-center gap-1.5 w-full">
      <input type="color" value={toHex(value || fallback)} onChange={(e) => onCommit(e.target.value)} className="w-9 h-8 rounded-lg border border-[#DCE3EE] bg-white p-0.5 cursor-pointer" />
      <LazyInput value={value || ""} placeholder={toHex(fallback)} onCommit={onCommit} />
      {has && <button type="button" title="원래대로" className="text-[#9AA9C3] hover:text-[#B42318] text-[13px]" onClick={() => onCommit("")}>×</button>}
    </div>
  );
}

export default function HomepageEditor() {
  const iframeRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  const [siteUrl, setSiteUrl] = React.useState(DEFAULT_URL);
  const [frameKey, setFrameKey] = React.useState(1);
  const [ready, setReady] = React.useState(false);
  const [state, setState] = React.useState(null); // null = 불러오는 중
  const [liveJson, setLiveJson] = React.useState("null");
  const [meta, setMeta] = React.useState(null);
  const [info, setInfo] = React.useState(null);
  const [tab, setTab] = React.useState("select");
  const [device, setDevice] = React.useState("pc");
  const [preview, setPreview] = React.useState(false);
  const [mobileEdit, setMobileEdit] = React.useState(false);
  const [saveState, setSaveState] = React.useState("saved");
  const [msg, setMsg] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [history, setHistory] = React.useState([]);
  const [full, setFull] = React.useState(false);
  const [scale, setScale] = React.useState(1);
  const undoRef = React.useRef([]); const redoRef = React.useRef([]);
  const [, force] = React.useReducer((x) => x + 1, 0);
  const stateRef = React.useRef(null); stateRef.current = state;
  const saveTimer = React.useRef(null);
  const me = auth.currentUser?.email || "";

  const toast = React.useCallback((t) => { setMsg(t); clearTimeout(toast.t); toast.t = setTimeout(() => setMsg(""), 2600); }, []);
  const send = React.useCallback((m) => { const w = iframeRef.current?.contentWindow; if (w) w.postMessage({ t: "kp:cmd", ...m }, "*"); }, []);

  // ── 불러오기: 임시 저장본 → 없으면 게시본 → 없으면 빈 상태 ──
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [d, l, h] = await Promise.all([getDoc(doc(db, "siteConfig", "homepageDraft")), getDoc(doc(db, "siteConfig", "landing")), getDoc(doc(db, "siteConfig", "homepageHistory"))]);
        if (!alive) return;
        const live = l.exists() && l.data().homepage ? l.data().homepage : "null";
        setLiveJson(live);
        const dd = d.exists() ? d.data() : {};
        if (dd.siteUrl && !LOCAL) setSiteUrl(dd.siteUrl);
        const s = dd.data ? JSON.parse(dd.data) : live !== "null" ? JSON.parse(live) : EMPTY;
        setState({ ...EMPTY, ...s });
        setHistory(h.exists() ? h.data().items || [] : []);
      } catch (e) {
        if (alive) { setState({ ...EMPTY }); toast("불러오기 실패: " + (e?.code || e?.message || e)); }
      }
    })();
    const unsub = onSnapshot(doc(db, "siteConfig", "homepageHistory"), (s) => setHistory(s.exists() ? s.data().items || [] : []), () => {});
    return () => { alive = false; unsub(); };
  }, [toast]);

  // ── 임시 저장(바꾼 뒤 1.2초) ──
  const saveDraft = React.useCallback(async (s) => {
    setSaveState("saving");
    try {
      await setDoc(doc(db, "siteConfig", "homepageDraft"), { data: JSON.stringify(s), siteUrl, updatedAt: serverTimestamp(), updatedBy: me }, { merge: true });
      setSaveState("saved");
    } catch (e) { setSaveState("error"); toast("임시 저장 실패: " + (e?.code || e?.message)); }
  }, [siteUrl, me, toast]);
  const scheduleSave = React.useCallback((s) => { setSaveState("unsaved"); clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => saveDraft(s), 1200); }, [saveDraft]);

  const applyNew = React.useCallback((next, label) => {
    const prev = stateRef.current;
    if (prev) { undoRef.current.push(JSON.stringify(prev)); if (undoRef.current.length > 80) undoRef.current.shift(); }
    redoRef.current = [];
    setState(next); scheduleSave(next); force();
    if (label) setMsg("");
  }, [scheduleSave]);

  const undo = React.useCallback(() => {
    if (!undoRef.current.length) return;
    redoRef.current.push(JSON.stringify(stateRef.current));
    const s = JSON.parse(undoRef.current.pop());
    setState(s); scheduleSave(s); send({ cmd: "load", state: s, keepKey: info?.key }); force();
  }, [scheduleSave, send, info]);
  const redo = React.useCallback(() => {
    if (!redoRef.current.length) return;
    undoRef.current.push(JSON.stringify(stateRef.current));
    const s = JSON.parse(redoRef.current.pop());
    setState(s); scheduleSave(s); send({ cmd: "load", state: s, keepKey: info?.key }); force();
  }, [scheduleSave, send, info]);

  // ── 편집 화면(iframe)과 주고받기 ──
  React.useEffect(() => {
    const on = (ev) => {
      if (!iframeRef.current || ev.source !== iframeRef.current.contentWindow) return;
      const m = ev.data || {};
      if (m.t === "kp:ready") { setReady(true); setMeta(m.meta); if (stateRef.current) send({ cmd: "load", state: stateRef.current }); send({ cmd: "preview", on: false }); }
      else if (m.t === "kp:change") applyNew(m.state, m.label);
      else if (m.t === "kp:select") { setInfo(m.info); if (m.info && !m.quiet) setTab("select"); }
      else if (m.t === "kp:meta") setMeta(m.meta);
      else if (m.t === "kp:flushed") { if (flushRef.current) flushRef.current(m.state); }
      else if (m.t === "kp:undo") undo();
      else if (m.t === "kp:redo") redo();
      else if (m.t === "kp:save") saveDraft(stateRef.current);
      else if (m.t === "kp:replaced") toast(m.count ? `${m.count}곳을 바꿨습니다` : "찾는 글자가 없습니다");
      else if (m.t === "kp:upload" && m.file) uploadTo(m.key, m.file);
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }); // 최신 함수 사용

  React.useEffect(() => { if (ready) send({ cmd: "preview", on: preview }); }, [preview, ready, send]);
  React.useEffect(() => { setMobileEdit(device === "mobile"); }, [device]);

  // 화면 폭에 맞춰 줄여 보기
  React.useEffect(() => {
    const el = wrapRef.current; if (!el) return undefined;
    const w = (DEVICES.find((d) => d[0] === device) || DEVICES[0])[2];
    const fit = () => setScale(Math.min(1, (el.clientWidth - 24) / w));
    fit(); const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [device, full]);

  // 단축키(편집기 바깥 영역)
  React.useEffect(() => {
    const k = (e) => {
      const t = e.target; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); saveDraft(stateRef.current); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [undo, redo, saveDraft]);

  // ── 사진 올리기 ──
  const uploadFile = async (file) => {
    if (!file || !/^image\//.test(file.type)) throw new Error("사진 파일만 올릴 수 있습니다");
    if (file.size > 15 * 1024 * 1024) throw new Error("15MB 이하 사진만 올릴 수 있습니다");
    const f = await shrinkImage(file);
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const r = storageRef(storage, `siteConfig/homepage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`);
    await uploadBytes(r, f, { contentType: f.type, cacheControl: "public,max-age=31536000" });
    return getDownloadURL(r);
  };
  async function uploadTo(key, file) {
    setBusy(true);
    try { const url = await uploadFile(file); send({ cmd: "setAttr", key, name: "src", value: url, label: "사진 교체" }); toast("사진을 바꿨습니다"); }
    catch (e) { toast("사진 올리기 실패: " + (e?.message || e)); }
    finally { setBusy(false); }
  }

  // ── 게시 ──
  // 게시 직전에 편집 화면에서 쓰던 글까지 확정해서 받아 온다(고치는 중에 [게시하기]를 눌러도 빠지지 않게)
  const flushRef = React.useRef(null);
  const flushFrame = () => new Promise((resolve) => {
    const t = setTimeout(() => { flushRef.current = null; resolve(stateRef.current); }, 1500);
    flushRef.current = (s) => { clearTimeout(t); flushRef.current = null; resolve(s); };
    send({ cmd: "flush" });
  });
  const publish = async () => {
    if (!state) return;
    setBusy(true);
    try {
      const latest = (await flushFrame()) || stateRef.current;
      setState(latest);
      clearTimeout(saveTimer.current); await saveDraft(latest);
      const json = JSON.stringify(latest);
      await setDoc(doc(db, "siteConfig", "landing"), { homepage: json, homepageAt: serverTimestamp(), homepageBy: me }, { merge: true });
      // 이력(최근 15개 · 문서 한도 넘지 않게)
      const items = [{ at: Date.now(), by: me, data: json, note: `게시 · 편집 ${Object.keys(latest.els || {}).length}곳` }, ...history];
      let keep = items.slice(0, 15);
      while (keep.length > 1 && JSON.stringify(keep).length > 850000) keep = keep.slice(0, -1);
      await setDoc(doc(db, "siteConfig", "homepageHistory"), { items: keep, updatedAt: serverTimestamp() });
      setLiveJson(json);
      toast("게시했습니다 · 홈페이지에 바로 반영됩니다");
    } catch (e) { toast("게시 실패: " + (e?.code || e?.message || e)); }
    finally { setBusy(false); }
  };
  const restore = async (item) => {
    if (!item?.data) return;
    if (!(await kpConfirm(`${fmtTime(item.at)} 버전으로 되돌릴까요? 지금 편집 중인 내용은 실행취소로 되돌릴 수 있습니다.`))) return;
    const s = JSON.parse(item.data); applyNew(s, "되돌리기"); send({ cmd: "load", state: s }); toast("되돌렸습니다 · 확인 후 [게시하기]를 누르세요");
  };
  const resetAll = async () => {
    if (!(await kpConfirm("모든 편집 내용을 지우고 처음 홈페이지로 돌아갈까요? (게시하기 전까지 방문자 화면은 그대로입니다)", { danger: true }))) return;
    applyNew({ ...EMPTY }, "초기화"); send({ cmd: "load", state: { ...EMPTY } });
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `homepage-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const importJson = (file) => {
    const fr = new FileReader();
    fr.onload = () => { try { const s = JSON.parse(fr.result); if (!s || typeof s !== "object" || !s.els) throw new Error(); applyNew({ ...EMPTY, ...s }, "가져오기"); send({ cmd: "load", state: { ...EMPTY, ...s } }); toast("백업을 불러왔습니다"); } catch { toast("올바른 백업 파일이 아닙니다"); } };
    fr.readAsText(file);
  };

  const dirtyVsLive = state && JSON.stringify(state) !== liveJson && !(liveJson === "null" && JSON.stringify(state) === JSON.stringify(EMPTY));
  const devW = (DEVICES.find((d) => d[0] === device) || DEVICES[0])[2];
  const frameSrc = `${siteUrl.replace(/[?#].*$/, "")}${siteUrl.includes("?") ? "&" : "?"}kpedit=1&v=${frameKey}`;

  // ── 고른 요소 속성 ──
  const sel = info;
  const bagKey = mobileEdit ? "styleM" : "style";
  const sv = (p) => (sel ? (sel[bagKey] || {})[p] ?? "" : "");
  const setS = (prop, value) => send({ cmd: "setStyle", key: sel.key, prop, value, mobile: mobileEdit });
  const tr = String(sv("translate") || "0px 0px").split(/\s+/);
  const setTr = (x, y) => setS("translate", `${x === "" ? 0 : x}px ${y === "" ? 0 : y}px`);

  const tabs = [["select", "속성"], ["page", "페이지"], ["sections", "섹션"], ["nav", "메뉴"], ["form", "신청서"], ["images", "사진"], ["add", "추가"], ["history", "이력"]];

  const panel = (() => {
    if (!state) return <div className="p-6 text-[13px] text-[#7A879C]">불러오는 중…</div>;
    if (tab === "select") {
      if (!sel) return (
        <div className="p-5 text-[13px] leading-relaxed text-[#5B6B85] space-y-3">
          <div className="text-[14px] font-black text-[#0F1A30]">홈페이지에서 고칠 곳을 누르세요</div>
          <ul className="space-y-1.5 list-disc pl-4">
            <li><b>한 번 누르기</b> — 고르기 (속성이 여기에 나옵니다)</li>
            <li><b>두 번 누르기</b> — 글자 바로 고치기</li>
            <li><b>고른 요소 끌기</b> — 위치 옮기기 (Shift: 10px씩)</li>
            <li><b>오른쪽·아래 손잡이</b> — 크기 조절</li>
            <li><b>사진 위에 파일 끌어 놓기</b> — 사진 교체</li>
            <li><b>Delete</b> 숨기기 · <b>Ctrl+D</b> 복제 · <b>방향키</b> 1px 이동 · <b>Esc</b> 상위 요소</li>
            <li><b>Ctrl+Z / Ctrl+Y</b> 실행취소 · 다시실행</li>
          </ul>
          <div className="rounded-xl bg-[#F3F6FB] p-3 text-[12px]">탭 안의 내용(예: 배차 › 실시간배차현황)은 그 탭 버튼을 먼저 눌러 연 뒤 고르면 됩니다. 안내 창(PC 설치 안내 등)도 버튼을 눌러 열고 고칩니다.</div>
        </div>
      );
      const isImg = sel.kind === "image", isIcon = sel.kind === "icon", isInput = sel.kind === "input" || sel.kind === "select";
      const hasText = !isImg && !isIcon && !isInput;
      const c = sel.computed || {};
      return (
        <div>
          <div className="px-4 pt-3 pb-2 border-b border-[#E8EDF4] bg-[#F7F9FC]">
            <div className="flex flex-wrap gap-1 text-[11px] mb-1.5">
              {sel.path.slice(-4).map((p, i, a) => (
                <React.Fragment key={p.key}>
                  <button type="button" onClick={() => send({ cmd: "select", key: p.key })} className={cls("px-1.5 py-0.5 rounded-md truncate max-w-[120px]", i === a.length - 1 ? "bg-[#0F1A30] text-white font-black" : "bg-white border border-[#E3E8F0] text-[#5B6B85] hover:border-[#4B6CB7]")} title={p.label}>{p.label.split(" · ")[0]}</button>
                  {i < a.length - 1 && <span className="text-[#C3CEE0]">›</span>}
                </React.Fragment>
              ))}
            </div>
            <div className="text-[13.5px] font-black text-[#0F1A30] truncate">{sel.label}</div>
            <div className="flex flex-wrap gap-1 mt-2">
              <button className={btn} onClick={() => send({ cmd: "move", key: sel.key, dir: "up" })} disabled={!sel.canUp}>▲ 앞으로</button>
              <button className={btn} onClick={() => send({ cmd: "move", key: sel.key, dir: "down" })} disabled={!sel.canDown}>▼ 뒤로</button>
              <button className={btn} onClick={() => send({ cmd: "duplicate", key: sel.key })}>복제</button>
              <button className={btn} onClick={() => send({ cmd: "hide", key: sel.key, hidden: true })}>숨기기</button>
              <button className={cls(btn, "text-[#B42318]")} onClick={() => send({ cmd: "remove", key: sel.key })}>삭제</button>
              {sel.edited && <button className={btn} onClick={async () => { if (await kpConfirm("이 요소에 한 편집(글·스타일·속성)을 모두 지울까요?")) send({ cmd: "resetEl", key: sel.key }); }}>원래대로</button>}
            </div>
          </div>

          {hasText && (
            <Sec title="글자 내용" right={<span className="text-[11px] text-[#9AA9C3]">홈페이지에서 두 번 눌러도 됩니다</span>}>
              <LazyInput textarea rows={Math.min(8, Math.max(2, Math.ceil((sel.text || "").length / 34)))} value={sel.text} onCommit={(v) => send({ cmd: "setText", key: sel.key, text: v })} />
              {sel.html && /<(b|strong|br|span|small|svg|em|i)\b/i.test(sel.html) && (
                <details className="text-[12px]"><summary className="cursor-pointer text-[#4B6CB7] font-bold">굵게·줄바꿈까지 고치기(HTML)</summary>
                  <LazyInput textarea rows={4} value={sel.html} onCommit={(v) => send({ cmd: "setHtml", key: sel.key, html: v })} className={cls(inp, "tabular-nums text-[11.5px]")} />
                  <div className="text-[11px] text-[#9AA9C3] mt-1">&lt;b&gt;굵게&lt;/b&gt; · &lt;br&gt; 줄바꿈 · &lt;span style="color:#2D5BD8"&gt;색&lt;/span&gt;</div>
                </details>
              )}
            </Sec>
          )}

          {(sel.kind === "link" || sel.attrs?.href != null) && (
            <Sec title="링크">
              <Row label="이동할 곳"><LazyInput value={sel.attrs.href || ""} placeholder="#inquiry-form 또는 https://" onCommit={(v) => send({ cmd: "setAttr", key: sel.key, name: "href", value: v, label: "링크" })} /></Row>
              <Row label="빠른 선택">
                <select className={inp} value="" onChange={(e) => e.target.value && send({ cmd: "setAttr", key: sel.key, name: "href", value: e.target.value, label: "링크" })}>
                  <option value="">페이지 안 위치 고르기…</option>
                  {ANCHORS.map(([h, l]) => <option key={h} value={h}>{l} ({h})</option>)}
                </select>
              </Row>
              <label className="flex items-center gap-2 text-[12.5px] font-bold text-[#3A4A66]"><input type="checkbox" checked={sel.attrs.target === "_blank"} onChange={(e) => send({ cmd: "setAttr", key: sel.key, name: "target", value: e.target.checked ? "_blank" : "", label: "새 창" })} />새 창으로 열기</label>
            </Sec>
          )}

          {isImg && (
            <Sec title="사진">
              <div className="rounded-xl overflow-hidden border border-[#E3E8F0] bg-[#F3F6FB]"><img src={/^https?:|^data:/.test(sel.attrs.src || "") ? sel.attrs.src : `${siteUrl.replace(/[?#].*$/, "").replace(/\/?$/, "/")}${sel.attrs.src || ""}`} alt="" className="w-full max-h-[160px] object-contain" /></div>
              <div className="flex gap-1.5">
                <label className={cls(btnDark, "inline-flex items-center cursor-pointer")}>{busy ? "올리는 중…" : "새 사진 올리기"}<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadTo(sel.key, f); }} /></label>
              </div>
              <Row label="사진 주소"><LazyInput value={sel.attrs.src || ""} onCommit={(v) => send({ cmd: "setAttr", key: sel.key, name: "src", value: v, label: "사진 교체" })} /></Row>
              <Row label="설명(alt)"><LazyInput value={sel.attrs.alt || ""} placeholder="검색·시각장애인용 사진 설명" onCommit={(v) => send({ cmd: "setAttr", key: sel.key, name: "alt", value: v, label: "사진 설명" })} /></Row>
              {meta?.images?.length > 0 && (
                <details><summary className="cursor-pointer text-[12px] font-bold text-[#4B6CB7]">홈페이지에 있는 다른 사진으로 바꾸기</summary>
                  <div className="grid grid-cols-3 gap-1.5 mt-2 max-h-[220px] overflow-auto">
                    {[...new Set(meta.images.map((x) => x.src))].map((src) => (
                      <button key={src} type="button" onClick={() => send({ cmd: "setAttr", key: sel.key, name: "src", value: src, label: "사진 교체" })} className={cls("rounded-lg overflow-hidden border", src === sel.attrs.src ? "border-[#2D5BD8] ring-2 ring-[#2D5BD8]/30" : "border-[#E3E8F0] hover:border-[#4B6CB7]")}>
                        <img src={/^https?:/.test(src) ? src : `${siteUrl.replace(/[?#].*$/, "").replace(/\/?$/, "/")}${src}`} alt="" className="w-full h-14 object-cover" />
                      </button>
                    ))}
                  </div>
                </details>
              )}
              <Row label="맞춤">
                <select className={inp} value={sv("objectFit")} onChange={(e) => setS("objectFit", e.target.value)}>
                  <option value="">기본</option><option value="cover">칸 채우기(잘림)</option><option value="contain">전체 보이기</option>
                </select>
              </Row>
            </Sec>
          )}

          {isIcon && meta?.icons && (
            <Sec title="아이콘 바꾸기">
              <div className="grid grid-cols-6 gap-1">
                {meta.icons.map((id) => (
                  <button key={id} type="button" title={id} onClick={() => send({ cmd: "setIcon", key: sel.key, icon: id })} className={cls("h-9 rounded-lg border text-[10px] font-bold", sel.icon === id ? "border-[#2D5BD8] bg-[#EEF3FF] text-[#2D5BD8]" : "border-[#E3E8F0] text-[#5B6B85] hover:border-[#4B6CB7]")}>{id.replace("i-", "")}</button>
                ))}
              </div>
            </Sec>
          )}

          {isInput && (
            <Sec title="입력칸">
              {sel.kind !== "select" && <Row label="안내 글자"><LazyInput value={sel.attrs.placeholder || ""} onCommit={(v) => send({ cmd: "setAttr", key: sel.key, name: "placeholder", value: v, label: "안내 글자" })} /></Row>}
              {sel.kind === "select" && <div><div className="text-[12px] font-bold text-[#5B6B85] mb-1">선택 항목 (한 줄에 하나 · 첫 줄은 "선택해 주세요")</div><LazyInput textarea rows={5} value={(sel.options || []).join("\n")} onCommit={(v) => send({ cmd: "setOptions", key: sel.key, options: v.split("\n") })} /></div>}
              <label className="flex items-center gap-2 text-[12.5px] font-bold text-[#3A4A66]"><input type="checkbox" checked={!!sel.attrs.required} onChange={(e) => send({ cmd: "setAttr", key: sel.key, name: "required", value: e.target.checked, label: "필수" })} />필수 입력</label>
            </Sec>
          )}

          <Sec title={mobileEdit ? "모양 · 모바일 화면에만 적용" : "모양 · 모든 화면"} right={
            <div className="flex rounded-lg bg-[#EEF1F6] p-0.5 text-[11px] font-black">
              <button type="button" onClick={() => setMobileEdit(false)} className={cls("px-2 py-1 rounded-md", !mobileEdit ? "bg-white text-[#0F1A30] shadow" : "text-[#7A879C]")}>모든 화면</button>
              <button type="button" onClick={() => setMobileEdit(true)} className={cls("px-2 py-1 rounded-md", mobileEdit ? "bg-white text-[#0F1A30] shadow" : "text-[#7A879C]")}>모바일만</button>
            </div>}>
            {hasText && <>
              <Row label="글자 크기"><NumInput value={sv("fontSize")} placeholder={num(c.fontSize)} onCommit={(v) => setS("fontSize", v)} /></Row>
              <Row label="굵기"><select className={inp} value={sv("fontWeight")} onChange={(e) => setS("fontWeight", e.target.value)}>{WEIGHTS.map(([v, l]) => <option key={v} value={v}>{l}{v === "" ? ` (${c.fontWeight})` : ""}</option>)}</select></Row>
              <Row label="글자색"><ColorInput value={sv("color")} fallback={c.color} onCommit={(v) => setS("color", v)} /></Row>
              <Row label="정렬">
                {[["left", "왼쪽"], ["center", "가운데"], ["right", "오른쪽"]].map(([v, l]) => <button key={v} type="button" onClick={() => setS("textAlign", sv("textAlign") === v ? "" : v)} className={cls(btn, "flex-1", sv("textAlign") === v && "bg-[#0F1A30] text-white border-[#0F1A30] hover:bg-[#0F1A30]")}>{l}</button>)}
              </Row>
              <Row label="줄 간격"><NumInput unit="" value={sv("lineHeight")} placeholder={c.lineHeight === "normal" ? "1.5" : (num(c.lineHeight) / (num(c.fontSize) || 16)).toFixed(2)} onCommit={(v) => setS("lineHeight", v)} /></Row>
              <Row label="자간"><NumInput value={sv("letterSpacing")} placeholder={c.letterSpacing === "normal" ? "0" : num(c.letterSpacing)} onCommit={(v) => setS("letterSpacing", v)} /></Row>
            </>}
            <Row label="너비"><NumInput value={sv("width")} placeholder={num(c.width)} onCommit={(v) => { setS("width", v); if (v) setS("maxWidth", "none"); }} /></Row>
            <Row label="높이"><NumInput value={sv("height")} placeholder={num(c.height)} onCommit={(v) => setS("height", v)} /></Row>
            <Row label="위치 이동">
              <span className="text-[11px] text-[#9AA9C3]">가로</span><LazyInput type="number" value={num(tr[0]) || ""} placeholder="0" onCommit={(v) => setTr(v, num(tr[1]) || 0)} />
              <span className="text-[11px] text-[#9AA9C3]">세로</span><LazyInput type="number" value={num(tr[1]) || ""} placeholder="0" onCommit={(v) => setTr(num(tr[0]) || 0, v)} />
              {sv("translate") && <button type="button" title="원래 자리로" className="text-[#9AA9C3] hover:text-[#B42318] text-[13px]" onClick={() => setS("translate", "")}>×</button>}
            </Row>
            <Row label="위 여백"><NumInput value={sv("marginTop")} placeholder={num(c.marginTop)} onCommit={(v) => setS("marginTop", v)} /></Row>
            <Row label="아래 여백"><NumInput value={sv("marginBottom")} placeholder={num(c.marginBottom)} onCommit={(v) => setS("marginBottom", v)} /></Row>
            <Row label="안쪽 여백"><NumInput value={sv("padding")} placeholder={num(c.padding)} onCommit={(v) => setS("padding", v)} /></Row>
            <Row label="배경색"><ColorInput value={sv("background")} fallback={c.backgroundColor === "rgba(0, 0, 0, 0)" ? "#ffffff" : c.backgroundColor} onCommit={(v) => setS("background", v)} /></Row>
            <Row label="둥글기"><NumInput value={sv("borderRadius")} placeholder={num(c.borderRadius)} onCommit={(v) => setS("borderRadius", v)} /></Row>
            <Row label="투명도"><input type="range" min="0.1" max="1" step="0.05" value={sv("opacity") || c.opacity || 1} onChange={(e) => setS("opacity", e.target.value === "1" ? "" : e.target.value)} className="flex-1" /><span className="text-[11px] w-8 text-right">{Math.round((sv("opacity") || c.opacity || 1) * 100)}%</span></Row>
            <Row label="그림자">
              {[["", "기본"], ["none", "없음"], ["0 10px 30px rgba(15,26,48,.18)", "약하게"], ["0 30px 80px -20px rgba(15,26,48,.4)", "진하게"]].map(([v, l]) => <button key={l} type="button" onClick={() => setS("boxShadow", v)} className={cls(btn, "flex-1 px-1", sv("boxShadow") === v && "bg-[#0F1A30] text-white border-[#0F1A30] hover:bg-[#0F1A30]")}>{l}</button>)}
            </Row>
            {(Object.keys(sel.style || {}).length > 0 || Object.keys(sel.styleM || {}).length > 0) && <button className={cls(btn, "w-full")} onClick={() => send({ cmd: "clearStyle", key: sel.key })}>모양 바꾼 것 모두 지우기</button>}
          </Sec>
          <Sec title="이 요소 뒤에 넣기">
            <div className="grid grid-cols-3 gap-1.5">{ADDS.map(([k, l]) => <button key={k} className={btn} onClick={() => send({ cmd: "add", kind: k, ref: sel.key })}>+ {l}</button>)}</div>
          </Sec>
        </div>
      );
    }
    if (tab === "page") {
      const p = state.page || {};
      const vars = p.vars || {};
      const setPage = (patch) => send({ cmd: "setPage", page: patch });
      return (
        <div>
          <Sec title="검색 · 브라우저 탭">
            <Row label="페이지 제목"><LazyInput value={p.title || ""} placeholder={meta?.title} onCommit={(v) => setPage({ title: v })} /></Row>
            <div><div className="text-[12px] font-bold text-[#5B6B85] mb-1">검색 설명</div><LazyInput textarea rows={3} value={p.description || ""} placeholder={meta?.description} onCommit={(v) => setPage({ description: v })} /></div>
          </Sec>
          <Sec title="색상" right={Object.keys(vars).length > 0 && <button className="text-[11.5px] font-bold text-[#B42318]" onClick={() => setPage({ vars: {} })}>색 원래대로</button>}>
            {COLORS.map(([v, l, d]) => <Row key={v} label={l}><ColorInput value={vars[v] || ""} fallback={d} onCommit={(val) => setPage({ vars: { ...vars, [v]: val } })} /></Row>)}
          </Sec>
          <Sec title="글꼴">
            <select className={inp} value={p.font || ""} onChange={(e) => setPage({ font: e.target.value })}>{FONTS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}</select>
          </Sec>
          <Sec title="전체 글자 찾아 바꾸기"><FindReplace onRun={(find, replace) => send({ cmd: "replaceText", find, replace })} /></Sec>
          <Sec title="직접 CSS (고급)">
            <LazyInput textarea rows={6} value={p.css || ""} placeholder={".hero h1 { font-size: 60px; }"} onCommit={(v) => setPage({ css: v })} className={cls(inp, "tabular-nums text-[11.5px]")} />
          </Sec>
        </div>
      );
    }
    if (tab === "sections") return (
      <div>
        <Sec title="섹션 순서 · 보이기" right={<span className="text-[11px] text-[#9AA9C3]">누르면 그 위치로 이동</span>}>
          {(meta?.sections || []).map((s, i, a) => (
            <div key={s.key} className={cls("flex items-center gap-1.5 rounded-xl border px-2.5 py-2", s.hidden ? "border-dashed border-[#DCE3EE] bg-[#F7F9FC] opacity-70" : "border-[#E3E8F0] bg-white")}>
              <button type="button" onClick={() => send({ cmd: "select", key: s.key, scroll: true })} className="flex-1 min-w-0 text-left text-[12.5px] font-bold text-[#0F1A30] truncate">{s.label || "영역"}</button>
              <button className={cls(btn, "px-1.5")} disabled={i === 0} onClick={() => send({ cmd: "move", key: s.key, dir: "up" })}>▲</button>
              <button className={cls(btn, "px-1.5")} disabled={i === a.length - 1} onClick={() => send({ cmd: "move", key: s.key, dir: "down" })}>▼</button>
              <button className={cls(btn, "px-1.5")} onClick={() => send({ cmd: "hide", key: s.key, hidden: !s.hidden })}>{s.hidden ? "보이기" : "숨김"}</button>
              <button className={cls(btn, "px-1.5")} onClick={() => send({ cmd: "duplicate", key: s.key })}>복제</button>
            </div>
          ))}
        </Sec>
        <Sec title="새 섹션 넣기" right={<span className="text-[11px] text-[#9AA9C3]">고른 섹션 다음에 들어갑니다</span>}>
          <div className="grid grid-cols-1 gap-1.5">{SECTION_ADDS.map(([k, l]) => <button key={k} className={btn} onClick={() => send({ cmd: "add", kind: k, ref: info?.key })}>+ {l}</button>)}</div>
        </Sec>
      </div>
    );
    if (tab === "nav") {
      const navRow = (n, i, a) => (
        <div key={n.key} className="rounded-xl border border-[#E3E8F0] bg-white p-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10.5px] font-black text-[#9AA9C3] w-14 shrink-0">{n.group || "링크"}</span>
            <LazyInput value={n.text} onCommit={(v) => send({ cmd: "setText", key: n.key, text: v })} />
            <button className={cls(btn, "px-1.5")} disabled={i === 0} onClick={() => send({ cmd: "move", key: n.key, dir: "up" })}>▲</button>
            <button className={cls(btn, "px-1.5")} disabled={i === a.length - 1} onClick={() => send({ cmd: "move", key: n.key, dir: "down" })}>▼</button>
            <button className={cls(btn, "px-1.5 text-[#B42318]")} onClick={() => send({ cmd: "remove", key: n.key })}>×</button>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10.5px] font-black text-[#9AA9C3] w-14 shrink-0">이동</span>
            <select className={inp} value={ANCHORS.some(([h]) => h === n.href) ? n.href : ""} onChange={(e) => e.target.value && send({ cmd: "setAttr", key: n.key, name: "href", value: e.target.value, label: "메뉴 링크" })}>
              <option value="">{n.href}</option>{ANCHORS.map(([h, l]) => <option key={h} value={h}>{l}</option>)}
            </select>
          </div>
        </div>
      );
      const nav = (meta?.nav || []).filter((n) => n.group === "메뉴"), cta = (meta?.nav || []).filter((n) => n.group !== "메뉴");
      return (
        <div>
          <Sec title="상단 메뉴" right={<button className={btnDark} onClick={() => send({ cmd: "add", kind: "nav-link" })}>+ 메뉴 추가</button>}>{nav.map(navRow)}</Sec>
          <Sec title="상단 오른쪽 버튼">{cta.map(navRow)}</Sec>
          <Sec title="하단 링크">{(meta?.footer || []).map((n, i, a) => navRow({ ...n, group: "하단" }, i, a))}</Sec>
        </div>
      );
    }
    if (tab === "form") {
      const f = meta?.form || [];
      return (
        <div>
          <Sec title="무료 체험 신청서 질문" right={<span className="text-[11px] text-[#9AA9C3]">{f.length}개</span>}>
            {f.map((q, i) => (
              <div key={q.key} className="rounded-xl border border-[#E3E8F0] bg-white p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10.5px] font-black text-[#9AA9C3] w-10 shrink-0">질문</span>
                  {q.labelKey ? <LazyInput value={q.label} onCommit={(v) => send({ cmd: "setText", key: q.labelKey, text: v })} /> : <span className="text-[12px]">{q.label}</span>}
                  <button className={cls(btn, "px-1.5")} disabled={i === 0} onClick={() => send({ cmd: "move", key: q.key, dir: "up" })}>▲</button>
                  <button className={cls(btn, "px-1.5")} disabled={i === f.length - 1} onClick={() => send({ cmd: "move", key: q.key, dir: "down" })}>▼</button>
                  <button className={cls(btn, "px-1.5 text-[#B42318]")} title={q.extra ? "삭제" : "숨기기(기본 질문은 저장 구조 때문에 숨기기만 됩니다)"} onClick={() => send({ cmd: "remove", key: q.key })}>×</button>
                </div>
                {q.type !== "select" ? (
                  <div className="flex items-center gap-1.5"><span className="text-[10.5px] font-black text-[#9AA9C3] w-10 shrink-0">안내</span><LazyInput value={q.placeholder} onCommit={(v) => send({ cmd: "setAttr", key: q.inputKey, name: "placeholder", value: v, label: "안내 글자" })} /></div>
                ) : (
                  <div><span className="text-[10.5px] font-black text-[#9AA9C3]">선택 항목(한 줄에 하나)</span><LazyInput textarea rows={4} value={(q.options || []).join("\n")} onCommit={(v) => send({ cmd: "setOptions", key: q.inputKey, options: v.split("\n") })} /></div>
                )}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[12px] font-bold text-[#3A4A66]"><input type="checkbox" checked={q.required} onChange={(e) => send({ cmd: "setAttr", key: q.inputKey, name: "required", value: e.target.checked, label: "필수" })} />필수</label>
                  <button type="button" className="text-[11.5px] font-bold text-[#4B6CB7]" onClick={() => send({ cmd: "select", key: q.key, scroll: true })}>위치 보기</button>
                  {q.extra && <span className="text-[10.5px] font-black text-[#12A150]">추가한 질문 · 신청 내역에 함께 저장</span>}
                </div>
              </div>
            ))}
          </Sec>
          <Sec title="질문 추가">
            <div className="grid grid-cols-3 gap-1.5">
              <button className={btn} onClick={() => send({ cmd: "add", kind: "field-text" })}>+ 한 줄</button>
              <button className={btn} onClick={() => send({ cmd: "add", kind: "field-textarea" })}>+ 여러 줄</button>
              <button className={btn} onClick={() => send({ cmd: "add", kind: "field-select" })}>+ 선택</button>
            </div>
          </Sec>
          {meta?.submit && <Sec title="신청 버튼"><LazyInput value={meta.submit.text} onCommit={(v) => send({ cmd: "setText", key: meta.submit.key, text: v })} /></Sec>}
        </div>
      );
    }
    if (tab === "images") return (
      <Sec title="홈페이지 사진" right={<span className="text-[11px] text-[#9AA9C3]">{meta?.images?.length || 0}장</span>}>
        <div className="grid grid-cols-2 gap-2">
          {(meta?.images || []).map((im) => (
            <div key={im.key} className={cls("rounded-xl border overflow-hidden bg-white", im.hidden ? "opacity-50 border-dashed" : "border-[#E3E8F0]")}>
              <button type="button" onClick={() => send({ cmd: "select", key: im.key, scroll: true })} className="block w-full"><img src={/^https?:/.test(im.src) ? im.src : `${siteUrl.replace(/[?#].*$/, "").replace(/\/?$/, "/")}${im.src}`} alt="" className="w-full h-20 object-cover bg-[#F3F6FB]" /></button>
              <div className="p-1.5 flex gap-1">
                <label className={cls(btn, "flex-1 inline-flex items-center justify-center cursor-pointer px-1 text-[11px]")}>교체<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadTo(im.key, f); }} /></label>
                <button className={cls(btn, "px-1.5 text-[11px]")} onClick={() => send({ cmd: "hide", key: im.key, hidden: !im.hidden })}>{im.hidden ? "보이기" : "숨김"}</button>
              </div>
            </div>
          ))}
        </div>
      </Sec>
    );
    if (tab === "add") return (
      <div>
        <Sec title={info ? `고른 요소(${info.label.split(" · ")[0]}) 뒤에 넣기` : "먼저 홈페이지에서 넣을 위치를 누르세요"}>
          <div className="grid grid-cols-3 gap-1.5">{ADDS.map(([k, l]) => <button key={k} className={btn} disabled={!info} onClick={() => send({ cmd: "add", kind: k, ref: info?.key })}>+ {l}</button>)}</div>
        </Sec>
        <Sec title="섹션 넣기"><div className="grid grid-cols-1 gap-1.5">{SECTION_ADDS.map(([k, l]) => <button key={k} className={btn} onClick={() => send({ cmd: "add", kind: k, ref: info?.key })}>+ {l}</button>)}</div></Sec>
        <Sec title="숨긴 요소" right={<span className="text-[11px] text-[#9AA9C3]">{meta?.hidden?.length || 0}개</span>}>
          {(meta?.hidden || []).length === 0 && <div className="text-[12px] text-[#9AA9C3]">숨긴 요소가 없습니다</div>}
          {(meta?.hidden || []).map((h) => (
            <div key={h.key} className="flex items-center gap-1.5 text-[12.5px]"><span className="flex-1 truncate">{h.label}</span><button className={btn} onClick={() => send({ cmd: "hide", key: h.key, hidden: false })}>다시 보이기</button></div>
          ))}
        </Sec>
      </div>
    );
    if (tab === "history") return (
      <div>
        <Sec title="게시 이력" right={<span className="text-[11px] text-[#9AA9C3]">최근 15개</span>}>
          {history.length === 0 && <div className="text-[12px] text-[#9AA9C3]">아직 게시한 적이 없습니다</div>}
          {history.map((h, i) => (
            <div key={h.at + "-" + i} className="flex items-center gap-2 rounded-xl border border-[#E3E8F0] bg-white px-2.5 py-2">
              <div className="flex-1 min-w-0"><div className="text-[12.5px] font-black text-[#0F1A30]">{fmtTime(h.at)}{i === 0 && <span className="ml-1.5 text-[10.5px] text-[#12A150]">지금 게시본</span>}</div><div className="text-[11px] text-[#7A879C] truncate">{h.note} · {h.by}</div></div>
              <button className={btn} onClick={() => restore(h)}>되돌리기</button>
            </div>
          ))}
        </Sec>
        <Sec title="백업 · 초기화">
          <div className="grid grid-cols-2 gap-1.5">
            <button className={btn} onClick={exportJson}>백업 파일 받기</button>
            <label className={cls(btn, "inline-flex items-center justify-center cursor-pointer")}>백업 불러오기<input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importJson(f); }} /></label>
            <button className={cls(btn, "col-span-2 text-[#B42318]")} onClick={resetAll}>처음 홈페이지로 초기화</button>
          </div>
        </Sec>
        <Sec title="홈페이지 주소">
          <LazyInput value={siteUrl} onCommit={(v) => { setSiteUrl(v || DEFAULT_URL); setReady(false); setFrameKey((x) => x + 1); }} />
          <div className="text-[11px] text-[#9AA9C3]">도메인을 새로 연결하면 여기 주소만 바꾸세요.</div>
        </Sec>
      </div>
    );
    return null;
  })();

  const statusText = { saved: "임시 저장됨", saving: "저장 중…", unsaved: "저장 대기", error: "저장 실패" }[saveState];
  return (
    <div className={cls("flex flex-col bg-[#EEF1F6]", full ? "fixed inset-0 z-[80] p-3" : "rounded-[18px] border border-[#E3E8F0] overflow-hidden")} style={full ? undefined : { height: "calc(100vh - 150px)", minHeight: 620 }}>
      {/* 상단 도구줄 */}
      <div className="flex items-center gap-2 flex-wrap px-3 py-2 bg-[#0F1A30] text-white rounded-t-[14px]">
        <div className="flex items-center gap-2 mr-1">
          <span className="text-[10px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>HOMEPAGE</span>
          <span className="text-[14px] font-black">홈페이지 편집</span>
        </div>
        <div className="flex rounded-lg bg-white/10 p-0.5">
          <button type="button" onClick={() => setPreview(false)} className={cls("h-7 px-2.5 rounded-md text-[12px] font-black", !preview ? "bg-white text-[#0F1A30]" : "text-white/70")}>편집</button>
          <button type="button" onClick={() => setPreview(true)} className={cls("h-7 px-2.5 rounded-md text-[12px] font-black", preview ? "bg-white text-[#0F1A30]" : "text-white/70")}>미리보기</button>
        </div>
        <div className="flex rounded-lg bg-white/10 p-0.5">
          {DEVICES.map(([k, l]) => <button key={k} type="button" onClick={() => setDevice(k)} className={cls("h-7 px-2.5 rounded-md text-[12px] font-black", device === k ? "bg-white text-[#0F1A30]" : "text-white/70")}>{l}</button>)}
        </div>
        <button type="button" onClick={undo} disabled={!undoRef.current.length} className="h-8 px-2.5 rounded-lg bg-white/10 text-[12px] font-black disabled:opacity-35" title="실행취소 (Ctrl+Z)">↶ 실행취소</button>
        <button type="button" onClick={redo} disabled={!redoRef.current.length} className="h-8 px-2.5 rounded-lg bg-white/10 text-[12px] font-black disabled:opacity-35" title="다시실행 (Ctrl+Y)">↷ 다시실행</button>
        <span className={cls("text-[11.5px] font-bold", saveState === "error" ? "text-[#FFB3B5]" : "text-white/55")}>{statusText}</span>
        <div className="flex-1" />
        {msg && <span className="text-[12px] font-bold text-[#CFE0FF] truncate max-w-[300px]">{msg}</span>}
        <span className={cls("text-[11.5px] font-black px-2 py-1 rounded-md", dirtyVsLive ? "bg-[#F5A524]/20 text-[#FFD48A]" : "bg-[#2BD17E]/15 text-[#7EF0B5]")}>{dirtyVsLive ? "게시 안 한 변경 있음" : "홈페이지와 같음"}</span>
        <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="h-8 px-2.5 rounded-lg bg-white/10 text-[12px] font-black inline-flex items-center">홈페이지 열기 ↗</a>
        <button type="button" onClick={() => setFull((x) => !x)} className="h-8 px-2.5 rounded-lg bg-white/10 text-[12px] font-black">{full ? "창 작게" : "전체 화면"}</button>
        <button type="button" onClick={publish} disabled={busy || !state} className="h-8 px-3.5 rounded-lg bg-[#2D5BD8] text-white text-[12.5px] font-black disabled:opacity-40 hover:bg-[#3A66E0]">게시하기</button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* 왼쪽 패널 */}
        <aside className="w-[340px] shrink-0 bg-white border-r border-[#E3E8F0] flex flex-col min-h-0">
          <div className="grid grid-cols-4 gap-1 p-2 border-b border-[#E8EDF4] bg-[#F7F9FC]">
            {tabs.map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={cls("h-8 rounded-lg text-[12px] font-black", tab === k ? "bg-[#0F1A30] text-white" : "text-[#5B6B85] hover:bg-white")}>{l}</button>)}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">{panel}</div>
        </aside>

        {/* 가운데: 홈페이지 */}
        <div ref={wrapRef} className="flex-1 min-w-0 overflow-hidden relative flex justify-center pt-3" style={{ background: "linear-gradient(rgba(27,43,75,.05) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(27,43,75,.05) 1px, transparent 1px) 0 0/22px 22px, #E6EBF3" }}>
          {!ready && <div className="absolute inset-0 grid place-items-center text-[13px] text-[#5B6B85] font-bold pointer-events-none z-10">
            <div className="text-center bg-white/90 rounded-2xl px-6 py-5 shadow">홈페이지를 불러오는 중…<div className="text-[11.5px] text-[#9AA9C3] mt-1 font-semibold">계속 안 뜨면 [이력] 탭에서 홈페이지 주소를 확인하세요<br />{siteUrl}</div></div>
          </div>}
          <div style={{ width: devW, height: `calc((100% - 12px) / ${scale})`, transform: `scale(${scale})`, transformOrigin: "top center" }} className={cls("bg-white shadow-[0_20px_60px_rgba(15,26,48,.18)] shrink-0", device !== "pc" && "rounded-[18px] overflow-hidden ring-8 ring-[#0B1428]")}>
            <iframe key={frameKey} ref={iframeRef} title="홈페이지 편집" src={frameSrc} className="w-full h-full border-0 block" onLoad={() => setTimeout(() => setReady((r) => r), 0)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FindReplace({ onRun }) {
  const [a, setA] = React.useState(""); const [b, setB] = React.useState("");
  return (
    <div className="space-y-1.5">
      <input className={inp} value={a} onChange={(e) => setA(e.target.value)} placeholder="찾을 글자 (예: LogisWeb)" />
      <input className={inp} value={b} onChange={(e) => setB(e.target.value)} placeholder="바꿀 글자" />
      <button type="button" className={cls(btnDark, "w-full")} disabled={!a} onClick={() => onRun(a, b)}>모두 바꾸기</button>
    </div>
  );
}
