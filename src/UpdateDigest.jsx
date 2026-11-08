// ======================= src/UpdateDigest.jsx =======================
// 📝 2026-11-09 업데이트 보관함(AI 작성함) — 관리센터 › 운영 › 플랫폼 공지 맨 위 카드
//  · 원본: public/updates.json (scripts/gen-updates.mjs가 빌드·커밋 때마다 git 커밋 제목을 누적)
//  · 보관함 = 마지막 공지 이후에 배포된 수정·추가 내용만. 공지를 게시하면 그 시점까지는 "공지됨"으로 사라지고 다음 업데이트부터 다시 쌓인다
//  · 상태: siteConfig/updateDigest { lastNoticedAt(커밋 시각 ISO), lastNoticedHash, excluded: [해시] } — 최고관리자만 읽기/쓰기
import React from "react";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const REF = doc(db, "siteConfig", "updateDigest");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const kstDay = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 10);

// 커밋 제목 → { topic, lines } — "주제: 항목 · 항목" 이면 주제 + 항목 줄, 아니면 " · "로만 나눈다
export function parseSubject(s) {
  let t = String(s || "").replace(/^(feat|fix|refactor|style|perf|docs|ui|ux)(\([^)]*\))?:\s*/i, "").trim();
  let topic = "";
  const m = t.match(/^([^:·]{2,40}):\s+(.+)$/);
  if (m) { topic = m[1].trim(); t = m[2]; }
  const lines = t.split(/\s+·\s+/).map((x) => x.trim().replace(/[.。]$/, "")).filter(Boolean);
  return { topic, lines };
}

// 공지 본문(HTML) 만들기 — 주제별 굵은 제목 + 목록
export function digestHtml(items) {
  const blocks = items.slice().reverse().map((x) => {
    const { topic, lines } = parseSubject(x.s);
    if (!lines.length) return "";
    if (topic) return `<p><b>■ ${esc(topic)}</b></p><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
    return lines.length === 1 ? `<ul><li>${esc(lines[0])}</li></ul>` : `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
  }).join("");
  return `<p>LogisWeb이 아래와 같이 업데이트되었습니다.</p>${blocks}<p>이용해 주셔서 감사합니다. 불편한 점은 언제든 말씀해 주세요.</p>`;
}

// 지금 화면에 받아 둔 업데이트 중 가장 최근 것 — 공지를 게시하면 여기까지 "공지됨"
let _latest = null;
export async function markUpdatesNoticed(upTo) {
  const t = upTo || _latest;
  if (!t?.at) return;
  await setDoc(REF, { lastNoticedAt: t.at, lastNoticedHash: t.h, excluded: [], noticedAt: serverTimestamp() }, { merge: true });
}

export function useUpdateDigest() {
  const [all, setAll] = React.useState(null);
  const [st, setSt] = React.useState({});
  React.useEffect(() => {
    let off = false;
    fetch(`/updates.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { items: [] })).then((j) => { if (!off) setAll(Array.isArray(j?.items) ? j.items : []); }).catch(() => { if (!off) setAll([]); });
    return () => { off = true; };
  }, []);
  React.useEffect(() => onSnapshot(REF, (s) => setSt(s.exists() ? s.data() || {} : {}), () => setSt({})), []);
  const pending = React.useMemo(() => (all || []).filter((x) => !st.lastNoticedAt || x.at > st.lastNoticedAt), [all, st.lastNoticedAt]);
  _latest = pending[0] || (all || [])[0] || null;
  return { loading: all == null, pending, excluded: st.excluded || [], lastNoticedAt: st.lastNoticedAt || "" };
}

export default function UpdateDigestCard({ onCompose }) {
  const { loading, pending, excluded, lastNoticedAt } = useUpdateDigest();
  const [open, setOpen] = React.useState(true);
  const ex = new Set(excluded);
  const chosen = pending.filter((x) => !ex.has(x.h));
  const toggle = (h) => setDoc(REF, { excluded: ex.has(h) ? excluded.filter((x) => x !== h) : [...excluded, h] }, { merge: true }).catch((e) => window.alert(e.message));
  const byDay = pending.reduce((m, x) => { const d = kstDay(x.at); (m[d] = m[d] || []).push(x); return m; }, {});
  const compose = () => {
    if (!chosen.length) { window.alert("공지할 업데이트를 하나 이상 골라 주세요."); return; }
    const d = kstDay(chosen[0].at);
    onCompose?.({ title: `LogisWeb 업데이트 안내 (${Number(d.slice(5, 7))}/${Number(d.slice(8))})`, bodyHtml: digestHtml(chosen) });
  };
  return (
    <div className="rounded-[18px] bg-white border border-[#E3E8F0] overflow-hidden">
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-[#EEF1F6] flex-wrap">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2.5 min-w-0 text-left">
          <span className="px-2 py-1 rounded-md bg-[#0F1A30] text-[#8FB0F0] text-[10.5px] font-black tracking-[0.18em]" style={{ fontFamily: MONO }}>AI DRAFTS</span>
          <span className="text-[16px] font-black text-[#0F1A30] whitespace-nowrap">AI 작성함 · 업데이트 보관함</span>
          <span className="px-2 py-0.5 rounded-full bg-[#EEF2F8] text-[#1B2B4B] text-[12.5px] font-black tabular-nums" style={{ fontFamily: MONO }}>{loading ? "…" : `${chosen.length}/${pending.length}`}</span>
          <span className="text-[#9AA9C3] text-[12px]">{open ? "▲" : "▼"}</span>
        </button>
        <span className="text-[12.5px] text-[#7A879C] truncate">배포할 때마다 수정·추가 내용이 자동으로 쌓입니다 · 공지를 게시하면 거기까지는 비워집니다{lastNoticedAt ? ` (마지막 공지 반영 ${kstDay(lastNoticedAt)})` : ""}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {pending.length > 0 && <button type="button" onClick={async () => { if (window.confirm("공지하지 않고 지금까지의 업데이트를 보관함에서 비울까요?")) await markUpdatesNoticed(pending[0]).catch((e) => window.alert(e.message)); }} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-bold text-[#7A879C] whitespace-nowrap">비우기</button>}
          <button type="button" disabled={!chosen.length} onClick={compose} className="h-9 px-4 rounded-lg bg-[#0F1A30] text-white text-[13.5px] font-black whitespace-nowrap disabled:opacity-40">이 내용으로 공지 작성</button>
        </div>
      </div>
      {open && (
        loading ? <div className="py-8 text-center text-[#9AA9C3] text-[14px]">불러오는 중…</div>
          : pending.length === 0 ? <div className="py-8 text-center text-[#9AA9C3] text-[14px]">마지막 공지 이후 새 업데이트가 없습니다.</div>
            : (
              <div className="max-h-[420px] overflow-y-auto divide-y divide-[#EEF1F6]">
                {Object.entries(byDay).map(([d, list]) => (
                  <div key={d} className="px-4 sm:px-5 py-3">
                    <div className="text-[12px] font-black text-[#4B6CB7] tracking-wider mb-2 tabular-nums" style={{ fontFamily: MONO }}>{d}</div>
                    <div className="space-y-2">
                      {list.map((x) => {
                        const { topic, lines } = parseSubject(x.s);
                        const on = !ex.has(x.h);
                        return (
                          <label key={x.h} className={`flex items-start gap-2.5 cursor-pointer rounded-xl px-3 py-2 border ${on ? "border-[#D5E0F2] bg-[#F7F9FC]" : "border-transparent opacity-45"}`}>
                            <input type="checkbox" checked={on} onChange={() => toggle(x.h)} className="mt-1 w-4 h-4 accent-[#1B2B4B] shrink-0" />
                            <div className="min-w-0">
                              {topic && <div className="text-[14px] font-black text-[#0F1A30]">{topic}</div>}
                              <ul className="mt-0.5 space-y-0.5">{lines.map((l, i) => <li key={i} className="text-[13.5px] text-[#3A4A66] leading-snug before:content-['·'] before:mr-1.5 before:text-[#9AA9C3]">{l}</li>)}</ul>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
      )}
    </div>
  );
}
