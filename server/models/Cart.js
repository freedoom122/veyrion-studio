const { getDb } = require('../config/database');
const db = getDb();

const Cart = {
  findOrCreate({ user_id, session_id }) {
    let cart;
    if (user_id) {
      cart = db.prepare('SELECT * FROM carts WHERE user_id = ? AND status = ?').get(user_id, 'active');
    }
    if (!cart && session_id) {
      cart = db.prepare('SELECT * FROM carts WHERE session_id = ? AND status = ?').get(session_id, 'active');
    }
    if (!cart) {
      const result = db.prepare(`
        INSERT INTO carts (user_id, session_id, expires_at)
        VALUES (?, ?, datetime('now', '+30 days'))
      `).run(user_id || null, session_id || `guest-${Date.now()}`);
      cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(result.lastInsertRowid);
    }
    return cart;
  },

  getItems(cartId) {
    return db.prepare(`
      SELECT ci.*, p.name as product_name, p.slug as product_slug, p.price, p.thumbnail, p.status as product_status
      FROM cart_items ci
      LEFT JOIN products p ON ci.product_id = p.id
      WHERE ci.cart_id = ?
    `).all(cartId);
  },

  addItem(cartId, productId, quantity = 1) {
    const existing = db.prepare('SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?').get(cartId, productId);
    if (existing) {
      db.prepare('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?').run(quantity, existing.id);
    } else {
      db.prepare('INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)').run(cartId, productId, quantity);
    }
  },

  updateItemQuantity(itemId, quantity) {
    if (quantity <= 0) {
      return db.prepare('DELETE FROM cart_items WHERE id = ?').run(itemId);
    }
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(quantity, itemId);
  },

  removeItem(itemId) {
    return db.prepare('DELETE FROM cart_items WHERE id = ?').run(itemId);
  },

  clearCart(cartId) {
    return db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cartId);
  },

  getTotal(cartId) {
    return db.prepare(`
      SELECT COALESCE(SUM(ci.quantity * p.price), 0) as total
      FROM cart_items ci
      LEFT JOIN products p ON ci.product_id = p.id
      WHERE ci.cart_id = ?
    `).get(cartId).total;
  },

  getItemCount(cartId) {
    return db.prepare('SELECT COALESCE(SUM(quantity), 0) as count FROM cart_items WHERE cart_id = ?').get(cartId).count;
  },

  convertToOrder(cartId, userId) {
    db.prepare("UPDATE carts SET status = 'converted' WHERE id = ?").run(cartId);
    if (userId) {
      db.prepare('UPDATE carts SET user_id = ? WHERE id = ?').run(userId, cartId);
    }
  },

  cleanupExpired() {
    return db.prepare("DELETE FROM carts WHERE status = 'active' AND expires_at < datetime('now')").run();
  },
};

module.exports = Cart;
