// 🔗 2026-11-07 구글시트 연동(시트 프로필) 단위 테스트 — 머리줄 찾기 · 동의어 · 값 살펴보기 · 값 바꾸기 · 중복 확인 · 보내기 보호 · 돌캐(기존) 설정
//  실행: node scripts/sheetProfile.test.mjs  (인터넷 · 에뮬레이터 필요 없음)
import { createRequire } from "module";
import * as C from "../functions/sheetProfileCore.mjs";
import { FIXTURE_TABS, FIXTURE_HEADER, LEGACY_SAMPLE_ROWS, fixtureFormulas } from "../src/devSheetFixture.js";

const require = createRequire(import.meta.url);
const L = require("../functions/gsheetLegacy.js");

let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` :: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };
const has = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${name} ${cond ? "" : extra}`); };

// ── 1) 머리줄 찾기 ──
const nov = C.applyMerges(FIXTURE_TABS["2025-11"], [{ startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 10 }]);
const h = C.detectHeader(nov);
eq("제목 줄(병합) · 빈 줄 건너뛰고 3번째 줄이 머리줄", [h.headerRow, h.depth, h.dataStart], [2, 1, 3]);
eq("제목 줄 기록", h.titleRows, [0]);
eq("머리줄 글자", h.headers.slice(0, 4), ["순번", "날짜", "거래처명", "상차지"]);
// 두 줄 머리줄(위: 묶음 이름 병합 · 아래: 세부 이름)
const two = C.applyMerges([
  ["배차일지"], [],
  ["날짜", "거래처", "상차", "", "하차", "", "기사", "", "운임", ""],
  ["", "", "지명", "주소", "지명", "주소", "이름", "차번", "청구", "기사"],
  ["2025-11-01", "한빛", "평택", "경기 평택시", "부산", "부산 강서구", "김철수", "12가3456", "300,000", "250,000"],
], [{ startRowIndex: 2, endRowIndex: 3, startColumnIndex: 2, endColumnIndex: 4 }, { startRowIndex: 2, endRowIndex: 3, startColumnIndex: 4, endColumnIndex: 6 },
  { startRowIndex: 2, endRowIndex: 3, startColumnIndex: 6, endColumnIndex: 8 }, { startRowIndex: 2, endRowIndex: 3, startColumnIndex: 8, endColumnIndex: 10 },
  { startRowIndex: 2, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 1 }, { startRowIndex: 2, endRowIndex: 4, startColumnIndex: 1, endColumnIndex: 2 }]);
const h2 = C.detectHeader(two);
eq("두 줄 머리줄 감지", [h2.headerRow, h2.depth, h2.dataStart], [2, 2, 4]);
const m2 = C.autoMapColumns(h2.headers, two.slice(h2.dataStart));
eq("두 줄 머리줄 칸 맞추기", m2.map((c) => c.field), ["상차일", "거래처명", "상차지명", "상차지주소", "하차지명", "하차지주소", "이름", "차량번호", "청구운임", "기사운임"]);
// 태진(돌캐) 지금 모양: 1행 머리줄
const hl = C.detectHeader(LEGACY_SAMPLE_ROWS);
eq("기존 시트 1행 머리줄", [hl.headerRow, hl.depth, hl.dataStart], [0, 1, 1]);

// ── 2) 동의어 · 값 살펴보기로 칸 맞추기(예시 시트) ──
const data = nov.slice(h.dataStart, h.dataStart + 20);
const forms = fixtureFormulas("2025-11").slice(h.dataStart, h.dataStart + 20);
const cols = C.autoMapColumns(h.headers, data, forms);
const byHeader = Object.fromEntries(cols.map((c) => [c.header || `(${C.colLetter(c.idx)})`, [c.field, c.mode]]));
eq("순번 → 순번(읽기전용)", byHeader["순번"], ["순번", "readonly"]);
eq("날짜 → 상차일", byHeader["날짜"], ["상차일", "data"]);
eq("거래처명", byHeader["거래처명"], ["거래처명", "data"]);
eq("상차지 → 상차지명", byHeader["상차지"], ["상차지명", "data"]);
eq("상차지주소", byHeader["상차지주소"], ["상차지주소", "data"]);
eq("하차지주소", byHeader["하차지주소"], ["하차지주소", "data"]);
eq("하차지 → 하차지명", byHeader["하차지"], ["하차지명", "data"]);
eq("화물정보 → 화물내용", byHeader["화물정보"], ["화물내용", "data"]);
eq("차량톤수", byHeader["차량톤수"], ["차량톤수", "data"]);
eq("차량종류", byHeader["차량종류"], ["차량종류", "data"]);
eq("배차상태(#REF!) → 계산열", byHeader["배차상태"][1], "calc");
eq("이름 없는 조회 칸(정보 없음) → 계산열", byHeader["(L)"][1], "calc");
eq("기사명 → 이름", byHeader["기사명"], ["이름", "data"]);
eq("차량번호", byHeader["차량번호"], ["차량번호", "data"]);
eq("전화번호", byHeader["전화번호"], ["전화번호", "data"]);
eq("청구운임", byHeader["청구운임"], ["청구운임", "data"]);
eq("기사님요금 → 기사운임", byHeader["기사님요금"], ["기사운임", "data"]);
eq("수수료 → 계산열", byHeader["수수료"], ["수수료", "calc"]);
eq("매익률(%) → 계산열", byHeader["매익률(%)"], ["매익율", "calc"]);
eq("프로그램 → 배차방식", byHeader["프로그램"], ["배차방식", "data"]);
eq("선/착불 → 지급방식", byHeader["선/착불"], ["지급방식", "data"]);
eq("비고(고유값고정값) → 메모", byHeader["비고(고유값고정값)"], ["메모", "data"]);
eq("지급일", byHeader["지급일"], ["지급일", "data"]);
eq("작불 → 지급방식과 겹쳐 읽기전용", byHeader["작불"], ["", "readonly"]);
eq("필수 칸 다 있음", C.missingRequired(cols), []);
eq("겹친 칸 없음", C.duplicateFields(cols), []);
has("확신도 0~1", cols.every((c) => c.confidence >= 0 && c.confidence <= 1));
// 머리줄 없이 값만 보고
const noHead = C.autoMapColumns(["", "", ""], [["경기12가3456", "010-1234-5678", "계산서"], ["서울34나7788", "01022223333", "착불"], ["12라4567", "010-9876-5432", "계산서"]]);
eq("값만 보고: 차량번호 · 전화번호 · 지급방식", noHead.map((c) => [c.field, c.source]), [["차량번호", "sniff"], ["전화번호", "sniff"], ["지급방식", "sniff"]]);
eq("값 모양: #REF!", C.sniffColumn(["#REF!", "#REF!", "#REF!"]).type, "error");
eq("값 모양: 수식", C.sniffColumn(["1", "2"], ["=A1", "=A2"]).type, "formula");
eq("값 모양: 퍼센트", C.sniffColumn(["12.5%", "10%", "8%"]).type, "percent");
eq("값 모양: 금액", C.sniffColumn(["300,000", "450,000", "1,200,000"]).type, "money");
eq("값 모양: 날짜", C.sniffColumn(["2025-11-01", "11/2", "11월3일"]).type, "date");
eq("값 모양: 순번", C.sniffColumn(["1", "2", "3", "4", "5"]).type, "seq");
eq("머리줄 '날짜'인데 값이 날짜가 아니면 확신도 낮춤", C.autoMapColumns(["날짜"], [["홍길동"], ["김철수"]])[0].confidence < 0.7, true);
// AI 제안 반영
const ai = C.applyAiSuggestions([{ idx: 0, header: "구분값", field: "", mode: "readonly", confidence: 0 }, { idx: 1, header: "기사", field: "이름", mode: "data", confidence: 1 }], [{ idx: 0, field: "배차방식", confidence: 0.7 }, { idx: 1, field: "메모", confidence: 0.9 }]);
eq("AI 제안: 빈 칸만 채우고 확실한 칸은 그대로", ai.map((c) => [c.field, c.source || ""]), [["배차방식", "ai"], ["이름", ""]]);
eq("헷갈리는 칸만 AI에", C.ambiguousColumns(cols).map((c) => c.header).filter(Boolean), ["작불"]);

// ── 3) 값 바꾸기 ──
eq("날짜 2025-11-01", C.parseDate("2025-11-01"), "2025-11-01");
eq("날짜 11/1(탭 연도)", C.parseDate("11/1", { y: 2025 }), "2025-11-01");
eq("날짜 11월1일", C.parseDate("11월1일", { y: 2025 }), "2025-11-01");
eq("날짜 2025. 11. 1", C.parseDate("2025. 11. 1"), "2025-11-01");
eq("날짜 25-11-01", C.parseDate("25-11-01"), "2025-11-01");
eq("날짜 요일 붙음", C.parseDate("2025-11-01(토)"), "2025-11-01");
eq("날짜 엑셀 일련번호", C.parseDate("45962"), "2025-11-01");
eq("날짜 '1일'(탭 월)", C.parseDate("1일", { y: 2025, m: 11 }), "2025-11-01");
eq("날짜 엉터리", C.parseDate("13/45"), "");
eq("금액 쉼표", C.parseMoney("120,000"), "120000");
eq("금액 만원", C.parseMoney("12만원"), "120000");
eq("금액 1.5만", C.parseMoney("1.5만"), "15000");
eq("금액 12만5천", C.parseMoney("12만5천"), "125000");
eq("금액 ₩", C.parseMoney("₩ 300,000"), "300000");
eq("금액 만원 단위 칸", C.parseMoney("35", "만원"), "350000");
eq("금액 -", C.parseMoney("-"), "");
eq("금액 #REF!", C.parseMoney("#REF!"), "");
eq("전화 하이픈", C.parsePhone("01055556666"), "010-5555-6666");
eq("지급방식 계산서", C.mapEnum("지급방식", "계산서").value, "계산서");
eq("지급방식 손실 → 메모", C.mapEnum("지급방식", "손실"), { value: "", toMemo: "손실" });
eq("지급방식 사용자 표", C.mapEnum("지급방식", "손실", { 지급방식: { 손실: "계산서" } }).value, "계산서");
eq("배차방식 24시콜", C.mapEnum("배차방식", "24시콜").value, "24시");
eq("배차방식 로지스허브", C.mapEnum("배차방식", "로지스허브").value, "로지스허브");
has("배차방식 모르는 값 경고", !!C.mapEnum("배차방식", "화물맨").warn);

// ── 4) 탭 고르기 ──
const titles = Object.keys(FIXTURE_TABS);
const mt = C.detectMonthlyTabs(titles);
eq("월별 탭 찾기(yyyy-mm)", [mt.kind, mt.tabs.map((t) => t.title)], ["yyyy-mm", ["2025-10", "2025-11"]]);
eq("월별 탭 찾기(26년11월)", C.detectMonthlyTabs(["26년10월", "26년11월", "고유값"]).kind, "yy년m월");
eq("월별 탭 찾기(11월)", C.detectMonthlyTabs(["10월", "11월", "요약"]).kind, "m월");
const prof0 = { tabMode: "monthly", tabPattern: { kind: "yyyy-mm", sample: "2025-11" } };
eq("상차일로 탭 고르기(있음)", C.tabForDate(prof0, "2025-11-03", titles), { tab: "2025-11", exists: true });
eq("상차일로 탭 고르기(새 달)", C.tabForDate(prof0, "2025-12-01", titles), { tab: "2025-12", exists: false });
eq("26년11월 새 이름", C.monthTabName("yy년m월", "2026-12-01", "26년11월"), "26년12월");
eq("가져올 탭(기간)", C.tabsToRead(prof0, titles, { from: "2025-11-01", to: "2025-11-30" }), ["2025-11"]);
eq("전체 탭 합치기", C.tabsToRead({ tabMode: "all", tabs: ["2025-10", "2025-11"] }, titles), ["2025-10", "2025-11"]);

// ── 5) 가져오기 미리보기 · 중복 확인 ──
const profile = { id: "p1", ...C.buildProfile({ companyName: "테스트운송", name: "배차현황", tabMode: "monthly", tabs: ["2025-10", "2025-11"], tabPattern: { kind: "yyyy-mm", sample: "2025-11" }, header: h, columns: cols }) };
eq("중복 확인 칸 추천: 비고(고유값)", profile.dedupe.label, "비고(고유값고정값)");
const p1 = C.buildImportPreview(profile, [{ title: "2025-11", rows: nov }]);
eq("미리보기: 18줄 신규 + 합계 줄 건너뜀", [p1.counts.신규, p1.counts.건너뜀, p1.counts.오류], [18, 1, 0]);
const r0 = p1.rows.find((r) => r.rowNo === 4).rec;
eq("첫 줄 값", [r0.상차일, r0.거래처명, r0.차량번호, r0.이름, r0.청구운임, r0.기사운임, r0.배차방식, r0.지급방식], ["2025-11-01", "(주)한빛유통", "경기12가3456", "김철수", "300000", "260000", "직접배차", "계산서"]);
has("배차상태 #REF!는 가져오지 않음(차량 있으면 배차완료)", r0.배차상태 === "배차완료");
has("수수료는 프로그램이 계산", r0.수수료 === "40000");
const lossRow = p1.rows.find((r) => r.rowNo === 7).rec;
has("손실 → 메모로", /손실/.test(lossRow.메모 || "") && !lossRow.지급방식, JSON.stringify(lossRow));
eq("11/2 날짜도 탭 연도로", p1.rows.find((r) => r.rowNo === 5).rec.상차일, "2025-11-02");
// 이미 가져온 오더(같은 열쇠) — 바뀐 칸 없음 → 중복 · 운임 바뀜 → 변경 · 프로그램이 더 나중에 고침 → 중복(프로그램 값 지킴)
const fields = C.importedFields(profile);
const mk = (row) => ({ id: `o${row.rowNo}`, ...row.rec, 시트프로필Id: "p1", 시트키: row.key, _sheetHash: C.fieldsHash(row.rec, fields), _sheetSyncAt: 1000, _lastModified: 1000 });
const ex = p1.rows.filter((r) => r.status === "신규").slice(0, 3).map(mk);
ex[1].청구운임 = "999000"; ex[1]._sheetHash = "old"; // 시트가 바뀜(지난 해시와 다름) · 프로그램은 안 고침
ex[2].청구운임 = "999000"; ex[2]._lastModified = 9e12; // 프로그램에서 나중에 고침
const p2 = C.buildImportPreview(profile, [{ title: "2025-11", rows: nov }], ex, { sheetModifiedAt: 5000 });
eq("이미 가져온 줄: 중복 / 변경 / 프로그램 값 지킴", p2.rows.slice(0, 3).map((r) => r.status), ["중복", "변경", "중복"]);
has("변경 이유에 칸 이름", /청구운임/.test(p2.rows[1].reasons[0]));
// 순번+날짜 열쇠
const seqProfile = { ...profile, dedupe: { cols: [1, 0], label: "날짜+순번" } };
const k1 = C.dedupeKey(seqProfile, nov[3], { 상차일: "2025-11-01" });
eq("순번+날짜 열쇠", k1, "2025-11-01|1");
// 시트 안 같은 열쇠 두 번
const dupRows = [...nov.slice(0, 5), nov[3]];
eq("시트 안 중복", C.buildImportPreview(profile, [{ title: "2025-11", rows: dupRows }]).counts.중복, 1);
// 프로그램에 원래 있던 같은 오더
const loose = [{ id: "x", ...r0 }];
eq("프로그램에 원래 있던 오더 → 중복", C.buildImportPreview(profile, [{ title: "2025-11", rows: nov.slice(0, 4) }], loose).rows[0].status, "중복");
// 오류 줄
const bad = [...nov.slice(0, 3), ["1", "13/45", "", "평택"]];
const pb = C.buildImportPreview(profile, [{ title: "2025-11", rows: bad }]);
eq("오류 이유", pb.rows[0].reasons, ["상차일 형식 확인(\"13/45\")", "거래처명 없음"]);
has("오류 보고서 CSV", C.previewToCsv(pb).includes("상차일 형식 확인"));

// ── 6) 보내기 · 칸 보호 ──
const order = { 상차일: "2025-11-21", 거래처명: "새거래처", 상차지명: "평택1센터", 하차지명: "부산신항", 차량번호: "경기99바1234", 이름: "홍길동", 청구운임: "500000", 기사운임: "450000", 수수료: "50000", 배차상태: "배차완료", 지급방식: "계산서", 배차방식: "24시", 메모: "K-NEW" };
const cells = C.orderToCells(profile, order);
const colOf = (hd) => cols.find((c) => c.header === hd).idx;
has("계산열(수수료·매익률·배차상태·조회 칸)은 보낼 값에 없음", [colOf("수수료"), colOf("매익률(%)"), colOf("배차상태"), 11].every((i) => !(i in cells)));
has("읽기전용(순번·작불)도 없음", [colOf("순번"), colOf("작불")].every((i) => !(i in cells)));
const rowF = fixtureFormulas("2025-11")[3];
const plan = C.planRowWrite(profile, { ...cells, [colOf("수수료")]: "1", [colOf("배차상태")]: "x" }, { current: nov[3], formulas: rowF });
has("수식 칸 · 계산열에는 절대 안 씀", plan.writes.every((w) => ![10, 11, 17, 18].includes(w.col)) && plan.blocked.some((b) => b.col === colOf("수수료")));
// 사용자가 '가져오기·보내기'로 바꿔도 지금 수식이 든 칸이면 안 씀
const forced = { ...profile, columns: profile.columns.map((c) => (c.idx === 10 ? { ...c, field: "배차상태", mode: "data" } : c)) };
has("지금 수식이 든 칸은 칸 설정과 상관없이 보호", !C.isWritableCell(forced, 10, { formula: rowF[10] }));
has("병합 안쪽 칸 보호", !C.isWritableCell(profile, 2, { mergedNonAnchor: true }));
has("같은 값이면 안 씀", C.planRowWrite(profile, { 2: nov[3][2] }, { current: nov[3], formulas: rowF }).writes.length === 0);
// 칸이 옮겨진 시트(머리줄 글자로 다시 찾기)
const moved = ["경유지", ...FIXTURE_HEADER];
const loc = C.relocateColumns(profile, moved);
eq("칸이 한 칸 밀려도 머리줄 글자로 찾기", [loc[colOf("거래처명")], loc[colOf("청구운임")]], [colOf("거래처명") + 1, colOf("청구운임") + 1]);
// 표 끝(합계 줄 위에 끼워 넣기)
const ap = C.findAppendRow(profile, nov);
eq("새 줄 자리: 마지막 데이터 줄 다음(빈 줄) · 합계 줄 앞", [ap.row, ap.prevDataRow], [21, 20]);
const noBlank = [...nov.slice(0, 21), nov[22]];
eq("바로 아래가 합계 줄이면 끼워 넣기", C.findAppendRow(profile, noBlank).insert, true);
eq("오더 → 시트 값(값 바꾸기 표 거꾸로)", C.orderToCells({ columns: [{ idx: 0, field: "지급방식", mode: "data" }], valueMaps: { 지급방식: { 인수증: "계산서" } } }, { 지급방식: "계산서" }), { 0: "인수증" });

// ── 7) 누가 마지막에 고쳤나 ──
eq("둘 다 그대로", C.syncDecision({ sheetHash: "a", link: { hash: "a", at: 100 }, programEditedAt: 100 }), "same");
eq("시트만 바뀜", C.syncDecision({ sheetHash: "b", link: { hash: "a", at: 100 }, programEditedAt: 100 }), "sheet");
eq("프로그램만 바뀜", C.syncDecision({ sheetHash: "a", link: { hash: "a", at: 100 }, programEditedAt: 99999 }), "program");
eq("둘 다 바뀜, 시트가 나중", C.syncDecision({ sheetHash: "b", link: { hash: "a", at: 100 }, programEditedAt: 50000, sheetModifiedAt: 90000 }), "conflict-sheet");
eq("둘 다 바뀜, 프로그램이 나중", C.syncDecision({ sheetHash: "b", link: { hash: "a", at: 100 }, programEditedAt: 90000, sheetModifiedAt: 50000 }), "conflict-program");

// ── 8) 돌캐(기존 고정 설정) — 같은 동작 ──
const lp = C.legacyDolcaeProfile();
const legacyMap = L.legacyColumnIndexMap(LEGACY_SAMPLE_ROWS[0]);
// 예전 이름 → 프로그램 칸 이름
const LEG2FIELD = { 상차지: "상차지명", 하차지: "하차지명", 화물정보: "화물내용", 기사명: "이름", 프로그램: "배차방식" };
const fromProfile = {};
lp.columns.forEach((c) => { if (c.field) fromProfile[c.field] = c.idx; });
const mismatch = Object.entries(legacyMap).filter(([k, i]) => k !== "혼적" && fromProfile[LEG2FIELD[k] || k] !== i);
eq("기존 칸 찾기 = 프로필 칸(혼적 제외)", mismatch, []);
eq("기존 수식 칸은 계산열", lp.columns.filter((c) => c.mode === "calc").map((c) => c.header), ["순번", "이름", "전화번호", "배차상태", "수수료"]);
eq("오더ID 칸", lp.columns.find((c) => c.mode === "id").header, "오더ID");
eq("기존 시트 새 동의어 사전으로도 같은 칸", C.autoMapColumns(LEGACY_SAMPLE_ROWS[0], LEGACY_SAMPLE_ROWS.slice(1)).filter((c) => c.field).map((c) => [c.header, c.field]).filter(([hd, f]) => fromProfile[f] !== LEGACY_SAMPLE_ROWS[0].indexOf(hd)), []);
eq("돌캐 월 탭 이름", C.tabForDate(lp, "2026-11-07", ["26년10월", "26년11월"]), { tab: "26년11월", exists: true });
// isGsheetDolcaeOrder(돌캐 필터) — 예전 코드와 같은 결과
const oldDolcae = (d) => { if (!d) return false; if ((d.companyName || "돌캐") !== "돌캐") return false; if (d.배차표Id || d._autoSheet || d.고정노선Id || d.등록기기 === "배차표") return false; return true; };
const cases = [null, {}, { companyName: "돌캐" }, { companyName: "태진" }, { companyName: "돌캐", 배차표Id: "b1" }, { companyName: "돌캐", _autoSheet: true }, { companyName: "돌캐", 고정노선Id: "f" }, { 등록기기: "배차표" }, { companyName: "돌캐", 등록기기: "PC" }];
eq("돌캐 필터 예전과 같음", cases.map(L.isGsheetDolcaeOrder), cases.map(oldDolcae));
eq("일반화: 테스트운송 프로필은 테스트운송 오더만", [{ companyName: "테스트운송" }, { companyName: "돌캐" }, { companyName: "테스트운송", 배차표Id: "x" }].map((d) => L.isProfileOwnOrder({ companyName: "테스트운송" }, d)), [true, false, false]);

// ── 9) 배차표 양식 만들기 ──
const board = C.profileToBoardColumns(profile, (() => { let i = 0; return () => `c${i++}`; })());
// 🔗 2026-11-08 상차지·상차지주소도 프로그램 칸 · 배차상태는 읽기만(field) · 수수료·매익률은 자동 계산 칸(calc — 시트에 안 씀)
eq("배차표 칸(시트 순서)", board.slice(0, 8).map((c) => [c.label, c.kind, c.field || ""]), [["순번", "no", ""], ["날짜", "extra", ""], ["거래처명", "field", "거래처명"], ["상차지", "field", "상차지명"], ["상차지주소", "field", "상차지주소"], ["하차지주소", "field", "하차지주소"], ["하차지", "field", "하차지명"], ["화물정보", "field", "화물내용"]]);
has("배차표 수식 칸: 수수료·매익률은 calc · 그 밖의 수식 칸 없음", board.filter((c) => ["수수료", "매익률(%)"].includes(c.label)).every((c) => c.kind === "calc") && board.filter((c) => c.label === "배차상태").every((c) => c.kind === "field" && c.field === "배차상태"));


// ── 10) 서버 보내기(가짜 시트 · 가짜 DB) — 수식 칸 보호 · 합계 줄 위에 새 줄 · 오더 연결 기록 ──
{
  const { makeSheetConnect } = require("../functions/sheetConnect.js");
  const tab = "2025-11";
  const sheetRows = FIXTURE_TABS[tab].map((r) => [...r]);
  const sheetForms = fixtureFormulas(tab);
  const calls = [];
  const sheetsApiFor = async (sid, method, path, opts = {}) => {
    calls.push({ method, path, data: opts.data });
    if (method === "GET" && path.startsWith("?fields=sheets.properties")) return { sheets: [{ properties: { sheetId: 7, title: tab, index: 1, gridProperties: { rowCount: 40, columnCount: 26 } } }, { properties: { sheetId: 8, title: "2025-10", index: 0, gridProperties: { rowCount: 40 } } }] };
    if (method === "GET" && path.startsWith("?ranges=")) return { sheets: [{ properties: { title: tab, sheetId: 7, gridProperties: { rowCount: 40 } }, merges: [{ startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 10 }] }] };
    if (method === "GET" && path.startsWith("/values/")) return { values: path.includes("FORMULA") ? sheetForms : sheetRows };
    return {};
  };
  const pDoc = { ...profile, id: "p1", spreadsheetId: "S1" };
  delete pDoc.id;
  const ordersData = [
    // 이미 시트에 있는 줄(고유값 K202511-001) — 기사운임만 프로그램에서 고침
    { id: "a1", 상차일: "2025-11-01", 거래처명: "(주)한빛유통", 상차지명: "평택1센터", 하차지명: "부산신항", 차량번호: "경기12가3456", 이름: "김철수", 청구운임: "300000", 기사운임: "270000", 메모: "K202511-001", 배차방식: "직접배차", 지급방식: "계산서", companyName: "테스트운송", 시트프로필Id: "p1", 시트키: "k202511001", _sheetHash: C.fieldsHash(C.rowToOrder(profile, nov[3]).rec, C.importedFields(profile)), _sheetSyncAt: 1, _lastModified: 99999 },
    // 새 오더
    { id: "a2", 상차일: "2025-11-25", 거래처명: "새거래처", 상차지명: "김포센터", 하차지명: "광주하남", 차량번호: "", 청구운임: "500000", 메모: "NEW-1", companyName: "테스트운송", _lastModified: 10 },
    // 배차표 오더 · 다른 회사 · 취소 → 안 보냄
    { id: "a3", 상차일: "2025-11-25", 거래처명: "x", companyName: "테스트운송", 배차표Id: "b1" },
    { id: "a5", 상차일: "2025-11-25", 거래처명: "y", companyName: "테스트운송", 배차상태: "배차취소" },
  ];
  const updates = [];
  const mkSnap = (list, col) => ({ docs: list.map((o) => ({ id: o.id, ref: { path: `${col}/${o.id}`, id: o.id }, data: () => o })) });
  const q = (col) => { const api = { where: () => api, get: async () => mkSnap(col === "orders" ? ordersData : [], col) }; return api; };
  const fakeDb = {
    collection: (col) => ({
      ...q(col),
      doc: (id) => ({ id, get: async () => ({ exists: col === "sheetProfiles", id, data: () => pDoc, ref: { set: async (v) => updates.push(["profile", v]) } }), set: async () => {} }),
    }),
    batch: () => ({ update: (ref, v) => updates.push([ref.path, v]), commit: async () => {} }),
  };
  const handler = makeSheetConnect({
    db: fakeDb, FieldValue: { serverTimestamp: () => "TS" }, sheetsApiFor, parseSpreadsheetId: (u) => u, quoteTab: (t) => `'${t}'`,
    requireStaff: async () => ({ company: "테스트운송", isTM: false, email: "a@b" }), requireAdminRole: async () => ({ company: "테스트운송", isTM: false, email: "a@b" }),
    sheetModifiedTime: async () => "2025-11-20T00:00:00Z", makeAnthropic: () => null, setBulkMode: async () => {}, bumpDataVersion: async () => {},
  });
  const run = (body) => new Promise((resolve) => { const res = { set() {}, status(c) { this.c = c; return this; }, json(v) { resolve({ code: this.c || 200, v }); }, send() { resolve({}); } }; handler({ method: "POST", body, get: () => "" }, res); });
  const r = await run({ action: "export", profileId: "p1", from: "2025-11-01", to: "2025-11-30" });
  eq("보내기 결과", [r.code, r.v.total, r.v.written, r.v.appended], [200, 2, 1, 1]);
  const writes = calls.filter((c) => c.path === "/values:batchUpdate").flatMap((c) => c.data.data.map((d) => d.range));
  const colsWritten = writes.map((a) => a.match(/!([A-Z]+)\d+/)[1]);
  has("수식·계산·읽기전용 칸(A 순번, K 배차상태, L 조회, R 수수료, S 매익률, X 작불)은 안 씀", !colsWritten.some((c) => ["A", "K", "L", "R", "S", "X"].includes(c)), JSON.stringify(writes));
  has("기존 줄은 바뀐 칸(기사운임 Q4)만", writes.includes("'2025-11'!Q4") && !writes.includes("'2025-11'!C4"), JSON.stringify(writes));
  const batch = calls.filter((c) => c.path === ":batchUpdate").flatMap((c) => c.data.requests);
  const ins = batch.find((x) => x.insertDimension || x.appendDimension);
  has("새 줄은 빈 줄(22번째)에 그대로 써서 합계 줄은 그대로", !ins && writes.includes("'2025-11'!C22"), JSON.stringify(batch));
  has("새 줄 계산열은 윗줄 수식을 이어 붙임", batch.filter((x) => x.copyPaste).map((x) => x.copyPaste.destination.startColumnIndex).sort((a, b) => a - b).join(",") === "10,11,17,18");
  has("오더에 연결 기록", updates.filter(([p]) => p.startsWith("orders/")).length === 2 && updates.find(([p]) => p === "orders/a2")[1].시트키 === "new1");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
