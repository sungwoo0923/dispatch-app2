// ======================= pnk-site/src/pages/Members.jsx =======================
// 구성원 · 조직도 — 모두: 부서별 조직도 · 연락처 · 내 정보 고치기 / 관리자: 가입 승인 · 역할 · 메일 아이디 · 사용 중지
import React from "react";
import { useMeCtx } from "../App";
import { MAIL_DOMAIN, ROLE_LABEL, STATUS_LABEL, mailAddr, patchRow, removeRow, useCol } from "../pnkApi";
import { Btn, Card, Chip, Empty, Field, Hero, HeroBtn, Input, Loading, Modal, Select, Tabs, fail } from "../ui";
import Icon from "../icons";

import { DEPT_ORDER, TITLES } from "../pnkConst";

export default function Members() {
  const me = useMeCtx();
  const [rows] = useCol("pnkMembers", [], []);
  const [tab, setTab] = React.useState("org");
  const [edit, setEdit] = React.useState(null);
  const [mine, setMine] = React.useState(false);
  const active = (rows || []).filter((m) => m.status === "active");
  const pending = (rows || []).filter((m) => m.status === "pending");
  const depts = [...new Set(active.map((m) => m.dept || "기타"))].sort((a, b) => (DEPT_ORDER.indexOf(a) + 1 || 99) - (DEPT_ORDER.indexOf(b) + 1 || 99));
  const ceo = active.filter((m) => m.role === "owner");

  return (
    <div>
      <Hero en="PEOPLE" title="구성원 · 조직도" desc={`PnK PROJECT 구성원 ${active.length}명${pending.length && me.isAdmin ? ` · 가입 승인 대기 ${pending.length}명` : ""}`}>
        <HeroBtn icon="user" onClick={() => setMine(true)}>내 정보 고치기</HeroBtn>
      </Hero>
      <Tabs items={[{ key: "org", label: "조직도" }, { key: "list", label: "연락처" }, ...(me.isAdmin ? [{ key: "admin", label: "구성원 관리", badge: pending.length }] : [])]} value={tab} onChange={setTab} />

      {!rows ? <Loading /> : tab === "org" ? (
        <div className="bg-white rounded-[22px] border border-line p-5 md:p-8 overflow-x-auto">
          <div className="min-w-[600px] flex flex-col items-center">
            <div className="rounded-2xl px-6 py-4 text-white text-center shadow-lg" style={{ background: "linear-gradient(120deg,#1B2B4B,#2D4C82)" }}>
              <img src="/brand/pnk-mark-64.png" alt="" className="w-9 h-9 rounded-lg bg-white mx-auto mb-1.5" />
              <div className="text-[15px] font-black">PnK PROJECT</div>
              <div className="text-[12px] text-blue-100/85">{ceo.map((c) => `${c.title || "대표"} ${c.name}`).join(" · ") || "대표"}</div>
            </div>
            <div className="w-0.5 h-6 bg-[#C9D3E4]" />
            <div className="relative flex gap-4 pt-6 flex-wrap justify-center">
              <div className="absolute top-0 left-[8%] right-[8%] h-0.5 bg-[#C9D3E4]" />
              {depts.map((d) => {
                const ppl = active.filter((m) => (m.dept || "기타") === d && m.role !== "owner");
                if (!ppl.length) return null;
                return (
                  <div key={d} className="relative w-[190px]">
                    <div className="absolute -top-6 left-1/2 w-0.5 h-6 bg-[#C9D3E4]" />
                    <div className="rounded-2xl border-2 border-navy bg-navy-50 px-3 py-2 text-center text-[13.5px] font-black text-navy">{d} <span className="text-[12px] text-[#7A8AA8]">{ppl.length}</span></div>
                    <div className="mt-2 space-y-1.5">
                      {ppl.map((m) => (
                        <div key={m.uid} className="flex items-center gap-2 rounded-xl border border-line bg-white px-2.5 py-2">
                          <div className="w-8 h-8 rounded-full bg-navy text-white text-[12px] font-black flex items-center justify-center shrink-0">{m.name.slice(0, 1)}</div>
                          <div className="min-w-0"><div className="text-[13px] font-black truncate">{m.name} <span className="text-[11.5px] text-[#7A8AA8] font-bold">{m.title}</span></div><div className="text-[11px] text-[#7A8AA8] truncate tnum">{mailAddr(m) || m.email}</div></div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : tab === "list" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {active.map((m) => (
            <div key={m.uid} className="bg-white rounded-[20px] border border-line p-4 flex gap-3">
              <div className="w-12 h-12 rounded-2xl bg-navy text-white text-[16px] font-black flex items-center justify-center shrink-0">{m.name.slice(0, 1)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5"><span className="text-[15px] font-black">{m.name}</span><span className="text-[12px] text-[#7A8AA8] font-bold">{m.dept} {m.title}</span>{m.role !== "staff" && <Chip tone="dark" className="ml-auto">{ROLE_LABEL[m.role]}</Chip>}</div>
                <div className="mt-1 text-[12.5px] space-y-0.5 text-[#3A4A66]">
                  {mailAddr(m) && <div className="flex items-center gap-1.5 tnum"><Icon name="mail" size={13} className="text-[#7A8AA8]" />{mailAddr(m)}</div>}
                  {m.phone && <a href={`tel:${m.phone}`} className="flex items-center gap-1.5 tnum"><Icon name="phone" size={13} className="text-[#7A8AA8]" />{m.phone}</a>}
                  {m.bio && <div className="text-[12px] text-[#7A8AA8] truncate">{m.bio}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <Card en="APPROVAL" title="가입 승인 대기" pad={false}>
              <ul className="divide-y divide-[#EEF1F6]">{pending.map((m) => (
                <li key={m.uid} className="flex flex-col sm:flex-row sm:items-center gap-2 px-5 py-3">
                  <div className="flex-1 min-w-0"><b>{m.name}</b> <span className="text-[12.5px] text-[#7A8AA8]">{m.dept} {m.title} · {m.email} · {m.phone}</span></div>
                  <div className="flex gap-2"><Btn onClick={() => setEdit({ ...m, status: "active" })}>승인하기</Btn><Btn kind="danger" onClick={() => window.confirm(`${m.name} 가입 요청을 거절할까요?`) && removeRow("pnkMembers", m.uid).catch(fail)}>거절</Btn></div>
                </li>
              ))}</ul>
            </Card>
          )}
          <Card en="MEMBERS" title="전체 구성원" pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px] min-w-[700px]">
                <thead><tr className="text-left text-[12px] text-[#7A8AA8] bg-[#F8FAFD]">{["이름", "부서 · 직책", "로그인 계정", "사내메일", "역할", "상태", ""].map((h) => <th key={h} className="px-4 py-2.5 font-bold">{h}</th>)}</tr></thead>
                <tbody>{(rows || []).filter((m) => m.status !== "pending").map((m) => (
                  <tr key={m.uid} className="border-t border-[#EEF1F6]">
                    <td className="px-4 py-3 font-black">{m.name}</td><td className="px-4 py-3">{m.dept} {m.title}</td>
                    <td className="px-4 py-3 text-[#5A6A86]">{m.email}</td>
                    <td className="px-4 py-3 tnum">{mailAddr(m) || <span className="text-rose-600 text-[12px] font-bold">없음</span>}</td>
                    <td className="px-4 py-3"><Chip tone={m.role === "staff" ? "gray" : "dark"}>{ROLE_LABEL[m.role]}</Chip></td>
                    <td className="px-4 py-3"><Chip tone={m.status === "active" ? "green" : "red"}>{STATUS_LABEL[m.status]}</Chip></td>
                    <td className="px-4 py-3 text-right"><Btn kind="ghost" icon="pen" onClick={() => setEdit(m)}>관리</Btn></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
      {edit && <MemberEditor m={edit} me={me} all={rows || []} onClose={() => setEdit(null)} />}
      {mine && me.member && <MyEditor m={me.member} onClose={() => setMine(false)} />}
      {tab === "org" && !active.length && rows && <Empty>구성원이 없습니다.</Empty>}
    </div>
  );
}

function MemberEditor({ m, me, all, onClose }) {
  const [f, setF] = React.useState({ name: m.name || "", dept: m.dept || "", title: m.title || "", phone: m.phone || "", role: m.role || "staff", status: m.status || "active", mailId: m.mailId || String(m.email || "").split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "") });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const deptOpts = [...new Set([...DEPT_ORDER, ...all.map((x) => x.dept).filter(Boolean)])];
  const save = () => {
    const id = f.mailId.trim().toLowerCase();
    if (id && !/^[a-z0-9][a-z0-9._-]{1,30}$/.test(id)) { window.alert("메일 아이디는 영문 소문자 · 숫자 · . _ - 로 2~31자"); return; }
    if (id && all.some((x) => x.uid !== m.uid && x.mailId === id)) { window.alert(`${id}@${MAIL_DOMAIN} 은(는) 이미 다른 구성원이 씁니다.`); return; }
    if (m.uid === me.user.uid && f.status !== "active") { window.alert("내 계정은 사용 중지할 수 없습니다."); return; }
    patchRow("pnkMembers", m.uid, { ...f, mailId: id }).then(onClose).catch(fail);
  };
  const roles = [{ key: "staff", label: "직원" }, { key: "admin", label: "관리자 (매출 · 구성원 관리)" }, ...(me.owner ? [{ key: "owner", label: "대표" }] : [])];
  return (
    <Modal open title={`${m.name} — ${m.status === "pending" ? "가입 승인" : "구성원 관리"}`} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>취소</Btn><Btn onClick={save}>{m.status === "pending" ? "승인" : "저장"}</Btn></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="이름"><Input value={f.name} onChange={set("name")} /></Field>
          <Field label="연락처"><Input value={f.phone} onChange={set("phone")} /></Field>
          <Field label="부서"><Select custom value={f.dept} onChange={set("dept")} options={deptOpts} placeholder="고르거나 직접 입력" /></Field>
          <Field label="직책"><Select custom value={f.title} onChange={set("title")} options={TITLES} placeholder="고르거나 직접 입력" /></Field>
        </div>
        <Field label="사내메일 주소" hint="영문 소문자 · 숫자 — 한 번 정하면 바꾸지 않는 것이 좋습니다.">
          <div className="flex items-center gap-2"><Input value={f.mailId} onChange={set("mailId")} className="tnum" /><span className="text-[14px] font-bold text-[#5A6A86] shrink-0">@{MAIL_DOMAIN}</span></div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="역할"><Select value={f.role} onChange={set("role")} options={roles} disabled={m.role === "owner" && !me.owner} /></Field>
          <Field label="상태"><Select value={f.status} onChange={set("status")} options={[{ key: "active", label: "사용 중" }, { key: "off", label: "사용 중지(퇴사 등)" }]} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function MyEditor({ m, onClose }) {
  const [f, setF] = React.useState({ name: m.name || "", phone: m.phone || "", bio: m.bio || "" });
  return (
    <Modal open title="내 정보" onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>취소</Btn><Btn onClick={() => patchRow("pnkMembers", m.uid, f).then(onClose).catch(fail)}>저장</Btn></>}>
      <div className="space-y-3">
        <Field label="이름"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="연락처"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="한 줄 소개"><Input value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} placeholder="예: 로지스웹 정산 담당" /></Field>
        <div className="text-[12px] text-[#7A8AA8]">부서 · 직책 · 메일 주소 · 역할은 관리자가 바꿉니다. ({m.dept} {m.title} · {mailAddr(m) || "메일 주소 없음"})</div>
      </div>
    </Modal>
  );
}

