// ======================= src/fleetDispatchWay.jsx =======================
// 🚛 2026-11-23 지입차 배차 시 배차방식 자동 — 화면 쪽(설정 구독 · 저장 직전 끼워 넣기 · 설정 창)
//  규칙은 src/fleetDispatchWayCore.js. 저장 위치: companySettings/{회사}.fleetDispatchWay
//  · useFleetDispatchWayInstall(drivers): 앱 맨 위(PC DispatchApp · 모바일 MobileApp)에서 한 번 — 이 회사 설정을 구독하고,
//    오더를 저장할 때(src/orderWrite.js setOrderTransform) 지입차 차량이면 배차방식을 정한 이름으로 넣는다.
//    표 · 등록 · 수정 창 · 모바일 · 지입차관리 어디서 배차하든 같은 규칙(저장 코드마다 따로 넣지 않음)
//  · FleetDispatchWayButton: 기사관리 위 [지입차 배차방식] — 구분별 이름 정하기(마스터만 저장)
import React from "react";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "./firebase";
import { getTenant } from "./fsTenant";
import { setOrderTransform } from "./orderWrite";
import { autoWayFor, normalizeWayMap, SETTING_KEY } from "./fleetDispatchWayCore";
import { BASE_FLEET_GRADES, useCompanyFleetGrades } from "./fleetGrades";
import { useCompanyDropdownOptions } from "./companyDropdownOptions";

const coOf = (company) => String(company || (() => { try { return getTenant(); } catch { return ""; } })() || DEFAULT_COMPANY).trim();

export function useFleetDispatchWay(company) {
  const co = coOf(company);
  const [map, setMap] = React.useState({});
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(doc(db, "companySettings", co), (s) => setMap(normalizeWayMap(s.exists() ? s.data()[SETTING_KEY] : null)), () => setMap({}));
  }, [co]);
  return { co, map };
}

export function useFleetDispatchWayInstall(drivers, company) {
  const { map } = useFleetDispatchWay(company);
  const ref = React.useRef({ drivers, map });
  ref.current = { drivers, map };
  React.useEffect(() => setOrderTransform(async (docRef, data) => {
    const { drivers: ds, map: m } = ref.current;
    if (!Object.keys(m).length || !("차량번호" in data)) return data;
    // 차량을 새로 바꾼 저장인지 알아야 할 때만 지금 값을 읽는다(배차방식을 같이 보낸 저장)
    let way = autoWayFor(data, { 차량번호: data.차량번호 }, ds, m); // 배차방식이 비어 있으면 읽지 않고 바로
    if (!way && String(data.배차방식 || "").trim()) {
      const candidate = autoWayFor(data, null, ds, m);
      if (candidate) {
        let prev = null;
        try { const s = await getDoc(docRef); prev = s.exists() ? s.data() : null; } catch { prev = null; }
        way = autoWayFor(data, prev, ds, m);
      }
    }
    return way ? { ...data, 배차방식: way } : data;
  }), []);
}

// ─── 설정 창 ─────────────────────────────────────────────────────────────────
export function FleetDispatchWayButton({ company, isMaster = false, className = "" }) {
  const [open, setOpen] = React.useState(false);
  const { map } = useFleetDispatchWay(company);
  const on = Object.keys(map).length > 0;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-kp="fleet-way-btn"
        className={className || "h-11 px-3.5 rounded-[13px] text-[13px] font-black border border-[#D5DDEA] bg-white text-[#1B2B4B] hover:bg-[#F4F7FC]"}
        title="지입 · 직영 · 임대 기사로 배차하면 배차방식을 자동으로 넣어요">
        지입차 배차방식{on ? ` · ${[...new Set(Object.values(map))].join(", ")}` : " · 안 씀"}
      </button>
      {open && <FleetDispatchWayModal company={company} isMaster={isMaster} onClose={() => setOpen(false)} />}
    </>
  );
}

function FleetDispatchWayModal({ company, isMaster, onClose }) {
  const { co, map } = useFleetDispatchWay(company);
  const extra = useCompanyFleetGrades(co);
  const grades = [...BASE_FLEET_GRADES, ...extra];
  const ways = useCompanyDropdownOptions("배차방식");
  const [draft, setDraft] = React.useState(null);
  const [ask, setAsk] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const cur = draft || Object.fromEntries(grades.map((g) => [g, map[g] || ""]));
  const set = (g, v) => setDraft({ ...cur, [g]: v });
  const same = JSON.stringify(normalizeWayMap(cur)) === JSON.stringify(normalizeWayMap(map));
  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await setDoc(doc(db, "companySettings", co), { companyName: co, [SETTING_KEY]: Object.fromEntries(grades.map((g) => [g, String(cur[g] || "").trim()])) }, { merge: true });
      onClose();
    } catch (e) {
      setMsg(/permission/i.test(String(e?.code || e?.message)) ? "저장 권한이 없어요. 회사 마스터 계정으로 저장해 주세요." : `저장하지 못했어요 (${String(e?.message || e).slice(0, 60)})`);
      setAsk(false);
    } finally { setBusy(false); }
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10000060, background: "rgba(6,12,26,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} data-kp="fleet-way-modal" className="w-full max-w-[440px] rounded-2xl bg-white shadow-2xl p-5">
        <div className="text-[17px] font-black text-[#0F1A30]">지입차 배차방식 자동</div>
        <div className="mt-1.5 text-[13px] font-semibold text-[#5B6B85] leading-relaxed">
          이 구분의 기사로 배차하면 배차방식이 자동으로 들어가요. 비워 두면 그 구분은 바꾸지 않아요.
          <br />표 · 등록 창 · 수정 창 · 모바일 어디서 배차해도 똑같이 적용돼요.
        </div>
        <datalist id="kp-fleet-way-list">{ways.map((w) => <option key={w} value={w} />)}</datalist>
        <div className="mt-4 flex flex-col gap-2.5">
          {grades.map((g) => (
            <label key={g} className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-[14px] font-black text-[#1B2B4B]">{g}</span>
              <input list="kp-fleet-way-list" value={cur[g] || ""} onChange={(e) => set(g, e.target.value)} placeholder="안 씀"
                disabled={!isMaster} className="flex-1 h-10 px-3 rounded-lg border border-[#D5DDEA] text-[14px] font-bold text-[#0F1A30] disabled:bg-[#F4F6FA]" />
            </label>
          ))}
        </div>
        {!isMaster && <div className="mt-3 text-[12px] font-bold text-[#B45309]">회사 마스터만 바꿀 수 있어요.</div>}
        {msg && <div className="mt-3 text-[12.5px] font-bold text-[#DC2626]">{msg}</div>}
        {ask ? (
          <div className="mt-4 rounded-xl bg-[#F4F7FC] border border-[#D5DDEA] p-3">
            <div className="text-[14px] font-black text-[#0F1A30]">수정하시겠습니까?</div>
            <div className="mt-1 text-[12.5px] font-semibold text-[#5B6B85]">앞으로 배차하는 오더부터 적용돼요. 이미 배차된 오더는 그대로예요.</div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setAsk(false)} className="h-10 px-4 rounded-lg border border-[#D5DDEA] bg-white text-[13.5px] font-bold text-[#3A4A66]">취소</button>
              <button type="button" disabled={busy} onClick={save} data-kp="fleet-way-confirm" className="h-10 px-4 rounded-lg bg-[#1B2B4B] text-white text-[13.5px] font-black disabled:opacity-60">{busy ? "저장 중…" : "저장"}</button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border border-[#D5DDEA] bg-white text-[13.5px] font-bold text-[#3A4A66]">닫기</button>
            {isMaster && <button type="button" disabled={same} onClick={() => setAsk(true)} className="h-10 px-4 rounded-lg bg-[#1B2B4B] text-white text-[13.5px] font-black disabled:opacity-40">저장</button>}
          </div>
        )}
      </div>
    </div>
  );
}
