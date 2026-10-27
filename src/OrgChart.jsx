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
      ) : (
        <div>
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {teams.map((t) => {
              const lead = t.name !== "미배정" ? t.list[0] : null;
              return (
                <section key={t.name} className="bg-white rounded-[22px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_30px_rgba(16,24,40,0.07)] overflow-hidden flex flex-col">
                  <div className="px-5 pt-4 pb-3 border-b border-[#EEF1F6] flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2 h-7 rounded-full bg-gradient-to-b from-[#1B2B4B] to-[#4B6CB7]" />
                      <div className="min-w-0">
                        <div className="text-[11px] font-extrabold tracking-[0.2em] text-[#4B6CB7]">TEAM</div>
                        <div className="text-[17px] font-black text-[#0F1A30] truncate">{t.name}</div>
                      </div>
                    </div>
                    <span className="h-7 px-2.5 inline-flex items-center rounded-full bg-[#F5F8FD] border border-[#E3E8F0] text-[12px] font-extrabold text-[#1B2B4B] tabular-nums">{t.list.length}명</span>
                  </div>
                  <div className="p-3 space-y-1.5">
                    {t.list.map((m) => {
                      const phone = fmtPhone(m.phone || m.전화번호);
                      const isLead = lead && m.uid === lead.uid && rankOf(m.position) < 50;
                      return (
                        <div key={m.uid} className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl ${isLead ? "bg-gradient-to-r from-[#0F1A30] to-[#2D4C82] text-white" : "hover:bg-[#F5F8FD]"}`}>
                          <Avatar name={m.name} photo={photos[m.uid]} size={isLead ? 48 : 42} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[15px] font-black truncate ${isLead ? "" : "text-[#0F1A30]"}`}>{m.name || m.email}</span>
                              <span className={`text-[12px] font-bold ${isLead ? "text-white/70" : "text-[#7A879C]"}`}>{m.position || ""}</span>
                            </div>
                            {phone ? (
                              <button type="button" onClick={() => copy(phone, m.uid)} title="눌러서 번호 복사"
                                className={`text-[13px] font-semibold tabular-nums ${isLead ? "text-white/85" : "text-[#3A4A66]"}`}>
                                {copied === m.uid ? "복사됨 ✓" : phone}
                              </button>
                            ) : <div className={`text-[12.5px] ${isLead ? "text-white/50" : "text-[#9AA9C3]"}`}>연락처 미등록</div>}
                          </div>
                          {phone && (
                            <a href={`tel:${phone.replace(/\D/g, "")}`} title="전화 걸기"
                              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isLead ? "bg-white/10 text-white" : "bg-[#EEF3FB] text-[#1B2B4B]"}`}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
