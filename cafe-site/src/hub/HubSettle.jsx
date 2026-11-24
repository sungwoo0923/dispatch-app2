// ======================= cafe-site/src/hub/HubSettle.jsx =======================
// ⭐ 2026-11-21 운송사 간 정산 — 허브에서 주고받은 오더를 "거래처(상대 운송사)별 · 월별"로 묶어 한 장으로 본다.
//  돈의 방향(허브 규칙 hubConstants payKind 와 같은 기준)
//   · 인수증 · 예치금(deposit) : 등록자 → 수행사 운임. 허브 잔액에서 자동 지급(따로 보낼 돈 없음)
//   · 선불 · 착불(cash)        : 수행사가 현장에서 받음 → 수수료만 수행사 → 등록자(잔액에서 자동)
//   · 계좌이체 · 계산서 등(direct): 등록자 → 수행사 운임을 서로 직접 보낸다 ← 이 화면에서 챙길 돈
//  같은 상대와 주고받은 돈은 상계(차액)로 보여 줘서 "누가 누구에게 얼마"만 남긴다.
//  상대 이름: 내가 받은 오더 = 공개 본문 posterCompany · 내가 올린 오더 = private/match(등록자만 읽음)
import React, { useEffect, useMemo, useState } from "react";
import { HI, Btn, Badge, Card, Empty, Field, selectCls, NUMS, NAVY_BG } from "./hubUi";
import { payKind, payAmountOf, stageOf, STAGE_LABEL, tsMs, kstYmd, routeText } from "./hubConstants";
import { fetchPrivate } from "./hubApi";
import { wonFull } from "./HubWallet";

const KIND = { deposit: "허브 자동", cash: "현장 결제", direct: "직접 정산" };
const monthOf = (o) => {
  const ms = tsMs(o.deliveredAt) || tsMs(o.confirmedAt) || tsMs(o.assignedAt);
  if (ms) return new Date(ms + 9 * 3600e3).toISOString().slice(0, 7);
  return String(o.상차일 || "").slice(0, 7);
};
const dayOf = (o) => {
  const ms = tsMs(o.deliveredAt) || tsMs(o.assignedAt);
  return ms ? new Date(ms + 9 * 3600e3).toISOString().slice(5, 10).replace("-", ".") : String(o.상차일 || "").slice(5).replace("-", ".");
};
const monthsBack = (n) => Array.from({ length: n }, (_, i) => { const d = new Date(`${kstYmd()}T00:00:00Z`); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); return d.toISOString().slice(0, 7); });
const monthLabel = (ym) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`;

// 오더 한 건 → 내 기준 받을 돈 · 줄 돈
function settleLine(o, myUid) {
  const iPosted = o.posterUid === myUid;
  const kind = payKind(o.지급방식);
  const fare = payAmountOf(o);
  const fee = Number(o.수수료) || 0;
  let recv = 0, pay = 0;
  if (kind === "cash") { if (iPosted) recv = fee; else pay = fee; }
  else if (iPosted) pay = fare; else recv = fare;
  return { iPosted, kind, fare, fee, recv, pay };
}

// ⭐ 2026-11-24 "보내면 돼요 · 받으면 돼요" 안내는 직접 정산(계좌이체 · 계산서) 차액만 — 인수증(허브 잔액 자동) · 선불/착불 수수료(잔액 자동)까지
//  합친 차액을 "보내라"고 안내해 이미 자동으로 오간 돈을 한 번 더 보내게 만들던 것
function settleGuide(g) {
  if (g.direct > 0) return `직접 정산할 돈이 ${wonFull(g.direct)} 남아 있어요. ${g.party}에서 받으면 돼요.`;
  if (g.direct < 0) return `직접 정산할 돈이 ${wonFull(-g.direct)} 남아 있어요. ${g.party}에 보내면 돼요.`;
  return "직접 주고받을 돈은 없어요. 허브 잔액에서 자동으로 정산돼요.";
}

function csvCell(v) { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function download(name, rows) {
  const blob = new Blob(["﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function HubSettle({ me, posts = [], jobs = [], openOrder, toast }) {
  const months = useMemo(() => monthsBack(12), []);
  const [ym, setYm] = useState(months[0]);
  const [dir, setDir] = useState("all"); // all | recv | pay
  const [kindF, setKindF] = useState("all"); // all | deposit | cash | direct
  const [withActive, setWithActive] = useState(false);
  const [open, setOpen] = useState(null);
  const [names, setNames] = useState({}); // 내가 올린 오더 → 수행사 이름

  // 정산 대상: 운송완료(회차 포함) · 선택하면 운송중도 "예정"으로
  const base = useMemo(() => {
    const seen = new Set();
    return [...posts, ...jobs].filter((o) => {
      if (seen.has(o.id)) return false; seen.add(o.id);
      if (!o.takerUid) return false;
      const st = stageOf(o);
      if (st === "cancelled" || st === "open") return false;
      if (!withActive && !(st === "delivered" || st === "returned")) return false;
      return monthOf(o) === ym;
    });
  }, [posts, jobs, ym, withActive]);

  // 내가 올린 오더의 상대(수행사) 이름 — 등록자만 읽는 private/match 에서 한 번만
  useEffect(() => {
    const need = base.filter((o) => o.posterUid === me.uid && names[o.id] === undefined).slice(0, 120);
    if (!need.length) return;
    let on = true;
    Promise.all(need.map((o) => fetchPrivate(o.id, "match").then((m) => [o.id, m?.companyName || m?.name || ""]))).then((pairs) => {
      if (on) setNames((p) => ({ ...p, ...Object.fromEntries(pairs) }));
    });
    return () => { on = false; };
  }, [base, me.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = useMemo(() => base.map((o) => {
    const l = settleLine(o, me.uid);
    const party = l.iPosted ? (names[o.id] || (names[o.id] === undefined ? "확인 중" : "차주 개인")) : (o.posterCompany || o.posterName || "등록자");
    return { o, ...l, party, done: ["delivered", "returned"].includes(stageOf(o)) };
  }).filter((l) => (kindF === "all" || l.kind === kindF) && (dir === "all" || (dir === "recv" ? l.recv > 0 : l.pay > 0))), [base, names, me.uid, kindF, dir]);

  const groups = useMemo(() => {
    const m = new Map();
    lines.forEach((l) => {
      const g = m.get(l.party) || { party: l.party, n: 0, recv: 0, pay: 0, direct: 0, rows: [] };
      g.n++; g.recv += l.recv; g.pay += l.pay; if (l.kind === "direct") g.direct += l.recv - l.pay; g.rows.push(l);
      m.set(l.party, g);
    });
    return [...m.values()].map((g) => ({ ...g, net: g.recv - g.pay, rows: g.rows.sort((a, b) => String(a.o.상차일).localeCompare(String(b.o.상차일))) }))
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [lines]);
  const tot = groups.reduce((a, g) => ({ recv: a.recv + g.recv, pay: a.pay + g.pay, direct: a.direct + g.direct, n: a.n + g.n }), { recv: 0, pay: 0, direct: 0, n: 0 });
  const net = tot.recv - tot.pay;

  const exportCsv = () => {
    const head = ["상대 운송사", "날짜", "화물번호", "구간", "차량", "결제", "정산 방법", "운임", "수수료", "받을 돈", "줄 돈", "단계"];
    const rows = lines.map((l) => [l.party, l.o.상차일, l.o.id, routeText(l.o), `${l.o.차량톤수 || ""} ${l.o.차량종류 || ""}`.trim(), l.o.지급방식 || "", KIND[l.kind], l.fare, l.fee, l.recv, l.pay, STAGE_LABEL[stageOf(l.o)]]);
    download(`허브정산_${ym}.csv`, [head, ...rows, [], ["합계", "", "", "", "", "", "", "", "", tot.recv, tot.pay, ""]]);
    toast?.("정산 내역 파일을 내려받았어요");
  };
  const copyStatement = async (g) => {
    const text = [
      `[로지스웹 허브 정산서] ${monthLabel(ym)}`,
      `${me.companyName || me.name} ↔ ${g.party}`,
      ...g.rows.map((l) => `· ${dayOf(l.o)} ${routeText(l.o)} ${l.o.차량톤수 || ""} ${wonFull(l.recv || -l.pay)} (${KIND[l.kind]})`),
      `받을 돈 ${wonFull(g.recv)} / 줄 돈 ${wonFull(g.pay)} / 차액 ${g.net >= 0 ? "+" : "−"}${wonFull(Math.abs(g.net))}`,
      settleGuide(g),
    ].join("\n");
    try { await navigator.clipboard.writeText(text); toast?.("정산서를 복사했어요. 카카오톡이나 문자에 붙여 넣으면 돼요"); }
    catch { toast?.("복사하지 못했어요"); }
  };

  return (
    <div className="space-y-3.5 max-w-[1100px]" data-testid="hub-settle">
      <div className="rounded-[24px] p-5 lg:p-6 text-white" style={NAVY_BG}>
        <div className="flex items-center gap-2 text-[14.5px] font-bold text-[#8FB0F0]"><HI name="swap" size={17} />{monthLabel(ym)} 운송사 간 정산</div>
        <div className="mt-1 flex items-baseline gap-2 flex-wrap">
          <span className="text-[34px] lg:text-[40px] font-extrabold leading-tight" style={NUMS} data-testid="settle-net">{net >= 0 ? "+" : "−"}{wonFull(Math.abs(net))}</span>
          <span className="text-[15px] font-bold text-white/60">{net >= 0 ? "받을 돈이 더 많아요" : "줄 돈이 더 많아요"}</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-4">
          {[["받을 돈", tot.recv], ["줄 돈", tot.pay], ["직접 정산할 차액", Math.abs(tot.direct)], ["거래", `${tot.n}건 · ${groups.length}곳`]].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-white/[0.07] ring-1 ring-inset ring-white/10 px-3.5 py-2.5 min-w-0">
              <div className="text-[13px] text-white/60 font-bold truncate">{l}</div>
              <div className="text-[18px] font-extrabold truncate" style={NUMS}>{typeof v === "number" ? wonFull(v) : v}</div>
            </div>
          ))}
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Field label="정산 월"><select className={selectCls} value={ym} onChange={(e) => setYm(e.target.value)} data-testid="settle-month">{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></Field>
          <Field label="돈의 방향"><select className={selectCls} value={dir} onChange={(e) => setDir(e.target.value)} data-testid="settle-dir"><option value="all">전체</option><option value="recv">받을 돈만</option><option value="pay">줄 돈만</option></select></Field>
          <Field label="정산 방법"><select className={selectCls} value={kindF} onChange={(e) => setKindF(e.target.value)} data-testid="settle-kind"><option value="all">전체</option><option value="direct">직접 정산(계좌이체 · 계산서)</option><option value="deposit">허브 자동(인수증)</option><option value="cash">현장 결제(선불 · 착불)</option></select></Field>
          <Field label="포함 범위"><select className={selectCls} value={withActive ? "1" : "0"} onChange={(e) => setWithActive(e.target.value === "1")} data-testid="settle-range"><option value="0">운송완료만</option><option value="1">운송중 포함(예정)</option></select></Field>
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-[13.5px] text-[#5F6E87] leading-snug flex-1 min-w-[200px]">인수증은 허브 잔액에서 자동으로 오가요. <b className="text-[#1B2B4B]">직접 정산</b> 금액만 서로 보내면 돼요.</span>
          <Btn kind="ghost" size="md" onClick={exportCsv} disabled={!lines.length} data-testid="settle-csv"><HI name="file" size={16} />엑셀 받기</Btn>
        </div>
      </Card>

      {groups.length === 0 ? <Empty icon="swap" title={`${monthLabel(ym)}에 정산할 거래가 없어요`} desc="허브에서 오더를 주고받고 운송이 끝나면 여기에 상대 운송사별로 모여요" /> : (
        <Card className="overflow-hidden" data-testid="settle-groups">
          <div className="hidden md:grid grid-cols-[minmax(0,1.6fr)_70px_repeat(3,minmax(0,1fr))_120px] gap-3 px-5 h-11 items-center bg-[#F7F9FC] border-b border-[#EEF1F6] text-[13.5px] font-bold text-[#5F6E87]">
            <span>상대 운송사</span><span className="text-right">건수</span><span className="text-right">받을 돈</span><span className="text-right">줄 돈</span><span className="text-right">차액</span><span />
          </div>
          {groups.map((g) => {
            const on = open === g.party;
            return (
              <div key={g.party} className="border-b border-[#EEF1F6] last:border-0">
                <button type="button" onClick={() => setOpen(on ? null : g.party)} aria-expanded={on} className="w-full text-left px-4 md:px-5 py-3.5 grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.6fr)_70px_repeat(3,minmax(0,1fr))_120px] gap-x-3 gap-y-1 items-center hover:bg-[#F9FBFE]" data-testid="settle-row">
                  <span className="min-w-0 flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-xl bg-[#EAF0FA] text-[#1B2B4B] inline-flex items-center justify-center shrink-0 font-extrabold text-[15px]">{String(g.party).slice(0, 1)}</span>
                    <span className="min-w-0"><span className="block text-[16px] font-extrabold text-[#0F1A30] truncate">{g.party}</span>{g.direct !== 0 && <span className="block text-[13px] font-bold text-[#2D4C82]">직접 정산 {g.direct > 0 ? "받을" : "보낼"} {wonFull(Math.abs(g.direct))}</span>}</span>
                  </span>
                  <span className="md:hidden text-right text-[17px] font-extrabold text-[#0F1A30]" style={NUMS}>{g.net >= 0 ? "+" : "−"}{wonFull(Math.abs(g.net))}</span>
                  <span className="hidden md:block text-right text-[15px] font-bold text-[#3A4A66]" style={NUMS}>{g.n}건</span>
                  <span className="hidden md:block text-right text-[15px] font-bold text-[#1B2B4B]" style={NUMS}>{wonFull(g.recv)}</span>
                  <span className="hidden md:block text-right text-[15px] font-bold text-[#55657F]" style={NUMS}>{wonFull(g.pay)}</span>
                  <span className="hidden md:block text-right text-[16px] font-extrabold text-[#0F1A30]" style={NUMS}>{g.net >= 0 ? "+" : "−"}{wonFull(Math.abs(g.net))}</span>
                  <span className="hidden md:flex justify-end"><HI name="down" size={18} className={`text-[#5F6E87] transition ${on ? "rotate-180" : ""}`} /></span>
                  <span className="md:hidden col-span-2 text-[13.5px] text-[#55657F]" style={NUMS}>{g.n}건 · 받을 {wonFull(g.recv)} · 줄 {wonFull(g.pay)}</span>
                </button>
                {on && (
                  <div className="px-4 md:px-5 pb-4 bg-[#F9FBFE]" data-testid="settle-detail">
                    <div className="rounded-2xl bg-white ring-1 ring-inset ring-[#E2E7EF] divide-y divide-[#EEF1F6]">
                      {g.rows.map((l) => (
                        <button key={l.o.id} type="button" onClick={() => openOrder?.(l.o)} className="w-full text-left px-3.5 py-2.5 flex items-center gap-3 hover:bg-[#F5F8FD]">
                          <span className="w-12 shrink-0 text-[13.5px] font-bold text-[#5F6E87]" style={NUMS}>{dayOf(l.o)}</span>
                          <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold text-[#0F1A30] truncate">{routeText(l.o)}</span><span className="block text-[13px] text-[#66758E] truncate">{l.iPosted ? "내가 올림" : "내가 받음"} · {l.o.차량톤수} {l.o.차량종류} · {l.o.지급방식 || "-"}<span className="sm:hidden"> · {KIND[l.kind]}</span>{l.done ? "" : " · 운송중"}</span></span>
                          <Badge tone={l.kind === "direct" ? "navy" : "line"} className="hidden sm:inline-flex">{KIND[l.kind]}</Badge>
                          <span className={`w-[96px] sm:w-[104px] shrink-0 text-right text-[15.5px] font-extrabold ${l.recv ? "text-[#1B2B4B]" : "text-[#55657F]"}`} style={NUMS}>{l.recv ? "+" : l.pay ? "−" : ""}{wonFull(l.recv || l.pay)}</span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className="text-[14.5px] font-bold text-[#1B2B4B] flex-1 min-w-[200px]" data-testid="settle-guide">{settleGuide(g)}</span>
                      <Btn kind="soft" size="md" onClick={() => copyStatement(g)} data-testid="settle-copy"><HI name="memo" size={16} />정산서 복사</Btn>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
