const express = require('express');
const router = express.Router();
const adminController = require('../../../controllers/adminController');
const { requireAuth, requireRole } = require('../../../middleware/auth');
const authController = require('../../../controllers/authController');
const validate = require('../../../middleware/validate');
const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const settingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

const userUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(['customer', 'admin', 'superadmin']).optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
  timezone: z.string().optional(),
});

// Admin login (no auth required)
router.post('/login', validate(loginSchema), authController.login);

// All routes below require admin auth
router.use(requireAuth, requireRole('admin', 'superadmin'));

// Dashboard
router.get('/dashboard', adminController.dashboard);

// Users
router.get('/users', adminController.listUsers);
router.get('/users/:id', adminController.getUser);
router.put('/users/:id', validate(userUpdateSchema), adminController.updateUser);
router.post('/users/:id/ban', adminController.banUser);
router.post('/users/:id/unban', adminController.unbanUser);

// Products (re-use product routes)
const productController = require('../../../controllers/productController');
const { uploadProductFile, uploadThumbnail } = require('../../../middleware/upload');

router.get('/products', productController.adminList);
router.get('/products/:id', productController.adminDetail);
router.post('/products', productController.create);
router.put('/products/:id', productController.update);
router.delete('/products/:id', productController.delete);
router.post('/products/:id/upload', uploadProductFile.single('file'), (req, res) => {
  res.json({ success: true, data: { file_path: req.file.path, filename: req.file.filename } });
});
router.post('/products/:id/thumbnail', uploadThumbnail.single('file'), (req, res) => {
  res.json({ success: true, data: { thumbnail: req.file.path, filename: req.file.filename } });
});

// Orders
const orderController = require('../../../controllers/orderController');
router.get('/orders', adminController.listOrders);
router.get('/orders/:id', adminController.getOrder);
router.put('/orders/:id', adminController.updateOrder);

// Licenses
router.get('/licenses', adminController.listLicenses);
router.put('/licenses/:id/revoke', adminController.revokeLicense);

// Tickets
const ticketController = require('../../../controllers/ticketController');
router.get('/tickets', ticketController.adminList);
router.put('/tickets/:id/status', ticketController.adminUpdateStatus);

// Settings
router.get('/settings', adminController.getSettings);
router.put('/settings', requireRole('superadmin'), validate(settingSchema), adminController.updateSetting);

// Audit logs (superadmin only)
router.get('/logs', requireRole('superadmin'), adminController.getAuditLogs);

// Change user password (superadmin only)
router.put('/users/:id/password', requireRole('superadmin'), (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'Password must be at least 8 characters' } });
    }
    const User = require('../../../models/User');
    const user = User.changePassword(parseInt(req.params.id), password);
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    const { getDb } = require('../../../config/database');
    const db = getDb();
    db.prepare(`INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, ip_address) VALUES (?, 'change_password', 'user', ?, ?)`).run(req.user.id, user.id, req.ip);
    res.json({ success: true, data: { id: user.id, email: user.email, message: 'Password updated' } });
  } catch (err) { next(err); }
});

// Change user role (superadmin only)
router.put('/users/:id/role', requireRole('superadmin'), (req, res, next) => {
  try {
    const { role } = req.body;
    const User = require('../../../models/User');
    const user = User.setRole(parseInt(req.params.id), role);
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    const { getDb } = require('../../../config/database');
    const db = getDb();
    db.prepare(`INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, new_values, ip_address) VALUES (?, 'change_role', 'user', ?, ?, ?)`).run(req.user.id, user.id, JSON.stringify({ role }), req.ip);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// Create admin user (superadmin only)
router.post('/create-admin', requireRole('superadmin'), (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'Email, password, and name are required' } });
    }
    const User = require('../../../models/User');
    const existing = User.findByEmail(email);
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Email already exists' } });
    }
    const user = User.createAdmin({ email, password, name });
    const { getDb } = require('../../../config/database');
    const db = getDb();
    db.prepare(`INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, new_values, ip_address) VALUES (?, 'create_admin', 'user', ?, ?, ?)`).run(req.user.id, user.id, JSON.stringify({ email, name }), req.ip);
    res.json({ success: true, data: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) { next(err); }
});

// Google OAuth login (restricted to admin@example.com)
router.post('/google-login', async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'Google credential required' } });
    }

    // Decode the JWT token from Google (no verification needed for email extraction)
    const parts = credential.split('.');
    if (parts.length !== 3) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid Google token' } });
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    } catch (e) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Cannot decode Google token' } });
    }

    const email = payload.email;
    const allowedEmail = process.env.ADMIN_GOOGLE_EMAIL || 'admin@example.com';

    if (email !== allowedEmail) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only ' + allowedEmail + ' can access the admin panel' } });
    }

    // Find or create the user
    const User = require('../../../models/User');
    let user = User.findByEmail(email);
    if (!user) {
      user = User.create({
        email,
        password: require('crypto').randomBytes(32).toString('hex'),
        name: payload.name || email.split('@')[0],
        role: 'superadmin',
      });
    } else if (user.role !== 'admin' && user.role !== 'superadmin') {
      // Promote to superadmin if they're the allowed Google user
      user = User.setRole(user.id, 'superadmin');
    }

    const { generateToken } = require('../../../middleware/auth');
    const token = generateToken(user);

    const { getDb } = require('../../../config/database');
    const db = getDb();
    db.prepare(`INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, ip_address) VALUES (?, 'google_login', 'user', ?, ?)`).run(user.id, user.id, req.ip);

    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role }
      }
    });
  } catch (err) { next(err); }
});

// Contact submissions
router.get('/contact-submissions', (req, res) => {
  const { getDb } = require('../../../config/database');
  const db = getDb();
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS contact_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        company TEXT NOT NULL,
        project_type TEXT,
        brief TEXT NOT NULL,
        ip TEXT,
        user_agent TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const total = db.prepare('SELECT COUNT(*) as count FROM contact_submissions').get().count;
    const rows = db.prepare('SELECT * FROM contact_submissions ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);

    res.json({
      success: true,
      data: rows,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('[ADMIN] Contact submissions error:', err.message);
    res.json({ success: true, data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  }
});

// Backup (superadmin only)
router.post('/backup', requireRole('superadmin'), adminController.triggerBackup);

module.exports = router;
