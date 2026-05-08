// api/send-email.js
const nodemailer = require("nodemailer");

module.exports = async function handler(req, res) {
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
  });

  try {
    await transporter.sendMail({
      from: '"RUN25 배차팀" <r15332525@daum.net>',
      to,
      subject,
      html,
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("이메일 발송 오류:", e.message);
    res.status(500).json({ error: e.message });
  }
};