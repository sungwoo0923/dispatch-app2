// 이상 접속 판정 단위 테스트 — node scripts/security.test.mjs
import { evaluateLogin, evaluateDownload, clientNet, DL_LIMIT } from "../functions/securityCore.mjs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗", m); } };
const types = (r) => r.events.map((e) => e.type);
const at = (h) => Date.UTC(2026, 10, 10, h - 9, 0); // KST h시
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0";

// 첫 기기는 새 기기로 안 봄
let r = evaluateLogin({}, { deviceId: "A", ua: UA, country: "KR", now: at(10) });
ok(r.events.length === 0, "첫 기기·한국·낮 → 알림 없음");
// 같은 기기 다시
r = evaluateLogin(r.profile, { deviceId: "A", ua: UA, country: "KR", now: at(11) });
ok(r.events.length === 0, "같은 기기 → 알림 없음");
// 새 기기
r = evaluateLogin(r.profile, { deviceId: "B", ua: "iPhone Safari/604.1", country: "KR", now: at(12) });
ok(types(r).join() === "new_device", "두 번째 기기 → 새 기기");
ok(r.events[0].level === "medium", "새 기기 위험도 보통");
// 해외
r = evaluateLogin(r.profile, { deviceId: "B", ua: UA, country: "CN", now: at(13) });
ok(types(r).includes("foreign_ip") && r.events.find((e) => e.type === "foreign_ip").level === "high", "해외(CN) → 높음");
ok(evaluateLogin(r.profile, { deviceId: "B", country: "", now: at(13) }).events.length === 0, "국가 모름 → 해외로 안 봄");
ok(evaluateLogin(r.profile, { deviceId: "B", country: "ZZ", now: at(13) }).events.length === 0, "ZZ(알 수 없음) → 해외로 안 봄");
// 새벽(하루 1번)
let n1 = evaluateLogin(r.profile, { deviceId: "B", country: "KR", now: at(3) });
ok(types(n1).includes("night_login"), "새벽 3시 → 새벽 접속");
ok(!types(evaluateLogin(n1.profile, { deviceId: "B", country: "KR", now: at(4) })).includes("night_login"), "같은 날 새벽 두 번째 → 알림 없음");
ok(!types(evaluateLogin(r.profile, { deviceId: "B", country: "KR", now: at(3), role: "driver" })).includes("night_login"), "기사 계정 새벽 → 제외");
ok(!types(evaluateLogin(r.profile, { deviceId: "B", country: "KR", now: at(5) })).includes("night_login"), "05시 → 새벽 아님");

// 대량 다운로드
let p = {}; let got = 0; const base = at(14);
for (let i = 0; i < DL_LIMIT; i++) { const x = evaluateDownload(p, { now: base + i * 60e3, name: "배차현황.xlsx" }); p = x.profile; got += x.events.length; }
ok(got === 1, `10분 안 ${DL_LIMIT}번 → 1건`);
let more = evaluateDownload(p, { now: base + 6 * 60e3 }); ok(more.events.length === 0, "30분 안 추가 → 다시 알리지 않음");
let later = { ...more.profile }; for (let i = 0; i < DL_LIMIT; i++) { const x = evaluateDownload(later, { now: base + 40 * 60e3 + i * 1000 }); later = x.profile; if (i === DL_LIMIT - 1) ok(x.events.length === 1, "30분 지나 다시 5번 → 다시 1건"); }
let slow = {}; let gs = 0; for (let i = 0; i < 8; i++) { const x = evaluateDownload(slow, { now: base + i * 11 * 60e3 }); slow = x.profile; gs += x.events.length; }
ok(gs === 0, "11분 간격 다운로드 → 알림 없음");

// 헤더
const net = clientNet({ "x-forwarded-for": "1.2.3.4, 10.0.0.1", "x-appengine-country": "kr" });
ok(net.ip === "1.2.3.4" && net.country === "KR", "IP·국가 헤더 읽기");
ok(clientNet({ "x-appengine-country": "ZZ" }).country === "", "ZZ → 빈 국가");
ok(evaluateLogin({}, { deviceId: "", country: "KR", now: at(10) }).profile.devices.length === 0, "기기 번호 없으면 기기 등록 안 함");

console.log(`보안 판정 단위 테스트: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
