// ======================= src/BillingCenter.jsx =======================
// 💳 운송사(고객사) 관리자용 "구독 · 결제" — 관리자메뉴 › 환경 설정 › 구독 · 결제
//  ① 지금 요금제 + 넷플릭스식 비교표(다른 요금제로 변경 요청 → 관리센터 '오늘 할 일'에 뜸)
//  ② 월 청구서(관리센터 › 청구 › 수납 관리에서 확정한 금액) + "입금했어요" 알림
//  ③ 결제 수단: 무통장 입금(지금 바로) · 카드 자동결제(PG 계약 후 켜짐) · 세금계산서
import React from "react";
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import { PlanMatrix, PLAN_DEFAULTS, usePlan, usePublicPricing } from "./plans";

const MONO = "'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace";
const won = (v) => `${Math.round(Number(v) || 0).toLocaleString()}`;
const STATUS_TONE = { 미청구: "bg-[#EEF2F8] text-[#5B6B85]", 청구: "bg-[#2D4C82] text-white", 입금완료: "bg-[#0F1A30] text-white", 연체: "bg-[#0F1A30] text-[#8FB0F0]" };
// 카드 자동결제 — 토스페이먼츠 빌링 등 PG 계약 후 VITE_PG_CLIENT_KEY 를 넣으면 버튼이 켜진다
const PG_READY = !!import.meta.env.VITE_PG_CLIENT_KEY;

function Card({ code, title, right, children }) {
  return (
    <div className="bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 h-[50px] border-b border-[#EEF1F6] bg-[#F7F9FC]">
        <div className="flex items-center gap-2"><span className="text-[10px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>{code}</span><span className="text-[15.5px] font-black text-[#0F1A30]">{title}</span></div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function BillingCenter({ userEmail = "", userName = "", canEdit = true }) {
  const { planId, company } = usePlan();
  const pricing = usePublicPricing();
  const [invoices, setInvoices] = React.useState(null);
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "platformInvoices"), where("company", "==", company)),
      (s) => setInvoices(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.month).localeCompare(String(a.month)))), () => setInvoices([]));
  }, [company]);
  const plan = pricing.plans.find((p) => p.id === planId);
  const unpaid = (invoices || []).filter((v) => v.status === "청구" || v.status === "연체");

  const request = async (p) => {
    if (!canEdit) return;
    try {
      await addDoc(collection(db, "planRequests"), { company, from: planId || "", to: p.id, toName: p.name, feature: "", by: userEmail, byName: userName, status: "요청", createdAt: serverTimestamp() });
      setMsg(`${p.name} 요금제로 변경을 요청했습니다. 확인 후 바로 적용해 드립니다.`);
    } catch (e) { setMsg(`요청 실패: ${e.message}`); }
  };
  const notifyPaid = async (v) => {
    const name = window.prompt("입금자명을 입력해 주세요", company);
    if (name == null) return;
    const d = new Date();
    try {
      await updateDoc(doc(db, "platformInvoices", v.id), { payNotice: { name: name.trim() || company, date: `${d.getMonth() + 1}/${d.getDate()}`, by: userEmail, at: d.toISOString() } });
      setMsg("입금 알림을 보냈습니다. 확인되면 상태가 '입금완료'로 바뀝니다.");
    } catch (e) { setMsg(`알림 실패: ${e.message}`); }
  };

  return (
    <div className="space-y-4">
      {/* 현재 요금제 */}
      <div className="relative rounded-[24px] overflow-hidden text-white px-7 py-6" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <span className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
        <div className="relative flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>SUBSCRIPTION · {company}</div>
            <div className="text-[26px] font-black mt-1">{plan ? `${plan.name} 요금제` : "기본 이용 (전체 기능)"}</div>
            <div className="text-[13px] text-white/60 mt-0.5">{plan ? `직원 ${plan.seats}명 · 월 오더 ${Number(plan.orders).toLocaleString()}건 포함 · 초과 시 계정 ${won(pricing.extraSeat || 15000)}원/명, 오더 ${won(pricing.extraOrder || 50)}원/건` : "요금제가 지정되지 않아 모든 기능을 쓰고 있습니다."}</div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3 min-w-[160px]"><div className="text-[11.5px] font-bold text-white/55">월 이용료</div><div className="text-[22px] font-black tabular-nums" style={{ fontFamily: MONO }}>{plan ? won(plan.price) : "-"}<span className="text-[12px] text-white/50 ml-1">원</span></div></div>
            <div className="rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3 min-w-[160px]"><div className="text-[11.5px] font-bold text-white/55">미납 청구</div><div className="text-[22px] font-black tabular-nums" style={{ fontFamily: MONO }}>{won(unpaid.reduce((a, v) => a + Number(v.amount || 0), 0))}<span className="text-[12px] text-white/50 ml-1">원</span></div></div>
          </div>
        </div>
      </div>
      {msg && <div className="rounded-xl bg-[#0F1A30] text-white px-5 py-3 text-[13.5px] font-black">{msg}</div>}

      <Card code="PLANS" title="요금제 비교 · 변경">
        <PlanMatrix plans={pricing.plans.length ? pricing.plans : PLAN_DEFAULTS} current={planId} onPick={canEdit ? request : undefined} />
        <div className="mt-3 text-[12px] text-[#7A89A3]">상향은 요청 즉시 적용되고 남은 기간 차액만 청구됩니다. 하향은 다음 결제일부터 적용됩니다.</div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-start">
        <Card code="INVOICES" title="청구서">
          {invoices === null ? <div className="py-10 text-center text-[#9AA9C3]">불러오는 중…</div> : invoices.length === 0 ? <div className="py-10 text-center text-[#9AA9C3]">아직 발행된 청구서가 없습니다.</div> : (
            <div className="divide-y divide-[#EEF1F6] -mx-5 -my-5">
              {invoices.map((v) => (
                <div key={v.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-[86px] text-[15px] font-black tabular-nums text-[#0F1A30]" style={{ fontFamily: MONO }}>{v.month}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[16px] font-black tabular-nums text-[#0F1A30]" style={{ fontFamily: MONO }}>{won(v.amount)}원 <span className="text-[11.5px] font-bold text-[#7A89A3]">VAT 별도 · 합계 {won(Number(v.amount || 0) * 1.1)}원</span></div>
                    {v.payNotice && v.status !== "입금완료" && <div className="text-[12px] font-bold text-[#2D4C82]">입금 알림 보냄 · {v.payNotice.name} {v.payNotice.date}</div>}
                    {v.paidAt && <div className="text-[12px] font-bold text-[#7A89A3]">입금일 {v.paidAt}</div>}
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-[12px] font-black ${STATUS_TONE[v.status || "미청구"] || STATUS_TONE.미청구}`}>{v.status || "미청구"}</span>
                  {canEdit && (v.status === "청구" || v.status === "연체") && !v.payNotice && <button type="button" onClick={() => notifyPaid(v)} className="h-9 px-3.5 rounded-xl bg-[#0F1A30] text-white text-[12.5px] font-black">입금했어요</button>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card code="PAYMENT" title="결제 수단">
          <div className="space-y-3">
            <div className="rounded-2xl border border-[#0F1A30] p-4">
              <div className="flex items-center justify-between"><div className="text-[14.5px] font-black text-[#0F1A30]">무통장 입금 (계좌이체)</div><span className="px-2 py-0.5 rounded-md bg-[#0F1A30] text-white text-[11px] font-black">사용 가능</span></div>
              <div className="mt-2 text-[14px] font-black text-[#1B2B4B] tabular-nums" style={{ fontFamily: MONO }}>{pricing.bank || "입금 계좌는 청구서와 함께 안내드립니다"}</div>
              <div className="text-[12px] text-[#7A89A3] mt-1">입금자명은 회사명으로 해 주세요. 입금 후 청구서의 "입금했어요"를 누르면 더 빨리 확인됩니다.</div>
            </div>
            <div className="rounded-2xl border border-[#DCE3EE] p-4">
              <div className="flex items-center justify-between"><div className="text-[14.5px] font-black text-[#0F1A30]">카드 자동결제</div><span className={`px-2 py-0.5 rounded-md text-[11px] font-black ${PG_READY ? "bg-[#0F1A30] text-white" : "bg-[#EEF2F8] text-[#5B6B85]"}`}>{PG_READY ? "사용 가능" : "준비 중"}</span></div>
              <div className="text-[12px] text-[#7A89A3] mt-1">카드를 한 번 등록하면 매월 결제일에 자동으로 결제되고 영수증이 메일로 갑니다.</div>
              <button type="button" disabled={!PG_READY} className="mt-2.5 w-full h-10 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black disabled:bg-[#CBD5E3]">카드 등록하기</button>
            </div>
            <div className="rounded-2xl border border-[#DCE3EE] p-4">
              <div className="text-[14.5px] font-black text-[#0F1A30]">전자세금계산서</div>
              <div className="text-[12px] text-[#7A89A3] mt-1">매월 청구 확정 시 회사관리에 등록된 사업자 정보로 발행됩니다. 담당 이메일이 바뀌면 회사관리에서 수정해 주세요.</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
