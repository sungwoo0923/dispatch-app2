// 🤖 2026-11-07 배차 AI 비서(화면 쪽 순수 계산) 단위 테스트 — 실행: node scripts/aiAssistantCore.test.mjs
import { buildUpdate, buildCreateRecord, normValue, localEditProposal, localAnswer, intentOf, parseKakao, splitPasted, pickerRows, mdBlocks, mdInline, serializeChat, deserializeChat, scanValsToFields, looksLikeOrderText, missingOf } from "../src/aiAssistantCore.js";
import { splitOrders, parseOrderScan } from "../src/orderScanParser.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` :: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };
const has = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${name} ${cond ? "" : extra}`); };
const T = "2026-11-07";
const row = { _id: "A", 상차일: T, 하차일: T, 거래처명: "삼진", 상차지명: "평택항", 하차지명: "이천센터", 화물내용: "기계부품 3파렛트", 청구운임: "250000", 기사운임: "200000", 수수료: "50000", 차량번호: "", 배차상태: "배차중" };

// 값 맞추기
eq("금액 25만", normValue("청구운임", "25만"), 250000);
eq("시간 15:00 → 오후 3시", normValue("상차시간", "15:00"), "오후 3시");
eq("톤수 5t", normValue("차량톤수", "5t"), "5톤");
eq("차종 냉동 윙바디", normValue("차량종류", "냉동 윙바디"), "냉동윙");

// 수정 patch · 되돌리기
{
  const u = buildUpdate(row, [{ field: "화물내용", after: "기계부품 2파렛트" }]);
  eq("patch", u.patch, { 화물내용: "기계부품 2파렛트" });
  eq("undo", u.undo, { 화물내용: "기계부품 3파렛트" });
}
{
  const u = buildUpdate(row, [{ field: "청구운임", after: "30만" }]);
  eq("운임 바꾸면 수수료도", u.patch, { 청구운임: "300000", 수수료: "100000" });
  eq("수수료 되돌리기 값", u.undo, { 청구운임: "250000", 수수료: "50000" });
}
eq("같은 값이면 patch 없음", buildUpdate(row, [{ field: "청구운임", after: 250000 }]).patch, {});
{
  const u = buildUpdate(row, [{ field: "상차일", after: "2026-11-09" }]);
  eq("상차일이 하차일보다 늦어지면 하차일도", [u.patch.하차일, u.diff.some((d) => d.auto)], ["2026-11-09", true]);
}
{
  const u = buildUpdate(row, [{ field: "차량번호", after: "경기81바1037" }, { field: "이름", after: "박민준" }]);
  has("배정 되돌리기에 배차상태·기사 칸", u.undo.배차상태 === "배차중" && u.undo.전화번호 === "" && u.undo.이름 === "");
}

// 등록 오더
{
  const r = buildCreateRecord({ 거래처명: "삼진", 상차지명: "평택", 하차지명: "이천", 청구운임: "25만", 기사운임: 200000, 화물내용: "2파레트", 차량톤수: "5t" }, { today: T });
  eq("등록 기본값", [r.상차일, r.하차일, r.청구운임, r.수수료, r.화물타입, r.차량톤수, r.배차상태, Array.isArray(r.경유상차목록)], [T, T, "250000", "50000", "파레트", "5톤", "배차중", true]);
  eq("차량번호 있으면 배차완료", buildCreateRecord({ 상차지명: "a", 하차지명: "b", 차량번호: "경기81바1037" }, { today: T }).배차상태, "배차완료");
  eq("하차일이 빠르면 상차일로", buildCreateRecord({ 상차지명: "a", 하차지명: "b", 상차일: "2026-11-09", 하차일: "2026-11-08" }).하차일, "2026-11-09");
  eq("필수 칸 확인", missingOf({ 상차지명: "a" }), ["하차지", "거래처명"]);
}

// 서버 없이 수정 알아듣기
eq("3파레트를 2파레트로(표기 달라도)", localEditProposal("3파레트를 2파레트로", row), [{ field: "화물내용", after: "기계부품 2파렛트" }]);
eq("운임 25만", localEditProposal("운임 25만", row), [{ field: "청구운임", after: "25만" }]);
eq("상차지를 부산신항으로 바꿔줘", localEditProposal("상차지를 부산신항으로 바꿔줘", row), [{ field: "상차지명", after: "부산신항" }]);
eq("기사운임 20만으로 변경", localEditProposal("기사운임 20만으로 변경", row), [{ field: "기사운임", after: "20만" }]);
eq("모르는 말", localEditProposal("안녕하세요", row), null);

// 말 알아듣기
eq("오더수정 해야해", intentOf("오더수정 해야해"), "pick_edit");
eq("오더 수정", intentOf("오더 수정"), "pick_edit");
eq("수정할게", intentOf("수정할게"), "pick_edit");
eq("오더 삭제", intentOf("오더 삭제"), "pick_delete");
eq("구체적 수정은 바로 AI로", intentOf("삼진 오더 운임 수정해줘 25만"), null);

// 기본 답변
{
  const ds = [row, { ...row, _id: "B", 차량번호: "경기80바1000", 청구운임: 300000, 기사운임: 250000 }, { ...row, _id: "C", 상차일: "2026-10-01" }];
  has("미배차", /미배차 1건/.test(localAnswer("미배차 몇 건?", { dispatches: ds, today: T })));
  has("오늘 현황", /오더 2건/.test(localAnswer("오늘 배차 현황", { dispatches: ds, today: T })));
  has("이번 달 매출", /550,000원/.test(localAnswer("이번 달 매출", { dispatches: ds, today: T })));
  has("부가세", /부가세 25,000원/.test(localAnswer("250000 부가세 계산", { dispatches: ds, today: T })));
  eq("모르면 null", localAnswer("우주 날씨", { dispatches: ds, today: T }), null);
}

// 오더 고르기
{
  const ds = [{ ...row, _id: "2", 상차시간: "오후 3시" }, { ...row, _id: "1", 상차시간: "오전 9시", 차량번호: "x" }, { ...row, _id: "3", 상차일: "2026-11-08" }, { ...row, _id: "4", 배차상태: "배차취소" }];
  eq("오늘(취소 빼고, 시간순)", pickerRows(ds, { range: "today" }, T).map((r) => r._id).sort(), ["1", "2"]);
  eq("내일", pickerRows(ds, { range: "tomorrow" }, T).map((r) => r._id), ["3"]);
  eq("미배차", pickerRows(ds, { range: "today", unassigned: true }, T).map((r) => r._id), ["2"]);
  eq("거래처 검색", pickerRows(ds, { range: "week", client: "없는" }, T).length, 0);
}

// 카카오톡 내보내기
{
  const pc = "--------------- 2026년 11월 7일 토요일 ---------------\n[김화주] [오후 2:13] 상차지 평택항 경기 평택시 포승읍 평택항만길 73\n하차지 이천센터 경기 이천시 마장면 서이천로 578\n5톤 윙 2파레트 25만\n[김화주] [오후 2:20] 감사합니다\n[김화주] [오후 3:01] 상차 부산신항 부산 강서구 신항남로 200\n하차 대전 대전 유성구 테크노2로 187\n11톤 카고 40만";
  const k = parseKakao(pc);
  eq("PC 내보내기: 메시지 3개", [k.isKakao, k.messages.length, k.messages[0].sender], [true, 3, "김화주"]);
  const blocks = splitPasted(pc, splitOrders);
  eq("오더 메시지 2개 → 2건(인사 메시지는 빠짐)", blocks.length, 2);
  has("머리줄([이름] [시간]) 제거", !/\[김화주\]/.test(blocks[0]));
  const mob = "2026. 11. 7. 오후 2:13, 김화주 : 상차: 평택항 경기 평택시 포승읍 평택항만길 73\n하차: 이천센터 경기 이천시 마장면 서이천로 578\n5톤 윙 25만";
  eq("모바일 내보내기", parseKakao(mob).messages[0].sender, "김화주");
  eq("카톡 아닌 글은 그대로 나누기", splitPasted("상차: 평택항 경기 평택시 포승읍 평택항만길 73\n하차: 이천 경기 이천시 마장면 서이천로 578", splitOrders).length, 1);
}

// 스캔 결과 → 등록 칸
{
  const txt = "상차지: 평택항 경기 평택시 포승읍 평택항만길 73\n하차지: 이천센터 경기 이천시 마장면 서이천로 578\n5톤 윙바디 3파레트\n운임 25만 계산서";
  has("오더 글로 보임", looksLikeOrderText(txt));
  const r = parseOrderScan(txt, { today: new Date(2026, 10, 7) });
  const vals = {}; Object.entries(r.fields).forEach(([k, f]) => { vals[k] = f.value; });
  const f = scanValsToFields(vals, r);
  eq("스캔 → 등록 칸", [f.상차지명, f.하차지명, f.청구운임, f.화물내용, f.화물타입, f.차량톤수, f.하차일], ["평택항", "이천센터", "250000", "3파레트", "파레트", "5톤", undefined]);
}

// 마크다운 · 기록
eq("굵게", mdInline("매출 **1,000원** 입니다"), [{ t: "text", v: "매출 " }, { t: "b", v: "1,000원" }, { t: "text", v: " 입니다" }]);
eq("표", mdBlocks("| 거래처 | 매출 |\n|---|---|\n| 삼진 | 10 |")[0], { t: "table", head: ["거래처", "매출"], rows: [["삼진", "10"]] });
eq("목록", mdBlocks("- a\n1. b").map((b) => b.t), ["li", "oli"]);
{
  const s = serializeChat({ messages: [{ id: 1, kind: "picker", busy: true }, { id: 2, kind: "text", content: "x" }], history: [{ role: "user", content: "x" }] });
  const back = deserializeChat(s);
  eq("기록 저장 · 고르기 목록은 안내로", back.messages.map((m) => m.kind), ["note", "text"]);
  eq("서버 기록도", back.history.length, 1);
  eq("깨진 기록", deserializeChat("{"), null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
