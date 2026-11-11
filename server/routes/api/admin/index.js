
const express = require('express');
const rateLimit = require('express-rate-limit');
const { getDb } = require('../../../config/database');
const { sendEmail, isEmailConfigured } = require('../../../config/email');
const adminAuth = require('../../../controllers/adminAuthController');
const { requireAdminSession, requirePasswordChanged, requireSameOrigin } = require('../../../middleware/adminSession');

const router = express.Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' } },
});
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
function defaultSiteLiveConfig(){return {version:1,updatedAt:new Date().toISOString(),patches:{}};}
function ensureSiteStudioSetting(db){const row=db.prepare("SELECT id FROM settings WHERE key = 'site_live_config' LIMIT 1").get();if(!row)db.prepare("INSERT INTO settings (key,value,setting_group,is_public) VALUES (?,?,?,1)").run('site_live_config',JSON.stringify(defaultSiteLiveConfig()),'site_studio');}
function ensureBookingsTable(db) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS call_bookings (" +
    "id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, company TEXT NOT NULL, " +
    "project_type TEXT NOT NULL, brief TEXT NOT NULL, preferred_date TEXT NOT NULL, " +
    "preferred_time TEXT NOT NULL, timezone TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', " +
    "notification_status TEXT NOT NULL DEFAULT 'pending', ip TEXT, user_agent TEXT, " +
    "created_at TEXT NOT NULL DEFAULT (datetime('now')))"
  );
}
router.use(requireSameOrigin);

router.get('/setup-status', adminAuth.setupStatus);
router.post('/setup', authLimiter, adminAuth.setup);
router.post('/login', authLimiter, adminAuth.login);
router.post('/forgot-password', authLimiter, adminAuth.forgotPassword);
router.post('/reset-password', authLimiter, adminAuth.resetPassword);

router.get('/me', requireAdminSession, adminAuth.me);
router.post('/logout', requireAdminSession, adminAuth.logout);
router.post('/change-password', requireAdminSession, adminAuth.changePassword);

router.use(requireAdminSession, requirePasswordChanged);

router.get('/site/config',(req,res,next)=>{try{const db=getDb();ensureSiteStudioSetting(db);const row=db.prepare("SELECT value FROM settings WHERE key = 'site_live_config' LIMIT 1").get();let config=defaultSiteLiveConfig();try{config=row&&row.value?JSON.parse(row.value):config;}catch(_){}res.json({success:true,data:{config}});}catch(error){next(error);}});
router.put('/site/config',(req,res,next)=>{try{const payload=req.body&&req.body.config;if(!payload||typeof payload!=='object')return res.status(400).json({success:false,error:{code:'INVALID_CONFIG',message:'A valid site configuration is required.'}});const raw=JSON.stringify(payload);if(raw.length>100000)return res.status(413).json({success:false,error:{code:'CONFIG_TOO_LARGE',message:'The live site configuration is too large.'}});const patchCount=Object.keys(payload.patches||{}).length;if(patchCount>300)return res.status(400).json({success:false,error:{code:'TOO_MANY_PATCHES',message:'Limit the live editor to 300 element overrides.'}});const db=getDb();ensureSiteStudioSetting(db);const config=Object.assign({version:1},payload,{updatedAt:new Date().toISOString()});db.prepare("UPDATE settings SET value=?,setting_group='site_studio',is_public=1,updated_at=datetime('now') WHERE key='site_live_config'").run(JSON.stringify(config));db.prepare("INSERT INTO admin_logs (admin_id,action,entity_type,new_values,ip_address,user_agent) VALUES (?,?,?,?,?,?)").run(req.user.id,'publish_site_changes','site',JSON.stringify({patchCount}),req.ip||'',String(req.get('user-agent')||'').slice(0,500));res.json({success:true,data:{config,message:'Site changes are live.'}});}catch(error){next(error);}});
router.get('/dashboard', (req, res, next) => {
  try {
    const db = getDb();
    ensureBookingsTable(db);
    const scalar = (sql) => db.prepare(sql).get().count || 0;
    const stats = {
      customers: scalar("SELECT COUNT(*) AS count FROM users WHERE role = 'customer'"),
      totalCalls: scalar('SELECT COUNT(*) AS count FROM call_bookings'),
      pendingCalls: scalar("SELECT COUNT(*) AS count FROM call_bookings WHERE status IN ('pending','pending_confirmation')"),
      confirmedCalls: scalar("SELECT COUNT(*) AS count FROM call_bookings WHERE status = 'confirmed'"),
      totalOrders: scalar('SELECT COUNT(*) AS count FROM orders'),
    };
    stats.recentCalls = db.prepare(
      'SELECT id, name, email, company, preferred_date, preferred_time, timezone, status, created_at FROM call_bookings ORDER BY created_at DESC LIMIT 6'
    ).all();
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
});

router.get('/bookings', (req, res, next) => {
  try {
    const db = getDb();
    ensureBookingsTable(db);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const rows = db.prepare(
      'SELECT id, name, email, company, project_type, brief, preferred_date, preferred_time, timezone, status, notification_status, created_at FROM call_bookings ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

router.put('/bookings/:id/status', async (req, res, next) => {
  try {
    const status = String(req.body.status || '');
    const allowed = ['pending_confirmation', 'confirmed', 'declined', 'completed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Choose a valid call request status.' } });
    }
    const db = getDb();
    ensureBookingsTable(db);
    const booking = db.prepare('SELECT * FROM call_bookings WHERE id = ?').get(String(req.params.id));
    if (!booking) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Call request not found.' } });
    }
    db.prepare('UPDATE call_bookings SET status = ? WHERE id = ?').run(status, booking.id);
    db.prepare(
      "INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, new_values, ip_address, user_agent) " +
      "VALUES (?, 'booking_status_changed', 'call_booking', NULL, ?, ?, ?)"
    ).run(req.user.id, JSON.stringify({ bookingId: booking.id, status }), req.ip || '', String(req.get('user-agent') || '').slice(0, 500));

    if (isEmailConfigured() && (status === 'confirmed' || status === 'declined')) {
      const confirmed = status === 'confirmed';
      const subject = confirmed ? 'Your Veyrion call is confirmed' : 'An update about your Veyrion call request';
      const detail = confirmed
        ? 'Your 45-minute call is confirmed for ' + booking.preferred_date + ' at ' + booking.preferred_time + ' (' + booking.timezone + ').'
        : 'We cannot confirm the requested time of ' + booking.preferred_date + ' at ' + booking.preferred_time + ' (' + booking.timezone + '). Please reply to arrange another time.';
      try {
        await sendEmail({
          to: booking.email,
          subject,
          text: 'Hi ' + booking.name + ',

' + detail + '

Veyrion Studio',
          html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#202630"><p>Hi ' +
            escapeHtml(booking.name) + ',</p><p>' + escapeHtml(detail) + '</p><p>Veyrion Studio</p></div>',
          replyTo: process.env.ADMIN_EMAIL,
        });
      } catch (mailError) {
        console.error('[ADMIN] Booking status email failed:', mailError.message);
      }
    }
    res.json({ success: true, data: { id: booking.id, status } });
  } catch (error) { next(error); }
});

router.get('/customers', (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const rows = getDb().prepare(
      "SELECT id, email, name, company, phone, created_at, last_login, is_banned FROM users " +
      "WHERE role = 'customer' ORDER BY created_at DESC LIMIT ?"
    ).all(limit);
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

router.get('/activity', (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const rows = getDb().prepare(
      'SELECT id, action, entity_type, entity_id, ip_address, created_at FROM admin_logs ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

module.exports = router;
