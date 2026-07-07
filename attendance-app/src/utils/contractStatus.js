// 갑(회사)/을(근로자) 서명이 각자 별도 필드로 분리되어 있으므로, 화면에 보여줄
// 상태는 두 서명의 존재 여부로 매번 계산한다.
export function contractStatus(contract) {
  if (!contract) return "미발송";
  if (contract.employeeSignatureDataUrl) return "서명완료";
  if (contract.companySignatureDataUrl) return "서명대기";
  return "발송대기";
}

export const CONTRACT_STATUS_TONE = { 미발송: "muted", 발송대기: "muted", 서명대기: "warning", 서명완료: "success" };
