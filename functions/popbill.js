// ======================= functions/popbill.js =======================
// 🧾 2026-11-07 팝빌(Popbill) 연동 어댑터 — 사업자 등록(연동 계약) 전이라 기본은 꺼져 있다.
//  켜지는 조건(셋 다):
//   1) Firebase 비밀값 POPBILL_LINK_ID · POPBILL_SECRET_KEY (firebase functions:secrets:set ...)
//   2) functions/.env 의 POPBILL_ENABLED=true  — 이 값이 있어야 index.js가 함수에 비밀값을 묶는다(없으면 배포가 비밀값을 찾지 않는다)
//   3) Firestore integrationConfig/popbill { enabled: true, isTest: true|false } — 관리센터 › 연동 설정에서 켜고 끈다
//  하나라도 빠지면 모든 함수가 { ok: false, disabled: true, reason }만 돌려주고 팝빌을 부르지 않는다.
//  공식 SDK(npm popbill, 콜백 방식)는 켜졌을 때만 require 한다 — 꺼져 있으면 패키지를 불러오지도 않는다.
//  운송사마다 팝빌 연동회원(사업자번호)이 따로다: companyPopbill/{회사} { corpNum, corpName, ceo, status, userId, memo } (서버만 읽고 씀)
//
//  함수 목록(모두 Promise):
//   issueTaxInvoice(corpNum, invoice, opts)   세금계산서 즉시 발행(registIssue)
//   cancelTaxInvoice(corpNum, mgtKey, memo)   발행 취소(cancelIssue)
//   getTaxInvoiceState(corpNum, mgtKey)        상태(getInfo)
//   sendKakaoAlimtalk(corpNum, msg)            알림톡 1건(sendATS_one) — 실패하면 팝빌이 문자로 대체 발송(altSendType "C")
//   sendSms(corpNum, msg)                      문자 1건(sendSMS)
//   checkBizStatus(corpNum, bNos)              휴폐업조회(checkCorpNums) — 국세청 조회의 대안
//   bankAccountList(corpNum)                   계좌조회 서비스에 등록한 계좌(listBankAccount)
//   bankTransactions(corpNum, q)               거래내역 수집 요청 → 완료 대기 → 조회(requestJob · getJobState · search)
//   hometaxCollect(corpNum, q)                 홈택스 매입 · 매출 세금계산서 수집(requestJob · getJobState · search)
//   checkIsMember(corpNum)                     연동회원 가입 여부

const SERVICES = {
  taxinvoice: "TaxinvoiceService", kakao: "KakaoService", message: "MessageService", closedown: "ClosedownService",
  easyfin: "EasyFinBankService", hometax: "HTTaxinvoiceService",
};
const POPBILL_STATUS = ["미등록", "신청중", "연동됨", "오류"];

const onlyDigits = (v) => String(v ?? "").replace(/[^\d]/g, "");

// 켜져 있는지 · 왜 꺼져 있는지
function popbillState({ linkId, secretKey, config }) {
  if (!linkId || !secretKey) return { enabled: false, reason: "no-key" };
  if (!config || config.enabled !== true) return { enabled: false, reason: "off" };
  return { enabled: true, reason: "" };
}

// 콜백 SDK → Promise
const call = (svc, method, args) => new Promise((resolve, reject) => {
  if (typeof svc?.[method] !== "function") { reject(Object.assign(new Error(`팝빌 SDK에 ${method}가 없어요`), { code: "sdk" })); return; }
  try {
    svc[method](...args, (r) => resolve(r), (e) => reject(Object.assign(new Error(e?.message || String(e)), { code: e?.code ?? "popbill", popbill: true })));
  } catch (e) { reject(e); }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// loadSdk: 테스트에서 가짜 SDK를 넣는다(기본은 require("popbill"))
function createPopbill({ linkId = "", secretKey = "", config = {}, loadSdk = () => require("popbill"), pollMs = 1500, pollMax = 20 } = {}) {
  const st = popbillState({ linkId, secretKey, config });
  let sdk = null;
  const services = {};
  const svc = (name) => {
    if (!sdk) {
      sdk = loadSdk();
      sdk.config({ LinkID: linkId, SecretKey: secretKey, IsTest: config.isTest !== false, IPRestrictOnOff: true, UseStaticIP: false, UseLocalTimeYN: true, defaultErrorHandler: () => {} });
    }
    if (!services[name]) services[name] = sdk[SERVICES[name]]();
    return services[name];
  };
  const guard = (fn) => async (...a) => {
    if (!st.enabled) return { ok: false, disabled: true, reason: st.reason };
    const corp = onlyDigits(a[0]);
    if (corp.length !== 10) return { ok: false, error: "연동회원 사업자번호가 없어요" };
    try { return { ok: true, ...(await fn(corp, ...a.slice(1))) }; } catch (e) { return { ok: false, error: e.message, code: e.code }; }
  };
  const userId = (o) => o?.userId || null;

  // 수집 작업(계좌 · 홈택스) 완료까지 기다리기 — jobState "3"이 완료
  async function waitJob(service, corp, jobId, uid) {
    for (let i = 0; i < pollMax; i++) {
      const s = await call(svc(service), "getJobState", [corp, jobId, uid]);
      if (String(s?.jobState) === "3") {
        if (s.errorCode && Number(s.errorCode) !== 1) throw Object.assign(new Error(s.errorReason || `수집 실패(${s.errorCode})`), { code: s.errorCode });
        return s;
      }
      await sleep(pollMs);
    }
    throw Object.assign(new Error("수집이 아직 끝나지 않았어요. 잠시 뒤 다시 조회해 주세요"), { code: "pending", jobId });
  }

  return {
    enabled: st.enabled,
    reason: st.reason,
    checkIsMember: guard(async (corp) => ({ member: await call(svc("taxinvoice"), "checkIsMember", [corp]) })),
    issueTaxInvoice: guard(async (corp, invoice, opts = {}) => {
      if (!invoice?.invoicerMgtKey) throw Object.assign(new Error("문서번호(invoicerMgtKey)가 없어요"), { code: "arg" });
      const r = await call(svc("taxinvoice"), "registIssue", [corp, { ...invoice, invoicerCorpNum: onlyDigits(invoice.invoicerCorpNum || corp) }, !!opts.writeSpecification, !!opts.forceIssue, opts.memo || "", opts.emailSubject || "", "", userId(opts)]);
      return { ntsConfirmNum: r?.ntsConfirmNum || "", mgtKey: invoice.invoicerMgtKey, raw: r };
    }),
    cancelTaxInvoice: guard(async (corp, mgtKey, memo = "", opts = {}) => ({ raw: await call(svc("taxinvoice"), "cancelIssue", [corp, "SELL", mgtKey, memo, userId(opts)]) })),
    getTaxInvoiceState: guard(async (corp, mgtKey, opts = {}) => {
      const r = await call(svc("taxinvoice"), "getInfo", [corp, "SELL", mgtKey, userId(opts)]);
      return { stateCode: r?.stateCode ?? null, ntsConfirmNum: r?.ntsconfirmNum || r?.ntsConfirmNum || "", raw: r };
    }),
    sendKakaoAlimtalk: guard(async (corp, m = {}) => {
      if (!m.templateCode || !m.receiver) throw Object.assign(new Error("템플릿과 받는 번호가 필요해요"), { code: "arg" });
      const receiptNum = await call(svc("kakao"), "sendATS_one", [corp, m.templateCode, onlyDigits(m.sender), m.content || "", m.altSubject || "", m.altContent || m.content || "", m.altSendType ?? "C", m.reserveDT || "", onlyDigits(m.receiver), m.receiverName || "", m.requestNum || "", m.buttons || null, m.emphasizeTitle || "", userId(m)]);
      return { receiptNum };
    }),
    sendSms: guard(async (corp, m = {}) => {
      if (!m.sender || !m.receiver || !m.content) throw Object.assign(new Error("보내는 번호 · 받는 번호 · 내용이 필요해요"), { code: "arg" });
      const receiptNum = await call(svc("message"), "sendSMS", [corp, onlyDigits(m.sender), onlyDigits(m.receiver), m.receiverName || "", String(m.content).slice(0, 90), m.reserveDT || "", !!m.ads, m.senderName || "", m.requestNum || "", userId(m)]);
      return { receiptNum };
    }),
    checkBizStatus: guard(async (corp, bNos = []) => {
      const list = [...new Set((Array.isArray(bNos) ? bNos : [bNos]).map(onlyDigits).filter((x) => x.length === 10))].slice(0, 1000);
      if (!list.length) throw Object.assign(new Error("조회할 사업자번호가 없어요"), { code: "arg" });
      const r = await call(svc("closedown"), "checkCorpNums", [corp, list, null]);
      // state: 0 미등록 · 1 사업중 · 2 폐업 · 3 휴업
      const MAP = { 0: "unregistered", 1: "active", 2: "closed", 3: "suspended" };
      return { rows: (r || []).map((x) => ({ bNo: onlyDigits(x.corpNum), state: MAP[Number(x.state)] || "unknown", taxType: x.type ?? null, endDt: x.stateDate || "" })) };
    }),
    bankAccountList: guard(async (corp, opts = {}) => ({ accounts: await call(svc("easyfin"), "listBankAccount", [corp, userId(opts)]) })),
    bankTransactions: guard(async (corp, q = {}) => {
      if (!q.bankCode || !q.accountNumber || !q.sDate || !q.eDate) throw Object.assign(new Error("은행 · 계좌 · 기간이 필요해요"), { code: "arg" });
      const jobId = await call(svc("easyfin"), "requestJob", [corp, q.bankCode, onlyDigits(q.accountNumber), q.sDate, q.eDate, userId(q)]);
      await waitJob("easyfin", corp, jobId, userId(q));
      const r = await call(svc("easyfin"), "search", [corp, jobId, q.tradeType || ["I", "O"], q.searchString || "", q.page || 1, q.perPage || 500, q.order || "D", userId(q)]);
      return { jobId, total: r?.total ?? 0, list: r?.list || [] };
    }),
    hometaxCollect: guard(async (corp, q = {}) => {
      // queryType: SELL(매출) · BUY(매입) · TRUSTEE(위수탁) · dType: W 작성일 · I 발행일 · S 전송일
      if (!q.sDate || !q.eDate) throw Object.assign(new Error("기간이 필요해요"), { code: "arg" });
      const jobId = await call(svc("hometax"), "requestJob", [corp, q.queryType || "SELL", q.dType || "W", q.sDate, q.eDate, userId(q)]);
      await waitJob("hometax", corp, jobId, userId(q));
      const r = await call(svc("hometax"), "search", [corp, jobId, q.type || ["N", "M"], q.taxType || ["T", "N", "Z"], q.purposeType || ["R", "C", "N"], "", "", "", q.page || 1, q.perPage || 500, q.order || "D", userId(q), ""]);
      return { jobId, total: r?.total ?? 0, list: r?.list || [] };
    }),
  };
}

// ─────────────── 관리 화면용 호출(popbillAdmin) ───────────────
//  status     (최고관리자) 켜짐 여부 · 설정 · 연동회원 목록
//  setConfig  (최고관리자) integrationConfig/popbill { enabled, isTest }
//  getMember  (그 회사 관리자 · 최고관리자) companyPopbill/{회사}
//  saveMember (그 회사 관리자 · 최고관리자) 사업자번호 · 상호 · 대표 · 담당자 아이디 저장(회사 관리자가 저장하면 "신청중")
//  checkMember(그 회사 관리자 · 최고관리자) 팝빌에 연동회원으로 있는지 확인 → 연동됨/미등록
function bizNoOk(d) {
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let s = 0;
  for (let i = 0; i < 9; i++) s += Number(d[i]) * w[i];
  s += Math.floor((Number(d[8]) * 5) / 10);
  return (10 - (s % 10)) % 10 === Number(d[9]);
}
function makePopbillAdmin({ db, callerOf, getSecrets = () => ({}), loadSdk, now = () => Date.now() }) {
  const cfgRef = () => db.collection("integrationConfig").doc("popbill");
  const memRef = (co) => db.collection("companyPopbill").doc(co);
  const err = (code, msg) => Object.assign(new Error(msg), { code });
  async function adapter() {
    const s = await cfgRef().get().catch(() => null);
    const config = s?.exists ? s.data() || {} : {};
    const { linkId = "", secretKey = "" } = getSecrets() || {};
    return { pb: createPopbill({ linkId, secretKey, config, ...(loadSdk ? { loadSdk } : {}) }), config, hasKeys: !!(linkId && secretKey) };
  }
  const coOf = (who, data) => {
    const co = String((who.isTM ? data?.company : who.co) || "").trim();
    if (!co || co.includes("/")) throw err("invalid-argument", "회사를 골라 주세요");
    if (!who.isTM && !who.isAdmin) throw err("permission-denied", "회사 관리자만 바꿀 수 있어요");
    return co;
  };
  return async function popbillAdmin(data, auth) {
    const who = await callerOf(db, auth);
    if (who.tier !== "staff") throw err("permission-denied", "운송사 직원만 쓸 수 있어요");
    const action = String(data?.action || "");
    if (action === "status" || action === "setConfig") {
      if (!who.isTM) throw err("permission-denied", "최고관리자만 볼 수 있어요");
      if (action === "setConfig") {
        await cfgRef().set({ enabled: data?.enabled === true, isTest: data?.isTest !== false, updatedAt: now(), updatedBy: auth.uid }, { merge: true });
      }
      const { pb, config, hasKeys } = await adapter();
      const list = await db.collection("companyPopbill").limit(300).get().catch(() => null);
      const members = (list?.docs || []).map((d) => ({ company: d.id, ...(d.data() || {}) }));
      let test = null;
      if (data?.test && pb.enabled) {
        const corp = onlyDigits(data.corpNum || members.find((m) => m.corpNum)?.corpNum || "");
        test = corp ? await pb.checkIsMember(corp) : { ok: false, error: "확인할 연동회원 사업자번호가 없어요" };
      }
      return { enabled: pb.enabled, reason: pb.reason, hasKeys, config: { enabled: config.enabled === true, isTest: config.isTest !== false }, members, test };
    }
    const co = coOf(who, data);
    if (action === "getMember") {
      const s = await memRef(co).get();
      return { company: co, member: s.exists ? s.data() : null };
    }
    if (action === "saveMember") {
      const corpNum = onlyDigits(data?.corpNum);
      if (!bizNoOk(corpNum)) throw err("invalid-argument", "사업자번호를 다시 확인해 주세요");
      const status = who.isTM && POPBILL_STATUS.includes(data?.status) ? data.status : "신청중";
      const doc = {
        corpNum, corpName: String(data?.corpName || "").slice(0, 80), ceo: String(data?.ceo || "").slice(0, 40),
        userId: String(data?.userId || "").slice(0, 50), contact: String(data?.contact || "").slice(0, 40), memo: String(data?.memo || "").slice(0, 300),
        status, updatedAt: now(), updatedBy: auth.uid,
      };
      await memRef(co).set(doc, { merge: true });
      return { company: co, member: doc };
    }
    if (action === "checkMember") {
      const s = await memRef(co).get();
      const m = s.exists ? s.data() : null;
      if (!m?.corpNum) throw err("failed-precondition", "사업자번호를 먼저 저장해 주세요");
      const { pb } = await adapter();
      const r = await pb.checkIsMember(m.corpNum);
      if (r.disabled) return { company: co, member: m, result: r };
      const ok = r.ok && Number(r.member?.code) === 1;
      const next = { ...m, status: r.ok ? (ok ? "연동됨" : m.status === "연동됨" ? "미등록" : m.status) : "오류", checkedAt: now(), lastError: r.ok ? "" : String(r.error || "") };
      await memRef(co).set(next, { merge: true });
      return { company: co, member: next, result: r };
    }
    throw err("invalid-argument", "알 수 없는 요청이에요");
  };
}

module.exports = { createPopbill, popbillState, makePopbillAdmin, POPBILL_STATUS, onlyDigits };
