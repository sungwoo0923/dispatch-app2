// ======================= src/VehicleCarePanel.jsx =======================
// 🚚 차량관리 패널 — 기사앱(본인 차량) · PC 지입차관리 · 모바일 지입차관리에서 같은 화면을 쓴다.
//  기사님이 1차로 입력하고, 운송사 직원이 보고 함께 고친다(drivers/{id} 문서, 누가 언제 고쳤는지 기록).
//  탭: 요약(주행거리·알림) / 정비(교체 기록·다음 예정) / 만기(검사·보험·계약) / 제원 / 기록(주유·수리·연비)
import React from "react";
import { arrayUnion, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { CARE_DATES, CLASS_LABEL, FUELS, GEARS, TONS, VEHICLE_KINDS, careSummary, dateStatus, itemStatus, itemsFor, specFor, tonClass, today, vehicleDefaults, searchTruckModels } from "./vehicleCare";

const NAVY = "#1B2B4B";
const INK = "#0F1A30";
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const won = (v) => `${Math.round(Number(v) || 0).toLocaleString()}원`;
const num = (v) => Number(String(v ?? "").replace(/[^\d.]/g, "")) || 0;
const LV = {
  2: { bg: INK, fg: "#fff", bd: INK },
  1: { bg: "#DCE6F7", fg: NAVY, bd: "#C3D3EE" },
  0: { bg: "#F1F4F9", fg: "#5B6B85", bd: "#E3E8F0" },
  "-1": { bg: "#fff", fg: "#9AA9C3", bd: "#E3E8F0" },
};
const LV_TXT = { 2: "지남", 1: "곧", 0: "정상", "-1": "미입력" };

const box = { background: "#fff", border: "1px solid #E3E8F0", borderRadius: 14, padding: "12px 14px" };
const inp = { width: "100%", height: 40, padding: "0 11px", borderRadius: 10, border: "1px solid #DCE3EF", fontSize: 15, fontWeight: 600, color: INK, background: "#fff", boxSizing: "border-box", outline: "none" };
const btn = (dark = true) => ({ height: 40, padding: "0 14px", borderRadius: 10, border: dark ? "none" : "1px solid #DCE3EF", background: dark ? NAVY : "#fff", color: dark ? "#fff" : NAVY, fontSize: 14, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" });
const lbl = { fontSize: 12, fontWeight: 700, color: "#7A879C", marginBottom: 4, whiteSpace: "nowrap" };

function Badge({ level, children }) {
  const c = LV[level] || LV[0];
  return <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px", borderRadius: 7, background: c.bg, color: c.fg, border: `1px solid ${c.bd}`, fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" }}>{children ?? LV_TXT[level]}</span>;
}
function Head({ code, title, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "14px 2px 8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <span style={{ width: 6, height: 6, background: "#2D4C82", transform: "rotate(45deg)", flexShrink: 0 }} />
        <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.22em", color: "#9AA9C3" }}>{code}</span>
        <span style={{ fontSize: 14.5, fontWeight: 900, color: INK, whiteSpace: "nowrap" }}>{title}</span>
      </div>
      {right}
    </div>
  );
}

// 저장 — 중첩 필드만 합쳐 쓰므로 기사·직원이 동시에 다른 칸을 고쳐도 서로 덮어쓰지 않는다
async function save(driverId, by, patch, log) {
  const data = { ...patch, careUpdatedAt: serverTimestamp(), careUpdatedBy: by || "" };
  if (log) data.careLogs = arrayUnion({ at: Date.now(), by: by || "", ...log });
  await setDoc(doc(db, "drivers", driverId), data, { merge: true });
}

export default function VehicleCarePanel({ driverId, drv = {}, by = "", staff = false, initialTab = "summary", onToast }) {
  const [tab, setTab] = React.useState(initialTab);
  const [busy, setBusy] = React.useState(false);
  const toast = (m) => (onToast ? onToast(m) : window.alert(m));
  const run = async (fn, okMsg = "저장되었습니다") => {
    if (busy) return; setBusy(true);
    try { await fn(); toast(okMsg); } catch (e) { toast(`저장 실패: ${e.message || e}`); } finally { setBusy(false); }
  };
  const vehicle = vehicleDefaults(drv);
  const care = drv.care || {};
  const items = itemsFor(vehicle, care);
  const sum = careSummary({ vehicle, care });
  const logs = [...(drv.careLogs || [])].sort((a, b) => (b.at || 0) - (a.at || 0));
  const odo = Number(care.odometer) || 0;

  const tabs = [["summary", "요약"], ["items", "정비"], ["dates", "만기"], ["spec", "제원"], ["logs", "기록"]];
  return (
    <div style={{ fontFamily: "inherit", color: INK }}>
      <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "#EEF2F8", overflowX: "auto" }}>
        {tabs.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{ flex: 1, minWidth: 54, height: 34, borderRadius: 9, border: "none", background: tab === k ? NAVY : "transparent", color: tab === k ? "#fff" : "#5B6B85", fontSize: 13.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
            {l}{k === "items" && sum.over ? ` ${sum.over}` : ""}
          </button>
        ))}
      </div>

      {tab === "summary" && <Summary {...{ driverId, by, vehicle, care, sum, odo, logs, busy, run, setTab }} />}
      {tab === "items" && <Items {...{ driverId, by, items, care, odo, busy, run, staff }} />}
      {tab === "dates" && <Dates {...{ driverId, by, care, busy, run }} />}
      {tab === "spec" && <Spec {...{ driverId, by, vehicle, busy, run }} />}
      {tab === "logs" && <Logs {...{ driverId, by, logs, odo, busy, run, items }} />}

      {drv.careUpdatedBy && <div style={{ marginTop: 12, fontSize: 11.5, color: "#9AA9C3", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>마지막 수정 · {drv.careUpdatedBy}{drv.careUpdatedAt?.toDate ? ` · ${drv.careUpdatedAt.toDate().toLocaleString("ko-KR", { hour12: false })}` : ""}</div>}
    </div>
  );
}

// ─── 요약 ───
function Summary({ driverId, by, vehicle, care, sum, odo, logs, busy, run, setTab }) {
  const [km, setKm] = React.useState("");
  const fuel = fuelStats(logs);
  const month = today().slice(0, 7);
  const monthCost = logs.filter((l) => (l.date || "").startsWith(month)).reduce((a, l) => a + (Number(l.cost) || 0), 0);
  const submit = () => {
    const v = num(km);
    if (!v) return;
    if (odo && v < odo && !window.confirm(`지금 기록(${odo.toLocaleString()}km)보다 작습니다. 그래도 저장할까요?`)) return;
    run(async () => { await save(driverId, by, { care: { odometer: v, odometerAt: today() } }, { kind: "주행거리", date: today(), km: v }); setKm(""); });
  };
  return (
    <>
      <div style={{ marginTop: 12, borderRadius: 16, padding: "14px 16px", color: "#fff", background: "linear-gradient(135deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "0.24em", color: "#8FB0F0", whiteSpace: "nowrap" }}>ODOMETER</span>
          <span style={{ fontSize: 11.5, color: "rgba(255,255,255,.6)", whiteSpace: "nowrap" }}>{[vehicle.톤, vehicle.적재함, vehicle.모델].filter(Boolean).join(" · ") || "제원 미입력"}</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 800, marginTop: 4, whiteSpace: "nowrap" }}>{odo ? odo.toLocaleString() : "—"}<span style={{ fontSize: 14, marginLeft: 4, opacity: 0.6 }}>km</span></div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", whiteSpace: "nowrap" }}>{care.odometerAt ? `${care.odometerAt} 기준` : "아직 입력 전"} · {CLASS_LABEL[tonClass(vehicle.톤, vehicle.적재함)]} 정비 기준</div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value.replace(/[^\d]/g, ""))} placeholder="현재 계기판 km" style={{ ...inp, height: 40, background: "rgba(255,255,255,.95)" }} />
          <button type="button" disabled={busy} onClick={submit} style={{ ...btn(false), border: "none" }}>입력</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 6, marginTop: 8 }}>
        {[["교체 지남", sum.over, "건"], ["곧 교체", sum.soon, "건"], ["이달 비용", monthCost ? Math.round(monthCost / 10000) : 0, "만원"]].map(([l, v, u]) => (
          <div key={l} style={{ ...box, padding: "9px 10px" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#7A879C", whiteSpace: "nowrap" }}>{l}</div>
            <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, whiteSpace: "nowrap" }}>{v}<span style={{ fontSize: 11, color: "#9AA9C3", marginLeft: 2 }}>{u}</span></div>
          </div>
        ))}
      </div>

      <Head code="ALERTS" title="챙겨야 할 것" right={<button type="button" onClick={() => setTab("items")} style={{ border: "none", background: "none", color: "#4B6CB7", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>정비 전체 ›</button>} />
      <div style={{ ...box, padding: 6 }}>
        {sum.alerts.length === 0
          ? <div style={{ padding: "16px 8px", textAlign: "center", fontSize: 13.5, color: "#9AA9C3" }}>{sum.missing ? `정비 기록이 ${sum.missing}건 비어 있습니다 — 정비·만기 탭에서 채워주세요` : "모두 정상입니다 ✓"}</div>
          : sum.alerts.slice(0, 6).map((a) => (
            <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 8px" }}>
              <Badge level={a.level} />
              <span style={{ fontSize: 14, fontWeight: 800, whiteSpace: "nowrap" }}>{a.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 12.5, color: "#5B6B85", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.text}</span>
            </div>
          ))}
      </div>

      {fuel.avg > 0 && (
        <>
          <Head code="FUEL" title="연비" />
          <div style={{ ...box, display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "#5B6B85", whiteSpace: "nowrap" }}>최근 평균 (주유 기록 기준)</span>
            <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, whiteSpace: "nowrap" }}>{fuel.avg.toFixed(2)} km/L</span>
          </div>
        </>
      )}
    </>
  );
}

// 주유 기록 → 구간 연비(가득 주유 사이 주행거리 ÷ 주유량)
function fuelStats(logs) {
  const f = logs.filter((l) => l.kind === "주유" && l.km && l.liters).sort((a, b) => a.km - b.km);
  const seg = [];
  for (let i = 1; i < f.length; i++) { const d = f[i].km - f[i - 1].km; if (d > 0 && f[i].liters > 0) seg.push(d / f[i].liters); }
  const last = seg.slice(-5);
  return { avg: last.length ? last.reduce((a, b) => a + b, 0) / last.length : 0 };
}

// ─── 정비 항목 ───
function Items({ driverId, by, items, care, odo, busy, run, staff }) {
  const [open, setOpen] = React.useState(null);
  const [f, setF] = React.useState({});
  const [edit, setEdit] = React.useState(false);
  const start = (it) => { setOpen(it.key); setF({ km: odo ? String(odo) : "", date: today(), cost: "", shop: "", memo: "" }); };
  const doneOne = (it) => run(async () => {
    const km = num(f.km);
    await save(driverId, by, { care: { items: { [it.key]: { km: km || null, date: f.date || today() } }, ...(km > odo ? { odometer: km, odometerAt: f.date || today() } : {}) } },
      { kind: "정비", item: it.key, itemLabel: it.label, date: f.date || today(), km: km || null, cost: num(f.cost), shop: f.shop || "", memo: f.memo || "" });
    setOpen(null);
  });
  return (
    <>
      <Head code="MAINTENANCE" title="정비 항목" right={staff && <button type="button" onClick={() => setEdit((v) => !v)} style={{ ...btn(false), height: 30, fontSize: 12.5 }}>{edit ? "주기 닫기" : "주기 조정"}</button>} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((it) => {
          const st = itemStatus(it, care); const last = care.items?.[it.key] || {};
          return (
            <div key={it.key} style={{ ...box, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Badge level={st.level} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</div>
                  <div style={{ fontSize: 11.5, color: "#7A879C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    주기 {[it.km ? `${it.km.toLocaleString()}km` : "", it.months ? `${it.months}개월` : ""].filter(Boolean).join(" / ")}
                    {last.date || last.km ? ` · 최근 ${[last.date, last.km ? `${Number(last.km).toLocaleString()}km` : ""].filter(Boolean).join(" ")}` : ""}
                  </div>
                </div>
                <button type="button" onClick={() => (open === it.key ? setOpen(null) : start(it))} style={{ ...btn(open !== it.key), height: 32, fontSize: 12.5, padding: "0 10px" }}>{open === it.key ? "닫기" : "교체함"}</button>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: st.level === 2 ? INK : "#5B6B85", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{st.text}</div>
              {edit && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
                  <label><div style={lbl}>주기 km</div><input inputMode="numeric" defaultValue={it.km || ""} onBlur={(e) => run(() => save(driverId, by, { care: { intervals: { [it.key]: { km: num(e.target.value), months: it.months } } } }), "주기를 바꿨습니다")} style={inp} /></label>
                  <label><div style={lbl}>주기 개월</div><input inputMode="numeric" defaultValue={it.months || ""} onBlur={(e) => run(() => save(driverId, by, { care: { intervals: { [it.key]: { km: it.km, months: num(e.target.value) } } } }), "주기를 바꿨습니다")} style={inp} /></label>
                </div>
              )}
              {open === it.key && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10 }}>
                  <label><div style={lbl}>교체 시 주행거리(km)</div><input inputMode="numeric" value={f.km} onChange={(e) => setF({ ...f, km: e.target.value.replace(/[^\d]/g, "") })} style={inp} /></label>
                  <label><div style={lbl}>교체일</div><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} style={inp} /></label>
                  <label><div style={lbl}>비용(원)</div><input inputMode="numeric" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value.replace(/[^\d]/g, "") })} style={inp} placeholder="선택" /></label>
                  <label><div style={lbl}>정비소</div><input value={f.shop} onChange={(e) => setF({ ...f, shop: e.target.value })} style={inp} placeholder="선택" /></label>
                  <input value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} style={{ ...inp, gridColumn: "1 / -1" }} placeholder="메모 (오일 종류 등)" />
                  <button type="button" disabled={busy} onClick={() => doneOne(it)} style={{ ...btn(), gridColumn: "1 / -1" }}>{busy ? "저장 중…" : "교체 기록 저장"}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11.5, color: "#9AA9C3", marginTop: 8, lineHeight: 1.6 }}>※ 화물 사업용(짐 싣고 자주 운행) 기준 권장 주기입니다. 차량 설명서·정비소 안내와 다르면 {staff ? "'주기 조정'으로" : "회사에 말씀하시면"} 바꿀 수 있습니다.</div>
    </>
  );
}

// ─── 만기 ───
function Dates({ driverId, by, care, busy, run }) {
  return (
    <>
      <Head code="EXPIRY" title="검사 · 보험 · 계약 만기" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {CARE_DATES.map((d) => {
          const v = care.dates?.[d.key] || ""; const st = dateStatus(v);
          return (
            <div key={d.key} style={{ ...box, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Badge level={st.level}>{st.level === -1 ? "미입력" : st.text}</Badge>
                <span style={{ fontSize: 14.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</span>
              </div>
              <input type="date" defaultValue={v} key={v} disabled={busy} onChange={(e) => run(() => save(driverId, by, { care: { dates: { [d.key]: e.target.value } } }, { kind: "만기", item: d.key, itemLabel: d.label, date: today(), memo: e.target.value }))} style={{ ...inp, marginTop: 8 }} />
              {d.hint && <div style={{ fontSize: 11.5, color: "#9AA9C3", marginTop: 4 }}>{d.hint}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── 제원 ───
function Spec({ driverId, by, vehicle, busy, run }) {
  const [v, setV] = React.useState(vehicle);
  React.useEffect(() => { setV(vehicle); }, [JSON.stringify(vehicle)]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, x) => setV((p) => ({ ...p, [k]: x }));
  const fill = () => {
    const s = specFor(v.톤, v.적재함);
    if (!s) { window.alert("톤수를 먼저 골라주세요."); return; }
    setV((p) => ({ ...p, 모델: p.모델 || s.models[0], 길이: s.l, 폭: s.w, 높이: s.h || p.높이, 최대적재: s.maxKg, 축: s.axle, 타이어: s.tires, 냉동기: s.reefer || p.냉동기 }));
  };
  const s = specFor(v.톤, v.적재함);
  const F = ({ k, label, type = "text", unit, list, numeric }) => (
    <label style={{ minWidth: 0 }}>
      <div style={lbl}>{label}{unit ? ` (${unit})` : ""}</div>
      {list
        ? <select value={v[k] || ""} onChange={(e) => set(k, e.target.value)} style={inp}><option value="">선택</option>{list.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        : <input type={type} inputMode={numeric ? "numeric" : undefined} value={v[k] ?? ""} onChange={(e) => set(k, numeric ? e.target.value.replace(/[^\d.]/g, "") : e.target.value)} style={inp} />}
    </label>
  );
  return (
    <>
      <Head code="SPEC" title="차량 제원" right={<button type="button" onClick={fill} style={{ ...btn(false), height: 30, fontSize: 12.5 }}>톤급 표준값 채우기</button>} />
      <div style={{ ...box, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {F({ k: "톤", label: "톤수", list: TONS })}
        {F({ k: "적재함", label: "적재함 형태", list: VEHICLE_KINDS })}
        {F({ k: "제조사", label: "제조사", list: ["현대", "기아", "타타대우", "볼보", "스카니아", "벤츠", "만(MAN)", "이스즈", "기타"] })}
        <label style={{ display: "block" }}>
          <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "#7A879C", marginBottom: 3 }}>모델명</span>
          <ModelSearch value={v.모델} ton={v.톤} onPick={(p) => setV((x) => ({ ...x, ...p }))} style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 10, border: "1px solid #DCE3EF", fontSize: 14, fontWeight: 700, color: "#0F1A30", boxSizing: "border-box" }} />
        </label>
        {F({ k: "연식", label: "연식", unit: "년", numeric: true })}
        {F({ k: "연료", label: "연료", list: FUELS })}
        {F({ k: "변속기", label: "변속기", list: GEARS })}
        {F({ k: "축", label: "축 구성" })}
        {F({ k: "길이", label: "적재함 길이", unit: "cm", numeric: true })}
        {F({ k: "폭", label: "적재함 폭", unit: "cm", numeric: true })}
        {F({ k: "높이", label: "적재함 높이", unit: "cm", numeric: true })}
        {F({ k: "최대적재", label: "최대 적재", unit: "kg", numeric: true })}
        {F({ k: "타이어", label: "타이어 개수", unit: "개", numeric: true })}
        {F({ k: "타이어규격", label: "타이어 규격" })}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}><input type="checkbox" checked={!!v.냉동기} onChange={(e) => set("냉동기", e.target.checked)} />냉동기 장착</label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}><input type="checkbox" checked={!!v.요소수} onChange={(e) => set("요소수", e.target.checked)} />요소수(유로6)</label>
        {F({ k: "리프트", label: "리프트·특장", list: ["없음", "파워게이트(리프트)", "윙 개폐", "크레인", "기타"] })}
        {F({ k: "차대번호", label: "차대번호(VIN)" })}
      </div>
      {s && <div style={{ fontSize: 11.5, color: "#7A879C", marginTop: 6, lineHeight: 1.6 }}>{v.톤} 표준 — 적재함 {s.l}×{s.w}{s.h ? `×${s.h}` : ""}cm · 최대 {s.maxKg.toLocaleString()}kg · {s.axle} · 대표 차종 {s.models.join(", ")}</div>}
      <button type="button" disabled={busy} onClick={() => run(() => save(driverId, by, { vehicle: v, ...(v.톤 ? { 차량톤수: v.톤 } : {}), ...(v.적재함 ? { 차량종류: v.적재함 } : {}) }, { kind: "제원", date: today(), memo: [v.톤, v.적재함, v.모델].filter(Boolean).join(" ") }))} style={{ ...btn(), width: "100%", marginTop: 10 }}>{busy ? "저장 중…" : "제원 저장"}</button>
    </>
  );
}

// ─── 기록(주유·수리·사고·기타 + 정비 이력) ───
const LOG_KINDS = ["주유", "요소수", "수리", "세차", "사고", "기타"];
function Logs({ driverId, by, logs, odo, busy, run }) {
  const [f, setF] = React.useState({ kind: "주유", date: today(), km: "", liters: "", cost: "", memo: "" });
  const add = () => run(async () => {
    const km = num(f.km);
    await save(driverId, by, km > odo ? { care: { odometer: km, odometerAt: f.date } } : {}, { kind: f.kind, date: f.date, km: km || null, liters: num(f.liters) || null, cost: num(f.cost), memo: f.memo });
    setF({ ...f, km: "", liters: "", cost: "", memo: "" });
  });
  const shown = logs.filter((l) => l.kind !== "주행거리").slice(0, 60);
  return (
    <>
      <Head code="LOG" title="기록 추가" />
      <div style={{ ...box, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 4, overflowX: "auto" }}>
          {LOG_KINDS.map((k) => <button key={k} type="button" onClick={() => setF({ ...f, kind: k })} style={{ flexShrink: 0, height: 32, padding: "0 12px", borderRadius: 99, border: `1px solid ${f.kind === k ? NAVY : "#DCE3EF"}`, background: f.kind === k ? NAVY : "#fff", color: f.kind === k ? "#fff" : "#3A4A66", fontSize: 13, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>{k}</button>)}
        </div>
        <label><div style={lbl}>날짜</div><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} style={inp} /></label>
        <label><div style={lbl}>주행거리(km)</div><input inputMode="numeric" value={f.km} placeholder={odo ? String(odo) : ""} onChange={(e) => setF({ ...f, km: e.target.value.replace(/[^\d]/g, "") })} style={inp} /></label>
        {(f.kind === "주유" || f.kind === "요소수") && <label><div style={lbl}>{f.kind === "주유" ? "주유량(L)" : "보충량(L)"}</div><input inputMode="decimal" value={f.liters} onChange={(e) => setF({ ...f, liters: e.target.value.replace(/[^\d.]/g, "") })} style={inp} /></label>}
        <label><div style={lbl}>금액(원)</div><input inputMode="numeric" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value.replace(/[^\d]/g, "") })} style={inp} /></label>
        <input value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} placeholder={f.kind === "사고" ? "사고 내용·보험 접수번호" : "메모"} style={{ ...inp, gridColumn: "1 / -1" }} />
        <button type="button" disabled={busy} onClick={add} style={{ ...btn(), gridColumn: "1 / -1" }}>{busy ? "저장 중…" : `${f.kind} 기록 저장`}</button>
      </div>
      {f.kind === "주유" && <div style={{ fontSize: 11.5, color: "#9AA9C3", marginTop: 4 }}>가득 주유할 때마다 주행거리와 주유량을 넣으면 연비가 자동 계산됩니다.</div>}

      <Head code="HISTORY" title={`이력 ${shown.length}건`} />
      <div style={{ ...box, padding: 4 }}>
        {shown.length === 0 ? <div style={{ padding: "16px 8px", textAlign: "center", fontSize: 13.5, color: "#9AA9C3" }}>아직 기록이 없습니다</div> : shown.map((l, i) => (
          <div key={`${l.at}_${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 8px", borderTop: i ? "1px solid #EEF1F6" : "none" }}>
            <span style={{ width: 44, flexShrink: 0, textAlign: "center", padding: "3px 0", borderRadius: 6, background: l.kind === "정비" ? INK : "#EEF2F8", color: l.kind === "정비" ? "#fff" : NAVY, fontSize: 11.5, fontWeight: 800 }}>{l.kind}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.itemLabel || l.memo || l.kind}{l.liters ? ` · ${l.liters}L` : ""}</div>
              <div style={{ fontSize: 11.5, color: "#7A879C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[l.date, l.km ? `${Number(l.km).toLocaleString()}km` : "", l.shop, l.by].filter(Boolean).join(" · ")}</div>
            </div>
            {l.cost ? <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, whiteSpace: "nowrap" }}>{won(l.cost)}</span> : null}
          </div>
        ))}
      </div>
    </>
  );
}

// ═══ 기사앱 첫 진입 — 차량 기본 설정 마법사 ═══
//  가입 후 처음 들어오면(care.setupDone 없음) 바로 뜬다. "나중에"는 하루 동안 다시 안 뜸.
// 🔎 모델명 — 검색해서 고르거나(톤급에 가까운 순) 그대로 직접 입력
export function ModelSearch({ value, onPick, ton, style, placeholder }) {
  const [open, setOpen] = React.useState(false);
  const list = searchTruckModels(value, ton);
  return (
    <div style={{ position: "relative" }}>
      <input value={value || ""} onChange={(e) => { onPick({ 모델: e.target.value }); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || "모델 검색 또는 직접 입력 (예: 메가트럭)"} style={style} />
      {open && list.length > 0 && (
        <div style={{ position: "absolute", zIndex: 50, left: 0, right: 0, top: "100%", marginTop: 4, maxHeight: 240, overflowY: "auto", background: "#fff", border: "1px solid #DCE3EF", borderRadius: 12, boxShadow: "0 14px 30px rgba(15,26,48,.16)" }}>
          {list.map((m) => (
            <button key={m.maker + m.model} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick({ 모델: m.model, 제조사: m.maker }); setOpen(false); }}
              style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "10px 12px", border: "none", borderBottom: "1px solid #EEF1F6", background: "#fff", textAlign: "left", cursor: "pointer" }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: "#7A879C", minWidth: 56 }}>{m.maker}</span>
              <span style={{ fontSize: 14.5, fontWeight: 900, color: "#0F1A30", flex: 1 }}>{m.model}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: "#2D4C82" }}>{m.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function VehicleSetupWizard({ driverId, drv = {}, by = "", onClose }) {
  const base = vehicleDefaults(drv);
  const [step, setStep] = React.useState(0);
  const [v, setV] = React.useState(base);
  const [odo, setOdo] = React.useState(drv.care?.odometer ? String(drv.care.odometer) : "");
  const [oil, setOil] = React.useState({ km: "", date: "" });
  const [dates, setDates] = React.useState({ inspection: drv.care?.dates?.inspection || "", insurance: drv.care?.dates?.insurance || "" });
  const [busy, setBusy] = React.useState(false);
  const set = (k, x) => setV((p) => ({ ...p, [k]: x }));
  const s = specFor(v.톤, v.적재함);
  const steps = ["차량 종류", "제원", "주행거리", "엔진오일", "검사·보험"];
  const later = () => { try { localStorage.setItem(`vcLater_${driverId}`, String(Date.now())); } catch { /* 무시 */ } onClose?.(); };
  const finish = async () => {
    setBusy(true);
    try {
      const km = num(odo);
      const spec = s ? { 길이: v.길이 || s.l, 폭: v.폭 || s.w, 높이: v.높이 || s.h, 최대적재: v.최대적재 || s.maxKg, 축: v.축 || s.axle, 타이어: v.타이어 || s.tires } : {};
      const items = (oil.km || oil.date) ? { engineOil: { km: num(oil.km) || null, date: oil.date || null } } : {};
      await save(driverId, by, {
        vehicle: { ...v, ...spec }, 차량톤수: v.톤 || drv.차량톤수 || "", 차량종류: v.적재함 || drv.차량종류 || "",
        care: { setupDone: true, ...(km ? { odometer: km, odometerAt: today() } : {}), items, dates: Object.fromEntries(Object.entries(dates).filter(([, x]) => x)) },
      }, { kind: "기본설정", date: today(), km: km || null, memo: "차량 기본 설정" });
      onClose?.(true);
    } catch (e) { window.alert(`저장 실패: ${e.message || e}`); } finally { setBusy(false); }
  };
  const field = (label, el) => <label style={{ display: "block", marginTop: 10 }}><div style={lbl}>{label}</div>{el}</label>;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(11,20,40,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", background: "#F4F6FA", borderRadius: "22px 22px 0 0", paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}>
        <div style={{ padding: "18px 18px 16px", color: "#fff", borderRadius: "22px 22px 0 0", background: "linear-gradient(135deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "0.24em", color: "#8FB0F0" }}>VEHICLE SETUP · {step + 1}/{steps.length}</span>
            <button type="button" onClick={later} style={{ border: "none", background: "rgba(255,255,255,.12)", color: "#fff", borderRadius: 8, height: 28, padding: "0 10px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>나중에</button>
          </div>
          <div style={{ fontSize: 21, fontWeight: 900, marginTop: 6, whiteSpace: "nowrap" }}>내 차량 기본 설정</div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.65)", marginTop: 2 }}>정비 시기를 자동으로 알려드리려면 몇 가지만 알려주세요 (1분)</div>
          <div style={{ display: "flex", gap: 4, marginTop: 12 }}>{steps.map((x, i) => <span key={x} style={{ flex: 1, height: 4, borderRadius: 4, background: i <= step ? "#8FB0F0" : "rgba(255,255,255,.18)" }} />)}</div>
        </div>
        <div style={{ padding: "6px 18px 0" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: INK, marginTop: 12 }}>{step + 1}. {steps[step]}</div>
          {step === 0 && <>
            {field("톤수", <select value={v.톤 || ""} onChange={(e) => set("톤", e.target.value)} style={inp}><option value="">선택</option>{TONS.map((x) => <option key={x}>{x}</option>)}</select>)}
            {field("적재함 형태", <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{VEHICLE_KINDS.map((x) => <button key={x} type="button" onClick={() => set("적재함", x)} style={{ height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${v.적재함 === x ? NAVY : "#DCE3EF"}`, background: v.적재함 === x ? NAVY : "#fff", color: v.적재함 === x ? "#fff" : "#3A4A66", fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap" }}>{x}</button>)}</div>)}
            {s && <div style={{ ...box, marginTop: 10, fontSize: 12.5, color: "#5B6B85", lineHeight: 1.7 }}>
              <b style={{ color: INK }}>{v.톤} 표준 제원</b><br />적재함 {s.l}×{s.w}{s.h ? `×${s.h}` : ""}cm · 최대 {s.maxKg.toLocaleString()}kg<br />{s.axle} · 타이어 {s.tires}개 · {CLASS_LABEL[tonClass(v.톤, v.적재함)]} 정비 기준 적용
            </div>}
          </>}
          {step === 1 && <>
            {field("제조사", <select value={v.제조사 || ""} onChange={(e) => set("제조사", e.target.value)} style={inp}><option value="">선택</option>{["현대", "기아", "타타대우", "볼보", "스카니아", "벤츠", "만(MAN)", "이스즈", "기타"].map((x) => <option key={x}>{x}</option>)}</select>)}
            {field("모델명", <ModelSearch value={v.모델} ton={v.톤} onPick={(p) => setV((x) => ({ ...x, ...p }))} style={inp} />)}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {field("연식", <input inputMode="numeric" value={v.연식 || ""} onChange={(e) => set("연식", e.target.value.replace(/[^\d]/g, "").slice(0, 4))} placeholder="2022" style={inp} />)}
              {field("연료", <select value={v.연료 || ""} onChange={(e) => set("연료", e.target.value)} style={inp}>{FUELS.map((x) => <option key={x}>{x}</option>)}</select>)}
              {field("변속기", <select value={v.변속기 || ""} onChange={(e) => set("변속기", e.target.value)} style={inp}>{GEARS.map((x) => <option key={x}>{x}</option>)}</select>)}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 14, fontWeight: 700 }}><input type="checkbox" checked={!!v.냉동기} onChange={(e) => set("냉동기", e.target.checked)} />냉동기 장착 차량</label>
          </>}
          {step === 2 && <>
            {field("지금 계기판 주행거리 (km)", <input inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value.replace(/[^\d]/g, ""))} placeholder="예: 125000" style={{ ...inp, height: 48, fontSize: 20, fontFamily: MONO }} />)}
            <div style={{ fontSize: 12, color: "#7A879C", marginTop: 6 }}>계기판의 ODO(총 주행거리) 숫자를 그대로 넣어주세요. 이후엔 '차량' 탭에서 수시로 바꿀 수 있습니다.</div>
          </>}
          {step === 3 && <>
            <div style={{ fontSize: 12.5, color: "#5B6B85", marginTop: 8 }}>마지막으로 엔진오일을 간 때를 알면 다음 교환 시기를 알려드립니다. 모르면 비워두세요.</div>
            {field("교환할 때 주행거리 (km)", <input inputMode="numeric" value={oil.km} onChange={(e) => setOil({ ...oil, km: e.target.value.replace(/[^\d]/g, "") })} style={inp} />)}
            {field("교환한 날짜", <input type="date" value={oil.date} onChange={(e) => setOil({ ...oil, date: e.target.value })} style={inp} />)}
          </>}
          {step === 4 && <>
            {field("자동차 정기(종합)검사 만료일", <input type="date" value={dates.inspection} onChange={(e) => setDates({ ...dates, inspection: e.target.value })} style={inp} />)}
            {field("자동차보험 만기일", <input type="date" value={dates.insurance} onChange={(e) => setDates({ ...dates, insurance: e.target.value })} style={inp} />)}
            <div style={{ fontSize: 12, color: "#7A879C", marginTop: 6 }}>만기 30일 전부터 홈 화면에 알려드립니다. 적재물보험·지입계약 만기는 '차량' 탭에서 넣을 수 있습니다.</div>
          </>}
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            {step > 0 && <button type="button" onClick={() => setStep(step - 1)} style={{ ...btn(false), flex: 1, height: 48 }}>이전</button>}
            {step < steps.length - 1
              ? <button type="button" onClick={() => { if (step === 0 && !v.톤) { window.alert("톤수를 골라주세요."); return; } setStep(step + 1); }} style={{ ...btn(), flex: 2, height: 48, fontSize: 15 }}>다음</button>
              : <button type="button" disabled={busy} onClick={finish} style={{ ...btn(), flex: 2, height: 48, fontSize: 15 }}>{busy ? "저장 중…" : "설정 완료"}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
export function shouldShowSetup(driverId, drv) {
  if (!driverId || !drv || drv.care?.setupDone) return false;
  try { const t = Number(localStorage.getItem(`vcLater_${driverId}`) || 0); if (Date.now() - t < 86400000) return false; } catch { /* 무시 */ }
  return true;
}
