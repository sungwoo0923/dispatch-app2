// ======================= src/driver/DriverOdoOil.jsx =======================
// ⭐ 2026-11-08 업체 요청(회사별 맞춤 기능 "driverOdoOil") — 켜진 회사 기사앱에만 적용된다.
//  1) 퇴근할 때 계기판 키로수(km)를 입력해야 퇴근 처리
//  2) 엔진오일 교환 시점(날짜·키로수) + 다음 교환 예정(교환 km + 5만km) 표시
//  3) 타이어 교체 시점(날짜·키로수) + 다음 교체 예정 표시
//  4) 오일 교환 후 4만km부터 "오일 교환" 알림 → 기사가 [확인]을 눌러야 출근·퇴근 버튼이 동작
//  저장 위치(기존 차량관리와 같은 곳 — PC 지입차관리 차량관리 화면에도 그대로 보인다)
//   drivers/{uid}.care.odometer / odometerAt     : 마지막 주행거리
//   drivers/{uid}.care.items.engineOil / tire    : { km, date } 마지막 교환
//   drivers/{uid}.care.intervals.engineOil.km    : 50000 (이 회사 기준)
//   drivers/{uid}.careLogs                        : 주행거리·정비 기록
//   drivers/{uid}.oilAlertAck                     : { km, at, date } 마지막 알림 확인
import React, { useState } from "react";
import { arrayUnion, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { itemsFor, today, vehicleDefaults } from "../vehicleCare";
import { kpConfirm } from "../kpDialog";

export const ODO_OIL_FEATURE = "driverOdoOil";
export const OIL_INTERVAL_KM = 50000; // 다음 오일 교환까지
export const OIL_ALERT_KM = 40000; // 이만큼 달리면 알림 시작

const INK = "#0B1428";
const NAVY = "#1B2B4B";
const BLUE = "#2D4C82";
const FONT = '"Pretendard", "Noto Sans KR", sans-serif';
const num = (v) => Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;
const comma = (v) => { const d = String(v ?? "").replace(/[^\d]/g, ""); return d ? Number(d).toLocaleString() : ""; };
const km = (v) => `${Math.round(Number(v) || 0).toLocaleString()}km`;

// ─── 계산 ───
export function oilInfo(drv = {}) {
  const care = drv.care || {};
  const odo = Number(care.odometer) || 0;
  const last = care.items?.engineOil || {};
  const lastKm = Number(last.km) || 0;
  const has = !!(lastKm || last.date);
  const nextKm = lastKm ? lastKm + OIL_INTERVAL_KM : 0;
  const used = lastKm && odo ? odo - lastKm : 0;
  const left = nextKm && odo ? nextKm - odo : null;
  // level: 2 = 교환 시기 지남(5만 이상) / 1 = 알림(4만 이상) / 0 = 정상 / -1 = 기록 없음
  const level = !has || !lastKm ? -1 : used >= OIL_INTERVAL_KM ? 2 : used >= OIL_ALERT_KM ? 1 : 0;
  return { odo, odoAt: care.odometerAt || "", lastKm, lastDate: last.date || "", nextKm, used, left, level, has };
}
export function tireInfo(drv = {}) {
  const care = drv.care || {};
  const odo = Number(care.odometer) || 0;
  const it = itemsFor(vehicleDefaults(drv), care).find((x) => x.key === "tire");
  const interval = Number(it?.km) || 0;
  const last = care.items?.tire || {};
  const lastKm = Number(last.km) || 0;
  const nextKm = lastKm && interval ? lastKm + interval : 0;
  const left = nextKm && odo ? nextKm - odo : null;
  const level = !lastKm && !last.date ? -1 : left != null && left < 0 ? 2 : left != null && interval && left <= interval * 0.1 ? 1 : 0;
  return { odo, lastKm, lastDate: last.date || "", nextKm, left, interval, level };
}
// 출근·퇴근 전에 오일 알림을 확인해야 하나
export const needOilConfirm = (drv) => oilInfo(drv).level >= 1;

// ─── 저장 ───
async function save(uid, by, patch, log) {
  const data = { ...patch, careUpdatedAt: serverTimestamp(), careUpdatedBy: by || "" };
  if (log) data.careLogs = arrayUnion({ at: Date.now(), by: by || "", ...log });
  await setDoc(doc(db, "drivers", uid), data, { merge: true });
}
// 퇴근 키로수 저장
export async function saveCheckoutKm(uid, by, value) {
  await save(uid, by, { care: { odometer: value, odometerAt: today() }, lastCheckoutKm: value, lastCheckoutKmAt: Date.now() },
    { kind: "주행거리", date: today(), km: value, memo: "퇴근 키로수" });
}
// 오일 알림 확인 기록
export async function saveOilAck(uid, by, info) {
  await setDoc(doc(db, "drivers", uid), { oilAlertAck: { km: info.odo || 0, used: info.used || 0, at: Date.now(), date: today(), by: by || "" } }, { merge: true });
}
// 오일·타이어 교환 기록
async function saveChange(uid, by, kind, value, date) {
  const isOil = kind === "oil";
  const key = isOil ? "engineOil" : "tire";
  const label = isOil ? "엔진오일·오일필터" : "타이어 교체";
  await save(uid, by, {
    care: {
      items: { [key]: { km: value || null, date } },
      ...(isOil ? { intervals: { engineOil: { km: OIL_INTERVAL_KM } } } : {}),
    },
  }, { kind: "정비", item: key, itemLabel: label, date, km: value || null });
}

// ─── 공통 UI ───
// ⭐ 2026-11-10 키보드에 가려지던 문제 — iOS는 키보드가 떠도 화면(fixed) 바닥이 그대로라 아래에서 올라온 창이 키보드 뒤로 숨었다.
//  보이는 영역(visualViewport)의 높이·위치를 따라 창을 키보드 바로 위에 붙이고, 입력칸이 보이게 스크롤한다
function useVisibleBox() {
  const read = () => { const vv = typeof window !== "undefined" ? window.visualViewport : null; return vv ? { top: vv.offsetTop, h: vv.height } : null; };
  const [box, setBox] = useState(read);
  React.useEffect(() => {
    const vv = window.visualViewport; if (!vv) return undefined;
    const on = () => setBox(read());
    vv.addEventListener("resize", on); vv.addEventListener("scroll", on);
    return () => { vv.removeEventListener("resize", on); vv.removeEventListener("scroll", on); };
  }, []);
  return box;
}
function Sheet({ children, onClose }) {
  const box = useVisibleBox();
  const kb = box && typeof window !== "undefined" ? window.innerHeight - box.h > 120 : false; // 키보드가 떠 있음
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!kb) return;
    const el = document.activeElement;
    if (el && ref.current?.contains(el)) setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
  }, [kb, box?.h]);
  return (
    <div onClick={onClose} style={{ position: "fixed", left: 0, right: 0, ...(box ? { top: box.top, height: box.h } : { top: 0, bottom: 0 }), zIndex: 10060, background: "rgba(8,14,28,0.62)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: FONT }}>
      <div ref={ref} className="kpd-sheet" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, maxHeight: kb ? "calc(100% - 8px)" : "min(92vh, calc(100% - 16px - env(safe-area-inset-top, 0px)))", overflowY: "auto", overscrollBehavior: "contain", background: "#fff", borderRadius: "28px 28px 0 0", boxShadow: "0 -20px 60px rgba(8,14,28,.45)", paddingBottom: kb ? 12 : "max(18px, env(safe-area-inset-bottom))" }}>
        {children}
      </div>
    </div>
  );
}
function SheetHead({ tag, title, sub }) {
  return (
    <div style={{ position: "relative", overflow: "hidden", padding: "22px 22px 20px", borderRadius: "28px 28px 0 0", color: "#fff", background: "radial-gradient(420px 180px at 90% -30px, rgba(111,160,255,0.42), transparent 70%), linear-gradient(160deg, #070D1C 0%, #0F1D3A 52%, #1F3A6E 100%)" }}>
      <div style={{ width: 44, height: 5, borderRadius: 3, background: "rgba(255,255,255,.35)", margin: "-8px auto 14px" }} />
      {tag && <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "0.16em", color: "#9DBDFF" }}>{tag}</div>}
      <div style={{ fontSize: 25, fontWeight: 900, marginTop: tag ? 4 : 0, letterSpacing: "-0.5px" }}>{title}</div>
      {sub && <div style={{ fontSize: 17, color: "rgba(255,255,255,.8)", marginTop: 6, lineHeight: 1.45 }}>{sub}</div>}
    </div>
  );
}
const bigBtn = (primary, disabled) => ({
  width: "100%", minHeight: 64, borderRadius: 18, fontSize: 21, fontWeight: 900, cursor: disabled ? "not-allowed" : "pointer", fontFamily: FONT,
  border: primary ? "none" : "2px solid #C9D6EA",
  background: disabled ? "#B4C0D3" : primary ? "radial-gradient(260px 90px at 85% 0%, rgba(111,160,255,.45), transparent 70%), linear-gradient(135deg,#070D1C,#0F1D3A 50%,#2D4C82)" : "#fff",
  color: primary || disabled ? "#fff" : NAVY,
  boxShadow: primary && !disabled ? "0 14px 30px rgba(15,29,58,.35)" : "none",
});
// 큰 숫자 입력칸(키로수) — 숫자 키패드가 바로 뜬다
function KmInput({ value, onChange, autoFocus, placeholder = "숫자 입력" }) {
  return (
    <div style={{ position: "relative" }}>
      <input autoFocus={autoFocus} inputMode="numeric" pattern="[0-9]*" value={comma(value)} onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
        placeholder={placeholder}
        style={{ width: "100%", height: 76, boxSizing: "border-box", padding: "0 64px 0 18px", borderRadius: 18, border: "2px solid #C9D6EA", background: "#F5F8FD", fontSize: 32, fontWeight: 900, color: INK, letterSpacing: "0.02em", fontFamily: FONT, outline: "none", fontVariantNumeric: "tabular-nums" }} />
      <span style={{ position: "absolute", right: 18, top: "50%", transform: "translateY(-50%)", fontSize: 20, fontWeight: 900, color: "#7D8BA3" }}>km</span>
    </div>
  );
}

// ─── 1) 퇴근 키로수 입력 ───
export function OdoCheckoutSheet({ driver, final = false, busy = false, onSubmit, onClose }) {
  const last = Number(driver?.care?.odometer) || 0;
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  const value = num(v);
  const submit = async () => {
    setErr("");
    if (!value) { setErr("키로수를 입력해주세요"); return; }
    if (last && value < last) { setErr(`지난번 기록(${km(last)})보다 작습니다. 다시 확인해주세요`); return; }
    if (last && value - last > 3000 && !(await kpConfirm(`지난번보다 ${km(value - last)} 늘었습니다.\n입력한 ${km(value)}가 맞나요?`, { okText: "맞아요" }))) return;
    onSubmit?.(value);
  };
  return (
    <Sheet onClose={busy ? undefined : onClose}>
      <SheetHead tag="CHECK-OUT · 퇴근" title="퇴근 키로수 입력" sub="계기판에 보이는 숫자를 그대로 넣어주세요" />
      <div style={{ padding: "20px 20px 4px" }}>
        {last > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "12px 16px", borderRadius: 16, background: "#F2F6FD", border: "1px solid #DCE6F5", marginBottom: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#5B6B85" }}>지난번 기록</span>
            <span style={{ fontSize: 21, fontWeight: 900, color: NAVY }}>{km(last)}</span>
          </div>
        )}
        <KmInput value={v} onChange={(x) => { setV(x); setErr(""); }} autoFocus />
        {last > 0 && value > last && <div style={{ fontSize: 17, fontWeight: 800, color: BLUE, marginTop: 10, textAlign: "center" }}>오늘 {km(value - last)} 운행</div>}
        {err && <div style={{ fontSize: 17, fontWeight: 900, color: "#D92D20", marginTop: 10, textAlign: "center" }}>{err}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          <button type="button" disabled={busy || !value} onClick={submit} style={bigBtn(true, busy || !value)}>{busy ? "처리중..." : final ? "입력하고 최종 퇴근" : "입력하고 퇴근"}</button>
          <button type="button" disabled={busy} onClick={onClose} style={{ ...bigBtn(false), minHeight: 56, fontSize: 18 }}>취소</button>
        </div>
      </div>
    </Sheet>
  );
}

// ─── 0) 처음 로그인 — 현재 키로수(필수 · 건너뛰기 없음) ───
// ⭐ 2026-11-10 기사가 처음 들어오면 가장 먼저 계기판 키로수를 받는다. 한 번 넣으면 기사앱에서는 고칠 수 없고(운송사만 수정),
//  이후 운행 거리 누적의 출발점이 된다. 저장: drivers/{uid}.care.odometer · odometerAt + odoStartKm · odoStartAt · odoLockedByDriver
export const needFirstOdo = (drv) => !!drv && !(Number(drv?.care?.odometer) > 0) && !drv?.odoStartAt;
export async function saveFirstOdo(uid, by, value) {
  await save(uid, by, { care: { odometer: value, odometerAt: today() }, odoStartKm: value, odoStartAt: Date.now(), odoLockedByDriver: true },
    { kind: "주행거리", date: today(), km: value, memo: "처음 로그인 · 현재 키로수" });
}
export function OdoFirstSheet({ uid, by, onDone }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const value = num(v);
  const submit = async () => {
    setErr("");
    if (!value) { setErr("계기판 키로수를 입력해주세요"); return; }
    if (!(await kpConfirm(`현재 키로수 ${km(value)}가 맞나요?\n한 번 저장하면 기사앱에서는 바꿀 수 없습니다(운송사에서만 수정).`, { okText: "맞아요" }))) return;
    setBusy(true);
    try { await saveFirstOdo(uid, by, value); onDone?.(value); }
    catch (e) { setErr(`저장하지 못했습니다: ${e?.message || e}`); }
    finally { setBusy(false); }
  };
  return (
    <Sheet>
      <SheetHead tag="START · 처음 설정" title="현재 키로수를 입력해주세요" sub="계기판의 총 주행거리(ODO) 숫자를 그대로 넣어주세요. 이 숫자부터 운행 거리가 쌓입니다." />
      <div style={{ padding: "20px 20px 4px" }} data-testid="odo-first">
        <KmInput value={v} onChange={(x) => { setV(x); setErr(""); }} autoFocus placeholder="예: 125,000" />
        <div style={{ fontSize: 15.5, fontWeight: 700, color: "#5B6B85", marginTop: 10, lineHeight: 1.5 }}>꼭 입력해야 다음으로 넘어갑니다. 잘못 넣었으면 운송사 담당자에게 수정을 요청하세요.</div>
        {err && <div style={{ fontSize: 17, fontWeight: 900, color: "#D92D20", marginTop: 10, textAlign: "center" }}>{err}</div>}
        <div style={{ marginTop: 16 }}>
          <button type="button" disabled={busy || !value} onClick={submit} style={bigBtn(true, busy || !value)}>{busy ? "저장 중..." : "저장하고 시작"}</button>
        </div>
      </div>
    </Sheet>
  );
}

// ─── 2) 오일 교환 알림(확인해야 출퇴근) ───
export function OilAlertSheet({ driver, actionLabel = "출근", busy = false, onConfirm, onRecord, onClose }) {
  const o = oilInfo(driver);
  const over = o.level === 2;
  return (
    <Sheet onClose={busy ? undefined : onClose}>
      <SheetHead tag="ENGINE OIL · 알림" title={over ? "엔진오일 교환 시기가 지났습니다" : "엔진오일 교환 시기입니다"} sub={`[확인]을 눌러야 ${actionLabel}이 처리됩니다`} />
      <div style={{ padding: "20px" }}>
        <div style={{ borderRadius: 20, border: `2px solid ${over ? "#D92D20" : "#F5A524"}`, background: over ? "#FEF3F2" : "#FFF8EB", padding: "16px 18px" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: over ? "#B42318" : "#B54708" }}>
            {over ? `교환 후 ${km(o.used)} 운행 — 바로 교환해주세요` : `교환 후 ${km(o.used)} 운행했습니다`}
          </div>
          <Row k="마지막 교환" v={`${o.lastDate || "-"} · ${km(o.lastKm)}`} />
          <Row k="다음 교환" v={km(o.nextKm)} strong />
          <Row k="현재 키로수" v={km(o.odo)} />
          <Row k={o.left < 0 ? "초과" : "남은 거리"} v={km(Math.abs(o.left || 0))} strong />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          <button type="button" disabled={busy} onClick={onConfirm} style={bigBtn(true, busy)}>{busy ? "처리중..." : `확인했습니다 · ${actionLabel}`}</button>
          <button type="button" disabled={busy} onClick={onRecord} style={{ ...bigBtn(false), minHeight: 56, fontSize: 18 }}>오일 교환했어요 (기록하기)</button>
        </div>
      </div>
    </Sheet>
  );
}
function Row({ k, v, strong }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginTop: 10 }}>
      <span style={{ fontSize: 16.5, fontWeight: 800, color: "#5B6B85" }}>{k}</span>
      <span style={{ fontSize: strong ? 21 : 18, fontWeight: 900, color: INK }}>{v}</span>
    </div>
  );
}

// ─── 3) 오일·타이어 교환 기록(간단 입력: 키로수만, 날짜는 오늘 자동) ───
export function ChangeRecordSheet({ uid, driver, kind = "oil", by, onClose, onDone }) {
  const odo = Number(driver?.care?.odometer) || 0;
  const [v, setV] = useState(odo ? String(odo) : "");
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const isOil = kind === "oil";
  const submit = async () => {
    const value = num(v);
    if (!value) { setErr("교환할 때 키로수를 입력해주세요"); return; }
    setBusy(true);
    try { await saveChange(uid, by, kind, value, date || today()); onDone?.(isOil ? "엔진오일 교환을 기록했습니다" : "타이어 교체를 기록했습니다"); }
    catch (e) { setErr(`저장 실패: ${e.message || e}`); setBusy(false); }
  };
  const dayBtn = (label, d) => (
    <button type="button" onClick={() => setDate(d)} style={{ flex: 1, height: 52, borderRadius: 14, border: date === d ? "none" : "1.5px solid #C9D6EA", background: date === d ? "linear-gradient(135deg,#0F1D3A,#2D4C82)" : "#fff", color: date === d ? "#fff" : NAVY, fontSize: 17, fontWeight: 900, cursor: "pointer" }}>{label}</button>
  );
  const ymd = (back) => { const d = new Date(Date.now() + 9 * 3600e3 - back * 86400e3); return d.toISOString().slice(0, 10); };
  return (
    <Sheet onClose={busy ? undefined : onClose}>
      <SheetHead tag={isOil ? "ENGINE OIL" : "TIRE"} title={isOil ? "엔진오일 교환 기록" : "타이어 교체 기록"} sub="교환할 때 계기판 키로수를 넣어주세요" />
      <div style={{ padding: "20px 20px 4px" }}>
        <KmInput value={v} onChange={(x) => { setV(x); setErr(""); }} autoFocus />
        <div style={{ fontSize: 16, fontWeight: 800, color: "#5B6B85", margin: "16px 2px 8px" }}>교환한 날</div>
        <div style={{ display: "flex", gap: 8 }}>
          {dayBtn("오늘", ymd(0))}{dayBtn("어제", ymd(1))}{dayBtn("그저께", ymd(2))}
        </div>
        {isOil && num(v) > 0 && <div style={{ fontSize: 17, fontWeight: 800, color: BLUE, marginTop: 14, textAlign: "center" }}>다음 교환 예정 · {km(num(v) + OIL_INTERVAL_KM)}</div>}
        {err && <div style={{ fontSize: 17, fontWeight: 900, color: "#D92D20", marginTop: 10, textAlign: "center" }}>{err}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          <button type="button" disabled={busy} onClick={submit} style={bigBtn(true, busy)}>{busy ? "저장 중..." : "저장"}</button>
          <button type="button" disabled={busy} onClick={onClose} style={{ ...bigBtn(false), minHeight: 56, fontSize: 18 }}>취소</button>
        </div>
      </div>
    </Sheet>
  );
}

// ─── 4) 홈 카드 — 주행거리 · 엔진오일 · 타이어 ───
// ⭐ 2026-11-10 홈 맨 아래 · 접힌 한 줄(현재 km · 오일/타이어 남은 거리) → 누르면 지금처럼 펼침(기억함)
const FOLD_KEY = "kpdOilTireOpen";
export function OilTireCard({ driver, onRecord }) {
  const o = oilInfo(driver);
  const t = tireInfo(driver);
  const [open, setOpen0] = useState(() => { try { return localStorage.getItem(FOLD_KEY) === "1"; } catch { return false; } });
  const setOpen = (v) => { setOpen0(v); try { localStorage.setItem(FOLD_KEY, v ? "1" : "0"); } catch { /* 무시 */ } };
  const oilPct = o.lastKm && o.odo ? Math.max(0, Math.min(1, o.used / OIL_INTERVAL_KM)) : 0;
  const oilColor = o.level === 2 ? "#F04438" : o.level === 1 ? "#F5A524" : "#6FA0FF";
  const warn = o.level >= 1 || t.level >= 1;
  const oilTxt = !o.lastKm ? "기록 없음" : o.left == null ? "-" : o.left < 0 ? `${km(-o.left)} 초과` : `${km(o.left)} 남음`;
  const tireTxt = !(t.lastKm || t.lastDate) ? "기록 없음" : t.left == null ? "기록 있음" : t.left < 0 ? `${km(-t.left)} 초과` : `${km(t.left)} 남음`;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-kp="oil-tire-fold"
        style={{ fontFamily: FONT, width: "100%", textAlign: "left", marginBottom: 14, padding: "14px 16px", borderRadius: 20, cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
          background: "#fff", border: `1px solid ${warn ? oilColor : "#E6EBF3"}`, boxShadow: "0 1px 2px rgba(15,26,48,.04), 0 6px 18px rgba(15,26,48,.05)" }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center", background: "linear-gradient(160deg,#070D1C,#1F3A6E)", color: "#9DBDFF", fontSize: 11, fontWeight: 900, letterSpacing: "0.04em" }}>OIL</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 17, fontWeight: 900, color: INK }}>엔진오일 · 타이어 <span style={{ fontSize: 14.5, fontWeight: 800, color: "#7D8BA3" }}>· 현재 {o.odo ? km(o.odo) : "미입력"}</span></span>
          <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: "#5B6B85", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            오일 <b style={{ color: o.level >= 1 ? (o.level === 2 ? "#D92D20" : "#B54708") : INK }}>{oilTxt}</b> · 타이어 <b style={{ color: t.level >= 1 ? (t.level === 2 ? "#D92D20" : "#B54708") : INK }}>{tireTxt}</b>
          </span>
        </span>
        <span style={{ fontSize: 14, fontWeight: 900, color: BLUE, flexShrink: 0 }}>펼치기 ▾</span>
      </button>
    );
  }
  return (
    <div style={{ fontFamily: FONT, borderRadius: 24, overflow: "hidden", marginBottom: 14, background: "#fff", border: "1px solid #E6EBF3", boxShadow: "0 1px 2px rgba(15,26,48,.04), 0 10px 28px rgba(15,26,48,.06)" }}>
      {/* 엔진오일 — 디지털 게이지 */}
      <div style={{ position: "relative", padding: "18px 18px 16px", color: "#fff", background: "radial-gradient(360px 160px at 92% -20px, rgba(111,160,255,0.40), transparent 70%), linear-gradient(160deg, #070D1C 0%, #0F1D3A 55%, #1F3A6E 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: "0.16em", color: "#9DBDFF" }}>ENGINE OIL</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,.75)" }}>현재 {o.odo ? km(o.odo) : "미입력"}</span>
            <button type="button" onClick={() => setOpen(false)} style={{ height: 30, padding: "0 10px", borderRadius: 10, border: "1px solid rgba(160,190,255,.4)", background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 13.5, fontWeight: 900, cursor: "pointer", fontFamily: FONT }}>접기 ▴</button>
          </span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>엔진오일</div>
        {o.has && o.lastKm ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,.7)" }}>다음 교환</span>
              <span style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.5px" }}>{km(o.nextKm)}</span>
            </div>
            <div style={{ height: 12, borderRadius: 6, background: "rgba(255,255,255,.14)", marginTop: 10, overflow: "hidden", position: "relative" }}>
              <div style={{ width: `${oilPct * 100}%`, height: "100%", borderRadius: 6, background: `linear-gradient(90deg, #6FA0FF, ${oilColor})`, boxShadow: `0 0 12px ${oilColor}` }} />
              <span style={{ position: "absolute", left: `${(OIL_ALERT_KM / OIL_INTERVAL_KM) * 100}%`, top: 0, bottom: 0, width: 2, background: "rgba(255,255,255,.7)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 15.5, fontWeight: 800 }}>
              <span style={{ color: "rgba(255,255,255,.75)" }}>교환 후 {km(o.used)}</span>
              <span style={{ color: o.level >= 1 ? oilColor : "#fff" }}>{o.left == null ? "" : o.left < 0 ? `${km(-o.left)} 초과` : `${km(o.left)} 남음`}</span>
            </div>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,.7)", marginTop: 6 }}>마지막 교환 · {o.lastDate || "-"} · {km(o.lastKm)}</div>
            {o.level >= 1 && <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 14, background: o.level === 2 ? "rgba(240,68,56,.18)" : "rgba(245,165,36,.18)", border: `1px solid ${oilColor}`, fontSize: 16.5, fontWeight: 900, color: "#fff" }}>⚠ {o.level === 2 ? "오일 교환 시기가 지났습니다" : "4만km 넘음 — 오일 교환을 준비하세요"}</div>}
          </>
        ) : (
          <div style={{ fontSize: 16.5, color: "rgba(255,255,255,.8)", marginTop: 8 }}>아직 교환 기록이 없습니다 · 아래 버튼으로 기록해주세요</div>
        )}
        <button type="button" onClick={() => onRecord?.("oil")} style={{ width: "100%", height: 54, marginTop: 14, borderRadius: 16, border: "1px solid rgba(160,190,255,.4)", background: "rgba(255,255,255,.12)", color: "#fff", fontSize: 18, fontWeight: 900, cursor: "pointer" }}>오일 교환했어요</button>
      </div>
      {/* 타이어 */}
      <div style={{ padding: "16px 18px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 19, fontWeight: 900, color: INK }}>타이어</span>
          {t.left != null && <span style={{ fontSize: 16, fontWeight: 900, color: t.level === 2 ? "#D92D20" : t.level === 1 ? "#B54708" : BLUE }}>{t.left < 0 ? `${km(-t.left)} 초과` : `${km(t.left)} 남음`}</span>}
        </div>
        {t.lastKm || t.lastDate ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 16.5 }}>
              <span style={{ fontWeight: 800, color: "#5B6B85" }}>마지막 교체</span>
              <span style={{ fontWeight: 900, color: INK }}>{t.lastDate || "-"} · {t.lastKm ? km(t.lastKm) : "-"}</span>
            </div>
            {t.nextKm > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 16.5 }}>
                <span style={{ fontWeight: 800, color: "#5B6B85" }}>다음 교체</span>
                <span style={{ fontWeight: 900, color: INK }}>{km(t.nextKm)}</span>
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 16, color: "#7D8BA3", marginTop: 6 }}>아직 교체 기록이 없습니다</div>
        )}
        <button type="button" onClick={() => onRecord?.("tire")} style={{ width: "100%", height: 52, marginTop: 12, borderRadius: 16, border: "1.5px solid #C9D6EA", background: "#fff", color: NAVY, fontSize: 17.5, fontWeight: 900, cursor: "pointer" }}>타이어 교체했어요</button>
      </div>
    </div>
  );
}
