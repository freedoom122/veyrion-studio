
(function () {
  'use strict';
  const API = '/api/v1/admin';
  let currentUser = null;
  let currentPage = 'overview';\n  let siteConfig = { version: 1, patches: {} };\n  let selectedStudioSelector = '';\n  let studioFrame = null;
  let resetToken = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') || '';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }
  function message(id, text, type) {
    const node = $('#' + id);
    if (!node) return;
    node.textContent = text || '';
    node.className = 'form-message' + (type ? ' ' + type : '');
  }
  function showView(view, title, subtitle, kicker) {
    ['login', 'setup', 'forgot', 'reset', 'change'].forEach((name) => {
      const node = $('#' + name + '-view');
      if (node) node.hidden = name !== view;
    });
    $('#auth-shell').hidden = false;
    $('#dashboard').hidden = true;
    $('#auth-title').textContent = title || '';
    $('#auth-subtitle').textContent = subtitle || '';
    $('#auth-kicker').textContent = kicker || 'OWNER ACCESS';
  }
  function notify(text, isError) {
    const node = $('#toast');
    node.textContent = text;
    node.className = 'toast show' + (isError ? ' error' : '');
    window.setTimeout(() => { node.className = 'toast'; }, 3200);
  }
  async function api(path, options) {
    const opts = Object.assign({ method: 'GET', credentials: 'same-origin' }, options || {});
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    let response;
    try { response = await fetch(API + path, opts); }
    catch (_) { throw new Error('Could not reach the Veyrion server. Check the connection and try again.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      const error = data.error || {};
      const err = new Error(error.message || data.message || 'The request could not be completed.');
      err.status = response.status;
      err.code = error.code || '';
      throw err;
    }
    return data.data || {};
  }
  function bindForm(id, handler) {
    const form = $('#' + id);
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const oldText = button.textContent;
      button.disabled = true;
      try { await handler(); }
      catch (error) {
        const target = id.replace('-form', '-message');
        if ($('#' + target)) message(target, error.message, 'error');
        else notify(error.message, true);
      } finally {
        button.disabled = false;
        button.textContent = oldText;
      }
    });
  }
  async function checkAuth() {
    try {
      const data = await api('/me');
      currentUser = data.user;
      if (currentUser.mustChangePassword) {
        showView('change', 'Secure your account.', 'A password change is required before continuing.', 'FIRST SIGN-IN');
      } else showDashboard();
    } catch (_) {
      showView('login', 'Welcome back.', 'Sign in to your private console.', 'OWNER ACCESS');
    }
  }
  async function init() {
    const status = await api('/setup-status').catch(() => ({}));
    const setupAvailable = Boolean(status.available);
    const email = status.email || '';
    $('#login-email').value = email;
    $('#setup-email').value = email;
    $('#forgot-email').value = email;
    $('#signup-open').hidden = !status.required;
    const setupHint = document.querySelector('#setup-view .form-hint');
    if (setupHint && status.required && !status.configured) {
      setupHint.textContent = 'Owner setup is locked until the temporary ADMIN_PASSWORD is added in Render Environment. It must never be committed to GitHub.';
    }
    if (resetToken) {
      showView('reset', 'Choose a new password.', 'Your one-time recovery link is ready to use.', 'PASSWORD RECOVERY');
      return;
    }
    await checkAuth();
  }

  bindForm('login-form', async function () {
    message('login-message', '', '');
    const data = await api('/login', {
      method: 'POST',
      body: JSON.stringify({ email: $('#login-email').value.trim(), password: $('#login-password').value }),
    });
    currentUser = data.user;
    if (currentUser.mustChangePassword) {
      $('#current-password').value = $('#login-password').value;
      $('#login-password').value = '';
      showView('change', 'Secure your account.', 'A password change is required before continuing.', 'FIRST SIGN-IN');
    } else showDashboard();
  });

  bindForm('setup-form', async function () {
    message('setup-message', '', '');
    const data = await api('/setup', {
      method: 'POST',
      body: JSON.stringify({
        name: $('#setup-name').value.trim(),
        email: $('#setup-email').value.trim(),
        setupKey: $('#setup-key').value,
      }),
    });
    message('setup-message', data.message || 'Owner account activated. Sign in to continue.', 'success');
    $('#login-email').value = $('#setup-email').value.trim();
    $('#login-password').value = '';
    $('#setup-key').value = '';
    $('#signup-open').hidden = true;
    window.setTimeout(() => showView('login', 'Welcome back.', 'Your owner account is ready. Sign in to continue.', 'OWNER ACCESS'), 1200);
  });

  bindForm('forgot-form', async function () {
    message('forgot-message', '', '');
    const data = await api('/forgot-password', {
      method: 'POST', body: JSON.stringify({ email: $('#forgot-email').value.trim() }),
    });
    message('forgot-message', data.message || 'Check the owner inbox for a reset link.', 'success');
  });

  bindForm('reset-form', async function () {
    const password = $('#reset-password').value;
    if (password !== $('#reset-confirm').value) throw new Error('The passwords do not match.');
    const data = await api('/reset-password', {
      method: 'POST', body: JSON.stringify({ token: resetToken, newPassword: password }),
    });
    resetToken = '';
    window.history.replaceState({}, '', '/admin/');
    $('#reset-password').value = '';
    $('#reset-confirm').value = '';
    showView('login', 'Password updated.', data.message || 'You can now sign in.', 'PASSWORD RECOVERY');
    message('login-message', 'Your password has been reset. Sign in with your new password.', 'success');
  });

  bindForm('change-form', async function () {
    const password = $('#new-password').value;
    if (password !== $('#new-password-confirm').value) throw new Error('The passwords do not match.');
    const data = await api('/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: $('#current-password').value, newPassword: password }),
    });
    currentUser = data.user;
    $('#current-password').value = '';
    $('#new-password').value = '';
    $('#new-password-confirm').value = '';
    notify('Your account is secured.');
    showDashboard();
  });

  $('#forgot-open').addEventListener('click', () => showView('forgot', 'Reset your password.', 'We will email a single-use recovery link.', 'PASSWORD RECOVERY'));
  $('#signup-open').addEventListener('click', () => showView('setup', 'Create the owner account.', 'One-time activation. No public registrations.', 'OWNER SETUP'));
  $('#back-login-1').addEventListener('click', () => showView('login', 'Welcome back.', 'Sign in to your private console.', 'OWNER ACCESS'));
  $('#back-login-2').addEventListener('click', () => showView('login', 'Welcome back.', 'Sign in to your private console.', 'OWNER ACCESS'));
  $('#change-logout').addEventListener('click', logout);
  $('#logout-btn').addEventListener('click', logout);
  $('#refresh-btn').addEventListener('click', () => loadPage(currentPage));

  async function logout() {
    try { await api('/logout', { method: 'POST', body: '{}' }); } catch (_) {}
    currentUser = null;
    showView('login', 'Welcome back.', 'Sign in to your private console.', 'OWNER ACCESS');
  }
  function showDashboard() {
    $('#auth-shell').hidden = true;
    $('#dashboard').hidden = false;
    $('#owner-name').textContent = currentUser.name || 'Owner';
    $('#owner-email').textContent = currentUser.email || '';
    $('#owner-initial').textContent = (currentUser.name || 'V').trim().charAt(0).toUpperCase();
    loadPage('overview');
  }
  $$('.nav-link').forEach((button) => {
    button.addEventListener('click', () => {
      $$('.nav-link').forEach((item) => item.classList.toggle('active', item === button));
      loadPage(button.dataset.page);
    });
  });
  function setPageTitle(title) { $('#page-title').textContent = title; }
  async function loadPage(page) {
    currentPage = page;
    const content = $('#page-content');
    content.innerHTML = '<div class="loading-state">Loading workspace…</div>';
    try {
      if (page === 'overview') return await loadOverview(content);
      if (page === 'bookings') return await loadBookings(content);
      if (page === 'customers') return await loadCustomers(content);
      if (page === 'activity') return await loadActivity(content);
      if (page === 'security') return loadSecurity(content);\n      if (page === 'site-studio') return await loadSiteStudio(content);
    } catch (error) {
      content.innerHTML = '<div class="panel empty-state">' + escapeHtml(error.message) + '</div>';
      if (error.status === 401) await logout();
    }
  }
  function statCard(label, value, note) {
    return '<article class="stat-card"><div class="stat-label">' + label + '</div><div class="stat-value">' + value + '</div><div class="stat-note">' + note + '</div></article>';
  }
  function statusTag(value) {
    return '<span class="status-tag ' + escapeHtml(value) + '">' + escapeHtml(String(value || '').replaceAll('_', ' ')) + '</span>';
  }
  async function loadOverview(el) {
    setPageTitle('Overview');
    const d = await api('/dashboard');
    $('#pending-count').textContent = d.pendingCalls || 0;
    const recent = (d.recentCalls || []).map((row) =>
      '<tr><td><div class="primary-cell">' + escapeHtml(row.name) + '</div><div class="secondary-cell">' + escapeHtml(row.email) + '</div></td>' +
      '<td>' + escapeHtml(row.company) + '</td><td>' + escapeHtml(row.preferred_date) + '<div class="secondary-cell">' + escapeHtml(row.preferred_time) + ' · ' + escapeHtml(row.timezone) + '</div></td>' +
      '<td>' + statusTag(row.status) + '</td></tr>'
    ).join('');
    el.innerHTML = '<div class="stats-grid">' +
      statCard('CUSTOMERS', d.customers || 0, 'Registered accounts') +
      statCard('CALL REQUESTS', d.totalCalls || 0, 'All submitted requests') +
      statCard('AWAITING ACTION', d.pendingCalls || 0, 'Pending owner review') +
      statCard('CONFIRMED CALLS', d.confirmedCalls || 0, 'Confirmed with clients') +
      '</div><div class="section-head"><div><h2>Recent call requests</h2><p>New business enquiries and preferred meeting times.</p></div><button class="ghost-btn" id="view-bookings">View all ↗</button></div>' +
      '<div class="panel table-wrap"><table><thead><tr><th>CONTACT</th><th>COMPANY</th><th>PREFERRED TIME</th><th>STATUS</th></tr></thead><tbody>' +
      (recent || '<tr><td colspan="4" class="empty-state">No call requests yet.</td></tr>') + '</tbody></table></div>';
    $('#view-bookings').addEventListener('click', () => {
      $$('.nav-link').forEach((item) => item.classList.toggle('active', item.dataset.page === 'bookings'));
      loadPage('bookings');
    });
  }
  async function loadBookings(el) {
    setPageTitle('Call requests');
    const data = await api('/bookings?limit=100');
    const rows = (data || []).map((row) => {
      const id = escapeHtml(row.id);
      const options = ['pending_confirmation', 'confirmed', 'declined', 'completed'].map((status) =>
        '<option value="' + status + '"' + (row.status === status || (status === 'pending_confirmation' && row.status === 'pending') ? ' selected' : '') + '>' + status.replaceAll('_', ' ') + '</option>'
      ).join('');
      return '<tr><td><div class="primary-cell">' + escapeHtml(row.name) + '</div><div class="secondary-cell">' + escapeHtml(row.email) + '</div><div class="secondary-cell">' + escapeHtml(row.company) + '</div></td>' +
        '<td><div>' + escapeHtml(row.preferred_date) + ' · ' + escapeHtml(row.preferred_time) + '</div><div class="secondary-cell">' + escapeHtml(row.timezone) + '</div></td>' +
        '<td><div class="call-brief">' + escapeHtml(row.brief) + '</div></td><td>' + statusTag(row.status) + '</td>' +
        '<td><div class="row-actions"><select data-status="' + id + '">' + options + '</select><button class="small-btn" data-save="' + id + '">Save</button></div></td></tr>';
    }).join('');
    el.innerHTML = '<div class="section-head"><div><h2>Call requests</h2><p>Preferred times are not confirmed until you approve them here.</p></div><span class="secure-pill">OWNER REVIEW</span></div>' +
      '<div class="panel table-wrap"><table><thead><tr><th>CLIENT</th><th>PREFERRED SLOT</th><th>PROJECT BRIEF</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5" class="empty-state">No call requests have arrived yet.</td></tr>') + '</tbody></table></div>';
    $$('[data-save]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.save;
        const select = document.querySelector('[data-status="' + id.replace(/"/g, '') + '"]');
        try {
          await api('/bookings/' + encodeURIComponent(id) + '/status', {
            method: 'PUT', body: JSON.stringify({ status: select.value }),
          });
          notify('Call request updated.');
          loadBookings(el);
        } catch (error) { notify(error.message, true); }
      });
    });
  }
  async function loadCustomers(el) {
    setPageTitle('Customers');
    const rows = await api('/customers?limit=100');
    const html = (rows || []).map((user) =>
      '<tr><td><div class="primary-cell">' + escapeHtml(user.name) + '</div><div class="secondary-cell">' + escapeHtml(user.email) + '</div></td>' +
      '<td>' + escapeHtml(user.company || '—') + '</td><td>' + escapeHtml(user.phone || '—') + '</td>' +
      '<td>' + escapeHtml(user.created_at || '—') + '</td><td>' + (user.is_banned ? statusTag('declined') : statusTag('active')) + '</td></tr>'
    ).join('');
    el.innerHTML = '<div class="section-head"><div><h2>Customer accounts</h2><p>Customer records only. Owner credentials are never listed here.</p></div></div>' +
      '<div class="panel table-wrap"><table><thead><tr><th>CUSTOMER</th><th>COMPANY</th><th>PHONE</th><th>JOINED</th><th>STATUS</th></tr></thead><tbody>' +
      (html || '<tr><td colspan="5" class="empty-state">No customer accounts found.</td></tr>') + '</tbody></table></div>';
  }
  async function loadActivity(el) {
    setPageTitle('Activity log');
    const rows = await api('/activity?limit=100');
    const html = (rows || []).map((row) =>
      '<tr><td><div class="primary-cell">' + escapeHtml(row.action) + '</div><div class="secondary-cell">' + escapeHtml(row.entity_type || 'system') + '</div></td>' +
      '<td>' + escapeHtml(row.ip_address || '—') + '</td><td>' + escapeHtml(row.created_at || '—') + '</td></tr>'
    ).join('');
    el.innerHTML = '<div class="section-head"><div><h2>Security and admin activity</h2><p>Recent administrative actions recorded by the backend.</p></div></div>' +
      '<div class="panel table-wrap"><table><thead><tr><th>ACTION</th><th>IP ADDRESS</th><th>TIME (UTC)</th></tr></thead><tbody>' +
      (html || '<tr><td colspan="3" class="empty-state">No activity has been recorded yet.</td></tr>') + '</tbody></table></div>';
  }
  function loadSecurity(el) {
    setPageTitle('Security');
    el.innerHTML = '<div class="security-grid"><section class="panel security-card"><p class="eyebrow">ACCOUNT SECURITY</p><h3>Change owner password</h3><p>Use a unique password with at least 14 characters. Passwords are stored as bcrypt hashes, never as readable text.</p>' +
      '<form id="security-form" class="security-form">' +
      '<label>Current password<input id="security-current" type="password" autocomplete="current-password" required></label>' +
      '<label>New password<input id="security-new" type="password" minlength="14" autocomplete="new-password" required></label>' +
      '<label>Confirm new password<input id="security-confirm" type="password" minlength="14" autocomplete="new-password" required></label>' +
      '<button class="primary-btn" type="submit">Update password <span>↗</span></button><div id="security-message" class="form-message"></div></form></section>' +
      '<section class="panel security-card"><p class="eyebrow">PRIVATE SESSION</p><h3>Session protection</h3><p>The panel uses an HttpOnly, Secure, SameSite=Strict cookie. The session token is stored only as a SHA-256 hash on the server.</p>' +
      '<ul class="security-list"><li>Owner email allowlist</li><li>Eight-hour session expiry</li><li>One-time reset links (30 minutes)</li><li>Single-owner account setup</li><li>Login activity email alerts</li><li>Forced password change on first setup</li></ul></section></div>';
    $('#security-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = $('#security-new').value;
      if (password !== $('#security-confirm').value) return message('security-message', 'The passwords do not match.', 'error');
      try {
        await api('/change-password', {
          method: 'POST',
          body: JSON.stringify({ currentPassword: $('#security-current').value, newPassword: password }),
        });
        $('#security-current').value = '';
        $('#security-new').value = '';
        $('#security-confirm').value = '';
        message('security-message', 'Password updated successfully.', 'success');
        notify('Password updated.');
      } catch (error) { message('security-message', error.message, 'error'); }
    });
  }
  init();
})();
