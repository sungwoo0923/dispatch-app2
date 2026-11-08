// ======================= functions/alimtalk.js =======================
// 💬 2026-11-08 카카오 알림톡 배차 알림(팝빌) — 규칙은 functions/alimtalkCore.mjs(화면과 같은 파일)
//  · onOrderWrite: 오더(dispatch · orders) 쓰기마다 — 배차완료가 된 순간 + 오더 알림톡: true + 그 배차로 아직 안 보냈으면 보낸다
//  · sendManual(callable): 오더 화면 [알림톡 보내기] — 같은 배차라도 다시 보낸다
//  · 보내기 전에 alimtalkLogs/{오더_차량번호_받는사람}을 create()로 먼저 만든다 → 트리거가 두 번 돌아도 한 번만 나간다
//  · 팝빌이 꺼져 있으면(키 · 연동회원 없음) 보내지 않고 기록만 "off"(팝빌 연결 전)로 남긴다
//  · 알림톡이 실패하면 문자(장문)로 다시 보낸다 — 회사 설정 smsFallback이 꺼져 있으면 안 보냄
//  · 기록(alimtalkLogs)에는 번호 가운데를 가리고, 내용 · 비밀값은 남기지 않는다
const COLS = ["dispatch", "orders"];
const err = (code, msg) => Object.assign(new Error(msg), { code });

function makeAlimtalk({ db, FieldValue, getPopbill, callerOf, now = () => Date.now(), loadCore }) {
  let _core = null;
  const core = async () => _core || (_core = loadCore ? await loadCore() : await import("./alimtalkCore.mjs"));

  async function settingsOf(co) {
    const C = await core();
    const s = await db.collection("popbillSettings").doc(co).get().catch(() => null);
    return C.alimtalkSettingsOf(s?.exists ? s.data() : {});
  }
  async function corpOf(co) {
    const s = await db.collection("companyPopbill").doc(co).get().catch(() => null);
    return s?.exists ? s.data() || {} : {};
  }
  async function findClient(co, name) {
    if (!name) return null;
    const q = await db.collection("clients").where("companyName", "==", co).where("거래처명", "==", name).limit(1).get().catch(() => null);
    if (q?.docs?.length) return q.docs[0].data();
    const p = await db.collection("places").where("companyName", "==", co).where("업체명", "==", name).limit(1).get().catch(() => null);
    return p?.docs?.length ? p.docs[0].data() : null;
  }
  async function findDriver(co, plate) {
    if (!plate) return null;
    const C = await core();
    const q = await db.collection("drivers").where("companyName", "==", co).where("차량번호", "==", String(plate).trim()).limit(1).get().catch(() => null);
    if (q?.docs?.length) return q.docs[0].data();
    const all = await db.collection("drivers").where("companyName", "==", co).limit(500).get().catch(() => null);
    return (all?.docs || []).map((d) => d.data()).find((d) => C.normPlate(d.차량번호) === C.normPlate(plate)) || null;
  }
  // 이미 있으면 false(다른 실행이 이미 보냈거나 보내는 중)
  async function claim(ref, data) {
    try { await ref.create(data); return true; } catch (e) {
      if (e?.code === 6 || /already exists/i.test(String(e?.message || ""))) return false;
      throw e;
    }
  }

  // 한 오더 보내기 — { status, items } (오더에 알림톡결과로도 남긴다)
  async function sendFor({ col, id, order, force = false, targets = null, by = "auto" }) {
    const C = await core();
    const co = String(order.companyName || "돌캐");
    const settings = await settingsOf(co);
    const plate = C.normPlate(order.차량번호);
    const want = (targets && targets.length ? targets : C.ALIMTALK_TARGETS).filter((t) => (t === "client" ? settings.toClient : settings.toDriver));
    const at = now();
    if (!want.length) return { status: "skipped", items: {}, reason: "받는 사람 설정이 모두 꺼져 있어요" };
    const member = await corpOf(co);
    const pb = await getPopbill();
    const popOn = !!pb?.enabled && !!member.corpNum;
    const [client, driver] = await Promise.all([
      want.includes("client") ? findClient(co, order.거래처명) : null,
      findDriver(co, order.차량번호),
    ]);
    const vars = C.buildAlimtalkVars(order, { company: member.corpName || co, contactPhone: settings.contactPhone || settings.senderNumber, driverName: driver?.이름, driverPhone: driver?.전화번호 });
    const items = {};
    for (const t of want) {
      const key = C.alimtalkKey(col, id, plate, t) + (force ? `_r${at}` : "");
      const ref = db.collection("alimtalkLogs").doc(key);
      const rc = C.recipientFor(t, order, { client, driver });
      const base = { companyName: co, col, orderId: id, target: t, plate, phone: C.maskPhone(rc.phone), by, manual: !!force, createdAt: at };
      if (!(await claim(ref, { ...base, status: "sending" }))) { items[t] = { status: "dup", at }; continue; }
      let r;
      if (!rc.phone) r = { status: "skipped", error: rc.reason };
      else if (!popOn) r = { status: "off", error: !pb?.enabled ? "팝빌 연결 전이에요" : "팝빌 연동회원 등록 전이에요" };
      else if (!settings.templates?.[t]) r = { status: "failed", error: "템플릿 코드가 없어요(회사정보 › 알림톡 설정)" };
      else r = await deliver(pb, member, settings, t, rc, C.alimtalkContent(t, vars), key);
      items[t] = { ...r, at: now() };
      await ref.set({ ...base, ...r, doneAt: now() }, { merge: true });
    }
    Object.keys(items).forEach((k) => { if (items[k].status === "dup") delete items[k]; });
    if (!Object.keys(items).length) return { status: "dup", items: {} };
    const status = C.overallStatus(items);
    const result = { status, at, plate, by, items };
    await db.collection(col).doc(id).set({ 알림톡결과: result }, { merge: true }).catch(() => {});
    return result;
  }

  async function deliver(pb, member, settings, t, rc, content, key) {
    const C = await core();
    const sender = C.onlyDigits(settings.senderNumber);
    const k = await pb.sendKakaoAlimtalk(member.corpNum, {
      templateCode: settings.templates[t], sender, content, receiver: rc.phone, receiverName: rc.name,
      // 접수 뒤 카톡을 못 받는 번호(카톡 미사용 등)는 팝빌이 같은 내용을 문자로 대신 보낸다("C") · 접수 자체가 실패하면 아래에서 직접 문자
      altSendType: settings.smsFallback !== false && sender ? "C" : "", altSubject: C.ALIMTALK_TEMPLATES[t].name, requestNum: "", userId: member.userId || null,
    });
    if (k?.ok) return { status: "sent", channel: "kakao", receiptNum: String(k.receiptNum || "") };
    const kErr = String(k?.error || "알림톡을 보내지 못했어요").slice(0, 200);
    if (settings.smsFallback === false || !sender) return { status: "failed", channel: "kakao", error: sender ? kErr : `${kErr} · 발신번호가 없어 문자도 못 보냈어요` };
    const s = await pb.sendLms(member.corpNum, { sender, receiver: rc.phone, receiverName: rc.name, subject: C.ALIMTALK_TEMPLATES[t].name, content, userId: member.userId || null });
    if (s?.ok) return { status: "sms", channel: "sms", receiptNum: String(s.receiptNum || ""), kakaoError: kErr };
    return { status: "failed", channel: "sms", error: `${kErr} · 문자도 실패: ${String(s?.error || "").slice(0, 120)}` };
  }

  // Firestore 트리거 본문
  async function onOrderWrite({ col, id, before, after }) {
    if (!COLS.includes(col) || !after) return { skipped: "col" };
    const C = await core();
    const d = C.shouldSendAlimtalk(before, after);
    if (!d.send) return { skipped: d.reason };
    return sendFor({ col, id, order: after, by: "auto" });
  }

  // callable — { col, id, targets? }
  async function sendManual(data, auth) {
    const who = await callerOf(db, auth);
    if (who.tier !== "staff") throw err("permission-denied", "운송사 직원만 보낼 수 있어요");
    const u = await db.collection("users").doc(auth.uid).get().catch(() => null);
    if (u?.data()?.role === "viewer") throw err("permission-denied", "조회전용 권한으로는 보낼 수 없어요");
    const col = String(data?.col || "");
    const id = String(data?.id || "");
    if (!COLS.includes(col) || !id || id.includes("/")) throw err("invalid-argument", "오더를 다시 골라 주세요");
    const s = await db.collection(col).doc(id).get();
    if (!s.exists) throw err("not-found", "오더를 찾지 못했어요");
    const order = s.data() || {};
    if (!who.isTM && String(order.companyName || "돌캐") !== who.co) throw err("permission-denied", "우리 회사 오더만 보낼 수 있어요");
    const C = await core();
    if (!C.isAssignedDone(order)) throw err("failed-precondition", "배차완료된 오더만 보낼 수 있어요");
    const targets = Array.isArray(data?.targets) ? data.targets.filter((t) => C.ALIMTALK_TARGETS.includes(t)) : null;
    return sendFor({ col, id, order, force: true, targets, by: auth.uid });
  }

  return { onOrderWrite, sendManual, sendFor };
}

module.exports = { makeAlimtalk };
