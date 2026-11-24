// ======================= src/AiTeamPanel.jsx =======================
// 🤖 2026-11-06 AI 팀 — 관리자센터(최고관리자·부관리자) 전용.
// 🛰 2026-11-18 전면 개편(AI 본부) — 어두운 디지털 + 샴페인 골드, 카드 나열 대신 "지휘 본부" 구성
//  · AiHq: 왼쪽 팀 명단(지금 상태 · 이번 달 질문 · 비용) + 오른쪽 본부 개요 / 팀 대화 — 메뉴 하나로 합침
//  · 본부 개요(ai:hub): 본부 ↔ 6개 팀 연결도(움직이는 데이터 선) · 이번 달 비용 · 질문 · 토큰 · 사용자 ·
//    팀별 사용량 막대 · 최근 지시 기록 · 바로 지시(누르면 그 팀 대화로 가서 바로 질문)
//  · 팀 대화(ai:<team>): 서버(aiTeamChat)가 Claude + 읽기 전용 조회 도구로 답한다(동작은 예전 그대로)
import React from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db, FUNCTIONS_BASE } from "./firebase";
import { ShellIcon } from "./AdminShell";
import { kpConfirm } from "./kpDialog";
import { G, NUM, GOLD_BTN, LivePulse, EstTag, AdmPanel } from "./adminCenter/admUi";

// ─── 팀 소개(화면용) — 서버 functions/aiTeams.js 의 TEAMS 와 key 를 맞춘다 ───
export const AI_TEAMS = [
  { key: "acct", code: "ACC", name: "경리·회계팀", en: "ACCOUNTING", icon: "receipt", desc: "청구 · 입금 확인 · 미수금 · 요금제 변경 요청",
    access: ["청구서", "청구 계산서", "요금표", "요금제", "요금제 변경 요청", "고객사 현황"],
    quick: ["이번 달 미납·연체 현황 알려줘", "입금 독촉이 필요한 회사를 금액 순으로 정리해줘", "이번 달 예상 청구액(요금제·초과 사용량) 회사별로 보여줘", "연체된 회사와 연체 개월 수 알려줘", "처리 안 된 요금제 변경 요청 있어?", "지난달 대비 이번 달 청구 금액 비교해줘"] },
  { key: "finance", code: "FIN", name: "재무팀", en: "FINANCE", icon: "trend", desc: "매출 추이 · 회수율 · 요금제 구성 분석",
    access: ["청구서", "청구 계산서", "요금표", "요금제", "고객사 현황"],
    quick: ["최근 6개월 매출 추이와 회수율 보고해줘", "요금제별 고객사 수와 매출 비중 정리해줘", "재무 위험 신호가 있는지 점검해줘"] },
  { key: "sales", code: "SAL", name: "영업팀", en: "SALES", icon: "star", desc: "도입 문의 → 견적 → 가입 → 요금제 파이프라인",
    access: ["도입 문의", "견적서", "가입 신청", "요금제"],
    quick: ["응대가 필요한 도입 문의를 우선순위로 정리해줘", "견적 후 진행이 멈춘 건 찾아줘", "요금제가 아직 지정 안 된 고객사 있어?", "이번 달 영업 현황 보고서 써줘"] },
  { key: "ops", code: "OPS", name: "운영팀", en: "OPERATIONS", icon: "server", desc: "원격 지원 · 승인 대기 · 고객사 사용 현황 · 공지",
    access: ["원격 지원", "가입 신청", "고객사 현황", "접속 세션", "플랫폼 공지"],
    quick: ["오늘 처리해야 할 대기 건 전부 정리해줘", "승인 대기 중인 직원이 많은 운송사는?", "지금 접속이 없는 고객사(이탈 위험) 찾아줘"] },
  { key: "security", code: "SEC", name: "보안팀", en: "SECURITY", icon: "shield", desc: "로그인 기록 · 접속 세션 · 이상 징후 점검",
    access: ["보안 이벤트", "접속 이력", "접속 세션", "고객사 현황"],
    quick: ["최근 24시간 로그인 이상 징후 점검해줘", "기기를 너무 많이 쓰는 계정 있어?", "최근 7일 새벽 시간대 접속 기록 확인해줘"] },
  { key: "marketing", code: "MKT", name: "홍보팀", en: "MARKETING", icon: "send", desc: "홍보 아이디어 · 홈페이지 문구 · 공지·SNS 초안 · 영상 기획(숏츠 · 교육영상)",
    access: ["도입 문의", "플랫폼 공지", "고객사 현황"],
    quick: ["이번 달 홍보 아이디어 5개 제안해줘", "홈페이지 메인 문구 3가지 버전 써줘", "신규 기능 안내 공지 초안 써줘", "블로그 글 초안: 배차 관리 프로그램을 바꿔야 하는 신호"] },
];
const TEAM_BY_KEY = Object.fromEntries(AI_TEAMS.map((t) => [t.key, t]));
// 🧹 2026-11-18 메뉴는 "AI 본부" 하나 — 팀은 화면 안 명단에서 고른다(예전 ai:<team> 주소는 그대로 동작)
export const AI_TEAM_TABS = [{ key: "ai:hub", label: "AI 본부", en: "AI HQ", icon: "spark", also: AI_TEAMS.map((t) => `ai:${t.key}`) }];
// 🎬 2026-11-18 홍보팀 영상 작업실 — 🧭 2026-11-24 메뉴 정리: 화면은 관리자센터 › 홍보 › 홍보 영상 › [영상 작업실] 탭 한 곳에만 둔다.
//  명단의 이 줄은 그 탭으로 가는 바로가기(ai:video 주소는 PlatformCenter 가 홍보 메뉴로 연다)
const VIDEO_ITEM = { key: "video", name: "영상 기획", en: "VIDEO PLANNING", icon: "star", code: "VID", sub: "홍보 › 홍보 영상에서 열려요" };

// Claude Sonnet 5.5 단가(USD / 100만 토큰) — 화면 표시용 어림값
const PRICE = { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 };
const costOf = (u) => (u ? ((u.input || 0) * PRICE.input + (u.output || 0) * PRICE.output + (u.cacheRead || 0) * PRICE.cacheRead + (u.cacheWrite || 0) * PRICE.cacheWrite) / 1e6 : 0);
const tokOf = (u) => (u ? (u.input || 0) + (u.output || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0) : 0);
const usd = (n) => `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;
const fmtN = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const msOf = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);
const ago = (ms) => { if (!ms) return "-"; const m = Math.floor((Date.now() - ms) / 60000); if (m < 1) return "방금"; if (m < 60) return `${m}분 전`; const h = Math.floor(m / 60); if (h < 24) return `${h}시간 전`; return `${Math.floor(h / 24)}일 전`; };
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const fmtTok = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${Math.round(n || 0)}`);
const modelLabel = (m) => String(m || "").replace(/^claude-/, "").replace(/-(\d+)-(\d+)$/, " $1.$2").replace(/^./, (c) => c.toUpperCase());
const isDemo = () => { try { return !!window.__kpAdminDemo; } catch { return false; } };

// ─── 사용 기록(aiTeamLogs) 구독 ───
function useAiLogs(n = 400) {
  const [list, setList] = React.useState(() => (isDemo() ? demoLogs() : null));
  React.useEffect(() => (isDemo() ? undefined : onSnapshot(query(collection(db, "aiTeamLogs"), orderBy("at", "desc"), limit(n)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([]))), [n]);
  return list;
}
function useTeamStats(logs) {
  return React.useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const by = {};
    AI_TEAMS.forEach((t) => { by[t.key] = { count: 0, cost: 0, tok: 0, last: 0, lastQ: "", days: Array(14).fill(0) }; });
    const monthLogs = (logs || []).filter((l) => msOf(l.at) >= monthStart);
    monthLogs.forEach((l) => { const b = by[l.team]; if (!b) return; b.count += 1; b.cost += costOf(l.usage); b.tok += tokOf(l.usage); });
    (logs || []).forEach((l) => {
      const b = by[l.team]; if (!b) return; const at = msOf(l.at);
      if (at > b.last) { b.last = at; b.lastQ = l.question || ""; }
      const di = 13 - Math.floor((Date.now() - at) / 86400e3); if (di >= 0 && di < 14) b.days[di] += 1;
    });
    const total = { cost: monthLogs.reduce((a, l) => a + costOf(l.usage), 0), tok: monthLogs.reduce((a, l) => a + tokOf(l.usage), 0), qs: monthLogs.length, people: new Set(monthLogs.map((l) => l.email).filter(Boolean)).size };
    return { by, total, ym: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` };
  }, [logs]);
}

// 본부 개요에서 "바로 지시"를 누르면 → 팀 대화로 옮겨 가서 그 질문을 바로 보낸다
const pendingAsk = {};

// ─── 공용 부품 ───
function TeamMark({ team, size = 44, on = false }) {
  return (
    <div className="relative shrink-0 rounded-[14px] flex items-center justify-center" style={{ width: size, height: size, ...(on ? { ...GOLD_BTN, boxShadow: "0 6px 18px rgba(215,188,130,.3)" } : { background: "linear-gradient(150deg, rgba(215,188,130,.16), rgba(255,255,255,.03))", border: "1px solid rgba(215,188,130,.3)", color: G.goldHi }) }}>
      <ShellIcon name={team.icon} size={Math.round(size * 0.45)} />
      {size >= 36 && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 rounded-md text-[8.5px] font-black tracking-[0.12em] leading-[14px]" style={{ ...NUM, background: on ? G.goldInk : G.gold, color: on ? G.goldHi : G.goldInk }}>{team.code}</span>}
    </div>
  );
}
function Status({ busy }) {
  return <span className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold tracking-[0.2em] whitespace-nowrap" style={{ ...NUM, color: G.gold }}><LivePulse size={7} />{busy ? "ANALYZING" : "ONLINE"}</span>;
}

// ─── 아주 작은 마크다운(제목·굵게·목록·표·코드) — HTML 주입 없이 React 요소로 ───
function inline(text, keyBase) {
  const out = []; const re = /(\*\*[^*]+\*\*|`[^`]+`)/g; let last = 0; let m; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith("**") ? <strong key={`${keyBase}-${i++}`} className="font-black" style={{ color: G.goldHi }}>{t.slice(2, -2)}</strong> : <code key={`${keyBase}-${i++}`} className="px-1.5 py-0.5 rounded-md text-[0.92em]" style={{ background: "rgba(215,188,130,.1)", color: G.goldHi }}>{t.slice(1, -1)}</code>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
function Markdown({ text }) {
  const lines = String(text || "").split("\n");
  const blocks = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i += 1; }
      const cells = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r)).map((r) => r.trim().slice(1, -1).split("|").map((c) => c.trim()));
      const [head, ...body] = cells;
      blocks.push(
        <div key={`t${i}`} className="my-2 overflow-x-auto rounded-xl adm-scroll" style={{ border: `1px solid ${G.line}` }}>
          <table className="w-full text-[13.5px]">
            <thead><tr style={{ background: "rgba(215,188,130,.1)" }}>{(head || []).map((h, k) => <th key={k} className="px-3 py-2 text-left font-extrabold whitespace-nowrap" style={{ color: G.goldHi }}>{inline(h, `h${i}${k}`)}</th>)}</tr></thead>
            <tbody>{body.map((r, ri) => <tr key={ri} style={{ borderTop: "1px solid rgba(215,188,130,.08)" }}>{r.map((c, k) => <td key={k} className={`px-3 py-2 whitespace-nowrap ${/^[+-]?[$]?[\d,.]+(%|원)?$/.test(c.replace(/\s/g, "")) ? "text-right font-bold" : ""}`} style={{ ...NUM, color: G.ink }}>{inline(c, `c${i}${ri}${k}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) { blocks.push(<div key={i} className={`font-black ${h[1].length <= 2 ? "text-[16px] mt-3" : "text-[14.5px] mt-2.5"} mb-1`} style={{ color: "#fff" }}>{inline(h[2], `g${i}`)}</div>); i += 1; continue; }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const items = []; const ordered = /^\s*\d+[.)]/.test(l);
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, "")); i += 1; }
      blocks.push(
        <div key={`l${i}`} className="my-1.5 space-y-1">
          {items.map((it, k) => (
            <div key={k} className="flex gap-2.5">
              {ordered ? <span className="shrink-0 w-5 h-5 mt-[1px] rounded-md text-[11px] font-black flex items-center justify-center" style={{ ...NUM, ...GOLD_BTN }}>{k + 1}</span> : <span className="shrink-0 w-1.5 h-1.5 mt-[9px] rotate-45" style={{ background: G.gold }} />}
              <span className="min-w-0">{inline(it, `i${i}${k}`)}</span>
            </div>
          ))}
        </div>,
      );
      continue;
    }
    if (/^\s*---+\s*$/.test(l)) { blocks.push(<div key={i} className="my-3 h-px" style={{ background: G.line }} />); i += 1; continue; }
    if (!l.trim()) { blocks.push(<div key={i} className="h-2" />); i += 1; continue; }
    blocks.push(<div key={i}>{inline(l, `p${i}`)}</div>); i += 1;
  }
  return <div className="text-[14.5px] leading-[1.75] break-words" style={{ color: G.ink }}>{blocks}</div>;
}

// ─── 팀별 대화 상태(탭을 옮겨도 유지, 새로고침해도 이 창에서는 유지) ───
const STORE_KEY = (team) => `aiTeamChat:${team}`;
const memory = {};
function loadChat(team) {
  if (memory[team]) return memory[team];
  try { const v = JSON.parse(sessionStorage.getItem(STORE_KEY(team)) || "null"); if (v && Array.isArray(v.items)) return (memory[team] = v); } catch { /* 무시 */ }
  return (memory[team] = { items: [], history: [], usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } });
}
function saveChat(team, v) {
  memory[team] = v;
  try { sessionStorage.setItem(STORE_KEY(team), JSON.stringify(v)); } catch { /* 용량 초과 등 — 메모리에는 남아 있다 */ }
}

const TOOL_LABEL = {
  get_invoices: "청구서", get_billing_estimate: "청구 계산서", get_pricing: "요금표", get_company_plans: "요금제", get_plan_requests: "요금제 변경 요청", get_inquiries: "도입 문의", get_sales_quotes: "견적서",
  get_applications: "가입 신청", get_support_requests: "원격 지원", get_companies_overview: "고객사 현황", get_security_events: "보안 이벤트", get_session_logs: "접속 이력", get_active_sessions: "접속 세션", get_platform_notices: "플랫폼 공지",
};

// ═══════════════════════ AI 본부(명단 + 개요/대화) ═══════════════════════
export function AiHq({ tab, go }) {
  const logs = useAiLogs(400);
  const stats = useTeamStats(logs);
  const cur = tab === "ai:hub" ? "hub" : tab.slice(3);
  const items = [{ key: "hub", name: "본부 개요", en: "HQ", icon: "spark", code: "HQ" }, ...AI_TEAMS.flatMap((t) => (t.key === "marketing" ? [t, VIDEO_ITEM] : [t]))];
  return (
    <div className="grid gap-3 sm:gap-4 lg:grid-cols-[248px_minmax(0,1fr)] items-start">
      {/* 명단 — PC는 왼쪽 세로, 모바일은 위 가로 */}
      <aside className="adm-panel rounded-[18px] p-2 lg:sticky lg:top-[84px] min-w-0">
        <div className="hidden lg:flex items-center gap-2 px-2.5 pt-2 pb-2.5">
          <span className="text-[10.5px] font-extrabold tracking-[0.26em]" style={{ ...NUM, color: G.gold }}>AI HEADQUARTERS</span>
        </div>
        <div className="flex lg:flex-col gap-1 overflow-x-auto adm-scroll" style={{ scrollbarWidth: "none" }}>
          {items.map((t) => {
            const on = cur === t.key; const b = stats.by[t.key];
            return (
              <button key={t.key} type="button" onClick={() => go(t.key === "hub" ? "ai:hub" : `ai:${t.key}`)}
                className="shrink-0 lg:w-full text-left rounded-[13px] px-2.5 py-2 flex items-center gap-2.5 transition"
                style={on ? { background: "linear-gradient(140deg, rgba(215,188,130,.22), rgba(140,116,66,.08))", border: "1px solid rgba(215,188,130,.45)" } : { border: "1px solid transparent" }}>
                <TeamMark team={t} size={34} on={on} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-black whitespace-nowrap" style={{ color: on ? G.goldHi : G.ink }}>{t.name}</span>
                  <span className="hidden lg:block text-[11px] font-bold whitespace-nowrap truncate" style={{ ...NUM, color: G.dim }}>{t.key === "hub" ? `이번 달 ${fmtN(stats.total.qs)}회 · ${usd(stats.total.cost)}` : t.sub ? t.sub : b?.count ? `${b.count}회 · ${usd(b.cost)} · ${ago(b.last)}` : "아직 지시 없음"}</span>
                </span>
                {t.key !== "hub" && !t.sub && <span className="hidden lg:block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: G.gold, boxShadow: `0 0 8px ${G.gold}` }} />}
              </button>
            );
          })}
        </div>
      </aside>
      <div className="min-w-0">
        {cur === "hub" ? <AiTeamHub go={go} logs={logs} stats={stats} /> : <AiTeamChat teamKey={cur} logs={logs} />}
      </div>
    </div>
  );
}

// ═══════════════════════ 팀 대화 화면 ═══════════════════════
export function AiTeamChat({ teamKey, logs: logsProp }) {
  const team = TEAM_BY_KEY[teamKey] || AI_TEAMS[0];
  const [chat, setChat] = React.useState(() => loadChat(team.key));
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null); // { msg, q, stopped }
  const [elapsed, setElapsed] = React.useState(0);
  const [copied, setCopied] = React.useState(-1);
  const scroller = React.useRef(null);
  const inputRef = React.useRef(null);
  const abortRef = React.useRef(null);
  const ownLogs = useAiLogs(60);
  const logs = logsProp || ownLogs;

  React.useEffect(() => { setChat(loadChat(team.key)); setErr(null); setText(""); }, [team.key]);
  React.useEffect(() => { const el = scroller.current; if (!el) return; if (!chat.items.length && !busy && !err) { el.scrollTop = 0; return; } el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [chat.items.length, busy, err]);
  React.useEffect(() => { if (!busy) return undefined; const t0 = Date.now(); setElapsed(0); const t = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000); return () => clearInterval(t); }, [busy]);
  React.useLayoutEffect(() => { const el = inputRef.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(160, el.scrollHeight)}px`; }, [text]);

  const send = async (q) => {
    const question = String(q ?? text).trim();
    if (!question || busy) return;
    setErr(null); setText("");
    const base = loadChat(team.key);
    const pending = { ...base, items: [...base.items, { role: "user", text: question, at: Date.now() }] };
    setChat(pending); saveChat(team.key, pending);
    setBusy(true);
    const ac = new AbortController(); abortRef.current = ac;
    const t0 = Date.now();
    try {
      const token = await auth.currentUser?.getIdToken();
      const r = await fetch(`${FUNCTIONS_BASE}/aiTeamChat`, { method: "POST", signal: ac.signal, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ team: team.key, history: base.history, text: question }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `서버 오류(${r.status})`);
      const u = j.usage || {};
      const next = {
        items: [...pending.items, { role: "assistant", text: j.reply, used: j.used || [], cost: costOf(u), tokens: tokOf(u), model: j.model || "", secs: Math.round((Date.now() - t0) / 1000), at: Date.now() }],
        history: Array.isArray(j.history) ? j.history : base.history,
        usage: { input: base.usage.input + (u.input || 0), output: base.usage.output + (u.output || 0), cacheRead: base.usage.cacheRead + (u.cacheRead || 0), cacheWrite: base.usage.cacheWrite + (u.cacheWrite || 0) },
      };
      setChat(next); saveChat(team.key, next);
    } catch (e) {
      // 실패한 질문은 대화 기록(history)에 넣지 않았으므로 화면에서만 빼고 입력창에 되돌린다
      setChat(base); saveChat(team.key, base); setText(question);
      const stopped = e?.name === "AbortError";
      setErr({ msg: stopped ? "답변을 멈췄어요." : (e?.message || String(e)), q: question, stopped });
    } finally { abortRef.current = null; setBusy(false); setTimeout(() => inputRef.current?.focus(), 0); }
  };
  // 본부 개요의 "바로 지시"
  React.useEffect(() => { const q = pendingAsk[team.key]; if (q) { delete pendingAsk[team.key]; send(q); } }, [team.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const stop = () => { try { abortRef.current?.abort(); } catch { /* 무시 */ } };
  const reset = async () => { if (chat.items.length && !(await kpConfirm("이 팀과의 대화를 지우고 새로 시작할까요?", { okText: "새로 시작" }))) return; const v = { items: [], history: [], usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }; setChat(v); saveChat(team.key, v); setErr(null); };
  const copy = (t, i) => { try { navigator.clipboard.writeText(t); setCopied(i); setTimeout(() => setCopied(-1), 1400); } catch { /* 무시 */ } };

  const sessionCost = costOf(chat.usage);
  const sessionTok = tokOf(chat.usage);
  const asked = chat.items.filter((x) => x.role === "user").length;
  const teamLogs = (logs || []).filter((l) => l.team === team.key);
  const steps = ["질문 이해", ...team.access.map((a) => `${a} 조회`), "결과 분석", "보고서 정리"];
  const stepIdx = Math.min(steps.length - 1, elapsed < 3 ? 0 : 1 + Math.floor((elapsed - 3) / 4));

  return (
    <div className="kp-ai grid gap-3 sm:gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
      {/* ── 콘솔(대화) ── */}
      <div className="relative rounded-[20px] overflow-hidden flex flex-col min-w-0 h-[calc(100dvh-250px)] lg:h-[calc(100vh-140px)] min-h-[500px]" style={{ background: "linear-gradient(180deg, #0A1226, #070C18)", border: `1px solid rgba(215,188,130,.22)`, boxShadow: "0 24px 50px rgba(0,0,0,.35)" }}>
        <div className="relative overflow-hidden px-3.5 sm:px-5 py-3 sm:py-3.5 flex items-center gap-3 adm-hero !rounded-none !border-0 !border-b" style={{ borderBottom: `1px solid ${G.line}` }}>
          <span className="kp-ai-sweep pointer-events-none absolute inset-y-0 -left-1/3 w-1/3" aria-hidden />
          <TeamMark team={team} size={42} on />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-[16px] sm:text-[18px] font-black tracking-tight whitespace-nowrap truncate text-white">{team.name} AI</span>
              <Status busy={busy} />
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] font-bold whitespace-nowrap overflow-hidden" style={{ ...NUM, color: G.dim }}>
              <span className="tracking-[0.16em]">READ-ONLY</span><span style={{ color: G.line }}>|</span>
              <span>데이터 {team.access.length}종 연결</span><span className="hidden sm:inline" style={{ color: G.line }}>|</span>
              <span className="hidden sm:inline">질문 {asked} · {fmtTok(sessionTok)} tok · {usd(sessionCost)}</span>
            </div>
          </div>
          <button type="button" onClick={reset} disabled={busy} title="새 대화" className="adm-btn shrink-0 h-9 px-3 rounded-xl text-[13px] font-black whitespace-nowrap disabled:opacity-40 inline-flex items-center gap-1.5"><ShellIcon name="refresh" size={14} /><span className="hidden sm:inline">새 대화</span></button>
        </div>

        <div ref={scroller} className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-6 py-4 sm:py-5 space-y-5 adm-scroll" style={{ background: "linear-gradient(rgba(215,188,130,.03) 1px, transparent 1px) 0 0/26px 26px, linear-gradient(90deg, rgba(215,188,130,.03) 1px, transparent 1px) 0 0/26px 26px" }}>
          {!chat.items.length && (
            <div className="min-h-full flex flex-col items-center justify-center text-center py-4">
              <div className="relative">
                <span className="absolute -inset-4 rounded-[24px] kp-ai-ring" style={{ border: "1px solid rgba(215,188,130,.45)" }} aria-hidden />
                <span className="absolute -inset-8 rounded-[30px] kp-ai-ring" style={{ border: "1px solid rgba(215,188,130,.18)", animationDelay: ".6s" }} aria-hidden />
                <TeamMark team={team} size={56} on />
              </div>
              <div className="mt-6 sm:mt-8 text-[10.5px] font-extrabold tracking-[0.32em]" style={{ ...NUM, color: G.gold }}>AI TEAM · {team.en}</div>
              <div className="mt-1 text-[21px] sm:text-[25px] font-black tracking-tight text-white">무엇을 도와드릴까요?</div>
              <div className="mt-1.5 text-[12.5px] sm:text-[13.5px] max-w-[480px] leading-relaxed" style={{ color: G.sub }}>관리자센터 데이터를 직접 조회해서 근거 숫자와 함께 답해요.<br className="hidden sm:block" /> 데이터는 바꾸지 않고, 할 일은 정리해서 알려 드려요.</div>
              <div className="mt-4 sm:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-[700px]">
                {team.quick.map((q, k) => (
                  <button key={q} type="button" onClick={() => send(q)} className="group text-left px-3.5 py-3 rounded-xl transition flex items-center gap-3 min-w-0 adm-row" style={{ border: `1px solid ${G.line}`, background: "rgba(255,255,255,.03)" }}>
                    <span className="shrink-0 w-8 h-8 rounded-lg text-[11px] font-black flex items-center justify-center" style={{ ...NUM, background: "rgba(215,188,130,.12)", color: G.goldHi }}>{String(k + 1).padStart(2, "0")}</span>
                    <span className="text-[13.5px] font-bold leading-snug min-w-0" style={{ color: G.ink }}>{q}</span>
                    <span className="ml-auto shrink-0 transition group-hover:translate-x-0.5" style={{ color: G.gold }} aria-hidden>→</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {chat.items.map((m, i) => (m.role === "user" ? (
            <div key={i} className="flex justify-end kp-ai-in">
              <div className="max-w-[88%] sm:max-w-[72%]">
                <div className="px-4 py-2.5 rounded-[18px] rounded-br-[6px] text-[14.5px] leading-relaxed whitespace-pre-wrap break-words font-semibold" style={{ ...GOLD_BTN, boxShadow: "0 8px 18px rgba(215,188,130,.18)" }}>{m.text}</div>
                <div className="mt-1 text-right text-[10.5px]" style={{ ...NUM, color: G.dim }}>{hhmm(m.at)}</div>
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-2.5 sm:gap-3 kp-ai-in">
              <div className="hidden sm:block pt-0.5"><TeamMark team={team} size={30} /></div>
              <div className="min-w-0 flex-1 max-w-[960px]">
                <div className="flex items-center gap-2 mb-1.5 min-w-0">
                  <span className="text-[12.5px] font-black whitespace-nowrap" style={{ color: G.goldHi }}>{team.name} AI</span>
                  <span className="text-[10.5px] whitespace-nowrap" style={{ ...NUM, color: G.dim }}>{hhmm(m.at)}{m.secs ? ` · ${m.secs}s` : ""}</span>
                </div>
                <div className="relative px-4 sm:px-5 py-3.5 rounded-[18px] rounded-tl-[6px] overflow-hidden" style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${G.line}` }}>
                  <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: `linear-gradient(180deg, ${G.goldHi}, #8C7442)` }} aria-hidden />
                  <Markdown text={m.text} />
                </div>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {!!(m.used || []).length && <span className="text-[10px] font-extrabold tracking-[0.18em] mr-0.5" style={{ ...NUM, color: G.goldDim }}>SOURCE</span>}
                  {(m.used || []).map((u) => <span key={u} className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11.5px] font-extrabold whitespace-nowrap" style={{ background: "rgba(215,188,130,.1)", border: `1px solid ${G.line}`, color: G.goldHi }}><ShellIcon name="check" size={11} strokeWidth={2.6} />{TOOL_LABEL[u] || u}</span>)}
                  <span className="h-6 px-1.5 text-[10.5px] font-bold inline-flex items-center whitespace-nowrap" style={{ ...NUM, color: G.dim }}>{m.tokens ? `${fmtTok(m.tokens)} tok · ` : ""}{usd(m.cost || 0)}{m.model ? ` · ${modelLabel(m.model)}` : ""}</span>
                  <button type="button" onClick={() => copy(m.text, i)} className="ml-auto h-7 px-2.5 rounded-lg text-[12px] font-bold inline-flex items-center gap-1.5 adm-row" style={{ color: G.sub }}><ShellIcon name={copied === i ? "check" : "file"} size={13} />{copied === i ? "복사됨" : "복사"}</button>
                </div>
              </div>
            </div>
          )))}

          {busy && (
            <div className="flex gap-2.5 sm:gap-3 kp-ai-in">
              <div className="hidden sm:block pt-0.5"><TeamMark team={team} size={30} /></div>
              <div className="relative overflow-hidden px-4 py-3.5 rounded-[18px] rounded-tl-[6px] w-full max-w-[440px]" style={{ background: "rgba(215,188,130,.06)", border: "1px solid rgba(215,188,130,.3)" }}>
                <span className="kp-ai-scan pointer-events-none absolute inset-x-0 h-10" aria-hidden />
                <div className="relative flex items-center gap-2.5">
                  <span className="flex gap-1">{[0, 1, 2].map((d) => <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: G.gold, animationDelay: `${d * 0.15}s` }} />)}</span>
                  <span className="text-[13.5px] font-black whitespace-nowrap truncate text-white">{steps[stepIdx]} 중…</span>
                  <span className="ml-auto text-[11px] font-bold whitespace-nowrap" style={{ ...NUM, color: G.dim }}>{String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}</span>
                </div>
                <div className="relative mt-3 space-y-1">
                  {steps.map((s, k) => (
                    <div key={s} className="flex items-center gap-2 text-[12px] font-bold" style={{ color: k < stepIdx ? G.dim : k === stepIdx ? G.goldHi : "rgba(201,213,236,.28)" }}>
                      <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center" style={k < stepIdx ? { background: G.gold, color: G.goldInk } : k === stepIdx ? { boxShadow: `0 0 0 2px ${G.gold}` } : { boxShadow: "0 0 0 1px rgba(255,255,255,.2)" }}>{k < stepIdx && <ShellIcon name="check" size={9} strokeWidth={3} />}{k === stepIdx && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: G.gold }} />}</span>
                      <span className="whitespace-nowrap">{s}</span>
                    </div>
                  ))}
                </div>
                <div className="relative mt-3 h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.08)" }}><div className="h-full w-1/3 rounded-full animate-[aiScan_1.4s_ease-in-out_infinite]" style={{ background: `linear-gradient(90deg, transparent, ${G.gold}, transparent)` }} /></div>
              </div>
            </div>
          )}

          {err && (
            <div className="kp-ai-in flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,.03)", border: `1px solid ${err.stopped ? G.line : "rgba(255,138,122,.4)"}` }}>
              <ShellIcon name="alert" size={16} className="shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] font-extrabold tracking-[0.16em]" style={{ ...NUM, color: err.stopped ? G.dim : G.bad }}>{err.stopped ? "STOPPED" : "ERROR"}</div>
                <div className="text-[13px] font-bold break-words" style={{ color: G.ink }}>{err.msg}</div>
              </div>
              <button type="button" onClick={() => send(err.q)} className="adm-btn-gold shrink-0 h-8 px-3 rounded-lg text-[12.5px] font-black whitespace-nowrap inline-flex items-center gap-1.5"><ShellIcon name="refresh" size={13} />다시 시도</button>
            </div>
          )}
        </div>

        <div className="px-3 sm:px-4 pt-2.5 pb-[max(12px,env(safe-area-inset-bottom))]" style={{ borderTop: `1px solid ${G.line}`, background: "rgba(5,8,15,.6)" }}>
          {!!chat.items.length && !busy && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
              {team.quick.map((q) => <button key={q} type="button" onClick={() => send(q)} className="shrink-0 h-8 px-3 rounded-full text-[12.5px] font-bold whitespace-nowrap adm-row" style={{ border: `1px solid ${G.line}`, color: G.sub }}>{q}</button>)}
            </div>
          )}
          <div className="kp-ai-box flex items-end gap-2 rounded-[16px] pl-3.5 pr-1.5 py-1.5 transition" style={{ border: "1px solid rgba(215,188,130,.28)", background: "rgba(255,255,255,.03)" }}>
            <textarea ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} rows={1} disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
              placeholder={`${team.name} AI에게 지시하기`}
              className="kp-ai-input flex-1 min-w-0 resize-none bg-transparent outline-none text-[16px] lg:text-[14.5px] leading-[1.5]"
              style={{ border: 0, outline: "none", boxShadow: "none", background: "transparent", padding: "8px 0", maxHeight: 160, color: G.ink }} />
            {busy ? (
              <button type="button" onClick={stop} aria-label="정지" title="답변 멈추기" className="shrink-0 h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,.1)" }}><span className="w-3 h-3 rounded-[3px]" style={{ background: G.goldHi }} /></button>
            ) : (
              <button type="button" onClick={() => send()} disabled={!text.trim()} aria-label="보내기" className="shrink-0 h-10 w-10 rounded-xl flex items-center justify-center hover:brightness-110 disabled:opacity-30 transition" style={GOLD_BTN}><ShellIcon name="send" size={17} /></button>
            )}
          </div>
          <div className="hidden sm:flex mt-1.5 px-1 items-center justify-between text-[10.5px] font-bold" style={{ ...NUM, color: G.dim }}>
            <span>Enter 보내기 · Shift+Enter 줄바꿈</span><span className="tracking-[0.14em]">READ-ONLY · 데이터는 바뀌지 않아요</span>
          </div>
        </div>
      </div>

      {/* ── 팀 정보 ── */}
      <div className="grid gap-3 content-start min-w-0 sm:grid-cols-2 2xl:grid-cols-1">
        <AdmPanel code="PROFILE" title="팀 정보" bodyClass="px-4 pb-4 pt-2">
          <div className="text-[12.5px] leading-relaxed" style={{ color: G.sub }}>{team.desc}</div>
          <div className="mt-3 text-[10px] font-extrabold tracking-[0.2em]" style={{ ...NUM, color: G.goldDim }}>DATA ACCESS · 읽기 전용</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">{team.access.map((a) => <span key={a} className="h-6 px-2 rounded-md text-[11.5px] font-bold inline-flex items-center gap-1 whitespace-nowrap" style={{ background: "rgba(215,188,130,.08)", border: `1px solid ${G.line}`, color: G.goldHi }}><span className="w-1 h-1 rotate-45" style={{ background: G.gold }} />{a}</span>)}</div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {[["질문", `${asked}`], ["토큰", fmtTok(sessionTok)], ["비용", usd(sessionCost)]].map(([l, v]) => (
              <div key={l} className="rounded-lg px-2.5 py-2 min-w-0" style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${G.line}` }}>
                <div className="text-[10px] font-bold whitespace-nowrap" style={{ color: G.dim }}>{l}</div>
                <div className="text-[14px] font-black whitespace-nowrap truncate text-white" style={NUM}>{v}</div>
              </div>
            ))}
          </div>
        </AdmPanel>
        <AdmPanel code="ACTIVITY" title="최근 지시" bodyClass="pb-2 pt-1">
          {logs == null ? <div className="px-4 pb-2 text-[12.5px]" style={{ color: G.dim }}>불러오는 중…</div>
            : !teamLogs.length ? <div className="px-4 pb-2 text-[12.5px]" style={{ color: G.dim }}>아직 기록이 없어요.</div>
              : <div>{teamLogs.slice(0, 6).map((l) => (
                <button key={l.id} type="button" onClick={() => { setText(l.question || ""); inputRef.current?.focus(); }} className="adm-row w-full text-left px-4 py-2" style={{ borderTop: "1px solid rgba(215,188,130,.07)" }}>
                  <div className="text-[12.5px] font-bold truncate" style={{ color: G.ink }}>{l.question}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] min-w-0" style={{ ...NUM, color: G.dim }}><span className="shrink-0">{ago(msOf(l.at))}</span><span>·</span><span className="truncate">{l.email}</span></div>
                </button>))}</div>}
        </AdmPanel>
        <div className="px-1 text-[11.5px] leading-relaxed sm:col-span-2 2xl:col-span-1" style={{ color: G.dim }}>AI 답변은 조회한 데이터를 근거로 하지만 틀릴 수 있어요. 청구 · 계정 변경처럼 중요한 일은 해당 메뉴에서 확인하고 처리해 주세요.</div>
      </div>
      <style>{AI_CSS}</style>
    </div>
  );
}

// ═══════════════════════ 본부 개요 ═══════════════════════
export function AiTeamHub({ go, logs: logsProp, stats: statsProp }) {
  const own = useAiLogs(400);
  const logs = logsProp || own;
  const ownStats = useTeamStats(logs);
  const { by, total, ym } = statsProp || ownStats;
  const maxCount = Math.max(1, ...AI_TEAMS.map((t) => by[t.key].count));
  const ask = (teamKey, q) => { pendingAsk[teamKey] = q; go(`ai:${teamKey}`); };
  const picks = AI_TEAMS.map((t) => [t, t.quick[0]]);
  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 머리 + 연결도 */}
      <div className="adm-hero relative overflow-hidden rounded-[22px] sm:rounded-[26px] px-4 py-4 sm:px-6 sm:py-5 text-white">
        <span className="adm-scan" aria-hidden />
        <div className="relative grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px] items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><LivePulse /><span className="text-[11px] sm:text-[12px] font-extrabold tracking-[0.32em]" style={{ ...NUM, color: G.gold }}>AI HEADQUARTERS</span><span className="h-px flex-1 max-w-[140px]" style={{ background: `linear-gradient(90deg, ${G.gold}, transparent)` }} /></div>
            <div className="mt-1.5 text-[23px] sm:text-[30px] font-black tracking-tight">AI 본부</div>
            <p className="mt-1 text-[13.5px] sm:text-[14.5px] leading-relaxed max-w-[620px]" style={{ color: G.sub }}>6개 AI 팀장이 맡은 데이터만 읽고 보고해요. 데이터는 바꾸지 않고, 할 일은 정리해서 제안해요. 팀을 고르거나 아래 [바로 지시]를 눌러 시작하세요.</p>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[["MONTH COST", usd(total.cost), `${ym} 어림값`], ["ORDERS", fmtN(total.qs), "이번 달 지시"], ["TOKENS", fmtTok(total.tok), "이번 달 사용"], ["OPERATORS", fmtN(total.people), "지시한 사람"]].map(([c, v, s], i) => (
                <div key={c} className="rounded-[14px] px-3 py-2.5 min-w-0" style={i === 0 ? { background: "linear-gradient(140deg, rgba(215,188,130,.22), rgba(140,116,66,.08))", border: "1px solid rgba(215,188,130,.42)" } : { background: "rgba(255,255,255,.04)", border: `1px solid ${G.line}` }}>
                  <div className="text-[9.5px] font-extrabold tracking-[0.22em] whitespace-nowrap" style={{ ...NUM, color: i === 0 ? G.gold : G.dim }}>{c}</div>
                  <div className="text-[20px] sm:text-[22px] font-black mt-0.5 whitespace-nowrap" style={{ ...NUM, color: i === 0 ? G.goldHi : "#fff" }}>{v}</div>
                  <div className="text-[11px] whitespace-nowrap" style={{ color: G.dim }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
          <HqNetwork by={by} onTeam={(k) => go(`ai:${k}`)} />
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* 팀별 가동 현황 */}
        <AdmPanel code="UNITS" title="팀별 가동 현황" right={<span className="text-[12px] font-bold" style={{ color: G.dim }}>이번 달 · 최근 14일 추이</span>} bodyClass="px-3 sm:px-4 pb-3 pt-2">
          {AI_TEAMS.map((t) => {
            const b = by[t.key]; const dmax = Math.max(1, ...b.days);
            return (
              <button key={t.key} type="button" onClick={() => go(`ai:${t.key}`)} className="adm-row w-full text-left rounded-[12px] px-2 py-2.5 grid items-center gap-3" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr) 92px" }}>
                <span className="flex items-center gap-2.5 min-w-0">
                  <TeamMark team={t} size={34} />
                  <span className="min-w-0"><span className="block text-[14px] font-black whitespace-nowrap" style={{ color: G.ink }}>{t.name}</span><span className="block text-[11.5px] font-bold truncate" style={{ color: G.dim }}>{b.lastQ ? `“${b.lastQ}”` : t.desc}</span></span>
                </span>
                <span className="min-w-0">
                  <span className="flex items-baseline justify-between text-[12px] font-bold" style={NUM}><span style={{ color: G.ink }}>{b.count}회</span><span style={{ color: G.goldHi }}>{usd(b.cost)}</span></span>
                  <span className="mt-1 block h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.06)" }}><span className="block h-full rounded-full" style={{ width: `${(b.count / maxCount) * 100}%`, background: `linear-gradient(90deg, rgba(215,188,130,.4), ${G.gold})` }} /></span>
                  <span className="mt-0.5 block text-[10.5px] font-bold" style={{ ...NUM, color: G.dim }}>마지막 {ago(b.last)}</span>
                </span>
                <span className="flex items-end gap-[2px] h-7" aria-hidden>{b.days.map((v, i) => <span key={i} className="flex-1 rounded-[1.5px]" style={{ height: `${Math.max(8, (v / dmax) * 100)}%`, background: v ? (i === 13 ? G.goldHi : "rgba(215,188,130,.55)") : "rgba(255,255,255,.07)" }} />)}</span>
              </button>
            );
          })}
        </AdmPanel>
        {/* 바로 지시 */}
        <AdmPanel code="QUICK ORDERS" title="바로 지시" right={<span className="text-[12px] font-bold" style={{ color: G.dim }}>누르면 그 팀이 바로 답해요</span>} bodyClass="p-3 sm:p-4 pt-2">
          <div className="grid gap-2">
            {picks.map(([t, q]) => (
              <button key={t.key} type="button" onClick={() => ask(t.key, q)} className="group adm-row text-left rounded-[12px] px-3 py-2.5 flex items-center gap-3 min-w-0" style={{ border: `1px solid ${G.line}`, background: "rgba(255,255,255,.025)" }}>
                <span className="shrink-0 w-10 h-7 rounded-md text-[10.5px] font-black tracking-[0.1em] flex items-center justify-center" style={{ ...NUM, background: "rgba(215,188,130,.12)", color: G.goldHi }}>{t.code}</span>
                <span className="text-[13.5px] font-bold leading-snug min-w-0" style={{ color: G.ink }}>{q}</span>
                <span className="ml-auto shrink-0 transition group-hover:translate-x-0.5" style={{ color: G.gold }} aria-hidden>→</span>
              </button>
            ))}
          </div>
        </AdmPanel>
      </div>

      <AdmPanel code="LOG" title="최근 지시 기록" right={<EstTag>비용은 표준 단가 어림값</EstTag>} bodyClass="pt-2 pb-1">
        {logs == null ? <div className="p-5 text-[13px]" style={{ color: G.dim }}>불러오는 중…</div>
          : !logs.length ? <div className="p-5 text-[13.5px]" style={{ color: G.dim }}>아직 기록이 없어요. 위에서 팀을 골라 첫 지시를 해 보세요.</div>
            : (
              <div className="relative pl-6 pr-3 sm:pr-5">
                <span className="absolute left-[18px] top-2 bottom-2 w-px" style={{ background: `linear-gradient(180deg, ${G.gold}, transparent)` }} aria-hidden />
                {logs.slice(0, 10).map((l) => {
                  const t = TEAM_BY_KEY[l.team];
                  return (
                    <div key={l.id} className="relative py-2.5 pl-4 flex items-start gap-3 min-w-0" style={{ borderBottom: "1px solid rgba(215,188,130,.06)" }}>
                      <span className="absolute -left-[9px] top-[15px] w-2 h-2 rotate-45" style={{ background: G.gold, boxShadow: `0 0 8px ${G.gold}` }} aria-hidden />
                      <span className="shrink-0 w-[46px] text-[11.5px] font-bold pt-0.5" style={{ ...NUM, color: G.dim }}>{msOf(l.at) ? hhmm(msOf(l.at)) : "-"}</span>
                      <span className="shrink-0 h-6 px-2 rounded-md text-[11.5px] font-black inline-flex items-center whitespace-nowrap" style={{ background: "rgba(215,188,130,.1)", color: G.goldHi }}>{t?.name || l.team}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-bold truncate" style={{ color: G.ink }}>{l.question}</span>
                        <span className="block text-[11.5px] truncate" style={{ ...NUM, color: G.dim }}>{l.email} · {ago(msOf(l.at))}{(l.tools || []).length ? ` · ${(l.tools || []).map((x) => TOOL_LABEL[x] || x).join(" · ")}` : ""}</span>
                      </span>
                      <span className="shrink-0 text-[12.5px] font-black" style={{ ...NUM, color: G.goldHi }}>{usd(costOf(l.usage))}</span>
                    </div>
                  );
                })}
              </div>
            )}
      </AdmPanel>
      <div className="text-[12px] px-1" style={{ color: G.dim }}>비용은 Claude Sonnet 5.5 표준 단가로 낸 어림값이에요. 정확한 청구 금액은 Claude Console › 지출에서 확인해 주세요.</div>
      <style>{AI_CSS}</style>
    </div>
  );
}

// ─── 본부 ↔ 팀 연결도(움직이는 데이터 선) ───
function HqNetwork({ by, onTeam }) {
  const W = 420, H = 250, cx = W / 2, cy = H / 2, R = 96, rx = 168;
  const pts = AI_TEAMS.map((t, i) => { const a = (-90 + i * 60) * (Math.PI / 180); return { t, x: cx + rx * Math.cos(a), y: cy + R * Math.sin(a) }; });
  return (
    <div className="relative w-full mx-auto" style={{ maxWidth: W }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
        <defs>
          <radialGradient id="hqCore" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#F3E3BC" /><stop offset="1" stopColor="#8C7442" /></radialGradient>
        </defs>
        <ellipse cx={cx} cy={cy} rx={rx} ry={R} fill="none" stroke="rgba(215,188,130,.12)" strokeDasharray="2 5" />
        <ellipse cx={cx} cy={cy} rx={rx * 0.55} ry={R * 0.55} fill="none" stroke="rgba(215,188,130,.08)" />
        {pts.map((p) => {
          const act = by[p.t.key]?.count || 0;
          return <line key={p.t.key} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={act ? G.gold : "rgba(215,188,130,.25)"} strokeWidth={act ? 1.6 : 1} className={act ? "adm-flow" : ""} opacity={act ? 0.85 : 0.6} />;
        })}
        <circle cx={cx} cy={cy} r="30" fill="url(#hqCore)" style={{ filter: "drop-shadow(0 0 14px rgba(215,188,130,.55))" }} />
        <circle cx={cx} cy={cy} r="38" fill="none" stroke="rgba(215,188,130,.35)" className="kp-ai-ring" />
        <text x={cx} y={cy - 2} textAnchor="middle" fill={G.goldInk} fontSize="13" fontWeight="900">AI 본부</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#5A4517" fontFamily={NUM.fontFamily} fontSize="8" fontWeight="800" letterSpacing="2">HQ</text>
      </svg>
      {pts.map((p) => {
        const b = by[p.t.key] || {};
        return (
          <button key={p.t.key} type="button" onClick={() => onTeam(p.t.key)} title={p.t.name}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 group" style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }}>
            <span className="rounded-[12px] w-10 h-10 flex items-center justify-center transition group-hover:scale-110" style={{ background: "linear-gradient(150deg, #1A2746, #0A1226)", border: `1px solid ${b.count ? "rgba(215,188,130,.6)" : "rgba(215,188,130,.25)"}`, color: G.goldHi, boxShadow: b.count ? "0 0 16px rgba(215,188,130,.25)" : "none" }}><ShellIcon name={p.t.icon} size={17} /></span>
            <span className="text-[10.5px] font-black whitespace-nowrap px-1.5 rounded" style={{ color: G.ink, background: "rgba(7,12,24,.7)" }}>{p.t.name.replace("·회계", "")} <span style={{ ...NUM, color: G.gold }}>{b.count || 0}</span></span>
          </button>
        );
      })}
    </div>
  );
}

const AI_CSS = `
  @keyframes aiScan{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
  @keyframes kpAiSweep{0%{transform:translateX(0)}100%{transform:translateX(450%)}}
  @keyframes kpAiScanY{0%{top:-40px}100%{top:100%}}
  @keyframes kpAiIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  @keyframes kpAiRing{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:.9;transform:scale(1.05)}}
  .kp-ai-sweep{background:linear-gradient(90deg,transparent,rgba(215,188,130,.12),transparent);animation:kpAiSweep 5s linear infinite}
  .kp-ai-scan{background:linear-gradient(180deg,transparent,rgba(215,188,130,.16),transparent);animation:kpAiScanY 2.2s linear infinite}
  .kp-ai-in{animation:kpAiIn .25s ease both}
  .kp-ai-ring{animation:kpAiRing 2.4s ease-in-out infinite;transform-origin:center;transform-box:fill-box}
  .kp-ai-box:focus-within{border-color:#D7BC82 !important;box-shadow:0 0 0 4px rgba(215,188,130,.12)}
  textarea.kp-ai-input, textarea.kp-ai-input:focus{border-color:transparent !important;box-shadow:none !important;outline:none !important;background:transparent !important}
  textarea.kp-ai-input::placeholder{color:rgba(201,213,236,.4)}
  @media (prefers-reduced-motion: reduce){.kp-ai-sweep,.kp-ai-scan,.kp-ai-ring{animation:none}}
`;

// ─── 화면 점검용 기록(개발 /preview-admin 전용) ───
function demoLogs() {
  const qs = [["acct", "이번 달 미납·연체 현황 알려줘"], ["ops", "오늘 처리해야 할 대기 건 전부 정리해줘"], ["sales", "응대가 필요한 도입 문의를 우선순위로 정리해줘"], ["security", "최근 24시간 로그인 이상 징후 점검해줘"], ["finance", "최근 6개월 매출 추이와 회수율 보고해줘"], ["ops", "지금 접속이 없는 고객사(이탈 위험) 찾아줘"], ["marketing", "신규 기능 안내 공지 초안 써줘"], ["acct", "처리 안 된 요금제 변경 요청 있어?"], ["sales", "견적 후 진행이 멈춘 건 찾아줘"], ["ops", "승인 대기 중인 직원이 많은 운송사는?"], ["acct", "연체된 회사와 연체 개월 수 알려줘"], ["security", "기기를 너무 많이 쓰는 계정 있어?"]];
  return Array.from({ length: 44 }, (_, i) => { const [team, question] = qs[i % qs.length]; return { id: `d${i}`, team, question, email: i % 3 ? "admin@logisweb.co.kr" : "ops@logisweb.co.kr", at: Date.now() - i * 5.3 * 3600e3, usage: { input: 9000 + (i % 5) * 2400, output: 1300 + (i % 4) * 500, cacheRead: 22000, cacheWrite: 1800 }, tools: ["get_companies_overview"] }; });
}
