const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');
const { requireAuth } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { authLimiter } = require('../../middleware/rateLimiter');
const { z } = require('zod');

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  name: z.string().min(2, 'Name is required'),
  company: z.string().optional(),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/logout', requireAuth, authController.logout);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.get('/me', requireAuth, authController.getMe);
router.put('/me', requireAuth, authController.updateProfile);

module.exports = router;
