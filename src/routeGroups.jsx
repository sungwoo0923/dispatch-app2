// ======================= src/routeGroups.jsx =======================
// 🗂 2026-11-13 담당노선구분 — 거래처는 같아도(녹수) 시트 탭처럼 나눠 보는 묶음(녹수 · 아산 KDF · 보령 KDF …)
//  · 켜기: 관리센터 › 운송사 기능 "담당노선구분"(companyFeatures.routeGroups) — 지금은 JY로지스틱스용
//  · 값: 오더의 `담당노선구분` 칸. 구글시트에서 가져온 오더는 칸이 없어도 가져온 탭 이름(이전출처 "탭!줄")을 쓴다
//  · 화면 위 버튼 줄은 배차(배차관리 · 실시간 · 배차현황) · 정산 · 매출에서만 보이고, 그 화면에서만 고른 묶음으로 거른다(RG_SCREENS)
//  · 내 담당: 직원마다 맡은 묶음(users/{uid}.routeGroups — 본인이 정함). 정해 두면 로그인했을 때 내 담당만 먼저 보인다. [전체]는 누구나 볼 수 있다
import React from "react";
import { doc, setDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { routeGroupOf } from "../functions/routeOwnerCore.mjs"; // ⭐ 2026-11-17 서버와 같은 기준(담당노선 주인 — functions/routeOwnerCore.mjs)
import { planRouteOwners, applyOwnerToOrders, saveRouteOwnerMap, watchRouteOwners } from "./routeOwnerApply";
import { kpConfirm } from "./kpDialog";
import { isViewerNow } from "./blind";
import { useCompanyOptionList, useSheetLiveStatus } from "./companyDropdownOptions";
import { useCompanyFeatures } from "./companyFeatures";
import { CompanyOptionPicker } from "./companyOptionPicker";

export const RG_NONE = "(미지정)";
// 🗂 2026-11-14 담당노선구분이 없는 오더(구글시트와 이어지지 않은, 프로그램에서 직접 등록한 오더)의 탭 이름 — 화면에는 "일반오더"로 보인다(저장되는 값은 그대로)
export const rgLabel = (g) => (g === RG_NONE ? "일반오더" : g);
// 들어갈 때마다 [전체]부터 보는 화면 — 여기서 고른 탭은 그 화면에 있는 동안만 쓰고, 다른 화면의 선택(내 담당 등)은 그대로 둔다
const RG_ALL_FIRST = ["매출관리", "정산관리"];
// 🗂 2026-11-14 탭 줄이 보이고 거르는 화면 — 배차 · 정산 · 매출에서만. 다른 화면(기사관리 · 지입차관리 · 홈 …)은 탭 없이 전체 오더
export const RG_SCREENS = ["실시간배차현황", "배차현황", "정산관리", "매출관리"]; // 🛠 2026-11-14 오더등록(배차관리)에서는 탭 줄을 보이지 않는다(사용자 요청)
export const rgOnScreen = (sc) => RG_SCREENS.includes(String(sc || ""));
export { routeGroupOf };
const LS = (uid) => `kpRouteGroup:${uid || "me"}`;
const readSel = (uid) => { try { const v = JSON.parse(localStorage.getItem(LS(uid)) || "null"); return v === "all" || v === "mine" || Array.isArray(v) ? v : null; } catch { return null; } };

// sel: "all" | "mine" | [묶음…]
export function useRouteGroupFilter({ enabled, uid, profile, company = "" }) {
  const mine = React.useMemo(() => (Array.isArray(profile?.routeGroups) ? profile.routeGroups.filter(Boolean) : []), [profile?.routeGroups]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selRaw, setSelRaw] = React.useState(() => readSel(uid));
  React.useEffect(() => { setSelRaw(readSel(uid)); }, [uid]);
  // 지금 보는 화면(setScreen 으로 알려 준다) — 매출관리는 들어갈 때마다 [전체]
  const [screen, setScreenRaw] = React.useState("");
  const [tmpSel, setTmpSel] = React.useState("all");
  const setScreen = React.useCallback((sc) => { setScreenRaw(String(sc || "")); setTmpSel("all"); }, []);
  const allFirst = RG_ALL_FIRST.includes(screen);
  const sel = allFirst ? tmpSel : (selRaw ?? (mine.length ? "mine" : "all"));
  const setSel = React.useCallback((v) => { if (allFirst) return setTmpSel(v); setSelRaw(v); try { localStorage.setItem(LS(uid), JSON.stringify(v)); } catch { /* 무시 */ } }, [uid, allFirst]);
  const active = !enabled || !rgOnScreen(screen) || sel === "all" ? null : sel === "mine" ? (mine.length ? mine : null) : (sel.length ? sel : null);
  const key = active ? active.join("\u0001") : "";
  const filter = React.useCallback((rows) => {
    if (!active || !Array.isArray(rows)) return rows;
    const set = new Set(active);
    return rows.filter((r) => set.has(routeGroupOf(r) || RG_NONE));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveMine = React.useCallback((list) => (uid ? setDoc(doc(db, "users", uid), { routeGroups: list }, { merge: true }) : Promise.resolve()), [uid]);
  // ⭐ 2026-11-17 담당노선 주인 — 저장할 때 오더 배차담당자를 바꾸는 데 쓰는 "나"(이름 · 이메일) · 회사 노선 주인표 구독(새 오더 자동 지정)
  const me = React.useMemo(() => ({ uid: uid || "", name: String(profile?.name || "").trim(), email: String(profile?.email || auth.currentUser?.email || "").trim().toLowerCase() }), [uid, profile?.name, profile?.email]); // eslint-disable-line react-hooks/exhaustive-deps
  const co = String(company || "").trim();
  React.useEffect(() => { if (enabled && co) watchRouteOwners(co); }, [enabled, co]);
  return { enabled: !!enabled, sel, setSel, mine, saveMine, filter, active, setScreen, me, company: co };
}

// ── ⭐ 2026-11-17 내 담당 저장 + 그 노선 오더의 배차담당자 바꾸기 ─────────────────────────────
//  ① 저장한 노선의 오더를 찾아(화면이 가진 오더 + 서버) 몇 건 바뀌는지 · 최종마감이라 그대로 두는 건 몇 건인지 묻는다
//     [바꾸기] → 내 담당 저장 + 회사 노선 주인표(앞으로 새 오더도 나로) + 오더 배차담당자 바꾸기(400건씩)
//     [담당만 저장] → 내 담당만 저장(오더 · 다른 직원이 맡은 노선은 그대로). 뺀 노선은 어느 쪽이든 노선 주인표에서 나를 지운다(오더는 그대로)
//  ② 조회전용 계정 · 이름을 모르는 계정은 내 담당만 저장한다
//  setNote({ text, tone, busy }) — 화면 아래 알림(진행 · 결과)
const groupsLabel = (gs) => gs.map(rgLabel).join(" · ");
const eul = (name) => { const v = String(name || ""); const c = v.charCodeAt(v.length - 1); const j = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 : 0; return j && j !== 8 ? "으로" : "로"; };
export async function saveMineWithOwners({ rg, list, rows = [], role, setNote = () => {} }) {
  const me = rg.me || {};
  const canWrite = role !== "viewer" && !isViewerNow() && !!me.uid && !!me.name && !!rg.company;
  if (!canWrite) { await rg.saveMine(list); setNote({ text: "내 담당을 저장했어요", tone: "ok" }); return; }
  setNote({ text: "맡은 노선의 오더를 찾고 있어요…", busy: true });
  let plan = null;
  try { plan = await planRouteOwners({ company: rg.company, me, list, rows }); } catch (e) { console.warn("담당노선 오더 찾기 실패", e); }
  const change = plan?.targets?.change || [];
  const lockedN = plan?.targets?.locked?.length || 0;
  const taken = plan?.merge?.taken || [];
  let doIt = false;
  if (plan && (change.length || taken.length)) {
    setNote(null);
    const nm = me.name;
    const lines = [];
    lines.push(change.length
      ? `${groupsLabel(plan.groups)} 오더 ${change.length.toLocaleString()}건의 배차담당자를 ${nm}${eul(nm)} 바꿀까요?${lockedN ? ` (최종마감된 오더 ${lockedN.toLocaleString()}건은 그대로)` : ""}`
      : `${groupsLabel(plan.groups)} 노선을 ${nm} 담당으로 정할까요?`);
    taken.forEach((x) => lines.push(`${rgLabel(x.group)}은(는) 지금 ${x.from.name || "다른 직원"} 담당이에요. 바꾸면 ${nm} 담당으로 넘어가요.`));
    lines.push(`앞으로 이 노선에 새로 들어오는 오더도 배차담당자가 비어 있으면 ${nm}${eul(nm)} 정해져요.`);
    if (!plan.closesOk) lines.push("최종마감 기록을 읽지 못해 지금 있는 오더는 바꾸지 않아요.");
    else if (!plan.serverOk) lines.push("일부 오더는 서버에서 찾지 못해, 화면에 불러온 오더만 셌어요.");
    lines.push("[담당만 저장]을 누르면 오더는 그대로 두고 내 담당만 저장해요.");
    doIt = await kpConfirm(lines.join("\n"), { title: "배차담당자 바꾸기", okText: "바꾸기", cancelText: "담당만 저장" });
  }
  await rg.saveMine(list);
  // 노선 주인표 — [바꾸기]를 눌렀거나 물을 것이 없었으면 맡은 노선을 나로, [담당만 저장]이면 뺀 노선만 지운다
  let mapErr = false;
  try { await saveRouteOwnerMap(rg.company, me, list, { claim: !!plan && (doIt || (!change.length && !taken.length)) }); } catch (e) { mapErr = true; console.warn("담당노선 주인 저장 실패", e); }
  if (!doIt || !change.length) {
    const why = mapErr ? " · 노선 담당자 표는 저장하지 못했어요" : plan && !plan.closesOk ? " · 최종마감 기록을 읽지 못해 오더는 바꾸지 않았어요" : !plan ? " · 오더를 찾지 못해 배차담당자는 그대로예요" : "";
    setNote({ text: `내 담당을 저장했어요${why}`, tone: why ? "warn" : "ok" }); return;
  }
  setNote({ text: `배차담당자 바꾸는 중 0 / ${change.length.toLocaleString()}`, busy: true });
  const res = await applyOwnerToOrders(change, me, { onProgress: ({ done, total }) => setNote({ text: `배차담당자 바꾸는 중 ${done.toLocaleString()} / ${total.toLocaleString()}`, busy: true }) });
  setNote({
    text: `${res.done.toLocaleString()}건의 배차담당자를 ${me.name}${eul(me.name)} 바꿨어요${lockedN ? ` · 최종마감 ${lockedN.toLocaleString()}건은 그대로` : ""}${res.failed ? ` · ${res.failed.toLocaleString()}건은 못 바꿨어요` : ""}`,
    tone: res.failed ? "warn" : "ok",
  });
}
// 화면 아래 알림(진행 · 결과) — 결과는 6초 뒤 사라진다
function OwnerNote({ note, onClose }) {
  React.useEffect(() => { if (!note || note.busy) return undefined; const t = setTimeout(onClose, 6000); return () => clearTimeout(t); }, [note]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!note) return null;
  const bad = note.tone === "warn";
  return (
    <div role="status" data-kp="route-owner-note" className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[2147482500] max-w-[92vw]">
      <div className={`flex items-center gap-2.5 px-4 h-12 rounded-2xl shadow-[0_16px_40px_rgba(11,20,40,0.3)] text-[14px] font-black text-white ${bad ? "bg-[#7A2A22]" : "bg-[#0F1A30]"}`}>
        {note.busy ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <span className={`w-2 h-2 rounded-full ${bad ? "bg-[#F3B6AE]" : "bg-[#7FD1A8]"}`} />}
        <span className="truncate">{note.text}</span>
        {!note.busy && <button type="button" onClick={onClose} className="ml-1 text-white/60 hover:text-white text-[13px] font-bold">닫기</button>}
      </div>
    </div>
  );
}

// 화면 위 탭 줄(B안 · 구글시트 탭 모양) — rows: 거르기 전 오더(묶음 이름 · 건수용)
//  · 탭을 누르면 그 묶음만 · Ctrl(⌘)+누르면 여러 개를 같이 · [내 담당] [전체]는 맨 앞에 고정
//  · [내 담당 설정]을 누르면 탭이 체크 모드로 바뀌어 맡은 묶음을 고르고 저장한다
const tabCls = (on, dark) => `relative shrink-0 h-10 px-3.5 flex items-center gap-1.5 text-[14px] whitespace-nowrap rounded-t-lg border border-b-0 -mb-px transition-colors ${on
  ? (dark ? "bg-gray-900 border-gray-600 text-white font-black" : "bg-white border-[#DCE3EE] text-[#0F1A30] font-black")
  : (dark ? "border-transparent text-gray-400 font-bold hover:text-gray-200" : "border-transparent text-[#7A879C] font-bold hover:text-[#1B2B4B] hover:bg-white/60")}`;
export function RouteGroupBar({ rg, rows = [], role, userCompany, dark = false }) {
  const opt = useCompanyOptionList("담당노선구분", role, userCompany);
  const [edit, setEdit] = React.useState(false);
  const [draft, setDraft] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState(null); // ⭐ 2026-11-17 배차담당자 바꾸기 진행 · 결과
  const counts = React.useMemo(() => { const m = new Map(); (rows || []).forEach((r) => { const g = routeGroupOf(r) || RG_NONE; m.set(g, (m.get(g) || 0) + 1); }); return m; }, [rows]);
  const groups = React.useMemo(() => { const out = []; const seen = new Set(); [...(opt.customized ? opt.list : []), ...[...counts.keys()].filter((g) => g !== RG_NONE).sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0)), ...rg.mine].forEach((g) => { if (g && g !== RG_NONE && !seen.has(g)) { seen.add(g); out.push(g); } }); if (counts.has(RG_NONE)) out.push(RG_NONE); return out; }, [opt.list, opt.customized, counts, rg.mine]);
  if (!rg.enabled) return null;
  const save = async () => {
    setBusy(true);
    try { await saveMineWithOwners({ rg, list: draft, rows, role, setNote }); rg.setSel(draft.length ? "mine" : "all"); setEdit(false); }
    catch (e) { console.warn("내 담당 저장 실패", e); setNote({ text: "저장하지 못했어요. 잠시 뒤 다시 해 주세요", tone: "warn" }); }
    finally { setBusy(false); }
  };
  const picked = Array.isArray(rg.sel) ? rg.sel : [];
  const onPick = (g, e) => {
    if (edit) return setDraft((d) => (d.includes(g) ? d.filter((x) => x !== g) : [...d, g]));
    if (e && (e.ctrlKey || e.metaKey || e.shiftKey)) { const base = rg.sel === "mine" ? rg.mine : picked; const next = base.includes(g) ? base.filter((x) => x !== g) : [...base, g]; return rg.setSel(next.length ? next : "all"); }
    rg.setSel(picked.length === 1 && picked[0] === g ? "all" : [g]);
  };
  const onOf = (g) => (edit ? draft.includes(g) : rg.sel === "mine" ? rg.mine.includes(g) : picked.includes(g));
  const total = (rows || []).length;
  const mineN = rg.mine.reduce((a, g) => a + (counts.get(g) || 0), 0);
  const num = (n) => <span className={`text-[12px] tabular-nums ${dark ? "text-gray-500" : "text-[#A9B6CC]"} font-bold`}>{Number(n || 0).toLocaleString()}</span>;
  const bar = (on) => (on ? <span className="absolute left-2 right-2 top-0 h-[3px] rounded-b bg-[#1B2B4B]" /> : null);
  return (
    <div data-kp="route-group-bar" className={`mb-2 flex items-end gap-2 border-b ${dark ? "border-gray-600" : "border-[#DCE3EE]"}`}>
      <div className="flex items-end gap-0.5 min-w-0 overflow-x-auto" style={{ scrollbarWidth: "thin" }} title="탭을 누르면 그 노선만 · Ctrl+누르면 여러 개를 같이 봅니다">
        {!edit && <>
          <button type="button" className={tabCls(rg.sel === "mine", dark)} title={rg.mine.length ? rg.mine.map(rgLabel).join(" · ") : "오른쪽 [내 담당 설정]에서 먼저 정해 주세요"} onClick={() => (rg.mine.length ? rg.setSel("mine") : (setDraft([]), setEdit(true)))}>{bar(rg.sel === "mine")}<span className={rg.sel === "mine" ? "" : "text-[#2D4C82]"}>내 담당</span>{rg.mine.length ? num(mineN) : null}</button>
          <button type="button" className={tabCls(rg.sel === "all", dark)} onClick={() => rg.setSel("all")}>{bar(rg.sel === "all")}전체{num(total)}</button>
          <span className={`shrink-0 w-px h-5 mb-2.5 mx-1 ${dark ? "bg-gray-600" : "bg-[#DCE3EE]"}`} />
        </>}
        {edit && <span className="shrink-0 h-10 flex items-center pr-2 text-[13.5px] font-black text-[#1B2B4B]">내가 맡은 노선을 고르세요</span>}
        {groups.map((g) => { const on = onOf(g); return (
          <button key={g} type="button" aria-pressed={on} className={tabCls(on, dark)} onClick={(e) => onPick(g, e)}>
            {bar(on && !edit)}
            {edit && <span className={`w-4 h-4 rounded border-2 grid place-items-center ${on ? "bg-[#1B2B4B] border-[#1B2B4B]" : "border-[#C9D5EA] bg-white"}`}>{on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}</span>}
            {rgLabel(g)}{num(counts.get(g))}
          </button>); })}
        {groups.length === 0 && <span className="h-10 flex items-center px-2 text-[13px] text-[#7A879C]">아직 구분된 오더가 없습니다(구글시트에서 가져오면 탭 이름으로, 직접 등록한 오더는 일반오더로 나뉩니다)</span>}
      </div>
      <span className="ml-auto shrink-0 flex items-center gap-1.5 pb-1.5">
        {!edit && <SheetLiveChip role={role} userCompany={userCompany} />}
        {edit ? <>
          <button type="button" disabled={busy} className="h-8 px-3 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-black" onClick={save}>{busy ? "저장 중…" : "저장"}</button>
          <button type="button" className="h-8 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[13px] font-bold text-[#5B6B85]" onClick={() => setEdit(false)}>취소</button>
        </> : <button type="button" className="h-8 px-2.5 rounded-lg text-[12.5px] font-bold text-[#7A879C] hover:text-[#1B2B4B] hover:bg-white" onClick={() => { setDraft(rg.mine); setEdit(true); }}>내 담당 설정</button>}
      </span>
      <OwnerNote note={note} onClose={() => setNote(null)} />
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

// ── 📡 구글시트 실시간 반영 표시 — "구글시트 실시간 · 3분 전 반영" ─────────────────────────
//  켜져 있을 때만 보인다. 15분 넘게 확인 기록이 없으면 "확인 지연"(서버가 10분마다 한 번은 확인 시각을 적는다)
const agoK = (ms, now) => { if (!ms) return ""; const s = Math.max(0, Math.round((now - ms) / 1000)); return s < 90 ? "방금" : s < 3600 ? `${Math.floor(s / 60)}분 전` : s < 86400 ? `${Math.floor(s / 3600)}시간 전` : `${Math.floor(s / 86400)}일 전`; };
export function SheetLiveChip({ role, userCompany, compact = false }) {
  const st = useSheetLiveStatus(role, userCompany);
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => { if (!st?.enabled) return undefined; const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, [st?.enabled]);
  if (!st?.enabled) return null;
  const late = now - (st.checkedAt || 0) > 15 * 60 * 1000;
  const bad = !!st.error || late;
  // 🛠 2026-11-14 "14시간 전 반영"이 확인이 멈춘 것처럼 보였다 — 실제로는 마지막으로 바뀐 것이 있던 시각. 확인 시각을 앞에 같이 보여 준다
  const main = st.error ? st.error : late ? `확인 지연 · 마지막 확인 ${agoK(st.checkedAt, now)}` : `${agoK(st.checkedAt, now)} 확인${st.changedAt ? ` · 마지막 변경 ${agoK(st.changedAt, now)}` : ""}`;
  const detail = !bad && st.changedAt ? [st.created ? `새 ${st.created}` : "", st.updated ? `고침 ${st.updated}` : "", st.removed ? `삭제 ${st.removed}` : ""].filter(Boolean).join(" · ") : "";
  return (
    <span data-kp="sheet-live-chip" title={`구글시트 실시간 반영 — 시트 · 프로그램이 바뀌면 바로 반영합니다${st.checkedAt ? `\n마지막 확인 ${new Date(st.checkedAt).toLocaleString("ko-KR", { hour12: false })}` : ""}${st.heldBack ? `\n시트에 없는 오더 ${st.heldBack}건은 너무 많아 지우지 않았습니다` : ""}`}
      className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[12.5px] font-bold whitespace-nowrap ${bad ? "border-[#E7B7B0] text-[#B4342A] bg-white" : "border-[#DCE3EE] text-[#3A4A66] bg-white"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${bad ? "bg-[#B4342A]" : "bg-[#1F7A4D]"}`} />
      {!compact && <span className="text-[#94A3B8] font-extrabold tracking-[0.08em]">구글시트</span>}
      <span>{main}</span>
      {/* 🛠 2026-11-14 프로그램에서 배차 · 수정해도 시트에 안 써질 때 이유가 보이게 — 관리센터 › 데이터 › 구글시트 연동 › 프로그램 → 시트 반영 */}
      {st.pushMode && st.pushMode !== "on" && <span className="text-[#B26A00] font-black" title="프로그램에서 등록 · 수정 · 배차한 내용을 시트에 쓰지 않는 상태입니다. 관리센터 › 데이터 › 구글시트 연동 › 프로그램 → 시트 반영에서 [켜기]를 눌러 주세요.">· {st.pushMode === "dry" ? "시트 쓰기 점검만" : "시트 쓰기 꺼짐"}</span>}
      {detail && !compact && <span className="text-[#94A3B8] tabular-nums">{detail}</span>}
      {/* 🔁 2026-11-14 프로그램 → 시트 반영: 어느 탭에 넣을지 못 정한 오더(담당노선구분을 고르면 들어간다) · 확인이 필요한 건(보류 · 못 씀 — 관리센터에서 처리) */}
      {st.needTab > 0 && <span className="text-[#B26A00] font-black" title="프로그램에서 등록했는데 시트의 어느 탭에 넣을지 정하지 못한 오더입니다. 그 오더의 담당노선구분을 고르면 곧바로 그 탭에 들어갑니다.">· 시트 탭 미정 {st.needTab}건</span>}
      {st.pushIssue > 0 && !compact && <span className="text-[#B4342A] font-black" title="시트에 쓰지 못했거나 보류한 건이 있습니다. 관리센터 › 데이터 › 구글시트 연동 › 프로그램 → 시트 반영에서 확인해 주세요.">· 시트 반영 확인 {st.pushIssue}건</span>}
    </span>
  );
}

// ── 📱 모바일: 담당노선구분 고르기(여러 개) — 버튼 하나 + 아래에서 올라오는 목록 ─────────────────
export function RouteGroupDropdown({ rg, rows = [], role, userCompany, right = null }) {
  const opt = useCompanyOptionList("담당노선구분", role, userCompany);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState([]);
  const [note, setNote] = React.useState(null); // ⭐ 2026-11-17 배차담당자 바꾸기 진행 · 결과
  const [busy, setBusy] = React.useState(false);
  const counts = React.useMemo(() => { const m = new Map(); (rows || []).forEach((r) => { const g = routeGroupOf(r) || RG_NONE; m.set(g, (m.get(g) || 0) + 1); }); return m; }, [rows]);
  const groups = React.useMemo(() => { const out = []; const seen = new Set(); [...(opt.customized ? opt.list : []), ...[...counts.keys()].filter((g) => g !== RG_NONE).sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0)), ...rg.mine].forEach((g) => { if (g && g !== RG_NONE && !seen.has(g)) { seen.add(g); out.push(g); } }); if (counts.has(RG_NONE)) out.push(RG_NONE); return out; }, [opt.list, opt.customized, counts, rg.mine]);
  if (!rg.enabled) return right ? <div className="px-3 pt-2 flex justify-end">{right}</div> : null;
  const cur = rg.sel === "all" ? [] : rg.sel === "mine" ? rg.mine : rg.sel;
  const label = rg.sel === "all" || !cur.length ? "전체" : rg.sel === "mine" ? `내 담당 ${cur.length}` : cur.length === 1 ? rgLabel(cur[0]) : `${rgLabel(cur[0])} 외 ${cur.length - 1}`;
  const openIt = () => { setDraft(cur); setOpen(true); };
  const toggle = (g) => setDraft((d) => (d.includes(g) ? d.filter((x) => x !== g) : [...d, g]));
  const apply = () => { const same = draft.length && draft.length === rg.mine.length && draft.every((g) => rg.mine.includes(g)); rg.setSel(!draft.length ? "all" : same ? "mine" : draft); setOpen(false); };
  return (
    <div className="px-3 pt-2 flex items-center gap-2" data-kp="route-group-dd">
      <button type="button" onClick={openIt} className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-[#DCE3EE] bg-white flex items-center gap-2 text-left">
        <span className="text-[11px] font-extrabold tracking-[0.1em] text-[#94A3B8] whitespace-nowrap">담당노선</span>
        <span className="flex-1 min-w-0 truncate text-[15px] font-black text-[#0F1A30]">{label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5B6B85" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {right}
      {open && (
        <div className="fixed inset-0 z-[9998] flex items-end" style={{ background: "rgba(11,20,40,.45)" }} onClick={() => setOpen(false)}>
          <div className="w-full bg-white rounded-t-2xl pb-6 pt-3 max-h-[78vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pb-2 flex items-center justify-between">
              <div><div className="text-[10.5px] font-extrabold tracking-[0.2em] text-[#94A3B8]">ROUTE GROUP</div><div className="text-[18px] font-black text-[#0F1A30]">담당노선구분</div></div>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setDraft([])} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-black text-[#3A4A66]">전체</button>
                <button type="button" disabled={!rg.mine.length} onClick={() => setDraft(rg.mine)} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-black text-[#3A4A66] disabled:opacity-40">내 담당</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3">
              {groups.length === 0 && <div className="py-10 text-center text-[14px] text-[#7A879C]">아직 구분된 오더가 없습니다</div>}
              {groups.map((g) => { const on = draft.includes(g); return (
                <button key={g} type="button" onClick={() => toggle(g)} className="w-full min-h-[52px] px-3 flex items-center gap-3 border-b border-[#EEF1F6] text-left">
                  <span className={`w-6 h-6 rounded-md border-2 grid place-items-center shrink-0 ${on ? "bg-[#1B2B4B] border-[#1B2B4B]" : "border-[#C9D5EA] bg-white"}`}>{on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}</span>
                  <span className="flex-1 min-w-0 truncate text-[16px] font-bold text-[#0F1A30]">{rgLabel(g)}</span>
                  <span className="text-[13.5px] font-bold text-[#94A3B8] tabular-nums">{(counts.get(g) || 0).toLocaleString()}</span>
                </button>); })}
            </div>
            <div className="px-4 pt-3 flex gap-2">
              <button type="button" disabled={!draft.length || busy} onClick={async () => { const list = draft; setBusy(true); setOpen(false); try { await saveMineWithOwners({ rg, list, rows, role, setNote }); } catch { setNote({ text: "저장하지 못했어요. 잠시 뒤 다시 해 주세요", tone: "warn" }); } finally { setBusy(false); } rg.setSel("mine"); }} className="h-12 px-4 rounded-xl border border-[#C9D5EA] text-[14px] font-black text-[#1B2B4B] disabled:opacity-40">내 담당으로 저장</button>
              <button type="button" onClick={apply} className="flex-1 h-12 rounded-xl bg-[#1B2B4B] text-white text-[15.5px] font-black">{draft.length ? `${draft.length}개 보기` : "전체 보기"}</button>
            </div>
          </div>
        </div>
      )}
      <OwnerNote note={note} onClose={() => setNote(null)} />
    </div>
  );
}

// ── 🗂 2026-11-17 탭 줄 없이 "화면 안에서" 고르는 노선구분(월 마감 · 인수증관리) ─────────────────
//  배차현황의 월 마감 · 인수증관리 · 고정노선현황에서는 위 탭 줄을 숨기고(사용자 요청), 필요한 화면은 이 드롭다운으로 거른다
export const RG_TAB_OFF = ["월마감", "인수증관리", "고정노선현황"];
export const filterRouteGroup = (rows, g) => (!g || g === "all" || !Array.isArray(rows) ? rows : rows.filter((r) => (routeGroupOf(r) || RG_NONE) === g));
export function RouteGroupSelect({ rows = [], value = "all", onChange, enabled = true }) {
  const counts = React.useMemo(() => { const m = new Map(); (rows || []).forEach((r) => { const g = routeGroupOf(r) || RG_NONE; m.set(g, (m.get(g) || 0) + 1); }); return m; }, [rows]);
  const groups = React.useMemo(() => [...counts.keys()].sort((a, b) => (a === RG_NONE) - (b === RG_NONE) || (counts.get(b) || 0) - (counts.get(a) || 0)), [counts]);
  if (!enabled || groups.length < 2) return null;
  return (
    <label data-kp="route-group-select" className="inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-[#D5DDEA] bg-white text-[14px] font-bold text-[#1B2B4B]">
      <span className="text-[12px] font-black tracking-wide text-[#7A879C]">노선구분</span>
      <select value={groups.includes(value) ? value : "all"} onChange={(e) => onChange?.(e.target.value)} className="bg-transparent outline-none text-[14px] font-black text-[#0F1A30] cursor-pointer">
        <option value="all">전체 ({(rows || []).length.toLocaleString()})</option>
        {groups.map((g) => <option key={g} value={g}>{rgLabel(g)} ({(counts.get(g) || 0).toLocaleString()})</option>)}
      </select>
    </label>
  );
}
