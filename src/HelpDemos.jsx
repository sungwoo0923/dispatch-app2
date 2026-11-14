// ======================= src/HelpDemos.jsx =======================
// 🎬 2026-11-13 도움말 센터 — 움직이는 예시 화면(짧은 영상처럼 자동으로 넘어간다)
//  · 실제 화면을 단순하게 그린 가상 화면 위에서 마우스가 움직이며 단계별로 보여 준다(데이터는 모두 가짜)
//  · <HelpDemo id="order" />  — id 는 src/helpContent.js 의 demo 값
//  · 한 단계 = { c: [마우스 x%, y%], cap: 설명 }  ·  scene(i) = 그 단계의 화면
//  · 재생/멈춤 · 이전 · 다음 버튼, 마우스를 올리면 잠시 멈춤
import React from "react";

const NAVY = "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)";
const pos = (x, y, w, h) => ({ position: "absolute", left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` });

// 입력칸 모양 — label(작은 글씨) + value. hi = 지금 설명하는 곳(테두리 강조)
function Bx({ r, label, value = "", hi = false, dark = false, center = false, muted = false, bold = true }) {
  return (
    <div style={{ ...pos(...r), transition: "all .35s" }}
      className={`rounded-lg px-2 flex flex-col justify-center overflow-hidden ${dark ? "bg-[#0F1A30] text-white" : "bg-white text-[#0F1A30]"} ${hi ? "ring-2 ring-[#2D4C82] shadow-[0_0_0_5px_rgba(45,76,130,.18)] z-[2]" : "ring-1 ring-[#DCE3EE]"} ${center ? "items-center text-center" : ""}`}>
      {label && <div className={`text-[11px] font-bold leading-none mb-1 ${dark ? "text-white/60" : "text-[#8FA0BD]"}`}>{label}</div>}
      <div className={`text-[13.5px] leading-tight truncate ${bold ? "font-black" : "font-semibold"} ${muted ? "text-[#B5C0D3]" : ""}`}>{value || " "}</div>
    </div>
  );
}
const Txt = ({ r, children, cls = "" }) => <div style={pos(...r)} className={`flex items-center text-[12.5px] font-bold text-[#3A4A66] truncate ${cls}`}>{children}</div>;
// 위쪽 메뉴줄
function TopBar({ on = "", items = ["HOME", "오더등록", "실시간배차현황", "배차현황", "기사관리", "정산관리"], hi = "" }) {
  return (
    <div style={{ ...pos(0, 0, 100, 13), background: NAVY }} className="flex items-center gap-1 px-2">
      <img src="/brand/logisweb-wordmark-light.png" alt="LOGISWEB" className="h-[9px] w-auto mr-1.5 shrink-0" />
      {items.map((m) => <span key={m} className={`px-1.5 h-[62%] rounded-md flex items-center text-[12px] font-bold whitespace-nowrap transition-all ${on === m ? "bg-white text-[#0F1A30]" : "text-white/70"} ${hi === m ? "ring-2 ring-[#8FB0F0]" : ""}`}>{m}</span>)}
      <span className="ml-auto px-1.5 h-[62%] rounded-md bg-white/10 text-white/80 text-[11.5px] font-bold flex items-center">검색 Ctrl K</span>
    </div>
  );
}
// 표 — cols: [이름, 폭%], rows: [[값…]], hiCell: [행, 열], hiRow
function Tbl({ r, cols, rows, hiCell = null, hiRow = -1, hiHead = -1, sortHead = -1, sortDir = "▲", checks = null }) {
  return (
    <div style={pos(...r)} className="rounded-lg overflow-hidden ring-1 ring-[#DCE3EE] bg-white flex flex-col">
      <div className="flex bg-[#0F1A30] text-white/85 text-[11.5px] font-extrabold shrink-0" style={{ height: `${100 / (rows.length + 1)}%` }}>
        {checks && <div className="w-[5%] flex items-center justify-center"><span className={`w-2.5 h-2.5 rounded-sm border border-white/60 ${checks.all ? "bg-white" : ""}`} /></div>}
        {cols.map(([n, w], ci) => <div key={n} style={{ width: `${w}%` }} className={`px-1.5 flex items-center truncate transition-all ${hiHead === ci ? "bg-[#2D4C82] text-white" : ""}`}>{n}{sortHead === ci ? ` ${sortDir}` : ""}</div>)}
      </div>
      {rows.map((row, ri) => (
        <div key={ri} className={`flex flex-1 border-t border-[#EEF1F6] text-[12.5px] font-semibold text-[#3A4A66] transition-all ${hiRow === ri ? "bg-[#EEF3FB]" : ""}`}>
          {checks && <div className="w-[5%] flex items-center justify-center"><span className={`w-2.5 h-2.5 rounded-sm border ${checks.rows?.includes(ri) ? "bg-[#0F1A30] border-[#0F1A30]" : "border-[#B5C0D3]"}`} /></div>}
          {row.map((v, ci) => <div key={ci} style={{ width: `${cols[ci][1]}%` }} className={`px-1.5 flex items-center truncate transition-all ${hiCell && hiCell[0] === ri && hiCell[1] === ci ? "ring-2 ring-inset ring-[#2D4C82] bg-white font-black text-[#0F1A30]" : ""}`}>{v}</div>)}
        </div>
      ))}
    </div>
  );
}
const Chip = ({ children, on = false }) => <span className={`inline-flex items-center h-[22px] px-2 rounded-md text-[11.5px] font-extrabold ${on ? "bg-[#0F1A30] text-white" : "bg-[#EEF3FB] text-[#1B2B4B]"}`}>{children}</span>;
const Btn = ({ r, children, hi = false, primary = true }) => <div style={pos(...r)} className={`rounded-lg flex items-center justify-center text-[12.5px] font-black transition-all ${primary ? "bg-[#0F1A30] text-white" : "bg-white text-[#1B2B4B] ring-1 ring-[#DCE3EE]"} ${hi ? "ring-2 ring-[#8FB0F0] shadow-[0_0_0_5px_rgba(45,76,130,.2)] z-[2]" : ""}`}>{children}</div>;
// 떠 있는 창
const Pop = ({ r, title, children }) => (
  <div style={pos(...r)} className="rounded-xl bg-white shadow-[0_14px_36px_rgba(11,20,40,.35)] ring-1 ring-[#DCE3EE] overflow-hidden z-[3] flex flex-col">
    {title && <div className="px-2.5 py-1.5 text-[12px] font-black text-white shrink-0" style={{ background: NAVY }}>{title}</div>}
    <div className="relative flex-1">{children}</div>
  </div>
);

// 왼쪽 메뉴(업무 매뉴얼 예시용) — items 중 on 번째가 지금 화면
const Side = ({ items, on = 0 }) => (
  <div style={{ ...pos(0, 13, 17, 87), background: NAVY }} className="flex flex-col gap-1 px-1.5 pt-2">
    {items.map((m, k) => <span key={m} className={`px-1.5 py-1 rounded-md text-[11.5px] font-bold truncate ${k === on ? "bg-white text-[#0F1A30]" : "text-white/70"}`}>{m}</span>)}
  </div>
);

const ORDER_COLS = [["상차일", 13], ["거래처", 19], ["상차지", 17], ["하차지", 17], ["차량번호", 16], ["기사", 10], ["상태", 8]];
const ORDER_ROWS = [["11-13", "한빛물류", "평택항", "이천센터", "", "", "배차중"], ["11-13", "대성유통", "김해단지", "청주오송", "경기81바1037", "이영희", "완료"], ["11-13", "동방스틸", "부산신항", "화성동탄", "", "", "배차중"]];

const DEMOS = {
  search: {
    steps: [
      { c: [93, 6], cap: "화면 위쪽 [검색]을 누르거나, 키보드에서 Ctrl 과 K 를 함께 누릅니다." },
      { c: [50, 36], cap: "검색창이 열리면 화면 이름을 입력합니다. 첫소리만 입력해도 됩니다. (ㅂㅊㅎㅎ)" },
      { c: [42, 55], cap: "‘배차현황’이 찾아졌습니다. Enter 를 누르거나 목록에서 누릅니다." },
      { c: [46, 6], cap: "배차현황 화면으로 바로 이동했습니다." },
    ],
    scene: (i) => (<>
      <TopBar on={i === 3 ? "배차현황" : "HOME"} />
      <Tbl r={[3, 20, 94, 72]} cols={ORDER_COLS} rows={ORDER_ROWS} />
      {(i === 1 || i === 2) && (
        <Pop r={[22, 24, 56, 52]} title="메뉴 · 기능 찾기">
          <Bx r={[4, 8, 92, 30]} value={i === 1 ? "ㅂㅊㅎㅎ▏" : "ㅂㅊㅎㅎ"} hi={i === 1} />
          <Bx r={[4, 46, 92, 22]} value="배차현황" hi={i === 2} dark={i === 2} />
          <Bx r={[4, 72, 92, 22]} value="배차현황 › 미배차현황" bold={false} />
        </Pop>
      )}
    </>),
  },
  favorite: {
    steps: [
      { c: [30, 20], cap: "지금 보고 있는 화면에서 [+ 지금 메뉴 넣기]를 누릅니다." },
      { c: [22, 20], cap: "자주 쓰는 메뉴 줄에 ‘배차현황’이 추가됐습니다." },
      { c: [22, 20], cap: "다음부터는 이 이름만 누르면 어느 화면에서든 바로 이동합니다." },
      { c: [29, 20], cap: "더 이상 필요 없으면 이름 옆 × 를 눌러 뺍니다." },
    ],
    scene: (i) => (<>
      <TopBar on="배차현황" />
      <div style={pos(2, 15, 96, 11)} className="flex items-center gap-1.5 px-1">
        <Chip>★ 자주 쓰는 메뉴</Chip>
        {i >= 1 && <span className={`inline-flex items-center h-[22px] px-2 rounded-md text-[11.5px] font-extrabold transition-all ${i === 1 || i === 2 ? "bg-[#0F1A30] text-white ring-2 ring-[#8FB0F0]" : "bg-white ring-1 ring-[#DCE3EE] text-[#1B2B4B]"}`}>배차현황 <span className={`ml-1 ${i === 3 ? "text-[#C2362B] font-black" : "opacity-50"}`}>×</span></span>}
        <span className={`inline-flex items-center h-[22px] px-2 rounded-md text-[11.5px] font-extrabold border border-dashed ${i === 0 ? "border-[#2D4C82] text-[#0F1A30] ring-2 ring-[#8FB0F0]" : "border-[#B5C0D3] text-[#7A89A3]"}`}>+ 지금 메뉴 넣기</span>
      </div>
      <Tbl r={[3, 30, 94, 62]} cols={ORDER_COLS} rows={ORDER_ROWS} />
    </>),
  },
  table: {
    steps: [
      { c: [10, 22], cap: "칸 이름(상차일)을 누르면 그 칸 기준으로 정렬됩니다." },
      { c: [10, 22], cap: "한 번 더 누르면 순서가 반대로 바뀝니다. (▲ → ▼)" },
      { c: [62, 22], cap: "칸 이름에서 마우스 오른쪽 버튼을 누르면 [이 칸 숨기기]가 나옵니다." },
      { c: [6, 46], cap: "줄 맨 왼쪽 네모를 눌러 여러 줄을 선택하면 한 번에 삭제 · 복사 · 수정할 수 있습니다." },
    ],
    scene: (i) => (<>
      <TopBar on="배차현황" />
      <Tbl r={[3, 17, 94, 76]} cols={ORDER_COLS} rows={i === 1 ? [...ORDER_ROWS].reverse() : ORDER_ROWS} hiHead={i <= 1 ? 0 : i === 2 ? 3 : -1} sortHead={i <= 1 ? 0 : -1} sortDir={i === 1 ? "▼" : "▲"} checks={{ rows: i === 3 ? [0, 1] : [] }} hiRow={-1} />
      {i === 2 && <Pop r={[58, 30, 26, 30]}><Bx r={[6, 10, 88, 36]} value="이 칸 숨기기" hi dark /><Bx r={[6, 54, 88, 36]} value="칸 순서 바꾸기" bold={false} /></Pop>}
    </>),
  },
  order: {
    steps: [
      { c: [14, 34], cap: "① 거래처 이름을 몇 글자 입력하고 목록에서 고릅니다." },
      { c: [40, 34], cap: "② 상차지 · 하차지를 고르면 주소와 담당자가 자동으로 채워집니다." },
      { c: [20, 56], cap: "③ 화물내용, 차량종류, 톤수를 입력합니다." },
      { c: [62, 56], cap: "④ 청구운임과 기사운임을 입력하면 수수료가 자동으로 계산됩니다." },
      { c: [40, 78], cap: "⑤ 지급방식을 고릅니다. 차량이 정해졌으면 차량번호도 입력합니다." },
      { c: [86, 80], cap: "⑥ [저장]을 누르고, 확인 창에서 [배차등록하기]를 누르면 끝납니다." },
    ],
    scene: (i) => (<>
      <TopBar on="오더등록" />
      <Txt r={[3, 15, 40, 8]} cls="!text-[13.5px] !font-black !text-[#0F1A30]">오더 정보</Txt>
      <Bx r={[3, 25, 24, 18]} label="거래처 *" value={i >= 0 ? (i === 0 ? "한빛▏" : "한빛물류센터") : ""} hi={i === 0} />
      <Bx r={[29, 25, 22, 18]} label="상차지 *" value={i >= 1 ? "평택항 터미널" : ""} hi={i === 1} />
      <Bx r={[53, 25, 22, 18]} label="하차지 *" value={i >= 1 ? "이천 물류센터" : ""} hi={i === 1} />
      <Bx r={[77, 25, 20, 18]} label="상차일" value="2026-11-13" />
      <Bx r={[3, 47, 16, 18]} label="화물내용 *" value={i >= 2 ? "12 파레트" : ""} hi={i === 2} />
      <Bx r={[21, 47, 15, 18]} label="차량종류" value={i >= 2 ? "윙바디" : ""} hi={i === 2} />
      <Bx r={[38, 47, 11, 18]} label="톤수 *" value={i >= 2 ? "5톤" : ""} hi={i === 2} />
      <Bx r={[51, 47, 15, 18]} label="청구운임" value={i >= 3 ? "350,000" : ""} hi={i === 3} />
      <Bx r={[68, 47, 15, 18]} label="기사운임" value={i >= 3 ? "300,000" : ""} hi={i === 3} />
      <Bx r={[85, 47, 12, 18]} label="수수료" value={i >= 3 ? "50,000" : ""} dark={i === 3} />
      <Bx r={[3, 69, 20, 18]} label="차량번호" value={i >= 4 ? "경기81바1037" : ""} hi={i === 4} />
      <Bx r={[25, 69, 14, 18]} label="기사명" value={i >= 4 ? "이영희" : ""} muted={false} />
      <Bx r={[41, 69, 16, 18]} label="지급방식 *" value={i >= 4 ? "계산서" : "선택"} hi={i === 4} muted={i < 4} />
      <Btn r={[78, 71, 19, 15]} hi={i === 5}>✓ 저장</Btn>
      {i === 5 && <Pop r={[30, 30, 40, 44]} title="배차요청장"><Txt r={[6, 8, 88, 30]}>한빛물류센터 · 350,000원</Txt><Btn r={[10, 52, 80, 34]} hi>배차등록하기</Btn></Pop>}
    </>),
  },
  special: {
    steps: [
      { c: [22, 30], cap: "청구 20만 · 기사 20만 오더에 지게차 비용 10만 원을 넣는 예시입니다." },
      { c: [22, 56], cap: "[기사 차감] 기사운임에서 뺍니다. 기사 20만 → 10만, 수수료는 그대로 0." },
      { c: [50, 56], cap: "[회사 부담] 회사가 냅니다. 운임은 그대로이고 수수료가 0 → −10만." },
      { c: [78, 56], cap: "[추가 청구] 거래처에 더 받습니다. 청구 20만 → 30만, 수수료는 그대로 0." },
    ],
    scene: (i) => {
      const v = [["200,000", "200,000", "0"], ["200,000", "100,000", "0"], ["200,000", "200,000", "-100,000"], ["300,000", "200,000", "0"]][i];
      return (<>
        <div style={{ ...pos(0, 0, 100, 14), background: NAVY }} className="flex items-center px-3 text-[13px] font-black text-white">특수운임 적용</div>
        <Bx r={[4, 20, 36, 20]} label="지게차비용" value="100,000 원" hi={i === 0} />
        <Txt r={[44, 20, 52, 20]} cls="!text-[12px] !text-[#7A89A3]">지게차 기사에게는 회사가 지급합니다</Txt>
        <Txt r={[4, 44, 40, 8]} cls="!text-[11.5px] !text-[#8FA0BD]">누가 부담하나요</Txt>
        <Btn r={[4, 53, 28, 16]} primary={i === 1} hi={i === 1}>기사 차감</Btn>
        <Btn r={[36, 53, 28, 16]} primary={i === 2} hi={i === 2}>회사 부담</Btn>
        <Btn r={[68, 53, 28, 16]} primary={i === 3} hi={i === 3}>추가 청구</Btn>
        <Bx r={[4, 75, 28, 20]} label="청구운임" value={v[0]} hi={i === 3} center />
        <Bx r={[36, 75, 28, 20]} label="기사운임" value={v[1]} hi={i === 1} center />
        <Bx r={[68, 75, 28, 20]} label="수수료(수익)" value={v[2]} hi={i === 2} dark center />
      </>);
    },
  },
  assign: {
    steps: [
      { c: [70, 42], cap: "배차중인 오더의 차량번호 칸을 누릅니다." },
      { c: [70, 42], cap: "차량번호를 입력하고 Enter 를 누릅니다." },
      { c: [58, 62], cap: "등록된 기사라면 확인 창이 뜹니다. [확인 (배차완료)]를 누릅니다." },
      { c: [92, 42], cap: "기사 이름이 채워지고 상태가 ‘완료’로 바뀌었습니다." },
      { c: [70, 42], cap: "배차를 취소하려면 차량번호를 지우고 Enter 를 누르면 됩니다." },
    ],
    scene: (i) => {
      const rows = ORDER_ROWS.map((r) => [...r]);
      if (i === 1 || i === 2) rows[0][4] = "경기82바1074▏";
      if (i >= 3) { rows[0][4] = "경기82바1074"; rows[0][5] = "박민준"; rows[0][6] = "완료"; }
      return (<>
        <TopBar on="실시간배차현황" />
        <Tbl r={[3, 17, 94, 76]} cols={ORDER_COLS} rows={rows} hiCell={i <= 1 || i === 4 ? [0, 4] : i === 3 ? [0, 6] : null} hiRow={0} />
        {i === 2 && <Pop r={[28, 34, 44, 46]} title="기사 정보 확인"><Txt r={[6, 6, 88, 26]}>경기82바1074 · 박민준 · 010-7103-3003</Txt><Btn r={[42, 50, 52, 36]} hi>확인 (배차완료)</Btn><Btn r={[6, 50, 32, 36]} primary={false}>취소</Btn></Pop>}
      </>);
    },
  },
  edit: {
    steps: [
      { c: [30, 42], cap: "고칠 오더 줄을 빠르게 두 번 누릅니다." },
      { c: [78, 40], cap: "오른쪽에 수정 창이 열립니다. 바꿀 칸을 고칩니다. (청구운임 35만 → 42만)" },
      { c: [86, 22], cap: "[수정 저장]을 눌러야 저장됩니다. 그냥 닫으면 저장되지 않습니다." },
      { c: [30, 42], cap: "목록에 바뀐 내용이 바로 반영됩니다." },
    ],
    scene: (i) => (<>
      <TopBar on="배차현황" />
      <Tbl r={[3, 17, i === 1 || i === 2 ? 50 : 94, 76]} cols={i === 1 || i === 2 ? [["상차일", 22], ["거래처", 40], ["청구", 38]] : [["상차일", 13], ["거래처", 27], ["상차지", 20], ["하차지", 20], ["청구운임", 20]]}
        rows={i === 1 || i === 2 ? [["11-13", "한빛물류", "350,000"], ["11-13", "대성유통", "532,000"], ["11-13", "동방스틸", "238,000"]] : [["11-13", "한빛물류", "평택항", "이천센터", i === 3 ? "420,000" : "350,000"], ["11-13", "대성유통", "김해단지", "청주오송", "532,000"], ["11-13", "동방스틸", "부산신항", "화성동탄", "238,000"]]}
        hiRow={0} hiCell={i === 3 ? [0, 4] : null} />
      {(i === 1 || i === 2) && (
        <div style={pos(56, 13, 44, 87)} className="bg-[#F5F8FD] shadow-[-10px_0_24px_rgba(11,20,40,.25)] z-[3]">
          <div style={{ ...pos(0, 0, 100, 16), background: NAVY }} className="flex items-center px-2 text-[12px] font-black text-white">오더 복사 / 수정 패널</div>
          <Btn r={[52, 3, 30, 10]} primary={false} hi={i === 2}>수정 저장</Btn>
          <Bx r={[6, 22, 88, 18]} label="거래처" value="한빛물류센터" />
          <Bx r={[6, 44, 42, 18]} label="청구운임" value={i === 1 ? "420,000▏" : "420,000"} hi={i === 1} />
          <Bx r={[52, 44, 42, 18]} label="기사운임" value="300,000" />
          <Bx r={[6, 66, 88, 18]} label="차량번호" value="경기81바1037" />
        </div>
      )}
    </>),
  },
  context: {
    steps: [
      { c: [36, 44], cap: "오더 줄 위에서 마우스 오른쪽 버튼을 누릅니다." },
      { c: [50, 40], cap: "그 오더로 할 수 있는 일이 목록으로 나옵니다." },
      { c: [50, 52], cap: "예: [기사복사]를 누르면 기사에게 보낼 문장이 복사됩니다. 카카오톡에 붙여 넣어 보냅니다." },
      { c: [50, 88], cap: "여러 줄을 선택한 뒤 [일괄수정·복사]를 누르면 한꺼번에 고칠 수 있습니다." },
    ],
    scene: (i) => (<>
      <TopBar on="배차현황" />
      <Tbl r={[3, 17, 94, 76]} cols={ORDER_COLS} rows={ORDER_ROWS} hiRow={0} checks={{ rows: i === 3 ? [0, 2] : [] }} />
      {i >= 1 && (
        <Pop r={[38, 32, 28, 64]}>
          {["기사복사", "오더정보", "수정", "운임조회", "일괄수정·복사", "삭제"].map((t, k) => <Bx key={t} r={[5, 3 + k * 16, 90, 14]} value={t} bold={(i === 2 && k === 0) || (i === 3 && k === 4)} dark={(i === 2 && k === 0) || (i === 3 && k === 4)} />)}
        </Pop>
      )}
    </>),
  },
  driver: {
    steps: [
      { c: [86, 20], cap: "[+ 기사 등록]을 누릅니다." },
      { c: [50, 42], cap: "차량번호, 이름, 전화번호를 입력합니다." },
      { c: [64, 82], cap: "[등록]을 누르면 목록에 추가됩니다." },
      { c: [40, 50], cap: "이제 오더에 이 차량번호만 입력해도 이름과 전화번호가 자동으로 채워집니다." },
    ],
    scene: (i) => (<>
      <TopBar on="기사관리" />
      <Btn r={[78, 15, 19, 11]} hi={i === 0}>+ 기사 등록</Btn>
      <Tbl r={[3, 30, 94, 63]} cols={[["차량번호", 28], ["이름", 18], ["전화번호", 30], ["등급", 24]]} rows={[...(i === 3 ? [["경기77사1234", "김기사", "010-9876-5432", "일반"]] : []), ["경기81바1037", "이영희", "010-7101-3001", "지입"], ["부산90사2211", "최서연", "010-7203-3103", "일반"]].slice(0, 3)} hiRow={i === 3 ? 0 : -1} />
      {(i === 1 || i === 2) && (
        <Pop r={[26, 20, 48, 74]} title="신규 기사 등록">
          <Bx r={[6, 5, 88, 20]} label="차량번호 *" value="경기77사1234" hi={i === 1} />
          <Bx r={[6, 29, 88, 20]} label="이름" value="김기사" hi={i === 1} />
          <Bx r={[6, 53, 88, 20]} label="전화번호" value="010-9876-5432" hi={i === 1} />
          <Btn r={[54, 78, 40, 17]} hi={i === 2}>등록</Btn><Btn r={[6, 78, 40, 17]} primary={false}>취소</Btn>
        </Pop>
      )}
    </>),
  },
  place: {
    steps: [
      { c: [86, 20], cap: "[+ 신규등록]을 누릅니다." },
      { c: [50, 44], cap: "업체명, 주소, 담당자와 연락처를 입력하고 [등록]을 누릅니다." },
      { c: [30, 46], cap: "목록에 추가됐습니다. 줄을 두 번 누르면 언제든 고칠 수 있습니다." },
      { c: [40, 50], cap: "오더를 넣을 때 이 이름만 입력해도 주소와 담당자가 자동으로 채워집니다." },
    ],
    scene: (i) => (<>
      <TopBar on="거래처관리" items={["HOME", "오더등록", "배차현황", "기사관리", "거래처관리", "정산관리"]} />
      <Btn r={[78, 15, 19, 11]} hi={i === 0}>+ 신규등록</Btn>
      <Tbl r={[3, 30, 94, 63]} cols={[["업체명", 26], ["주소", 40], ["담당자", 14], ["담당자번호", 20]]} rows={[...(i >= 2 ? [["이천 물류센터", "경기 이천시 마장면 …", "서민아", "010-5530-2219"]] : []), ["평택항 터미널", "경기 평택시 포승읍 …", "강현우", "010-4021-3381"], ["김해 물류단지", "경남 김해시 상동면 …", "박지훈", "010-3300-1200"]].slice(0, 3)} hiRow={i >= 2 ? 0 : -1} />
      {i === 1 && (
        <Pop r={[24, 18, 52, 78]} title="신규 상하차지 등록">
          <Bx r={[6, 4, 88, 19]} label="업체명 *" value="이천 물류센터" hi />
          <Bx r={[6, 27, 88, 19]} label="주소 *" value="경기 이천시 마장면 서이천로 578" hi />
          <Bx r={[6, 50, 42, 19]} label="담당자" value="서민아" /><Bx r={[52, 50, 42, 19]} label="담당자번호" value="010-5530-2219" />
          <Btn r={[54, 76, 40, 18]} hi>등록</Btn><Btn r={[6, 76, 40, 18]} primary={false}>취소</Btn>
        </Pop>
      )}
    </>),
  },
  settle: {
    steps: [
      { c: [14, 40], cap: "왼쪽 목록에서 거래처를 누릅니다." },
      { c: [60, 46], cap: "오른쪽에 그 달의 거래명세서가 열립니다. 오더 내역과 합계를 확인합니다." },
      { c: [70, 22], cap: "[미리보기]에서 인쇄하거나 PDF 로 저장합니다." },
      { c: [88, 22], cap: "[메일 보내기]를 누르면 거래처 메일로 바로 보냅니다." },
    ],
    scene: (i) => (<>
      <TopBar on="정산관리" />
      {["한빛물류센터", "대성유통", "동방스틸", "미래식품"].map((n, k) => <Bx key={n} r={[3, 17 + k * 19, 24, 16]} value={n} dark={k === 0 && i >= 0} hi={k === 0 && i === 0} />)}
      <div style={pos(30, 17, 67, 76)} className="rounded-lg bg-white ring-1 ring-[#DCE3EE]">
        <Txt r={[4, 4, 40, 14]} cls="!text-[13.5px] !font-black !text-[#0F1A30]">거래명세서 · 2026년 11월</Txt>
        <Btn r={[52, 4, 20, 14]} primary={false} hi={i === 2}>미리보기</Btn>
        <Btn r={[76, 4, 20, 14]} hi={i === 3}>메일 보내기</Btn>
        <Tbl r={[4, 24, 92, 52]} cols={[["상차일", 20], ["구간", 46], ["청구운임", 34]]} rows={[["11-03", "평택항 → 이천센터", "350,000"], ["11-07", "평택항 → 화성동탄", "280,000"]]} hiRow={i === 1 ? 0 : -1} />
        <Txt r={[4, 80, 92, 14]} cls={`justify-end !text-[13.5px] !font-black ${i === 1 ? "!text-[#0F1A30]" : ""}`}>합계 630,000원 (VAT 별도)</Txt>
      </div>
    </>),
  },
  // ─────────── 📘 2026-11-14 업무 매뉴얼(정산 · 회계 · 자금 · 비품) 예시 화면 — src/workManuals.js 의 demo 값 ───────────
  settleHome: {
    steps: [
      { c: [30, 30], cap: "정산 홈을 열면 이번 달 정산이 어디까지 왔는지 6단계로 보여요." },
      { c: [52, 40], cap: "숫자가 남은 단계가 아직 할 일이에요. 예를 들어 ‘계산서 발행 3곳’이면 3곳이 남았다는 뜻이에요." },
      { c: [52, 40], cap: "그 단계를 누르면 일을 처리하는 화면(거래처정산 · 입금 확인 · 용차지급관리)으로 바로 가요." },
      { c: [40, 80], cap: "아래에서는 받지 못한 돈(미수금)을 30 · 60 · 90일로 나눠 보여 줘요. 거래처를 누르면 원장이 열려요." },
    ],
    scene: (i) => (<>
      <TopBar on="정산관리" />
      <Side items={["정산 홈", "거래처정산", "용차지급관리", "입금 확인", "지입정산관리", "지게차 지급"]} on={0} />
      <Txt r={[19, 15, 50, 9]} cls="!text-[14px] !font-black !text-[#0F1A30]">11월 정산 진행 현황</Txt>
      {[["오더 확정", "완료"], ["명세서 발송", "2곳"], ["계산서 발행", "3곳"], ["입금 확인", "5곳"], ["기사 지급", "12건"], ["마감", "8곳"]].map(([l, v], k) => (
        <Bx key={l} r={[19 + k * 13.2, 26, 12.4, 26]} label={l} value={v} hi={(i === 1 || i === 2) && k === 2} dark={i === 2 && k === 2} center />
      ))}
      <Txt r={[19, 56, 50, 9]} cls="!text-[13px] !font-black !text-[#0F1A30]">미수금 현황</Txt>
      <Tbl r={[19, 66, 78, 30]} cols={[["거래처", 34], ["30일 이내", 22], ["31~60일", 22], ["90일 초과", 22]]} rows={[["한빛물류센터", "1,320,000", "", ""], ["대성유통", "", "880,000", "410,000"]]} hiRow={i === 3 ? 1 : -1} />
    </>),
  },
  settleBoard: {
    steps: [
      { c: [30, 22], cap: "거래처정산은 거래처마다 이번 달 거래명세서를 만드는 곳이에요. 위에서 달을 고를 수 있어요." },
      { c: [22, 50], cap: "거래처 옆 네모를 눌러 여러 곳을 한 번에 골라요." },
      { c: [62, 22], cap: "[일괄 작성] → [일괄 발송]을 누르면 고른 거래처에 명세서 메일이 한 번에 나가요." },
      { c: [86, 50], cap: "단계는 미작성 → 작성 → 발송 → 확인 → 계산서 발행 → 마감 순서로 바뀌어요. 마감까지 오면 그 달 정산이 끝난 거예요." },
    ],
    scene: (i) => (<>
      <TopBar on="정산관리" />
      <Side items={["정산 홈", "거래처정산", "용차지급관리", "입금 확인", "지입정산관리", "지게차 지급"]} on={1} />
      <Bx r={[19, 15, 18, 13]} label="정산월" value="2026년 11월" hi={i === 0} />
      <Btn r={[52, 15, 13, 13]} hi={i === 2} primary={i >= 2}>일괄 작성</Btn><Btn r={[66, 15, 13, 13]} hi={i === 2} primary={false}>일괄 발송</Btn><Btn r={[80, 15, 17, 13]} primary={false}>일괄 마감</Btn>
      <Tbl r={[19, 33, 78, 62]} cols={[["거래처", 34], ["건수", 12], ["청구액", 24], ["단계", 30]]} checks={{ rows: i >= 1 ? [0, 1] : [], all: false }}
        rows={[["한빛물류센터", "14건", "4,620,000", i >= 2 ? "발송" : "작성"], ["대성유통", "9건", "2,310,000", i >= 2 ? "발송" : "작성"], ["동방스틸", "6건", "1,540,000", "계산서 발행"], ["미래식품", "3건", "690,000", "마감"]]} hiCell={i === 3 ? [2, 3] : null} />
    </>),
  },
  payout: {
    steps: [
      { c: [40, 22], cap: "용차지급관리는 외부 기사님께 드릴 운임을 정리하는 곳이에요. 위에서 기간을 골라요." },
      { c: [50, 40], cap: "위 칸에서 총 기사운임 · 미지급 건수 · 미지급 금액을 먼저 확인해요." },
      { c: [22, 66], cap: "지급할 줄을 골라 [지급완료]를 누르면 지급일이 기록되고, 자금관리 통장 잔액에서도 빠져요." },
      { c: [88, 22], cap: "[엑셀 다운로드]로 지급 목록을 내려받아 은행 이체에 쓸 수 있어요." },
    ],
    scene: (i) => (<>
      <TopBar on="정산관리" />
      <Side items={["정산 홈", "거래처정산", "용차지급관리", "입금 확인", "지입정산관리", "지게차 지급"]} on={2} />
      <Bx r={[19, 15, 30, 13]} label="조회 기간" value="2026-11-01 ~ 11-30" hi={i === 0} /><Btn r={[80, 15, 17, 13]} primary={false} hi={i === 3}>엑셀 다운로드</Btn>
      {[["총 기사운임", "18,420,000"], ["미지급 건수", "12건"], ["미지급 금액", "3,960,000"]].map(([l, v], k) => <Bx key={l} r={[19 + k * 26.3, 32, 25, 15]} label={l} value={v} hi={i === 1} />)}
      <Tbl r={[19, 51, 78, 45]} cols={[["상차일", 14], ["기사명", 16], ["구간", 34], ["기사운임", 18], ["지급상태", 18]]} checks={{ rows: i >= 2 ? [0, 1] : [] }}
        rows={[["11-03", "이영희", "평택항 → 이천", "320,000", i >= 2 ? "지급완료" : "미지급"], ["11-05", "김민수", "부산신항 → 화성", "410,000", i >= 2 ? "지급완료" : "미지급"], ["11-07", "박서준", "김해 → 청주", "280,000", "미지급"]]} />
    </>),
  },
  deposit: {
    steps: [
      { c: [40, 22], cap: "입금 확인은 우리가 받을 돈(OUT 오더)이 들어왔는지 체크하는 곳이에요." },
      { c: [22, 60], cap: "입금된 오더를 골라요. 30일이 넘은 건은 빨간 숫자로 따로 보여 줘요." },
      { c: [70, 22], cap: "[선택 건 입금완료]를 누르고 입금 메모(예: 11/12 농협 입금)를 적으면 끝이에요." },
      { c: [60, 75], cap: "입금완료로 바뀐 오더는 배차현황의 [정산] 칸과 정산 홈에도 바로 반영돼요." },
    ],
    scene: (i) => (<>
      <TopBar on="정산관리" />
      <Side items={["정산 홈", "거래처정산", "용차지급관리", "입금 확인", "지입정산관리", "지게차 지급"]} on={3} />
      <Bx r={[19, 15, 22, 13]} label="입금 대기" value="7건 · 2,180,000원" hi={i === 0} /><Bx r={[43, 15, 18, 13]} label="30일 넘음" value="2건" />
      <Btn r={[64, 15, 18, 13]} hi={i === 2}>선택 건 입금완료</Btn>
      <Tbl r={[19, 33, 78, 60]} cols={[["업체", 24], ["구간", 34], ["운임", 18], ["입금", 24]]} checks={{ rows: i >= 1 ? [0] : [] }}
        rows={[["한빛물류", "평택항 → 이천", "350,000", i >= 2 ? "입금완료 11/12" : "대기"], ["대성유통", "김해 → 청주", "280,000", "대기"], ["동방스틸", "부산 → 화성", "410,000", "대기"]]} hiRow={i === 3 ? 0 : -1} />
      {i === 2 && <Pop r={[40, 40, 40, 44]} title="입금완료 메모"><Bx r={[6, 10, 88, 36]} label="메모(필수)" value="11/12 농협 입금 확인" hi /><Btn r={[52, 60, 42, 28]}>입금완료</Btn></Pop>}
    </>),
  },
  forklift: {
    steps: [
      { c: [40, 22], cap: "지게차 지급은 오더에 넣은 지게차비를 지게차 기사님별로 모아 보여 줘요." },
      { c: [40, 60], cap: "기사님별 미지급 합계를 확인하고, 지급한 줄을 골라 [지급완료]를 눌러요." },
      { c: [86, 22], cap: "[대량이체]를 누르면 은행 대량이체 엑셀 양식(은행 · 계좌 · 예금주 · 금액)으로 받아요." },
    ],
    scene: (i) => (<>
      <TopBar on="정산관리" />
      <Side items={["정산 홈", "거래처정산", "용차지급관리", "입금 확인", "지입정산관리", "지게차 지급"]} on={5} />
      <Bx r={[19, 15, 22, 13]} label="기간" value="2026년 11월" hi={i === 0} /><Btn r={[64, 15, 14, 13]} primary={false}>엑셀</Btn><Btn r={[80, 15, 17, 13]} hi={i === 2}>대량이체</Btn>
      <Tbl r={[19, 33, 78, 60]} cols={[["지게차 기사", 26], ["건수", 14], ["미지급", 26], ["계좌", 34]]} checks={{ rows: i >= 1 ? [0] : [] }}
        rows={[["최지훈", "6건", "360,000", "국민 123-45…"], ["정우성", "3건", "180,000", "신한 110-2…"]]} hiRow={i === 1 ? 0 : -1} />
    </>),
  },
  acctOverview: {
    steps: [
      { c: [40, 30], cap: "회계 개요는 올해 매출 · 이익 · 미수금 · 예상 부가세를 한 화면에 모아 보여 줘요." },
      { c: [86, 18], cap: "모르는 말이 나오면 오른쪽 위 [회계용어]를 눌러 보세요. 쉬운 말로 풀어 드려요." },
      { c: [35, 70], cap: "월별 그래프로 매출과 매입, 이익률이 어떻게 바뀌는지 볼 수 있어요." },
      { c: [78, 70], cap: "미수금 연령 분석에서는 오래 못 받은 돈이 얼마나 되는지 확인해요." },
    ],
    scene: (i) => (<>
      <TopBar items={["HOME", "배차", "매출", "정산", "회계관리", "자금관리"]} on="회계관리" />
      <Side items={["회계 개요", "회계 장부", "급여 계산", "퇴직 정산"]} on={0} />
      <Btn r={[80, 15, 17, 11]} hi={i === 1} primary={false}>📖 회계용어</Btn>
      {[["올해 매출(공급가)", "3.2억"], ["매출총이익", "4,820만"], ["미수금 / 미지급", "1,240만"], ["예상 부가세", "690만"]].map(([l, v], k) => <Bx key={l} r={[19 + k * 19.7, 29, 18.7, 18]} label={l} value={v} hi={i === 0} />)}
      <div style={pos(19, 52, 46, 44)} className={`rounded-lg bg-white ring-1 ${i === 2 ? "ring-2 ring-[#2D4C82]" : "ring-[#DCE3EE]"} flex items-end gap-[3%] px-[3%] pb-[4%]`}>{[40, 55, 48, 70, 62, 80].map((h, k) => <span key={k} style={{ height: `${h}%` }} className="flex-1 rounded-t bg-[#2D4C82]" />)}</div>
      <Tbl r={[67, 52, 30, 44]} cols={[["경과", 50], ["금액", 50]]} rows={[["30일 이내", "820만"], ["31~60일", "290만"], ["90일 초과", "130만"]]} hiRow={i === 3 ? 2 : -1} />
    </>),
  },
  acctBook: {
    steps: [
      { c: [30, 22], cap: "회계 장부에는 미수금 현황 · 지급 현황 · 부가세 자료 · 원가 분석, 이렇게 4개 탭이 있어요." },
      { c: [50, 60], cap: "미수금 현황에서 거래처가 돈을 보내면 [수금완료]를 눌러 기록해요." },
      { c: [52, 22], cap: "부가세 자료 탭에서 분기를 고르면 신고에 쓸 매출세액 · 매입세액이 정리돼요. 엑셀로도 받을 수 있어요." },
      { c: [72, 22], cap: "원가 분석에서는 거래처 · 차량 종류별로 얼마 남았는지(이익률) 볼 수 있어요." },
    ],
    scene: (i) => (<>
      <TopBar items={["HOME", "배차", "매출", "정산", "회계관리", "자금관리"]} on="회계관리" />
      <Side items={["회계 개요", "회계 장부", "급여 계산", "퇴직 정산"]} on={1} />
      {["미수금 현황", "지급 현황", "부가세 자료", "원가 분석"].map((t, k) => <Btn key={t} r={[19 + k * 16, 15, 15, 11]} primary={(i === 2 && k === 2) || (i === 3 && k === 3) || (i < 2 && k === 0)} hi={(i === 0) || (i === 2 && k === 2) || (i === 3 && k === 3)}>{t}</Btn>)}
      <Tbl r={[19, 31, 78, 64]} cols={i === 2 ? [["구분", 40], ["공급가액", 30], ["세액", 30]] : [["거래처", 30], ["청구액", 22], ["수금액", 22], ["미수금", 26]]}
        rows={i === 2 ? [["매출(계산서)", "8,200만", "820만"], ["매입(기사 계산서)", "1,300만", "130만"], ["납부세액", "", "690만"]] : [["한빛물류센터", "4,620,000", "3,300,000", "1,320,000"], ["대성유통", "2,310,000", "2,310,000", "0"]]} hiRow={i === 1 ? 0 : i === 2 ? 2 : -1} />
    </>),
  },
  payroll: {
    steps: [
      { c: [30, 22], cap: "급여 계산은 달을 고르고, 왼쪽에서 직원을 누르는 것부터 시작해요." },
      { c: [52, 55], cap: "출근기록부의 연장 · 야간 · 휴일 시간이 자동으로 들어와요. 필요하면 칸을 직접 고쳐도 돼요." },
      { c: [82, 55], cap: "오른쪽에 급여명세서가 바로바로 그려져요. 공제(4대보험 · 세금)까지 계산돼요." },
      { c: [60, 18], cap: "[확정] → [명세서 발행] → [지급 처리] 순서로 눌러요. 발행하면 직원에게 알림이 가고, 지급하면 장부에 자동 기록돼요." },
    ],
    scene: (i) => (<>
      <TopBar items={["HOME", "배차", "매출", "정산", "회계관리", "자금관리"]} on="회계관리" />
      <Side items={["회계 개요", "회계 장부", "급여 계산", "퇴직 정산"]} on={2} />
      <Bx r={[19, 15, 16, 11]} label="급여 월" value="2026년 11월" hi={i === 0} />
      <Btn r={[52, 15, 13, 11]} hi={i === 3}>확정</Btn><Btn r={[66, 15, 15, 11]} hi={i === 3} primary={false}>명세서 발행</Btn><Btn r={[82, 15, 15, 11]} hi={i === 3} primary={false}>지급 처리</Btn>
      {["김경리", "박대리", "이주임"].map((n, k) => <Bx key={n} r={[19, 30 + k * 15, 16, 13]} value={n} dark={k === 0} hi={i === 0 && k === 0} />)}
      <Bx r={[37, 30, 28, 14]} label="기본급" value="2,800,000" /><Bx r={[37, 46, 28, 14]} label="연장근로(자동)" value="6시간 · 120,500" hi={i === 1} /><Bx r={[37, 62, 28, 14]} label="식대(비과세)" value="200,000" />
      <div style={pos(67, 30, 30, 64)} className={`rounded-lg bg-white ring-1 ${i === 2 ? "ring-2 ring-[#2D4C82]" : "ring-[#DCE3EE]"} px-2 py-1.5 text-[11.5px] font-bold text-[#3A4A66] leading-relaxed`}>급여명세서<br />지급 합계 3,120,500<br />공제 합계 −312,840<br /><b className="text-[#0F1A30]">실지급 2,807,660</b></div>
    </>),
  },
  funds: {
    steps: [
      { c: [86, 18], cap: "처음엔 [+ 통장·카드 등록]으로 통장 · 카드 · 현금 · 대출을 넣고, 오늘 잔액만 적어 주세요." },
      { c: [40, 34], cap: "그다음부턴 장부에서 통장이나 카드를 고르는 순간, 잔액이 알아서 늘고 줄어요." },
      { c: [60, 34], cap: "‘운영 가능 기간’은 지금 돈으로 몇 달을 버틸 수 있는지 보여 줘요." },
      { c: [40, 72], cap: "은행 앱 잔액과 다르면 그 통장의 [잔액 맞추기]를 눌러 오늘 실제 잔액을 적어요. 기록은 남아요." },
    ],
    scene: (i) => (<>
      <TopBar items={["HOME", "배차", "매출", "정산", "회계관리", "자금관리"]} on="자금관리" />
      <Side items={["자금 현황", "수입·지출 장부"]} on={0} />
      <Btn r={[78, 14, 19, 11]} hi={i === 0}>+ 통장·카드 등록</Btn>
      {[["보유 자금", "1억 2,400만"], ["이번 달 순현금흐름", "+840만"], ["운영 가능 기간", "7.3개월"], ["대출 잔액", "3,000만"]].map(([l, v], k) => <Bx key={l} r={[19 + k * 19.7, 28, 18.7, 17]} label={l} value={v} hi={(i === 1 && k <= 1) || (i === 2 && k === 2)} />)}
      <Tbl r={[19, 50, 78, 45]} cols={[["통장·카드", 34], ["종류", 18], ["지금 잔액", 26], ["", 22]]} rows={[["기업은행 운영자금", "보통예금", "84,200,000", "잔액 맞추기"], ["법인카드(신한)", "신용카드", "−1,320,000", ""], ["현금 시재", "현금", "380,000", ""]]} hiCell={i === 3 ? [0, 3] : null} />
    </>),
  },
  cashbook: {
    steps: [
      { c: [80, 18], cap: "[+ 지출] 또는 [+ 수입]을 눌러 날짜 · 계정과목 · 금액 · 결제수단을 적어요. 영수증 사진도 붙일 수 있어요." },
      { c: [40, 34], cap: "전자결재에서 승인된 지출결의서는 [가져오기] 한 번이면 장부에 들어가요." },
      { c: [70, 34], cap: "임대료 · 통신비처럼 매달 나가는 돈은 고정비로 등록해 두고, 매달 [반영]만 누르면 돼요." },
      { c: [50, 75], cap: "‘증빙 없는 지출’ 숫자가 0이 되도록 영수증을 챙겨 주세요. 월말에 CSV로 내려받을 수 있어요." },
    ],
    scene: (i) => (<>
      <TopBar items={["HOME", "배차", "매출", "정산", "회계관리", "자금관리"]} on="자금관리" />
      <Side items={["자금 현황", "수입·지출 장부"]} on={1} />
      <Btn r={[70, 14, 13, 11]} hi={i === 0}>+ 지출</Btn><Btn r={[84, 14, 13, 11]} primary={false} hi={i === 0}>+ 수입</Btn>
      <Bx r={[19, 28, 38, 15]} label="✎ 승인된 지출결의" value="3건 가져오기" hi={i === 1} /><Bx r={[59, 28, 38, 15]} label="↻ 이번 달 고정비" value="4건 반영" hi={i === 2} />
      <Tbl r={[19, 48, 78, 47]} cols={[["일자", 12], ["계정과목", 18], ["적요", 30], ["금액", 18], ["증빙", 22]]} rows={[["11-03", "임차료", "사무실 월세", "1,500,000", "자동이체"], ["11-05", "소모품비", "A4용지", "38,000", i === 3 ? "없음 ⚠" : "영수증"], ["11-07", "차량유지비", "주유", "92,000", "카드"]]} hiRow={i === 3 ? 1 : -1} />
    </>),
  },
  assets: {
    steps: [
      { c: [86, 18], cap: "[+ 비품 등록]을 눌러 품목 이름 · 수량 · 위치 · 담당자 · 구입가를 적어요. 사진도 붙일 수 있어요." },
      { c: [40, 34], cap: "구입가를 적으면 수입·지출 장부에 ‘비품구입’으로 자동 기록돼요." },
      { c: [70, 34], cap: "소모품은 최소 수량을 정해 두면, 그 아래로 떨어질 때 ‘재고 부족’으로 알려 줘요." },
      { c: [60, 72], cap: "품목을 눌러 [입고] · [출고]를 기록하면 수량이 바뀌고 이력이 남아요." },
    ],
    scene: (i) => (<>
      <TopBar items={["HOME", "배차", "회계관리", "자금관리", "비품관리"]} on="비품관리" />
      <Btn r={[78, 14, 19, 11]} hi={i === 0}>+ 비품 등록</Btn>
      {[["관리 품목", "42종"], ["자산 금액", "1,860만"], ["재고 부족", "2종"], ["수리중", "1건"]].map(([l, v], k) => <Bx key={l} r={[3 + k * 24, 28, 23, 15]} label={l} value={v} hi={(i === 1 && k === 1) || (i === 2 && k === 2)} />)}
      <Tbl r={[3, 48, 94, 47]} cols={[["품목", 26], ["분류", 16], ["수량", 14], ["위치 · 담당", 28], ["", 16]]} rows={[["노트북", "IT기기", "8대", "2층 · 영업팀", "입고 · 출고"], ["A4용지", "소모품", "3박스 ⚠", "창고", "입고 · 출고"], ["복합기", "IT기기", "1대", "1층", ""]]} hiCell={i === 3 ? [1, 4] : null} hiRow={i === 2 ? 1 : -1} />
    </>),
  },
};
export const hasHelpDemo = (id) => !!DEMOS[id];

export function HelpDemo({ id }) {
  const d = DEMOS[id];
  const [i, setI] = React.useState(0);
  const [play, setPlay] = React.useState(true);
  const [hover, setHover] = React.useState(false);
  const n = d ? d.steps.length : 0;
  React.useEffect(() => { setI(0); setPlay(true); }, [id]);
  React.useEffect(() => {
    if (!d || !play || hover) return undefined;
    const t = setTimeout(() => setI((x) => (x + 1) % n), i === n - 1 ? 3800 : 3000);
    return () => clearTimeout(t);
  }, [d, play, hover, i, n]);
  if (!d) return null;
  const st = d.steps[i];
  return (
    <div className="rounded-2xl overflow-hidden border border-[#DCE3EE] bg-white" data-kp="help-demo" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="flex items-center gap-2 px-3.5 h-9 bg-[#0F1A30] text-white">
        <span className="w-1.5 h-1.5 rounded-full bg-[#8FB0F0] animate-pulse" />
        <span className="text-[11.5px] font-black tracking-wide">예시 화면</span>
        <span className="text-[11px] font-semibold text-white/50">실제 화면을 단순하게 그린 것입니다</span>
        <span className="ml-auto text-[11.5px] font-black tabular-nums text-white/80">{i + 1} / {n}</span>
      </div>
      <div className="relative w-full bg-[#F1F4F9] overflow-hidden select-none" style={{ aspectRatio: "16 / 6.6", minHeight: 210 }}>
        {d.scene(i)}
        {/* 마우스 */}
        <div className="absolute z-[5] pointer-events-none" style={{ left: `${st.c[0]}%`, top: `${st.c[1]}%`, transition: "left .8s cubic-bezier(.2,.8,.2,1), top .8s cubic-bezier(.2,.8,.2,1)" }}>
          <span key={i} className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-[#2D4C82]/30 animate-ping" style={{ animationIterationCount: 2, animationDelay: ".8s" }} />
          <svg width="20" height="22" viewBox="0 0 20 22" className="drop-shadow-[0_2px_3px_rgba(0,0,0,.45)]"><path d="M2 1.5l14.5 9.2-6.3 1.2 3.6 7-2.7 1.4-3.6-7L2 17.6z" fill="#0F1A30" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" /></svg>
        </div>
      </div>
      <div className="px-3.5 py-3 bg-white border-t border-[#E6EBF3] flex items-center gap-3">
        <span className="shrink-0 w-7 h-7 rounded-full bg-[#0F1A30] text-white text-[13px] font-black grid place-items-center tabular-nums">{i + 1}</span>
        <div className="flex-1 min-w-0 text-[14.5px] font-bold text-[#0F1A30] leading-snug">{st.cap}</div>
        <div className="shrink-0 flex items-center gap-1">
          <button type="button" onClick={() => { setPlay(false); setI((x) => (x - 1 + n) % n); }} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B] hover:border-[#2D4C82]" aria-label="이전 단계">◀</button>
          <button type="button" onClick={() => setPlay((p) => !p)} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B] hover:border-[#2D4C82] whitespace-nowrap">{play ? "멈춤" : "재생"}</button>
          <button type="button" onClick={() => { setPlay(false); setI((x) => (x + 1) % n); }} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B] hover:border-[#2D4C82]" aria-label="다음 단계">▶</button>
        </div>
      </div>
      <div className="flex gap-1 px-3.5 pb-3 bg-white">
        {d.steps.map((_, k) => <button key={k} type="button" onClick={() => { setPlay(false); setI(k); }} aria-label={`${k + 1}단계`} className={`h-1.5 rounded-full transition-all ${k === i ? "flex-[2] bg-[#0F1A30]" : "flex-1 bg-[#DCE3EE] hover:bg-[#B5C0D3]"}`} />)}
      </div>
    </div>
  );
}
export default HelpDemo;
