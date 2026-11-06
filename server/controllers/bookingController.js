const { randomUUID } = require('crypto');
const { sendEmail, isEmailConfigured } = require('../config/email');
const { getDb } = require('../config/database');

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function isFutureLocalSlot(date, time, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const values = {};
    parts.forEach((part) => { values[part.type] = part.value; });
    const nowLocal = [values.year, values.month, values.day].join('-') +
      'T' + values.hour + ':' + values.minute;
    return (date + 'T' + time) > nowLocal;
  } catch (_) {
    return false;
  }
}

const bookingController = {
  async create(req, res, next) {
    const { name, email, company, type, brief, preferredDate, preferredTime, timezone, website } = req.body;

    if (website && website.trim()) {
      return res.status(202).json({ success: true, message: 'Request received.' });
    }

    if (!isEmailConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Call requests are temporarily unavailable. Please try again later.',
      });
    }

    const parsedDate = new Date(preferredDate + 'T00:00:00Z');
    const validDate = !Number.isNaN(parsedDate.getTime()) &&
      parsedDate.toISOString().slice(0, 10) === preferredDate;
    if (!validDate ||
        !/^(?:(09|10|11|12|13|14|15):(00|30)|16:00)$/.test(preferredTime) ||
        !isFutureLocalSlot(preferredDate, preferredTime, timezone)) {
      return res.status(400).json({
        success: false,
        message: 'Choose a future date and a time between 09:00 and 16:00 in your local timezone.',
      });
    }

    try {
      const db = getDb();
      db.exec('CREATE TABLE IF NOT EXISTS call_bookings (' +
        'id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, ' +
        'company TEXT NOT NULL, project_type TEXT NOT NULL, brief TEXT NOT NULL, ' +
        'preferred_date TEXT NOT NULL, preferred_time TEXT NOT NULL, timezone TEXT NOT NULL, ' +
        "status TEXT NOT NULL DEFAULT 'pending', notification_status TEXT NOT NULL DEFAULT 'pending', " +
        "ip TEXT, user_agent TEXT, created_at TEXT DEFAULT (datetime('now'))" +
      ')');

      const normalizedEmail = email.trim().toLowerCase();
      const duplicate = db.prepare(
        "SELECT id FROM call_bookings WHERE email = ? AND preferred_date = ? AND preferred_time = ? " +
        "AND notification_status = 'sent' AND created_at >= datetime('now', '-5 minutes') LIMIT 1"
      ).get(normalizedEmail, preferredDate, preferredTime);

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: 'This call request was already received. Check your email for confirmation.',
        });
      }

      const bookingId = randomUUID();
      db.prepare(
        'INSERT INTO call_bookings (id, name, email, company, project_type, brief, preferred_date, preferred_time, timezone, ip, user_agent) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        bookingId, name.trim(), normalizedEmail, company.trim(), type.trim(), brief.trim(),
        preferredDate, preferredTime, timezone, req.ip || '',
        String(req.headers['user-agent'] || '').slice(0, 500)
      );

      const recipient = process.env.BOOKING_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'marcubrsv@gmail.com';
      const safeCompany = company.replace(/[\r\n]+/g, ' ').slice(0, 120);
      const subject = '[Veyrion] New call request — ' + safeCompany;
      const details = [
        'Name: ' + name, 'Email: ' + normalizedEmail, 'Company: ' + company,
        'Project: ' + type,
        'Preferred time: ' + preferredDate + ' at ' + preferredTime + ' (' + timezone + ')',
        'Duration: 45 minutes', '', 'Project brief:', brief, '',
        'Request ID: ' + bookingId, 'Status: Pending confirmation',
      ].join('\n');

      const rows = [
        ['Name', name], ['Email', normalizedEmail], ['Company', company],
        ['Project', type], ['Preferred date', preferredDate],
        ['Preferred time', preferredTime + ' (' + timezone + ')'], ['Duration', '45 minutes'],
      ];
      const rowHtml = rows.map(function (row) {
        return '<tr><td style="padding:12px 10px;border-bottom:1px solid #252b35;color:#8d98a7;width:145px">' +
          escapeHtml(row[0]) + '</td><td style="padding:12px 10px;border-bottom:1px solid #252b35">' +
          escapeHtml(row[1]) + '</td></tr>';
      }).join('');

      const adminHtml =
        '<div style="font-family:Arial,sans-serif;background:#0b0d12;color:#edf0f4;padding:32px;max-width:640px;margin:auto">' +
        '<p style="color:#c9a77b;letter-spacing:3px;font-size:11px">VEYRION / CALL REQUEST</p>' +
        '<h1 style="font-size:26px;font-weight:500;margin:12px 0 24px">A new call was requested.</h1>' +
        '<p style="color:#aeb6c2">This is a preferred time, not a confirmed calendar booking.</p>' +
        '<table style="width:100%;border-collapse:collapse">' + rowHtml + '</table>' +
        '<h2 style="font-size:14px;margin:24px 0 8px;color:#c9a77b">PROJECT BRIEF</h2>' +
        '<p style="white-space:pre-wrap;line-height:1.7;color:#d1d7df">' + escapeHtml(brief) + '</p>' +
        '<p style="font-size:11px;color:#788392;margin-top:28px">Request ' + escapeHtml(bookingId) + ' · Pending confirmation</p>' +
        '<a href="mailto:' + escapeHtml(normalizedEmail) + '" style="display:inline-block;margin-top:12px;color:#0b0d12;background:#c9a77b;padding:11px 16px;text-decoration:none">Reply to requester</a>' +
        '</div>';

      try {
        await sendEmail({ to: recipient, subject: subject, html: adminHtml, text: details, replyTo: normalizedEmail });
      } catch (mailError) {
        db.prepare("UPDATE call_bookings SET notification_status = 'failed' WHERE id = ?").run(bookingId);
        console.error('[BOOKING] Notification email failed:', mailError.message);
        return res.status(503).json({
          success: false,
          message: 'We could not deliver the call request. Please try again in a moment.',
        });
      }

      db.prepare(
        "UPDATE call_bookings SET notification_status = 'sent', status = 'pending_confirmation' WHERE id = ?"
      ).run(bookingId);

      try {
        const visitorText = 'Hi ' + name + ',\n\nWe received your request for a 45-minute call on ' +
          preferredDate + ' at ' + preferredTime + ' (' + timezone +
          '). This time is not confirmed yet. We will reply to confirm or suggest another slot.\\n\\nVeyrion Studio';
        const visitorHtml =
          '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#202630">' +
          '<p style="letter-spacing:3px;color:#9a7950;font-size:11px">VEYRION</p>' +
          '<h1 style="font-size:25px;font-weight:500">Request received.</h1>' +
          '<p>Hi ' + escapeHtml(name) + ',</p>' +
          '<p>We received your request for a 45-minute call on <strong>' + escapeHtml(preferredDate) +
          '</strong> at <strong>' + escapeHtml(preferredTime) + ' (' + escapeHtml(timezone) +
          ')</strong>.</p><p>This time is not confirmed yet. We will reply by email to confirm it or suggest another slot.</p>' +
          '<p style="margin-top:28px">Veyrion Studio</p></div>';
        await sendEmail({
          to: normalizedEmail,
          subject: 'We received your Veyrion call request',
          text: visitorText,
          html: visitorHtml,
          replyTo: recipient,
        });
      } catch (confirmationError) {
        console.error('[BOOKING] Visitor confirmation email failed:', confirmationError.message);
      }

      return res.status(201).json({
        success: true,
        message: 'Your call request was received. We will confirm the time by email.',
        requestId: bookingId,
      });
    } catch (error) {
      console.error('[BOOKING] Could not create request:', error.message);
      return next(error);
    }
  },
};

module.exports = bookingController;
