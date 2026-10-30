// ⭐ 지입 기사 휴차일 배차 확인 팝업 (PC/모바일 공용)
// 근무가능요일이 아닌 날(휴차)에 지입 기사를 배차하려 하면 띄운다.
// 전산상 휴차여도 불가피하게 운행할 수 있으므로 "그래도 배차" / "취소" 중 선택하게 한다.
// React 화면 어디서 호출하든 쓸 수 있게 DOM으로 직접 그리고 Promise<boolean>을 돌려준다.
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export function weekdayKo(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? "" : WEEK[d.getDay()];
}

const normPlate = (v = "") => String(v).replace(/[\s-]/g, "").toLowerCase();

export const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// 배차하려는 기사님이 그 날짜에 휴차(근무요일 아님)인지 — 지입 기사 + 근무요일이 설정된 경우만
export function findHolidayConflict(drivers, plate, dateStr) {
  const c = findRestConflict(drivers, plate, dateStr);
  return c && c.designated ? c : null;
}

// ⭐ 휴차 확인 — 두 가지를 함께 본다.
//  1) 지정 휴차: 그 오더의 상차일 요일이 기사 근무가능요일이 아님
//  2) 본인 휴차: 기사님이 앱에서 직접 "휴차"를 누른 상태 — 오늘 오더든 내일 이후 오더든 모두 경고한다.
//     (다음날 오더를 전날 미리 주는 경우가 많아, 휴차중인 기사에게 가는 오더는 날짜와 상관없이 확인받는다.
//      "진행"을 누르면 그대로 기사앱으로 전달된다.) 지난 날짜 오더는 제외.
//     휴차일자가 오늘이 아니면(어제 누르고 안 풀었으면) 지난 상태로 보고 무시한다.
export function findRestConflict(drivers, plate, dateStr) {
  const p = normPlate(plate);
  if (!p) return null;
  const drv = (drivers || []).find(d => normPlate(d.차량번호) === p);
  if (!drv || drv.등급 !== "지입") return null;
  const date = String(dateStr || kstToday()).slice(0, 10);
  const days = Array.isArray(drv.근무요일) ? drv.근무요일 : [];
  const wd = weekdayKo(date);
  const designated = !!(days.length && wd && !days.includes(wd));
  const st = drv.status || drv.mainStatus || drv.상태 || "";
  const restDate = drv.휴차일자 ? String(drv.휴차일자).slice(0, 10) : "";
  const manual = st === "휴차" && date >= kstToday() && (!restDate || restDate === kstToday());
  if (!designated && !manual) return null;
  return { driver: drv, weekday: wd, days, date, designated, manual };
}

let open = false;

export function confirmHolidayDispatch(conflict) {
  return confirmRestDispatch(conflict);
}

// 화면 중앙 확인 팝업 — "진행"(true): 그대로 배차 / "보류"(false): 이 기사 배정을 빼고 진행
export function confirmRestDispatch(conflict) {
  if (!conflict || typeof document === "undefined") return Promise.resolve(true);
  if (open) return Promise.resolve(false);
  open = true;
  return new Promise((resolve) => {
    const { driver, weekday, days, date, designated, manual } = conflict;
    const title = designated && manual ? "휴차 기사 배차 확인" : designated ? "지정 휴차일 배차 확인" : "휴차중 기사 배차 확인";
    const sub = designated ? "근무가능요일이 아닌 날입니다" : "기사님이 직접 휴차 처리한 상태입니다";
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Pretendard,'Noto Sans KR',sans-serif;";
    const esc = (t) => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const dayChips = WEEK.slice(1).concat("일").map(w => {
      const on = days.includes(w);
      const today = w === weekday;
      return `<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;font-size:13px;font-weight:800;
        ${today ? "background:#ef4444;color:#fff;" : on ? "background:#1B2B4B;color:#fff;" : "background:#f1f5f9;color:#94a3b8;"}">${w}</span>`;
    }).join("");
    overlay.innerHTML = `
      <div style="width:100%;max-width:440px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.25)">
        <div style="background:#1B2B4B;padding:16px 20px;display:flex;align-items:center;gap:10px">
          <div style="width:34px;height:34px;border-radius:10px;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center">
            <svg width="18" height="18" fill="none" stroke="#fbbf24" stroke-width="2.2" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
          </div>
          <div>
            <div style="color:#fff;font-size:18px;font-weight:900">${title}</div>
            <div style="color:rgba(255,255,255,.9);font-size:14px;font-weight:700;margin-top:3px">${sub}</div>
          </div>
        </div>
        <div style="padding:18px 20px 6px">
          <div style="font-size:17px;color:#111827;font-weight:700;line-height:1.65">
            입력하신 <b style="font-weight:900">${esc(driver.이름 || "-")}</b> <span style="color:#111827">(${esc(driver.차량번호 || "-")})</span> 기사님은<br/>
            ${designated ? `<b style="color:#dc2626;font-weight:900">${esc(date)} (${esc(weekday)})</b> 지정 휴차일입니다.` : ""}
            ${designated && manual ? "<br/>" : ""}
            ${manual ? `<b style="color:#dc2626;font-weight:900">현재 휴차중</b>입니다. <span style="color:#374151">(기사님이 직접 휴차 처리)</span>` : ""}
          </div>
          <div style="margin-top:12px;padding:10px 14px;background:transparent;border:2px solid #111827;border-radius:10px;font-size:16px;color:#111827;font-weight:900">
            배정하려는 오더: ${esc(date)} (${esc(weekday)}) ${date === kstToday() ? "· 오늘 오더" : date > kstToday() ? "· 미리 주는 오더" : ""}
          </div>
          ${designated ? `<div style="margin-top:12px;padding:10px 12px;background:#f8fafc;border-radius:10px">
            <div style="font-size:14px;font-weight:900;color:#111827;margin-bottom:6px">근무가능요일</div>
            <div style="display:flex;gap:5px;flex-wrap:wrap">${dayChips}</div>
          </div>` : ""}
          <div style="font-size:15px;color:#111827;font-weight:600;margin-top:12px;line-height:1.6">
            <b style="font-weight:900">진행</b> — 그대로 배차하고 기사앱으로 오더가 전달됩니다.<br/>
            <b style="font-weight:900">보류</b> — 기사에게 보내지 않고, 입력한 기사 정보를 비웁니다.
          </div>
        </div>
        <div style="display:flex;gap:8px;padding:16px 20px 20px">
          <button data-act="cancel" style="flex:1;padding:13px 0;border-radius:12px;border:2px solid #111827;background:#fff;color:#111827;font-size:17px;font-weight:900;cursor:pointer">보류</button>
          <button data-act="ok" style="flex:1.3;padding:13px 0;border-radius:12px;border:none;background:#1B2B4B;color:#fff;font-size:17px;font-weight:900;cursor:pointer">진행 (그대로 배차)</button>
        </div>
      </div>`;
    const done = (v) => {
      open = false;
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(v);
    };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(false); } };
    overlay.addEventListener("click", (e) => {
      const act = e.target?.closest?.("[data-act]")?.getAttribute("data-act");
      if (act === "ok") done(true);
      else if (act === "cancel" || e.target === overlay) done(false);
    });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-act="ok"]').focus();
  });
}

// 편의 함수: 충돌이 없으면 true, 있으면 팝업 결과(진행=true / 보류=false)
export async function checkHolidayDispatch(drivers, plate, dateStr) {
  const c = findRestConflict(drivers, plate, dateStr);
  return c ? confirmRestDispatch(c) : true;
}

// 이미 입력 단계에서 "진행"을 고른 차량번호+날짜인지 표시하는 키(저장 단계에서 같은 팝업이 또 뜨지 않게)
export const restAckKey = (plate, dateStr) => `${normPlate(plate)}|${String(dateStr || kstToday()).slice(0, 10)}`;
