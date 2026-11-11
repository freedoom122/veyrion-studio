const nodemailer = require('nodemailer');

let transporter = null;

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY || isSmtpConfigured());
}

function getTransporter() {
  if (transporter) return transporter;
  if (!isSmtpConfigured()) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
  });
  return transporter;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function buildEmailHtml(html, text) {
  const content = html || '<p style="white-space:pre-wrap;line-height:1.7">' +
    escapeHtml(text || '').replace(/\n/g, '<br>') + '</p>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:32px 16px;background:#0b0d10;color:#e9e9e7;font-family:Arial,Helvetica,sans-serif">' +
    '<div style="max-width:640px;margin:0 auto">' +
    '<div style="padding:0 0 18px;border-bottom:1px solid #292b2e;margin-bottom:24px">' +
    '<div style="font-size:11px;letter-spacing:3px;color:#c9a77b">VEYRION STUDIOS</div></div>' +
    '<main style="font-size:14px;line-height:1.7">' + content + '</main>' +
    '<div style="border-top:1px solid #292b2e;margin-top:28px;padding-top:16px;color:#777b80;font-size:11px;line-height:1.6">' +
    'Veyrion Studios · <a href="https://veyrionstudios.com" style="color:#c9a77b;text-decoration:none">veyrionstudios.com</a>' +
    '</div></div></body></html>';
}

async function sendWithResend({ to, subject, html, text, replyTo }) {
  const payload = {
    from: process.env.EMAIL_FROM || 'Veyrion Studios <contact@veyrionstudios.com>',
    to: Array.isArray(to) ? to : [to],
    subject: String(subject || 'Message from Veyrion Studios').slice(0, 200),
    html: buildEmailHtml(html, text),
    text: text || (html ? html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : ''),
  };
  if (replyTo) payload.reply_to = replyTo;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.id) {
    throw new Error('Transactional email delivery failed (' + response.status + '): ' +
      String(result.message || result.name || 'Provider rejected the request.').slice(0, 240));
  }
  return { messageId: result.id, provider: 'resend' };
}

async function sendEmail({ to, subject, html, text, replyTo }) {
  if (process.env.RESEND_API_KEY) return sendWithResend({ to, subject, html, text, replyTo });
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Resend is not configured. Add RESEND_API_KEY in the Render environment.');
  }
  const transport = getTransporter();
  if (transport) {
    return transport.sendMail({
      from: process.env.EMAIL_FROM || (process.env.SMTP_FROM_NAME || 'Veyrion Studios') +
        ' <' + (process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER) + '>',
      to, subject, html: buildEmailHtml(html, text),
      text: text || (html ? html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : ''),
      ...(replyTo ? { replyTo } : {}),
    });
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Transactional email is not configured. Set RESEND_API_KEY and verify the sender domain.');
  }
  console.log('[EMAIL DEV]', { to, subject });
  return { messageId: 'development-only', provider: 'console' };
}

module.exports = { sendEmail, getTransporter, isEmailConfigured };
