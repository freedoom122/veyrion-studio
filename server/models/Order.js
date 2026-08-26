const db = require('../config/database');
const { generateOrderNumber } = require('../utils/generateOrderNumber');

const Order = {
  findById(id) {
    return db.prepare(`
      SELECT o.*, u.name as user_name, u.email as user_email
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.id = ?
    `).get(id);
  },

  findByNumber(orderNumber) {
    return db.prepare(`
      SELECT o.*, u.name as user_name, u.email as user_email
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.order_number = ?
    `).get(orderNumber);
  },

  findByPaymentIntent(paymentIntentId) {
    return db.prepare('SELECT * FROM orders WHERE payment_intent_id = ?').get(paymentIntentId);
  },

  create({ user_id, total_amount, currency, coupon_code, tax_amount, discount_amount, ip_address, user_agent, payment_provider, payment_intent_id }) {
    const orderNumber = generateOrderNumber();
    const result = db.prepare(`
      INSERT INTO orders (order_number, user_id, total_amount, currency, coupon_code, tax_amount, discount_amount, ip_address, user_agent, payment_provider, payment_intent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(orderNumber, user_id, total_amount, currency || 'USD', coupon_code || null, tax_amount || 0, discount_amount || 0, ip_address || null, user_agent || null, payment_provider || 'stripe', payment_intent_id || null);
    return this.findById(result.lastInsertRowid);
  },

  updateStatus(id, status) {
    const updates = { status };
    if (status === 'paid') updates.paid_at = new Date().toISOString();
    if (status === 'refunded') updates.refunded_at = new Date().toISOString();

    const fields = ['status = ?', "updated_at = datetime('now')"];
    const values = [status];

    if (updates.paid_at) {
      fields.push('paid_at = ?');
      values.push(updates.paid_at);
    }
    if (updates.refunded_at) {
      fields.push('refunded_at = ?');
      values.push(updates.refunded_at);
    }
    values.push(id);

    db.prepare(`UPDATE orders SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id);
  },

  addRefund(id, amount) {
    db.prepare(`
      UPDATE orders SET refund_amount = refund_amount + ?, status = 'refunded', refunded_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(amount, id);
    return this.findById(id);
  },

  addItem({ order_id, product_id, quantity, unit_price, license_key }) {
    const total_price = quantity * unit_price;
    return db.prepare(`
      INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, license_key)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(order_id, product_id, quantity, unit_price, total_price, license_key || null);
  },

  getItems(orderId) {
    return db.prepare(`
      SELECT oi.*, p.name as product_name, p.slug as product_slug
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `).all(orderId);
  },

  list({ page = 1, limit = 20, status = '', search = '', sort = 'created_at', order = 'desc', user_id = null }) {
    let where = 'WHERE 1=1';
    const params = [];

    if (user_id) {
      where += ' AND o.user_id = ?';
      params.push(user_id);
    }
    if (status) {
      where += ' AND o.status = ?';
      params.push(status);
    }
    if (search) {
      where += ' AND (o.order_number LIKE ? OR u.name LIKE ? OR u.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ${where}
    `).get(...params).count;

    const validSorts = ['created_at', 'total_amount', 'status'];
    const sortCol = validSorts.includes(sort) ? `o.${sort}` : 'o.created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    const orders = db.prepare(`
      SELECT o.*, u.name as user_name, u.email as user_email
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ${where}
      ORDER BY ${sortCol} ${sortOrder}
      LIMIT ? OFFSET ?
    `).all(...params, limit, (page - 1) * limit);

    return { orders, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  count() {
    return db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  },

  countByStatus(status) {
    return db.prepare('SELECT COUNT(*) as count FROM orders WHERE status = ?').get(status).count;
  },

  totalRevenue(days = 30) {
    return db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM orders WHERE status = 'paid' AND paid_at > datetime('now', '-${days} days')
    `).get().total;
  },

  recentOrders(limit = 10) {
    return db.prepare(`
      SELECT o.*, u.name as user_name, u.email as user_email
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC LIMIT ?
    `).all(limit);
  },
};

module.exports = Order;
