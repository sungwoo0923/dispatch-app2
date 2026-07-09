// 센터별리포트 > 리포트양식명 [보기]에서 사용하는 인쇄용 문서 템플릿.
// 실제 근로계약서 전자서명(계약관리)과는 별개로, 관리자가 문서 양식을
// 등록/확인하기 위한 미리보기 겸 인쇄용 견본이다.

export const CONTRACT_FORMAT_OPTIONS = [
  "표준근로계약서",
  "연소근로자(18세 미만인 자) 표준근로계약서",
  "건설일용근로자 표준근로계약서",
  "단시간근로자 표준근로계약서",
];

const WAGE_STANDARD =
  "- 상여금 : 있음(   )             원, 없음(   )\n" +
  "- 기타급여(제수당 등) : 있음(  ),  없음(  )\n" +
  "  ㆍ             원,             원\n" +
  "  ㆍ             원,             원\n" +
  "- 임금지급일 : 매월(매주 또는 매일)     일(휴일의 경우는 전일 지급)\n" +
  "- 지급방법 : 근로자에게 직접지급(  ), 근로자 명의 예금통장에 입금(  )";

const WAGE_DAILY =
  "- 상여금 : 있음(   )             원, 없음 : (  ),\n" +
  "- 기타 제수당(시간외.야간.휴일근로수당 등):        원(내역별 기재)\n" +
  "  .시간외 근로수당:        원(월      시간분)\n" +
  "  .야 간 근로수당:        원(월      시간분)\n" +
  "  .휴 일 근로수당:        원(월      시간분)\n" +
  "- 임금지급일 : 매월(매주 또는 매일)     일(휴일의 경우는 전일 지급)\n" +
  "- 지급방법 : 근로자에게 직접지급(  ), 근로자 명의 예금통장에 입금(  )";

const WAGE_PARTTIME =
  "- 상여금 : 있음(   )             원, 없음 : (  )\n" +
  "- 기타급여(제수당 등) : 있음:        원(내역별 기재), 없음(  ),\n" +
  "- 초과근로에 대한 가산임금률:        %\n" +
  "  ※ 단시간근로자와 사용자 사이에 근로하기로 정한 시간을 초과하여 근로하면 법정 근로시간 내라도 통상임금의 100분의 50%이상의 가산임금 지급('14.9.19. 시행)\n" +
  "- 임금지급일 : 매월(매주 또는 매일)     일(휴일의 경우는 전일 지급)\n" +
  "- 지급방법 : 근로자에게 직접지급(  ), 근로자 명의 예금통장에 입금(  )";

const CONTRACT_FORMAT_DEFAULTS = {
  표준근로계약서: { wage: WAGE_STANDARD, familyConsent: false },
  "연소근로자(18세 미만인 자) 표준근로계약서": {
    wage: WAGE_STANDARD,
    familyConsent: true,
    familyConsentText: "- 가족관계기록사항에 관한 증명서 제출 여부 : \n- 친권자 또는 후견인의 동의서 구비 여부 : ",
  },
  "건설일용근로자 표준근로계약서": { wage: WAGE_DAILY, familyConsent: false },
  "단시간근로자 표준근로계약서": { wage: WAGE_PARTTIME, familyConsent: false },
};

export function getContractFormatDefaults(reportFormat) {
  return CONTRACT_FORMAT_DEFAULTS[reportFormat] || CONTRACT_FORMAT_DEFAULTS["표준근로계약서"];
}

export function isKnownContractWage(wage) {
  return [WAGE_STANDARD, WAGE_DAILY, WAGE_PARTTIME].includes(wage);
}

export const DEFAULT_EXTRA = {
  계약서: {
    workContent: "",
    wage: WAGE_STANDARD,
    insurance: "□ 고용보험 □ 산재보험 □ 국민연금 □ 건강보험",
    etc: "",
    familyConsent: "",
  },
  안전교육일지: {
    eduMinutes: "",
    cautions:
      "1. RT작업자 안전화 및 안전모등 안전보호구 착용 확인\n" +
      "2. 컨베이어 벨트 구동전후 주변 작업자 유무 확인\n" +
      "3. 컨베이어 벨트 주변 작업시 횡단/걸터앉기/기대는행위 금지\n" +
      "4. 하차 작업시 물건을 던지는 행위를 금지하고 상단상품이 낙하하지 않는지 주의하며 작업실시\n" +
      "5. 상하차 작업시 반복적인 작업으로 인한 근골격계 질환발생 예방을 위한 휴식 및 스트레칭 실시\n" +
      "6. 안전모, 안전화, 식별조끼 등 규정에 맞는 보호구 착용\n" +
      "7. 현장내 위험요소 발생시 관리감독자에게 즉시보고 후 조치\n" +
      "8. 작업자 이동중 전도 및 넘어짐등 위험에 대하여 주변 정리 정돈 후 작업실시",
    eduCategory: "안전교육 및 체조",
    special: "1. 코로나바이러스 확산 방지 대비 철저\n2. 손세정제, 마스크 착용",
    eduContent: "1. 안전모등 보호구 착용관련 교육\n2. 컨베이어 주변 작업시 불안전행동 관련 교육",
    mainWork: "* 택배 하차작업 및 지역별 분류작업(오전)\n* 택배 상차작업(오후)",
    approvers: [
      { name: "", position: "" },
      { name: "", position: "" },
      { name: "", position: "" },
      { name: "", position: "" },
    ],
  },
};

function esc(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function nl2br(v) {
  return esc(v).replace(/\n/g, "<br/>");
}

// 결재라인 인쇄용 위젯 — 컬럼 헤더는 "결재자" 같은 일반 명칭이 아니라 실제
// 결재 역할(담당/대표 등)을 표기하고, 서명이 완료된 단계에는 승인/반려 도장을
// 겹쳐 찍는다. src/components/ApprovalBox.jsx의 화면용 위젯과 동일한 규칙.
function approvalBoxHtml(steps) {
  const cells = steps
    .map(
      (s) => `
    <td style="width:74px;border:1px solid #ccc;padding:0;vertical-align:top;">
      <div style="background:#f4f4f4;border-bottom:1px solid #ccc;padding:3px 0;font-size:10px;font-weight:700;">${esc(s.role)}</div>
      <div style="position:relative;height:52px;display:flex;align-items:center;justify-content:center;">
        ${s.signatureDataUrl ? `<img src="${esc(s.signatureDataUrl)}" style="max-height:32px;max-width:88%;" />` : "&nbsp;"}
        ${
          s.result
            ? `<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-12deg);width:34px;height:34px;border:2px solid ${
                s.result === "approved" ? "#dc2626" : "#94a3b8"
              };border-radius:50%;color:${s.result === "approved" ? "#dc2626" : "#94a3b8"};font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;">${
                s.result === "approved" ? "승인" : "반려"
              }</span>`
            : ""
        }
      </div>
      <div style="border-top:1px solid #eee;padding:2px 0;font-size:9px;color:#666;">${esc(s.name || "")}</div>
    </td>`
    )
    .join("");
  return `<table style="border-collapse:collapse;display:inline-table;margin:0 auto;"><tr><td style="width:40px;border:1px solid #ccc;background:#f4f4f4;font-size:10px;font-weight:700;text-align:center;vertical-align:middle;">결재</td>${cells}</tr></table>`;
}

const PAGE_STYLE = `
  * { box-sizing: border-box; }
  body { font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; color: #111; margin: 0; padding: 24px 28px; font-size: 12.5px; line-height: 1.6; }
  h1 { text-align: center; font-size: 19px; letter-spacing: 6px; margin: 0 0 6px; }
  .sub { text-align: center; font-size: 11px; color: #555; margin-bottom: 18px; }
  .row { display: flex; gap: 16px; margin-bottom: 4px; }
  .row > div { flex: 1; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; }
  td, th { border: 1px solid #333; padding: 6px 8px; vertical-align: top; }
  .no-border td, .no-border th { border: none; padding: 2px 0; }
  .section-title { font-weight: 700; margin: 10px 0 2px; }
  .blank-line { border-bottom: 1px solid #999; display: inline-block; min-width: 90px; }
  .sign-block { margin-top: 28px; }
  .sign-block .row > div { padding: 3px 0; }
  @media print { body { padding: 12mm 14mm; } }
`;

function wrapDoc(title, bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(title)}</title><style>${PAGE_STYLE}</style></head><body>${bodyHtml}</body></html>`;
}

export function buildContractHtml({ siteName, workContent, wage, insurance, etc, familyConsent, reportFormat, stampUrl }) {
  const variantLabel = reportFormat && reportFormat !== "표준근로계약서" ? reportFormat.replace("표준근로계약서", "").trim() : "";
  const body = `
    <h1>표 준 근 로 계 약 서</h1>
    ${variantLabel ? `<p class="sub">(${esc(variantLabel)})</p>` : ""}
    <p>(이하 "사업주"라 함)과(와)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(이하 "근로자"라 함)은 다음과 같이 근로계약을 체결한다.</p>
    <p>1. 근로계약기간 : <span class="blank-line">&nbsp;</span> 부터 <span class="blank-line">&nbsp;</span> 까지</p>
    <p style="color:#666;font-size:11px;">※ 근로계약기간을 정하지 않는 경우에는 "근로개시일"만 기재</p>
    <p>2. 근 무 장 소 : ${esc(siteName || "-")}</p>
    <p>3. 업 무 의 내 용 :${workContent ? " " + nl2br(workContent) : ""}</p>
    <p>4. 소정근로시간 : (휴게시간 : 없음)</p>
    <p>5. 근무일 / 휴일 : 매주&nbsp; &nbsp;일 근무, 주휴일 매주&nbsp; &nbsp;요일</p>
    <p>6. 임&nbsp; 금</p>
    <p>&nbsp;- 시급 : <span class="blank-line">&nbsp;</span> 원</p>
    <p>${nl2br(wage || "")}</p>
    <p>7. 연차유급휴가</p>
    <p>&nbsp;-연차유급휴가는 근로기준법에서 정하는 바에 따라 부여함</p>
    <p>8. 사회보험 적용여부(해당란에 체크)</p>
    <p>${nl2br(insurance || "")}</p>
    <p>9. 근로계약서 교부</p>
    <p>&nbsp;- 사업주는 근로계약을 체결함과 동시에 본 계약서를 사본하여 근로자의 교부요구와 관계없이 근로자에게 교부함<br/>&nbsp;&nbsp;(근로기준법 제17조 이행)</p>
    <p>10. 근로계약, 취업규칙 등의 성실한 이행의무</p>
    <p>&nbsp;-사업주와 근로자는 각자가 근로계약, 취업규칙, 단체협약을 지키고 성실하게 이행하여야 함</p>
    <p>11. 기타</p>
    <p>&nbsp;- 이 계약에 정함이 없는 사항은 근로기준법령에 의함${etc ? "<br/>" + nl2br(etc) : ""}</p>
    ${
      familyConsent
        ? `<p class="section-title">가족관계증명서 및 동의서</p><p>${nl2br(familyConsent)}</p>`
        : ""
    }
    <div class="sign-block">
      <p style="text-align:center;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;일</p>
      <table class="no-border">
        <tr><td style="width:90px;">(사업주)&nbsp;사 업 체 명 :</td><td><span class="blank-line" style="min-width:260px;">&nbsp;</span>&nbsp;&nbsp;(전화 :&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</td></tr>
        <tr><td>주&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;소 :</td><td><span class="blank-line" style="min-width:400px;">&nbsp;</span></td></tr>
        <tr><td>대&nbsp;&nbsp;표&nbsp;&nbsp;자 :</td><td><span class="blank-line" style="min-width:260px;">&nbsp;</span>&nbsp;&nbsp;(서명)${
          stampUrl ? `<img src="${esc(stampUrl)}" style="height:44px;vertical-align:middle;margin-left:8px;" />` : ""
        }</td></tr>
        <tr><td>(근로자)&nbsp;주&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;소 :</td><td><span class="blank-line" style="min-width:400px;">&nbsp;</span></td></tr>
        <tr><td>주 민 번 호 :</td><td><span class="blank-line" style="min-width:260px;">&nbsp;</span></td></tr>
        <tr><td>연&nbsp;&nbsp;락&nbsp;&nbsp;처 :</td><td><span class="blank-line" style="min-width:260px;">&nbsp;</span></td></tr>
        <tr><td>성&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;명 :</td><td><span class="blank-line" style="min-width:260px;">&nbsp;</span>&nbsp;&nbsp;(서명)</td></tr>
      </table>
    </div>`;
  return wrapDoc(reportFormat || "표준근로계약서", body);
}

export function buildResignationHtml({
  siteName,
  employeeName,
  position,
  hireDate,
  resignDate,
  reason,
  employeeSignatureDataUrl,
  managerSignatureDataUrl,
  managerName,
  managerResult,
  ceoSignatureDataUrl,
  ceoName,
  ceoResult,
}) {
  const body = `
    <div style="text-align:center;margin-bottom:6px;overflow:visible;">
      ${approvalBoxHtml([
        { role: "신청인", name: employeeName, signatureDataUrl: employeeSignatureDataUrl, result: employeeSignatureDataUrl ? "approved" : null },
        { role: "담당", name: managerName, signatureDataUrl: managerResult === "rejected" ? null : managerSignatureDataUrl, result: managerResult || (managerSignatureDataUrl ? "approved" : null) },
        { role: "대표", name: ceoName, signatureDataUrl: ceoResult === "rejected" ? null : ceoSignatureDataUrl, result: ceoResult || (ceoSignatureDataUrl ? "approved" : null) },
      ])}
    </div>
    <h1>사 직 서 (원)</h1>
    <table>
      <tr><td style="width:110px;">성명</td><td>${esc(employeeName || "-")}</td><td style="width:110px;">직책</td><td>${esc(position || "-")}</td></tr>
      <tr><td>근무지</td><td colspan="3">${esc(siteName || "-")}</td></tr>
      <tr><td>입사일자</td><td>${esc(hireDate || "-")}</td><td>퇴사일자</td><td>${esc(resignDate || "-")}</td></tr>
      <tr><td>퇴사사유</td><td colspan="3">${esc(reason || "-")}</td></tr>
      <tr><td rowspan="2">퇴사 후<br/>연락처</td><td colspan="3">주&nbsp;&nbsp;&nbsp;&nbsp;소</td></tr>
      <tr><td colspan="3">전화번호</td></tr>
    </table>
    <p style="margin-top:16px;">본인은 상기와 같은 내용으로 퇴사하고자 하오니 허락하여 주시기 바랍니다.<br/>아울러 퇴직에 따른 아래 조항을 성실히 준수할 것을 서약합니다.</p>
    <p style="text-align:center;font-weight:700;">- 준 수 사 항 -</p>
    <p>
      1. 본인은 퇴사에 따른 사무 인수인계를 철저히 하여 퇴사 시까지 직무책임과 임무를 완수합니다.<br/>
      2. 재직 시 업무상 지득한 회사의 제반 비밀사항을 타인에게 일체 누설하지 않겠습니다.<br/>
      3. 차용금, 지급공구 및 비품, 기타 회사비품 등 반환물품(금품)은 퇴직일 전일까지 반환하겠습니다.<br/>
      4. 기타 회사와 관련한 제반 사항은 회사규정에 의거 퇴사일 전일까지 처리하겠습니다.<br/>
      5. 만일 본인이 상기 사항을 위반하였을 때에는 이유 여하를 막론하고 서약에 의거 민.형사상의 책임과 손해배상 의무를 지겠습니다.
    </p>
    <p style="text-align:center;margin-top:36px;">신청인 : ${Array.from(employeeName || "-").map(esc).join("&nbsp;")} <span style="position:relative;display:inline-block;min-width:56px;">${
      employeeSignatureDataUrl
        ? `<img src="${esc(employeeSignatureDataUrl)}" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);height:36px;" />`
        : ""
    }(서명)</span></p>`;
  return wrapDoc("사직서", body);
}

export function buildTbmHtml({ siteName, eduMinutes, cautions, eduCategory, special, eduContent, mainWork, approvers }) {
  const filledApprovers = (approvers && approvers.length ? approvers : []).filter((a) => a?.name);
  const approvalLine =
    filledApprovers.length > 0
      ? `<table style="width:${filledApprovers.length * 90}px;">
          <tr>${filledApprovers.map((a) => `<th>${esc(a.position || "결재")}</th>`).join("")}</tr>
          <tr>${filledApprovers.map((a) => `<td style="height:36px;">${esc(a.name)}</td>`).join("")}</tr>
        </table>`
      : `<table style="width:120px;"><tr><td>결재</td></tr><tr><td style="height:36px;">&nbsp;</td></tr></table>`;
  const body = `
    <table class="no-border" style="margin-bottom:6px;">
      <tr><td></td><td style="text-align:right;width:${filledApprovers.length ? filledApprovers.length * 90 + 20 : 140}px;">${approvalLine}</td></tr>
    </table>
    <h1 style="font-size:16px;letter-spacing:2px;">일일 안전교육일지(TBM)</h1>
    <p>현장명: ${esc(siteName || "-")}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;날씨: 맑음/우천/흐림/눈/태풍/황사&nbsp;중</p>
    <p>작성일: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;교육시간(분단위): ${esc(eduMinutes || "")}</p>
    <table>
      <tr><th style="width:120px;">금일 주요작업</th><th>주의사항</th></tr>
      <tr><td>${nl2br(mainWork || "")}</td><td>${nl2br(cautions || "")}</td></tr>
    </table>
    <table>
      <tr><th style="width:100px;">교육구분</th><th style="width:70px;">교육인원</th><th style="width:70px;">교육시간</th><th>교육내용</th></tr>
      <tr><td>${esc(eduCategory || "")}</td><td>1명</td><td>시간</td><td>${nl2br(eduContent || "")}</td></tr>
    </table>
    <p class="section-title">특이사항</p>
    <p>${nl2br(special || "")}</p>
    <table>
      <tr><th style="width:50px;">번호</th><th>성명</th><th>핸드폰</th><th>시간</th><th>서명</th></tr>
      ${[1, 2, 3, 4, 5, 6, 7].map((n) => `<tr><td>${n}</td><td>&nbsp;</td><td>--</td><td>~</td><td>&nbsp;</td></tr>`).join("")}
    </table>`;
  return wrapDoc("일일 안전교육일지(TBM)", body);
}

export function buildGenericHtml({ title, siteName }) {
  const body = `
    <h1 style="font-size:16px;letter-spacing:4px;">${esc(title)}</h1>
    <table class="no-border">
      <tr><td style="width:110px;">센터</td><td>${esc(siteName || "-")}</td></tr>
      <tr><td>성명</td><td></td></tr>
      <tr><td>발급일자</td><td></td></tr>
    </table>
    <p style="margin-top:20px;color:#666;">본 문서는 회사가 등록한 기본 양식입니다. 상세 내용은 관리자 설정에 따라 채워집니다.</p>`;
  return wrapDoc(title, body);
}

export function openReportPreview(docType, formatName, data) {
  let html;
  if (docType === "계약서") html = buildContractHtml({ ...data, reportFormat: formatName });
  else if (docType === "사직서") html = buildResignationHtml(data);
  else if (docType === "안전교육일지") html = buildTbmHtml(data);
  else html = buildGenericHtml({ title: formatName || docType, siteName: data.siteName });

  const win = window.open("", "_blank", "width=680,height=920");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => {
    win.focus();
    win.print();
  }, 300);
}
