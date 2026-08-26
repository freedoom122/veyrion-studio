const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const License = require('../models/License');
const { generateDownloadToken } = require('../utils/generateOrderNumber');
const { sendEmail } = require('../config/email');
const db = require('../config/database');

const orderController = {
  async checkout(req, res, next) {
    try {
      const { coupon_code, billing } = req.body;
      const sessionId = req.cookies?.cart_session;
      const cart = Cart.findOrCreate({ user_id: req.user.id, session_id: sessionId });
      const items = Cart.getItems(cart.id);

      if (items.length === 0) {
        return res.status(400).json({ success: false, error: { code: 'EMPTY_CART', message: 'Cart is empty' } });
      }

      let total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      let discount = 0;
      let taxAmount = 0;

      // Apply coupon
      if (coupon_code) {
        const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').get(coupon_code);
        if (coupon && (!coupon.expires_at || new Date(coupon.expires_at) > new Date())) {
          if (!coupon.max_uses || coupon.uses_count < coupon.max_uses) {
            if (coupon.discount_type === 'percentage') {
              discount = total * (coupon.discount_value / 100);
            } else {
              discount = Math.min(coupon.discount_value, total);
            }
          }
        }
      }

      const finalTotal = Math.max(0, total - discount + taxAmount);

      // Create order
      const order = Order.create({
        user_id: req.user.id,
        total_amount: finalTotal,
        coupon_code: coupon_code || null,
        tax_amount: taxAmount,
        discount_amount: discount,
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
      });

      // Add order items and create licenses
      for (const item of items) {
        let licenseKey = null;
        if (item.product_status === 'active') {
          const license = License.create({
            product_id: item.product_id,
            order_id: order.id,
            user_id: req.user.id,
          });
          licenseKey = license.license_key;
          Product.incrementSales(item.product_id);
        }

        Order.addItem({
          order_id: order.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.price,
          license_key: licenseKey,
        });
      }

      // Clear cart
      Cart.convertToOrder(cart.id, req.user.id);

      // For free orders, mark as paid immediately
      if (finalTotal === 0) {
        Order.updateStatus(order.id, 'paid');
        // Create download links
        for (const item of items) {
          if (item.product_status === 'active') {
            const token = generateDownloadToken();
            db.prepare(`INSERT INTO downloads (license_key_id, file_path, download_token, expires_at) VALUES (?, ?, ?, datetime('now', '+24 hours'))`).run(
              order.id, item.product_id, token
            );
          }
        }
      }

      const orderItems = Order.getItems(order.id);

      res.status(201).json({
        success: true,
        data: {
          order: { ...order, items: orderItems },
          message: finalTotal === 0 ? 'Order complete. Check your email for download links.' : 'Order created. Proceed to payment.'
        }
      });
    } catch (err) { next(err); }
  },

  myOrders(req, res, next) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const result = Order.list({ page: parseInt(page), limit: parseInt(limit), user_id: req.user.id });
      const ordersWithItems = result.orders.map(o => ({ ...o, items: Order.getItems(o.id) }));
      res.json({ success: true, data: ordersWithItems, meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
    } catch (err) { next(err); }
  },

  orderDetail(req, res, next) {
    try {
      const order = Order.findById(parseInt(req.params.id));
      if (!order) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
      if (order.user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
      }
      const items = Order.getItems(order.id);
      res.json({ success: true, data: { ...order, items } });
    } catch (err) { next(err); }
  },

  myLicenses(req, res, next) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const result = License.list({ page: parseInt(page), limit: parseInt(limit), user_id: req.user.id });
      res.json({ success: true, data: result.licenses, meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
    } catch (err) { next(err); }
  },

  downloadFile(req, res, next) {
    try {
      const download = db.prepare('SELECT * FROM downloads WHERE download_token = ? AND expires_at > datetime(\'now\')').get(req.params.token);
      if (!download) {
        return res.status(404).json({ success: false, error: { code: 'EXPIRED', message: 'Download link expired or invalid' } });
      }

      db.prepare("UPDATE downloads SET downloaded_at = datetime('now'), ip_address = ? WHERE id = ?").run(req.ip, download.id);

      // In production, serve actual file. Here we return the path
      res.json({ success: true, data: { file_path: download.file_path, message: 'Download started' } });
    } catch (err) { next(err); }
  },

  // Stripe webhook
  async handleWebhook(req, res, next) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const sig = req.headers['stripe-signature'];
      let event;

      try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const order = Order.findByPaymentIntent(session.payment_intent || session.id);
        if (order) {
          Order.updateStatus(order.id, 'paid');
          // Create download links for purchased products
          const items = Order.getItems(order.id);
          for (const item of items) {
            const license = db.prepare('SELECT id FROM licenses WHERE order_id = ? AND product_id = ?').get(order.id, item.product_id);
            if (license) {
              const token = generateDownloadToken();
              db.prepare(`INSERT INTO downloads (license_key_id, file_path, download_token, expires_at) VALUES (?, ?, ?, datetime('now', '+24 hours'))`).run(
                license.id, item.product_slug || 'product-download', token
              );
            }
          }

          sendEmail({
            to: order.user_email,
            subject: `Order ${order.order_number} Confirmed`,
            html: `<p>Your order ${order.order_number} has been confirmed. You can download your purchases from your account.</p>`,
          }).catch(() => {});
        }
      }

      if (event.type === 'charge.refunded') {
        const charge = event.data.object;
        const order = Order.findByPaymentIntent(charge.payment_intent);
        if (order) {
          Order.addRefund(order.id, charge.amount_refunded / 100);
        }
      }

      res.json({ received: true });
    } catch (err) { next(err); }
  },
};

module.exports = orderController;
