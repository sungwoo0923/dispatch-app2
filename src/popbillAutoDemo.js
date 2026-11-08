// ======================= src/popbillAutoDemo.js =======================
// 🧪 개발 전용(둘러보기 demo=1) — 알림톡 · 은행 입금 화면 점검용 메모리 저장소. 배포 빌드에서는 src/popbillAuto.js의 DEV 분기가 빠져 포함되지 않는다.
//  팝빌은 "연결 전" 상태로 둔다(실제 팝빌 호출 없음).
const CLIENTS = ["(주)한빛물류센터", "대한통운 평택허브", "삼성전자 기흥캠퍼스 자재팀", "LG디스플레이 파주", "CJ대한통운"];
const ymd = (off) => new Date(Date.now() + 9 * 3600e3 + off * 864e5).toISOString().slice(0, 10);
const store = {
  settings: {
    companyName: "테스트운송",
    alimtalk: { enabled: true, toClient: true, toDriver: true, templates: { client: "", driver: "" }, senderNumber: "", contactPhone: "02-1234-5678", smsFallback: true },
    bankAccounts: [{ id: "acc1", bankCode: "0003", bankName: "기업은행", accountNumber: "12345678901234", holder: "(주)테스트운송", enabled: true }],
  },
  state: { status: "off", reason: "팝빌 연결 전이에요", checkedAt: Date.now() - 25 * 60e3, accounts: {} },
  txns: [
    { id: "d1", companyName: "테스트운송", bankName: "기업은행", account: "******1234", date: ymd(0), time: "09:12", amount: 1650000, name: "한빛물류", status: "auto", match: { client: CLIENTS[0], kind: "정산완료", confidence: "이름일치", alloc: [{ yyyymm: ymd(-30).slice(0, 7), amount: 1650000, full: true }] }, decidedAt: Date.now() - 50 * 60e3 },
    { id: "d2", companyName: "테스트운송", bankName: "기업은행", account: "******1234", date: ymd(0), time: "10:41", amount: 880000, name: "김민수", status: "review", reason: "맞는 거래처·금액 없음", suggestions: [{ client: CLIENTS[2], reason: "남은 미수금이 있어요", score: 0.4 }, { client: CLIENTS[3], reason: "남은 미수금이 있어요", score: 0.3 }] },
    { id: "d3", companyName: "테스트운송", bankName: "기업은행", account: "******1234", date: ymd(-1), time: "16:05", amount: 2200000, name: "CJ대한통운(주)", status: "review", reason: "정산+일부입금", suggestions: [{ client: CLIENTS[4], reason: "이름일치 · 정산+일부입금", score: 2 }, { client: CLIENTS[1], reason: "입금자명이 비슷해요", score: 0.6 }], match: { client: CLIENTS[4], kind: "정산+일부입금", confidence: "이름일치" } },
  ],
  aliases: {},
};
const subs = { settings: new Set(), state: new Set(), txns: new Set() };
const emit = (k) => subs[k].forEach((f) => f(k === "txns" ? store.txns.filter((t) => ["review", "auto", "new"].includes(t.status)) : JSON.parse(JSON.stringify(store[k]))));
export function demoSubscribe(k, cb) { subs[k].add(cb); setTimeout(() => emit(k), 0); return () => subs[k].delete(cb); }
export async function demoSaveSettings(patch) {
  store.settings = { ...store.settings, ...patch, alimtalk: { ...store.settings.alimtalk, ...(patch.alimtalk || {}) }, ...(patch.bankAccounts ? { bankAccounts: patch.bankAccounts } : {}) };
  emit("settings");
}
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
export async function demoBank(action, data = {}) {
  await wait();
  if (action === "status") return { company: "테스트운송", popbill: { enabled: false, reason: "no-key" }, member: { status: "신청중", hasCorp: true }, state: store.state };
  if (action === "syncNow") { store.state = { ...store.state, checkedAt: Date.now() }; emit("state"); return { off: true, reason: "팝빌 연결 전이에요" }; }
  const t = store.txns.find((x) => x.id === data.id);
  if (!t) throw Object.assign(new Error("입금 내역을 찾지 못했어요"), { code: "not-found" });
  if (action === "ignore") t.status = "ignored";
  if (action === "undo") { t.status = "review"; t.reason = "되돌린 입금이에요"; t.suggestions = [{ client: t.match?.client, reason: "되돌리기 전 거래처", score: 2 }]; }
  if (action === "confirm") { t.status = "confirmed"; t.match = { ...(t.match || {}), client: data.client || t.suggestions?.[0]?.client }; store.aliases[t.name] = t.match.client; }
  emit("txns");
  return { id: t.id, status: t.status, client: t.match?.client, kind: "정산완료", learned: action === "confirm" };
}
export async function demoAlimtalkSend(row) {
  await wait(400);
  return { status: "off", at: Date.now(), plate: row?.차량번호 || "", items: { client: { status: "off", error: "팝빌 연결 전이에요" }, driver: { status: "off", error: "팝빌 연결 전이에요" } } };
}
