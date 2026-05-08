import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST만 허용" });
  }

  const { to, subject, html } = req.body || {};
  if (!to || !subject) {
    return res.status(400).json({ error: "수신자 또는 제목 누락" });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.naver.com",
      port: 465,
      secure: true,
      auth: {
        user: "tjddnqkf@naver.com",
        pass: "U4CWZJVUKDXN",
      },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 15000,
    });

    await transporter.sendMail({
      from: '"RUN25 배차팀" <tjddnqkf@naver.com>',
      to,
      subject,
      html: html || subject,
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("SMTP 오류:", e.message, e.code);
    return res.status(500).json({
      error: e.message,
      code: e.code || ""
    });
  }
}