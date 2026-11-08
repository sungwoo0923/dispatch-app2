// ======================= functions/bankSync.js =======================
// 🏦 2026-11-08 은행 입금 자동 조회(팝빌 계좌조회) → 미수금 자동 매칭 — 매칭 식은 functions/arMatchCore.mjs(화면 은행 엑셀 올리기와 같은 파일)
//  · syncAll(매시간 08~20시): 계좌를 켠 회사마다 새 입금만 받아 bankTxns에 저장(문서 id = 회사__계좌__거래id → 같은 거래는 한 번만)
//  · 새 입금은 곧바로 맞춰 본다 — 입금자명(배운 별칭 · 거래처 이름)이 맞고 딱 맞게 정산되면 자동 반영(auto),
//    아니면 입금 확인 목록(review)에 후보 거래처와 함께 둔다
//  · 반영 = 화면 "입금 처리"와 같은 기록: arPayments { company, client, yyyymm, amount, full, depositName, depositDate, at, by } + auto · source "bank" · bankTxnId
//    다 채운 달은 그 달 오더 정산상태.{월} = "정산완료"(되돌리기 위해 예전 값을 거래 문서에 남긴다)
//  · callable action: status · syncNow · confirm(거래처 확정 · 다른 거래처) · ignore · undo(자동 반영 되돌리기)
//  · 확정하면 입금자명 → 거래처 별칭을 회사마다 배운다(bankAliases/{회사}.map)
//  · 팝빌이 꺼져 있으면 팝빌을 부르지 않고 상태만 "off"로 남긴다
const err = (code, msg) => Object.assign(new Error(msg), { code });
const KST = 9 * 3600e3;
const ymd8 = (ms) => new Date(ms + KST).toISOString().slice(0, 10).replace(/-/g, "");
const ymdDash = (ms) => new Date(ms + KST).toISOString().slice(0, 10);

function makeBankSync({ db, FieldValue, getPopbill, callerOf, now = () => Date.now(), loadCore }) {
  let _core = null;
  const core = async () => _core || (_core = loadCore ? await loadCore() : await import("./arMatchCore.mjs"));
  const settingsRef = (co) => db.collection("popbillSettings").doc(co);
  const stateRef = (co) => db.collection("bankSyncState").doc(co);
  const aliasRef = (co) => db.collection("bankAliases").doc(co);

  async function accountsOf(co) {
    const s = await settingsRef(co).get().catch(() => null);
    const list = s?.exists ? s.data()?.bankAccounts : [];
    return (Array.isArray(list) ? list : []).filter((a) => a && a.id && a.bankCode && a.accountNumber);
  }
  async function aliasesOf(co) {
    const s = await aliasRef(co).get().catch(() => null);
    return (s?.exists && s.data()?.map) || {};
  }
  // 미정산 달(최근 13개월) — 회사 오더 + 입금 기록
  async function monthsOf(co) {
    const C = await core();
    const t = now();
    const d = new Date(t + KST); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 12);
    const from = d.toISOString().slice(0, 10);
    const orders = [];
    for (const col of ["dispatch", "orders"]) {
      const q = await db.collection(col).where("companyName", "==", co).where("상차일", ">=", from).get().catch(() => null);
      (q?.docs || []).forEach((x) => { const r = x.data() || {}; if (r.source === "transport_transmit") return; orders.push({ ...r, _id: x.id, __col: col }); });
    }
    const p = await db.collection("arPayments").where("company", "==", co).get().catch(() => null);
    const paidMap = C.arPaidMapOf((p?.docs || []).map((x) => x.data()));
    return C.buildArMonths({ orders, paidMap, inRange: (ym) => ym >= from.slice(0, 7) });
  }

  // 반영 — 입금 기록 만들고 다 채운 달은 정산완료로(예전 값은 applied에 남긴다)
  async function apply(co, txn, plan, by, auto) {
    const paymentIds = []; const applied = [];
    for (const a of plan.alloc) {
      const ref = db.collection("arPayments").doc();
      await ref.set({
        company: co, client: plan.client, yyyymm: a.yyyymm, amount: a.amount, full: !!a.full,
        depositName: txn.name || "", depositDate: txn.date || "", at: FieldValue.serverTimestamp(), by,
        auto: !!auto, source: "bank", bankTxnId: txn.id,
      });
      paymentIds.push(ref.id);
      if (!a.full) continue;
      for (const r of a.rows || []) {
        if (!r._id || !r.__col) continue;
        const prev = { status: r.정산상태?.[a.yyyymm] ?? null, date: r.정산일?.[a.yyyymm] ?? null };
        await db.collection(r.__col).doc(r._id).update({ [`정산상태.${a.yyyymm}`]: "정산완료", [`정산일.${a.yyyymm}`]: txn.date || ymdDash(now()) }).catch(() => null);
        applied.push({ col: r.__col, id: r._id, ym: a.yyyymm, prev });
      }
    }
    return { paymentIds, applied };
  }
  const slimPlan = (client, p, confidence) => ({ client, kind: p.kind, over: p.over || 0, confidence, alloc: p.alloc.map((a) => ({ yyyymm: a.yyyymm, amount: a.amount, full: !!a.full, due: a.due, rows: (a.rows || []).length })) });

  // 새 입금 맞춰 보기(자동 반영 or 확인 목록)
  async function matchNew(co, txns) {
    if (!txns.length) return { auto: 0, review: 0 };
    const C = await core();
    const months = await monthsOf(co);
    const aliases = await aliasesOf(co);
    const { matches, unmatched } = C.matchDeposits({ deposits: txns.map((t) => ({ ...t })), months, aliases });
    let auto = 0, review = 0;
    for (const m of matches) {
      const ref = db.collection("bankTxns").doc(m.deposit.id);
      if (C.isConfidentMatch(m)) {
        const plan = { client: m.client, alloc: m.alloc };
        const r = await apply(co, m.deposit, plan, "은행 자동 매칭", true);
        await ref.set({ status: "auto", match: slimPlan(m.client, m, m.confidence), ...r, decidedAt: now(), decidedBy: "auto" }, { merge: true });
        auto++;
      } else {
        await ref.set({ status: "review", reason: m.confidence === "금액만 일치" ? "입금자명이 거래처와 달라요" : m.kind, suggestions: [{ client: m.client, reason: `${m.confidence} · ${m.kind}`, score: 2 }, ...C.suggestClients(m.deposit, months).filter((s) => s.client !== m.client)].slice(0, 3), match: slimPlan(m.client, m, m.confidence) }, { merge: true });
        review++;
      }
    }
    for (const u of unmatched) {
      await db.collection("bankTxns").doc(u.id).set({ status: "review", reason: u.reason, suggestions: u.suggestions || [] }, { merge: true });
      review++;
    }
    return { auto, review };
  }

  // 한 회사 동기화
  async function syncCompany(co, { days = 3 } = {}) {
    const C = await core();
    const accounts = (await accountsOf(co)).filter((a) => a.enabled !== false);
    const st = await stateRef(co).get().catch(() => null);
    const prev = (st?.exists && st.data()) || {};
    const t = now();
    if (!accounts.length) return { company: co, skipped: "no-account" };
    const pb = await getPopbill();
    const member = (await db.collection("companyPopbill").doc(co).get().catch(() => null))?.data() || {};
    if (!pb?.enabled || !member.corpNum) {
      const reason = !pb?.enabled ? "팝빌 연결 전이에요" : "팝빌 연동회원 등록 전이에요";
      await stateRef(co).set({ companyName: co, status: "off", reason, checkedAt: t }, { merge: true });
      return { company: co, off: true, reason };
    }
    const accState = { ...(prev.accounts || {}) };
    const fresh = [];
    for (const a of accounts) {
      const last = accState[a.id]?.lastSyncAt || 0;
      const sMs = Math.max(t - days * 864e5, last ? last - 864e5 : 0);
      const r = await pb.bankTransactions(member.corpNum, { bankCode: a.bankCode, accountNumber: a.accountNumber, sDate: ymd8(sMs), eDate: ymd8(t), tradeType: ["I"], userId: member.userId || null });
      if (!r.ok) { accState[a.id] = { ...(accState[a.id] || {}), status: "error", lastError: String(r.error || "조회하지 못했어요").slice(0, 200), checkedAt: t }; continue; }
      const cand = C.newDeposits(r.list, [], co, a.id);
      let added = 0;
      for (const d of cand) {
        const ref = db.collection("bankTxns").doc(d.id);
        try {
          await ref.create({ companyName: co, accountId: a.id, bankCode: a.bankCode, bankName: C.bankNameOf(a.bankCode), account: C.maskAccount(a.accountNumber), tid: d.tid, date: d.date, time: d.time, amount: d.amount, name: d.name, memo: d.memo, balance: d.balance, status: "new", createdAt: t });
          fresh.push(d); added++;
        } catch (e) {
          if (!(e?.code === 6 || /already exists/i.test(String(e?.message || "")))) throw e;
        }
      }
      accState[a.id] = { status: "ok", lastError: "", lastSyncAt: t, checkedAt: t, lastCount: added, total: (accState[a.id]?.total || 0) + added };
    }
    const m = await matchNew(co, fresh);
    await stateRef(co).set({ companyName: co, status: "ok", reason: "", checkedAt: t, accounts: accState, lastNew: fresh.length, lastAuto: m.auto, lastReview: m.review }, { merge: true });
    return { company: co, new: fresh.length, ...m };
  }

  async function syncAll() {
    const s = await db.collection("popbillSettings").limit(500).get().catch(() => null);
    const out = [];
    for (const d of s?.docs || []) {
      const list = d.data()?.bankAccounts;
      if (!Array.isArray(list) || !list.some((a) => a && a.enabled !== false && a.accountNumber)) continue;
      out.push(await syncCompany(d.id).catch((e) => ({ company: d.id, error: String(e?.message || e).slice(0, 200) })));
    }
    return out;
  }

  // ── callable ──
  async function whoOf(auth, data, { write = false } = {}) {
    const who = await callerOf(db, auth);
    if (who.tier !== "staff") throw err("permission-denied", "운송사 직원만 쓸 수 있어요");
    const u = await db.collection("users").doc(auth.uid).get().catch(() => null);
    if (write && u?.data()?.role === "viewer") throw err("permission-denied", "조회전용 권한으로는 바꿀 수 없어요");
    const co = String((who.isTM ? data?.company || who.co : who.co) || "").trim();
    if (!co || co.includes("/")) throw err("invalid-argument", "회사를 골라 주세요");
    return { ...who, co };
  }
  async function txnOf(co, id) {
    if (!id || String(id).includes("/")) throw err("invalid-argument", "입금을 다시 골라 주세요");
    const s = await db.collection("bankTxns").doc(String(id)).get();
    if (!s.exists) throw err("not-found", "입금 내역을 찾지 못했어요");
    const t = { ...(s.data() || {}), id: s.id };
    if (t.companyName !== co) throw err("permission-denied", "우리 회사 입금만 처리할 수 있어요");
    return t;
  }
  async function undoTxn(t) {
    for (const pid of t.paymentIds || []) await db.collection("arPayments").doc(pid).delete().catch(() => null);
    for (const a of t.applied || []) {
      await db.collection(a.col).doc(a.id).update({
        [`정산상태.${a.ym}`]: a.prev?.status == null ? FieldValue.delete() : a.prev.status,
        [`정산일.${a.ym}`]: a.prev?.date == null ? FieldValue.delete() : a.prev.date,
      }).catch(() => null);
    }
  }

  async function action(data, auth) {
    const act = String(data?.action || "");
    const C = await core();
    if (act === "status") {
      const who = await whoOf(auth, data);
      const pb = await getPopbill();
      const member = (await db.collection("companyPopbill").doc(who.co).get().catch(() => null))?.data() || null;
      const st = (await stateRef(who.co).get().catch(() => null))?.data() || null;
      let registered = null;
      if (data?.checkAccounts && pb?.enabled && member?.corpNum) {
        const r = await pb.bankAccountList(member.corpNum, { userId: member.userId || null });
        registered = r.ok ? (r.accounts || []).map((x) => ({ bankCode: String(x.bankCode || ""), account: C.maskAccount(x.accountNumber), state: x.state ?? null })) : { error: r.error };
      }
      return { company: who.co, popbill: { enabled: !!pb?.enabled, reason: pb?.reason || "" }, member: member ? { status: member.status || "미등록", hasCorp: !!member.corpNum } : null, state: st, registered };
    }
    const who = await whoOf(auth, data, { write: true });
    const co = who.co;
    if (act === "syncNow") return syncCompany(co, { days: Math.min(31, Math.max(1, Number(data?.days) || 3)) });
    const t = await txnOf(co, data?.id);
    if (act === "ignore") {
      if (!["review", "new"].includes(t.status)) throw err("failed-precondition", "확인 대기 중인 입금만 넘길 수 있어요");
      await db.collection("bankTxns").doc(t.id).set({ status: "ignored", decidedAt: now(), decidedBy: auth.uid }, { merge: true });
      return { id: t.id, status: "ignored" };
    }
    if (act === "undo") {
      if (!["auto", "confirmed"].includes(t.status)) throw err("failed-precondition", "반영된 입금만 되돌릴 수 있어요");
      await undoTxn(t);
      await db.collection("bankTxns").doc(t.id).set({ status: "review", reason: "되돌린 입금이에요", paymentIds: [], applied: [], undoneAt: now(), undoneBy: auth.uid }, { merge: true });
      return { id: t.id, status: "review" };
    }
    if (act === "confirm") {
      if (!["review", "new", "ignored"].includes(t.status)) throw err("failed-precondition", "이미 처리한 입금이에요");
      const client = String(data?.client || t.match?.client || t.suggestions?.[0]?.client || "").trim();
      if (!client) throw err("invalid-argument", "거래처를 골라 주세요");
      const months = await monthsOf(co);
      const p = C.planForClient(months, client, Number(t.amount) || 0);
      if (!p.alloc.length) throw err("failed-precondition", `${client}에 남은 미수금이 없어요`);
      const r = await apply(co, t, { client, alloc: p.alloc }, auth.token?.email || auth.uid, false);
      await db.collection("bankTxns").doc(t.id).set({ status: "confirmed", match: slimPlan(client, p, "확인"), ...r, decidedAt: now(), decidedBy: auth.uid }, { merge: true });
      const al = C.aliasFor(t.name, client);
      if (al) await aliasRef(co).set({ companyName: co, map: { [al.key]: client }, updatedAt: now() }, { merge: true });
      return { id: t.id, status: "confirmed", client, kind: p.kind, learned: !!al };
    }
    throw err("invalid-argument", "알 수 없는 요청이에요");
  }

  return { syncAll, syncCompany, matchNew, action, monthsOf };
}

module.exports = { makeBankSync };
