// src/DriverVehicleChange.jsx
// ⭐ 2026-11-11 기사 차량 변경 — 기사 계정은 그대로 두고 타는 차량만 바꾼다(이번 주 3333 → 다음 주 3434).
//  서버(driverChangeVehicle)가 기사관리 문서 · 차량이력 · 기사앱 로그인 계정을 한 번에 맞춘다.
//  · 기사님은 휴대폰번호로 그대로 로그인(새 차량번호로도 로그인됨), 정산은 차량이력 기준으로 기사 한 명으로 묶인다.
//  · 새 차량을 다른 기사(앱 가입)가 타고 있으면 맞교환 / 그 기사 미배정 중에 고른다.
import React from "react";
import { auth, FUNCTIONS_BASE } from "./firebase";
import CustomDatePicker from "./CustomDatePicker";
import { historyRows, normPlate } from "./driverVehicleHistory";

const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// 서버 호출 — { ok:true, carNo, 차량이력, holder } | { ok:false, code, holder } | { error }
export async function requestVehicleChange({ driverId, carNo, date, holderAction }) {
  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return { error: "login" };
    const r = await fetch(`${FUNCTIONS_BASE}/driverChangeVehicle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ driverId, carNo, date, holderAction }),
    });
    if (r.status === 403) return { error: "forbidden" };
    if (r.status === 404) return { error: "notfound" };
    if (r.status === 429) return { error: "rate" };
    if (!r.ok) return { error: "server" };
    return await r.json();
  } catch {
    return { error: "network" };
  }
}

const ERR_TEXT = {
  login: "로그인이 풀렸습니다. 다시 로그인한 뒤 시도해 주세요.",
  forbidden: "이 기사의 차량을 바꿀 권한이 없습니다(소속 운송사 직원만 가능).",
  notfound: "기사 정보를 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.",
  rate: "잠시 후 다시 시도해 주세요.",
  server: "서버에서 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  network: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  BAD_PLATE: "차량번호를 전체로 정확히 입력해 주세요. (예: 34바3434)",
  BAD_DATE: "적용일은 오늘 또는 지난 날짜(1년 이내)만 고를 수 있습니다.",
};

const GRAD = "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)";

export default function DriverVehicleChangeModal({ driver, onClose, onDone }) {
  const cur = normPlate(driver?.차량번호 || driver?.carNo);
  const [plate, setPlate] = React.useState("");
  const [date, setDate] = React.useState(kstToday());
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [holder, setHolder] = React.useState(null); // { name, carNo, canSwap }
  const rows = historyRows(driver);
  const next = normPlate(plate);

  const submit = async (holderAction) => {
    if (busy) return;
    setErr("");
    if (!next) return setErr("새 차량번호를 입력해 주세요.");
    if (next === cur) return setErr("지금 타는 차량과 같은 번호입니다.");
    setBusy(true);
    const r = await requestVehicleChange({ driverId: driver.id, carNo: next, date, holderAction });
    setBusy(false);
    if (r?.error) return setErr(ERR_TEXT[r.error] || ERR_TEXT.server);
    if (!r?.ok) {
      if (r?.code === "HOLDER") return setHolder({ ...(r.holder || {}), canSwap: r.canSwap !== false });
      return setErr(ERR_TEXT[r?.code] || ERR_TEXT.server);
    }
    onDone?.({ 차량번호: r.carNo, carNo: r.carNo, 차량이력: r.차량이력 || [] }, r);
  };

  const inp = "border border-gray-200 rounded-lg px-3 py-2 text-[14px] w-full focus:border-[#1B2B4B] outline-none";
  return (
    <div className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/45 p-3" data-testid="vehicle-change-modal">
      <div className="bg-white rounded-2xl shadow-2xl w-[460px] max-w-full max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 flex items-center justify-between" style={{ background: GRAD }}>
          <h3 className="text-white font-bold text-[15px]">차량 변경 — {driver?.이름 || driver?.name || ""}</h3>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white text-xl">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-4 py-3 text-[13px] text-[#3A4A66] leading-relaxed">
            기사 계정은 그대로 두고 <b>타는 차량만</b> 바꿉니다. 기사님은 <b>휴대폰번호</b>로 그대로 로그인하고(새 차량번호로도 가능),
            정산은 날짜별 차량이력으로 이 기사 한 명에게 묶입니다.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">지금 차량</label>
              <div className={`${inp} bg-gray-50 text-gray-600 font-bold`}>{cur || "미배정"}</div>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">새 차량번호 *</label>
              <input autoFocus autoComplete="off" className={`${inp} font-bold`} value={plate} placeholder="예: 34바3434" data-testid="vehicle-change-plate"
                onChange={(e) => { setPlate(e.target.value); setHolder(null); setErr(""); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && !holder) submit(); }} />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-500 mb-1">적용일 (이 날짜 운행분부터 새 차량으로 정산)</label>
            <CustomDatePicker value={date} onChange={(e) => setDate(e.target.value)} className={inp} showIcon />
          </div>

          {holder && (
            <div className="rounded-xl border-2 border-[#2D4C82]/40 bg-[#F2F6FC] px-4 py-3" data-testid="vehicle-change-holder">
              <div className="text-[14px] font-black text-[#0F1A30]">{next} 차량은 지금 {holder.name || "다른"} 기사님이 타고 있습니다</div>
              <div className="mt-1 text-[13px] text-[#3A4A66]">그 기사님을 어떻게 할지 골라 주세요.</div>
              <div className="mt-3 grid gap-2">
                {holder.canSwap && cur && (
                  <button type="button" disabled={busy} onClick={() => submit("swap")} className="h-10 rounded-lg text-white text-[13.5px] font-bold disabled:opacity-60" style={{ background: GRAD }}>
                    맞교환 — {holder.name || "그 기사"}님은 {cur}(으)로
                  </button>
                )}
                <button type="button" disabled={busy} onClick={() => submit("unassign")} className="h-10 rounded-lg border border-[#1B2B4B] text-[#1B2B4B] text-[13.5px] font-bold hover:bg-[#EEF3FC] disabled:opacity-60">
                  {holder.name || "그 기사"}님은 차량 미배정으로 (나중에 따로 배정)
                </button>
              </div>
            </div>
          )}

          {err && <div role="alert" className="rounded-lg bg-[#F2F6FC] border border-[#2D4C82]/30 px-3 py-2 text-[13px] font-bold text-[#1B2B4B]">{err}</div>}

          {rows.length > 0 && (
            <div>
              <div className="text-[12px] font-semibold text-gray-500 mb-1">차량이력</div>
              <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-[150px] overflow-y-auto">
                {rows.map((x, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 text-[13px]">
                    <span className="font-bold text-[#0F1A30]">{x.plate}</span>
                    <span className="text-gray-500 tabular-nums">{x.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 pb-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border border-gray-200 text-[13.5px] font-bold text-gray-600 hover:bg-gray-50">취소</button>
          {!holder && (
            <button type="button" disabled={busy} onClick={() => submit()} data-testid="vehicle-change-save" className="h-10 px-5 rounded-lg text-white text-[13.5px] font-bold disabled:opacity-60" style={{ background: GRAD }}>
              {busy ? "변경 중…" : "차량 변경"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
