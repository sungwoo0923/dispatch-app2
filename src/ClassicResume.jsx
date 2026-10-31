// ======================= src/ClassicResume.jsx =======================
// 📄 이력서 양식(2026-10-31) — 실제 이력서처럼: 큰 제목 · 증명사진 칸 · 인적사항 표 · 학력/경력/자격/가족 표 · 자기소개 · 서명란
import React from "react";

const th = "border border-[#2A3550] bg-[#EEF2F8] text-[#0F1A30] font-black text-[13.5px] px-3 py-2.5 text-center whitespace-nowrap";
const td = "border border-[#2A3550] text-[#0F1A30] text-[14px] px-3 py-2.5";
function Section({ title, en, head, rows, min = 3 }) {
  const body = [...(rows || [])];
  while (body.length < min) body.push(null);
  return (
    <div className="mt-7">
      <div className="flex items-baseline gap-2 mb-2"><span className="w-1.5 h-4 bg-[#0F1A30] self-center" /><span className="text-[16px] font-black text-[#0F1A30] tracking-[0.18em]">{title}</span><span className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#9AA9C3]">{en}</span></div>
      <table className="w-full border-collapse table-fixed">
        <thead><tr>{head.map(([h, w]) => <th key={h} className={th} style={w ? { width: w } : undefined}>{h}</th>)}</tr></thead>
        <tbody>{body.map((r, i) => <tr key={i}>{head.map(([h], j) => <td key={h} className={`${td} ${j === 0 ? "text-center tabular-nums" : ""} h-[42px]`}>{r ? r[j] || "" : ""}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function ClassicResume({ company, person = {}, resume = {}, photoSlot = null }) {
  const today = new Date();
  return (
    <div className="w-full bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_10px_30px_rgba(15,26,48,0.06)] px-6 md:px-12 py-10" style={{ fontFamily: "'Pretendard','Noto Sans KR','Malgun Gothic',sans-serif" }}>
      <div className="flex items-center justify-between text-[11px] font-extrabold tracking-[0.28em] text-[#9AA9C3]"><span>RESUME</span><span>{company}</span></div>
      <h1 className="mt-3 text-center text-[38px] font-black text-[#0F1A30] tracking-[0.6em] pl-[0.6em]">이 력 서</h1>
      <div className="mx-auto mt-2 w-[180px] h-[3px] bg-[#0F1A30]" /><div className="mx-auto mt-[3px] w-[180px] h-px bg-[#0F1A30]" />

      <table className="w-full border-collapse table-fixed mt-8">
        <colgroup><col style={{ width: 150 }} /><col style={{ width: 110 }} /><col /><col style={{ width: 110 }} /><col /></colgroup>
        <tbody>
          <tr>
            <td rowSpan={5} className="border border-[#2A3550] p-2 align-middle">
              <div className="relative w-full aspect-[3/4] bg-[#F5F8FD] flex items-center justify-center overflow-hidden">
                {resume.photoUrl ? <img src={resume.photoUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-[12px] font-bold text-[#9AA9C3] text-center leading-relaxed">사 진<br />(3×4cm)</span>}
                {photoSlot}
              </div>
            </td>
            <th className={th}>성 명</th><td className={`${td} text-[19px] font-black tracking-[0.2em]`}>{person.name || ""}</td>
            <th className={th}>생년월일</th><td className={`${td} tabular-nums`}>{resume.birthDate || ""}</td>
          </tr>
          <tr><th className={th}>연 락 처</th><td className={`${td} tabular-nums`}>{person.phone || ""}</td><th className={th}>이 메 일</th><td className={`${td} break-all`}>{person.email || ""}</td></tr>
          <tr><th className={th}>주 소</th><td className={td} colSpan={3}>{resume.address || ""}</td></tr>
          <tr><th className={th}>소 속</th><td className={td}>{[person.team, person.position].filter(Boolean).join(" / ")}</td><th className={th}>입 사 일</th><td className={`${td} tabular-nums`}>{person.hireDate || ""}</td></tr>
          <tr><th className={th}>고용 형태</th><td className={td}>{person.employType || "정규직"}</td><th className={th}>재직 상태</th><td className={td}>{person.employmentStatus || "재직"}</td></tr>
        </tbody>
      </table>

      <Section title="학력사항" en="EDUCATION" head={[["기 간", 190], ["학 교 명"], ["전공 · 졸업 구분"]]} rows={(resume.education || []).map((e) => [e.period, e.school, e.detail])} />
      <Section title="경력사항" en="CAREER" head={[["기 간", 190], ["근 무 처"], ["담당 업무 · 직위"]]} rows={(resume.career || []).map((c) => [c.period, c.company, c.detail])} />
      <Section title="자격 · 면허" en="LICENSE" head={[["취 득 일", 190], ["자 격 명"], ["발 급 기 관"]]} rows={(resume.certificates || []).map((c) => [c.date, c.name, c.issuer])} min={2} />
      <Section title="가족관계" en="FAMILY" head={[["관 계", 110], ["성 명", 160], ["생년월일 · 연령"], ["직 업"]]} rows={(resume.family || []).map((f) => [f.relation, f.name, f.birth, f.job])} min={2} />

      <div className="mt-7">
        <div className="flex items-baseline gap-2 mb-2"><span className="w-1.5 h-4 bg-[#0F1A30] self-center" /><span className="text-[16px] font-black text-[#0F1A30] tracking-[0.18em]">자기소개</span><span className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#9AA9C3]">ABOUT</span></div>
        <div className="border border-[#2A3550] min-h-[140px] px-5 py-4 text-[14.5px] leading-[1.9] text-[#1F2A44] whitespace-pre-wrap">{resume.intro || ""}</div>
      </div>

      <div className="mt-10 text-center text-[15px] text-[#0F1A30]">위의 기재 사항은 사실과 틀림이 없습니다.</div>
      <div className="mt-4 text-center text-[15px] font-bold tabular-nums">{today.getFullYear()}년 {today.getMonth() + 1}월 {today.getDate()}일</div>
      <div className="mt-6 flex justify-end items-center gap-4 text-[16px] pr-4"><span className="font-bold text-[#5B6B85]">작성자</span><span className="font-black tracking-[0.3em] text-[#0F1A30]">{person.name || ""}</span><span className="w-12 h-12 rounded-full border-2 border-[#B42318]/70 text-[#B42318]/80 grid place-items-center text-[13px] font-black">(인)</span></div>
    </div>
  );
}
