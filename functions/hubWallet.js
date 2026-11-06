// ======================= functions/hubWallet.js =======================
// ⭐ 2026-11-06 로지스웹 허브 — 예치금 · 정산 원장(서버 전용). 화면 설명은 cafe-site/src/hub/hubApi.js 맨 위.
//
//  ⚠️ 실제 돈을 보관 · 이체하지 않는다. 예치금 보관과 계좌 이체에는 PG/지급대행 계약(토스페이먼츠 지급대행 · 포트원 · 헥토 등)이
//     필요하므로, 여기서는 "누가 얼마를 맡겼고 · 묶였고 · 받을 예정이고 · 받았는지"를 정확히 적는 원장(ledger)만 운영한다.
//     충전은 회사 계좌로 입금 → 관리자가 [입금 확인], 지급은 관리자가 직접 이체 → [지급완료](또는 지급대행 연동 후 requestPayout()).
//
//  잔액(hubWallets/{uid}) — 회원은 읽기만, 쓰기는 여기(트랜잭션)만. 규칙: write false
//   available  사용 가능 예치금          held      보류(배차 확정된 오더의 운임+수수료)
//   pending    지급 예정(받을 돈)        paidOut   지급 완료 누계
//   owed       미정산(내가 갚을 수수료)  feeEarned 수수료 수입 누계 · charged 충전 누계
//  원장(hubLedger/{id}) — 한 번 움직일 때마다 한 줄(종류 · 금액 · 움직인 뒤 잔액 · 오더/충전/지급 번호). 회원은 자기 줄만 읽는다.
//  같은 일을 두 번 하지 않게(트리거 재시도 · 화면 중복) hubLedgerKeys/{key}에 처리 표시를 남긴다(트랜잭션 안에서 확인).
//
//  결제 방식별 흐름(오더 운임 F + 수수료 C = 합계 T. 예: 60만 + 2만 = 62만, 수수료 2만은 등록자 몫)
//   · 인수증 · 예치금(예치금 결제): 배차 확정 → 등록자 예치금에서 T 보류(부족하면 확정 막힘 — 규칙이 먼저 막고, 여기서 한 번 더 확인)
//       → 운송완료 후 배차된 회원이 계산서(세금계산서) 발행 → 보류 T 차감 · 배차된 회원에게 F 지급 예정(지급 대기열) · 등록자에게 C 수수료 입금
//       → 관리자 지급(지급대행 연동 전엔 직접 이체 후 [지급완료]) → 지급 예정 → 지급 완료
//   · 선불 · 착불(차주가 화주에게 T 현금 수령): 운송완료 → 차주가 등록자에게 수수료 C를 내야 함
//       → 차주 예치금에서 자동 차감해 등록자에게 입금, 모자라면 미정산(hubDebts) 기록 → 차주가 충전하면 자동으로 갚음
//   · 계좌이체 · 계산서(당사자끼리 직접 정산): 원장에 남기지 않는다
//   · 배차 취소 · 오더 취소 · 배차 취소 후 재모집: 보류 해제(available로 돌려줌)

const DEPOSIT_PAY = ["인수증", "예치금"];
const CASH_PAY = ["선불", "착불"];
const PLATFORM_UID = "__platform__";
const ZERO = { available: 0, held: 0, pending: 0, paidOut: 0, owed: 0, feeEarned: 0, charged: 0 };
const LABEL = {
  charge: "충전", hold: "보류", release: "보류 해제", deduct: "차감", fee_income: "수수료 입금", payout_scheduled: "지급 예정",
  payout_done: "지급 완료", payout_cancel: "지급 취소", fee_paid: "수수료 납부", fee_owed: "미정산 발생", debt_paid: "미정산 상환", adjust: "관리자 조정",
  platform_fee: "플랫폼 수수료",
};
const num = (v) => Math.round(Number(v) || 0);
const tsMs = (t) => (t?.toMillis ? t.toMillis() : typeof t === "number" ? t : t?._seconds ? t._seconds * 1000 : 0);
const routeText = (o) => `${[o.상차시도, o.상차시군구].filter(Boolean).join(" ")} → ${[o.하차시도, o.하차시군구].filter(Boolean).join(" ")}`;
const won = (n) => `${num(n).toLocaleString("ko-KR")}원`;
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
        if (w[b] < 0 && !op.allowNegative && b !== "available") w[b] = 0; // 보류·지급예정·미정산은 0 밑으로 내려가지 않게
        if (b === "available" && w[b] < 0 && !op.allowNegative) throw Object.assign(new Error("잔액 부족"), { insufficient: true });
      }
      touched.add(op.uid);
      tx.create(db.collection("hubLedger").doc(), {
        uid: op.uid, type: op.type, label: LABEL[op.type] || op.type, amount: num(op.amount), memo: String(op.memo || "").slice(0, 300),
        orderId: op.orderId || "", chargeId: op.chargeId || "", payoutId: op.payoutId || "", debtId: op.debtId || "", route: op.route || "",
        availableAfter: w.available, heldAfter: w.held, pendingAfter: w.pending, owedAfter: w.owed, key, by: op.by || "system", at: now,
      });
    }
    for (const uid of touched) {
      const w = wallets.get(uid);
      tx.set(db.collection("hubWallets").doc(uid), { uid, available: w.available, held: w.held, pending: w.pending, paidOut: w.paidOut, owed: w.owed, feeEarned: w.feeEarned, charged: w.charged, updatedAt: now }, { merge: true });
    }
    for (const fn of r.writes || []) fn(tx, now);
    tx.set(keyRef, { at: now, result: r.result || {} });
    return { ok: true, ...(r.result || {}) };
  });
}

const oref = (db, id) => db.collection("hubOrders").doc(id);

// ① 배차 확정 → 등록자 예치금에서 운임+수수료 보류
async function holdForOrder(db, FieldValue, id, o) {
  if (!DEPOSIT_PAY.includes(o.지급방식)) return { skipped: "pay" };
  const T = orderTotal(o);
  if (T <= 0) return { skipped: "zero" };
  const key = `hold_${id}_${tsMs(o.assignedAt) || "x"}`;
  const r = await runLedger(db, FieldValue, key, async ({ getW, get }) => {
    const cur = (await get(oref(db, id))).data() || {};
    if (cur.status !== "assigned" || cur.confirmed !== true || cur.takerUid !== o.takerUid) return { abort: true, result: { stale: true } };
    if (cur.settle?.status === "held") return { abort: true, result: { already: true } };
    const w = await getW(o.posterUid);
    if (w.available < T) return { abort: true, result: { insufficient: true, need: T, have: w.available } };
    return {
      ops: [{ uid: o.posterUid, d: { available: -T, held: T }, type: "hold", amount: T, orderId: id, route: routeText(o), memo: `${o.지급방식} 오더 배차 확정 · 운임 ${won(o.운임)} + 수수료 ${won(o.수수료)}` }],
      writes: [(tx, now) => tx.update(oref(db, id), { settle: { status: "held", pay: o.지급방식, holdAmount: T, holdKey: key, fare: num(o.운임), fee: num(o.수수료), heldAt: now } })],
      result: { held: T },
    };
  });
  if (r.insufficient) {
    await oref(db, id).update({ settle: { status: "hold_failed", pay: o.지급방식, need: T, have: num(r.have), at: FieldValue.serverTimestamp() } });
    await serverNotice(db, FieldValue, `${id}_holdfail_${tsMs(o.assignedAt)}`, { toUid: o.posterUid, orderId: id, type: "wallet", title: "예치금이 부족합니다", body: `${routeText(o)} 오더 배차 확정에 필요한 ${won(T)}을 보류하지 못했습니다(사용 가능 ${won(r.have)}). 예치금을 충전해 주세요.` });
  } else if (r.ok) {
    await serverNotice(db, FieldValue, `${id}_hold_${tsMs(o.assignedAt)}`, { toUid: o.posterUid, orderId: id, type: "wallet", title: "예치금 보류", body: `${routeText(o)} 오더 운임+수수료 ${won(T)}을 정산 때까지 보류했습니다.` });
  }
  return r;
}

// ② 보류 해제(취소 · 배차 취소 후 재모집)
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
  if (r.ok) await serverNotice(db, FieldValue, `${id}_release_${o.settle.holdKey}`, { toUid: o.posterUid, orderId: id, type: "wallet", title: "보류 해제", body: `${routeText(o)} 오더 ${reason} — 보류했던 ${won(r.released)}을 사용 가능 예치금으로 돌려드렸습니다.` });
  return r;
}

// ③ 계산서 발행(또는 관리자 정산 처리) → 차감 · 지급 예정 · 수수료 입금
async function settleOrder(db, FieldValue, id, { by = "system", force = false } = {}) {
  const settings = await getSettings(db);
  const key = `settle_${id}`;
  const r = await runLedger(db, FieldValue, key, async ({ getW, get }) => {
    const cur = (await get(oref(db, id))).data();
    if (!cur || cur.status !== "delivered" || !cur.takerUid) return { abort: true, result: { notDelivered: true } };
    if (!DEPOSIT_PAY.includes(cur.지급방식)) return { abort: true, result: { notDeposit: true } };
    if (["settled"].includes(cur.settle?.status)) return { abort: true, result: { already: true } };
    if (!force && !cur.invoice) return { abort: true, result: { noInvoice: true } };
    const F = num(cur.운임), C = num(cur.수수료), T = F + C;
    const held = cur.settle?.status === "held" ? num(cur.settle.holdAmount) : 0;
    const memberSnap = await get(db.collection("hubMembers").doc(cur.takerUid));
    const taker = memberSnap.exists ? memberSnap.data() : {};
    await getW(cur.posterUid); await getW(cur.takerUid);
    const { cut, toPoster } = platformCut(settings, C);
    if (cut > 0) await getW(PLATFORM_UID);
    const route = routeText(cur);
    const payoutId = `po_${id}`;
    const ops = [
      { uid: cur.posterUid, d: { held: -held, available: -(T - held) }, type: "deduct", amount: T, orderId: id, route, allowNegative: true, by, memo: `계산서 ${cur.invoice?.no || "(관리자 정산)"} · 운임 ${won(F)} + 수수료 ${won(C)}` },
      { uid: cur.takerUid, d: { pending: F }, type: "payout_scheduled", amount: F, orderId: id, payoutId, route, by, memo: `운임 ${won(F)} 지급 대기` },
    ];
    if (toPoster > 0) ops.push({ uid: cur.posterUid, d: { available: toPoster, feeEarned: toPoster }, type: "fee_income", amount: toPoster, orderId: id, route, by, memo: `수수료 ${won(C)}${cut ? ` (플랫폼 ${won(cut)} 제외)` : ""}` });
    if (cut > 0) ops.push({ uid: PLATFORM_UID, d: { available: cut, feeEarned: cut }, type: "platform_fee", amount: cut, orderId: id, route, by });
    return {
      ops,
      writes: [(tx, now) => {
        tx.set(db.collection("hubPayouts").doc(payoutId), {
          toUid: cur.takerUid, toName: taker.name || "", toCompany: taker.companyName || "", orderId: id, route, amount: F, fromUid: cur.posterUid,
          bank: taker.bank || null, invoice: cur.invoice || null, status: "queued", createdAt: now, updatedAt: now,
        });
        tx.update(oref(db, id), { settle: { ...(cur.settle || {}), status: "settled", pay: cur.지급방식, deducted: T, fare: F, fee: C, posterFee: toPoster, platformFee: cut, payoutId, payoutStatus: "queued", settledAt: now, settledBy: by } });
      }],
      result: { T, F, C, toPoster, payoutId, posterUid: cur.posterUid, takerUid: cur.takerUid, route },
    };
  });
  if (r.ok) {
    await serverNotice(db, FieldValue, `${id}_settle_poster`, { toUid: r.posterUid, orderId: id, type: "settle", title: "예치금 차감 · 수수료 입금", body: `${r.route} 정산: ${won(r.T)} 차감, 수수료 ${won(r.toPoster)} 입금되었습니다.` });
    await serverNotice(db, FieldValue, `${id}_settle_taker`, { toUid: r.takerUid, orderId: id, type: "settle", title: "운임 지급 예정", body: `${r.route} 운임 ${won(r.F)}이 지급 대기열에 올라갔습니다. 등록한 계좌로 지급됩니다.` });
  }
  return r;
}

// ④ 선불 · 착불 — 운송완료 시 차주가 등록자에게 수수료(C)를 낸다(예치금 자동 차감, 모자라면 미정산)
async function cashFeeOnDeliver(db, FieldValue, id) {
  const settings = await getSettings(db);
  const key = `cashfee_${id}`;
  const r = await runLedger(db, FieldValue, key, async ({ getW, get }) => {
    const cur = (await get(oref(db, id))).data();
    if (!cur || cur.status !== "delivered" || !CASH_PAY.includes(cur.지급방식) || !cur.takerUid) return { abort: true };
    const C = num(cur.수수료);
    if (C <= 0) return { abort: true, result: { zero: true } };
    const drv = await getW(cur.takerUid); await getW(cur.posterUid);
    const { cut, toPoster } = platformCut(settings, C);
    if (cut > 0) await getW(PLATFORM_UID);
    const route = routeText(cur);
    if (drv.available >= C) {
      const ops = [{ uid: cur.takerUid, d: { available: -C }, type: "fee_paid", amount: C, orderId: id, route, memo: `${cur.지급방식} 오더 수수료(현금 ${won(orderTotal(cur))} 수령)` }];
      if (toPoster > 0) ops.push({ uid: cur.posterUid, d: { available: toPoster, feeEarned: toPoster }, type: "fee_income", amount: toPoster, orderId: id, route, memo: `${cur.지급방식} 오더 차주 수수료` });
      if (cut > 0) ops.push({ uid: PLATFORM_UID, d: { available: cut, feeEarned: cut }, type: "platform_fee", amount: cut, orderId: id, route });
      return { ops, writes: [(tx, now) => tx.update(oref(db, id), { settle: { status: "fee_paid", pay: cur.지급방식, fee: C, posterFee: toPoster, platformFee: cut, at: now } })], result: { paid: true, C, route, posterUid: cur.posterUid, takerUid: cur.takerUid } };
    }
    const debtId = `debt_${id}`;
    return {
      ops: [{ uid: cur.takerUid, d: { owed: C }, type: "fee_owed", amount: C, orderId: id, debtId, route, memo: `예치금 부족(사용 가능 ${won(drv.available)}) — 충전하면 자동 상환` }],
      writes: [(tx, now) => {
        tx.set(db.collection("hubDebts").doc(debtId), { fromUid: cur.takerUid, toUid: cur.posterUid, orderId: id, route, amount: C, status: "open", createdAt: now });
        tx.update(oref(db, id), { settle: { status: "fee_owed", pay: cur.지급방식, fee: C, debtId, at: now } });
      }],
      result: { owed: true, C, route, posterUid: cur.posterUid, takerUid: cur.takerUid },
    };
  });
  if (r.ok && r.paid) {
    await serverNotice(db, FieldValue, `${id}_cashfee_taker`, { toUid: r.takerUid, orderId: id, type: "settle", title: "수수료 차감", body: `${r.route} 수수료 ${won(r.C)}을 예치금에서 차감해 등록자에게 보냈습니다.` });
    await serverNotice(db, FieldValue, `${id}_cashfee_poster`, { toUid: r.posterUid, orderId: id, type: "settle", title: "수수료 입금", body: `${r.route} 차주 수수료 ${won(r.C)}이 입금되었습니다.` });
  } else if (r.ok && r.owed) {
    await serverNotice(db, FieldValue, `${id}_cashowed_taker`, { toUid: r.takerUid, orderId: id, type: "settle", title: "미정산 수수료", body: `${r.route} 수수료 ${won(r.C)}을 낼 예치금이 부족해 미정산으로 기록했습니다. 충전하면 자동으로 정산됩니다.` });
    await serverNotice(db, FieldValue, `${id}_cashowed_poster`, { toUid: r.posterUid, orderId: id, type: "settle", title: "수수료 미정산", body: `${r.route} 차주 수수료 ${won(r.C)}이 미정산입니다. 차주가 충전하면 자동으로 입금됩니다.` });
  }
  return r;
}

// ⑤ 미정산 자동 상환(충전 · 조정 뒤) — 오래된 것부터, 잔액이 되는 만큼
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
      if (toPoster > 0) ops.push({ uid: cur.toUid, d: { available: toPoster, feeEarned: toPoster }, type: "fee_income", amount: toPoster, orderId: cur.orderId, debtId: d.id, route: cur.route, memo: "미정산 수수료 상환" });
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
      await serverNotice(db, FieldValue, `${d.id}_paid_to`, { toUid: r.toUid, orderId: r.orderId, type: "settle", title: "미정산 수수료 입금", body: `${r.route} 수수료 ${won(r.amt)}이 입금되었습니다.` });
      await serverNotice(db, FieldValue, `${d.id}_paid_from`, { toUid: uid, orderId: r.orderId, type: "settle", title: "미정산 수수료 상환", body: `${r.route} 미정산 수수료 ${won(r.amt)}을 예치금에서 갚았습니다.` });
    }
  }
  return out;
}

// ⑥ 충전 — 회원이 [충전 요청](회사 계좌로 입금) → 관리자가 [입금 확인](status: confirmed) → 사용 가능 예치금 +
async function creditCharge(db, FieldValue, chargeId) {
  const r = await runLedger(db, FieldValue, `charge_${chargeId}`, async ({ getW, get }) => {
    const c = (await get(db.collection("hubCharges").doc(chargeId))).data();
    if (!c || c.status !== "confirmed" || c.creditedAt) return { abort: true };
    const amt = num(c.amount);
    if (amt <= 0) return { abort: true };
    await getW(c.uid);
    return {
      ops: [{ uid: c.uid, d: { available: amt, charged: amt }, type: "charge", amount: amt, chargeId, by: c.confirmedBy || "admin", memo: `입금자 ${c.depositor || "-"}` }],
      writes: [(tx, now) => tx.update(db.collection("hubCharges").doc(chargeId), { creditedAt: now })],
      result: { uid: c.uid, amt },
    };
  });
  if (r.ok) {
    await serverNotice(db, FieldValue, `charge_${chargeId}`, { toUid: r.uid, type: "wallet", title: "예치금 충전 완료", body: `${won(r.amt)}이 충전되었습니다.` });
    await collectDebts(db, FieldValue, r.uid);
  }
  return r;
}

// ⑦ 관리자 조정(hubAdjustments) — 사용 가능 예치금(available) 또는 미정산(owed) ±
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
    await serverNotice(db, FieldValue, `adj_${adjId}`, { toUid: r.uid, type: "wallet", title: "예치금 조정", body: `관리자가 ${r.bucket === "owed" ? "미정산 금액" : "예치금"}을 ${r.amount > 0 ? "+" : ""}${won(r.amount)} 조정했습니다.` });
    if (r.bucket === "available" && r.amount > 0) await collectDebts(db, FieldValue, r.uid);
  }
  return r;
}

// ⑧ 지급 — 지급대행 API 연결 자리(어댑터). 지금은 계약 전이라 "수동 지급" 결과만 돌려준다.
//  ▶ 연동할 때: 토스페이먼츠 지급대행(POST /v2/payouts) · 포트원 · 헥토 등 API를 여기서 부르고
//    { ok: true, mode: "api", providerId, status: "processing" | "paid" } 를 돌려주면 된다(키는 functions 비밀값으로).
async function requestPayout(payout) {
  if (!payout?.bank?.number) return { ok: false, mode: "manual", message: "받는 사람 계좌가 등록되지 않았습니다(내 정보 › 정산 계좌)." };
  return { ok: false, mode: "manual", message: "지급대행 계약 전 — 관리자가 직접 이체한 뒤 [지급완료]를 눌러 주세요." };
}
async function onPayoutWrite(db, FieldValue, payoutId, before, after) {
  if (!after) return;
  if (after.status === "requested" && before?.status !== "requested") {
    const res = await requestPayout(after).catch((e) => ({ ok: false, mode: "error", message: String(e?.message || e) }));
    await db.collection("hubPayouts").doc(payoutId).update({ adapter: { ...res, at: FieldValue.serverTimestamp() }, ...(res.ok ? { status: res.status || "processing" } : {}), updatedAt: FieldValue.serverTimestamp() });
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
    if (r.ok) await serverNotice(db, FieldValue, `payout_${payoutId}`, { toUid: r.uid, orderId: r.orderId, type: "settle", title: "운임 지급 완료", body: `${r.route} 운임 ${won(r.amt)}이 지급되었습니다.` });
  }
}

module.exports = {
  DEPOSIT_PAY, CASH_PAY, PLATFORM_UID, LABEL, orderTotal, routeText, won, tsMs, serverNotice, runLedger,
  holdForOrder, releaseHold, settleOrder, cashFeeOnDeliver, collectDebts, creditCharge, applyAdjustment, requestPayout, onPayoutWrite,
};
