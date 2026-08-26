const { sendEmail } = require('../config/email');
const { getDb } = require('../config/database');

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

      // Fire emails in background (never blocks the response)
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
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

      sendEmail({
        to: adminEmail,
        subject: '[Veyrion Brief] ' + company + ' - ' + (type || 'Project Inquiry'),
        html: adminHtml,
        text: 'New architecture brief from ' + name + ' at ' + company + ' (' + email + ').\nProject type: ' + (type || 'Not specified') + '\n\nBrief:\n' + brief,
      }).catch(function(e) { console.error('[CONTACT] Admin email failed:', e.message); });

      sendEmail({
        to: email,
        subject: 'Veyrion - Brief Received',
        html: '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#0c0c0e;color:#fff;">'
          + '<h2 style="color:#10B981;margin-bottom:16px;font-size:18px;">Brief received.</h2>'
          + '<p style="color:#A1A1AA;font-size:14px;line-height:1.7;">Thanks, ' + escapeHtml(name) + '. We received your brief for ' + escapeHtml(company) + '. A partner will reply from admin@example.com within two business days. If the work is outside our range, we will say so plainly.</p>'
          + '<p style="color:#71717A;font-size:12px;margin-top:32px;">- Veyrion</p>'
          + '</div>',
        text: 'Thanks, ' + name + '. We received your brief for ' + company + '. A partner will reply from admin@example.com within two business days.',
      }).catch(function(e) { console.error('[CONTACT] Confirmation email failed:', e.message); });

    } catch (err) {
      console.error('[CONTACT] Error:', err);
      next(err);
    }
  },
};

module.exports = contactController;
