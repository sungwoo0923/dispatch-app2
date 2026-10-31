// ======================= src/OrgChart.jsx =======================
// 🏢 조직도(2026-10-27) — 회사관리 › 조직도
//  회원(users)의 부서(team)·직책(position)으로 자동으로 그린다. 부서·직책은 인사관리부/회원관리에서 정한 값 그대로.
//  최고관리자(프로그램 관리 계정)·퇴사자·기사·화주는 넣지 않는다.
import React from "react";
import { db } from "./firebase";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { isTMUser } from "./staffFilter";

const RANK = ["대표", "대표이사", "사장", "부사장", "전무", "상무", "이사", "실장", "본부장", "부장", "차장", "팀장", "과장", "대리", "주임", "계장", "사원", "인턴"];
const rankOf = (p) => { const s = String(p || ""); const i = RANK.findIndex((r) => s.includes(r)); return i === -1 ? 50 : i; };
const fmtPhone = (v) => {
  const d = String(v || "").replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return v || "";
};
const STAFF_ROLES = new Set(["admin", "user", "hrManager", "test", "viewer", undefined, null, ""]);

function Avatar({ name, photo, size = 44 }) {
  return (
    <span className="rounded-[14px] overflow-hidden flex items-center justify-center text-white font-black shrink-0 ring-1 ring-white/60"
      style={{ width: size, height: size, fontSize: size * 0.38, background: photo ? "#EEF3FB" : "linear-gradient(135deg, #1B2B4B 0%, #2D4C82 100%)" }}>
      {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : String(name || "?").slice(0, 1)}
    </span>
  );
}

export default function OrgChart({ userCompany }) {
  const [members, setMembers] = React.useState(null);
  const [photos, setPhotos] = React.useState({});
  const [q, setQ] = React.useState("");
  const [copied, setCopied] = React.useState("");

  React.useEffect(() => {
    if (!userCompany) return undefined;
    return onSnapshot(query(collection(db, "users"), where("companyName", "==", userCompany)), (snap) => {
      setMembers(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
        .filter((u) => u.approved !== false && u.employmentStatus !== "퇴사" && !isTMUser(u) && STAFF_ROLES.has(u.role)));
    }, () => setMembers([]));
  }, [userCompany]);
  // 증명사진(인사관리부 이력서 사진) — 사람마다 1번만
  React.useEffect(() => {
    (members || []).forEach((m) => {
      if (photos[m.uid] !== undefined) return;
      setPhotos((p) => ({ ...p, [m.uid]: null }));
      getDoc(doc(db, "hrResumes", m.uid)).then((s) => { const url = s.exists() ? s.data().photoUrl : null; if (url) setPhotos((p) => ({ ...p, [m.uid]: url })); }).catch(() => {});
    });
  }, [members]); // eslint-disable-line react-hooks/exhaustive-deps

  const teams = React.useMemo(() => {
    const k = q.trim();
    const g = new Map();
    (members || []).filter((m) => !k || [m.name, m.team, m.position, m.phone, m.전화번호].some((v) => String(v || "").includes(k)))
      .forEach((m) => { const t = String(m.team || "").trim() || "미배정"; if (!g.has(t)) g.set(t, []); g.get(t).push(m); });
    return [...g.entries()].map(([name, list]) => ({
      name, list: list.sort((a, b) => rankOf(a.position) - rankOf(b.position) || String(a.name).localeCompare(String(b.name), "ko")),
    })).sort((a, b) => (a.name === "미배정") - (b.name === "미배정") || Math.min(...a.list.map((m) => rankOf(m.position))) - Math.min(...b.list.map((m) => rankOf(m.position))) || a.name.localeCompare(b.name, "ko"));
  }, [members, q]);
  const total = (members || []).length;
  const copy = (text, key) => { navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(""), 1200); }).catch(() => {}); };

  return (
    <div className="space-y-5">
      {/* 맨 위 — 회사 */}
      <div className="relative overflow-hidden rounded-[24px] px-7 py-6 text-white shadow-[0_18px_40px_rgba(15,26,48,0.28)]"
        style={{ background: "linear-gradient(125deg, #0F1A30 0%, #1B2B4B 52%, #2D4C82 100%)" }}>
        <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full bg-white/[0.05]" />
        <div className="absolute right-40 -bottom-28 w-60 h-60 rounded-full bg-white/[0.04]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-extrabold tracking-[0.26em] text-[#8FB0F0]">ORGANIZATION</div>
            <div className="text-[28px] font-black tracking-tight leading-tight mt-1">{userCompany || "우리 회사"}</div>
            <div className="text-[13.5px] text-white/70 mt-1">부서·직책은 인사관리부에서 정한 대로 자동으로 그려집니다</div>
          </div>
          <div className="flex gap-2.5">
            {[["전체 인원", `${total}명`], ["부서", `${teams.filter((t) => t.name !== "미배정").length}개`]].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-white/[0.08] ring-1 ring-white/15 px-5 py-3 min-w-[110px]">
                <div className="text-[12px] font-bold text-white/60">{k}</div>
                <div className="text-[22px] font-black tabular-nums">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 h-11 px-4 rounded-2xl border border-[#DCE3EE] bg-white max-w-[420px] focus-within:border-[#4B6CB7] focus-within:ring-4 focus-within:ring-[#4B6CB7]/10">
        <svg className="w-4 h-4 text-[#9AA9C3] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 부서 · 직책 · 전화번호" className="flex-1 min-w-0 text-[14px] font-semibold text-[#0F1A30] outline-none bg-transparent placeholder:text-[#A7B3C6]" />
      </div>

      {members === null ? (
        <div className="py-20 text-center text-[14px] text-[#9AA9C3]">불러오는 중…</div>
      ) : teams.length === 0 ? (
        <div className="py-20 text-center text-[14px] text-[#9AA9C3] rounded-[20px] border border-dashed border-[#DCE3EE] bg-white">표시할 인원이 없습니다</div>
      ) : (() => {
        // ⭐ 2026-10-31 연결선 조직도 — 대표이사 → 임원진 → 부서 → 직원(직급순)
        const all = teams.flatMap((t) => t.list);
        const isCeo = (m) => /대표|사장/.test(String(m.position || "")) && !/부사장/.test(String(m.position || ""));
        const ceos = all.filter(isCeo).sort((x, y) => rankOf(x.position) - rankOf(y.position));
        const execs = all.filter((m) => !isCeo(m) && (m.team === "임원" || rankOf(m.position) <= 6)).sort((x, y) => rankOf(x.position) - rankOf(y.position));
        const used = new Set([...ceos, ...execs].map((m) => m.uid));
        const depts = teams.filter((t) => t.name !== "임원").map((t) => ({ ...t, list: t.list.filter((m) => !used.has(m.uid)) })).filter((t) => t.list.length);
        const Person = ({ m, big, gold }) => {
          const phone = fmtPhone(m.phone || m.전화번호);
          return (
            <div className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left ${gold ? "text-white shadow-[0_14px_30px_rgba(15,26,48,0.3)]" : big ? "bg-gradient-to-r from-[#0F1A30] to-[#2D4C82] text-white shadow-[0_10px_24px_rgba(15,26,48,0.22)]" : "bg-white border border-[#E3E8F0]"}`}
              style={gold ? { background: "linear-gradient(120deg,#060C1A,#13213F 60%,#2D4C82)", boxShadow: "inset 0 0 0 1px rgba(215,188,130,.55), 0 14px 30px rgba(15,26,48,.3)" } : undefined}>
              <Avatar name={m.name} photo={photos[m.uid]} size={gold ? 52 : big ? 46 : 38} />
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5"><span className={`font-black truncate ${gold ? "text-[17px]" : big ? "text-[15.5px]" : "text-[14px] text-[#0F1A30]"}`}>{m.name || m.email}</span><span className={`text-[12px] font-bold whitespace-nowrap ${gold ? "text-[#D7BC82]" : big ? "text-white/70" : "text-[#7A879C]"}`}>{m.position || ""}</span></div>
                {phone ? <button type="button" onClick={() => copy(phone, m.uid)} className={`text-[12px] font-semibold tabular-nums ${gold || big ? "text-white/70" : "text-[#5B6B85]"}`}>{copied === m.uid ? "복사됨 ✓" : phone}</button> : null}
              </div>
            </div>
          );
        };
        const Dept = ({ t }) => (
          <div className="w-[248px] rounded-[20px] bg-[#F7F9FC] border border-[#E3E8F0] p-2.5 text-left">
            <div className="flex items-center justify-between px-1.5 pb-2">
              <span className="flex items-center gap-2"><span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-[#1B2B4B] to-[#4B6CB7]" /><span className="text-[15px] font-black text-[#0F1A30]">{t.name}</span></span>
              <span className="text-[11.5px] font-black text-[#5B6B85] tabular-nums">{t.list.length}명</span>
            </div>
            <div className="relative pl-4">
              <span className="absolute left-[7px] top-3 bottom-5 w-[2px] bg-[#C9D6EE] rounded" />
              <div className="space-y-1.5">
                {t.list.map((m, i) => (
                  <div key={m.uid} className="relative">
                    <span className="absolute -left-[9px] top-1/2 w-[9px] h-[2px] bg-[#C9D6EE]" />
                    <Person m={m} big={i === 0 && rankOf(m.position) < 50 && t.name !== "미배정"} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
        return (
          <div className="rounded-[24px] bg-white border border-[#E3E8F0] p-4 md:p-8 overflow-x-auto">
            <style>{`
              .oc-tree, .oc-tree ul { margin: 0; padding: 0; }
              .oc-tree ul { padding-top: 26px; position: relative; display: flex; justify-content: center; }
              .oc-tree li { list-style: none; position: relative; padding: 26px 10px 0; display: flex; flex-direction: column; align-items: center; }
              .oc-tree li::before, .oc-tree li::after { content: ""; position: absolute; top: 0; right: 50%; width: 50%; height: 26px; border-top: 2px solid #9FB2D6; }
              .oc-tree li::after { right: auto; left: 50%; border-left: 2px solid #9FB2D6; }
              .oc-tree li:only-child::before, .oc-tree li:only-child::after { display: none; }
              .oc-tree li:only-child { padding-top: 0; }
              .oc-tree li:first-child::before, .oc-tree li:last-child::after { border: 0 none; }
              .oc-tree li:last-child::before { border-right: 2px solid #9FB2D6; border-radius: 0 10px 0 0; }
              .oc-tree li:first-child::after { border-radius: 10px 0 0 0; }
              .oc-tree ul ul::before { content: ""; position: absolute; top: 0; left: 50%; height: 26px; border-left: 2px solid #9FB2D6; }
              .oc-tree > ul { padding-top: 0; }
            `}</style>
            <div className="oc-tree min-w-max mx-auto">
              <ul>
                <li>
                  {ceos.length ? <div className="flex gap-3">{ceos.map((m) => <Person key={m.uid} m={m} gold />)}</div>
                    : <div className="rounded-2xl px-6 py-3 text-white text-[17px] font-black" style={{ background: "linear-gradient(120deg,#060C1A,#13213F 60%,#2D4C82)" }}>{userCompany || "대표이사"}<div className="text-[11.5px] font-bold text-[#D7BC82]">대표이사 미지정 — 부서 「임원」·직책 「대표」로 지정</div></div>}
                  <ul>
                    <li>
                      {execs.length ? (
                        <div className="rounded-[20px] border border-[#D7BC82]/60 bg-[#FFFCF5] p-2.5">
                          <div className="text-center text-[11px] font-extrabold tracking-[0.24em] text-[#8C7442] pb-2">EXECUTIVES · 임원진</div>
                          <div className="flex gap-2">{execs.map((m) => <Person key={m.uid} m={m} big />)}</div>
                        </div>
                      ) : <div className="rounded-full px-4 py-1.5 bg-[#EEF3FC] text-[12px] font-black text-[#1B2B4B]">부서</div>}
                      {depts.length > 0 && (
                        <ul>
                          {depts.map((t) => <li key={t.name}><Dept t={t} /></li>)}
                        </ul>
                      )}
                    </li>
                  </ul>
                </li>
              </ul>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
