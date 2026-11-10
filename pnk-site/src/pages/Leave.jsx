// ======================= pnk-site/src/pages/Leave.jsx =======================
// 휴가 — 내 남은 연차 · 신청 내역(전자결재 휴가 신청서) · 팀 휴가 일정 · (관리자) 전체 연차 현황
//  사용 일수 = 올해 승인 완료된 휴가(일정 pnkEvents type "leave"의 days 합). 병가 · 경조사 · 공가는 연차에서 빼지 않는다.
//  연차 일수 = 구성원 문서 annual(구성원 관리에서 정함, 기본 15일)
import React from "react";
import { useNavigate } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { useMeCtx } from "../App";
import { APPROVAL_STATUS, DEFAULT_WORK, LEAVE_KINDS, leaveLabel, useCol, where, ymd } from "../pnkApi";
import { Btn, Card, Chip, Empty, Hero, HeroBtn, cx } from "../ui";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const isFree = (k) => !!LEAVE_KINDS.find((x) => x.key === k)?.free;

export default function Leave() {
  const me = useMeCtx();
  const nav = useNavigate();
  const uid = me.user.uid;
  const today = ymd();
  const year = today.slice(0, 4);
  const [events] = useCol("pnkEvents", [where("date", ">=", `${year}-01-01`), where("date", "<=", `${year}-12-31`)], [year]);
  const [mineAp] = useCol("pnkApprovals", [where("viewers", "array-contains", uid)], [uid]);
  const [members] = useCol("pnkMembers", [where("status", "==", "active")], []);
  const leaves = (events || []).filter((e) => e.type === "leave");
  const usedOf = (u) => leaves.filter((e) => e.leaveUid === u && !isFree(e.leaveKind)).reduce((a, e) => a + (Number(e.days) || 1), 0);
  const annual = Number(me.member?.annual ?? DEFAULT_WORK.annual) || 0;
  const used = usedOf(uid);
  const left = Math.max(0, annual - used);
  const myReq = (mineAp || []).filter((a) => a.form === "leave" && a.authorUid === uid).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const pendingDays = myReq.filter((a) => a.status === "pending").reduce((x, a) => x + (Number(a.fields?.days) || 0), 0);
  const upcoming = leaves.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 14);
  const pie = [{ v: used, c: "#1B2B4B" }, { v: pendingDays, c: "#8FA6D6" }, { v: Math.max(0, left - pendingDays), c: "#E2E8F2" }];

  return (
    <div>
      <Hero en="LEAVE" title="휴가" desc={`${year}년 연차 ${annual}일 · 사용 ${used}일 · 남은 ${left}일`}>
        <HeroBtn icon="plus" onClick={() => nav("/approvals?new=leave")}>휴가 신청</HeroBtn>
      </Hero>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4 md:gap-5 mb-5">
        <Card en="MY LEAVE" title="내 연차">
          <div className="relative h-[200px]">
            <ResponsiveContainer><PieChart><Pie data={pie} dataKey="v" innerRadius={66} outerRadius={90} startAngle={90} endAngle={-270} stroke="none">{pie.map((p, i) => <Cell key={i} fill={p.c} />)}</Pie></PieChart></ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-[12px] font-bold text-[#7A8AA8]">남은 연차</div>
              <div className="text-[38px] font-black tabular-nums leading-none">{left}<span className="text-[16px] ml-0.5">일</span></div>
              <div className="text-[11.5px] text-[#7A8AA8] mt-1">/ {annual}일</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center mt-2">
            {[["사용", used, "bg-navy"], ["결재 중", pendingDays, "bg-[#8FA6D6]"], ["남음", Math.max(0, left - pendingDays), "bg-[#E2E8F2]"]].map(([l, v, c]) => (
              <div key={l} className="rounded-2xl bg-navy-50 py-2"><div className="text-[11.5px] font-bold text-[#5A6A86] flex items-center justify-center gap-1"><span className={cx("w-2 h-2 rounded-full", c)} />{l}</div><div className="text-[17px] font-black tabular-nums">{v}일</div></div>
            ))}
          </div>
          <Btn className="w-full mt-4 h-11" icon="plus" onClick={() => nav("/approvals?new=leave")}>휴가 신청서 쓰기</Btn>
        </Card>

        <Card en="TEAM" title="다가오는 팀 휴가" pad={false}>
          {upcoming.length === 0 ? <Empty icon="flag">예정된 휴가가 없습니다.</Empty> : (
            <ul className="divide-y divide-[#EEF1F6]">
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-12 text-center shrink-0"><div className="text-[11px] font-bold text-[#7A8AA8]">{WEEK[new Date(`${e.date}T12:00:00Z`).getUTCDay()]}</div><div className="text-[15px] font-black tabular-nums">{e.date.slice(5).replace("-", "/")}</div></div>
                  <div className="w-9 h-9 rounded-full bg-navy text-white text-[13px] font-black flex items-center justify-center">{String(e.title || "?").slice(0, 1)}</div>
                  <div className="min-w-0 flex-1"><div className="text-[14px] font-bold truncate">{e.title}</div><div className="text-[12px] text-[#7A8AA8]">{e.date === today ? "오늘" : ""}{e.memo ? ` ${e.memo}` : ""}</div></div>
                  <Chip tone={isFree(e.leaveKind) ? "gray" : "navy"}>{leaveLabel(e.leaveKind)}</Chip>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card en="REQUESTS" title="내 휴가 신청 내역" pad={false} className="mb-5">
        {myReq.length === 0 ? <Empty icon="calendar">신청한 휴가가 없습니다.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px] min-w-[560px]">
              <thead><tr className="text-left text-[12px] text-[#7A8AA8] bg-[#F8FAFD]">{["종류", "기간", "일수", "결재", "상태"].map((h) => <th key={h} className="px-4 py-2.5 font-bold">{h}</th>)}</tr></thead>
              <tbody>{myReq.map((a) => (
                <tr key={a.id} onClick={() => nav(`/approvals?id=${a.id}`)} className="border-t border-[#EEF1F6] hover:bg-[#F8FAFD] cursor-pointer">
                  <td className="px-4 py-2.5 font-bold">{leaveLabel(a.fields?.kind)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{a.fields?.from}{a.fields?.to && a.fields.to !== a.fields.from ? ` ~ ${a.fields.to}` : ""}</td>
                  <td className="px-4 py-2.5 tabular-nums">{a.fields?.days}일</td>
                  <td className="px-4 py-2.5 text-[12.5px] text-[#5A6A86]">{a.line?.map((l) => `${l.name}${l.status === "approved" ? "✓" : l.status === "rejected" ? "✗" : ""}`).join(" → ")}</td>
                  <td className="px-4 py-2.5"><Chip tone={a.status === "approved" ? "green" : a.status === "rejected" ? "red" : a.status === "canceled" ? "gray" : "navy"}>{APPROVAL_STATUS[a.status]}</Chip></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      {me.isAdmin && (
        <Card en="ALL MEMBERS" title={`${year}년 전체 연차 현황 (관리자)`} pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px] min-w-[560px]">
              <thead><tr className="text-left text-[12px] text-[#7A8AA8] bg-[#F8FAFD]">{["사번", "이름", "부서", "연차", "사용", "남음", ""].map((h) => <th key={h} className="px-4 py-2.5 font-bold">{h}</th>)}</tr></thead>
              <tbody>{(members || []).map((m) => {
                const a = Number(m.annual ?? DEFAULT_WORK.annual) || 0; const u = usedOf(m.uid); const l = Math.max(0, a - u);
                return (
                  <tr key={m.uid} className="border-t border-[#EEF1F6]">
                    <td className="px-4 py-2.5 tabular-nums text-navy font-bold">{m.empNo}</td><td className="px-4 py-2.5 font-black">{m.name}</td><td className="px-4 py-2.5">{m.dept}</td>
                    <td className="px-4 py-2.5 tabular-nums">{a}일</td><td className="px-4 py-2.5 tabular-nums">{u}일</td><td className="px-4 py-2.5 tabular-nums font-black">{l}일</td>
                    <td className="px-4 py-2.5 w-[200px]"><div className="h-2 rounded-full bg-navy-100 overflow-hidden"><div className="h-full bg-navy rounded-full" style={{ width: `${a ? Math.min(100, (u / a) * 100) : 0}%` }} /></div></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-[#EEF1F6] text-[12px] text-[#7A8AA8]">연차 일수는 구성원 · 조직도 › 구성원 관리 › [관리]에서 바꿉니다. 병가 · 경조사 · 공가는 연차에서 빼지 않습니다.</div>
        </Card>
      )}
    </div>
  );
}
