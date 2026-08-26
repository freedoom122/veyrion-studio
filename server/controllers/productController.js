const Product = require('../models/Product');
const { getDb } = require('../config/database');
const db = getDb();

const productController = {
  // Public endpoints
  list(req, res, next) {
    try {
      const { page = 1, limit = 20, category = '', search = '', sort = 'newest' } = req.query;
      const result = Product.publicList({ page: parseInt(page), limit: parseInt(limit), category, search, sort });
      res.json({ success: true, data: result.products, meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
    } catch (err) { next(err); }
  },

  detail(req, res, next) {
    try {
      const product = Product.findBySlug(req.params.slug);
      if (!product) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
      Product.incrementView(req.params.slug);

      const related = db.prepare(`
        SELECT p.id, p.slug, p.name, p.description_short, p.price, p.thumbnail
        FROM products p WHERE p.category_id = ? AND p.id != ? AND p.status = 'active' LIMIT 3
      `).all(product.category_id, product.id);

      res.json({ success: true, data: { ...product, related } });
    } catch (err) { next(err); }
  },

  categories(req, res, next) {
    try {
      const categories = Product.categories();
      res.json({ success: true, data: categories });
    } catch (err) { next(err); }
  },

  // Admin endpoints
  adminList(req, res, next) {
    try {
      const { page = 1, limit = 20, search = '', category = '', status = '', sort = 'created_at', order = 'desc' } = req.query;
      const result = Product.list({ page: parseInt(page), limit: parseInt(limit), search, category, status, sort, order });
      res.json({ success: true, data: result.products, meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
    } catch (err) { next(err); }
  },

  adminDetail(req, res, next) {
    try {
      const product = Product.findById(parseInt(req.params.id));
      if (!product) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
      res.json({ success: true, data: product });
    } catch (err) { next(err); }
  },

  create(req, res, next) {
    try {
      const product = Product.create(req.body);
      // Audit log
      db.prepare(`INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, new_values, ip_address) VALUES (?, 'create', 'product', ?, ?, ?)`).run(
        req.user.id, product.id, JSON.stringify(req.body), req.ip
      );
      res.status(201).json({ success: true, data: product });
    } catch (err) { next(err); }
  },

  update(req, res, next) {
    try {
      const existing = Product.findById(parseInt(req.params.id));
      if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
      const product = Product.update(parseInt(req.params.id), req.body);
      db.prepare(`INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, old_values, new_values, ip_address) VALUES (?, 'update', 'product', ?, ?, ?, ?)`).run(
        req.user.id, product.id, JSON.stringify(existing), JSON.stringify(req.body), req.ip
      );
      res.json({ success: true, data: product });
    } catch (err) { next(err); }
  },

  delete(req, res, next) {
    try {
      const product = Product.findById(parseInt(req.params.id));
      if (!product) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
      Product.delete(parseInt(req.params.id));
      db.prepare(`INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, old_values, ip_address) VALUES (?, 'delete', 'product', ?, ?, ?)`).run(
        req.user.id, product.id, JSON.stringify(product), req.ip
      );
      res.json({ success: true, data: { message: 'Product deleted' } });
    } catch (err) { next(err); }
  },
};

module.exports = productController;
