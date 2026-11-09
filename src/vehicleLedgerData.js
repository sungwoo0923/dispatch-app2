// ======================= src/vehicleLedgerData.js =======================
// ⭐ 2026-11-02 차량관리대장 — 데이터·도우미(번호판 정규화, 엑셀 헤더 매핑, 증빙 파일 저장, 인쇄 HTML)
//  저장 구조
//   vehicleLedger/{회사__번호판키}  = { companyName, 차량번호, plateKey, 회사, 용도, 톤수, 차대번호, 보험사, 차주명,
//                                       유류카드번호, 유류카드사, 하이패스, GPS, 덮개, 박스, 박스메모, 메모,
//                                       repairs[], structures[], driverHist[], logs[], createdAt, updatedAt, updatedBy }
//   vehicleLedgerFiles/{파일id_조각번호} = { companyName, vehicleId, fileId, idx, total, name, type, data } — 증빙(사진·PDF)
//     Storage 규칙이 kp-planner/ 경로만 열려 있어 Firestore에 압축 base64로 나눠(조각당 ~900KB) 저장한다.
import { doc, getDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { toYmd, arr } from "../functions/fleetCareCore.mjs";

export const VL_COL = "vehicleLedger";
export const VL_FILES = "vehicleLedgerFiles";

export const PURPOSE_PRESETS = ["암롤", "윙바디", "카고", "탑", "냉동", "냉장", "덤프", "탱크로리", "트랙터", "기타"];
// ⭐ 2026-11-02 기본 정보 선택 목록(목록에 없으면 [직접입력]) — 국내 화물차 실무에서 많이 쓰는 값
export const TON_OPTS = ["1톤", "1.2톤", "1.4톤", "2.5톤", "3.5톤", "4.5톤", "5톤", "5톤 축", "8톤", "9.5톤", "11톤", "11.5톤", "14톤", "15톤", "18톤", "22톤", "25톤", "트랙터"];
export const INSURER_OPTS = [
  { group: "손해보험사" }, "DB손해보험", "현대해상", "삼성화재", "KB손해보험", "메리츠화재", "한화손해보험", "롯데손해보험", "흥국화재", "MG손해보험", "하나손해보험", "AXA손해보험", "캐롯손해보험",
  { group: "공제" }, "화물공제조합", "전세버스공제",
];
export const FUEL_CARD_OPTS = [
  { group: "화물차 유가보조금 카드사" }, "KB국민카드", "신한카드", "우리카드", "하나카드", "삼성카드", "현대카드", "롯데카드", "NH농협카드", "BC카드", "IBK기업은행",
  { group: "정유사 카드" }, "SK에너지", "GS칼텍스", "S-OIL", "HD현대오일뱅크",
];
export const HIPASS_OPTS = ["있음", "없음", "화물 하이패스(감면)", "일반 하이패스"];
export const GPS_OPTS = ["장착", "미장착", "운행기록계(DTG) 겸용", "회사 지급 단말", "기사 개인 단말"];
export const COVER_OPTS = ["있음", "없음", "자바라", "천막", "슬라이딩 덮개", "하드탑"];
export const BOX_OPTS = ["있음", "없음", "윙박스", "탑(내장)박스", "냉장박스", "냉동박스", "암롤박스", "카고(적재함)"];
// 차량종류 — 회사 공용 목록(src/vehicleTypes.js)에 대장에서 쓰던 형태(암롤·덤프 등)를 더한다
export const LEDGER_TYPE_EXTRA = ["암롤", "덤프", "탱크로리", "트랙터", "냉동", "냉장", "탑", "기타"];
export const REPAIR_KINDS = ["정기점검", "엔진오일", "타이어", "브레이크", "전기·배선", "판금·도색", "사고수리", "적재함", "소모품", "기타"];
export const EQUIP = [
  { key: "유류카드번호", label: "유류" },
  { key: "하이패스", label: "하이패스" },
  { key: "GPS", label: "GPS" },
  { key: "덮개", label: "덮개" },
  { key: "박스", label: "박스" },
];

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const won = (n) => (Number(n) || 0).toLocaleString("ko-KR");
export const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };

// 번호판 — 공백·기호 제거. 지역명(경기·서울 등)이 붙고 안 붙고의 차이는 core로 맞춘다
export const normPlate = (s) => String(s ?? "").replace(/[^0-9가-힣A-Za-z]/g, "");
export const plateCore = (s) => normPlate(s).replace(/^[가-힣]+(?=\d)/, "");
export const vehicleDocId = (co, plate) => `${String(co).replace(/\//g, "_")}__${normPlate(plate)}`;

// 장비 칸 — 값이 비었거나 X·없음이면 "없음"
export const hasEquip = (v) => { const s = String(v ?? "").trim(); return !!s && !/^(x|×|없음|무|-|n|no|미장착|미부착)$/i.test(s); };

export function fmtPhone(p) {
  let s = String(p ?? "").replace(/[^\d]/g, "");
  if (s.length === 10 && s.startsWith("1")) s = "0" + s; // 엑셀이 앞자리 0을 지운 경우
  if (s.length === 11) return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`;
  if (s.length === 10) return s.startsWith("02") ? `${s.slice(0, 2)}-${s.slice(2, 6)}-${s.slice(6)}` : `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`;
  if (s.length === 9 && s.startsWith("02")) return `${s.slice(0, 2)}-${s.slice(2, 5)}-${s.slice(5)}`;
  return String(p ?? "").trim();
}

// 날짜 — 엑셀 날짜(Date·일련번호)·"24.3.1"·"2024년 3월 1일" → "2024-03-01"
export function normDate(v) {
  if (v == null || v === "") return "";
  // 엑셀 날짜는 자정 몇 초 전(전날 23:59:xx)으로 읽히는 경우가 있어 반나절 더해 날짜만 취한다
  if (v instanceof Date && !isNaN(v)) { const t = new Date(v.getTime() + 12 * 3600e3); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; }
  if (typeof v === "number" && v > 20000 && v < 80000) return normDate(new Date(Math.round((v - 25569) * 86400000) + new Date().getTimezoneOffset() * 60000));
  const s = String(v).trim();
  const m = s.match(/(\d{2,4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) { let y = Number(m[1]); if (y < 100) y += 2000; return `${y}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`; }
  return s;
}

// ⭐ 2026-11-09 실제 데이터 모양 방어 — 엑셀 가져오기·예전 버전·직접 수정으로 들어온 이상한 값(날짜가 Timestamp/숫자,
//  글자 칸이 숫자, 이력 배열이 객체/없음, 차량번호 앞뒤 공백)을 화면이 쓰기 전에 한 번 정리한다(정렬·검색·그리기에서 오류 방지)
const LEDGER_TEXT_KEYS = ["차량번호", "plateKey", "용도", "차량종류", "톤수", "제조사", "모델", "연식", "회사", "차대번호", "보험사", "차주명", "유류카드사", "유류카드번호", "하이패스", "하이패스카드사", "하이패스카드번호", "하이패스유효기간", "하이패스구분", "하이패스단말기", "하이패스명의", "GPS", "덮개", "박스", "박스메모", "메모"];
const LEDGER_DATE_KEYS = ["보험만기", "검사만기", "할부만기"];
const ROW_DATE_KEYS = ["일자", "시작", "종료", "날짜"];
const ROW_TEXT_KEYS = ["구분", "내용", "업체", "이름", "연락처", "비고", "세부내용", "메모"];
export const safeText = (x) => (x == null ? "" : typeof x === "string" ? x : typeof x === "number" || typeof x === "boolean" ? String(x) : toYmd(x));
const safeDate = (x) => (typeof x === "string" ? toYmd(x) || x.trim() : toYmd(x));
export function sanitizeLedger(v) {
  if (!v || typeof v !== "object") return { repairs: [], structures: [], driverHist: [], logs: [] };
  const o = { ...v };
  LEDGER_TEXT_KEYS.forEach((k) => { if (k in o) o[k] = safeText(o[k]); });
  if (typeof o.차량번호 === "string") o.차량번호 = o.차량번호.trim();
  LEDGER_DATE_KEYS.forEach((k) => { if (k in o) o[k] = safeDate(o[k]); });
  ["repairs", "structures", "driverHist", "logs"].forEach((k) => {
    o[k] = arr(o[k]).map((r) => {
      const x = { ...r };
      ROW_DATE_KEYS.forEach((f) => { if (f in x) x[f] = safeDate(x[f]); });
      ROW_TEXT_KEYS.forEach((f) => { if (f in x) x[f] = safeText(x[f]); });
      if ("files" in x) x.files = arr(x.files);
      return x;
    });
  });
  if (o.tires != null && (typeof o.tires !== "object" || Array.isArray(o.tires))) delete o.tires;
  if (o.photo != null && typeof o.photo !== "object") delete o.photo;
  return o;
}

// 현재 기사 — 탑승 이력에서 종료일이 없는 가장 최근 줄
export function currentDriver(v) {
  const h = arr(v?.driverHist).filter((r) => !r.종료).sort((a, b) => String(b.시작 || "").localeCompare(String(a.시작 || "")));
  return h[0] || null;
}

// ── 엑셀(차량 전체 현황) 헤더 매핑 ──
export const IMPORT_FIELDS = {
  차량번호: ["차량번호", "차번", "번호판", "차량no"],
  회사: ["소속회사", "차주회사", "회사명", "회사", "소속"],
  기사연락처: ["기사연락처", "기사전화", "기사번호", "연락처", "전화번호", "핸드폰", "휴대폰"],
  기사변경일: ["기사변경일", "변경일자", "변경일"],
  현재기사: ["현재기사", "기사명", "운전자", "기사"],
  차대번호: ["차대번호", "차대"],
  보험사: ["보험사", "보험"],
  유류카드사: ["카드사", "유류카드사"],
  유류카드번호: ["유류카드번호", "유류카드", "주유카드", "유류"],
  하이패스: ["하이패스"],
  GPS: ["gps"],
  덮개: ["덮개"],
  박스메모: ["박스사용처", "박스제작사", "박스메모"],
  박스: ["박스"],
  차주명: ["차주명", "차주", "소유자"],
  용도: ["차량용도", "차량형태", "용도", "형태", "차종", "차량종류"],
  톤수: ["톤수", "톤급", "톤"],
  메모: ["비고", "메모"],
};
const hnorm = (h) => String(h ?? "").replace(/\s|\n|\(.*?\)/g, "").toLowerCase();
export function mapHeaders(headerRow) {
  const used = new Set();
  const map = {}; // colIndex -> field
  const hs = headerRow.map(hnorm);
  // 1) 정확히 같은 이름 → 2) 포함(긴 별칭부터)
  for (const pass of [0, 1]) {
    hs.forEach((h, i) => {
      if (!h || map[i]) return;
      let best = null; let bestLen = 0;
      for (const [f, al] of Object.entries(IMPORT_FIELDS)) {
        if (used.has(f)) continue;
        for (const a of al) {
          const ok = pass === 0 ? h === a : h.includes(a);
          if (ok && a.length > bestLen) { best = f; bestLen = a.length; }
        }
      }
      if (best) { map[i] = best; used.add(best); }
    });
  }
  return map;
}
// 시트 → [{필드: 값}] (헤더 줄은 "차량번호"가 들어 있는 처음 15줄 중 한 줄)
export function parseSheetRows(aoa) {
  const hi = aoa.slice(0, 15).findIndex((r) => (r || []).some((c) => hnorm(c).includes("차량번호") || hnorm(c) === "차번"));
  if (hi < 0) return { error: "'차량번호' 머리글이 있는 줄을 찾지 못했습니다", rows: [], map: {} };
  const map = mapHeaders(aoa[hi] || []);
  const rows = [];
  for (const r of aoa.slice(hi + 1)) {
    const o = {};
    Object.entries(map).forEach(([i, f]) => { const v = r?.[i]; if (v !== "" && v != null) o[f] = v; });
    if (!normPlate(o.차량번호)) continue;
    o.차량번호 = String(o.차량번호).trim();
    if (o.기사변경일) o.기사변경일 = normDate(o.기사변경일);
    if (o.기사연락처) o.기사연락처 = fmtPhone(o.기사연락처);
    ["회사", "현재기사", "차대번호", "보험사", "유류카드사", "유류카드번호", "하이패스", "GPS", "덮개", "박스", "박스메모", "차주명", "용도", "톤수", "메모"].forEach((k) => {
      if (o[k] != null) o[k] = o[k] instanceof Date ? normDate(o[k]) : String(o[k]).trim();
    });
    rows.push(o);
  }
  return { rows, map, headerRow: aoa[hi] };
}

// ── 증빙 파일(사진·PDF) ──
const CHUNK = 900000;
function readAsDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}
function compressImage(file, max = 1600, q = 0.78) {
  return readAsDataURL(file).then((src) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", q));
    };
    img.onerror = () => rej(new Error("이미지를 읽지 못했습니다"));
    img.src = src;
  }));
}
export async function saveEvidence(co, vehicleId, file) {
  const isImg = /^image\//.test(file.type);
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isImg && !isPdf) throw new Error("사진 또는 PDF만 올릴 수 있습니다");
  if (isPdf && file.size > 4.5 * 1024 * 1024) throw new Error("PDF는 4.5MB까지 올릴 수 있습니다");
  const data = isImg ? await compressImage(file) : await readAsDataURL(file);
  const fileId = uid();
  const total = Math.ceil(data.length / CHUNK);
  const b = writeBatch(db);
  for (let i = 0; i < total; i++) {
    b.set(doc(db, VL_FILES, `${fileId}_${i}`), { companyName: co, vehicleId, fileId, idx: i, total, name: file.name || "증빙", type: isImg ? "image/jpeg" : "application/pdf", data: data.slice(i * CHUNK, (i + 1) * CHUNK), createdAt: Date.now() });
  }
  await b.commit();
  return { id: fileId, name: file.name || (isImg ? "사진.jpg" : "문서.pdf"), type: isImg ? "image" : "pdf", n: total, size: data.length };
}
const fileCache = new Map();
export async function loadEvidence(meta) {
  if (fileCache.has(meta.id)) return fileCache.get(meta.id);
  const snaps = await Promise.all(Array.from({ length: meta.n || 1 }, (_, i) => getDoc(doc(db, VL_FILES, `${meta.id}_${i}`))));
  const data = snaps.map((s) => (s.exists() ? s.data().data || "" : "")).join("");
  if (data) fileCache.set(meta.id, data);
  return data;
}
export async function deleteEvidence(metas = []) {
  if (!metas.length) return;
  const b = writeBatch(db);
  metas.forEach((m) => { for (let i = 0; i < (m.n || 1); i++) b.delete(doc(db, VL_FILES, `${m.id}_${i}`)); fileCache.delete(m.id); });
  await b.commit();
}
export function dataUrlToBlobUrl(dataUrl) {
  const [h, b64] = dataUrl.split(",");
  const mime = (h.match(/data:(.*?);/) || [])[1] || "application/octet-stream";
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([u8], { type: mime }));
}

// ── 합계 ──
export const repairTotal = (r) => num(r.공가) + (r.부가세 === "" || r.부가세 == null ? Math.round(num(r.공가) * 0.1) : num(r.부가세));
export const repairVat = (r) => (r.부가세 === "" || r.부가세 == null ? Math.round(num(r.공가) * 0.1) : num(r.부가세));

// ── 인쇄(A4) HTML ──
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export function ledgerPrintHtml(v, co) {
  const cur = currentDriver(v);
  const kv = [
    ["차량번호", v.차량번호], ["차량종류", v.용도 || v.차량종류], ["톤수", v.톤수], ["회사", v.회사],
    ["차대번호", v.차대번호], ["보험사", v.보험사], ["차주명", v.차주명], ["현재 기사", cur ? `${cur.이름} ${cur.연락처 || ""}` : ""],
    ["기사 변경일", cur?.시작], ["유류카드", [v.유류카드사, v.유류카드번호].filter(Boolean).join(" ")], ["하이패스", v.하이패스], ["GPS", v.GPS],
    ["하이패스 카드", [v.하이패스카드사, v.하이패스카드번호, v.하이패스유효기간 && `유효 ${v.하이패스유효기간}`].filter(Boolean).join(" ")], ["하이패스 결제·단말", [v.하이패스구분, v.하이패스단말기, v.하이패스명의].filter(Boolean).join(" · ")],
    ["덮개", v.덮개], ["박스", [v.박스, v.박스메모].filter(Boolean).join(" · ")], ["메모", v.메모], ["", ""],
  ];
  const tbl = (title, heads, rows, foot) => `<h2>${esc(title)}</h2><table><thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
    rows.length ? rows.map((r) => `<tr>${r.map((c, i) => `<td class="${typeof c === "number" ? "n" : ""}${i === 0 ? " d" : ""}">${typeof c === "number" ? won(c) : esc(c)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${heads.length}" class="e">기록 없음</td></tr>`
  }</tbody>${foot || ""}</table>`;
  const rep = [...(v.repairs || [])].sort((a, b) => String(a.일자).localeCompare(String(b.일자)));
  const sumG = rep.reduce((s, r) => s + num(r.공가), 0); const sumV = rep.reduce((s, r) => s + repairVat(r), 0);
  const st = [...(v.structures || [])].sort((a, b) => String(a.일자).localeCompare(String(b.일자)));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(v.차량번호)} 차량 관리대장</title><style>
@page{size:A4;margin:11mm}*{box-sizing:border-box}body{font-family:'Pretendard','Malgun Gothic',sans-serif;color:#0B1428;font-size:10.5pt;margin:0}
.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0F1A30;padding-bottom:6px;margin-bottom:10px}
.hd h1{margin:0;font-size:19pt}.hd .s{font-size:9.5pt;color:#5B6B85}
h2{font-size:11.5pt;margin:14px 0 5px;padding-left:7px;border-left:4px solid #2D4C82}
table{width:100%;border-collapse:collapse;page-break-inside:auto}tr{page-break-inside:avoid}
th{background:#1B2B4B;color:#fff;font-weight:700;padding:5px 6px;border:1px solid #1B2B4B;font-size:9.5pt;white-space:nowrap}
td{border:1px solid #C9D3E3;padding:4px 6px;font-size:9.5pt;vertical-align:top}td.n{text-align:right;white-space:nowrap}td.d{white-space:nowrap}td.e{text-align:center;color:#9AA9C3}
table.kv td.k{background:#EEF2F9;font-weight:700;width:13%;white-space:nowrap}table.kv td{width:20%}
tfoot td{background:#F4F6FA;font-weight:800}
</style></head><body>
<div class="hd"><div><div class="s">${esc(co)} · 차량 관리대장</div><h1>${esc(v.차량번호)}</h1></div><div class="s">출력일 ${today()}</div></div>
<h2>기본 정보</h2><table class="kv"><tbody>${[0, 4, 8, 12].map((i) => `<tr>${kv.slice(i, i + 4).map(([k, val]) => `<td class="k">${esc(k)}</td><td>${esc(val)}</td>`).join("")}</tr>`).join("")}</tbody></table>
${tbl("수리·정비 이력", ["일자", "구분", "정비내용", "업체", "업체번호", "공가금액", "부가세", "합금액", "비고"], rep.map((r) => [r.일자, r.구분, r.내용, r.업체, r.업체번호, num(r.공가), repairVat(r), num(r.공가) + repairVat(r), [r.비고, r.files?.length ? `증빙 ${r.files.length}` : ""].filter(Boolean).join(" · ")]),
    rep.length ? `<tfoot><tr><td colspan="5">합계 ${rep.length}건</td><td class="n">${won(sumG)}</td><td class="n">${won(sumV)}</td><td class="n">${won(sumG + sumV)}</td><td></td></tr></tfoot>` : "")}
${tbl("구조변경 이력", ["일자", "내용", "업체", "금액", "비고"], st.map((r) => [r.일자, r.내용, r.업체, num(r.금액), r.비고]))}
${tbl("기사 탑승 이력", ["시작", "종료", "기사", "연락처", "비고"], [...(v.driverHist || [])].sort((a, b) => String(a.시작).localeCompare(String(b.시작))).map((r) => [r.시작, r.종료 || "현재", r.이름, r.연락처, r.비고]))}
${tbl("기본정보 변경·기타 이력", ["일자", "내용", "변경/이력", "날짜", "세부내용", "비고"], [...(v.logs || [])].sort((a, b) => String(a.일자).localeCompare(String(b.일자))).map((r) => [r.일자, r.내용, r.구분, r.날짜, r.세부내용, r.비고]))}
</body></html>`;
}
export function printHtml(html) {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(f);
  const d = f.contentWindow.document; d.open(); d.write(html); d.close();
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } finally { setTimeout(() => f.remove(), 1500); } }, 350);
}
