import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { to, subject, html, attachments: atts, fromName } = req.body || {};
  if (!to || !subject) return res.status(400).json({ error: "수신자 누락" });

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.daum.net",
      port: 465,
      secure: true,
      auth: { user: "r15332525@daum.net", pass: "kzcvdgefuvltipso" },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 8000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });

    // ★ 발신 메일 계정 자체는 공용 SMTP(r15332525@daum.net)를 그대로 쓰지만,
    // 받는 사람에게 보이는 "보낸사람" 표시 이름은 호출한 회사명으로 바꿔준다
    // (예전엔 어느 회사가 보내도 항상 "RUN25 배차팀"으로 고정 표시됐음).
    const mailOptions = {
      from: `"${(fromName || "배차팀").replace(/"/g, "")}" <r15332525@daum.net>`,
      to, subject, html: html || subject,
    };

    if (atts && atts.length) {
      mailOptions.attachments = atts.map(a => ({
        filename: a.filename,
        content: a.content,
        encoding: "base64",
        contentType: a.contentType,
      }));
    }

    await transporter.sendMail(mailOptions);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message, code: e.code || "" });
  }
}