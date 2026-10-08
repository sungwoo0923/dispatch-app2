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

// 배차하려는 기사가 그 날짜에 휴차(근무요일 아님)인지 — 지입 기사 + 근무요일이 설정된 경우만
export function findHolidayConflict(drivers, plate, dateStr) {
  const p = normPlate(plate);
  if (!p || !dateStr) return null;
  const drv = (drivers || []).find(d => normPlate(d.차량번호) === p);
  if (!drv || drv.등급 !== "지입") return null;
  const days = Array.isArray(drv.근무요일) ? drv.근무요일 : [];
  if (!days.length) return null; // 근무요일 미설정 = 전일 가능
  const wd = weekdayKo(dateStr);
  if (!wd || days.includes(wd)) return null;
  return { driver: drv, weekday: wd, days, date: String(dateStr).slice(0, 10) };
}

let open = false;

export function confirmHolidayDispatch(conflict) {
  if (!conflict || typeof document === "undefined") return Promise.resolve(true);
  if (open) return Promise.resolve(false);
  open = true;
  return new Promise((resolve) => {
    const { driver, weekday, days, date } = conflict;
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
      <div style="width:100%;max-width:400px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.25)">
        <div style="background:#1B2B4B;padding:16px 20px;display:flex;align-items:center;gap:10px">
          <div style="width:34px;height:34px;border-radius:10px;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center">
            <svg width="18" height="18" fill="none" stroke="#fbbf24" stroke-width="2.2" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
          </div>
          <div>
            <div style="color:#fff;font-size:16px;font-weight:800">휴차일 배차 확인</div>
            <div style="color:rgba(255,255,255,.65);font-size:12px;margin-top:2px">근무가능요일이 아닌 날입니다</div>
          </div>
        </div>
        <div style="padding:18px 20px 6px">
          <div style="font-size:15px;color:#111827;line-height:1.6">
            <b>${esc(driver.이름 || "-")}</b> <span style="color:#6b7280">(${esc(driver.차량번호 || "-")})</span> 기사는<br/>
            <b style="color:#ef4444">${esc(date)} (${esc(weekday)})</b> 휴차일로 등록되어 있습니다.
          </div>
          <div style="margin-top:12px;padding:10px 12px;background:#f8fafc;border-radius:10px">
            <div style="font-size:12px;font-weight:800;color:#6b7280;margin-bottom:6px">근무가능요일</div>
            <div style="display:flex;gap:5px;flex-wrap:wrap">${dayChips}</div>
          </div>
          <div style="font-size:13px;color:#6b7280;margin-top:10px;line-height:1.5">기사와 협의되어 휴차일에도 운행하는 경우에만 배차를 진행해주세요.</div>
        </div>
        <div style="display:flex;gap:8px;padding:16px 20px 20px">
          <button data-act="cancel" style="flex:1;padding:13px 0;border-radius:12px;border:1.5px solid #d1d5db;background:#fff;color:#374151;font-size:15px;font-weight:800;cursor:pointer">배차 취소</button>
          <button data-act="ok" style="flex:1.3;padding:13px 0;border-radius:12px;border:none;background:#1B2B4B;color:#fff;font-size:15px;font-weight:800;cursor:pointer">휴차일이지만 배차</button>
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

// 편의 함수: 충돌이 없으면 true, 있으면 팝업 결과
export async function checkHolidayDispatch(drivers, plate, dateStr) {
  const c = findHolidayConflict(drivers, plate, dateStr);
  return c ? confirmHolidayDispatch(c) : true;
}
