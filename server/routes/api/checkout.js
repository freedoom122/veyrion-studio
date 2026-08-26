const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getDb } = require('../../config/database');
const { requireAuth } = require('../../middleware/auth');

// Create a Stripe Checkout Session
router.post('/create-session', requireAuth, async (req, res, next) => {
  try {
    const { product_id } = req.body;
    if (!product_id) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PRODUCT', message: 'product_id is required' } });
    }

    const db = getDb();
    const product = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ? AND p.status = 'active'
    `).get(parseInt(product_id));

    if (!product) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
    }

    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_...') {
      return res.status(503).json({ success: false, error: { code: 'STRIPE_NOT_CONFIGURED', message: 'Stripe is not configured. Set STRIPE_SECRET_KEY in your environment.' } });
    }

    const origin = req.headers.origin || req.headers.referer?.replace(/\/[^/]*$/, '') || process.env.FRONTEND_URL || 'https://veyrion-studio.onrender.com';

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
            unit_amount: Math.round(product.price * 100), // Stripe uses cents
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
router.get('/session/:sessionId', requireAuth, async (req, res, next) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_...') {
      return res.json({ success: true, data: { status: 'simulated', paid: true } });
    }

    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
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

module.exports = router;
