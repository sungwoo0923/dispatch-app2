export const clickText = (t, scope = "body", nth = 0) => async (pg) => {
  const ok = await pg.evaluate(([t, scope, nth]) => {
    const all = [...document.querySelectorAll(scope + " *")].filter((e) => e.offsetParent !== null || e.getClientRects().length);
    let els = all.filter((e) => (e.innerText || "").trim() === t);
    if (!els.length) els = all.filter((e) => (e.innerText || "").trim().split("\n")[0].trim() === t).sort((a, b) => a.innerText.length - b.innerText.length);
    const el = els[nth]; if (!el) return false;
    (el.closest("button,a,[role=button]") || el).click(); return true;
  }, [t, scope, nth]);
  if (!ok) console.log("  no text:", t);
};
export const sub = (code, key) => async (pg) => { await pg.evaluate(([c, k]) => { window.__kpPendingSub = { code: c, key: k, at: Date.now() }; window.dispatchEvent(new CustomEvent("kp:subnav", { detail: { code: c, key: k } })); }, [code, key]); };
export const seq = (...fns) => async (pg) => { for (const f of fns) { await f(pg); await pg.waitForTimeout(1500); } };
export const sleep = (ms) => async (pg) => pg.waitForTimeout(ms);
export const clickHas = (t) => async (pg) => {
  const ok = await pg.evaluate((t) => {
    const all = [...document.querySelectorAll("body *")].filter((e) => e.getClientRects().length && (e.innerText || "").includes(t)).sort((a, b) => a.innerText.length - b.innerText.length);
    const el = all[0]; if (!el) return false; (el.closest("button,a,[role=button],li,tr") || el).click(); return true;
  }, t);
  if (!ok) console.log("  no has:", t);
};
