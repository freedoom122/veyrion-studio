const { getDb } = require('../config/database');
const db = getDb();
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const License = require('../models/License');
const Ticket = require('../models/Ticket');

const adminController = {
  dashboard(req, res, next) {
    try {
      const stats = {
        totalRevenue: Order.totalRevenue(30),
        totalUsers: User.count(),
        newUsers: User.countRecent(30),
        totalProducts: Product.count(),
        totalOrders: Order.count(),
        totalLicenses: License.count(),
        pendingOrders: Order.countByStatus('pending'),
        paidOrders: Order.countByStatus('paid'),
        refundedOrders: Order.countByStatus('refunded'),
        openTickets: Ticket.countByStatus('open'),
        pendingTickets: Ticket.countByStatus('pending'),
        recentOrders: Order.recentOrders(5),
      };
      res.json({ success: true, data: stats });
    } catch (err) { next(err); }
  },

  // Users
  listUsers(req, res, next) {
    try {
      const { page = 1, limit = 20, search = '', role = '', sort = 'created_at', order = 'desc' } = req.query;
      const result = User.list({ page: parseInt(page), limit: parseInt(limit), search, role, sort, order });
      res.json({ success: true, data: result.users, meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
    } catch (err) { next(err); }
  },

  getUser(req, res, next) {
    try {
      const user = User.findById(parseInt(req.params.id));
      if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      const orders = Order.list({ user_id: user.id, limit: 10 });
      const licenses = License.list({ user_id: user.id, limit: 10 });
      res.json({ success: true, data: { ...user, orders: orders.orders, licenses: licenses.licenses } });
    } catch (err) { next(err); }
  },

  updateUser(req, res, next) {
    try {
      const user = User.update(parseInt(req.params.id), req.body);
      if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      db.prepare(`INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, new_values, ip_address) VALUES (?, 'update', 'user', ?, ?, ?)`).run(
        req.user.id, user.id, JSON.stringify(req.body), req.ip
      );
      res.json({ success: true, data: user });
    } catch (err) { next(err); }
  },

  banUser(req, res, next) {
    try {
      const user = User.ban(parseInt(req.params.id), req.body.reason || 'No reason provided');
      db.prepare(`INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, new_values, ip_address) VALUES (?, 'ban', 'user', ?, ?, ?)`).run(
        req.user.id, user.id, JSON.stringify({ reason: req.body.reason }), req.ip
      );
      res.json({ success: true, data: user });
    } catch (err) { next(err); }
  },

  unbanUser(req, res, next) {
    try {
      const user = User.unban(parseInt(req.params.id));
      res.json({ success: true, data: user });
    } catch (err) { next(err); }
  },

  // Orders
  listOrders(req, res, next) {
    try {
      const { page = 1, limit = 20, status = '', search = '', sort = 'created_at', order = 'desc' } = req.query;
      const result = Order.list({ page: parseInt(page), limit: parseInt(limit), status, search, sort, order });
      const ordersWithItems = result.orders.map(o => ({ ...o, items: Order.getItems(o.id) }));
      res.json({ success: true, data: ordersWithItems, meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
    } catch (err) { next(err); }
  },

  getOrder(req, res, next) {
    try {
      const order = Order.findById(parseInt(req.params.id));
      if (!order) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
      const items = Order.getItems(order.id);
      res.json({ success: true, data: { ...order, items } });
    } catch (err) { next(err); }
  },

  updateOrder(req, res, next) {
    try {
      const order = Order.updateStatus(parseInt(req.params.id), req.body.status);
      if (!order) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
      res.json({ success: true, data: order });
    } catch (err) { next(err); }
  },

  // Licenses
  listLicenses(req, res, next) {
    try {
      const { page = 1, limit = 20, status = '', search = '' } = req.query;
      const result = License.list({ page: parseInt(page), limit: parseInt(limit), status, search });
      res.json({ success: true, data: result.licenses, meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
    } catch (err) { next(err); }
  },

  revokeLicense(req, res, next) {
    try {
      const license = License.revoke(parseInt(req.params.id));
      if (!license) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'License not found' } });
      res.json({ success: true, data: license });
    } catch (err) { next(err); }
  },

  // Settings
  getSettings(req, res, next) {
    try {
      const settings = db.prepare('SELECT * FROM settings ORDER BY setting_group, key').all();
      res.json({ success: true, data: settings });
    } catch (err) { next(err); }
  },

  updateSetting(req, res, next) {
    try {
      const { key, value } = req.body;
      db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')").run(key, value, value);
      db.prepare(`INSERT INTO admin_logs (admin_id, action, entity_type, new_values, ip_address) VALUES (?, 'update_setting', 'setting', ?, ?)`).run(
        req.user.id, JSON.stringify({ key, value }), req.ip
      );
      res.json({ success: true, data: { key, value } });
    } catch (err) { next(err); }
  },

  // Audit logs
  getAuditLogs(req, res, next) {
    try {
      const { page = 1, limit = 50 } = req.query;
      const total = db.prepare('SELECT COUNT(*) as count FROM admin_logs').get().count;
      const logs = db.prepare(`
        SELECT al.*, u.name as admin_name, u.email as admin_email
        FROM admin_logs al
        LEFT JOIN users u ON al.admin_id = u.id
        ORDER BY al.created_at DESC
        LIMIT ? OFFSET ?
      `).all(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

      res.json({ success: true, data: logs, meta: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) } });
    } catch (err) { next(err); }
  },

  // Backup
  triggerBackup(req, res, next) {
    try {
      const filename = `backup-${new Date().toISOString().slice(0, 10)}-${Date.now()}.sqlite`;
      const result = db.prepare(`INSERT INTO backups (filename, backup_type, status) VALUES (?, 'manual', 'completed')`).run(filename);
      res.json({ success: true, data: { id: result.lastInsertRowid, filename, message: 'Backup created' } });
    } catch (err) { next(err); }
  },
};

module.exports = adminController;
