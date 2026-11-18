// ======================= src/PrivateFareVault.jsx =======================
// 🔐 2026-11-18 비공개 운임(임원 화면) — 최고관리자가 관리자센터에서 지정한 사람만 보는 "실제 청구 금액" 금고(사용자 요청)
//  · 직원들은 청구운임 10만원으로 알고 있어도, 이 사람이 정한 금액(예: 15만원)으로 따로 계산해 매출 · 차액(내 몫)을 보여 준다
//  · 들어갈 때 비밀번호(4~8자 숫자 · 영문 키패드) — 서버가 확인(functions/privateFarePin.js) · 30분 · 10분 손대지 않으면 다시 잠김
//  · 금액은 오더 문서에 쓰지 않는다 — privateFareVaults/{내 uid}(규칙) · /fares/{오더 id}(오더별 금액) · 보안 규칙이 본인 + 잠금 해제 동안만 연다
//  · 계산 순서(src/privateFareCore.js): 오더별 직접 입력 → 노선 규칙 → 거래처 규칙
//  화면: 한눈에(대시보드) · 오더별 · 금액 설정 / 머리: 금액 가리기 · 내보내기 · 잠그기
import React from "react";
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { db, auth, FUNCTIONS_BASE } from "./firebase";
import { useLoadOrderRange, monthStartAgo, monthEnd } from "./orderHistory";
import { EX, EX_NUM, EX_FONT, GOLD_GRAD, ExecPage, ExecPanel, ExecKpis, ExecGrid, Kpi, ExecTabs, ExecButton, ExecTable, Chip, Empty, Meter, RankBars, chartTheme, ExecTooltip, Legend, fmtWon, fmtMoney } from "./execUi";
import { usePrivateFareGrant } from "./privateFareGrant";
import { PF_MODES, privateRows, privateOf, summarize, groupBy, monthly, routeSuggestions, toNum, normName, orderId, orderDate, routeLabel, isCanceled } from "./privateFareCore";

const IDLE_MS = 10 * 60 * 1000;
const PIN_MAX = 8;
const PIN_MIN = 4;
const kstYm = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
const addMonth = (ym, n) => { const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const coKey = (co) => String(co || "").trim().replace(/\//g, "_");
const won = (n) => `${fmtWon(n)}원`;

async function call(name, data) {
  const token = await auth.currentUser?.getIdToken?.();
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ data: data || {} }) });
  let j = {};
  try { j = await res.json(); } catch { /* 무시 */ }
  if (!res.ok || j.error) { const e = new Error(j.error?.message || `요청 실패(${res.status})`); e.status = j.error?.status || ""; throw e; }
  return j.result;
}
const api = {
  status: (touch = false) => call("pfPinStatus", touch ? { touch: true } : {}),
  verify: (pin) => call("pfPinVerify", { pin }),
  set: (newPin, currentPin = "") => call("pfPinSet", { newPin, currentPin }),
  lock: () => call("pfLock", {}),
  warm: () => Promise.all(["pfPinVerify", "pfPinSet"].map((n) => call(n, { warm: true }).catch(() => null))),
};

export { usePrivateFareGrant };

// ───────────────────────── 비밀번호 키패드 ─────────────────────────
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
function PinPad({ title, sub, onSubmit, busy, error, info, footer }) {
  const [pin, setPin] = React.useState("");
  const [abc, setAbc] = React.useState(false);
  const [shake, setShake] = React.useState(0);
  React.useEffect(() => { if (error) { setPin(""); setShake((n) => n + 1); } }, [error]);
  const push = (ch) => setPin((p) => (p.length >= PIN_MAX ? p : p + ch));
  const back = () => setPin((p) => p.slice(0, -1));
  const submit = () => { if (pin.length >= PIN_MIN && !busy) onSubmit(pin); };
  const submitRef = React.useRef(submit); submitRef.current = submit;
  React.useEffect(() => {
    const k = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9a-zA-Z]$/.test(e.key)) { e.preventDefault(); push(e.key.toUpperCase()); }
      else if (e.key === "Backspace") { e.preventDefault(); back(); }
      else if (e.key === "Enter") { e.preventDefault(); submitRef.current(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const key = "h-14 rounded-2xl text-[22px] font-black transition active:scale-95 select-none";
  const keySt = { background: "rgba(255,255,255,.06)", border: `1px solid ${EX.line}`, color: EX.text, ...EX_NUM };
  return (
    <div className="w-full max-w-[400px] mx-auto">
      <div className="text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl grid place-items-center" style={{ background: GOLD_GRAD, boxShadow: "0 12px 30px rgba(215,188,130,.3)" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1A1408" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.5" r="1.4" fill="#1A1408" /></svg>
        </div>
        <div className="mt-4 text-[22px] font-black" style={{ color: EX.text }}>{title}</div>
        {sub && <div className="mt-1 text-[13.5px] font-medium leading-relaxed" style={{ color: EX.sub }}>{sub}</div>}
      </div>
      {/* 입력 칸 8개(4칸 이상 채우면 확인) */}
      <div key={shake} className={`mt-6 flex justify-center gap-2 ${shake ? "kp-pf-shake" : ""}`} data-testid="pf-pin-slots">
        {Array.from({ length: PIN_MAX }, (_, i) => {
          const on = i < pin.length;
          return <span key={i} className="w-9 h-11 rounded-xl grid place-items-center text-[18px] font-black" style={{ ...EX_NUM, background: on ? "rgba(215,188,130,.16)" : "rgba(255,255,255,.04)", border: `1px solid ${on ? EX.lineHi : i < PIN_MIN ? "rgba(255,255,255,.14)" : EX.line}`, color: EX.goldHi }}>{on ? "●" : ""}</span>;
        })}
      </div>
      <div className="mt-3 min-h-[20px] text-center text-[13px] font-bold" style={{ color: error ? EX.danger : EX.mute }}>{error || info || `${PIN_MIN}~${PIN_MAX}자 · 숫자 또는 영문`}</div>
      {/* 키패드 종류 */}
      <div className="mt-3 flex justify-center">
        <ExecTabs size="sm" value={abc ? "abc" : "num"} onChange={(k) => setAbc(k === "abc")} items={[["num", "숫자 123"], ["abc", "영문 ABC"]]} />
      </div>
      {!abc ? (
        <div className="mt-3 grid grid-cols-3 gap-2.5" data-testid="pf-keypad-num">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} type="button" className={key} style={keySt} onClick={() => push(d)}>{d}</button>)}
          <button type="button" className={`${key} text-[15px]`} style={keySt} onClick={back} aria-label="지우기">⌫</button>
          <button type="button" className={key} style={keySt} onClick={() => push("0")}>0</button>
          <button type="button" disabled={pin.length < PIN_MIN || busy} className={`${key} text-[16px] disabled:opacity-40`} style={{ background: GOLD_GRAD, color: "#1A1408", border: "1px solid transparent" }} onClick={submit}>{busy ? "…" : "확인"}</button>
        </div>
      ) : (
        <div className="mt-3" data-testid="pf-keypad-abc">
          <div className="grid grid-cols-7 gap-1.5">
            {LETTERS.map((c) => <button key={c} type="button" className="h-11 rounded-xl text-[16px] font-black active:scale-95" style={keySt} onClick={() => push(c)}>{c}</button>)}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            <button type="button" className={`${key} text-[15px]`} style={keySt} onClick={back}>⌫ 지우기</button>
            <button type="button" disabled={pin.length < PIN_MIN || busy} className={`${key} text-[16px] disabled:opacity-40`} style={{ background: GOLD_GRAD, color: "#1A1408", border: "1px solid transparent" }} onClick={submit}>{busy ? "…" : "확인"}</button>
          </div>
        </div>
      )}
      {footer && <div className="mt-4 text-center">{footer}</div>}
      <style>{"@keyframes kpPfShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}.kp-pf-shake{animation:kpPfShake .35s ease}"}</style>
    </div>
  );
}

// 잠금 화면 — 비밀번호 확인 / 처음 정하기(두 번 입력) / 바꾸기(지금 → 새 → 한 번 더)
function PinGate({ status, onOpened, change = false, onCancel }) {
  const needSet = change || !status?.hasPin;
  const [step, setStep] = React.useState(change ? "cur" : needSet ? "new" : "verify");
  const [cur, setCur] = React.useState("");
  const [first, setFirst] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [lockUntil, setLockUntil] = React.useState(status?.lockUntil || 0);
  React.useEffect(() => { api.warm(); }, []);
  const [, tick] = React.useState(0);
  React.useEffect(() => { if (!lockUntil) return undefined; const i = setInterval(() => { if (Date.now() > lockUntil) setLockUntil(0); tick((n) => n + 1); }, 1000); return () => clearInterval(i); }, [lockUntil]);
  const locked = lockUntil > Date.now();
  const submit = async (pin) => {
    setError("");
    if (step === "cur") { setCur(pin); setStep("new"); return; }
    if (step === "new") { setFirst(pin); setStep("again"); return; }
    setBusy(true);
    try {
      if (step === "again") {
        if (pin !== first) { setError("두 번 입력한 비밀번호가 달라요. 처음부터 다시 넣어 주세요"); setFirst(""); setStep("new"); return; }
        const r = await api.set(pin, cur);
        onOpened?.(r.expiresAt);
        return;
      }
      const r = await api.verify(pin);
      if (r?.ok) { onOpened?.(r.expiresAt); return; }
      if (r?.needSet) { setStep("new"); return; }
      if (r?.lockUntil) { setLockUntil(r.lockUntil); setError(""); return; }
      setError(`비밀번호가 맞지 않아요 · ${r?.left ?? 0}번 더 틀리면 잠시 잠겨요`);
    } catch (e) {
      setError(e?.message || "확인하지 못했어요");
      if (step === "again") { setFirst(""); setStep(change ? "cur" : "new"); }
    } finally { setBusy(false); }
  };
  if (locked) {
    const left = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
    return <div className="py-10 text-center"><Empty text="비밀번호를 여러 번 틀려 잠시 잠겼어요" sub={`${Math.floor(left / 60)}분 ${left % 60}초 뒤에 다시 넣을 수 있어요 · 잊었다면 최고관리자에게 초기화를 요청해 주세요`} /></div>;
  }
  const T = {
    verify: ["비공개 운임", "비밀번호를 넣어 주세요"],
    cur: ["비밀번호 바꾸기", "지금 비밀번호를 넣어 주세요"],
    new: [change ? "새 비밀번호" : "처음 비밀번호 정하기", "이 화면에 들어올 때 쓸 비밀번호예요(4~8자 · 숫자 또는 영문)"],
    again: ["한 번 더", "같은 비밀번호를 다시 넣어 주세요"],
  }[step];
  return <PinPad key={step} title={T[0]} sub={T[1]} onSubmit={submit} busy={busy} error={error}
    footer={onCancel ? <button type="button" onClick={onCancel} className="text-[13px] font-bold underline" style={{ color: EX.mute }}>취소</button> : <span className="text-[12px] font-semibold" style={{ color: EX.faint }}>잊었다면 최고관리자에게 초기화를 요청해 주세요 · 5번 틀리면 잠시 잠겨요</span>} />;
}

// ───────────────────────── 화면 본체 ─────────────────────────
export default function PrivateFareVault({ company, dispatchData = [] }) {
  const uid = auth.currentUser?.uid || "";
  const grant = usePrivateFareGrant(uid);
  const [status, setStatus] = React.useState(null);
  const [until, setUntil] = React.useState(0);
  const [stErr, setStErr] = React.useState("");
  const lastAct = React.useRef(Date.now());

  const refresh = React.useCallback(() => {
    setStErr("");
    api.status().then((r) => { setStatus(r); setUntil(r?.unlockedUntil || 0); }).catch((e) => setStErr(e?.message || "상태를 불러오지 못했어요"));
  }, []);
  React.useEffect(() => { if (grant.on) refresh(); }, [grant.on, refresh]);
  const lockNow = React.useCallback(() => { setUntil(0); api.lock().catch(() => {}); }, []);

  // 손대지 않으면 잠그기 · 쓰는 동안 서버 잠금 해제 늘리기(5분마다)
  React.useEffect(() => {
    if (!until) return undefined;
    const act = () => { lastAct.current = Date.now(); };
    ["mousedown", "keydown", "touchstart", "wheel"].forEach((ev) => window.addEventListener(ev, act, { passive: true }));
    const i = setInterval(() => {
      if (Date.now() - lastAct.current > IDLE_MS || Date.now() > until) lockNow();
    }, 15000);
    const j = setInterval(() => { if (Date.now() - lastAct.current < 5 * 60000) api.status(true).then((r) => { if (r?.unlockedUntil) setUntil(r.unlockedUntil); }).catch(() => {}); }, 5 * 60000);
    return () => { ["mousedown", "keydown", "touchstart", "wheel"].forEach((ev) => window.removeEventListener(ev, act)); clearInterval(i); clearInterval(j); };
  }, [until, lockNow]);
  // 다른 화면으로 나가면 잠근다
  React.useEffect(() => () => { api.lock().catch(() => {}); }, []);

  if (grant.loading) return <ExecPage en="PRIVATE FARE" title="비공개 운임"><Empty text="불러오는 중이에요" /></ExecPage>;
  if (!grant.on) return <ExecPage en="PRIVATE FARE" title="비공개 운임"><Empty text="이 계정은 비공개 운임을 쓸 수 없어요" sub="최고관리자가 관리자센터 › 비공개 운임에서 지정한 사람만 열 수 있어요" /></ExecPage>;
  if (!until) {
    return (
      <ExecPage en="PRIVATE FARE · LOCKED" title="비공개 운임" sub="나만 보는 실제 청구 금액이에요. 들어갈 때마다 비밀번호를 확인해요.">
        <ExecPanel glow>
          <div className="py-6 md:py-10">
            {stErr ? <Empty text={stErr} sub={<button type="button" onClick={refresh} className="underline">다시 시도</button>} />
              : !status ? <Empty text="잠금 상태를 확인하는 중이에요" />
                : <PinGate status={status} onOpened={(t) => { lastAct.current = Date.now(); setUntil(t || Date.now() + 30 * 60000); }} />}
          </div>
        </ExecPanel>
      </ExecPage>
    );
  }
  return <VaultBody company={company} uid={uid} dispatchData={dispatchData} onLock={lockNow} />;
}

function MonthStep({ ym, setYm }) {
  const b = "w-9 h-10 rounded-xl text-[16px] font-black";
  const st = { background: "rgba(255,255,255,.05)", border: `1px solid ${EX.line}`, color: EX.text };
  return (
    <div className="inline-flex items-center gap-1.5">
      <button type="button" className={b} style={st} onClick={() => setYm(addMonth(ym, -1))} aria-label="이전 달">‹</button>
      <span className="h-10 px-3.5 rounded-xl inline-flex items-center text-[14px] font-black" style={{ ...st, ...EX_NUM }}>{ym.slice(0, 4)}년 {Number(ym.slice(5))}월</span>
      <button type="button" className={b} style={st} disabled={ym >= kstYm()} onClick={() => setYm(addMonth(ym, 1))} aria-label="다음 달">›</button>
    </div>
  );
}

function VaultBody({ company, uid, dispatchData, onLock }) {
  const [tab, setTab] = React.useState("dash");
  const [ym, setYm] = React.useState(kstYm());
  const [hide, setHide] = React.useState(false);
  const [vault, setVault] = React.useState(null);
  const [saved, setSaved] = React.useState({});
  const [changePin, setChangePin] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  // 고른 달 기준 6개월치 오더(PC는 최근 며칠만 실시간이라 기간을 불러온다)
  useLoadOrderRange(monthStartAgo(ym, 5), monthEnd(ym), true);
  const vRef = React.useMemo(() => doc(db, "privateFareVaults", uid), [uid]);
  React.useEffect(() => onSnapshot(vRef, (s) => setVault(s.exists() ? s.data() : { rules: [] }), () => onLock()), [vRef, onLock]);
  React.useEffect(() => onSnapshot(collection(vRef, "fares"), (s) => { const m = {}; s.forEach((d) => { m[d.id] = d.data(); }); setSaved(m); }, () => {}), [vRef]);
  const rules = vault?.rules || [];
  const saveVault = async (patch) => {
    setMsg("");
    try { await setDoc(vRef, { uid, companyName: company, ...patch, updatedAt: serverTimestamp() }, { merge: true }); setMsg("저장했어요"); setTimeout(() => setMsg(""), 1800); }
    catch (e) { setMsg(String(e?.code || "").includes("permission") ? "잠금이 풀려 있지 않아요. 다시 들어와 주세요" : `저장하지 못했어요(${e?.code || e?.message})`); }
  };
  const saveFare = async (o, amount, memo) => {
    const id = orderId(o); if (!id) return;
    const ref = doc(vRef, "fares", id);
    try {
      if (!(Number(amount) > 0)) await deleteDoc(ref);
      else await setDoc(ref, { orderId: id, amount: Number(amount), memo: memo || "", base: toNum(o.청구운임), client: String(o.거래처명 || ""), date: orderDate(o), route: routeLabel(o), updatedAt: serverTimestamp() });
    } catch (e) { setMsg(`저장하지 못했어요(${e?.code || e?.message})`); }
  };

  const months6 = React.useMemo(() => { const s = monthStartAgo(ym, 5).slice(0, 7); return (dispatchData || []).filter((o) => { const d = orderDate(o).slice(0, 7); return d >= s && d <= ym; }); }, [dispatchData, ym]);
  const rows6 = React.useMemo(() => privateRows(months6, rules, saved), [months6, rules, saved]);
  const rows = React.useMemo(() => rows6.filter((r) => r.date.slice(0, 7) === ym), [rows6, ym]);
  const prevRows = React.useMemo(() => rows6.filter((r) => r.date.slice(0, 7) === addMonth(ym, -1)), [rows6, ym]);
  const sum = summarize(rows), prev = summarize(prevRows);
  const goal = Number(vault?.goal) || 0;
  const H = (v) => (hide ? "••••••" : v);
  const exportCsv = () => {
    const head = ["날짜", "거래처", "노선", "공개 청구운임", "비공개 금액", "차액", "기준", "메모"];
    const src = { manual: "직접 입력", route: "노선 규칙", client: "거래처 규칙" };
    const body = rows.map((r) => [r.date, r.client, r.route, r.base, r.amount, r.diff, src[r.source] || "", r.memo || ""]);
    const csv = [head, ...body, [], ["합계", "", "", sum.base, sum.amount, sum.diff, "", ""]].map((l) => l.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })); a.download = `비공개운임_${ym}.csv`; a.click();
  };
  if (changePin) {
    return (
      <ExecPage en="PRIVATE FARE · PIN" title="비밀번호 바꾸기">
        <ExecPanel glow><div className="py-6 md:py-10"><PinGate change status={{ hasPin: true }} onOpened={() => { setChangePin(false); setMsg("비밀번호를 바꿨어요"); }} onCancel={() => setChangePin(false)} /></div></ExecPanel>
      </ExecPage>
    );
  }
  return (
    <ExecPage en="PRIVATE FARE" title="비공개 운임" testId="pf-vault"
      sub="나만 보는 실제 청구 금액 · 직원들이 아는 청구운임과 따로 계산해요"
      right={<>
        <MonthStep ym={ym} setYm={setYm} />
        <ExecButton onClick={() => setHide((v) => !v)} title="옆에 다른 사람이 있을 때 금액을 가려요">{hide ? "금액 보기" : "금액 가리기"}</ExecButton>
        <ExecButton onClick={exportCsv} disabled={!rows.length}>내보내기</ExecButton>
        <ExecButton kind="gold" onClick={onLock}>잠그기</ExecButton>
      </>}>
      <div className="flex flex-wrap items-center gap-3">
        <ExecTabs value={tab} onChange={setTab} items={[["dash", "한눈에"], ["orders", "오더별", rows.length || null], ["rules", "금액 설정", rules.length || null]]} />
        {msg && <Chip tone={/못|않/.test(msg) ? "up" : "ok"}>{msg}</Chip>}
      </div>
      {tab === "dash" && <Dashboard ym={ym} rows={rows} rows6={rows6} sum={sum} prev={prev} goal={goal} H={H} hide={hide} rulesN={rules.length} onGo={setTab} orders={months6} rules={rules} />}
      {tab === "orders" && <OrdersTab ym={ym} orders={months6.filter((o) => orderDate(o).slice(0, 7) === ym)} rules={rules} saved={saved} onSave={saveFare} H={H} />}
      {tab === "rules" && <RulesTab company={company} rules={rules} goal={goal} orders={months6} onSave={saveVault} onChangePin={() => setChangePin(true)} saved={saved} vRef={vRef} />}
    </ExecPage>
  );
}

// ───────── 한눈에 ─────────
function Dashboard({ ym, rows, rows6, sum, prev, goal, H, hide, rulesN, onGo, orders, rules }) {
  const m6 = monthly(rows6, ym, 6);
  const byClient = groupBy(rows, (r) => r.client);
  const byRoute = groupBy(rows, (r) => `${r.client} · ${r.route}`).slice(0, 8);
  const sugg = routeSuggestions(orders, rules, 5);
  const pct = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : undefined);
  if (!rulesN && !rows.length) {
    return <ExecPanel glow><Empty text="아직 비공개로 정한 금액이 없어요" sub={<>[금액 설정]에서 거래처나 노선마다 실제 청구 금액을 정하면, 여기에 매출 · 차액이 그래프로 보여요. <button type="button" className="underline font-bold" style={{ color: EX.gold }} onClick={() => onGo("rules")}>금액 설정 열기</button></>} /></ExecPanel>;
  }
  return (
    <>
      <ExecKpis min={190}>
        <Kpi en="PRIVATE" label="비공개 청구 합계" value={H(fmtWon(sum.amount))} unit={hide ? "" : "원"} accent delta={hide ? undefined : pct(sum.amount, prev.amount)} deltaLabel="지난달보다" foot={`${sum.n.toLocaleString()}건`} />
        <Kpi en="PUBLIC" label="직원들이 아는 청구운임" value={H(fmtWon(sum.base))} unit={hide ? "" : "원"} foot="같은 오더의 공개 금액" />
        <Kpi en="MY SHARE" label="차액(내 몫)" value={H(fmtWon(sum.diff))} unit={hide ? "" : "원"} delta={hide ? undefined : pct(sum.diff, prev.diff)} deltaLabel="지난달보다" />
        <Kpi en="MARK-UP" label="차액률(공개 대비)" value={hide ? "••" : sum.rate.toFixed(1)} unit={hide ? "" : "%"} foot={sum.n ? `건당 평균 ${H(fmtWon(Math.round(sum.diff / sum.n)))}원` : ""} />
      </ExecKpis>
      {goal > 0 && (
        <ExecPanel en="GOAL" title="이달 차액 목표" right={<Chip tone={sum.diff >= goal ? "ok" : "gold"}>{hide ? "••" : `${Math.round((sum.diff / goal) * 100)}%`}</Chip>}>
          <Meter value={sum.diff} max={Math.max(goal, sum.diff)} marker={goal} height={10} />
          <div className="mt-2 flex justify-between text-[12.5px] font-bold" style={{ color: EX.mute, ...EX_NUM }}><span>지금 {H(won(sum.diff))}</span><span>목표 {H(won(goal))}</span></div>
        </ExecPanel>
      )}
      <ExecGrid cols="3fr 2fr">
        <ExecPanel en="TREND · 6 MONTHS" title="월별 공개 · 비공개 청구와 차액" right={<Legend items={[["공개", EX.ice], ["비공개", EX.gold], ["차액(오른쪽 눈금)", EX.up, "line"]]} />}>
          <div style={{ height: 280, filter: hide ? "blur(8px)" : "none" }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={m6} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...chartTheme.grid} />
                <XAxis dataKey="label" {...chartTheme.axis} />
                <YAxis yAxisId="l" {...chartTheme.axis} width={52} tickFormatter={(v) => (Math.abs(v) >= 1e4 ? `${Math.round(v / 1e4)}만` : v)} />
                <YAxis yAxisId="r" orientation="right" {...chartTheme.axis} width={46} tickFormatter={(v) => (Math.abs(v) >= 1e4 ? `${Math.round(v / 1e4)}만` : v)} />
                <Tooltip cursor={chartTheme.cursor} content={<ExecTooltip />} />
                <Bar yAxisId="l" dataKey="base" name="공개" fill={EX.ice} radius={[6, 6, 2, 2]} maxBarSize={22} />
                <Bar yAxisId="l" dataKey="amount" name="비공개" fill={EX.gold} radius={[6, 6, 2, 2]} maxBarSize={22} />
                <Line yAxisId="r" dataKey="diff" name="차액(오른쪽 눈금)" stroke={EX.up} strokeWidth={2.5} dot={{ r: 3 }} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ExecPanel>
        <ExecPanel en="BY CLIENT" title="거래처별 차액">
          <div style={{ filter: hide ? "blur(8px)" : "none" }}>
            <RankBars rows={byClient.slice(0, 8).map((g) => ({ label: g.key, value: g.diff, sub: `${g.n}건 · 비공개 ${fmtMoney(g.amount)}` }))} empty="이달 비공개 오더가 없어요" />
          </div>
        </ExecPanel>
      </ExecGrid>
      <ExecGrid cols="3fr 2fr">
        <ExecPanel en="TOP ROUTES" title="노선별 (이달)">
          <ExecTable rows={byRoute} rowKey={(r) => r.key} empty="이달 비공개 오더가 없어요" cols={[
            { key: "key", label: "거래처 · 노선" },
            { key: "n", label: "건수", align: "right", render: (r) => r.n.toLocaleString() },
            { key: "base", label: "공개", align: "right", render: (r) => H(fmtWon(r.base)) },
            { key: "amount", label: "비공개", align: "right", render: (r) => <span style={{ color: EX.goldHi }}>{H(fmtWon(r.amount))}</span> },
            { key: "diff", label: "차액", align: "right", render: (r) => <b style={{ color: r.diff >= 0 ? EX.up : EX.down }}>{H(fmtWon(r.diff))}</b> },
          ]} />
        </ExecPanel>
        <ExecPanel en="SUGGEST" title="노선별로 따로 정할 만한 곳" sub="거래처 규칙만 걸린 노선 중 많이 다닌 순">
          {!sugg.length ? <Empty text="따로 정할 노선이 없어요" /> : (
            <div className="space-y-2">
              {sugg.map((s) => (
                <div key={`${s.client}|${s.from}|${s.to}`} className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5" style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${EX.line}` }}>
                  <div className="min-w-0 flex-1"><div className="text-[13.5px] font-black truncate" style={{ color: EX.text }}>{s.from} → {s.to}</div><div className="text-[12px] font-semibold truncate" style={{ color: EX.mute }}>{s.client} · {s.n}건 · 공개 평균 {H(won(s.avg))}</div></div>
                  <ExecButton onClick={() => onGo("rules")}>정하기</ExecButton>
                </div>
              ))}
            </div>
          )}
        </ExecPanel>
      </ExecGrid>
    </>
  );
}

// ───────── 오더별 ─────────
function AmountCell({ o, p, onSave, H }) {
  const [edit, setEdit] = React.useState(false);
  const [v, setV] = React.useState("");
  if (!edit) {
    return (
      <button type="button" onClick={() => { setV(p.on ? String(p.amount) : ""); setEdit(true); }} className="min-w-[110px] h-8 px-2.5 rounded-lg text-right font-black" title="눌러서 이 오더 금액 직접 정하기"
        style={{ ...EX_NUM, background: p.source === "manual" ? "rgba(215,188,130,.14)" : "rgba(255,255,255,.04)", border: `1px solid ${p.source === "manual" ? EX.lineHi : EX.line}`, color: p.on ? EX.goldHi : EX.faint }}>
        {p.on ? H(fmtWon(p.amount)) : "정하기"}
      </button>
    );
  }
  const done = (save) => { setEdit(false); if (save) onSave(o, toNum(v)); };
  return (
    <span className="inline-flex items-center gap-1">
      <input autoFocus inputMode="numeric" value={v ? fmtWon(toNum(v)) : ""} onChange={(e) => setV(e.target.value)} placeholder="금액"
        onKeyDown={(e) => { if (e.key === "Enter") done(true); else if (e.key === "Escape") done(false); }}
        className="w-[120px] h-8 px-2 rounded-lg text-right font-black outline-none" style={{ ...EX_NUM, background: "#0A1328", border: `1px solid ${EX.gold}`, color: EX.text }} />
      <button type="button" onClick={() => done(true)} className="h-8 px-2.5 rounded-lg text-[12px] font-black" style={{ background: GOLD_GRAD, color: "#1A1408" }}>저장</button>
      {p.source === "manual" && <button type="button" onClick={() => { setEdit(false); onSave(o, 0); }} className="h-8 px-2 rounded-lg text-[12px] font-bold" style={{ color: EX.mute }} title="직접 입력을 지우고 규칙으로 돌아가기">규칙으로</button>}
    </span>
  );
}
function OrdersTab({ orders, rules, saved, onSave, H }) {
  const [all, setAll] = React.useState(false);
  const [q, setQ] = React.useState("");
  const SRC = { manual: ["직접", "gold"], route: ["노선", "ice"], client: ["거래처", "mute"] };
  const list = React.useMemo(() => {
    const nq = normName(q);
    return (orders || []).filter((o) => o && !isCanceled(o))
      .map((o) => ({ o, p: privateOf(o, rules, saved[orderId(o)]) }))
      .filter((x) => (all || x.p.on) && (!nq || normName(`${x.o.거래처명}${x.o.상차지명}${x.o.하차지명}`).includes(nq)))
      .sort((a, b) => orderDate(b.o).localeCompare(orderDate(a.o)));
  }, [orders, rules, saved, all, q]);
  return (
    <ExecPanel en="ORDERS" title="오더별 비공개 금액" sub="금액 칸을 누르면 그 오더만 직접 정할 수 있어요(규칙보다 먼저)"
      right={<>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처 · 상하차지 찾기" className="h-10 w-[200px] px-3 rounded-xl text-[13.5px] font-bold outline-none" style={{ background: "rgba(255,255,255,.05)", border: `1px solid ${EX.line}`, color: EX.text }} />
        <ExecTabs size="sm" value={all ? "all" : "pf"} onChange={(k) => setAll(k === "all")} items={[["pf", "비공개만"], ["all", "이달 전체"]]} />
      </>}>
      <ExecTable maxHeight={620} rows={list} rowKey={(x) => orderId(x.o)} empty={all ? "이달 오더가 없어요" : "이달 비공개 오더가 없어요 · [이달 전체]에서 오더를 골라 직접 정할 수 있어요"} cols={[
        { key: "d", label: "날짜", render: (x) => orderDate(x.o).slice(5).replace("-", "/") },
        { key: "c", label: "거래처", render: (x) => <span className="font-bold">{x.o.거래처명 || "-"}</span> },
        { key: "r", label: "노선", render: (x) => <span style={{ color: EX.sub }}>{routeLabel(x.o)}</span> },
        { key: "b", label: "공개 청구운임", align: "right", render: (x) => H(fmtWon(x.p.base)) },
        { key: "a", label: "비공개 금액", align: "right", render: (x) => <AmountCell o={x.o} p={x.p} onSave={onSave} H={H} /> },
        { key: "f", label: "차액", align: "right", render: (x) => (x.p.on ? <b style={{ color: x.p.diff >= 0 ? EX.up : EX.down }}>{H(fmtWon(x.p.diff))}</b> : <span style={{ color: EX.faint }}>—</span>) },
        { key: "s", label: "기준", align: "center", render: (x) => (x.p.on ? <Chip tone={SRC[x.p.source][1]}>{SRC[x.p.source][0]}</Chip> : "") },
      ]} />
    </ExecPanel>
  );
}

// ───────── 금액 설정 ─────────
const selSt = { background: "#0A1328", border: `1px solid ${EX.line}`, color: EX.text };
function RulesTab({ company, rules: rules0, goal: goal0, orders, onSave, onChangePin, saved, vRef }) {
  const [rules, setRules] = React.useState(() => rules0.map((r, i) => ({ ...r, _k: i })));
  const [goal, setGoal] = React.useState(goal0 || 0);
  React.useEffect(() => { setRules(rules0.map((r, i) => ({ ...r, _k: i }))); }, [rules0]);
  React.useEffect(() => { setGoal(goal0 || 0); }, [goal0]);
  const clients = React.useMemo(() => {
    const m = new Map();
    for (const o of orders || []) { const c = String(o?.거래처명 || "").trim(); if (c) m.set(c, (m.get(c) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [orders]);
  const routesOf = React.useCallback((client) => {
    const m = new Map(); const c = normName(client);
    for (const o of orders || []) { if (normName(o?.거래처명) !== c) continue; const k = `${String(o.상차지명 || "").trim()}|${String(o.하차지명 || "").trim()}`; m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => { const [from, to] = k.split("|"); return { from, to, n }; });
  }, [orders]);
  const upd = (k, patch) => setRules((l) => l.map((r) => (r._k === k ? { ...r, ...patch } : r)));
  const add = (r) => setRules((l) => [...l, { client: "", mode: "fix", value: 0, on: true, ...r, _k: Date.now() + Math.random() }]);
  const save = () => onSave({ rules: rules.filter((r) => String(r.client || "").trim()).map(({ _k, ...r }) => ({ client: String(r.client).trim(), from: r.from || "", to: r.to || "", mode: r.mode || "fix", value: Number(r.value) || 0, on: r.on !== false, memo: r.memo || "" })), goal: Number(goal) || 0 });
  const dirty = JSON.stringify(rules.map(({ _k, ...r }) => r)) !== JSON.stringify(rules0) || Number(goal) !== Number(goal0 || 0);
  const inp = "h-10 px-3 rounded-xl text-[13.5px] font-bold outline-none";
  // 예전 비공개 청구(매출관리 › 리포트 도구) 불러오기 — 그때 볼 사람으로 들어가 있던 경우만 읽힌다
  const [legacy, setLegacy] = React.useState(null);
  React.useEffect(() => {
    let off = false;
    getDoc(doc(db, "privateFareSettings", coKey(company))).then(async (s) => {
      if (off || !s.exists()) return;
      const d = s.data() || {};
      const fs = await getDocs(collection(db, "privateFareSettings", coKey(company), "fares")).catch(() => null);
      if (!off) setLegacy({ rules: (d.clients || []).filter((r) => r.mode === "add" || r.mode === "rate"), fares: fs ? fs.docs.map((x) => ({ id: x.id, ...x.data() })) : [] });
    }).catch(() => {});
    return () => { off = true; };
  }, [company]);
  const importLegacy = async () => {
    if (!legacy) return;
    const have = new Set(rules.map((r) => normName(r.client) + (r.from ? "|" : "")));
    const more = legacy.rules.filter((r) => !have.has(normName(r.name))).map((r) => ({ client: r.name, mode: r.mode, value: Number(r.value) || 0, on: true }));
    await onSave({ rules: [...rules.map(({ _k, ...r }) => r), ...more], goal: Number(goal) || 0 });
    for (const f of legacy.fares) {
      if (saved[f.id] || !(Number(f.amount) > 0)) continue;
      await setDoc(doc(vRef, "fares", f.id), { orderId: f.id, amount: Number(f.amount), memo: f.memo || "", base: Number(f.base) || 0, client: f.client || "", date: f.date || "", route: f.route || "", updatedAt: serverTimestamp(), from: "legacy" }).catch(() => {});
    }
    setLegacy(null);
  };
  return (
    <>
      <ExecPanel en="RULES" title="거래처 · 노선별 실제 청구 금액" sub="노선을 고르면 그 노선만, 비우면 그 거래처 모든 노선에 적용돼요 · 오더별 직접 입력이 가장 먼저예요"
        right={<><ExecButton onClick={() => add({})}>+ 규칙 추가</ExecButton><ExecButton kind="gold" disabled={!dirty} onClick={save}>저장</ExecButton></>}>
        {!rules.length ? <Empty text="아직 정한 규칙이 없어요" sub="[+ 규칙 추가]를 눌러 거래처를 고르고 금액을 정해 주세요. 예) 무지개 운송 · 서울 → 부산 · 고정 금액 150,000원" /> : (
          <div className="space-y-2.5">
            {rules.map((r) => {
              const rts = r.client ? routesOf(r.client) : [];
              const rk = r.from || r.to ? `${r.from}|${r.to}` : "";
              const sample = rts.find((x) => `${x.from}|${x.to}` === rk);
              return (
                <div key={r._k} className="flex flex-wrap items-center gap-2 rounded-2xl px-3 py-3" style={{ background: r.on === false ? "rgba(255,255,255,.02)" : "rgba(255,255,255,.04)", border: `1px solid ${EX.line}`, opacity: r.on === false ? 0.55 : 1 }}>
                  <input list="pf-clients" value={r.client} onChange={(e) => upd(r._k, { client: e.target.value, from: "", to: "" })} placeholder="거래처" className={`${inp} w-[170px]`} style={selSt} />
                  <select value={rk} onChange={(e) => { const [from = "", to = ""] = e.target.value.split("|"); upd(r._k, { from, to }); }} className={`${inp} w-[220px]`} style={selSt} disabled={!r.client}>
                    <option value="">모든 노선</option>
                    {rk && !sample && <option value={rk}>{r.from} → {r.to}</option>}
                    {rts.map((x) => <option key={`${x.from}|${x.to}`} value={`${x.from}|${x.to}`}>{x.from} → {x.to} ({x.n}건)</option>)}
                  </select>
                  <select value={r.mode || "fix"} onChange={(e) => upd(r._k, { mode: e.target.value })} className={`${inp} w-[140px]`} style={selSt}>
                    {PF_MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <input inputMode="numeric" value={r.value ? fmtWon(r.value) : ""} onChange={(e) => upd(r._k, { value: toNum(e.target.value) })} placeholder={r.mode === "rate" ? "예) 125" : "예) 150,000"} className={`${inp} w-[130px] text-right`} style={{ ...selSt, ...EX_NUM }} />
                  <span className="text-[12.5px] font-bold" style={{ color: EX.mute }}>{r.mode === "rate" ? "% (125 = 10만 → 12.5만)" : r.mode === "add" ? "원 더하기" : "원"}</span>
                  <span className="ml-auto inline-flex items-center gap-1.5">
                    <ExecButton onClick={() => upd(r._k, { on: r.on === false })}>{r.on === false ? "켜기" : "끄기"}</ExecButton>
                    <button type="button" onClick={() => setRules((l) => l.filter((x) => x._k !== r._k))} className="h-10 px-3 rounded-xl text-[12.5px] font-bold" style={{ color: EX.danger }}>빼기</button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <datalist id="pf-clients">{clients.map((c) => <option key={c} value={c} />)}</datalist>
      </ExecPanel>
      <ExecGrid cols="1fr 1fr">
        <ExecPanel en="GOAL" title="한 달 차액 목표" sub="한눈에 화면에 달성률이 보여요(0이면 안 보임)">
          <div className="flex items-center gap-2">
            <input inputMode="numeric" value={goal ? fmtWon(goal) : ""} onChange={(e) => setGoal(toNum(e.target.value))} placeholder="예) 2,000,000" className={`${inp} w-[180px] text-right`} style={{ ...selSt, ...EX_NUM }} />
            <span className="text-[13px] font-bold" style={{ color: EX.mute }}>원</span>
            <ExecButton kind="gold" disabled={!dirty} onClick={save}>저장</ExecButton>
          </div>
        </ExecPanel>
        <ExecPanel en="SECURITY" title="보안" sub="10분 동안 손대지 않거나 다른 화면으로 나가면 자동으로 잠겨요">
          <div className="flex flex-wrap gap-2">
            <ExecButton onClick={onChangePin}>비밀번호 바꾸기</ExecButton>
            {legacy && (legacy.rules.length > 0 || legacy.fares.length > 0) && <ExecButton onClick={importLegacy} title="매출관리 › 리포트 도구 › 비공개 청구에 넣어 둔 것">예전 비공개 청구 불러오기 (규칙 {legacy.rules.length} · 오더 {legacy.fares.length})</ExecButton>}
          </div>
        </ExecPanel>
      </ExecGrid>
    </>
  );
}

export { PinPad, EX_FONT, Dashboard as PfDashboard, OrdersTab as PfOrdersTab };
