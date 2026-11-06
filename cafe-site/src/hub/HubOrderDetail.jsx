// ======================= cafe-site/src/hub/HubOrderDetail.jsx =======================
// ⭐ 2026-11-06 오더 상세 — 휴대폰: 전체 화면 / PC: 오른쪽 서랍
//  · 차주(운송사): [배차신청] → 10초 카운트다운 동안 [취소] → 확정되면 상세주소·등록자 연락처 공개 + [전화로 취소 요청]
//                  → [상차완료] → [운송완료 + 인수증 사진] → 등록자 평가
//  · 등록자(화주·운송사): 배차된 차주 카드(이름·연락처·차량번호·차종·톤수·적재함·평점·완료·인증) · 배차 취소(재모집) ·
//                  오더 취소 · 운송완료 확인 · 차주 평가 · 정산 메모
import React, { useEffect, useRef, useState } from "react";
import { HI, Btn, Badge, Card, Drawer, RouteLine, Ring, Stars, Avatar, Confirm, NUMS } from "./hubUi";
import { manwon, fareFitness, referenceFare, dayLabel, ago, STATUS, ROLES, SOURCE_LABEL, canTake, CANCEL_WINDOW_MS, tsMs, maskName } from "./hubConstants";
import {
  subscribeOrder, subscribePrivate, fetchPrivate, requestDispatch, cancelDispatch, releaseTaker, cancelOrder,
  markLoaded, markDelivered, confirmDispatch, rateOrder, saveSettleNote, subscribeStats, ratingAvg, fileUrl, reportParty, updatePrefs,
} from "./hubApi";

const myReqAt = new Map(); // 내가 신청한 순간(이 기기 시각) — 카운트다운 기준
const telHref = (p) => `tel:${String(p || "").replace(/[^\d+]/g, "")}`;

function TrustLine({ uid, dark }) {
  const [st, setSt] = useState(null);
  useEffect(() => subscribeStats(uid, setSt), [uid]);
  const avg = ratingAvg(st);
  return (
    <span className={`inline-flex items-center gap-2 text-[14.5px] font-bold ${dark ? "text-white/75" : "text-[#55657F]"}`} data-testid="trust-line">
      <span className="inline-flex items-center gap-1"><HI name="star" size={15} fill="currentColor" className={dark ? "text-[#8FB0F0]" : "text-[#2D4C82]"} />{avg ? avg.toFixed(1) : "-"}<span className="font-semibold opacity-70">({st?.ratingCount || 0})</span></span>
      <span className="opacity-40">·</span>
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

export default function HubOrderDetail({ id, me, onClose, toast, onEdit, favorites = [] }) {
  const [o, setO] = useState(undefined);
  const [detail, setDetail] = useState(null);
  const [match, setMatch] = useState(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState("");
  const [ask, setAsk] = useState(null); // 확인 창
  const [pod, setPod] = useState(null);
  const [podUrl, setPodUrl] = useState("");
  const [rate, setRate] = useState({ score: 5, comment: "" });
  const [note, setNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const podInput = useRef(null);

  useEffect(() => subscribeOrder(id, setO), [id]);
  const isPoster = !!o && o.posterUid === me.uid;
  const isTaker = !!o && o.takerUid === me.uid;
  const st = o ? STATUS[o.status] || STATUS.open : STATUS.open;

  // 카운트다운(내 신청)
  useEffect(() => {
    if (!o || !isTaker || o.status !== "assigned") { setLeft(0); return; }
    const start = Date.now();
    // 기준 시각: 이 기기에서 신청이 끝난 순간(서버 배차 시각보다 조금 늦다 → 서버보다 먼저 취소 버튼을 내리지 않는다)
    const tick = () => { const base = myReqAt.get(o.id) || tsMs(o.assignedAt) || start; setLeft(Math.max(0, CANCEL_WINDOW_MS - (Date.now() - base))); };
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [o?.id, o?.status, o?.assignedAt, isTaker]); // eslint-disable-line react-hooks/exhaustive-deps

  // 등록자: 상세·배차 정보 실시간
  useEffect(() => {
    if (!isPoster) return;
    const a = subscribePrivate(id, "detail", setDetail);
    const b = subscribePrivate(id, "match", setMatch);
    return () => { a(); b(); };
  }, [id, isPoster, o?.takerUid]); // eslint-disable-line react-hooks/exhaustive-deps
  // 배차된 회원: 10초 확정 뒤 상세 공개(서버 시각 기준이라 몇 번 다시 시도)
  const confirmed = isTaker && (o?.status === "loaded" || o?.status === "delivered" || (o?.status === "assigned" && o?.confirmed === true));
  // 10초가 지나면 "확정" 표시를 남긴다(배차된 회원 · 등록자 화면 중 먼저 본 쪽) — 서버 시각 기준이라 실패하면 잠시 뒤 다시
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
    if (!confirmed) { if (!isPoster) setDetail(null); return; }
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
  useEffect(() => { if (o?.podPath && (isPoster || isTaker)) fileUrl(o.podPath).then(setPodUrl).catch(() => {}); }, [o?.podPath, isPoster, isTaker]);
  useEffect(() => { if (o && (isPoster || isTaker)) fetchPrivate(id, `settle_${me.uid}`).then((d) => setNote(d?.text || "")); }, [o?.id, isPoster, isTaker]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (label, fn, okMsg) => {
    setBusy(label);
    try { await fn(); if (okMsg) toast?.(okMsg); }
    catch (e) {
      const denied = String(e?.code || e?.message || "").includes("permission");
      toast?.(denied ? "처리할 수 없는 상태입니다(권한 또는 시간 초과)." : e?.message || "처리하지 못했습니다.", 3600);
    } finally { setBusy(""); setAsk(null); }
  };

  if (o === undefined) return <Drawer onClose={onClose} title="오더 상세"><div className="p-10 text-center text-[#8592A8]">불러오는 중…</div></Drawer>;
  if (o === null) return <Drawer onClose={onClose} title="오더 상세"><div className="p-10 text-center text-[16px] font-bold text-[#55657F]">삭제되었거나 볼 수 없는 오더입니다.</div></Drawer>;

  const km = o.거리km || 0;
  const fare = Number(o.운임) || 0;
  const fit = fareFitness(fare, o.차량톤수, km, o.운행유형 === "왕복");
  const ref = referenceFare(o.차량톤수, km) * (o.운행유형 === "왕복" ? 1.6 : 1);
  const posterPhone = detail?.posterPhone;
  const eligible = canTake(me) && !isPoster;
  const favPoster = favorites.some((f) => f.uid === o.posterUid);
  const toggleFav = (uid, name) => {
    const list = favorites.some((f) => f.uid === uid) ? favorites.filter((f) => f.uid !== uid) : [...favorites, { uid, name: String(name || "").slice(0, 40) }];
    updatePrefs(me.uid, { ...(me.prefs || {}), favorites: list }).then(() => toast?.(list.length > favorites.length ? "즐겨찾기에 넣었습니다" : "즐겨찾기에서 뺐습니다")).catch(() => {});
  };

  // ── 아래 고정 버튼 영역
  let action = null;
  if (o.status === "open" && eligible) {
    action = <Btn size="xl" kind="primary" className="w-full" disabled={!!busy} data-testid="btn-request"
      onClick={() => run("req", async () => { myReqAt.set(o.id, Date.now()); try { const r = await requestDispatch(o, me); myReqAt.set(o.id, r.at); } catch (e) { myReqAt.delete(o.id); throw e; } }, "배차신청 완료 · 10초 안에는 취소할 수 있습니다")}>
      <HI name="bolt" size={20} />{busy === "req" ? "신청 중…" : `배차신청 · ${manwon(fare)}`}
    </Btn>;
  } else if (o.status === "open" && !isPoster) {
    action = <div className="text-center text-[15px] font-bold text-[#55657F] py-2">{me.role === "shipper" ? "화주 계정은 배차신청을 할 수 없습니다." : "승인된 차주 · 운송사만 배차신청할 수 있습니다."}</div>;
  } else if (isTaker && o.status === "assigned" && left > 0 && !o.confirmed) {
    action = (
      <div className="rounded-[22px] p-4 flex items-center gap-4 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }} data-testid="cancel-window">
        <Ring ms={left} />
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-extrabold">배차신청 완료</div>
          <div className="text-[14.5px] text-white/70 leading-snug">{Math.ceil(left / 1000)}초 뒤 확정 · 잘못 눌렀으면 취소</div>
        </div>
        <Btn kind="accent" size="lg" disabled={!!busy} data-testid="btn-cancel-quick"
          onClick={() => run("cancel", async () => { await cancelDispatch(o, me); myReqAt.delete(o.id); }, "배차신청을 취소했습니다")}>{busy === "cancel" ? "취소 중…" : "취소"}</Btn>
      </div>
    );
  } else if (isTaker && o.status === "assigned") {
    action = (
      <div className="space-y-2.5">
        <Btn size="xl" className="w-full" disabled={!!busy} data-testid="btn-loaded" onClick={() => run("load", () => markLoaded(o, me), "상차완료로 바꿨습니다")}><HI name="box" size={20} />상차완료</Btn>
        <a href={telHref(posterPhone)} data-testid="btn-call-cancel" className={`h-12 rounded-2xl w-full inline-flex items-center justify-center gap-2 bg-white text-[#0F1A30] ring-2 ring-inset ring-[#0F1A30] text-[16px] font-bold ${posterPhone ? "" : "opacity-50 pointer-events-none"}`}>
          <HI name="phone" size={18} />전화로 취소 요청{posterPhone ? ` · ${posterPhone}` : ""}
        </a>
      </div>
    );
  } else if (isTaker && o.status === "loaded") {
    action = (
      <div className="space-y-2.5">
        <button type="button" onClick={() => podInput.current?.click()} data-testid="btn-pod" className="w-full h-14 rounded-2xl bg-white ring-1 ring-inset ring-[#D6DEEA] text-[16px] font-bold text-[#1B2B4B] inline-flex items-center justify-center gap-2">
          <HI name="camera" size={20} />{pod ? `인수증: ${pod.name.slice(0, 18)}` : "인수증 사진 찍기 · 고르기"}
        </button>
        <input ref={podInput} type="file" accept="image/*" capture="environment" className="sr-only" data-testid="pod-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPod(f); e.target.value = ""; }} />
        <Btn size="xl" className="w-full" disabled={!!busy} data-testid="btn-delivered" onClick={() => run("dlv", () => markDelivered(o, me, pod), "운송완료! 수고하셨습니다")}><HI name="flag" size={20} />{busy === "dlv" ? "올리는 중…" : "운송완료"}</Btn>
      </div>
    );
  } else if (isPoster && o.status === "loaded") {
    action = <Btn size="xl" className="w-full" disabled={!!busy} data-testid="btn-poster-delivered" onClick={() => run("pdlv", () => markDelivered(o, me, null), "운송완료로 확인했습니다")}><HI name="check" size={20} />운송완료 확인</Btn>;
  }

  const rated = isPoster ? o.ratingByPoster : isTaker ? o.ratingByTaker : null;
  const canRate = o.status === "delivered" && (isPoster || isTaker) && !rated;

  return (
    <Drawer onClose={onClose} title={`${o.상차시도} ${o.상차시군구 || ""} → ${o.하차시도} ${o.하차시군구 || ""}`} sub={`${isTaker && o.status === "assigned" && left > 0 ? "확정 대기" : st.label} · ${ago(o.createdAt)} 등록`} testid="order-detail">
      <div className="flex-1 overflow-y-auto hub-scroll">
        {/* 상단 요약(어두운 카드) */}
        <div className="p-4 lg:p-5">
          <div className="rounded-[24px] p-5 text-white relative overflow-hidden" style={{ background: "radial-gradient(120% 140% at 90% -20%, #2D4C82 0%, #1B2B4B 45%, #0F1A30 80%, #0B1428 100%)" }}>
            <div className="flex items-center gap-1.5 flex-wrap mb-4">
              <Badge tone={o.status === "open" ? "accent" : "blue"}><span data-testid="detail-status">{st.label}</span></Badge>
              {o.긴급 && <Badge tone="accent"><HI name="bolt" size={13} />긴급</Badge>}
              {o.운행유형 === "왕복" && <Badge tone="glass">왕복</Badge>}
              <Badge tone="glass">{o.적재 === "혼적" ? "혼적" : "독차"}</Badge>
              {o.지급방식 && <Badge tone="glass">{o.지급방식}</Badge>}
            </div>
            <RouteLine dark big km={km}
              from={`${o.상차시도} ${o.상차시군구 || ""}`} fromSub={`${dayLabel(o.상차일)} ${o.상차시간 || ""} 상차 · ${o.상차방법 || "상차방법 협의"}`}
              to={`${o.하차시도} ${o.하차시군구 || ""}`} toSub={`${dayLabel(o.하차일 || o.상차일)} ${o.하차시간 || ""} 하차 · ${o.하차방법 || "하차방법 협의"}`} />
            <div className="mt-5 pt-4 border-t border-white/10 flex items-end gap-3">
              <div>
                <div className="text-[13.5px] font-bold text-white/55">운임</div>
                <div className="text-[34px] font-extrabold leading-none mt-1" style={NUMS}>{manwon(fare)}</div>
                <div className="text-[14px] font-bold text-white/60 mt-1.5" style={NUMS}>{km && fare ? `km당 ${Math.round(fare / km).toLocaleString()}원` : ""}{o.수수료 ? ` · 수수료 ${manwon(o.수수료)}` : ""}</div>
              </div>
              {fit && <div className="ml-auto text-right"><div className="text-[13.5px] font-bold text-[#8FB0F0]">{fit.label}</div><div className="text-[13px] text-white/50">참고 {manwon(ref)} (추정)</div></div>}
            </div>
          </div>
        </div>

        <div className="px-4 lg:px-5 pb-5 space-y-3.5">
          {/* 배차된 차주 카드(등록자) */}
          {isPoster && o.takerUid && match && (
            <Card className="p-4" data-testid="taker-card">
              <div className="text-[14px] font-bold text-[#2D4C82] mb-3">{o.status === "assigned" && !o.confirmed ? "배차신청 · 10초 뒤 확정" : "배차 확정된 차량"}</div>
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
                <Row k="차종·톤수" v={match.vehicle ? `${match.vehicle.ton || ""} ${match.vehicle.type || ""}` : ""} />
                <Row k="적재함" v={match.vehicle?.length ? `길이 ${match.vehicle.length}m${match.vehicle.width ? ` × 폭 ${match.vehicle.width}m` : ""}` : ""} />
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

          {/* 상세주소 · 연락처 */}
          {(isPoster || confirmed) && detail ? (
            <Card className="p-4" data-testid="detail-private">
              <div className="text-[14px] font-bold text-[#2D4C82] mb-1 flex items-center gap-1.5"><HI name="lock" size={15} />{isPoster ? "상세 정보(배차 확정 후 차주에게 공개)" : "배차 확정 · 상세 정보"}</div>
              <div className="divide-y divide-[#EEF1F6]">
                <Row k="상차지" v={[detail.상차지명, detail.상차지주소].filter(Boolean).join(" · ")} strong />
                <Row k="상차 담당" v={[detail.상차담당자, detail.상차연락처].filter(Boolean).join(" ")} />
                <Row k="하차지" v={[detail.하차지명, detail.하차지주소].filter(Boolean).join(" · ")} strong />
                <Row k="하차 담당" v={[detail.하차담당자, detail.하차연락처].filter(Boolean).join(" ")} />
                <Row k="메모" v={detail.메모} />
                {!isPoster && <Row k="등록자" v={`${detail.posterCompany || ""} ${detail.posterName || ""}`.trim()} />}
                {!isPoster && <Row k="연락처" v={posterPhone} strong />}
              </div>
              {!isPoster && posterPhone && <a href={telHref(posterPhone)} data-testid="btn-call-poster" className="mt-3 h-12 rounded-2xl w-full inline-flex items-center justify-center gap-2 text-white text-[16px] font-bold" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}><HI name="phone" size={18} />등록자에게 전화</a>}
            </Card>
          ) : (!isPoster && (
            <Card className="p-4 flex items-start gap-3">
              <span className="w-11 h-11 rounded-2xl bg-[#F2F5FA] text-[#55657F] inline-flex items-center justify-center shrink-0"><HI name="lock" size={19} /></span>
              <div className="text-[15px] text-[#55657F] leading-relaxed"><b className="text-[#0F1A30]">상세주소 · 연락처는 배차 확정 후 공개</b><br />배차신청하고 10초가 지나면 상·하차 정확한 주소와 등록자 연락처가 보입니다.</div>
            </Card>
          ))}

          {/* 화물 정보 */}
          <Card className="p-4">
            <div className="text-[16px] font-extrabold text-[#0F1A30] mb-1">화물 · 차량</div>
            <div className="divide-y divide-[#EEF1F6]">
              <Row k="필요 차량" v={`${o.차량톤수 || ""} ${o.차량종류 || ""}`} strong />
              <Row k="화물" v={o.화물내용} />
              <Row k="중량" v={o.중량} />
              <Row k="파레트" v={o.파레트 ? `${o.파레트}개` : ""} />
              <Row k="상·하차" v={[o.상차방법, o.하차방법].filter(Boolean).join(" / ")} />
              <Row k="운행" v={`${o.운행유형 || "편도"} · ${o.적재 === "혼적" ? "혼적 가능" : "독차"}`} />
              <Row k="결제" v={o.지급방식} />
              <Row k="안내" v={o.공개메모} />
            </div>
          </Card>

          {/* 등록자 */}
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

          {/* 인수증 */}
          {podUrl && <Card className="p-4"><div className="text-[16px] font-extrabold text-[#0F1A30] mb-2">인수증</div><a href={podUrl} target="_blank" rel="noreferrer"><img src={podUrl} alt="인수증" className="w-full max-h-[320px] object-contain rounded-2xl bg-[#F2F5FA]" data-testid="pod-img" /></a></Card>}

          {/* 평가 */}
          {o.status === "delivered" && (isPoster || isTaker) && (
            <Card className="p-4" data-testid="rate-card">
              <div className="text-[16px] font-extrabold text-[#0F1A30]">{isPoster ? "차주 평가" : "등록자 평가"}</div>
              {rated ? (
                <div className="mt-2 flex items-center gap-2"><Stars value={rated.score} /><span className="text-[15px] font-bold text-[#55657F]">{rated.comment || "평가 완료"}</span></div>
              ) : canRate && (
                <>
                  <div className="mt-1"><Stars value={rate.score} onChange={(n) => setRate((p) => ({ ...p, score: n }))} size={26} /></div>
                  <textarea rows={2} value={rate.comment} onChange={(e) => setRate((p) => ({ ...p, comment: e.target.value }))} placeholder="한 줄 후기(선택)" className="mt-2 w-full px-4 py-3 rounded-2xl border border-[#D6DEEA] text-[16px] outline-none focus:border-[#2D4C82]" />
                  <Btn className="w-full mt-2" disabled={!!busy} data-testid="btn-rate" onClick={() => run("rate", () => rateOrder(o, isPoster, rate.score, rate.comment), "평가를 남겼습니다")}>평가 남기기</Btn>
                </>
              )}
              {isPoster && o.ratingByTaker && <div className="mt-3 pt-3 border-t border-[#EEF1F6] text-[14.5px] text-[#55657F] flex items-center gap-2">차주가 남긴 평가 <Stars value={o.ratingByTaker.score} size={16} /></div>}
              {isTaker && o.ratingByPoster && <div className="mt-3 pt-3 border-t border-[#EEF1F6] text-[14.5px] text-[#55657F] flex items-center gap-2">등록자가 남긴 평가 <Stars value={o.ratingByPoster.score} size={16} /></div>}
            </Card>
          )}

          {/* 정산 메모(나만 보기) */}
          {(isPoster || isTaker) && o.status !== "open" && (
            <Card className="p-4">
              <div className="text-[16px] font-extrabold text-[#0F1A30] flex items-center gap-2"><HI name="memo" size={18} className="text-[#2D4C82]" />정산 메모 <span className="text-[13.5px] font-semibold text-[#8592A8]">나만 보기</span></div>
              <textarea rows={2} value={note} onChange={(e) => { setNote(e.target.value); setNoteSaved(false); }} placeholder="입금 예정일 · 세금계산서 · 추가 비용 등" className="mt-2 w-full px-4 py-3 rounded-2xl border border-[#D6DEEA] text-[16px] outline-none focus:border-[#2D4C82]" data-testid="settle-note" />
              <Btn kind="soft" size="md" className="mt-2" onClick={() => saveSettleNote(o.id, me.uid, note).then(() => setNoteSaved(true)).catch(() => toast?.("저장하지 못했습니다"))}>{noteSaved ? "저장됨 ✓" : "메모 저장"}</Btn>
            </Card>
          )}

          {/* 등록자 관리 */}
          {isPoster && ["open", "assigned"].includes(o.status) && (
            <div className="grid grid-cols-2 gap-2">
              {o.status === "open" && <Btn kind="ghost" onClick={() => onEdit?.(o)} data-testid="btn-edit">수정</Btn>}
              <Btn kind="ghost" className={o.status === "open" ? "" : "col-span-2"} onClick={() => setAsk({ k: "cancelOrder" })} data-testid="btn-cancel-order">오더 취소</Btn>
            </div>
          )}
          {o.status === "open" && isPoster && (o.cancelCount || 0) > 0 && <div className="text-[14px] text-[#8592A8] text-center">10초 내 취소 {o.cancelCount}회 · 5회가 되면 더 이상 배차신청을 받지 않습니다.</div>}
        </div>
      </div>
      {action && <div className="shrink-0 p-4 lg:p-5 bg-white border-t border-[#E2E7EF] pb-[max(16px,env(safe-area-inset-bottom))]">{action}</div>}

      {ask?.k === "release" && <Confirm title="배차를 취소할까요?" body={"차주에게 알림이 가고 오더가 다시 모집중이 됩니다.\n상차 직전 취소는 차주에게 큰 손해이니 먼저 전화로 협의해 주세요."} okText="배차 취소" onCancel={() => setAsk(null)} onOk={() => run("rel", () => releaseTaker(o, me, "등록자 취소"), "배차를 취소하고 다시 모집합니다")} />}
      {ask?.k === "cancelOrder" && <Confirm title="오더를 취소할까요?" body={o.takerUid ? "배차된 차주에게 취소 알림이 갑니다." : "보드에서 내려갑니다."} okText="오더 취소" onCancel={() => setAsk(null)} onOk={() => run("co", () => cancelOrder(o, me), "오더를 취소했습니다")} />}
      {ask?.k === "report" && <Confirm title="신고하기" body="노쇼 · 연락 두절 · 허위 정보 등을 관리자에게 알립니다." okText="노쇼 신고" onCancel={() => setAsk(null)} onOk={() => run("rep", () => reportParty(me, o, ask.uid, "noshow", "등록자 신고"), "신고를 접수했습니다")} />}
    </Drawer>
  );
}
