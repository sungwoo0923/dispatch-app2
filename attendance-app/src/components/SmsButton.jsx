import { MessageSquare } from "lucide-react";

// sms: 딥링크 문자열을 만드는 부분만 따로 뽑아 다른 화면(예: EmployeeList의
// 가입코드 SMS 발송)에서도 이 컴포넌트와 완전히 동일한 방식으로 문자 앱을
// 열도록 재사용할 수 있게 export한다. 전화번호가 비어있으면 빈 문자열을
// 반환한다.
export function buildSmsHref(phone, message) {
  const digits = String(phone || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  return `sms:${digits}${message ? `?body=${encodeURIComponent(message)}` : ""}`;
}

// 전화번호 옆에 붙는 문자 버튼. sms: 딥링크로 기기의 기본 문자 앱을 열어
// 번호와 내용을 미리 채워준다 (실제 발송/과금은 사용자 기기에서 이뤄지며,
// 이 앱이 대신 문자를 보내는 것은 아니다).
export default function SmsButton({ phone, message, className = "" }) {
  const href = buildSmsHref(phone, message);
  if (!href) return null;

  return (
    <a
      href={href}
      title="문자 보내기"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center justify-center rounded-lg p-1 text-primary hover:bg-primary-light ${className}`}
    >
      <MessageSquare size={14} />
    </a>
  );
}
