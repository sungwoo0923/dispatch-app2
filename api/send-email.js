import nodemailer from "nodemailer";
import { requireCaller } from "./_auth.js"; // 🔒 2026-11-08 로그인한 직원 또는 서버 키만

// ⭐ 2026-11-06 보내는 사람(이름·이메일) 직접 입력 지원
//  · 메일은 공용 발송 계정(SMTP 로그인 계정)으로만 보낼 수 있다 — 다음(Daum)·네이버·Gmail 같은 SMTP는
//    로그인한 계정과 다른 주소를 From에 넣으면 거부하거나, 받는 쪽에서 스팸/위조(SPF·DMARC 실패)로 처리한다.
//  · 그래서 From = "입력한 이름" <공용 발송 주소>, Reply-To = 입력한 이메일 로 보낸다.
//    받는 사람 화면에는 입력한 이름이 보이고, [답장]을 누르면 입력한 이메일로 간다.
//  · 입력한 이메일이 발송 계정과 같으면 그대로 From에 쓴다.
//  · 발송 계정은 Vercel 환경변수 SMTP_HOST·SMTP_PORT·SMTP_USER·SMTP_PASS로 바꿀 수 있다(없으면 예전 공용 계정).
const SMTP_HOST = process.env.SMTP_HOST || "smtp.daum.net";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
// 🔒 2026-11-08 보안 점검 — 계정·비밀번호를 코드에 두지 않는다(공개 저장소에 노출돼 있었음 → 메일 계정 비밀번호를 바꾸고 Vercel 환경변수에만 넣을 것)
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";

const EMAIL_RE = /^[^\s@<>(),;:"[\]\\]+@[^\s@<>(),;:"[\]\\]+\.[^\s@<>(),;:"[\]\\]{2,}$/;
// 표시 이름에 들어가면 헤더가 깨지는 글자(따옴표·꺾쇠·줄바꿈)를 뺀다
const cleanName = (v, max = 60) => String(v || "").replace(/[\r\n"<>\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const cleanEmail = (v) => String(v || "").replace(/[\r\n\s<>"]/g, "").trim().toLowerCase();
// "홍길동 <a@b.com>" 처럼 이름이 붙은 주소는 꺾쇠 안의 주소만 쓴다
const pickAddr = (v) => { const m = /<([^>]+)>/.exec(String(v || "")); return cleanEmail(m ? m[1] : v); };
const splitList = (v) => (Array.isArray(v) ? v : String(v || "").split(/[,;\n]/)).map(pickAddr).filter(Boolean);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  // 🔒 2026-11-08 예전엔 누구나 이 주소로 회사 메일 계정을 써서 아무에게나 메일을 보낼 수 있었다(스팸·피싱 중계)
  const who = await requireCaller(req, res, { allowServerKey: true, blockRoles: ["driver", "cafeUser"] });
  if (!who) return;
  if (!SMTP_USER || !SMTP_PASS) return res.status(503).json({ error: "메일 발송 계정이 설정되지 않았습니다(Vercel 환경변수 SMTP_USER · SMTP_PASS).", code: "NO_SMTP" });
  const { to, subject, html, attachments: atts, fromName, fromEmail, replyTo } = req.body || {};

  // ── 입력 확인 ──
  const toList = splitList(to);
  if (!toList.length || !subject) return res.status(400).json({ error: "수신자 또는 제목이 비어 있습니다.", code: "MISSING" });
  const badTo = toList.filter((e) => !EMAIL_RE.test(e));
  if (badTo.length) return res.status(400).json({ error: `수신 이메일 형식이 올바르지 않습니다: ${badTo.join(", ")}`, code: "BAD_TO" });
  if (toList.length > 50) return res.status(400).json({ error: "한 번에 50명까지만 보낼 수 있습니다.", code: "TOO_MANY" });
  const reply = pickAddr(replyTo || fromEmail);
  if (reply && !EMAIL_RE.test(reply)) return res.status(400).json({ error: `보내는 사람 이메일 형식이 올바르지 않습니다: ${reply}`, code: "BAD_FROM" });

  const name = cleanName(fromName) || "배차팀";
  const sameAsAccount = reply && reply === SMTP_USER.toLowerCase();

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 8000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });

    const mailOptions = {
      from: { name, address: SMTP_USER },
      to: toList.join(", "),
      subject: String(subject).replace(/[\r\n]+/g, " ").slice(0, 300),
      html: html || subject,
    };
    // 답장 받을 주소 — 입력한 보내는 사람 이메일
    if (reply && !sameAsAccount) mailOptions.replyTo = { name, address: reply };

    if (atts && atts.length) {
      mailOptions.attachments = atts.map(a => ({
        filename: a.filename,
        content: a.content,
        encoding: "base64",
        contentType: a.contentType,
      }));
    }

    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({
      ok: true,
      messageId: info?.messageId || "",
      // 화면에서 "어떻게 보냈는지" 안내·기록용
      sentFrom: SMTP_USER, fromName: name, replyTo: mailOptions.replyTo ? reply : "",
      accepted: info?.accepted || [], rejected: info?.rejected || [],
    });
  } catch (e) {
    // 자주 나는 오류를 알아듣기 쉽게
    const raw = String(e?.message || e);
    const code = e?.code || e?.responseCode || "";
    let msg = raw;
    if (code === "EAUTH" || /auth/i.test(raw)) msg = "발송 계정 로그인에 실패했습니다(관리자: 메일 계정 비밀번호·앱 비밀번호 확인).";
    else if (code === "ETIMEDOUT" || code === "ESOCKET" || code === "ECONNECTION") msg = "메일 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    else if (/size|too large|552/i.test(raw)) msg = "첨부 파일이 너무 큽니다. 용량을 줄여 다시 보내 주세요.";
    else if (/recipient|550|553/i.test(raw)) msg = `받는 주소를 메일 서버가 거부했습니다: ${raw}`;
    return res.status(500).json({ error: msg, detail: raw, code: String(code) });
  }
}
