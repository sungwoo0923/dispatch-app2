import { formatDate } from "./dateUtils";

export function buildDefaultContract({ employeeName, hireDate, position, siteName, companyName }) {
  return `근 로 계 약 서

${companyName || "회사"}(이하 "갑")과(와) ${employeeName || "근로자"}(이하 "을")은 다음과 같이 근로계약을 체결한다.

1. 근무 개시일: ${hireDate ? formatDate(hireDate) : "-"}
2. 근무 장소: ${siteName || "회사가 지정하는 장소"}
3. 직급/직책: ${position || "-"}
4. 근무시간: 회사 취업규칙 및 스케줄에 따름
5. 임금: 회사 급여규정 및 정산 내역에 따라 매월 지급
6. 4대보험: 관계 법령에 따라 적용
7. 기타 사항은 근로기준법 및 회사 취업규칙에 따른다.

위 계약 내용에 동의하며 서명합니다.`;
}
