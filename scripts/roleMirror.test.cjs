// 🔒 2026-11-23 역할별 오더 사본(functions/roleMirror.js) — 기사 사본에 청구 · 수수료가, 화주 사본에 기사운임 · 수수료가 없는지
//  실행: node scripts/roleMirror.test.cjs
const M = require(require("path").resolve(__dirname, "../functions/roleMirror.js"));
const o = { 상차일: "2026-11-23", 상차지명: "A", 청구운임: 300000, 기사운임: 250000, 수수료: 50000, 이익: 1, 지급방식: "계산서", 메모: "내부", 작성자: "x@y", createdByUid: "u1", 구간운임: [{ 구간: "1", 기사: 100, 청구: 150 }], 경유지_상차: [{ 이름: "s", 청구운임: 1, 기사운임: 2 }], shipperCompany: "삼성", shipperUid: "s1", 청구사업자: "B", 계산서일: "x", 기사확인상태: "대기", 업로드토큰: "t", 할증: 1, 차량번호: "11가1111" };
const d = M.driverView(o), s = M.shipperView(o);
console.log("driver", JSON.stringify(d));
console.log("shipper", JSON.stringify(s));
const keys = (v, acc = []) => { if (v && typeof v === "object") for (const k of Object.keys(v)) { acc.push(k); keys(v[k], acc); } return acc; };
const bad = (v, re) => keys(v).find((k) => re.test(k));
if (bad(d, /청구|수수료|이익|업로드토큰|할증|계산서|shipperUid/)) throw new Error("driver leak");
if (!d.기사운임 || d.구간운임[0].기사 !== 100) throw new Error("driver missing");
if (bad(s, /기사운임|수수료|이익|^기사$|메모|작성자|createdByUid|업로드토큰/)) throw new Error("shipper leak");
if (!s.청구운임) throw new Error("shipper missing");
console.log("ok");
