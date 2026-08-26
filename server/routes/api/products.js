const express = require('express');
const router = express.Router();
const productController = require('../../controllers/productController');
const { requireAuth, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { z } = require('zod');

const productSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description_short: z.string().optional(),
  description_full: z.string().optional(),
  category_id: z.number().optional(),
  price: z.number().min(0),
  currency: z.string().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  thumbnail: z.string().optional(),
  download_file_path: z.string().optional(),
  version: z.string().optional(),
  changelog: z.string().optional(),
  requirements: z.string().optional(),
  tags: z.string().optional(),
  metadata_json: z.string().optional(),
});

// Public
router.get('/', productController.list);
router.get('/categories', productController.categories);
router.get('/:slug', productController.detail);

// Admin
router.get('/admin/list', requireAuth, requireRole('admin', 'superadmin'), productController.adminList);
router.get('/admin/:id', requireAuth, requireRole('admin', 'superadmin'), productController.adminDetail);
router.post('/admin', requireAuth, requireRole('admin', 'superadmin'), validate(productSchema), productController.create);
router.put('/admin/:id', requireAuth, requireRole('admin', 'superadmin'), productController.update);
router.delete('/admin/:id', requireAuth, requireRole('admin', 'superadmin'), productController.delete);

module.exports = router;
