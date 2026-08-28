const express = require('express');
const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '646840719016-qhv9jtms6drb2g42ebnpob8ri7piooj2.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const ALLOWED_EMAIL = process.env.ADMIN_GOOGLE_EMAIL || 'admin@example.com';
const REDIRECT_URI = (process.env.SITE_URL || 'https://veyrion-studio.onrender.com') + '/auth/google/callback';

// Step 1: Redirect to Google's consent screen
router.get('/', (req, res) => {
  const scopes = encodeURIComponent('email profile openid');
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
});

// Step 2: Handle callback from Google
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect('/admin/?error=' + encodeURIComponent('Google denied access: ' + error));
  }

  if (!code) {
    return res.redirect('/admin/?error=' + encodeURIComponent('No authorization code received'));
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error('[GOOGLE] Token exchange failed:', tokenData.error_description || tokenData.error);
      return res.redirect('/admin/?error=' + encodeURIComponent('Token exchange failed: ' + (tokenData.error_description || tokenData.error)));
    }

    // Get user info from the ID token
    const idToken = tokenData.id_token;
    if (!idToken) {
      return res.redirect('/admin/?error=' + encodeURIComponent('No ID token received'));
    }

    // Decode the ID token (JWT) to get email
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());
    const email = payload.email;
    const name = payload.name || email.split('@')[0];

    // Restrict to allowed email
    if (email !== ALLOWED_EMAIL) {
      return res.redirect('/admin/?error=' + encodeURIComponent('Access denied. Only ' + ALLOWED_EMAIL + ' can access the admin panel.'));
    }

    // Find or create user in database
    const { getDb } = require('../../config/database');
    const db = getDb();
    const User = require('../../models/User');
    const { generateToken } = require('../../middleware/auth');

    let user = User.findByEmail(email);
    if (!user) {
      // Create superadmin user
      const crypto = require('crypto');
      user = User.create({
        email,
        password: crypto.randomBytes(32).toString('hex'),
        name,
        role: 'superadmin',
      });
    } else if (user.role !== 'admin' && user.role !== 'superadmin') {
      user = User.setRole(user.id, 'superadmin');
    }

    // Generate JWT
    const jwtToken = generateToken(user);

    // Log the login
    db.prepare("INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, ip_address) VALUES (?, 'google_login', 'user', ?, ?)").run(user.id, user.id, req.ip);

    // Redirect to admin panel with token in URL fragment (not query string for security)
    res.send(`<!DOCTYPE html>
<html><head><title>Signing in...</title></head>
<body>
<script>
  localStorage.setItem('admin_token', '${jwtToken}');
  localStorage.setItem('admin_user', JSON.stringify({id:${user.id},email:'${email}',name:'${name.replace(/'/g, "\\'")}',role:'${user.role}'}));
  window.location.href = '/admin/';
</script>
<p>Signing in... <a href="/admin/">Click here if not redirected</a></p>
</body></html>`);

  } catch (err) {
    console.error('[GOOGLE] OAuth callback error:', err.message);
    res.redirect('/admin/?error=' + encodeURIComponent('Server error during authentication'));
  }
});

module.exports = router;
