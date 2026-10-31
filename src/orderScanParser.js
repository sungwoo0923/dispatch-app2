// ======================= src/orderScanParser.js =======================
// 🔍 오더 스캔 인식 엔진(2026-10-28) — 카톡·문자·메일·엑셀 복사·캡처(OCR) 등 업체마다 제각각인 오더 양식을
//  최대한 알아듣도록 만든 규칙 기반 인식기. 화면(OrderScanModal)과 분리해 두어 테스트하기 쉽게 했다.
//
//  인식 순서
//   1) 줄 정리 — 글머리(1. ① - • ▶ 이모지)·OCR 띄어쓰기 깨짐(상 차 지)·전각 콜론 정리, 한 줄에 여러 항목("상차: A / 하차: B") 분리
//   2) 항목 이름(라벨) 사전 — 업체마다 다른 말(출발지·픽업·발송지 / 도착지·납품처·배송지 …)을 같은 칸으로
//   3) 구역 나누기 — "상차" 라벨 아래 줄은 상차 구역, "하차" 라벨 아래 줄은 하차 구역(라벨 없는 줄도 따라감)
//   4) 라벨이 없으면 — "A → B" 화살표, 주소 순서(먼저 나온 주소=상차, 다음=하차)로 추정
//   5) 구역 안에서 — 주소/전화/담당자/시간/작업방법/업체명을 각각 뽑는다
//   6) 전체 글에서 — 날짜·차량(톤수·차종)·화물(파레트·박스·kg)·운임·혼적·왕복·긴급
//   7) 등록된 거래처(하차지거래처)와 맞춰 보기 — 이름이 있으면 주소를, 주소만 있으면 이름을 찾아 채운다
//   8) 확인할 점 — 이름 없음(주소만), 주소 없음/불완전, 차량·화물 없음 등을 알려준다
//  결과의 각 칸에는 conf(high: 라벨로 확실 / mid: 추정 / low: 약함)와 출처 줄 번호가 붙는다.

const SIDO_FULL = "서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전북특별자치도|전라북도|전라남도|경상북도|경상남도|제주특별자치도";
const SIDO_SHORT = "서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주";
const SIDO_RE = new RegExp(`(?:${SIDO_FULL}|${SIDO_SHORT})`);

// ── 라벨 사전 ── (공백 없이 비교)
const LABELS = {
  pickupTime: ["상차시간", "상차일시", "상차시각", "상차예정", "상차예정시간", "입차시간", "출발시간", "픽업시간", "출고시간", "상차요청시간"],
  dropTime: ["하차시간", "하차일시", "하차시각", "하차예정", "하차예정시간", "도착시간", "도착예정", "도착예정시간", "납품시간", "입고시간", "하차요청시간", "도착요청시간"],
  pickupDate: ["상차일", "상차일자", "상차날짜", "출고일", "출발일"],
  dropDate: ["하차일", "하차일자", "하차날짜", "도착일", "납품일", "입고일"],
  date: ["날짜", "일자", "운송일", "배송일", "작업일", "운행일"],
  pickupAddr: ["상차주소", "상차지주소", "출발지주소", "출고지주소", "픽업주소"],
  dropAddr: ["하차주소", "하차지주소", "도착지주소", "납품주소", "배송주소", "입고주소"],
  pickupMgr: ["상차담당", "상차담당자", "상차연락처", "상차지연락처", "상차지담당자", "출고담당"],
  dropMgr: ["하차담당", "하차담당자", "하차연락처", "하차지연락처", "하차지담당자", "인수자", "받는분", "수령인", "수취인"],
  pickupMethod: ["상차방법", "상차방식"],
  dropMethod: ["하차방법", "하차방식"],
  pickup: ["상차지", "상차처", "상차장소", "상차위치", "상차", "출발지", "출발", "출고지", "출고처", "출하지", "출하처", "픽업지", "픽업", "보내는곳", "보내는분", "발송지", "발송처", "적재지", "from"],
  drop: ["하차지", "하차처", "하차장소", "하차위치", "하차", "하자", "도착지", "도착", "착지", "납품처", "납품지", "납품", "배송지", "배송처", "받는곳", "입고지", "입고처", "to"],
  weight: ["총중량", "중량", "무게", "총무게", "적재중량"],
  cargo: ["화물내용", "화물", "품목", "제품", "물품", "물량", "수량", "적재물", "내용물", "상품", "짐"],
  vehicle: ["필요차량", "요청차량", "차량종류", "차량톤수", "차량규격", "차량", "차종", "톤수", "차량사양"],
  fare: ["청구운임", "운임", "운송료", "운반비", "운송비", "금액", "단가", "요금", "비용", "운임비"],
  client: ["거래처", "거래처명", "화주", "화주사", "의뢰처", "의뢰업체", "고객사", "요청업체", "업체명", "회사명"],
  manager: ["담당자", "담당", "연락처", "전화", "전화번호", "연락", "휴대폰", "핸드폰", "tel", "hp"],
  memo: ["비고", "메모", "특이사항", "요청사항", "참고", "참고사항", "기타"],
  notice: ["전달사항", "주의사항", "기사전달", "기사님께", "입고프로세스", "하차프로세스", "상차프로세스", "입고안내", "하차안내", "작업안내", "프로세스", "#"],
};
// 긴 라벨부터 비교(“상차지주소”가 “상차지”보다 먼저 잡히게)
const LABEL_LIST = Object.entries(LABELS).flatMap(([k, arr]) => arr.map((w) => ({ k, w }))).sort((a, b) => b.w.length - a.w.length);

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// ── 1) 줄 정리 ──
export function fixOcrSpacing(line) {
  // "상 차 지 : 인 천" 처럼 글자마다 띄어진 OCR 결과 → 붙인다(한 글자 덩어리가 대부분일 때만)
  const toks = line.split(/\s+/).filter(Boolean);
  if (toks.length >= 4) {
    const singles = toks.filter((t) => /^[가-힣]$/.test(t)).length;
    if (singles / toks.length >= 0.5) {
      return line.replace(/([가-힣])\s(?=[가-힣](?:\s|$|[^가-힣]))/g, "$1")
        .replace(/(\d)\s+(번길|길|로|층|호|동)(?![가-힣])/g, "$1$2")
        .replace(/([가-힣]+로)\s+(\d+(?:번길|길))/g, "$1$2");
    }
  }
  return line;
}
function cleanLine(raw) {
  let s = String(raw || "")
    .replace(/[​﻿]/g, "")
    .replace(/[：﹕]/g, ":")
    .replace(/[｜|]/g, " | ")
    .replace(/\t+/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ") // 이모지
    .replace(/^[\s\-–—•·*▶▷►▸◆◇■□●○◎※▸→>#]+/, "")
    .replace(/^\(?\s*[0-9]{1,2}\s*[).]\s*(?=[가-힣A-Za-z])/, "") // 1. 1) (1)
    .replace(/^[①-⑳]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  s = fixOcrSpacing(s);
  // OCR 숫자 오인식: 숫자 옆 O/o → 0, l/I → 1 (O1O-2222 → 010-2222)
  s = s.replace(/[Oo](?=[\d-]*\d)(?<=(?:^|[\s(:\d-])[Oo])/g, "0").replace(/(?<=\d)[Oo]/g, "0")
    .replace(/(?<=\d)[lI|](?=\d)/g, "1");
  return s;
}

// 라벨로 시작하는지 — {k, value}
function matchLabel(line) {
  const compact = line.replace(/\s+/g, "");
  for (const { k, w } of LABEL_LIST) {
    if (!compact.toLowerCase().startsWith(w.toLowerCase())) continue;
    // 원문에서 라벨 길이만큼(공백 무시) 잘라낸다
    let i = 0, cnt = 0;
    while (i < line.length && cnt < w.length) { if (!/\s/.test(line[i])) cnt++; i++; }
    let rest = line.slice(i);
    const after = rest.match(/^\s*(?:[:=]|[)\]】>]|\s-\s|\s)\s*/);
    // 라벨 바로 뒤가 글자(예: "상차지명", "하차해주세요")면 라벨이 아니다 — 단 "상차지명" 같은 이름 라벨은 허용
    if (!after) {
      if (rest === "") return { k, value: "" };
      if (/^명\s*[:=]/.test(rest)) { rest = rest.replace(/^명/, ""); }
      else if (/^[가-힣A-Za-z0-9]/.test(rest)) continue;
    }
    rest = rest.replace(/^\s*(?:[:=]|[)\]】>]|-)?\s*/, "");
    return { k, value: rest.trim() };
  }
  return null;
}

// "상차: A / 하차: B" 같이 한 줄에 라벨이 여러 개 → 나눈다
function splitMultiLabel(line) {
  const parts = line.split(/\s(?:\/|\||,|;)\s|\s{2,}/).map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2 && parts.filter((p) => matchLabel(p)).length >= 2) return parts;
  return [line];
}

// ── 개별 추출기 ──
const ROAD_TAIL = "(?:로|길|번길|대로)";
const ADDR_PATTERNS = [
  // 시도 시작: 경기 김포시 고촌읍 아라육로 12-3 / 인천 서구 원창동 381-12
  new RegExp(`(?:${SIDO_FULL}|${SIDO_SHORT})(?:\\s*[가-힣]+(?:시|군|구))+(?:\\s*[가-힣0-9·.]+(?:읍|면|동|리|가|${ROAD_TAIL.slice(3, -1)}))*(?:\\s*(?:산\\s*)?\\d+(?:-\\d+)?(?:번지)?)?(?:\\s*\\d+(?:동|층|호))?`),
  // 시도 없이 시군구부터: 강서구 등촌로13길 59 / 김포시 고촌읍 …
  new RegExp(`[가-힣]{1,4}(?:시|군|구)(?:\\s*[가-힣]+(?:시|군|구))?\\s*[가-힣0-9·.]+(?:읍|면|동|리|가|로|길|번길|대로)(?:\\s*[가-힣0-9]+(?:로|길|번길))?(?:\\s*(?:산\\s*)?\\d+(?:-\\d+)?(?:번지)?)?`),
];
export function findAddress(text) {
  const s = String(text || "");
  for (const re of ADDR_PATTERNS) {
    const m = s.match(re);
    if (m && m[0].replace(/\s/g, "").length >= 5) {
      let addr = m[0].trim();
      // 괄호 부가설명(동명) 같이 붙어오면 포함
      const after = s.slice(m.index + m[0].length).match(/^\s*\((?!\s*(?:주|유|사|재)\s*\))[^)]{1,20}\)/);
      if (after) addr += after[0];
      return { addr, index: m.index, end: m.index + m[0].length + (after ? after[0].length : 0) };
    }
  }
  return null;
}
// 주소 품질: ok(도로명/지번+번호) / partial(번호 없음) / weak(시·구만)
// OCR로 붙어버린 주소("서울강서구등촌로13길 59") 띄어쓰기 보기 좋게
export function prettyAddr(addr) {
  let a = String(addr || "").trim();
  if (/\s/.test(a.replace(/\s\d+(?:-\d+)?$/, ""))) return a;
  a = a.replace(new RegExp(`^(${SIDO_FULL}|${SIDO_SHORT})(?=[가-힣])`), "$1 ")
    .replace(/([가-힣]{1,4}(?:시|군|구))(?=[가-힣]{2,}(?:시|군|구|읍|면|동|로|길))/g, "$1 ")
    .replace(/([가-힣]{1,4}(?:읍|면))(?=[가-힣])/g, "$1 ");
  return a.replace(/\s+/g, " ");
}
export function addressQuality(addr) {
  const a = String(addr || "");
  if (!a) return "none";
  const hasArea = SIDO_RE.test(a) || /[가-힣]+(?:시|군|구)\b|[가-힣]+(?:시|군|구)\s/.test(a);
  const hasRoad = /[가-힣0-9]+(?:로|길|번길|대로)\s*\d/.test(a) || /[가-힣0-9]+(?:동|리|가)\s*(?:산\s*)?\d/.test(a);
  if (hasArea && hasRoad) return "ok";
  if (hasArea && /(?:로|길|동|리|읍|면)/.test(a)) return "partial";
  return "weak";
}

// 휴대폰·지역번호(010-1234-5678, 02-123-4567) / 대표번호(1533-2525, 1588 0000) — 대표번호는 4+4자리
const PHONE_RE = /(?<!\d)(?:0\d{1,2}[-.\s)]?\d{3,4}[-.\s]?\d{4}|1[5-9]\d{2}[-.\s]?\d{4}|01[016789]\d{7,8})(?!\d)/g;
function normPhone(p) {
  const d = String(p).replace(/[Oo]/g, "0").replace(/[lI|]/g, "1").replace(/\D/g, "");
  if (/^1[5-8]\d{6}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4)}`;
  if (d.startsWith("02") && (d.length === 9 || d.length === 10)) return d.length === 9 ? `02-${d.slice(2, 5)}-${d.slice(5)}` : `02-${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}
export function findPhones(text) {
  const s = String(text || "").replace(/(\d)[Oo](?=\d)/g, "$10");
  return [...s.matchAll(PHONE_RE)].map((m) => ({ phone: normPhone(m[0]), index: m.index, end: m.index + m[0].length }));
}
const TITLE = "대표님|대표|주임님|주임|팀장님|팀장|부장님|부장|과장님|과장|실장님|실장|사원|이사님|이사|대리님|대리|차장님|차장|반장님|반장|소장님|소장|센터장|매니저|기사님|담당님|님";
function findManager(text) {
  const s = String(text || "");
  let m = s.match(new RegExp(`(?:담당자?|인수자|받는분|수령인)\\s*[:=]?\\s*([가-힣]{2,4})`));
  if (m) return m[1];
  // "고민정 (010-6652-6415)", "이환주 주임 (1533-2525)" — 번호 바로 앞 이름
  m = s.match(new RegExp(`(?:^|[^가-힣])([가-힣]{2,4})\\s*(?:${TITLE})?\\s*[(:\\-]?\\s*(?:0\\d{1,2}|1[5-9]\\d{2})[-.\\s)]?\\d{3,4}`));
  if (m && !/^(상차|하차|도착|출발|담당|연락|전화|화물|차량|기사|대표|번호)/.test(m[1])) return m[1];
  m = s.match(new RegExp(`(?:^|[^가-힣])([가-힣]{1,4})\\s*(${TITLE})(?![가-힣])`));
  if (m && !/^(상차|하차|도착|출발|담당|연락|전화|화물|차량|기사)/.test(m[1])) return m[1].length === 1 ? `${m[1]}${m[2]}` : m[1];
  return "";
}

// 시간: "오전 9시", "오후 2시 30분", "14:00", "14시", "9시반", "새벽 5시", "즉시"
export function findTime(text) {
  const s = String(text || "");
  if (/즉시|바로|asap|ASAP|지금/.test(s) && !/\d+\s*시/.test(s)) return { value: "", note: "즉시", basis: null };
  const m = s.match(/(오전|오후|새벽|아침|낮|저녁|밤|AM|PM|am|pm)?\s*(\d{1,2})\s*(?:시|:|：)\s*(반|\d{1,2})?\s*분?/);
  if (!m) return null;
  let h = Number(m[2]);
  let mi = m[3] === "반" ? 30 : Number(m[3] || 0);
  if (h > 24 || mi > 59) return null;
  const ap = m[1] || "";
  if (/오후|저녁|밤|PM|pm/.test(ap) && h < 12) h += 12;
  if (/오전|새벽|아침|AM|am/.test(ap) && h === 12) h = 0;
  if (!ap && h >= 1 && h <= 6 && !/새벽/.test(s)) { /* 1~6시는 보통 오후(13~18시) — 단정하기 어려워 표시만 */ }
  mi = mi < 15 ? 0 : mi < 45 ? 30 : 0;
  if (Number(m[3] || 0) >= 45) h = (h + 1) % 24;
  const apOut = h < 12 ? "오전" : "오후";
  const hh = h % 12 === 0 ? 12 : h % 12;
  const tail = s.slice(m.index + m[0].length, m.index + m[0].length + 8);
  const basis = /^\s*(?:까지|이전|전에|전(?![가-힣])|안으로|내로)/.test(tail) ? "이전" : /^\s*(?:이후|부터|후에|후(?![가-힣])|넘어서)/.test(tail) ? "이후" : null;
  return { value: `${apOut} ${hh}시${mi ? " 30분" : ""}`, basis, raw: m[0], guessedAmPm: !ap && h >= 1 && h <= 7 };
}

// 날짜: 10/29, 10.29, 10월 29일, 29일, 내일, 익일, 모레, 오늘·금일·당일
export function findDate(text, today = new Date()) {
  const s = String(text || "");
  // rel = 기준일(오늘)로부터 며칠 뒤인지 — 하차일은 나중에 "상차일" 기준으로 다시 계산한다
  if (/모레/.test(s)) return { value: ymd(addDays(today, 2)), raw: "모레", rel: 2 };
  if (/내일|명일|익일|다음날|익착|명착|(?<![가-힣])낼(?![가-힣])|낼\s*(?:착|하차|도착)/.test(s)) return { value: ymd(addDays(today, 1)), raw: "내일", rel: 1 };
  if (/오늘|금일|당일|당착/.test(s)) return { value: ymd(today), raw: "오늘", rel: 0 };
  let m = s.match(/(20\d{2})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    m = s.match(/(?<![\d.])(\d{1,2})\s*(?:\/|\.|월)\s*(\d{1,2})\s*일?(?![\d.])(?!\s*(?:톤|t|T|kg|KG|m|M|만|%|파|p|P|박스|cbm))/);
    if (m) { mo = +m[1]; d = +m[2]; }
    else {
      m = s.match(/(?<!\d)(\d{1,2})\s*일(?![가-힣])/);
      if (m) { mo = today.getMonth() + 1; d = +m[1]; }
    }
    if (m) {
      y = today.getFullYear();
      if (mo < today.getMonth() + 1 - 6) y += 1; // 1월에 12월 오더 등
    }
  }
  if (!m || !mo || mo > 12 || !d || d > 31) return null;
  return { value: `${y}-${pad(mo)}-${pad(d)}`, raw: m[0] };
}

// 차량: 톤수 + 차종
export function findVehicle(text) {
  const s = String(text || "");
  let ton = "";
  const t = s.match(/(\d{1,2}(?:\.\d)?)\s*(?:톤|t(?![a-z])|T(?![a-z]))\s*(축)?/);
  if (t && Number(t[1]) > 0 && Number(t[1]) <= 30) ton = `${Number(t[1])}톤${t[2] ? "축" : ""}`;
  let type = "";
  const cold = /냉동/.test(s), chill = /냉장/.test(s), wing = /윙/.test(s), top = /탑(?!승)/.test(s);
  if ((cold || chill) && wing) type = cold && chill ? "냉장/냉동윙" : cold ? "냉동윙" : "냉장윙";
  else if (cold && chill) type = "냉장/냉동탑";
  else if (cold) type = "냉동탑";
  else if (chill) type = "냉장탑";
  else if (/윙\s*\/?\s*카고|카고\s*\/?\s*윙/.test(s)) type = "윙/카고";
  else if (wing) type = "윙바디";
  else if (/리프트/.test(s)) type = "리프트";
  else if (/카고|화물차/.test(s)) type = "카고";
  else if (top) type = "탑차";
  else if (/다마스|라보/.test(s)) type = "라보/다마스";
  else if (/오토바이|퀵/.test(s)) type = "오토바이";
  if (!ton && /다마스|라보/.test(s)) ton = "";
  return ton || type ? { ton, type } : null;
}

// 화물: 파레트/박스/kg/통 + 원문
export function findCargo(text) {
  const s = String(text || "");
  const p = s.match(/(\d+(?:\.\d+)?)\s*(?:파레트|파렛트|파렛|파레|팔레트|팔렛|PLT|plt|P(?![a-zA-Z가-힣])|p(?![a-zA-Z가-힣])|빠레트|빠렛)/);
  if (p) return { qty: p[1], unit: "파레트", value: `${p[1]}파레트` };
  const b = s.match(/(\d+)\s*(?:박스|box|BOX|bx|BX|상자|ctn|CTN|카톤)/);
  if (b) return { qty: b[1], unit: "박스", value: `${b[1]}박스` };
  const tong = s.match(/(\d+)\s*통(?![가-힣])/);
  if (tong) return { qty: tong[1], unit: "통", value: `${tong[1]}통` };
  const kg = s.match(/(\d[\d,.]*)\s*(?:kg|KG|Kg|킬로)/);
  if (kg) return { qty: "", unit: "", value: `${kg[1].replace(/,/g, "")}kg` };
  return null;
}

// 중량: 600kg, 600키로, 1.2톤(화물 무게), 0.6t → 차량톤수 칸에 "600kg"/"1.2톤"으로
export function findWeight(text) {
  const s = String(text || "");
  const kg = s.match(/(\d[\d,.]*)\s*(?:kg|KG|Kg|㎏|키로그램|키로|킬로그램|킬로)/);
  if (kg) { const n = Number(kg[1].replace(/,/g, "")); if (n > 0 && n < 50000) return `${n}kg`; }
  const t = s.match(/(\d+(?:\.\d+)?)\s*(?:톤|t|T)(?![a-zA-Z])/);
  if (t) { const n = Number(t[1]); if (n > 0 && n <= 30) return `${n}톤`; }
  return "";
}

// 운임: 15만, 15만원, 150,000원, 15.5만
export function findFare(text, labeled) {
  const s = String(text || "");
  let m = s.match(/(\d+(?:\.\d+)?)\s*만\s*(\d{1,4})?\s*원?/);
  if (m) {
    const v = Math.round(Number(m[1]) * 10000 + (m[2] ? Number(m[2]) * (m[2].length <= 1 ? 1000 : 1) : 0));
    if (v >= 10000 && v <= 5000000) return v;
  }
  m = s.match(/(\d{1,3}(?:,\d{3})+|\d{5,7})\s*원?/);
  if (m && (labeled || /원/.test(s))) {
    const v = Number(m[1].replace(/,/g, ""));
    if (v >= 10000 && v <= 5000000) return v;
  }
  return null;
}

const METHOD_RE = /(지게차|수작업|수하역|손작업|호이스트|크레인|컨베이어|도크|도크장)/;
const methodOf = (s) => {
  const m = String(s || "").match(METHOD_RE);
  if (!m) return "";
  return { 수하역: "수작업", 손작업: "수작업", 도크: "지게차", 도크장: "지게차" }[m[1]] || m[1];
};

// 업체명 후보 정리 — 주소·전화·시간·담당자·잡음 제거
const NOISE_RE = /(상차|하차|도착|출발|시간|주소|연락처|전화|담당|요청|부탁|드립니다|바랍니다|해주세요|입니다|감사|수고|확인|예정|가능|필요|차량|톤|파레트|파렛|박스|kg|운임|만원|오전|오후|익일|당일|내일|오늘|모름|미정|지게차|수작업|호이스트|크레인|컨베이어|혼적|왕복|편도|카고|윙바디|냉동|냉장)/;
// 업체명 안에 들어갈 수 있는 말(녹산냉동·OO냉장·XX카고)은 "그 말 하나만" 있을 때만 잡음으로 본다
const WEAK_WORDS = new Set(["냉동", "냉장", "카고", "윙바디", "윙", "탑", "혼적", "왕복", "편도", "지게차", "수작업", "호이스트", "크레인", "컨베이어", "익일", "당일", "내일", "오늘", "오전", "오후"]);
const isNoise = (x) => {
  const c = x.replace(/\s/g, "");
  if (/(상차|하차|도착|출발|시간|주소|연락처|전화|담당|요청|부탁|드립니다|바랍니다|해주세요|입니다|감사|수고|확인|예정|가능|필요|차량|운임|만원|모름|미정)/.test(c)) return true;
  if (/\d\s*(톤|파레트|파렛|박스|kg|p\b)/i.test(x)) return true;
  return x.split(/\s+/).every((t) => WEAK_WORDS.has(t));
};
function nameCandidate(text, cutRanges = []) {
  let s = String(text || "");
  // 잘라낼 범위(주소·전화 위치)를 공백으로
  cutRanges.sort((a, b) => b.index - a.index).forEach((r) => { s = s.slice(0, r.index) + " " + s.slice(r.end); });
  s = s.replace(/\(([^)]*)\)/g, (m, inner) => (isNoise(inner) || !inner.trim() ? " " : m))
    .replace(/(?:내일|오늘|익일|당일|금일|모레|명일)/g, " ")
    .replace(/\d{1,2}\s*(?:\/|월)\s*\d{1,2}\s*일?(?:\s*\([월화수목금토일]\))?/g, " ")
    .replace(PHONE_RE, " ")
    .replace(new RegExp(`(^|\\s)[가-힣]{1,4}\\s*(?:${TITLE})(?![가-힣])`, "g"), " ")
    .replace(/(오전|오후|새벽|아침|저녁)?\s*\d{1,2}\s*(시|:)\s*(\d{1,2}|반)?\s*분?\s*(까지|이전|이후|부터)?/g, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/[\/|,·~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = s.split(/\s(?:-|–)\s|\s{2,}/).map((x) => x.trim()).filter(Boolean);
  const good = (parts.length ? parts : [s]).map((x) => x.replace(/^[-:)\]]+|[-:(\[]+$/g, "").replace(/^(?:지하\s*)?[Bb]?\d{1,2}\s*층\s*/, "").replace(/\s+(?:지하\s*)?[Bb]?\d{1,2}\s*층$/, "").trim())
    .find((x) => x.length >= 2 && x.length <= 30 && /[가-힣A-Za-z]/.test(x) && !isNoise(x) && !findAddress(x));
  return good || "";
}

// ── 등록된 거래처와 맞추기 ──
const nk = (v) => String(v || "").replace(/\s+/g, "").replace(/\(주\)|㈜|주식회사/g, "").toLowerCase();
const addrKey = (a) => String(a || "").replace(/\(.*?\)/g, "").replace(/특별시|광역시|특별자치시|특별자치도|도(?=\s)/g, "").replace(/\s+/g, "").toLowerCase();
function matchPlaceByName(name, places) {
  const n = nk(name);
  if (!n || n.length < 2) return null;
  return places.find((p) => nk(p.업체명) === n) || null;
}
function findPlaceInText(text, places, exclude) {
  const t = nk(text);
  let best = null;
  for (const p of places) {
    const n = nk(p.업체명);
    if (n.length < 2 || (exclude && n === nk(exclude))) continue;
    if (t.includes(n) && (!best || n.length > nk(best.업체명).length)) best = p;
  }
  return best;
}
function matchPlaceByAddr(addr, places) {
  const k = addrKey(addr);
  if (k.length < 6) return null;
  // 도로명+번호가 같은 곳(앞부분 시도 표기 차이는 무시)
  const tail = (x) => { const m = x.match(/[가-힣0-9]+(?:로|길|번길|대로|동|리|가)(?:산)?\d+(?:-\d+)?/); return m ? m[0] : ""; };
  const kt = tail(k);
  return places.find((p) => { const pk = addrKey(p.주소); return pk && (pk === k || (kt && tail(pk) === kt && pk.slice(0, 4) === k.slice(0, 4))); }) || null;
}

// 이름 핵심만 — "원창동 반찬단지 물류센터" → "반찬단지", "(주)농협하나로유통" → "농협하나로유통"
export function coreName(n) {
  let t = String(n || "").replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, " ").replace(/\(.*?\)/g, " ").trim();
  const toks = t.split(/\s+/).filter(Boolean);
  while (toks.length > 1 && /^(?:[가-힣]{1,4}(?:동|읍|면|리|시|구|군)|서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)$/.test(toks[0])) toks.shift();
  t = toks.join("");
  let prev;
  do { prev = t; t = t.replace(/(?:제\d+)?(?:물류센터|물류창고|배송센터|유통센터|센터|물류|본사|본점|지점|직영점|공장|창고|사업장|매장|\d+공장|\d+센터)$/, ""); } while (t !== prev && t.length > 2);
  return t.toLowerCase();
}
export function namesSimilar(a, b) {
  const x = coreName(a), y = coreName(b);
  if (x.length < 2 || y.length < 2) return false;
  return x === y || x.includes(y) || y.includes(x);
}
function matchPlaceBySimilarName(name, places, exclude) {
  const x = coreName(name);
  if (x.length < 2) return null;
  let best = null, bestScore = 0;
  for (const p of places) {
    if (exclude && nk(p.업체명) === nk(exclude)) continue;
    const y = coreName(p.업체명);
    if (y.length < 2) continue;
    let sc = 0;
    if (x === y) sc = 100;
    else if (x.includes(y)) sc = 60 + y.length;
    else if (y.includes(x)) sc = 50 + x.length;
    if (sc > bestScore) { best = p; bestScore = sc; }
  }
  return best;
}
const tailOf = (a) => { const m = addrKey(a).match(/[가-힣0-9]+(?:로|길|번길|대로|동|리|가)(?:산)?\d+(?:-\d+)?/); return m ? m[0] : ""; };
export function sameAddr(a, b) {
  const x = addrKey(a), y = addrKey(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const tx = tailOf(a), ty = tailOf(b);
  return !!tx && tx === ty;
}

// ── 여러 건 나누기 ──
export function splitOrders(text) {
  const raw = String(text || "").replace(/\r/g, "");
  const lines = raw.split("\n");
  const starts = [];
  lines.forEach((l, i) => {
    const c = cleanLine(l);
    const lab = c && matchLabel(c);
    if (lab && lab.k === "pickup") starts.push(i);
  });
  const dropCount = lines.filter((l) => { const c = cleanLine(l); const lab = c && matchLabel(c); return lab && lab.k === "drop"; }).length;
  if (starts.length >= 2 && dropCount >= 2) {
    // 각 상차 라벨 바로 위의 머리줄(“1번 오더”, 날짜 줄 등)까지 함께 묶는다 — 먼저 시작 위치를 넓힌 뒤 자른다
    const ext = starts.map((st, i) => {
      let s0 = st;
      const floor = i ? starts[i - 1] + 1 : 0;
      while (s0 > floor && lines[s0 - 1].trim() && !matchLabel(cleanLine(lines[s0 - 1]))) s0--;
      return s0;
    });
    const blocks = ext.map((s0, i) => lines.slice(s0, i + 1 < ext.length ? ext[i + 1] : lines.length).join("\n").trim());
    const head = lines.slice(0, ext[0]).join("\n").trim(); // 공통 머리(날짜·거래처 등)
    return blocks.map((b) => (head && !b.startsWith(head) ? `${head}\n${b}` : b));
  }
  // 구분선으로 나뉜 경우
  const bySep = raw.split(/\n\s*(?:[-=_*~]{4,}|#{2,}.*)\s*\n/).map((x) => x.trim()).filter(Boolean);
  if (bySep.length >= 2 && bySep.every((b) => findAddress(b) || /상차|하차/.test(b))) return bySep;
  return [raw.trim()];
}

// ── 메인 ──
export function parseOrderScan(text, { places = [], clients = [], today = new Date() } = {}) {
  const rawLines = String(text || "").replace(/\r/g, "").split("\n");
  // 줄 목록(원문 줄 번호 유지) + 한 줄 여러 라벨 분리
  const lines = [];
  rawLines.forEach((rl, i) => {
    const c = cleanLine(rl);
    if (!c) return;
    splitMultiLabel(c).forEach((part) => lines.push({ i, text: part }));
  });

  const F = {}; // 결과 칸: { value, conf, line }
  const set = (key, value, conf, line) => {
    if (value === undefined || value === null || value === "") return;
    const rank = { high: 3, mid: 2, low: 1 };
    if (F[key] && rank[F[key].conf] >= rank[conf]) return;
    F[key] = { value, conf, line };
  };
  // 하차일 — "내일/익일/당일" 같은 상대 표기면 rel(상차일로부터 며칠)도 같이 기억
  const setDrop = (d, conf, line) => { const before = F.하차일; set("하차일", d.value, conf, line); if (F.하차일 !== before) F.하차일.rel = d.rel ?? null; };
  const roles = {}; // 원문 줄 번호 → 역할
  const markRole = (i, r) => { if (!roles[i] || roles[i] === "기타") roles[i] = r; };
  const sec = { pickup: { lines: [], labeled: false }, drop: { lines: [], labeled: false } };
  const globalLines = [];
  const noticeLines = []; // "#입고 프로세스"처럼 기사님께 전달할 안내 묶음
  let cur = null;
  // 상차/하차 라벨이 하나라도 있으면 화살표(A → B) 줄은 경로 설명으로만 본다
  const hasSectionLabel = lines.some((L) => { const lb = matchLabel(L.text); return lb && ["pickup", "drop", "pickupAddr", "dropAddr"].includes(lb.k); });

  const GREET_RE = /^(?:\d+\s*(?:번|건)(?:\s*(?:오더|째))?$|오더\s*\d+\s*$|감사|수고|부탁|잘\s*부탁|확인\s*부탁|안녕|넵|네|ㅎㅎ|ㅋㅋ|\^\^|좋은\s*하루|오더\s*(?:요청|드립니다|전달)|\[[^\]]*\])[^\d]{0,30}$/;
  for (const L of lines) {
    if (GREET_RE.test(L.text) && !findAddress(L.text) && !findPhones(L.text).length) { markRole(L.i, "기타"); continue; }
    const lab = matchLabel(L.text);
    // 안내 묶음(#입고 프로세스 …) 안에서는 "상차지: / 하차지:"처럼 콜론 붙은 새 구역 라벨이 나오기 전까지 전부 안내문
    if (cur === "notice" && !(lab && ["pickup", "drop", "pickupAddr", "dropAddr", "pickupTime", "dropTime"].includes(lab.k) && /[:：]/.test(L.text.slice(0, 10)))) {
      noticeLines.push(String(rawLines[L.i] || L.text).trim()); markRole(L.i, "전달"); continue;
    }
    if (lab) {
      const v = lab.value;
      switch (lab.k) {
        case "pickup": cur = "pickup"; sec.pickup.labeled = true; if (v) sec.pickup.lines.push({ ...L, text: v }); markRole(L.i, "상차"); continue;
        case "drop": cur = "drop"; sec.drop.labeled = true; if (v) sec.drop.lines.push({ ...L, text: v }); markRole(L.i, "하차"); continue;
        case "pickupAddr": { const a = findAddress(v); set("상차지주소", a ? a.addr : v, "high", L.i); markRole(L.i, "상차"); cur = "pickup"; sec.pickup.labeled = true; continue; }
        case "dropAddr": { const a = findAddress(v); set("하차지주소", a ? a.addr : v, "high", L.i); markRole(L.i, "하차"); cur = "drop"; sec.drop.labeled = true; continue; }
        case "pickupTime": { const t = findTime(v); if (t?.value) { set("상차시간", t.value, "high", L.i); if (t.basis) set("상차시간기준", t.basis, "high", L.i); } const d = findDate(v, today); if (d) set("상차일", d.value, "high", L.i); if (t?.note) set("메모추가", `상차 ${t.note}`, "mid", L.i); markRole(L.i, "시간"); continue; }
        case "dropTime": { const t = findTime(v); if (t?.value) { set("하차시간", t.value, "high", L.i); if (t.basis) set("하차시간기준", t.basis, "high", L.i); } const d = findDate(v, today); if (d) setDrop(d, "high", L.i); if (t?.note) set("메모추가", `하차 ${t.note}`, "mid", L.i); markRole(L.i, "시간"); continue; }
        case "pickupDate": { const d = findDate(v, today); if (d) set("상차일", d.value, "high", L.i); const t = findTime(v); if (t?.value) set("상차시간", t.value, "mid", L.i); markRole(L.i, "날짜"); continue; }
        case "dropDate": { const d = findDate(v, today); if (d) setDrop(d, "high", L.i); const t = findTime(v); if (t?.value) set("하차시간", t.value, "mid", L.i); markRole(L.i, "날짜"); continue; }
        case "date": { const d = findDate(v, today); if (d) set("상차일", d.value, "high", L.i); markRole(L.i, "날짜"); continue; }
        case "pickupMgr": { const p = findPhones(v)[0]; if (p) set("상차지담당자번호", p.phone, "high", L.i); const m = findManager(v) || nameCandidate(v.replace(PHONE_RE, "")); if (m && m.length <= 6) set("상차지담당자", m, "high", L.i); markRole(L.i, "상차"); continue; }
        case "dropMgr": { const p = findPhones(v)[0]; if (p) set("하차지담당자번호", p.phone, "high", L.i); const m = findManager(v) || nameCandidate(v.replace(PHONE_RE, "")); if (m && m.length <= 6) set("하차지담당자", m, "high", L.i); markRole(L.i, "하차"); continue; }
        case "pickupMethod": { const m = methodOf(v) || v; set("상차방법", m, "high", L.i); markRole(L.i, "상차"); continue; }
        case "dropMethod": { const m = methodOf(v) || v; set("하차방법", m, "high", L.i); markRole(L.i, "하차"); continue; }
        case "cargo": { const c = findCargo(v); set("화물내용", c ? c.value : v.slice(0, 40), c ? "high" : "mid", L.i); if (c) set("화물단위", c.unit, "high", L.i); const vv = findVehicle(v); if (vv) { if (vv.ton) set("차량톤수", vv.ton, "mid", L.i); if (vv.type) set("차량종류", vv.type, "mid", L.i); } markRole(L.i, "화물"); continue; }
        case "vehicle": { const vv = findVehicle(v); if (vv) { if (vv.ton) set("차량톤수", vv.ton, "high", L.i); if (vv.type) set("차량종류", vv.type, "high", L.i); } else set("차량원문", v, "mid", L.i); const c = findCargo(v); if (c) set("화물내용", c.value, "mid", L.i); markRole(L.i, "차량"); continue; }
        case "fare": { const f = findFare(v, true); if (f) set("청구운임", f, "high", L.i); markRole(L.i, "운임"); continue; }
        case "client": { if (v) set("거래처명", v.replace(/\(주\)|㈜/g, "").trim(), "high", L.i); markRole(L.i, "거래처"); continue; }
        case "manager": {
          // 구역 안이면 그 구역 담당자, 아니면 공통
          const target = cur || "global";
          const p = findPhones(v)[0]; const m = findManager(v) || nameCandidate(v.replace(PHONE_RE, ""));
          if (target === "pickup") { if (p) set("상차지담당자번호", p.phone, "high", L.i); if (m && m.length <= 6) set("상차지담당자", m, "mid", L.i); }
          else if (target === "drop") { if (p) set("하차지담당자번호", p.phone, "high", L.i); if (m && m.length <= 6) set("하차지담당자", m, "mid", L.i); }
          else globalLines.push(L);
          markRole(L.i, target === "pickup" ? "상차" : target === "drop" ? "하차" : "담당자");
          continue;
        }
        case "memo": { if (v) set("메모추가", v, "high", L.i); markRole(L.i, "메모"); continue; }
        case "weight": {
          const w = findWeight(v); if (w) set("차량톤수", w, "high", L.i);
          const c = findCargo(v.replace(/\d[\d,.]*\s*(?:kg|KG|Kg|㎏|키로그램|키로|킬로그램|킬로)/g, "")); if (c) { set("화물내용", c.value, "high", L.i); set("화물단위", c.unit, "high", L.i); }
          markRole(L.i, "화물"); continue;
        }
        case "notice": { cur = "notice"; noticeLines.push(String(rawLines[L.i] || L.text).trim().replace(/^#\s*/, "")); markRole(L.i, "전달"); continue; }
        default: break;
      }
    }
    // 라벨 없는 줄
    const arrow = !hasSectionLabel && L.text.match(/^(.+?)\s*(?:→|->|=>|⇒|→|>{1,2}|에서)\s*(.+?)(?:\s*(?:까지|으로|로))?$/);
    if (!cur && arrow && !/\d+\s*시\s*$/.test(arrow[1]) && arrow[1].length >= 2 && arrow[2].length >= 2) {
      const d = findDate(arrow[1], today); if (d) set("상차일", d.value, "mid", L.i);
      const strip = (x) => x.replace(/^\s*\d{1,2}\s*[\/.월]\s*\d{1,2}\s*일?\s*(?:\([월화수목금토일]\))?\s*/, "").trim();
      sec.pickup.lines.push({ ...L, text: strip(arrow[1]) });
      sec.drop.lines.push({ ...L, text: strip(arrow[2]) });
      markRole(L.i, "경로");
      continue;
    }
    // 괄호만 있는 줄 "(미준수 시 회송)" → 메모
    if (/^\(.*\)$/.test(L.text) && !findAddress(L.text) && !findPhones(L.text).length) {
      F.메모추가 = { value: [F.메모추가?.value, L.text.replace(/^\(|\)$/g, "")].filter(Boolean).join(" / "), conf: "mid", line: L.i };
      markRole(L.i, "메모"); continue;
    }
    if (cur) {
      // 구역 아래 줄이라도 차량·화물만 적힌 줄이면 그 역할로 표시(업체명 후보에서도 빠진다)
      const onlyFreight = !findAddress(L.text) && !findPhones(L.text).length && (findVehicle(L.text) || findCargo(L.text)) && !/[가-힣]{2,}(?:센터|물류|창고|식품|상사|마트|공장)/.test(L.text);
      if (onlyFreight) { globalLines.push(L); markRole(L.i, findVehicle(L.text) ? "차량" : "화물"); continue; }
      sec[cur].lines.push(L); markRole(L.i, cur === "pickup" ? "상차" : "하차");
    }
    else globalLines.push(L);
  }

  // ── 라벨이 없으면: 주소 순서로 상차/하차 추정 ──
  if (!sec.pickup.lines.length && !sec.drop.lines.length && !F.상차지주소 && !F.하차지주소) {
    const addrLines = globalLines.filter((L) => findAddress(L.text));
    if (addrLines.length >= 2) {
      const [a, b] = addrLines;
      // 주소 줄 바로 위 짧은 줄은 업체명일 가능성이 높다
      const nameAbove = (L) => { const prev = globalLines[globalLines.indexOf(L) - 1]; return prev && !findAddress(prev.text) && !findPhones(prev.text).length && prev.text.length <= 25 && !matchLabel(prev.text) ? prev : null; };
      const na = nameAbove(a), nb = nameAbove(b);
      sec.pickup.lines.push(...[na, a].filter(Boolean)); sec.drop.lines.push(...[nb, b].filter(Boolean));
      sec.pickup.inferred = sec.drop.inferred = true;
      [na, a].filter(Boolean).forEach((L) => { markRole(L.i, "상차"); });
      [nb, b].filter(Boolean).forEach((L) => { markRole(L.i, "하차"); });
      // 각 주소 줄 다음의 전화 줄도 그 구역으로
      const after = (L, key) => { const idx = globalLines.indexOf(L); const nx = globalLines[idx + 1]; if (nx && findPhones(nx.text).length && !findAddress(nx.text)) { sec[key].lines.push(nx); markRole(nx.i, key === "pickup" ? "상차" : "하차"); } };
      after(a, "pickup"); after(b, "drop");
    } else if (addrLines.length === 1) {
      sec.drop.lines.push(addrLines[0]); sec.drop.inferred = true; markRole(addrLines[0].i, "하차");
    }
  }

  // ── 구역 안에서 뽑기 ──
  const pick = (key, P) => {
    const S = sec[key];
    if (!S.lines.length) return;
    const conf = S.inferred ? "mid" : "high";
    const all = S.lines.map((x) => x.text).join(" ");
    const first = S.lines[0];
    // 주소
    let addrHit = null, addrLine = null;
    for (const L of S.lines) { const a = findAddress(L.text); if (a) { addrHit = a; addrLine = L; break; } }
    if (addrHit) set(`${P}주소`, prettyAddr(addrHit.addr), conf, addrLine.i);
    // 전화·담당자
    const ph = findPhones(all)[0]; if (ph) set(`${P}담당자번호`, ph.phone, conf, first.i);
    const mg = findManager(all); if (mg) set(`${P}담당자`, mg, "mid", first.i);
    // 시간·날짜
    const t = findTime(all);
    if (t?.value) { set(`${P === "상차지" ? "상차" : "하차"}시간`, t.value, "mid", first.i); if (t.basis) set(`${P === "상차지" ? "상차" : "하차"}시간기준`, t.basis, "mid", first.i); }
    const d = findDate(all, today); if (d) { if (P === "상차지") set("상차일", d.value, "mid", first.i); else setDrop(d, "mid", first.i); }
    // 작업방법
    const mt = methodOf(all); if (mt) set(P === "상차지" ? "상차방법" : "하차방법", mt, "mid", first.i);
    // 업체명: 각 줄에서 주소/전화 빼고 남은 글
    let nm = "";
    for (const L of S.lines) {
      const cuts = [];
      const a = findAddress(L.text); if (a) cuts.push({ index: a.index, end: a.end });
      findPhones(L.text).forEach((p) => cuts.push(p));
      const c = nameCandidate(L.text, cuts);
      if (c) { nm = c; break; }
    }
    if (nm) set(`${P}명`, nm.replace(/\(주\)|㈜/g, "").trim(), conf, first.i);
  };
  pick("pickup", "상차지");
  pick("drop", "하차지");

  // ── 전체 글에서 공통 항목 ──
  const full = lines.map((x) => x.text).join("\n");
  const gl = globalLines.map((x) => x.text).join("\n");
  if (!F.차량톤수 || !F.차량종류) {
    // 업체명·주소 속 글자(예: "녹산냉동")를 차종으로 오인하지 않게 빼고 본다
    let vtext = full.replace(/\d+\s*(?:톤|t)\s*(?:화물|짐)/g, "");
    ["상차지명", "하차지명", "상차지주소", "하차지주소", "거래처명"].forEach((k) => { if (F[k]?.value) vtext = vtext.split(String(F[k].value)).join(" "); });
    const tonLine = lines.find((x) => /\d\s*(?:톤|t\b|T\b)/.test(x.text));
    const vLine = tonLine ? findVehicle(["상차지명", "하차지명"].reduce((t, k) => (F[k]?.value ? t.split(String(F[k].value)).join(" ") : t), tonLine.text)) : null;
    const vv = vLine && vLine.type ? vLine : findVehicle(vtext) || vLine;
    if (vv) { if (vv.ton) set("차량톤수", vv.ton, "mid", -1); if (vv.type) set("차량종류", vv.type, "mid", -1); }
  }
  if (!F.화물내용) { const c = findCargo(full); if (c) { set("화물내용", c.value, "mid", -1); set("화물단위", c.unit, "mid", -1); } }
  if (!F.청구운임) {
    // 줄 중간의 "운임 9만" 같은 표기도 찾는다(라벨이 줄 맨 앞이 아닐 때)
    const fm = full.match(/(?:운임|운송료|운반비|운송비|금액|단가|요금)\s*[:=]?\s*([\d,.]+\s*만?\s*\d*\s*원?)/);
    const f = (fm && findFare(fm[1], true)) || findFare(gl, false);
    if (f) set("청구운임", f, fm ? "mid" : "low", -1);
  }
  if (!F.상차일) { const d = findDate(gl, today); if (d) set("상차일", d.value, "mid", -1); }
  // ⭐ 하차 날짜가 문장 속에 있는 경우 — "익착/낼착/내일하차/익일 하차", "31일 하차/31일착", "하차 31일", "10/31 하차"
  if (!F.하차일) {
    const rel = full.match(/익일\s*(?:하차|도착|착)|익착|명착|낼\s*(?:착|하차|도착)|다음\s*날\s*(?:하차|도착|착)|내일\s*(?:하차|도착|착)|하차\s*[:：]?\s*(?:익일|내일|낼|다음\s*날)|모레\s*(?:하차|도착|착)/);
    const same = full.match(/당착|당일\s*(?:하차|도착|착)|하차\s*[:：]?\s*당일/);
    const abs = full.match(/(?<![\d:])((?:\d{1,2}\s*(?:\/|\.|월)\s*\d{1,2}\s*일?)|\d{1,2}\s*일)\s*(?:하차|도착|착)(?![가-힣])|하차\s*[:：]?\s*((?:\d{1,2}\s*(?:\/|월)\s*)?\d{1,2}\s*일)/);
    if (rel) setDrop({ value: ymd(addDays(today, /모레/.test(rel[0]) ? 2 : 1)), rel: /모레/.test(rel[0]) ? 2 : 1 }, "mid", -1);
    else if (same) setDrop({ value: ymd(today), rel: 0 }, "mid", -1);
    else if (abs) { const d = findDate(abs[1] || abs[2], today); if (d) setDrop(d, "mid", -1); }
  }
  // 상대 표기(내일/익일/당일)는 오늘이 아니라 "상차일" 기준으로 다시 계산
  if (F.하차일 && F.하차일.rel != null && F.상차일) {
    F.하차일.value = ymd(addDays(new Date(F.상차일.value + "T00:00:00"), F.하차일.rel));
  }
  // ⭐ 사용자 요청 — 하차 날짜가 따로 안 적혀 있으면(즉시·빈칸) 보통 당착 → 하차일 = 상차일
  if (!F.하차일 && F.상차일) { F.하차일 = { value: F.상차일.value, conf: "mid", line: -1, rel: 0, auto: true }; }
  if (!F.상차시간) { const t = findTime(gl); if (t?.value) set("상차시간", t.value, "low", -1); }
  if (/혼적|합짐|혼載/.test(full)) set("혼적", true, "mid", -1);
  if (/왕복/.test(full)) set("운행유형", "왕복", "mid", -1);
  if (/긴급|급건|급한|최대한\s*빨리/.test(full)) set("긴급", true, "mid", -1);

  // 거래처: 라벨 없으면 등록된 거래처 이름이 글에 있는지
  if (!F.거래처명 && clients.length) {
    const t = nk(full);
    const hit = clients.map((c) => (typeof c === "string" ? c : c.거래처명)).filter((n) => n && nk(n).length >= 2 && t.includes(nk(n))).sort((a, b) => nk(b).length - nk(a).length)[0];
    if (hit) set("거래처명", hit, "mid", -1);
  }

  // 기사님께 전달할 안내(입고 프로세스 등) → 전달사항
  if (noticeLines.length) F.전달사항 = { value: noticeLines.map((x) => x.replace(/^->\s*/, "→ ").replace(/\s+/g, " ")).join("\n"), conf: "high", line: -1 };

  // ── 등록된 하차지거래처와 맞추기 ──
  const issues = [];
  const matched = {};
  for (const P of ["상차지", "하차지"]) {
    const name = F[`${P}명`]?.value || "";
    const addr = F[`${P}주소`]?.value || "";
    const S = sec[P === "상차지" ? "pickup" : "drop"];
    const other = P === "하차지" ? (matched.상차지?.업체명 || F.상차지명?.value) : null;
    // ① 이름이 똑같은 등록 업체
    let place = name ? matchPlaceByName(name, places) : null;
    let how = place ? "등록 업체" : "";
    if (!place) {
      // ② 같은 주소로 등록된 업체 / ③ 이름이 비슷한 등록 업체(지역명·"물류센터" 같은 꼬리말 빼고 비교)
      const byAddr = addr ? matchPlaceByAddr(addr, places) : null;
      const byName = name ? matchPlaceBySimilarName(name, places, other) : null;
      const byText = !name && S.lines.length ? findPlaceInText(S.lines.map((x) => x.text).join(" "), places, other) : null;
      if (byAddr && (!name || namesSimilar(name, byAddr.업체명))) { place = byAddr; how = name ? "주소·이름이 같은 등록 업체" : "주소로 찾은 등록 업체"; }
      else if (byName && (!addr || !byName.주소 || sameAddr(addr, byName.주소))) { place = byName; how = "이름이 비슷한 등록 업체"; }
      else if (byText && (!addr || !byText.주소 || sameAddr(addr, byText.주소))) { place = byText; how = "등록 업체"; }
      else if (byAddr) {
        // 주소는 같은데 이름이 전혀 다름 → 자동으로 바꾸지 않고 제안만
        if (F[`${P}명`]) F[`${P}명`].suggest = byAddr;
        issues.push({ field: `${P}명`, level: "info", msg: `같은 주소로 등록된 '${byAddr.업체명}'이(가) 있습니다 — 같은 곳이면 [등록 업체로 바꾸기]를 누르세요` });
      } else if (byName && addr && byName.주소 && !sameAddr(addr, byName.주소)) {
        if (F[`${P}명`]) F[`${P}명`].suggest = byName;
        issues.push({ field: `${P}명`, level: "info", msg: `이름이 비슷한 '${byName.업체명}'이(가) 등록돼 있지만 주소가 다릅니다 — 같은 곳인지 확인하세요` });
      }
    }
    if (place) {
      matched[P] = place;
      const scanned = name && nk(name) !== nk(place.업체명) ? name : "";
      F[`${P}명`] = { value: place.업체명, conf: "high", line: F[`${P}명`]?.line ?? F[`${P}주소`]?.line ?? -1, via: how, scanned };
      if (place.주소 && (!addr || !sameAddr(addr, place.주소))) F[`${P}주소`] = { value: place.주소, conf: "mid", line: F[`${P}주소`]?.line ?? -1, via: addr ? "등록 업체 주소(스캔 주소와 다름)" : "등록 업체 주소", scanned: addr };
      if (!F[`${P}담당자`] && place.담당자) F[`${P}담당자`] = { value: place.담당자, conf: "mid", line: -1, via: "등록 업체 담당자" };
      if (!F[`${P}담당자번호`] && place.담당자번호) F[`${P}담당자번호`] = { value: place.담당자번호, conf: "mid", line: -1, via: "등록 업체 연락처" };
    }
    const finalName = F[`${P}명`]?.value;
    const finalAddr = F[`${P}주소`]?.value;
    if (!finalName && !finalAddr) issues.push({ field: `${P}명`, level: "error", msg: `${P}를 찾지 못했습니다` });
    else if (!finalName) issues.push({ field: `${P}명`, level: "warn", msg: `${P}명을 인식할 수 없습니다 — 주소만 있습니다` });
    if (finalName && !finalAddr) issues.push({ field: `${P}주소`, level: "warn", msg: `${P} 주소가 없습니다${place ? "" : " — 등록되지 않은 업체"}` });
    if (finalAddr) {
      const q = addressQuality(finalAddr);
      if (q === "partial") issues.push({ field: `${P}주소`, level: "warn", msg: `${P} 주소에 번지(건물번호)가 없습니다` });
      if (q === "weak") issues.push({ field: `${P}주소`, level: "error", msg: `${P} 주소를 인식할 수 없습니다 — 형식이 주소가 아닙니다` });
    }
    if (sec[P === "상차지" ? "pickup" : "drop"].inferred) issues.push({ field: `${P}명`, level: "info", msg: `라벨이 없어 주소 순서로 ${P}를 추정했습니다` });
  }
  if (!F.차량톤수 && !F.차량종류) issues.push({ field: "차량톤수", level: "warn", msg: "차량(톤수·차종)을 찾지 못했습니다" });
  else if (!F.차량톤수) issues.push({ field: "차량톤수", level: "warn", msg: "톤수를 찾지 못했습니다" });
  if (!F.화물내용) issues.push({ field: "화물내용", level: "warn", msg: "화물내용을 찾지 못했습니다" });
  if (F.상차시간 && /오전 ([1-6])시/.test(F.상차시간.value) && !/오전|새벽|아침|AM|am/.test(full)) issues.push({ field: "상차시간", level: "info", msg: "오전/오후 표기가 없어 시간을 확인해 주세요" });
  if (F.상차일 && F.하차일 && F.하차일.value < F.상차일.value) issues.push({ field: "하차일", level: "error", msg: "하차일이 상차일보다 빠릅니다" });

  // 쓰이지 않은 줄 = 인식 못한 줄
  const usedLines = new Set(Object.values(F).map((f) => f.line).filter((x) => x >= 0));
  Object.keys(roles).forEach((k) => usedLines.add(Number(k)));
  const unknown = [];
  rawLines.forEach((rl, i) => {
    const c = cleanLine(rl);
    if (!c) return;
    if (!usedLines.has(i)) {
      // 공통 항목(차량·화물 등)으로 쓰인 줄인지 다시 확인
      if (findVehicle(c) || findCargo(c)) { roles[i] = roles[i] || (findVehicle(c) ? "차량" : "화물"); return; }
      if (findDate(c, today) && c.length <= 20) { roles[i] = roles[i] || "날짜"; return; }
      if (findTime(c) && c.length <= 20) { roles[i] = roles[i] || "시간"; return; }
      if (findFare(c, false)) { roles[i] = roles[i] || "운임"; return; }
      if (roles[i] === "기타") return;
      roles[i] = "미인식";
      unknown.push(c);
    }
  });

  const fields = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, v]));
  const recognized = Object.keys(fields).filter((k) => !["화물단위", "메모추가", "차량원문"].includes(k)).length;
  return { fields, issues, unknown, roles, matched, recognized };
}
