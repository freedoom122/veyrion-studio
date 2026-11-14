const { getDb } = require('../config/database');

function migrateSiteContent() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS site_content_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_type TEXT NOT NULL CHECK(content_type IN ('section','article','project')),
    page_key TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    eyebrow TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    image_url TEXT,
    cta_label TEXT,
    cta_url TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_site_content_page_status_order ON site_content_items(page_key, status, sort_order)');
  console.log('[DB] Site content CMS schema ready.');
}

module.exports = { migrateSiteContent };
