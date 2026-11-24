// ======================= src/tableXNav.js =======================
// ↔ 2026-11-24 넓은 표 좌우 이동(사용자 요청 · 시안 4) — PC 전용, 프로그램의 모든 넓은 표에 한 번에 붙는다(main.jsx 에서 설치)
//  ① 가장자리 화살표: 숨은 열이 있을 때만 표 끝이 은은하게 흐려지고 둥근 화살표 + "청구운임 · 기사운임 외 2열"
//     마우스를 대고 있으면 천천히 흘러가고, 누르면 한 화면씩
//  ② 아래 떠 있는 구역 막대: 표의 진짜 가로 막대가 화면 아래로 사라졌을 때만 화면 아래 가운데에 — 끌기 · 구역 이름 누르면 그 열로
//  ③ 제목 줄에서 휠: 표 머리줄 위에서 휠을 굴리면 Shift 없이 좌우로(처음 한 번 작은 안내)
//  · 표에 마우스가 있을 때만 · 입력 중이면 숨김 · 열이 다 보이면 아무것도 안 뜸 · 휴대폰(손가락)은 안 씀
//  · 화면 코드는 건드리지 않는다 — 마우스가 올라간 곳에서 가로로 스크롤되는 상자(표가 든)를 찾아 그 위에 띄운다
const NS = "kp-xnav";
const MIN_EXTRA = 24; // 이만큼 넘쳐야 "넓은 표"
const Z = 2147482400;
const GOLD = "#D7BC82", GOLD_HI = "#F3E3BC", NAVY = "#0F1A30";

let installed = false;
export function installTableXNav() {
  if (installed || typeof window === "undefined" || typeof document === "undefined") return;
  if (!window.matchMedia || !window.matchMedia("(pointer: fine)").matches) return; // 손가락 기기는 그대로 밀면 된다
  installed = true;

  const css = document.createElement("style");
  css.textContent = `
.${NS}-fade{position:fixed;pointer-events:none;z-index:${Z};transition:opacity .18s}
.${NS}-btn{position:fixed;z-index:${Z + 1};width:40px;height:40px;border-radius:50%;display:grid;place-items:center;cursor:pointer;border:0;
  font-weight:900;font-size:18px;line-height:1;font-family:inherit;transition:opacity .18s,transform .18s;box-shadow:0 8px 22px rgba(11,20,40,.28)}
.${NS}-btn:hover{transform:scale(1.06)}
.${NS}-btn.r{background:${NAVY};color:${GOLD_HI}}
.${NS}-btn.l{background:#fff;color:#1B2B4B;border:1px solid #DCE3EE;width:34px;height:34px;font-size:15px;box-shadow:0 6px 16px rgba(11,20,40,.12)}
.${NS}-more{position:fixed;z-index:${Z + 1};pointer-events:none;font-weight:900;font-size:11.5px;line-height:1;font-family:inherit;color:#2D4C82;background:#EEF3FC;border:1px solid #DCE6F8;border-radius:8px;padding:6px 8px;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis;transition:opacity .18s}
.${NS}-bar{position:fixed;z-index:${Z + 2};display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:15px;background:rgba(11,20,40,.94);
  box-shadow:0 14px 36px rgba(11,20,40,.35);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:opacity .2s,transform .2s;user-select:none}
.${NS}-bar.hide{opacity:0;transform:translateY(8px);pointer-events:none}
.${NS}-nb{width:28px;height:28px;border-radius:9px;background:rgba(255,255,255,.08);color:${GOLD_HI};display:grid;place-items:center;font-weight:900;font-size:13px;line-height:1;font-family:inherit;cursor:pointer;border:0}
.${NS}-nb:hover{background:rgba(255,255,255,.16)}
.${NS}-track{position:relative;height:28px;border-radius:8px;background:rgba(255,255,255,.05);display:flex;overflow:hidden;cursor:pointer}
.${NS}-x{width:24px;height:24px;border-radius:8px;background:transparent;color:rgba(226,232,245,.45);display:grid;place-items:center;font-size:15px;line-height:1;cursor:pointer;border:0;margin-left:-2px}
.${NS}-x:hover{color:#fff;background:rgba(255,255,255,.1)}
.${NS}-seg{flex:1;display:grid;place-items:center;font-weight:800;font-size:11px;line-height:1;font-family:inherit;color:rgba(226,232,245,.55);border-right:1px solid rgba(255,255,255,.06);white-space:nowrap;overflow:hidden;padding:0 6px;text-overflow:ellipsis}
.${NS}-seg:last-of-type{border-right:0}
.${NS}-seg:hover{color:#fff}
.${NS}-seg.on{color:${GOLD_HI}}
.${NS}-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;border:1.5px solid ${GOLD};background:rgba(215,188,130,.14);box-shadow:0 0 14px rgba(215,188,130,.25);cursor:grab}
.${NS}-thumb:active{cursor:grabbing}
.${NS}-tip{position:fixed;z-index:${Z + 3};font-weight:800;font-size:12px;line-height:1.4;font-family:inherit;color:#fff;background:${NAVY};border:1px solid rgba(215,188,130,.45);border-radius:10px;padding:7px 11px;pointer-events:none;box-shadow:0 10px 26px rgba(11,20,40,.3);transition:opacity .3s}
`;
  document.head.appendChild(css);

  const mk = (tag, cls, html) => { const e = document.createElement(tag); e.className = cls; if (html != null) e.innerHTML = html; e.style.opacity = "0"; e.style.display = "none"; document.body.appendChild(e); return e; };
  const fadeL = mk("div", `${NS}-fade`); const fadeR = mk("div", `${NS}-fade`);
  const btnL = mk("button", `${NS}-btn l`, "&#8249;"); const btnR = mk("button", `${NS}-btn r`, "&#8250;");
  btnL.type = "button"; btnR.type = "button"; btnL.setAttribute("aria-label", "표 왼쪽으로"); btnR.setAttribute("aria-label", "표 오른쪽으로");
  const more = mk("div", `${NS}-more`);
  const bar = mk("div", `${NS}-bar hide`);
  bar.style.display = "flex"; bar.style.opacity = "";
  bar.innerHTML = `<button type="button" class="${NS}-nb" data-d="-1" aria-label="왼쪽">&#8249;</button><div class="${NS}-track"></div><button type="button" class="${NS}-nb" data-d="1" aria-label="오른쪽">&#8250;</button><button type="button" class="${NS}-x" title="잠깐 숨기기(1시간)" aria-label="잠깐 숨기기">&#215;</button>`;
  const track = bar.querySelector(`.${NS}-track`);
  const thumb = document.createElement("div"); thumb.className = `${NS}-thumb`;

  let box = null; // 지금 마우스가 있는 넓은 표 상자
  let hoverUntil = 0; let segKey = ""; let segs = [];
  let flow = 0; let flowRaf = 0; let dragging = null;
  const cache = new WeakMap();

  // 잠깐 숨기기 — [×] 누르면 1시간 동안 화살표 · 막대 모두 숨김(이 브라우저)
  let hideUntil = 0; try { hideUntil = Number(localStorage.getItem("kpXnavHide") || 0); } catch { /* 무시 */ }
  // 화면 아래 가운데에 다른 막대(선택 모드 · 알림 등)가 떠 있으면 구역 막대를 띄우지 않는다(두 줄로 겹쳐 보이지 않게)
  let busyAt = 0; let busy = false;
  const bottomBusy = () => {
    const now = Date.now(); if (now - busyAt < 250) return busy; busyAt = now;
    const vw = window.innerWidth; const vh = window.innerHeight; busy = false;
    for (const x of [vw / 2, vw / 2 - 180, vw / 2 + 180]) {
      for (const y of [vh - 24, vh - 44]) {
        const els = document.elementsFromPoint(x, y) || [];
        for (const el of els) {
          if (el.closest?.(`[class^="${NS}"],[class*=" ${NS}-"]`)) continue;
          let n = el; let fixed = null;
          while (n && n !== document.body) { if (getComputedStyle(n).position === "fixed") { fixed = n; break; } n = n.parentElement; }
          if (fixed) { const r = fixed.getBoundingClientRect(); if (r.height < vh * 0.5 && r.bottom > vh - 90) { busy = true; return busy; } }
          break; // 맨 위 요소만 본다
        }
      }
    }
    return busy;
  };
  const show = (el, on) => { if (on) { el.style.display = ""; el.style.opacity = "1"; } else { el.style.opacity = "0"; el.style.display = "none"; } };
  const isWide = (el) => el.scrollWidth > el.clientWidth + MIN_EXTRA;
  // 마우스 아래에서 가로로 넘치는(표가 든) 상자 찾기 — 0.8초 동안 같은 요소는 다시 재지 않는다
  const findBox = (t) => {
    let el = t && t.nodeType === 1 ? t : t?.parentElement;
    if (!el || el.closest?.(`[class^="${NS}"]`)) return null;
    const hit = cache.get(el); const now = Date.now();
    if (hit && now - hit.at < 800) return hit.box;
    let found = null; let n = el; let depth = 0;
    while (n && n !== document.body && depth < 25) {
      const cs = getComputedStyle(n);
      if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && isWide(n) && n.querySelector("table")) { found = n; break; }
      n = n.parentElement; depth += 1;
    }
    cache.set(el, { box: found, at: now });
    return found;
  };
  // 표 바탕이 어두우면(관리센터 등) 어두운 흐림
  let fadeRGB = "255,255,255";
  const bgOf = (el) => { let n = el; while (n && n !== document.documentElement) { const c = getComputedStyle(n).backgroundColor; const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/); if (m && (m[4] === undefined || Number(m[4]) > 0.5)) return [m[1], m[2], m[3]].map(Number); n = n.parentElement; } return [255, 255, 255]; };
  const typing = () => { const a = document.activeElement; return !!(a && box && box.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); };
  const headCells = (b) => { const tb = b.querySelector("table"); if (!tb) return []; const tr = tb.tHead?.rows?.[tb.tHead.rows.length - 1] || tb.rows?.[0]; return tr ? [...tr.cells] : []; };
  const cellText = (c) => String(c.textContent || "").replace(/\s+/g, " ").trim().slice(0, 12);

  // 구역(막대 칸) — 머리줄 칸을 고르게 5~6구역으로 나눠 첫 칸 이름을 붙인다
  const buildSegs = (b) => {
    const cells = headCells(b).filter((c) => c.offsetWidth > 0);
    const W = b.scrollWidth; const n = Math.max(3, Math.min(6, Math.round(W / Math.max(b.clientWidth / 2, 300))));
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const from = (W * i) / n; const to = (W * (i + 1)) / n;
      const c = cells.find((x) => x.offsetLeft >= from - 2 && x.offsetLeft < to) || null;
      out.push({ from, to, label: c ? cellText(c) || `${i + 1}` : `${i + 1}`, left: c ? c.offsetLeft : from });
    }
    return out;
  };

  const place = () => {
    if (!box || !box.isConnected || !isWide(box) || typing() || Date.now() > hoverUntil || Date.now() < hideUntil) { hideAll(); return; }
    const r = box.getBoundingClientRect();
    const vh = window.innerHeight; const vw = window.innerWidth;
    const top = Math.max(r.top, 0); const bottom = Math.min(r.bottom, vh);
    if (bottom - top < 60 || r.right < 0 || r.left > vw) { hideAll(); return; }
    const max = box.scrollWidth - box.clientWidth; const x = box.scrollLeft;
    const canL = x > 2; const canR = x < max - 2;
    const midY = top + (bottom - top) / 2;
    const left = Math.max(r.left, 0); const right = Math.min(r.right, vw);
    // ① 가장자리
    Object.assign(fadeR.style, { left: `${right - 110}px`, top: `${top}px`, width: "110px", height: `${bottom - top}px`, background: `linear-gradient(90deg,rgba(${fadeRGB},0),rgba(${fadeRGB},.92) 75%)` });
    Object.assign(fadeL.style, { left: `${left}px`, top: `${top}px`, width: "64px", height: `${bottom - top}px`, background: `linear-gradient(270deg,rgba(${fadeRGB},0),rgba(${fadeRGB},.88) 75%)` });
    show(fadeR, canR); show(btnR, canR); show(fadeL, canL); show(btnL, canL);
    Object.assign(btnR.style, { left: `${right - 52}px`, top: `${midY - 20}px` });
    Object.assign(btnL.style, { left: `${left + 12}px`, top: `${midY - 17}px` });
    if (canR) {
      const hidden = headCells(box).filter((c) => c.offsetWidth > 0 && c.offsetLeft + c.offsetWidth / 2 > x + box.clientWidth);
      const names = hidden.slice(0, 2).map(cellText).filter(Boolean);
      more.textContent = hidden.length ? `${names.join(" · ")}${hidden.length > names.length ? ` 외 ${hidden.length - names.length}열` : ""}` : "";
      show(more, !!hidden.length);
      if (hidden.length) { const w = more.offsetWidth; Object.assign(more.style, { left: `${right - 60 - w}px`, top: `${midY - 12}px` }); }
    } else show(more, false);
    // ② 아래 구역 막대 — 표의 진짜 가로 막대(상자 아래 끝)가 화면 밖일 때만
    const barOn = r.bottom > vh + 4 && r.top < vh - 140 && !bottomBusy();
    if (barOn) {
      const key = `${box.scrollWidth}|${box.clientWidth}|${headCells(box).length}`;
      if (key !== segKey || !track.childElementCount) {
        segKey = key; segs = buildSegs(box);
        track.innerHTML = segs.map((s, i) => `<span class="${NS}-seg" data-i="${i}" title="${s.label} 열로">${s.label.replace(/[<>&"]/g, "")}</span>`).join("");
        track.appendChild(thumb);
      }
      const tw = Math.min(600, Math.max(320, (right - left) * 0.55));
      track.style.width = `${tw}px`;
      const ratio = box.clientWidth / box.scrollWidth;
      thumb.style.width = `${Math.max(24, tw * ratio)}px`;
      thumb.style.left = `${(x / box.scrollWidth) * tw}px`;
      [...track.querySelectorAll(`.${NS}-seg`)].forEach((el, i) => { const s = segs[i]; el.classList.toggle("on", !!s && s.to > x && s.from < x + box.clientWidth); });
      bar.classList.remove("hide");
      const bw = bar.offsetWidth;
      Object.assign(bar.style, { left: `${Math.min(vw - bw - 8, Math.max(8, left + (right - left) / 2 - bw / 2))}px`, top: `${vh - bar.offsetHeight - 16}px` });
    } else bar.classList.add("hide");
  };
  const hideAll = () => { [fadeL, fadeR, btnL, btnR, more].forEach((e) => show(e, false)); bar.classList.add("hide"); stopFlow(); };

  let raf = 0;
  const tick = () => { raf = 0; place(); if (box && Date.now() <= hoverUntil) raf = requestAnimationFrame(tick); };
  const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };

  // 마우스 위치 — 넓은 표 위면 그 상자를 잡고 1.2초 동안 유지(화살표 · 막대로 옮겨 가는 사이 사라지지 않게)
  let mmRaf = 0; let lastT = null;
  document.addEventListener("mousemove", (e) => {
    lastT = e.target;
    if (mmRaf) return;
    mmRaf = requestAnimationFrame(() => {
      mmRaf = 0;
      const t = lastT;
      if (t && t.closest && t.closest(`.${NS}-bar, .${NS}-btn`)) { hoverUntil = Date.now() + 1500; wake(); return; }
      const b = findBox(t);
      if (b) { if (b !== box) { box = b; segKey = ""; const [r0, g0, b0] = bgOf(b); fadeRGB = `${r0},${g0},${b0}`; } hoverUntil = Date.now() + 1200; wake(); }
    });
  }, { passive: true });
  window.addEventListener("scroll", () => { if (box) wake(); }, { passive: true, capture: true });
  window.addEventListener("resize", () => { if (box) wake(); }, { passive: true });

  // 흘러가기(화살표에 마우스를 대고 있는 동안) · 누르면 한 화면씩
  const stepFlow = () => { if (!box || !flow) { flowRaf = 0; return; } box.scrollLeft += flow * 9; hoverUntil = Date.now() + 1500; flowRaf = requestAnimationFrame(stepFlow); };
  const startFlow = (d) => { flow = d; if (!flowRaf) flowRaf = requestAnimationFrame(stepFlow); };
  const stopFlow = () => { flow = 0; if (flowRaf) cancelAnimationFrame(flowRaf); flowRaf = 0; };
  let flowTimer = 0;
  [[btnL, -1], [btnR, 1]].forEach(([b, d]) => {
    b.addEventListener("mouseenter", () => { clearTimeout(flowTimer); flowTimer = setTimeout(() => startFlow(d), 380); });
    b.addEventListener("mouseleave", () => { clearTimeout(flowTimer); stopFlow(); });
    b.addEventListener("mousedown", (e) => e.preventDefault()); // 입력칸 포커스를 빼앗지 않게
    b.addEventListener("click", () => { clearTimeout(flowTimer); stopFlow(); if (box) box.scrollBy({ left: d * box.clientWidth * 0.8, behavior: "smooth" }); hoverUntil = Date.now() + 1500; wake(); });
  });
  bar.addEventListener("mousedown", (e) => e.preventDefault());
  bar.querySelector(`.${NS}-x`).addEventListener("click", () => {
    hideUntil = Date.now() + 60 * 60 * 1000; try { localStorage.setItem("kpXnavHide", String(hideUntil)); } catch { /* 무시 */ }
    hideAll();
    const tip = document.createElement("div"); tip.className = `${NS}-tip`; tip.textContent = "표 좌우 이동 도우미를 1시간 동안 숨겨요";
    document.body.appendChild(tip); tip.style.left = `${Math.max(8, window.innerWidth / 2 - 130)}px`; tip.style.top = `${window.innerHeight - 64}px`;
    setTimeout(() => { tip.style.opacity = "0"; setTimeout(() => tip.remove(), 400); }, 2400);
  });
  bar.querySelectorAll(`.${NS}-nb`).forEach((b) => b.addEventListener("click", () => { if (box) box.scrollBy({ left: Number(b.dataset.d) * box.clientWidth * 0.8, behavior: "smooth" }); }));
  track.addEventListener("click", (e) => {
    if (!box || e.target === thumb) return;
    const seg = e.target.closest?.(`.${NS}-seg`);
    if (seg && segs[Number(seg.dataset.i)]) { box.scrollTo({ left: Math.max(0, segs[Number(seg.dataset.i)].left - 40), behavior: "smooth" }); return; }
    const rr = track.getBoundingClientRect();
    box.scrollTo({ left: ((e.clientX - rr.left) / rr.width) * box.scrollWidth - box.clientWidth / 2, behavior: "smooth" });
  });
  thumb.addEventListener("mousedown", (e) => { if (!box) return; e.preventDefault(); dragging = { x: e.clientX, s: box.scrollLeft, w: track.getBoundingClientRect().width }; });
  window.addEventListener("mousemove", (e) => { if (!dragging || !box) return; box.scrollLeft = dragging.s + ((e.clientX - dragging.x) / dragging.w) * box.scrollWidth; hoverUntil = Date.now() + 1500; wake(); }, { passive: true });
  window.addEventListener("mouseup", () => { dragging = null; });

  // ③ 제목 줄에서 휠 = 좌우(Shift 없이) — 본문은 그대로 위아래
  let tipShown = false; try { tipShown = localStorage.getItem("kpXnavTip") === "1"; } catch { /* 무시 */ }
  document.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const th = e.target?.closest?.("thead, th");
    if (!th) return;
    const b = findBox(th);
    if (!b) return;
    const max = b.scrollWidth - b.clientWidth;
    if ((e.deltaY < 0 && b.scrollLeft <= 0) || (e.deltaY > 0 && b.scrollLeft >= max - 1)) return; // 끝이면 원래대로(위아래)
    e.preventDefault();
    b.scrollLeft += e.deltaY;
    box = b; hoverUntil = Date.now() + 1200; wake();
    if (!tipShown) {
      tipShown = true; try { localStorage.setItem("kpXnavTip", "1"); } catch { /* 무시 */ }
      const tip = document.createElement("div"); tip.className = `${NS}-tip`; tip.textContent = "제목 줄에서 휠을 굴리면 표가 좌우로 움직여요";
      document.body.appendChild(tip);
      const r = th.getBoundingClientRect(); tip.style.left = `${Math.max(8, Math.min(window.innerWidth - 300, e.clientX - 140))}px`; tip.style.top = `${Math.max(8, r.top - 40)}px`;
      setTimeout(() => { tip.style.opacity = "0"; setTimeout(() => tip.remove(), 400); }, 2600);
    }
  }, { passive: false });
}
