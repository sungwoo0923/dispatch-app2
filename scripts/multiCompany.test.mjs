// 여러 회사 오가기(태진 · 큐런 대표 등) 계산 테스트 — node scripts/multiCompany.test.mjs
//  서버(functions/multiCompany.js)와 화면(src/multiCompany.js)이 같은 답을 내는지 같이 본다
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as W from "../src/multiCompany.js";
const S = createRequire(import.meta.url)("../functions/multiCompany.js");

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n += 1; };
const both = (fn, u, want, m) => { eq(S[fn](u), want, `서버 ${m}`); eq(W[fn](u), want, `화면 ${m}`); };

const ceo = { companyName: "태진", role: "admin", isMaster: true, position: "대표", team: "경리팀", approved: true, multiCompanies: ["큐런", "태진", " 큐런 ", ""], activeCompany: "큐런" };
both("multiCompaniesOf", ceo, ["큐런"], "목록 — 원래 회사 · 빈 칸 · 중복 빼기");
both("activeCompanyOf", ceo, "큐런", "지금 회사 = 큐런");
both("activeCompanyOf", { ...ceo, activeCompany: "" }, "태진", "비우면 원래 회사");
both("activeCompanyOf", { ...ceo, activeCompany: "남의회사" }, "태진", "목록 밖 회사는 원래 회사");
both("activeCompanyOf", { ...ceo, role: "driver" }, "태진", "기사는 오가기 없음");
both("activeCompanyOf", { ...ceo, approved: false }, "태진", "미승인은 오가기 없음");
both("activeCompanyOf", { ...ceo, employmentStatus: "퇴사" }, "태진", "퇴사는 오가기 없음");
both("activeCompanyOf", { ...ceo, role: "totalMaster" }, "태진", "최고관리자는 원래 운송사 전환을 쓴다");
const e = S.effectiveUser(ceo);
eq([e.companyName, e.role, e.isMaster, e.team, e.position, e.homeCompany, e.guestCompany], ["큐런", "allMgr", false, "", "대표", "태진", true], "다른 회사 = 통합관리자 · 마스터/부서는 원래 회사 것");
eq(W.effectiveUser(ceo), e, "화면도 같은 값");
const home = { ...ceo, activeCompany: "태진" };
eq(S.effectiveUser(home), home, "원래 회사면 받은 값 그대로");
eq(S.effectiveUser({ role: "user" }), { role: "user" }, "회사 없는 옛 문서도 그대로(토큰 계산이 문서로 넘긴다)");
eq(W.multiStateOf("u1", ceo), { uid: "u1", home: "태진", list: ["큐런"], active: "큐런", guest: true }, "화면 상태");
eq(W.multiStateOf("u1", { companyName: "태진", role: "user" }), { uid: "u1", home: "태진", list: [], active: "태진", guest: false }, "일반 계정 화면 상태");
eq([W.toneOf("태진", W.multiStateOf("u1", ceo)).key, W.toneOf("큐런", W.multiStateOf("u1", ceo)).key], ["navy", "emerald"], "회사마다 다른 색");
console.log(`multiCompany OK (${n})`);
