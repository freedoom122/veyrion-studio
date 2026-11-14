const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const productRoutes = require('./products');
const cartRoutes = require('./cart');
const orderRoutes = require('./orders');
const ticketRoutes = require('./tickets');
const checkoutRoutes = require('./checkout');
const adminRoutes = require('./admin');
const contactController = require('../../controllers/contactController');
const bookingController = require('../../controllers/bookingController');
const { rateLimit } = require('express-rate-limit');
const { requireAuth, requireCustomerAuth } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { z } = require('zod');

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/tickets', ticketRoutes);
router.use('/checkout', checkoutRoutes);
router.use('/admin', adminRoutes);

// Contact form endpoint
const contactSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email(),
  company: z.string().min(2).max(200),
  type: z.string().optional(),
  brief: z.string().min(40).max(5000),
});
const contactLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 3, standardHeaders: true, legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many contact requests. Please try again later.' } } });

router.post('/contact', contactLimiter, requireCustomerAuth, validate(contactSchema), (req, res, next) => {
  const started = Number(req.get('x-form-started-at') || 0);
  if (String(req.body.website || '') || !started || Date.now() - started < 2500 || Date.now() - started > 86400000) return res.status(400).json({ success:false, error:{code:'BOT_CHECK_FAILED', message:'Please complete the form normally and try again.'} });
  return contactController.submit(req,res,next);
});

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many call requests. Please try again later.' },
});

const bookingSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  company: z.string().trim().min(2).max(120),
  type: z.string().trim().min(2).max(80),
  brief: z.string().trim().min(40).max(5000),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferredTime: z.string().regex(/^(?:(09|10|11|12|13|14|15):(00|30)|16:00)$/),
  timezone: z.string().min(1).max(80),
  website: z.string().max(200).optional(),
});

router.post('/bookings', bookingLimiter, requireCustomerAuth, validate(bookingSchema), (req,res,next) => {
  const started = Number(req.get('x-form-started-at') || 0);
  if (String(req.body.website || '') || !started || Date.now() - started < 2500 || Date.now() - started > 86400000) return res.status(400).json({success:false,error:{code:'BOT_CHECK_FAILED',message:'Please complete the form normally and try again.'}});
  req.body.email=req.user.email; req.body.name=req.user.name || req.body.name;
  return bookingController.create(req,res,next);
});

// Public settings endpoint
const { getDb } = require('../../config/database');
router.get('/site/content/item', (req, res) => {
  const slug = String(req.query.slug || '').trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return res.status(400).json({ success: false, error: { code: 'INVALID_SLUG', message: 'A valid content slug is required.' } });
  const item = getDb().prepare("SELECT content_type, page_key, slug, eyebrow, title, body, image_url, cta_label, cta_url, sort_order FROM site_content_items WHERE slug = ? AND status = 'published' LIMIT 1").get(slug);
  if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'This content is not available.' } });
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ success: true, data: item });
});

router.get('/site/content', (req, res) => {
  const page = String(req.query.page || 'home').trim().toLowerCase();
  const allowed = new Set(['home','about','backend','frontend','saas','games','security','services','case-studies','process','blog','contact','faq','careers','changelog','opensource','store','docs']);
  if (!allowed.has(page)) return res.status(400).json({ success: false, error: { code: 'INVALID_PAGE', message: 'Unknown site page.' } });
  const rows = getDb().prepare("SELECT content_type, page_key, slug, eyebrow, title, body, image_url, cta_label, cta_url, sort_order FROM site_content_items WHERE page_key = ? AND status = 'published' ORDER BY sort_order ASC, created_at ASC").all(page);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ success: true, data: rows });
});

router.get('/settings/public', (req, res) => {
  const db = getDb();
  const settings = db.prepare("SELECT key, value FROM settings WHERE is_public = 1").all();
  const obj = {};
  settings.forEach(s => { obj[s.key] = s.value; });
  res.json({ success: true, data: obj });
});

module.exports = router;
