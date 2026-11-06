// ======================= cafe-site/src/CafeOrderDetail.jsx =======================
// ⭐ 2026-11-06 로지스웹 허브 — 오더 상세 + 운송사 간 거래 흐름
//  · 다른 운송사: [이 오더 잡기] → (선택) 보낼 차량·기사·메시지 → 요청 보냄 / 철회
//  · 올린 운송사: 들어온 요청 목록 → [수락] 하나 → 매칭완료(다른 요청은 자동 마감) · 정산 메모(청구 운임·수수료) · 매칭 취소(배차 전)
//  · 매칭된 운송사: 정확한 주소·현장 담당자·올린 운송사 연락처 공개 + 귀사 배차 프로그램에 오더 자동 등록
//  · 운송완료 후 서로 평가(별점)
//  · 예전 게시글(v 없음)은 예전 10초 배차신청 흐름을 그대로 보여 준다.
import React, { useState, useEffect, useRef } from "react";
import { APPLY_CANCEL_WINDOW_MS, MARKET_NAME, isV2, ACTIVE_MATCH } from "./cafeConstants";
import {
  applyToCafeOrder, cancelCafeApply, finalizeCafeApplyIfDue, deleteCafeOrder, cancelCafeOrder, fetchCafeContact,
  fetchPrivate, requestOrder, withdrawRequest, subscribeRequests, subscribeMyRequest, acceptRequest, rejectRequest,
  cancelMatch, importToMyProgram, rateParty,
} from "./cafeApi";
import { GRID_BG, NUM, Icon, StatusBadge, Tag, UrgentTag, Stepper, Stars, Sheet, inputCls, btnPrimary, btnPrimaryStyle, btnGhost, shortDate, timeAgo } from "./ui";
import { routeOf, fareText, cargoLine, TrustLine } from "./CafeOrderCard";

const digits = (p) => String(p || "").replace(/[^\d]/g, "");
function Cell({ label, value, strong }) {
  if (!value) return null;
  return (
    <div className="rounded-xl bg-white ring-1 ring-inset ring-[#E8ECF3] px-4 py-3 min-w-0">
      <div className="text-[13px] font-semibold text-[#8592A8]">{label}</div>
      <div className={`text-[15px] mt-0.5 break-words ${strong ? "font-extrabold text-[#0F1A30]" : "font-semibold text-[#1F2A44]"}`}>{value}</div>
    </div>
  );
}
function ContactRow({ who, name, phone }) {
  if (!phone && !name) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-white/10 last:border-0">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-white/55">{who}</div>
        <div className="text-[16px] font-bold text-white truncate">{name || "-"} <span className="ml-1 font-semibold text-[#CFE0FF]" style={NUM}>{phone}</span></div>
      </div>
      {phone && (
        <div className="flex gap-2 shrink-0">
          <a href={`tel:${digits(phone)}`} className="h-10 px-3.5 rounded-xl bg-white text-[#0F1A30] text-[14px] font-bold inline-flex items-center gap-1.5"><Icon name="phone" size={15} />전화</a>
          <a href={`sms:${digits(phone)}`} className="h-10 px-3.5 rounded-xl ring-1 ring-inset ring-white/30 text-white text-[14px] font-bold inline-flex items-center gap-1.5"><Icon name="chat" size={15} />문자</a>
        </div>
      )}
    </div>
  );
}
function Section({ title, right, children, className = "" }) {
  return (
    <section className={`rounded-2xl bg-white ring-1 ring-inset ring-[#E2E7EF] ${className}`}>
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1"><h4 className="text-[15px] font-extrabold text-[#0F1A30]">{title}</h4>{right}</div>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </section>
  );
}
const REQ_LABEL = { pending: "대기중", accepted: "수락됨", rejected: "거절됨", closed: "마감", withdrawn: "철회", cancelled: "매칭취소" };

export default function CafeOrderDetail({ order, profile, onClose, onEdit, trustOf = () => null }) {
  const v2 = isV2(order);
  const isMine = order.posterUid === profile.uid;
  const isTaker = v2 && order.takerUid === profile.uid && ACTIVE_MATCH.includes(order.status);
  const canPrivate = isMine || isTaker;
  const { from, to } = routeOf(order);

  const [detail, setDetail] = useState(null);
  const [settle, setSettle] = useState(null);
  const [requests, setRequests] = useState([]);
  const [myReq, setMyReq] = useState(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offer, setOffer] = useState({ 차량번호: "", 기사명: "", 기사연락처: "", 메시지: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rateScore, setRateScore] = useState(0);
  const [rateText, setRateText] = useState("");

  // 비공개 상세(정확한 주소·연락처) — 올린 운송사 / 매칭된 운송사만
  useEffect(() => {
    if (!v2 || !canPrivate) { setDetail(null); return; }
    fetchPrivate(order.id, "detail").then(setDetail);
    if (isMine) fetchPrivate(order.id, "settle").then(setSettle);
  }, [v2, canPrivate, isMine, order.id, order.status]);
  useEffect(() => { if (v2 && isMine) return subscribeRequests(order.id, setRequests); }, [v2, isMine, order.id]);
  useEffect(() => { if (v2 && !isMine && profile.isCompany) return subscribeMyRequest(order.id, profile.uid, setMyReq); }, [v2, isMine, order.id, profile.uid, profile.isCompany]);
  // 매칭된 운송사 — 아직 프로그램에 안 들어갔으면 바로 넣는다(서버 함수가 먼저 했으면 그대로 둔다)
  useEffect(() => {
    if (isTaker && !order.takerOrderId) importToMyProgram(order, profile).catch(() => {});
  }, [isTaker, order.takerOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn) => {
    setErr(""); setBusy(true);
    try { await fn(); } catch (e) { setErr(e?.message || "처리 중 오류가 발생했습니다."); } finally { setBusy(false); }
  };

  const pendingReqs = requests.filter((r) => r.status === "pending");
  const acceptedReq = requests.find((r) => r.status === "accepted");
  const myRating = isMine ? order.ratingByPoster : order.ratingByTaker;

  return (
    <Sheet onClose={onClose} width={680}>
      {/* 머리 — 경로·운임·진행 단계 */}
      <div className="px-5 sm:px-6 pt-5 pb-5 text-white shrink-0" style={GRID_BG}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={order.status} />
          {order.긴급 && <UrgentTag />}
          {order.운행유형 === "왕복" && <Tag className="!bg-white/10 !text-white">왕복</Tag>}
          {order.혼적 && <Tag className="!bg-white/10 !text-white">혼적</Tag>}
          {!v2 && <Tag className="!bg-white/10 !text-white/70">이전 게시판 글</Tag>}
          <button type="button" onClick={onClose} aria-label="닫기" className="ml-auto w-10 h-10 rounded-xl hover:bg-white/10 flex items-center justify-center text-white/75"><Icon name="close" size={20} /></button>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[#8FB0F0]">상차</div>
            <div className="text-[21px] sm:text-[24px] font-extrabold truncate leading-tight">{from}</div>
          </div>
          <span className="w-10 h-10 rounded-full bg-white/10 ring-1 ring-inset ring-white/20 flex items-center justify-center"><Icon name="arrow" size={18} /></span>
          <div className="min-w-0 text-right">
            <div className="text-[13px] font-semibold text-[#8FB0F0]">하차</div>
            <div className="text-[21px] sm:text-[24px] font-extrabold truncate leading-tight">{to}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-white/[0.07] ring-1 ring-inset ring-white/10 px-4 py-2.5">
            <div className="text-[13px] font-semibold text-white/60">상차일시</div>
            <div className="text-[16px] font-bold" style={NUM}>{shortDate(order.상차일) || "협의"} {order.상차시간 || ""}</div>
          </div>
          <div className="rounded-xl bg-white/[0.07] ring-1 ring-inset ring-white/10 px-4 py-2.5 text-right">
            <div className="text-[13px] font-semibold text-white/60">제시 운임{order.지급방식 ? ` · ${order.지급방식}` : ""}</div>
            <div className="text-[20px] font-extrabold" style={NUM}>{fareText(order)}</div>
          </div>
        </div>
        {v2 && order.status !== "cancelled" && <div className="mt-4"><Stepper status={order.status} dark /></div>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
        {/* 올린 운송사 — 들어온 요청 */}
        {v2 && isMine && (
          <Section title={`잡기 요청 ${requests.filter((r) => r.status !== "withdrawn").length}건`}>
            {requests.filter((r) => r.status !== "withdrawn").length === 0 ? (
              <div className="py-4 text-[14px] text-[#8592A8]">아직 요청이 없습니다. 다른 운송사가 [이 오더 잡기]를 누르면 여기에 실시간으로 뜹니다.</div>
            ) : (
              <ul className="divide-y divide-[#EEF1F6]">
                {requests.filter((r) => r.status !== "withdrawn").map((r) => (
                  <li key={r.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[16px] font-extrabold text-[#0F1A30]">{r.takerCompany}</span>
                        <span className="text-[13px] font-bold px-2 h-6 inline-flex items-center rounded-full bg-[#F2F5FA] text-[#3A4A66]">{REQ_LABEL[r.status] || r.status}</span>
                        <TrustLine trust={trustOf(r.takerCompany)} />
                      </div>
                      <div className="text-[14px] text-[#55657F] mt-0.5">
                        {[r.takerName, r.takerPhone].filter(Boolean).join(" · ")}
                        {(r.차량번호 || r.기사명) && <> · 차량 <b className="text-[#0F1A30]">{[r.차량번호, r.기사명].filter(Boolean).join(" ")}</b></>}
                      </div>
                      {r.메시지 && <div className="text-[14px] text-[#3A4A66] mt-1 bg-[#F7F9FC] rounded-lg px-3 py-2">“{r.메시지}”</div>}
                    </div>
                    {r.status === "pending" && order.status === "open" && (
                      <div className="flex gap-2 shrink-0">
                        <button type="button" disabled={busy} onClick={() => run(() => rejectRequest(order, r, profile))} className={`${btnGhost} !h-11`}>거절</button>
                        <button type="button" disabled={busy} onClick={() => { if (confirm(`${r.takerCompany}에 이 오더를 맡길까요?\n수락하면 정확한 주소·연락처가 공개되고, 그 운송사 배차 프로그램에 오더가 등록됩니다.`)) run(() => acceptRequest(order, r, profile, requests)); }} className={`${btnPrimary} !h-11`} style={btnPrimaryStyle}><Icon name="check" size={16} />수락</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {pendingReqs.length > 1 && order.status === "open" && <div className="mt-1 text-[13.5px] text-[#8592A8]">한 곳을 수락하면 나머지 요청은 자동으로 마감 알림이 갑니다.</div>}
          </Section>
        )}

        {/* 매칭된 운송사 — 내 프로그램 연동 */}
        {isTaker && (
          <Section title="귀사 배차 프로그램 연동" right={<Icon name="link" size={17} className="text-[#8592A8]" />}>
            {order.takerOrderId ? (
              <div className="text-[14px] text-[#3A4A66] leading-relaxed">
                로지스웹 배차 프로그램에 오더가 등록되었습니다 <span className="font-bold text-[#0F1A30]">(거래처: {order.companyName})</span>.
                프로그램에서 기사를 배차하면 이 오더와 올린 운송사 화면에 <b>배차완료 → 운송완료</b>가 자동으로 반영됩니다.
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="text-[14px] text-[#3A4A66] flex-1">배차 프로그램에 오더를 넣는 중입니다…</div>
                <button type="button" disabled={busy} onClick={() => run(() => importToMyProgram(order, profile))} className={`${btnGhost} !h-11`}>다시 시도</button>
              </div>
            )}
            {order.driverMasked && <div className="mt-2 text-[14px] text-[#55657F]">배정 차량 · <b className="text-[#0F1A30]" style={NUM}>{order.driverMasked}</b></div>}
          </Section>
        )}
        {v2 && !isMine && !isTaker && ACTIVE_MATCH.includes(order.status) && (
          <div className="rounded-2xl bg-white ring-1 ring-inset ring-[#E2E7EF] px-4 py-3.5 text-[14px] text-[#55657F]">이 오더는 다른 운송사와 매칭되어 마감되었습니다.</div>
        )}

        {/* 비공개 상세 */}
        {v2 && (canPrivate ? (
          <div className="rounded-2xl px-4 py-4 text-white" style={GRID_BG}>
            <div className="flex items-center gap-2 text-[14px] font-bold text-[#8FB0F0]"><Icon name="shield" size={16} />{isMine ? "비공개 정보 (매칭된 운송사에게만 공개)" : "매칭 완료 — 상세 정보 공개"}</div>
            {!detail ? <div className="mt-2 text-[14px] text-white/70">불러오는 중…</div> : (
              <div className="mt-2 space-y-2.5">
                {[["상차지", detail.상차지명, detail.상차지주소], ["하차지", detail.하차지명, detail.하차지주소]].map(([l, n, a]) => (
                  <div key={l} className="rounded-xl bg-white/[0.07] ring-1 ring-inset ring-white/10 px-3.5 py-2.5">
                    <div className="text-[13px] font-semibold text-white/55">{l}</div>
                    <div className="text-[16px] font-bold">{n || "-"}</div>
                    <div className="text-[14px] text-white/75 break-words">{a || "주소 미입력"}</div>
                  </div>
                ))}
                {detail.메모 && <div className="text-[14px] text-white/80 whitespace-pre-wrap">메모 · {detail.메모}</div>}
                <div>
                  <ContactRow who="상차지 담당자" name={detail.상차지담당자} phone={detail.상차지담당자번호} />
                  <ContactRow who="하차지 담당자" name={detail.하차지담당자} phone={detail.하차지담당자번호} />
                  {isTaker && <ContactRow who={`올린 운송사 · ${detail.posterCompany || order.companyName}`} name={detail.posterName} phone={detail.posterPhone} />}
                  {isMine && acceptedReq && <ContactRow who={`수행 운송사 · ${acceptedReq.takerCompany}`} name={acceptedReq.takerName} phone={acceptedReq.takerPhone} />}
                  {isMine && acceptedReq?.기사연락처 && <ContactRow who={`배정 기사 · ${acceptedReq.차량번호 || ""}`} name={acceptedReq.기사명} phone={acceptedReq.기사연락처} />}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-2xl bg-[#EAF0FA] ring-1 ring-inset ring-[#D5E0F2] px-4 py-3.5">
            <Icon name="eyeoff" size={20} className="text-[#2D4C82] shrink-0 mt-0.5" />
            <div className="text-[14px] text-[#1B2B4B] leading-relaxed"><b>정확한 상·하차지 주소, 현장 담당자와 연락처</b>는 올린 운송사가 요청을 수락해 매칭되면 공개됩니다. 지금은 시·구까지만 보입니다.</div>
          </div>
        ))}

        {/* 올린 운송사 — 정산 메모 */}
        {v2 && isMine && settle && (settle.청구운임 || settle.제시운임) ? (
          <Section title="정산 메모 (우리 회사만 보임)" right={<Icon name="receipt" size={17} className="text-[#8592A8]" />}>
            <div className="grid grid-cols-3 gap-2">
              {[["청구 운임", settle.청구운임], ["제시 운임", settle.제시운임 || order.운임값], ["예상 수수료", settle.수수료]].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-[#F7F9FC] px-3 py-2.5"><div className="text-[13px] font-semibold text-[#8592A8]">{l}</div><div className="text-[16px] font-extrabold text-[#0F1A30]" style={NUM}>{v ? `${Number(v).toLocaleString()}원` : "-"}</div></div>
              ))}
            </div>
            {settle.거래처명 && <div className="mt-2 text-[14px] text-[#55657F]">거래처 · {settle.거래처명}</div>}
          </Section>
        ) : null}

        {/* 요청한 운송사 — 내 요청 상태 */}
        {v2 && !isMine && myReq && myReq.status !== "withdrawn" && !isTaker && (
          <div className="rounded-2xl ring-2 ring-[#2D4C82] bg-white px-4 py-3.5">
            <div className="flex items-center gap-2"><Icon name="clock" size={17} className="text-[#2D4C82]" /><span className="text-[15px] font-extrabold text-[#0F1A30]">내 잡기 요청 · {REQ_LABEL[myReq.status] || myReq.status}</span></div>
            <div className="mt-1 text-[14px] text-[#55657F]">
              {myReq.status === "pending" ? "올린 운송사가 수락하면 알림이 오고, 상세 정보가 공개되며 귀사 프로그램에 오더가 자동 등록됩니다."
                : myReq.status === "rejected" ? "올린 운송사가 요청을 거절했습니다." : myReq.status === "closed" ? "다른 운송사와 매칭되어 마감되었습니다." : myReq.status === "cancelled" ? "올린 운송사가 매칭을 취소했습니다." : ""}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Cell label="화물 · 차량" value={cargoLine(order) || "-"} strong />
          <Cell label="하차일시" value={order.하차일 ? `${shortDate(order.하차일)} ${order.하차시간 || ""}` : (order.하차시간 || "-")} strong />
          <Cell label="상차방법" value={order.상차방법} />
          <Cell label="하차방법" value={order.하차방법} />
          <Cell label="옵션" value={[order.운행유형 === "왕복" && "왕복", order.혼적 && "혼적", order.경유여부 && "경유"].filter(Boolean).join(" · ") || null} />
          <Cell label="등록" value={timeAgo(order.createdAt)} />
        </div>
        {(order.공개메모 || (!v2 && order.메모)) && <Cell label="메모" value={order.공개메모 || order.메모} />}

        {/* 올린 운송사 */}
        <div className="flex items-center gap-3 rounded-2xl bg-white ring-1 ring-inset ring-[#E2E7EF] px-4 py-3.5">
          <span className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-[17px] font-bold shrink-0" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}>{String(order.companyName || "?").slice(0, 1)}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-[#8592A8]">올린 운송사</div>
            <div className="text-[16px] font-extrabold text-[#0F1A30] truncate">{order.companyName || "-"}</div>
            <TrustLine trust={trustOf(order.companyName)} />
          </div>
          {isMine && <Tag strong>내 오더</Tag>}
          {v2 && order.takerCompany && <div className="text-right"><div className="text-[13px] font-semibold text-[#8592A8]">수행 운송사</div><div className="text-[15px] font-extrabold text-[#0F1A30]">{order.takerCompany}</div></div>}
        </div>

        {/* 평가 */}
        {v2 && (isMine || isTaker) && order.status === "delivered" && (
          <Section title={isMine ? `${order.takerCompany} 평가` : `${order.companyName} 평가`}>
            {myRating ? (
              <div className="flex items-center gap-2"><Stars value={myRating.score} /><span className="text-[14px] text-[#55657F]">{myRating.comment || "평가 완료"}</span></div>
            ) : (
              <div className="space-y-2.5">
                <Stars value={rateScore} onChange={setRateScore} size={26} />
                <input className={inputCls} value={rateText} onChange={(e) => setRateText(e.target.value)} placeholder="한 줄 평가 (선택)" maxLength={200} />
                <button type="button" disabled={!rateScore || busy} onClick={() => run(() => rateParty(order, isMine ? "poster" : "taker", rateScore, rateText))} className={`${btnPrimary} w-full`} style={btnPrimaryStyle}>평가 남기기</button>
              </div>
            )}
          </Section>
        )}

        {!v2 && <LegacyBlock order={order} profile={profile} isMine={isMine} />}

        {err && <div className="rounded-xl bg-white ring-1 ring-inset ring-[#DCE3EE] px-4 py-3 text-[14px] font-bold text-[#0F1A30]">⚠ {err}</div>}
      </div>

      {/* 하단 액션 */}
      <div className="px-4 sm:px-5 py-3.5 border-t border-[#E2E7EF] bg-white flex gap-2.5 shrink-0 pb-[max(14px,env(safe-area-inset-bottom))]">
        {isMine ? (
          <>
            {order.status === "open" || order.status === "cancelled" || !v2 ? (
              <button type="button" disabled={busy} onClick={() => { if (confirm("이 오더를 삭제할까요?")) run(async () => { await deleteCafeOrder(order.id); onClose(); }); }} className={btnGhost}>삭제</button>
            ) : null}
            {order.status === "open" && (
              <button type="button" disabled={busy} onClick={() => { if (confirm("이 오더 모집을 마감(취소)할까요?")) run(() => cancelCafeOrder(order.id)); }} className={btnGhost}>모집 취소</button>
            )}
            {v2 && order.status === "matched" && (
              <button type="button" disabled={busy} onClick={() => { if (confirm("매칭을 취소하고 다시 모집할까요? 상대 운송사에 알림이 갑니다.")) run(() => cancelMatch(order, profile)); }} className={btnGhost}>매칭 취소</button>
            )}
            {order.status === "open" && (
              <button type="button" onClick={() => onEdit(order, detail, settle)} className={`${btnPrimary} flex-1`} style={btnPrimaryStyle}>수정</button>
            )}
            {order.status !== "open" && <div className="flex-1 flex items-center justify-center text-[14px] font-semibold text-[#8592A8]">{v2 && ACTIVE_MATCH.includes(order.status) ? `${order.takerCompany || "수행 운송사"} 수행 중` : ""}</div>}
          </>
        ) : !v2 ? null : !profile.isCompany ? (
          <div className="flex-1 text-center text-[14px] font-semibold text-[#55657F] py-2">오더 잡기는 로지스웹 <b>운송사 계정</b>으로 로그인하면 할 수 있습니다.</div>
        ) : order.status === "open" && order.companyName === profile.companyName ? (
          <div className="flex-1 text-center text-[14px] font-semibold text-[#8592A8] py-2">우리 회사 직원이 올린 오더입니다.</div>
        ) : order.status === "open" && myReq?.status === "pending" ? (
          <button type="button" disabled={busy} onClick={() => run(() => withdrawRequest(order, profile))} className={`${btnGhost} flex-1`}>요청 철회</button>
        ) : order.status === "open" && myReq?.status !== "rejected" ? (
          <button type="button" disabled={busy} onClick={() => setOfferOpen(true)} className={`${btnPrimary} flex-1 !h-[52px] !text-[16px]`} style={btnPrimaryStyle}>
            <Icon name="bolt" size={18} />이 오더 잡기
          </button>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[14px] font-semibold text-[#8592A8] py-2">{isTaker ? "귀사가 수행 중인 오더입니다" : "마감된 오더입니다"}</div>
        )}
      </div>

      {offerOpen && (
        <Sheet onClose={() => setOfferOpen(false)} width={520}>
          <div className="px-5 pt-5 pb-4 text-white" style={GRID_BG}>
            <div className="text-[13px] font-semibold text-[#8FB0F0]">{MARKET_NAME}</div>
            <div className="text-[20px] font-extrabold mt-0.5">이 오더 잡기</div>
            <div className="text-[14px] text-white/70 mt-1">{from} → {to} · {fareText(order)}</div>
          </div>
          <div className="p-5 space-y-3 overflow-y-auto">
            <div className="text-[14px] text-[#55657F] leading-relaxed">보낼 차량을 미리 알려 주면 수락될 가능성이 높아집니다(선택). 수락되면 귀사 배차 프로그램에 이 차량으로 바로 배차된 오더가 생깁니다.</div>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="block"><span className="text-[13.5px] font-bold text-[#55657F]">차량번호</span><input className={`${inputCls} mt-1`} value={offer.차량번호} onChange={(e) => setOffer({ ...offer, 차량번호: e.target.value })} placeholder="예: 경기12가3456" /></label>
              <label className="block"><span className="text-[13.5px] font-bold text-[#55657F]">기사명</span><input className={`${inputCls} mt-1`} value={offer.기사명} onChange={(e) => setOffer({ ...offer, 기사명: e.target.value })} placeholder="선택" /></label>
            </div>
            <label className="block"><span className="text-[13.5px] font-bold text-[#55657F]">기사 연락처</span><input className={`${inputCls} mt-1`} inputMode="tel" value={offer.기사연락처} onChange={(e) => setOffer({ ...offer, 기사연락처: e.target.value })} placeholder="선택 · 매칭 후 올린 운송사에게만 보입니다" /></label>
            <label className="block"><span className="text-[13.5px] font-bold text-[#55657F]">메시지</span><textarea className={`${inputCls} mt-1 !h-auto py-3`} rows={3} value={offer.메시지} onChange={(e) => setOffer({ ...offer, 메시지: e.target.value })} placeholder="예: 오후 2시 상차 가능합니다" /></label>
            {err && <div className="text-[14px] font-bold text-[#0F1A30]">⚠ {err}</div>}
          </div>
          <div className="px-5 py-3.5 border-t border-[#E2E7EF] bg-white flex gap-2.5 pb-[max(14px,env(safe-area-inset-bottom))]">
            <button type="button" onClick={() => setOfferOpen(false)} className={btnGhost}>닫기</button>
            <button type="button" disabled={busy} onClick={() => run(async () => { await requestOrder(order, profile, offer); setOfferOpen(false); })} className={`${btnPrimary} flex-1`} style={btnPrimaryStyle}>
              <Icon name="bolt" size={17} />{busy ? "보내는 중…" : "잡기 요청 보내기"}
            </button>
          </div>
        </Sheet>
      )}
    </Sheet>
  );
}

// (예전 게시글) 10초 배차신청 흐름 — 예전 글만
function LegacyBlock({ order, profile, isMine }) {
  const [remain, setRemain] = useState(null);
  const [contact, setContact] = useState(null);
  const [applying, setApplying] = useState(false);
  const timer = useRef(null);
  const isApplicant = order.applicantUid === profile.uid;
  useEffect(() => {
    if (order.status !== "applying" || !order.applyRequestedAt?.toMillis) { setRemain(null); return; }
    const ms = order.applyRequestedAt.toMillis();
    const tick = () => {
      const left = APPLY_CANCEL_WINDOW_MS - (Date.now() - ms);
      setRemain(Math.max(0, Math.ceil(left / 1000)));
      if (left <= 0) finalizeCafeApplyIfDue(order.id).catch(() => {});
    };
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [order.status, order.applyRequestedAt, order.id]);
  useEffect(() => {
    if (order.status === "confirmed" && (isMine || isApplicant)) fetchCafeContact(order.id).then(setContact);
    else setContact(null);
  }, [order.status, order.id, isMine, isApplicant]);
  const apply = async () => {
    setApplying(true);
    try {
      await applyToCafeOrder(order.id, { uid: profile.uid, name: profile.name, nickname: profile.nickname, phone: profile.phone });
      timer.current = setTimeout(() => { finalizeCafeApplyIfDue(order.id).catch(() => {}); }, APPLY_CANCEL_WINDOW_MS + 500);
    } catch (e) { alert(e.message || "신청 중 오류가 발생했습니다."); } finally { setApplying(false); }
  };
  return (
    <Section title="이전 게시판 배차신청">
      {order.상차지주소 || order.하차지주소 ? <div className="text-[14px] text-[#55657F] mb-2">{order.상차지명} {order.상차지주소} → {order.하차지명} {order.하차지주소}</div> : null}
      {order.status === "open" && !isMine && <button type="button" disabled={applying} onClick={apply} className={`${btnPrimary} w-full`} style={btnPrimaryStyle}>{applying ? "신청 중…" : "배차신청 (10초 안에 취소 가능)"}</button>}
      {order.status === "applying" && (isApplicant ? (
        <div className="flex items-center gap-3"><div className="flex-1 text-[14px] font-bold text-[#0F1A30]">배차 확정까지 {remain ?? "-"}초 — 지금은 취소할 수 있습니다</div><button type="button" onClick={() => { clearTimeout(timer.current); cancelCafeApply(order.id, profile.uid).catch(() => {}); }} className={`${btnGhost} !h-11`}>신청취소</button></div>
      ) : <div className="text-[14px] text-[#55657F]">다른 회원이 배차신청을 진행하고 있습니다.</div>)}
      {order.status === "confirmed" && (isMine || isApplicant) && (
        <div className="rounded-xl px-4 py-3 text-white" style={GRID_BG}>
          {!contact ? <div className="text-[14px] text-white/70">연락처를 불러오는 중…</div>
            : isMine ? <ContactRow who="신청자" name={order.applicantName || order.applicantNickname} phone={contact.applicantPhone} />
              : <ContactRow who="등록자" name={order.companyName} phone={contact.posterPhone} />}
        </div>
      )}
      {order.status === "confirmed" && !(isMine || isApplicant) && <div className="text-[14px] text-[#55657F]">배차가 확정된 오더입니다.</div>}
    </Section>
  );
}
