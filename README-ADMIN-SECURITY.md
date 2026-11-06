
# Veyrion owner admin

- Open the private panel at /admin/ on the Render service.
- Set ADMIN_EMAIL to the only permitted owner email.
- Set ADMIN_PASSWORD privately in Render Environment to the temporary one-time setup key. Never put it in Git or a chat.
- Use the one-time owner setup screen, then sign in and immediately replace the temporary password.
- Password reset requires working SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASS) and sends a single-use link that expires in 30 minutes.
- Admin auth uses an HttpOnly, Secure, SameSite=Strict cookie and hashed server-side session tokens. No admin bearer token is written to localStorage.
- Public account registration and extra-admin creation are disabled.
- API keys are not added to the panel or browser storage.

Important deployment note: the current Render service uses /tmp/veyrion.sqlite. That filesystem is ephemeral, so password changes, sessions, bookings, and account data can be lost when the service is replaced or restarted. Configure persistent storage or migrate the application data to a managed database before relying on this panel for production records.
