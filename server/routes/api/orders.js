const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/orderController');
const { requireAuth } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { z } = require('zod');

const checkoutSchema = z.object({
  coupon_code: z.string().optional(),
  billing: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    company: z.string().optional(),
  }).optional(),
});

router.post('/checkout', requireAuth, validate(checkoutSchema), orderController.checkout);
router.get('/', requireAuth, orderController.myOrders);
router.get('/licenses', requireAuth, orderController.myLicenses);
router.get('/download/:token', orderController.downloadFile);
router.get('/:id', requireAuth, orderController.orderDetail);

module.exports = router;
