const { getDb } = require('../config/database');
const db = getDb();
const bcrypt = require('bcryptjs');

const User = {
  findById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },

  findByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  },

  create({ email, password, name, company, phone, role = 'customer' }) {
    const passwordHash = bcrypt.hashSync(password, 12);
    const result = db.prepare(`
      INSERT INTO users (email, password_hash, name, company, phone, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(email, passwordHash, name, company || null, phone || null, role);
    return this.findById(result.lastInsertRowid);
  },

  update(id, fields) {
    const allowed = ['name', 'company', 'phone', 'timezone', 'avatar_url'];
    const updates = [];
    const values = [];

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(fields[key]);
      }
    }

    if (updates.length === 0) return this.findById(id);

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id);
  },

  verifyPassword(user, password) {
    return bcrypt.compareSync(password, user.password_hash);
  },

  list({ page = 1, limit = 20, search = '', role = '', sort = 'created_at', order = 'desc' }) {
    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (name LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (role) {
      where += ' AND role = ?';
      params.push(role);
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM users ${where}`).get(...params).count;
    const validSorts = ['created_at', 'name', 'email', 'last_login'];
    const sortCol = validSorts.includes(sort) ? sort : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    const users = db.prepare(`
      SELECT id, email, name, role, email_verified, created_at, last_login, company, phone, is_banned
      FROM users ${where}
      ORDER BY ${sortCol} ${sortOrder}
      LIMIT ? OFFSET ?
    `).all(...params, limit, (page - 1) * limit);

    return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  ban(id, reason) {
    db.prepare("UPDATE users SET is_banned = 1, ban_reason = ?, updated_at = datetime('now') WHERE id = ?").run(reason, id);
    return this.findById(id);
  },

  unban(id) {
    db.prepare("UPDATE users SET is_banned = 0, ban_reason = NULL, updated_at = datetime('now') WHERE id = ?").run(id);
    return this.findById(id);
  },

  delete(id) {
    return db.prepare('DELETE FROM users WHERE id = ?').run(id);
  },

  count() {
    return db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  },

  countRecent(days = 30) {
    return db.prepare(`SELECT COUNT(*) as count FROM users WHERE created_at > datetime('now', '-${days} days')`).get().count;
  },

  updateLastLogin(id) {
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(id);
  },
};

module.exports = User;
