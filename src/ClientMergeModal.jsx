// ======================= src/ClientMergeModal.jsx =======================
// ⭐ 2026-11-17 거래처 합치기 창 — 거래처관리 › 기본거래처 › [거래처 합치기]
//  같은 회사가 이름 둘로 등록됐을 때(예: "큐런" · "큐런네트웍스 주식회사") 남길 이름 하나로 합친다.
//  ① 남길 거래처를 고르면 → 합칠 거래처 이름으로 등록된 오더 · 기록 건수를 먼저 세서 보여 준다
//  ② [합치기] → 오더 거래처명을 남길 이름으로 바꾸고(변경 이력 남김) · 고정거래처 · 정기오더 · 고정노선 · 배차표 ·
//     컨테이너 구간 · 영업 담당 · 정산 기록(명세서 단계 · 마감 · 미수금 메모 · 명세서 양식) · 비공개 운임 설정도 같이 바꾼다
//  ③ 남길 거래처에 옛 이름을 "다른 이름(aliases)"으로 남긴다 → 앞으로 옛 이름으로 들어오는 오더는 남길 이름으로 저장된다
//  ④ 합친 거래처 문서는 지운다(원래 내용은 남길 거래처 mergedFrom 에 남는다)
//  🔒 최종마감(경리 확인)된 달은 기본으로 건드리지 않는다 — 명세서 · 계산서가 이미 나간 달이 바뀌지 않게
//  계산(순수 함수)은 src/clientMerge.js · 테스트 scripts/clientMerge.test.mjs
import React from "react";
import { db, auth, DEFAULT_COMPANY } from "./firebase";
import { collection, doc, getDoc, getDocs, query, where, writeBatch, updateDoc, setDoc, arrayUnion } from "firebase/firestore";
import { kpConfirm } from "./kpDialog";
import { arDeskId } from "./SettleDesk";
import { normName, buildMergePatch, lockedSet, planOrders, planArDesk, renameRouteDoc, renamePrivateFareRules, chunks } from "./clientMerge";

const GRAD = "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)";
const BATCH = 400;
const ORDER_COLS = ["orders", "dispatch"];
const nameOf = (c) => String(c?.거래처명 || "").trim();
const keyOf = (c) => c?.id || nameOf(c);
const pcKey = (co) => String(co || "").trim().replace(/\//g, "_"); // PrivateFares.jsx 와 같은 문서 이름

// 이름으로 찾는 기록 — [컬렉션, 칸, 화면 이름]
const NAME_COLS = [
  ["fixedClients", "거래처명", "고정거래처"],
  ["recurringOrders", "order.거래처명", "정기오더"],
  ["routeBoards", "client", "배차표 양식"],
  ["freightJobs", "client", "컨테이너 · 해상 · 항공 구간"],
  ["salesAccounts", "client", "영업 거래처 담당"],
];
const getPath = (o, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), o);

export default function ClientMergeModal({ clients = [], initialIds = [], userCompany = "", onClose, onDone }) {
  // ⭐ 2026-11-17 거래처로 등록되지 않고 오더에만 적힌 이름(예: "큐런")도 넣을 수 있게 — 거래명세서에는 오더 거래처명으로 보여서 둘로 보였다
  const [extra, setExtra] = React.useState([]);
  const all = React.useMemo(() => [...(clients || []).filter((c) => nameOf(c)), ...extra], [clients, extra]);
  const [picked, setPicked] = React.useState(() => {
    const s = new Set(initialIds);
    return all.filter((c) => s.has(keyOf(c))).map(keyOf);
  });
  const pickedRows = picked.map((k) => all.find((c) => keyOf(c) === k)).filter(Boolean);
  // 남길 거래처 — 처음엔 이름이 가장 짧은 쪽(보통 "큐런"처럼 줄여 부르는 이름)
  const [targetKey, setTargetKey] = React.useState(() => {
    const rows = picked.map((k) => all.find((c) => keyOf(c) === k)).filter(Boolean);
    return rows.length ? keyOf([...rows].sort((a, b) => nameOf(a).length - nameOf(b).length)[0]) : "";
  });
  const target = pickedRows.find((c) => keyOf(c) === targetKey) || null;
  const sources = pickedRows.filter((c) => keyOf(c) !== targetKey);
  const company = String(target?.companyName || userCompany || DEFAULT_COMPANY).trim() || DEFAULT_COMPANY;
  const [mode, setMode] = React.useState("fill");
  const [includeLocked, setIncludeLocked] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [scan, setScan] = React.useState(null); // { loading, error, orders:[{col,id,data}], named:{col:[...]}, routes, ar, pf }
  const [busy, setBusy] = React.useState(null); // { pct, step }
  const [sure, setSure] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [result, setResult] = React.useState(null);
  const [scanTick, setScanTick] = React.useState(0); // 중간에 멈추면 다시 세기(이미 바뀐 오더는 빠진다)

  const sameCo = (d) => (String(d?.companyName || "").trim() || DEFAULT_COMPANY) === company;
  const srcNames = sources.map(nameOf);
  const srcKey = srcNames.join("\u0001") + "\u0002" + nameOf(target) + "\u0002" + company;

  // ① 영향 범위 세기 — 고른 거래처가 바뀔 때마다
  React.useEffect(() => {
    if (!target || !sources.length) { setScan(null); return undefined; }
    let alive = true;
    setScan({ loading: true });
    setSure(false);
    (async () => {
      try {
        const names = [...new Set(srcNames.filter(Boolean))];
        const orders = [];
        for (const col of ORDER_COLS) {
          for (const n of names) {
            const snap = await getDocs(query(collection(db, col), where("거래처명", "==", n)));
            snap.docs.forEach((d) => { const data = d.data() || {}; if (sameCo(data)) orders.push({ col, id: d.id, data }); });
          }
        }
        const named = {};
        for (const [col, field] of NAME_COLS) {
          named[col] = [];
          for (const n of [...names, nameOf(target)]) {
            try {
              const snap = await getDocs(query(collection(db, col), where(field, "==", n)));
              snap.docs.forEach((d) => { const data = d.data() || {}; if (sameCo(data)) named[col].push({ id: d.id, data, isTarget: n === nameOf(target) }); });
            } catch { /* 권한이 없는 기록(예: 영업 담당)은 건너뛴다 */ }
          }
        }
        let routes = [];
        try {
          const snap = await getDocs(collection(db, "fixedRoutes"));
          routes = snap.docs.filter((d) => sameCo(d.data())).map((d) => ({ id: d.id, patch: renameRouteDoc(d.data(), names, nameOf(target)) })).filter((r) => r.patch);
        } catch { routes.error = true; }
        let ar = [];
        try {
          const snap = await getDocs(query(collection(db, "arDesk"), where("companyName", "==", company)));
          ar = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch { ar.error = true; }
        let pf = null;
        try {
          const ref = doc(db, "privateFareSettings", pcKey(company));
          const s = await getDoc(ref);
          if (s.exists()) { const rules = renamePrivateFareRules(s.data()?.clients, names, nameOf(target)); if (rules) pf = { ref, rules, count: (s.data()?.clients || []).filter((r) => names.some((n) => normName(n) === normName(r?.name))).length }; }
        } catch { pf = { denied: true }; } // 비공개 운임은 지정된 분만 볼 수 있다
        if (alive) setScan({ orders, named, routes, ar, pf });
      } catch (e) {
        if (alive) setScan({ error: e?.code === "permission-denied" ? "권한이 없어 오더를 셀 수 없어요." : (e?.message || String(e)) });
      }
    })();
    return () => { alive = false; };
  }, [srcKey, scanTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // 계획 — 최종마감 달 포함 여부에 따라
  const plan = React.useMemo(() => {
    if (!scan || scan.loading || scan.error || !target) return null;
    const tName = nameOf(target);
    const locks = lockedSet(Array.isArray(scan.ar) ? scan.ar : []);
    const ord = planOrders(scan.orders.map((o) => ({ ...o.data, __col: o.col, __id: o.id })), { sources: srcNames, target: tName, locks, includeLocked });
    const arPlan = planArDesk(Array.isArray(scan.ar) ? scan.ar : [], { sources: srcNames, target: tName, locks, includeLocked, idOf: (...p) => arDeskId(company, ...p) });
    const named = {};
    NAME_COLS.forEach(([col]) => {
      const rows = scan.named[col] || [];
      const srcRows = rows.filter((r) => !r.isTarget);
      // 영업 담당은 남길 거래처에 담당이 이미 있으면 바꾸지 않는다(한 거래처에 담당 둘이 되지 않게)
      named[col] = col === "salesAccounts" && rows.some((r) => r.isTarget) ? { update: [], skip: srcRows } : { update: srcRows, skip: [] };
    });
    return { ord, arPlan, named };
  }, [scan, includeLocked, srcKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const lockedTotal = React.useMemo(() => {
    if (!scan || scan.loading || scan.error || !target) return 0;
    const locks = lockedSet(Array.isArray(scan.ar) ? scan.ar : []);
    return planOrders(scan.orders.map((o) => o.data), { sources: srcNames, target: nameOf(target), locks }).locked.length;
  }, [scan, srcKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = target ? buildMergePatch(target, sources, { mode }) : null;
  const FIELD_LABEL = { 사업자번호: "사업자번호", 대표자: "대표자", 업태: "업태", 종목: "종목", 이메일: "이메일", 주소: "주소" };

  const toggle = (c) => {
    const k = keyOf(c);
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
    if (c.__virtual && picked.includes(k)) setExtra((p) => p.filter((x) => keyOf(x) !== k));
    if (k === targetKey) setTargetKey("");
    setErr("");
  };
  const cands = q.trim() ? all.filter((c) => !picked.includes(keyOf(c)) && normName(nameOf(c)).includes(normName(q))).slice(0, 8) : [];
  const qName = q.trim();
  const canAddName = !!qName && !all.some((c) => normName(nameOf(c)) === normName(qName));
  const addVirtual = () => { const v = { 거래처명: qName, companyName: String(pickedRows.find((c) => !c.__virtual)?.companyName || userCompany || "").trim(), __virtual: true }; setExtra((p) => [...p, v]); setPicked((p) => [...p, qName]); setQ(""); setErr(""); };

  const summaryLines = () => {
    if (!plan) return [];
    const p = plan;
    const L = [`오더 ${p.ord.update.length.toLocaleString()}건 거래처명 변경`];
    if (p.ord.locked.length) L.push(`최종마감 달 오더 ${p.ord.locked.length.toLocaleString()}건은 그대로(예전 이름)`);
    NAME_COLS.forEach(([col, , label]) => { const n = p.named[col].update.length; if (n) L.push(`${label} ${n}건`); });
    if (scan.routes?.length) L.push(`고정노선 ${scan.routes.length}건`);
    if (p.arPlan.move.length) L.push(`정산 기록(명세서 · 마감 · 미수금 메모) ${p.arPlan.move.length}건`);
    if (scan.pf?.rules) L.push("비공개 운임 설정");
    return L;
  };

  // ② 합치기
  const run = async () => {
    if (busy) return;
    setErr("");
    if (!target) return setErr("남길 거래처를 골라 주세요.");
    if (!sources.length) return setErr("합칠 거래처를 하나 이상 골라 주세요.");
    if (sources.filter((s) => !s.__virtual).some((s) => (String(s.companyName || "").trim() || DEFAULT_COMPANY) !== company)) return setErr("같은 운송사 거래처끼리만 합칠 수 있어요.");
    if (!plan) return setErr("건수를 세는 중이에요. 잠시 뒤 다시 눌러 주세요.");
    if (!sure) return setErr("아래 확인 칸에 체크해 주세요.");
    const tName = nameOf(target);
    const ok = await kpConfirm(`${srcNames.map((n) => `"${n}"`).join(", ")} → "${tName}"(으)로 합칠까요?\n\n· ${summaryLines().join("\n· ")}\n· 합친 거래처 ${sources.length}곳은 목록에서 지워져요\n\n되돌릴 수 없어요.`);
    if (!ok) return;
    const me = auth.currentUser?.email || "";
    const now = Date.now();
    const res = { orders: 0, named: {}, routes: 0, ar: 0, pf: "", failed: [] };
    const step = (pct, s) => setBusy({ pct, step: s });
    try {
      // 1) 남길 거래처 — 빈 칸 채우기 · 다른 이름(먼저 저장해야 이 사이 들어오는 오더도 남길 이름으로 바뀐다)
      step(3, "남길 거래처 정보 저장 중");
      const { patch } = buildMergePatch(target, sources, { mode, by: me, at: now });
      await setDoc(doc(db, "clients", target.id || tName), { ...patch, ...(target.__virtual ? { 거래처명: tName, createdAt: now } : {}), companyName: company, mergedAt: now }, { merge: true }); // ⭐ 2026-11-17 오더에만 있던 이름을 남기면 그 이름으로 거래처를 새로 만든다

      // 2) 오더 — 400건씩
      const groups = chunks(plan.ord.update, BATCH);
      for (let i = 0; i < groups.length; i += 1) {
        step(5 + Math.round((i / Math.max(1, groups.length)) * 70), `오더 거래처명 바꾸는 중 (${(i * BATCH).toLocaleString()}/${plan.ord.update.length.toLocaleString()})`);
        const b = writeBatch(db);
        groups[i].forEach((o) => b.update(doc(db, o.__col, o.__id), {
          거래처명: tName, 최종수정자: me, _lastModified: Date.now(),
          history: arrayUnion({ at: now, user: me || "unknown", field: "거래처명", before: String(o.거래처명 || ""), after: tName, note: "거래처 합치기" }),
        }));
        await b.commit();
        res.orders += groups[i].length;
      }

      // 3) 이름으로 연결된 기록
      step(78, "고정거래처 · 정기오더 · 배차표 바꾸는 중");
      for (const [col, field, label] of NAME_COLS) {
        const rows = plan.named[col].update;
        if (!rows.length) continue;
        try {
          for (const part of chunks(rows, BATCH)) {
            const b = writeBatch(db);
            part.forEach((r) => b.update(doc(db, col, r.id), { [field]: tName }));
            await b.commit();
          }
          res.named[label] = rows.length;
        } catch (e) { res.failed.push(`${label}(${e?.code === "permission-denied" ? "권한 없음" : "저장 실패"})`); }
      }
      if (scan.routes?.length) {
        try {
          for (const part of chunks(scan.routes, BATCH)) { const b = writeBatch(db); part.forEach((r) => b.update(doc(db, "fixedRoutes", r.id), r.patch)); await b.commit(); }
          res.routes = scan.routes.length;
        } catch (e) { res.failed.push(`고정노선(${e?.code === "permission-denied" ? "권한 없음" : "저장 실패"})`); }
      }

      // 4) 정산 기록 — 남길 이름 문서로 옮기고 옛 문서는 지운다(화면이 새로 저장할 때 쓰는 문서 이름과 맞춘다)
      step(88, "정산 기록 옮기는 중");
      if (plan.arPlan.move.length) {
        try {
          for (const part of chunks(plan.arPlan.move, 200)) {
            const b = writeBatch(db);
            part.forEach((m) => { b.set(doc(db, "arDesk", m.toId), { ...m.data, companyName: company }); if (m.toId !== m.from.id) b.delete(doc(db, "arDesk", m.from.id)); });
            await b.commit();
          }
          res.ar = plan.arPlan.move.length;
        } catch (e) { res.failed.push(`정산 기록(${e?.code === "permission-denied" ? "권한 없음" : "저장 실패"})`); }
      }
      if (scan.pf?.rules) {
        try { await updateDoc(scan.pf.ref, { clients: scan.pf.rules, updatedAt: now, updatedBy: me }); res.pf = "바꿈"; }
        catch { res.failed.push("비공개 운임 설정(볼 권한이 있는 분이 직접 바꿔 주세요)"); }
      } else if (scan.pf?.denied) res.pf = "확인 못 함";

      // 5) 합친 거래처 문서 지우기
      step(96, "합친 거래처 정리 중");
      const b = writeBatch(db);
      sources.filter((s) => !s.__virtual).forEach((s) => b.delete(doc(db, "clients", s.id || nameOf(s)))); // 오더에만 있던 이름은 지울 거래처 문서가 없다
      await b.commit();
      step(100, "끝");
      const out = { target: tName, sources: srcNames, ...res, lockedOrders: plan.ord.locked.length, lockedYms: [...new Set(Object.values(plan.ord.bySource).flatMap((x) => x.lockedYms))].sort(), conflicts: plan.arPlan.conflict.length, salesSkip: plan.named.salesAccounts.skip.length };
      setResult(out);
      onDone?.(out);
    } catch (e) {
      setErr(`합치다가 멈췄어요. ${e?.code === "permission-denied" ? "저장 권한이 없어요." : (e?.message || e)}\n여기까지 바뀐 오더 ${res.orders.toLocaleString()}건은 그대로예요. 다시 [합치기]를 누르면 남은 것만 이어서 바꿔요.`);
      setScanTick((t) => t + 1);
    } finally { setBusy(null); }
  };

  const inp = "border border-gray-200 rounded-lg px-3 py-2 text-[14px] w-full focus:border-[#1B2B4B] outline-none";
  const by = plan?.ord.bySource || {};
  return (
    <div className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/45 p-3" data-testid="client-merge-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-[600px] max-w-full max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 flex items-center justify-between" style={{ background: GRAD }}>
          <h3 className="text-white font-bold text-[15px]">거래처 합치기</h3>
          <button type="button" onClick={onClose} disabled={!!busy} className="text-white/60 hover:text-white text-xl">✕</button>
        </div>

        {result ? (
          <div className="px-6 py-5 space-y-3" data-testid="client-merge-result">
            <div className="text-[16px] font-black text-[#0F1A30]">"{result.target}"(으)로 합쳤어요</div>
            <ul className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-4 py-3 text-[13.5px] text-[#3A4A66] leading-relaxed list-disc pl-8">
              <li>오더 {result.orders.toLocaleString()}건의 거래처명을 바꿨어요(변경 이력에 남아요)</li>
              {Object.entries(result.named).map(([k, n]) => <li key={k}>{k} {n}건</li>)}
              {result.routes > 0 && <li>고정노선 {result.routes}건</li>}
              {result.ar > 0 && <li>정산 기록 {result.ar}건을 옮겼어요</li>}
              {result.pf === "바꿈" && <li>비공개 운임 설정도 바꿨어요</li>}
              <li>옛 이름({result.sources.join(", ")})으로 들어오는 오더는 앞으로 "{result.target}"(으)로 저장돼요</li>
              {result.lockedOrders > 0 && <li><b>최종마감된 달({result.lockedYms.join(", ")}) 오더 {result.lockedOrders.toLocaleString()}건은 예전 이름 그대로</b> 뒀어요. 경리팀이 [일시해제]한 뒤 같은 이름으로 다시 거래처를 만들어 합치면 돼요.</li>}
              {result.conflicts > 0 && <li>같은 달 명세서 · 마감 기록이 양쪽에 다 있던 {result.conflicts}건은 예전 이름 기록 그대로 뒀어요</li>}
              {result.salesSkip > 0 && <li>영업 담당은 "{result.target}" 담당이 이미 있어서 그대로 뒀어요({result.salesSkip}건)</li>}
              {result.failed.map((f) => <li key={f} className="text-[#B42318] font-bold">못 바꾼 것: {f}</li>)}
            </ul>
            <div className="flex justify-end"><button type="button" onClick={onClose} className="h-10 px-5 rounded-lg text-white text-[13.5px] font-bold" style={{ background: GRAD }}>닫기</button></div>
          </div>
        ) : (
          <>
            <div className="px-6 py-5 space-y-4">
              <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-4 py-3 text-[13px] text-[#3A4A66] leading-relaxed">
                같은 회사가 이름 둘로 등록돼 있을 때 하나로 합쳐요. <b>남길 이름</b>을 고르면 나머지 이름으로 등록된 오더 · 정산 기록이 모두 남길 이름으로 바뀌어요.
                옛 이름은 "다른 이름"으로 남아서, 앞으로 옛 이름으로 들어오는 오더도 남길 이름으로 저장돼요.
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">고른 거래처: 남길 이름에 ● 표시</label>
                <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {pickedRows.length === 0 && <div className="px-3 py-3 text-[13px] text-gray-400">아래에서 합칠 거래처를 찾아 넣어 주세요.</div>}
                  {pickedRows.map((c) => {
                    const k = keyOf(c); const isT = k === targetKey; const s = by[nameOf(c)];
                    return (
                      <div key={k} className={`flex items-center gap-2 px-3 py-2 ${isT ? "bg-[#EEF3FC]" : ""}`}>
                        <button type="button" disabled={!!busy} onClick={() => { setTargetKey(k); setErr(""); }} data-testid="merge-target"
                          className={`flex-1 text-left text-[13.5px] ${isT ? "font-black text-[#0F1A30]" : "text-gray-700"}`}>
                          {isT ? "● " : "○ "}{nameOf(c)}
                          <span className="ml-1.5 text-[12px] font-semibold text-gray-400">{c.__virtual ? "오더에만 있는 이름" : [c.사업자번호, c.담당자].filter(Boolean).join(" · ")}</span>
                          {isT && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[#1B2B4B] text-white text-[11px] font-black">남길 이름</span>}
                        </button>
                        {!isT && target && (
                          <span className="text-[12.5px] font-bold text-[#2D4C82] whitespace-nowrap tabular-nums">
                            {scan?.loading ? "세는 중…" : s ? `오더 ${s.total.toLocaleString()}건${s.locked ? ` (마감 ${s.locked})` : ""}` : ""}
                          </span>
                        )}
                        <button type="button" disabled={!!busy} onClick={() => toggle(c)} className="text-[12px] text-gray-400 hover:text-gray-700 px-1">빼기</button>
                      </div>
                    );
                  })}
                </div>
                <input className={`${inp} mt-2`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="합칠 거래처 더 찾기(이름): 등록 안 된 이름도 넣을 수 있어요" autoComplete="off" disabled={!!busy} />
                {canAddName && (
                  <button type="button" onClick={addVirtual} disabled={!!busy} data-testid="merge-add-name" className="mt-1 w-full text-left px-3 py-2 rounded-lg border border-dashed border-[#9AA9C3] text-[13px] hover:bg-gray-50">
                    + "<b>{qName}</b>" 넣기 <span className="text-[12px] text-gray-500">거래처로 등록 안 된 이름(오더 · 거래명세서에만 있는 이름)</span>
                  </button>
                )}
                {cands.length > 0 && (
                  <div className="mt-1 rounded-lg border border-gray-200 divide-y divide-gray-100">
                    {cands.map((c) => <button key={keyOf(c)} type="button" onClick={() => { toggle(c); setQ(""); }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50">+ {nameOf(c)}</button>)}
                  </div>
                )}
              </div>

              {target && sources.length > 0 && (
                <>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1">남길 거래처 정보</label>
                    <div className="flex flex-col gap-1.5 text-[13.5px] text-[#0F1A30]">
                      <label className="flex items-start gap-2 cursor-pointer"><input type="radio" className="mt-1" checked={mode === "fill"} onChange={() => setMode("fill")} disabled={!!busy} />
                        <span><b>빈 칸만 채우기</b> — "{nameOf(target)}"에 비어 있는 사업자번호 · 주소 등을 합칠 거래처 값으로 채우고, 담당자 · 메모는 합쳐요
                          {mode === "fill" && preview?.filled.length > 0 && <span className="block text-[12px] text-[#2D4C82] font-bold">채워질 칸: {preview.filled.map((f) => FIELD_LABEL[f] || f).join(", ")}</span>}</span></label>
                      <label className="flex items-start gap-2 cursor-pointer"><input type="radio" className="mt-1" checked={mode === "keep"} onChange={() => setMode("keep")} disabled={!!busy} />
                        <span><b>"{nameOf(target)}" 정보 그대로</b> · 합칠 거래처 정보는 쓰지 않아요</span></label>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#E3E8F0] px-4 py-3 text-[13px] text-[#3A4A66]">
                    <div className="font-black text-[#0F1A30] mb-1">바뀌는 것</div>
                    {scan?.loading && <div>오더 · 기록 건수를 세고 있어요…</div>}
                    {scan?.error && <div className="text-[#B42318] font-bold">{scan.error}</div>}
                    {plan && <ul className="list-disc pl-5 leading-relaxed" data-testid="client-merge-summary">{summaryLines().map((l) => <li key={l}>{l}</li>)}
                      {plan.arPlan.conflict.length > 0 && <li>양쪽에 같은 달 명세서 · 마감 기록이 있는 {plan.arPlan.conflict.length}건은 예전 이름 기록 그대로 둬요</li>}
                      {plan.named.salesAccounts.skip.length > 0 && <li>영업 담당은 "{nameOf(target)}" 담당이 이미 있어 그대로 둬요</li>}
                      {scan.pf?.denied && <li>비공개 운임 설정은 볼 권한이 있는 분만 바꿀 수 있어요</li>}
                    </ul>}
                    {lockedTotal > 0 && (
                      <label className="mt-2 flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" className="mt-1" checked={includeLocked} onChange={(e) => setIncludeLocked(e.target.checked)} disabled={!!busy} data-testid="merge-include-locked" />
                        <span>최종마감된 달 오더 {lockedTotal.toLocaleString()}건도 바꾸기 <span className="text-gray-400">(보통은 끄고 두세요. 이미 나간 명세서 · 계산서와 이름이 달라져요)</span></span>
                      </label>
                    )}
                  </div>

                  <label className="flex items-start gap-2 rounded-xl border-2 border-[#2D4C82]/40 bg-[#F2F6FC] px-4 py-3 cursor-pointer">
                    <input type="checkbox" className="mt-1" checked={sure} onChange={(e) => setSure(e.target.checked)} disabled={!!busy || !plan} data-testid="merge-sure" />
                    <span className="text-[13px] text-[#0F1A30] leading-relaxed">
                      <b>{srcNames.join(", ")}</b>{sources.length > 1 ? "을" : "을(를)"} <b>{nameOf(target)}</b>(으)로 합치고, 합친 거래처는 목록에서 지워요. 되돌릴 수 없어요.
                    </span>
                  </label>
                </>
              )}
              {busy && (
                <div data-testid="client-merge-progress">
                  <div className="h-2 rounded-full bg-[#E3E8F0] overflow-hidden"><div className="h-full bg-[#2D4C82] transition-all" style={{ width: `${busy.pct}%` }} /></div>
                  <div className="mt-1 text-[12.5px] font-bold text-[#2D4C82]">{busy.step}</div>
                </div>
              )}
              {err && <div role="alert" className="whitespace-pre-line rounded-lg bg-[#F2F6FC] border border-[#2D4C82]/30 px-3 py-2 text-[13px] font-bold text-[#1B2B4B]">{err}</div>}
            </div>
            <div className="px-6 pb-5 flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={!!busy} className="h-10 px-4 rounded-lg border border-gray-200 text-[13.5px] font-bold text-gray-600 hover:bg-gray-50">취소</button>
              <button type="button" disabled={!!busy || !plan || !sources.length} onClick={run} data-testid="client-merge-save" className="h-10 px-5 rounded-lg text-white text-[13.5px] font-bold disabled:opacity-50" style={{ background: GRAD }}>
                {busy ? "합치는 중…" : "합치기"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
