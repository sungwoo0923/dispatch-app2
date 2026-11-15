// ======================= src/ReleasePanel.jsx =======================
// 🚦 2026-11-13 관리센터 › 업데이트 배포 — 새 화면을 올려도 여기서 [업데이트 배포]를 눌러야 가입자 화면이 바뀐다
//  · 최고관리자 · 부관리자는 항상 최신 화면(먼저 써 보고 확인) → 괜찮으면 배포 → 그때 모든 가입자에게 "새 버전" 안내
//  · 서버: api/shell.js · 화면: src/releaseGate.js · 저장: publicRelease/current
//  🧹 2026-11-15 리디자인 — 한 장짜리 "지금 상태 + [업데이트 배포]" 만 크게. 배포하면 예전 버전 기록 · 목록은 지운다(쌓이지 않게).
//   예전 주소로 고정 · 잠금 끄기 · 화주사 강제 업데이트는 맨 아래 [고급 설정]을 펼쳐야 보인다.
import React from "react";
import { CUR_VER, CUR_BUILD, watchRelease, latestVersion, publishRelease, setReleaseLock, checkRelease, watchBuilds, registerBuild, probeDeploy, pinRelease } from "./releaseGate";
import { hardReloadForUpdate } from "./UpdateBanner";
import { usePlatformLive } from "./PlatformLive";
import { kpConfirm } from "./kpDialog";

const stamp = (v) => { if (!v) return "-"; const d = new Date(v); if (isNaN(d)) return "-"; const k = new Date(d.getTime() + 9 * 3600e3).toISOString(); return `${k.slice(5, 10).replace("-", ".")} ${k.slice(11, 16)}`; };
const btn = "h-11 px-5 rounded-xl text-[14.5px] font-black whitespace-nowrap disabled:opacity-40";
const card = "rounded-[20px] border border-[#E3E8F0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)]";

// 한 칸: 이름 · 버전 · 시각
const Cell = ({ label, ver, at, tone }) => (
  <div className="flex-1 min-w-[150px] px-5 py-4">
    <div className="text-[12.5px] font-bold text-[#7A879C]">{label}</div>
    <div className={`mt-0.5 text-[24px] font-black tabular-nums ${tone || "text-[#0F1A30]"}`}>{ver ? `v${ver}` : "-"}</div>
    <div className="text-[12.5px] font-semibold text-[#9AA9C3] tabular-nums">{at}</div>
  </div>
);

export default function ReleasePanel({ children }) {
  const live = usePlatformLive();
  const [rel, setRel] = React.useState(undefined); // undefined 읽는 중 · null 없음
  const [latest, setLatest] = React.useState(null);
  const [chk, setChk] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [note, setNote] = React.useState("");
  const [adv, setAdv] = React.useState(false);
  React.useEffect(() => watchRelease(setRel), []);
  const [builds, setBuilds] = React.useState([]);
  React.useEffect(() => { registerBuild(); return watchBuilds(setBuilds); }, []);
  const [addr, setAddr] = React.useState("");
  const [probe, setProbe] = React.useState(null);
  const refresh = React.useCallback(() => { latestVersion().then(setLatest).catch(() => setLatest(null)); checkRelease().then(setChk).catch(() => setChk({ error: true })); }, []);
  React.useEffect(() => { refresh(); const t = setInterval(refresh, 60000); return () => clearInterval(t); }, [refresh]);

  const locked = !!rel && rel.enabled !== false && !!rel.url;
  const mineIsLatest = !!latest?.build && latest.build === CUR_BUILD;
  const pinnedIsLatest = locked && !!latest?.build && rel.build === latest.build;
  const waiting = locked && !pinnedIsLatest;
  const noUrl = !!latest && !latest.url;
  const run = async (label, fn, done) => { setBusy(label); setMsg(""); try { await fn(); setMsg(done); refresh(); } catch (e) { setMsg(e?.message?.includes("permission") ? "권한이 없어요(최고관리자 · 부관리자만). Firebase 규칙 배포도 확인해 주세요." : (e?.message || "실패했어요")); } finally { setBusy(""); } };
  const publish = async () => {
    if (!latest?.url) return setMsg("이 배포의 주소를 알 수 없어 배포할 수 없어요(Vercel 시스템 환경변수 VERCEL_URL 확인).");
    if (!mineIsLatest && !(await kpConfirm("지금 보고 있는 화면이 최신이 아니에요.\n최신 화면을 확인하지 않고 배포할까요?\n\n[취소] → [내 화면 최신으로]를 먼저 눌러 보는 걸 권해요."))) return;
    if (!(await kpConfirm(`v${latest.version} 을 모든 가입자에게 배포할까요?\n\n· PC · 모바일 · 기사앱 · 화주 화면 모두 바뀌어요\n· 이전 버전 기록은 지워져요(되돌리기 목록에 남지 않아요)`))) return;
    run("pub", () => publishRelease(latest, note), `v${latest.version} 배포 완료 — 가입자 화면은 새로고침하면 바뀌어요`).then(() => setNote(""));
  };
  const online = (live?.onlineList || []).filter((p) => p.now);
  const onPinned = locked ? online.filter((p) => p.build && p.build === rel.build).length : 0;
  // 고를 수 있는 버전 — 지금 배포한 것보다 새로 올린 화면만(예전 것은 배포할 때 지운다)
  const newer = builds.filter((b) => !locked || b.build > rel.build);

  const state = rel === undefined ? { t: "확인 중…", d: "", tone: "bg-[#F1F4F9] text-[#5B6B85]" }
    : !locked ? { t: "잠금이 꺼져 있어요", d: "새 화면을 올리면 바로 모두에게 바뀌어요. [업데이트 배포]를 한 번 누르면 그때부터는 여기서 배포해야 가입자 화면이 바뀌어요.", tone: "bg-[#FDF3F2] text-[#B4342A]" }
    : waiting ? { t: "배포를 기다리는 새 버전이 있어요", d: "최신 화면을 확인한 뒤 [업데이트 배포]를 누르면 모든 가입자에게 나가요.", tone: "bg-[#FFF6E5] text-[#9A5B00]" }
    : { t: "가입자 화면이 최신이에요", d: "새 화면을 올리면 여기에 [업데이트 배포] 버튼이 켜져요.", tone: "bg-[#E8F7EF] text-[#0F7A43]" };

  return (
    <div className="space-y-4" data-kp="release-panel">
      {/* ── 지금 상태 + 배포 ── */}
      <section className={`${card} overflow-hidden`}>
        <div className="flex items-start gap-3 px-5 pt-5">
          <span className={`shrink-0 h-7 px-3 rounded-full text-[12.5px] font-black inline-flex items-center ${state.tone}`}>{state.t}</span>
          <span className="text-[13.5px] text-[#5B6B85] leading-relaxed pt-0.5">{state.d}</span>
        </div>
        <div className="mt-3 flex flex-wrap divide-x divide-[#EEF1F6] border-y border-[#EEF1F6] bg-[#FAFBFD]">
          <Cell label="가입자 화면" ver={locked ? rel.version : latest?.version} at={locked ? `배포 ${stamp(rel.releasedAt)}${online.length ? ` · 접속 ${onPinned}/${online.length}명` : ""}` : "잠금 없음"} tone={pinnedIsLatest ? "text-[#0F7A43]" : undefined} />
          <Cell label="올라온 최신" ver={latest?.version} at={latest ? `올림 ${stamp(latest.build)}` : "확인 중"} tone={waiting ? "text-[#2D5BD8]" : undefined} />
          <Cell label="내 화면" ver={CUR_VER} at={latest ? (mineIsLatest ? "최신이에요" : "최신이 아니에요") : ""} />
        </div>
        <div className="px-5 py-4 flex flex-wrap items-center gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="무엇이 바뀌었나요? (선택)" className="h-11 flex-1 min-w-[200px] px-3.5 rounded-xl border border-[#DCE3EE] text-[14px] outline-none focus:border-[#1B2B4B]" />
          {!mineIsLatest && latest && <button type="button" onClick={hardReloadForUpdate} className={`${btn} border border-[#C9D5EA] bg-white text-[#1B2B4B]`}>내 화면 최신으로</button>}
          <button type="button" onClick={publish} disabled={!!busy || !latest || pinnedIsLatest || noUrl} className={`${btn} bg-[#1B2B4B] text-white`}>{busy === "pub" ? "배포 중…" : pinnedIsLatest ? "배포할 새 버전 없음" : `업데이트 배포${latest ? ` · v${latest.version}` : ""}`}</button>
        </div>
        {noUrl && <div className="px-5 pb-4 -mt-1 text-[13px] font-bold text-[#B4342A]">이 배포의 주소(VERCEL_URL)를 몰라서 배포할 수 없어요. Vercel › Settings › Environment Variables 에서 시스템 환경변수 자동 노출을 켜 주세요.</div>}
        {msg && <div className="px-5 pb-4 -mt-1 text-[13.5px] font-bold text-[#1B2B4B]">{msg}</div>}
        {locked && chk && (chk.error || chk.ok === false) && (
          <div className="mx-5 mb-5 rounded-xl border border-[#F0D9A8] bg-[#FFF8EA] px-4 py-3 text-[13px] text-[#6B4A00] leading-relaxed">
            {chk.error ? "점검 주소에 연결하지 못했어요. 배포 직후라면 잠시 뒤 다시 눌러 주세요." : <>가입자에게 배포 버전 화면을 못 가져오고 있어요(응답 {chk.status || "없음"}) — 지금은 가입자도 최신 화면을 봐요. Vercel › <b>Settings › Deployment Protection</b> 에서 <b>Protection Bypass for Automation</b> 을 켜고 한 번 더 배포해 주세요.</>}
            <button type="button" onClick={refresh} className="ml-2 underline font-black">다시 점검</button>
          </div>
        )}
      </section>

      {/* ── 고급 설정(펼쳐야 보임) ── */}
      <section className={card}>
        <button type="button" onClick={() => setAdv((v) => !v)} className="w-full flex items-center gap-2 px-5 py-4 text-left">
          <span className="text-[15px] font-black text-[#0F1A30]">고급 설정</span>
          <span className="text-[12.5px] text-[#7A879C]">다른 버전으로 고정 · 잠금 끄기 · 화주사 강제 업데이트</span>
          <span className="ml-auto text-[#7A879C] text-[13px] font-black">{adv ? "접기 ▲" : "펼치기 ▼"}</span>
        </button>
        {adv && (
          <div className="px-5 pb-5 space-y-5 border-t border-[#EEF1F6] pt-4">
            <div>
              <div className="text-[14px] font-black text-[#0F1A30]">다른 버전으로 고정</div>
              <div className="mt-0.5 text-[12.5px] text-[#7A879C]">배포한 버전보다 나중에 올린 화면만 보여요. 예전 버전은 배포할 때 자동으로 지워져요.</div>
              {newer.length > 0 ? (
                <ul className="mt-2 divide-y divide-[#EEF1F6] rounded-xl border border-[#E3E8F0]">
                  {newer.slice(0, 8).map((b) => (
                    <li key={b.build} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className="text-[14.5px] font-black tabular-nums text-[#0F1A30] w-[76px]">v{b.version}</span>
                      <span className="text-[12.5px] font-semibold text-[#5B6B85] tabular-nums flex-1">올림 {stamp(b.build)}</span>
                      <button type="button" disabled={!!busy} onClick={async () => { if (await kpConfirm(`가입자 화면을 v${b.version} 으로 고정할까요?\n이보다 예전 버전 기록은 지워져요.`)) run("pin", () => pinRelease(b, "버전 고정"), `가입자 화면을 v${b.version} 으로 고정했어요`); }} className="h-8 px-3 rounded-lg border border-[#C9D5EA] bg-white text-[12.5px] font-black text-[#1B2B4B] hover:bg-[#F5F8FD]">이 버전으로</button>
                    </li>))}
                </ul>
              ) : <div className="mt-2 text-[13px] text-[#9AA9C3]">고를 수 있는 새 버전이 없어요.</div>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input value={addr} onChange={(e) => { setAddr(e.target.value); setProbe(null); }} placeholder="Vercel 배포 주소로 고정 — 예: dispatch-app2-abc123.vercel.app" className="h-10 flex-1 min-w-[240px] px-3 rounded-xl border border-[#DCE3EE] text-[13px] outline-none focus:border-[#1B2B4B]" />
                <button type="button" disabled={!addr.trim() || busy === "probe"} onClick={async () => { setBusy("probe"); setProbe(null); try { setProbe(await probeDeploy(addr)); } catch (e) { setProbe({ ok: false, error: e.message }); } finally { setBusy(""); } }} className="h-10 px-4 rounded-xl border border-[#C9D5EA] bg-white text-[13px] font-black text-[#1B2B4B]">{busy === "probe" ? "확인 중…" : "버전 확인"}</button>
              </div>
              {probe && (probe.ok ? (
                <div className="mt-2 flex items-center gap-3 flex-wrap text-[13.5px]">
                  <span className="font-black text-[#0F1A30]">v{probe.version}</span><span className="text-[#5B6B85]">올림 {stamp(probe.build)}</span>
                  <button type="button" disabled={!!busy} onClick={async () => { if (await kpConfirm(`가입자 화면을 v${probe.version} 으로 고정할까요?`)) run("pin", () => pinRelease(probe, "주소로 고정"), `가입자 화면을 v${probe.version} 으로 고정했어요`); }} className="h-8 px-3 rounded-lg bg-[#1B2B4B] text-white text-[12.5px] font-black">이 버전으로</button>
                </div>
              ) : <div className="mt-2 text-[13px] font-bold text-[#B4342A]">{probe.error || "확인하지 못했어요"}</div>)}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <div className="text-[14px] font-black text-[#0F1A30]">배포 잠금 {locked ? "켜짐" : "꺼짐"}</div>
                <div className="mt-0.5 text-[12.5px] text-[#7A879C]">끄면 새 화면을 올리는 즉시 모든 가입자에게 바뀌어요.</div>
              </div>
              {locked
                ? <button type="button" disabled={!!busy} onClick={async () => { if (await kpConfirm("잠금을 끌까요?\n끄면 새 화면을 올리는 즉시 모든 가입자에게 적용돼요.")) run("lock", () => setReleaseLock(false), "잠금을 껐어요"); }} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] bg-white text-[13px] font-black text-[#5B6B85]">잠금 끄기</button>
                : rel?.url && <button type="button" disabled={!!busy} onClick={() => run("lock", () => setReleaseLock(true), "잠금을 다시 켰어요")} className="h-9 px-3.5 rounded-lg border border-[#C9D5EA] bg-white text-[13px] font-black text-[#1B2B4B]">잠금 다시 켜기 (v{rel.version})</button>}
            </div>
            {children}
          </div>
        )}
      </section>
    </div>
  );
}
