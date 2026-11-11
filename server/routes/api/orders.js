const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/orderController');
const { requireStoreAuth } = require('../../middleware/auth');
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

router.post('/checkout', requireStoreAuth, validate(checkoutSchema), orderController.checkout);
router.get('/', requireStoreAuth, orderController.myOrders);
router.get('/licenses', requireStoreAuth, orderController.myLicenses);
router.get('/download/:token', orderController.downloadFile);
router.get('/:id', requireStoreAuth, orderController.orderDetail);

module.exports = router;
