const Ticket = require('../models/Ticket');
const { sendEmail } = require('../config/email');

const ticketController = {
  create(req, res, next) {
    try {
      const { subject, priority, category, message } = req.body;
      const ticket = Ticket.create({ user_id: req.user.id, subject, priority, category });
      if (message) {
        Ticket.addMessage({ ticket_id: ticket.id, user_id: req.user.id, message });
      }
      res.status(201).json({ success: true, data: ticket });
    } catch (err) { next(err); }
  },

  myTickets(req, res, next) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const result = Ticket.list({ page: parseInt(page), limit: parseInt(limit), user_id: req.user.id });
      res.json({ success: true, data: result.tickets, meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
    } catch (err) { next(err); }
  },

  ticketDetail(req, res, next) {
    try {
      const ticket = Ticket.findById(parseInt(req.params.id));
      if (!ticket) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
      if (ticket.user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
      }
      const messages = Ticket.getMessages(ticket.id);
      res.json({ success: true, data: { ...ticket, messages } });
    } catch (err) { next(err); }
  },

  reply(req, res, next) {
    try {
      const ticket = Ticket.findById(parseInt(req.params.id));
      if (!ticket) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
      if (ticket.user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
      }
      const isStaff = req.user.role === 'admin' || req.user.role === 'superadmin';
      Ticket.addMessage({ ticket_id: ticket.id, user_id: req.user.id, message: req.body.message, is_staff: isStaff });
      if (isStaff && ticket.status === 'open') {
        Ticket.updateStatus(ticket.id, 'pending');
      }
      res.json({ success: true, data: { message: 'Reply sent' } });
    } catch (err) { next(err); }
  },

  // Admin
  adminList(req, res, next) {
    try {
      const { page = 1, limit = 20, status = '', priority = '', search = '' } = req.query;
      const result = Ticket.list({ page: parseInt(page), limit: parseInt(limit), status, priority, search });
      res.json({ success: true, data: result.tickets, meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
    } catch (err) { next(err); }
  },

  adminUpdateStatus(req, res, next) {
    try {
      const ticket = Ticket.updateStatus(parseInt(req.params.id), req.body.status);
      if (!ticket) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
      res.json({ success: true, data: ticket });
    } catch (err) { next(err); }
  },
};

module.exports = ticketController;
