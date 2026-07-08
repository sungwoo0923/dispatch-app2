import { MessageSquare } from "lucide-react";

// 전화번호 옆에 붙는 문자 버튼. sms: 딥링크로 기기의 기본 문자 앱을 열어
// 번호와 내용을 미리 채워준다 (실제 발송/과금은 사용자 기기에서 이뤄지며,
// 이 앱이 대신 문자를 보내는 것은 아니다).
export default function SmsButton({ phone, message, className = "" }) {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const href = `sms:${digits}${message ? `?body=${encodeURIComponent(message)}` : ""}`;

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
