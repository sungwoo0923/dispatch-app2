// LogisWeb 홍보영상 타임라인 엔진 — 시간(t초)을 넣으면 화면을 그 순간 모습으로 맞춰요.
// 브라우저로 그냥 열면 재생 미리보기, render.mjs 가 한 장씩 찍어서 mp4로 만들어요.
// 속성: data-in(등장 초) data-out(퇴장 초) data-a(fade|up|down|left|right|zoom|pop|blur) data-d(애니 길이)
//       data-kb="1,1.15"(서서히 확대) data-pan="x0,y0,x1,y1"(서서히 이동) data-count="0,120"(숫자 올라감)
//       data-type(글자 타자) data-td(타자 길이) data-v(영상 시작 초) data-rate(영상 속도) data-vfrom(영상 몇 초부터)
(function () {
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  const easeIO = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const cl = (x) => Math.max(0, Math.min(1, x));
  const num = (el, k, d) => (el.dataset[k] !== undefined ? parseFloat(el.dataset[k]) : d);
  let els = [], vids = [], typed = [], caps = null;
  function init() {
    els = [...document.querySelectorAll("[data-in]")];
    vids = [...document.querySelectorAll("video[data-v]")];
    typed = [...document.querySelectorAll("[data-type]")].map((el) => ({ el, txt: el.textContent }));
    vids.forEach((v) => { v.muted = true; v.preload = "auto"; v.pause(); });
    caps = document.getElementById("cap");
  }
  function anim(el, t) {
    const tin = num(el, "in", 0), tout = num(el, "out", 1e9), d = num(el, "d", 0.5);
    const a = el.dataset.a || "fade";
    let p = ease(cl((t - tin) / d)), q = ease(cl((tout - t) / Math.min(d, 0.4)));
    if (t < tin || t > tout) { el.style.opacity = 0; el.style.visibility = "hidden"; return; }
    el.style.visibility = "visible";
    const v = Math.min(p, q); let tr = "";
    const dist = num(el, "dist", 80);
    if (a === "up") tr = `translateY(${(1 - p) * dist}px)`;
    if (a === "down") tr = `translateY(${-(1 - p) * dist}px)`;
    if (a === "left") tr = `translateX(${(1 - p) * dist * 1.5}px)`;
    if (a === "right") tr = `translateX(${-(1 - p) * dist * 1.5}px)`;
    if (a === "zoom") tr = `scale(${1.25 - 0.25 * p})`;
    if (a === "pop") { const s = p < 1 ? 0.6 + 0.4 * p + Math.sin(p * Math.PI) * 0.12 : 1; tr = `scale(${s})`; }
    if (el.dataset.kb) { const [s0, s1] = el.dataset.kb.split(",").map(Number); const k = easeIO(cl((t - tin) / Math.max(0.1, Math.min(tout, tin + 30) - tin))); tr += ` scale(${s0 + (s1 - s0) * k})`; }
    if (el.dataset.pan) { const [x0, y0, x1, y1] = el.dataset.pan.split(",").map(Number); const k = easeIO(cl((t - tin - num(el, "pd", 0)) / Math.max(0.1, num(el, "pt", Math.min(tout, tin + 30) - tin)))); tr += ` translate(${x0 + (x1 - x0) * k}px,${y0 + (y1 - y0) * k}px)`; }
    el.style.opacity = a === "none" ? 1 : v;
    if (a === "blur") el.style.filter = `blur(${(1 - p) * 24}px)`;
    el.style.transform = (el.dataset.base || "") + " " + tr;
    if (el.dataset.count) {
      const [f, to] = el.dataset.count.split(",").map(Number); const k = ease(cl((t - tin) / num(el, "cd", 1.2)));
      const val = f + (to - f) * k; const dec = num(el, "dec", 0);
      el.textContent = (el.dataset.pre || "") + val.toLocaleString("ko-KR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (el.dataset.suf || "");
    }
  }
  window.__seek = async function (t) {
    if (!els.length) init();
    els.forEach((el) => anim(el, t));
    typed.forEach(({ el, txt }) => { const tin = num(el, "in", 0), td = num(el, "td", 1.5); const n = Math.round(txt.length * cl((t - tin) / td)); el.textContent = txt.slice(0, n); el.classList.toggle("typing", n < txt.length && t >= tin); });
    if (caps && window.__CAPS) {
      const c = window.__CAPS.find((c) => t >= c.t0 && t <= c.t1 + 0.15);
      caps.textContent = c ? c.text : ""; caps.style.opacity = c ? 1 : 0;
    }
    const jobs = vids.map((v) => {
      const st = num(v, "v", 0), rate = num(v, "rate", 1), from = num(v, "vfrom", 0);
      if (t < st - 0.5) return null;
      let ct = from + Math.max(0, t - st) * rate; const dur = v.duration || 1e9;
      if (v.dataset.loop !== undefined) ct = ct % (dur - 0.05); else ct = Math.min(ct, dur - 0.05);
      if (Math.abs(v.currentTime - ct) < 0.001) return null;
      return new Promise((res) => { const done = () => { v.removeEventListener("seeked", done); res(); }; v.addEventListener("seeked", done); v.currentTime = ct; setTimeout(res, 3000); });
    }).filter(Boolean);
    await Promise.all(jobs);
  };
  window.__ready = async function () {
    init();
    await document.fonts.ready;
    await Promise.all(vids.map((v) => (v.readyState >= 2 ? 0 : new Promise((r) => { v.addEventListener("loadeddata", r, { once: true }); setTimeout(r, 8000); }))));
    await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
    return true;
  };
  // 그냥 열었을 때: 미리보기 재생 (?t=12 로 특정 순간 보기)
  window.addEventListener("load", async () => {
    if (navigator.webdriver) return;
    await window.__ready();
    const q = new URLSearchParams(location.search); if (q.has("t")) return window.__seek(+q.get("t"));
    const fit = () => { const s = Math.min(innerWidth / document.body.offsetWidth, innerHeight / document.body.offsetHeight); document.body.style.transform = `scale(${s})`; document.body.style.transformOrigin = "0 0"; };
    fit(); addEventListener("resize", fit);
    const t0 = performance.now(); const D = (window.SCENE && SCENE.duration) || 30; let busy = false;
    const loop = async () => { if (!busy) { busy = true; await window.__seek(((performance.now() - t0) / 1000) % D); busy = false; } requestAnimationFrame(loop); };
    loop();
  });
})();
