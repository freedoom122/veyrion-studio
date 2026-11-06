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
router.post('/contact', validate(contactSchema), contactController.submit);

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
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
  preferredDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
  preferredTime: z.string().regex(/^(09|10|11|12|13|14|15|16):(00|30)$/),
  timezone: z.string().min(1).max(80),
  website: z.string().max(200).optional(),
});

router.post('/bookings', bookingLimiter, validate(bookingSchema), bookingController.create);

// Public settings endpoint
const db = require('../../config/database');
router.get('/settings/public', (req, res) => {
  const settings = db.prepare("SELECT key, value FROM settings WHERE is_public = 1").all();
  const obj = {};
  settings.forEach(s => { obj[s.key] = s.value; });
  res.json({ success: true, data: obj });
});

module.exports = router;
