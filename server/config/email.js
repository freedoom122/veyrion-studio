const nodemailer = require('nodemailer');

let transporter = null;

function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (transporter) return transporter;

  if (!isEmailConfigured()) {
    console.log('[EMAIL] SMTP is not fully configured.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: parseInt(process.env.SMTP_PORT || '587') === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });

  return transporter;
}

async function sendEmail({ to, subject, html, text, replyTo }) {
  const transport = getTransporter();

  if (!transport) {
    console.log(`[EMAIL LOG] To: ${to} | Subject: ${subject}`);
    console.log(`[EMAIL LOG] Body: ${text || html}`);
    return { messageId: 'console-log-' + Date.now() };
  }

  const result = await transport.sendMail({
    from: `${process.env.SMTP_FROM_NAME || 'Veyrion'} <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ''),
    ...(replyTo ? { replyTo } : {}),
  });

  return result;
}

module.exports = { sendEmail, getTransporter, isEmailConfigured };
