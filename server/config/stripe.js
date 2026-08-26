module.exports = {
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  isConfigured: () => {
    return process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_...';
  }
};
