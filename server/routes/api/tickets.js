const express = require('express');
const router = express.Router();
const ticketController = require('../../controllers/ticketController');
const { requireAuth, requireStoreAuth, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { z } = require('zod');

const createTicketSchema = z.object({
  subject: z.string().min(5),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  category: z.string().optional(),
  message: z.string().min(10),
});

const replySchema = z.object({
  message: z.string().min(1),
});

router.post('/', requireStoreAuth, validate(createTicketSchema), ticketController.create);
router.get('/', requireStoreAuth, ticketController.myTickets);
router.get('/:id', requireStoreAuth, ticketController.ticketDetail);
router.post('/:id/reply', requireStoreAuth, validate(replySchema), ticketController.reply);

// Admin
router.get('/admin/all', requireAuth, requireRole('admin', 'superadmin'), ticketController.adminList);
router.put('/admin/:id/status', requireAuth, requireRole('admin', 'superadmin'), ticketController.adminUpdateStatus);
router.post('/admin/:id/reply', requireAuth, requireRole('admin', 'superadmin'), validate(replySchema), ticketController.reply);

module.exports = router;
