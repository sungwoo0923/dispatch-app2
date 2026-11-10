// ======================= src/driver/DriverVehicleExpense.jsx =======================
// 🧾 2026-11-10 기사앱 [차량] — 비용 영수증 올리기 · 정기 차량 사진 (운전하시는 분 · 나이 많으신 분도 쉽게: 큰 버튼, 한 화면에 한 가지)
//  · VehicleExpenseCards   [차량] 탭 맨 위 — 큰 버튼 2개 + 내가 올린 영수증(상태 · 반려 사유 · 다시 올리기)
//  · PhotoDueCard          홈 — 정기 차량 사진 마감이 가까운데 덜 찍었을 때만
//  영수증: ① 찍기(카메라/사진첩) → ② 무엇을 했나요(큰 타일 · 여러 개) → ③ 자동으로 읽은 금액·정비소·날짜 확인 + 결제 수단 → 보내기
//  정기 사진: 칸을 누르면 카메라 → 찍는 즉시 저장(보내기 버튼 없음) · 계기판은 주행거리 숫자도(선택)
import React from "react";
import { kpConfirm } from "../kpDialog";
import { VEX_KINDS, VEX_PAYS, vexKindLabel, vexDriverStatus, won, toNum, photoPeriod, daysLeft, photoTargetOk } from "../vehicleExpenseCore";
import { PaidStamp } from "../PaidStamp"; // 💸 지급완료 도장(사무실 화면과 같은 모양)
import { prepPhoto, scanReceipt, submitExpense, resubmitExpense, deleteExpense, canDeleteExpense, useDriverExpenses, usePhotoSettings, useDriverPeriodPhotos, savePeriodPhoto } from "../vehicleExpense";

const INK = "#0B1428"; const NAVY = "#1B2B4B"; const BLUE = "#2D4C82"; const SKY = "#8FB0F0";
const LINE = "#E3E8F0"; const MUTE = "#7A8AA6"; const BG = "#F4F6FA";
const FONT = '"Pretendard","Noto Sans KR",sans-serif';
const NUM = { fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" };
const EN = { fontSize: 10.5, fontWeight: 800, letterSpacing: "0.24em" };
const kstYmd = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const md = (ymd) => String(ymd || "").slice(5, 10).replace("-", ".");

const Ico = ({ d, size = 24, color = "#fff", w = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const IC = {
  receipt: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" /><path d="M9 7h6M9 11h6M9 15h4" /></>,
  camera: <><path d="M3 7h4l2-3h6l2 3h4v13H3z" /><circle cx="12" cy="13" r="4" /></>,
  back: <path d="M15 18l-6-6 6-6" />, close: <path d="M18 6L6 18M6 6l12 12" />, chev: <path d="M9 18l6-6-6-6" />,
  send: <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></>,
  engineOil: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  tire: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /></>,
  brake: <><circle cx="12" cy="12" r="8" /><path d="M12 4v4M12 16v4M4 12h4M16 12h4" /></>,
  repair: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z" />,
  filter: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3v18" /></>,
  etc: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
  pen: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
};
const chip = (kind) => {
  const base = { display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 10px", borderRadius: 8, fontSize: 13, fontWeight: 900, whiteSpace: "nowrap" };
  if (kind === "ok") return { ...base, background: NAVY, color: "#fff" };
  if (kind === "no") return { ...base, background: "#fff", color: INK, border: `1px solid ${INK}` };
  if (kind === "wait") return { ...base, background: "#fff", color: NAVY, border: "1px solid #C9D3E3" };
  return { ...base, background: "#EEF3FB", color: BLUE };
};
const statusKind = (s) => (s === "승인" || s === "지급완료" ? "ok" : s === "반려" ? "no" : "ing");
const Dot = () => <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#D92D20", display: "inline-block" }} />;
const bigBtn = (dark = true, extra = {}) => ({ height: 62, borderRadius: 18, border: dark ? "none" : `1px solid ${LINE}`, background: dark ? INK : "#fff", color: dark ? "#fff" : INK, fontSize: 18, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", cursor: "pointer", fontFamily: FONT, ...extra });

function TopBar({ title, onBack, onClose, steps, dark = false }) {
  return (
    <div style={{ position: "relative", padding: "14px 18px 16px", color: "#fff", background: dark ? "transparent" : "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)", paddingTop: "calc(14px + env(safe-area-inset-top))" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 40 }}>
        <button type="button" onClick={onBack || onClose} aria-label={onBack ? "뒤로" : "닫기"} style={{ width: 44, height: 44, borderRadius: 12, border: "none", background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Ico d={onBack ? IC.back : IC.close} size={20} /></button>
        <div style={{ fontSize: 17, fontWeight: 900 }}>{title}</div>
        <div style={{ width: 44 }} />
      </div>
      {steps && <div style={{ display: "flex", gap: 6, marginTop: 14 }}>{[1, 2, 3].map((i) => <div key={i} style={{ flex: 1, height: 4, borderRadius: 4, background: i <= steps ? SKY : "rgba(255,255,255,.15)" }} />)}</div>}
    </div>
  );
}
const Sheet = ({ children, dark = false }) => (
  <div data-kp="vex-sheet" style={{ position: "fixed", inset: 0, zIndex: 9500, background: dark ? INK : BG, display: "flex", flexDirection: "column", fontFamily: FONT, color: INK }}>{children}</div>
);
const Foot = ({ children }) => <div style={{ padding: "12px 16px calc(18px + env(safe-area-inset-bottom))", display: "grid", gap: 10 }}>{children}</div>;
const Q = ({ en, q, sub }) => (<div style={{ margin: "4px 2px 16px" }}><div style={{ ...EN, color: "#9AA9C3" }}>{en}</div><div style={{ fontSize: 25, fontWeight: 900, letterSpacing: "-0.02em", marginTop: 6 }}>{q}</div>{sub && <div style={{ fontSize: 15, color: MUTE, marginTop: 4 }}>{sub}</div>}</div>);

// 사진 고르기(카메라 · 사진첩) — 숨긴 입력 두 개
function usePicker(onPick) {
  const cam = React.useRef(null); const gal = React.useRef(null);
  const el = (
    <>
      <input ref={cam} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPick(f, true); }} />
      <input ref={gal} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPick(f, false); }} />
    </>
  );
  return { el, camera: () => cam.current?.click(), gallery: () => gal.current?.click() };
}

// ───────────────── 영수증 올리기(3단계) ─────────────────
function ExpenseWizard({ uid, driver, onClose, onToast }) {
  const [step, setStep] = React.useState(1);
  const [photo, setPhoto] = React.useState(null);
  const [captured, setCaptured] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [scan, setScan] = React.useState(null);
  const [kinds, setKinds] = React.useState([]);
  const [memo, setMemo] = React.useState("");
  const [f, setF] = React.useState({ amount: "", vendor: "", date: kstYmd(), time: "", km: "", pay: "", bizNo: "", phone: "", cardApproval: "", cardLast4: "", items: [] });
  const [editAmt, setEditAmt] = React.useState(false);
  const scanP = React.useRef(null);
  const pick = async (file, cam) => {
    setBusy("사진 준비 중");
    try {
      const p = await prepPhoto(file);
      setPhoto(p); setCaptured(cam); setStep(2); setBusy("");
      scanP.current = scanReceipt(p.dataUrl).then((r) => {
        setScan(r);
        setF((x) => ({ ...x, amount: x.amount || (r.amount ? String(r.amount) : ""), vendor: x.vendor || r.vendor || "", date: r.date || x.date, time: r.time || x.time, bizNo: r.bizNo || "", phone: r.phone || "", cardApproval: r.cardApproval || "", cardLast4: r.cardLast4 || "", items: r.items || [], pay: x.pay || r.pay || "" }));
        setKinds((k) => (k.length ? k : (r.kinds || [])));
        return r;
      });
    } catch { setBusy(""); onToast?.("사진을 열지 못했어요. 다시 찍어 주세요"); }
  };
  const P = usePicker(pick);
  const toggle = (k) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));
  const goConfirm = async () => {
    if (!kinds.length) { onToast?.("무엇을 했는지 하나 이상 눌러주세요"); return; }
    setStep(3);
    if (!scan && scanP.current) { setBusy("영수증 읽는 중"); await scanP.current.catch(() => null); setBusy(""); }
  };
  const send = async () => {
    if (!toNum(f.amount)) { setEditAmt(true); onToast?.("금액을 넣어주세요"); return; }
    if (!f.pay) { onToast?.("결제 수단을 눌러주세요"); return; }
    setBusy("보내는 중");
    try { await submitExpense({ uid, driver, photo, captured, kinds, memo, f, scan }); onToast?.("사무실로 보냈습니다 ✓"); onClose(); } catch (e) { setBusy(""); onToast?.(`보내지 못했어요: ${e.message || e}`); }
  };
  const busyCover = busy && (
    <div style={{ position: "absolute", inset: 0, zIndex: 2, background: "rgba(11,20,40,.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 18, padding: "22px 26px", display: "flex", alignItems: "center", gap: 12, fontSize: 16, fontWeight: 900 }}>
        <span style={{ width: 22, height: 22, border: "3px solid #DCE3EE", borderTopColor: NAVY, borderRadius: "50%", animation: "kpspin 0.8s linear infinite" }} />{busy}…
      </div>
      <style>{"@keyframes kpspin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );

  if (step === 1) return (
    <Sheet dark>{P.el}{busyCover}
      <TopBar title="영수증 올리기" onClose={onClose} steps={1} dark />
      <div style={{ padding: "6px 20px 0", color: "#fff" }}><div style={{ ...EN, color: SKY }}>STEP 1 / 3</div><div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>영수증을 찍어주세요</div><div style={{ fontSize: 15, color: "rgba(255,255,255,.55)", marginTop: 4 }}>영수증 전체가 보이게 · 글씨가 잘 보이게</div></div>
      <div style={{ flex: 1, position: "relative", margin: "18px 26px" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 18, background: "radial-gradient(#26314a,#131b2b)" }} />
        {[["left", "top"], ["right", "top"], ["left", "bottom"], ["right", "bottom"]].map(([x, y]) => <span key={x + y} style={{ position: "absolute", [x]: 22, [y]: 22, width: 38, height: 38, [`border${x === "left" ? "Left" : "Right"}`]: `4px solid ${SKY}`, [`border${y === "top" ? "Top" : "Bottom"}`]: `4px solid ${SKY}`, borderRadius: 6 }} />)}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: "rgba(255,255,255,.45)", fontSize: 15, fontWeight: 700 }}><Ico d={IC.receipt} size={54} color="rgba(143,176,240,.55)" w={1.6} />네모 칸 안에 영수증을 맞춰 찍어요</div>
      </div>
      <Foot>
        <button type="button" data-kp="vex-camera" onClick={P.camera} style={bigBtn(false, { border: "none" })}><Ico d={IC.camera} size={24} color={INK} w={2.2} />사진 찍기</button>
        <button type="button" data-kp="vex-gallery" onClick={P.gallery} style={bigBtn(true, { background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.16)" })}>사진첩에서 고르기</button>
      </Foot>
    </Sheet>
  );
  if (step === 2) return (
    <Sheet>{busyCover}
      <TopBar title="영수증 올리기" onBack={() => setStep(1)} steps={2} />
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 0" }}>
        <Q en="STEP 2 / 3" q="무엇을 했나요?" sub="해당하는 것을 모두 눌러주세요" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {VEX_KINDS.map(({ k, label }) => {
            const on = kinds.includes(k);
            return (
              <button key={k} type="button" data-kp={`vex-kind-${k}`} onClick={() => toggle(k)} aria-pressed={on}
                style={{ position: "relative", height: 112, borderRadius: 18, border: `1px solid ${on ? INK : LINE}`, background: on ? INK : "#fff", color: on ? "#fff" : INK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 18, fontWeight: 900, cursor: "pointer", fontFamily: FONT }}>
                <Ico d={IC[k]} size={30} color={on ? SKY : NAVY} />{label}
                {on && <span style={{ position: "absolute", top: 10, right: 12, width: 24, height: 24, borderRadius: "50%", background: SKY, color: INK, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>}
              </button>
            );
          })}
        </div>
        <label style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: "0 14px", height: 56 }}>
          <Ico d={IC.pen} size={19} color={MUTE} />
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="목록에 없으면 한 줄로 적어주세요 (선택)" data-kp="vex-memo"
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 16, fontWeight: 700, fontFamily: FONT, color: INK, background: "transparent" }} />
        </label>
      </div>
      <Foot><button type="button" data-kp="vex-next" onClick={goConfirm} style={bigBtn(true, kinds.length ? {} : { background: "#C9D2E0" })}>다음</button></Foot>
    </Sheet>
  );
  const fld = (label, node, auto) => (
    <div style={{ padding: "13px 14px", borderTop: `1px solid #EEF1F6`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <span style={{ fontSize: 14, color: MUTE, fontWeight: 700, flexShrink: 0 }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>{node}{auto && <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", color: BLUE, background: "#EEF3FB", borderRadius: 5, padding: "2px 6px" }}>AUTO</span>}</span>
    </div>
  );
  const inp = { border: "none", outline: "none", textAlign: "right", fontSize: 16.5, fontWeight: 800, fontFamily: FONT, color: INK, background: "transparent", minWidth: 0, width: "100%" };
  return (
    <Sheet>{busyCover}
      <TopBar title="영수증 올리기" onBack={() => setStep(2)} steps={3} />
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 0" }}>
        <Q en="STEP 3 / 3 · AUTO SCAN" q="이 내용이 맞나요?" sub={scan?.count ? "영수증에서 자동으로 읽었어요 · 틀리면 눌러서 고치기" : "영수증 글씨를 못 읽었어요 · 금액만 넣어주세요"} />
        <button type="button" onClick={() => setEditAmt(true)} data-kp="vex-amount" style={{ width: "100%", border: "none", borderRadius: 18, background: INK, color: "#fff", padding: "18px 16px", textAlign: "center", cursor: "pointer", fontFamily: FONT }}>
          <div style={{ fontSize: 13.5, color: "rgba(255,255,255,.55)", fontWeight: 700 }}>결제 금액{scan?.amount && toNum(f.amount) === scan.amount ? " · 자동으로 읽음" : ""}</div>
          {editAmt
            ? <input autoFocus inputMode="numeric" value={f.amount ? won(toNum(f.amount)) : ""} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d]/g, "") })} onBlur={() => setEditAmt(false)} placeholder="0" data-kp="vex-amount-input"
              style={{ ...inp, ...NUM, textAlign: "center", color: "#fff", fontSize: 38, fontWeight: 900, marginTop: 2 }} />
            : <div style={{ ...NUM, fontSize: 40, fontWeight: 900, marginTop: 2 }}>{toNum(f.amount) ? won(toNum(f.amount)) : "금액 넣기"}<span style={{ fontSize: 18, marginLeft: 3 }}>{toNum(f.amount) ? "원" : ""}</span></div>}
          <div style={{ fontSize: 13, color: SKY, fontWeight: 800, marginTop: 2 }}>{kinds.map(vexKindLabel).join(" · ")}{memo ? ` · ${memo}` : ""}</div>
        </button>
        <div style={{ fontSize: 14, color: MUTE, fontWeight: 800, margin: "14px 4px 8px" }}>결제 수단</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {VEX_PAYS.map(({ k, label }) => (
            <button key={k} type="button" data-kp={`vex-pay-${k}`} onClick={() => setF({ ...f, pay: k })} aria-pressed={f.pay === k}
              style={{ height: 54, borderRadius: 14, border: `1px solid ${f.pay === k ? INK : LINE}`, background: f.pay === k ? INK : "#fff", color: f.pay === k ? "#fff" : INK, fontSize: 16.5, fontWeight: 900, cursor: "pointer", fontFamily: FONT }}>{label}</button>
          ))}
        </div>
        <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 18, marginTop: 10, overflow: "hidden" }}>
          <div style={{ borderTop: "none" }}>{fld("정비소", <input value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} placeholder="정비소 이름" style={inp} />, !!scan?.vendor && f.vendor === scan.vendor)}</div>
          {fld("날짜", <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} style={{ ...inp, ...NUM }} />, !!scan?.date && f.date === scan.date)}
          {fld("주행거리", <><input inputMode="numeric" value={f.km ? won(toNum(f.km)) : ""} onChange={(e) => setF({ ...f, km: e.target.value.replace(/[^\d]/g, "") })} placeholder={driver?.care?.odometer ? won(driver.care.odometer) : "선택"} style={{ ...inp, ...NUM, width: 120 }} /><span style={{ fontSize: 14, color: MUTE, fontWeight: 700 }}>km</span></>)}
          {f.items?.length > 0 && fld("내용", <span style={{ fontSize: 14, fontWeight: 800, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.items.slice(0, 3).join(" · ")}</span>)}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "14px 4px 10px" }}>
          {photo && <img src={photo.dataUrl} alt="영수증" style={{ width: 48, height: 60, objectFit: "cover", borderRadius: 8, border: `1px solid ${LINE}` }} />}
          <span style={{ fontSize: 14, color: MUTE }}>영수증 사진 1장 · <button type="button" onClick={() => { setStep(1); setScan(null); }} style={{ border: "none", background: "none", padding: 0, color: NAVY, fontWeight: 900, fontSize: 14, cursor: "pointer", fontFamily: FONT }}>다시 찍기</button></span>
        </div>
      </div>
      <Foot><button type="button" data-kp="vex-send" onClick={send} style={bigBtn(true)}><Ico d={IC.send} size={20} w={2.4} />사무실로 보내기</button></Foot>
    </Sheet>
  );
}

// 📋 2026-11-10 내가 올린 영수증 전체 목록([더보기]) — 달마다 묶고 합계
function ExpenseList({ list, onOpen, onClose }) {
  const months = [...new Set(list.map((e) => String(e.date || "").slice(0, 7)))].sort().reverse();
  return (
    <Sheet>
      <TopBar title="내가 올린 영수증" onBack={onClose} />
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }} data-kp="vex-all">
        {months.map((m) => {
          const rows = list.filter((e) => String(e.date || "").slice(0, 7) === m);
          return (
            <div key={m || "none"} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "baseline", margin: "0 4px 8px" }}>
                <span style={{ fontSize: 16, fontWeight: 900 }}>{m ? `${Number(m.slice(0, 4))}년 ${Number(m.slice(5))}월` : "날짜 없음"}</span>
                <span style={{ marginLeft: "auto", fontSize: 14, color: MUTE, fontWeight: 800, ...NUM }}>{rows.length}건 · {won(rows.reduce((a, e) => a + toNum(e.amount), 0))}원</span>
              </div>
              <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 18, overflow: "hidden" }}>
                {rows.map((e, i) => (
                  <button key={e.id} type="button" data-kp="vex-item" onClick={() => onOpen(e.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", border: "none", borderTop: i ? "1px solid #EEF1F6" : "none", background: "#fff", cursor: "pointer", textAlign: "left", fontFamily: FONT, color: INK }}>
                    {e.image ? <img src={e.image} alt="" style={{ width: 40, height: 50, objectFit: "cover", borderRadius: 8, border: `1px solid ${LINE}`, flexShrink: 0 }} /> : <span style={{ width: 40, height: 50, borderRadius: 8, background: BG, flexShrink: 0 }} />}
                    <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 16, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{(e.kinds || []).map(vexKindLabel).join(" · ")}{e.memo ? ` · ${e.memo}` : ""}</span><span style={{ display: "block", fontSize: 13, color: MUTE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{md(e.date)} · {e.vendor || "정비소"}</span></span>
                    <span style={{ textAlign: "right", flexShrink: 0 }}><span style={{ display: "block", ...NUM, fontSize: 16, fontWeight: 900 }}>{won(e.amount)}</span><span style={{ ...chip(statusKind(e.status)), marginTop: 3 }}>{e.status === "반려" && <Dot />}{vexDriverStatus(e.status)}</span></span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

// 내가 올린 영수증 하나(누르면 크게 · 반려면 다시 찍기)
function ExpenseDetail({ e, onClose, onToast }) {
  const [busy, setBusy] = React.useState(false);
  const P = usePicker(async (file, cam) => {
    setBusy(true);
    try { const p = await prepPhoto(file); await resubmitExpense(e.id, p, cam); onToast?.("다시 보냈습니다 ✓"); onClose(); } catch (er) { onToast?.(`보내지 못했어요: ${er.message || er}`); } finally { setBusy(false); }
  });
  return (
    <Sheet>{P.el}
      <TopBar title="내 영수증" onClose={onClose} />
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div><div style={{ fontSize: 21, fontWeight: 900 }}>{(e.kinds || []).map(vexKindLabel).join(" · ")}{e.memo ? ` · ${e.memo}` : ""}</div><div style={{ fontSize: 14, color: MUTE, marginTop: 2 }}>{md(e.date)} · {e.vendor || "정비소"}</div></div>
          <span style={{ ...chip(statusKind(e.status)), marginLeft: "auto" }}>{e.status === "반려" && <Dot />}{vexDriverStatus(e.status)}</span>
        </div>
        <div style={{ ...NUM, fontSize: 32, fontWeight: 900, margin: "12px 0" }}>{won(e.amount)}<span style={{ fontSize: 16, marginLeft: 3 }}>원</span></div>
        {e.status === "반려" && <div style={{ background: "#fff", border: `1px solid ${INK}`, borderRadius: 14, padding: "12px 14px", fontSize: 15, fontWeight: 800, marginBottom: 12 }}>사무실 메시지 · {e.rejectReason || "영수증을 다시 올려주세요"}</div>}
        {e.image && (
          <div style={{ position: "relative" }}>
            <img src={e.image} alt="영수증" style={{ width: "100%", borderRadius: 14, border: `1px solid ${LINE}`, background: "#fff", display: "block" }} />
            {e.status === "지급완료" && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><PaidStamp date={e.paidDate} size={1.1} /></span>}
          </div>
        )}
      </div>
      {(e.status === "반려" || canDeleteExpense(e)) && (
        <Foot>
          {e.status === "반려" && <button type="button" disabled={busy} onClick={P.camera} style={bigBtn(true)}><Ico d={IC.camera} size={22} w={2.2} />{busy ? "보내는 중…" : "다시 찍어서 보내기"}</button>}
          {/* 🗑 2026-11-10 지출결의로 넘어가기 전(확인 중 · 확인 완료 · 반려)이면 기사도 지울 수 있다 */}
          {canDeleteExpense(e) && <button type="button" data-kp="vex-del" disabled={busy} onClick={async () => {
            if (!(await kpConfirm("이 영수증을 지울까요?\n지우면 사무실에서도 사라집니다.", { okText: "지우기", danger: true }))) return;
            setBusy(true);
            try { await deleteExpense(e.id); onToast?.("영수증을 지웠습니다"); onClose(); } catch (er) { onToast?.(`지우지 못했어요: ${er.message || er}`); setBusy(false); }
          }} style={bigBtn(false, { height: 54, fontSize: 16, color: "#B42318" })}>영수증 지우기</button>}
        </Foot>
      )}
    </Sheet>
  );
}

// ───────────────── 정기 차량 사진 ─────────────────
function PeriodPhotoSheet({ uid, driver, settings, onClose, onToast }) {
  const per = photoPeriod(settings, kstYmd());
  const photos = useDriverPeriodPhotos(uid, per.key) || [];
  const parts = settings.parts?.length ? settings.parts : ["앞", "뒤", "왼쪽", "오른쪽", "계기판"];
  const done = parts.filter((p) => photos.some((x) => x.part === p));
  const [part, setPart] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [kmAsk, setKmAsk] = React.useState(null); // { photo, cam }
  const [km, setKm] = React.useState("");
  const left = daysLeft(per.due, kstYmd());
  const P = usePicker(async (file, cam) => {
    setBusy(part);
    try {
      const p = await prepPhoto(file, { max: 1100, quality: 0.7 });
      if (/계기판/.test(part)) { setKmAsk({ photo: p, cam }); setBusy(""); return; }
      await savePeriodPhoto({ uid, driver, periodKey: per.key, part, photo: p, captured: cam });
      onToast?.(`${part} 사진 저장 ✓`);
    } catch (e) { onToast?.(`저장하지 못했어요: ${e.message || e}`); } finally { setBusy(""); }
  });
  const shoot = (p) => { setPart(p); setTimeout(() => P.camera(), 0); };
  const saveKm = async (skip) => {
    const k = skip ? null : toNum(km) || null;
    setBusy(part);
    try { await savePeriodPhoto({ uid, driver, periodKey: per.key, part, photo: kmAsk.photo, captured: kmAsk.cam, km: k }); onToast?.(`${part} 사진 저장 ✓`); } catch (e) { onToast?.(`저장하지 못했어요: ${e.message || e}`); }
    setKmAsk(null); setKm(""); setBusy("");
  };
  const cycleName = { daily: "매일", weekly: "매주", biweekly: "2주마다", monthly: "매월" }[settings.cycle] || "매주";
  const dowName = ["일", "월", "화", "수", "목", "금", "토"][new Date(`${per.due}T00:00:00+09:00`).getDay()];
  return (
    <Sheet>{P.el}
      <div style={{ position: "relative", padding: "14px 18px 18px", color: "#fff", background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)", paddingTop: "calc(14px + env(safe-area-inset-top))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 40 }}>
          <button type="button" onClick={onClose} aria-label="뒤로" style={{ width: 44, height: 44, borderRadius: 12, border: "none", background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Ico d={IC.back} size={20} /></button>
          <div style={{ fontSize: 17, fontWeight: 900 }}>정기 차량 사진</div><div style={{ width: 44 }} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", marginTop: 12 }}>
          <div><div style={{ ...EN, color: SKY }}>{({ daily: "DAILY", weekly: "WEEKLY", biweekly: "BI-WEEKLY", monthly: "MONTHLY" })[settings.cycle] || "WEEKLY"} · {per.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, marginTop: 3 }}>{settings.cycle === "monthly" ? "이번 달 사진" : settings.cycle === "daily" ? "오늘 사진" : "이번 주 사진"}</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,.6)", marginTop: 3 }}>{cycleName} · {md(per.due)}({dowName})까지 올려주세요</div></div>
          <div style={{ ...NUM, marginLeft: "auto", fontSize: 32, fontWeight: 900 }}>{done.length}<span style={{ fontSize: 17, color: "rgba(255,255,255,.5)" }}> / {parts.length}</span></div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, gridAutoRows: 150 }}>
          {parts.map((p, i) => {
            const ph = photos.find((x) => x.part === p);
            const wide = parts.length % 2 === 1 && i === parts.length - 1;
            return (
              <button key={p} type="button" data-kp={`vph-${p}`} onClick={() => shoot(p)} disabled={!!busy}
                style={{ gridColumn: wide ? "1 / -1" : undefined, position: "relative", borderRadius: 16, overflow: "hidden", cursor: "pointer", fontFamily: FONT, border: ph ? "none" : "1.5px dashed #B8C4D8", background: ph ? "#1a2233" : "#fff", color: ph ? "#fff" : NAVY, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {ph?.image && <img src={ph.image} alt={p} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.55 }} />}
                <span style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  {!ph && <Ico d={IC.camera} size={28} color={NAVY} />}
                  <span style={{ fontSize: 17, fontWeight: 900 }}>{busy === p ? "저장 중…" : p}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: ph ? "rgba(255,255,255,.75)" : MUTE }}>{ph ? `${new Date((ph.takenAt || Date.now()) + 9 * 3600e3).toISOString().slice(5, 16).replace("-", ".").replace("T", " ")}${ph.km ? ` · ${won(ph.km)}km` : ""}` : /계기판/.test(p) ? "숫자가 보이게 · 눌러서 찍기" : "눌러서 찍기"}</span>
                </span>
                {ph && <span style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: "50%", background: SKY, color: INK, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 13.5, color: MUTE, margin: "12px 4px" }}>찍으면 바로 사무실로 저장돼요 · 다시 누르면 다시 찍기</div>
      </div>
      <Foot>
        {done.length >= parts.length
          ? <div style={bigBtn(true)}>✓ {settings.cycle === "monthly" ? "이번 달" : settings.cycle === "daily" ? "오늘" : "이번 주"} 사진 완료</div>
          : <div style={bigBtn(true, { background: "#C9D2E0", cursor: "default" })}>{parts.length - done.length}장 더 찍으면 끝나요{left >= 0 ? ` · D-${left}` : " · 마감 지남"}</div>}
      </Foot>
      {kmAsk && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9600, background: "rgba(11,20,40,.6)", display: "flex", alignItems: "flex-end" }}>
          <div style={{ width: "100%", background: "#fff", borderRadius: "22px 22px 0 0", padding: "20px 18px calc(20px + env(safe-area-inset-bottom))" }}>
            <div style={{ ...EN, color: "#9AA9C3" }}>ODOMETER</div>
            <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>계기판 숫자를 넣어주세요</div>
            <div style={{ fontSize: 14.5, color: MUTE, marginTop: 4 }}>주행거리가 차량관리에 자동으로 기록돼요</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, border: `1px solid ${LINE}`, borderRadius: 16, padding: "0 16px", height: 64 }}>
              <input autoFocus inputMode="numeric" value={km ? won(toNum(km)) : ""} onChange={(e) => setKm(e.target.value.replace(/[^\d]/g, ""))} placeholder={driver?.care?.odometer ? won(driver.care.odometer) : "0"} data-kp="vph-km"
                style={{ flex: 1, minWidth: 0, width: "100%", border: "none", outline: "none", fontSize: 28, fontWeight: 900, fontFamily: FONT, ...NUM, color: INK, background: "transparent" }} />
              <span style={{ fontSize: 18, fontWeight: 800, color: MUTE }}>km</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginTop: 14 }}>
              <button type="button" onClick={() => saveKm(true)} style={bigBtn(false)}>건너뛰기</button>
              <button type="button" onClick={() => saveKm(false)} style={bigBtn(true)}>저장</button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ───────────────── [차량] 탭 위 카드 ─────────────────
export function VehicleExpenseCards({ uid, driver, onToast }) {
  const list = useDriverExpenses(uid) || [];
  const settings = usePhotoSettings(String(driver?.companyName || "").trim());
  const [open, setOpen] = React.useState(""); // wizard | photo | all | id
  const [back, setBack] = React.useState(""); // 상세를 목록에서 열었으면 닫을 때 목록으로
  const photoOn = !!settings?.on && photoTargetOk(settings, driver);
  const per = settings ? photoPeriod(settings, kstYmd()) : null;
  const photos = useDriverPeriodPhotos(photoOn ? uid : null, per?.key) || [];
  const parts = settings?.parts?.length ? settings.parts : [];
  const doneN = parts.filter((p) => photos.some((x) => x.part === p)).length;
  const left = per ? daysLeft(per.due, kstYmd()) : 0;
  const thisMonth = kstYmd().slice(0, 7);
  const monthN = list.filter((e) => String(e.date || "").slice(0, 7) === thisMonth).length;
  const detail = list.find((e) => e.id === open);
  const hero = (dark) => ({ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 14, padding: 18, borderRadius: 20, border: dark ? "none" : `1px solid ${LINE}`, background: dark ? INK : "#fff", color: dark ? "#fff" : INK, cursor: "pointer", fontFamily: FONT });
  return (
    <div data-kp="vex-cards" style={{ marginBottom: 16 }}>
      <button type="button" data-kp="vex-open" onClick={() => setOpen("wizard")} style={hero(true)}>
        <span style={{ width: 54, height: 54, borderRadius: 16, background: "rgba(143,176,240,.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={IC.receipt} size={27} color={SKY} /></span>
        <span style={{ flex: 1, minWidth: 0 }}><span style={{ ...EN, fontSize: 9.5, color: SKY, display: "block" }}>EXPENSE RECEIPT</span><span style={{ display: "block", fontSize: 20, fontWeight: 900, marginTop: 2 }}>비용 영수증 올리기</span><span style={{ display: "block", fontSize: 13.5, color: "rgba(255,255,255,.55)", marginTop: 2 }}>정비 · 수리 · 타이어 · 오일 등</span></span>
        <Ico d={IC.chev} size={20} w={2.4} />
      </button>
      {photoOn && per && (
        <button type="button" data-kp="vph-open" onClick={() => setOpen("photo")} style={{ ...hero(false), marginTop: 10 }}>
          <span style={{ width: 54, height: 54, borderRadius: 16, background: BG, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={IC.camera} size={27} color={NAVY} /></span>
          <span style={{ flex: 1, minWidth: 0 }}><span style={{ ...EN, fontSize: 9.5, color: "#9AA9C3", display: "block" }}>VEHICLE PHOTO</span><span style={{ display: "block", fontSize: 20, fontWeight: 900, marginTop: 2 }}>정기 차량 사진</span>
            <span style={{ display: "block", fontSize: 13.5, color: MUTE, marginTop: 2 }}>{settings.cycle === "monthly" ? "이번 달" : settings.cycle === "daily" ? "오늘" : "이번 주"} · <b style={{ color: INK, ...NUM }}>{doneN} / {parts.length}장</b> · {md(per.due)}까지</span></span>
          {doneN >= parts.length ? <span style={chip("ok")}>완료</span> : <span style={chip("no")}>{left >= 0 ? `D-${left}` : "마감 지남"}</span>}
        </button>
      )}
      {list.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "18px 2px 8px", fontSize: 14, fontWeight: 900 }}><span style={{ width: 6, height: 6, background: BLUE, transform: "rotate(45deg)", display: "inline-block" }} />내가 올린 영수증<span style={{ marginLeft: "auto", fontSize: 13, color: MUTE, fontWeight: 700 }}>이번 달 {monthN}건</span></div>
          <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 18, overflow: "hidden" }}>
            {list.slice(0, 1).map((e, i) => (
              <button key={e.id} type="button" data-kp="vex-item" onClick={() => setOpen(e.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", border: "none", borderTop: i ? "1px solid #EEF1F6" : "none", background: "#fff", cursor: "pointer", textAlign: "left", fontFamily: FONT, color: INK }}>
                {e.image ? <img src={e.image} alt="" style={{ width: 40, height: 50, objectFit: "cover", borderRadius: 8, border: `1px solid ${LINE}`, flexShrink: 0 }} /> : <span style={{ width: 40, height: 50, borderRadius: 8, background: BG, flexShrink: 0 }} />}
                <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 16, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{(e.kinds || []).map(vexKindLabel).join(" · ")}{e.memo ? ` · ${e.memo}` : ""}</span><span style={{ display: "block", fontSize: 13, color: MUTE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{md(e.date)} · {e.vendor || "정비소"}</span></span>
                <span style={{ textAlign: "right", flexShrink: 0 }}><span style={{ display: "block", ...NUM, fontSize: 16, fontWeight: 900 }}>{won(e.amount)}</span><span style={{ ...chip(statusKind(e.status)), marginTop: 3 }}>{e.status === "반려" && <Dot />}{vexDriverStatus(e.status)}</span></span>
              </button>
            ))}
            {list.length > 1 && (
              <button type="button" data-kp="vex-more" onClick={() => setOpen("all")} style={{ width: "100%", height: 50, border: "none", borderTop: "1px solid #EEF1F6", background: "#F8FAFC", color: NAVY, fontSize: 15, fontWeight: 900, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                더보기 · 전체 {list.length}건<Ico d={IC.chev} size={16} color={NAVY} w={2.6} />
              </button>
            )}
          </div>
          {list.find((e) => e.status === "반려") && <div style={{ fontSize: 13, color: MUTE, margin: "8px 4px" }}>반려 사유: {list.find((e) => e.status === "반려").rejectReason || "다시 올려주세요"} · 눌러서 다시 찍기</div>}
        </>
      )}
      {open === "wizard" && <ExpenseWizard uid={uid} driver={driver} onClose={() => setOpen("")} onToast={onToast} />}
      {open === "photo" && settings && <PeriodPhotoSheet uid={uid} driver={driver} settings={settings} onClose={() => setOpen("")} onToast={onToast} />}
      {(open === "all" || (detail && back === "all")) && <ExpenseList list={list} onOpen={(id) => { setBack("all"); setOpen(id); }} onClose={() => { setBack(""); setOpen(""); }} />}
      {detail && <ExpenseDetail e={detail} onClose={() => setOpen(back === "all" ? "all" : "")} onToast={onToast} />}
    </div>
  );
}

// 홈 — 정기 차량 사진 마감이 가까운데(2일 이내) 덜 찍었으면 알림 카드
export function PhotoDueCard({ uid, driver, onOpen }) {
  const settings = usePhotoSettings(String(driver?.companyName || "").trim());
  const on = !!settings?.on && photoTargetOk(settings, driver);
  const per = on ? photoPeriod(settings, kstYmd()) : null;
  const photos = useDriverPeriodPhotos(on ? uid : null, per?.key) || [];
  if (!on || !per) return null;
  const parts = settings.parts || [];
  const doneN = parts.filter((p) => photos.some((x) => x.part === p)).length;
  const left = daysLeft(per.due, kstYmd());
  if (doneN >= parts.length || left > 2) return null;
  return (
    <button type="button" data-kp="vph-due" onClick={onOpen} style={{ width: "100%", textAlign: "left", marginBottom: 12, padding: "14px 16px", borderRadius: 20, border: `1px solid ${INK}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, fontFamily: FONT, color: INK }}>
      <Ico d={IC.camera} size={26} color={NAVY} />
      <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 16.5, fontWeight: 900 }}>정기 차량 사진 {doneN} / {parts.length}장</span><span style={{ display: "block", fontSize: 14, color: MUTE }}>{md(per.due)}까지 · 눌러서 찍기</span></span>
      <span style={chip("no")}>{left >= 0 ? `D-${left}` : "마감 지남"}</span>
    </button>
  );
}
