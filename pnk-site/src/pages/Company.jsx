// ======================= pnk-site/src/pages/Company.jsx =======================
// 회사 정보 — 법인 기본 정보(구성원 모두 보기) · 바로가기 링크 · 브랜드 자료 · 관리자 전용 정보(계좌 · 운영 계정 목록)
//  pnkCompany/info   : 기본 정보 + links[]
//  pnkCompany/secure : bank, accounts[{name, url, owner, note}] — ⚠ 비밀번호는 적지 않는다(어디서 관리하는지만)
import React from "react";
import { useMeCtx } from "../App";
import { DEFAULT_LINKS, saveDoc, useDocLive } from "../pnkApi";
import { Btn, Card, DateInput, Field, Hero, HeroBtn, Input, Modal, Textarea, TimeInput, fail } from "../ui";
import Icon from "../icons";
import MailServer from "./MailServer";

const INFO_FIELDS = [
  ["name", "상호(법인명)"], ["nameEn", "영문 상호"], ["ceo", "대표자"], ["bizNo", "사업자등록번호"], ["corpNo", "법인등록번호"],
  ["founded", "설립일"], ["bizType", "업태 / 종목"], ["address", "주소"], ["tel", "대표 전화"], ["email", "대표 메일"],
  ["homepage", "홈페이지"], ["workStart", "출근 시각"], ["workEnd", "퇴근 시각"],
];

export default function Company() {
  const me = useMeCtx();
  const info = useDocLive("pnkCompany/info");
  const secure = useDocLive(me.isAdmin ? "pnkCompany/secure" : null);
  const [edit, setEdit] = React.useState(null);
  const links = info?.links?.length ? info.links : DEFAULT_LINKS;
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => window.alert("복사했습니다."));

  return (
    <div>
      <Hero en="COMPANY" title={info?.name || "PnK PROJECT"} desc="법인 정보 · 서비스 바로가기 · 브랜드 자료">
        {me.isAdmin && <HeroBtn icon="pen" onClick={() => setEdit("info")}>정보 고치기</HeroBtn>}
      </Hero>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-5">
        <Card en="CORPORATE" title="법인 기본 정보" className="xl:col-span-2" right={<Btn kind="ghost" onClick={() => copy(INFO_FIELDS.map(([k, l]) => `${l}: ${info?.[k] || ""}`).join("\n"))}>전체 복사</Btn>}>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            {INFO_FIELDS.map(([k, l]) => (
              <div key={k} className="flex items-center gap-3 py-3 border-b border-[#EEF1F6]">
                <dt className="w-28 shrink-0 text-[12.5px] font-bold text-[#7A8AA8]">{l}</dt>
                <dd className="flex-1 min-w-0 text-[14px] font-bold truncate tnum">{info?.[k] || <span className="text-[#C0C8D6] font-medium">미입력</span>}</dd>
                {info?.[k] && <button type="button" onClick={() => copy(info[k])} className="text-[#C0C8D6] hover:text-navy" title="복사"><Icon name="file" size={15} /></button>}
              </div>
            ))}
          </dl>
        </Card>

        <Card en="BRAND" title="브랜드">
          <div className="rounded-2xl bg-white border border-line flex items-center justify-center p-6"><img src="/brand/pnk-logo-600.png" alt="PnK PROJECT 로고" className="w-40" /></div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href="/brand/pnk-logo-600.png" download="PnK-PROJECT-logo.png"><Btn kind="ghost" icon="download" className="w-full">전체 로고</Btn></a>
            <a href="/brand/pnk-mark-512.png" download="PnK-PROJECT-mark.png"><Btn kind="ghost" icon="download" className="w-full">심볼</Btn></a>
          </div>
          <div className="mt-4 flex gap-2">{[["#1B2B4B", "메인 네이비"], ["#2D4C82", "포인트"], ["#F4F6FA", "바탕"]].map(([c, l]) => (
            <button key={c} type="button" onClick={() => copy(c)} className="flex-1 text-left"><div className="h-10 rounded-xl border border-line" style={{ background: c }} /><div className="mt-1 text-[11.5px] font-bold">{l}</div><div className="text-[11px] text-[#7A8AA8] tnum">{c}</div></button>
          ))}</div>
        </Card>

        <Card en="SHORTCUTS" title="서비스 바로가기" className="xl:col-span-2" right={me.isAdmin && <Btn kind="ghost" icon="pen" onClick={() => setEdit("links")}>바꾸기</Btn>}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3.5 hover:border-navy-500 transition">
                <div className="w-10 h-10 rounded-xl bg-navy-100 text-navy flex items-center justify-center"><Icon name="link" size={18} /></div>
                <div className="min-w-0 flex-1"><div className="text-[14px] font-black">{l.label}</div><div className="text-[12px] text-[#7A8AA8] truncate">{l.sub || l.url}</div></div>
              </a>
            ))}
          </div>
        </Card>

        {me.isAdmin && <MailServer me={me} info={info} />}
        {me.isAdmin && (
          <Card en="ADMIN ONLY" title="관리자 전용" right={<Btn kind="ghost" icon="pen" onClick={() => setEdit("secure")}>고치기</Btn>}>
            <div className="text-[12.5px] font-bold text-[#7A8AA8] mb-1">법인 계좌</div>
            <div className="text-[14px] font-black tnum mb-4">{secure?.bank || <span className="text-[#C0C8D6] font-medium">미입력</span>}</div>
            <div className="text-[12.5px] font-bold text-[#7A8AA8] mb-1.5">운영 계정 · 서비스 목록</div>
            <ul className="space-y-1.5">
              {(secure?.accounts || []).map((a, i) => (
                <li key={i} className="rounded-xl bg-navy-50 px-3 py-2">
                  <div className="flex items-center gap-2"><b className="text-[13px] flex-1">{a.name}</b>{a.url && <a href={a.url} target="_blank" rel="noreferrer" className="text-navy-500"><Icon name="link" size={14} /></a>}</div>
                  <div className="text-[12px] text-[#5A6A86]">{a.owner}{a.note ? ` · ${a.note}` : ""}</div>
                </li>
              ))}
              {!(secure?.accounts || []).length && <li className="text-[12.5px] text-[#7A8AA8]">Vercel · Firebase · 도메인 · 팝빌 등 어디서 관리하는지 적어 두세요.</li>}
            </ul>
            <div className="mt-3 text-[11.5px] text-rose-600 font-semibold">⚠ 비밀번호는 여기에 적지 마세요.</div>
          </Card>
        )}
      </div>

      {edit === "info" && <InfoEditor info={info || {}} onClose={() => setEdit(null)} />}
      {edit === "links" && <LinksEditor links={links} onClose={() => setEdit(null)} />}
      {edit === "secure" && <SecureEditor secure={secure || {}} onClose={() => setEdit(null)} />}
    </div>
  );
}

function InfoEditor({ info, onClose }) {
  const [f, setF] = React.useState(() => Object.fromEntries(INFO_FIELDS.map(([k]) => [k, info[k] || ""])));
  return (
    <Modal open wide title="법인 정보 고치기" onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>취소</Btn><Btn onClick={() => saveDoc("pnkCompany/info", f).then(onClose).catch(fail)}>저장</Btn></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {INFO_FIELDS.map(([k, l]) => <Field key={k} label={l} className={k === "address" ? "sm:col-span-2" : ""}>
          {k === "founded" ? <DateInput value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            : k === "workStart" || k === "workEnd" ? <TimeInput value={f[k] || (k === "workStart" ? "09:00" : "18:00")} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
              : <Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}</Field>)}
      </div>
    </Modal>
  );
}

// 줄마다 "이름 | 설명 | 주소"
function LinksEditor({ links, onClose }) {
  const [t, setT] = React.useState(links.map((l) => `${l.label} | ${l.sub || ""} | ${l.url}`).join("\n"));
  const save = () => {
    const out = t.split("\n").map((s) => s.split("|").map((x) => x.trim())).filter((p) => p.length >= 3 && /^https?:\/\//.test(p[2])).map(([label, sub, url]) => ({ label, sub, url }));
    saveDoc("pnkCompany/info", { links: out }).then(onClose).catch(fail);
  };
  return (
    <Modal open title="서비스 바로가기" onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>취소</Btn><Btn onClick={save}>저장</Btn></>}>
      <Field label="한 줄에 하나씩 — 이름 | 설명 | 주소" hint="대시보드 위쪽 버튼에도 같은 목록이 보입니다."><Textarea rows={8} value={t} onChange={(e) => setT(e.target.value)} /></Field>
    </Modal>
  );
}

function SecureEditor({ secure, onClose }) {
  const [bank, setBank] = React.useState(secure.bank || "");
  const [t, setT] = React.useState((secure.accounts || []).map((a) => `${a.name} | ${a.owner || ""} | ${a.url || ""} | ${a.note || ""}`).join("\n"));
  const save = () => {
    const accounts = t.split("\n").map((s) => s.split("|").map((x) => x.trim())).filter((p) => p[0]).map(([name, owner = "", url = "", note = ""]) => ({ name, owner, url, note }));
    saveDoc("pnkCompany/secure", { bank, accounts }).then(onClose).catch(fail);
  };
  return (
    <Modal open title="관리자 전용 정보" onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>취소</Btn><Btn onClick={save}>저장</Btn></>}>
      <div className="space-y-3">
        <Field label="법인 계좌"><Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="○○은행 000-000000-00-000 (예금주 PnK PROJECT)" /></Field>
        <Field label="운영 계정 · 서비스 — 한 줄에 하나: 이름 | 관리자 | 주소 | 메모" hint="⚠ 비밀번호는 적지 마세요."><Textarea rows={8} value={t} onChange={(e) => setT(e.target.value)} placeholder={"Vercel | 대표 | https://vercel.com | 배포\nFirebase | 대표 | https://console.firebase.google.com | 로그인 · DB"} /></Field>
      </div>
    </Modal>
  );
}
