const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const productRoutes = require('./products');
const cartRoutes = require('./cart');
const orderRoutes = require('./orders');
const ticketRoutes = require('./tickets');
const adminRoutes = require('./admin');

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/tickets', ticketRoutes);
router.use('/admin', adminRoutes);

// Public settings endpoint
const db = require('../../config/database');
router.get('/settings/public', (req, res) => {
  const settings = db.prepare("SELECT key, value FROM settings WHERE is_public = 1").all();
  const obj = {};
  settings.forEach(s => { obj[s.key] = s.value; });
  res.json({ success: true, data: obj });
});

module.exports = router;
