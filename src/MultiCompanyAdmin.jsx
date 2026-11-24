// ======================= src/MultiCompanyAdmin.jsx =======================
// 🏢 2026-11-24 관리센터 › 보안 · 데이터 › 여러 회사 계정 — 한 사람이 여러 운송사를 오가며 쓰게(예: 태진 · 큐런 대표)
//  최고관리자 · 부관리자만. 고른 계정(users/{uid}.multiCompanies)에 오갈 회사를 정해 준다 — 규칙도 최고관리자만 허락(firestore.rules multiCoWriteOk)
//  · 그 계정은 PC 상단 회사 칸(▾) › [회사 전환] · 모바일 전체 메뉴 맨 위 회사 카드에서 회사를 바꾼다
//  · 다른 회사에서는 통합관리자 · 근태 · 급여 · 연차는 원래 소속 회사에만
import React from "react";
import { arrayUnion, collection, deleteField, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { auth, db } from "./firebase";
import { usePlatformLive } from "./PlatformLive";
import { ROLE_LABELS } from "./customRoles";
import { kpConfirm } from "./kpDialog";
import { CO_TONES, multiCompaniesOf } from "./multiCompany";
import { kstToday } from "./companyContract";

const CARD = "bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)] min-w-0";
const INPUT = "w-full h-11 rounded-xl border border-[#DCE3EE] px-3.5 text-[15px] outline-none focus:border-[#1B2B4B] bg-white";
const NO_ROLES = ["totalMaster", "driver", "shipper", "cafeUser"];

function Head({ code, title, desc }) {
  return (
    <div className="px-5 pt-5 pb-4 border-b border-[#EEF1F6]">
      <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" /><span className="text-[12px] font-extrabold tracking-[0.2em] text-[#94A3B8]">{code}</span></div>
      <div className="mt-1 text-[17px] font-black text-[#0F1A30] tracking-tight">{title}</div>
      {desc && <div className="text-[14px] text-[#5B6B85] mt-1 leading-relaxed">{desc}</div>}
    </div>
  );
}
// 회사 칩 — 그 계정의 회사 순서대로 색(화면에서 보이는 색과 같다)
const Chip = ({ co, i, on }) => {
  const t = CO_TONES[i % CO_TONES.length];
  return <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[13px] font-black" style={{ background: t.soft, color: t.ink, boxShadow: on ? `inset 0 0 0 1.5px ${t.main}` : undefined }}>
    <span className="w-2 h-2 rounded-full" style={{ background: t.main }} />{co}{on ? " · 지금" : ""}</span>;
};

export default function MultiCompanyPanel() {
  const live = usePlatformLive();
  const [rows, setRows] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [pick, setPick] = React.useState(null); // { uid, name, email, company, role, sel: [] }
  const [coQ, setCoQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => onSnapshot(query(collection(db, "users"), where("multiCompanies", "!=", null)),
    (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => multiCompaniesOf(u).length)), () => setRows([])), []);
  const companies = React.useMemo(() => Object.values(live?.companies || {}).map((c) => c.name).filter(Boolean).sort((a, b) => a.localeCompare(b, "ko")), [live]);
  const candidates = React.useMemo(() => {
    const k = q.trim();
    if (!k) return [];
    const out = [];
    Object.values(live?.companies || {}).forEach((c) => (c.staffList || []).forEach((u) => {
      if (!u.approved || NO_ROLES.includes(u.role)) return;
      if ((u.name || "").includes(k) || (u.email || "").includes(k) || c.name.includes(k)) out.push({ ...u, company: c.name });
    }));
    return out.slice(0, 30);
  }, [live, q]);
  const openEdit = (u) => {
    const uid = u.uid || u.id;
    const r = (rows || []).find((x) => x.id === uid);
    setMsg(""); setCoQ("");
    setPick({ uid, name: u.name || u.email || "-", email: u.email || "", company: u.companyName || u.company || "", role: u.role || "", sel: r ? multiCompaniesOf(r) : [] });
  };
  const toggle = (co) => setPick((p) => ({ ...p, sel: p.sel.includes(co) ? p.sel.filter((x) => x !== co) : [...p.sel, co] }));
  const save = async () => {
    if (!pick) return;
    const sel = pick.sel.filter((c) => c && c !== pick.company);
    const text = sel.length
      ? `"${pick.name}"님이 ${[pick.company, ...sel].join(" · ")} 를 오가며 쓰게 할까요?\n다른 회사에서는 통합관리자로 일하고, 근태 · 급여 · 연차는 ${pick.company}에만 남아요.`
      : `"${pick.name}"님의 여러 회사 사용을 끌까요?\n${pick.company}만 쓰게 돼요.`;
    if (!(await kpConfirm(text))) return;
    setBusy(true); setMsg("");
    try {
      const cur = (rows || []).find((r) => r.id === pick.uid);
      const keepActive = cur && sel.includes(String(cur.activeCompany || ""));
      await setDoc(doc(db, "users", pick.uid), sel.length
        ? { multiCompanies: sel, ...(keepActive ? {} : { activeCompany: "" }), personnelHistory: arrayUnion({ date: kstToday(), type: "여러 회사 사용", detail: `${sel.join(" · ")} · 관리센터 ${auth.currentUser?.email || ""}` }) }
        : { multiCompanies: deleteField(), activeCompany: deleteField(), personnelHistory: arrayUnion({ date: kstToday(), type: "여러 회사 사용 끔", detail: `관리센터 ${auth.currentUser?.email || ""}` }) },
      { merge: true });
      setMsg(sel.length ? `${pick.name}님 — ${sel.join(" · ")} 오가기를 저장했어요. 그 계정은 몇 초 안에 [회사 전환]이 보여요.` : `${pick.name}님의 여러 회사 사용을 껐어요.`);
      setPick(null); setQ("");
    } catch (e) { setMsg(`저장하지 못했어요: ${e?.code || e?.message || e}`); } finally { setBusy(false); }
  };
  const shownCos = companies.filter((c) => c !== pick?.company && (!coQ.trim() || c.includes(coQ.trim())));
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start" data-kp="multi-co-panel">
      <section className={CARD}>
        <Head code="MULTI COMPANY" title="여러 회사 계정" desc="한 사람이 정해진 회사끼리 로그아웃 없이 오가며 써요. 다른 회사에서는 통합관리자, 근태 · 급여 · 연차는 원래 소속 회사에만 남아요." />
        <div className="p-5 space-y-2.5">
          {rows === null ? <div className="text-[14px] text-[#7A879C]">불러오는 중…</div>
            : rows.length === 0 ? <div className="text-[14.5px] text-[#7A879C]">아직 정해진 계정이 없어요. 오른쪽에서 사람을 찾아 회사를 골라 주세요.</div>
              : rows.map((u) => {
                const list = [u.companyName, ...multiCompaniesOf(u)];
                const act = list.includes(String(u.activeCompany || "")) ? u.activeCompany : u.companyName;
                return (
                  <div key={u.id} className="rounded-2xl border border-[#E3E8F0] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-[15.5px] font-black text-[#0F1A30] truncate">{u.name || "-"} <span className="text-[13px] font-bold text-[#7A879C]">{u.position || ROLE_LABELS[u.role] || u.role || ""}</span></div>
                        <div className="text-[13px] text-[#5B6B85] truncate">{u.email} · 원래 소속 {u.companyName}</div>
                      </div>
                      <button type="button" onClick={() => openEdit({ ...u, uid: u.id })} className="shrink-0 h-9 px-3.5 rounded-lg border border-[#1B2B4B] text-[#1B2B4B] text-[13.5px] font-black">바꾸기</button>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">{list.map((c, i) => <Chip key={c} co={c} i={i} on={c === act} />)}</div>
                  </div>);
              })}
          {msg && <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3.5 py-2.5 text-[14px] font-bold text-[#1B2B4B]">{msg}</div>}
          <div className="text-[13px] text-[#5B6B85] leading-relaxed pt-1">회사마다 색이 달라요. 바꾼 회사 색이 화면 맨 위 띠 · 회사 칸에 보여서 지금 어느 회사인지 바로 알 수 있어요.</div>
        </div>
      </section>
      <section className={CARD}>
        <Head code="ASSIGN" title={pick ? `${pick.name}님 — 오갈 회사 고르기` : "계정 찾기"} desc={pick ? `원래 소속 ${pick.company} 말고 같이 쓸 회사를 골라요(최대 10곳).` : "이름 · 이메일 · 회사명으로 직원을 찾아요(승인된 운송사 직원만)."} />
        <div className="p-5">
          {!pick ? (
            <>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 이메일 · 회사명" className={INPUT} />
              <div className="mt-3 divide-y divide-[#EEF1F6] rounded-xl border border-[#EEF1F6]">
                {q.trim() && candidates.length === 0 && <div className="py-8 text-center text-[14px] text-[#7A879C]">맞는 직원이 없어요</div>}
                {candidates.map((u) => (
                  <div key={u.uid} className="flex items-center gap-3 px-3.5 py-2.5">
                    <div className="flex-1 min-w-0"><div className="text-[15px] font-bold text-[#0F1A30] truncate">{u.name} <span className="text-[13px] font-medium text-[#7A879C]">{ROLE_LABELS[u.role] || u.role}{u.position ? ` · ${u.position}` : ""}</span></div>
                      <div className="text-[13px] text-[#5B6B85] truncate">{u.email} · {u.company}</div></div>
                    <button type="button" onClick={() => openEdit(u)} className="shrink-0 h-9 px-3.5 rounded-lg bg-[#2D4C82] text-white text-[14px] font-black">고르기</button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5 mb-3">{[pick.company, ...pick.sel].map((c, i) => <Chip key={c} co={c} i={i} />)}</div>
              <input value={coQ} onChange={(e) => setCoQ(e.target.value)} placeholder="회사 이름 찾기" className={INPUT} />
              <div className="mt-3 max-h-[320px] overflow-y-auto divide-y divide-[#EEF1F6] rounded-xl border border-[#EEF1F6]">
                {shownCos.map((c) => (
                  <label key={c} className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-[#F6F8FB]">
                    <input type="checkbox" checked={pick.sel.includes(c)} onChange={() => toggle(c)} disabled={!pick.sel.includes(c) && pick.sel.length >= 10} className="w-4 h-4 accent-[#1B2B4B]" />
                    <span className="text-[14.5px] font-bold text-[#0F1A30]">{c}</span>
                  </label>))}
                {!shownCos.length && <div className="py-8 text-center text-[14px] text-[#7A879C]">맞는 회사가 없어요</div>}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setPick(null)} disabled={busy} className="h-10 px-4 rounded-xl border border-[#DCE3EE] text-[14px] font-black text-[#3A4A66]">취소</button>
                <button type="button" onClick={save} disabled={busy} className="h-10 px-5 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-black disabled:opacity-50">{busy ? "저장 중…" : pick.sel.length ? "저장" : "여러 회사 끄기"}</button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
