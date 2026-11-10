// ======================= pnk-site/src/pages/Customers.jsx =======================
// 고객사 · 가입자 — 관리자 관리센터(/platform)와 같은 데이터를 본사 관점으로 한눈에(읽기 전용, 대표 계정)
//  처리(승인 · 요금제 · 청구)는 관리자 관리센터 버튼으로 넘어간다.
import React from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PLAN_DEFAULTS } from "../../../src/planCore.js";
import { useMeCtx } from "../App";
import { fmtTime, invoiceByMonth, loadPlatform, tsMs, ymd, won } from "../pnkApi";
import { Btn, Card, Chip, Empty, Hero, HeroBtn, Input, Loading, Stat, Tabs, cx } from "../ui";
import Icon from "../icons";

const PLATFORM = "https://app.logisweb.co.kr/platform";
const NAVY = ["#0F1A30", "#1B2B4B", "#2D4C82", "#4B6CB7", "#8FA6D6", "#C9D3E4"];
const planName = (id) => PLAN_DEFAULTS.find((p) => p.id === id)?.name || (id ? id : "미지정");
const planPrice = (id) => PLAN_DEFAULTS.find((p) => p.id === id)?.price || 0;
const months = (n) => { const out = []; const d = new Date(); d.setDate(1); for (let i = n - 1; i >= 0; i -= 1) out.push(ymd(new Date(d.getFullYear(), d.getMonth() - i, 1)).slice(0, 7)); return out; };
const tip = { borderRadius: 12, border: "1px solid #E3E8F0", fontSize: 12 };

export default function Customers() {
  const me = useMeCtx();
  const [data, setData] = React.useState(undefined);
  const [busy, setBusy] = React.useState(false);
  const [tab, setTab] = React.useState("list");
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState("staff");
  const load = (force) => { setBusy(true); loadPlatform(force).then(setData).finally(() => setBusy(false)); };
  React.useEffect(() => { load(false); }, []);

  if (!me.owner) return <><Hero title="고객사 · 가입자" /><Card><Empty icon="shield">대표(최고관리자) 계정에서만 볼 수 있습니다.</Empty></Card></>;
  if (data === undefined) return <Loading />;
  if (!data) return <Card><Empty icon="alert">고객사 데이터를 읽지 못했습니다.</Empty></Card>;

  const mm = ymd().slice(0, 7);
  const t = data.totals;
  const ms = months(12);
  const trend = ms.map((m) => ({ m: `${m.slice(2, 4)}.${m.slice(5)}`, 운송사: data.monthly[m]?.companies || 0, 직원: data.monthly[m]?.staff || 0, 기사: data.monthly[m]?.drivers || 0 }));
  const planDist = {};
  data.companies.forEach((c) => { const k = planName(c.plan?.planId); planDist[k] = (planDist[k] || 0) + 1; });
  const pie = Object.entries(planDist).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const mrr = data.companies.reduce((a, c) => a + planPrice(c.plan?.planId), 0);
  const invM = invoiceByMonth(data.invoices);
  const invTrend = months(6).map((m) => ({ m: `${Number(m.slice(5))}월`, 청구: invM[m]?.billed || 0, 입금: invM[m]?.paid || 0 }));
  const thisInv = invM[mm] || { billed: 0, paid: 0, overdue: 0 };
  const queue = data.pendingTransport.length + data.pendingShipper.length + t.newInquiries + t.openErrors + data.support.length;

  const list = data.companies
    .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "new" ? (b.firstAt || 0) - (a.firstAt || 0) : (b[sort] || 0) - (a[sort] || 0));
  const invOf = (c) => c.invoices.find((v) => v.month === mm);

  return (
    <div>
      <Hero title="고객사 · 가입자" desc={`로지스웹을 쓰는 운송사 · 직원 · 기사 · 화주 현황 (불러온 시각 ${fmtTime(data.at)})`}>
        <HeroBtn sub icon="refresh" onClick={() => load(true)}>{busy ? "불러오는 중…" : "새로고침"}</HeroBtn>
        <a href={PLATFORM} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-[13.5px] font-black bg-navy text-white hover:bg-navy-700">관리자 관리센터에서 처리 <Icon name="link" size={14} /></a>
      </Hero>

      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3 md:gap-4 mb-5">
        <Stat icon="building" label="고객 운송사" value={t.companies} sub={`화주 계정 ${data.shipperUsers}`} />
        <Stat icon="users" label="직원 계정" value={t.staff} sub={`승인 대기 ${t.pendingStaff}`} />
        <Stat icon="truck" label="기사 계정" value={t.drivers} sub="기사앱 가입" />
        <Stat icon="money" label="예상 월 구독료" value={`${Math.round(mrr / 10000).toLocaleString()}만`} sub="요금제 정가 기준" />
        <Stat icon="wallet" label="이달 입금" value={`${Math.round(thisInv.paid / 10000).toLocaleString()}만`} sub={`청구 ${won(thisInv.billed)}`} />
        <Stat icon="bell" label="처리할 일" value={queue} sub="승인 · 문의 · 오류 · 원격지원" onClick={() => setTab("queue")} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-5 mb-5">
        <Card title="월별 신규 가입 (12개월)" className="xl:col-span-2">
          <div className="h-[260px] -ml-3">
            <ResponsiveContainer>
              <BarChart data={trend} barGap={2}>
                <CartesianGrid stroke="#EEF1F6" vertical={false} />
                <XAxis dataKey="m" tick={{ fontSize: 11.5, fill: "#7A8AA8" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11.5, fill: "#7A8AA8" }} axisLine={false} tickLine={false} width={34} />
                <Tooltip contentStyle={tip} cursor={{ fill: "#F4F6FA" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="운송사" fill="#0F1A30" radius={[6, 6, 0, 0]} />
                <Bar dataKey="직원" fill="#2D4C82" radius={[6, 6, 0, 0]} />
                <Bar dataKey="기사" fill="#8FA6D6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="요금제 분포">
          <div className="h-[200px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
                  {pie.map((_, i) => <Cell key={i} fill={NAVY[i % NAVY.length]} />)}
                </Pie>
                <Tooltip contentStyle={tip} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-1.5 mt-1">
            {pie.map((p, i) => (
              <div key={p.name} className="flex items-center gap-2 text-[12.5px] font-bold"><span className="w-2.5 h-2.5 rounded-full" style={{ background: NAVY[i % NAVY.length] }} />{p.name}<span className="ml-auto tnum text-[#5A6A86]">{p.value}곳</span></div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="최근 6개월 청구 · 입금" className="mb-5">
        <div className="h-[200px] -ml-3">
          <ResponsiveContainer>
            <BarChart data={invTrend}>
              <CartesianGrid stroke="#EEF1F6" vertical={false} />
              <XAxis dataKey="m" tick={{ fontSize: 12, fill: "#7A8AA8" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `${Math.round(v / 10000)}만`} tick={{ fontSize: 11.5, fill: "#7A8AA8" }} axisLine={false} tickLine={false} width={48} />
              <Tooltip contentStyle={tip} formatter={(v) => won(v)} cursor={{ fill: "#F4F6FA" }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="청구" fill="#C9D3E4" radius={[6, 6, 0, 0]} />
              <Bar dataKey="입금" fill="#1B2B4B" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Tabs items={[{ key: "list", label: `고객사 ${data.companies.length}` }, { key: "queue", label: "처리할 일", badge: queue }]} value={tab} onChange={setTab} />

      {tab === "list" ? (
        <Card pad={false}>
          <div className="p-4 flex flex-col sm:flex-row gap-2 border-b border-[#EEF1F6]">
            <div className="relative sm:w-[280px]"><Icon name="search" size={16} className="absolute left-3 top-3 text-[#7A8AA8]" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="회사 이름 검색" className="pl-9" /></div>
            <div className="flex gap-1 flex-wrap sm:ml-auto">
              {[["staff", "직원 많은 순"], ["drivers", "기사 많은 순"], ["new", "최근 가입"], ["name", "이름"]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setSort(k)} className={cx("h-9 px-3 rounded-xl text-[12.5px] font-black", sort === k ? "bg-navy text-white" : "bg-navy-50 text-[#5A6A86]")}>{l}</button>
              ))}
            </div>
          </div>
          {/* PC 표 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead><tr className="text-left text-[12px] text-[#7A8AA8] bg-[#F8FAFD]">
                {["회사", "요금제", "직원", "기사", "승인 대기", "처음 가입", "이달 청구"].map((h) => <th key={h} className="px-4 py-2.5 font-bold whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {list.map((c) => { const v = invOf(c); return (
                  <tr key={c.name} className="border-t border-[#EEF1F6] hover:bg-[#F8FAFD]">
                    <td className="px-4 py-3"><div className="font-black">{c.name}</div>{(c.rep || c.phone) && <div className="text-[12px] text-[#7A8AA8]">{c.rep} {c.phone}</div>}</td>
                    <td className="px-4 py-3"><Chip tone={c.plan ? "navy" : "gray"}>{planName(c.plan?.planId)}</Chip></td>
                    <td className="px-4 py-3 tnum font-bold">{c.staff}<span className="text-[#7A8AA8] font-medium">{c.admins ? ` (관리 ${c.admins})` : ""}</span></td>
                    <td className="px-4 py-3 tnum font-bold">{c.drivers}</td>
                    <td className="px-4 py-3">{c.pending ? <Chip tone="red">{c.pending}명</Chip> : <span className="text-[#C0C8D6]">-</span>}</td>
                    <td className="px-4 py-3 tnum text-[#5A6A86]">{c.firstAt ? ymd(new Date(c.firstAt)) : "-"}</td>
                    <td className="px-4 py-3">{v ? <span className="flex items-center gap-2"><span className="tnum font-bold">{won(v.amount)}</span><Chip tone={v.status === "입금완료" ? "green" : v.status === "연체" ? "red" : "gray"}>{v.status || "미청구"}</Chip></span> : <span className="text-[#C0C8D6]">-</span>}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
          {/* 휴대폰 카드 */}
          <ul className="md:hidden divide-y divide-[#EEF1F6]">
            {list.map((c) => { const v = invOf(c); return (
              <li key={c.name} className="px-4 py-3">
                <div className="flex items-center gap-2"><span className="font-black flex-1 truncate">{c.name}</span><Chip tone={c.plan ? "navy" : "gray"}>{planName(c.plan?.planId)}</Chip></div>
                <div className="mt-1 text-[12.5px] text-[#5A6A86]">직원 {c.staff} · 기사 {c.drivers}{c.pending ? ` · 승인 대기 ${c.pending}` : ""}{v ? ` · ${v.status || "미청구"} ${won(v.amount)}` : ""}</div>
              </li>
            ); })}
          </ul>
          {list.length === 0 && <Empty>검색 결과가 없습니다.</Empty>}
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
          <QueueCard title="운송사 가입 승인 대기" rows={data.pendingTransport} line={(a) => [a.companyName, `${a.name || a.representative || ""} ${a.phone || ""}`, a.createdAt]} />
          <QueueCard title="화주사 가입 승인 대기" rows={data.pendingShipper} line={(a) => [a.companyName || a.name, a.phone || "", a.createdAt]} />
          <QueueCard title="새 도입 문의 (홈페이지)" rows={data.inquiries.filter((x) => !x.status || x.status === "신규")} line={(a) => [a.companyName || "업체", `${a.name || ""} ${a.phone || ""}`, a.createdAt]} />
          <QueueCard title="처리 안 한 오류 신고" rows={data.errors.filter((r) => r.status !== "done")} line={(a) => [`${a.companyName || "-"} · ${a.section || ""}`, String(a.message || "").slice(0, 60), a.createdAt]} />
          <QueueCard title="원격지원 요청" rows={data.support} line={(a) => [a.companyName || a.name || "-", a.message || "", a.createdAt]} />
        </div>
      )}
    </div>
  );
}

function QueueCard({ title, en, rows, line }) {
  return (
    <Card title={title} right={<Chip tone={rows.length ? "red" : "gray"}>{rows.length}건</Chip>} pad={false}>
      {rows.length === 0 ? <div className="py-6 text-center text-[13px] text-[#7A8AA8]">처리할 것이 없습니다.</div> : (
        <ul className="divide-y divide-[#EEF1F6]">
          {rows.slice().sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)).slice(0, 8).map((r, i) => { const [a, b, at] = line(r); return (
            <li key={r.id || i} className="px-5 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1"><div className="text-[13.5px] font-black truncate">{a}</div><div className="text-[12px] text-[#7A8AA8] truncate">{b}</div></div>
              <span className="text-[11.5px] text-[#7A8AA8] shrink-0">{fmtTime(at)}</span>
            </li>
          ); })}
        </ul>
      )}
      {rows.length > 0 && <div className="px-5 py-3 border-t border-[#EEF1F6]"><a href={PLATFORM} target="_blank" rel="noreferrer"><Btn kind="soft" className="w-full">관리자 관리센터에서 처리</Btn></a></div>}
    </Card>
  );
}
