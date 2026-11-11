const express = require('express');
const router = express.Router();
const cartController = require('../../controllers/cartController');
const { optionalStoreAuth } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { z } = require('zod');

const addItemSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().int().positive().max(99).optional(),
});

const updateSchema = z.object({
  quantity: z.number().int().min(0).max(99),
});

router.get('/', optionalStoreAuth, cartController.get);
router.post('/', optionalStoreAuth, validate(addItemSchema), cartController.addItem);
router.put('/:itemId', optionalStoreAuth, validate(updateSchema), cartController.updateItem);
router.delete('/:itemId', optionalStoreAuth, cartController.removeItem);

module.exports = router;
