# Veyrion Studio

Bespoke systems for companies that have outgrown the catalogue.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Edit .env with your settings (at minimum: JWT_SECRET, REFRESH_TOKEN_SECRET)

# 4. Setup database (creates tables + admin account)
npm run setup

# 5. Start server
npm start
```

- **Frontend**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin
- **API**: http://localhost:3000/api/v1
- **Health**: http://localhost:3000/health

## Default Admin

- **Email**: admin@veyrion.dev
- **Password**: SuperAdmin123!@#

Change these in `.env` before deploying to production.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `JWT_SECRET` | JWT signing secret (64+ chars) | - |
| `REFRESH_TOKEN_SECRET` | Refresh token secret | - |
| `DATABASE_PATH` | SQLite file path | ./server/database/database.sqlite |
| `STRIPE_SECRET_KEY` | Stripe secret key | - |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | - |
| `SMTP_HOST` | SMTP server | - |
| `SMTP_USER` | SMTP username | - |
| `SMTP_PASS` | SMTP password | - |

## Project Structure

```
├── client/              # Frontend (HTML/CSS/JS)
├── server/
│   ├── config/          # Database, Stripe, Email config
│   ├── middleware/       # Auth, validation, rate limiting
│   ├── models/          # Data models
│   ├── controllers/     # Request handlers
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── utils/           # Utilities
│   ├── database/        # Migrations and seeds
│   ├── uploads/         # File uploads
│   └── admin/           # Admin panel
├── server.js            # Entry point
├── package.json
└── .env.example
```

## Deployment

### PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Docker

```bash
docker-compose up -d
```

### VPS (DigitalOcean, Hetzner, etc.)

1. Clone the repo
2. Install Node.js 18+
3. Run `npm install && npm run setup`
4. Configure nginx as reverse proxy
5. Use Let's Encrypt for SSL
6. Run with PM2

## API

All endpoints return:

```json
{
  "success": true,
  "data": {},
  "meta": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}
```

See `server/routes/api/` for all available endpoints.

## License

Proprietary. All work confidential until you say otherwise.
