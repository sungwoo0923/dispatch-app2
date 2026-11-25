// ======================= src/adminCenter/PrivateFareAdmin.jsx =======================
// 🔐 2026-11-18 관리자센터 › 계정 · 보안 › 권한 · 계정 › 비공개 운임 — 최고관리자가 운송사 · 사람을 골라 비공개 운임을 켜고 끈다(사용자 요청)
//  · 켜면 그 사람의 임원 화면(PC · 휴대폰)에 [비공개 운임] 메뉴가 생긴다 → 들어갈 때 비밀번호(처음엔 그 사람이 직접 정함)
//  · 최고관리자는 지정 · 끄기 · 비밀번호 초기화 · 지정 해제만 — 그 사람이 정한 금액은 최고관리자도 볼 수 없다(firestore.rules)
//  · 저장: privateFareGrants/{uid} = { uid, companyName, name, team, position, on, grantedBy, grantedAt, lastOpenedAt(서버) }
import React from "react";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { usePlatformLive } from "../PlatformLive";
import { kpConfirm } from "../kpDialog";
import { G, NUM, AdmPanel, AdmBtn, AdmEmpty, AdmKpi, Seg } from "./admUi";

const ROLE_KO = { admin: "관리자", allMgr: "통합관리자", user: "운송사무원", test: "경리관리자", acctStaff: "경리사무원", hrManager: "인사관리자", hrStaff: "인사사무원", hrAcct: "통합인사관리자", salesMgr: "영업관리자", salesStaff: "영업사무원", viewer: "조회전용" };
const EXEC_RE = /임원/;
const EXEC_POS = /대표|사장|전무|상무|이사|실장|본부장/;
const ago = (ms) => { if (!ms) return "아직 안 열어 봄"; const m = Math.floor((Date.now() - ms) / 60000); if (m < 1) return "방금"; if (m < 60) return `${m}분 전`; const h = Math.floor(m / 60); if (h < 24) return `${h}시간 전`; return `${Math.floor(h / 24)}일 전`; };
const tsMs = (v) => (v?.toMillis ? v.toMillis() : typeof v === "number" ? v : 0);

function useGrants() {
  const [list, setList] = React.useState(null);
  React.useEffect(() => onSnapshot(collection(db, "privateFareGrants"), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([])), []);
  return list;
}

export default function PrivateFareAdmin() {
  const live = usePlatformLive();
  const grants = useGrants();
  const [co, setCo] = React.useState("");
  const [q, setQ] = React.useState("");
  const [onlyExec, setOnlyExec] = React.useState("exec");
  const [busy, setBusy] = React.useState("");
  const companies = React.useMemo(() => Object.values(live?.companies || {}).sort((a, b) => a.name.localeCompare(b.name, "ko")), [live?.companies]);
  const byUid = React.useMemo(() => Object.fromEntries((grants || []).map((g) => [g.id, g])), [grants]);
  const cur = companies.find((c) => c.name === co);
  const staff = React.useMemo(() => {
    const nq = q.trim();
    return (cur?.staffList || []).filter((u) => u.approved && u.role !== "driver" && u.role !== "shipper")
      .filter((u) => onlyExec !== "exec" || EXEC_RE.test(u.team || "") || EXEC_POS.test(u.position || "") || byUid[u.uid])
      .filter((u) => !nq || [u.name, u.email, u.team, u.position].some((v) => String(v || "").includes(nq)))
      .sort((a, b) => (byUid[b.uid] ? 1 : 0) - (byUid[a.uid] ? 1 : 0) || String(a.name).localeCompare(String(b.name), "ko"));
  }, [cur, q, onlyExec, byUid]);
  const onCount = (grants || []).filter((g) => g.on === true).length;

  const grant = async (u, on) => {
    setBusy(u.uid);
    try {
      if (on && !byUid[u.uid] && !(await kpConfirm(`「${co}」 ${u.name}님에게 비공개 운임을 켤까요?\n\n· 그 사람 임원 화면에 [비공개 운임] 메뉴가 생겨요\n· 처음 들어갈 때 본인이 비밀번호(4~8자)를 정해요\n· 그 사람이 정한 금액은 최고관리자도 볼 수 없어요`))) return;
      await setDoc(doc(db, "privateFareGrants", u.uid), { uid: u.uid, companyName: co, name: u.name || "", email: u.email || "", team: u.team || "", position: u.position || "", on, ...(byUid[u.uid] ? {} : { grantedAt: serverTimestamp(), grantedBy: auth.currentUser?.email || "" }), updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) { alert(`저장하지 못했어요: ${e?.message || e}`); } finally { setBusy(""); }
  };
  const toggle = async (g) => {
    setBusy(g.id);
    try { await setDoc(doc(db, "privateFareGrants", g.id), { on: g.on !== true, updatedAt: serverTimestamp() }, { merge: true }); if (g.on === true) await deleteDoc(doc(db, "privateFareUnlocks", g.id)).catch(() => {}); }
    catch (e) { alert(`저장하지 못했어요: ${e?.message || e}`); } finally { setBusy(""); }
  };
  const resetPin = async (g) => {
    if (!(await kpConfirm(`${g.name}님의 비공개 운임 비밀번호를 초기화할까요?\n다음에 들어갈 때 본인이 새 비밀번호를 정해요. 정해 둔 금액은 그대로예요.`))) return;
    setBusy(g.id);
    try { await Promise.all(["privateFarePins", "privateFarePinAttempts", "privateFareUnlocks"].map((c) => deleteDoc(doc(db, c, g.id)).catch(() => {}))); alert("초기화했어요."); }
    finally { setBusy(""); }
  };
  const remove = async (g) => {
    if (!(await kpConfirm(`${g.name}님의 비공개 운임 지정을 해제할까요?\n메뉴가 사라지고 비밀번호도 지워져요. 정해 둔 금액은 남아 있어서, 다시 지정하면 그대로 볼 수 있어요.`))) return;
    setBusy(g.id);
    try { await Promise.all(["privateFarePins", "privateFarePinAttempts", "privateFareUnlocks"].map((c) => deleteDoc(doc(db, c, g.id)).catch(() => {}))); await deleteDoc(doc(db, "privateFareGrants", g.id)); }
    catch (e) { alert(`해제하지 못했어요: ${e?.message || e}`); } finally { setBusy(""); }
  };

  const inp = "h-10 rounded-xl px-3 text-[13.5px] font-bold outline-none";
  const inpSt = { background: "#0A1226", border: `1px solid rgba(215,188,130,.22)`, color: G.ink };
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        <AdmKpi code="ON" label="켜진 사람" value={onCount} unit="명" primary foot="지금 비공개 운임을 쓰는 계정" />
        <AdmKpi code="OFF" label="꺼 둔 사람" value={(grants || []).length - onCount} unit="명" foot="지정은 남아 있고 메뉴만 숨김" />
        <AdmKpi code="CARRIERS" label="쓰는 운송사" value={new Set((grants || []).filter((g) => g.on).map((g) => g.companyName)).size} unit="곳" />
        <AdmKpi code="PRIVACY" label="금액 열람" value="본인만" foot="최고관리자도 금액은 못 봐요" />
      </div>

      <AdmPanel code="ASSIGNED" title="지정된 사람" right={<span className="text-[12.5px] font-bold" style={{ color: G.dim }}>{grants ? `${grants.length}명` : ""}</span>} bodyClass="p-0">
        {grants === null ? <AdmEmpty /> : !grants.length ? <AdmEmpty>아직 지정한 사람이 없어요. 아래에서 운송사를 고르고 사람을 켜 주세요.</AdmEmpty> : (
          <div className="overflow-x-auto"><table className="w-full text-[14px]" style={{ minWidth: 820 }}>
            <thead><tr>{["운송사", "이름", "부서 · 직책", "상태", "마지막으로 연 때", ""].map((h) => <th key={h} className="px-3 py-2.5 text-left font-extrabold whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>{[...grants].sort((a, b) => String(a.companyName).localeCompare(String(b.companyName), "ko") || String(a.name).localeCompare(String(b.name), "ko")).map((g) => (
              <tr key={g.id}>
                <td className="px-3 py-2.5 font-black">{g.companyName}</td>
                <td className="px-3 py-2.5 font-black">{g.name || g.email || g.id.slice(-6)}</td>
                <td className="px-3 py-2.5" style={{ color: G.sub }}>{[g.team, g.position].filter(Boolean).join(" · ") || "-"}</td>
                <td className="px-3 py-2.5">{g.on ? <span className="px-2 py-0.5 rounded-md text-[12px] font-black" style={{ background: "rgba(215,188,130,.16)", color: G.goldHi, border: `1px solid rgba(215,188,130,.4)` }}>켜짐</span> : <span className="px-2 py-0.5 rounded-md text-[12px] font-black" style={{ color: G.dim, border: `1px solid ${G.line}` }}>꺼짐</span>}</td>
                <td className="px-3 py-2.5 whitespace-nowrap" style={{ ...NUM, color: G.dim }}>{ago(tsMs(g.lastOpenedAt))}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <span className="inline-flex gap-1.5">
                    <AdmBtn className="!h-8 !px-3 !text-[12.5px]" disabled={busy === g.id} onClick={() => toggle(g)}>{g.on ? "끄기" : "켜기"}</AdmBtn>
                    <AdmBtn className="!h-8 !px-3 !text-[12.5px]" disabled={busy === g.id} onClick={() => resetPin(g)}>비밀번호 초기화</AdmBtn>
                    <AdmBtn className="!h-8 !px-3 !text-[12.5px]" disabled={busy === g.id} onClick={() => remove(g)}>지정 해제</AdmBtn>
                  </span>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </AdmPanel>

      <AdmPanel code="ASSIGN" title="운송사 · 사람 고르기" right={<Seg size="sm" value={onlyExec} onChange={setOnlyExec} items={[["exec", "임원 · 대표급"], ["all", "전체 직원"]]} />}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select value={co} onChange={(e) => { setCo(e.target.value); setQ(""); }} className={`${inp} w-[240px]`} style={inpSt} data-testid="pf-admin-company">
            <option value="">운송사 고르기</option>
            {companies.map((c) => <option key={c.name} value={c.name}>{c.name} ({(c.staffList || []).length}명)</option>)}
          </select>
          {co && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 부서 · 직책 찾기" className={`${inp} w-[220px]`} style={inpSt} />}
        </div>
        {!co ? <AdmEmpty>운송사를 고르면 그 회사 직원이 보여요</AdmEmpty> : !staff.length ? <AdmEmpty>{onlyExec === "exec" ? "임원 · 대표급 직원이 없어요. [전체 직원]에서 골라 보세요." : "직원이 없어요"}</AdmEmpty> : (
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {staff.map((u) => {
              const g = byUid[u.uid]; const on = g?.on === true;
              return (
                <div key={u.uid} className="rounded-2xl px-3.5 py-3 flex items-center gap-3" style={{ background: on ? "linear-gradient(140deg, rgba(215,188,130,.16), rgba(140,116,66,.06))" : "rgba(255,255,255,.035)", border: `1px solid ${on ? "rgba(215,188,130,.45)" : G.line}` }}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-black truncate" style={{ color: G.ink }}>{u.name}</div>
                    <div className="text-[12px] font-semibold truncate" style={{ color: G.dim }}>{[u.team, u.position, ROLE_KO[u.role] || u.role].filter(Boolean).join(" · ")}</div>
                  </div>
                  <AdmBtn gold={!on} className="!h-9 !px-3 !text-[12.5px] shrink-0" disabled={busy === u.uid} onClick={() => (g ? toggle(g) : grant(u, true))}>{on ? "끄기" : g ? "켜기" : "지정"}</AdmBtn>
                </div>
              );
            })}
          </div>
        )}
      </AdmPanel>
      <div className="text-[12.5px] font-semibold leading-relaxed px-1" style={{ color: G.dim }}>
        켜면 그 사람의 임원 화면(PC · 휴대폰)에 [비공개 운임] 메뉴가 생겨요. 들어갈 때마다 비밀번호를 확인하고, 10분 동안 손대지 않으면 다시 잠겨요. 다섯 번 틀리면 잠시 잠기고, 잊었으면 여기서 [비밀번호 초기화]를 누르면 돼요.
      </div>
    </div>
  );
}
