# Veyrion owner admin

- Open the private panel at `/admin/` on the Render service.
- `ADMIN_EMAIL` identifies the only permitted owner account.
- `ADMIN_PASSWORD` is a temporary, one-time bootstrap key for the first owner activation. Keep it only in Render Environment, never in Git or chat. After the owner account is activated and its password is changed, remove the bootstrap variable from Render.
- The public setup endpoint intentionally reports setup as closed after the owner account exists. This is the expected production state, not a missing-admin error.
- Password recovery uses Resend when `RESEND_API_KEY` is configured, otherwise SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`). Recovery links are single-use and expire after 30 minutes.
- Admin auth uses an HttpOnly, Secure, SameSite=Strict cookie and hashed server-side session tokens. No admin bearer token is written to localStorage.
- Public customer registration is handled separately by Supabase Auth. Extra admin creation is disabled.
- API keys and snapshot credentials must remain server-side and must never be added to the admin panel or browser storage.

## Persistent application database

The Render service uses `/tmp/veyrion.sqlite` as its local runtime database/cache. In production it restores and persists database snapshots through the Supabase `veyrion_app_snapshots` table using the server-only `SUPABASE_SNAPSHOT_TOKEN` and the configured Supabase URL/publishable key. The snapshot is integrity-checked with SHA-256 before restore, and the application refuses to start if persistent storage is not configured. The local `/tmp` file is therefore not the only copy of application data.

Keep `SUPABASE_SNAPSHOT_TOKEN` private. The snapshot RPC functions are security-definer functions and must only be called by the application with that server-held token. Do not copy the token into frontend code, browser storage, GitHub, or public documentation.

## Live Site Studio

- The visual editor stores text and a small allowlist of presentation properties only.
- Raw HTML, arbitrary CSS properties, and CSS transforms are not accepted. The public renderer uses `textContent` and validates URLs before applying them.
- Content items are plain text and published entries are rendered by the public `site-content.js` client.
