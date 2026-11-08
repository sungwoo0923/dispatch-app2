// LogisWeb decks — homepage look (Pretendard, dark navy, blue accents)
const pptxgen = require("pptxgenjs");
const path = require("path");
const A = (f) => path.join(__dirname, "assets", f);

const F = "Pretendard";
const C = {
  white: "FFFFFF", text: "D3DFF5", sub: "A9C0EC", muted: "7F95BF",
  sky: "8FB0F0", blue: "4F8BFF", blue2: "2D5BD8",
  card: "13213D", card2: "0F1A30", line: "2A3D63", hi: "1B3570", ok: "2BD17E",
};
const W = 13.333, H = 7.5, MX = 0.75;

// framed screenshot sizes (px) — card size inside the shadow padding
const FR = { pad: 90, cardW: 2000, imgW: 2180 };
const PH = { pad: 80, cardW: 824, imgW: 984 };
const sizes = {
  "f-home.png": 1444, "f-dispatch.png": 1444, "f-board.png": 1444, "f-livemap.png": 1444,
  "f-control.png": 1444, "f-settle.png": 1444, "f-revenue.png": 1444, "f-revenue2.png": 1444,
  "f-fare.png": 1444, "f-approval.png": 1369, "f-scan.png": 1369,
  "p-control.png": 1532, "p-approval.png": 1532, "p-driver-order.png": 1466, "p-driver-log.png": 1466,
};
// place a framed image so that the visible card starts at (x,y) with width w
function framed(s, file, x, y, w) {
  const k = file.startsWith("p-") ? PH : FR;
  const scale = w / k.cardW;
  const iw = k.imgW * scale, ih = sizes[file] * scale;
  s.addImage({ path: A(file), x: x - k.pad * scale, y: y - k.pad * scale, w: iw, h: ih });
  return { h: ih - 2 * k.pad * scale };
}

function T(s, text, o) {
  s.addText(text, Object.assign({ fontFace: F, color: C.text, fontSize: 14, margin: 0, valign: "top",
    lineSpacingMultiple: 1.2, fit: "none" }, o));
}
function eyebrow(s, text, x, y, w = 8, color = C.sky) {
  T(s, text, { x, y, w, h: 0.3, fontSize: 11, bold: true, color, charSpacing: 3 });
}
function card(s, x, y, w, h, o = {}) {
  s.addShape("roundRect", { x, y, w, h, rectRadius: o.r ?? 0.14,
    fill: { color: o.fill || C.card, transparency: o.tr ?? 18 },
    line: { color: o.line || C.line, width: o.lw ?? 1, transparency: o.ltr ?? 0 } });
}
function chip(s, text, x, y, o = {}) {
  const w = o.w || 0.18 + text.length * (o.cw || 0.13);
  s.addShape("roundRect", { x, y, w, h: o.h || 0.32, rectRadius: 0.16,
    fill: { color: o.fill || C.sky, transparency: o.tr ?? 86 },
    line: { color: o.line || C.sky, width: 0.75, transparency: o.ltr ?? 55 } });
  T(s, text, { x, y, w, h: o.h || 0.32, fontSize: o.fs || 10.5, bold: true, color: o.color || C.sky,
    align: "center", valign: "middle", charSpacing: o.cs ?? 1 });
  return w;
}
function numBadge(s, n, x, y, sz = 0.46, filled = true) {
  s.addShape("roundRect", { x, y, w: sz, h: sz, rectRadius: 0.1,
    fill: { color: filled ? C.blue2 : C.sky, transparency: filled ? 0 : 85 }, line: { color: C.blue, width: 0.75, transparency: 30 } });
  T(s, n, { x, y, w: sz, h: sz, fontSize: 13, bold: true, color: C.white, align: "center", valign: "middle" });
}
// bullet list with blue dots, one paragraph per item. items: string | {t, tag}
function bullets(s, items, x, y, w, o = {}) {
  const fs = o.fs || 15, gap = o.gap || 0.46;
  items.forEach((it, i) => {
    const t = typeof it === "string" ? it : it.t;
    const yy = y + i * gap;
    s.addShape("ellipse", { x, y: yy + fs / 72 * 0.42, w: 0.09, h: 0.09, fill: { color: C.blue }, line: { color: C.blue, width: 0 } });
    let tx = x + 0.24;
    if (it.tag) { tx += chip(s, it.tag, tx, yy - 0.02, { h: 0.28, fs: 9, cw: 0.11, color: "FFFFFF", fill: C.blue2, tr: 0, line: C.blue, ltr: 0 }) + 0.1; }
    T(s, t, { x: tx, y: yy, w: w - (tx - x), h: 0.36, fontSize: fs, color: o.color || C.text });
  });
}
function header(s, eb, title, sub, o = {}) {
  eyebrow(s, eb, MX, 0.62);
  T(s, title, { x: MX, y: 0.92, w: o.w || 11.8, h: 0.75, fontSize: o.fs || 32, bold: true, color: C.white, lineSpacingMultiple: 1.05 });
  if (sub) T(s, sub, { x: MX, y: 1.62, w: o.w || 11.8, h: 0.4, fontSize: 16, color: C.sub });
}
function footer(s, n, total, label = "LOGISWEB") {
  s.addImage({ path: A("logisweb-mark.png"), x: MX, y: 6.93, w: 0.26, h: 0.26 });
  T(s, label, { x: MX + 0.36, y: 6.95, w: 3, h: 0.24, fontSize: 9.5, bold: true, color: C.muted, charSpacing: 3, valign: "middle" });
  T(s, String(n).padStart(2, "0") + "  /  " + String(total).padStart(2, "0"), { x: W - MX - 2, y: 6.95, w: 2, h: 0.24, fontSize: 9.5, bold: true, color: C.muted, align: "right", charSpacing: 2, valign: "middle" });
}
function newSlide(pres, bg) {
  const s = pres.addSlide();
  s.background = { path: A(bg) };
  return s;
}

/* ======================= INTRO DECK ======================= */
function intro() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.title = "로지스웹 소개서";
  const N = 13;
  let s;

  // 1 cover
  s = newSlide(pres, "bg-cover.jpg");
  s.addImage({ path: A("logisweb-lockup.png"), x: MX, y: 0.75, w: 3.1, h: 3.1 * 444 / 1897 });
  eyebrow(s, "운송사 배차관리 프로그램", MX, 2.05, 6, C.sky);
  T(s, "배차부터 관제 · 정산\n경영까지 하나로", { x: MX, y: 2.42, w: 6.4, h: 1.7, fontSize: 44, bold: true, color: C.white, lineSpacingMultiple: 1.08 });
  T(s, "PC · 모바일 · 기사앱 · 화주 포털 · 로지스웹 허브를 한 데이터로 잇고,\n설치 없이 브라우저로 바로 시작합니다.", { x: MX, y: 4.25, w: 6.2, h: 0.8, fontSize: 15, color: C.sub, lineSpacingMultiple: 1.35 });
  let cx = MX;
  for (const t of ["실시간 배차", "AI 오더 스캔", "지입차 관제", "자동 정산", "경영 분석"]) cx += chip(s, t, cx, 5.25, { h: 0.36, fs: 11, cw: 0.15 }) + 0.12;
  T(s, "www.logisweb.co.kr", { x: MX, y: 6.35, w: 4, h: 0.35, fontSize: 14, bold: true, color: C.white, charSpacing: 1 });
  framed(s, "f-home.png", 7.05, 1.25, 5.75);
  framed(s, "p-control.png", 11.35, 3.35, 1.45);
  s.addNotes("안녕하세요. 오늘 소개드릴 프로그램은 로지스웹(LogisWeb)입니다.\n운송사에서 배차팀장으로 일하며 매일 엑셀로 배차하던 불편을 직접 해결하려고 만든 프로그램이고, 지금도 현장에서 매일 쓰고 있습니다.\n배차부터 관제, 정산, 경영 분석, 사내 업무까지 하나로 처리합니다.");

  // 2 before / after
  s = newSlide(pres, "bg-a.jpg");
  header(s, "BEFORE → AFTER", "엑셀 배차에서 로지스웹으로", "오더 입력 한 번으로 배차 · 정산 · 경영 보고까지 이어집니다");
  card(s, MX, 2.45, 5.65, 3.95, { fill: C.card2, tr: 10 });
  T(s, "지금 · 엑셀 배차", { x: MX + 0.45, y: 2.8, w: 5, h: 0.4, fontSize: 18, bold: true, color: C.muted });
  ["여러 명이 같은 파일을 고치다 덮어써짐", "오더 · 배차 · 정산 시트가 따로따로", "사무실 밖에서는 현황 확인 불가", "인수증은 카톡 · 종이로 따로 수거", "누가 무엇을 바꿨는지 알 수 없음"].forEach((t, i) => {
    T(s, "✕", { x: MX + 0.45, y: 3.45 + i * 0.55, w: 0.3, h: 0.35, fontSize: 14, bold: true, color: "E56B6B" });
    T(s, t, { x: MX + 0.85, y: 3.45 + i * 0.55, w: 4.6, h: 0.35, fontSize: 15, color: C.muted });
  });
  card(s, 6.93, 2.45, 5.65, 3.95, { fill: C.hi, tr: 5, line: C.blue, lw: 1.5 });
  T(s, "도입 후 · 로지스웹", { x: 7.38, y: 2.8, w: 5, h: 0.4, fontSize: 18, bold: true, color: C.white });
  ["여러 명이 동시에 써도 실시간 반영", "오더 한 번 입력으로 정산 · 경영 보고까지", "PC · 모바일 어디서나, 설치 없이 접속", "기사 링크로 인수증 사진 · 서명 자동 첨부", "오더별 변경 이력 + 휴지통 복구"].forEach((t, i) => {
    T(s, "✓", { x: 7.38, y: 3.45 + i * 0.55, w: 0.3, h: 0.35, fontSize: 15, bold: true, color: C.ok });
    T(s, t, { x: 7.78, y: 3.45 + i * 0.55, w: 4.7, h: 0.35, fontSize: 15, color: C.white });
  });
  s.addShape("ellipse", { x: 6.43, y: 4.17, w: 0.52, h: 0.52, fill: { color: C.blue2 }, line: { color: C.blue, width: 1 } });
  T(s, "→", { x: 6.43, y: 4.17, w: 0.52, h: 0.52, fontSize: 18, bold: true, color: C.white, align: "center", valign: "middle" });
  footer(s, 2, N);
  s.addNotes("도입하면 무엇이 달라지는지 한 장으로 비교했습니다. 왼쪽이 지금 엑셀 방식, 오른쪽이 로지스웹입니다.\n가장 큰 차이는 오더를 한 번만 입력하면 정산과 경영 보고까지 이어진다는 점입니다.");

  // 3 overview
  s = newSlide(pres, "bg-b.jpg");
  header(s, "OVERVIEW", "한눈에 보는 로지스웹", "운송사 업무 전체를 6개 영역으로 한 프로그램에서 처리합니다");
  const areas = [
    ["01", "배차", "DISPATCH", "오더 등록 · AI 오더 스캔\n실시간 배차현황 · 운임조회 · 단가표"],
    ["02", "관제 · 기사앱", "FLEET", "지입차 실시간 위치 · 운행 단계\n기사앱 · 업로드 링크로 인수증 첨부"],
    ["03", "정산 · 매출", "SETTLEMENT", "거래명세서 · 미수금 · 기사 지급\n입금 자동 매칭 · 월 마감 점검"],
    ["04", "경영 분석", "INSIGHT", "손익 · 거래처 · 차량 · 현금흐름\n매일 아침 일일 경영 보고"],
    ["05", "사내 업무", "OFFICE", "전자결재 · 사내메일 · 메신저\n근태 · 연차 · 급여관리"],
    ["06", "연결", "NETWORK", "화주사 포털 · 기사앱 (무료)\n로지스웹 허브 — 운송사 간 오더 거래소"],
  ];
  areas.forEach(([n, t, en, d], i) => {
    const x = MX + (i % 3) * 4.0, y = 2.35 + Math.floor(i / 3) * 2.2;
    card(s, x, y, 3.8, 2.0);
    numBadge(s, n, x + 0.32, y + 0.32);
    T(s, en, { x: x + 1.9, y: y + 0.4, w: 1.6, h: 0.3, fontSize: 9, bold: true, color: C.muted, align: "right", charSpacing: 2 });
    T(s, t, { x: x + 0.32, y: y + 0.95, w: 3.3, h: 0.4, fontSize: 19, bold: true, color: C.white });
    T(s, d, { x: x + 0.32, y: y + 1.35, w: 3.4, h: 0.6, fontSize: 12, color: C.sub, lineSpacingMultiple: 1.3 });
  });
  footer(s, 3, N);
  s.addNotes("로지스웹은 운송사 업무를 여섯 영역으로 나눠 한 프로그램에서 처리합니다. 이어서 각 영역을 한 장씩 보여드리겠습니다.");

  // 4 dispatch
  s = newSlide(pres, "bg-a.jpg");
  eyebrow(s, "01 · DISPATCH", MX, 0.62);
  T(s, "배차관리\n빠르고 정확하게", { x: MX, y: 0.92, w: 4.6, h: 1.4, fontSize: 32, bold: true, color: C.white, lineSpacingMultiple: 1.08 });
  T(s, "오더 등록부터 배차까지 한 화면에서", { x: MX, y: 2.4, w: 4.6, h: 0.35, fontSize: 15, color: C.sub });
  bullets(s, [
    "거래처 · 상하차지 자동완성, 다중등록",
    { t: "카톡 · 캡처 오더 스캔 → AI 자동 입력", tag: "NEW" },
    "실시간 배차현황 — 엑셀처럼 표에서 수정",
    "고정노선 자동 생성 · 구글시트 연동",
    "전국 · 자사 운임조회, 실적 기반 단가표",
    "안 본 오더 배지 · 변경 이력 · 휴지통",
  ], MX, 3.15, 4.75, { fs: 14, gap: 0.5 });
  framed(s, "f-dispatch.png", 5.8, 0.85, 6.8);
  framed(s, "f-scan.png", 8.75, 4.1, 3.85);
  footer(s, 4, N);
  s.addNotes("배차 화면입니다. 거래처와 상하차지는 한 번 입력하면 다음부터 자동완성됩니다.\n새로 들어간 오더 스캔은 카톡이나 캡처 사진을 올리면 AI가 상차지·하차지·차종 칸을 채워줍니다. 회사별로 학습해서 쓸수록 정확해집니다.\n고정노선은 자동으로 만들어지고 구글시트 배차표와도 연동됩니다.");

  // 5 AI & automation
  s = newSlide(pres, "bg-b.jpg");
  header(s, "NEW · AUTOMATION", "AI 비서와 업무 자동화", "반복 업무는 프로그램이 대신합니다");
  card(s, MX, 2.35, 5.4, 4.15, { fill: C.hi, tr: 8, line: C.blue, lw: 1.25 });
  chip(s, "AI ASSISTANT", MX + 0.4, 2.7, { fs: 9.5, cw: 0.1, w: 1.35 });
  T(s, "말로 오더 등록 · 수정 · 조회", { x: MX + 0.4, y: 3.15, w: 4.7, h: 0.45, fontSize: 21, bold: true, color: C.white });
  // chat mock
  s.addShape("roundRect", { x: MX + 1.55, y: 3.8, w: 3.5, h: 0.62, rectRadius: 0.14, fill: { color: C.blue2 }, line: { color: C.blue2, width: 0 } });
  T(s, "내일 오전 인천 → 평택\n5톤 오더 등록해줘", { x: MX + 1.7, y: 3.83, w: 3.3, h: 0.58, fontSize: 11.5, color: C.white, valign: "middle", lineSpacingMultiple: 1.15 });
  s.addShape("roundRect", { x: MX + 0.4, y: 4.6, w: 4.0, h: 1.5, rectRadius: 0.14, fill: { color: C.card2, transparency: 0 }, line: { color: C.line, width: 1 } });
  T(s, "확인 카드", { x: MX + 0.6, y: 4.72, w: 3, h: 0.3, fontSize: 10, bold: true, color: C.sky, charSpacing: 2 });
  T(s, "상차 인천 · 하차 평택 · 5톤 · 내일 오전", { x: MX + 0.6, y: 5.02, w: 3.7, h: 0.3, fontSize: 12.5, bold: true, color: C.white });
  chip(s, "적용", MX + 0.6, 5.5, { w: 0.9, fill: C.blue, tr: 0, line: C.blue, color: "FFFFFF", fs: 10.5 });
  chip(s, "되돌리기", MX + 1.6, 5.5, { w: 1.1, fs: 10.5 });
  const autos = [
    ["카카오 알림톡 배차 알림", "배차가 확정되면 기사님께\n상 · 하차 정보를 자동 발송"],
    ["입금 자동 매칭", "은행 입금 내역을 자동 조회해\n미수금과 알아서 맞춰 둡니다"],
    ["국세청 사업자 상태조회", "거래처 휴 · 폐업 여부를\n등록 단계에서 바로 확인"],
    ["기상 예보 · 특보", "기상청 특보를 배차 화면에서\n확인하고 미리 대비합니다"],
  ];
  autos.forEach(([t, d], i) => {
    const x = 6.45 + (i % 2) * 3.1, y = 2.35 + Math.floor(i / 2) * 2.13;
    card(s, x, y, 2.95, 2.02);
    numBadge(s, String(i + 1).padStart(2, "0"), x + 0.3, y + 0.3, 0.42, false);
    T(s, t, { x: x + 0.3, y: y + 0.88, w: 2.6, h: 0.35, fontSize: 15, bold: true, color: C.white });
    T(s, d, { x: x + 0.3, y: y + 1.25, w: 2.6, h: 0.65, fontSize: 11.5, color: C.sub, lineSpacingMultiple: 1.3 });
  });
  footer(s, 5, N);
  s.addNotes("이번에 새로 들어간 자동화 기능입니다.\nAI 비서에게 말로 요청하면 확인 카드가 뜨고, 확인하면 그대로 저장되며 바로 되돌릴 수도 있습니다.\n배차 확정 시 기사님께 알림톡이 자동으로 가고, 은행 입금은 자동으로 조회해서 미수금과 맞춰줍니다.");

  // 6 fleet & driver app
  s = newSlide(pres, "bg-a.jpg");
  eyebrow(s, "02 · FLEET CONTROL", MX, 0.62);
  T(s, "지입차 관제 ·\n기사앱", { x: MX, y: 0.92, w: 4.4, h: 1.4, fontSize: 32, bold: true, color: C.white, lineSpacingMultiple: 1.08 });
  T(s, "실시간 위치부터 인수증까지", { x: MX, y: 2.4, w: 4.4, h: 0.35, fontSize: 15, color: C.sub });
  bullets(s, [
    "지도에서 위치 · 이동경로 · 운행 단계",
    "기사앱: 출근 · 상차 · 하차를 버튼 하나로",
    { t: "큰 글씨 새 디자인 · 오더장 · 운행일지", tag: "NEW" },
    { t: "퇴근 키로수 · 엔진오일 · 타이어 알림", tag: "NEW" },
    "업로드 링크: 앱 없이 인수증 · 서명",
    "올라온 서류는 해당 오더에 자동 첨부",
  ], MX, 3.15, 4.55, { fs: 14, gap: 0.5 });
  framed(s, "f-livemap.png", 5.65, 0.85, 5.6);
  framed(s, "p-driver-order.png", 9.65, 2.85, 1.5);
  framed(s, "p-control.png", 11.3, 3.35, 1.5);
  footer(s, 6, N);
  s.addNotes("지입차량이 있는 회사라면 꼭 보셔야 할 기능입니다.\n기사님이 기사앱에서 버튼만 누르면 상차 도착, 하차 완료가 실시간으로 기록되고 지도에서 위치를 확인합니다.\n기사앱은 큰 글씨로 새로 다듬었고, 퇴근 키로수를 입력하면 엔진오일 교체 시기도 알려줍니다.\n앱이 없는 기사님은 문자 링크로 인수증을 올리면 됩니다.");

  // 7 settlement
  s = newSlide(pres, "bg-b.jpg");
  framed(s, "f-settle.png", MX, 1.55, 6.75);
  eyebrow(s, "03 · SETTLEMENT", 7.95, 0.62);
  T(s, "정산 · 매출\n청구부터 입금까지", { x: 7.95, y: 0.92, w: 4.7, h: 1.4, fontSize: 32, bold: true, color: C.white, lineSpacingMultiple: 1.08 });
  T(s, "월말 정산 시간이 가장 많이 줄어듭니다", { x: 7.95, y: 2.4, w: 4.7, h: 0.35, fontSize: 15, color: C.sub });
  bullets(s, [
    "거래처 · 기간만 고르면 명세서 생성",
    "선불 · 착불 · 부가세 자동 계산",
    { t: "명세서 단계 보드 · 미수금 데스크", tag: "NEW" },
    "기사 지급관리 · 지급완료 결재 연동",
    "월 마감 점검으로 누락 · 오류 차단",
    "엑셀 · PDF · 인쇄 · 메일 발송",
  ], 7.95, 3.15, 4.7, { fs: 14, gap: 0.5 });
  footer(s, 7, N);
  s.addNotes("정산과 매출입니다. 거래처와 기간만 고르면 거래명세서가 자동으로 만들어지고, 선불·착불과 부가세도 자동 계산됩니다.\n명세서가 어느 단계인지 보드로 보고, 미수금은 미수금 데스크에서 관리합니다. 월 마감 점검이 빠진 건과 오류를 미리 잡아줍니다.");

  // 8 insight
  s = newSlide(pres, "bg-a.jpg");
  eyebrow(s, "04 · INSIGHT  ·  NEW", MX, 0.62);
  T(s, "경영 분석 ·\n일일 경영 보고", { x: MX, y: 0.92, w: 4.6, h: 1.4, fontSize: 32, bold: true, color: C.white, lineSpacingMultiple: 1.08 });
  T(s, "대표 · 임원을 위한 숫자 한 화면", { x: MX, y: 2.4, w: 4.6, h: 0.35, fontSize: 15, color: C.sub });
  bullets(s, [
    "손익 · 거래처 · 기사 · 차량 · 단가 분석",
    "현금흐름 · 영업 · 사업계획 탭",
    "매일 아침 일일 경영 보고 (팝업 · 푸시)",
    "월 목표 진척 · 자금 현황 · 차량 가동률",
    { t: "수익성 인사이트 · 이상 운임 감지", tag: "PRO" },
    { t: "화주 월간 리포트 원클릭 PDF", tag: "PRO" },
  ], MX, 3.15, 4.75, { fs: 14, gap: 0.5 });
  framed(s, "f-revenue.png", 5.8, 0.85, 6.8);
  card(s, 8.6, 4.95, 4.0, 1.45, { fill: C.card2, tr: 0, line: C.blue, lw: 1.25 });
  T(s, "DAILY REPORT", { x: 8.9, y: 5.12, w: 3, h: 0.28, fontSize: 9.5, bold: true, color: C.sky, charSpacing: 3 });
  T(s, "매일 아침, 어제 실적이 먼저 옵니다", { x: 8.9, y: 5.42, w: 3.6, h: 0.35, fontSize: 14, bold: true, color: C.white });
  T(s, "매출 · 수익 · 월 목표 진척 · 자금 현황", { x: 8.9, y: 5.8, w: 3.6, h: 0.3, fontSize: 11.5, color: C.sub });
  footer(s, 8, N);
  s.addNotes("대표님과 임원을 위한 경영 분석 화면입니다. 손익, 거래처, 기사, 차량, 단가, 현금흐름까지 탭별로 볼 수 있습니다.\n매일 아침에는 일일 경영 보고가 팝업과 푸시로 와서 어제 실적과 월 목표 진척을 바로 확인합니다.\n프로 요금제에서는 저마진 오더 경고와 화주 월간 리포트도 제공합니다.");

  // 9 office
  s = newSlide(pres, "bg-b.jpg");
  framed(s, "f-approval.png", MX, 1.6, 6.3);
  framed(s, "p-approval.png", 5.9, 3.35, 1.5);
  eyebrow(s, "05 · OFFICE", 7.95, 0.62);
  T(s, "사내 업무까지\n한 프로그램으로", { x: 7.95, y: 0.92, w: 4.7, h: 1.4, fontSize: 32, bold: true, color: C.white, lineSpacingMultiple: 1.08 });
  T(s, "따로 그룹웨어를 쓸 필요가 없습니다", { x: 7.95, y: 2.4, w: 4.7, h: 0.35, fontSize: 15, color: C.sub });
  bullets(s, [
    "전자결재: 지출결의 · 기안 · 사업계획서",
    "필수 결재선 · 파일 첨부 · 인쇄 / PDF",
    "사내메일 · 사내 메신저 (1:1 · 그룹)",
    "게시판 · 공지사항 · 인수인계",
    "근태 · 연차 신청 · 연차 촉진 알림",
    { t: "급여명세서 · 근로계약서", tag: "NEW" },
  ], 7.95, 3.15, 4.7, { fs: 14, gap: 0.5 });
  footer(s, 9, N);
  s.addNotes("배차 외에 회사 업무도 한 프로그램에서 처리합니다.\n전자결재는 지출결의·기안·사업계획서 양식과 필수 결재선을 갖췄고 파일도 첨부됩니다.\n새로 급여관리가 들어가서 급여명세서와 근로계약서까지 만들 수 있고, 비밀번호로 잠겨 경리 담당만 봅니다.");

  // 10 network
  s = newSlide(pres, "bg-cover.jpg");
  header(s, "06 · NETWORK", "화주 · 기사 · 운송사를 하나로", "모두가 같은 데이터를 보기 때문에 확인 전화가 줄어듭니다");
  const nodes = [
    [MX, "화주사 포털", "무료", "화주가 직접 오더 등록\n진행 · 정산을 실시간 확인"],
    [4.85, "로지스웹", "운송사", "배차 · 관제 · 정산\n모든 데이터의 중심"],
    [8.95, "기사앱", "무료", "출근 · 상차 · 하차 버튼\n위치 · 운행 상태 자동 공유"],
  ];
  nodes.forEach(([x, t, tag, d], i) => {
    const center = i === 1;
    card(s, x, 2.35, 3.63, 2.05, center ? { fill: C.hi, tr: 0, line: C.blue, lw: 1.5 } : {});
    if (center) s.addImage({ path: A("logisweb-mark.png"), x: x + 0.32, y: 2.62, w: 0.5, h: 0.5 });
    else numBadge(s, i === 0 ? "화" : "기", x + 0.32, 2.64, 0.46, false);
    chip(s, tag, x + 2.6, 2.7, { w: 0.75, fs: 9.5, ...(tag === "무료" ? { color: C.ok, line: C.ok, fill: C.ok } : {}) });
    T(s, t, { x: x + 0.32, y: 3.25, w: 3.0, h: 0.4, fontSize: 19, bold: true, color: C.white });
    T(s, d, { x: x + 0.32, y: 3.68, w: 3.1, h: 0.6, fontSize: 12, color: C.sub, lineSpacingMultiple: 1.3 });
  });
  for (const x of [4.38, 8.48]) T(s, "⇄", { x, y: 3.12, w: 0.47, h: 0.5, fontSize: 20, bold: true, color: C.sky, align: "center", valign: "middle" });
  card(s, MX, 4.65, 11.83, 1.85, { fill: C.card2, tr: 0, line: C.blue, lw: 1.25 });
  chip(s, "NEW", MX + 0.4, 4.98, { w: 0.62, fill: C.blue2, tr: 0, line: C.blue, color: "FFFFFF", fs: 9.5 });
  T(s, "로지스웹 허브", { x: MX + 0.4, y: 5.4, w: 3.3, h: 0.45, fontSize: 22, bold: true, color: C.white });
  T(s, "운송사 간 오더 거래소", { x: MX + 0.4, y: 5.88, w: 3.3, h: 0.35, fontSize: 13, color: C.sub });
  [["실시간 오더 콜", "차주에게 바로 전달"], ["10초 배차 확정", "배차신청 후 즉시 확정"], ["예치금 안전 정산", "인수증 · 계산서 확인 후 지급"], ["내 프로그램 자동 연결", "잡은 배차가 오더에 자동 반영"]].forEach(([t, d], i) => {
    const x = 4.35 + i * 2.05;
    s.addShape("line", { x: x - 0.12, y: 5.05, w: 0, h: 1.1, line: { color: C.line, width: 1 } });
    T(s, t, { x, y: 5.2, w: 1.95, h: 0.35, fontSize: 13.5, bold: true, color: C.white });
    T(s, d, { x, y: 5.58, w: 1.95, h: 0.55, fontSize: 11, color: C.sub, lineSpacingMultiple: 1.25 });
  });
  footer(s, 10, N);
  s.addNotes("화주사와 기사님, 그리고 다른 운송사까지 연결됩니다.\n화주사 포털과 기사앱은 무료입니다. 화주가 직접 오더를 올리고 진행 상황을 바로 보니 확인 전화가 줄어듭니다.\n새로 나온 로지스웹 허브는 운송사끼리 오더를 주고받는 거래소입니다. 차주는 실시간 콜을 받고 10초 안에 배차가 확정되며, 운임은 예치금으로 안전하게 정산됩니다. 허브에서 잡은 배차는 내 배차 프로그램 오더에 자동으로 들어갑니다.");

  // 11 security
  s = newSlide(pres, "bg-a.jpg");
  header(s, "SECURITY & SUPPORT", "보안과 운영 지원", "회사 데이터를 안전하게 지키고, 문제가 생기면 바로 함께 해결합니다");
  [
    ["운송사 간 데이터 완전 분리", "회사마다 데이터가 완전히 나뉘어\n다른 회사가 볼 수 없습니다"],
    ["역할별 메뉴 권한", "배차 · 정산 · 인사 등 역할에 따라\n필요한 메뉴만 보입니다"],
    ["휴대폰 인증 · 중복 로그인 차단", "PC 접속 시 휴대폰 인증,\n다른 기기 동시 로그인 차단"],
    ["접속 기록 · 앱 위변조 차단", "누가 언제 접속했는지 기록하고\nApp Check로 위조 앱을 막습니다"],
    ["매일 자동 백업 · 자동 점검", "데이터를 매일 백업하고\n화면 · 기능을 매일 자동 점검합니다"],
    ["원격 지원 · 데이터 소유권", "승인 후 화면을 같이 보며 해결,\n해지 시 엑셀로 전체 제공"],
  ].forEach(([t, d], i) => {
    const x = MX + (i % 3) * 4.0, y = 2.35 + Math.floor(i / 3) * 2.2;
    card(s, x, y, 3.8, 2.0);
    numBadge(s, String(i + 1).padStart(2, "0"), x + 0.32, y + 0.32, 0.42, false);
    T(s, t, { x: x + 0.32, y: y + 0.92, w: 3.3, h: 0.38, fontSize: 16, bold: true, color: C.white });
    T(s, d, { x: x + 0.32, y: y + 1.32, w: 3.35, h: 0.6, fontSize: 12, color: C.sub, lineSpacingMultiple: 1.3 });
  });
  footer(s, 11, N);
  s.addNotes("보안과 운영 지원입니다. 운송사끼리 데이터는 완전히 분리되고, 직원마다 필요한 메뉴만 보이게 권한을 나눕니다.\nPC 접속 시 휴대폰 인증, 동시 로그인 차단, 접속 기록이 남습니다.\n매일 자동 백업하고, 문제가 생기면 승인을 받아 화면을 같이 보며 원격으로 해결합니다. 데이터는 고객사 소유이고 해지하셔도 엑셀로 전부 드립니다.");

  // 12 pricing summary
  s = newSlide(pres, "bg-b.jpg");
  header(s, "PRICING · 월 요금 (VAT 별도)", "요금제 한눈에 보기", "작게 시작하고, 규모가 커지면 언제든 올리면 됩니다");
  pricingCards(s, 2.3, true);
  T(s, "기사앱 · 화주 포털 무료 무제한   ·   연간 선결제 2개월 무료   ·   12개월 약정 시 초기 도입비 면제", { x: MX, y: 6.45, w: 11.83, h: 0.3, fontSize: 12, bold: true, color: C.sky, align: "center" });
  footer(s, 12, N);
  s.addNotes("요금제는 네 가지입니다. 모두 월 요금이고 부가세 별도입니다.\n직원 6~12명 정도 일반 운송사라면 스탠다드를 추천드립니다.\n기사앱과 화주 포털은 모든 요금제에서 무료이고, 연간 선결제하시면 2개월이 무료, 12개월 약정이면 도입비가 면제됩니다. 자세한 내용은 요금 안내서를 참고해 주세요.");

  // 13 onboarding + CTA
  s = newSlide(pres, "bg-cover.jpg");
  header(s, "ONBOARDING", "도입은 약 1주면 충분합니다", "IT 담당자가 없어도 처음부터 끝까지 함께합니다");
  steps(s, 2.35);
  ctaBand(s, 4.85, "지금 쓰는 엑셀 자료 그대로,\n이전까지 함께 도와드립니다");
  footer(s, 13, N);
  s.addNotes("도입은 약 1주면 충분합니다. 지금 쓰시는 엑셀 양식과 배차 흐름을 확인하고, 계정을 만들고, 기존 자료를 옮기고, 직원분들께 직접 사용법을 알려드립니다.\n현직 배차팀장이 만든 프로그램이라 현장 요청을 빠르게 반영합니다. 문의는 www.logisweb.co.kr 로 주시면 됩니다. 감사합니다.");

  return pres;
}

const PLANS = [
  { en: "LITE", name: "라이트", price: "59,000", yr: "590,000", who: "1인 주선 · 개인 운송", day: "하루 20건 안팎", staff: "2명", orders: "600건", fleet: "–", storage: "5GB", setup: "0원",
    feats: ["배차 · 실시간 배차현황", "단가표 · 전국 운임조회", "기사앱 · 업로드 링크", "매출 · 정산 · 지급관리"] },
  { en: "BASIC", name: "베이직", price: "129,000", yr: "1,290,000", who: "소규모 2~5인", day: "하루 50~70건", staff: "5명", orders: "2,000건", fleet: "–", storage: "10GB", setup: "20만원",
    feats: ["라이트 전체 +", "화주사 전용 포털", "전자결재 · 메일 · 게시판", "인사 · 근태 · 회사관리"] },
  { en: "STANDARD", name: "스탠다드", price: "249,000", yr: "2,490,000", who: "일반 운송사 6~12인", day: "하루 100~150건", staff: "12명", orders: "4,500건", fleet: "10대", storage: "30GB", setup: "40만원", best: true,
    feats: ["베이직 전체 +", "지입차 관제 10대 포함", "GPS · 운행기록 · 사진", "데이터 추출 · 맞춤 리포트"] },
  { en: "PRO", name: "프로", price: "449,000", yr: "4,490,000", who: "중견 운송사 13인 이상", day: "하루 200~330건", staff: "25명", orders: "10,000건", fleet: "30대", storage: "100GB", setup: "70만원",
    feats: ["스탠다드 전체 +", "수익성 인사이트 · 화주 리포트", "24시콜 오더 자동 전송", "우선 기술지원 · 분기 점검"] },
];

function pricingCards(s, y, compact) {
  const w = 2.83, gap = 0.17, h = compact ? 3.95 : 4.3;
  PLANS.forEach((p, i) => {
    const x = MX + i * (w + gap);
    card(s, x, y, w, h, p.best ? { fill: C.hi, tr: 0, line: C.blue, lw: 2 } : {});
    if (p.best) chip(s, "추천", x + w - 0.95, y + 0.28, { w: 0.65, fill: C.blue, tr: 0, line: C.blue, color: "FFFFFF", fs: 10 });
    T(s, p.en, { x: x + 0.3, y: y + 0.3, w: 1.6, h: 0.28, fontSize: 9.5, bold: true, color: C.sky, charSpacing: 3 });
    T(s, p.name, { x: x + 0.3, y: y + 0.58, w: 2.2, h: 0.4, fontSize: 18, bold: true, color: C.white });
    s.addText([
      { text: p.price, options: { fontSize: 28, bold: true, color: C.white } },
      { text: " 원/월", options: { fontSize: 12, color: C.sub } },
    ], { x: x + 0.3, y: y + 1.05, w: 2.5, h: 0.55, fontFace: F, margin: 0, valign: "bottom" });
    T(s, p.who, { x: x + 0.3, y: y + 1.68, w: 2.4, h: 0.3, fontSize: 11.5, bold: true, color: p.best ? C.white : C.sky });
    T(s, "직원 " + p.staff + " · 월 오더 " + p.orders, { x: x + 0.3, y: y + 1.98, w: 2.45, h: 0.3, fontSize: 11, color: C.sub });
    s.addShape("line", { x: x + 0.3, y: y + 2.42, w: w - 0.6, h: 0, line: { color: p.best ? C.blue : C.line, width: 1 } });
    p.feats.forEach((f, k) => {
      const first = k === 0 && f.endsWith("+");
      T(s, (first ? "" : "✓  ") + f, { x: x + 0.3, y: y + 2.58 + k * 0.33, w: 2.45, h: 0.3, fontSize: 11, color: first ? C.sky : C.text, bold: first });
    });
  });
}

function steps(s, y) {
  [["01", "상담 · 업무 파악", "지금 쓰는 엑셀 양식과\n배차 흐름을 확인합니다"],
   ["02", "회사 계정 개설", "초기 설정 마법사가\n단계별로 안내합니다"],
   ["03", "기존 자료 이전", "거래처 · 기사 · 오더\n엑셀을 일괄 업로드"],
   ["04", "직원 사용 교육", "배차 · 정산 · 모바일\n사용법을 현장에서"],
   ["05", "운영 · 지속 지원", "필요한 기능을 계속\n반영하고 업데이트"]].forEach(([n, t, d], i) => {
    const x = MX + i * 2.4, last = i === 4;
    card(s, x, y, 2.23, 2.2, last ? { fill: C.hi, tr: 0, line: C.blue, lw: 1.5 } : {});
    T(s, n, { x: x + 0.28, y: y + 0.25, w: 1, h: 0.5, fontSize: 24, bold: true, color: last ? C.white : C.blue });
    T(s, t, { x: x + 0.28, y: y + 0.88, w: 1.9, h: 0.35, fontSize: 14.5, bold: true, color: C.white });
    T(s, d, { x: x + 0.28, y: y + 1.3, w: 1.9, h: 0.7, fontSize: 11, color: C.sub, lineSpacingMultiple: 1.3 });
  });
}

function ctaBand(s, y, msg) {
  s.addShape("roundRect", { x: MX, y, w: 11.83, h: 1.6, rectRadius: 0.16, fill: { color: C.blue2 }, line: { color: C.blue, width: 1.5 } });
  T(s, msg, { x: MX + 0.5, y: y + 0.3, w: 6, h: 1.0, fontSize: 20, bold: true, color: C.white, valign: "middle", lineSpacingMultiple: 1.2 });
  T(s, "도입 문의", { x: 8.3, y: y + 0.38, w: 3.8, h: 0.3, fontSize: 11, bold: true, color: "DCE8FF", align: "right", charSpacing: 2 });
  T(s, "www.logisweb.co.kr", { x: 7.3, y: y + 0.7, w: 4.8, h: 0.55, fontSize: 26, bold: true, color: C.white, align: "right" });
}

/* ======================= PRICING DECK ======================= */
function pricing() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.title = "로지스웹 요금 안내";
  const N = 7;
  let s;

  // 1 cover
  s = newSlide(pres, "bg-cover.jpg");
  s.addImage({ path: A("logisweb-lockup.png"), x: MX, y: 0.75, w: 3.1, h: 3.1 * 444 / 1897 });
  eyebrow(s, "PRICING · 2026년 11월 기준", MX, 2.05);
  T(s, "요금 안내\n도입 제안", { x: MX, y: 2.42, w: 6.2, h: 1.7, fontSize: 46, bold: true, color: C.white, lineSpacingMultiple: 1.08 });
  T(s, "배차 직원 한 명 인건비의 일부로\n배차 · 관제 · 정산 · 경영 분석 · 사내 업무까지.", { x: MX, y: 4.25, w: 6.2, h: 0.8, fontSize: 15, color: C.sub, lineSpacingMultiple: 1.35 });
  let cx = MX;
  for (const t of ["월 59,000원부터", "기사앱 · 화주 포털 무료", "VAT 별도"]) cx += chip(s, t, cx, 5.25, { h: 0.36, fs: 11, cw: 0.14 }) + 0.12;
  T(s, "www.logisweb.co.kr", { x: MX, y: 6.35, w: 4, h: 0.35, fontSize: 14, bold: true, color: C.white, charSpacing: 1 });
  framed(s, "f-revenue2.png", 7.05, 1.25, 5.75);
  framed(s, "p-control.png", 11.35, 3.35, 1.45);

  // 2 plans
  s = newSlide(pres, "bg-b.jpg");
  header(s, "PLANS · 월 요금 (VAT 별도 · 12개월 약정 기준)", "요금제 한눈에 보기", "회사 규모에 맞춰 고르고, 언제든 올릴 수 있습니다");
  pricingCards(s, 2.3, true);
  T(s, "다중 사업자(법인 · 지점) · 대규모는 엔터프라이즈 별도 견적", { x: MX, y: 6.45, w: 11.83, h: 0.3, fontSize: 12, bold: true, color: C.sky, align: "center" });
  footer(s, 2, N, "LOGISWEB · PRICING");

  // 3 plan details table
  s = newSlide(pres, "bg-a.jpg");
  header(s, "INCLUDED", "요금제별 포함 내용", "상위 요금제는 아래 요금제 기능을 모두 포함합니다");
  const rows = [
    ["", "라이트", "베이직", "스탠다드", "프로"],
    ["월 요금", "59,000원", "129,000원", "249,000원", "449,000원"],
    ["연간 선결제 (2개월 무료)", "590,000원", "1,290,000원", "2,490,000원", "4,490,000원"],
    ["추천 대상", "1인 주선", "2~5인", "6~12인", "13인 이상"],
    ["하루 오더 규모", "20건 안팎", "50~70건", "100~150건", "200~330건"],
    ["직원 계정", "2명", "5명", "12명", "25명"],
    ["월 오더 포함", "600건", "2,000건", "4,500건", "10,000건"],
    ["지입차 관제 포함", "–", "–", "10대", "30대"],
    ["저장 용량", "5GB", "10GB", "30GB", "100GB"],
    ["초기 도입비 (12개월 약정 시 면제)", "0원", "20만원", "40만원", "70만원"],
    ["기사앱 · 화주사 포털", "무료", "무료", "무료", "무료"],
  ];
  const colX = [MX, 4.75, 6.75, 8.75, 10.75], colW = [3.9, 1.9, 1.9, 1.9, 1.83], rh = 0.37, y0 = 2.25;
  s.addShape("roundRect", { x: 8.72, y: y0 - 0.05, w: 1.96, h: rh * rows.length + 0.1, rectRadius: 0.1, fill: { color: C.hi, transparency: 0 }, line: { color: C.blue, width: 1.5 } });
  rows.forEach((r, ri) => {
    const y = y0 + ri * rh;
    if (ri > 0) s.addShape("line", { x: MX, y, w: 11.83, h: 0, line: { color: C.line, width: 0.75 } });
    r.forEach((v, ci) => T(s, v, { x: colX[ci] + (ci === 0 ? 0.15 : 0), y, w: colW[ci], h: rh, valign: "middle",
      align: ci === 0 ? "left" : "center", fontSize: ri === 0 ? 13.5 : 12, bold: ri <= 1 || ci === 0 || ci === 3,
      color: ri === 0 ? C.white : ci === 0 ? C.sub : ci === 3 ? C.white : C.text }));
  });
  footer(s, 3, N, "LOGISWEB · PRICING");

  // 4 features ladder
  s = newSlide(pres, "bg-b.jpg");
  header(s, "FEATURES", "요금제별 기능", "필요한 만큼 올라가는 계단식 구성");
  const ladder = [
    ["라이트", "LITE", ["배차관리 · 실시간 배차현황", "거래처 · 하차지 · 기사 관리", "단가표 · 전국 운임조회", "기사앱 · 업로드 링크 · 기사복사", "매출 · 정산 · 지급관리"]],
    ["베이직", "BASIC", ["라이트 전체 +", "화주사 전용 포털 연동", "전자결재 · 사내메일", "게시판 · 인수인계", "인사 · 근태 · 회사관리"]],
    ["스탠다드", "STANDARD", ["베이직 전체 +", "지입차 관제 10대 포함", "GPS · 운행기록 · 사진", "데이터 추출", "맞춤 리포트"]],
    ["프로", "PRO", ["스탠다드 전체 +", "수익성 인사이트", "화주 월간 리포트 PDF", "24시콜 오더 자동 전송", "우선 지원 · 분기 운영 점검"]],
  ];
  ladder.forEach(([n, en, fs], i) => {
    const x = MX + i * 3.0, top = 2.3 + (3 - i) * 0.3, h = 6.4 - top;
    const best = i === 2;
    card(s, x, top, 2.83, h, best ? { fill: C.hi, tr: 0, line: C.blue, lw: 2 } : {});
    T(s, en, { x: x + 0.3, y: top + 0.28, w: 2, h: 0.28, fontSize: 9.5, bold: true, color: C.sky, charSpacing: 3 });
    T(s, n, { x: x + 0.3, y: top + 0.56, w: 2.3, h: 0.4, fontSize: 18, bold: true, color: C.white });
    fs.forEach((f, k) => {
      const plus = f.endsWith("+");
      T(s, (plus ? "" : "✓  ") + f, { x: x + 0.3, y: top + 1.15 + k * 0.38, w: 2.45, h: 0.32, fontSize: 11.5, bold: plus, color: plus ? C.sky : C.text });
    });
  });
  T(s, "고정노선 구글시트 배차표 연동은 모든 요금제에서 사용 가능 (첫 양식 세팅만 1회 비용)", { x: MX, y: 6.5, w: 11.83, h: 0.3, fontSize: 11.5, color: C.muted, align: "center" });
  footer(s, 4, N, "LOGISWEB · PRICING");

  // 5 extra & one-time
  s = newSlide(pres, "bg-a.jpg");
  header(s, "OPTIONS", "추가 요금 · 1회 비용", "포함량을 넘는 만큼만, 필요한 것만 선택합니다");
  const box = (x, title, en, items) => {
    card(s, x, 2.3, 5.83, 4.15);
    T(s, en, { x: x + 0.4, y: 2.58, w: 3, h: 0.28, fontSize: 9.5, bold: true, color: C.sky, charSpacing: 3 });
    T(s, title, { x: x + 0.4, y: 2.86, w: 5, h: 0.4, fontSize: 18, bold: true, color: C.white });
    items.forEach(([k, v], i) => {
      const yy = 3.45 + i * 0.36;
      T(s, k, { x: x + 0.4, y: yy, w: 3.1, h: 0.3, fontSize: 12, color: C.text });
      T(s, v, { x: x + 3.0, y: yy, w: 2.45, h: 0.3, fontSize: 12, bold: true, color: C.white, align: "right" });
      if (i < items.length - 1) s.addShape("line", { x: x + 0.4, y: yy + 0.32, w: 5.03, h: 0, line: { color: C.line, width: 0.75 } });
    });
  };
  box(MX, "사용한 만큼 (월)", "MONTHLY", [
    ["추가 직원 계정", "15,000원 / 명"], ["초과 오더", "40원 / 건"], ["지입차 관제 추가", "5,000원 / 대"],
    ["저장 용량 추가", "3,000원 / GB"], ["추가 사업자 (법인 · 지점)", "30,000원 / 곳"], ["전자세금계산서 발행", "300원 / 건"],
    ["카카오 알림톡", "15원 / 건"], ["문자 SMS / 장문 LMS", "30원 / 80원"]]);
  box(6.75, "1회 비용", "ONE-TIME", [
    ["초기 도입비", "0 / 20만 / 40만 / 70만원"], ["  12개월 약정 시", "면제"], ["  6개월 약정 시", "50% 할인"],
    ["대량 데이터 이관", "300,000원"], ["추가 현장 교육", "200,000원 / 회"], ["구글시트 배차표 연동 세팅", "100,000원 / 양식"],
    ["맞춤 기능 개발", "70,000원 / 시간"], ["", "500,000원 / 일"]]);
  footer(s, 5, N, "LOGISWEB · PRICING");

  // 6 quotes + why
  s = newSlide(pres, "bg-b.jpg");
  header(s, "QUOTE EXAMPLES", "규모별 견적 예시", "아래 예시는 모두 포함량 안이라 추가 요금이 없습니다");
  [["직원 4명 · 하루 50건", "베이직", "129,000"], ["직원 8명 · 하루 100건 · 지입 5대", "스탠다드", "249,000"],
   ["직원 15명 · 하루 200건 · 지입 15대", "프로", "449,000"], ["직원 20명 · 하루 300건 · 지입 20대", "프로", "449,000"]].forEach(([who, plan, price], i) => {
    const y = 2.3 + i * 0.86;
    card(s, MX, y, 6.9, 0.72, i === 1 ? { fill: C.hi, tr: 0, line: C.blue, lw: 1.5 } : {});
    T(s, who, { x: MX + 0.35, y, w: 3.6, h: 0.72, fontSize: 13.5, bold: true, color: C.white, valign: "middle" });
    chip(s, plan, MX + 3.95, y + 0.2, { w: 0.95, fs: 10.5 });
    s.addText([{ text: price, options: { fontSize: 20, bold: true, color: C.white } }, { text: " 원/월", options: { fontSize: 11, color: C.sub } }],
      { x: MX + 4.95, y, w: 1.75, h: 0.72, fontFace: F, margin: 0, align: "right", valign: "middle" });
  });
  T(s, "연간 선결제 시 10개월 요금 · 12개월 약정 시 도입비 면제", { x: MX, y: 5.8, w: 6.9, h: 0.3, fontSize: 11.5, color: C.muted });
  card(s, 8.0, 2.3, 4.58, 4.15, { fill: C.card2, tr: 0, line: C.blue, lw: 1.25 });
  T(s, "WHY THIS PRICE", { x: 8.35, y: 2.58, w: 3.5, h: 0.28, fontSize: 9.5, bold: true, color: C.sky, charSpacing: 3 });
  T(s, "직원 1인당 월 약", { x: 8.35, y: 2.95, w: 3.9, h: 0.3, fontSize: 13, color: C.sub });
  s.addText([{ text: "2만", options: { fontSize: 46, bold: true, color: C.white } }, { text: " 원", options: { fontSize: 18, bold: true, color: C.white } }],
    { x: 8.35, y: 3.25, w: 3.9, h: 0.85, fontFace: F, margin: 0, valign: "bottom" });
  T(s, "스탠다드 기준 (249,000원 ÷ 12명)", { x: 8.35, y: 4.15, w: 3.9, h: 0.3, fontSize: 11, color: C.muted });
  bullets(s, ["배차 직원 1명 인건비는 월 300만원 이상", "하루 30분만 줄여도 비용 이상 회수", "기사 · 화주는 무료 — 연결할수록 가치 ↑"], 8.35, 4.7, 4.1, { fs: 12, gap: 0.42 });
  footer(s, 6, N, "LOGISWEB · PRICING");

  // 7 terms + onboarding + CTA
  s = newSlide(pres, "bg-cover.jpg");
  header(s, "TERMS & ONBOARDING", "결제 혜택 · 안심 조건", "부담 없이 시작하고, 필요할 때 올리면 됩니다");
  [["결제 혜택", ["연간 선결제 2개월 무료 (약 17%)", "6개월 선결제 5% 할인", "최소 약정 6개월", "상향은 언제든 차액만 청구"]],
   ["결제 방법", ["무통장 입금", "전자세금계산서 매월 발행", "프로그램 안에서 청구서 확인", "요금제 변경 요청도 바로"]],
   ["안심 조건", ["데이터 소유권은 고객사", "해지 시 엑셀로 전체 제공", "매일 자동 백업", "장애 접수 시 영업일 당일 응대"]]].forEach(([t, items], i) => {
    const x = MX + i * 4.0;
    card(s, x, 2.3, 3.8, 2.35);
    T(s, t, { x: x + 0.32, y: 2.55, w: 3.2, h: 0.38, fontSize: 17, bold: true, color: C.white });
    items.forEach((it, k) => T(s, "✓  " + it, { x: x + 0.32, y: 3.08 + k * 0.36, w: 3.35, h: 0.3, fontSize: 12, color: C.text }));
  });
  ctaBand(s, 4.9, "상담 → 견적 → 계정 세팅 · 자료 이전\n→ 현장 교육 → 운영 시작 (약 1주)");
  footer(s, 7, N, "LOGISWEB · PRICING");

  return pres;
}

(async () => {
  const out = process.argv[2] || __dirname;
  await intro().writeFile({ fileName: path.join(out, "로지스웹_소개서_2026-11.pptx") });
  await pricing().writeFile({ fileName: path.join(out, "로지스웹_요금안내_2026-11.pptx") });
  console.log("ok");
})();
