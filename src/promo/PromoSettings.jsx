// ======================= src/promo/PromoSettings.jsx =======================
// ⚙ 2026-11-23 관리자센터 › 홍보 › 홍보 설정
//  · Gemini API 키(나레이션 음성) — 서버(platformSecrets/gemini)에만 저장, 화면에는 앞뒤 4글자만
//  · 유튜브 바로 올리기(구글 OAuth 클라이언트 ID) · 네이버 블로그 아이디
//  · 매주 자동 초안 켜기/끄기 · 주제 목록(위에서부터 차례로 씀) · 홍보 기준표(AI가 지킬 사실)
import React from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { G, GOLD_BTN, AdmPanel } from "../adminCenter/admUi";
import { mktCall } from "./promoKit";
import DEFAULT_TOPICS from "../../functions/promoTopics.json";
import DEFAULT_FACTS from "../../functions/promoFacts.md?raw";

const inp = { background: "rgba(255,255,255,.04)", border: `1px solid ${G.line2}`, color: G.ink };
function Btn({ gold, children, small, ...p }) { return <button type="button" {...p} className={`${small ? "h-8 px-2.5 text-[12px]" : "h-9 px-3.5 text-[13px]"} rounded-xl font-black whitespace-nowrap disabled:opacity-40`} style={gold ? GOLD_BTN : { border: `1px solid ${G.line}`, color: G.ink, ...(p.style || {}) }}>{children}</button>; }

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
    <AdmPanel code="KEY" title="나레이션 음성(Gemini)">
      <div className="text-[12.5px] leading-relaxed mb-3" style={{ color: G.sub }}>영상 나레이션을 만드는 데 Google Gemini 음성을 써요. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline" style={{ color: G.ice }}>Google AI Studio › API 키 만들기</a>에서 키를 만들어 붙여 넣으면 돼요(무료 사용량으로 충분해요). 키는 서버에만 저장되고 이 화면에서도 다시 볼 수 없어요.</div>
      <div className="text-[12.5px] mb-2" style={{ color: keyInfo?.set ? G.ok : G.warn }}>{keyInfo == null ? "확인 중…" : keyInfo.error ? `확인 실패: ${keyInfo.error}` : keyInfo.set ? `✓ 키가 들어 있어요 (${keyInfo.hint})` : "아직 키가 없어요"}</div>
      <div className="flex gap-2"><input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="AIza…" className="flex-1 h-9 rounded-lg px-3 text-[13px]" style={inp} />
        <Btn gold disabled={kb || !key.trim()} onClick={async () => { setKb(true); try { setKeyInfo(await mktCall("geminiKey", { key: key.trim() })); setKey(""); setMsg("키를 저장했어요."); } catch (e) { setMsg(e.message); } finally { setKb(false); } }}>저장</Btn>
        {keyInfo?.set && <Btn onClick={async () => setKeyInfo(await mktCall("geminiKey", { clear: true }))} style={{ color: G.bad }}>지우기</Btn>}</div>
    </AdmPanel>
    <AdmPanel code="YT" title="유튜브 바로 올리기">
      <ol className="list-decimal pl-5 space-y-1 text-[12.5px] leading-relaxed mb-3" style={{ color: G.sub }}>
        <li><a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer" className="underline" style={{ color: G.ice }}>Google Cloud 콘솔</a>에서 <b>YouTube Data API v3</b> 사용 설정</li>
        <li>API 및 서비스 › OAuth 동의 화면 → 외부 · 앱 이름 "LogisWeb 홍보" · 테스트 사용자에 유튜브 채널 구글 계정 추가</li>
        <li>사용자 인증 정보 › 만들기 › <b>OAuth 클라이언트 ID</b> › 웹 애플리케이션 → 승인된 자바스크립트 원본에 <code>{location.origin}</code> 추가</li>
        <li>만들어진 클라이언트 ID(…apps.googleusercontent.com)를 아래에 붙여 넣기</li>
      </ol>
      <div className="flex gap-2"><input defaultValue={s.youtubeClientId || ""} onBlur={(e) => e.target.value.trim() !== (s.youtubeClientId || "") && save({ youtubeClientId: e.target.value.trim() })} placeholder="1234…apps.googleusercontent.com" className="flex-1 h-9 rounded-lg px-3 text-[13px]" style={inp} /></div>
      <div className="text-[11.5px] mt-2 leading-relaxed" style={{ color: G.dim }}>⚠ 구글 심사(감사)를 받기 전 앱으로 올린 영상은 유튜브가 "비공개"로 묶어 둘 수 있어요. 그 경우 영상 편집실에서 [내려받기] → 유튜브 스튜디오에서 직접 올리면 돼요. 키 · 토큰은 저장하지 않고, 올릴 때마다 구글 로그인 창에서 허락해요.</div>
    </AdmPanel>
    <AdmPanel code="NAVER" title="네이버 블로그">
      <label className="block text-[12.5px] mb-1" style={{ color: G.sub }}>블로그 아이디(blog.naver.com/<b>아이디</b>) — [네이버 글쓰기 열기]가 바로 우리 블로그 글쓰기로 가요</label>
      <input defaultValue={s.naverBlogId || ""} onBlur={(e) => save({ naverBlogId: e.target.value.trim().replace(/^.*blog\.naver\.com\//, "").replace(/\/.*/, "") })} className="w-full h-9 rounded-lg px-3 text-[13px]" style={inp} />
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
