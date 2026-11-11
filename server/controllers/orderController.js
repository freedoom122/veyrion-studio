const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const License = require('../models/License');
const { generateDownloadToken } = require('../utils/generateOrderNumber');
const { sendEmail } = require('../config/email');
const { getDb } = require('../config/database');
const db = getDb();

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
      if (items.some((item) => item.product_status !== 'active')) {
        return res.status(409).json({ success: false, error: { code: 'PRODUCT_UNAVAILABLE', message: 'One or more items in your cart are no longer available. Remove them and try again.' } });
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
      if (finalTotal > 0) {
        return res.status(503).json({ success: false, error: { code: 'PAYMENT_UNAVAILABLE', message: 'Card checkout is not configured for cart orders yet. Your cart has not been changed.' } });
      }

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
            const license = db.prepare(
              'SELECT l.id, p.download_file_path FROM licenses l JOIN products p ON p.id = l.product_id WHERE l.order_id = ? AND l.product_id = ? LIMIT 1'
            ).get(order.id, item.product_id);
            if (license) {
              db.prepare(`INSERT INTO downloads (license_key_id, file_path, download_token, expires_at) VALUES (?, ?, ?, datetime('now', '+24 hours'))`).run(
                license.id, license.download_file_path || item.product_slug || 'product-download', token
              );
            }
          }
        }
      }

      const orderItems = Order.getItems(order.id);

      res.status(201).json({
        success: true,
        data: {
          order: { ...order, items: orderItems },
          message: 'Order complete. Your license and download link are ready.'
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
      const download = db.prepare("SELECT d.*, l.status AS license_status, o.status AS order_status FROM downloads d JOIN licenses l ON l.id = d.license_key_id JOIN orders o ON o.id = l.order_id WHERE d.download_token = ? AND d.expires_at > datetime('now') AND l.status = 'active' AND o.status = 'paid'").get(req.params.token);
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
      const stripeSecret = String(process.env.STRIPE_SECRET_KEY || '');
      const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '');
      if (!/^sk_(?:test|live)_/.test(stripeSecret) || stripeSecret.toLowerCase().includes('placeholder') || !webhookSecret || webhookSecret.toLowerCase().includes('placeholder')) {
        return res.status(503).json({ success: false, error: { code: 'STRIPE_NOT_CONFIGURED', message: 'Payment processing is not configured on this server.' } });
      }
      const stripe = require('stripe')(stripeSecret);
      const sig = req.headers['stripe-signature'];
      let event;

      try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        console.error('[STRIPE] Webhook signature error:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      console.log('[STRIPE] Webhook received:', event.type);

      if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        const session = event.data.object;
        const meta = session.metadata || {};
        const userId = Number(meta.user_id);
        const productId = Number(meta.product_id);

        if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(productId) || productId <= 0) {
          console.error('[STRIPE] Missing metadata in checkout session:', session.id);
          return res.status(400).json({ received: false, error: 'Invalid checkout metadata' });
        }
        if (session.payment_status !== 'paid') return res.json({ received: true, pending: true });

        // Use the Checkout Session ID for idempotency; PaymentIntent IDs remain separate for refunds.
        let order = Order.findByStripeSession(session.id) || Order.findByPaymentIntent(session.id) || Order.findByPaymentIntent(session.payment_intent);
        const amountPaid = (session.amount_total || 0) / 100;
        if (!order) {
          order = Order.create({
            user_id: userId,
            total_amount: amountPaid,
            currency: String(session.currency || 'usd').toUpperCase(),
            payment_intent_id: session.payment_intent || null,
            stripe_session_id: session.id,
            ip_address: null,
            user_agent: 'Stripe Checkout',
          });
        } else if (Number(order.user_id) !== userId) {
          console.error('[STRIPE] Checkout session owner mismatch:', session.id);
          return res.status(400).json({ received: false, error: 'Checkout owner mismatch' });
        }

        let existingLicense = db.prepare('SELECT id, license_key FROM licenses WHERE order_id = ? AND product_id = ? LIMIT 1').get(order.id, productId);
        if (!existingLicense) {
          const license = License.create({ product_id: productId, order_id: order.id, user_id: userId });
          existingLicense = { id: license.id, license_key: license.license_key };
        }
        const existingOrderItem = db.prepare('SELECT id FROM order_items WHERE order_id = ? AND product_id = ? LIMIT 1').get(order.id, productId);
        if (!existingOrderItem) {
          Order.addItem({ order_id: order.id, product_id: productId, quantity: 1, unit_price: amountPaid, license_key: existingLicense.license_key || null });
          Product.incrementSales(productId);
        }

        // Mark as paid; duplicate webhook deliveries must not send duplicate receipts.
        const alreadyPaid = order.status === 'paid';
        if (!alreadyPaid) {
          Order.updateStatus(order.id, 'paid');
        }

        // Create download link
        existingLicense = db.prepare('SELECT id FROM licenses WHERE order_id = ? AND product_id = ?').get(order.id, productId);
        if (existingLicense) {
          const existingDownload = db.prepare('SELECT id FROM downloads WHERE license_key_id = ?').get(existingLicense.id);
          if (!existingDownload) {
            const downloadToken = generateDownloadToken();
            db.prepare(`INSERT INTO downloads (license_key_id, file_path, download_token, expires_at) VALUES (?, ?, ?, datetime('now', '+7 days'))`).run(
              existingLicense.id, meta.product_slug || 'product-download', downloadToken
            );
          }
        }

        // Send confirmation email once, after the first successful transition to paid.
        const user = !alreadyPaid ? require('../models/User').findById(userId) : null;
        if (user) {
          sendEmail({
            to: user.email,
            subject: `Veyrion — Order ${order.order_number} Confirmed`,
            html: `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#0c0c0e;color:#fff;">
              <h2 style="color:#10B981;margin-bottom:16px;font-size:18px;">Payment confirmed.</h2>
              <p style="color:#A1A1AA;font-size:14px;line-height:1.7;">
                Your order <strong>${order.order_number}</strong> for <strong>${meta.product_name || 'your purchase'}</strong> has been confirmed.
                You can download your files and view your license key from your account.
              </p>
              <p style="color:#71717A;font-size:12px;margin-top:32px;">- Veyrion</p>
            </div>`,
            text: `Order ${order.order_number} confirmed. Your purchase of ${meta.product_name || 'your product'} is ready. Log in to download.`,
          }).catch(() => {});
        }

        // Notify admin only on the first successful payment event.
        if (!alreadyPaid) sendEmail({
          to: process.env.ADMIN_EMAIL || 'admin@example.com',
          subject: `[Veyrion Store] New order — ${order.order_number}`,
          html: `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#0c0c0e;color:#fff;">
            <h2 style="color:#10B981;margin-bottom:16px;font-size:18px;">New order received.</h2>
            <p style="color:#A1A1AA;font-size:14px;line-height:1.7;">
              Order <strong>${order.order_number}</strong><br>
              Product: <strong>${meta.product_name || 'Unknown'}</strong><br>
              Amount: <strong>$${(session.amount_total / 100).toFixed(2)}</strong><br>
              Customer: ${meta.user_email || 'Unknown'}
            </p>
          </div>`,
          text: `New order ${order.order_number}. Product: ${meta.product_name}. Amount: $${(session.amount_total / 100).toFixed(2)}. Customer: ${meta.user_email}.`,
        }).catch(() => {});
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
