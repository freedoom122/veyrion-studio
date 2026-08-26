const express = require('express');
const router = express.Router();
const cartController = require('../../controllers/cartController');
const { optionalAuth } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { z } = require('zod');

const addItemSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().int().positive().optional(),
});

const updateSchema = z.object({
  quantity: z.number().int().min(0),
});

router.get('/', optionalAuth, cartController.get);
router.post('/', optionalAuth, validate(addItemSchema), cartController.addItem);
router.put('/:itemId', optionalAuth, validate(updateSchema), cartController.updateItem);
router.delete('/:itemId', optionalAuth, cartController.removeItem);

module.exports = router;
