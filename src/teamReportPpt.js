// ======================= src/teamReportPpt.js =======================
// 📑 2026-11-15 팀 실적 보고서 → PPT(.pptx) 자동 만들기 — 표지 · 핵심 숫자 · 일별 추이 · 팀원별 · 거래처 · 확인할 점 · 작성자 의견
//  그래프는 파워포인트 차트(고쳐 쓸 수 있다) · 색은 프로그램 네이비 · 증감은 ▲ 빨강 / ▼ 파랑(일일 경영 보고와 같은 규칙)
//  pptxgenjs 는 이 파일을 열 때만 받는다(화면에서 import() — 보고서 화면 묶음을 무겁게 하지 않는다)
import pptxgen from "pptxgenjs";

const NAVY = "1B2B4B"; const NAVY2 = "2D4C82"; const SKY = "8FB0F0"; const T1 = "0F1A30"; const T2 = "5B6B85"; const LINE = "DCE3EE"; const BG = "F3F6FA";
const UP = "D92D20"; const DOWN = "2563EB";
const FONT = "맑은 고딕";
const man = (won) => `${Math.round((won || 0) / 1e4).toLocaleString("ko-KR")}만`;
const pctTxt = (v) => (v == null || !Number.isFinite(v) ? "–" : `${v > 0 ? "▲ " : v < 0 ? "▼ " : ""}${Math.abs(v).toFixed(1)}%`);
const pctCol = (v) => (v == null || !Number.isFinite(v) || Math.abs(v) < 0.05 ? T2 : v > 0 ? UP : DOWN);

function frame(pres, title, sub, page) {
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: NAVY } });
  s.addText(title, { x: 0.5, y: 0.15, w: 9, h: 0.6, fontFace: FONT, fontSize: 24, bold: true, color: "FFFFFF" });
  if (sub) s.addText(sub, { x: 8.3, y: 0.15, w: 4.6, h: 0.6, fontFace: FONT, fontSize: 13, color: SKY, align: "right" });
  s.addText(String(page), { x: 12.4, y: 7.05, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 10, color: T2, align: "right" });
  return s;
}

// rep: buildTeamReport 결과 · meta: { team, author, made, opinion: [[제목, 글]] }
export async function makeTeamReportPpt(rep, meta) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  pres.title = `${meta.team} 실적 보고서 · ${rep.period.label}`;
  const sub = `${meta.team} · ${rep.period.label}`;
  let page = 1;

  // 1) 표지
  const c0 = pres.addSlide();
  c0.background = { color: NAVY };
  c0.addText("TEAM PERFORMANCE REPORT", { x: 0.8, y: 1.6, w: 11, h: 0.4, fontFace: FONT, fontSize: 14, color: SKY, charSpacing: 4, bold: true });
  c0.addText(`${meta.team} 실적 보고서`, { x: 0.8, y: 2.1, w: 11.5, h: 1.2, fontFace: FONT, fontSize: 44, bold: true, color: "FFFFFF" });
  c0.addText(rep.period.label, { x: 0.8, y: 3.3, w: 11, h: 0.6, fontFace: FONT, fontSize: 24, color: "FFFFFF" });
  c0.addText(`비교: ${rep.period.prevLabel}`, { x: 0.8, y: 3.9, w: 11, h: 0.4, fontFace: FONT, fontSize: 14, color: SKY });
  c0.addText(`작성 ${meta.author || ""} · ${meta.made || ""}`, { x: 0.8, y: 6.3, w: 11, h: 0.4, fontFace: FONT, fontSize: 14, color: "FFFFFF" });

  // 2) 핵심 숫자
  page += 1;
  const s1 = frame(pres, "핵심 성과지표 (KPI)", sub, page);
  const c = rep.cur;
  const tiles = [
    ["매출액", `${man(c.sale)}원`, rep.d.sale], ["매출총이익", `${man(c.profit)}원`, rep.d.profit], ["매출총이익률", `${c.margin.toFixed(1)}%`, rep.d.margin, "%p"],
    ["운송 건수", `${c.cnt.toLocaleString("ko-KR")}건`, rep.d.cnt], ["건당 이익", `${Math.round(c.perOrder).toLocaleString("ko-KR")}원`, rep.d.perOrder],
  ];
  tiles.forEach(([l, v, d, unit], i) => {
    const x = 0.5 + i * 2.5;
    s1.addShape(pres.ShapeType.roundRect, { x, y: 1.4, w: 2.3, h: 2.1, fill: { color: BG }, line: { color: LINE }, rectRadius: 0.12 });
    s1.addText(l, { x: x + 0.2, y: 1.55, w: 2, h: 0.4, fontFace: FONT, fontSize: 14, color: T2, bold: true });
    s1.addText(v, { x: x + 0.2, y: 2.0, w: 2, h: 0.7, fontFace: FONT, fontSize: 24, color: T1, bold: true, fit: "shrink" });
    s1.addText(unit === "%p" ? (d == null ? "–" : `${d > 0 ? "▲ " : d < 0 ? "▼ " : ""}${Math.abs(d).toFixed(1)}%p`) : pctTxt(d), { x: x + 0.2, y: 2.75, w: 2, h: 0.4, fontFace: FONT, fontSize: 14, color: pctCol(d), bold: true });
  });
  const best = rep.best ? `최우수 실적자: ${rep.best.name} (${man(rep.best.sale)}원)` : "";
  s1.addText([
    { text: `비교 기간: ${rep.period.prevLabel} · 전사 매출 비중 ${rep.companyShare.toFixed(1)}%`, options: { breakLine: true } },
    { text: `영업일 평균 매출액 ${man(rep.avgPerBizDay)}원${best ? ` · ${best}` : ""}`, options: { breakLine: true } },
    { text: `거래처 ${rep.clients.count}곳 · 신규 거래처 ${rep.clients.newClients.length}곳` },
  ], { x: 0.5, y: 4.0, w: 12.3, h: 1.6, fontFace: FONT, fontSize: 16, color: T1, valign: "top" });

  // 3) 일별 추이
  page += 1;
  const s2 = frame(pres, "일별 매출 · 이익 추이", sub, page);
  const labels = rep.daily.map((x) => `${Number(x.d.slice(5, 7))}/${Number(x.d.slice(8, 10))}`);
  s2.addChart(pres.ChartType.bar, [
    { name: "매출액(만원)", labels, values: rep.daily.map((x) => Math.round(x.sale / 1e4)) },
    { name: "매출총이익(만원)", labels, values: rep.daily.map((x) => Math.round(x.profit / 1e4)) },
  ], { x: 0.5, y: 1.2, w: 12.3, h: 5.6, barGrouping: "clustered", chartColors: [NAVY, SKY], showLegend: true, legendPos: "t", legendFontFace: FONT, legendFontSize: 12,
    catAxisLabelFontFace: FONT, catAxisLabelFontSize: 10, valAxisLabelFontFace: FONT, valAxisLabelFontSize: 10, valGridLine: { color: "E8EDF4", size: 0.5 } });

  // 4) 팀원별
  page += 1;
  const s3 = frame(pres, "담당자별 실적 기여도", sub, page);
  const mem = rep.members.slice(0, 12);
  if (mem.length) {
    s3.addChart(pres.ChartType.bar, [
      { name: "매출액(만원)", labels: mem.map((m) => m.name), values: mem.map((m) => Math.round(m.sale / 1e4)) },
      { name: "매출총이익(만원)", labels: mem.map((m) => m.name), values: mem.map((m) => Math.round(m.profit / 1e4)) },
    ], { x: 0.5, y: 1.2, w: 6.2, h: 5.6, barDir: "bar", barGrouping: "clustered", chartColors: [NAVY, SKY], showLegend: true, legendPos: "t", legendFontFace: FONT,
      catAxisLabelFontFace: FONT, catAxisLabelFontSize: 11, catAxisOrientation: "maxMin", valAxisLabelFontSize: 10, valGridLine: { color: "E8EDF4", size: 0.5 } });
    const head = ["담당자", "매출액", "매출총이익", "이익률", "건수", "전기 대비"].map((t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: NAVY } } }));
    const body = mem.map((m) => [m.name, `${man(m.sale)}`, `${man(m.profit)}`, `${m.margin.toFixed(1)}%`, `${m.cnt}`, { text: pctTxt(m.d), options: { color: pctCol(m.d), bold: true } }]);
    s3.addTable([head, ...body], { x: 6.9, y: 1.2, w: 6, colW: [1.3, 1.0, 1.0, 0.9, 0.7, 1.1], fontFace: FONT, fontSize: 11, color: T1, border: { type: "solid", color: LINE, pt: 0.5 }, align: "center", valign: "middle", rowH: 0.36 });
  } else s3.addText("이 기간에 담당자 실적이 없어요.", { x: 0.5, y: 3, w: 12, h: 0.6, fontFace: FONT, fontSize: 18, color: T2, align: "center" });

  // 5) 거래처
  page += 1;
  const s4 = frame(pres, "매출 상위 거래처 · 매출 증감", sub, page);
  const tHead = ["순위", "거래처", "매출액", "이익률", "전기 대비"].map((t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: NAVY } } }));
  const tBody = rep.clients.top.map((x, i) => [`${i + 1}`, x.n, `${man(x.sale)}`, `${x.margin.toFixed(1)}%`, { text: x.prevSale ? pctTxt(x.d) : "신규", options: { color: x.prevSale ? pctCol(x.d) : NAVY2, bold: true } }]);
  s4.addTable([tHead, ...tBody], { x: 0.5, y: 1.2, w: 7.2, colW: [0.7, 3.0, 1.3, 1.0, 1.2], fontFace: FONT, fontSize: 12, color: T1, border: { type: "solid", color: LINE, pt: 0.5 }, align: "center", valign: "middle", rowH: 0.42 });
  const mv = (title, list, col) => [{ text: title, options: { bold: true, color: col, fontSize: 15, breakLine: true } },
    ...(list.length ? list.map((x) => ({ text: `· ${x.n}  ${x.diff > 0 ? "+" : "−"}${man(Math.abs(x.diff))}원`, options: { breakLine: true } })) : [{ text: "· 해당 없음", options: { breakLine: true } }])];
  s4.addText([...mv("매출 증가 거래처", rep.clients.up, UP), { text: " ", options: { breakLine: true } }, ...mv("매출 감소 거래처", rep.clients.down, DOWN)],
    { x: 8.0, y: 1.2, w: 4.9, h: 5.6, fontFace: FONT, fontSize: 13, color: T1, valign: "top" });

  // 6) 확인할 점
  page += 1;
  const s5 = frame(pres, "리스크 점검", sub, page);
  const k = rep.risks;
  [["역마진 오더", `${k.lossCount}건`], ["저마진 오더 (5% 미만)", `${k.lowCount}건`], ["미배차 오더", `${k.unassigned}건`]].forEach(([l, v], i) => {
    const x = 0.5 + i * 4.2;
    s5.addShape(pres.ShapeType.roundRect, { x, y: 1.3, w: 3.9, h: 1.3, fill: { color: BG }, line: { color: LINE }, rectRadius: 0.1 });
    s5.addText(l, { x: x + 0.25, y: 1.4, w: 3.4, h: 0.4, fontFace: FONT, fontSize: 14, color: T2, bold: true });
    s5.addText(v, { x: x + 0.25, y: 1.8, w: 3.4, h: 0.6, fontFace: FONT, fontSize: 26, color: T1, bold: true });
  });
  if (k.loss.length) {
    const h = ["상차일", "거래처", "구간", "매출액", "손실액", "담당자", "손실 사유"].map((t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: NAVY } } }));
    const b = k.loss.map((x) => [x.d.slice(5), x.client, x.route, man(x.sale), { text: man(x.profit), options: { color: DOWN, bold: true } }, x.who, x.reason || "미기재"]);
    s5.addTable([h, ...b], { x: 0.5, y: 3.0, w: 12.3, colW: [0.9, 1.9, 3.1, 1.1, 1.1, 1.2, 3.0], fontFace: FONT, fontSize: 12, color: T1, border: { type: "solid", color: LINE, pt: 0.5 }, align: "center", valign: "middle", rowH: 0.4 });
  } else s5.addText("역마진 오더가 없어요.", { x: 0.5, y: 3.2, w: 12.3, h: 0.5, fontFace: FONT, fontSize: 16, color: T2 });

  // 7) 작성자 의견
  const ops = (meta.opinion || []).filter(([, t]) => String(t || "").trim());
  if (ops.length) {
    page += 1;
    const s6 = frame(pres, "작성자 의견", sub, page);
    const runs = [];
    ops.forEach(([title, text], i) => {
      runs.push({ text: title, options: { bold: true, color: NAVY, fontSize: 16, breakLine: true } });
      String(text).split("\n").forEach((ln) => runs.push({ text: ln || " ", options: { breakLine: true } }));
      if (i < ops.length - 1) runs.push({ text: " ", options: { breakLine: true } });
    });
    s6.addText(runs, { x: 0.6, y: 1.2, w: 12.1, h: 5.8, fontFace: FONT, fontSize: 14, color: T1, valign: "top", fit: "shrink" });
  }
  return pres;
}
export async function teamReportPptBlob(rep, meta) { const pres = await makeTeamReportPpt(rep, meta); return pres.write({ outputType: "blob" }); }
export async function saveTeamReportPpt(rep, meta, fileName) { const pres = await makeTeamReportPpt(rep, meta); return pres.writeFile({ fileName }); }
