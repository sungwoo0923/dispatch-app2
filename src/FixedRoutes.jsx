// ======================= src/FixedRoutes.jsx =======================
// 🛣 고정노선(지입차관리 › 고정노선) — 정해진 요일·시간에 같은 기사가 항상 가는 노선
//
//  구조
//   fixedRoutes/{id}: { companyName, name, client, color, stops:[{ type, name, addr, time, contact, memo }],
//     days:["월",…], startTime, tonnage, vehicleType, fareClient, fareDriver, driverKey, driverName, carNo, phone,
//     startDate, endDate, autoDispatch, active, memo, updatedAt }
//   · 정류지는 1곳(단순 왕복)부터 근거리 여러 곳·거점까지 — 순서대로 상차 → 경유(거점) → 하차
//   · 배정 기사·요일·시간을 정하면, 그 요일마다 배차가 자동으로 만들어진다(오늘~7일 앞까지, 같은 날 중복 없음)
//     → 배차관리·배차현황·실시간배차현황·기사앱에 일반 오더처럼 보이고, "고정노선" 표시가 붙는다.
//   · 휴무·공휴일·임시 중단은 날짜만 빼면 된다(건너뛸 날짜)
import React from "react";
import { kpConfirm } from "./kpDialog";
import { collection, doc, onSnapshot, query, where, addDoc, updateDoc, deleteDoc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "./firebase";
import CustomDatePicker from "./CustomDatePicker";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const STOP_TYPES = ["상차", "경유", "거점", "하차"];
const COLORS = ["#0F1A30", "#1B2B4B", "#2D4C82", "#4B6CB7", "#8FB0F0"];
const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const won = (n) => toInt(n).toLocaleString("ko-KR");
const kst = (offsetDays = 0) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
const dayOf = (ymd) => DAYS[(new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7];
const korTime = (hm) => { if (!hm) return ""; const [h, m] = hm.split(":").map(Number); return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(m).padStart(2, "0")}`; };
const card = "rounded-[18px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_20px_rgba(16,24,40,0.05)]";
const inp = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
const lab = "block text-[11.5px] font-bold text-[#7A89A3] mb-1";
const blankStop = (type = "하차") => ({ type, name: "", addr: "", time: "", contact: "", memo: "" });
const blankRoute = () => ({ name: "", client: "", color: COLORS[2], stops: [blankStop("상차"), blankStop("하차")], days: ["월", "화", "수", "목", "금"], startTime: "08:00", tonnage: "", vehicleType: "", fareClient: "", fareDriver: "", driverKey: "", driverName: "", carNo: "", phone: "", startDate: kst(), endDate: "", skipDates: [], autoDispatch: true, active: true, memo: "" });

// ─── 배차 자동 생성 — 오늘부터 N일 앞까지, 노선·날짜마다 한 건(문서 번호 고정이라 여러 명이 동시에 열어도 중복 없음) ───
export function routeOrderFor(r, date) {
  const stops = (r.stops || []).filter((s) => s.name || s.addr);
  if (!stops.length) return null;
  const first = stops[0]; const last = stops[stops.length - 1];
  const mid = stops.slice(1, -1);
  const wp = (s, dateKey, timeKey) => ({ 업체명: s.name || "", 주소: s.addr || "", 담당자: "담당자", 담당자번호: s.contact || "", 메모: s.memo || "", 화물내용: "", 화물타입: "", 톤수값: "", 톤수타입: "", 차량톤수: "", 상차일: dateKey === "상차일" ? date : "", 상차시간: timeKey === "상차시간" ? korTime(s.time) : "", 하차일: dateKey === "하차일" ? date : "", 하차시간: timeKey === "하차시간" ? korTime(s.time) : "", 방법: "" });
  const hasDriver = !!String(r.carNo || "").trim();
  return {
    _id: `fr_${r.id}_${date}`,
    등록일: kst(), 상차일: date, 하차일: date,
    상차시간: korTime(first.time || r.startTime), 하차시간: korTime(last.time),
    거래처명: r.client || r.name || "",
    상차지명: first.name || "", 상차지주소: first.addr || "", 상차지담당자번호: first.contact || "",
    하차지명: last.name || "", 하차지주소: last.addr || "", 하차지담당자번호: last.contact || "",
    경유지_상차: mid.filter((s) => s.type === "상차").map((s) => wp(s, "상차일", "상차시간")),
    경유지_하차: mid.filter((s) => s.type !== "상차").map((s) => wp(s, "하차일", "하차시간")),
    차량톤수: r.tonnage || "", 톤수: r.tonnage || "", 차량종류: r.vehicleType || "",
    청구운임: toInt(r.fareClient), 기사운임: toInt(r.fareDriver),
    차량번호: r.carNo || "", 이름: r.driverName || "", 전화번호: r.phone || "",
    배차상태: hasDriver ? "배차완료" : "배차중", ...(hasDriver ? { 배차완료일시: Date.now() } : {}),
    배차방식: "고정노선", 지급방식: "계산서", 혼적여부: "독차",
    메모: [`[고정노선] ${r.name || ""}`, r.memo || ""].filter(Boolean).join(" · "),
    고정노선Id: r.id, 고정노선명: r.name || "",
    작성자: auth.currentUser?.email || "", 등록기기: "고정노선",
  };
}
const genLock = { at: 0 };
export async function ensureFixedRouteOrders(routes, days = 7) {
  if (Date.now() - genLock.at < 60000) return 0; // 1분에 한 번만
  genLock.at = Date.now();
  let made = 0;
  for (const r of routes || []) {
    if (!r.active || !r.autoDispatch || !(r.days || []).length) continue;
    for (let i = 0; i <= days; i++) {
      const date = kst(i);
      if (r.startDate && date < r.startDate) continue;
      if (r.endDate && date > r.endDate) continue;
      if ((r.skipDates || []).includes(date)) continue;
      if (!(r.days || []).includes(dayOf(date))) continue;
      const o = routeOrderFor(r, date);
      if (!o) continue;
      const ref = doc(db, "orders", o._id);
      try {
        const ex = await getDoc(ref);
        if (ex.exists()) continue;
        await setDoc(ref, o);
        made += 1;
      } catch { /* 권한·오프라인 — 다음에 다시 */ }
    }
  }
  return made;
}
// 앱 어디서든(배차관리 첫 로딩 뒤) 우리 회사 노선의 배차를 미리 만들어 둔다
export function useFixedRouteAutoDispatch(company) {
  React.useEffect(() => {
    if (!company) return undefined;
    let done = false;
    const unsub = onSnapshot(query(collection(db, "fixedRoutes"), where("companyName", "==", company)), (s) => {
      if (done) return; done = true;
      ensureFixedRouteOrders(s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => {});
    }, () => {});
    return () => unsub();
  }, [company]);
}

export default function FixedRoutes({ drivers = [], companyName = "", dispatchData = [] }) {
  const co = String(companyName || "").trim();
  const [routes, setRoutes] = React.useState([]);
  const [selId, setSelId] = React.useState(null);
  const [form, setForm] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(query(collection(db, "fixedRoutes"), where("companyName", "==", co)), (s) => setRoutes(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"))), () => setRoutes([]));
  }, [co]);
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2600); };
  const sel = routes.find((r) => r.id === selId) || null;
  const today = kst(); const todayDay = dayOf(today);
  const todayRuns = routes.filter((r) => r.active && (r.days || []).includes(todayDay) && !(r.skipDates || []).includes(today));
  const shown = routes.filter((r) => !q.trim() || `${r.name}${r.client}${r.driverName}${r.carNo}`.includes(q.trim()));
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const setStop = (i, patch) => setForm((p) => ({ ...p, stops: p.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const moveStop = (i, d) => setForm((p) => { const a = [...p.stops]; const j = i + d; if (j < 0 || j >= a.length) return p; [a[i], a[j]] = [a[j], a[i]]; return { ...p, stops: a }; });
  const pickDriver = (key) => { const d = drivers.find((x) => x.id === key); setForm((p) => ({ ...p, driverKey: key, driverName: d?.이름 || "", carNo: d?.차량번호 && d.차량번호 !== "-" ? d.차량번호 : "", phone: d?.전화번호 && d.전화번호 !== "-" ? d.전화번호 : "", tonnage: p.tonnage || d?.차량톤수 || "", vehicleType: p.vehicleType || d?.차량종류 || "" })); };
  const save = async () => {
    if (!form.name.trim()) return window.alert("노선 이름을 입력해 주세요.");
    if (!(form.stops || []).some((s) => s.name.trim() || s.addr.trim())) return window.alert("정류지를 한 곳 이상 입력해 주세요.");
    setBusy(true);
    try {
      const data = { ...form, companyName: co, stops: form.stops.filter((s) => s.name.trim() || s.addr.trim()), updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || "" };
      delete data.id;
      let id = form.id;
      if (id) await updateDoc(doc(db, "fixedRoutes", id), data);
      else { const ref = await addDoc(collection(db, "fixedRoutes"), { ...data, createdAt: serverTimestamp() }); id = ref.id; }
      setForm(null); setSelId(id);
      genLock.at = 0;
      const n = await ensureFixedRouteOrders([{ ...data, id }]);
      flash(n ? `저장했습니다 · 배차 ${n}건을 미리 만들었습니다` : "저장했습니다");
    } catch (e) { window.alert(`저장 실패: ${e?.message || e}`); } finally { setBusy(false); }
  };
  const toggleActive = async (r) => { await updateDoc(doc(db, "fixedRoutes", r.id), { active: !r.active }); };
  const remove = async (r) => { if (await kpConfirm(`"${r.name}" 노선을 삭제할까요?\n이미 만들어진 배차는 그대로 남습니다.`)) { await deleteDoc(doc(db, "fixedRoutes", r.id)); setSelId(null); } };
  const genNow = async () => { genLock.at = 0; const n = await ensureFixedRouteOrders(routes); flash(n ? `배차 ${n}건을 만들었습니다(오늘~7일)` : "새로 만들 배차가 없습니다(이미 모두 있음)"); };
  const ordersOf = (r) => (dispatchData || []).filter((o) => o.고정노선Id === r.id).sort((a, b) => String(b.상차일).localeCompare(String(a.상차일))).slice(0, 8);

  // ───────────── 편집 화면 ─────────────
  if (form) {
    const stops = form.stops || [];
    return (
      <div>
        <div className="relative overflow-hidden rounded-[22px] px-6 py-5 text-white flex items-center justify-between gap-4 flex-wrap mb-4" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div>
            <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>FIXED ROUTE · {form.id ? "EDIT" : "NEW"}</div>
            <div className="text-[22px] font-black">{form.id ? "고정노선 수정" : "고정노선 만들기"}</div>
            <div className="text-[12.5px] text-white/60">정류지 → 요일·시간 → 기사·운임 순서로 입력하면, 정해진 날마다 배차가 자동으로 생깁니다</div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setForm(null)} className="h-10 px-4 rounded-xl bg-white/10 border border-white/20 text-[13px] font-bold">취소</button>
            <button type="button" onClick={save} disabled={busy} className="h-10 px-5 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black disabled:opacity-50">{busy ? "저장 중…" : "저장"}</button>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className={`${card} p-5`}>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div><label className={lab}>노선 이름 *</label><input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="예: 평택 물류센터 → 수원 3곳" className={inp} /></div>
              <div><label className={lab}>거래처(청구처)</label><input value={form.client} onChange={(e) => set("client", e.target.value)} placeholder="배차 거래처명" className={inp} /></div>
            </div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[14px] font-black text-[#0F1A30]">정류지 <span className="text-[12px] font-semibold text-[#9AA9C3]">순서대로 · 1곳~여러 곳 · 거점 포함</span></div>
              <div className="flex gap-1">{["상차", "경유", "거점"].map((t) => <button key={t} type="button" onClick={() => setForm((p) => { const a = [...p.stops]; a.splice(Math.max(0, a.length - 1), 0, blankStop(t)); return { ...p, stops: a }; })} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] text-[12px] font-black text-[#1B2B4B] hover:bg-[#F3F6FA]">+ {t}</button>)}</div>
            </div>
            <div className="relative">
              <div className="absolute left-[17px] top-4 bottom-4 w-[2px] bg-[#DCE3EE]" />
              {stops.map((s, i) => (
                <div key={i} className="relative flex gap-3 mb-2.5">
                  <span className={`relative z-[1] mt-2 w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-[12px] font-black ${i === 0 || i === stops.length - 1 ? "bg-[#0F1A30] text-white" : "bg-white border-2 border-[#2D4C82] text-[#2D4C82]"}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0 rounded-xl border border-[#E3E8F0] bg-[#F7F9FC] p-2.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {STOP_TYPES.map((t) => <button key={t} type="button" onClick={() => setStop(i, { type: t })} className={`h-7 px-2.5 rounded-md text-[11.5px] font-black ${s.type === t ? "bg-[#0F1A30] text-white" : "bg-white border border-[#DCE3EE] text-[#5B6B85]"}`}>{t}</button>)}
                      <input type="time" value={s.time} onChange={(e) => setStop(i, { time: e.target.value })} className="ml-auto h-7 px-2 rounded-md border border-[#DCE3EE] text-[12px] font-bold" title="도착·작업 시각" />
                      <button type="button" onClick={() => moveStop(i, -1)} disabled={i === 0} className="w-7 h-7 rounded-md border border-[#DCE3EE] bg-white text-[12px] disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => moveStop(i, 1)} disabled={i === stops.length - 1} className="w-7 h-7 rounded-md border border-[#DCE3EE] bg-white text-[12px] disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => setForm((p) => ({ ...p, stops: p.stops.filter((_, j) => j !== i) }))} disabled={stops.length <= 1} className="w-7 h-7 rounded-md text-[#9AA9C3] hover:bg-white disabled:opacity-30">✕</button>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-1.5">
                      <input value={s.name} onChange={(e) => setStop(i, { name: e.target.value })} placeholder="업체·장소명" className={`${inp} !h-9`} />
                      <input value={s.addr} onChange={(e) => setStop(i, { addr: e.target.value })} placeholder="주소" className={`${inp} !h-9`} />
                      <input value={s.contact} onChange={(e) => setStop(i, { contact: e.target.value })} placeholder="연락처(선택)" className={`${inp} !h-9`} />
                      <input value={s.memo} onChange={(e) => setStop(i, { memo: e.target.value })} placeholder="메모(출입·하역 방법 등)" className={`${inp} !h-9`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className={`${card} p-5`}>
              <div className="text-[14px] font-black text-[#0F1A30] mb-2">요일 · 시간 · 기간</div>
              <div className="flex gap-1.5 mb-3">
                {DAYS.map((d) => { const on = (form.days || []).includes(d); return <button key={d} type="button" onClick={() => set("days", on ? form.days.filter((x) => x !== d) : [...(form.days || []), d])} className={`w-10 h-10 rounded-xl text-[13px] font-black ${on ? "bg-[#0F1A30] text-white" : "bg-white border border-[#DCE3EE] text-[#5B6B85]"}`}>{d}</button>; })}
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {[["평일", ["월", "화", "수", "목", "금"]], ["월~토", ["월", "화", "수", "목", "금", "토"]], ["매일", DAYS], ["월수금", ["월", "수", "금"]], ["화목", ["화", "목"]]].map(([l, ds]) => <button key={l} type="button" onClick={() => set("days", ds)} className="h-8 px-3 rounded-lg bg-[#F3F6FA] text-[12px] font-bold text-[#3A4A66]">{l}</button>)}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className={lab}>출발(상차) 시각</label><input type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} className={inp} /></div>
                <div><label className={lab}>시작일</label><CustomDatePicker value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className={inp} showIcon /></div>
                <div><label className={lab}>종료일(선택)</label><CustomDatePicker value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className={inp} showIcon placeholder="계속" /></div>
              </div>
              <div className="mt-3">
                <label className={lab}>쉬는 날(건너뛸 날짜)</label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(form.skipDates || []).map((d) => <button key={d} type="button" onClick={() => set("skipDates", form.skipDates.filter((x) => x !== d))} className="h-8 px-2.5 rounded-lg bg-[#EEF3FC] border border-[#C9D6EE] text-[12px] font-bold text-[#1B2B4B]">{d} ✕</button>)}
                  <input type="date" onChange={(e) => { if (e.target.value && !(form.skipDates || []).includes(e.target.value)) set("skipDates", [...(form.skipDates || []), e.target.value].sort()); e.target.value = ""; }} className="h-8 px-2 rounded-lg border border-[#DCE3EE] text-[12px]" />
                </div>
              </div>
            </div>
            <div className={`${card} p-5`}>
              <div className="text-[14px] font-black text-[#0F1A30] mb-2">배정 기사 · 차량 · 운임</div>
              <label className={lab}>기사(지입·직영)</label>
              <select value={form.driverKey} onChange={(e) => pickDriver(e.target.value)} className={inp}>
                <option value="">미배정(배차중으로 생성)</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.이름} · {d.차량번호}{d.차량톤수 ? ` · ${d.차량톤수}` : ""}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div><label className={lab}>톤수</label><input value={form.tonnage} onChange={(e) => set("tonnage", e.target.value)} placeholder="예: 5톤" className={inp} /></div>
                <div><label className={lab}>차량 종류</label><input value={form.vehicleType} onChange={(e) => set("vehicleType", e.target.value)} placeholder="예: 윙바디" className={inp} /></div>
                <div><label className={lab}>청구운임(1회)</label><input inputMode="numeric" value={form.fareClient ? won(form.fareClient) : ""} onChange={(e) => set("fareClient", e.target.value.replace(/[^\d]/g, ""))} className={`${inp} text-right`} /></div>
                <div><label className={lab}>기사운임(1회)</label><input inputMode="numeric" value={form.fareDriver ? won(form.fareDriver) : ""} onChange={(e) => set("fareDriver", e.target.value.replace(/[^\d]/g, ""))} className={`${inp} text-right`} /></div>
              </div>
              <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#E3E8F0] px-3.5 py-2.5 cursor-pointer">
                <span><span className="block text-[13px] font-black text-[#0F1A30]">배차 자동 등록</span><span className="block text-[11.5px] text-[#7A89A3]">정해진 요일에 배차가 미리 생겨 배차현황·실시간배차현황·기사앱에 보입니다</span></span>
                <input type="checkbox" checked={!!form.autoDispatch} onChange={(e) => set("autoDispatch", e.target.checked)} className="w-5 h-5 accent-[#0F1A30]" />
              </label>
              <textarea value={form.memo} onChange={(e) => set("memo", e.target.value)} rows={2} placeholder="노선 메모(기사 전달사항으로도 들어갑니다)" className={`${inp} !h-auto py-2 mt-2`} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ───────────── 목록 · 상세 ─────────────
  return (
    <div>
      <div className="relative overflow-hidden rounded-[22px] px-6 py-5 text-white flex items-center justify-between gap-4 flex-wrap mb-4"
        style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div>
          <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>FIXED ROUTES</div>
          <div className="text-[22px] font-black">고정노선</div>
          <div className="text-[12.5px] text-white/60">정해진 요일·시간에 같은 기사가 가는 노선 — 배차가 자동으로 만들어집니다</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {[["전체 노선", `${routes.length}개`], ["운행 중", `${routes.filter((r) => r.active).length}개`], [`오늘(${todayDay})`, `${todayRuns.length}개`]].map(([k, v]) => (
            <div key={k} className="px-3.5 py-1.5 rounded-xl bg-white/[0.07] border border-white/10"><div className="text-[10.5px] font-bold text-white/55">{k}</div><div className="text-[16px] font-black tabular-nums" style={{ fontFamily: MONO }}>{v}</div></div>
          ))}
          <button type="button" onClick={genNow} className="h-11 px-4 rounded-xl bg-white/10 border border-white/20 text-[13px] font-black">배차 미리 만들기</button>
          <button type="button" onClick={() => setForm(blankRoute())} className="h-11 px-5 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black">+ 노선 만들기</button>
        </div>
      </div>
      {msg && <div className="mb-3 rounded-xl bg-[#0F1A30] text-white px-4 py-2.5 text-[13px] font-bold">{msg}</div>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className={`${card} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-[#EEF1F6]"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="노선·거래처·기사 검색" className={`${inp} bg-[#F8FAFD]`} /></div>
          {!shown.length && <div className="py-16 text-center text-[13.5px] font-bold text-[#9AA9C3]">{routes.length ? "검색 결과가 없습니다" : "첫 고정노선을 만들어 보세요"}</div>}
          {shown.map((r) => {
            const on = r.id === selId;
            return (
              <button key={r.id} type="button" onClick={() => setSelId(r.id)} onDoubleClick={() => setForm({ ...blankRoute(), ...r })}
                className={`w-full text-left px-4 py-3 border-b border-[#EEF1F6] transition ${on ? "bg-[#0F1A30] text-white" : "hover:bg-[#F5F8FD]"} ${r.active ? "" : "opacity-55"}`}>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: on ? "#8FB0F0" : r.color || "#2D4C82" }} />
                  <span className="text-[14.5px] font-black truncate flex-1">{r.name}</span>
                  {!r.active && <span className={`text-[11px] font-black px-1.5 rounded ${on ? "bg-white/15" : "bg-[#EEF2F8] text-[#5B6B85]"}`}>중지</span>}
                  {(r.days || []).includes(todayDay) && r.active && <span className={`text-[11px] font-black px-1.5 rounded ${on ? "bg-[#8FB0F0] text-[#0B1428]" : "bg-[#0F1A30] text-white"}`}>오늘</span>}
                </div>
                <div className={`mt-1 text-[12px] truncate ${on ? "text-white/70" : "text-[#5B6B85]"}`}>
                  {(r.stops || []).map((s) => s.name || s.addr).filter(Boolean).join(" → ")}
                </div>
                <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                  {DAYS.map((d) => <span key={d} className={`w-5 h-5 rounded text-[10.5px] font-black flex items-center justify-center ${(r.days || []).includes(d) ? (on ? "bg-white text-[#0F1A30]" : "bg-[#1B2B4B] text-white") : (on ? "text-white/30" : "text-[#C9D3E3]")}`}>{d}</span>)}
                  <span className={`ml-1.5 text-[12px] font-bold ${on ? "text-white/80" : "text-[#3A4A66]"}`}>{r.startTime} · {r.driverName || "기사 미배정"}{r.carNo ? ` (${r.carNo})` : ""}</span>
                </div>
              </button>
            );
          })}
        </div>
        <div>
          {!sel ? (
            <div className={`${card} py-24 text-center`}>
              <div className="text-[15px] font-black text-[#0F1A30]">노선을 고르세요</div>
              <div className="text-[13px] text-[#7A89A3] mt-1">왼쪽 목록을 누르면 경로·일정·최근 배차가 보입니다 · 두 번 누르면 수정</div>
            </div>
          ) : (
            <div className={`${card} overflow-hidden`}>
              <div className="px-5 py-4 text-white flex items-center gap-2" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>ROUTE · {sel.client || "-"}</div>
                  <div className="text-[19px] font-black truncate">{sel.name}</div>
                </div>
                <button type="button" onClick={() => toggleActive(sel)} className="h-9 px-3 rounded-xl bg-white/10 border border-white/20 text-[12.5px] font-black">{sel.active ? "운행 중지" : "운행 재개"}</button>
                <button type="button" onClick={() => setForm({ ...blankRoute(), ...sel })} className="h-9 px-3 rounded-xl bg-white text-[#0F1A30] text-[12.5px] font-black">수정</button>
                <button type="button" onClick={() => remove(sel)} className="h-9 px-3 rounded-xl bg-white/10 border border-white/20 text-[12.5px] font-black">삭제</button>
              </div>
              <div className="p-5 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-[12px] font-black text-[#7A89A3] mb-2">경로 {(sel.stops || []).length}곳</div>
                  <div className="relative pl-6">
                    <div className="absolute left-[9px] top-2 bottom-2 w-[2px] bg-[#DCE3EE]" />
                    {(sel.stops || []).map((s, i) => (
                      <div key={i} className="relative pb-3">
                        <span className={`absolute -left-[22px] top-0.5 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center ${i === 0 || i === sel.stops.length - 1 ? "bg-[#0F1A30] text-white" : "bg-white border-2 border-[#2D4C82] text-[#2D4C82]"}`}>{i + 1}</span>
                        <div className="text-[13.5px] font-black text-[#0F1A30]">{s.name || "-"} <span className="text-[11px] font-black px-1.5 py-0.5 rounded bg-[#EEF3FC] text-[#1B2B4B] ml-1">{s.type}</span>{s.time && <span className="ml-1 text-[11.5px] font-bold text-[#5B6B85]">{s.time}</span>}</div>
                        <div className="text-[12px] text-[#5B6B85]">{s.addr}</div>
                        {s.memo && <div className="text-[11.5px] text-[#7A89A3]">{s.memo}</div>}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  {[["요일", (sel.days || []).join(" ") || "-"], ["출발", sel.startTime || "-"], ["기간", `${sel.startDate || "-"} ~ ${sel.endDate || "계속"}`], ["기사", sel.driverName ? `${sel.driverName} · ${sel.carNo}` : "미배정"], ["차량", [sel.tonnage, sel.vehicleType].filter(Boolean).join(" ") || "-"], ["운임", `청구 ${won(sel.fareClient)} · 기사 ${won(sel.fareDriver)}`], ["자동 배차", sel.autoDispatch ? "켜짐" : "꺼짐"]].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2 rounded-lg bg-[#F5F8FD] px-3 py-2"><span className="text-[12px] font-bold text-[#7A89A3]">{k}</span><span className="text-[13px] font-black text-[#0F1A30] text-right">{v}</span></div>
                  ))}
                </div>
                <div className="md:col-span-2">
                  <div className="text-[12px] font-black text-[#7A89A3] mb-2">최근 배차</div>
                  {ordersOf(sel).length ? ordersOf(sel).map((o) => (
                    <div key={o._id} className="flex items-center gap-3 px-3 py-2 border-b border-[#EEF1F6] text-[12.5px]">
                      <span className="tabular-nums font-bold text-[#0F1A30] w-24" style={{ fontFamily: MONO }}>{o.상차일}</span>
                      <span className="flex-1 truncate text-[#3A4A66]">{o.상차지명} → {o.하차지명}</span>
                      <span className="font-bold text-[#1B2B4B]">{o.이름 || "미배정"}</span>
                      <span className="px-2 py-0.5 rounded-md bg-[#EEF3FC] text-[#1B2B4B] text-[11px] font-black">{o.배차상태}</span>
                    </div>
                  )) : <div className="text-[12.5px] text-[#9AA9C3]">아직 만들어진 배차가 없습니다 · 위의 [배차 미리 만들기]</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
