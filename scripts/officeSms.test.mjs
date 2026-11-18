// 💬 2026-11-18 사내문자(업무폰 문자 연결) — 화면 계산 함수 검사(인터넷 · 에뮬레이터 없이)
//  실행: node scripts/officeSms.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { normPeer, fmtPhone, phoneState, buildNameBook, groupThreads, threadMessages, statusText, filterThreads, smsBytesOf, parseRecipients, suggestRecipients, isSendablePeer, OFFICE_SMS_STALE_MS, OFFICE_SMS_QUEUE_LIMIT_MS } from "../src/officeSms/officeSmsCore.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`PASS ${name}`); };

t("번호 정리 — +82 · 하이픈 · 공백", () => {
  assert.equal(normPeer("+82 10-1234-5678"), "01012345678");
  assert.equal(normPeer("010-1234-5678"), "01012345678");
  assert.equal(normPeer("821012345678"), "01012345678");
  assert.equal(normPeer("1588-1234"), "15881234");
  assert.equal(normPeer(""), "");
  assert.equal(normPeer(null), "");
});

t("번호 보기 좋게", () => {
  assert.equal(fmtPhone("01012345678"), "010-1234-5678");
  assert.equal(fmtPhone("0212345678"), "02-1234-5678");
  assert.equal(fmtPhone("15881234"), "1588-1234");
});

t("업무폰 상태 — 없음 · 끊김 · 연결 · 권한", () => {
  const now = 1_800_000_000_000;
  assert.equal(phoneState(null, now).state, "none");
  assert.equal(phoneState({ linked: false, serviceAt: now }, now).state, "none");
  assert.equal(phoneState({ linked: true }, now).state, "off");
  assert.equal(phoneState({ linked: true, serviceAt: now - OFFICE_SMS_STALE_MS - 1 }, now).state, "off");
  assert.equal(phoneState({ linked: true, serviceAt: { toMillis: () => now - 1000 } }, now).state, "on");
  assert.equal(phoneState({ linked: true, serviceAt: { seconds: (now - 1000) / 1000 } }, now).state, "on");
  assert.equal(phoneState({ linked: true, serviceAt: now, perm: { send: false } }, now).state, "auth");
});

const msgs = [
  { id: "a", peer: "010-1111-2222", dir: "out", body: "상차지 알려드려요", at: 1000, status: "sent", read: true },
  { id: "b", peer: "+821011112222", dir: "in", body: "네 확인했습니다", at: 2000 },
  { id: "c", peer: "01033334444", dir: "in", body: "도착", at: 1500, read: true },
  { id: "d", peer: "01011112222", dir: "in", body: "출발해요", at: 3000, read: false },
  { id: "e", peer: "", dir: "in", body: "번호 없음", at: 9000 },
];

t("대화방 묶기 — 같은 번호 합치기 · 최근 순 · 안 읽은 수 · 이름", () => {
  const book = buildNameBook([{ name: "홍길동", phone: "010-1111-2222" }, { name: "", phone: "01099998888" }]);
  assert.deepEqual(book, { "01011112222": "홍길동" });
  const th = groupThreads(msgs, book);
  assert.equal(th.length, 2);
  assert.equal(th[0].peer, "01011112222");
  assert.equal(th[0].name, "홍길동");
  assert.equal(th[0].unread, 2); // read 없음 · false 모두 안 읽음
  assert.equal(th[0].count, 3);
  assert.equal(th[0].last.id, "d");
  assert.equal(th[1].unread, 0);
});

t("대화 순서 — 오래된 것부터", () => {
  assert.deepEqual(threadMessages(msgs, "01011112222").map((m) => m.id), ["a", "b", "d"]);
});

t("보낸 문자 상태 — 30분 넘은 대기는 업무폰 꺼짐", () => {
  const now = 10_000_000;
  assert.equal(statusText({ dir: "out", status: "queued", at: now - 1000 }, now), "대기");
  assert.equal(statusText({ dir: "out", status: "queued", at: now - OFFICE_SMS_QUEUE_LIMIT_MS - 1 }, now), "업무폰 꺼짐");
  assert.equal(statusText({ dir: "out", status: "sent", at: now }, now), "보냄");
  assert.equal(statusText({ dir: "in", status: "received", at: now }, now), "");
});

t("검색 — 이름 · 번호 · 내용", () => {
  const th = groupThreads(msgs, { "01011112222": "홍길동" });
  assert.equal(filterThreads(th, "홍").length, 1);
  assert.equal(filterThreads(th, "3333").length, 1);
  assert.equal(filterThreads(th, "출발").length, 1);
  assert.equal(filterThreads(th, "").length, 2);
});

t("바이트 — 한글 2", () => { assert.equal(smsBytesOf("가a"), 3); });

t("휴대폰 앱과 같은 기준(30분 · 번호 규칙)", () => {
  const java = fs.readFileSync(new URL("../android/app/src/main/java/com/kpflow/driver/KpSmsService.java", import.meta.url), "utf8");
  assert.match(java, /STALE_QUEUED_MS = 30 \* 60000/);
  assert.equal(OFFICE_SMS_QUEUE_LIMIT_MS, 30 * 60000);
  assert.match(java, /d\.startsWith\("82"\) && d\.length\(\) >= 11/);
});

t("보안 규칙 — smsBox는 본인만 · 공용 규칙에서 빠짐", () => {
  const rules = fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /match \/smsBox\/\{uid\} \{\s*allow read, write: if isSignedIn\(\) && request\.auth\.uid == uid;\s*match \/msgs\/\{mid\} \{\s*allow read, write: if isSignedIn\(\) && request\.auth\.uid == uid;/);
  const ex = rules.slice(rules.indexOf("function catchAllExcluded"));
  assert.match(ex, /'smsBox'/);
});

t("받는사람 — 등록 안 된 번호(일반 용차)도 번호만 적으면 보냄", () => {
  const book = { "01011112222": "홍길동", "01044445555": "김철수", "01066667777": "김철수" };
  const r = parseRecipients("010-9999-8888, 홍길동; 이영희 010 1234 5678\n김철수, 12345, 010-9999-8888", book);
  assert.deepEqual(r.ok.map((x) => x.phone), ["01099998888", "01011112222", "01012345678"]);
  assert.equal(r.ok[1].name, "홍길동");
  assert.equal(r.ok[2].name, "이영희");
  assert.deepEqual(r.bad, ["김철수", "12345"]); // 같은 이름 둘 · 잘못된 번호
  assert.ok(isSendablePeer("0212345678") && isSendablePeer("15881234") && !isSendablePeer("0101234"));
});

t("받는사람 추천 — 이름 · 번호 일부", () => {
  const book = { "01011112222": "홍길동" };
  const th = [{ peer: "01099998888", name: "" }];
  assert.deepEqual(suggestRecipients("010-1, 홍", book, th).map((x) => x.phone), ["01011112222"]);
  assert.deepEqual(suggestRecipients("9998", book, th).map((x) => x.phone), ["01099998888"]);
  assert.deepEqual(suggestRecipients("", book, th), []);
});

console.log(`\n${n}개 통과`);
