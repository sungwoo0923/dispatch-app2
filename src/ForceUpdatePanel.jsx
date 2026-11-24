// ======================= src/ForceUpdatePanel.jsx =======================
// ⏱ 2026-11-24 관리센터 › 운영 › 업데이트 배포 › 강제 업데이트 예약
//  고른 운송사(또는 전체 · 화주사 포함)에 정한 시간 뒤 최신 버전을 적용한다 → 대상 화면 위 가운데에 안내 + 남은 시간(ForceUpdateHost)
//  적용 버전 = 지금 가입자에게 배포한 버전(배포 잠금이 켜져 있으면 그 버전, 꺼져 있으면 올라온 최신)
import React from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { watchRelease, latestVersion } from "./releaseGate";
import { usePlatformLive } from "./PlatformLive";
import { kpConfirm } from "./kpDialog";
import { G, GOLD_BTN, AdmPanel } from "./adminCenter/admUi";
import { FORCE_DOC, DEFAULT_FORCE_MSG, DELAY_OPTIONS, forceLeft, fmtLeft } from "./forceUpdateCore";

const chip = (on) => ({ border: `1px solid ${on ? "rgba(215,188,130,.6)" : G.line2}`, background: on ? "rgba(215,188,130,.08)" : "rgba(255,255,255,.02)", color: on ? G.goldHi : G.sub });
const fmtTime = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export default function ForceUpdatePanel() {
  const live = usePlatformLive();
  const [cfg, setCfg] = React.useState(undefined);
  const [rel, setRel] = React.useState(undefined);
  const [latest, setLatest] = React.useState(null);
  const [scope, setScope] = React.useState("all");
  const [pick, setPick] = React.useState([]);
  const [shippers, setShippers] = React.useState(false);
  const [mins, setMins] = React.useState(3);
  const [custom, setCustom] = React.useState("");
  const [message, setMessage] = React.useState(DEFAULT_FORCE_MSG);
  const [onlyOld, setOnlyOld] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => onSnapshot(doc(db, ...FORCE_DOC), (d) => setCfg(d.exists() ? d.data() : null), () => setCfg(null)), []);
  React.useEffect(() => watchRelease(setRel), []);
  React.useEffect(() => { latestVersion().then(setLatest).catch(() => setLatest(null)); }, []);
  const active = !!cfg?.active && Number(cfg.fireAt) > now - 10 * 60000;
  React.useEffect(() => { if (!active) return undefined; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [active]);

  const locked = !!rel && rel.enabled !== false && !!rel.url;
  const target = locked ? { build: rel.build, version: rel.version } : latest ? { build: latest.build, version: latest.version } : null;
  const cos = Object.values(live?.companies || {}).filter((c) => c?.name).map((c) => ({ name: c.name, now: c.onlineNow || 0, old: c.oldVer || 0 }))
    .sort((a, b) => (b.old - a.old) || (b.now - a.now) || a.name.localeCompare(b.name, "ko"));
  const shown = onlyOld ? cos.filter((c) => c.old > 0) : cos;
  const chosen = scope === "all" ? cos : cos.filter((c) => pick.includes(c.name));
  const sumNow = chosen.reduce((s, c) => s + c.now, 0);
  const sumOld = chosen.reduce((s, c) => s + c.old, 0);
  const delay = mins === "custom" ? Math.max(0, Math.min(240, Number(custom) || 0)) : mins;
  const toggle = (n) => setPick((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
  const history = Array.isArray(cfg?.history) ? cfg.history : [];

  const save = async (patch, done) => {
    setBusy(true); setMsg("");
    try { await setDoc(doc(db, ...FORCE_DOC), patch, { merge: true }); setMsg(done); }
    catch (e) { setMsg(String(e?.code || "").includes("permission") ? "권한이 없어요(최고관리자 · 부관리자만)." : `저장하지 못했어요: ${e?.message || e}`); }
    finally { setBusy(false); }
  };
  const schedule = async () => {
    if (!target?.build) return setMsg("적용할 버전을 알 수 없어요. 잠시 뒤 다시 눌러 주세요.");
    if (scope === "pick" && !pick.length) return setMsg("운송사를 하나 이상 골라 주세요.");
    const who = scope === "all" ? `전체 운송사${shippers ? " · 화주사" : ""}` : `${pick.join(" · ")}${shippers ? " · 연동 화주사" : ""}`;
    if (!(await kpConfirm(`${who}에 ${delay ? `${delay}분 뒤` : "바로"} v${target.version} 을 적용할까요?\n\n· 대상 화면 위 가운데에 안내와 남은 시간이 떠요\n· 시간이 되면 화면이 저절로 새로 고쳐져요\n· 이미 최신인 사람에게는 뜨지 않아요`))) return;
    const t = Date.now(); const id = `fu${t.toString(36)}`;
    const rec = { id, at: t, scope, companies: scope === "pick" ? pick : [], shippers, mins: delay, version: target.version || "" };
    await save({
      id, active: true, createdAt: t, fireAt: t + delay * 60000, by: auth.currentUser?.email || "",
      scope, companies: scope === "pick" ? pick : [], shippers, build: target.build, version: target.version || "", message: message.trim() || DEFAULT_FORCE_MSG,
      history: [rec, ...history].slice(0, 12),
    }, `${who} — ${delay ? `${delay}분 뒤` : "바로"} 적용 예약했어요.`);
  };
  const left = active ? forceLeft(cfg, now) : 0;
  const total = active ? Math.max(1, (Number(cfg.fireAt) - Number(cfg.createdAt || cfg.fireAt)) / 1000) : 1;
  // 📊 2026-11-24 적용률 — 지금 열려 있는(10분 안 활동) 대상 화면 중 예약 버전 이상으로 바뀐 비율(사용자 요청 "퍼센트도 같이")
  //  예전엔 시작 뒤 10분 동안 무조건 "적용 중"만 보여 오래 걸리는 것처럼 보였다 → 모두 바뀌면 바로 "적용 완료"로 끝낸다
  const prog = React.useMemo(() => {
    if (!active || !cfg?.build) return null;
    const inScope = (p) => {
      if (/totalMaster/.test(String(p.role || ""))) return false;
      if (p.isShipper) return !!cfg.shippers && cfg.scope !== "pick";
      return cfg.scope !== "pick" || (cfg.companies || []).includes(p.company);
    };
    const list = (live?.onlineList || []).filter((p) => p.now && inScope(p));
    const done = list.filter((p) => p.build && String(p.build) >= String(cfg.build)).length;
    return { total: list.length, done, pct: list.length ? Math.round((done / list.length) * 100) : 100 };
  }, [active, cfg, live]);
  const finished = active && left <= 0 && prog && prog.done >= prog.total;
  const endedRef = React.useRef("");
  React.useEffect(() => {
    if (!finished || endedRef.current === cfg.id) return undefined;
    const t = setTimeout(() => { // 5초 더 지켜보고(늦게 들어온 화면) 끝낸다
      endedRef.current = cfg.id;
      setDoc(doc(db, ...FORCE_DOC), { active: false, doneAt: Date.now(), history: history.map((h) => (h.id === cfg.id ? { ...h, done: true, donePct: prog.pct, doneN: prog.total } : h)) }, { merge: true }).catch(() => { endedRef.current = ""; });
      setMsg(`적용 완료 — 접속 중 ${prog.total}명 모두 v${cfg.version}`);
    }, 5000);
    return () => clearTimeout(t);
  }, [finished, cfg?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const stale = !!latest?.build && !!target?.build && String(target.build) < String(latest.build); // 배포 잠금 버전이 최신보다 예전

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,.9fr)] items-start" data-kp="force-panel">
      <AdmPanel code="FORCE UPDATE" title="강제 업데이트 예약">
        <div className="text-[12.5px] leading-relaxed" style={{ color: G.sub }}>고른 운송사에 정한 시간 뒤 <b style={{ color: G.goldHi }}>v{target?.version || "…"}</b> 을 적용해요. 그 사이 대상 화면 위 가운데에 안내와 남은 시간이 보이고, 시간이 되면 저절로 새로 고쳐져요.</div>
        {stale && <div className="mt-3 rounded-xl px-3.5 py-2.5 text-[12.5px] font-bold leading-relaxed" style={{ background: "rgba(242,196,109,.08)", border: "1px solid rgba(242,196,109,.35)", color: G.warn }}>
          배포 잠금이 v{target.version} 에 걸려 있어 그 버전으로 적용돼요. 최신 v{latest.version} 을 적용하려면 [업데이트 배포]에서 먼저 최신 버전을 배포해 주세요.</div>}
        <div className="text-[12px] font-extrabold tracking-[0.06em] mt-4 mb-2" style={{ color: G.dim }}>대상</div>
        <div className="inline-flex p-1 rounded-[14px] gap-1" style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${G.line2}` }}>
          {[["all", "전체 운송사"], ["pick", "운송사 선택"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setScope(k)} className="h-9 px-4 rounded-[10px] text-[13.5px] font-extrabold" style={scope === k ? { ...GOLD_BTN, boxShadow: "0 4px 14px rgba(215,188,130,.25)" } : { color: G.sub }}>{l}</button>))}
          <button type="button" onClick={() => setShippers((v) => !v)} className="h-9 px-4 rounded-[10px] text-[13.5px] font-extrabold" style={shippers ? { ...GOLD_BTN } : { color: G.sub }}>{shippers ? "✓ " : ""}화주사 포함</button>
        </div>
        {scope === "pick" && <>
          <div className="flex items-center justify-between mt-4 mb-2">
            <span className="text-[12px] font-extrabold tracking-[0.06em]" style={{ color: G.dim }}>운송사 · {pick.length}곳 선택</span>
            <button type="button" onClick={() => setOnlyOld((v) => !v)} className="text-[12px] font-bold" style={{ color: onlyOld ? G.goldHi : G.ice }}>{onlyOld ? "✓ " : ""}이전 버전 사용자 있는 곳만</button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
            {shown.map((c) => { const on = pick.includes(c.name); return (
              <button key={c.name} type="button" onClick={() => toggle(c.name)} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left" style={chip(on)}>
                <span className="w-[18px] h-[18px] rounded-md grid place-items-center text-[11px] font-black shrink-0" style={on ? { background: G.gold, color: G.goldInk } : { border: "1.5px solid rgba(201,213,236,.4)" }}>{on ? "✓" : ""}</span>
                <span className="flex-1 min-w-0 text-[14px] font-extrabold truncate" style={{ color: G.ink }}>{c.name}</span>
                <span className="text-[11.5px] font-bold text-right leading-tight" style={{ color: G.dim }}>접속 {c.now}명<br /><span style={{ color: c.old ? G.warn : G.dim }}>{c.old ? `이전 버전 ${c.old}명` : "모두 최신"}</span></span>
              </button>); })}
            {!shown.length && <div className="text-[13px] py-6 text-center sm:col-span-2" style={{ color: G.dim }}>해당하는 운송사가 없어요</div>}
          </div>
        </>}
        <div className="text-[12px] font-extrabold tracking-[0.06em] mt-4 mb-2" style={{ color: G.dim }}>시작까지</div>
        <div className="flex flex-wrap gap-2 items-center">
          {DELAY_OPTIONS.map((m) => <button key={m} type="button" onClick={() => setMins(m)} className="h-10 min-w-[60px] px-3.5 rounded-xl text-[13.5px] font-extrabold" style={chip(mins === m)}>{m ? `${m}분` : "즉시"}</button>)}
          <button type="button" onClick={() => setMins("custom")} className="h-10 px-3.5 rounded-xl text-[13.5px] font-extrabold" style={chip(mins === "custom")}>직접 입력</button>
          {mins === "custom" && <span className="flex items-center gap-1.5"><input value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} inputMode="numeric" placeholder="15" className="w-16 h-10 rounded-xl px-3 text-[14px] font-extrabold text-center outline-none" style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${G.line2}`, color: G.ink }} /><span className="text-[13px]" style={{ color: G.sub }}>분 뒤(최대 240)</span></span>}
        </div>
        <div className="text-[12px] font-extrabold tracking-[0.06em] mt-4 mb-2" style={{ color: G.dim }}>화면에 보일 안내</div>
        <textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, 120))} rows={2} className="w-full rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed outline-none resize-none" style={{ background: "rgba(255,255,255,.03)", border: `1px solid ${G.line2}`, color: G.ink }} />
        <div className="flex justify-between text-[11.5px] mt-1" style={{ color: G.dim }}><span>제목 "시스템 업데이트 예정" 아래에 한 줄로 보여요</span><button type="button" onClick={() => setMessage(DEFAULT_FORCE_MSG)} style={{ color: G.ice }}>기본 문구로</button></div>
        <div className="grid grid-cols-3 gap-2.5 mt-4">
          {[["대상 운송사", scope === "all" ? "전체" : `${pick.length}곳`, G.ink], ["지금 접속 중", `${sumNow}명`, G.ink], ["이전 버전", `${sumOld}명`, G.warn]].map(([k, v, c]) => (
            <div key={k} className="rounded-[14px] px-3.5 py-3" style={{ background: "rgba(255,255,255,.03)", border: `1px solid ${G.line2}` }}>
              <div className="text-[11.5px] font-extrabold" style={{ color: G.dim }}>{k}</div><div className="text-[22px] font-black tabular-nums" style={{ color: c }}>{v}</div></div>))}
        </div>
        {msg && <div className="mt-3 text-[13px] font-bold" style={{ color: msg.includes("못") || msg.includes("없어요") ? G.bad : G.ok }}>{msg}</div>}
        <button type="button" disabled={busy || !target?.build} onClick={schedule} className="mt-4 w-full h-12 rounded-[14px] text-[15.5px] font-black disabled:opacity-40" style={{ ...GOLD_BTN, boxShadow: "0 10px 30px rgba(215,188,130,.22)" }}>
          {delay ? `${delay}분 뒤 강제 업데이트 예약` : "지금 바로 강제 업데이트"}</button>
      </AdmPanel>

      <div className="grid gap-4">
        <AdmPanel code="SCHEDULED" title="진행 중인 예약">
          {!active ? <div className="text-[13.5px] py-2" style={{ color: G.dim }}>진행 중인 예약이 없어요.</div> : (
            <div className="rounded-2xl p-4" style={{ border: "1px solid rgba(215,188,130,.35)", background: "linear-gradient(135deg,rgba(215,188,130,.10),rgba(143,176,240,.04))" }}>
              <div className="flex items-center gap-2 text-[12px] font-black tracking-[0.12em]" style={{ color: G.gold }}>
                <span className="w-2 h-2 rounded-full" style={{ background: G.gold, boxShadow: "0 0 0 4px rgba(215,188,130,.18)" }} />
                <span className="truncate">{cfg.scope === "pick" ? (cfg.companies || []).join(" · ") : "전체 운송사"}{cfg.shippers ? " · 화주사" : ""}</span></div>
              <div className="flex items-end justify-between gap-3 mt-1">
                <div className="text-[44px] font-black tabular-nums leading-none" style={{ color: G.ink }}>{left > 0 ? fmtLeft(left) : finished ? "적용 완료" : "적용 중"}</div>
                {prog && <div className="text-right shrink-0"><div className="text-[30px] font-black tabular-nums leading-none" style={{ color: G.goldHi }}>{prog.pct}%</div>
                  <div className="text-[11.5px] font-bold mt-1" style={{ color: G.dim }}>접속 중 {prog.done}/{prog.total}명 적용</div></div>}
              </div>
              {left > 0 && <div className="text-[11.5px] font-bold mt-2" style={{ color: G.dim }}>남은 시간 · 아래 막대는 적용률이에요</div>}
              <div className="h-1.5 rounded-full mt-3 overflow-hidden" style={{ background: "rgba(255,255,255,.07)" }}><div className="h-full" style={{ width: `${prog ? prog.pct : Math.min(100, (1 - left / total) * 100)}%`, transition: "width .6s", background: "linear-gradient(90deg,#D7BC82,#F3E3BC)", transition: "width 1s linear" }} /></div>
              <div className="flex justify-between text-[12.5px] font-bold mt-2.5" style={{ color: G.sub }}><span>v{cfg.version} 적용</span><span>{fmtTime(Number(cfg.fireAt))} 시작</span></div>
              <div className="flex flex-wrap gap-2 mt-3.5">
                <button type="button" disabled={busy} onClick={() => save({ fireAt: Math.max(Date.now(), Number(cfg.fireAt)) + 120000 }, "2분 미뤘어요.")} className="h-9 px-3.5 rounded-[11px] text-[13px] font-black" style={{ border: "1px solid rgba(215,188,130,.5)", color: G.goldHi }}>+2분 미루기</button>
                <button type="button" disabled={busy} onClick={() => save({ fireAt: Date.now() }, "지금 바로 적용해요.")} className="h-9 px-3.5 rounded-[11px] text-[13px] font-black" style={{ border: "1px solid rgba(215,188,130,.5)", color: G.goldHi }}>지금 바로</button>
                <button type="button" disabled={busy} onClick={async () => { if (await kpConfirm("예약을 취소할까요? 대상 화면의 안내가 바로 사라져요.")) save({ active: false, history: history.map((h) => (h.id === cfg.id ? { ...h, canceled: true } : h)) }, "예약을 취소했어요."); }} className="h-9 px-3.5 rounded-[11px] text-[13px] font-black" style={{ border: "1px solid rgba(255,138,122,.5)", color: G.bad }}>예약 취소</button>
              </div>
            </div>)}
        </AdmPanel>
        <AdmPanel code="HISTORY" title="지난 강제 업데이트">
          {!history.length ? <div className="text-[13.5px] py-2" style={{ color: G.dim }}>아직 기록이 없어요.</div> : history.map((h) => (
            <div key={h.id} className="flex justify-between gap-3 py-2.5 text-[13px]" style={{ borderBottom: `1px solid ${G.line2}`, color: G.sub }}>
              <span className="truncate">{fmtTime(h.at)} · {h.scope === "pick" ? (h.companies || []).join(" · ") : "전체 운송사"}{h.shippers ? " · 화주사" : ""} · {h.mins ? `${h.mins}분` : "즉시"}</span>
              <b className="shrink-0" style={{ color: h.canceled ? G.dim : G.ok }}>{h.canceled ? "취소" : `v${h.version}${h.done ? ` · ${h.donePct ?? 100}%` : ""}`}</b></div>))}
          <div className="text-[12.5px] mt-3 leading-relaxed" style={{ color: G.dim }}>이미 최신인 사람에게는 안내가 뜨지 않아요. 화면을 꺼 둔 사람은 다음에 열 때 배포한 버전으로 열려요.</div>
        </AdmPanel>
      </div>
    </div>
  );
}
