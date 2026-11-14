
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

const CONTENT_PAGES = new Set(['home','about','backend','frontend','saas','games','security','services','case-studies','process','blog','contact','faq','careers','changelog','opensource','store','docs']);
const CONTENT_TYPES = new Set(['section','article','project']);
function ensureContentTable(db) {
  db.exec("CREATE TABLE IF NOT EXISTS site_content_items (id INTEGER PRIMARY KEY AUTOINCREMENT, content_type TEXT NOT NULL CHECK(content_type IN ('section','article','project')), page_key TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, eyebrow TEXT, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', image_url TEXT, cta_label TEXT, cta_url TEXT, sort_order INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))");
  db.exec("CREATE INDEX IF NOT EXISTS idx_site_content_page_status_order ON site_content_items(page_key, status, sort_order)");
}
function makeSlug(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
function safeContentUrl(value) {
  const url = String(value || '').trim();
  if (!url) return null;
  if (/^https:\/\/[^\s]+$/i.test(url)) return url;
  if (/^\/(?!\/)[a-zA-Z0-9_./?&=%#-]*$/.test(url)) return url;
  if (/^#[a-zA-Z0-9_-]+$/.test(url)) return url;
  throw new Error('Use an HTTPS URL or a same-site relative link.');
}
function validateContent(input, existing) {
  const source = Object.assign({}, existing || {}, input || {});
  const type = String(source.content_type || 'section');
  if (!CONTENT_TYPES.has(type)) throw new Error('Choose a valid content type.');
  let page = String(source.page_key || 'home').trim().toLowerCase();
  if (type === 'article') page = 'blog';
  if (type === 'project') page = 'case-studies';
  if (!CONTENT_PAGES.has(page)) throw new Error('Choose a valid site page.');
  const title = String(source.title || '').trim();
  if (title.length < 2 || title.length > 140) throw new Error('Title must be between 2 and 140 characters.');
  const slug = makeSlug(source.slug || title);
  if (!slug) throw new Error('Add a valid URL slug.');
  const body = String(source.body || '').trim();
  if (body.length > 8000) throw new Error('Body text must be 8,000 characters or fewer.');
  const eyebrow = String(source.eyebrow || '').trim().slice(0, 80);
  const ctaLabel = String(source.cta_label || '').trim().slice(0, 60);
  const imageUrl = safeContentUrl(source.image_url);
  const ctaUrl = safeContentUrl(source.cta_url);
  const status = String(source.status || 'draft');
  if (!['draft','published'].includes(status)) throw new Error('Choose draft or published.');
  const sortOrder = Number.isFinite(Number(source.sort_order)) ? Math.max(-10000, Math.min(10000, Math.trunc(Number(source.sort_order)))) : 0;
  if (Boolean(ctaLabel) !== Boolean(ctaUrl)) throw new Error('Add both a button label and a button link, or leave both empty.');
  return { content_type: type, page_key: page, slug, eyebrow, title, body, image_url: imageUrl, cta_label: ctaLabel || null, cta_url: ctaUrl, sort_order: sortOrder, status };
}
function logContentChange(db, req, action, item) {
  db.prepare("INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, new_values, ip_address, user_agent) VALUES (?, ?, 'site_content', ?, ?, ?, ?)").run(req.user.id, action, item.id || null, JSON.stringify({ slug: item.slug, type: item.content_type, page: item.page_key, status: item.status }), req.ip || '', String(req.get('user-agent') || '').slice(0, 500));
}

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

router.get('/content', (req, res, next) => {
  try {
    const db = getDb(); ensureContentTable(db);
    const rows = db.prepare('SELECT * FROM site_content_items ORDER BY page_key ASC, sort_order ASC, updated_at DESC').all();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});
router.post('/content', (req, res, next) => {
  try {
    const db = getDb(); ensureContentTable(db);
    const item = validateContent(req.body);
    const result = db.prepare("INSERT INTO site_content_items (content_type,page_key,slug,eyebrow,title,body,image_url,cta_label,cta_url,sort_order,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(item.content_type,item.page_key,item.slug,item.eyebrow,item.title,item.body,item.image_url,item.cta_label,item.cta_url,item.sort_order,item.status);
    const saved = db.prepare('SELECT * FROM site_content_items WHERE id = ?').get(result.lastInsertRowid);
    logContentChange(db, req, 'content_created', saved);
    res.status(201).json({ success: true, data: saved });
  } catch (error) {
    const conflict = /UNIQUE constraint failed/i.test(error.message);
    res.status(conflict ? 409 : 400).json({ success: false, error: { code: conflict ? 'SLUG_EXISTS' : 'INVALID_CONTENT', message: conflict ? 'That URL slug is already in use.' : error.message } });
  }
});
router.put('/content/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid content ID.' } });
    const db = getDb(); ensureContentTable(db);
    const current = db.prepare('SELECT * FROM site_content_items WHERE id = ?').get(id);
    if (!current) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Content item not found.' } });
    const item = validateContent(req.body, current);
    db.prepare("UPDATE site_content_items SET content_type=?,page_key=?,slug=?,eyebrow=?,title=?,body=?,image_url=?,cta_label=?,cta_url=?,sort_order=?,status=?,updated_at=datetime('now') WHERE id=?").run(item.content_type,item.page_key,item.slug,item.eyebrow,item.title,item.body,item.image_url,item.cta_label,item.cta_url,item.sort_order,item.status,id);
    const saved = db.prepare('SELECT * FROM site_content_items WHERE id = ?').get(id);
    logContentChange(db, req, 'content_updated', saved);
    res.json({ success: true, data: saved });
  } catch (error) {
    const conflict = /UNIQUE constraint failed/i.test(error.message);
    res.status(conflict ? 409 : 400).json({ success: false, error: { code: conflict ? 'SLUG_EXISTS' : 'INVALID_CONTENT', message: conflict ? 'That URL slug is already in use.' : error.message } });
  }
});
router.delete('/content/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid content ID.' } });
    const db = getDb(); ensureContentTable(db);
    const current = db.prepare('SELECT * FROM site_content_items WHERE id = ?').get(id);
    if (!current) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Content item not found.' } });
    db.prepare('DELETE FROM site_content_items WHERE id = ?').run(id);
    logContentChange(db, req, 'content_deleted', current);
    res.json({ success: true, data: { id } });
  } catch (error) { next(error); }
});

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
          text: 'Hi ' + booking.name + ',\n\n' + detail + '\n\nVeyrion Studio',
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
