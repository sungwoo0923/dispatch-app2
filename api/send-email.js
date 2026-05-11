import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { to, subject, html, attachment, attachmentName } = req.body || {};
  if (!to || !subject) return res.status(400).json({ error: "수신자 누락" });

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.daum.net",      // ★ 다음 서버로 변경
      port: 465,
      secure: true,
      auth: {
        user: "r15332525@daum.net",
        pass: "kzcvdgefuvltipso",
      },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 15000,
    });

    const mailOptions = {
      from: '"RUN25 배차팀" <r15332525@daum.net>',
      to, subject, html: html || subject,
    };

    if (attachment) {
      mailOptions.attachments = [{
        filename: attachmentName || "거래명세서.pdf",
        content: attachment,
        encoding: "base64",
        contentType: "application/pdf",
      }];
    }

    await transporter.sendMail(mailOptions);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message, code: e.code || "" });
  }
}