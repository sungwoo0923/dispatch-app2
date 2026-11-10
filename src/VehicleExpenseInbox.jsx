// ======================= src/VehicleExpenseInbox.jsx =======================
// 🧾 2026-11-10 지입차관리 › 차량 비용 영수증 · 정기 차량 사진(운송사 화면 — PC · 모바일 같은 화면, 좁으면 카드)
//  [차량 비용 영수증] 기사앱에서 올린 정비·수리 영수증 → 자동 점검(사업자 · 중복 · 금액 · 날짜 · 촬영 · 정비 주기 · 금액 수준)
//    → [확인] / [반려(사유)] → [건별 지출결의] / [묶어서 지출결의] = 전자결재 지출결의서가 내용 · 증빙 사진까지 채워져 열린다
//    → 상신하면 "결재 중", 최종 승인되면 "승인"(수입·지출 장부 자동 기록은 전자결재 기존 기능) · 기사앱에도 같은 상태
//  [정기 차량 사진] 주기(매일 · 매주 · 2주 · 매월) · 마감 요일/날짜 · 찍을 부위 · 대상 설정 + 기사별 제출 현황 · 사진 보기
import React from "react";
import { createPortal } from "react-dom";
import { kpConfirm, kpPrompt } from "./kpDialog";
import useNarrow from "./useNarrow";
import { useBackClose } from "./mobileBack";
import { PaidStamp } from "./PaidStamp"; // 💸 지급완료 도장 // 🔙 휴대폰 뒤로가기로 상세 닫기
import { mainBiz } from "./publicDataMain";
import { VEX_KINDS, VEX_PAYS, vexKindLabel, vexPayLabel, won, toNum, autoChecks, checkLevel, checkHeadline, fmtBizNo, spendPresetOf,
  PHOTO_CYCLES, PHOTO_DOWS, PHOTO_PARTS, photoPeriod, daysLeft, photoTargetOk } from "./vehicleExpenseCore";
import { useCompanyExpenses, setExpenseStatus, patchExpense, openSpendComposer, usePhotoSettings, savePhotoSettings, useCompanyPeriodPhotos, notifyDriver, deleteExpense, canDeleteExpense } from "./vehicleExpense";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const NUM = { fontVariantNumeric: "tabular-nums" };
const kstYmd = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const tsMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);
const at = (v) => { const ms = tsMs(v); return ms ? new Date(ms + 9 * 3600e3).toISOString().slice(5, 16).replace("-", ".").replace("T", " ") : ""; };
const shiftYm = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const STATUS_TABS = [["접수", "미확인"], ["확인", "확인 완료"], ["결재중", "결재 중"], ["승인", "승인(지급 대기)"], ["지급완료", "지급완료"], ["반려", "반려"], ["all", "전체"]];

const Hero = ({ en, title, desc, kpis }) => (
  <div className="rounded-[22px] px-5 sm:px-6 py-5 text-white flex flex-wrap items-end gap-4"
    style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
    <div className="min-w-0 flex-1 basis-[260px]">
      <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">{en}</div>
      <div className="text-[22px] sm:text-[24px] font-black mt-1">{title}</div>
      <div className="text-[13px] text-white/55 mt-0.5">{desc}</div>
    </div>
    <div className="grid grid-cols-2 sm:flex gap-2.5 w-full sm:w-auto">
      {kpis.map(([k, v, u], i) => (
        <div key={k} className={`sm:min-w-[128px] rounded-2xl px-3.5 py-2.5 ${i === 0 ? "bg-white text-[#0B1428]" : "bg-white/[0.07] border border-white/[0.12]"}`}>
          <div className={`text-[12px] font-bold ${i === 0 ? "text-[#7A8AA6]" : "text-white/55"}`}>{k}</div>
          <div className="text-[20px] sm:text-[22px] font-black mt-0.5 truncate" style={NUM}>{v}<small className={`text-[12px] font-bold ml-0.5 ${i === 0 ? "text-[#7A8AA6]" : "text-white/50"}`}>{u}</small></div>
        </div>
      ))}
    </div>
  </div>
);
const Seg = ({ items, value, onChange, small }) => (
  <div className="inline-flex gap-[3px] p-[3px] rounded-xl bg-white border border-[#E3E8F0] max-w-full overflow-x-auto" style={{ scrollbarWidth: "none" }}>
    {items.map(([k, l, n]) => (
      <button key={k} type="button" onClick={() => onChange(k)} data-kp={`seg-${k}`}
        className={`shrink-0 ${small ? "h-8 px-3" : "h-8 px-3.5"} rounded-[9px] text-[13px] font-extrabold whitespace-nowrap flex items-center gap-1.5 ${value === k ? "bg-[#0B1428] text-white" : "text-[#5B6B85]"}`}>
        {l}{n != null && <em className="not-italic text-[11.5px] opacity-70" style={NUM}>{n}</em>}
      </button>
    ))}
  </div>
);
const dotCls = (lv) => (lv === "bad" ? "bg-[#D92D20]" : lv === "warn" ? "bg-white border-2 border-[#1B2B4B]" : lv === "info" ? "bg-[#C9D2E0]" : "bg-[#1B2B4B]");
const Dot = ({ lv }) => <i className={`inline-block w-2 h-2 rounded-full shrink-0 ${dotCls(lv)}`} />;
const statusChip = (s) => {
  const base = "inline-flex items-center gap-1 h-6 px-2 rounded-[7px] text-[11.5px] font-black whitespace-nowrap";
  if (s === "지급완료") return `${base} bg-white text-[#B42318] border border-[#B42318]`;
  if (s === "승인") return `${base} bg-[#1B2B4B] text-white`;
  if (s === "반려") return `${base} bg-white text-[#0B1428] border border-[#0B1428]`;
  if (s === "결재중") return `${base} bg-[#EEF3FB] text-[#2D4C82]`;
  if (s === "확인") return `${base} bg-white text-[#1B2B4B] border border-[#C9D3E3]`;
  return `${base} bg-[#F4F6FA] text-[#5B6B85]`;
};
const statusName = (s) => ({ 접수: "미확인", 확인: "확인 완료", 결재중: "결재 중", 승인: "승인", 지급완료: "지급완료", 반려: "반려" }[s] || s);

const btn = "h-9 px-3.5 rounded-[11px] text-[13px] font-black inline-flex items-center justify-center gap-1.5 whitespace-nowrap border";
const btnW = `${btn} bg-white border-[#E3E8F0] text-[#1B2B4B] disabled:opacity-40`;
const btnD = `${btn} bg-[#0B1428] border-[#0B1428] text-white disabled:opacity-40`;

// 사진 크게 보기
function Zoom({ src, onClose, paidDate, paid }) {
  return createPortal(
    <div className="fixed inset-0 z-[100000] bg-[#0B1428]/85 flex items-center justify-center p-4" onClick={onClose}>
      <img src={src} alt="영수증" className="max-w-full max-h-full rounded-lg bg-white" />
      {paid && <span className="absolute inset-0 flex items-center justify-center"><PaidStamp date={paidDate} size={1.4} /></span>}
      <button type="button" onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/10 text-white text-[18px]">✕</button>
    </div>, document.body);
}

function Detail({ e, checks, canEdit, me, onClose, onAct, phone }) {
  const [zoom, setZoom] = React.useState(false);
  useBackClose(!!phone && !!e && !zoom, onClose);
  useBackClose(zoom, () => setZoom(false));
  const [edit, setEdit] = React.useState(null);
  if (!e) return <div className="rounded-2xl bg-white border border-[#E3E8F0] h-full min-h-[300px] flex items-center justify-center text-[13.5px] text-[#9AA9C3] font-bold">왼쪽 목록에서 영수증을 고르세요</div>;
  const lv = checkLevel(checks);
  const kv = [["상호", e.vendor || "-"], ["사업자번호", e.bizNo ? fmtBizNo(e.bizNo) : "-"], ["결제 일시", `${e.date || "-"}${e.time ? ` ${e.time}` : ""}`], ["결제 수단", vexPayLabel(e.pay) || "-"],
    ...(e.cardApproval ? [["승인번호", `${e.cardApproval}${e.cardLast4 ? ` · 카드 ${e.cardLast4}` : ""}`]] : []), ...(e.km ? [["주행거리", `${won(e.km)} km`]] : []),
    ...(e.items?.length ? [["내용", e.items.slice(0, 4).join(" · ")]] : []), ...(e.memo ? [["기사 메모", e.memo]] : [])];
  const save = async () => { await patchExpense(e.id, { vendor: edit.vendor.trim(), amount: toNum(edit.amount), date: edit.date, bizNo: String(edit.bizNo || "").replace(/[^\d]/g, ""), pay: edit.pay }); setEdit(null); };
  const body = (
    <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden flex flex-col" data-kp="vex-detail">
      <div className="px-4 sm:px-5 py-4 border-b border-[#EEF1F6] flex items-center gap-2.5">
        {phone && <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl border border-[#E3E8F0] text-[#1B2B4B] font-black">‹</button>}
        <div className="min-w-0">
          <div className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#9AA9C3]">RECEIPT · SCAN</div>
          <div className="text-[16px] font-black mt-0.5 truncate">{e.driverName || "기사"} · {(e.kinds || []).map(vexKindLabel).join(" · ") || "비용"}</div>
          <div className="text-[12px] text-[#7A8AA6] mt-0.5" style={NUM}>{e.carNo} · 올린 시각 {at(e.createdAt)}</div>
        </div>
        {e.status === "지급완료" ? <span className="ml-auto shrink-0 whitespace-nowrap inline-flex items-center h-7 px-2.5 rounded-lg bg-white border-2 border-[#B42318] text-[#B42318] text-[12px] font-black" data-kp="vex-paid-chip">지급완료{e.paidDate ? ` · ${String(e.paidDate).slice(5).replace("-", ".")}` : ""}</span> : <span className={`ml-auto ${lv === "ok" ? "inline-flex items-center h-7 px-2.5 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-black" : "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-white border border-[#0B1428] text-[#0B1428] text-[12px] font-black"}`}>{lv !== "ok" && <Dot lv={lv} />}{lv === "ok" ? "자동 점검 통과" : checkHeadline(checks)}</span>}
      </div>
      <button type="button" onClick={() => setZoom(true)} className={`relative ${phone ? "h-[250px]" : "h-[440px] 2xl:h-[520px]"} bg-[#1a2233] flex items-center justify-center overflow-hidden`} title="크게 보기">
        <span className="absolute left-3 top-3 text-[10px] font-black tracking-[0.2em] text-[#8FB0F0] bg-[#0B1428]/70 px-2 py-1 rounded-md">SCANNED</span>
        {e.image ? <img src={e.image} alt="영수증" className="max-h-full max-w-full object-contain" /> : <span className="text-white/50 text-[13px]">사진 없음</span>}
        {e.status === "지급완료" && <span className="absolute inset-0 flex items-center justify-center"><PaidStamp date={e.paidDate} /></span>}
        <span className="absolute right-3 bottom-3 text-[11px] font-black text-white bg-[#0B1428]/70 px-2 py-1 rounded-md">크게 보기</span>
      </button>
      <div className="px-4 sm:px-5 py-3">
        <div className="flex items-end justify-between gap-2 pb-2 border-b border-[#EEF1F6]">
          <div className="text-[12.5px] font-bold text-[#7A8AA6]">금액</div>
          <div className="text-[24px] font-black" style={NUM}>{won(e.amount)}<span className="text-[13px] ml-0.5">원</span></div>
        </div>
        {edit ? (
          <div className="grid grid-cols-2 gap-2 py-3">
            {[["vendor", "상호"], ["amount", "금액"], ["date", "날짜"], ["bizNo", "사업자번호"]].map(([k, l]) => (
              <label key={k} className="text-[12px] font-bold text-[#5B6B85]">{l}
                <input type={k === "date" ? "date" : "text"} inputMode={k === "amount" || k === "bizNo" ? "numeric" : undefined} value={edit[k]} onChange={(ev) => setEdit({ ...edit, [k]: ev.target.value })}
                  className="mt-1 w-full h-9 px-2.5 rounded-lg border border-[#DCE3EE] text-[13.5px] font-bold text-[#0B1428] outline-none focus:border-[#2D4C82]" /></label>
            ))}
            <label className="col-span-2 text-[12px] font-bold text-[#5B6B85]">결제 수단
              <div className="mt-1 flex gap-1.5 flex-wrap">{VEX_PAYS.map(({ k, label }) => <button key={k} type="button" onClick={() => setEdit({ ...edit, pay: k })} className={`${btn} h-8 ${edit.pay === k ? "bg-[#0B1428] text-white border-[#0B1428]" : "bg-white text-[#1B2B4B] border-[#E3E8F0]"}`}>{label}</button>)}</div></label>
            <div className="col-span-2 flex gap-2 justify-end"><button type="button" onClick={() => setEdit(null)} className={btnW}>취소</button><button type="button" onClick={save} className={btnD}>저장</button></div>
          </div>
        ) : (
          <div className="grid grid-cols-[96px_1fr] text-[13px]">
            {kv.map(([k, v]) => <React.Fragment key={k}><div className="py-[7px] border-b border-[#EEF1F6] text-[#7A8AA6] font-bold">{k}</div><div className="py-[7px] border-b border-[#EEF1F6] font-extrabold text-right truncate" style={NUM}>{v}</div></React.Fragment>)}
          </div>
        )}
        <div className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#9AA9C3] mt-3.5 mb-0.5">AUTO CHECK</div>
        {checks.map((c) => (
          <div key={c.k + c.text} className="flex items-center gap-2.5 py-2 border-b border-[#EEF1F6] text-[13px]" data-kp={`vex-chk-${c.k}`}>
            <Dot lv={c.level} /><span className="font-extrabold w-[78px] shrink-0">{c.label}</span><span className="text-[#5B6B85] min-w-0 truncate">{c.text}</span>
          </div>
        ))}
        {(e.rejectReason && e.status === "반려") && <div className="mt-3 rounded-xl border border-[#0B1428] px-3 py-2 text-[12.5px] font-bold">반려 사유 · {e.rejectReason}</div>}
        {e.apNote && e.status === "확인" && <div className="mt-3 rounded-xl bg-[#F4F6FA] px-3 py-2 text-[12.5px] font-bold text-[#5B6B85]">{e.apNote} · 다시 지출결의할 수 있어요</div>}
        {e.apDocNo && <div className="mt-3 rounded-xl bg-[#EEF3FB] px-3 py-2 text-[12.5px] font-bold text-[#2D4C82]">전자결재 {e.apDocNo} · {e.status === "지급완료" ? `지급 완료${e.paidDate ? ` ${e.paidDate}` : ""}${e.paidBy ? ` · ${e.paidBy}` : ""}` : e.status === "승인" ? "최종 승인 · 지급 대기" : "결재 진행 중"}</div>}
      </div>
      {canEdit && (
        <div className="px-4 sm:px-5 pb-4 pt-1 flex flex-wrap gap-2">
          {e.phone && <a href={`tel:${e.phone}`} className={btnW}>정비소 전화</a>}
          {/* 🗑 2026-11-10 삭제 — 지출결의로 넘어가기 전만(결재 중 · 승인 · 지급완료는 전자결재 문서를 먼저 회수 · 반려) */}
          {canDeleteExpense(e)
            ? <button type="button" data-kp="vex-delete" onClick={() => onAct("delete", [e])} className={`${btn} bg-white border-[#F1C4BF] text-[#B42318]`}>삭제</button>
            : <span className="self-center text-[12px] font-bold text-[#7A8AA6]" data-kp="vex-delete-lock">전자결재에 올라간 영수증은 삭제할 수 없어요</span>}
          {!edit && ["접수", "확인"].includes(e.status) && <button type="button" onClick={() => setEdit({ vendor: e.vendor || "", amount: String(e.amount || ""), date: e.date || "", bizNo: e.bizNo || "", pay: e.pay || "personalCard" })} className={btnW}>고치기</button>}
          <span className="flex-1" />
          {["접수", "확인"].includes(e.status) && <button type="button" data-kp="vex-reject" onClick={() => onAct("reject", [e])} className={btnW}>반려</button>}
          {e.status === "접수" && <button type="button" data-kp="vex-confirm" onClick={() => onAct("confirm", [e])} className={btnW}>확인</button>}
          {["접수", "확인"].includes(e.status) && <button type="button" data-kp="vex-spend-one" onClick={() => onAct("spend", [e])} className={btnD}>지출결의 작성</button>}
        </div>
      )}
      {zoom && e.image && <Zoom src={e.image} paid={e.status === "지급완료"} paidDate={e.paidDate} onClose={() => setZoom(false)} />}
    </div>
  );
  if (phone) return createPortal(<div className="fixed inset-0 z-[9000] bg-[#F4F6FA] overflow-y-auto p-3 pb-24">{body}</div>, document.body);
  return body;
}

export function VehicleExpenseInbox({ company, drivers = [], canEdit = true, me = {} }) {
  const all = useCompanyExpenses(company);
  const list = React.useMemo(() => all || [], [all]);
  const narrow = useNarrow(1100);
  const [tab, setTab] = React.useState("접수");
  const [q, setQ] = React.useState("");
  const [month, setMonth] = React.useState(kstYmd().slice(0, 7));
  const [sel, setSel] = React.useState(() => new Set());
  const [cur, setCur] = React.useState(null);
  const [biz, setBiz] = React.useState({});
  const careOf = React.useMemo(() => { const m = new Map(); (drivers || []).forEach((d) => { if (d.uid) m.set(d.uid, d.care || {}); if (d.id) m.set(d.id, d.care || {}); }); return m; }, [drivers]);
  // 국세청 — 화면에 있는 사업자번호를 한 번에 조회(키가 없으면 "조회 전"으로)
  const bizKey = [...new Set(list.map((e) => String(e.bizNo || "")).filter((b) => b.length === 10))].sort().join(",");
  React.useEffect(() => {
    if (!bizKey) return;
    let alive = true;
    mainBiz.check(bizKey.split(",")).then((r) => { if (alive) setBiz(r.disabled ? { __disabled: true, ...r.results } : r.results || {}); }).catch(() => { if (alive) setBiz({ __disabled: true }); });
    return () => { alive = false; };
  }, [bizKey]);
  const checksOf = React.useCallback((e) => autoChecks(e, { others: list, biz: e.bizNo ? (biz[e.bizNo] || (biz.__disabled ? "disabled" : null)) : null, care: careOf.get(e.driverId) }), [list, biz, careOf]);
  const inMonth = list.filter((e) => !month || String(e.date || tsMs(e.createdAt) && new Date(tsMs(e.createdAt) + 9 * 3600e3).toISOString()).slice(0, 7) === month || (e.status === "접수" || e.status === "확인"));
  const counts = {}; STATUS_TABS.forEach(([k]) => { counts[k] = k === "all" ? inMonth.length : inMonth.filter((e) => e.status === k).length; });
  const ql = q.trim().toLowerCase();
  const rows = inMonth.filter((e) => (tab === "all" || e.status === tab) && (!ql || [e.driverName, e.carNo, e.vendor, e.memo, ...(e.kinds || []).map(vexKindLabel)].join(" ").toLowerCase().includes(ql)));
  const pending = list.filter((e) => ["접수", "확인"].includes(e.status));
  const needCheck = pending.filter((e) => checkLevel(checksOf(e)) !== "ok").length;
  const approvedSum = list.filter((e) => (e.status === "승인" || e.status === "지급완료") && String(e.date || "").slice(0, 7) === kstYmd().slice(0, 7)).reduce((a, e) => a + toNum(e.amount), 0);
  const curE = list.find((e) => e.id === cur) || (!narrow ? rows[0] : null) || null;
  const selRows = rows.filter((e) => sel.has(e.id));
  const selSum = selRows.reduce((a, e) => a + toNum(e.amount), 0);
  React.useEffect(() => { setSel(new Set()); }, [tab, month]);
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every((e) => sel.has(e.id));
  const act = async (kind, items) => {
    const ids = items.map((e) => e.id);
    if (!ids.length) return;
    if (kind === "confirm") { await setExpenseStatus(ids, "확인", { by: me.name || "" }); setSel(new Set()); return; }
    if (kind === "delete") {
      const ok = items.filter(canDeleteExpense);
      const locked = items.length - ok.length;
      if (!ok.length) { await kpConfirm("전자결재에 올라간 영수증(결재 중 · 승인 · 지급완료)은 삭제할 수 없어요.\n전자결재 문서를 먼저 회수하거나 반려해 주세요.", { okText: "확인" }); return; }
      if (!(await kpConfirm(`영수증 ${ok.length}건을 삭제할까요?${locked ? `\n(전자결재에 올라간 ${locked}건은 빼고)` : ""}\n기사앱에서도 사라지고 되돌릴 수 없습니다.`, { okText: "삭제", danger: true }))) return;
      for (const e of ok) { await deleteExpense(e.id); notifyDriver(e.driverId, company, "사무실에서 영수증을 삭제했어요", `${(e.kinds || []).map(vexKindLabel).join("·")} ${won(e.amount)}원 · ${String(e.date || "").slice(5).replace("-", ".")}`); }
      setSel(new Set()); setCur(null); return;
    }
    if (kind === "reject") {
      const reason = await kpPrompt(`${items.length}건을 반려할까요? 기사앱에 보일 사유를 적어 주세요`, "영수증 글씨가 잘 안 보여요 · 다시 찍어 주세요", { okText: "반려" });
      if (reason == null) return;
      const why = String(reason).trim() || "영수증을 다시 올려 주세요";
      await setExpenseStatus(ids, "반려", { by: me.name || "", reason: why });
      items.forEach((e) => notifyDriver(e.driverId, company, "영수증을 다시 올려주세요", `${(e.kinds || []).map(vexKindLabel).join("·")} ${won(e.amount)}원 · ${why}`));
      setSel(new Set()); return;
    }
    const usable = items.filter((e) => ["접수", "확인"].includes(e.status));
    if (!usable.length) return;
    const bad = usable.filter((e) => checkLevel(checksOf(e)) === "bad");
    if (bad.length && !(await kpConfirm(`자동 점검에서 확인이 필요한 영수증이 ${bad.length}건 있어요(${bad.map((e) => `${e.driverName} ${checkHeadline(checksOf(e))}`).join(", ")}). 그래도 지출결의를 작성할까요?`, { okText: "작성" }))) return;
    const notYet = usable.filter((e) => e.status === "접수").map((e) => e.id);
    if (notYet.length) await setExpenseStatus(notYet, "확인", { by: me.name || "" }).catch(() => {});
    if (kind === "each" && usable.length > 1) {
      const queue = usable.slice(1).map((e) => spendPresetOf([e]));
      try { sessionStorage.setItem("kpApPresetQueue", JSON.stringify(queue)); } catch { /* 사진이 커서 못 넣으면 한 장씩 다시 */ }
      openSpendComposer(spendPresetOf([usable[0]]));
    } else openSpendComposer(spendPresetOf(usable));
    setSel(new Set());
  };
  const row = (e) => { const ch = checksOf(e); return { ch, lv: checkLevel(ch), head: checkHeadline(ch) }; };
  return (
    <div className="space-y-3.5" data-kp="vex-inbox">
      <Hero en="FLEET · VEHICLE EXPENSE" title="차량 비용 영수증" desc="기사앱에서 올린 정비·수리 영수증 — 자동 점검 후 확인하고 지출결의로"
        kpis={[["미확인", list.filter((e) => e.status === "접수").length, "건"], ["확인 필요", needCheck, "건"], ["결재 중", list.filter((e) => e.status === "결재중").length, "건"], ["이번 달 승인", won(approvedSum), "원"]]} />
      <div className="flex flex-wrap items-center gap-2">
        <Seg items={STATUS_TABS.map(([k, l]) => [k, l, counts[k]])} value={tab} onChange={setTab} />
        <input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="기사·차량번호·정비소 검색" className="h-[38px] w-full sm:w-[230px] px-3 rounded-[11px] border border-[#E3E8F0] bg-white text-[13px] font-semibold outline-none focus:border-[#2D4C82]" />
        <span className="inline-flex items-center h-[38px] rounded-[11px] border border-[#E3E8F0] bg-white overflow-hidden" aria-label="조회 월">
          <button type="button" onClick={() => setMonth(shiftYm(month, -1))} className="w-9 h-full text-[#1B2B4B] font-black">‹</button>
          <span className="px-1.5 text-[13.5px] font-black text-[#0B1428]" style={NUM}>{month.replace("-", ".")}</span>
          <button type="button" onClick={() => setMonth(shiftYm(month, 1))} className="w-9 h-full text-[#1B2B4B] font-black">›</button>
        </span>
      </div>
      <div className={narrow ? "space-y-3" : "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3.5 items-start"}>
        <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden flex flex-col min-w-0">
          {narrow ? (
            <div>
              {rows.length === 0 && <div className="py-16 text-center text-[13.5px] text-[#9AA9C3] font-bold">{all ? "해당하는 영수증이 없어요" : "불러오는 중…"}</div>}
              {rows.map((e, i) => { const r = row(e); return (
                <div key={e.id} className={`flex items-center gap-3 px-3.5 py-3 ${i ? "border-t border-[#EEF1F6]" : ""}`} data-kp="vex-row">
                  {canEdit && <input type="checkbox" checked={sel.has(e.id)} onChange={() => toggle(e.id)} className="w-5 h-5 accent-[#0B1428] shrink-0" aria-label="선택" />}
                  <button type="button" onClick={() => setCur(e.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    {e.image ? <img src={e.image} alt="" className="w-10 h-12 rounded-lg object-cover border border-[#E3E8F0] shrink-0" /> : <span className="w-10 h-12 rounded-lg bg-[#F4F6FA] shrink-0" />}
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14.5px] font-black truncate">{e.driverName} <span className="text-[#7A8AA6] font-bold text-[12.5px]" style={NUM}>{e.carNo}</span></span>
                      <span className="block text-[12.5px] text-[#5B6B85] truncate">{(e.kinds || []).map(vexKindLabel).join(" · ")} · {e.vendor || "-"}</span>
                      <span className="flex items-center gap-1.5 text-[12px] font-extrabold mt-0.5"><Dot lv={r.lv} />{r.head}</span>
                    </span>
                    <span className="text-right shrink-0"><span className="block text-[15px] font-black" style={NUM}>{won(e.amount)}</span><span className={`${statusChip(e.status)} mt-1`}>{statusName(e.status)}</span></span>
                  </button>
                </div>
              ); })}
            </div>
          ) : (
            <table className="w-full border-separate border-spacing-0 kp-vex-table">
              <thead><tr className="text-left">
                {[canEdit ? "" : null, "올린 날", "기사 · 차량", "내용 · 정비소", "금액", "자동 점검", "상태"].filter((x) => x !== null).map((h, i) => (
                  <th key={h + i} className={`text-[11.5px] font-extrabold text-[#7A8AA6] px-3 py-[11px] bg-[#F8FAFC] border-b border-[#E3E8F0] whitespace-nowrap ${h === "금액" ? "text-right" : ""}`}>
                    {h === "" ? <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((e) => e.id)))} className="w-4 h-4 accent-[#0B1428]" aria-label="모두 선택" /> : h}
                  </th>))}
              </tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={7} className="py-16 text-center text-[13.5px] text-[#9AA9C3] font-bold">{all ? "해당하는 영수증이 없어요" : "불러오는 중…"}</td></tr>}
                {rows.map((e) => { const r = row(e); const on = curE?.id === e.id; return (
                  <tr key={e.id} onClick={() => setCur(e.id)} className={`cursor-pointer ${on ? "kp-vex-cur" : ""}`} data-kp="vex-row">
                    {canEdit && <td className="px-3 py-3 border-b border-[#EEF1F6]" onClick={(ev) => ev.stopPropagation()}><input type="checkbox" checked={sel.has(e.id)} onChange={() => toggle(e.id)} className="w-4 h-4 accent-[#0B1428]" aria-label="선택" /></td>}
                    <td className="px-3 py-2.5 border-b border-[#EEF1F6] text-[12.5px] font-semibold text-[#5B6B85] whitespace-nowrap" style={NUM}>{at(e.createdAt)}</td>
                    <td className="px-3 py-2.5 border-b border-[#EEF1F6] whitespace-nowrap"><div className="text-[13.5px] font-black">{e.driverName}</div><div className="text-[12px] text-[#7A8AA6]" style={NUM}>{e.carNo}</div></td>
                    <td className="px-3 py-2.5 border-b border-[#EEF1F6] max-w-[240px]"><div className="text-[13.5px] font-extrabold truncate">{(e.kinds || []).map(vexKindLabel).join(" · ")}{e.memo ? <span className="text-[#7A8AA6] font-bold"> · {e.memo}</span> : ""}</div><div className="text-[12px] text-[#7A8AA6] truncate">{e.vendor || "-"}</div></td>
                    <td className="px-3 py-2.5 border-b border-[#EEF1F6] text-right whitespace-nowrap"><div className="text-[14px] font-black" style={NUM}>{won(e.amount)}</div><div className="text-[11.5px] font-bold text-[#7A8AA6]">{vexPayLabel(e.pay)}</div></td>
                    <td className="px-3 py-2.5 border-b border-[#EEF1F6] whitespace-nowrap"><span className="inline-flex items-center gap-1.5 text-[12.5px] font-extrabold"><Dot lv={r.lv} />{r.head}</span></td>
                    <td className="px-3 py-2.5 border-b border-[#EEF1F6] whitespace-nowrap"><span className={statusChip(e.status)}>{statusName(e.status)}</span></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          )}
          {canEdit && selRows.length > 0 && (
            <div className={`p-3 ${narrow ? "sticky bottom-0" : "mt-auto"}`}>
              <div className="rounded-2xl bg-[#0B1428] text-white px-4 py-3 flex flex-wrap items-center gap-2.5" data-kp="vex-bar">
                <span className="text-[13px] text-white/60">선택</span><span className="text-[18px] font-black" style={NUM}>{selRows.length}건 · {won(selSum)}원</span>
                <span className="flex-1" />
                <button type="button" data-kp="vex-delete-sel" onClick={() => act("delete", selRows)} className={`${btn} bg-white/[0.08] border-white/[0.16] text-[#FFB4AB]`}>삭제</button>
                <button type="button" onClick={() => act("reject", selRows)} className={`${btn} bg-white/[0.08] border-white/[0.16] text-white`}>반려</button>
                <button type="button" onClick={() => act("confirm", selRows.filter((e) => e.status === "접수"))} className={`${btn} bg-white/[0.08] border-white/[0.16] text-white`}>확인</button>
                <button type="button" data-kp="vex-spend-each" onClick={() => act("each", selRows)} className={`${btn} bg-white/[0.08] border-white/[0.16] text-white`}>건별 지출결의 ({selRows.length}장)</button>
                {selRows.length > 1 && <button type="button" data-kp="vex-spend-bundle" onClick={() => act("bundle", selRows)} className={`${btn} bg-white border-white text-[#0B1428]`}>묶어서 지출결의 (1장)</button>}
              </div>
            </div>
          )}
        </div>
        {(!narrow || cur) && <Detail e={curE} checks={curE ? checksOf(curE) : []} canEdit={canEdit} me={me} onAct={act} phone={narrow} onClose={() => setCur(null)} />}
      </div>
      <style>{".kp-vex-table tbody tr:hover td{background:#F8FAFD}.kp-vex-table tbody tr.kp-vex-cur td{background:#EEF3FB}.kp-vex-table tbody tr.kp-vex-cur td:first-child{box-shadow:inset 3px 0 0 #1B2B4B}.kp-vex-table td{height:auto}"}</style>
    </div>
  );
}

// ───────────────── 정기 차량 사진 ─────────────────
export function VehiclePhotoBoard({ company, drivers = [], canEdit = true, myName = "" }) {
  const saved = usePhotoSettings(company);
  const [s, setS] = React.useState(null);
  React.useEffect(() => { if (saved && !s) setS(saved); }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const narrow = useNarrow(1100);
  const [view, setView] = React.useState("all");
  const [zoom, setZoom] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [newPart, setNewPart] = React.useState("");
  const [sent, setSent] = React.useState(0);
  const cfg = s || saved;
  const per = cfg ? photoPeriod(saved || cfg, kstYmd()) : null;
  const photos = useCompanyPeriodPhotos(company, per?.key) || [];
  if (!cfg) return <div className="py-20 text-center text-[13px] text-[#9AA9C3] font-bold">불러오는 중…</div>;
  const live = saved || cfg;
  const parts = live.parts || [];
  const inScope = (drivers || []).filter((d) => photoTargetOk(live, d) && d.차량번호);
  const targets = inScope.filter((d) => d.uid); // 기사앱 계정이 있는 기사만(앱이 없으면 사진을 올릴 수 없다)
  const noApp = inScope.length - targets.length;
  const rows = targets.map((d) => {
    const uid = d.uid;
    const mine = photos.filter((p) => p.driverId === uid);
    const n = parts.filter((pt) => mine.some((p) => p.part === pt)).length;
    const lastAt = Math.max(0, ...mine.map((p) => tsMs(p.createdAt) || p.takenAt || 0));
    const km = (mine.find((p) => p.km) || {}).km || null;
    return { d, uid, mine, n, lastAt, km };
  }).sort((a, b) => a.n - b.n || String(a.d.이름 || "").localeCompare(String(b.d.이름 || ""), "ko"));
  const doneN = rows.filter((r) => r.n >= parts.length && parts.length).length;
  const shown = rows.filter((r) => view === "all" || (view === "miss" ? r.n < parts.length : r.n >= parts.length));
  const dirty = JSON.stringify({ ...saved, updatedAt: null, updatedBy: null }) !== JSON.stringify({ ...cfg, updatedAt: null, updatedBy: null });
  const save = async () => { setBusy(true); try { await savePhotoSettings(company, { on: cfg.on, cycle: cfg.cycle, dueDow: cfg.dueDow, dueDay: cfg.dueDay, parts: cfg.parts, target: cfg.target }, myName); } finally { setBusy(false); } };
  const lbl = "text-[12.5px] font-extrabold text-[#5B6B85] mb-1.5";
  const left = per ? daysLeft(per.due, kstYmd()) : 0;
  return (
    <div className="space-y-3.5" data-kp="vph-board">
      <Hero en="FLEET · VEHICLE PHOTO" title="정기 차량 사진" desc={live.on ? `${(PHOTO_CYCLES.find((x) => x[0] === live.cycle) || [])[1]} · ${per?.label} · 기사님이 차량 사진을 올립니다` : "아직 꺼져 있어요 · 왼쪽에서 주기를 정하고 [사용]을 켠 뒤 저장하세요"}
        kpis={[["이번 기간 제출", `${doneN}`, `/ ${rows.length}명`], ["미제출", rows.length - doneN, "명"], ["마감", per ? `${per.due.slice(5).replace("-", ".")}` : "-", left >= 0 ? ` D-${left}` : " 지남"]]} />
      <div className={narrow ? "space-y-3" : "grid grid-cols-[360px_minmax(0,1fr)] gap-3.5 items-start"}>
        <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4 sm:p-5 flex flex-col gap-4" data-kp="vph-settings">
          <div className="flex items-center"><div className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#9AA9C3]">SETTINGS</div>
            <button type="button" role="switch" aria-checked={!!cfg.on} disabled={!canEdit} data-kp="vph-on" onClick={() => setS({ ...cfg, on: !cfg.on })} className="ml-auto flex items-center gap-2 text-[13px] font-black">
              {cfg.on ? "사용 중" : "꺼짐"}<span className={`relative inline-flex h-6 w-11 rounded-full ${cfg.on ? "bg-[#1B2B4B]" : "bg-[#C9D2E0]"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${cfg.on ? "left-[22px]" : "left-0.5"}`} /></span></button></div>
          <div><div className={lbl}>주기</div><Seg items={PHOTO_CYCLES} value={cfg.cycle} onChange={(v) => canEdit && setS({ ...cfg, cycle: v })} /></div>
          {(cfg.cycle === "weekly" || cfg.cycle === "biweekly") && <div><div className={lbl}>마감 요일</div><Seg items={PHOTO_DOWS} value={cfg.dueDow} onChange={(v) => canEdit && setS({ ...cfg, dueDow: v })} small /></div>}
          {cfg.cycle === "monthly" && <div><div className={lbl}>마감 날짜</div>
            <div className="flex items-center gap-2"><span className="text-[13px] font-bold text-[#5B6B85]">매월</span><input type="number" min={1} max={31} value={cfg.dueDay} disabled={!canEdit} onChange={(e) => setS({ ...cfg, dueDay: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })} className="w-20 h-9 px-2.5 rounded-lg border border-[#DCE3EE] text-[14px] font-black text-center" /><span className="text-[13px] font-bold text-[#5B6B85]">일까지(말일보다 크면 말일)</span></div></div>}
          <div><div className={lbl}>찍을 부위</div>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set([...PHOTO_PARTS, ...(cfg.parts || [])])].map((p) => { const on = (cfg.parts || []).includes(p); return (
                <button key={p} type="button" disabled={!canEdit} data-kp={`vph-part-${p}`} onClick={() => setS({ ...cfg, parts: on ? cfg.parts.filter((x) => x !== p) : [...(cfg.parts || []), p] })}
                  className={`h-8 px-3 rounded-lg text-[13px] font-black border ${on ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-[#1B2B4B] border-[#C9D3E3]"}`}>{p}</button>); })}
              {canEdit && <span className="inline-flex items-center gap-1"><input value={newPart} onChange={(e) => setNewPart(e.target.value)} placeholder="+ 직접 추가" className="h-8 w-24 px-2.5 rounded-lg border border-dashed border-[#C9D3E3] text-[12.5px] font-bold outline-none" onKeyDown={(e) => { if (e.key === "Enter" && newPart.trim()) { setS({ ...cfg, parts: [...new Set([...(cfg.parts || []), newPart.trim()])] }); setNewPart(""); } }} /></span>}
            </div></div>
          <div><div className={lbl}>대상</div><Seg items={[["all", "전체 기사"], ["지입", "지입"], ["직영", "직영"]]} value={cfg.target} onChange={(v) => canEdit && setS({ ...cfg, target: v })} /></div>
          <div className="rounded-xl bg-[#F8FAFC] border border-[#E3E8F0] px-3.5 py-3 text-[12.5px] text-[#5B6B85] leading-relaxed">기사앱 [차량] 탭에 <b className="text-[#0B1428]">정기 차량 사진</b> 버튼이 생겨요<br />마감 2일 전부터 기사앱 홈에 알림 카드 · 계기판 사진은 주행거리도 기록</div>
          {canEdit && <button type="button" disabled={!dirty || busy || !(cfg.parts || []).length} onClick={save} data-kp="vph-save" className={`${btnD} h-11 text-[14px]`}>{busy ? "저장 중…" : dirty ? "저장" : "저장됨"}</button>}
        </div>
        <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden min-w-0">
          <div className="px-4 py-3.5 flex flex-wrap items-center gap-2 border-b border-[#EEF1F6]">
            <Seg items={[["all", `전체 ${rows.length}`], ["miss", `미제출 ${rows.length - doneN}`], ["done", `제출 ${doneN}`]]} value={view} onChange={setView} />
            <span className="ml-auto text-[12.5px] font-bold text-[#7A8AA6]">{per?.label}{noApp > 0 ? ` · 기사앱 미가입 ${noApp}명 제외` : ""}</span>
            {canEdit && live.on && rows.length - doneN > 0 && <button type="button" data-kp="vph-remind" onClick={async () => {
              const miss = rows.filter((r) => r.n < parts.length);
              if (!(await kpConfirm(`미제출 ${miss.length}명에게 기사앱 알림을 보낼까요?`, { okText: "보내기" }))) return;
              await Promise.all(miss.map((r) => notifyDriver(r.uid, company, "정기 차량 사진을 올려주세요", `${per.due.slice(5).replace("-", ".")}까지 · ${parts.join("·")} (${r.n}/${parts.length}장)`, "vehicle_photo")));
              setSent(miss.length);
            }} className={btnW}>{sent ? `${sent}명에게 보냄 ✓` : `미제출 ${rows.length - doneN}명에게 알림`}</button>}
          </div>
          {!live.on && <div className="py-16 text-center text-[13.5px] text-[#9AA9C3] font-bold">정기 차량 사진이 꺼져 있어요</div>}
          {live.on && (narrow ? (
            <div>{shown.map((r, i) => (
              <div key={r.uid} className={`px-3.5 py-3 ${i ? "border-t border-[#EEF1F6]" : ""}`}>
                <div className="flex items-center gap-2"><b className="text-[14.5px]">{r.d.이름}</b><span className="text-[12.5px] text-[#7A8AA6]" style={NUM}>{r.d.차량번호}</span><span className={`ml-auto ${r.n >= parts.length ? statusChip("승인") : r.n ? statusChip("확인") : statusChip("반려")}`}>{r.n >= parts.length ? "제출" : r.n ? `${r.n} / ${parts.length}` : "미제출"}</span></div>
                <div className="flex gap-1.5 mt-2 overflow-x-auto">{parts.map((pt) => { const ph = r.mine.find((p) => p.part === pt); return ph ? <button key={pt} type="button" onClick={() => setZoom(ph.image)} className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0"><img src={ph.image} alt={pt} className="w-full h-full object-cover" /><span className="absolute inset-x-0 bottom-0 text-[10px] font-black text-white bg-[#0B1428]/60">{pt}</span></button> : <span key={pt} className="w-14 h-14 rounded-lg border border-dashed border-[#B8C4D8] shrink-0 text-[10.5px] font-bold text-[#9AA9C3] flex items-center justify-center">{pt}</span>; })}</div>
              </div>))}</div>
          ) : (
            <table className="w-full border-separate border-spacing-0">
              <thead><tr className="text-left">{["기사 · 차량", parts.join(" · "), "올린 시간", "주행거리", "상태"].map((h, i) => <th key={i} className={`text-[11.5px] font-extrabold text-[#7A8AA6] px-3 py-[11px] bg-[#F8FAFC] border-b border-[#E3E8F0] whitespace-nowrap ${h === "주행거리" ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={5} className="py-16 text-center text-[13.5px] text-[#9AA9C3] font-bold">대상 기사가 없어요</td></tr>}
                {shown.map((r) => (
                  <tr key={r.uid} data-kp="vph-row">
                    <td className="px-3 py-2.5 border-b border-[#EEF1F6] text-[13.5px] whitespace-nowrap"><b>{r.d.이름}</b> <span className="text-[#7A8AA6]" style={NUM}>{r.d.차량번호}</span></td>
                    <td className="px-3 py-2.5 border-b border-[#EEF1F6]"><span className="inline-flex gap-1">{parts.map((pt) => { const ph = r.mine.find((p) => p.part === pt); return ph
                      ? <button key={pt} type="button" title={pt} onClick={() => setZoom(ph.image)} className="w-9 h-9 rounded-md overflow-hidden ring-1 ring-[#1B2B4B]"><img src={ph.image} alt={pt} className="w-full h-full object-cover" /></button>
                      : <span key={pt} title={pt} className="w-9 h-9 rounded-md border-[1.5px] border-dashed border-[#B8C4D8] text-[9.5px] font-bold text-[#9AA9C3] flex items-center justify-center">{pt.slice(0, 2)}</span>; })}</span></td>
                    <td className="px-3 py-2.5 border-b border-[#EEF1F6] text-[13px] font-semibold whitespace-nowrap" style={NUM}>{r.lastAt ? at(r.lastAt) : <span className="text-[#9AA9C3]">-</span>}</td>
                    <td className="px-3 py-2.5 border-b border-[#EEF1F6] text-[13px] font-semibold text-right whitespace-nowrap" style={NUM}>{r.km ? won(r.km) : <span className="text-[#9AA9C3]">-</span>}</td>
                    <td className="px-3 py-2.5 border-b border-[#EEF1F6] whitespace-nowrap">{r.n >= parts.length ? <span className={statusChip("승인")}>제출</span> : r.n ? <span className={statusChip("확인")}>{r.n} / {parts.length}</span> : <span className={statusChip("반려")}><i className="inline-block w-1.5 h-1.5 rounded-full bg-[#D92D20]" />미제출</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </div>
      {zoom && <Zoom src={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
