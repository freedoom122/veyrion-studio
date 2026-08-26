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

// Backup (superadmin only)
router.post('/backup', requireRole('superadmin'), adminController.triggerBackup);

module.exports = router;
