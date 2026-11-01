// ======================= src/a4Export.js =======================
// 🖨 문서(정산서·결재 문서·계약서 등)를 이미지·PDF·인쇄로 — A4 기준으로 나누고, 글줄 중간에서 자르지 않는다.
//  · capture(el): 글꼴이 다 불러와진 뒤 2배 해상도로 그린다(글씨가 흐리거나 잘리지 않게)
//  · 긴 문서는 A4 높이마다 "빈 줄"을 찾아서 나눈다(글자 한가운데가 잘리는 일 없음)
//  · 여러 장(.kp-a4page)으로 이미 나뉜 문서는 장마다 그대로 한 쪽씩

export async function capture(el, scale = 2) {
  try { await document.fonts?.ready; } catch { /* 무시 */ }
  const { default: h2c } = await import("html2canvas");
  return h2c(el, { scale, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: Math.max(el.scrollWidth, 900) });
}

// 캔버스를 A4 비율 조각으로 — 경계 근처(위로 최대 22%)에서 하얀 줄을 찾아 자른다
export function sliceA4(canvas, marginRatio = 0) {
  const W = canvas.width;
  const pageH = Math.floor(W * (297 / 210) * (1 - marginRatio));
  if (canvas.height <= pageH) return [canvas];
  const ctx = canvas.getContext("2d");
  const isBlankRow = (y) => {
    const row = ctx.getImageData(0, y, W, 1).data;
    for (let x = 0; x < W * 4; x += 16) { if (row[x] < 245 || row[x + 1] < 245 || row[x + 2] < 245) return false; }
    return true;
  };
  const out = [];
  let y = 0;
  while (y < canvas.height) {
    let end = Math.min(canvas.height, y + pageH);
    if (end < canvas.height) {
      const minY = end - Math.floor(pageH * 0.22);
      let cut = -1;
      for (let yy = end; yy > minY; yy -= 2) { if (isBlankRow(yy)) { cut = yy; break; } }
      if (cut > y) end = cut;
    }
    const c = document.createElement("canvas");
    c.width = W; c.height = end - y;
    c.getContext("2d").drawImage(canvas, 0, y, W, end - y, 0, 0, W, end - y);
    out.push(c);
    y = end;
  }
  return out;
}

async function pagesOf(el) {
  const pages = el.querySelectorAll?.(".kp-a4page");
  if (pages && pages.length) { const list = []; for (const p of pages) list.push(await capture(p)); return list; }
  return sliceA4(await capture(el), 0.06);
}

export async function savePng(el, name) {
  const pages = el.querySelectorAll?.(".kp-a4page");
  if (pages && pages.length > 1) {
    // 여러 장 → 장마다 한 파일
    let i = 1;
    for (const p of pages) { const c = await capture(p); const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `${name}_${i}쪽.png`; a.click(); i += 1; await new Promise((r) => setTimeout(r, 250)); }
    return;
  }
  const c = await capture(el);
  const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `${name}.png`; a.click();
}

export async function savePdf(el, name) {
  const pages = await pagesOf(el);
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const M = 8; const W = 210 - M * 2;
  pages.forEach((c, i) => {
    if (i) pdf.addPage();
    const h = (c.height * W) / c.width;
    pdf.addImage(c.toDataURL("image/png"), "PNG", M, M, W, Math.min(h, 297 - M * 2));
  });
  pdf.save(`${name}.pdf`);
}

// ⭐ 2026-11-02 점검 — 팝업 차단 방지: 창을 await 전에 먼저 연다. 호출부가 클릭 직후 미리 연 창(pre)을 넘길 수 있고, 차단되면 조용히 끝내지 않고 안내한다
export async function printA4(el, title = "인쇄", pre = null) {
  const w = pre || window.open("", "_blank");
  if (!w) { alert("팝업이 차단되어 인쇄 창을 열 수 없습니다. 팝업을 허용한 뒤 다시 시도해 주세요."); return; }
  let pages;
  try { pages = await pagesOf(el); } catch (e) { try { w.close(); } catch { /* 무시 */ } throw e; } // ⭐ 2026-11-02 점검 — 캡처 실패 시 빈 창을 닫고 오류는 호출부로

  const imgs = pages.map((c) => `<div class="pg"><img src="${c.toDataURL("image/png")}"></div>`).join("");
  w.document.write(`<html><head><title>${title}</title><style>@page{size:A4;margin:8mm}body{margin:0}.pg{page-break-after:always;break-after:page}.pg:last-child{page-break-after:auto;break-after:auto}img{width:100%;display:block}</style></head><body>${imgs}<script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script></body></html>`);
  w.document.close();
}
