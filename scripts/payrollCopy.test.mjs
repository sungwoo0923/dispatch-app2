// ⭐ 2026-11-17 직원 급여 설정 복사 · 템플릿 — node scripts/payrollCopy.test.mjs
import assert from "node:assert/strict";
import { copyPatch, diffEmp, fieldText, filterTargets, upsertTemplate, removeTemplate, groupFields, COPY_DEFAULT, TEMPLATE_MAX } from "../src/payrollCopy.js";

const src = {
  payType: "monthly", employmentType: "정규직", baseMonthly: 3200000, meal: 200000, car: 0, positionAllow: 100000, mealOrdinary: false,
  allowances: [{ label: "자격수당", amount: 50000, taxable: true, ordinary: true }],
  dependents: 3, children: 1, taxRatePct: 100, taxFixed: "", npExempt: false, hiExempt: false, eiExempt: true, npBase: "", hiBase: "",
  birthDate: "1990-01-01", payAccount: { bank: "국민", acct: "123", holder: "김소현" }, memo: "개인 메모", contractFiles: [{ url: "x" }],
};

// 고른 묶음만 · 개인 칸은 절대 안 감
const p = copyPatch(src, COPY_DEFAULT);
assert.equal(p.baseMonthly, 3200000);
assert.equal(p.meal, 200000);
assert.equal(p.eiExempt, true);
assert.ok(!("dependents" in p), "소득세(부양가족)는 기본으로 안 감");
for (const k of ["birthDate", "payAccount", "memo", "contractFiles"]) assert.ok(!(k in p), `${k} 복사 금지`);
assert.notEqual(p.allowances, src.allowances, "수당 줄은 새 배열");
assert.notEqual(p.allowances[0], src.allowances[0], "수당 줄 칸도 새 객체");
assert.ok("dependents" in copyPatch(src, ["tax"]));
assert.deepEqual(copyPatch(src, []), {});
assert.deepEqual(copyPatch(null, COPY_DEFAULT), {});
assert.ok(groupFields(["pay"]).includes("hourlyWage"));

// 바뀌는 칸
const tgt = { payType: "monthly", baseMonthly: 3000000, meal: 200000, allowances: [], eiExempt: false, npBase: 0 };
const d = diffEmp(tgt, p);
const keys = d.map((x) => x.key);
assert.ok(keys.includes("baseMonthly") && keys.includes("allowances") && keys.includes("eiExempt"));
assert.ok(!keys.includes("meal"), "같은 값은 빼기");
assert.ok(!keys.includes("npBase"), "빈 칸(자동)과 0은 같게");
assert.ok(!keys.includes("payType"));
const b = d.find((x) => x.key === "baseMonthly");
assert.equal(b.from, "3,000,000"); assert.equal(b.to, "3,200,000"); assert.equal(b.label, "월 기본급");
assert.equal(d.find((x) => x.key === "eiExempt").to, "제외");
assert.deepEqual(diffEmp({ ...src }, copyPatch(src, COPY_DEFAULT)), [], "똑같으면 바뀌는 칸 없음");
assert.equal(diffEmp(undefined, { baseMonthly: 1 }).length, 1, "설정 없는 직원");

// 글
assert.equal(fieldText("payType", "hourly"), "시급제");
assert.equal(fieldText("dependents", 3), "2명");
assert.equal(fieldText("taxFixed", ""), "자동");
assert.equal(fieldText("allowances", []), "없음");

// 대상 고르기
const staff = [{ id: "a", name: "김소현", team: "경리팀", position: "대리" }, { id: "b", name: "사나", team: "운영팀", position: "사원" }, { id: "c", name: "박민수", team: "운영팀", position: "대리" }];
assert.deepEqual(filterTargets(staff, {}, "a").map((u) => u.id), ["b", "c"], "원본 직원 빼기");
assert.deepEqual(filterTargets(staff, { team: "운영팀", position: "대리" }).map((u) => u.id), ["c"]);
assert.deepEqual(filterTargets(staff, { q: "사" }).map((u) => u.id), ["b"]);

// 템플릿
let T = upsertTemplate([], "사무직 기본", p, { at: 1 });
T = upsertTemplate(T, "현장직", { baseMonthly: 1 });
T = upsertTemplate(T, "사무직 기본", { baseMonthly: 2 });
assert.deepEqual(T.map((t) => t.name), ["사무직 기본", "현장직"], "같은 이름은 바꿔 끼움 · 위로");
assert.equal(T[0].data.baseMonthly, 2);
assert.deepEqual(upsertTemplate(T, "  ", {}), T, "이름 없으면 그대로");
assert.deepEqual(removeTemplate(T, "현장직").map((t) => t.name), ["사무직 기본"]);
let many = [];
for (let i = 0; i < TEMPLATE_MAX + 5; i += 1) many = upsertTemplate(many, `t${i}`, {});
assert.equal(many.length, TEMPLATE_MAX);

console.log("payrollCopy: 모두 통과");
