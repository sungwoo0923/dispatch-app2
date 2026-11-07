// ======================= src/devSheetFixture.js =======================
// 🧪 개발 전용 — 구글시트 연결 마법사 점검용 가짜 시트("배차현황_월별탭_전체")
//  /preview?...&demo=1 일 때만 화면(src/sheetConnectApi.js)이 서버 대신 이 값을 돌려준다. 테스트(scripts/sheetProfile.test.mjs)도 같이 쓴다.
//  실제 다른 운송사 시트 모양을 흉내 냄: 맨 위 제목 줄 · 빈 줄 · 머리줄 · #REF! 배차상태 · 이름 없는 조회 칸("정보 없음") · 월별 탭

export const FIXTURE_TITLE = "배차현황_월별탭_전체";
export const FIXTURE_HEADER = ["순번", "날짜", "거래처명", "상차지", "상차지주소", "하차지주소", "하차지", "화물정보", "차량톤수", "차량종류", "배차상태", "", "기사명", "차량번호", "전화번호", "청구운임", "기사님요금", "수수료", "매익률(%)", "프로그램", "선/착불", "비고(고유값고정값)", "지급일", "작불"];

const CLIENTS = ["(주)한빛유통", "대성물산", "그린푸드", "한길산업"];
const PICKS = [["평택1센터", "경기 평택시 포승읍 평택항로 100"], ["이천물류", "경기 이천시 마장면 덕평로 20"], ["김포센터", "경기 김포시 고촌읍 아라육로 55"]];
const DROPS = [["부산신항", "부산 강서구 신항로 10"], ["대구유통단지", "대구 북구 유통단지로 8"], ["광주하남", "광주 광산구 하남산단로 3"], ["대전센터", "대전 대덕구 대화로 7"]];
const DRIVERS = [["김철수", "경기12가3456", "010-1234-5678"], ["이영호", "서울34나7788", "010-2222-3333"], ["박민수", "인천80다1122", "010-9876-5432"], ["최정훈", "12라4567", "01055556666"]];
const PROGS = ["직접배차", "24시", "인성", "24시", "직접배차"];
const PAYS = ["계산서", "착불", "계산서", "손실", "계산서"];

function monthRows(y, m, n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const d = (i % 9) + 1;
    const [dn, plate, phone] = DRIVERS[i % DRIVERS.length];
    const [pn, pa] = PICKS[i % PICKS.length]; const [hn, ha] = DROPS[i % DROPS.length];
    const fare = 300000 + (i % 5) * 50000; const pay = fare - 40000 - (i % 3) * 10000;
    rows.push([
      String(i + 1),
      i % 4 === 1 ? `${m}/${d}` : i % 4 === 2 ? `${m}월${d}일` : `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      CLIENTS[i % CLIENTS.length], pn, pa, ha, hn,
      ["파렛트 12", "박스 300", "철강 코일", "냉동 식품"][i % 4], ["5톤", "11톤", "2.5톤", "25톤"][i % 4], ["윙바디", "카고", "탑차", "냉동탑"][i % 4],
      "#REF!",
      i % 3 === 0 ? "정보 없음" : `${plate} 정보 없음`,
      dn, plate, phone,
      fare.toLocaleString("ko-KR"), pay.toLocaleString("ko-KR"), (fare - pay).toLocaleString("ko-KR"), `${Math.round(((fare - pay) / fare) * 1000) / 10}%`,
      PROGS[i % PROGS.length], PAYS[i % PAYS.length], `K${y}${String(m).padStart(2, "0")}-${String(i + 1).padStart(3, "0")}`,
      i % 2 ? "" : `${y}-${String(m + 1 > 12 ? 1 : m + 1).padStart(2, "0")}-10`, i % 5 === 3 ? "착불" : "",
    ]);
  }
  return rows;
}
function tabRows(y, m, n) {
  return [
    [`${y}년 ${m}월 배차현황`],
    [],
    FIXTURE_HEADER,
    ...monthRows(y, m, n),
    [],
    ["", "", "합계", "", "", "", "", "", "", "", "", "", "", "", "", "9,999,999", "8,888,888"],
  ];
}
// 수식(FORMULA 보기) — 배차상태 · 이름 없는 조회 칸 · 수수료 · 매익률은 수식
function tabFormulas(rows) {
  return rows.map((r, i) => {
    if (i < 3 || !r.length || !/^\d+$/.test(String(r[0] || ""))) return r;
    const n = i + 1;
    const out = [...r];
    out[10] = `=IF(N${n}="","배차중",#REF!)`;
    out[11] = `=IFERROR(VLOOKUP(N${n},'고유값'!A:C,2,0),"정보 없음")`;
    out[17] = `=P${n}-Q${n}`;
    out[18] = `=R${n}/P${n}`;
    return out;
  });
}
export const FIXTURE_TABS = {
  "2025-10": tabRows(2025, 10, 14),
  "2025-11": tabRows(2025, 11, 18),
  고유값: [["기사명", "차량번호", "전화번호"], ...DRIVERS.map(([a, b, c]) => [a, b, c])],
  요약: [["월", "건수", "매출"], ["2025-10", "14", "5,000,000"], ["2025-11", "18", "6,300,000"]],
};
// 태진(돌캐 배차현황) 지금 모양 — 1행 머리줄, 수식 칸(순번·기사명·전화번호·배차상태·수수료), 오더ID 숨김 칸
export const LEGACY_SAMPLE_ROWS = [
  ["순번", "등록일", "상차일", "상차시간", "하차일", "하차시간", "거래처명", "상차지명", "상차지주소", "하차지명", "하차지주소", "화물내용", "차량종류", "차량톤수", "혼적", "차량번호", "이름", "전화번호", "배차상태", "청구운임", "기사운임", "수수료", "지급방식", "배차방식", "메모", "오더ID"],
  ["1", "2026-11-01", "2026-11-02", "오전 9:00", "2026-11-02", "오후 3:00", "그린푸드", "평택1센터", "경기 평택시", "부산신항", "부산 강서구", "파렛트 12", "윙바디", "11톤", "", "경기12가3456", "김철수", "010-1234-5678", "배차완료", "450,000", "400,000", "50,000", "계산서", "24시", "", "orders/abc123"],
  ["2", "2026-11-01", "2026-11-02", "오전 10:00", "2026-11-03", "오전 8:00", "대성물산", "이천물류", "경기 이천시", "대구유통단지", "대구 북구", "박스 300", "카고", "5톤", "", "", "정보 없음", "정보 없음", "배차중", "300,000", "", "300,000", "착불", "직접배차", "급함", "orders/def456"],
];

export function fixtureFormulas(tab) { return tabFormulas(FIXTURE_TABS[tab] || []); }
// 서버(sheetConnect) 응답 흉내
export function fixtureResponse(body) {
  const titles = Object.keys(FIXTURE_TABS);
  if (body.action === "tabs") return { title: FIXTURE_TITLE, spreadsheetId: "demo-sheet", tabs: titles.map((t, index) => ({ title: t, index, rows: FIXTURE_TABS[t].length, cols: Math.max(...FIXTURE_TABS[t].map((r) => r.length)) })), modifiedTime: "2025-11-20T09:00:00Z" };
  if (body.action === "sample") {
    const t = body.tab;
    return { tab: t, rows: (FIXTURE_TABS[t] || []).slice(0, 60), formulas: fixtureFormulas(t).slice(0, 60), merges: t.startsWith("2025") ? [{ startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 10 }] : [] };
  }
  if (body.action === "read") return { tabs: (body.tabs || []).map((t) => ({ title: t, rows: FIXTURE_TABS[t] || [], merges: [{ startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 10 }] })), modifiedTime: "2025-11-20T09:00:00Z" };
  if (body.action === "aiMap") return { suggestions: (body.columns || []).map((c) => (c.header === "작불" ? { idx: c.idx, field: "", confidence: 0.3, why: "선/착불과 겹쳐서 참고로" } : { idx: c.idx, field: "", confidence: 0.2, why: "판단 어려움" })), engine: "demo" };
  if (body.action === "export") return { written: 6, appended: 3, protectedSkipped: 12, sheetNewer: 1, tabs: ["2025-11"], dryRun: !!body.dryRun };
  return { ok: true };
}
