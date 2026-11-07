// ======================= cafe-site/src/hub/HubAdmin.jsx =======================
// ⭐ 2026-11-06 허브 관리자 콘솔(허브 관리자 = 로지스웹 최고관리자 · 부관리자 — users.role "totalMaster" 또는 최고관리자 이메일).
//  휴대폰 · PC 같은 화면. 관리센터(src/HubMembersAdmin.jsx)의 회원 승인과 같은 일 + 허브 전체 편집:
//   · 회원 — 신청서 · 서류 확인 → 승인 / 거절(사유) / 정지 · 정보 수정(이름 · 연락처 · 회사 · 차량 · 역할 · 패널티 · 정산 계좌) · 예치금 조정
//   · 오더 — 전체 오더 검색 · 상세(모든 칸 수정 · 단계 강제 변경 · 취소 · 정산 처리 · 위치관제 · 인수증)
//   · 정산 — 충전 요청 입금 확인 · 지급 대기열(지급 요청 = 지급대행 어댑터 · 지급완료) · 회원 잔액 · 미정산 · 원장
//   · 설정 — 기본 수수료(정액 · %) · 플랫폼 수수료 · 입금 계좌 · 차종/톤수/결제/상하차 방법/지역 목록 · 공지 · 신고
import React, { useEffect, useMemo, useState } from "react";
import { HI, Btn, Badge, Card, Drawer, Seg, inputCls, selectCls, Empty, Field, NUMS, Confirm } from "./hubUi";
import { ROLES, SOURCE_LABEL, DOC_TYPES, ROLE_DOCS, BIZ_STATUS, ago, tsMs, STATUS, routeText, BANKS, HUB_VEHICLES, HUB_TONS, PAY_METHODS, LOAD_METHODS, SIDO_LIST, defaultLists, SETTLE_LABEL, LEDGER_LABEL, payKind, fmtPhone, companyKeyOf } from "./hubConstants";
import {
  subscribeAllMembers, subscribeReports, reviewMember, fileUrl, adminUpdateMember, subscribeAllOrders, subscribeAll, adminUpdateOrder, adminForceStatus,
  adminSettle, confirmCharge, rejectCharge, requestPayoutSend, markPayoutPaid, adjustWallet, saveHubConfig, subscribeAnnouncements, saveAnnouncement,
  deleteAnnouncement, PUBLIC_EDIT_KEYS, subscribeWallet, splitForm, adminMarkWithdraw, callHub, subscribeDevice,
} from "./hubApi";
import { isHubDriverEmail, normPlate, phoneDigits, plateValid, phoneValid } from "./hubLink";
import HubOrderDetail from "./HubOrderDetail";
import HubOrderCard from "./HubOrderCard";
import { WalletSummary, wonFull } from "./HubWallet";

const ST = { pending: "승인 대기", approved: "승인", rejected: "거절", suspended: "정지" };
const money = (v) => { const d = String(v).replace(/[^\d-]/g, "").slice(0, 11); return d && d !== "-" ? Number(d).toLocaleString() : d; };
const numOf = (v) => Number(String(v || "").replace(/[^\d-]/g, "")) || 0;

function DocView({ label, d, checked, onCheck }) {
  const [url, setUrl] = useState("");
  useEffect(() => { let on = true; if (d?.path) fileUrl(d.path).then((u) => on && setUrl(u)).catch(() => {}); return () => { on = false; }; }, [d?.path]);
  const img = d?.type?.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(d?.path || "");
  return (
    <div className="rounded-2xl ring-1 ring-inset ring-[#E2E7EF] bg-white overflow-hidden" data-testid="admin-doc">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[#EEF1F6]">
        <span className="text-[15px] font-bold text-[#0F1A30] flex-1 min-w-0 truncate">{label}</span>
        {d?.path ? (
          <label className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[#1B2B4B] cursor-pointer"><input type="checkbox" checked={!!checked} onChange={(e) => onCheck(e.target.checked)} className="w-5 h-5 accent-[#1B2B4B]" />확인</label>
        ) : <Badge>미제출</Badge>}
      </div>
      {d?.path && (img && url
        ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={label} className="w-full h-40 object-contain bg-[#F2F5FA]" /></a>
        : <a href={url || "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3.5 py-4 text-[15px] font-bold text-[#2D4C82]"><HI name="file" size={18} />{d.name || "파일 열기"}</a>)}
    </div>
  );
}

// 예치금 조정(+/−) — 사용 가능 예치금 또는 미정산
function AdjustBox({ uid, admin, toast }) {
  const [v, setV] = useState({ amount: "", bucket: "available", memo: "" });
  const [busy, setBusy] = useState(false);
  const go = async (sign) => {
    const n = Math.abs(numOf(v.amount)) * sign;
    if (!n) { toast?.("금액을 입력해 주세요"); return; }
    if (!v.memo.trim()) { toast?.("조정 사유를 적어 주세요(원장에 남아요)"); return; }
    setBusy(true);
    try { await adjustWallet(uid, n, v.bucket, v.memo, admin); toast?.("조정을 요청했어요, 곧 잔액에 반영돼요"); setV({ amount: "", bucket: v.bucket, memo: "" }); }
    catch (e) { toast?.(e?.message || "조정하지 못했어요"); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2.5" data-testid="admin-adjust">
      <Seg value={v.bucket} onChange={(b) => setV((p) => ({ ...p, bucket: b }))} options={[["available", "사용 가능 예치금"], ["owed", "미정산(갚을 돈)"]]} />
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="금액(원)"><input className={`${inputCls} text-right font-extrabold`} inputMode="numeric" value={v.amount} onChange={(e) => setV((p) => ({ ...p, amount: money(e.target.value.replace("-", "")) }))} style={NUMS} data-testid="adj-amount" /></Field>
        <Field label="사유"><input className={inputCls} value={v.memo} onChange={(e) => setV((p) => ({ ...p, memo: e.target.value.slice(0, 200) }))} placeholder="예: 환불, 오입금 정정" data-testid="adj-memo" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2"><Btn kind="ghost" disabled={busy} onClick={() => go(-1)} data-testid="adj-minus">− 빼기</Btn><Btn disabled={busy} onClick={() => go(1)} data-testid="adj-plus">+ 더하기</Btn></div>
    </div>
  );
}

export function MemberReview({ m, admin, onClose, toast }) {
  const docKeys = [...(ROLE_DOCS[m.role]?.required || []), ...(ROLE_DOCS[m.role]?.optional || [])];
  const [verified, setVerified] = useState(() => Object.fromEntries(docKeys.filter((k) => m.docs?.[k]?.path).map((k) => [k, !!m.verified?.[k]])));
  const [biz, setBiz] = useState(m.bizStatus || "확인 전");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [photo, setPhoto] = useState("");
  const [wallet, setWallet] = useState(null);
  const [ed, setEd] = useState(() => ({
    name: m.name || "", phone: m.phone || "", companyName: m.companyName || "", bizNo: m.bizNo || "", ceoName: m.ceoName || "", role: m.role || "driver",
    plate: m.vehicle?.plate || "", vtype: m.vehicle?.type || "", vton: m.vehicle?.ton || "", vlen: m.vehicle?.length || "", vwid: m.vehicle?.width || "",
    blocked: !!m.penalty?.blocked, adminNote: m.adminNote || "", bank: m.bank?.bank || "", bankNo: m.bank?.number || "", holder: m.bank?.holder || "",
    companyKey: m.companyKey || "", vaBank: m.va?.bank || "", vaNo: m.va?.number || "", vaHolder: m.va?.holder || "",
  }));
  useEffect(() => { if (m.photoPath) fileUrl(m.photoPath).then(setPhoto).catch(() => {}); }, [m.photoPath]);
  useEffect(() => subscribeWallet(m.id, setWallet), [m.id]);
  // ⭐ 2026-11-07 차주 등록 휴대폰(기기) · 차량번호 로그인 계정
  const plateAcct = m.role === "driver" && (m.login === "plate" || isHubDriverEmail(m.email));
  const [dev, setDev] = useState(null);
  useEffect(() => (m.role === "driver" && m.source === "signup" ? subscribeDevice(m.id, (d) => setDev(d || null)) : undefined), [m.id, m.role, m.source]);
  const resetDevice = async () => {
    if (!window.confirm("등록 휴대폰을 지울까요? 그 휴대폰은 로그아웃되고, 다음 로그인 때 문자 인증을 해요.")) return;
    setBusy("dev");
    try { await callHub("hubAdminResetDevice", { uid: m.id }); toast?.("등록 휴대폰을 지웠어요"); }
    catch (e) { toast?.(e?.message || "지우지 못했어요"); } finally { setBusy(""); }
  };
  const act = async (decision) => {
    if ((decision === "rejected" || decision === "suspended") && !reason.trim()) { toast?.("거절, 정지 사유를 적어 주세요"); return; }
    setBusy(decision);
    try { await reviewMember(m.id, admin, decision, { reason, verified, bizStatus: biz }); toast?.(`${ST[decision]} 처리했어요`); onClose(); }
    catch (e) { toast?.(e?.message || "처리하지 못했어요"); } finally { setBusy(""); }
  };
  const saveEdit = async () => {
    setBusy("edit");
    try {
      // 차량번호로 로그인하는 차주 — 차량번호 · 휴대폰번호가 로그인 정보라 서버 함수로 같이 바꾼다(Admin SDK)
      if (plateAcct && (normPlate(ed.plate) !== normPlate(m.vehicle?.plate) || phoneDigits(ed.phone) !== phoneDigits(m.phone))) {
        if (!plateValid(ed.plate)) throw new Error("차량번호를 전부 입력해 주세요");
        if (!phoneValid(ed.phone)) throw new Error("휴대폰번호를 정확히 입력해 주세요");
        await callHub("hubAdminSetDriverLogin", { uid: m.id, plate: normPlate(ed.plate), phone: phoneDigits(ed.phone) });
      }
      await adminUpdateMember(m.id, {
        name: ed.name.trim(), phone: fmtPhone(ed.phone), companyName: ed.companyName.trim(), bizNo: ed.bizNo.trim(), ceoName: ed.ceoName.trim(), role: ed.role,
        ...(ed.plate || m.vehicle ? { vehicle: { plate: plateAcct ? normPlate(ed.plate) : ed.plate.trim(), type: ed.vtype, ton: ed.vton, length: ed.vlen, width: ed.vwid } } : {}),
        penalty: { ...(m.penalty || {}), blocked: ed.blocked, by: admin?.email || "", at: Date.now() },
        adminNote: ed.adminNote.slice(0, 500),
        ...(ed.bankNo ? { bank: { bank: ed.bank, number: ed.bankNo.replace(/[^\d-]/g, ""), holder: ed.holder.trim() } } : {}),
        // ⭐ 2026-11-07 회사 키(같은 회사끼리만 기록 · 고객관리 공유) · 가상계좌(충전 계좌, PG 연동 전에는 관리자가 넣는다)
        ...(ed.companyKey.trim() ? { companyKey: ed.companyKey.trim() } : {}),
        ...(ed.vaNo.trim() ? { va: { bank: ed.vaBank, number: ed.vaNo.trim(), numberDigits: ed.vaNo.replace(/[^\d]/g, ""), holder: ed.vaHolder.trim(), at: Date.now() } } : {}),
      });
      toast?.("회원 정보를 저장했어요");
    } catch (e) { toast?.(e?.message || "저장하지 못했어요"); } finally { setBusy(""); }
  };
  const E = (k) => (e) => setEd((p) => ({ ...p, [k]: e.target.value }));
  const rows = [["유형", ROLES[m.role]?.label], ["출처", SOURCE_LABEL[m.source]], plateAcct ? ["로그인", `차량번호 ${m.vehicle?.plate || ""} + 휴대폰번호`] : ["이메일", m.email], ["이름", m.name], ["휴대폰", m.phone], ["회사", m.companyName], ["사업자번호", m.bizNo], ["대표자", m.ceoName], ["직책", m.managerTitle], ["허가번호", m.permitNo], ["주소", m.bizAddress],
    ...(m.vehicle ? [["차량", `${m.vehicle.plate}, ${m.vehicle.ton} ${m.vehicle.type}`], ["적재함", `${m.vehicle.length || "-"}m × ${m.vehicle.width || "-"}m`]] : []),
    ...(m.home ? [["거주", `${m.home.sido} ${m.home.sigungu || ""}`]] : []), ["주 운행", (m.regions || []).join(", ")], ["정산 계좌", m.bank?.number ? `${m.bank.bank} ${m.bank.number} (${m.bank.holder})` : ""], ["신청", m.appliedAt ? new Date(tsMs(m.appliedAt)).toLocaleString("ko-KR") : ""]].filter(([, v]) => v);
  return (
    <Drawer onClose={onClose} title={`${m.name || m.email}, ${ROLES[m.role]?.label || ""}`} sub={`${ST[m.status] || m.status}${m.rejectReason ? `, ${m.rejectReason}` : ""}`} width={720} testid="member-review">
      <div className="flex-1 overflow-y-auto hub-scroll p-4 lg:p-5 space-y-3.5">
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-2">
            {photo ? <img src={photo} alt="" className="w-16 h-16 rounded-2xl object-cover" /> : <span className="w-16 h-16 rounded-2xl bg-[#EAF0FA] text-[#1B2B4B] inline-flex items-center justify-center text-[24px] font-extrabold">{(m.name || "?")[0]}</span>}
            <div><div className="text-[19px] font-extrabold text-[#0F1A30]">{m.name}</div><div className="text-[14.5px] text-[#8592A8]">{m.companyName}</div></div>
          </div>
          <div className="divide-y divide-[#EEF1F6]">{rows.map(([k, v]) => <div key={k} className="flex py-2 text-[15px]"><span className="w-24 shrink-0 font-semibold text-[#8592A8]">{k}</span><span className="font-bold text-[#0F1A30] break-all">{v}</span></div>)}</div>
        </Card>
        {m.source === "signup" && (
          <div className="grid sm:grid-cols-2 gap-2.5">
            {docKeys.map((k) => <DocView key={k} label={DOC_TYPES[k]} d={m.docs?.[k]} checked={verified[k]} onCheck={(v) => setVerified((p) => ({ ...p, [k]: v }))} />)}
          </div>
        )}
        <Card className="p-4 space-y-3">
          <label className="block"><span className="text-[15px] font-bold text-[#3A4A66]">사업자 상태(국세청 조회 결과)</span>
            <select className={`${selectCls} mt-1.5`} value={biz} onChange={(e) => setBiz(e.target.value)} data-testid="admin-biz">{BIZ_STATUS.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <a href="https://teht.hometax.go.kr/websquare/websquare.html?w2xPath=/ui/ab/a/a/UTEABAAA13.xml" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[14.5px] font-bold text-[#2D4C82]"><HI name="link" size={15} />홈택스 사업자 상태 조회 열기</a>
          <label className="block"><span className="text-[15px] font-bold text-[#3A4A66]">거절, 정지 사유</span>
            <input className={`${inputCls} mt-1.5`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 통장사본 이름이 사업자와 다릅니다" data-testid="admin-reason" />
          </label>
        </Card>
        {m.role === "driver" && m.source === "signup" && (
          <Card className="p-4 space-y-2.5" data-testid="admin-device">
            <div className="text-[16px] font-extrabold text-[#0F1A30] flex items-center gap-2"><HI name="phone" size={18} className="text-[#2D4C82]" />등록 휴대폰</div>
            {dev?.id ? (
              <div className="divide-y divide-[#EEF1F6] text-[15px]">
                <div className="flex py-2"><span className="w-24 shrink-0 font-semibold text-[#8592A8]">기기</span><span className="font-bold text-[#0F1A30]" data-testid="admin-device-label">{dev.label || "알 수 없음"}</span></div>
                <div className="flex py-2"><span className="w-24 shrink-0 font-semibold text-[#8592A8]">마지막 로그인</span><span className="font-bold text-[#0F1A30]">{dev.lastAt ? new Date(tsMs(dev.lastAt)).toLocaleString("ko-KR") : "-"}</span></div>
                <div className="flex py-2"><span className="w-24 shrink-0 font-semibold text-[#8592A8]">등록</span><span className="font-bold text-[#0F1A30]">{dev.boundAt ? new Date(tsMs(dev.boundAt)).toLocaleString("ko-KR") : "-"}</span></div>
              </div>
            ) : <div className="text-[15px] font-bold text-[#55657F]" data-testid="admin-device-none">{dev?.resetAt ? "지웠어요. 다음 로그인 때 문자 인증을 해요." : "아직 등록된 휴대폰이 없어요"}</div>}
            {dev?.id && <Btn kind="ghost" className="w-full" disabled={!!busy} onClick={resetDevice} data-testid="admin-device-reset">{busy === "dev" ? "지우고 있어요" : "기기 초기화"}</Btn>}
            <div className="text-[13.5px] text-[#8592A8]">휴대폰을 잃어버렸으면 기기 초기화를 눌러 주세요. 새 휴대폰에서 문자 인증하면 등록돼요.</div>
          </Card>
        )}
        {/* ⭐ 정보 수정(최고관리자는 모든 칸) */}
        <Card className="p-4 space-y-2.5" data-testid="admin-member-edit">
          <div className="text-[16px] font-extrabold text-[#0F1A30] flex items-center gap-2"><HI name="memo" size={18} className="text-[#2D4C82]" />정보 수정</div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="이름"><input className={inputCls} value={ed.name} onChange={E("name")} data-testid="am-name" /></Field>
            <Field label="휴대폰" hint={plateAcct ? "로그인 번호도 같이 바뀌어요" : undefined}><input className={inputCls} value={ed.phone} onChange={E("phone")} data-testid="am-phone" /></Field>
            <Field label="회사"><input className={inputCls} value={ed.companyName} onChange={E("companyName")} /></Field>
            <Field label="사업자번호"><input className={inputCls} value={ed.bizNo} onChange={E("bizNo")} /></Field>
            <Field label="대표자"><input className={inputCls} value={ed.ceoName} onChange={E("ceoName")} /></Field>
            <Field label="유형"><select className={selectCls} value={ed.role} onChange={E("role")} data-testid="am-role">{Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}</select></Field>
          </div>
          {(ed.role === "driver" || m.vehicle) && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <Field label="차량번호" className="col-span-2" hint={plateAcct ? "아이디도 같이 바뀌어요" : undefined}><input className={inputCls} value={ed.plate} onChange={E("plate")} data-testid="am-plate" /></Field>
              <Field label="차종"><select className={selectCls} value={ed.vtype} onChange={E("vtype")}><option value="">-</option>{HUB_VEHICLES.map((v) => <option key={v}>{v}</option>)}</select></Field>
              <Field label="톤수"><select className={selectCls} value={ed.vton} onChange={E("vton")}><option value="">-</option>{HUB_TONS.map((v) => <option key={v}>{v}</option>)}</select></Field>
              <Field label="길이(m)"><input className={inputCls} value={ed.vlen} onChange={E("vlen")} /></Field>
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-2.5">
            <Field label="은행"><select className={selectCls} value={ed.bank} onChange={E("bank")}><option value="">-</option>{BANKS.map((b) => <option key={b}>{b}</option>)}</select></Field>
            <Field label="정산 계좌"><input className={inputCls} value={ed.bankNo} onChange={E("bankNo")} /></Field>
            <Field label="예금주"><input className={inputCls} value={ed.holder} onChange={E("holder")} /></Field>
          </div>
          <div className="grid grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-2.5" data-testid="am-va">
            <Field label="가상계좌 은행"><select className={selectCls} value={ed.vaBank} onChange={E("vaBank")} data-testid="am-va-bank"><option value="">-</option>{BANKS.map((b) => <option key={b}>{b}</option>)}</select></Field>
            <Field label="가상계좌"><input className={inputCls} value={ed.vaNo} onChange={E("vaNo")} data-testid="am-va-no" /></Field>
            <Field label="예금주"><input className={inputCls} value={ed.vaHolder} onChange={E("vaHolder")} /></Field>
          </div>
          <Field label="회사 키" hint={`비우면 자동: ${companyKeyOf({ ...m, companyKey: "" })}`}><input className={inputCls} value={ed.companyKey} onChange={E("companyKey")} placeholder={companyKeyOf({ ...m, companyKey: "" })} data-testid="am-ckey" /></Field>
          <Field label="관리자 메모(회원에게 안 보임)"><input className={inputCls} value={ed.adminNote} onChange={E("adminNote")} /></Field>
          <label className="flex items-center gap-2.5 text-[15px] font-bold text-[#0F1A30]"><input type="checkbox" checked={ed.blocked} onChange={(e) => setEd((p) => ({ ...p, blocked: e.target.checked }))} className="w-5 h-5 accent-[#1B2B4B]" data-testid="am-blocked" />배차신청 막기(노쇼, 반복 취소 패널티)</label>
          <Btn kind="soft" className="w-full" disabled={!!busy} onClick={saveEdit} data-testid="am-save">{busy === "edit" ? "저장하고 있어요" : "정보 저장"}</Btn>
        </Card>
        <Card className="p-4 space-y-3" data-testid="admin-member-wallet">
          <div className="text-[16px] font-extrabold text-[#0F1A30] flex items-center gap-2"><HI name="wallet" size={18} className="text-[#2D4C82]" />예치금</div>
          <WalletSummary w={wallet} compact />
          <AdjustBox uid={m.id} admin={admin} toast={toast} />
        </Card>
      </div>
      <div className="shrink-0 p-4 lg:p-5 bg-white border-t border-[#E2E7EF] grid grid-cols-3 gap-2">
        <Btn kind="ghost" disabled={!!busy} onClick={() => act("rejected")} data-testid="admin-reject">거절</Btn>
        <Btn kind="ghost" disabled={!!busy} onClick={() => act("suspended")} data-testid="admin-suspend">정지</Btn>
        <Btn disabled={!!busy} onClick={() => act("approved")} data-testid="admin-approve">{m.status === "approved" ? "승인 유지" : "승인"}</Btn>
      </div>
    </Drawer>
  );
}

// ── 오더 관리(상세 안에 붙는 관리자 칸) — 모든 칸 수정 · 단계 강제 · 정산 처리
function AdminOrderPanel({ o, detail, admin, toast }) {
  const [f, setF] = useState(() => ({ ...Object.fromEntries(PUBLIC_EDIT_KEYS.map((k) => [k, o[k] ?? ""])), ...(detail || {}), 운임: money(String(o.운임 || "")), 수수료: money(String(o.수수료 || "")) }));
  const [busy, setBusy] = useState("");
  const [ask, setAsk] = useState(null);
  const S = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const run = async (label, fn, ok) => { setBusy(label); try { await fn(); toast?.(ok); } catch (e) { toast?.(e?.message || "처리하지 못했어요"); } finally { setBusy(""); setAsk(null); } };
  const save = () => run("save", () => { const { pub, detail: d } = splitForm({ ...o, ...f }); return adminUpdateOrder(o.id, pub, d); }, "오더를 수정했어요");
  const TXT = [["상차일", "date"], ["상차시간"], ["하차일", "date"], ["하차시간"], ["화물내용"], ["중량"], ["파레트"], ["공개메모"]];
  return (
    <Card className="p-4 space-y-3 ring-2 ring-[#0F1A30]" data-testid="admin-order-panel">
      <div className="flex items-center gap-2"><HI name="shield" size={18} className="text-[#2D4C82]" /><span className="text-[16px] font-extrabold text-[#0F1A30]">관리자, 오더 편집</span>{o.lwOrderId && <Badge tone="sky">로지스웹 연동 {o.lwOrderId}</Badge>}</div>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="상차 시·도"><select className={selectCls} value={f.상차시도} onChange={S("상차시도")}>{SIDO_LIST.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="상차 시·군·구"><input className={inputCls} value={f.상차시군구} onChange={S("상차시군구")} /></Field>
        <Field label="하차 시·도"><select className={selectCls} value={f.하차시도} onChange={S("하차시도")}>{SIDO_LIST.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="하차 시·군·구"><input className={inputCls} value={f.하차시군구} onChange={S("하차시군구")} /></Field>
        <Field label="상차 상세주소" className="col-span-2"><input className={inputCls} value={f.상차지주소 || ""} onChange={S("상차지주소")} /></Field>
        <Field label="하차 상세주소" className="col-span-2"><input className={inputCls} value={f.하차지주소 || ""} onChange={S("하차지주소")} /></Field>
        {TXT.map(([k, t]) => <Field key={k} label={k}><input type={t || "text"} className={inputCls} value={f[k] ?? ""} onChange={S(k)} /></Field>)}
        <Field label="차종"><select className={selectCls} value={f.차량종류} onChange={S("차량종류")}>{HUB_VEHICLES.map((v) => <option key={v}>{v}</option>)}</select></Field>
        <Field label="톤수"><select className={selectCls} value={f.차량톤수} onChange={S("차량톤수")}>{HUB_TONS.map((v) => <option key={v}>{v}</option>)}</select></Field>
        <Field label="상차 방법"><select className={selectCls} value={f.상차방법} onChange={S("상차방법")}>{LOAD_METHODS.map((v) => <option key={v}>{v}</option>)}</select></Field>
        <Field label="하차 방법"><select className={selectCls} value={f.하차방법} onChange={S("하차방법")}>{LOAD_METHODS.map((v) => <option key={v}>{v}</option>)}</select></Field>
        <Field label="운임(원)"><input className={`${inputCls} text-right`} value={f.운임} onChange={(e) => setF((p) => ({ ...p, 운임: money(e.target.value) }))} style={NUMS} data-testid="ao-fare" /></Field>
        <Field label="수수료(원)"><input className={`${inputCls} text-right`} value={f.수수료} onChange={(e) => setF((p) => ({ ...p, 수수료: money(e.target.value) }))} style={NUMS} /></Field>
        <Field label="결제 방식"><select className={selectCls} value={f.지급방식} onChange={S("지급방식")}>{PAY_METHODS.map((v) => <option key={v}>{v}</option>)}</select></Field>
        <Field label="운행"><select className={selectCls} value={f.운행유형} onChange={S("운행유형")}><option>편도</option><option>왕복</option></select></Field>
        <Field label="메모(차주만)" className="col-span-2"><input className={inputCls} value={f.메모 || ""} onChange={S("메모")} /></Field>
      </div>
      <label className="flex items-center gap-2 text-[15px] font-bold"><input type="checkbox" checked={!!f.긴급} onChange={(e) => setF((p) => ({ ...p, 긴급: e.target.checked }))} className="w-5 h-5 accent-[#1B2B4B]" />긴급</label>
      <Btn className="w-full" disabled={!!busy} onClick={save} data-testid="ao-save">{busy === "save" ? "저장하고 있어요" : "수정 저장"}</Btn>
      <div className="pt-3 border-t border-[#EEF1F6]">
        <div className="text-[14.5px] font-bold text-[#3A4A66] mb-2">단계 강제 변경 <span className="text-[#8592A8] font-semibold">(지금: {STATUS[o.status]?.label})</span></div>
        <div className="flex gap-1.5 flex-wrap">{Object.entries(STATUS).map(([k, s]) => <button key={k} type="button" disabled={k === o.status || !!busy || (["assigned", "loaded", "delivered"].includes(k) && !o.takerUid)} onClick={() => setAsk({ k })} className={`h-10 px-3.5 rounded-full text-[14px] font-bold ring-1 ring-inset disabled:opacity-35 ${k === o.status ? "bg-[#0F1A30] text-white ring-[#0F1A30]" : "bg-white text-[#1B2B4B] ring-[#D6DEEA]"}`} data-testid={`ao-status-${k}`}>{s.label}</button>)}</div>
      </div>
      {payKind(o.지급방식) === "deposit" && o.status === "delivered" && o.settle?.status !== "settled" && (
        <Btn kind="soft" className="w-full" disabled={!!busy} onClick={() => run("settle", () => adminSettle(o.id, admin), "정산 처리를 요청했어요(계산서 없이)")} data-testid="ao-settle">계산서 없이 정산 처리</Btn>
      )}
      {o.settle && <div className="text-[13.5px] text-[#55657F]">정산: {SETTLE_LABEL[o.settle.status] || o.settle.status}{o.settle.holdAmount ? `, 보류 ${wonFull(o.settle.holdAmount)}` : ""}{o.settle.payoutStatus ? `, 지급 ${o.settle.payoutStatus}` : ""}</div>}
      {ask && <Confirm title={`${STATUS[ask.k]?.label}(으)로 바꿀까요?`} body={ask.k === "open" ? "배차된 회원을 빼고 다시 모집해요(보류 예치금은 풀려요)." : ask.k === "cancelled" ? "오더를 취소해요(양쪽에 알림, 보류 해제)." : "관리자 강제 변경이에요. 알림, 정산이 그 단계에 맞게 처리돼요."} okText="바꾸기" onCancel={() => setAsk(null)} onOk={() => run("st", () => adminForceStatus(o, ask.k), "단계를 바꿨어요")} />}
    </Card>
  );
}

// ── 정산 관리
const CH = { requested: "입금 확인 대기", confirmed: "충전 완료", rejected: "반려", cancelled: "취소" };
const PO = { scheduled: "지급 예정", queued: "지급 대기", requested: "지급 요청", processing: "처리 중", paid: "지급 완료", failed: "실패" };
const WD = { requested: "신청", processing: "보낼 차례", paid: "출금 완료", rejected: "반려", failed: "실패" };
function MoneyAdmin({ members, admin, toast }) {
  const [sub, setSub] = useState("charges");
  const [charges, setCharges] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [debts, setDebts] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [rej, setRej] = useState(null);
  const [paid, setPaid] = useState(null);
  const [wds, setWds] = useState([]);
  useEffect(() => subscribeAll("hubWithdrawals", setWds), []);
  useEffect(() => subscribeAll("hubCharges", setCharges), []);
  useEffect(() => subscribeAll("hubPayouts", setPayouts), []);
  useEffect(() => subscribeAll("hubWallets", setWallets), []);
  useEffect(() => subscribeAll("hubDebts", setDebts), []);
  useEffect(() => (sub === "ledger" ? subscribeAll("hubLedger", setLedger, 400) : undefined), [sub]);
  const name = (uid) => { const m = members.find((x) => x.id === uid); return m ? `${m.name}${m.companyName && m.companyName !== m.name ? `, ${m.companyName}` : ""}` : uid === "__platform__" ? "플랫폼(로지스웹)" : String(uid || "").slice(0, 8); };
  const reqCh = charges.filter((c) => c.status === "requested").sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt));
  const openPo = payouts.filter((p) => p.status !== "paid").sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt));
  const tot = wallets.reduce((a, w) => ({ available: a.available + (w.uid === "__platform__" ? 0 : w.available || 0), held: a.held + (w.held || 0), pending: a.pending + (w.pending || 0), owed: a.owed + (w.owed || 0) }), { available: 0, held: 0, pending: 0, owed: 0 });
  const openWd = wds.filter((w) => ["requested", "processing"].includes(w.status));
  const SUBS = [["charges", `입금 확인 ${reqCh.length || ""}`], ["payouts", `운송료 지급 ${openPo.length || ""}`], ["withdraws", `출금 ${openWd.length || ""}`], ["wallets", "회원 잔액"], ["debts", `미정산 ${debts.filter((d) => d.status === "open").length || ""}`], ["ledger", "원장"]];
  const Row = ({ children, ...p }) => <div className="bg-white rounded-[20px] ring-1 ring-inset ring-[#E2E7EF] p-4 flex flex-wrap items-center gap-x-3 gap-y-2" {...p}>{children}</div>;
  return (
    <div className="space-y-3.5" data-testid="admin-money">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {[["예치금 합계", tot.available], ["보류 합계", tot.held], ["지급 예정 합계", tot.pending], ["미정산 합계", tot.owed]].map(([l, v]) => <div key={l} className="rounded-[20px] bg-white ring-1 ring-inset ring-[#E2E7EF] px-4 py-3"><div className="text-[13.5px] font-bold text-[#8592A8]">{l}</div><div className="text-[20px] font-extrabold text-[#0F1A30]" style={NUMS}>{wonFull(v)}</div></div>)}
      </div>
      <div className="flex gap-1.5 overflow-x-auto hub-scroll -mx-1 px-1">{SUBS.map(([k, l]) => <button key={k} type="button" onClick={() => setSub(k)} className={`shrink-0 h-11 px-4 rounded-full text-[15px] font-bold ${sub === k ? "bg-[#0F1A30] text-white" : "bg-white ring-1 ring-inset ring-[#E2E7EF] text-[#1B2B4B]"}`} data-testid={`money-${k}`}>{l}</button>)}</div>
      {sub === "charges" && (charges.length === 0 ? <Empty icon="wallet" title="충전 요청이 없어요" /> : (
        <div className="space-y-2">
          {[...reqCh, ...charges.filter((c) => c.status !== "requested").sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)).slice(0, 40)].map((c) => (
            <Row key={c.id} data-testid="admin-charge-row">
              <Badge tone={c.status === "requested" ? "accent" : c.status === "confirmed" ? "navy" : "line"}>{CH[c.status] || c.status}</Badge>
              <span className="text-[16px] font-extrabold text-[#0F1A30]" style={NUMS}>{wonFull(c.amount)}</span>
              <span className="text-[14.5px] text-[#55657F] min-w-0 truncate">{name(c.uid)}, 입금자 <b className="text-[#0F1A30]">{c.depositor}</b>, {ago(c.createdAt)}</span>
              {c.status === "requested" && <span className="ml-auto flex gap-1.5"><Btn kind="ghost" size="md" onClick={() => setRej(c)}>반려</Btn><Btn size="md" onClick={() => confirmCharge(c.id, admin).then(() => toast?.("입금 확인, 예치금에 넣습니다")).catch((e) => toast?.(e?.message || "실패"))} data-testid="admin-charge-confirm">입금 확인</Btn></span>}
            </Row>
          ))}
        </div>
      ))}
      {sub === "payouts" && (
        <>
          <div className="rounded-2xl bg-[#F5F8FD] ring-1 ring-inset ring-[#DCE3EE] px-4 py-3 text-[14px] text-[#3A4A66] leading-relaxed">지급일이 되면 지급 요청으로 바뀌어요. 지급대행 연결 전에는 직접 보낸 뒤 <b>지급완료</b>를 눌러 주세요.</div>
          {payouts.length === 0 ? <Empty icon="truck" title="지급할 운임이 없어요" /> : (
            <div className="space-y-2">
              {[...openPo, ...payouts.filter((p) => p.status === "paid").sort((a, b) => tsMs(b.paidAt) - tsMs(a.paidAt)).slice(0, 30)].map((p) => (
                <Row key={p.id} data-testid="admin-payout-row">
                  <Badge tone={p.status === "paid" ? "navy" : p.status === "queued" ? "accent" : "sky"}>{PO[p.status] || p.status}</Badge>
                  <span className="text-[16px] font-extrabold text-[#0F1A30]" style={NUMS}>{wonFull(p.amount)}</span>
                  <span className="min-w-0 flex-1 text-[14.5px] text-[#55657F] truncate">{p.toName || name(p.toUid)} {p.route} {p.dueDate ? `${p.dueDate} 지급` : ""} {p.bank?.number ? `${p.bank.bank} ${p.bank.number} (${p.bank.holder})` : "계좌 미등록"}</span>
                  {p.adapter?.message && p.status !== "paid" && <span className="w-full text-[13px] text-[#8592A8]">지급대행: {p.adapter.message}</span>}
                  {p.status !== "paid" && <span className="ml-auto flex gap-1.5">{["queued", "scheduled"].includes(p.status) && <Btn kind="ghost" size="md" onClick={() => requestPayoutSend(p.id, admin).then(() => toast?.("지급 요청, 지급대행 연결 결과를 확인하세요")).catch(() => {})} data-testid="admin-payout-request">지급 요청</Btn>}<Btn size="md" onClick={() => setPaid(p)} data-testid="admin-payout-paid">지급완료</Btn></span>}
                </Row>
              ))}
            </div>
          )}
        </>
      )}
      {sub === "withdraws" && (wds.length === 0 ? <Empty icon="wallet" title="출금 신청이 없어요" /> : (
        <div className="space-y-2">
          {[...openWd, ...wds.filter((w) => !["requested", "processing"].includes(w.status)).slice(0, 30)].map((w) => (
            <Row key={w.id} data-testid="admin-wd-row">
              <Badge tone={w.status === "paid" ? "navy" : "accent"}>{WD[w.status] || w.status}</Badge>
              <span className="text-[16px] font-extrabold text-[#0F1A30]" style={NUMS}>{wonFull(w.amount)}</span>
              <span className="min-w-0 flex-1 text-[14.5px] text-[#55657F] truncate">{name(w.uid)} {w.bank ? `${w.bank.bank} ${w.bank.number} (${w.bank.holder})` : ""}</span>
              {["requested", "processing"].includes(w.status) && <span className="ml-auto flex gap-1.5"><Btn kind="ghost" size="md" onClick={() => adminMarkWithdraw(w.id, admin, "rejected", "관리자 반려").then(() => toast?.("반려했어요"))}>반려</Btn><Btn size="md" onClick={() => adminMarkWithdraw(w.id, admin, "paid").then(() => toast?.("출금 완료로 바꿨어요"))} data-testid="admin-wd-paid">출금 완료</Btn></span>}
            </Row>
          ))}
        </div>
      ))}
      {sub === "wallets" && (
        <div className="space-y-2">
          {wallets.sort((a, b) => (b.available || 0) - (a.available || 0)).map((w) => (
            <Row key={w.id}><span className="min-w-0 flex-1 text-[15.5px] font-extrabold text-[#0F1A30] truncate">{name(w.id)}</span>
              <span className="text-[14px] text-[#55657F]" style={NUMS}>가능 <b className="text-[#0F1A30]">{wonFull(w.available)}</b>, 보류 {wonFull(w.held)}, 지급예정 {wonFull(w.pending)}, 미정산 {wonFull(w.owed)}</span></Row>
          ))}
          {wallets.length === 0 && <Empty icon="wallet" title="예치금이 있는 회원이 없어요" />}
        </div>
      )}
      {sub === "debts" && (debts.length === 0 ? <Empty title="미정산이 없어요" /> : (
        <div className="space-y-2">{debts.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)).map((d) => <Row key={d.id}><Badge tone={d.status === "open" ? "accent" : "navy"}>{d.status === "open" ? "미정산" : "상환"}</Badge><span className="text-[15.5px] font-extrabold" style={NUMS}>{wonFull(d.amount)}</span><span className="min-w-0 flex-1 text-[14.5px] text-[#55657F] truncate">{name(d.fromUid)} → {name(d.toUid)}, {d.route}</span></Row>)}</div>
      ))}
      {sub === "ledger" && (
        <Card className="divide-y divide-[#EEF1F6]">
          {ledger.sort((a, b) => tsMs(b.at) - tsMs(a.at)).slice(0, 200).map((l) => (
            <div key={l.id} className="px-4 py-2.5 flex items-center gap-2 text-[14.5px]"><Badge>{l.label || LEDGER_LABEL[l.type]}</Badge><span className="font-bold text-[#0F1A30] truncate min-w-0 flex-1">{name(l.uid)}, {l.route || l.memo}</span><span className="font-extrabold shrink-0" style={NUMS}>{wonFull(l.amount)}</span><span className="text-[12.5px] text-[#8592A8] shrink-0">{ago(l.at)}</span></div>
          ))}
          {ledger.length === 0 && <div className="p-8 text-center text-[#8592A8]">원장이 비어 있어요.</div>}
        </Card>
      )}
      {rej && <Confirm title="충전 요청 반려" body={`${name(rej.uid)}, ${wonFull(rej.amount)}\n입금이 확인되지 않은 요청을 반려해요.`} okText="반려" onCancel={() => setRej(null)} onOk={() => rejectCharge(rej.id, "입금 미확인").then(() => { toast?.("반려했어요"); setRej(null); })} />}
      {paid && <Confirm title="지급완료로 처리할까요?" body={`${paid.toName || name(paid.toUid)}, ${wonFull(paid.amount)}\n${paid.bank?.number ? `${paid.bank.bank} ${paid.bank.number} (${paid.bank.holder})` : "계좌 미등록"}\n회사 계좌에서 이체를 마쳤을 때만 눌러 주세요.`} okText="지급완료" onCancel={() => setPaid(null)} onOk={() => markPayoutPaid(paid.id, admin, "수동 이체").then(() => { toast?.("지급완료 처리했어요"); setPaid(null); })} />}
    </div>
  );
}

// ── 설정(수수료 · 입금 계좌 · 목록) · 공지
function SettingsAdmin({ cfg, admin, toast }) {
  const lists = cfg?.lists || {};
  const defs = useMemo(() => defaultLists(), []);
  const [v, setV] = useState(() => ({
    feeMode: cfg?.fee?.mode || "amount", feeValue: String(cfg?.fee?.value ?? ""), platformRate: String(cfg?.fee?.platformRate ?? 0),
    bank: cfg?.depositAccount?.bank || "", number: cfg?.depositAccount?.number || "", holder: cfg?.depositAccount?.holder || "", supportPhone: cfg?.supportPhone || "",
    vehicles: (lists.vehicles || defs.vehicles).join(", "), tons: (lists.tons || defs.tons).join(", "), payMethods: (lists.payMethods || defs.payMethods).join(", "),
    loadMethods: (lists.loadMethods || defs.loadMethods).join(", "), regions: (lists.regions || defs.regions).join(", "),
  }));
  const S = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));
  const arr = (s) => String(s || "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const save = () => saveHubConfig({
    fee: { mode: v.feeMode, value: Number(String(v.feeValue).replace(/[^\d.]/g, "")) || 0, platformRate: Math.max(0, Math.min(100, Number(v.platformRate) || 0)) },
    depositAccount: { bank: v.bank, number: v.number.trim(), holder: v.holder.trim() }, supportPhone: v.supportPhone.trim(),
    lists: { vehicles: arr(v.vehicles), tons: arr(v.tons), payMethods: arr(v.payMethods), loadMethods: arr(v.loadMethods), regions: arr(v.regions) },
  }, admin).then(() => toast?.("설정을 저장했어요, 모든 화면에 바로 반영돼요")).catch((e) => toast?.(e?.message || "저장하지 못했어요"));
  return (
    <div className="grid lg:grid-cols-2 gap-3.5" data-testid="admin-settings">
      <Card className="p-4 space-y-3">
        <div className="text-[16px] font-extrabold text-[#0F1A30]">수수료</div>
        <Seg value={v.feeMode} onChange={(m) => setV((p) => ({ ...p, feeMode: m }))} options={[["amount", "정액(원)"], ["percent", "운임의 %"]]} />
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={v.feeMode === "percent" ? "기본 수수료(%)" : "기본 수수료(원)"} hint="오더 등록 화면 기본값(등록자가 바꿀 수 있음)"><input className={`${inputCls} text-right`} value={v.feeValue} onChange={S("feeValue")} style={NUMS} data-testid="set-fee" /></Field>
          <Field label="플랫폼 수수료(%)" hint="수수료 중 로지스웹 몫(기본 0)"><input className={`${inputCls} text-right`} value={v.platformRate} onChange={S("platformRate")} style={NUMS} data-testid="set-platform" /></Field>
        </div>
        <div className="text-[16px] font-extrabold text-[#0F1A30] pt-2">예치금 입금 계좌(회사)</div>
        <div className="grid grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] gap-2.5">
          <Field label="은행"><select className={selectCls} value={v.bank} onChange={S("bank")} data-testid="set-bank"><option value="">선택</option>{BANKS.map((b) => <option key={b}>{b}</option>)}</select></Field>
          <Field label="계좌번호"><input className={inputCls} value={v.number} onChange={S("number")} data-testid="set-number" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="예금주"><input className={inputCls} value={v.holder} onChange={S("holder")} data-testid="set-holder" /></Field>
          <Field label="고객센터 번호"><input className={inputCls} value={v.supportPhone} onChange={S("supportPhone")} /></Field>
        </div>
      </Card>
      <Card className="p-4 space-y-3">
        <div className="text-[16px] font-extrabold text-[#0F1A30]">목록(쉼표로 구분)</div>
        {[["vehicles", "차종"], ["tons", "톤수"], ["payMethods", "결제 방식"], ["loadMethods", "상·하차 방법"], ["regions", "지역(시·도)"]].map(([k, l]) => (
          <Field key={k} label={l}><textarea rows={2} className={`${inputCls} h-auto py-2.5`} value={v[k]} onChange={S(k)} data-testid={`set-list-${k}`} /></Field>
        ))}
        <div className="text-[13px] text-[#8592A8]">인수증, 예치금은 예치금으로, 선불, 착불은 현금으로 정산해요.</div>
      </Card>
      <Btn size="lg" className="lg:col-span-2" onClick={save} data-testid="set-save">설정 저장</Btn>
    </div>
  );
}
function AnnounceAdmin({ admin, toast }) {
  const [rows, setRows] = useState([]);
  const [ed, setEd] = useState(null);
  useEffect(() => subscribeAnnouncements(setRows), []);
  const save = () => saveAnnouncement(ed.id, { title: ed.title.trim(), body: ed.body.trim(), pinned: !!ed.pinned, active: ed.active !== false }, admin).then(() => { toast?.("공지를 저장했어요"); setEd(null); }).catch((e) => toast?.(e?.message || "저장하지 못했어요"));
  return (
    <div className="space-y-3" data-testid="admin-announce">
      <Btn onClick={() => setEd({ title: "", body: "", pinned: false, active: true })} data-testid="ann-new"><HI name="plus" size={17} />새 공지</Btn>
      {ed && (
        <Card className="p-4 space-y-2.5">
          <Field label="제목"><input className={inputCls} value={ed.title} onChange={(e) => setEd((p) => ({ ...p, title: e.target.value.slice(0, 80) }))} data-testid="ann-title" /></Field>
          <Field label="내용"><textarea rows={4} className={`${inputCls} h-auto py-2.5`} value={ed.body} onChange={(e) => setEd((p) => ({ ...p, body: e.target.value.slice(0, 2000) }))} data-testid="ann-body" /></Field>
          <div className="flex gap-4 text-[15px] font-bold"><label className="flex items-center gap-2"><input type="checkbox" checked={ed.pinned} onChange={(e) => setEd((p) => ({ ...p, pinned: e.target.checked }))} className="w-5 h-5" />보드 맨 위 고정</label><label className="flex items-center gap-2"><input type="checkbox" checked={ed.active !== false} onChange={(e) => setEd((p) => ({ ...p, active: e.target.checked }))} className="w-5 h-5" />게시</label></div>
          <div className="grid grid-cols-2 gap-2"><Btn kind="ghost" onClick={() => setEd(null)}>닫기</Btn><Btn onClick={save} disabled={!ed.title.trim()} data-testid="ann-save">저장</Btn></div>
        </Card>
      )}
      {rows.map((a) => (
        <Card key={a.id} className="p-4 flex items-start gap-3">
          <HI name="megaphone" size={20} className="text-[#2D4C82] shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[16px] font-extrabold text-[#0F1A30]">{a.title}</span>{a.pinned && <Badge tone="navy">고정</Badge>}{a.active === false && <Badge>숨김</Badge>}</div><div className="text-[14.5px] text-[#55657F] whitespace-pre-line mt-0.5">{a.body}</div></div>
          <div className="flex gap-1 shrink-0"><Btn kind="ghost" size="md" onClick={() => setEd({ ...a })}>수정</Btn><Btn kind="ghost" size="md" onClick={() => deleteAnnouncement(a.id).then(() => toast?.("삭제했어요"))}>삭제</Btn></div>
        </Card>
      ))}
    </div>
  );
}

export default function HubAdmin({ admin, toast, me, cfg }) {
  const [rows, setRows] = useState([]);
  const [reports, setReports] = useState([]);
  const [orders, setOrders] = useState([]);
  const [sec, setSec] = useState("members");
  const [tab, setTab] = useState("pending");
  const [q, setQ] = useState("");
  const [oq, setOq] = useState("");
  const [ost, setOst] = useState("all");
  const [sel, setSel] = useState(null);
  const [selO, setSelO] = useState(null);
  useEffect(() => subscribeAllMembers(setRows), []);
  useEffect(() => subscribeReports(setReports), []);
  useEffect(() => (sec === "orders" ? subscribeAllOrders(setOrders) : undefined), [sec]);
  const counts = useMemo(() => rows.reduce((a, m) => ({ ...a, [m.status]: (a[m.status] || 0) + 1 }), {}), [rows]);
  const list = useMemo(() => rows.filter((m) => m.status === tab && (!q || `${m.name} ${m.companyName} ${m.email} ${m.phone} ${m.vehicle?.plate || ""}`.includes(q)))
    .sort((a, b) => tsMs(b.appliedAt || b.createdAt) - tsMs(a.appliedAt || a.createdAt)), [rows, tab, q]);
  const olist = useMemo(() => orders.filter((o) => (ost === "all" || o.status === ost) && (!oq || `${routeText(o)} ${o.posterCompany} ${o.posterName} ${o.화물내용} ${o.id}`.includes(oq))), [orders, ost, oq]);
  const selM = sel ? rows.find((m) => m.id === sel) : null;
  const SECS = [["members", "회원", "user", counts.pending || 0], ["orders", "오더", "board", 0], ["money", "정산", "wallet", 0], ["settings", "설정", "gear", 0], ["announce", "공지", "megaphone", 0], ["reports", "신고", "alert", reports.filter((r) => r.status === "open").length]];
  const adminMe = me || { uid: admin.uid, name: "관리자", role: "admin", status: "approved", prefs: {} };
  return (
    <div className="space-y-3.5" data-testid="hub-admin">
      <div className="flex gap-1.5 overflow-x-auto hub-scroll -mx-4 px-4 lg:mx-0 lg:px-0 pb-1" role="tablist">
        {SECS.map(([k, l, ic, n]) => (
          <button key={k} type="button" onClick={() => setSec(k)} data-testid={`admin-sec-${k}`} aria-selected={sec === k}
            className={`shrink-0 h-12 px-4 rounded-2xl inline-flex items-center gap-2 text-[15.5px] font-bold transition ${sec === k ? "bg-[#0F1A30] text-white" : "bg-white ring-1 ring-inset ring-[#E2E7EF] text-[#1B2B4B]"}`}>
            <HI name={ic} size={17} className={sec === k ? "text-[#8FB0F0]" : "text-[#2D4C82]"} />{l}{n > 0 && <span className={`min-w-[22px] h-[22px] px-1.5 rounded-full text-[12px] font-extrabold inline-flex items-center justify-center ${sec === k ? "bg-[#8FB0F0] text-[#0B1428]" : "bg-[#0F1A30] text-white"}`}>{n}</span>}
          </button>
        ))}
      </div>

      {sec === "members" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {Object.entries(ST).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={`text-left rounded-[20px] px-4 py-3.5 transition ${tab === k ? "bg-[#0F1A30] text-white" : "bg-white ring-1 ring-inset ring-[#E2E7EF]"}`}>
                <div className={`text-[14px] font-bold ${tab === k ? "text-white/65" : "text-[#8592A8]"}`}>{l}</div>
                <div className="text-[28px] font-extrabold leading-tight">{counts[k] || 0}</div>
              </button>
            ))}
          </div>
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름, 회사, 이메일, 차량번호 검색" />
          {list.length === 0 ? <Empty title={`${ST[tab]} 회원이 없어요`} /> : (
            <div className="grid lg:grid-cols-2 gap-2.5">
              {list.map((m) => (
                <button key={m.id} type="button" onClick={() => setSel(m.id)} data-testid="admin-member-row" className="text-left bg-white rounded-[20px] ring-1 ring-inset ring-[#E2E7EF] p-4 hover:ring-[#2D4C82] flex items-center gap-3">
                  <span className="w-12 h-12 rounded-2xl bg-[#EAF0FA] text-[#1B2B4B] inline-flex items-center justify-center shrink-0"><HI name={ROLES[m.role]?.icon || "user"} size={22} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5"><span className="text-[16.5px] font-extrabold text-[#0F1A30] truncate">{m.name || m.email}</span><Badge>{ROLES[m.role]?.label}</Badge>{m.source !== "signup" && <Badge tone="sky">로지스웹</Badge>}{m.penalty?.blocked && <Badge tone="line">신청 막힘</Badge>}</span>
                    <span className="block text-[14.5px] text-[#55657F] truncate">{[m.companyName, m.vehicle ? `${m.vehicle.plate} ${m.vehicle.ton} ${m.vehicle.type}` : "", m.phone].filter(Boolean).join(", ")}</span>
                  </span>
                  <span className="text-[13.5px] text-[#8592A8] shrink-0">{ago(m.appliedAt || m.createdAt)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {sec === "orders" && (
        <div className="space-y-3" data-testid="admin-orders">
          <div className="flex gap-1.5 overflow-x-auto hub-scroll -mx-1 px-1">{[["all", `전체 ${orders.length}`], ...Object.entries(STATUS).map(([k, s]) => [k, `${s.label} ${orders.filter((o) => o.status === k).length}`])].map(([k, l]) => <button key={k} type="button" onClick={() => setOst(k)} className={`shrink-0 h-10 px-3.5 rounded-full text-[14px] font-bold ${ost === k ? "bg-[#0F1A30] text-white" : "bg-white ring-1 ring-inset ring-[#E2E7EF] text-[#1B2B4B]"}`}>{l}</button>)}</div>
          <input className={inputCls} value={oq} onChange={(e) => setOq(e.target.value)} placeholder="지역, 등록자, 화물, 오더번호 검색" data-testid="admin-order-q" />
          {olist.length === 0 ? <Empty icon="board" title="오더가 없어요" /> : <div className="grid xl:grid-cols-2 gap-3">{olist.slice(0, 200).map((o) => <div key={o.id} data-testid="admin-order-row"><HubOrderCard o={o} onOpen={() => setSelO(o.id)} compact /></div>)}</div>}
        </div>
      )}
      {sec === "money" && <MoneyAdmin members={rows} admin={admin} toast={toast} />}
      {sec === "settings" && <SettingsAdmin key={cfg?.updatedAt ? tsMs(cfg.updatedAt) : 0} cfg={cfg} admin={admin} toast={toast} />}
      {sec === "announce" && <AnnounceAdmin admin={admin} toast={toast} />}
      {sec === "reports" && (
        <Card className="p-4">
          <div className="text-[16px] font-extrabold text-[#0F1A30] mb-2">신고, 노쇼 기록 {reports.length ? `(${reports.length})` : ""}</div>
          {reports.length === 0 ? <div className="text-[15px] text-[#8592A8]">접수된 신고가 없어요.</div> : reports.slice(0, 60).map((r) => (
            <div key={r.id} className="py-2 border-t border-[#EEF1F6] text-[15px] flex gap-2 items-center"><Badge>{r.type === "noshow" ? "노쇼" : r.type}</Badge><button type="button" onClick={() => { setSel(r.targetUid); setSec("members"); }} className="font-bold text-[#0F1A30] underline-offset-2 hover:underline">{rows.find((m) => m.id === r.targetUid)?.name || r.targetUid.slice(0, 6)}</button><span className="text-[#55657F] truncate">{r.reporterName}, {r.text}</span><span className="ml-auto text-[#8592A8] shrink-0">{ago(r.createdAt)}</span></div>
          ))}
        </Card>
      )}
      {selM && <MemberReview key={selM.id} m={selM} admin={admin} toast={toast} onClose={() => setSel(null)} />}
      {selO && <HubOrderDetail key={selO} id={selO} me={adminMe} isAdmin onClose={() => setSelO(null)} toast={toast} adminSlot={(o, detail) => <AdminOrderPanel key={`${o.id}_${detail ? 1 : 0}`} o={o} detail={detail} admin={admin} toast={toast} />} />}
    </div>
  );
}
