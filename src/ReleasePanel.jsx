// ======================= src/ReleasePanel.jsx =======================
// 🚦 2026-11-13 관리센터 › 업데이트 배포 — 새 화면을 올려도 여기서 [업데이트 배포]를 눌러야 가입자 화면이 바뀐다
//  · 최고관리자 · 부관리자는 항상 최신 화면(먼저 써 보고 확인) → 괜찮으면 배포 → 그때 모든 가입자에게 "새 버전" 안내
//  · 서버: api/shell.js · 화면: src/releaseGate.js · 저장: publicRelease/current
import React from "react";
import { CUR_VER, CUR_BUILD, watchRelease, latestVersion, publishRelease, setReleaseLock, rollbackRelease, checkRelease } from "./releaseGate";
import { hardReloadForUpdate } from "./UpdateBanner";
import { usePlatformLive } from "./PlatformLive";
import { kpConfirm } from "./kpDialog";

const stamp = (v) => { if (!v) return "-"; const d = new Date(v); if (isNaN(d)) return "-"; const k = new Date(d.getTime() + 9 * 3600e3).toISOString(); return `${k.slice(0, 10)} ${k.slice(11, 16)}`; };
const Box = ({ label, ver, at, strong, sub }) => (
  <div className={`flex-1 min-w-[220px] rounded-2xl border px-5 py-4 ${strong ? "border-[#1B2B4B] bg-[#0F1A30] text-white" : "border-[#DCE3EE] bg-white text-[#0F1A30]"}`}>
    <div className={`text-[12px] font-extrabold tracking-[0.18em] ${strong ? "text-[#8FB0F0]" : "text-[#94A3B8]"}`}>{label}</div>
    <div className="mt-1 text-[26px] font-black tabular-nums">{ver ? `v${ver}` : "-"}</div>
    <div className={`text-[13px] font-semibold ${strong ? "text-[#CFE0FF]" : "text-[#5B6B85]"}`}>{at}</div>
    {sub && <div className={`mt-1 text-[12.5px] font-bold ${strong ? "text-[#CFE0FF]" : "text-[#7A879C]"}`}>{sub}</div>}
  </div>
);
const btn = "h-11 px-5 rounded-xl text-[14.5px] font-black whitespace-nowrap disabled:opacity-50";

export default function ReleasePanel() {
  const live = usePlatformLive();
  const [rel, setRel] = React.useState(undefined); // undefined 읽는 중 · null 없음
  const [latest, setLatest] = React.useState(null);
  const [chk, setChk] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [note, setNote] = React.useState("");
  React.useEffect(() => watchRelease(setRel), []);
  const refresh = React.useCallback(() => { latestVersion().then(setLatest).catch(() => setLatest(null)); checkRelease().then(setChk).catch(() => setChk({ error: true })); }, []);
  React.useEffect(() => { refresh(); const t = setInterval(refresh, 60000); return () => clearInterval(t); }, [refresh]);

  const locked = !!rel && rel.enabled !== false && !!rel.url;
  const mineIsLatest = !!latest?.build && latest.build === CUR_BUILD;
  const pinnedIsLatest = locked && !!latest?.build && rel.build === latest.build;
  const waiting = locked && !pinnedIsLatest; // 올렸지만 아직 가입자에게 안 나간 변경이 있다
  const noUrl = !!latest && !latest.url;
  const run = async (label, fn, done) => { setBusy(label); setMsg(""); try { await fn(); setMsg(done); refresh(); } catch (e) { setMsg(e?.message?.includes("permission") ? "권한이 없습니다(최고관리자 · 부관리자만). Firebase 규칙 배포도 확인해 주세요." : (e?.message || "실패했습니다")); } finally { setBusy(""); } };
  const publish = async () => {
    if (!latest?.url) return setMsg("이 배포의 주소를 알 수 없어 배포할 수 없습니다(Vercel 시스템 환경변수 VERCEL_URL 확인).");
    if (!mineIsLatest && !(await kpConfirm("지금 보고 있는 화면이 최신이 아닙니다.\n최신 화면을 직접 확인하지 않고 배포할까요?\n\n[취소]를 누르고 [내 화면 최신으로]를 먼저 누르는 것을 권합니다."))) return;
    if (!(await kpConfirm(`v${latest.version} (${stamp(latest.build)}) 을 모든 가입자에게 배포할까요?\n\n· PC · 모바일 · 기사앱 · 화주 화면 모두 해당\n· 접속 중인 사람에게는 "새 버전" 안내가 뜨고, 새로고침하면 바뀝니다`))) return;
    run("pub", () => publishRelease(latest, note), `v${latest.version} 배포 완료 — 가입자 화면은 새로고침하면 바뀝니다`).then(() => setNote(""));
  };
  const online = (live?.onlineList || []).filter((p) => p.now);
  const onPinned = locked ? online.filter((p) => p.build && p.build === rel.build).length : 0;
  const hist = [...(rel?.history || [])].sort((a, b) => b.at - a.at).slice(0, 12);

  return (
    <div className="space-y-5" data-kp="release-panel">
      <div className="flex flex-wrap gap-3">
        <Box strong label="내 화면 (관리자)" ver={CUR_VER} at={stamp(CUR_BUILD)} sub={latest ? (mineIsLatest ? "최신 화면입니다" : `최신은 v${latest.version} — 아래 [내 화면 최신으로]`) : "확인 중"} />
        <Box label="올라가 있는 최신" ver={latest?.version} at={stamp(latest?.build)} sub={waiting ? "아직 가입자에게 배포 전" : locked ? "가입자에게 배포됨" : ""} />
        <Box label="가입자 화면" ver={locked ? rel.version : latest?.version} at={locked ? `배포 ${stamp(rel.releasedAt)}` : "잠금 없음"} sub={locked ? `${rel.releasedBy || ""}${online.length ? ` · 접속 ${online.length}명 중 ${onPinned}명 이 버전` : ""}` : "올리면 바로 모두에게 적용(예전 방식)"} />
      </div>

      <section className="rounded-2xl border border-[#DCE3EE] bg-white p-5">
        <div className="text-[16px] font-black text-[#0F1A30]">{rel === undefined ? "확인 중…" : !locked ? "지금은 잠금이 꺼져 있습니다" : waiting ? "배포를 기다리는 새 버전이 있습니다" : "가입자 화면이 최신입니다"}</div>
        <div className="mt-1 text-[13.5px] text-[#5B6B85] leading-relaxed">
          {!locked ? "새 화면을 올리면 새로고침한 사람부터 바로 바뀝니다. [업데이트 배포]를 한 번 누르면 그때부터 잠금이 켜져서, 다음부터는 여기서 배포해야만 가입자 화면이 바뀝니다."
            : "새 화면을 올려도 가입자는 위 [가입자 화면] 버전을 계속 봅니다(새로고침해도 같음). 최고관리자 · 부관리자만 최신 화면을 보고, 확인한 뒤 [업데이트 배포]를 누르면 모두에게 나갑니다."}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="배포 메모(선택) — 예: 계약 화면 개편" className="h-11 flex-1 min-w-[220px] px-3 rounded-xl border border-[#DCE3EE] text-[14px] outline-none focus:border-[#1B2B4B]" />
          <button type="button" onClick={publish} disabled={!!busy || !latest || pinnedIsLatest || noUrl} className={`${btn} bg-[#1B2B4B] text-white`}>{busy === "pub" ? "배포 중…" : pinnedIsLatest ? "배포할 새 버전 없음" : `업데이트 배포${latest ? ` (v${latest.version})` : ""}`}</button>
          {!mineIsLatest && latest && <button type="button" onClick={hardReloadForUpdate} className={`${btn} border border-[#C9D5EA] bg-white text-[#1B2B4B]`}>내 화면 최신으로</button>}
          {locked && <button type="button" disabled={!!busy} onClick={async () => { if (await kpConfirm("잠금을 끌까요?\n끄면 예전처럼 새 화면을 올리는 즉시 모든 가입자에게 적용됩니다.")) run("lock", () => setReleaseLock(false), "잠금을 껐습니다 — 올리면 바로 모두에게 적용됩니다"); }} className={`${btn} border border-[#C9D5EA] bg-white text-[#5B6B85]`}>잠금 끄기</button>}
          {!locked && rel?.url && <button type="button" disabled={!!busy} onClick={() => run("lock", () => setReleaseLock(true), "잠금을 다시 켰습니다")} className={`${btn} border border-[#C9D5EA] bg-white text-[#1B2B4B]`}>잠금 다시 켜기 (v{rel.version})</button>}
        </div>
        {noUrl && <div className="mt-3 text-[13px] font-bold text-[#B4342A]">이 배포의 주소(VERCEL_URL)를 알 수 없어 배포 버튼을 쓸 수 없습니다. Vercel › Settings › Environment Variables 에서 시스템 환경변수 자동 노출이 켜져 있는지 확인해 주세요.</div>}
        {msg && <div className="mt-3 text-[13.5px] font-bold text-[#1B2B4B]">{msg}</div>}
      </section>

      <section className="rounded-2xl border border-[#DCE3EE] bg-white p-5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-[15px] font-black text-[#0F1A30]">동작 점검</div>
          <span className={`text-[13.5px] font-black ${!locked || chk?.ok ? "text-[#0F7A43]" : chk?.ok === false ? "text-[#B4342A]" : "text-[#7A879C]"}`}>
            {!chk ? "확인 중" : chk.error ? "점검 주소에 연결하지 못했습니다(화면 배포 직후면 잠시 뒤 다시)" : !locked ? "잠금 없음 — 점검할 것이 없습니다" : chk.ok ? "정상 — 가입자에게 배포 버전 화면이 나갑니다" : `배포 버전 화면을 가져오지 못합니다(응답 ${chk.status || "없음"}) — 지금은 가입자도 최신 화면을 봅니다`}
          </span>
          <button type="button" onClick={refresh} className="ml-auto h-9 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[13px] font-bold text-[#3A4A66]">다시 점검</button>
        </div>
        {locked && chk && chk.ok === false && (
          <div className="mt-3 rounded-xl border border-[#E3E8F0] bg-[#F7F9FC] px-4 py-3 text-[13.5px] text-[#3A4A66] leading-relaxed">
            Vercel이 예전 배포 주소를 로그인으로 막고 있는 경우입니다. 한 번만 설정하면 됩니다.<br />
            Vercel › 프로젝트 › <b>Settings › Deployment Protection</b> 에서 <b>Protection Bypass for Automation</b> 을 켜고(비밀값 생성), 화면을 한 번 더 올린(재배포) 뒤 [다시 점검]을 눌러 주세요. 또는 <b>Vercel Authentication</b> 을 끄면 됩니다.
            {chk.bypass ? " (우회 비밀값은 이미 들어 있습니다 — 재배포 후에도 같으면 알려 주세요.)" : ""}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[#DCE3EE] bg-white p-5">
        <div className="text-[15px] font-black text-[#0F1A30]">배포 기록</div>
        {hist.length === 0 ? <div className="mt-2 text-[13.5px] text-[#7A879C]">아직 배포 기록이 없습니다.</div> : (
          <ul className="mt-2 divide-y divide-[#EEF1F6]">
            {hist.map((h) => { const cur = locked && h.build === rel.build; return (
              <li key={`${h.build}_${h.at}`} className="flex items-center gap-3 py-2.5 flex-wrap">
                <span className="text-[15px] font-black tabular-nums text-[#0F1A30] w-[84px]">v{h.version}</span>
                <span className="text-[13px] font-semibold text-[#5B6B85] tabular-nums">{stamp(h.at)}</span>
                <span className="text-[13px] text-[#7A879C] truncate flex-1 min-w-0">{h.by}{h.note ? ` · ${h.note}` : ""}</span>
                {cur ? <span className="text-[12.5px] font-black text-[#0F7A43]">지금 가입자 화면</span>
                  : <button type="button" disabled={!!busy} onClick={async () => { if (await kpConfirm(`가입자 화면을 v${h.version} (${stamp(h.build)}) 으로 되돌릴까요?\n새 버전에 문제가 있을 때 씁니다.`)) run("rb", () => rollbackRelease(h), `v${h.version} 으로 되돌렸습니다`); }} className="h-8 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-black text-[#3A4A66]">이 버전으로 되돌리기</button>}
              </li>); })}
          </ul>)}
      </section>
    </div>
  );
}
