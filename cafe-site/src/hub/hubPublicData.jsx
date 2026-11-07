// ======================= cafe-site/src/hub/hubPublicData.jsx =======================
// 🏛 2026-11-07 허브 쪽 연결 — 국세청 사업자 상태(가입 · 오더 등록 의뢰자) · 기상청 날씨(콜 카드 · 상세)
//  화면 조각은 배차 프로그램과 같은 파일(../../../src/BizStatusBadge.jsx · ../../../src/WeatherBadge.jsx — Firebase를 쓰지 않는 순수 화면)
//  서버 함수: bizStatusCheck · weatherFor (functions/publicData.js) — 허브는 callHub(callable)로 부른다
import React from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { callHub } from "./hubApi";
import { createBizChecker, BizStatusCheck, bizWarnText } from "../../../src/BizStatusBadge.jsx";
import { createWeatherStore, WeatherBadge, useWeather } from "../../../src/WeatherBadge.jsx";
import { regionOfAddress, slotKey, weatherAt, weatherFlags, warningsFor } from "../../../functions/publicDataCore.mjs";

const errCode = (e) => String(e?.code || "").replace(/^functions\//, "");
const call = async (name, data) => {
  try { return await callHub(name, data); } catch (e) { throw Object.assign(new Error(e?.message || "요청 실패"), { code: errCode(e) }); }
};
export const hubBiz = createBizChecker(call);
export const hubWeather = createWeatherStore({
  call,
  readDoc: async (key) => {
    if (!auth.currentUser) return null;
    const s = await getDoc(doc(db, "weatherCache", key));
    return s.exists() ? s.data() : null;
  },
});

export function HubBizCheck(props) { return <BizStatusCheck checker={hubBiz} {...props} />; }

// 가입 · 등록 직전 확인 — { block: 폐업 문구 } | { warn: 휴업 문구 } | {} (조회가 안 되면 막지 않는다)
export async function hubBizVerdict(value) {
  let r = hubBiz.get(value);
  if (!r) { try { r = (await hubBiz.check([value])).results[String(value || "").replace(/[^\d]/g, "")] || null; } catch { r = null; } }
  if (!r) return {};
  if (r.state === "closed") return { block: bizWarnText(r) + " 폐업한 사업자는 가입할 수 없어요" };
  if (r.state === "suspended") return { warn: bizWarnText(r) };
  return {};
}

const pad = (n) => String(n).padStart(2, "0");
const kstYmd = (off = 0) => { const d = new Date(Date.now() + 9 * 3600e3 + off * 86400e3); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const inRange = (ymd) => { const d = String(ymd || "").slice(0, 10); return !!d && d >= kstYmd(0) && d <= kstYmd(2); };
// 콜 카드 · 상세 — 상차 · 하차 지역(시 · 군 · 구까지) 날씨 한 줄. 볼 게 없으면 안 그린다
export function HubOrderWeather({ o, className = "", plain = false }) {
  const from = o ? [o.상차시도, o.상차시군구].filter(Boolean).join(" ") : "";
  const to = o ? [o.하차시도, o.하차시군구].filter(Boolean).join(" ") : "";
  const on = !!o && inRange(o.상차일);
  const rf = React.useMemo(() => (on ? regionOfAddress(from) : null), [on, from]);
  const rt = React.useMemo(() => (on ? regionOfAddress(to) : null), [on, to]);
  useWeather(hubWeather, [rf?.key, rt?.key]);
  if (!on) return null;
  // 그릴 게 있는지(예보가 있거나 특보 지역) — 없으면 빈 상자를 남기지 않는다
  const has = (r, ymd, time) => {
    if (!r) return false;
    const d = hubWeather.region(r.key);
    const h = d ? weatherAt(d.hours, slotKey(ymd, time)) : null;
    const notable = h && weatherFlags(h).kinds.length > 0;
    return (plain ? !!h : notable) || warningsFor(r, hubWeather.warn()?.active || []).length > 0;
  };
  const dropDay = o.하차일 || o.상차일;
  const showFrom = has(rf, o.상차일, o.상차시간);
  const showTo = inRange(dropDay) && has(rt, dropDay, o.하차시간);
  if (!showFrom && !showTo) return null;
  return (
    <span className={`inline-flex items-center gap-2 flex-wrap text-[13px] font-bold text-[#55657F] ${className}`} data-testid="hub-wx">
      {showFrom && <WeatherBadge store={hubWeather} region={rf} ymd={o.상차일} time={o.상차시간} showPlain={plain} prefix="상차" />}
      {showTo && <WeatherBadge store={hubWeather} region={rt} ymd={dropDay} time={o.하차시간} showPlain={plain} prefix="하차" />}
    </span>
  );
}
