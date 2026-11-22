// ======================= src/VideoStudio.jsx =======================
// 🎬 2026-11-18 AI 본부 › 홍보팀 "영상 작업실" — 숏츠 · 교육영상을 홍보팀 AI와 같이 만든다
//  ① 기획: 영상 종류 · 주제 · 길이 · 보는 사람 · 분위기 · 올릴 곳 → [기획안 만들기]
//  ② 배경음악 큐시트: 장면마다 음악 · 볼륨(말할 때 낮춤) · 동작 + 무료 음원 검색어 → CSV(엑셀)로 내려받기
//  ③ 자막: 장면 시간에 맞춘 SRT 파일 내려받기(캡컷 · 프리미어 · 유튜브에 그대로)
//  서버: functions/aiVideo.js(aiVideoPlan) · 파일 계산: src/videoStudio.js
//  만든 기획안은 이 브라우저에 최근 10개까지 기억한다(다시 열기)
//  🎬 2026-11-18 [교육 영상 고치기] 탭 — 도움말 센터 교육 영상(1~14편)의 강조 상자 · 카메라 · 화면 바뀌는 시각 · 자막 · 효과를 직접 고친다(src/VideoFixer.jsx)
import React from "react";
import { auth, FUNCTIONS_BASE } from "./firebase";
import { ShellIcon } from "./AdminShell";
import { G, NUM, GOLD_BTN, AdmPanel, LivePulse } from "./adminCenter/admUi";
import { toSrt, cueSheetCsv, planText, downloadText, safeName, clock, subtitleCues } from "./videoStudio";
const VideoFixer = React.lazy(() => import("./VideoFixer"));

const KINDS = [["숏츠", "세로 · 15~60초"], ["교육영상", "가로 · 1~5분"], ["홍보영상", "가로 · 30초~2분"]];
const LENGTHS = { 숏츠: [15, 30, 45, 60], 교육영상: [60, 120, 180, 300], 홍보영상: [30, 60, 90, 120] };
const AUDIENCE = ["화주 · 물류 담당자", "운송 기사님", "우리 회사 직원", "새로 가입할 운송사"];
const MOODS = ["신뢰감", "활기찬", "차분한", "유머러스", "긴박감", "따뜻한"];
const PLATFORMS = { 숏츠: ["유튜브 쇼츠", "인스타 릴스", "틱톡"], 교육영상: ["유튜브", "사내 교육", "카카오톡 공유"], 홍보영상: ["유튜브", "홈페이지", "인스타그램"] };
const IDEAS = {
  숏츠: ["지게차 상차 전 꼭 보는 3가지", "배차 30초 만에 끝내는 법(LogisWeb)", "새벽 상차 기사님의 하루", "화물 결박, 이렇게 하면 안 돼요"],
  교육영상: ["신입 배차 직원 첫날 교육", "기사앱으로 인수증 올리는 방법", "냉동탑 온도 관리 기본", "상하차 안전수칙 5가지"],
  홍보영상: ["우리 회사 소개(전국 당일 배송)", "화주가 우리를 고르는 이유", "컨테이너 · 해상 · 항공까지 한 번에"],
};
const LS = "kpVideoPlans";
const loadSaved = () => { try { return JSON.parse(localStorage.getItem(LS) || "[]"); } catch { return []; } };
const saveList = (l) => { try { localStorage.setItem(LS, JSON.stringify(l.slice(0, 10))); } catch { /* 무시 */ } };
const usd = (u) => (u ? ((u.input || 0) * 2 + (u.output || 0) * 10 + (u.cacheRead || 0) * 0.1 + (u.cacheWrite || 0) * 2.5) / 1e6 : 0);

function Chip({ on, onClick, children, sub }) {
  return (
    <button type="button" onClick={onClick} className="text-left px-3 py-2 rounded-xl transition min-w-0" style={on ? { ...GOLD_BTN, boxShadow: "0 6px 16px rgba(215,188,130,.22)" } : { border: `1px solid ${G.line}`, background: "rgba(255,255,255,.03)", color: G.ink }}>
      <span className="block text-[13.5px] font-black whitespace-nowrap">{children}</span>
      {sub && <span className="block text-[11px] font-bold whitespace-nowrap" style={{ opacity: on ? 0.75 : 0.6 }}>{sub}</span>}
    </button>
  );
}
const lbl = "block text-[12px] font-extrabold tracking-[0.04em] mb-1.5";

// 📣 2026-11-23 기획안 → 관리자센터 › 홍보 › 영상 편집실(장면 · 나레이션을 그대로 옮겨 실제 영상으로 만든다)
async function toEditor(plan, inp) {
  const [{ addDoc, collection, serverTimestamp }, { db }, kit] = await Promise.all([import("firebase/firestore"), import("./firebase"), import("./promo/promoKit")]);
  const wide = inp?.kind !== "숏츠"; const p = kit.newProject(wide ? "wide" : "shorts"); p.title = plan.title || p.title;
  p.scenes = (plan.scenes || []).map((s, i, a) => kit.newScene(i === a.length - 1 ? "cta" : "title", { kicker: i === 0 ? "" : s.title || "", title: (s.subtitles || [])[0] || s.title || "", sub: (s.subtitles || []).slice(1, 2).join(" "), narration: inp?.narration === "자막만" ? "" : s.narration || "", caption: inp?.narration === "자막만" ? (s.subtitles || []).join(" ") : "", dur: Math.max(2, (Number(s.end) || 0) - (Number(s.start) || 0)) }));
  if (!p.scenes.length) return;
  const r = await addDoc(collection(db, "mktVideos"), { ...JSON.parse(JSON.stringify(p)), fromPlan: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  try { sessionStorage.setItem("kpOpenVideo", r.id); } catch { /* 무시 */ }
  window.dispatchEvent(new CustomEvent("kp-admin-go", { detail: "mkt:video" }));
}

function PlanStudio() {
  const [f, setF] = React.useState({ kind: "숏츠", topic: "", seconds: 30, audience: AUDIENCE[0], mood: MOODS[0], platform: "유튜브 쇼츠", narration: "내레이션", notes: "" });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [cur, setCur] = React.useState(() => loadSaved()[0] || null); // { plan, input, at, usage }
  const [saved, setSaved] = React.useState(loadSaved);
  const [tab, setTab] = React.useState("plan");
  const [copied, setCopied] = React.useState(false);
  const [secs, setSecs] = React.useState(0);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const pickKind = (k) => setF((p) => ({ ...p, kind: k, seconds: LENGTHS[k][1], platform: PLATFORMS[k][0] }));
  React.useEffect(() => { if (!busy) return undefined; const t0 = Date.now(); setSecs(0); const t = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 1000); return () => clearInterval(t); }, [busy]);

  const make = async () => {
    if (!f.topic.trim()) { setErr("주제를 넣어 주세요(아래 예시를 눌러도 돼요)."); return; }
    setErr(""); setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const r = await fetch(`${FUNCTIONS_BASE}/aiVideoPlan`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ input: { ...f, company: (localStorage.getItem("userCompany") || "").trim() } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `서버 오류(${r.status})`);
      const item = { plan: j.plan, input: j.input, usage: j.usage, at: Date.now() };
      const list = [item, ...loadSaved()].slice(0, 10);
      saveList(list); setSaved(list); setCur(item); setTab("plan");
    } catch (e) { setErr(e?.message || String(e)); }
    setBusy(false);
  };
  const plan = cur?.plan; const inp = cur?.input || {};
  const tracks = new Map((plan?.tracks || []).map((t) => [t.id, t]));
  const name = safeName(plan?.title);
  const copyAll = () => { try { navigator.clipboard.writeText(planText(plan, inp)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* 무시 */ } };
  const cues = plan ? subtitleCues(plan.scenes) : [];
  const total = inp.seconds || plan?.scenes?.at(-1)?.end || 1;

  return (
    <div className="kp-ai grid gap-3 sm:gap-4 2xl:grid-cols-[380px_minmax(0,1fr)] items-start">
      {/* ── ① 기획 조건 ── */}
      <AdmPanel code="01 · PLAN" title="영상 기획 조건">
        <div className="space-y-4">
          <div>
            <span className={lbl} style={{ color: G.sub }}>영상 종류</span>
            <div className="grid grid-cols-3 gap-1.5">{KINDS.map(([k, sub]) => <Chip key={k} on={f.kind === k} onClick={() => pickKind(k)} sub={sub}>{k}</Chip>)}</div>
          </div>
          <div>
            <span className={lbl} style={{ color: G.sub }}>주제</span>
            <textarea value={f.topic} onChange={(e) => set("topic", e.target.value)} rows={2} placeholder="예: 지게차 상차 전 꼭 보는 3가지"
              className="w-full rounded-xl px-3 py-2.5 text-[14px] font-bold resize-none focus:outline-none" style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${G.line}`, color: G.ink }} />
            <div className="mt-1.5 flex flex-wrap gap-1">{IDEAS[f.kind].map((t) => <button key={t} type="button" onClick={() => set("topic", t)} className="px-2 py-1 rounded-lg text-[11.5px] font-bold" style={{ border: `1px solid ${G.line}`, color: G.goldHi }}>{t}</button>)}</div>
          </div>
          <div>
            <span className={lbl} style={{ color: G.sub }}>길이</span>
            <div className="grid grid-cols-4 gap-1.5">{LENGTHS[f.kind].map((s) => <Chip key={s} on={Number(f.seconds) === s} onClick={() => set("seconds", s)}>{s < 60 ? `${s}초` : `${s / 60}분`}</Chip>)}</div>
          </div>
          <div>
            <span className={lbl} style={{ color: G.sub }}>보는 사람</span>
            <div className="grid grid-cols-2 gap-1.5">{AUDIENCE.map((a) => <Chip key={a} on={f.audience === a} onClick={() => set("audience", a)}>{a}</Chip>)}</div>
          </div>
          <div>
            <span className={lbl} style={{ color: G.sub }}>분위기 · 음악 느낌</span>
            <div className="grid grid-cols-3 gap-1.5">{MOODS.map((m) => <Chip key={m} on={f.mood === m} onClick={() => set("mood", m)}>{m}</Chip>)}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={lbl} style={{ color: G.sub }}>올릴 곳</span>
              <div className="grid gap-1.5">{PLATFORMS[f.kind].map((p) => <Chip key={p} on={f.platform === p} onClick={() => set("platform", p)}>{p}</Chip>)}</div>
            </div>
            <div>
              <span className={lbl} style={{ color: G.sub }}>소리</span>
              <div className="grid gap-1.5">{["내레이션", "자막만"].map((p) => <Chip key={p} on={f.narration === p} onClick={() => set("narration", p)} sub={p === "자막만" ? "음악 + 자막" : "목소리 + 자막 + 음악"}>{p}</Chip>)}</div>
            </div>
          </div>
          <div>
            <span className={lbl} style={{ color: G.sub }}>덧붙일 말(선택)</span>
            <textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="예: 우리 회사 냉동탑 차량이 나오게, 마지막에 상담 전화번호 자막"
              className="w-full rounded-xl px-3 py-2.5 text-[13px] font-semibold resize-none focus:outline-none" style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${G.line}`, color: G.ink }} />
          </div>
          {err && <div className="rounded-xl px-3 py-2 text-[12.5px] font-bold" style={{ background: "rgba(255,107,107,.1)", border: "1px solid rgba(255,107,107,.35)", color: "#FFB4B4" }}>{err}</div>}
          <button type="button" disabled={busy} onClick={make} className="w-full h-12 rounded-xl text-[15px] font-black inline-flex items-center justify-center gap-2 disabled:opacity-60" style={{ ...GOLD_BTN, boxShadow: "0 10px 24px rgba(215,188,130,.25)" }}>
            {busy ? <><LivePulse color={G.goldInk} size={7} />기획 중… {secs}초</> : <><ShellIcon name="spark" size={16} />기획안 만들기</>}
          </button>
          <div className="text-[11.5px] font-semibold leading-relaxed" style={{ color: G.dim }}>한 번 만들 때 보통 20~40초, 비용은 약 10~30원이에요. AI는 대본 · 음악 계획 · 자막을 만들고, 음악 파일을 새로 만들거나 영상을 직접 편집하지는 않아요.</div>
        </div>
      </AdmPanel>

      {/* ── 결과 ── */}
      <div className="min-w-0 space-y-3">
        {saved.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto adm-scroll pb-1" style={{ scrollbarWidth: "none" }}>
            {saved.map((s) => (
              <button key={s.at} type="button" onClick={() => setCur(s)} className="shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-bold whitespace-nowrap max-w-[220px] truncate"
                style={cur?.at === s.at ? GOLD_BTN : { border: `1px solid ${G.line}`, color: G.sub }}>{s.plan?.title || "기획안"}</button>
            ))}
          </div>
        )}
        {!plan ? (
          <AdmPanel>
            <div className="py-16 text-center">
              <div className="text-[10.5px] font-extrabold tracking-[0.32em]" style={{ ...NUM, color: G.gold }}>VIDEO STUDIO · 홍보팀</div>
              <div className="mt-2 text-[22px] font-black text-white">왼쪽에서 조건을 고르고 [기획안 만들기]를 눌러요</div>
              <div className="mt-2 text-[13px] leading-relaxed max-w-[520px] mx-auto" style={{ color: G.sub }}>장면별 대본 · 화면 구성 → 배경음악 큐시트(장면마다 볼륨 · 분위기) → 자막(SRT 파일)까지 한 번에 만들어 드려요. 캡컷 · 프리미어 같은 편집 프로그램에 자막 파일을 그대로 넣으면 돼요.</div>
            </div>
          </AdmPanel>
        ) : (<>
          <section className="adm-hero rounded-[20px] px-5 py-4">
            <div className="text-[10.5px] font-extrabold tracking-[0.3em]" style={{ ...NUM, color: G.gold }}>{inp.kind} · {clock(total)} · {inp.platform}</div>
            <div className="text-[22px] font-black text-white mt-0.5">{plan.title}</div>
            <div className="mt-1 text-[14px] font-bold" style={{ color: G.goldHi }}>첫 2초 — “{plan.hook}”</div>
            <div className="mt-1 text-[13px]" style={{ color: G.sub }}>{plan.summary} · {plan.format}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => downloadText(`${name}.srt`, toSrt(plan.scenes), "application/x-subrip;charset=utf-8")} className="h-9 px-3.5 rounded-xl text-[13px] font-black inline-flex items-center gap-1.5" style={GOLD_BTN}><ShellIcon name="file" size={14} />자막 SRT 받기</button>
              <button type="button" onClick={() => downloadText(`${name}_배경음악_큐시트.csv`, cueSheetCsv(plan), "text/csv;charset=utf-8")} className="adm-btn h-9 px-3.5 rounded-xl text-[13px] font-black inline-flex items-center gap-1.5"><ShellIcon name="sheet" size={14} />음악 큐시트(엑셀)</button>
              <button type="button" onClick={copyAll} className="adm-btn h-9 px-3.5 rounded-xl text-[13px] font-black">{copied ? "복사했어요" : "기획안 전체 복사"}</button>
              <button type="button" onClick={() => toEditor(plan, inp)} className="adm-btn h-9 px-3.5 rounded-xl text-[13px] font-black">🎬 영상 편집실에서 만들기</button>
              <span className="ml-auto self-center text-[11px] font-bold" style={{ ...NUM, color: G.dim }}>약 {Math.max(1, Math.round(usd(cur.usage) * 1400))}원</span>
            </div>
          </section>

          <div className="flex gap-1.5">
            {[["plan", "① 장면 대본"], ["bgm", "② 배경음악 큐시트"], ["srt", "③ 자막"], ["post", "올리기"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className="h-9 px-3.5 rounded-xl text-[13px] font-black whitespace-nowrap" style={tab === k ? GOLD_BTN : { border: `1px solid ${G.line}`, color: G.sub }}>{l}</button>
            ))}
          </div>

          {tab === "plan" && (
            <AdmPanel bodyClass="p-0">
              {plan.scenes.map((s) => (
                <div key={s.no} className="px-5 py-4 grid gap-1.5 sm:grid-cols-[92px_minmax(0,1fr)]" style={{ borderBottom: `1px solid ${G.line}` }}>
                  <div><div className="text-[18px] font-black" style={{ ...NUM, color: G.goldHi }}>{String(s.no).padStart(2, "0")}</div><div className="text-[12px] font-bold" style={{ ...NUM, color: G.dim }}>{clock(s.start)}–{clock(s.end)}</div></div>
                  <div className="min-w-0 space-y-1">
                    <div className="text-[15px] font-black text-white">{s.title}</div>
                    <div className="text-[13px]" style={{ color: G.sub }}><b style={{ color: G.gold }}>화면</b> {s.visual}</div>
                    {s.narration && <div className="text-[13px]" style={{ color: G.ink }}><b style={{ color: G.gold }}>내레이션</b> {s.narration}</div>}
                    {!!s.subtitles?.length && <div className="flex flex-wrap gap-1">{s.subtitles.map((t, i) => <span key={i} className="px-2 py-0.5 rounded-md text-[12px] font-bold" style={{ background: "rgba(255,255,255,.06)", color: "#fff" }}>{t}</span>)}</div>}
                    <div className="text-[12px] font-bold" style={{ color: G.iceHi }}>♪ {s.bgm?.track} · 볼륨 {s.bgm?.volume} · {s.bgm?.action}</div>
                  </div>
                </div>
              ))}
            </AdmPanel>
          )}

          {tab === "bgm" && (<>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {plan.tracks.map((t) => (
                <AdmPanel key={t.id} bodyClass="p-4">
                  <div className="flex items-center gap-2"><span className="w-8 h-8 rounded-lg grid place-items-center text-[14px] font-black" style={GOLD_BTN}>{t.id}</span><span className="text-[15px] font-black text-white">{t.mood}</span><span className="ml-auto text-[12px] font-bold" style={{ ...NUM, color: G.gold }}>{t.bpm} BPM</span></div>
                  <div className="mt-1.5 text-[12.5px]" style={{ color: G.sub }}>{t.genre} · {t.where}</div>
                  <div className="mt-2 flex flex-wrap gap-1">{(t.keywords || []).map((k) => <span key={k} className="px-2 py-0.5 rounded-md text-[11.5px] font-bold" style={{ border: `1px solid ${G.line}`, color: G.goldHi }}>{k}</span>)}</div>
                </AdmPanel>
              ))}
            </div>
            {/* 볼륨 흐름 — 시간 축 위에 장면별 볼륨 막대 */}
            <AdmPanel code="VOLUME" title="볼륨 흐름" right={<span className="text-[11.5px] font-bold" style={{ color: G.dim }}>말하는 장면은 낮게 · 말 없는 장면은 높게</span>}>
              <div className="flex items-end gap-[2px] h-[120px]">
                {plan.scenes.map((s) => (
                  <div key={s.no} className="h-full flex flex-col justify-end min-w-0" style={{ flex: `${Math.max(0.5, s.end - s.start)} 1 0` }} title={`${s.no}. ${s.title} · ${s.bgm?.track} · 볼륨 ${s.bgm?.volume}`}>
                    <div className="rounded-t-md" style={{ height: `${Math.max(4, s.bgm?.volume || 0)}%`, backgroundColor: s.narration ? G.ice : G.gold, opacity: s.narration ? 0.85 : 1 }} />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] font-bold" style={{ ...NUM, color: G.dim }}><span>0:00</span><span>{clock(total)}</span></div>
              <div className="mt-2 flex gap-4 text-[11.5px] font-bold" style={{ color: G.sub }}><span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: G.ice }} />내레이션 있는 장면</span><span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: G.gold }} />음악만</span></div>
            </AdmPanel>
            <AdmPanel bodyClass="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-[13px]">
                  <thead><tr style={{ borderBottom: `1px solid ${G.line}` }}>{["장면", "시간", "음악", "볼륨", "동작"].map((h) => <th key={h} className="px-4 py-2.5 text-left text-[12px] font-extrabold" style={{ color: G.gold }}>{h}</th>)}</tr></thead>
                  <tbody>{plan.scenes.map((s) => { const t = tracks.get(s.bgm?.track); return (
                    <tr key={s.no} style={{ borderBottom: `1px solid ${G.line}` }}>
                      <td className="px-4 py-2 font-bold text-white">{s.no}. {s.title}</td>
                      <td className="px-4 py-2" style={{ ...NUM, color: G.sub }}>{clock(s.start)}–{clock(s.end)}</td>
                      <td className="px-4 py-2" style={{ color: G.ink }}>{s.bgm?.track} {t ? `· ${t.mood}` : ""}</td>
                      <td className="px-4 py-2"><div className="flex items-center gap-2"><div className="w-20 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,.08)" }}><div className="h-full rounded-full" style={{ width: `${s.bgm?.volume || 0}%`, background: G.gold }} /></div><span style={{ ...NUM, color: G.goldHi }}>{s.bgm?.volume}</span></div></td>
                      <td className="px-4 py-2" style={{ color: G.sub }}>{s.bgm?.action}</td>
                    </tr>
                  ); })}</tbody>
                </table>
              </div>
            </AdmPanel>
            <div className="text-[12px] font-semibold leading-relaxed" style={{ color: G.dim }}>음원은 저작권 걱정 없는 곳에서 찾으세요 — 유튜브 스튜디오 › 오디오 보관함, Pixabay Music 등에 위 검색어를 넣으면 돼요. 편집 프로그램에서 큐시트의 볼륨 숫자대로 맞추면 말소리가 또렷해요.</div>
          </>)}

          {tab === "srt" && (
            <AdmPanel code="SUBTITLE" title={`자막 ${cues.length}줄`} right={<button type="button" onClick={() => downloadText(`${name}.srt`, toSrt(plan.scenes), "application/x-subrip;charset=utf-8")} className="h-8 px-3 rounded-lg text-[12px] font-black" style={GOLD_BTN}>SRT 받기</button>} bodyClass="p-0">
              {cues.map((c, i) => (
                <div key={i} className="px-5 py-2 flex items-center gap-3" style={{ borderBottom: `1px solid ${G.line}` }}>
                  <span className="text-[11.5px] font-bold w-[110px] shrink-0" style={{ ...NUM, color: G.dim }}>{clock(c.start)} → {clock(c.end)}</span>
                  <span className="text-[14px] font-bold text-white">{c.text}</span>
                </div>
              ))}
            </AdmPanel>
          )}

          {tab === "post" && (
            <div className="grid gap-3 lg:grid-cols-2">
              <AdmPanel code="CAPTION" title="올릴 때 설명 글">
                <div className="space-y-3">{(plan.captions || []).map((c, i) => <div key={i}><div className="text-[12px] font-extrabold" style={{ color: G.gold }}>{c.platform}</div><div className="text-[13.5px] whitespace-pre-wrap" style={{ color: G.ink }}>{c.text}</div></div>)}</div>
                {!!plan.hashtags?.length && <div className="mt-3 text-[13px] font-bold" style={{ color: G.iceHi }}>{plan.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</div>}
              </AdmPanel>
              <AdmPanel code="THUMBNAIL · TIPS" title="썸네일 · 촬영 팁">
                <div className="flex flex-wrap gap-1.5">{(plan.thumbnails || []).map((t) => <span key={t} className="px-3 py-1.5 rounded-lg text-[14px] font-black" style={GOLD_BTN}>{t}</span>)}</div>
                <ul className="mt-3 space-y-1.5 text-[13px]" style={{ color: G.sub }}>{(plan.tips || []).map((t, i) => <li key={i}>· {t}</li>)}</ul>
              </AdmPanel>
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}

// 영상 작업실 맨 위 — [새 영상 기획] · [교육 영상 고치기]
const MODES = [["plan", "새 영상 기획", "대본 · 음악 큐시트 · 자막"], ["fix", "교육 영상 고치기", "도움말 센터 1~14편"]];
export default function VideoStudio() {
  const [mode, setMode] = React.useState(() => { try { return localStorage.getItem("kpVideoStudioMode") === "fix" ? "fix" : "plan"; } catch { return "plan"; } });
  const pick = (m) => { setMode(m); try { localStorage.setItem("kpVideoStudioMode", m); } catch { /* 무시 */ } };
  return (
    <div className="space-y-3 min-w-0">
      <div className="grid grid-cols-2 sm:flex gap-1.5">
        {MODES.map(([k, l, sub]) => <Chip key={k} on={mode === k} onClick={() => pick(k)} sub={sub}>{l}</Chip>)}
      </div>
      {mode === "fix"
        ? <React.Suspense fallback={<div className="py-20 text-center text-[13px]" style={{ color: G.dim }}>불러오는 중…</div>}><VideoFixer /></React.Suspense>
        : <PlanStudio />}
    </div>
  );
}
