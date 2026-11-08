// ✉️ 2026-11-08 닫힘(410 Gone) — 메일은 이제 회사마다 자기 메일 계정으로 보낸다
//  · 예전: 모든 운송사의 메일이 이 경로 하나로, 한 운송사의 메일 계정(코드에 비밀번호까지 적혀 있었다)으로 나갔다.
//  · 지금: Firebase 호출형 함수 sendCompanyMail(functions/companyMail.js) — 회사정보 › 메일 설정에 등록한 계정으로 보낸다.
//  · 예전 화면(캐시된 옛 버전)이 부르면 아래 안내를 돌려준다. 메일 계정 · 비밀번호는 여기에 두지 않는다.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  return res.status(410).json({
    error: "이 메일 발송 경로는 닫혔어요. 프로그램을 새로고침한 뒤 회사정보 › 메일 설정에서 발신 메일을 등록하고 다시 보내 주세요.",
    code: "GONE_USE_SEND_COMPANY_MAIL",
    replacement: "sendCompanyMail",
  });
}
