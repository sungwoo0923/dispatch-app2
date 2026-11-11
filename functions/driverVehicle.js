// functions/driverVehicle.js
// ⭐ 2026-11-11 기사 차량 변경 · 휴대폰번호 로그인
//  [배경] 기사 계정이 "차량번호@driver.run25.kr / 비밀번호 = 차량번호"라, 기사님이 다른 차량으로 옮기면 새 차량번호로는
//         로그인이 안 되고, 새로 가입하면 정산을 차량번호별로 따로 봐야 했다.
//  ① driverChangeVehicle : 배차자(그 운송사 직원)가 기사의 차량을 바꾼다. 계정은 그대로 두고
//       · drivers/{id} 차량번호·carNo + 차량이력(언제부터 어느 차량) · users/{uid}.carNo
//       · 로그인 계정(메일·비밀번호)을 새 차량번호로 → 새 차량번호로도 바로 로그인된다
//       · 새 차량을 이미 다른 기사 계정이 쓰고 있으면 HOLDER 로 알려주고, holderAction("swap" 맞교환 | "unassign" 미배정)을 받아 처리
//  ② driverPhoneLogin   : 기사앱 로그인 — 소속 운송사 + 휴대폰번호(전체) + 이름으로 그 기사의 로그인 계정을 찾아 준다.
//       차량이 바뀌어도 휴대폰번호는 그대로라 기사님은 늘 같은 정보로 로그인한다. (로그인 전 공개 함수 — 요청 수 제한)
"use strict";
const V = require("./driverVehicleCore");

module.exports = function makeDriverVehicle({ functions, db, getAuth, FieldValue, helpers }) {
  const { cors, bearerUser, isStaffOf, limited, clientIp } = helpers;
  const toMs = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : Number(v?.seconds ? v.seconds * 1000 : v) || 0);
  const ownerOf = (email) => getAuth().getUserByEmail(email).then((u) => u.uid).catch(() => null);

  // uid 기사가 plate 차량으로 쓸 로그인 메일 — { email } | { holder: 그 차량을 쓰는 같은 회사 다른 계정 uid }
  async function resolveEmail(plate, uid, co) {
    const leg = V.legacyEmail(plate);
    const o = await ownerOf(leg);
    if (!o || o === uid) return { email: leg };
    const ou = await db.collection("users").doc(o).get();
    // 예전 계정 주인이 같은 회사 기사면 그 기사가 이 차량을 쓰는 중
    if (ou.exists && V.sameCo(ou.data().companyName, co)) return { holder: o, email: leg };
    const sc = V.scopedEmail(co, plate);
    const o2 = await ownerOf(sc);
    if (!o2 || o2 === uid) return { email: sc };
    return { holder: o2, email: sc };
  }

  const driverChangeVehicle = functions.https.onRequest(async (req, res) => {
    if (cors(req, res)) return;
    if (req.method !== "POST") { res.status(405).json({ error: "POST_ONLY" }); return; }
    try {
      const tok = await bearerUser(req);
      if (!tok) { res.status(401).json({ error: "NO_TOKEN" }); return; }
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const driverId = String(b.driverId || "").trim();
      if (!driverId || driverId.length > 200 || driverId.includes("/")) { res.status(400).json({ error: "BAD_PARAMS" }); return; }
      const ref = db.collection("drivers").doc(driverId);
      const snap = await ref.get();
      if (!snap.exists) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      const d = snap.data() || {};
      const co = V.coOf(d.companyName);
      if (!(await isStaffOf(tok, co))) { res.status(403).json({ error: "FORBIDDEN" }); return; }
      if (await limited(res, [[`dcv:uid:${tok.uid}`, 120, 10 * 60e3]])) return;

      const newPlate = V.plateOf(b.carNo);
      if (!V.plateValid(newPlate)) { res.status(200).json({ ok: false, code: "BAD_PLATE" }); return; }
      const today = V.kstDay();
      const date = b.date ? String(b.date) : today;
      if (!V.dayValid(date) || date > today || date < V.addDays(today, -366)) { res.status(200).json({ ok: false, code: "BAD_DATE" }); return; }
      const holderAction = ["swap", "unassign"].includes(b.holderAction) ? b.holderAction : "";
      const oldPlate = V.plateOf(d.차량번호 || d.carNo);
      if (oldPlate === newPlate) { res.status(200).json({ ok: true, same: true, carNo: newPlate, 차량이력: d.차량이력 || [] }); return; }
      const by = String(tok.name || tok.email || tok.uid);
      const now = FieldValue.serverTimestamp();
      const auth = getAuth();

      // 기사앱 계정이 있는지 — drivers/{uid}(가입·연결된 기사) + users/{uid}(role driver) + 로그인 계정
      const uid = String(d.uid || driverId);
      const [uSnap, aUser] = await Promise.all([db.collection("users").doc(uid).get(), auth.getUser(uid).catch(() => null)]);
      const hasAccount = !!aUser && uSnap.exists && uSnap.data().role === "driver" && String(aUser.email || "").toLowerCase().endsWith(`@${V.DOMAIN}`);

      const hist = V.applyHistory(d.차량이력, { oldPlate, newPlate, date, by });
      if (!hasAccount) {
        // 앱 미가입 기사 — 문서만 바꾼다
        await ref.update({ 차량번호: newPlate, carNo: newPlate, 차량이력: hist, updatedAt: now });
        console.log(`🚚 차량 변경(앱 미가입): ${co} ${driverId} ${oldPlate} → ${newPlate}`);
        res.status(200).json({ ok: true, carNo: newPlate, 차량이력: hist, account: false });
        return;
      }

      const r = await resolveEmail(newPlate, uid, co);
      let holder = null; // { uid, name, plate, ref, data }
      if (r.holder) {
        const [hu, hd] = await Promise.all([db.collection("users").doc(r.holder).get(), db.collection("drivers").doc(r.holder).get()]);
        holder = { uid: r.holder, name: (hd.exists && (hd.data().이름 || hd.data().name)) || (hu.exists && hu.data().name) || "", hasUser: hu.exists, drv: hd.exists ? hd : null };
        if (!holderAction) {
          res.status(200).json({ ok: false, code: "HOLDER", holder: { name: holder.name, carNo: newPlate }, canSwap: !!oldPlate });
          return;
        }
      }

      const prevLogin = { email: aUser.email };
      let holderPlate = "";
      let holderEmail = "";
      if (holder) {
        // ① 그 차량을 쓰던 기사를 먼저 미배정 계정으로 비운다
        const hAuth = await auth.getUser(holder.uid);
        holderEmail = V.nocarEmail(holder.uid);
        await auth.updateUser(holder.uid, { email: holderEmail, password: V.nocarLocal(holder.uid) });
        try {
          // ② 이 기사를 새 차량으로
          await auth.updateUser(uid, { email: r.email, password: newPlate });
        } catch (e) {
          await auth.updateUser(holder.uid, { email: hAuth.email, password: newPlate }).catch(() => {});
          throw e;
        }
        // ③ 맞교환이면 그 기사를 이 기사가 타던 차량으로(안 되면 미배정으로 둔다)
        if (holderAction === "swap" && V.plateValid(oldPlate)) {
          const hr = await resolveEmail(oldPlate, holder.uid, co);
          if (!hr.holder) {
            try { await auth.updateUser(holder.uid, { email: hr.email, password: oldPlate }); holderPlate = oldPlate; holderEmail = hr.email; } catch (e) { console.warn("맞교환 계정 변경 실패(미배정으로 둠):", e?.message || e); }
          }
        }
      } else {
        await auth.updateUser(uid, { email: r.email, password: newPlate });
      }

      const batch = db.batch();
      batch.update(ref, { 차량번호: newPlate, carNo: newPlate, 차량이력: hist, updatedAt: now });
      batch.update(uSnap.ref, { carNo: newPlate, email: r.email });
      if (holder) {
        if (holder.hasUser) batch.update(db.collection("users").doc(holder.uid), { carNo: holderPlate, email: holderEmail });
        if (holder.drv) {
          const hd = holder.drv.data() || {};
          const hHist = V.applyHistory(hd.차량이력, { oldPlate: V.plateOf(hd.차량번호 || hd.carNo) || newPlate, newPlate: holderPlate, date, by });
          batch.update(holder.drv.ref, { 차량번호: holderPlate, carNo: holderPlate, 차량이력: hHist, updatedAt: now });
        }
      }
      try {
        await batch.commit();
      } catch (e) {
        // 문서를 못 바꿨으면 이 기사의 로그인 계정은 되돌린다
        if (!holder) await auth.updateUser(uid, { email: prevLogin.email, password: oldPlate || V.nocarLocal(uid) }).catch(() => {});
        throw e;
      }
      console.log(`🚚 차량 변경: ${co} ${uid} ${oldPlate} → ${newPlate}${holder ? ` (기존 ${holder.uid} → ${holderPlate || "미배정"})` : ""}`);
      res.status(200).json({
        ok: true, carNo: newPlate, 차량이력: hist, account: true,
        holder: holder ? { name: holder.name, carNo: holderPlate } : null,
      });
    } catch (e) {
      console.error("driverChangeVehicle 실패:", e);
      res.status(500).json({ error: "FAILED" });
    }
  });

  const driverPhoneLogin = functions.https.onRequest(async (req, res) => {
    if (cors(req, res)) return;
    if (req.method !== "POST") { res.status(405).json({ error: "POST_ONLY" }); return; }
    try {
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const co = String(b.companyName || "").trim().slice(0, 100);
      const name = String(b.name || "").trim().slice(0, 40);
      const phone = V.digits(String(b.phone || "").slice(0, 30));
      if (!co || !name || !V.phoneValid(phone)) { res.status(400).json({ error: "BAD_PARAMS" }); return; }
      if (await limited(res, [[`dpl:ip:${clientIp(req)}`, 30, 10 * 60e3], [`dpl:ph:${phone}`, 12, 10 * 60e3]])) return;
      const vars = V.phoneVariants(phone);
      const [us, d1, d2] = await Promise.all([
        db.collection("users").where("phone", "in", vars).get(),
        db.collection("drivers").where("전화번호", "in", vars).get(),
        db.collection("drivers").where("phone", "in", vars).get(),
      ]);
      const users = new Map();
      us.docs.forEach((s) => users.set(s.id, s.data() || {}));
      const pres = [];
      const needUser = new Set();
      const seenDrv = new Set();
      [...d1.docs, ...d2.docs].forEach((s) => {
        if (seenDrv.has(s.id)) return;
        seenDrv.add(s.id);
        const x = s.data() || {};
        const linked = String(x.uid || "");
        if (linked) { if (!users.has(linked)) needUser.add(linked); return; }
        if (users.has(s.id)) return;
        pres.push({ pre: true, id: s.id, companyName: x.companyName, name: x.이름 || x.name, carNo: V.plateOf(x.차량번호 || x.carNo), approved: true, createdAt: toMs(x.createdAt) });
      });
      // 기사관리에서만 번호를 고친 기사(users.phone은 옛 번호) — 연결된 계정을 읽어 온다
      await Promise.all([...needUser].slice(0, 10).map(async (id) => {
        const s = await db.collection("users").doc(id).get();
        if (s.exists) users.set(id, s.data() || {});
      }));
      const cands = [...users].filter(([, u]) => u.role === "driver").map(([id, u]) => ({
        uid: id, companyName: u.companyName, name: u.name, carNo: String(u.carNo || ""), approved: u.approved === true,
        retired: String(u.employmentStatus || "").trim() === "퇴사", createdAt: toMs(u.createdAt),
      })).concat(pres.filter((p) => p.carNo));
      const m = V.pickPhoneMatch(cands, { companyName: co, name });
      if (!m.ok) { res.status(200).json({ ok: false, code: m.code }); return; }
      if (m.pick.pre) { res.status(200).json({ ok: true, pre: true, carNo: m.pick.carNo }); return; }
      const au = await getAuth().getUser(m.pick.uid).catch(() => null);
      if (!au?.email) { res.status(200).json({ ok: false, code: "NOT_FOUND" }); return; }
      if (au.disabled) { res.status(200).json({ ok: false, code: "DISABLED" }); return; }
      res.status(200).json({ ok: true, email: au.email, carNo: m.pick.carNo });
    } catch (e) {
      console.error("driverPhoneLogin 실패:", e);
      res.status(500).json({ error: "FAILED" });
    }
  });

  return { driverChangeVehicle, driverPhoneLogin };
};
