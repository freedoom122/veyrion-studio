const db = require('../config/database');
const bcrypt = require('bcrypt');

function seed() {
  console.log('[DB] Seeding database...');

  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(process.env.ADMIN_EMAIL || 'admin@veyrion.dev');

  if (!existingAdmin) {
    const passwordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'SuperAdmin123!@#', 12);
    db.prepare(`
      INSERT INTO users (email, password_hash, name, role, email_verified)
      VALUES (?, ?, ?, 'superadmin', 1)
    `).run(
      process.env.ADMIN_EMAIL || 'admin@veyrion.dev',
      passwordHash,
      'Studio Admin'
    );
    console.log('[DB] Default admin created.');
  }

  // Seed categories
  const categories = [
    { name: 'Software', slug: 'software', description: 'Custom software solutions', icon: 'code', sort_order: 1 },
    { name: 'Licenses', slug: 'licenses', description: 'Software licenses and keys', icon: 'key', sort_order: 2 },
    { name: 'Tools', slug: 'tools', description: 'Developer tools and utilities', icon: 'tool', sort_order: 3 },
    { name: 'Infrastructure', slug: 'infrastructure', description: 'Infrastructure solutions', icon: 'server', sort_order: 4 },
  ];

  const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name, slug, description, icon, sort_order) VALUES (?, ?, ?, ?, ?)');
  for (const cat of categories) {
    insertCat.run(cat.name, cat.slug, cat.description, cat.icon, cat.sort_order);
  }

  // Seed products
  const products = [
    {
      slug: 'distributed-operations-platform',
      name: 'Distributed Operations Platform',
      description_short: 'Multi-region operations with event-sourced scheduling and live capacity monitoring.',
      description_full: 'A complete operations platform built on event sourcing with regional read models, a single operator console, and a write path that survives partition. Go services, Postgres with logical replication, NATS for fan-out, and a TypeScript console with optimistic concurrency.',
      category_id: 1,
      price: 2499.00,
      status: 'active',
      version: '3.2.1',
      requirements: 'Linux or macOS, 8GB RAM, Docker',
      tags: 'operations,event-sourcing,go,postgres,nats',
    },
    {
      slug: 'automation-orchestration-engine',
      name: 'Automation Orchestration Engine',
      description_short: 'Durable workflow engine with idempotency, dead-letter replay, and typed connector SDK.',
      description_full: 'A durable workflow engine with idempotency keys at the edge, dead-letter with operator replay, and a typed connector SDK. Built on Temporal-style orchestrators in TypeScript, Redis for leases, Postgres for history, and OpenTelemetry on every activity.',
      category_id: 1,
      price: 1899.00,
      status: 'active',
      version: '2.4.0',
      requirements: 'Node.js 18+, Redis, PostgreSQL',
      tags: 'automation,workflows,temporal,typescript',
    },
    {
      slug: 'real-time-analytics-infrastructure',
      name: 'Real-Time Analytics Infrastructure',
      description_short: 'Canonical event bus with exactly-once loaders and streaming aggregates.',
      description_full: 'Canonical event bus with exactly-once loaders into a warehouse, streaming aggregates for the operator view, and dbt for the semantic layer. Kafka to Flink-style jobs to ClickHouse for hot reads, Snowflake for finance, one metrics catalog both teams query.',
      category_id: 4,
      price: 3299.00,
      status: 'active',
      version: '1.8.0',
      requirements: 'Kafka, ClickHouse, Snowflake account',
      tags: 'analytics,kafka,clickhouse,streaming',
    },
    {
      slug: 'ai-workflow-system',
      name: 'AI Workflow System',
      description_short: 'Retrieval-augmented inference with eval harness, tool-calling, and human-confirm writes.',
      description_full: 'Retrieval over an internal corpus, tool-calling into the ticketing API, an eval suite on golden tickets, and a human-confirm step on any write. Python inference workers, a permissions-aware retriever, streaming responses over gRPC, traces stored for weekly eval runs.',
      category_id: 1,
      price: 2899.00,
      status: 'active',
      version: '2.1.0',
      requirements: 'Python 3.11+, GPU recommended, PostgreSQL',
      tags: 'ai,rag,evals,python,grpc',
    },
  ];

  const insertProd = db.prepare(`
    INSERT OR IGNORE INTO products (slug, name, description_short, description_full, category_id, price, status, version, requirements, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of products) {
    insertProd.run(p.slug, p.name, p.description_short, p.description_full, p.category_id, p.price, p.status, p.version, p.requirements, p.tags);
  }

  // Seed settings
  const settings = [
    { key: 'site_name', value: 'Veyrion', setting_group: 'general', is_public: 1 },
    { key: 'site_description', value: 'Bespoke systems for companies that have outgrown the catalogue', setting_group: 'general', is_public: 1 },
    { key: 'site_email', value: 'studio@veyrion.dev', setting_group: 'general', is_public: 1 },
    { key: 'currency', value: 'USD', setting_group: 'commerce', is_public: 1 },
    { key: 'tax_rate', value: '0', setting_group: 'commerce', is_public: 0 },
    { key: 'maintenance_mode', value: 'false', setting_group: 'system', is_public: 0 },
    { key: 'announcements_enabled', value: 'false', setting_group: 'marketing', is_public: 1 },
    { key: 'announcements_text', value: '', setting_group: 'marketing', is_public: 1 },
  ];

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value, setting_group, is_public) VALUES (?, ?, ?, ?)');
  for (const s of settings) {
    insertSetting.run(s.key, s.value, s.setting_group, s.is_public);
  }

  console.log('[DB] Seed complete.');
}

module.exports = { seed };

if (require.main === module) {
  seed();
}
