// ======================= cafe-site/src/hub/hubScan.js =======================
// ⭐ 2026-11-06 오더 스캔 → 허브 오더 등록 칸
//  배차 프로그램의 오더 스캔 창(src/OrderScanModal.jsx — 글 붙여넣기 · 캡처 이미지 글자 인식(tesseract) · src/orderScanParser.js)을
//  그대로 열고, [적용] 결과(배차 등록 칸 이름)를 허브 칸으로 바꿔 넣는다.
//   · 상·하차 주소 → 시·도 / 시·군·구(허브 공개 지역) + 상세주소(배차 확정 후 공개)
//   · 상·하차지명(업체명) → 허브는 지명을 공개하지 않으므로 비공개 "장소명"에, 주소가 없으면 지명으로 지역을 찾고 메모에 "주소 확인" 표시
//   · 담당자 · 연락처 · 상·하차 일시 · 방법 · 톤수 · 차종 · 화물(파레트 수) · 운임(청구운임) · 혼적 · 긴급 · 왕복
//   · 결제 방식(인수증 · 선불 · 착불 · 계좌이체 · 계산서 · 예치금) · 수수료는 원문 글에서 찾는다
//   · 거래처명 · 전달사항 · 인식 못한 줄(선택) → 배차된 차주에게만 보이는 메모
import { regionFromAddress, matchListValue, HUB_TONS, HUB_VEHICLES, LOAD_METHODS, PAY_METHODS, tonValue, fmtPhone } from "./hubConstants.js";

const money = (n) => (Number(n) ? Number(n).toLocaleString() : "");
function hubTime(t) {
  const s = String(t || "").trim();
  if (!s) return "";
  if (/즉시|바로|asap/i.test(s)) return "즉시";
  const m = s.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})?/);
  if (!m) return "";
  let h = Number(m[1]); const mi = Number(m[2] || 0);
  if (/오후|pm/i.test(s) && h < 12) h += 12;
  if (h > 23) return "";
  return `${String(h).padStart(2, "0")}:${mi >= 15 && mi < 45 ? "30" : "00"}`;
}
function hubTon(v) {
  const t = tonValue(v);
  if (!t) return "";
  return HUB_TONS.find((x) => tonValue(x) === t && !x.includes("축")) || HUB_TONS.find((x) => tonValue(x) === t) || "";
}
const VEHICLE_ALIAS = [[/냉동\s*윙/, "냉동윙"], [/냉장\s*윙/, "냉장윙"], [/냉동\s*탑|냉동/, "냉동탑"], [/냉장\s*탑|냉장/, "냉장탑"], [/윙/, "윙바디"], [/카고|cargo/i, "카고"], [/리프트/, "리프트"], [/라보/, "라보"], [/다마스/, "다마스"], [/츄레라|트레일러|추레라/, "츄레라"], [/탑/, "탑"], [/덤프/, "덤프"]];
function hubVehicle(v) {
  const s = String(v || "");
  if (!s) return "";
  const direct = matchListValue(HUB_VEHICLES, s);
  if (direct) return direct;
  const hit = VEHICLE_ALIAS.find(([re]) => re.test(s));
  return hit && HUB_VEHICLES.includes(hit[1]) ? hit[1] : "";
}
export function findPay(text) {
  const s = String(text || "");
  const order = ["예치금", "인수증", "선불", "착불", "계좌이체", "계산서"];
  for (const p of order) if (PAY_METHODS.includes(p) && new RegExp(p).test(s)) return p;
  if (/현장\s*결제|현불/.test(s)) return PAY_METHODS.includes("선불") ? "선불" : "";
  return "";
}
export function findFee(text) {
  const m = String(text || "").match(/수수료\s*[:：]?\s*([\d,.]+)\s*(만)?\s*원?/);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return Math.round(m[2] || n < 1000 ? n * 10000 : n);
}

// patch: OrderScanModal onApply 첫 인자(배차 등록 칸) · memo: 둘째 인자 · meta.text: 스캔한 원문
export function scanToHub(patch = {}, memo = "", meta = {}) {
  const out = {};
  const notes = [];
  for (const P of ["상차", "하차"]) {
    const addr = String(patch[`${P}지주소`] || "").trim();
    const name = String(patch[`${P}지명`] || "").trim();
    const reg = regionFromAddress(addr) ;
    const reg2 = reg.sido ? reg : regionFromAddress(name);
    if (reg2.sido) { out[`${P}시도`] = reg2.sido; out[`${P}시군구`] = reg2.sigungu || ""; }
    if (addr) out[`${P}지주소`] = addr;
    if (name) out[`${P}지명`] = name.slice(0, 60);
    if (!addr && name) notes.push(`${P}지: ${name}(주소 확인 필요)`);
    if (patch[`${P}지담당자`]) out[`${P}담당자`] = String(patch[`${P}지담당자`]).slice(0, 30);
    if (patch[`${P}지담당자번호`]) out[`${P}연락처`] = fmtPhone(patch[`${P}지담당자번호`]);
    if (patch[`${P}일`]) out[`${P}일`] = String(patch[`${P}일`]).slice(0, 10);
    const tm = hubTime(patch[`${P}시간`]);
    if (tm) out[`${P}시간`] = tm; else if (patch[`${P}시간`]) notes.push(`${P}시간: ${patch[`${P}시간`]}`);
    const how = matchListValue(LOAD_METHODS, patch[`${P}방법`]);
    if (how) out[`${P}방법`] = how;
  }
  const ton = hubTon(patch.차량톤수);
  if (ton) out.차량톤수 = ton;
  const car = hubVehicle(patch.차량종류);
  if (car) out.차량종류 = car;
  if (patch.화물내용) {
    out.화물내용 = String(patch.화물내용).slice(0, 80);
    const pal = String(patch.화물내용).match(/(\d{1,3})\s*(파레트|파렛트|PLT|plt|팔레트)/);
    if (pal) out.파레트 = pal[1];
  }
  if (patch.청구운임) out.운임 = money(String(patch.청구운임).replace(/[^\d]/g, ""));
  if (patch.혼적 === true) out.적재 = "혼적";
  if (patch.긴급 === true) out.긴급 = true;
  if (patch.운행유형 === "왕복") out.운행유형 = "왕복";
  const text = meta.text || "";
  const pay = findPay(text);
  if (pay) out.지급방식 = pay;
  const fee = findFee(text);
  if (fee) out.수수료 = money(fee);
  const memoParts = [patch.거래처명 ? `거래처: ${patch.거래처명}` : "", patch.전달사항 || "", memo || "", ...notes].filter(Boolean);
  if (memoParts.length) out.메모 = memoParts.join(" / ").slice(0, 500);
  return out;
}
