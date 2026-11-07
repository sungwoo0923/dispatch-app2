// ======================= src/aiAssistantCore.js =======================
// 🤖 2026-11-07 배차 AI 비서 — 화면과 떨어진 순수 계산(테스트: scripts/aiAssistantCore.test.mjs)
//  · 서버 제안(칸: 새 값)을 배차 등록 칸 모양으로 맞추고, 지금 화면의 값과 비교해 저장할 patch · 되돌리기 값을 만든다
//  · 말로 한 새 오더 / 오더 스캔 결과 → addDispatch에 넘길 오더 한 건
//  · 카카오톡 대화 내보내기(.txt) 글 정리 · 여러 오더 나누기
//  · AI 서버를 못 쓸 때(키 없음 · 오류 · 횟수 초과) 화면에 있는 데이터로 답하는 예전 규칙 답변 + 간단한 수정 알아듣기
//  · 짧은 마크다운(굵게 · 목록 · 표) 나누기, 대화 기록 저장
import { normTime, normTon, normVehicle, normAmount, normPay, normPhone, normDate, kstToday, ymdOf } from "./orderScanAi.js";

export const MONEY = ["청구운임", "기사운임", "수수료"];
export const BOOL = ["혼적", "독차", "긴급"];
export const FIELD_LABEL = {
  상차지명: "상차지", 하차지명: "하차지", 상차지주소: "상차지 주소", 하차지주소: "하차지 주소", 이름: "기사", 전화번호: "기사 전화",
  상차지담당자번호: "상차지 연락처", 하차지담당자번호: "하차지 연락처", 상차시간기준: "상차 이전/이후", 하차시간기준: "하차 이전/이후",
};
export const labelOf = (k) => FIELD_LABEL[k] || k;
const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? Math.round(n) : 0; };
export const won = (v) => `${num(v).toLocaleString("ko-KR")}원`;
export function fmtVal(k, v) {
  if (v === true) return "예";
  if (v === false) return "아니오";
  if (v === null || v === undefined || v === "") return "(비어 있음)";
  if (MONEY.includes(k)) return won(v);
  return String(v);
}
export const todayYmd = (now = new Date()) => ymdOf(kstToday(now));
const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ── 제안 값 → 배차 등록 칸 모양 ──
export function normValue(k, v) {
  if (MONEY.includes(k)) return typeof v === "number" ? Math.round(v) : normAmount(v) || num(v);
  if (BOOL.includes(k)) return v === true || /^(true|예|네|y|1)$/i.test(String(v ?? ""));
  const s = typeof v === "string" ? v.trim() : v;
  if (s === "" || s == null) return "";
  if (k === "상차시간" || k === "하차시간") { if (/^(즉시|당일|익일)$/.test(s)) return s; return normTime(s).value || s; }
  if (k === "차량톤수") return normTon(s) || s;
  if (k === "차량종류") return normVehicle(s) || s;
  if (k === "지급방식") return normPay(s) || s;
  if (/담당자번호$/.test(k) || k === "전화번호") return normPhone(s) || s;
  if (k === "상차일" || k === "하차일") return normDate(s) || s;
  return s;
}
const same = (k, a, b) => (MONEY.includes(k) ? num(a) === num(b) : BOOL.includes(k) ? !!a === !!b : String(a ?? "").trim() === String(b ?? "").trim());

// row: 지금 화면의 오더 · changes: [{ field, after }] → { patch, undo, diff }
export function buildUpdate(row, changes) {
  const patch = {}; const undo = {}; const diff = [];
  (changes || []).forEach(({ field, after }) => {
    if (!field) return;
    const v = normValue(field, after);
    const cur = row?.[field];
    if (same(field, cur, v)) return;
    patch[field] = MONEY.includes(field) ? String(v) : v;
    undo[field] = cur ?? "";
    diff.push({ field, before: cur ?? "", after: patch[field] });
  });
  // 운임이 바뀌면 수수료도 다시(등록 화면과 같은 계산) — 수수료를 직접 고친 경우는 그대로
  if (("청구운임" in patch || "기사운임" in patch) && !("수수료" in patch)) {
    const fee = num(patch.청구운임 ?? row?.청구운임) - num(patch.기사운임 ?? row?.기사운임);
    if (String(fee) !== String(row?.수수료 ?? "")) { patch.수수료 = String(fee); undo.수수료 = row?.수수료 ?? ""; }
  }
  // 기사를 빼면 상태도 되돌릴 수 있게
  if ("차량번호" in patch) ["배차상태", "이름", "전화번호", "기사확인상태"].forEach((k) => { if (!(k in undo)) undo[k] = row?.[k] ?? (k === "기사확인상태" ? null : ""); });
  if (!("하차일" in patch) && "상차일" in patch && row?.하차일 && row.하차일 < patch.상차일) { patch.하차일 = patch.상차일; undo.하차일 = row.하차일; diff.push({ field: "하차일", before: row.하차일, after: patch.상차일, auto: true }); }
  return { patch, undo, diff };
}

// 화물내용 → 화물타입(파레트·박스·통)
export function cargoTypeOf(text) {
  const s = String(text || "");
  if (/파레트|파렛트|팔레트|파레|빠레트|pl\b|plt/i.test(s)) return "파레트";
  if (/박스|box|상자/i.test(s)) return "박스";
  if (/통\b|드럼/.test(s)) return "통";
  return "";
}

// 등록 카드 값 → addDispatch에 넘길 오더(다중등록과 같은 기본 칸 — 목록 화면이 배열 칸을 가정한다)
export function buildCreateRecord(f, { today = todayYmd() } = {}) {
  const v = {};
  Object.entries(f || {}).forEach(([k, x]) => { v[k] = normValue(k, x); });
  const pick = v.상차일 || today;
  let drop = v.하차일 || pick;
  if (drop < pick) drop = pick;
  const sale = num(v.청구운임); const cost = num(v.기사운임);
  const car = String(v.차량번호 || "").trim();
  return {
    거래처명: v.거래처명 || "", 청구사업자: v.청구사업자 || "",
    상차지명: v.상차지명 || "", 상차지주소: v.상차지주소 || "", 상차지담당자: v.상차지담당자 || "", 상차지담당자번호: v.상차지담당자번호 || "",
    하차지명: v.하차지명 || "", 하차지주소: v.하차지주소 || "", 하차지담당자: v.하차지담당자 || "", 하차지담당자번호: v.하차지담당자번호 || "",
    경유상차목록: [], 경유하차목록: [], 경유지_상차: [], 경유지_하차: [], 근무일자목록: [], 복수근무일: false,
    상차일: pick, 상차시간: v.상차시간 || "", 상차시간기준: v.상차시간기준 || null,
    하차일: drop, 하차시간: v.하차시간 || "", 하차시간기준: v.하차시간기준 || null,
    상차방법: v.상차방법 || "", 하차방법: v.하차방법 || "",
    화물내용: v.화물내용 || "", 화물타입: v.화물타입 || cargoTypeOf(v.화물내용), ...(v.화물수량 ? { 화물수량: String(v.화물수량) } : {}),
    톤수타입: "톤", 차량톤수: v.차량톤수 || "", 차량종류: v.차량종류 || "",
    차량번호: car, 이름: car ? v.이름 || "" : "", 전화번호: car ? v.전화번호 || "" : "",
    청구운임: sale ? String(sale) : "", 기사운임: cost ? String(cost) : "", 수수료: String(sale - cost),
    지급방식: v.지급방식 || "", 배차방식: v.배차방식 || "", 운행유형: v.운행유형 || "편도",
    메모: v.메모 || "", 메모중요도: "NORMAL", 전달사항: v.전달사항 || "", 전달사항고정: false,
    혼적: !!v.혼적, 독차: !!v.독차, 긴급: !!v.긴급, 운임보정: null,
    배차상태: car ? "배차완료" : "배차중", 등록일: today, 등록기기: "AI 비서",
  };
}
// 등록 카드에서 고칠 칸(순서대로)
export const CREATE_FIELDS = ["거래처명", "상차일", "상차시간", "상차지명", "상차지주소", "상차지담당자번호", "하차일", "하차시간", "하차지명", "하차지주소", "하차지담당자번호", "화물내용", "차량톤수", "차량종류", "청구운임", "기사운임", "지급방식", "차량번호", "메모"];
export function missingOf(f) {
  const m = [];
  if (!String(f?.상차지명 || f?.상차지주소 || "").trim()) m.push("상차지");
  if (!String(f?.하차지명 || f?.하차지주소 || "").trim()) m.push("하차지");
  if (!String(f?.거래처명 || "").trim()) m.push("거래처명");
  return m;
}

// ── 오더 스캔 결과(인식기 칸 값) → 등록 카드 값 (OrderScanModal의 [적용]과 같은 규칙) ──
export function scanValsToFields(vals, result) {
  const v = vals || {};
  const f = {};
  ["거래처명", "상차지명", "상차지주소", "상차지담당자", "상차지담당자번호", "상차시간", "상차시간기준", "상차일", "상차방법",
    "하차지명", "하차지주소", "하차지담당자", "하차지담당자번호", "하차시간", "하차시간기준", "하차일", "하차방법", "차량톤수", "차량종류", "운행유형"].forEach((k) => { if (v[k] !== undefined && v[k] !== "") f[k] = v[k]; });
  const dF = result?.fields?.하차일;
  const rel = dF ? (dF.rel ?? null) : (v.하차일 ? null : 0);
  if (v.상차일 && rel != null && (!dF || v.하차일 === dF.value)) f.하차일 = addDays(v.상차일, rel);
  if (v.청구운임) f.청구운임 = String(v.청구운임).replace(/[^\d]/g, "");
  if (v.기사운임) f.기사운임 = String(v.기사운임).replace(/[^\d]/g, "");
  if (["계산서", "착불", "선불", "계좌이체"].includes(v.지급방식)) f.지급방식 = v.지급방식;
  if (v.화물내용) { f.화물내용 = v.화물내용; const u = v.화물단위 || cargoTypeOf(v.화물내용); if (u) f.화물타입 = u; }
  if (v.화물수량 && /^\d+$/.test(String(v.화물수량))) f.화물수량 = String(v.화물수량);
  if (v.혼적 === true) f.혼적 = true;
  if (v.긴급 === true) f.긴급 = true;
  if (v.전달사항) f.전달사항 = v.전달사항;
  const memo = [v.메모추가, v.중량 && v.중량 !== v.차량톤수 ? `중량 ${v.중량}` : ""].filter(Boolean).join(" / ");
  if (memo) f.메모 = memo;
  return f;
}

// ── 붙여넣은 글: 오더처럼 보이는지 · 카카오톡 내보내기 정리 · 여러 오더 나누기 ──
export function looksLikeOrderText(text) {
  const t = String(text || "");
  if (t.length < 8 || t.length > 20000) return false;
  const hasLabels = /(상차|하차|출발|도착|납품|배송지|픽업)/.test(t);
  const addrCount = (t.match(/(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|[가-힣]+(?:시|구|군))\s*[가-힣]+(?:구|군|시|동|로|길|읍|면)/g) || []).length;
  return (hasLabels && (addrCount >= 1 || /\d+\s*(?:톤|파레|파렛|p)/i.test(t))) || addrCount >= 2;
}
// 카카오톡 PC·모바일 내보내기 줄 머리
const KAKAO_PC = /^\[([^\]]{1,30})\]\s*\[(오전|오후)\s*(\d{1,2}):(\d{2})\]\s?(.*)$/; // [홍길동] [오후 2:13] 내용
const KAKAO_MOBILE = /^(\d{4})[.년]\s*(\d{1,2})[.월]\s*(\d{1,2})[.일]?\s*(?:[가-힣]요일\s*)?(오전|오후)?\s*(\d{1,2}):(\d{2}),\s*([^:]{1,30})\s:\s?(.*)$/; // 2026. 11. 7. 오후 2:13, 홍길동 : 내용
const KAKAO_SKIP = /^(-{3,}.*-{3,}|.*님과 카카오톡 대화|저장한 날짜\s*:|.*님이 들어왔습니다|.*님이 나갔습니다|\d{4}년 \d{1,2}월 \d{1,2}일 [가-힣]요일$|사진$|이모티콘$|삭제된 메시지입니다\.?)$/;
export function parseKakao(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const msgs = []; let cur = null; let hits = 0;
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (KAKAO_SKIP.test(l.trim())) { cur = null; continue; }
    let m = l.match(KAKAO_PC);
    if (m) { hits += 1; cur = { sender: m[1].trim(), time: `${m[2]} ${m[3]}:${m[4]}`, text: m[5] }; msgs.push(cur); continue; }
    m = l.match(KAKAO_MOBILE);
    if (m) { hits += 1; cur = { sender: m[7].trim(), time: `${m[4] || ""} ${m[5]}:${m[6]}`.trim(), date: `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`, text: m[8] }; msgs.push(cur); continue; }
    if (cur) cur.text += `\n${l}`; else msgs.push(cur = { sender: "", time: "", text: l });
  }
  return { isKakao: hits >= 1, messages: msgs.map((x) => ({ ...x, text: x.text.replace(/^"|"$/g, "").trim() })).filter((x) => x.text) };
}
// 붙여넣은 글 → 오더 덩어리 목록(카톡 메시지마다 오더면 메시지 단위, 아니면 글 전체를 splitOrders로)
export function splitPasted(text, splitOrders) {
  const k = parseKakao(text);
  if (k.isKakao) {
    const orderMsgs = k.messages.filter((m) => looksLikeOrderText(m.text));
    if (orderMsgs.length >= 2) return orderMsgs.flatMap((m) => splitOrders(m.text));
    const joined = k.messages.map((m) => m.text).join("\n");
    return splitOrders(joined);
  }
  return splitOrders(String(text || "").trim());
}

// ── 말 알아듣기(서버 없이도 되는 것) ──
export function intentOf(text) {
  const t = String(text || "").replace(/\s+/g, "");
  if (/^(오더|배차|주문)?(수정|변경|고치)(해야|할|하고|하려|좀|해줘|해|하자|요)*[가-힣]*$/.test(t) && t.length <= 14) return "pick_edit";
  if (/^(오더|배차)(수정|변경|고치)/.test(t) && t.length <= 14) return "pick_edit";
  if (/^(오더|배차)?(삭제|취소)(해야|할|하고|하려|좀|해줘|해|요)*[가-힣]*$/.test(t) && t.length <= 12) return "pick_delete";
  if (/^(기사)?배정(해야|할|좀|해줘|해|요)*[가-힣]*$/.test(t) && t.length <= 12) return "pick_assign";
  if (/^(오더)?(등록|접수)(해야|할|하려|좀|해줘|해|요)*[가-힣]*$/.test(t) && t.length <= 12) return "register_help";
  return null;
}

// 오더 고르기 목록(오늘·내일·어제·이번 주 · 미배차 · 거래처)
const dateOfRow = (r) => String(r?.상차일 || r?.상차일자 || "").slice(0, 10);
const cancelled = (r) => r?.배차상태 === "배차취소" || ["취소", "배차취소", "오더취소", "취소됨"].includes(r?.상태);
export const isUnassigned = (r) => !String(r?.차량번호 || "").trim();
export function pickerRows(rows, filter = {}, today = todayYmd()) {
  const range = filter.range || "today";
  const [from, to] = range === "tomorrow" ? [addDays(today, 1), addDays(today, 1)] : range === "yesterday" ? [addDays(today, -1), addDays(today, -1)] : range === "week" ? [addDays(today, -3), addDays(today, 3)] : [today, today];
  const q = String(filter.client || "").replace(/\s+/g, "").toLowerCase();
  return (rows || []).filter((r) => {
    const d = dateOfRow(r);
    if (!d || d < from || d > to || cancelled(r) || r?.source === "transport_transmit") return false;
    if (filter.unassigned && !isUnassigned(r)) return false;
    if (q && ![r.거래처명, r.상차지명, r.하차지명, r.차량번호, r.이름, r.화물내용].some((x) => String(x || "").replace(/\s+/g, "").toLowerCase().includes(q))) return false;
    return true;
  }).sort((a, b) => `${dateOfRow(a)}${a.상차시간 || ""}`.localeCompare(`${dateOfRow(b)}${b.상차시간 || ""}`));
}

// 서버 없이 고르기 — "3파레트를 2파레트로" · "운임 25만" · "상차시간 오후 3시"
const LOCAL_FIELD = [
  [/청구\s*운임|^운임|청구금액|운송료|요금/, "청구운임"], [/기사\s*운임|기사비|기사금액|지급운임/, "기사운임"], [/상차\s*시간|상차시각/, "상차시간"], [/하차\s*시간|하차시각/, "하차시간"],
  [/상차\s*일|상차날짜/, "상차일"], [/하차\s*일|하차날짜/, "하차일"], [/상차지\s*주소|상차\s*주소|출발지\s*주소/, "상차지주소"], [/하차지\s*주소|하차\s*주소|도착지\s*주소/, "하차지주소"],
  [/상차지|출발지/, "상차지명"], [/하차지|도착지/, "하차지명"], [/거래처|화주/, "거래처명"], [/화물|품목/, "화물내용"], [/톤수/, "차량톤수"], [/차종|차량\s*종류/, "차량종류"],
  [/지급\s*방식|결제/, "지급방식"], [/메모|비고/, "메모"], [/전달\s*사항/, "전달사항"],
];
export function localEditProposal(text, row) {
  if (!row) return null;
  const t = String(text || "").trim();
  // A를 B로
  let m = t.match(/^(.+?)\s*(?:을|를)\s*(.+?)\s*(?:으로|로)\s*(?:바꿔|변경|수정|고쳐|해)?[가-힣\s]*$/);
  if (m) {
    const [a, b] = [m[1].trim(), m[2].trim()];
    const named = LOCAL_FIELD.find(([re]) => re.test(a));
    if (named) return [{ field: named[1], after: b }];
    const keys = ["화물내용", "상차지명", "하차지명", "거래처명", "상차지주소", "하차지주소", "차량톤수", "차량종류", "상차시간", "하차시간", "메모", "지급방식"];
    const norm = (s) => String(s || "").replace(/파렛트|팔레트|파레트|파레/g, "파레트").replace(/\s+/g, "");
    for (const k of keys) {
      const cur = String(row[k] || "");
      if (!cur) continue;
      if (cur.includes(a)) return [{ field: k, after: cur.replace(a, b) }];
      const na = norm(a);
      if (na && norm(cur).includes(na)) {
        // 파렛트/파레트처럼 표기가 다르면 숫자만 바꾼다
        const na1 = a.match(/\d+(?:\.\d+)?/); const nb1 = b.match(/\d+(?:\.\d+)?/);
        if (na1 && nb1 && cur.includes(na1[0])) return [{ field: k, after: cur.replace(na1[0], nb1[0]) }];
        return [{ field: k, after: b }];
      }
    }
    return null;
  }
  // 칸 + 값
  const named = LOCAL_FIELD.find(([re]) => re.test(t));
  if (named) {
    const v = t.replace(named[0], "").replace(/^\s*(?:은|는|을|를|:)?\s*/, "").replace(/\s*(?:으로|로)?\s*(?:바꿔|변경|수정|고쳐)(?:줘|주세요|요)?\s*$/, "").trim();
    if (v) return [{ field: named[1], after: v }];
  }
  return null;
}

// 서버 없이 답하기 — 화면에 있는 데이터로(예전 무료 버전 답변)
export function localAnswer(text, { dispatches = [], clients = [], today = todayYmd() } = {}) {
  const t = String(text || "").replace(/\s+/g, "");
  const ym = today.slice(0, 7);
  const live = dispatches.filter((d) => !cancelled(d));
  const day = live.filter((d) => dateOfRow(d) === today);
  const month = live.filter((d) => dateOfRow(d).startsWith(ym));
  const sum = (l, k) => l.reduce((s, d) => s + num(d[k]), 0);
  const line = (d) => `· ${dateOfRow(d)} ${d.상차시간 || ""} ${d.거래처명 || "-"} | ${d.상차지명 || "-"} → ${d.하차지명 || "-"}${d.차량번호 ? ` | ${d.차량번호}` : " | 미배차"}`;
  if (/미배차/.test(t)) {
    const un = day.filter(isUnassigned);
    return un.length ? `**오늘 미배차 ${un.length}건**\n${un.slice(0, 15).map(line).join("\n")}` : "오늘 미배차 오더가 없어요.";
  }
  if (/(오늘|금일).*(배차|오더|현황|몇)|^오늘$/.test(t)) {
    if (!day.length) return `오늘(${today}) 등록된 오더가 없어요.`;
    return `**오늘 배차 현황** ${today}\n· 오더 ${day.length}건 (미배차 ${day.filter(isUnassigned).length}건)\n· 청구운임 ${won(sum(day, "청구운임"))}\n· 기사운임 ${won(sum(day, "기사운임"))}\n· 수익 ${won(sum(day, "청구운임") - sum(day, "기사운임"))}`;
  }
  if (/거래처.*(순위|랭킹|top|많은)/i.test(t)) {
    const m = {}; month.forEach((d) => { const n = d.거래처명 || "미지정"; m[n] = m[n] || { c: 0, s: 0 }; m[n].c += 1; m[n].s += num(d.청구운임); });
    const top = Object.entries(m).sort((a, b) => b[1].s - a[1].s).slice(0, 5);
    return top.length ? `**이번 달 거래처 매출 순위**\n${top.map(([n, v], i) => `${i + 1}. ${n} ${v.c}건 · ${won(v.s)}`).join("\n")}` : "이번 달 오더가 없어요.";
  }
  if (/차량별|차종별/.test(t)) {
    const m = {}; month.forEach((d) => { const n = d.차량종류 || "미지정"; m[n] = (m[n] || 0) + 1; });
    return `**이번 달 차종별 운행**\n${Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => `· ${n} ${c}건`).join("\n") || "데이터 없음"}`;
  }
  if (/(이번달|이달|월).*(매출|수익|운임)|^매출/.test(t)) {
    const s = sum(month, "청구운임"); const c = sum(month, "기사운임");
    return `**${ym} 매출**\n· 운행 ${month.length}건\n· 청구운임 ${won(s)}\n· 기사운임 ${won(c)}\n· 수익 ${won(s - c)}${s ? ` (${(((s - c) / s) * 100).toFixed(1)}%)` : ""}`;
  }
  if (/최근/.test(t)) {
    const l = [...live].sort((a, b) => dateOfRow(b).localeCompare(dateOfRow(a))).slice(0, 5);
    return l.length ? `**최근 오더 5건**\n${l.map(line).join("\n")}` : "등록된 오더가 없어요.";
  }
  const cm = String(text || "").match(/거래처\s*[:：]?\s*(.+)$/);
  if (cm && !/순위/.test(cm[1])) {
    const q = cm[1].trim().toLowerCase();
    const r = clients.filter((c) => String(c.거래처명 || "").toLowerCase().includes(q)).slice(0, 5);
    return r.length ? `**거래처 "${cm[1].trim()}"**\n${r.map((c) => `· ${c.거래처명} | ${c.담당자 || "-"} ${c.연락처 || ""} | ${c.주소 || "-"}`).join("\n")}` : `"${cm[1].trim()}" 거래처를 찾지 못했어요.`;
  }
  if (/요약|현황/.test(t)) return `**전체 요약**\n· 오늘 ${day.length}건 · ${won(sum(day, "청구운임"))}\n· 이번 달 ${month.length}건 · ${won(sum(month, "청구운임"))}\n· 등록 거래처 ${clients.length}곳`;
  if (/부가세|vat/i.test(t)) {
    const n = normAmount(String(text).replace(/부가세|vat|포함|별도|계산|해줘|얼마/gi, ""));
    if (n) return `**부가세 계산** (${won(n)} 기준)\n· 공급가로 보면: 부가세 ${won(n * 0.1)} · 합계 ${won(n * 1.1)}\n· 합계로 보면: 공급가 ${won(Math.round(n / 1.1))} · 부가세 ${won(n - Math.round(n / 1.1))}`;
  }
  return null;
}

// ── 짧은 마크다운 → 덩어리 ── [{ t: "p"|"li"|"oli"|"h"|"table", ... }]
export function mdBlocks(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i += 1; }
      i -= 1;
      const cells = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r)).map((r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      if (cells.length) out.push({ t: "table", head: cells[0], rows: cells.slice(1) });
      continue;
    }
    let m = l.match(/^\s*#{1,4}\s+(.*)$/); if (m) { out.push({ t: "h", v: m[1] }); continue; }
    m = l.match(/^\s*[-*·•]\s+(.*)$/); if (m) { out.push({ t: "li", v: m[1] }); continue; }
    m = l.match(/^\s*(\d{1,2})[.)]\s+(.*)$/); if (m) { out.push({ t: "oli", n: m[1], v: m[2] }); continue; }
    if (!l.trim()) { out.push({ t: "gap" }); continue; }
    out.push({ t: "p", v: l });
  }
  return out;
}
export function mdInline(s) {
  const out = []; const re = /\*\*(.+?)\*\*|`([^`]+)`/g; let last = 0; let m;
  const str = String(s || "");
  while ((m = re.exec(str))) { if (m.index > last) out.push({ t: "text", v: str.slice(last, m.index) }); out.push(m[1] != null ? { t: "b", v: m[1] } : { t: "code", v: m[2] }); last = re.lastIndex; }
  if (last < str.length) out.push({ t: "text", v: str.slice(last) });
  return out;
}

// ── 대화 기록 저장(사람 · 화면별, 최근 N개) ──
export const CHAT_KEEP = 60;
const HISTORY_MAX = 350 * 1024;
export function serializeChat({ messages = [], history = [] }) {
  const ui = messages.slice(-CHAT_KEEP).map((m) => {
    const x = { ...m };
    if (x.kind === "picker") x.kind = "note"; // 고르기 목록은 다시 열 때 새로(오래된 목록이 남지 않게)
    delete x.busy;
    return x;
  });
  let h = history;
  try { if (JSON.stringify(h).length > HISTORY_MAX) h = []; } catch { h = []; }
  return JSON.stringify({ v: 1, ui, history: h, at: Date.now() });
}
export function deserializeChat(raw) {
  try {
    const j = JSON.parse(raw || "null");
    if (!j || j.v !== 1 || !Array.isArray(j.ui)) return null;
    if (Date.now() - (j.at || 0) > 7 * 864e5) return null; // 일주일 지난 대화는 새로
    return { messages: j.ui, history: Array.isArray(j.history) ? j.history : [] };
  } catch { return null; }
}
