const db = require('../config/database');

const Product = {
  findById(id) {
    return db.prepare(`
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `).get(id);
  },

  findBySlug(slug) {
    return db.prepare(`
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.slug = ?
    `).get(slug);
  },

  create(data) {
    const result = db.prepare(`
      INSERT INTO products (slug, name, description_short, description_full, category_id, price, currency, status, thumbnail, download_file_path, version, changelog, requirements, tags, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.slug, data.name, data.description_short, data.description_full,
      data.category_id, data.price, data.currency || 'USD', data.status || 'draft',
      data.thumbnail, data.download_file_path, data.version || '1.0.0',
      data.changelog, data.requirements, data.tags, data.metadata_json
    );
    return this.findById(result.lastInsertRowid);
  },

  update(id, data) {
    const fields = [];
    const values = [];
    const allowed = ['slug', 'name', 'description_short', 'description_full', 'category_id', 'price', 'currency', 'status', 'thumbnail', 'download_file_path', 'version', 'changelog', 'requirements', 'tags', 'metadata_json'];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }

    if (fields.length === 0) return this.findById(id);

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id);
  },

  delete(id) {
    return db.prepare('DELETE FROM products WHERE id = ?').run(id);
  },

  list({ page = 1, limit = 20, search = '', category = '', status = '', sort = 'created_at', order = 'desc' }) {
    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (p.name LIKE ? OR p.description_short LIKE ? OR p.tags LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category) {
      where += ' AND c.slug = ?';
      params.push(category);
    }
    if (status) {
      where += ' AND p.status = ?';
      params.push(status);
    }

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${where}
    `).get(...params).count;

    const validSorts = ['created_at', 'name', 'price', 'sales_count', 'view_count'];
    const sortCol = validSorts.includes(sort) ? `p.${sort}` : 'p.created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    const products = db.prepare(`
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${where}
      ORDER BY ${sortCol} ${sortOrder}
      LIMIT ? OFFSET ?
    `).all(...params, limit, (page - 1) * limit);

    return { products, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  publicList({ page = 1, limit = 20, category = '', search = '', sort = 'newest' }) {
    let where = "WHERE p.status = 'active'";
    const params = [];

    if (category) {
      where += ' AND c.slug = ?';
      params.push(category);
    }
    if (search) {
      where += ' AND (p.name LIKE ? OR p.description_short LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM products p LEFT JOIN categories c ON p.category_id = c.id ${where}`).get(...params).count;

    let orderBy = 'p.created_at DESC';
    if (sort === 'popular') orderBy = 'p.sales_count DESC';
    else if (sort === 'price-asc') orderBy = 'p.price ASC';
    else if (sort === 'price-desc') orderBy = 'p.price DESC';

    const products = db.prepare(`
      SELECT p.id, p.slug, p.name, p.description_short, p.price, p.currency, p.thumbnail, p.version, p.tags, p.sales_count, p.view_count, c.name as category_name, c.slug as category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${where}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, limit, (page - 1) * limit);

    return { products, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  incrementView(slug) {
    db.prepare("UPDATE products SET view_count = view_count + 1 WHERE slug = ?").run(slug);
  },

  incrementSales(id) {
    db.prepare("UPDATE products SET sales_count = sales_count + 1 WHERE id = ?").run(id);
  },

  count() {
    return db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  },

  totalRevenue() {
    return db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE status = 'paid'").get().total;
  },

  categories() {
    return db.prepare(`
      SELECT c.*, COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.status = 'active'
      GROUP BY c.id
      ORDER BY c.sort_order
    `).all();
  },
};

module.exports = Product;
