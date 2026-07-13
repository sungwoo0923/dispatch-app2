import * as XLSX from "xlsx";

// EmployeeList.jsx의 "대용량업로드" 기능이 쓰는 엑셀 양식/파싱 로직을 한
// 곳에 모아둔다. 근로자등록 폼(EMPTY_REGISTER_FORM)의 핵심 필드만 다루고,
// 시간템플릿/수당템플릿/계약서/사직서 등 SidePanel 등록폼의 나머지 항목은
// 엑셀 일괄등록 대상이 아니다(등록 후 목록에서 더블클릭 수정으로 채운다).
//
// 사업자/센터/소속업체는 Firestore 문서ID가 사람이 알아보기 어려우므로
// "이름" 컬럼으로 받고, 업로드 시점에 이미 화면에 구독되어 있는
// businessEntities/workSites/vendors 배열에서 정확히 일치하는 이름을 찾아
// id로 되돌린다(대소문자/공백까지 정확히 일치해야 함 — 대량 등록이라는
// 특성상 매칭 실패 시 등록을 막기보다는 해당 필드만 비워두고 화면에서
// "불일치"로 표시해 관리자가 눈으로 확인/보정할 수 있게 한다).
export const BULK_UPLOAD_HEADERS = [
  "이름",
  "연락처",
  "사업자명",
  "센터명",
  "소속업체명",
  "부서",
  "직급",
  "입사일",
  "고용구분",
  "근무구분",
  "국적",
  "국가",
  "성별",
  "은행",
  "계좌번호",
];

const SAMPLE_ROW = {
  이름: "홍길동",
  연락처: "010-1234-5678",
  사업자명: "",
  센터명: "",
  소속업체명: "",
  부서: "",
  직급: "",
  입사일: "2026-01-01",
  고용구분: "상용직",
  근무구분: "주간",
  국적: "내국인",
  국가: "대한민국",
  성별: "남",
  은행: "",
  계좌번호: "",
};

export function downloadBulkUploadTemplate(filename = "근로자등록_양식.xlsx") {
  const sheet = XLSX.utils.json_to_sheet([SAMPLE_ROW], { header: BULK_UPLOAD_HEADERS });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "근로자등록");
  XLSX.writeFile(workbook, filename);
}

function toDateKeyLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 입사일 셀은 엑셀에서 문자열("2026-01-01", "2026.1.1")로 오기도 하고, 셀
// 서식이 "날짜"면 Date 객체나 1900 기준 serial 숫자로 오기도 한다 —
// 어떤 형태로 들어와도 registerForm이 기대하는 yyyy-mm-dd 문자열로 맞춘다.
function normalizeDateCell(value) {
  if (value === undefined || value === null || value === "") return "";
  if (value instanceof Date) return toDateKeyLocal(value);
  if (typeof value === "number" && XLSX.SSF?.parse_date_code) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const str = String(value).trim();
  const m = str.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return str;
}

// 워크북 첫 시트를 읽어 행 배열로 반환한다. 각 행은 원본 텍스트 값과
// 사업자/센터/소속업체의 매칭된 id, 그리고 검증 결과(valid/unmatched)를
// 함께 담는다 — 미리보기 테이블과 실제 등록 루프가 이 결과를 그대로 쓴다.
export async function parseBulkUploadFile(file, { businessEntities = [], workSites = [], vendors = [] } = {}) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!sheet) return [];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  return rawRows.map((raw, index) => {
    const get = (header) => {
      const v = raw[header];
      return v === undefined || v === null ? "" : String(v).trim();
    };

    const name = get("이름");
    const phone = get("연락처");
    const businessEntityName = get("사업자명");
    const workSiteName = get("센터명");
    const vendorName = get("소속업체명");

    const entity = businessEntityName ? businessEntities.find((b) => b.name === businessEntityName) : null;
    const site = workSiteName ? workSites.find((s) => s.name === workSiteName) : null;
    const vendor = vendorName ? vendors.find((v) => v.name === vendorName) : null;

    const unmatched = [];
    if (businessEntityName && !entity) unmatched.push("사업자명");
    if (workSiteName && !site) unmatched.push("센터명");
    if (vendorName && !vendor) unmatched.push("소속업체명");

    const missingRequired = !name || !phone;

    return {
      rowIndex: index,
      name,
      phone,
      businessEntityName,
      businessEntityId: entity?.id || "",
      workSiteName,
      workSiteId: site?.id || "",
      vendorName,
      vendorId: vendor?.id || "",
      team: get("부서"),
      position: get("직급"),
      hireDate: normalizeDateCell(raw["입사일"]),
      employmentType: get("고용구분"),
      shiftType: get("근무구분"),
      nationality: get("국적"),
      country: get("국가"),
      gender: get("성별"),
      bankName: get("은행"),
      bankAccount: get("계좌번호"),
      missingRequired,
      unmatched,
      valid: !missingRequired,
    };
  });
}
