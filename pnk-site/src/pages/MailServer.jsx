// ======================= pnk-site/src/pages/MailServer.jsx =======================
// 회사 정보 › 메일 서버(관리자) — @pnkproject.com 외부 메일 연결 순서 안내 + 발송 서버(SMTP) 저장 · 테스트 · 받기 주소
//  서버 함수 pnkMailAdmin(functions/pnkMail.js) — 비밀번호(API 키)는 서버에서 암호화해 보관하고 화면에는 다시 보이지 않는다
import React from "react";
import { callFn } from "../firebase";
import { MAIL_DOMAIN, mailAddr } from "../pnkApi";
import { Btn, Card, Chip, Field, Input, Select, cx } from "../ui";

const PRESETS = [
  { key: "mailgun", label: "Mailgun (추천 · 보내기+받기)", host: "smtp.mailgun.org", port: 587, security: "starttls", user: `postmaster@${MAIL_DOMAIN}` },
  { key: "resend", label: "Resend", host: "smtp.resend.com", port: 465, security: "ssl", user: "resend" },
  { key: "ses", label: "Amazon SES (서울)", host: "email-smtp.ap-northeast-2.amazonaws.com", port: 587, security: "starttls", user: "" },
  { key: "custom", label: "직접 입력", host: "", port: 465, security: "ssl", user: "" },
];

export default function MailServer({ me, info }) {
  const [st, setSt] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [f, setF] = React.useState({ preset: "mailgun", host: "smtp.mailgun.org", port: "587", security: "starttls", user: `postmaster@${MAIL_DOMAIN}`, pass: "" });
  const [busy, setBusy] = React.useState("");
  const [to, setTo] = React.useState("");
  const call = async (data) => (await callFn("pnkMailAdmin")(data)).data;
  const load = () => call({ action: "get" }).then((d) => {
    setSt(d); setErr("");
    if (d.server) setF((x) => ({ ...x, preset: PRESETS.find((p) => p.host === d.server.host)?.key || "custom", host: d.server.host, port: String(d.server.port), security: d.server.security, user: d.server.user }));
  }).catch((e) => setErr(e.message || "서버에 연결하지 못했습니다"));
  React.useEffect(() => { load(); }, []);
  const run = async (label, fn) => { setBusy(label); try { await fn(); } catch (e) { window.alert(e.message); } finally { setBusy(""); } };
  const pick = (k) => { const p = PRESETS.find((x) => x.key === k); setF((x) => ({ ...x, preset: k, host: p.host, port: String(p.port), security: p.security, user: p.user || x.user })); };
  const external = info?.mailExternal === true;
  const lastTest = info?.mailServer?.lastTest;
  const A = (href, label) => <a href={href} target="_blank" rel="noreferrer" className="font-black text-navy underline underline-offset-2">{label}</a>;
  const step = (n, done, title, body) => (
    <li className="flex gap-3">
      <span className={cx("w-7 h-7 rounded-full text-[12px] font-black flex items-center justify-center shrink-0", done ? "bg-emerald-500 text-white" : "bg-navy-100 text-navy")}>{done ? "✓" : n}</span>
      <div className="min-w-0 flex-1 pb-4"><div className="text-[14px] font-black">{title}</div><div className="text-[13px] text-[#3A4A66] leading-relaxed mt-0.5">{body}</div></div>
    </li>
  );
  return (
    <Card title={`외부 메일 연결 (@${MAIL_DOMAIN})`} className="xl:col-span-3" right={<Chip tone={external ? "green" : "gray"}>{external ? "연결됨" : "연결 전"}</Chip>}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ol>
          {step(1, true, "가비아 도메인", <>{MAIL_DOMAIN} · 네임서버는 가비아 그대로</>)}
          {step(2, !!st?.server, "Mailgun 가입 → 도메인 추가", <>{A("https://signup.mailgun.com/new/signup", "Mailgun 가입")} → {A("https://app.mailgun.com/mg/sending/domains", "Domains › Add new domain")} 에 <b>{MAIL_DOMAIN}</b> (mg. 붙이지 않기 · 지역 US)</>)}
          {step(3, !!st?.server, "가비아 DNS에 레코드 넣기", <>{A("https://dns.gabia.com", "가비아 DNS 관리")} › {MAIL_DOMAIN} › 설정 › 레코드 추가. Mailgun 이 보여 주는 TXT 2개 · MX 2개 · CNAME 1개를 그대로. 호스트는 <b>@</b>(도메인 자체) 또는 앞부분만(<code>email</code>, <code>xx._domainkey</code>), MX · CNAME 값 끝에는 점(<code>mxa.mailgun.org.</code>). 넣은 뒤 Mailgun 에서 Verify</>)}
          {step(4, !!st?.server, "SMTP 비밀번호 → 오른쪽에 저장", <>Mailgun › Domain settings › SMTP credentials › postmaster@{MAIL_DOMAIN} › Reset password</>)}
          {step(5, external, "테스트 메일 보내기", "내 네이버 · 구글 주소로 도착하면 외부 보내기가 켜집니다")}
          {step(6, false, "받기 연결", <>오른쪽 [받기 주소] 만들기 → {A("https://app.mailgun.com/mg/receiving/routes", "Mailgun › Receiving › Create route")} — Match Recipient <code>.*@{MAIL_DOMAIN}</code> · Forward 에 받기 주소 붙여 넣기</>)}
        </ol>
        <div className="space-y-3">
          {err && <div className="rounded-xl bg-rose-50 text-rose-700 text-[12.5px] font-bold px-3 py-2">{err} — 서버 함수(pnkMailAdmin)가 아직 배포되지 않았을 수 있습니다.</div>}
          <Field label="메일 서비스"><Select value={f.preset} onChange={(e) => pick(e.target.value)} options={PRESETS.map((p) => ({ key: p.key, label: p.label }))} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="보내는 서버" className="col-span-2"><Input value={f.host} onChange={(e) => setF({ ...f, host: e.target.value, preset: "custom" })} /></Field>
            <Field label="포트"><Select custom value={f.port} onChange={(e) => setF({ ...f, port: e.target.value })} options={["465", "587", "2525"]} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="보안"><Select value={f.security} onChange={(e) => setF({ ...f, security: e.target.value })} options={[{ key: "ssl", label: "SSL(465)" }, { key: "starttls", label: "STARTTLS(587)" }]} /></Field>
            <Field label="로그인 아이디" className="col-span-2"><Input value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })} /></Field>
          </div>
          <Field label="비밀번호 · API 키" hint={st?.server?.hasPassword ? "저장되어 있습니다 — 바꿀 때만 넣으세요" : "서버에서 암호화해 보관합니다"}><Input type="password" autoComplete="new-password" value={f.pass} onChange={(e) => setF({ ...f, pass: e.target.value })} placeholder={st?.server?.hasPassword ? "••••••••(저장됨)" : ""} /></Field>
          <Btn disabled={!!busy} onClick={() => run("저장 중…", async () => { await call({ action: "save", host: f.host, port: Number(f.port), security: f.security, user: f.user, pass: f.pass }); setF((x) => ({ ...x, pass: "" })); await load(); })}>{busy === "저장 중…" ? busy : "서버 저장"}</Btn>
          <div className="pt-3 border-t border-[#EEF1F6]">
            <div className="text-[12.5px] font-bold text-[#3A4A66] mb-1">테스트 메일 — 보내는 주소 <b className="tnum">{mailAddr(me.member) || "(내 메일 아이디 없음)"}</b></div>
            <div className="flex gap-2"><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="받을 주소(내 네이버 · 구글)" /><Btn kind="soft" disabled={!!busy} onClick={() => run("보내는 중…", async () => { const r = await call({ action: "test", to }); window.alert(r.ok ? "테스트 메일을 보냈습니다. 받은 편지함(스팸함도)을 확인해 주세요." : `실패: ${r.error}`); await load(); })}>보내기</Btn></div>
            {lastTest && <div className={cx("mt-1.5 text-[12px] font-bold", lastTest.ok ? "text-emerald-700" : "text-rose-600")}>마지막 테스트: {lastTest.ok ? "성공" : `실패 — ${lastTest.err}`} ({lastTest.to})</div>}
          </div>
          <div className="pt-3 border-t border-[#EEF1F6]">
            <div className="text-[12.5px] font-bold text-[#3A4A66] mb-1">받기 주소 (Mailgun Route › Forward 에 넣기)</div>
            <div className="flex gap-2">
              <Input readOnly value={st?.inboundUrl || ""} placeholder="[만들기]를 누르세요" className="tnum text-[12px]" />
              <Btn kind="ghost" onClick={() => st?.inboundUrl && navigator.clipboard?.writeText(st.inboundUrl).then(() => window.alert("복사했습니다."))}>복사</Btn>
              <Btn kind="soft" disabled={!!busy} onClick={() => run("만드는 중…", async () => { if (st?.inboundUrl && !window.confirm("새로 만들면 예전 주소는 바로 막힙니다. 계속할까요?")) return; await call({ action: "token" }); await load(); })}>{st?.inboundUrl ? "새로 만들기" : "만들기"}</Btn>
            </div>
            <div className="mt-1 text-[11.5px] text-[#7A8AA8]">이 주소는 비밀번호와 같습니다. 다른 곳에 올리지 마세요.</div>
          </div>
          {external && <Btn kind="danger" onClick={() => run("끄는 중…", async () => { if (window.confirm("외부 메일 보내기를 끌까요?")) await call({ action: "off" }); })}>외부 보내기 끄기</Btn>}
        </div>
      </div>
    </Card>
  );
}
