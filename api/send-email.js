// api/send-email.js
import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { to, subject, html } = req.body;
  if (!to || !subject) return res.status(400).json({ error: "필수 항목 누락" });

  const transporter = nodemailer.createTransport({
    host: "smtp.daum.net",
    port: 465,
    secure: true,
    auth: {
      user: "r15332525@daum.net",
      pass: "run25run25",
    },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
  });

  try {
    await transporter.verify();
    await transporter.sendMail({
      from: '"RUN25 배차팀" <r15332525@daum.net>',
      to,
      subject,
      html,
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("이메일 오류:", e.message, e.code);
    res.status(500).json({
      error: e.message,
      code: e.code,
      detail: e.responseCode || ""
    });
  }
}