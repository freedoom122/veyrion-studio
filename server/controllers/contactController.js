const { sendEmail } = require('../config/email');
const { getDb } = require('../config/database');

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendViaFormSubmit({ name, email, company, type, brief }) {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@localhost';
    const resp = await fetch('https://formsubmit.co/ajax/' + adminEmail, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        _subject: '[Veyrion Brief] ' + company + ' - ' + (type || 'Project Inquiry'),
        _template: 'table',
        name: name,
        email: email,
        company: company,
        project_type: type || 'Not specified',
        brief: brief,
        _replyto: email,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (resp.ok) {
      console.log('[CONTACT] Email sent via FormSubmit.co');
    } else {
      console.error('[CONTACT] FormSubmit.co returned', resp.status);
    }
  } catch (e) {
    console.error('[CONTACT] FormSubmit.co failed:', e.message);
  }
}

const contactController = {
  async submit(req, res, next) {
    try {
      const { name, email, company, type, brief } = req.body;
      const db = getDb();

      // Store submission
      try {
        db.prepare(`
          CREATE TABLE IF NOT EXISTS contact_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            company TEXT NOT NULL,
            project_type TEXT,
            brief TEXT NOT NULL,
            ip TEXT,
            user_agent TEXT,
            created_at TEXT DEFAULT (datetime('now'))
          )
        `).run();

        db.prepare(`
          INSERT INTO contact_submissions (name, email, company, project_type, brief, ip, user_agent)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          name, email, company, type || '', brief,
          req.ip || '',
          (req.headers['user-agent'] || '').substring(0, 500)
        );
      } catch (dbErr) {
        console.error('[CONTACT] DB insert error:', dbErr.message);
      }

      // Respond immediately — don't wait for email
      res.json({ success: true, message: 'Brief submitted successfully' });

      // Try SMTP first, fall back to FormSubmit.co
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@localhost';
      const adminHtml = '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#0c0c0e;color:#fff;">'
        + '<h2 style="color:#10B981;margin-bottom:8px;font-size:18px;">New Architecture Brief</h2>'
        + '<p style="color:#71717A;font-size:13px;margin-bottom:24px;">Submitted via veyrion.dev contact form</p>'
        + '<table style="width:100%;border-collapse:collapse;">'
        + '<tr><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#71717A;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;width:120px;">Name</td><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#fff;font-size:14px;">' + escapeHtml(name) + '</td></tr>'
        + '<tr><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#71717A;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;">Email</td><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#06B6D4;font-size:14px;">' + escapeHtml(email) + '</td></tr>'
        + '<tr><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#71717A;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;">Company</td><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#fff;font-size:14px;">' + escapeHtml(company) + '</td></tr>'
        + '<tr><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#71717A;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;">Project Type</td><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#fff;font-size:14px;">' + escapeHtml(type || 'Not specified') + '</td></tr>'
        + '<tr><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#71717A;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;vertical-align:top;">Brief</td><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#A1A1AA;font-size:14px;line-height:1.6;">' + escapeHtml(brief) + '</td></tr>'
        + '</table>'
        + '<p style="color:#71717A;font-size:12px;margin-top:24px;">Reply to respond directly to ' + escapeHtml(name) + ' at ' + escapeHtml(email) + '</p>'
        + '</div>';

      // Fire email in background (never blocks the response)
      sendEmail({
        to: adminEmail,
        subject: '[Veyrion Brief] ' + company + ' - ' + (type || 'Project Inquiry'),
        html: adminHtml,
        text: 'New architecture brief from ' + name + ' at ' + company + ' (' + email + ').\nProject type: ' + (type || 'Not specified') + '\n\nBrief:\n' + brief,
      }).catch(function(e) {
        console.error('[CONTACT] SMTP failed, trying FormSubmit.co:', e.message);
        sendViaFormSubmit({ name, email, company, type, brief });
      });

    } catch (err) {
      console.error('[CONTACT] Error:', err);
      next(err);
    }
  },
};

module.exports = contactController;
