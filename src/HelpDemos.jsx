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
      <span className="text-[10px] font-black tracking-[0.18em] text-[#8FB0F0] mr-1">LOGISWEB</span>
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
