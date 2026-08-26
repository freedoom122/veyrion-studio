const db = require('../config/database');

const Ticket = {
  findById(id) {
    return db.prepare(`
      SELECT t.*, u.name as user_name, u.email as user_email
      FROM tickets t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
    `).get(id);
  },

  create({ user_id, subject, priority = 'medium', category = 'general' }) {
    const result = db.prepare(`
      INSERT INTO tickets (user_id, subject, priority, category)
      VALUES (?, ?, ?, ?)
    `).run(user_id, subject, priority, category);
    return this.findById(result.lastInsertRowid);
  },

  addMessage({ ticket_id, user_id, message, is_staff = false }) {
    return db.prepare(`
      INSERT INTO ticket_messages (ticket_id, user_id, message, is_staff)
      VALUES (?, ?, ?, ?)
    `).run(ticket_id, user_id, message, is_staff ? 1 : 0);
  },

  getMessages(ticketId) {
    return db.prepare(`
      SELECT tm.*, u.name as user_name, u.email as user_email
      FROM ticket_messages tm
      LEFT JOIN users u ON tm.user_id = u.id
      WHERE tm.ticket_id = ?
      ORDER BY tm.created_at ASC
    `).all(ticketId);
  },

  updateStatus(id, status) {
    const fields = ['status = ?', "updated_at = datetime('now')"];
    const values = [status];
    if (status === 'closed') {
      fields.push('closed_at = datetime(\'now\')');
    }
    values.push(id);
    db.prepare(`UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id);
  },

  list({ page = 1, limit = 20, status = '', priority = '', search = '', user_id = null }) {
    let where = 'WHERE 1=1';
    const params = [];

    if (user_id) {
      where += ' AND t.user_id = ?';
      params.push(user_id);
    }
    if (status) {
      where += ' AND t.status = ?';
      params.push(status);
    }
    if (priority) {
      where += ' AND t.priority = ?';
      params.push(priority);
    }
    if (search) {
      where += ' AND (t.subject LIKE ? OR u.name LIKE ? OR u.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM tickets t LEFT JOIN users u ON t.user_id = u.id ${where}`).get(...params).count;

    const tickets = db.prepare(`
      SELECT t.*, u.name as user_name, u.email as user_email
      FROM tickets t
      LEFT JOIN users u ON t.user_id = u.id
      ${where}
      ORDER BY
        CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, (page - 1) * limit);

    return { tickets, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  count() {
    return db.prepare('SELECT COUNT(*) as count FROM tickets').get().count;
  },

  countByStatus(status) {
    return db.prepare('SELECT COUNT(*) as count FROM tickets WHERE status = ?').get(status).count;
  },
};

module.exports = Ticket;
