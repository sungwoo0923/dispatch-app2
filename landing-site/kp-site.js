/* ======================= landing-site/kp-site.js =======================
   홈페이지 편집 엔진 (2026-11-03)
   ① 방문자 화면: 관리자센터 › 운영 › 홈페이지에서 "게시"한 편집 내용을 서버에서 읽어 이 페이지에 적용한다.
   ② 편집 화면(?kpedit=1, 관리자센터 안의 미리보기 틀): 요소를 눌러 고르고, 두 번 눌러 글을 고치고,
      끌어서 옮기고, 모서리를 끌어 크기를 바꾼다. 바뀐 내용은 관리자센터(부모 창)로 보내 저장한다.
   편집 내용 구조(state)
   { v:1,
     page: { title, description, font, vars:{ "--accent":"#.." }, css },
     ops:  [ {op:"clone", src, key} | {op:"add", kind, key, ref, pos} | {op:"move", key, ref, pos} ],
     els:  { [data-k]: { html, attrs:{href,src,alt,placeholder,target,required}, options:[..], icon, hidden, style:{..}, styleM:{..} } } }
   ※ 모든 요소에는 index.html에 data-k="eN" 번호가 붙어 있다(tools/add-keys.py). */
(function () {
  "use strict";
  var ED = /[?&]kpedit=1(&|$)/.test(location.search);
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var REST = LOCAL
    ? "http://127.0.0.1:8080/v1/projects/demo-kpflow/databases/(default)/documents/siteConfig/landing"
    : "https://firestore.googleapis.com/v1/projects/dispatch-app-9b92f/databases/(default)/documents/siteConfig/landing?mask.fieldPaths=homepage";
  var CACHE = "kpHomepageLive";
  var pristine = null;      // 편집 전 원래 body
  var state = null;         // 지금 적용된 편집 내용
  var MOBILE_MAX = 720;

  // ───────────── 공통 도구 ─────────────
  function $(q, r) { return (r || document).querySelector(q); }
  function $$(q, r) { return Array.prototype.slice.call((r || document).querySelectorAll(q)); }
  function byKey(k) { return document.querySelector('[data-k="' + String(k).replace(/"/g, "") + '"]'); }
  function clone(o) { return JSON.parse(JSON.stringify(o || {})); }
  function emptyState() { return { v: 1, page: {}, ops: [], els: {} }; }
  function cssProp(p) { return p.replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase(); }); }

  // 글 편집 내용 정리 — 허용한 태그·속성만 남긴다(스크립트·이벤트 속성 제거)
  var OK_TAGS = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, BR: 1, SPAN: 1, SMALL: 1, A: 1, MARK: 1, SUP: 1, SUB: 1, EM: 1, P: 1, DIV: 1, SVG: 1, USE: 1, LI: 1, UL: 1, OL: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, IMG: 1, BUTTON: 1, LABEL: 1, I: 1, VIDEO: 1, SOURCE: 1 };
  var OK_ATTR = { "class": 1, "data-k": 1, href: 1, target: 1, rel: 1, style: 1, src: 1, alt: 1, width: 1, height: 1, "data-t": 1, "data-modal": 1, "data-clip": 1, autoplay: 1, muted: 1, loop: 1, playsinline: 1, preload: 1, poster: 1, "aria-label": 1, type: 1, role: 1 };
  function cleanStyle(v) {
    return String(v || "").split(";").map(function (s) { return s.trim(); }).filter(function (s) {
      return /^(color|background-color|font-weight|font-size|font-style|text-decoration|letter-spacing)\s*:/i.test(s) && !/url\(|expression|javascript/i.test(s);
    }).join("; ");
  }
  function sanitize(html) {
    var doc = new DOMParser().parseFromString("<div>" + String(html || "") + "</div>", "text/html");
    var root = doc.body.firstChild;
    (function walk(n) {
      Array.prototype.slice.call(n.childNodes).forEach(function (c) {
        if (c.nodeType === 8) { c.remove(); return; }
        if (c.nodeType !== 1) return;
        var tag = c.tagName.toUpperCase();
        if (!OK_TAGS[tag]) { if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED)$/.test(tag)) { c.remove(); return; } walk(c); while (c.firstChild) c.parentNode.insertBefore(c.firstChild, c); c.remove(); return; }
        Array.prototype.slice.call(c.attributes).forEach(function (a) {
          var name = a.name.toLowerCase(), val = a.value;
          if (!OK_ATTR[name]) { c.removeAttribute(a.name); return; }
          if ((name === "href" || name === "src") && /^\s*(javascript|data:text)/i.test(val)) c.removeAttribute(a.name);
          if (name === "style") { var cs = cleanStyle(val); if (cs) c.setAttribute("style", cs); else c.removeAttribute("style"); }
        });
        if (tag === "USE") { var h = c.getAttribute("href") || ""; if (h.charAt(0) !== "#") c.removeAttribute("href"); }
        walk(c);
      });
    })(root);
    return root.innerHTML;
  }

  // ───────────── 새로 넣는 요소 틀 ─────────────
  function tpl(kind, k) {
    var K = function (s) { return ' data-k="' + k + (s ? "." + s : "") + '"'; };
    switch (kind) {
      case "heading": return "<h3" + K() + ' class="kp-add-h">새 제목을 입력하세요</h3>';
      case "text": return "<p" + K() + ' class="kp-add-p">새 문장을 입력하세요. 두 번 눌러 고칠 수 있습니다.</p>';
      case "image": return "<img" + K() + ' class="kp-add-img" src="img/real-home.jpg" alt="새 사진" />';
      case "button": return "<a" + K() + ' class="btn btn-primary" href="#inquiry-form">새 버튼</a>';
      case "spacer": return "<div" + K() + ' class="kp-add-spacer" aria-hidden="true"></div>';
      case "card": return "<div" + K() + ' class="mod"><div' + K("i") + ' class="mi"><svg' + K("s") + ' class="i"><use href="#i-check"/></svg></div><h4' + K("t") + ">새 카드 제목</h4><p" + K("d") + ">카드 설명을 입력하세요.</p></div>";
      case "section":
      case "section-dark":
        return "<section" + K() + ' class="block' + (kind === "section-dark" ? " dark-sec dark" : "") + '"><div' + K("w") + ' class="wrap"><div' + K("h") + ' class="head"><span' + K("e") + ' class="eyebrow">NEW SECTION</span><h2' + K("t") + ">새 섹션 제목</h2><p" + K("d") + '>섹션 설명 문장을 입력하세요.</p></div><div' + K("s") + ' class="shot"><img' + K("i") + ' src="img/real-home.jpg" alt="" /></div></div></section>';
      case "section-split":
        return "<section" + K() + ' class="block"><div' + K("w") + ' class="wrap"><div' + K("g") + ' class="panel on"><div' + K("s") + ' class="shot"><img' + K("i") + ' src="img/real-board.jpg" alt="" /></div><div' + K("c") + '><span' + K("e") + ' class="tag">NEW</span><h3' + K("t") + ">새 기능 제목</h3><p" + K("d") + ">기능 설명 문장을 입력하세요.</p></div></div></div></section>";
      case "field-text": return "<div" + K() + "><label" + K("l") + ">새 질문</label><input" + K("i") + ' data-extra="새 질문" placeholder="입력해 주세요" /></div>';
      case "field-textarea": return "<div" + K() + ' class="full"><label' + K("l") + ">새 질문</label><textarea" + K("i") + ' data-extra="새 질문" rows="3" placeholder="입력해 주세요"></textarea></div>';
      case "field-select": return "<div" + K() + "><label" + K("l") + ">새 선택 항목</label><select" + K("i") + ' data-extra="새 선택 항목"><option value="">선택해 주세요</option><option>항목 1</option><option>항목 2</option></select></div>';
      case "nav-link": return "<a" + K() + ' href="#inquiry-form">새 메뉴</a>';
    }
    return "<div" + K() + ">새 요소</div>";
  }
  function fromHtml(h) { var t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstChild; }
  function place(node, ref, pos) {
    if (!ref) { document.body.appendChild(node); return; }
    if (pos === "before") ref.parentNode.insertBefore(node, ref);
    else if (pos === "inside") ref.appendChild(node);
    else ref.parentNode.insertBefore(node, ref.nextSibling);
  }

  // ───────────── 적용 ─────────────
  function applyOps(ops) {
    (ops || []).forEach(function (o) {
      try {
        if (o.op === "clone") {
          var src = byKey(o.src); if (!src) return;
          var c = src.cloneNode(true);
          c.setAttribute("data-k", o.key);
          $$("[data-k]", c).forEach(function (d) { d.setAttribute("data-k", o.key + "." + d.getAttribute("data-k")); });
          [c].concat($$("[id]", c)).forEach(function (d) { if (d.id) d.removeAttribute("id"); });
          src.parentNode.insertBefore(c, src.nextSibling);
        } else if (o.op === "add") {
          var n = fromHtml(tpl(o.kind, o.key)); place(n, byKey(o.ref), o.pos);
        } else if (o.op === "move") {
          var el = byKey(o.key), ref = byKey(o.ref); if (el && ref && !el.contains(ref)) place(el, ref, o.pos);
        }
      } catch (e) { /* 원본이 바뀌어 대상이 없으면 건너뜀 */ }
    });
  }
  function depth(el) { var d = 0; while (el && el !== document.body) { d++; el = el.parentElement; } return d; }
  function applyEls(els) {
    var keys = Object.keys(els || {});
    // html은 바깥 요소부터(안쪽 요소의 편집이 덮이지 않게)
    keys.map(function (k) { return [k, byKey(k)]; }).filter(function (x) { return x[1] && els[x[0]].html != null; })
      .sort(function (a, b) { return depth(a[1]) - depth(b[1]); })
      .forEach(function (x) {
        var el = byKey(x[0]); if (!el) return;
        var h = els[x[0]].html;
        // 원본에 영상이 있는데 저장된 내용에는 없으면(영상으로 바뀌기 전에 저장한 편집) 원본을 그대로 둔다
        if (el.querySelector("video") && !/<video/i.test(h)) return;
        el.innerHTML = sanitize(h);
      });
    keys.forEach(function (k) {
      var e = els[k], el = byKey(k); if (!el || !e) return;
      if (e.attrs) Object.keys(e.attrs).forEach(function (a) {
        var v = e.attrs[a];
        if (a === "required") { if (v) el.setAttribute("required", ""); else el.removeAttribute("required"); return; }
        if ((a === "href" || a === "src") && /^\s*javascript/i.test(v)) return;
        if (v === null || v === "") el.removeAttribute(a); else el.setAttribute(a, v);
      });
      if (e.options && el.tagName === "SELECT") {
        el.innerHTML = "";
        e.options.forEach(function (t, i) { var o = document.createElement("option"); o.textContent = t; if (i === 0 && /선택/.test(t)) o.value = ""; el.appendChild(o); });
      }
      if (e.icon) { var u = el.tagName.toLowerCase() === "svg" ? $("use", el) : null; if (u) u.setAttribute("href", "#" + e.icon); }
    });
    // 추가한 질문 칸 — 저장 이름을 질문 글자로
    $$("[data-extra]").forEach(function (f) { var l = f.parentElement && $("label", f.parentElement); if (l) f.setAttribute("data-extra", l.textContent.trim()); });
  }
  function styleText(st) {
    var out = [], mob = [];
    var els = st.els || {};
    Object.keys(els).forEach(function (k) {
      var e = els[k], sel = '[data-k="' + k + '"]';
      var decl = [];
      if (e.hidden) decl.push("display:none!important");
      if (e.style) Object.keys(e.style).forEach(function (p) { if (e.style[p] !== "" && e.style[p] != null) decl.push(cssProp(p) + ":" + e.style[p] + "!important"); });
      if (decl.length) out.push(sel + "{" + decl.join(";") + "}");
      if (e.styleM) { var dm = []; Object.keys(e.styleM).forEach(function (p) { if (e.styleM[p] !== "" && e.styleM[p] != null) dm.push(cssProp(p) + ":" + e.styleM[p] + "!important"); }); if (dm.length) mob.push(sel + "{" + dm.join(";") + "}"); }
    });
    var p = st.page || {};
    var vars = p.vars || {};
    var vk = Object.keys(vars).filter(function (k) { return /^--[a-z0-9-]+$/i.test(k) && vars[k]; });
    var head = vk.length ? ":root{" + vk.map(function (k) { return k + ":" + vars[k]; }).join(";") + "}" : "";
    if (p.font) head += "body{font-family:" + p.font + ",\"Pretendard\",\"Noto Sans KR\",system-ui,sans-serif!important}";
    return head + out.join("\n") + (mob.length ? "\n@media (max-width:" + MOBILE_MAX + "px){" + mob.join("\n") + "}" : "") + "\n" + String(p.css || "").replace(/<\/?style/gi, "");
  }
  function applyPage(st) {
    var p = st.page || {};
    if (p.title) document.title = p.title;
    if (p.description) { var m = $('meta[name="description"]'); if (m) m.setAttribute("content", p.description); }
    var tag = document.getElementById("kp-site-style");
    if (!tag) { tag = document.createElement("style"); tag.id = "kp-site-style"; document.head.appendChild(tag); }
    tag.textContent = styleText(st);
  }
  // 🔷 2026-11-04 이름·로고 교체(KP-Flow → LogisWeb) — 예전에 게시해 둔 편집 내용에 옛 이름·옛 로고가 남아 있어도
  //  화면에는 항상 새 이름과 새 로고(마크 + 흰색·하늘색 글자 로고)가 보이게 한다.
  var OLD_NAME = /KP[- ]?Flow/gi;
  function fixBrand() {
    try {
      if (OLD_NAME.test(document.title)) document.title = document.title.replace(OLD_NAME, "LogisWeb");
      $$("a.brand").forEach(function (a) {
        if ($(".lw-word", a)) return;
        var k = a.getAttribute("data-k") || "b";
        a.innerHTML = '<img data-k="' + k + '.m" class="lw-mark" src="brand/logisweb-mark.svg" width="38" height="38" alt="" />'
          + '<span data-k="' + k + '.t" class="lw-txt"><img data-k="' + k + '.w" class="lw-word" src="brand/logisweb-wordmark.svg" width="125" height="14" alt="LogisWeb" /><small data-k="' + k + '.s">DISPATCH</small></span>';
      });
      var tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n, list = [];
      while ((n = tw.nextNode())) { OLD_NAME.lastIndex = 0; if (OLD_NAME.test(n.nodeValue)) list.push(n); }
      list.forEach(function (t) { t.nodeValue = t.nodeValue.replace(OLD_NAME, "LogisWeb"); });
      $$("[alt],[aria-label]").forEach(function (e) {
        ["alt", "aria-label"].forEach(function (a) { var v = e.getAttribute(a); if (v && /KP[- ]?Flow/i.test(v)) e.setAttribute(a, v.replace(OLD_NAME, "LogisWeb")); });
      });
    } catch (e) { /* 실패해도 화면은 그대로 */ }
  }
  function render(st) {
    state = st || emptyState();
    if (pristine != null) document.body.innerHTML = pristine;
    applyOps(state.ops);
    applyEls(state.els);
    applyPage(state);
    if (!ED) fixBrand();
    if (window.kpPageInit) window.kpPageInit();
    if (ED) afterRenderEdit();
  }
  function reveal() { var h = document.getElementById("kp-pre"); if (h) h.remove(); }

  // ───────────── 방문자 화면 ─────────────
  function readLive() {
    return fetch(REST, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var raw = j && j.fields && j.fields.homepage && j.fields.homepage.stringValue;
      return raw ? JSON.parse(raw) : null;
    }).catch(function () { return null; });
  }
  function bootLive() {
    pristine = document.body.innerHTML;
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE) || "null"); } catch (e) { cached = null; }
    if (cached) { render(cached); reveal(); } else if (window.kpPageInit) window.kpPageInit();
    var shown = !!cached;
    var late = setTimeout(function () { shown = true; reveal(); }, 900);
    readLive().then(function (live) {
      clearTimeout(late);
      var a = JSON.stringify(live || null), b = JSON.stringify(cached || null);
      try { if (live) localStorage.setItem(CACHE, a); else localStorage.removeItem(CACHE); } catch (e) { /* 저장 못 해도 화면은 정상 */ }
      if (a !== b) { var y = window.scrollY; render(live || emptyState()); window.scrollTo(0, y); }
      if (!shown) reveal();
    });
  }

  // ───────────── 편집 화면 ─────────────
  var parentWin = window.parent !== window ? window.parent : null;
  var parentOrigin = "*";
  var sel = null, hoverEl = null, editingText = null, ui = null, previewOnly = false;
  function post(type, data) { if (parentWin) parentWin.postMessage(Object.assign({ t: type }, data || {}), parentOrigin); }
  function E(k) { state.els[k] = state.els[k] || {}; return state.els[k]; }
  function tidy(k) {
    var e = state.els[k]; if (!e) return;
    ["style", "styleM", "attrs"].forEach(function (f) { if (e[f]) { Object.keys(e[f]).forEach(function (p) { if (e[f][p] === "" || e[f][p] == null) delete e[f][p]; }); if (!Object.keys(e[f]).length) delete e[f]; } });
    if (!e.hidden) delete e.hidden;
    if (!Object.keys(e).length) delete state.els[k];
  }
  function commit(label, keepSel) {
    var k = sel && sel.getAttribute("data-k");
    render(state);
    if (keepSel !== false && k) select(byKey(k), true);
    post("kp:change", { state: clone(state), label: label || "편집" });
  }
  var uid = 0;
  function newKey(prefix) { uid = Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 1296).toString(36); return prefix + uid; }

  function labelOf(el) {
    if (!el) return "";
    var t = (el.textContent || "").replace(/\s+/g, " ").trim();
    var names = { IMG: "사진", SVG: "아이콘", A: "링크", BUTTON: "버튼", INPUT: "입력칸", SELECT: "선택칸", TEXTAREA: "입력칸", SECTION: "섹션", HEADER: "상단바", FOOTER: "하단", NAV: "메뉴", UL: "목록", LI: "목록 줄", H1: "큰 제목", H2: "제목", H3: "제목", H4: "소제목", H5: "소제목", P: "문장", LABEL: "질문 글자", FORM: "신청서" };
    var tag = el.tagName.toUpperCase();
    var n = names[tag] || (el.classList.contains("btn") ? "버튼" : t ? "글자" : "상자");
    if (tag === "IMG") return n + (el.alt ? " · " + el.alt.slice(0, 24) : "");
    return n + (t ? " · " + t.slice(0, 28) : "");
  }
  function kindOf(el) {
    var tag = el.tagName.toUpperCase();
    if (tag === "IMG") return "image";
    if (tag === "SVG") return "icon";
    if (tag === "INPUT" || tag === "TEXTAREA") return "input";
    if (tag === "SELECT") return "select";
    if (tag === "A" || el.classList.contains("btn")) return "link";
    if (tag === "BUTTON") return "button";
    var hasText = Array.prototype.some.call(el.childNodes, function (c) { return c.nodeType === 3 && c.textContent.trim(); });
    return hasText ? "text" : "box";
  }
  function siblingsWithKey(el) { return Array.prototype.filter.call(el.parentElement ? el.parentElement.children : [], function (c) { return c.hasAttribute("data-k"); }); }
  function infoOf(el) {
    var k = el.getAttribute("data-k"), cs = getComputedStyle(el), e = state.els[k] || {};
    var path = [], p = el;
    while (p && p !== document.body) { if (p.hasAttribute && p.hasAttribute("data-k")) path.unshift({ key: p.getAttribute("data-k"), label: labelOf(p) }); p = p.parentElement; }
    var sib = siblingsWithKey(el), i = sib.indexOf(el);
    var u = el.tagName.toUpperCase() === "SVG" ? $("use", el) : null;
    return {
      key: k, tag: el.tagName.toLowerCase(), kind: kindOf(el), label: labelOf(el), path: path,
      html: el.innerHTML.length < 6000 ? el.innerHTML : null, text: (el.textContent || "").trim().slice(0, 400),
      attrs: { href: el.getAttribute("href"), src: el.getAttribute("src"), alt: el.getAttribute("alt"), placeholder: el.getAttribute("placeholder"), target: el.getAttribute("target"), required: el.hasAttribute("required") },
      options: el.tagName === "SELECT" ? Array.prototype.map.call(el.options, function (o) { return o.textContent; }) : null,
      icon: u ? (u.getAttribute("href") || "").replace("#", "") : null,
      computed: { fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color, backgroundColor: cs.backgroundColor, textAlign: cs.textAlign, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, width: Math.round(el.getBoundingClientRect().width) + "px", height: Math.round(el.getBoundingClientRect().height) + "px", opacity: cs.opacity, borderRadius: cs.borderTopLeftRadius, marginTop: cs.marginTop, marginBottom: cs.marginBottom, padding: cs.padding, translate: cs.translate },
      style: e.style || {}, styleM: e.styleM || {}, hidden: !!e.hidden, edited: !!state.els[k],
      canUp: i > 0, canDown: i >= 0 && i < sib.length - 1, cloned: k.indexOf("c") === 0 || k.indexOf("n") === 0,
    };
  }
  function metaOf() {
    var top = Array.prototype.filter.call(document.body.children, function (c) { return c.hasAttribute("data-k") && !/^(SCRIPT|SVG)$/i.test(c.tagName); });
    var secLabel = function (c) {
      if (c.id === "hdr") return "상단바(메뉴)";
      if (c.tagName === "FOOTER") return "하단(푸터)";
      if (c.classList.contains("dock")) return "오른쪽 떠있는 버튼";
      if (c.classList.contains("modal")) return "안내 창 · " + (($("h3", c) || {}).textContent || "");
      if (c.classList.contains("lightbox")) return "사진 크게 보기 창";
      if (c.classList.contains("hero")) return "맨 위(첫 화면)";
      if (c.classList.contains("stats")) return "숫자 띠";
      if (c.classList.contains("cta-band")) return "아래 신청 띠";
      var h = $("h1, h2, h3, .eyebrow", c); return (h ? h.textContent : "영역").replace(/\s+/g, " ").trim().slice(0, 34);
    };
    var allEls = state.els || {};
    return {
      sections: top.map(function (c) { var k = c.getAttribute("data-k"); return { key: k, label: secLabel(c), hidden: !!(allEls[k] && allEls[k].hidden) }; }),
      nav: $$("#nav > a, .header-cta > a").map(function (a) { return { key: a.getAttribute("data-k"), text: a.textContent.trim(), href: a.getAttribute("href"), group: a.parentElement.id === "nav" ? "메뉴" : "오른쪽 버튼" }; }),
      footer: $$(".footer-links > a").map(function (a) { return { key: a.getAttribute("data-k"), text: a.textContent.trim(), href: a.getAttribute("href") }; }),
      form: $$("#inquiryForm > div").filter(function (d) { return $("input, select, textarea", d); }).map(function (d) {
        var f = $("input, select, textarea", d), l = $("label", d);
        return { key: d.getAttribute("data-k"), labelKey: l && l.getAttribute("data-k"), inputKey: f.getAttribute("data-k"), label: l ? l.textContent.trim() : "", type: f.tagName.toLowerCase(), placeholder: f.getAttribute("placeholder") || "", required: f.hasAttribute("required") || /\*/.test(l ? l.textContent : ""), options: f.tagName === "SELECT" ? Array.prototype.map.call(f.options, function (o) { return o.textContent; }) : null, extra: f.hasAttribute("data-extra") };
      }),
      submit: (function () { var b = $("#inquiryForm .submit-btn"); return b ? { key: b.getAttribute("data-k"), text: b.textContent.trim() } : null; })(),
      images: $$("img[data-k]").map(function (im) { return { key: im.getAttribute("data-k"), src: im.getAttribute("src"), alt: im.getAttribute("alt") || "", hidden: !!(allEls[im.getAttribute("data-k")] && allEls[im.getAttribute("data-k")].hidden) }; }),
      hidden: Object.keys(allEls).filter(function (k) { return allEls[k].hidden; }).map(function (k) { var el = byKey(k); return { key: k, label: el ? labelOf(el) : k }; }),
      icons: $$("svg symbol[id]").map(function (s) { return s.id.replace(/^i-/, ""); }).map(function (n) { return "i-" + n; }),
      title: state.page && state.page.title || document.title,
      description: (state.page && state.page.description) || (($('meta[name="description"]') || {}).content || ""),
    };
  }

  // 편집 화면 겉옷(선택 상자·도구줄) — body를 다시 그려도 지워지지 않게 <html> 바로 아래에 둔다
  var EDIT_CSS = '.kp-editing body{cursor:default}.kp-editing a,.kp-editing button{cursor:pointer}' +
    '.kp-editing [contenteditable="true"]{outline:2px dashed #2D5BD8!important;outline-offset:3px;cursor:text!important;background:rgba(45,91,216,.04)}' +
    '.kp-editing .rv{opacity:1!important;transform:none!important}.kp-editing .float-chip{animation:none!important}' +
    '.kp-add-spacer{height:48px}.kp-add-img{max-width:100%;border-radius:16px;display:block}.kp-add-h{font-size:26px;font-weight:900;margin:12px 0}.kp-add-p{font-size:16px;line-height:1.7;margin:8px 0}';
  function buildUi() {
    var st = document.createElement("style"); st.textContent = EDIT_CSS; document.head.appendChild(st);
    var host = document.createElement("div");
    host.id = "kp-edit-ui";
    host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483000;font-family:Pretendard,'Noto Sans KR',system-ui,sans-serif";
    host.innerHTML =
      '<div data-r="hover" style="position:fixed;border:1.5px dashed rgba(45,91,216,.7);border-radius:4px;display:none"></div>' +
      '<div data-r="sel" style="position:fixed;border:2px solid #2D5BD8;border-radius:4px;box-shadow:0 0 0 4px rgba(45,91,216,.15);display:none">' +
        '<div data-r="tag" style="position:absolute;left:-2px;top:-24px;background:#2D5BD8;color:#fff;font-size:11.5px;font-weight:800;padding:3px 8px;border-radius:6px 6px 6px 0;white-space:nowrap;max-width:320px;overflow:hidden;text-overflow:ellipsis"></div>' +
        '<div data-h="e" title="너비 조절" style="pointer-events:auto;position:absolute;right:-7px;top:50%;margin-top:-9px;width:12px;height:18px;border-radius:4px;background:#fff;border:2px solid #2D5BD8;cursor:ew-resize"></div>' +
        '<div data-h="s" title="높이 조절" style="pointer-events:auto;position:absolute;bottom:-7px;left:50%;margin-left:-9px;width:18px;height:12px;border-radius:4px;background:#fff;border:2px solid #2D5BD8;cursor:ns-resize"></div>' +
        '<div data-h="se" title="크기 조절" style="pointer-events:auto;position:absolute;right:-8px;bottom:-8px;width:14px;height:14px;border-radius:50%;background:#2D5BD8;border:2px solid #fff;cursor:nwse-resize"></div>' +
        '<div data-h="move" title="끌어서 옮기기" style="pointer-events:auto;position:absolute;left:-9px;top:-9px;width:18px;height:18px;border-radius:50%;background:#0F1A30;border:2px solid #fff;cursor:move"></div>' +
      '</div>' +
      '<div data-r="bar" style="position:fixed;display:none;pointer-events:auto;background:#0F1A30;border-radius:12px;padding:5px;gap:3px;box-shadow:0 10px 30px rgba(0,0,0,.3);align-items:center"></div>' +
      '<div data-r="tip" style="position:fixed;left:50%;bottom:16px;transform:translateX(-50%);background:rgba(15,26,48,.92);color:#fff;font-size:12.5px;font-weight:700;padding:8px 14px;border-radius:10px;display:none;white-space:nowrap"></div>';
    document.documentElement.appendChild(host);
    ui = { host: host, hover: $('[data-r="hover"]', host), sel: $('[data-r="sel"]', host), tag: $('[data-r="tag"]', host), bar: $('[data-r="bar"]', host), tip: $('[data-r="tip"]', host) };
    var B = function (cmd, label, title) { return '<button data-c="' + cmd + '" title="' + (title || label) + '" style="all:unset;cursor:pointer;color:#fff;font-size:12px;font-weight:800;padding:6px 9px;border-radius:8px;white-space:nowrap">' + label + "</button>"; };
    ui.bar.innerHTML = B("parent", "↖ 상위", "감싸는 요소 고르기") + B("edit", "글 수정", "두 번 눌러도 됩니다") + B("smaller", "가−", "글자 작게") + B("bigger", "가+", "글자 크게") + B("up", "▲", "앞으로(위로) 옮기기") + B("down", "▼", "뒤로(아래로) 옮기기") + B("dup", "복제") + B("hide", "숨기기") + B("del", "삭제");
    ui.bar.addEventListener("mousedown", function (e) { e.preventDefault(); e.stopPropagation(); });
    ui.bar.addEventListener("click", function (e) { var b = e.target.closest("[data-c]"); if (!b || !sel) return; e.stopPropagation(); quick(b.getAttribute("data-c")); });
    $$("[data-h]", host).forEach(function (h) { h.addEventListener("mousedown", startHandle); });
    ui.bar.addEventListener("mouseover", function (e) { var b = e.target.closest("[data-c]"); $$("[data-c]", ui.bar).forEach(function (x) { x.style.background = x === b ? "rgba(255,255,255,.14)" : "transparent"; }); });
    requestAnimationFrame(loop);
  }
  function tip(msg) { if (!ui) return; ui.tip.textContent = msg; ui.tip.style.display = "block"; clearTimeout(tip.t); tip.t = setTimeout(function () { ui.tip.style.display = "none"; }, 2200); }
  function boxTo(box, el) {
    if (!el || !document.contains(el)) { box.style.display = "none"; return null; }
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) { box.style.display = "none"; return r; }
    box.style.display = "block"; box.style.left = r.left + "px"; box.style.top = r.top + "px"; box.style.width = r.width + "px"; box.style.height = r.height + "px";
    return r;
  }
  function loop() {
    if (ui && !previewOnly) {
      boxTo(ui.hover, hoverEl && hoverEl !== sel ? hoverEl : null);
      var r = boxTo(ui.sel, sel);
      if (r && sel && !editingText) {
        ui.bar.style.display = "flex";
        var bw = ui.bar.offsetWidth, bh = ui.bar.offsetHeight;
        var top = r.top - bh - 30; if (top < 6) top = r.bottom + 12; if (top > innerHeight - bh - 6) top = Math.max(6, r.top + 6);
        var left = Math.min(Math.max(6, r.left), innerWidth - bw - 6);
        ui.bar.style.top = top + "px"; ui.bar.style.left = left + "px";
      } else ui.bar.style.display = "none";
      ui.tag.style.top = (r && r.top < 26) ? (r.height + 4) + "px" : "-24px";
    } else if (ui) { ui.hover.style.display = ui.sel.style.display = ui.bar.style.display = "none"; }
    requestAnimationFrame(loop);
  }
  function keyed(t) { while (t && t !== document.body && t.nodeType === 1) { if (t.hasAttribute("data-k")) return t; t = t.parentElement; } return null; }
  function select(el, quiet) {
    if (editingText && editingText !== el) finishText(true);
    sel = el || null;
    if (ui) ui.tag.textContent = sel ? labelOf(sel) : "";
    if (sel && !quiet) post("kp:select", { info: infoOf(sel) });
    else if (sel) post("kp:select", { info: infoOf(sel), quiet: true });
    else post("kp:select", { info: null });
  }

  // 글 고치기
  function startText(el) {
    if (!el || el.tagName === "IMG" || el.tagName === "SVG" || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) { tip("사진·입력칸은 왼쪽 속성 창에서 바꿉니다"); return; }
    editingText = el; el.setAttribute("contenteditable", "true"); el.focus();
    try { var rg = document.createRange(); rg.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(rg); } catch (e) { /* 무시 */ }
    tip("글을 고친 뒤 바깥을 누르거나 Esc를 누르면 저장됩니다 · Shift+Enter 줄바꿈");
  }
  function finishText(save) {
    var el = editingText; if (!el) return;
    editingText = null; el.removeAttribute("contenteditable");
    if (!save) { render(state); return; }
    var k = el.getAttribute("data-k");
    var html = sanitize(el.innerHTML);
    var before = (state.els[k] && state.els[k].html);
    E(k).html = html; tidy(k);
    if (before !== html) commit("글 수정");
  }

  // 끌어서 옮기기 · 크기 조절
  var drag = null;
  function parseTranslate(el, mobile) {
    var e = state.els[el.getAttribute("data-k")] || {}, s = (mobile ? e.styleM : e.style) || {};
    var t = (s.translate || "0px 0px").split(/\s+/);
    return [parseFloat(t[0]) || 0, parseFloat(t[1] || 0) || 0];
  }
  var mobileView = function () { return innerWidth <= MOBILE_MAX; };
  function styleBag(k) { var e = E(k); var f = mobileView() ? "styleM" : "style"; e[f] = e[f] || {}; return e[f]; }
  function startHandle(ev) {
    if (!sel) return; ev.preventDefault(); ev.stopPropagation();
    var h = ev.currentTarget.getAttribute("data-h");
    var r = sel.getBoundingClientRect();
    drag = { mode: h, x: ev.clientX, y: ev.clientY, w: r.width, h: r.height, t: parseTranslate(sel, mobileView()), el: sel, moved: false };
  }
  document.addEventListener("mousemove", function (ev) {
    if (!ED || previewOnly) return;
    if (drag) {
      var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      drag.moved = true;
      if (ev.shiftKey) { dx = Math.round(dx / 10) * 10; dy = Math.round(dy / 10) * 10; }
      var el = drag.el;
      if (drag.mode === "move") el.style.setProperty("translate", (drag.t[0] + dx) + "px " + (drag.t[1] + dy) + "px", "important");
      if (drag.mode === "e" || drag.mode === "se") { el.style.setProperty("width", Math.max(20, drag.w + dx) + "px", "important"); el.style.setProperty("max-width", "none", "important"); }
      if (drag.mode === "s" || (drag.mode === "se" && el.tagName !== "IMG")) el.style.setProperty("height", Math.max(10, drag.h + dy) + "px", "important");
      if (drag.mode === "se" && el.tagName === "IMG") el.style.setProperty("height", "auto", "important");
      ev.preventDefault();
      return;
    }
    var t = keyed(ev.target); hoverEl = t;
  }, true);
  document.addEventListener("mouseup", function (ev) {
    if (!drag) return;
    var d = drag; drag = null;
    if (!d.moved) { if (d.mode === "pending") return; return; }
    var k = d.el.getAttribute("data-k"), bag = styleBag(k);
    var dx = ev.clientX - d.x, dy = ev.clientY - d.y;
    if (ev.shiftKey) { dx = Math.round(dx / 10) * 10; dy = Math.round(dy / 10) * 10; }
    if (d.mode === "move") bag.translate = Math.round(d.t[0] + dx) + "px " + Math.round(d.t[1] + dy) + "px";
    if (d.mode === "e" || d.mode === "se") { bag.width = Math.round(Math.max(20, d.w + dx)) + "px"; bag.maxWidth = "none"; }
    if (d.mode === "s" || (d.mode === "se" && d.el.tagName !== "IMG")) bag.height = Math.round(Math.max(10, d.h + dy)) + "px";
    if (d.mode === "se" && d.el.tagName === "IMG") bag.height = "auto";
    tidy(k);
    commit(d.mode === "move" ? "위치 이동" : "크기 조절");
  }, true);

  // 고른 요소를 그대로 끌어도 옮겨지게(4px 이상 움직이면 이동으로 본다)
  document.addEventListener("mousedown", function (ev) {
    if (!ED || previewOnly || editingText || ev.button !== 0) return;
    if (ui && ui.host.contains(ev.target)) return;
    var t = keyed(ev.target);
    if (t && sel && t === sel && !/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) {
      var r = sel.getBoundingClientRect();
      drag = { mode: "move", x: ev.clientX, y: ev.clientY, w: r.width, h: r.height, t: parseTranslate(sel, mobileView()), el: sel, moved: false };
      ev.preventDefault();
    }
  }, true);

  document.addEventListener("click", function (ev) {
    if (!ED) return;
    if (ui && ui.host.contains(ev.target)) return;
    var a = ev.target.closest("a"), sub = ev.target.closest('button[type="submit"], .submit-btn');
    if (previewOnly) {
      // 미리보기: 페이지 안 이동(#)만 허용 — 다른 주소로 나가지 않게
      if (a) { var h = a.getAttribute("href") || ""; if (h.charAt(0) === "#") return; ev.preventDefault(); tip("미리보기에서는 바깥 링크로 이동하지 않습니다 · " + h); }
      if (sub) ev.preventDefault();
      return;
    }
    if (editingText && editingText.contains(ev.target)) return;
    if (editingText) finishText(true);
    if (a || sub) ev.preventDefault();
    var t = keyed(ev.target);
    if (t) select(t);
  }, true);
  document.addEventListener("dblclick", function (ev) {
    if (!ED || previewOnly) return;
    var t = keyed(ev.target); if (!t) return;
    ev.preventDefault(); select(t, true); startText(t);
  }, true);
  document.addEventListener("keydown", function (ev) {
    if (!ED || previewOnly) return;
    var mod = ev.ctrlKey || ev.metaKey;
    if (editingText) {
      if (ev.key === "Escape") { ev.preventDefault(); finishText(true); }
      else if (ev.key === "Enter" && !ev.shiftKey && /^(H\d|A|BUTTON|LABEL|SPAN|B|SMALL|SUMMARY)$/.test(editingText.tagName)) { ev.preventDefault(); finishText(true); }
      return;
    }
    if (mod && (ev.key === "z" || ev.key === "Z")) { ev.preventDefault(); post(ev.shiftKey ? "kp:redo" : "kp:undo"); return; }
    if (mod && (ev.key === "y" || ev.key === "Y")) { ev.preventDefault(); post("kp:redo"); return; }
    if (mod && (ev.key === "s" || ev.key === "S")) { ev.preventDefault(); post("kp:save"); return; }
    if (!sel) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement || {}).tagName || "") && document.activeElement !== sel) return;
    if (mod && (ev.key === "d" || ev.key === "D")) { ev.preventDefault(); quick("dup"); return; }
    if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); quick("hide"); return; }
    if (ev.key === "Escape") { ev.preventDefault(); quick("parent"); return; }
    if (ev.key === "Enter" || ev.key === "F2") { ev.preventDefault(); startText(sel); return; }
    var arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[ev.key]) {
      ev.preventDefault();
      var step = ev.shiftKey ? 10 : 1, k = sel.getAttribute("data-k"), t = parseTranslate(sel, mobileView());
      styleBag(k).translate = (t[0] + arrows[ev.key][0] * step) + "px " + (t[1] + arrows[ev.key][1] * step) + "px";
      clearTimeout(keydownT); render(state); select(byKey(k), true);
      keydownT = setTimeout(function () { post("kp:change", { state: clone(state), label: "위치 이동" }); }, 350);
    }
  }, true);
  var keydownT = null;
  // 사진 위에 파일을 끌어다 놓으면 바로 교체(부모 창이 올려서 주소를 돌려준다)
  document.addEventListener("dragover", function (ev) { if (ED && !previewOnly && ev.target.closest && ev.target.closest("img[data-k]")) ev.preventDefault(); });
  document.addEventListener("drop", function (ev) {
    if (!ED || previewOnly) return;
    var im = ev.target.closest && ev.target.closest("img[data-k]");
    var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (!im || !f || !/^image\//.test(f.type)) return;
    ev.preventDefault(); select(im); post("kp:upload", { key: im.getAttribute("data-k"), file: f }); tip("사진을 올리는 중…");
  });

  function quick(c) {
    if (!sel) return;
    var k = sel.getAttribute("data-k");
    if (c === "parent") { var p = keyed(sel.parentElement); if (p) select(p); return; }
    if (c === "edit") { startText(sel); return; }
    if (c === "bigger" || c === "smaller") {
      var bag = styleBag(k), cur = parseFloat(bag.fontSize || getComputedStyle(sel).fontSize) || 16;
      bag.fontSize = Math.max(8, Math.round(cur + (c === "bigger" ? 2 : -2))) + "px"; tidy(k); commit("글자 크기"); return;
    }
    if (c === "up" || c === "down") cmd({ cmd: "move", key: k, dir: c });
    if (c === "dup") cmd({ cmd: "duplicate", key: k });
    if (c === "hide") cmd({ cmd: "hide", key: k, hidden: true });
    if (c === "del") cmd({ cmd: "remove", key: k });
  }

  // 부모 창 명령
  function cmd(m) {
    var k = m.key, el = k ? byKey(k) : sel;
    switch (m.cmd) {
      case "select": var t = byKey(k); if (t) { if (/^(SECTION|HEADER|FOOTER)$/.test(t.tagName) || m.scroll) t.scrollIntoView({ behavior: "smooth", block: "center" }); select(t); } return;
      case "deselect": select(null); return;
      case "setStyle": { var bag = E(k)[m.mobile ? "styleM" : "style"] = E(k)[m.mobile ? "styleM" : "style"] || {}; bag[m.prop] = m.value; tidy(k); commit("스타일"); return; }
      case "setStyles": { var b2 = E(k)[m.mobile ? "styleM" : "style"] = Object.assign(E(k)[m.mobile ? "styleM" : "style"] || {}, m.values || {}); tidy(k); commit(m.label || "스타일"); return; }
      case "clearStyle": { var e0 = E(k); delete e0.style; delete e0.styleM; tidy(k); commit("스타일 초기화"); return; }
      case "setAttr": { var at = E(k).attrs = E(k).attrs || {}; at[m.name] = m.value; tidy(k); commit(m.label || "속성"); return; }
      case "setHtml": E(k).html = sanitize(m.html); tidy(k); commit("글 수정"); return;
      case "setText": { var tmp = document.createElement("div"); tmp.textContent = m.text; E(k).html = tmp.innerHTML.replace(/\n/g, "<br>"); tidy(k); commit("글 수정"); return; }
      case "setOptions": E(k).options = (m.options || []).filter(function (s) { return String(s).trim(); }); tidy(k); commit("선택 항목"); return;
      case "setIcon": E(k).icon = m.icon; tidy(k); commit("아이콘"); return;
      case "hide": E(k).hidden = !!m.hidden; tidy(k); if (m.hidden && sel && sel.getAttribute("data-k") === k) sel = null; commit(m.hidden ? "숨기기" : "다시 보이기", !m.hidden); if (m.hidden) post("kp:select", { info: null }); return;
      case "remove": {
        var isNew = /^[cn]/.test(k) && state.ops.some(function (o) { return o.key === k && (o.op === "clone" || o.op === "add"); });
        if (isNew) { state.ops = state.ops.filter(function (o) { return o.key !== k && o.ref !== k; }); Object.keys(state.els).forEach(function (x) { if (x === k || x.indexOf(k + ".") === 0) delete state.els[x]; }); }
        else E(k).hidden = true;
        sel = null; commit("삭제", false); post("kp:select", { info: null }); return;
      }
      case "resetEl": Object.keys(state.els).forEach(function (x) { if (x === k) delete state.els[x]; }); commit("원래대로"); return;
      case "duplicate": { if (!el) return; var nk = newKey("c"); state.ops.push({ op: "clone", src: k, key: nk }); copyEdits(k, nk); render(state); var c = byKey(nk); select(c); post("kp:change", { state: clone(state), label: "복제" }); return; }
      case "move": {
        if (!el) return;
        var sib = siblingsWithKey(el), i = sib.indexOf(el), ref = m.dir === "up" ? sib[i - 1] : sib[i + 1];
        if (!ref) { tip("더 옮길 수 없습니다"); return; }
        state.ops.push({ op: "move", key: k, ref: ref.getAttribute("data-k"), pos: m.dir === "up" ? "before" : "after" });
        commit("순서 이동"); var mv = byKey(k); if (mv) mv.scrollIntoView({ behavior: "smooth", block: "nearest" }); return;
      }
      case "moveTo": state.ops.push({ op: "move", key: k, ref: m.ref, pos: m.pos || "after" }); commit("순서 이동"); return;
      case "add": {
        var target = m.ref ? byKey(m.ref) : sel;
        var nk2 = newKey("n"), kind = m.kind, pos = m.pos || "after", ref2 = target;
        if (/^section/.test(kind)) { ref2 = target; while (ref2 && ref2.parentElement !== document.body) ref2 = ref2.parentElement; if (!ref2) ref2 = $("#inquiry-form") || document.body.lastElementChild; }
        if (/^field/.test(kind)) { var fs = $$("#inquiryForm > div").filter(function (d) { return $("input, select, textarea", d); }); ref2 = fs[fs.length - 1]; pos = "after"; }
        if (kind === "nav-link") { var nl = $$("#nav > a"); ref2 = nl[nl.length - 1]; pos = "after"; }
        if (!ref2) { tip("먼저 넣을 위치의 요소를 고르세요"); return; }
        state.ops.push({ op: "add", kind: kind, key: nk2, ref: ref2.getAttribute("data-k"), pos: pos });
        render(state); var added = byKey(nk2); if (added) { added.scrollIntoView({ behavior: "smooth", block: "center" }); select(added); }
        post("kp:change", { state: clone(state), label: "추가" }); return;
      }
      case "replaceText": {
        var n = 0, find = m.find; if (!find) return;
        $$("[data-k]").forEach(function (x) {
          if (x.closest("#kp-edit-ui") || /^(SCRIPT|STYLE)$/.test(x.tagName)) return;
          var own = Array.prototype.some.call(x.childNodes, function (c) { return c.nodeType === 3 && c.textContent.indexOf(find) >= 0; });
          if (!own) return;
          var kk = x.getAttribute("data-k");
          Array.prototype.forEach.call(x.childNodes, function (c) { if (c.nodeType === 3) c.textContent = c.textContent.split(find).join(m.replace); });
          E(kk).html = sanitize(x.innerHTML); n++;
        });
        if (n) commit("찾아 바꾸기 " + n + "곳"); post("kp:replaced", { count: n }); return;
      }
      case "setPage": state.page = Object.assign({}, state.page || {}, m.page || {}); Object.keys(state.page).forEach(function (p) { if (state.page[p] === "" || state.page[p] == null) delete state.page[p]; }); commit("페이지 설정"); return;
      case "load": render(m.state || emptyState()); if (m.keepKey && byKey(m.keepKey)) select(byKey(m.keepKey), true); else post("kp:select", { info: null }); post("kp:meta", { meta: metaOf() }); return;
      case "preview": previewOnly = !!m.on; document.documentElement.classList.toggle("kp-editing", !previewOnly); if (previewOnly) { select(null); finishText(true); } if (window.kpPageInit) window.kpPageInit(); return;
      case "flush": if (editingText) finishText(true); post("kp:flushed", { state: clone(state) }); return;
      case "scrollTop": window.scrollTo({ top: 0, behavior: "smooth" }); return;
    }
  }
  function copyEdits(from, to) {
    Object.keys(state.els).forEach(function (x) {
      if (x === from) state.els[to] = clone(state.els[x]);
      else if (x.indexOf(from + ".") === 0 || /^e\d+$/.test(x)) {
        var el = byKey(x), src = byKey(from);
        if (el && src && src.contains(el) && el !== src) state.els[to + "." + x] = clone(state.els[x]);
      }
    });
  }
  function afterRenderEdit() {
    if (sel && !document.contains(sel)) sel = null;
    clearTimeout(afterRenderEdit.t);
    afterRenderEdit.t = setTimeout(function () { post("kp:meta", { meta: metaOf() }); }, 60);
  }

  function bootEdit() {
    document.documentElement.classList.add("kp-editing");
    pristine = document.body.innerHTML;
    state = emptyState();
    buildUi();
    reveal();
    window.addEventListener("message", function (ev) {
      var m = ev.data; if (!m || typeof m !== "object" || m.t !== "kp:cmd") return;
      parentOrigin = ev.origin && ev.origin !== "null" ? ev.origin : "*";
      cmd(m);
    });
    // 글을 고치던 중에 바깥(관리자센터 쪽 버튼 등)을 누르면 그때까지 쓴 글을 바로 저장
    window.addEventListener("blur", function () { if (editingText) finishText(true); });
    document.addEventListener("focusout", function (ev) { if (editingText && ev.target === editingText) setTimeout(function () { if (editingText && document.activeElement !== editingText) finishText(true); }, 0); });
    if (window.kpPageInit) window.kpPageInit();
    post("kp:ready", { meta: metaOf() });
  }

  function boot() { if (ED) bootEdit(); else bootLive(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
