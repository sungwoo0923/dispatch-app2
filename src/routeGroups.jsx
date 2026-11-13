// ======================= src/routeGroups.jsx =======================
// 🗂 2026-11-13 담당노선구분 — 거래처는 같아도(녹수) 시트 탭처럼 나눠 보는 묶음(녹수 · 아산 KDF · 보령 KDF …)
//  · 켜기: 관리센터 › 운송사 기능 "담당노선구분"(companyFeatures.routeGroups) — 지금은 JY로지스틱스용
//  · 값: 오더의 `담당노선구분` 칸. 구글시트에서 가져온 오더는 칸이 없어도 가져온 탭 이름(이전출처 "탭!줄")을 쓴다
//  · 화면 위 버튼 줄에서 고르면 배차현황 · 실시간 · 정산 · 매출 등 오더를 쓰는 모든 화면이 그 묶음만 본다(데이터 입구에서 한 번 거른다)
//  · 내 담당: 직원마다 맡은 묶음(users/{uid}.routeGroups — 본인이 정함). 정해 두면 로그인했을 때 내 담당만 먼저 보인다. [전체]는 누구나 볼 수 있다
import React from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useCompanyOptionList } from "./companyDropdownOptions";
import { useCompanyFeatures } from "./companyFeatures";
import { CompanyOptionPicker } from "./companyOptionPicker";

export const RG_NONE = "(미지정)";
export const routeGroupOf = (row) => String(row?.담당노선구분 || String(row?.이전출처 || "").split("!")[0] || "").trim();
const LS = (uid) => `kpRouteGroup:${uid || "me"}`;
const readSel = (uid) => { try { const v = JSON.parse(localStorage.getItem(LS(uid)) || "null"); return v === "all" || v === "mine" || Array.isArray(v) ? v : null; } catch { return null; } };

// sel: "all" | "mine" | [묶음…]
export function useRouteGroupFilter({ enabled, uid, profile }) {
  const mine = React.useMemo(() => (Array.isArray(profile?.routeGroups) ? profile.routeGroups.filter(Boolean) : []), [profile?.routeGroups]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selRaw, setSelRaw] = React.useState(() => readSel(uid));
  React.useEffect(() => { setSelRaw(readSel(uid)); }, [uid]);
  const sel = selRaw ?? (mine.length ? "mine" : "all");
  const setSel = React.useCallback((v) => { setSelRaw(v); try { localStorage.setItem(LS(uid), JSON.stringify(v)); } catch { /* 무시 */ } }, [uid]);
  const active = !enabled || sel === "all" ? null : sel === "mine" ? (mine.length ? mine : null) : (sel.length ? sel : null);
  const key = active ? active.join("\u0001") : "";
  const filter = React.useCallback((rows) => {
    if (!active || !Array.isArray(rows)) return rows;
    const set = new Set(active);
    return rows.filter((r) => set.has(routeGroupOf(r) || RG_NONE));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveMine = React.useCallback((list) => (uid ? setDoc(doc(db, "users", uid), { routeGroups: list }, { merge: true }) : Promise.resolve()), [uid]);
  return { enabled: !!enabled, sel, setSel, mine, saveMine, filter, active };
}

const chip = (on, extra = "") => `h-8 px-3 rounded-lg border text-[13px] font-black whitespace-nowrap ${on ? "border-[#1B2B4B] bg-[#1B2B4B] text-white" : "border-[#DCE3EE] bg-white text-[#3A4A66] hover:border-[#9FB3D9]"} ${extra}`;

// 화면 위 버튼 줄 — rows: 거르기 전 오더(묶음 이름 · 건수용)
export function RouteGroupBar({ rg, rows = [], role, userCompany, dark = false }) {
  const opt = useCompanyOptionList("담당노선구분", role, userCompany);
  const [edit, setEdit] = React.useState(false);
  const [draft, setDraft] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const counts = React.useMemo(() => { const m = new Map(); (rows || []).forEach((r) => { const g = routeGroupOf(r) || RG_NONE; m.set(g, (m.get(g) || 0) + 1); }); return m; }, [rows]);
  const groups = React.useMemo(() => { const out = []; const seen = new Set(); [...(opt.customized ? opt.list : []), ...[...counts.keys()].filter((g) => g !== RG_NONE).sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0)), ...rg.mine].forEach((g) => { if (g && g !== RG_NONE && !seen.has(g)) { seen.add(g); out.push(g); } }); if (counts.has(RG_NONE)) out.push(RG_NONE); return out; }, [opt.list, opt.customized, counts, rg.mine]);
  if (!rg.enabled) return null;
  const picked = Array.isArray(rg.sel) ? rg.sel : [];
  const toggle = (g) => {
    if (edit) return setDraft((d) => (d.includes(g) ? d.filter((x) => x !== g) : [...d, g]));
    const next = picked.includes(g) ? picked.filter((x) => x !== g) : [...picked, g];
    rg.setSel(next.length ? next : "all");
  };
  const onOf = (g) => (edit ? draft.includes(g) : rg.sel === "mine" ? rg.mine.includes(g) : picked.includes(g));
  return (
    <div data-kp="route-group-bar" className={`mb-2 rounded-xl border px-3 py-2 flex items-center gap-1.5 flex-wrap ${dark ? "border-gray-700 bg-gray-900" : "border-[#E3E8F0] bg-white"}`}>
      <span className="text-[11px] font-extrabold tracking-[0.16em] text-[#94A3B8] mr-1 whitespace-nowrap">담당노선구분</span>
      {!edit && <>
        <button type="button" className={chip(rg.sel === "all")} onClick={() => rg.setSel("all")}>전체</button>
        <button type="button" className={chip(rg.sel === "mine", rg.mine.length ? "" : "opacity-60")} title={rg.mine.length ? rg.mine.join(" · ") : "오른쪽 [내 담당 설정]에서 먼저 정해 주세요"} onClick={() => (rg.mine.length ? rg.setSel("mine") : (setDraft([]), setEdit(true)))}>내 담당{rg.mine.length ? ` ${rg.mine.length}` : ""}</button>
        <span className="w-px h-5 bg-[#E3E8F0] mx-1" />
      </>}
      {edit && <span className="text-[13px] font-black text-[#1B2B4B] mr-1">내가 맡은 묶음을 고르세요</span>}
      {groups.map((g) => (
        <button key={g} type="button" aria-pressed={onOf(g)} className={chip(onOf(g))} onClick={() => toggle(g)}>{g}{counts.get(g) ? <span className="ml-1.5 font-bold opacity-60 tabular-nums">{counts.get(g).toLocaleString()}</span> : null}</button>))}
      {groups.length === 0 && <span className="text-[13px] text-[#7A879C]">아직 구분된 오더가 없습니다(구글시트에서 가져오면 탭 이름으로 나뉩니다)</span>}
      <span className="ml-auto flex items-center gap-1.5">
        {edit ? <>
          <button type="button" disabled={busy} className="h-8 px-3 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-black" onClick={async () => { setBusy(true); try { await rg.saveMine(draft); rg.setSel(draft.length ? "mine" : "all"); setEdit(false); } catch { /* 권한 등 */ } finally { setBusy(false); } }}>{busy ? "저장 중…" : "저장"}</button>
          <button type="button" className="h-8 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[13px] font-bold text-[#5B6B85]" onClick={() => setEdit(false)}>취소</button>
        </> : <button type="button" className="h-8 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-bold text-[#5B6B85]" onClick={() => { setDraft(rg.mine); setEdit(true); }}>내 담당 설정</button>}
      </span>
    </div>
  );
}

// 오더 복사 · 수정 패널의 담당노선구분 칸 — 켠 운송사에서만 보인다. Field = 그 패널의 칸 틀(label 을 받는 컴포넌트)
export function RouteGroupField({ Field, row, onChange, className = "", role, userCompany }) {
  const on = useCompanyFeatures(userCompany).routeGroups === true;
  if (!on) return null;
  const el = <CompanyOptionPicker optKey="담당노선구분" placeholder="미지정" noneLabel="미지정" className={className} value={routeGroupOf(row)} role={role} userCompany={userCompany} onChange={onChange} />;
  return Field ? <Field label="담당노선구분">{el}</Field> : el;
}
