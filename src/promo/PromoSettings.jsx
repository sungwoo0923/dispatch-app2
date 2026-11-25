// ======================= src/promo/PromoSettings.jsx =======================
// ⚙ 2026-11-23 관리자센터 › 홍보 › 홍보 설정
//  · Gemini API 키(나레이션 음성) — 서버(platformSecrets/gemini)에만 저장, 화면에는 앞뒤 4글자만
//  · 유튜브 바로 올리기(구글 OAuth 클라이언트 ID · 2026-11-24 단계별 확인표 · 값 모양 검사 · [연결 시험]) · 네이버 블로그 아이디
//  · 매주 자동 초안 켜기/끄기 · 주제 목록(위에서부터 차례로 씀) · 홍보 기준표(AI가 지킬 사실)
import React from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { G, GOLD_BTN, AdmPanel } from "../adminCenter/admUi";
import { mktCall } from "./promoKit";
import { checkClientId, youtubeToken, ytErrorText } from "./youtubeUpload";
import DEFAULT_TOPICS from "../../functions/promoTopics.json";
import DEFAULT_FACTS from "../../functions/promoFacts.md?raw";

const inp = { background: "rgba(255,255,255,.04)", border: `1px solid ${G.line2}`, color: G.ink };
function Btn({ gold, children, small, ...p }) { return <button type="button" {...p} className={`${small ? "h-8 px-2.5 text-[12px]" : "h-9 px-3.5 text-[13px]"} rounded-xl font-black whitespace-nowrap disabled:opacity-40`} style={gold ? GOLD_BTN : { border: `1px solid ${G.line}`, color: G.ink, ...(p.style || {}) }}>{children}</button>; }

// ▶ 2026-11-24 유튜브 바로 올리기 설정(사용자: "키를 만든 뒤 어디서 막혔는지 모르겠다") — 단계별 확인표 + 값 모양 검사 + [연결 시험]
const YT_CHECK_LS = "kpYtSetupChecks";
const loadChecks = () => { try { return JSON.parse(localStorage.getItem(YT_CHECK_LS) || "{}") || {}; } catch { return {}; } };
const PROD_ORIGIN = "https://app.logisweb.co.kr";
function Copy({ text }) {
  const [ok, setOk] = React.useState(false);
  return <button type="button" onClick={() => { navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1400); }).catch(() => {}); }} className="h-7 px-2 rounded-md text-[11.5px] font-black shrink-0" style={{ border: `1px solid ${G.line}`, color: ok ? G.ok : G.gold }}>{ok ? "복사했어요" : "복사"}</button>;
}
function Code({ children }) { return <code className="px-1.5 py-0.5 rounded text-[12px]" style={{ background: "rgba(255,255,255,.07)", color: G.goldHi }}>{children}</code>; }
function YoutubeSetup({ saved, save }) {
  const [cid, setCid] = React.useState(saved);
  React.useEffect(() => { setCid(saved); }, [saved]);
  const [checks, setChecks] = React.useState(loadChecks);
  const [test, setTest] = React.useState(null); // { busy } | { ok, msg }
  const tick = (k) => setChecks((c) => { const n = { ...c, [k]: !c[k] }; try { localStorage.setItem(YT_CHECK_LS, JSON.stringify(n)); } catch { /* 무시 */ } return n; });
  const origins = [...new Set([PROD_ORIGIN, typeof location !== "undefined" ? location.origin : ""].filter(Boolean))];
  const chk = checkClientId(cid);
  const dirty = chk.value !== saved;
  const doSave = () => { if (chk.ok) save({ youtubeClientId: chk.value }); };
  const runTest = async () => {
    if (!chk.ok) { setTest({ ok: false, msg: chk.msg }); return; }
    if (dirty) save({ youtubeClientId: chk.value });
    setTest({ busy: true });
    try { await youtubeToken(chk.value, { fresh: true }); setTest({ ok: true, msg: "연결됐어요. 방금 로그인한 구글 계정의 유튜브 채널로 영상 편집실에서 바로 올릴 수 있어요." }); }
    catch (e) { setTest({ ok: false, msg: ytErrorText(e) }); }
  };
  const steps = [
    { k: "api", t: "YouTube Data API v3 사용 설정", body: <>
      <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer" className="underline" style={{ color: G.ice }}>Google Cloud 콘솔 › API 라이브러리 › YouTube Data API v3</a>를 열고 [사용]을 눌러요. 위쪽 프로젝트 이름이 맞는지 먼저 확인해 주세요. 아래 단계도 모두 같은 프로젝트에서 해요.
    </> },
    { k: "consent", t: "OAuth 동의 화면 만들기 (테스트 사용자 추가가 핵심)", body: <>
      <a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noreferrer" className="underline" style={{ color: G.ice }}>Google 인증 플랫폼(OAuth 동의 화면)</a>에서 아래처럼 채워요.
      <ul className="list-disc pl-5 mt-1 space-y-0.5">
        <li>사용자 유형(대상): <b>외부</b></li>
        <li>앱 이름: 예) <Code>LogisWeb 홍보</Code> · 사용자 지원 이메일 · 개발자 연락처: 내 이메일</li>
        <li>데이터 액세스(범위) › 범위 추가: <Code>.../auth/youtube.upload</Code> <Copy text="https://www.googleapis.com/auth/youtube.upload" /></li>
        <li><b style={{ color: G.warn }}>대상 › 테스트 사용자 › [사용자 추가]: 유튜브 채널을 가진 구글 계정</b>을 넣어요. 빠뜨리면 로그인할 때 "앱이 확인되지 않음" 뒤에 <b>403 access_denied</b>로 막혀요. 가장 흔한 원인이에요.</li>
        <li>게시 상태는 <b>테스트</b> 그대로 두면 돼요. 구글 심사는 받지 않아도 돼요.</li>
      </ul>
    </> },
    { k: "client", t: "OAuth 클라이언트 ID 만들기 (웹 애플리케이션)", body: <>
      <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer" className="underline" style={{ color: G.ice }}>클라이언트 › [클라이언트 만들기]</a>에서 애플리케이션 유형을 <b>웹 애플리케이션</b>으로 고르고, <b>승인된 자바스크립트 원본</b>에 아래 주소를 한 줄씩 모두 넣어요. 끝에 <Code>/</Code>나 경로를 붙이면 안 돼요. 승인된 리디렉션 URI는 비워 둬도 돼요.
      <div className="mt-1.5 space-y-1">{origins.map((o) => <div key={o} className="flex items-center gap-2"><Code>{o}</Code><Copy text={o} />{o === (typeof location !== "undefined" ? location.origin : "") && o !== PROD_ORIGIN && <span className="text-[11px]" style={{ color: G.dim }}>지금 쓰는 주소</span>}</div>)}</div>
      <div className="mt-1" style={{ color: G.dim }}>저장한 뒤 구글에 반영되기까지 5분쯤 걸릴 수 있어요.</div>
    </> },
    { k: "paste", t: "클라이언트 ID 붙여 넣기", body: <>
      만들어진 창의 <b>클라이언트 ID</b>(숫자로 시작해 <Code>.apps.googleusercontent.com</Code>으로 끝나는 값)를 복사해 넣고 [저장]을 눌러요. <b>클라이언트 보안 비밀번호(GOCSPX-…)</b>와 <b>API 키(AIza…)</b>는 넣지 않아요.
      <div className="flex gap-2 mt-2"><input value={cid} onChange={(e) => { setCid(e.target.value); setTest(null); }} placeholder="123456789012-abc….apps.googleusercontent.com" spellCheck={false} autoComplete="off" className="flex-1 min-w-0 h-9 rounded-lg px-3 text-[13px]" style={{ ...inp, borderColor: !cid.trim() ? G.line2 : chk.ok ? "rgba(127,209,174,.5)" : "rgba(255,138,122,.6)" }} />
        <Btn gold disabled={!chk.ok || !dirty} onClick={doSave}>{!dirty && chk.ok ? "저장됨" : "저장"}</Btn></div>
      {cid.trim() && <div className="text-[12px] mt-1.5 leading-relaxed" style={{ color: chk.ok ? G.ok : G.bad }}>{chk.ok ? "✓ " : "⚠ "}{chk.msg}{chk.ok && chk.value !== cid.trim() ? " (붙여 넣은 글에서 클라이언트 ID만 골라 냈어요.)" : ""}</div>}
    </> },
    { k: "test", t: "연결 시험", body: <>
      [연결 시험]을 누르면 구글 로그인 창이 떠요. <b>유튜브 채널 주인 계정</b>으로 로그인하고, "Google에서 확인하지 않은 앱" 화면이 나오면 [계속]을 눌러요. "유튜브 동영상 관리" 권한에 체크하고 [계속]을 누르면 끝이에요.
      <div className="flex items-center gap-2 mt-2"><Btn gold disabled={!!test?.busy || !chk.ok} onClick={runTest}>{test?.busy ? "구글 로그인 기다리는 중…" : "연결 시험"}</Btn>{!chk.ok && <span className="text-[11.5px]" style={{ color: G.dim }}>4단계 값을 먼저 넣어 주세요.</span>}</div>
      {test && !test.busy && <div className="mt-2 rounded-lg px-3 py-2 text-[12.5px] leading-relaxed" style={{ background: test.ok ? "rgba(127,209,174,.1)" : "rgba(255,138,122,.1)", border: `1px solid ${test.ok ? "rgba(127,209,174,.4)" : "rgba(255,138,122,.4)"}`, color: test.ok ? G.ok : "#FFC3B8" }}>{test.ok ? "✓ " : "⚠ "}{test.msg}</div>}
    </> },
  ];
  const done = steps.filter((x) => checks[x.k] || (x.k === "paste" && saved && checkClientId(saved).ok) || (x.k === "test" && test?.ok)).length;
  return (
    <AdmPanel code="YT" title="유튜브 바로 올리기" right={<span className="text-[12px] font-black" style={{ color: done === steps.length ? G.ok : G.gold }}>{done}/{steps.length} 단계</span>}>
      <div className="text-[12.5px] leading-relaxed mb-3" style={{ color: G.sub }}>영상 편집실에서 만든 영상을 유튜브에 바로 올리려면 Google Cloud 콘솔에서 한 번만 설정하면 돼요(15분쯤). 키 · 토큰은 저장하지 않고, 올릴 때마다 구글 로그인 창에서 허락받아요.</div>
      <div className="space-y-2">
        {steps.map((x, i) => {
          const auto = (x.k === "paste" && saved && checkClientId(saved).ok) || (x.k === "test" && test?.ok);
          const on = !!checks[x.k] || auto;
          return (
            <div key={x.k} className="rounded-xl p-3 flex gap-3" style={{ border: `1px solid ${on ? "rgba(127,209,174,.3)" : G.line2}`, background: on ? "rgba(127,209,174,.04)" : "transparent" }}>
              <button type="button" onClick={() => !auto && tick(x.k)} aria-label={on ? "완료 표시 지우기" : "완료로 표시"} className="w-7 h-7 rounded-full shrink-0 grid place-items-center text-[12.5px] font-black" style={on ? { background: G.ok, color: "#06251A" } : GOLD_BTN}>{on ? "✓" : i + 1}</button>
              <div className="flex-1 min-w-0 text-[12.5px] leading-relaxed" style={{ color: G.sub }}>
                <div className="text-[13.5px] font-black mb-0.5" style={{ color: G.ink }}>{x.t}</div>
                {x.body}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 rounded-lg px-3 py-2 text-[12px] leading-relaxed" style={{ background: "rgba(242,196,109,.07)", border: "1px solid rgba(242,196,109,.25)", color: G.sub }}>
        <b style={{ color: G.warn }}>자주 막히는 곳</b>
        <ul className="list-disc pl-5 mt-0.5 space-y-0.5">
          <li><b>403 access_denied · 액세스 차단됨</b>: 2단계 테스트 사용자에 채널 주인 계정이 없어요.</li>
          <li><b>오류 400: origin_mismatch</b> · <b>redirect_uri_mismatch</b>: 3단계 자바스크립트 원본에 지금 주소가 없거나 끝에 <Code>/</Code>가 붙었어요.</li>
          <li><b>로그인 창이 안 떠요</b>: 브라우저가 팝업을 막았어요. 주소창 오른쪽에서 팝업을 허용해 주세요.</li>
          <li><b>올린 영상이 비공개로 잠겨요</b>: 구글 심사를 받지 않은 앱으로 올린 영상은 유튜브가 비공개로 묶을 수 있어요. 그럴 땐 영상 편집실에서 [내려받기]한 뒤 유튜브 스튜디오에서 직접 올리면 돼요.</li>
        </ul>
      </div>
    </AdmPanel>
  );
}

export default function PromoSettings() {
  const [s, setS] = React.useState(null); const [msg, setMsg] = React.useState("");
  const [key, setKey] = React.useState(""); const [keyInfo, setKeyInfo] = React.useState(null); const [kb, setKb] = React.useState(false);
  React.useEffect(() => onSnapshot(doc(db, "siteConfig/mktSettings"), (d) => setS(d.data() || {}), () => setS({})), []);
  React.useEffect(() => { mktCall("geminiKey", {}).then(setKeyInfo).catch((e) => setKeyInfo({ error: e.message })); }, []);
  const save = async (patch) => { await setDoc(doc(db, "siteConfig/mktSettings"), patch, { merge: true }); setMsg("저장했어요."); setTimeout(() => setMsg(""), 2000); };
  if (!s) return null;
  const topics = Array.isArray(s.topics) && s.topics.length ? s.topics : DEFAULT_TOPICS;
  const setTopics = (t) => save({ topics: t });
  return <div className="space-y-4">
    {msg && <div className="text-[13px] font-bold" style={{ color: G.ok }}>{msg}</div>}
    <AdmPanel code="KEY" title="나레이션 음성 (Gemini API 키)">
      <div className="text-[12.5px] leading-relaxed mb-3" style={{ color: G.sub }}>영상 나레이션 목소리를 만들 때 Google Gemini 음성을 써요. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline" style={{ color: G.ice }}>Google AI Studio › API 키 만들기</a>에서 키를 만들어 붙여 넣으면 돼요. 무료 사용량으로도 충분해요. 키는 서버에만 저장되고, 이 화면에서도 다시 볼 수 없어요.</div>
      <div className="rounded-lg px-3 py-2 mb-3 text-[12px] leading-relaxed" style={{ background: "rgba(143,176,240,.07)", border: `1px solid ${G.line2}`, color: G.sub }}>이 키(<b>AIza…</b>)는 <b>나레이션 음성에만</b> 써요. 유튜브 올리기에는 쓰이지 않아요. 유튜브는 아래 [유튜브 바로 올리기]에서 따로 만드는 <b>OAuth 클라이언트 ID</b>가 필요해요.</div>
      <div className="text-[12.5px] mb-2" style={{ color: keyInfo?.set ? G.ok : G.warn }}>{keyInfo == null ? "확인 중…" : keyInfo.error ? `확인하지 못했어요: ${keyInfo.error}` : keyInfo.set ? `✓ 키가 들어 있어요 (${keyInfo.hint})` : "아직 키가 없어요."}</div>
      <div className="flex gap-2"><input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="AIza…" className="flex-1 h-9 rounded-lg px-3 text-[13px]" style={inp} />
        <Btn gold disabled={kb || !key.trim()} onClick={async () => { const k = key.trim(); if (!/^AIza/.test(k)) { setMsg(/apps\.googleusercontent\.com/.test(k) ? "이 값은 유튜브용 OAuth 클라이언트 ID예요. 아래 [유튜브 바로 올리기] 4단계에 넣어 주세요." : "Gemini API 키는 AIza 로 시작해요. Google AI Studio에서 만든 키를 넣어 주세요."); return; } setKb(true); try { setKeyInfo(await mktCall("geminiKey", { key: k })); setKey(""); setMsg("키를 저장했어요."); } catch (e) { setMsg(e.message); } finally { setKb(false); } }}>저장</Btn>
        {keyInfo?.set && <Btn onClick={async () => { try { setKeyInfo(await mktCall("geminiKey", { clear: true })); setMsg("키를 지웠어요."); } catch (e) { setMsg(e.message); } }} style={{ color: G.bad }}>지우기</Btn>}</div>
    </AdmPanel>
    <YoutubeSetup saved={s.youtubeClientId || ""} save={save} />
    <AdmPanel code="NAVER" title="네이버 블로그">
      <div className="text-[12.5px] leading-relaxed mb-3" style={{ color: G.sub }}>네이버는 블로그 글을 자동으로 올리는 공식 기능(API)을 열어 두지 않았어요. 그래서 키 없이, 블로그 원고 › [네이버] 탭에서 아래 순서로 올려요. 한 편에 5분쯤 걸려요.</div>
      <ol className="list-decimal pl-5 space-y-1 text-[12.5px] leading-relaxed mb-3" style={{ color: G.sub }}>
        <li>[제목 복사] · [본문 복사]를 눌러요. 본문은 글자 모양과 카드 그림까지 함께 복사돼요.</li>
        <li>[N 네이버 글쓰기 열기]를 누르면 우리 블로그 글쓰기 화면이 열려요. 제목과 본문 칸에 붙여 넣어요(Ctrl+V).</li>
        <li>그림이 빠졌으면 [카드 묶음(ZIP)]을 받아 글쓰기 화면에 끌어다 놓고, [태그 복사]로 태그를 넣어요.</li>
        <li>네이버에서 발행한 뒤, 원고 화면에서 [네이버에 올렸어요]에 체크하면 목록에 "네이버 ✓"로 표시돼요.</li>
      </ol>
      <label className="block text-[12.5px] mb-1" style={{ color: G.sub }}>블로그 아이디: blog.naver.com/<b>아이디</b> 의 아이디 부분만 넣어요. 넣어 두면 [네이버 글쓰기 열기]가 우리 블로그 글쓰기로 바로 열려요.</label>
      <input key={s.naverBlogId || "-"} defaultValue={s.naverBlogId || ""} placeholder="예: logisweb (이메일 말고 아이디만)" onBlur={(e) => save({ naverBlogId: e.target.value.trim().replace(/^.*blog\.naver\.com\//, "").replace(/[/?#].*$/, "").replace(/@.*$/, "") })} className="w-full h-9 rounded-lg px-3 text-[13px]" style={inp} />
    </AdmPanel>
    <AdmPanel code="WEEK" title="매주 자동 블로그 초안" right={<label className="flex items-center gap-2 text-[13px] font-black" style={{ color: s.autoDraft === false ? G.dim : G.ok }}><input type="checkbox" checked={s.autoDraft !== false} onChange={(e) => save({ autoDraft: e.target.checked })} />{s.autoDraft === false ? "꺼짐" : "켜짐"}</label>}>
      <div className="text-[12.5px] leading-relaxed mb-3" style={{ color: G.sub }}>매주 월요일 아침 7시 13분, 그 주에 글이 없으면 아래 목록에서 아직 안 쓴 주제로 AI가 초안을 써서 <b>블로그 원고 › 검토 대기</b>에 넣어요. 읽어 보고 고친 뒤 [발행하기]만 누르면 돼요.</div>
      <div className="space-y-1">{topics.map((t, i) => <div key={t.slug + i} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5" style={{ border: `1px solid ${G.line2}`, opacity: t.done ? 0.5 : 1 }}>
        <span className="text-[11px] w-5" style={{ color: G.dim }}>{i + 1}</span>
        <input defaultValue={t.title} onBlur={(e) => setTopics(topics.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} className="flex-1 min-w-0 h-8 rounded-md px-2 text-[12.5px]" style={inp} />
        <input defaultValue={t.keywords} onBlur={(e) => setTopics(topics.map((x, k) => (k === i ? { ...x, keywords: e.target.value } : x)))} placeholder="검색 키워드" className="w-[180px] h-8 rounded-md px-2 text-[12px] hidden md:block" style={inp} />
        <button type="button" className="text-[12px] px-1" style={{ color: G.sub }} onClick={() => { if (i) { const a = [...topics]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setTopics(a); } }}>↑</button>
        <button type="button" className="text-[11px] px-1" style={{ color: t.done ? G.ok : G.dim }} onClick={() => setTopics(topics.map((x, k) => (k === i ? { ...x, done: x.done ? null : "손으로" } : x)))} title="쓴 주제로 표시">{t.done ? "✓씀" : "안 씀"}</button>
        <button type="button" className="text-[12px] px-1" style={{ color: G.bad }} onClick={() => setTopics(topics.filter((_, k) => k !== i))}>✕</button></div>)}</div>
      <div className="flex gap-2 mt-2"><Btn small onClick={() => setTopics([...topics, { slug: `topic-${Date.now().toString(36)}`, title: "새 주제", keywords: "", angle: "" }])}>＋ 주제 추가</Btn>
        <Btn small onClick={() => setTopics(DEFAULT_TOPICS)}>기본 목록으로</Btn></div>
    </AdmPanel>
    <AdmPanel code="FACT" title="홍보 기준표 (AI가 지킬 사실)">
      <div className="text-[12.5px] mb-2 leading-relaxed" style={{ color: G.sub }}>AI 초안 · 대본 · 유튜브 설명은 이 글에 있는 사실만 써요. 기능 · 요금이 바뀌면 여기를 고쳐 주세요.</div>
      <textarea key={s.facts ? "c" : "d"} defaultValue={s.facts || DEFAULT_FACTS} onBlur={(e) => e.target.value !== (s.facts || DEFAULT_FACTS) && save({ facts: e.target.value })} rows={16} className="w-full rounded-lg px-3 py-2 text-[12.5px] leading-relaxed font-mono" style={inp} />
      <div className="mt-2"><Btn small onClick={() => save({ facts: "" })}>기본 기준표로 되돌리기</Btn></div>
    </AdmPanel>
  </div>;
}
