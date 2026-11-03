process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const admin = require("firebase-admin"); admin.initializeApp({ projectId: "demo-kpflow" });
const db = admin.firestore(), auth = admin.auth();
const CO = "한결로지스";
const U = {}; for (const [e, n, p, t] of [["kim", "김도윤", "팀장", "배차팀"], ["lee", "이서연", "대리", "배차팀"], ["park", "박지훈", "주임", "배차팀"], ["jung", "정하늘", "사원", "배차팀"], ["choi", "최영민", "이사", "경영지원"], ["ceo", "정대현", "대표이사", "임원"]]) U[e] = { uid: (await auth.getUserByEmail(`${e}@hangyeol.demo`)).uid, name: n, position: p, team: t };
await db.doc(`companySettings/${CO}`).set({ revenuePassword: "1234", companyName: CO }, { merge: true });
const T = (h) => admin.firestore.Timestamp.fromDate(new Date(Date.now() - h * 3600e3));
const st = (u, kind, status, h, comment = "") => ({ uid: u.uid, name: u.name, position: u.position, team: u.team, kind, status, at: status === "approved" || status === "rejected" ? Date.now() - h * 3600e3 : 0, comment, ...(status === "pending" && h ? { viewedAt: Date.now() - 600e3 } : {}) });
const docs = [
  { form: "rate", cat: "draft", formLabel: "운임·단가 변경 품의", code: "DR", drafter: U.lee, title: "대성식품 인천→평택 11톤 운임 변경",
    data: { client: "대성식품", route: "인천 서구 오류동 → 평택 포승", car: "11톤", oldFare: 580000, newFare: 620000, oldPay: 520000, newPay: 540000, effective: "2026-11-04", reason: "유가 상승(경유 평균 1,612원 → 1,698원) 및 상차 대기시간 증가로 운임 조정이 필요합니다. 거래처 물류팀과 구두 협의 완료." },
    summary: "대성식품 인천 서구 오류동 → 평택 포승 580,000 → 620,000", amount: 620000,
    line: [st(U.kim, "결재", "pending", 0.2), st(U.choi, "결재", "wait"), st(U.ceo, "결재", "wait")], cc: [U.park], status: "pending", step: 0, h: 1.5 },
  { form: "fuel", cat: "expense", formLabel: "유류비·통행료 정산", code: "EF", drafter: U.park, title: "10월 유류비·통행료 정산", data: { amount: 486000, period: "2026-10", memo: "영업 차량 유류비 및 고속도로 통행료" }, summary: "10월 영업차량 유류비·통행료 486,000원", amount: 486000,
    line: [st(U.kim, "결재", "pending", 0), st(U.choi, "결재", "wait")], cc: [], status: "pending", step: 0, h: 3 },
  { form: "accident", cat: "expense", formLabel: "운송 사고·파손 처리", code: "EA", drafter: U.jung, title: "그린팜유통 하차 중 파레트 파손 처리", data: { memo: "대구 성서 하차 중 파레트 1개 파손 — 화주 보상 협의" }, summary: "그린팜유통 파레트 1P 파손 · 보상 120,000원", amount: 120000,
    line: [st(U.kim, "결재", "pending", 0), st(U.choi, "합의", "wait"), st(U.ceo, "결재", "wait")], cc: [U.lee], status: "pending", step: 0, h: 5 },
  { form: "annual", cat: "leave", formLabel: "연차휴가", code: "HL", drafter: U.jung, title: "연차휴가 신청 (11/14)", data: { from: "2026-11-14", to: "2026-11-14", reason: "개인 사유" }, summary: "11/14(금) 1일", days: 1,
    line: [st(U.kim, "결재", "approved", 20, "확인했습니다.")], cc: [], status: "approved", step: 1, h: 26 },
  { form: "client", cat: "draft", formLabel: "신규 거래처 등록 품의", code: "DC", drafter: U.kim, title: "신규 거래처 등록 — 누리가구", data: {}, summary: "누리가구 · 월 예상 40건", amount: 0,
    line: [st(U.choi, "결재", "approved", 30, "진행하세요."), st(U.ceo, "결재", "approved", 28, "승인")], cc: [], status: "approved", step: 2, h: 40 },
  { form: "vehicle", cat: "draft", formLabel: "차량 정비·수리 요청", code: "DV", drafter: U.lee, title: "충남91자5560 브레이크 패드 교체", data: {}, summary: "25톤 카고 · 예상 680,000원", amount: 680000,
    line: [st(U.kim, "결재", "approved", 50, ""), st(U.choi, "결재", "rejected", 46, "견적 2곳 비교 후 재상신 바랍니다.")], cc: [], status: "rejected", step: 1, h: 52 },
  { form: "daily", cat: "report", formLabel: "일일 업무일지", code: "RD", drafter: U.park, title: "11/03 일일 업무일지", data: {}, summary: "배차 42건 · 미배차 0", amount: 0,
    line: [st(U.kim, "결재", "approved", 1, "")], cc: [], status: "approved", step: 1, h: 2 },
];
for (const [i, d] of docs.entries()) {
  const line = d.line;
  await db.doc(`approvals/demo-a${i}`).set({
    company: CO, companyName: CO, docNo: `${d.code}-20261103-${(1000 + i * 77).toString(36).toUpperCase()}`, cat: d.cat, form: d.form, formLabel: d.formLabel, title: d.title,
    summary: d.summary, amount: d.amount || 0, days: d.days || 0, data: d.data, images: [], drafterUid: d.drafter.uid, drafter: d.drafter, line,
    cc: d.cc, ccUids: d.cc.map((c) => c.uid), participants: [...new Set([d.drafter.uid, ...line.map((s) => s.uid), ...d.cc.map((c) => c.uid)])],
    step: d.step, status: d.status, createdAt: T(d.h), updatedAt: T(d.h / 2),
    history: [{ at: Date.now() - d.h * 3600e3, uid: d.drafter.uid, name: d.drafter.name, action: "상신", comment: "" }, ...line.filter((s) => s.at).map((s) => ({ at: s.at, uid: s.uid, name: s.name, action: s.status === "approved" ? "승인" : "반려", comment: s.comment }))],
    redraftOf: null,
  });
}
console.log("ok", docs.length); process.exit(0);
