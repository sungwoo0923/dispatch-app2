// 도급업체가 자체 양식으로 보내주는 "출근기록부" 엑셀을 출근현황 > 월별
// 스케줄표에 매칭해 업로드하는 기능. xlsx는 무겁기 때문에(수백KB) 실제로
// 파일을 고를 때만 지연 로드한다.
async function loadXlsx() {
  return import("xlsx");
}

const NAME_HEADER_HINTS = ["성명", "이름"];
const PHONE_HEADER_HINTS = ["직종", "직급", "연락처", "전화", "휴대폰", "핸드폰"];
const LEAVE_TOTAL_HEADER_HINTS = ["연차"];
// 관리자가 근로자등록에서 이미 관리하는 값이라 업로드 시트에 있어도 무시한다.
const IGNORED_HEADER_HINTS = ["입사일", "d-day", "d day", "디데이", "퇴사일", "이동수단"];

// 셀 하나(하루치 근태 표기)를 그리드 상태 키(GRID_STATUS_OPTIONS의 key)로
// 해석한다 — 업체마다 표기가 제각각이라 자주 쓰이는 축약/기호를 폭넓게 받는다.
const MARK_MAP = {
  "출": "출근", "출근": "출근", "o": "출근", "O": "출근", "○": "출근", "v": "출근", "V": "출근", "√": "출근", "1": "출근",
  "특": "특근", "특근": "특근",
  "휴": "휴무", "휴무": "휴무",
  "연": "연차", "연차": "연차",
  "오전": "오전반차", "오전반차": "오전반차", "am": "오전반차",
  "오후": "오후반차", "오후반차": "오후반차", "pm": "오후반차",
  "병": "병가", "병가": "병가",
  "결": "결근", "결근": "결근",
};

function normalizeMark(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return MARK_MAP[s] || MARK_MAP[s.toLowerCase()] || null;
}

function normalizePhoneDigits(value) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function isDayHeader(headerText) {
  const s = String(headerText || "").trim();
  const m = s.match(/^(\d{1,2})\s*일?$/);
  if (!m) return null;
  const day = Number(m[1]);
  return day >= 1 && day <= 31 ? day : null;
}

function matchesHint(headerText, hints) {
  const s = String(headerText || "").trim().toLowerCase();
  return hints.some((h) => s.includes(h.toLowerCase()));
}

// 헤더 행을 찾아 성명/전화/연차/일자 컬럼 인덱스를 식별한다. 업체 양식마다
// 헤더가 몇 번째 줄인지 다를 수 있어, 위에서부터 "성명" 헤더가 나오는 첫
// 행을 헤더 행으로 간주한다.
function detectColumns(rows) {
  for (let r = 0; r < Math.min(rows.length, 10); r += 1) {
    const row = rows[r];
    const nameIdx = row.findIndex((c) => matchesHint(c, NAME_HEADER_HINTS));
    if (nameIdx === -1) continue;
    const phoneIdx = row.findIndex((c) => matchesHint(c, PHONE_HEADER_HINTS));
    const leaveIdx = row.findIndex((c) => matchesHint(c, LEAVE_TOTAL_HEADER_HINTS));
    const dayCols = [];
    row.forEach((cell, idx) => {
      if (idx === leaveIdx) return;
      if (matchesHint(cell, IGNORED_HEADER_HINTS)) return;
      const day = isDayHeader(cell);
      if (day != null) dayCols.push({ idx, day });
    });
    return { headerRow: r, nameIdx, phoneIdx, leaveIdx, dayCols };
  }
  return null;
}

// 엑셀 파일(File) → { matched: [{name, phone, uid, dayMarks:{day:statusKey}, leaveTotal}], unmatched: [{name, phone, reason}] }
// employees: 현재 회사의 근로자 배열([{id, name, phone, ...}]) — 이름+전화 둘 다 일치해야 매칭으로 인정한다.
export async function parseAttendanceRecordFile(file, employees) {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const cols = detectColumns(rows);
  if (!cols) {
    return { error: "성명 컬럼을 찾을 수 없습니다. 양식을 확인해주세요.", matched: [], unmatched: [] };
  }
  const matched = [];
  const unmatched = [];
  for (let r = cols.headerRow + 1; r < rows.length; r += 1) {
    const row = rows[r];
    const name = String(row[cols.nameIdx] || "").trim();
    if (!name) continue;
    const phoneRaw = cols.phoneIdx > -1 ? row[cols.phoneIdx] : "";
    const phone = normalizePhoneDigits(phoneRaw);
    const emp = employees.find(
      (e) => (e.name || "").trim() === name && normalizePhoneDigits(e.phone) === phone && phone.length >= 8
    );
    if (!emp) {
      unmatched.push({ name, phone: String(phoneRaw || "").trim() });
      continue;
    }
    const dayMarks = {};
    for (const { idx, day } of cols.dayCols) {
      const status = normalizeMark(row[idx]);
      if (status) dayMarks[day] = status;
    }
    const leaveTotal = cols.leaveIdx > -1 ? Number(row[cols.leaveIdx]) || 0 : 0;
    matched.push({ uid: emp.id, name: emp.name, dayMarks, leaveTotal });
  }
  return { matched, unmatched };
}
