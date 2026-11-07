// ======================= functions/hubWallet.js =======================
// ⭐ 2026-11-06 로지스웹 허브 — 예치금 · 정산 원장(서버 전용). 화면 설명은 cafe-site/src/hub/hubApi.js 맨 위.
// ⭐ 2026-11-07 (3차) 24시콜 · 화물맨 방식으로 정리
//  · 예치금은 등록자(운송사 · 화주) 본인 돈이다. 허브 관리자는 돈을 갖지 않고 장부를 바로잡기만 한다(조정 · 입금 확인).
//  · 충전: 회원마다 받은 가상계좌로 입금 → PG 연동 뒤 자동 반영(hubVaDeposit) / 그 전에는 [입금 확인 요청] → 관리자 확인
//  · 배차 확정 → 등록자 예치금에서 운임(F)을 "보류" 형태로 뺀다(화면 잔액 = 사용 가능 예치금 = 200만 → 190만)
//      취소(확정 뒤 포함) → 보류 전액 환불 · 회차(양쪽 합의) → 회차비만 남기고 나머지 환불
//  · 운송완료 → 차주가 계산서 등록 → 등록자가 계산서 확인 + 지급예정일 → 보류 차감 · 차주 지급 예정(hubPayouts)
//      → 지급예정일이 되면 지급 요청(requestPayout · 지급대행 연동 자리) → 수동 모드에서는 관리자 · 등록자가 [지급완료]
//  · 선불 · 착불: 차주가 화주에게 운임+수수료를 직접 받고, 수수료는 운송완료 때 차주 예치금에서 등록자에게(모자라면 미정산)
//  · 출금: 사용 가능 예치금을 본인 실계좌로(hubWithdrawals → 수동 이체 후 관리자 [출금 완료])
//
//  ⚠️ 실제 돈을 보관 · 이체하지 않는다(PG/지급대행 계약 전). 누가 얼마를 맡겼고 · 묶였고 · 받을 예정이고 · 받았는지 원장만 정확히 적는다.
//
//  잔액(hubWallets/{uid}) — 회원은 읽기만, 쓰기는 여기(트랜잭션)만. 규칙: write false
//   available  사용 가능(출금 가능)   held      배차 확정으로 묶인 운임(보류)
//   pending    받을 운송료(지급 예정)  paidOut   운송료 지급 완료 누계
//   owed       미정산(갚을 수수료)     feeEarned 수수료 수입 누계 · charged 충전 누계
//   withdrawing 출금 처리 중          withdrawn 출금 완료 누계
//  원장(hubLedger/{id}) — 한 번 움직일 때마다 한 줄. 같은 일을 두 번 하지 않게 hubLedgerKeys/{key}에 처리 표시(트랜잭션 안에서 확인).

const DEPOSIT_PAY = ["인수증", "예치금"];
const CASH_PAY = ["선불", "착불"];
const PLATFORM_UID = "__platform__";
const ZERO = { available: 0, held: 0, pending: 0, paidOut: 0, owed: 0, feeEarned: 0, charged: 0, withdrawing: 0, withdrawn: 0 };
const LABEL = {
  charge: "충전", hold: "배차 확정", release: "환불", return_refund: "회차 환불", deduct: "운임 정산", fee_income: "수수료 입금",
  payout_scheduled: "운송료 지급 예정", payout_done: "운송료 지급", payout_cancel: "지급 취소", fee_paid: "수수료 납부",
  fee_owed: "미정산 발생", debt_paid: "미정산 상환", adjust: "관리자 조정", platform_fee: "플랫폼 수수료",
  withdraw_req: "출금 신청", withdraw_done: "출금 완료", withdraw_cancel: "출금 취소",
};
const num = (v) => Math.round(Number(v) || 0);
const tsMs = (t) => (t?.toMillis ? t.toMillis() : typeof t === "number" ? t : t?._seconds ? t._seconds * 1000 : 0);
const routeText = (o) => `${[o.상차시도, o.상차시군구].filter(Boolean).join(" ")} → ${[o.하차시도, o.하차시군구].filter(Boolean).join(" ")}`;
const won = (n) => `${num(n).toLocaleString("ko-KR")}원`;
const kstYmd = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
// 회차 합의가 되면 회차비, 아니면 운임
const returnAccepted = (o) => o?.회차?.status === "accepted";
const payAmount = (o) => (returnAccepted(o) ? num(o.회차.amount) : num(o.운임));
const orderTotal = (o) => num(o.운임) + num(o.수수료);

async function getSettings(db) {
  try { const s = await db.collection("hubSettings").doc("config").get(); return s.exists ? s.data() : {}; } catch { return {}; }
}
function platformCut(settings, fee) {
  const rate = Math.max(0, Math.min(100, Number(settings?.fee?.platformRate) || 0));
  const cut = Math.round((num(fee) * rate) / 100);
  return { cut, toPoster: num(fee) - cut };
}

// 서버가 남기는 알림(같은 일은 같은 번호 → 두 번 만들지 않는다). 받는 사람 화면의 알림 목록 + 푸시(hubNoticeOnCreate)
async function serverNotice(db, FieldValue, noticeId, { toUid, orderId = "", type, title, body }) {
  if (!toUid || toUid === PLATFORM_UID) return;
  try {
    await db.collection("hubNotices").doc(noticeId.replace(/[/]/g, "_").slice(0, 300)).create({
      toUid, fromUid: "system", fromName: "로지스웹 허브", orderId, type, title, body, read: false, createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    if (!(e?.code === 6 || /already exists/i.test(String(e?.message || "")))) console.error("[허브 알림] 만들기 실패:", e?.message || e);
  }
}

// ── 원장 한 번(트랜잭션) — plan({ getW, get })는 읽기만 하고 { ops, writes, result } 또는 { abort, result }를 돌려준다
//   ops: [{ uid, d: { available: -100, held: +100 }, type, amount, memo, orderId, chargeId, payoutId, debtId, allowNegative }]
async function runLedger(db, FieldValue, key, plan) {
  const keyRef = db.collection("hubLedgerKeys").doc(key.replace(/[/]/g, "_").slice(0, 400));
  return db.runTransaction(async (tx) => {
    const k = await tx.get(keyRef);
    if (k.exists) return { skipped: true, ...(k.data().result || {}) };
    const wallets = new Map();
    const getW = async (uid) => {
      if (!wallets.has(uid)) {
        const s = await tx.get(db.collection("hubWallets").doc(uid));
        wallets.set(uid, { ...ZERO, uid, ...(s.exists ? s.data() : {}) });
      }
      return wallets.get(uid);
    };
    const r = await plan({ getW, get: (ref) => tx.get(ref) });
    if (!r || r.abort) return { aborted: true, ...(r?.result || {}) };
    const now = FieldValue.serverTimestamp();
    const touched = new Set();
    for (const op of r.ops || []) {
      const w = wallets.get(op.uid);
      if (!w) throw new Error(`wallet not read: ${op.uid}`);
      for (const [b, v] of Object.entries(op.d)) {
        w[b] = num(w[b]) + num(v);
        if (w[b] < 0 && !op.allowNegative && b !== "available") w[b] = 0; // 보류 · 지급예정 · 미정산은 0 밑으로 내려가지 않게
        if (b === "available" && w[b] < 0 && !op.allowNegative) throw Object.assign(new Error("잔액 부족"), { insufficient: true });
      }
      touched.add(op.uid);
      tx.create(db.collection("hubLedger").doc(), {
        uid: op.uid, type: op.type, label: LABEL[op.type] || op.type, amount: num(op.amount), memo: String(op.memo || "").slice(0, 300),
        orderId: op.orderId || "", chargeId: op.chargeId || "", payoutId: op.payoutId || "", debtId: op.debtId || "", withdrawId: op.withdrawId || "", route: op.route || "",
        availableAfter: w.available, heldAfter: w.held, pendingAfter: w.pending, owedAfter: w.owed, key, by: op.by || "system", at: now,
      });
    }
    for (const uid of touched) {
      const w = wallets.get(uid);
      const out = { uid, updatedAt: now };
      for (const b of Object.keys(ZERO)) out[b] = num(w[b]);
      tx.set(db.collection("hubWallets").doc(uid), out, { merge: true });
    }
    for (const fn of r.writes || []) fn(tx, now);
    tx.set(keyRef, { at: now, result: r.result || {} });
    return { ok: true, ...(r.result || {}) };
  });
}

const oref = (db, id) => db.collection("hubOrders").doc(id);
const activeStatus = (s) => ["assigned", "loaded", "delivered"].includes(s);

// ① 배차 확정 → 등록자 예치금에서 운임을 보류(화면 잔액에서 빠진다)
async function holdForOrder(db, FieldValue, id, o) {
  if (!DEPOSIT_PAY.includes(o.지급방식)) return { skipped: "pay" };
  const F = num(o.운임);
  if (F <= 0) return { skipped: "zero" };
  const key = `hold_${id}_${tsMs(o.assignedAt) || "x"}`;
  const r = await runLedger(db, FieldValue, key, async ({ getW, get }) => {
    const cur = (await get(oref(db, id))).data() || {};
    // 확정 뒤 곧바로 운송완료까지 눌렀어도(트리거가 늦게 돌아도) 같은 배차면 보류한다
    if (!activeStatus(cur.status) || cur.confirmed !== true || cur.takerUid !== o.takerUid) return { abort: true, result: { stale: true } };
    if (["held", "settled"].includes(cur.settle?.status)) return { abort: true, result: { already: true } };
    const w = await getW(o.posterUid);
    if (w.available < F) return { abort: true, result: { insufficient: true, need: F, have: w.available } };
    return {
      ops: [{ uid: o.posterUid, d: { available: -F, held: F }, type: "hold", amount: F, orderId: id, route: routeText(o), memo: `${o.지급방식} 오더 배차 확정` }],
      writes: [(tx, now) => tx.update(oref(db, id), { settle: { status: "held", pay: o.지급방식, holdAmount: F, holdKey: key, fare: F, fee: num(o.수수료), heldAt: now } })],
      result: { held: F, after: w.available - F },
    };
  });
  if (r.insufficient) {
    await oref(db, id).update({ settle: { status: "hold_failed", pay: o.지급방식, need: F, have: num(r.have), at: FieldValue.serverTimestamp() } });
    await serverNotice(db, FieldValue, `${id}_holdfail_${tsMs(o.assignedAt)}`, { toUid: o.posterUid, orderId: id, type: "wallet", title: "잔액이 부족해요", body: `${routeText(o)} 오더 운임 ${won(F)}을 낼 잔액이 모자라요. 충전해 주세요.` });
  } else if (r.ok) {
    await serverNotice(db, FieldValue, `${id}_hold_${tsMs(o.assignedAt)}`, { toUid: o.posterUid, orderId: id, type: "wallet", title: "운임이 잔액에서 빠졌어요", body: `${routeText(o)} 운임 ${won(F)}. 남은 잔액 ${won(r.after)}` });
  }
  return r;
}

// ② 보류 전액 환불(오더 취소 · 배차 취소 후 재모집)
async function releaseHold(db, FieldValue, id, reason) {
  const snap = await oref(db, id).get();
  const o = snap.data() || {};
  if (o.settle?.status !== "held") return { skipped: true };
  const key = `release_${o.settle.holdKey}`;
  const r = await runLedger(db, FieldValue, key, async ({ getW, get }) => {
    const cur = (await get(oref(db, id))).data() || {};
    if (cur.settle?.status !== "held" || cur.settle.holdKey !== o.settle.holdKey) return { abort: true };
    const amt = num(cur.settle.holdAmount);
    await getW(cur.posterUid);
    return {
      ops: [{ uid: cur.posterUid, d: { held: -amt, available: amt }, type: "release", amount: amt, orderId: id, route: routeText(cur), memo: reason }],
      writes: [(tx, now) => tx.update(oref(db, id), { settle: { ...cur.settle, status: "released", releasedAt: now, reason } })],
      result: { released: amt },
    };
  });
  if (r.ok) await serverNotice(db, FieldValue, `${id}_release_${o.settle.holdKey}`, { toUid: o.posterUid, orderId: id, type: "wallet", title: "운임을 돌려드렸어요", body: `${routeText(o)} ${reason}. ${won(r.released)}이 잔액으로 돌아왔어요.` });
  return r;
}

// ③ 회차(양쪽 합의) → 보류를 회차비로 줄이고 나머지는 환불
async function adjustHoldForReturn(db, FieldValue, id) {
  const r = await runLedger(db, FieldValue, `return_${id}`, async ({ getW, get }) => {
    const cur = (await get(oref(db, id))).data() || {};
    if (!returnAccepted(cur) || cur.settle?.status !== "held") return { abort: true, result: { notHeld: true } };
    const held = num(cur.settle.holdAmount);
    const R = Math.min(held, num(cur.회차.amount));
    const back = held - R;
    if (back <= 0) return { abort: true, result: { nothing: true } };
    await getW(cur.posterUid);
    return {
      ops: [{ uid: cur.posterUid, d: { held: -back, available: back }, type: "return_refund", amount: back, orderId: id, route: routeText(cur), memo: `회차비 ${won(R)} 합의` }],
      writes: [(tx) => tx.update(oref(db, id), { "settle.holdAmount": R, "settle.returnRefund": back, "settle.returnAmount": R })],
      result: { back, R, posterUid: cur.posterUid, route: routeText(cur) },
    };
  });
  if (r.ok) await serverNotice(db, FieldValue, `${id}_returnrefund`, { toUid: r.posterUid, orderId: id, type: "wallet", title: "회차비만 남기고 돌려드렸어요", body: `${r.route} 회차비 ${won(r.R)}, 환불 ${won(r.back)}` });
  return r;
}

function payDateOk(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }

// ④ 등록자가 계산서를 확인(지급예정일) → 보류 차감 · 차주 운송료 지급 예정 · 지급예정일이면 바로 지급 요청
async function settleOrder(db, FieldValue, id, { by = "system", force = false } = {}) {
  const key = `settle_${id}`;
  const r = await runLedger(db, FieldValue, key, async ({ getW, get }) => {
    const cur = (await get(oref(db, id))).data();
    if (!cur || cur.status !== "delivered" || !cur.takerUid) return { abort: true, result: { notDelivered: true } };
    if (!DEPOSIT_PAY.includes(cur.지급방식)) return { abort: true, result: { notDeposit: true } };
    if (["settled"].includes(cur.settle?.status)) return { abort: true, result: { already: true } };
    if (!force && !(cur.invoice && cur.invoiceOk)) return { abort: true, result: { noInvoice: true } };
    const A = payAmount(cur);
    const held = cur.settle?.status === "held" ? num(cur.settle.holdAmount) : 0;
    const memberSnap = await get(db.collection("hubMembers").doc(cur.takerUid));
    const taker = memberSnap.exists ? memberSnap.data() : {};
    await getW(cur.posterUid); await getW(cur.takerUid);
    const route = routeText(cur);
    const payoutId = `po_${id}`;
    const dueDate = payDateOk(cur.invoiceOk?.payDate) ? cur.invoiceOk.payDate : kstYmd();
    const ops = [
      { uid: cur.posterUid, d: { held: -held, available: -(A - held) }, type: "deduct", amount: A, orderId: id, route, allowNegative: true, by, memo: `계산서 ${cur.invoice?.no || "(관리자 정산)"}${returnAccepted(cur) ? " 회차" : ""}` },
      { uid: cur.takerUid, d: { pending: A }, type: "payout_scheduled", amount: A, orderId: id, payoutId, route, by, memo: `${dueDate} 지급 예정` },
    ];
    return {
      ops,
      writes: [(tx, now) => {
        tx.set(db.collection("hubPayouts").doc(payoutId), {
          kind: "fare", toUid: cur.takerUid, toName: taker.name || "", toCompany: taker.companyName || "", orderId: id, route, amount: A, fromUid: cur.posterUid,
          bank: taker.bank || null, invoice: cur.invoice || null, dueDate, status: "scheduled", createdAt: now, updatedAt: now,
        });
        tx.update(oref(db, id), { settle: { ...(cur.settle || {}), status: "settled", pay: cur.지급방식, deducted: A, fare: num(cur.운임), payoutId, payoutStatus: "scheduled", dueDate, settledAt: now, settledBy: by } });
      }],
      result: { A, payoutId, dueDate, posterUid: cur.posterUid, takerUid: cur.takerUid, route },
    };
  });
  if (r.ok) {
    await serverNotice(db, FieldValue, `${id}_settle_taker`, { toUid: r.takerUid, orderId: id, type: "settle", title: "지급일이 정해졌어요", body: `${r.route} 운송료 ${won(r.A)}을 ${r.dueDate}에 보내드려요.` });
    await runDuePayouts(db, FieldValue, kstYmd(), r.payoutId);
  }
  return r;
}

// ⑤ 선불 · 착불 — 운송완료 때 차주가 등록자에게 수수료(C)를 낸다(예치금 자동 차감, 모자라면 미정산). 회차면 수수료 없음
async function cashFeeOnDeliver(db, FieldValue, id) {
  const settings = await getSettings(db);
  const key = `cashfee_${id}`;
  const r = await runLedger(db, FieldValue, key, async ({ getW, get }) => {
    const cur = (await get(oref(db, id))).data();
    if (!cur || cur.status !== "delivered" || !CASH_PAY.includes(cur.지급방식) || !cur.takerUid || returnAccepted(cur)) return { abort: true };
    const C = num(cur.수수료);
    if (C <= 0) return { abort: true, result: { zero: true } };
    const drv = await getW(cur.takerUid); await getW(cur.posterUid);
    const { cut, toPoster } = platformCut(settings, C);
    if (cut > 0) await getW(PLATFORM_UID);
    const route = routeText(cur);
    if (drv.available >= C) {
      const ops = [{ uid: cur.takerUid, d: { available: -C }, type: "fee_paid", amount: C, orderId: id, route, memo: `${cur.지급방식} 오더 수수료(현금 ${won(orderTotal(cur))} 받음)` }];
      if (toPoster > 0) ops.push({ uid: cur.posterUid, d: { available: toPoster, feeEarned: toPoster }, type: "fee_income", amount: toPoster, orderId: id, route, memo: `${cur.지급방식} 오더 차주 수수료` });
      if (cut > 0) ops.push({ uid: PLATFORM_UID, d: { available: cut, feeEarned: cut }, type: "platform_fee", amount: cut, orderId: id, route });
      return { ops, writes: [(tx, now) => tx.update(oref(db, id), { settle: { status: "fee_paid", pay: cur.지급방식, fee: C, posterFee: toPoster, platformFee: cut, at: now } })], result: { paid: true, C, route, posterUid: cur.posterUid, takerUid: cur.takerUid } };
    }
    const debtId = `debt_${id}`;
    return {
      ops: [{ uid: cur.takerUid, d: { owed: C }, type: "fee_owed", amount: C, orderId: id, debtId, route, memo: `잔액 부족(사용 가능 ${won(drv.available)}). 충전하면 자동으로 갚아요` }],
      writes: [(tx, now) => {
        tx.set(db.collection("hubDebts").doc(debtId), { fromUid: cur.takerUid, toUid: cur.posterUid, orderId: id, route, amount: C, status: "open", createdAt: now });
        tx.update(oref(db, id), { settle: { status: "fee_owed", pay: cur.지급방식, fee: C, debtId, at: now } });
      }],
      result: { owed: true, C, route, posterUid: cur.posterUid, takerUid: cur.takerUid },
    };
  });
  if (r.ok && r.paid) {
    await serverNotice(db, FieldValue, `${id}_cashfee_taker`, { toUid: r.takerUid, orderId: id, type: "settle", title: "수수료를 냈어요", body: `${r.route} 수수료 ${won(r.C)}이 잔액에서 빠졌어요.` });
    await serverNotice(db, FieldValue, `${id}_cashfee_poster`, { toUid: r.posterUid, orderId: id, type: "settle", title: "수수료가 들어왔어요", body: `${r.route} 차주 수수료 ${won(r.C)}` });
  } else if (r.ok && r.owed) {
    await serverNotice(db, FieldValue, `${id}_cashowed_taker`, { toUid: r.takerUid, orderId: id, type: "settle", title: "수수료가 밀려 있어요", body: `${r.route} 수수료 ${won(r.C)}. 충전하면 바로 갚아져요.` });
    await serverNotice(db, FieldValue, `${id}_cashowed_poster`, { toUid: r.posterUid, orderId: id, type: "settle", title: "수수료를 기다리고 있어요", body: `${r.route} 차주 수수료 ${won(r.C)}. 차주가 충전하면 들어와요.` });
  }
  return r;
}

// ⑥ 미정산 자동 상환(충전 · 조정 뒤) — 오래된 것부터, 잔액이 되는 만큼
async function collectDebts(db, FieldValue, uid) {
  const settings = await getSettings(db);
  const snap = await db.collection("hubDebts").where("fromUid", "==", uid).where("status", "==", "open").get();
  const debts = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt));
  const out = [];
  for (const d of debts) {
    const r = await runLedger(db, FieldValue, `debtpay_${d.id}`, async ({ getW, get }) => {
      const cur = (await get(db.collection("hubDebts").doc(d.id))).data();
      if (!cur || cur.status !== "open") return { abort: true };
      const from = await getW(cur.fromUid); await getW(cur.toUid);
      const amt = num(cur.amount);
      if (from.available < amt) return { abort: true, result: { short: true } };
      const { cut, toPoster } = platformCut(settings, amt);
      if (cut > 0) await getW(PLATFORM_UID);
      const ops = [{ uid: cur.fromUid, d: { available: -amt, owed: -amt }, type: "debt_paid", amount: amt, orderId: cur.orderId, debtId: d.id, route: cur.route }];
      if (toPoster > 0) ops.push({ uid: cur.toUid, d: { available: toPoster, feeEarned: toPoster }, type: "fee_income", amount: toPoster, orderId: cur.orderId, debtId: d.id, route: cur.route, memo: "밀린 수수료" });
      if (cut > 0) ops.push({ uid: PLATFORM_UID, d: { available: cut, feeEarned: cut }, type: "platform_fee", amount: cut, orderId: cur.orderId, route: cur.route });
      return {
        ops,
        writes: [(tx, now) => {
          tx.update(db.collection("hubDebts").doc(d.id), { status: "paid", paidAt: now });
          if (cur.orderId) tx.set(oref(db, cur.orderId), { settle: { status: "fee_paid", debtId: d.id, paidAt: now } }, { merge: true });
        }],
        result: { amt, route: cur.route, toUid: cur.toUid, orderId: cur.orderId },
      };
    });
    if (r.short) break;
    if (r.ok) {
      out.push(d.id);
      await serverNotice(db, FieldValue, `${d.id}_paid_to`, { toUid: r.toUid, orderId: r.orderId, type: "settle", title: "수수료가 들어왔어요", body: `${r.route} 밀린 수수료 ${won(r.amt)}` });
      await serverNotice(db, FieldValue, `${d.id}_paid_from`, { toUid: uid, orderId: r.orderId, type: "settle", title: "밀린 수수료를 갚았어요", body: `${r.route} ${won(r.amt)}` });
    }
  }
  return out;
}

// ⑦ 충전 — 가상계좌 자동 반영(source "va") 또는 [입금 확인 요청] → 관리자 확인(status: confirmed) → 사용 가능 예치금 +
async function creditCharge(db, FieldValue, chargeId) {
  const r = await runLedger(db, FieldValue, `charge_${chargeId}`, async ({ getW, get }) => {
    const c = (await get(db.collection("hubCharges").doc(chargeId))).data();
    if (!c || c.status !== "confirmed" || c.creditedAt) return { abort: true };
    const amt = num(c.amount);
    if (amt <= 0) return { abort: true };
    const w = await getW(c.uid);
    return {
      ops: [{ uid: c.uid, d: { available: amt, charged: amt }, type: "charge", amount: amt, chargeId, by: c.confirmedBy || "admin", memo: c.source === "va" ? `가상계좌 ${c.vaNumber || ""}`.trim() : `입금자 ${c.depositor || "-"}` }],
      writes: [(tx, now) => tx.update(db.collection("hubCharges").doc(chargeId), { creditedAt: now })],
      result: { uid: c.uid, amt, after: w.available + amt },
    };
  });
  if (r.ok) {
    await serverNotice(db, FieldValue, `charge_${chargeId}`, { toUid: r.uid, type: "wallet", title: "충전했어요", body: `${won(r.amt)} 충전. 잔액 ${won(r.after)}` });
    await collectDebts(db, FieldValue, r.uid);
  }
  return r;
}
// 가상계좌 입금 알림(PG 웹훅 자리 — hubVaDeposit). 계좌번호로 회원을 찾아 "확인된 충전"을 한 줄 만든다(같은 거래번호는 한 번만)
async function vaDeposit(db, FieldValue, { account, amount, depositor = "", txId }) {
  const acc = String(account || "").replace(/[^\d]/g, "");
  const amt = num(amount);
  if (!acc || amt <= 0 || !txId) return { ok: false, reason: "bad_request" };
  const q = await db.collection("hubMembers").where("va.numberDigits", "==", acc).limit(2).get();
  if (q.size !== 1) return { ok: false, reason: q.size ? "duplicate_account" : "unknown_account" };
  const m = q.docs[0];
  const ref = db.collection("hubCharges").doc(`va_${String(txId).replace(/[^\w-]/g, "").slice(0, 80)}`);
  try {
    await ref.create({ uid: m.id, name: m.data().name || "", companyName: m.data().companyName || "", amount: amt, depositor: String(depositor).slice(0, 40), source: "va", vaNumber: m.data().va?.number || acc, status: "confirmed", confirmedBy: "va", confirmedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() });
  } catch (e) {
    if (/already exists/i.test(String(e?.message || "")) || e?.code === 6) return { ok: true, duplicate: true, chargeId: ref.id };
    throw e;
  }
  return { ok: true, chargeId: ref.id, uid: m.id };
}

// ⑧ 관리자 조정(hubAdjustments) — 사용 가능 예치금(available) 또는 미정산(owed) ±
async function applyAdjustment(db, FieldValue, adjId) {
  const r = await runLedger(db, FieldValue, `adj_${adjId}`, async ({ getW, get }) => {
    const a = (await get(db.collection("hubAdjustments").doc(adjId))).data();
    if (!a || !a.uid || !num(a.amount)) return { abort: true };
    const bucket = a.bucket === "owed" ? "owed" : "available";
    await getW(a.uid);
    return {
      ops: [{ uid: a.uid, d: { [bucket]: num(a.amount) }, type: "adjust", amount: num(a.amount), memo: `${bucket === "owed" ? "미정산 " : ""}${a.memo || ""}`, by: a.by || "admin", allowNegative: true }],
      writes: [(tx, now) => tx.update(db.collection("hubAdjustments").doc(adjId), { appliedAt: now })],
      result: { uid: a.uid, amount: num(a.amount), bucket },
    };
  });
  if (r.ok) {
    await serverNotice(db, FieldValue, `adj_${adjId}`, { toUid: r.uid, type: "wallet", title: "잔액을 바로잡았어요", body: `${r.bucket === "owed" ? "미정산 " : ""}${r.amount > 0 ? "+" : ""}${won(r.amount)}` });
    if (r.bucket === "available" && r.amount > 0) await collectDebts(db, FieldValue, r.uid);
  }
  return r;
}

// ⑨ 지급 — 지급대행 API 연결 자리(어댑터). 지금은 계약 전이라 "수동 지급" 결과만 돌려준다.
//  ▶ 연동할 때: 토스페이먼츠 지급대행 · 포트원 · 헥토 등 API를 여기서 부르고
//    { ok: true, mode: "api", providerId, status: "processing" | "paid" } 를 돌려주면 된다(키는 functions 비밀값으로).
async function requestPayout(payout) {
  if (!payout?.bank?.number) return { ok: false, mode: "manual", message: "받는 분 계좌가 없어요" };
  return { ok: false, mode: "manual", message: "직접 이체한 뒤 지급완료를 눌러 주세요" };
}
// 지급예정일이 된 지급 → 지급 요청(매일 아침 hubPayoutDaily + 정산 · 날짜 변경 때 바로)
async function runDuePayouts(db, FieldValue, today = kstYmd(), onlyId = null) {
  const docs = onlyId
    ? [await db.collection("hubPayouts").doc(onlyId).get()].filter((s) => s.exists)
    : (await db.collection("hubPayouts").where("status", "==", "scheduled").get()).docs;
  let n = 0;
  for (const s of docs) {
    const p = s.data();
    if (p.status !== "scheduled" || !payDateOk(p.dueDate) || p.dueDate > today) continue;
    await s.ref.update({ status: "requested", requestedAt: FieldValue.serverTimestamp(), requestedBy: "schedule", updatedAt: FieldValue.serverTimestamp() });
    n++;
  }
  return n;
}
async function onPayoutWrite(db, FieldValue, payoutId, before, after) {
  if (!after) return;
  if (after.status === "scheduled" && (before?.status !== "scheduled" || before?.dueDate !== after.dueDate)) {
    if (payDateOk(after.dueDate) && after.dueDate <= kstYmd()) await runDuePayouts(db, FieldValue, kstYmd(), payoutId);
    return;
  }
  if (after.status === "requested" && before?.status !== "requested") {
    const res = await requestPayout(after).catch((e) => ({ ok: false, mode: "error", message: String(e?.message || e) }));
    await db.collection("hubPayouts").doc(payoutId).update({ adapter: { ...res, at: FieldValue.serverTimestamp() }, ...(res.ok ? { status: res.status || "processing" } : {}), updatedAt: FieldValue.serverTimestamp() });
    if (after.orderId) await oref(db, after.orderId).set({ settle: { payoutStatus: res.ok ? res.status || "processing" : "requested" } }, { merge: true }).catch(() => {});
    if (res.ok && res.status === "paid") after = { ...after, status: "paid" };
    else return;
  }
  if (after.status === "paid" && before?.status !== "paid") {
    const r = await runLedger(db, FieldValue, `payout_${payoutId}`, async ({ getW, get }) => {
      const p = (await get(db.collection("hubPayouts").doc(payoutId))).data();
      if (!p || p.status !== "paid") return { abort: true };
      const amt = num(p.amount);
      await getW(p.toUid);
      return {
        ops: [{ uid: p.toUid, d: { pending: -amt, paidOut: amt }, type: "payout_done", amount: amt, orderId: p.orderId, payoutId, route: p.route, by: p.paidBy || "admin", memo: p.bank?.number ? `${p.bank.bank || ""} ${String(p.bank.number).replace(/.(?=.{4})/g, "*")}` : "" }],
        writes: [(tx, now) => { if (p.orderId) tx.set(oref(db, p.orderId), { settle: { payoutStatus: "paid", paidAt: now } }, { merge: true }); }],
        result: { uid: p.toUid, amt, route: p.route, orderId: p.orderId },
      };
    });
    if (r.ok) await serverNotice(db, FieldValue, `payout_${payoutId}`, { toUid: r.uid, orderId: r.orderId, type: "settle", title: "운송료를 보냈어요", body: `${r.route} ${won(r.amt)}을 등록하신 계좌로 보냈어요.` });
  }
}

// ⑩ 출금(사용 가능 예치금 → 본인 실계좌) — 신청하면 바로 묶고(출금 처리 중), 관리자가 이체 후 [출금 완료] · 반려하면 돌려준다
async function onWithdrawWrite(db, FieldValue, wid, before, after) {
  if (!after) return;
  const ref = db.collection("hubWithdrawals").doc(wid);
  if (!before && after.status === "requested") {
    const r = await runLedger(db, FieldValue, `wd_${wid}`, async ({ getW, get }) => {
      const w0 = (await get(ref)).data();
      if (!w0 || w0.status !== "requested") return { abort: true };
      const amt = num(w0.amount);
      const w = await getW(w0.uid);
      if (amt <= 0 || w.available < amt) return { abort: true, result: { short: true, have: w.available } };
      return {
        ops: [{ uid: w0.uid, d: { available: -amt, withdrawing: amt }, type: "withdraw_req", amount: amt, withdrawId: wid, memo: w0.bank?.number ? `${w0.bank.bank} ${String(w0.bank.number).replace(/.(?=.{4})/g, "*")}` : "" }],
        writes: [(tx, now) => tx.update(ref, { status: "processing", reservedAt: now })],
        result: { uid: w0.uid, amt },
      };
    });
    if (r.short) await ref.update({ status: "failed", failReason: "잔액 부족", updatedAt: FieldValue.serverTimestamp() });
    if (r.ok) {
      const res = await requestPayout({ ...after, kind: "withdraw" }).catch((e) => ({ ok: false, mode: "error", message: String(e?.message || e) }));
      await ref.update({ adapter: { ...res, at: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() });
      await serverNotice(db, FieldValue, `wd_${wid}`, { toUid: r.uid, type: "wallet", title: "출금을 신청했어요", body: `${won(r.amt)}을 보내고 있어요.` });
    }
    return;
  }
  if (after.status === "paid" && before?.status !== "paid") {
    const r = await runLedger(db, FieldValue, `wdpaid_${wid}`, async ({ getW, get }) => {
      const w0 = (await get(ref)).data();
      if (!w0 || w0.status !== "paid") return { abort: true };
      const amt = num(w0.amount);
      await getW(w0.uid);
      return { ops: [{ uid: w0.uid, d: { withdrawing: -amt, withdrawn: amt }, type: "withdraw_done", amount: amt, withdrawId: wid, by: w0.paidBy || "admin" }], result: { uid: w0.uid, amt } };
    });
    if (r.ok) await serverNotice(db, FieldValue, `wdpaid_${wid}`, { toUid: r.uid, type: "wallet", title: "출금했어요", body: `${won(r.amt)}을 계좌로 보냈어요.` });
  }
  if (after.status === "rejected" && before?.status !== "rejected") {
    const r = await runLedger(db, FieldValue, `wdrej_${wid}`, async ({ getW, get }) => {
      const w0 = (await get(ref)).data();
      if (!w0 || w0.status !== "rejected" || !w0.reservedAt) return { abort: true };
      const amt = num(w0.amount);
      await getW(w0.uid);
      return { ops: [{ uid: w0.uid, d: { withdrawing: -amt, available: amt }, type: "withdraw_cancel", amount: amt, withdrawId: wid, memo: w0.rejectReason || "" }], result: { uid: w0.uid, amt } };
    });
    if (r.ok) await serverNotice(db, FieldValue, `wdrej_${wid}`, { toUid: r.uid, type: "wallet", title: "출금을 취소했어요", body: `${won(r.amt)}이 잔액으로 돌아왔어요.` });
  }
}

module.exports = {
  DEPOSIT_PAY, CASH_PAY, PLATFORM_UID, LABEL, ZERO, orderTotal, payAmount, returnAccepted, routeText, won, tsMs, kstYmd, serverNotice, runLedger,
  holdForOrder, releaseHold, adjustHoldForReturn, settleOrder, cashFeeOnDeliver, collectDebts, creditCharge, vaDeposit, applyAdjustment,
  requestPayout, runDuePayouts, onPayoutWrite, onWithdrawWrite,
};
