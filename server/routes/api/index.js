const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const productRoutes = require('./products');
const cartRoutes = require('./cart');
const orderRoutes = require('./orders');
const ticketRoutes = require('./tickets');
const adminRoutes = require('./admin');
const contactController = require('../../controllers/contactController');
const validate = require('../../middleware/validate');
const { z } = require('zod');

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/tickets', ticketRoutes);
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

// Public settings endpoint
const db = require('../../config/database');
router.get('/settings/public', (req, res) => {
  const settings = db.prepare("SELECT key, value FROM settings WHERE is_public = 1").all();
  const obj = {};
  settings.forEach(s => { obj[s.key] = s.value; });
  res.json({ success: true, data: obj });
});

module.exports = router;
