// ======================= src/pptReportUtil.js =======================
// AI 월간비교분석(MonthCompareInsight)에서 이미 계산해둔 비교분석 결과(insight)를
// 그대로 받아 .pptx 월간 실적 보고서를 만들어 브라우저에서 바로 다운로드해준다.
// 캔바에서 매달 수작업으로 만들던 걸 대체하는 게 목표라, 캔바 실제 자료 구조(표지 →
// 매출현황 → 그래프 → 상위/감소 거래처 → 특이사항 → 마무리)를 그대로 따라간다.
//
// 이 파일은 pptxgenjs 외에 프로그램의 다른 어떤 것도 import하지 않는다 — 순수하게
// { templateId, companyName, monthA, monthB, insight, comments, author } 데이터만
// 받아서 pptx를 만들기 때문에, Node에서도 동일한 함수로 목업 데이터를 넣어 그대로
// 테스트/QA할 수 있다 (실제 앱 코드와 완전히 같은 생성 로직으로 검증됨).
import pptxgen from "pptxgenjs";

// ⭐ 템플릿 종류 — 색상/톤만 다르고 슬라이드 구성은 동일하다. "네이비 클래식"은
// 프로그램 자체 브랜드 컬러(#1B2B4B)와 동일해 프로그램 화면과 톤을 맞춘 기본값이다.
export const PPT_TEMPLATES = [
  {
    id: "navy",
    name: "네이비 클래식",
    desc: "프로그램 기본 톤과 통일된 짙은 네이비",
    primary: "1B2B4B",
    secondary: "E7ECF7",
    accent: "3E5C94",
    text: "1F2937",
    muted: "6B7280",
    good: "059669",
    bad: "DC2626",
    swatches: ["1B2B4B", "3E5C94", "E7ECF7"],
  },
  {
    id: "charcoal",
    name: "미니멀 화이트",
    desc: "절제된 차콜 톤의 미니멀 스타일",
    primary: "36454F",
    secondary: "F2F2F2",
    accent: "212121",
    text: "27272A",
    muted: "71717A",
    good: "15803D",
    bad: "B91C1C",
    swatches: ["36454F", "212121", "F2F2F2"],
  },
  {
    id: "burgundy",
    name: "딥 버건디",
    desc: "차분한 버건디 포인트의 격식 있는 스타일",
    primary: "5C2A38",
    secondary: "F3E9EA",
    accent: "8C4A5A",
    text: "2A2A2A",
    muted: "8A8A8A",
    good: "0F9D58",
    bad: "B4302F",
    swatches: ["5C2A38", "8C4A5A", "F3E9EA"],
  },
];

const FONT = "맑은 고딕";

const won = (n) => `${Math.round(n || 0).toLocaleString()}원`;
const pctStr = (a, b) => {
  if (!a) return b ? "+100.0%" : "0.0%";
  const p = ((b - a) / a) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
};
const pctNum = (a, b) => {
  if (!a) return b ? 100 : 0;
  return ((b - a) / a) * 100;
};
// 자동 생성 문단은 문장이 길어질 수 있어, 슬라이드 박스 높이를 넘기지 않도록
// 안전하게 길이를 제한한다(디자인 QA에서 확인된 여유치 기준).
const truncate = (s, max) => {
  const str = String(s || "");
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
};

function statCard(slide, { x, y, w, h, label, value, delta, good, t }) {
  slide.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.08,
    fill: { color: t.secondary },
    line: { type: "none" },
  });
  slide.addText(label, {
    x: x + 0.15, y: y + 0.13, w: w - 0.3, h: 0.3,
    fontFace: FONT, fontSize: 11, color: t.muted, bold: true, margin: 0,
  });
  slide.addText(value, {
    x: x + 0.15, y: y + 0.42, w: w - 0.3, h: 0.55,
    fontFace: FONT, fontSize: 22, color: t.primary, bold: true, margin: 0,
  });
  if (delta) {
    slide.addText(delta, {
      x: x + 0.15, y: y + h - 0.42, w: w - 0.3, h: 0.32,
      fontFace: FONT, fontSize: 11.5, bold: true,
      color: good ? t.good : t.bad, margin: 0,
    });
  }
}

// ⭐ 실제 PPT를 생성해 브라우저에서 바로 다운로드시킨다(Node에서 실행하면 로컬
// 파일로 저장된다 — 동일한 함수로 두 환경 모두 지원). options:
//   templateId  : PPT_TEMPLATES 중 하나의 id
//   companyName : 표지에 표시할 운송사명 (없으면 생략)
//   monthA/monthB: "YYYY-MM" — 비교 기준월/대상월 (AI 월간비교분석에서 선택한 두 달)
//   insight     : buildMonthCompareInsight(rowsA, rowsB, monthA, monthB)의 반환값
//   comments    : 관리자가 입력한 자유 텍스트(줄바꿈으로 구분되는 특이사항). 없으면 해당 슬라이드 생략
//   author      : (선택) 작성자 표시 문구
export async function generateMonthlyReportPPT({
  templateId = "navy",
  companyName = "",
  monthA = "",
  monthB = "",
  insight,
  comments = "",
  author = "",
  fileName = "",
} = {}) {
  const t = PPT_TEMPLATES.find((x) => x.id === templateId) || PPT_TEMPLATES[0];
  if (!insight) throw new Error("insight 데이터가 필요합니다.");
  const { A, B, topGrowth = [], topDecline = [], report = [] } = insight;

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.3" x 7.5"

  const saleGood = B.sale >= A.sale;
  const rateGood = B.rate >= A.rate;
  const cntGood = B.cnt >= A.cnt;
  const avgGood = B.avgSale >= A.avgSale;

  // ── 1. 표지 ──────────────────────────────────────────────
  {
    const slide = pres.addSlide();
    slide.background = { color: t.primary };
    if (companyName) {
      slide.addText(companyName, {
        x: 0.9, y: 2.35, w: 11.5, h: 0.5,
        fontFace: FONT, fontSize: 16, color: "FFFFFF", bold: true, charSpacing: 2, margin: 0,
      });
    }
    slide.addText(`${monthB} 실적 보고서`, {
      x: 0.9, y: 2.85, w: 11.5, h: 1.0,
      fontFace: FONT, fontSize: 42, color: "FFFFFF", bold: true, margin: 0,
    });
    slide.addText(`${monthA} 대비 비교분석`, {
      x: 0.9, y: 3.75, w: 11.5, h: 0.5,
      fontFace: FONT, fontSize: 16, color: t.secondary, margin: 0,
    });
    const today = new Date().toISOString().slice(0, 10);
    slide.addText(
      author ? `${today}  ·  ${author}` : today,
      {
        x: 0.9, y: 6.6, w: 11.5, h: 0.4,
        fontFace: FONT, fontSize: 12, color: "FFFFFF", transparency: 30, margin: 0,
      }
    );
  }

  // ── 2. 매출 현황 (KPI 카드 + 첫 리포트 문단) ────────────────
  {
    const slide = pres.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addText(`${monthB} 매출 현황`, {
      x: 0.7, y: 0.45, w: 11.9, h: 0.6,
      fontFace: FONT, fontSize: 28, color: t.primary, bold: true, margin: 0,
    });
    slide.addText(`${monthA} 대비 비교 · 배차완료 오더 기준`, {
      x: 0.7, y: 1.0, w: 11.9, h: 0.35,
      fontFace: FONT, fontSize: 12, color: t.muted, margin: 0,
    });

    const cardW = 2.85, gap = 0.25, startX = 0.7, cardY = 1.55, cardH = 1.5;
    const cards = [
      { label: "총 매출", value: won(B.sale), delta: `${saleGood ? "▲" : "▼"} 전월 대비 ${pctStr(A.sale, B.sale)}`, good: saleGood },
      { label: "수익률", value: `${B.rate.toFixed(1)}%`, delta: `전월 ${A.rate.toFixed(1)}% → ${B.rate.toFixed(1)}%`, good: rateGood },
      { label: "오더 건수", value: `${B.cnt.toLocaleString()}건`, delta: `${cntGood ? "▲" : "▼"} 전월 대비 ${pctStr(A.cnt, B.cnt)}`, good: cntGood },
      { label: "건당 평균단가", value: won(B.avgSale), delta: `${avgGood ? "▲" : "▼"} 전월 대비 ${pctStr(A.avgSale, B.avgSale)}`, good: avgGood },
    ];
    cards.forEach((c, i) => {
      statCard(slide, { x: startX + i * (cardW + gap), y: cardY, w: cardW, h: cardH, t, ...c });
    });

    if (report[0]) {
      slide.addShape("roundRect", {
        x: 0.7, y: 3.35, w: 11.93, h: 3.4, rectRadius: 0.08,
        fill: { color: t.secondary }, line: { type: "none" },
      });
      slide.addText("AI 분석 코멘트 — 매출 및 수익성", {
        x: 1.0, y: 3.6, w: 11.3, h: 0.4,
        fontFace: FONT, fontSize: 13, color: t.primary, bold: true, margin: 0,
      });
      slide.addText(truncate(report[0].body, 520), {
        x: 1.0, y: 4.05, w: 11.3, h: 2.55,
        fontFace: FONT, fontSize: 13, color: t.text, margin: 0, lineSpacingMultiple: 1.35,
        valign: "top",
      });
    }
  }

  // ── 3. 매출·수익 비교 그래프 ────────────────────────────────
  {
    const slide = pres.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addText("매출·수익 비교", {
      x: 0.7, y: 0.45, w: 11.9, h: 0.6,
      fontFace: FONT, fontSize: 28, color: t.primary, bold: true, margin: 0,
    });
    slide.addText(`${monthA} vs ${monthB}`, {
      x: 0.7, y: 1.0, w: 11.9, h: 0.35,
      fontFace: FONT, fontSize: 12, color: t.muted, margin: 0,
    });

    const chartData = [
      { name: "매출", labels: [monthA, monthB], values: [A.sale, B.sale] },
      { name: "수익", labels: [monthA, monthB], values: [A.profit, B.profit] },
    ];
    slide.addChart("bar", chartData, {
      x: 1.0, y: 1.6, w: 11.3, h: 5.4,
      barDir: "col",
      showTitle: false,
      showLegend: true, legendPos: "b", legendColor: t.muted, legendFontSize: 12,
      showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 11,
      dataLabelColor: t.text, dataLabelFormatCode: "#,##0",
      chartColors: [t.primary, t.accent],
      catAxisLabelColor: t.muted, catAxisLabelFontSize: 12,
      valAxisLabelColor: t.muted, valAxisLabelFontSize: 10,
      valAxisLabelFormatCode: "#,##0",
      valGridLine: { color: "E5E7EB", size: 1 },
      catGridLine: { style: "none" },
      fontFace: FONT,
    });
  }

  // ── 4~. 비교분석 보고서 (report[1:] 를 2개씩 묶어 슬라이드 생성) ──
  const restSections = (report || []).slice(1);
  const chunks = [];
  for (let i = 0; i < restSections.length; i += 2) chunks.push(restSections.slice(i, i + 2));
  chunks.forEach((chunk, ci) => {
    const slide = pres.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addText(
      chunks.length > 1 ? `비교분석 보고서 (${ci + 1}/${chunks.length})` : "비교분석 보고서",
      { x: 0.7, y: 0.45, w: 11.9, h: 0.6, fontFace: FONT, fontSize: 28, color: t.primary, bold: true, margin: 0 }
    );
    const boxH = 2.85, boxGap = 0.3, startY = 1.3;
    chunk.forEach((sec, i) => {
      const y = startY + i * (boxH + boxGap);
      slide.addShape("roundRect", {
        x: 0.7, y, w: 11.93, h: boxH, rectRadius: 0.08,
        fill: { color: t.secondary }, line: { type: "none" },
      });
      slide.addText(sec.title, {
        x: 1.0, y: y + 0.22, w: 11.3, h: 0.4,
        fontFace: FONT, fontSize: 14, color: t.accent, bold: true, margin: 0,
      });
      slide.addText(truncate(sec.body, 420), {
        x: 1.0, y: y + 0.68, w: 11.3, h: boxH - 0.9,
        fontFace: FONT, fontSize: 12, color: t.text, margin: 0, lineSpacingMultiple: 1.3,
        valign: "top",
      });
    });
  });

  // ── 5. 거래처 동향 (증가/감소 TOP5) ─────────────────────────
  {
    const slide = pres.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addText("거래처 동향", {
      x: 0.7, y: 0.45, w: 11.9, h: 0.6,
      fontFace: FONT, fontSize: 28, color: t.primary, bold: true, margin: 0,
    });
    slide.addText(`${monthB} 매출 증감 TOP5`, {
      x: 0.7, y: 1.0, w: 11.9, h: 0.35,
      fontFace: FONT, fontSize: 12, color: t.muted, margin: 0,
    });

    const tableOpts = {
      fontFace: FONT, fontSize: 11.5, color: t.text,
      border: { type: "solid", color: "E5E7EB", pt: 0.75 },
      autoPage: false,
    };
    const headerRow = (label, bg) => ([
      { text: "거래처명", options: { bold: true, color: "FFFFFF", fill: { color: bg }, align: "left" } },
      { text: "증감액", options: { bold: true, color: "FFFFFF", fill: { color: bg }, align: "right" } },
      { text: "건수 변화", options: { bold: true, color: "FFFFFF", fill: { color: bg }, align: "center" } },
    ]);
    const toRows = (list, signPrefix) => list.map((c) => ([
      { text: c.client || "미지정", options: { align: "left" } },
      { text: `${signPrefix}${won(Math.abs(c.delta))}`, options: { align: "right", bold: true, color: signPrefix === "+" ? t.good : t.bad } },
      { text: `${c.cntA}건 → ${c.cntB}건`, options: { align: "center", color: t.muted } },
    ]));

    const half = 5.7, gap = 0.5, y = 1.55, rowH = 0.42;
    slide.addTable(
      [headerRow("매출 증가 TOP5", t.good), ...(topGrowth.length ? toRows(topGrowth, "+") : [[{ text: "해당 거래처 없음", options: { align: "center", colspan: 3, color: t.muted } }]])],
      { x: 0.7, y, w: half, colW: [half * 0.5, half * 0.28, half * 0.22], rowH, ...tableOpts }
    );
    slide.addTable(
      [headerRow("매출 감소 TOP5", t.bad), ...(topDecline.length ? toRows(topDecline, "-") : [[{ text: "해당 거래처 없음", options: { align: "center", colspan: 3, color: t.muted } }]])],
      { x: 0.7 + half + gap, y, w: half, colW: [half * 0.5, half * 0.28, half * 0.22], rowH, ...tableOpts }
    );
  }

  // ── 6. 특이사항 및 참고사항 (관리자 입력, 있을 때만) ─────────
  const commentLines = String(comments || "").split("\n").map((s) => s.trim()).filter(Boolean);
  if (commentLines.length) {
    const slide = pres.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addText("특이사항 및 참고사항", {
      x: 0.7, y: 0.45, w: 11.9, h: 0.6,
      fontFace: FONT, fontSize: 28, color: t.primary, bold: true, margin: 0,
    });
    slide.addText(`${monthB} 내부 코멘트`, {
      x: 0.7, y: 1.0, w: 11.9, h: 0.35,
      fontFace: FONT, fontSize: 12, color: t.muted, margin: 0,
    });
    slide.addShape("roundRect", {
      x: 0.7, y: 1.55, w: 11.93, h: 5.2, rectRadius: 0.08,
      fill: { color: t.secondary }, line: { type: "none" },
    });
    slide.addText(
      commentLines.slice(0, 14).map((line, i) => ({
        text: truncate(line, 160),
        options: { bullet: { code: "25CF" }, breakLine: i < commentLines.length - 1, paraSpaceAfter: 12 },
      })),
      {
        x: 1.05, y: 1.85, w: 11.3, h: 4.6,
        fontFace: FONT, fontSize: 14, color: t.text, margin: 0, valign: "top",
      }
    );
  }

  // ── 7. 마무리 ────────────────────────────────────────────
  {
    const slide = pres.addSlide();
    slide.background = { color: t.primary };
    slide.addText("감사합니다", {
      x: 0, y: 3.1, w: 13.33, h: 1.0,
      fontFace: FONT, fontSize: 40, color: "FFFFFF", bold: true, align: "center", margin: 0,
    });
    slide.addText(
      companyName ? `${companyName} · ${monthB} 실적 보고서` : `${monthB} 실적 보고서`,
      {
        x: 0, y: 4.05, w: 13.33, h: 0.5,
        fontFace: FONT, fontSize: 14, color: t.secondary, align: "center", margin: 0,
      }
    );
  }

  const safeMonth = String(monthB || "").replace(/[^\d-]/g, "");
  const outName = fileName || `${companyName ? companyName + "_" : ""}${safeMonth}_실적보고서.pptx`;
  await pres.writeFile({ fileName: outName });
  return outName;
}
