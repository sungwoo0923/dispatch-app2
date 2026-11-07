// ======================= cafe-site/src/hub/HubOrderDetail.jsx =======================
// ⭐ 2026-11-06 오더 상세 — 휴대폰: 전체 화면 / PC: 오른쪽 서랍
//  · 차주(운송사): [배차신청] → 10초 카운트다운 동안 [취소] → 확정되면 상세주소·등록자 연락처 공개 + [전화로 취소 요청]
//                  → [상차완료] → [운송완료 + 인수증 사진] → 등록자 평가
//  · 등록자(화주·운송사): 배차된 차주 카드(이름·연락처·차량번호·차종·톤수·적재함·평점·완료·인증) · 배차 취소(재모집) ·
//                  오더 취소 · 운송완료 확인 · 차주 평가 · 정산 메모
//  ⭐ 2026-11-07 (3차) 차주: 확정 = 운송중(위치 자동 공유) → [운송완료]만 → 인수증·전표 올리기 → 계산서 올리기
//                  등록자: 회차 요청(금액) → 차주 수락 · 계산서 확인 + 지급일 · 수동 지급이면 [지급완료]
//  ⭐ 2026-11-06 (2차) · 등록자(+관리자): 배차 확정 ~ 운송완료 동안 [실시간 관제](배차 프로그램과 같은 지도)
//                  · 인수증 · 서류 여러 장 보기 · 저장 · 공유 · 정산(예치금 보류 · 차감 · 지급) 상태
//                  · 배차된 회원: 운송완료 때 인수증 여러 장 · 운송완료 뒤 더 올리기 · 계산서 발행(승인번호) → 서버가 정산
import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { HI, Btn, Badge, Card, Drawer, RouteLine, Ring, Stars, Avatar, Confirm, NUMS, Field, inputCls } from "./hubUi";
import { manwon, fareFitness, referenceFare, dayLabel, ago, ROLES, SOURCE_LABEL, canTake, hasBank, CANCEL_WINDOW_MS, tsMs, maskName, payKind, PAY_HINT, SETTLE_LABEL, kstYmd, stageOf, STAGE_LABEL, payAmountOf, payDateFrom } from "./hubConstants";
import {
  subscribeOrder, subscribePrivate, fetchPrivate, requestDispatch, cancelDispatch, releaseTaker, cancelOrder,
  markDelivered, confirmDispatch, rateOrder, saveSettleNote, subscribeStats, ratingAvg, reportParty, updatePrefs,
  liveActive, issueInvoice, subscribeLive, proposeReturn, answerReturn, confirmInvoice, posterMarkPaid,
} from "./hubApi";
import HubPod from "./HubPod";
const HubLiveTrack = lazy(() => import("./HubLiveTrack"));
const wonF = (n) => `${(Math.round(Number(n) || 0)).toLocaleString("ko-KR")}원`;

// 정산 상태 — 결제 방식별(인수증: 잔액 · 선불/착불: 현금 · 그 밖: 직접)
function SettleCard({ o, isPoster, isTaker, me, run, busy }) {
  const kind = payKind(o.지급방식);
  const s = o.settle || {};
  const F = Number(o.운임) || 0, C = Number(o.수수료) || 0;
  const A = payAmountOf(o);
  const ret = o.회차?.status === "accepted";
  const steps = kind === "deposit"
    ? [["배차 확정, 운임 보류", ["held", "settled"].includes(s.status) || !!s.payoutStatus], ["운송완료", o.status === "delivered"], ["계산서 등록", !!o.invoice], [`계산서 확인${o.invoiceOk?.payDate ? `, ${o.invoiceOk.payDate} 지급` : ""}`, !!o.invoiceOk], ["운송료 지급", s.payoutStatus === "paid"]]
    : kind === "cash" ? [["운송완료, 현금 받음", o.status === "delivered"], [C && !ret ? `수수료 ${wonF(C)} 정산` : "수수료 없음", s.status === "fee_paid" || !C || ret]] : [];
  const canPaid = isPoster && s.payoutId && s.status === "settled" && s.payoutStatus !== "paid";
  return (
    <Card className="p-4" data-testid="settle-card">
      <div className="flex items-center gap-2 mb-1"><HI name="wallet" size={18} className="text-[#2D4C82]" /><span className="text-[16px] font-extrabold text-[#0F1A30]">정산</span><Badge>{o.지급방식 || "협의"}</Badge>
        {s.status && <Badge tone={["settled", "fee_paid"].includes(s.status) ? "navy" : s.status === "hold_failed" || s.status === "fee_owed" ? "line" : "sky"} className="ml-auto"><span data-testid="settle-status">{SETTLE_LABEL[s.status] || s.status}</span></Badge>}
      </div>
      <div className="text-[14px] text-[#55657F] leading-relaxed">{PAY_HINT[kind]}</div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        {[[ret ? "회차비" : "운송료", ret ? A : F], ["수수료", ret ? 0 : C], ["총합계", ret ? A : F + C]].map(([l, v]) => <div key={l} className="rounded-2xl bg-[#F5F8FD] px-2 py-2"><div className="text-[12.5px] font-bold text-[#8592A8]">{l}</div><div className="text-[15.5px] font-extrabold text-[#0F1A30]" style={NUMS}>{wonF(v)}</div></div>)}
      </div>
      {steps.length > 0 && (
        <ol className="mt-3 space-y-1.5">
          {steps.map(([t, done], i) => <li key={t} className="flex items-center gap-2 text-[14.5px]"><span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-[12px] font-extrabold ${done ? "bg-[#0F1A30] text-[#8FB0F0]" : "bg-[#EEF2F8] text-[#8592A8]"}`}>{done ? <HI name="check" size={13} /> : i + 1}</span><span className={`font-bold ${done ? "text-[#0F1A30]" : "text-[#8592A8]"}`}>{t}</span></li>)}
        </ol>
      )}
      {s.status === "hold_failed" && isPoster && <div className="mt-2 rounded-2xl bg-[#F3F7FE] ring-1 ring-inset ring-[#C7D3E8] px-3 py-2.5 text-[14px] font-bold text-[#0F1A30]">잔액이 부족해요. {wonF(s.need)}이 필요해요.</div>}
      {s.status === "fee_owed" && <div className="mt-2 rounded-2xl bg-[#F3F7FE] ring-1 ring-inset ring-[#C7D3E8] px-3 py-2.5 text-[14px] font-bold text-[#0F1A30]">{isTaker ? "수수료가 밀려 있어요. 충전하면 바로 갚아져요." : "차주 수수료를 기다리고 있어요."}</div>}
      {s.dueDate && <div className="mt-3 pt-3 border-t border-[#EEF1F6] text-[14.5px] text-[#3A4A66]" data-testid="payout-due">지급일 <b className="text-[#0F1A30]">{s.dueDate}</b>{s.payoutStatus === "paid" ? ", 지급했어요" : ""}</div>}
      {canPaid && <Btn kind="soft" size="md" className="w-full mt-2" disabled={!!busy} data-testid="btn-poster-paid" onClick={() => run("paid", () => posterMarkPaid(s.payoutId, me), "지급완료로 바꿨어요")}>직접 보냈어요(지급완료)</Btn>}
      {o.invoice && <div className="mt-3 pt-3 border-t border-[#EEF1F6] text-[14.5px] text-[#3A4A66]" data-testid="invoice-info"><b className="text-[#0F1A30]">계산서</b> {o.invoice.no}, {o.invoice.date}, {wonF(o.invoice.amount)}</div>}
    </Card>
  );
}

// 계산서 등록(배차된 회원) — 홈택스 · 발행 프로그램에서 발행한 세금계산서 승인번호(자동 발행 연동은 아직 없음)
function InvoiceForm({ o, busy, run }) {
  const [v, setV] = useState({ no: "", date: kstYmd(), amount: String(payAmountOf(o) || ""), bizNo: "" });
  const [file, setFile] = useState(null);
  const ref = useRef(null);
  return (
    <Card className="p-4" data-testid="invoice-form">
      <div className="flex items-center gap-2 mb-1"><HI name="receipt" size={18} className="text-[#2D4C82]" /><span className="text-[16px] font-extrabold text-[#0F1A30]">계산서 올리기</span></div>
      <div className="text-[14px] text-[#55657F] mb-3">등록자가 확인하면 지급일이 정해져요.</div>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="승인번호" required className="col-span-2"><input className={inputCls} value={v.no} onChange={(e) => setV((p) => ({ ...p, no: e.target.value.slice(0, 40) }))} placeholder="20261107-41000000-12345678" data-testid="inv-no" /></Field>
        <Field label="발행일"><input type="date" className={inputCls} value={v.date} onChange={(e) => setV((p) => ({ ...p, date: e.target.value }))} data-testid="inv-date" /></Field>
        <Field label="공급가액(원)"><input className={`${inputCls} text-right`} inputMode="numeric" value={v.amount} onChange={(e) => setV((p) => ({ ...p, amount: e.target.value.replace(/[^\d]/g, "").slice(0, 10) }))} style={NUMS} data-testid="inv-amount" /></Field>
      </div>
      <button type="button" onClick={() => ref.current?.click()} className="mt-2.5 w-full h-11 rounded-2xl bg-white ring-1 ring-inset ring-[#D6DEEA] text-[14.5px] font-bold text-[#1B2B4B] inline-flex items-center justify-center gap-2"><HI name="upload" size={16} />{file ? file.name.slice(0, 26) : "계산서 파일 첨부(선택)"}</button>
      <input ref={ref} type="file" accept="image/*,application/pdf" className="sr-only" data-testid="inv-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ""; }} />
      <Btn className="w-full mt-2.5" disabled={!!busy} data-testid="inv-submit" onClick={() => run("inv", () => issueInvoice(o, { ...v, file }), "계산서를 올렸어요")}>{busy === "inv" ? "올리고 있어요" : "계산서 올리기"}</Btn>
    </Card>
  );
}
// 등록자 — 계산서 확인 + 지급일(설정의 기본 지급일로 채움)
function InvoiceCheck({ o, me, busy, run }) {
  const [day, setDay] = useState(() => payDateFrom(me.prefs?.post?.payTerm || "days:7"));
  return (
    <Card className="p-4 ring-2 ring-[#2D4C82]" data-testid="invoice-check">
      <div className="flex items-center gap-2 mb-1"><HI name="receipt" size={18} className="text-[#2D4C82]" /><span className="text-[16px] font-extrabold text-[#0F1A30]">계산서를 확인해 주세요</span></div>
      <div className="text-[14.5px] text-[#3A4A66]">승인번호 <b>{o.invoice.no}</b>, {wonF(o.invoice.amount)}</div>
      <Field label="운송료 지급일" className="mt-3"><input type="date" className={inputCls} value={day} min={kstYmd()} onChange={(e) => setDay(e.target.value)} data-testid="inv-paydate" /></Field>
      <Btn className="w-full mt-2.5" disabled={!!busy || !day} data-testid="inv-confirm" onClick={() => run("invok", () => confirmInvoice(o, me, day), "계산서를 확인했어요")}>{busy === "invok" ? "확인하고 있어요" : `확인하고 ${day}에 지급`}</Btn>
    </Card>
  );
}

const myReqAt = new Map(); // 내가 신청한 순간(이 기기 시각), 카운트다운 기준
const telHref = (p) => `tel:${String(p || "").replace(/[^\d+]/g, "")}`;

function TrustLine({ uid, dark }) {
  const [st, setSt] = useState(null);
  useEffect(() => subscribeStats(uid, setSt), [uid]);
  const avg = ratingAvg(st);
  return (
    <span className={`inline-flex items-center gap-2 text-[14.5px] font-bold ${dark ? "text-white/75" : "text-[#55657F]"}`} data-testid="trust-line">
      <span className="inline-flex items-center gap-1"><HI name="star" size={15} fill="currentColor" className={dark ? "text-[#8FB0F0]" : "text-[#2D4C82]"} />{avg ? avg.toFixed(1) : "-"}<span className="font-semibold opacity-70">({st?.ratingCount || 0})</span></span>
      <span className="w-px h-3.5 bg-current opacity-25" aria-hidden="true" />
      <span>완료 {st?.completed || 0}건</span>
    </span>
  );
}

function Row({ k, v, strong }) {
  if (v === undefined || v === null || v === "") return null;
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="w-[88px] shrink-0 text-[15px] font-semibold text-[#8592A8]">{k}</span>
      <span className={`min-w-0 flex-1 text-[15.5px] ${strong ? "font-extrabold text-[#0F1A30]" : "font-bold text-[#1B2B4B]"} break-words`}>{v}</span>
    </div>
  );
}

export default function HubOrderDetail({ id, me, onClose, toast, onEdit, favorites = [], isAdmin = false, adminSlot = null, liveShare = null, onNeedBank }) {
  const [o, setO] = useState(undefined);
  const [detail, setDetail] = useState(null);
  const [match, setMatch] = useState(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState("");
  const [ask, setAsk] = useState(null); // 확인 창
  const [rate, setRate] = useState({ score: 5, comment: "" });
  const [note, setNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const [livePing, setLivePing] = useState(null);
  const [ret, setRet] = useState({ amount: "", reason: "" });

  useEffect(() => subscribeOrder(id, setO), [id]);
  const isPoster = !!o && o.posterUid === me.uid;
  const isTaker = !!o && o.takerUid === me.uid;
  const seesLive = !!o && (isPoster || isAdmin) && liveActive(o);
  useEffect(() => (seesLive ? subscribeLive(id, setLivePing) : (setLivePing(null), undefined)), [id, seesLive]);
  const stage = stageOf(o);

  // 카운트다운(내 신청)
  useEffect(() => {
    if (!o || !isTaker || o.status !== "assigned") { setLeft(0); return; }
    const start = Date.now();
    const tick = () => { const base = myReqAt.get(o.id) || tsMs(o.assignedAt) || start; setLeft(Math.max(0, CANCEL_WINDOW_MS - (Date.now() - base))); };
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [o?.id, o?.status, o?.assignedAt, isTaker]); // eslint-disable-line react-hooks/exhaustive-deps

  // 등록자: 상세 · 배차 정보 실시간
  useEffect(() => {
    if (!isPoster && !isAdmin) return;
    const a = subscribePrivate(id, "detail", setDetail);
    const b = subscribePrivate(id, "match", setMatch);
    return () => { a(); b(); };
  }, [id, isPoster, isAdmin, o?.takerUid]); // eslint-disable-line react-hooks/exhaustive-deps
  const confirmed = isTaker && (stage === "moving" || o?.status === "delivered");
  // 10초가 지나면 "확정" 표시(배차된 회원 · 등록자 화면 중 먼저 본 쪽) — 서버 시각 기준이라 실패하면 잠시 뒤 다시
  useEffect(() => {
    if (!o || o.status !== "assigned" || o.confirmed || !(isTaker || isPoster)) return;
    let stop = false, timer = null;
    const due = () => (isTaker ? left <= 0 : tsMs(o.assignedAt) && Date.now() - tsMs(o.assignedAt) >= CANCEL_WINDOW_MS);
    const attempt = async () => {
      if (stop) return;
      if (due()) { try { await confirmDispatch(o); return; } catch { /* 아직 10초 전(서버 시각) */ } }
      timer = setTimeout(attempt, 1000);
    };
    attempt();
    return () => { stop = true; clearTimeout(timer); };
  }, [o?.id, o?.status, o?.confirmed, o?.assignedAt, isTaker, isPoster, left <= 0]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!confirmed) { if (!isPoster && !isAdmin) setDetail(null); return; }
    let n = 0, stop = false;
    const tryFetch = async () => {
      const d = await fetchPrivate(id, "detail");
      if (stop) return;
      if (d) setDetail(d);
      else if (n++ < 12) setTimeout(tryFetch, 1500);
    };
    tryFetch();
    return () => { stop = true; };
  }, [confirmed, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (o && (isPoster || isTaker)) fetchPrivate(id, `settle_${me.uid}`).then((d) => setNote(d?.text || "")); }, [o?.id, isPoster, isTaker]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (label, fn, okMsg) => {
    setBusy(label);
    try { await fn(); if (okMsg) toast?.(okMsg); }
    catch (e) {
      const denied = String(e?.code || e?.message || "").includes("permission");
      const depo = o && payKind(o.지급방식) === "deposit";
      const deniedMsg = label === "req" ? (depo ? "지금은 신청할 수 없어요. 등록자 잔액이 부족하거나 이미 배차됐어요" : "이미 배차된 오더예요") : "지금은 할 수 없어요";
      toast?.(denied ? deniedMsg : e?.message || "처리하지 못했어요", 3600);
    } finally { setBusy(""); setAsk(null); }
  };

  if (o === undefined) return <Drawer onClose={onClose} title="오더 상세"><div className="p-10 text-center text-[#8592A8]">불러오고 있어요</div></Drawer>;
  if (o === null) return <Drawer onClose={onClose} title="오더 상세"><div className="p-10 text-center text-[16px] font-bold text-[#55657F]">볼 수 없는 오더예요</div></Drawer>;

  const km = o.거리km || 0;
  const fare = Number(o.운임) || 0;
  const fit = fareFitness(fare, o.차량톤수, km, o.운행유형 === "왕복");
  const ref = referenceFare(o.차량톤수, km) * (o.운행유형 === "왕복" ? 1.6 : 1);
  const posterPhone = detail?.posterPhone;
  const eligible = canTake(me) && !isPoster;
  const favPoster = favorites.some((f) => f.uid === o.posterUid);
  const toggleFav = (uid, name) => {
    const list = favorites.some((f) => f.uid === uid) ? favorites.filter((f) => f.uid !== uid) : [...favorites, { uid, name: String(name || "").slice(0, 40) }];
    updatePrefs(me.uid, { ...(me.prefs || {}), favorites: list }).then(() => toast?.(list.length > favorites.length ? "즐겨찾기에 넣었어요" : "즐겨찾기에서 뺐어요")).catch(() => {});
  };
  const retProposed = o.회차?.status === "proposed";
  const label = isTaker && o.status === "assigned" && left > 0 && !o.confirmed ? "확정 대기" : STAGE_LABEL[stage];

  // ── 아래 고정 버튼 영역
  let action = null;
  if (o.status === "open" && eligible && !hasBank(me)) {
    action = (
      <div className="space-y-2" data-testid="need-bank">
        <div className="text-center text-[15px] font-bold text-[#3A4A66]">운송료를 받을 내 계좌를 먼저 등록해 주세요</div>
        <Btn size="xl" className="w-full" onClick={() => onNeedBank?.()} data-testid="btn-need-bank"><HI name="won" size={20} />계좌 등록하기</Btn>
      </div>
    );
  } else if (o.status === "open" && eligible) {
    action = <Btn size="xl" kind="primary" className="w-full" disabled={!!busy} data-testid="btn-request"
      onClick={() => run("req", async () => { myReqAt.set(o.id, Date.now()); try { const r = await requestDispatch(o, me); myReqAt.set(o.id, r.at); } catch (e) { myReqAt.delete(o.id); throw e; } }, "신청했어요. 10초 안에는 취소할 수 있어요")}>
      <HI name="bolt" size={20} />{busy === "req" ? "신청하고 있어요" : `배차신청 ${manwon(fare)}`}
    </Btn>;
  } else if (o.status === "open" && !isPoster) {
    action = <div className="text-center text-[15px] font-bold text-[#55657F] py-2">{me.role === "shipper" ? "화주 계정은 배차신청을 할 수 없어요" : "승인된 차주와 운송사만 신청할 수 있어요"}</div>;
  } else if (isTaker && o.status === "assigned" && left > 0 && !o.confirmed) {
    action = (
      <div className="rounded-[22px] p-4 flex items-center gap-4 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }} data-testid="cancel-window">
        <Ring ms={left} />
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-extrabold">신청했어요</div>
          <div className="text-[14.5px] text-white/70 leading-snug">{Math.ceil(left / 1000)}초 뒤에 확정돼요</div>
        </div>
        <Btn kind="accent" size="lg" disabled={!!busy} data-testid="btn-cancel-quick"
          onClick={() => run("cancel", async () => { await cancelDispatch(o, me); myReqAt.delete(o.id); }, "신청을 취소했어요")}>{busy === "cancel" ? "취소하고 있어요" : "취소"}</Btn>
      </div>
    );
  } else if (isTaker && stage === "moving" && retProposed) {
    action = (
      <div className="space-y-2.5" data-testid="return-answer">
        <div className="rounded-2xl bg-[#F3F7FE] ring-1 ring-inset ring-[#9FB5DA] px-4 py-3">
          <div className="text-[16px] font-extrabold text-[#0F1A30]">회차 요청이 왔어요</div>
          <div className="text-[15px] text-[#3A4A66] mt-0.5">회차비 <b style={NUMS}>{wonF(o.회차.amount)}</b>{o.회차.reason ? `, ${o.회차.reason}` : ""}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Btn kind="ghost" disabled={!!busy} data-testid="btn-return-reject" onClick={() => run("rj", () => answerReturn(o, false), "회차를 거절했어요")}>거절</Btn>
          <Btn disabled={!!busy} data-testid="btn-return-accept" onClick={() => run("ra", () => answerReturn(o, true), "회차를 수락했어요")}>수락</Btn>
        </div>
      </div>
    );
  } else if (isTaker && stage === "moving") {
    action = (
      <div className="space-y-2.5">
        <Btn size="xl" className="w-full" disabled={!!busy} data-testid="btn-delivered" onClick={() => setAsk({ k: "deliver" })}><HI name="flag" size={20} />운송완료</Btn>
        <a href={telHref(posterPhone)} data-testid="btn-call-cancel" className={`h-12 rounded-2xl w-full inline-flex items-center justify-center gap-2 bg-white text-[#0F1A30] ring-2 ring-inset ring-[#0F1A30] text-[16px] font-bold ${posterPhone ? "" : "opacity-50 pointer-events-none"}`}>
          <HI name="phone" size={18} />등록자에게 전화{posterPhone ? ` ${posterPhone}` : ""}
        </a>
      </div>
    );
  } else if (isPoster && stage === "moving") {
    action = retProposed
      ? <div className="text-center text-[15px] font-bold text-[#3A4A66] py-2" data-testid="return-waiting">차주가 회차를 확인하고 있어요</div>
      : <Btn size="xl" kind="ghost" className="w-full" disabled={!!busy} data-testid="btn-return" onClick={() => { setRet({ amount: "", reason: "" }); setAsk({ k: "return" }); }}><HI name="return" size={20} />회차 요청</Btn>;
  }

  const rated = isPoster ? o.ratingByPoster : isTaker ? o.ratingByTaker : null;
  const canRate = o.status === "delivered" && (isPoster || isTaker) && !rated;
  const deposit = payKind(o.지급방식) === "deposit";

  return (
    <Drawer onClose={onClose} title={`${o.상차시도} ${o.상차시군구 || ""} → ${o.하차시도} ${o.하차시군구 || ""}`} sub={`${label}, ${ago(o.createdAt)} 등록`} testid="order-detail">
      <div className="flex-1 overflow-y-auto hub-scroll">
        <div className="p-4 lg:p-5">
          <div className="rounded-[24px] p-5 text-white relative overflow-hidden" style={{ background: "radial-gradient(120% 140% at 90% -20%, #2D4C82 0%, #1B2B4B 45%, #0F1A30 80%, #0B1428 100%)" }}>
            <div className="flex items-center gap-1.5 flex-wrap mb-4">
              <Badge tone={o.status === "open" ? "accent" : "blue"}><span data-testid="detail-status">{label}</span></Badge>
              {o.긴급 && <Badge tone="accent"><HI name="bolt" size={13} />긴급</Badge>}
              {o.운행유형 === "왕복" && <Badge tone="glass">왕복</Badge>}
              {o.예약 && <Badge tone="glass">예약</Badge>}
              <Badge tone="glass">{o.적재 === "혼적" ? "혼적" : "독차"}</Badge>
              {o.지급방식 && <Badge tone="glass">{o.지급방식}</Badge>}
            </div>
            <RouteLine dark big km={km}
              from={`${o.상차시도} ${o.상차시군구 || ""}`} fromSub={`${dayLabel(o.상차일)} ${o.상차시간 || ""} 상차, ${o.상차방법 || "방법 협의"}`}
              to={`${o.하차시도} ${o.하차시군구 || ""}`} toSub={`${dayLabel(o.하차일 || o.상차일)} ${o.하차시간 || ""} 하차, ${o.하차방법 || "방법 협의"}`} />
            <div className="mt-5 pt-4 border-t border-white/10 flex items-end gap-3">
              <div>
                <div className="text-[13.5px] font-bold text-white/55">운송료</div>
                <div className="text-[34px] font-extrabold leading-none mt-1" style={NUMS}>{manwon(fare)}</div>
                <div className="text-[14px] font-bold text-white/60 mt-1.5" style={NUMS}>{km && fare ? `km당 ${Math.round(fare / km).toLocaleString()}원` : ""}{o.수수료 ? `  수수료 ${manwon(o.수수료)}` : ""}</div>
              </div>
              {fit && <div className="ml-auto text-right"><div className="text-[13.5px] font-bold text-[#8FB0F0]">{fit.label}</div><div className="text-[13px] text-white/50">참고 {manwon(ref)}</div></div>}
            </div>
          </div>
        </div>

        <div className="px-4 lg:px-5 pb-5 space-y-3.5">
          {seesLive && (
            <button type="button" onClick={() => setLiveOpen(true)} data-testid="btn-live" className="w-full text-left rounded-[22px] p-4 text-white flex items-center gap-3.5" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
              <span className="relative w-12 h-12 rounded-2xl bg-white/10 ring-1 ring-inset ring-white/15 inline-flex items-center justify-center shrink-0"><HI name="map" size={22} className="text-[#8FB0F0]" />{livePing?.lat != null && <span className="absolute -right-0.5 -top-0.5 w-3 h-3 rounded-full bg-[#34D399] ring-2 ring-[#0F1A30] animate-pulse" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-extrabold">차량 위치 보기</span>
                <span className="block text-[14px] text-white/65 truncate" data-testid="live-ping">{livePing?.lat != null ? `${match?.vehicle?.plate || "차량"}, ${ago(livePing.updatedAt)}, ${Math.round(livePing.speed || 0)}km/h` : "차주 위치를 기다리고 있어요"}</span>
              </span>
              <HI name="chevron" size={20} className="text-[#8FB0F0]" />
            </button>
          )}
          {isTaker && liveActive(o) && (
            <div className="rounded-2xl bg-white ring-1 ring-inset ring-[#DCE3EE] px-4 py-3 flex items-center gap-2.5 text-[14.5px] font-bold text-[#1B2B4B]" data-testid="live-share-state">
              <span className={`w-2.5 h-2.5 rounded-full ${liveShare?.on && liveShare.job?.id === o.id ? "bg-[#34D399] animate-pulse" : "bg-[#A3AEC0]"}`} />
              {liveShare?.denied ? "위치 권한을 켜 주세요" : liveShare?.on && liveShare.job?.id === o.id ? `운송중이에요. 운송완료까지 위치를 보내요${liveShare.last ? ` (${ago(liveShare.last)})` : ""}` : "위치를 준비하고 있어요"}
            </div>
          )}
          {o.회차?.status === "accepted" && <div className="rounded-2xl bg-[#F3F7FE] ring-1 ring-inset ring-[#C7D3E8] px-4 py-3 text-[15px] font-bold text-[#0F1A30]" data-testid="return-done">회차로 끝났어요. 회차비 {wonF(o.회차.amount)}</div>}
          {o.회차?.status === "rejected" && isPoster && stage === "moving" && <div className="rounded-2xl bg-white ring-1 ring-inset ring-[#C7D3E8] px-4 py-3 text-[14.5px] font-bold text-[#3A4A66]">차주가 회차를 거절했어요. 전화로 이야기해 주세요</div>}

          {(isPoster || isAdmin) && o.takerUid && match && (
            <Card className="p-4" data-testid="taker-card">
              <div className="text-[14px] font-bold text-[#2D4C82] mb-3">{o.status === "assigned" && !o.confirmed ? "배차신청, 10초 뒤 확정" : "배차된 차량"}</div>
              <div className="flex items-center gap-3.5">
                <Avatar path={match.photoPath} name={match.name} size={60} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[19px] font-extrabold text-[#0F1A30]" data-testid="taker-name">{match.name}</span>
                    <Badge tone="sky">{ROLES[match.role]?.label || "차주"}</Badge>
                    {match.docsVerified && <Badge tone="navy"><HI name="shield" size={13} />서류 인증</Badge>}
                  </div>
                  <div className="mt-1"><TrustLine uid={o.takerUid} /></div>
                </div>
                <button type="button" aria-label="즐겨찾기" onClick={() => toggleFav(o.takerUid, match.name)} className={`w-11 h-11 rounded-2xl inline-flex items-center justify-center ${favorites.some((f) => f.uid === o.takerUid) ? "text-[#2D4C82] bg-[#EAF0FA]" : "text-[#A3AEC0] bg-[#F5F7FB]"}`}><HI name="heart" size={20} fill={favorites.some((f) => f.uid === o.takerUid) ? "currentColor" : "none"} /></button>
              </div>
              <div className="mt-3 divide-y divide-[#EEF1F6]">
                <Row k="차량번호" v={match.vehicle?.plate} strong />
                <Row k="차종" v={match.vehicle ? `${match.vehicle.ton || ""} ${match.vehicle.type || ""}` : ""} />
                <Row k="적재함" v={match.vehicle?.length ? `길이 ${match.vehicle.length}m${match.vehicle.width ? `, 폭 ${match.vehicle.width}m` : ""}` : ""} />
                <Row k="소속" v={match.companyName && match.companyName !== match.name ? match.companyName : ""} />
                <Row k="회원 구분" v={SOURCE_LABEL[match.source]} />
                <Row k="사업자 상태" v={match.bizStatus} />
                <Row k="연락처" v={match.phone} strong />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a href={telHref(match.phone)} className="h-12 rounded-2xl inline-flex items-center justify-center gap-2 text-white text-[16px] font-bold" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }} data-testid="btn-call-taker"><HI name="phone" size={18} />전화</a>
                {o.status === "assigned"
                  ? <Btn kind="ghost" disabled={!!busy} data-testid="btn-release" onClick={() => setAsk({ k: "release" })}>배차 취소</Btn>
                  : <Btn kind="ghost" onClick={() => setAsk({ k: "report", uid: o.takerUid })}>신고</Btn>}
              </div>
            </Card>
          )}

          {(isPoster || isAdmin || confirmed) && detail ? (
            <Card className="p-4" data-testid="detail-private">
              <div className="text-[14px] font-bold text-[#2D4C82] mb-1 flex items-center gap-1.5"><HI name="lock" size={15} />{isPoster ? "배차가 확정되면 차주에게 보여요" : "상세 정보"}</div>
              <div className="divide-y divide-[#EEF1F6]">
                <Row k="상차지" v={[detail.상차지명, detail.상차지주소].filter(Boolean).join(", ")} strong />
                <Row k="상차 담당" v={[detail.상차담당자, detail.상차연락처].filter(Boolean).join(" ")} />
                <Row k="하차지" v={[detail.하차지명, detail.하차지주소].filter(Boolean).join(", ")} strong />
                <Row k="하차 담당" v={[detail.하차담당자, detail.하차연락처].filter(Boolean).join(" ")} />
                <Row k="메모" v={detail.메모} />
                {(isPoster || isAdmin) && <Row k="의뢰자" v={[detail.의뢰자구분, detail.의뢰자명, detail.의뢰자사업자번호].filter(Boolean).join(" ")} />}
                {!isPoster && <Row k="등록자" v={`${detail.posterCompany || ""} ${detail.posterName || ""}`.trim()} />}
                {!isPoster && <Row k="연락처" v={posterPhone} strong />}
              </div>
              {!isPoster && posterPhone && <a href={telHref(posterPhone)} data-testid="btn-call-poster" className="mt-3 h-12 rounded-2xl w-full inline-flex items-center justify-center gap-2 text-white text-[16px] font-bold" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}><HI name="phone" size={18} />등록자에게 전화</a>}
            </Card>
          ) : (!isPoster && !isAdmin && (
            <Card className="p-4 flex items-start gap-3">
              <span className="w-11 h-11 rounded-2xl bg-[#F2F5FA] text-[#55657F] inline-flex items-center justify-center shrink-0"><HI name="lock" size={19} /></span>
              <div className="text-[15px] text-[#55657F] leading-relaxed"><b className="text-[#0F1A30]">주소와 연락처는 확정되면 보여요</b><br />신청하고 10초가 지나면 열려요.</div>
            </Card>
          ))}

          <Card className="p-4">
            <div className="text-[16px] font-extrabold text-[#0F1A30] mb-1">화물과 차량</div>
            <div className="divide-y divide-[#EEF1F6]">
              <Row k="필요 차량" v={`${o.차량톤수 || ""} ${o.차량종류 || ""}${o.대수 && o.대수 !== "1대" ? ` ${o.대수}` : ""}`} strong />
              <Row k="화물" v={o.화물내용} />
              <Row k="중량" v={o.중량 ? `${o.중량} 이하` : ""} />
              <Row k="파레트" v={o.파레트 ? `${o.파레트}개` : ""} />
              <Row k="상하차" v={[o.상차방법, o.하차방법].filter(Boolean).join(" / ")} />
              <Row k="운행" v={`${o.운행유형 || "편도"}, ${o.적재 === "혼적" ? "혼적" : "독차"}`} />
              <Row k="지불" v={o.지급방식} />
              <Row k="기타" v={o.공개메모} />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <span className="w-12 h-12 rounded-2xl bg-[#EAF0FA] text-[#1B2B4B] inline-flex items-center justify-center shrink-0"><HI name={o.posterRole === "carrier" ? "swap" : "building"} size={22} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap"><span className="text-[17px] font-extrabold text-[#0F1A30] truncate">{o.posterCompany || maskName(o.posterName)}</span><Badge>{o.posterRole === "carrier" ? "운송사" : "화주"}</Badge>{o.posterVerified && <Badge tone="navy"><HI name="shield" size={13} />인증</Badge>}</div>
                <div className="mt-0.5"><TrustLine uid={o.posterUid} /></div>
              </div>
              {!isPoster && <button type="button" aria-label="즐겨찾는 등록자" onClick={() => toggleFav(o.posterUid, o.posterCompany || o.posterName)} className={`w-11 h-11 rounded-2xl inline-flex items-center justify-center ${favPoster ? "text-[#2D4C82] bg-[#EAF0FA]" : "text-[#A3AEC0] bg-[#F5F7FB]"}`} data-testid="btn-fav-poster"><HI name="heart" size={20} fill={favPoster ? "currentColor" : "none"} /></button>}
            </div>
          </Card>

          {(isPoster || isTaker || isAdmin) && o.status === "delivered" && <HubPod o={o} canAdd={isTaker} toast={toast} />}

          {(isPoster || isTaker || isAdmin) && o.takerUid && o.status !== "open" && <SettleCard o={o} isPoster={isPoster} isTaker={isTaker} me={me} run={run} busy={busy} />}
          {isTaker && o.status === "delivered" && !o.invoice && deposit && <InvoiceForm o={o} busy={busy} run={run} />}
          {isPoster && o.status === "delivered" && o.invoice && !o.invoiceOk && deposit && <InvoiceCheck o={o} me={me} busy={busy} run={run} />}
          {isAdmin && adminSlot ? adminSlot(o, detail, match) : null}

          {o.status === "delivered" && (isPoster || isTaker) && (
            <Card className="p-4" data-testid="rate-card">
              <div className="text-[16px] font-extrabold text-[#0F1A30]">{isPoster ? "차주 평가" : "등록자 평가"}</div>
              {rated ? (
                <div className="mt-2 flex items-center gap-2"><Stars value={rated.score} /><span className="text-[15px] font-bold text-[#55657F]">{rated.comment || "평가했어요"}</span></div>
              ) : canRate && (
                <>
                  <div className="mt-1"><Stars value={rate.score} onChange={(n) => setRate((p) => ({ ...p, score: n }))} size={26} /></div>
                  <textarea rows={2} value={rate.comment} onChange={(e) => setRate((p) => ({ ...p, comment: e.target.value }))} placeholder="한 줄 후기(선택)" className="mt-2 w-full px-4 py-3 rounded-2xl border border-[#D6DEEA] text-[16px] outline-none focus:border-[#2D4C82]" />
                  <Btn className="w-full mt-2" disabled={!!busy} data-testid="btn-rate" onClick={() => run("rate", () => rateOrder(o, isPoster, rate.score, rate.comment), "평가를 남겼어요")}>평가 남기기</Btn>
                </>
              )}
            </Card>
          )}

          {(isPoster || isTaker) && o.status !== "open" && (
            <Card className="p-4">
              <div className="text-[16px] font-extrabold text-[#0F1A30] flex items-center gap-2"><HI name="memo" size={18} className="text-[#2D4C82]" />메모 <span className="text-[13.5px] font-semibold text-[#8592A8]">나만 봐요</span></div>
              <textarea rows={2} value={note} onChange={(e) => { setNote(e.target.value); setNoteSaved(false); }} placeholder="입금 예정일, 추가 비용" className="mt-2 w-full px-4 py-3 rounded-2xl border border-[#D6DEEA] text-[16px] outline-none focus:border-[#2D4C82]" data-testid="settle-note" />
              <Btn kind="soft" size="md" className="mt-2" onClick={() => saveSettleNote(o.id, me.uid, note).then(() => setNoteSaved(true)).catch(() => toast?.("저장하지 못했어요"))}>{noteSaved ? "저장했어요" : "메모 저장"}</Btn>
            </Card>
          )}

          {isPoster && ["open", "assigned"].includes(o.status) && (
            <div className="grid grid-cols-2 gap-2">
              {o.status === "open" && <Btn kind="ghost" onClick={() => onEdit?.(o)} data-testid="btn-edit">수정</Btn>}
              <Btn kind="ghost" className={o.status === "open" ? "" : "col-span-2"} onClick={() => setAsk({ k: "cancelOrder" })} data-testid="btn-cancel-order">화물 취소</Btn>
            </div>
          )}
          {o.status === "open" && isPoster && (o.cancelCount || 0) > 0 && <div className="text-[14px] text-[#8592A8] text-center">10초 안 취소 {o.cancelCount}번. 5번이 되면 신청을 더 받지 않아요</div>}
        </div>
      </div>
      {action && <div className="shrink-0 p-4 lg:p-5 bg-white border-t border-[#E2E7EF] pb-[max(16px,env(safe-area-inset-bottom))]">{action}</div>}

      {ask?.k === "deliver" && <Confirm title="운송을 마쳤나요?" body={"등록자에게 알리고 위치 보내기를 멈춰요.\n인수증과 전표는 다음 화면에서 올려 주세요."} okText="운송완료" onCancel={() => setAsk(null)} onOk={() => run("dlv", () => markDelivered(o, me, null), "운송완료! 수고하셨어요")} />}
      {ask?.k === "release" && <Confirm title="배차를 취소할까요?" body={"차주에게 알리고 다시 모집해요.\n먼저 전화로 이야기해 주세요."} okText="배차 취소" onCancel={() => setAsk(null)} onOk={() => run("rel", () => releaseTaker(o, me, "등록자 취소"), "다시 모집하고 있어요")} />}
      {ask?.k === "cancelOrder" && <Confirm title="화물을 취소할까요?" body={o.takerUid ? "차주에게 알리고 운임을 잔액으로 돌려드려요." : "보드에서 내려가요."} okText="화물 취소" onCancel={() => setAsk(null)} onOk={() => run("co", () => cancelOrder(o, me), "취소했어요")} />}
      {ask?.k === "return" && (
        <Confirm title="회차 요청" body="차주가 수락하면 회차비만 정산하고 나머지는 돌려드려요." okText="요청하기" onCancel={() => setAsk(null)} onOk={() => run("ret", () => proposeReturn(o, me, ret.amount, ret.reason), "회차를 요청했어요")}>
          <div className="mt-3 space-y-2.5" data-testid="return-form">
            <Field label="회차비(원)"><input className={`${inputCls} text-right font-extrabold`} inputMode="numeric" value={ret.amount} onChange={(e) => setRet((p) => ({ ...p, amount: (Number(e.target.value.replace(/[^\d]/g, "")) || "").toLocaleString() }))} placeholder="0" style={NUMS} data-testid="return-amount" /></Field>
            <Field label="사유"><input className={inputCls} value={ret.reason} onChange={(e) => setRet((p) => ({ ...p, reason: e.target.value.slice(0, 100) }))} placeholder="예: 화물 준비 안 됨" data-testid="return-reason" /></Field>
          </div>
        </Confirm>
      )}
      {liveOpen && <Suspense fallback={null}><HubLiveTrack order={o} detail={detail} match={match} mobile={typeof window !== "undefined" && window.innerWidth < 768} onClose={() => setLiveOpen(false)} /></Suspense>}
      {ask?.k === "report" && <Confirm title="신고하기" body="노쇼나 허위 정보를 관리자에게 알려요." okText="신고" onCancel={() => setAsk(null)} onOk={() => run("rep", () => reportParty(me, o, ask.uid, "noshow", "등록자 신고"), "신고했어요")} />}
    </Drawer>
  );
}
