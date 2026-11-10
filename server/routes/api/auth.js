const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');
const { requireAuth } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { authLimiter, refreshLimiter } = require('../../middleware/rateLimiter');
const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});
const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(14).max(200),
  name: z.string().trim().min(2).max(100),
  company: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional(),
});

router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', refreshLimiter, authController.refreshToken);
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
