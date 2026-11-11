const express = require('express');
const router = express.Router();
const { getDb } = require('../../config/database');
const { requireStoreAuth } = require('../../middleware/auth');

function getStripe() {
  const key = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!/^sk_(?:test|live)_/.test(key) || key.toLowerCase().includes('placeholder') || !/^whsec_/.test(webhookSecret) || webhookSecret.toLowerCase().includes('placeholder')) return null;
  try { return require('stripe')(key); } catch (_) { return null; }
}

function isStripeReady() {
  return getStripe() !== null;
}

// Create a Stripe Checkout Session
router.post('/create-session', requireStoreAuth, async (req, res, next) => {
  try {
    const { product_id } = req.body || {};
    const productId = Number(product_id);
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_PRODUCT', message: 'A valid product_id is required.' } });
    }

    const db = getDb();
    const product = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ? AND p.status = 'active'
    `).get(productId);

    if (!product || product.status !== 'active') {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
    }
    if (!Number.isFinite(Number(product.price)) || Number(product.price) <= 0) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_PRICE', message: 'This product is not available for paid checkout.' } });
    }

    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({
        success: false,
        error: { code: 'STRIPE_NOT_CONFIGURED', message: 'Stripe is not configured. Set STRIPE_SECRET_KEY in your environment variables with a valid key (sk_live_... or sk_test_...).' }
      });
    }

    const origin = String(process.env.FRONTEND_URL || 'https://veyrionstudios.com').replace(/\/$/, '');

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: req.user.email,
      line_items: [
        {
          price_data: {
            currency: (product.currency || 'USD').toLowerCase(),
            product_data: {
              name: product.name,
              description: product.description_short || product.name,
              metadata: {
                product_id: String(product.id),
                product_slug: product.slug,
                version: product.version || '1.0.0',
              },
            },
            unit_amount: Math.round(product.price * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        user_id: String(req.user.id),
        user_email: req.user.email,
        product_id: String(product.id),
        product_slug: product.slug,
        product_name: product.name,
      },
      success_url: origin + '/checkout-success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: origin + '/checkout-cancel.html',
    });

    res.json({ success: true, data: { url: session.url, session_id: session.id } });
  } catch (err) {
    console.error('[STRIPE] Checkout session error:', err.message);
    next(err);
  }
});

// Get checkout session status (for success page polling)
router.get('/session/:sessionId', requireStoreAuth, async (req, res, next) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ success: false, error: { code: 'STRIPE_NOT_CONFIGURED', message: 'Payment verification is unavailable until Stripe is configured.' } });
    }

    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    const sessionUserId = String(session.metadata?.user_id || '');
    if (!sessionUserId || sessionUserId !== String(req.user.id)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'This checkout session does not belong to your account.' } });
    }
    res.json({
      success: true,
      data: {
        status: session.payment_status,
        paid: session.payment_status === 'paid',
        customer_email: session.customer_email,
        amount_total: session.amount_total,
      },
    });
  } catch (err) {
    console.error('[STRIPE] Session retrieve error:', err.message);
    next(err);
  }
});

// Check if Stripe is configured
router.get('/status', (req, res) => {
  res.json({ success: true, data: { configured: isStripeReady() } });
});

module.exports = router;
