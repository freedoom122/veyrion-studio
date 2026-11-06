
const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');
const { requireAuth } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { authLimiter } = require('../../middleware/rateLimiter');
const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Public customer account creation is disabled. The configured owner is
// activated only through the private, one-time admin setup flow.
router.post('/register', (req, res) => {
  res.status(403).json({
    success: false,
    error: { code: 'REGISTRATION_DISABLED', message: 'Public account registration is disabled.' },
  });
});
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/logout', requireAuth, authController.logout);
router.post('/forgot-password', (req, res) => {
  res.status(403).json({
    success: false,
    error: { code: 'USE_ADMIN_RECOVERY', message: 'Use the private admin password recovery flow.' },
  });
});
router.get('/me', requireAuth, authController.getMe);
router.put('/me', requireAuth, authController.updateProfile);
module.exports = router;
