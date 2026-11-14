
(function () {
  'use strict';
  const API = '/api/v1/admin';
  let currentUser = null;
  let currentPage = 'overview';
  let siteConfig = { version: 1, patches: {} };
  let selectedStudioSelector = '';
  let studioFrame = null;
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
      if (page === 'security') return loadSecurity(content);
      if (page === 'site-studio') return await loadSiteStudio(content);
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

  async function loadSiteStudio(el) {
    setPageTitle('Site Studio');
    const items = await api('/content');
    const configResult = await api('/site/config');
    let liveConfig = configResult.config || { version: 1, patches: {} };
    if (!liveConfig.patches || typeof liveConfig.patches !== 'object') liveConfig.patches = {};
    const pageLabels = { 'index.html':'Home', 'about.html':'About', 'backend.html':'Backend', 'frontend.html':'Frontend', 'saas.html':'SaaS', 'games.html':'Games', 'security.html':'Security', 'services.html':'Services', 'case-studies.html':'Work', 'process.html':'Process', 'blog.html':'Blog', 'contact.html':'Contact', 'faq.html':'FAQ' };
    let selectedSelector = '';
    const oldHandler = window.__veyrionStudioMessageHandler;
    if (oldHandler) window.removeEventListener('message', oldHandler);
    el.innerHTML =
      '<div class="section-head"><div><h2>Manage the live website</h2><p>Edit existing text visually, or add new sections, articles and projects.</p></div><span class="secure-pill">OWNER ONLY</span></div>' +
      '<section class="panel cms-visual"><div class="cms-panel-head"><div><h3>Visual page editor</h3><p>Choose a page, then click a heading or paragraph in the preview to edit it.</p></div><div class="cms-visual-toolbar"><select id="studio-page" aria-label="Preview page">' + Object.keys(pageLabels).map(key => '<option value="' + key + '">' + escapeHtml(pageLabels[key]) + '</option>').join('') + '</select><button id="studio-refresh" class="ghost-btn" type="button">Refresh preview ↻</button></div></div>' +
      '<div class="cms-visual-grid"><div class="cms-preview-wrap"><iframe id="studio-frame" title="Live website preview" src="/index.html?studio=1"></iframe></div><div class="cms-inspector"><p class="eyebrow">SELECTED ELEMENT</p><p id="studio-selection" class="cms-selection">Click a heading or paragraph in the preview.</p>' +
      '<label>Text<input id="studio-text" type="text" maxlength="500" placeholder="Select an element first"></label><div class="cms-two"><label>Text colour<input id="studio-color" type="text" placeholder="#ffffff"></label><label>Background<input id="studio-bg" type="text" placeholder="#101216"></label></div>' +
      '<div class="cms-two"><label>Font size<input id="studio-size" type="text" placeholder="e.g. 18px"></label><label>Border radius<input id="studio-radius" type="text" placeholder="e.g. 8px"></label></div>' +
      '<div class="cms-form-actions"><button id="studio-save" class="primary-btn" type="button" disabled>Save visual change</button><button id="studio-clear" class="ghost-btn" type="button" disabled>Remove override</button></div><p class="form-hint">Changes are stored as safe text and style overrides. Select text elements rather than large containers to preserve the page layout.</p></div></div></section>' +
      '<div class="cms-layout"><section class="panel cms-library"><div class="cms-panel-head"><div><h3>Your content</h3><p>Published items appear on the live website.</p></div><button id="cms-new" class="ghost-btn" type="button">＋ New item</button></div><div id="cms-items" class="cms-items"></div></section>' +
      '<section class="panel cms-editor"><div class="cms-panel-head"><div><h3 id="cms-form-title">Create content</h3><p>Add a page section, blog article or project. Drafts remain private.</p></div></div>' +
      '<form id="cms-form" class="cms-form"><input id="cms-id" type="hidden">' +
      '<label>Content type<select id="cms-type"><option value="section">Page section</option><option value="article">Blog article</option><option value="project">Project / work item</option></select></label>' +
      '<label>Page<select id="cms-page">' + Object.entries(pageLabels).map(([key,label]) => '<option value="' + (key === 'index.html' ? 'home' : key.replace('.html','')) + '">' + escapeHtml(label) + '</option>').join('') + '</select></label>' +
      '<label>URL slug<input id="cms-slug" maxlength="80" placeholder="generated-from-title"></label>' +
      '<label>Small label<input id="cms-eyebrow" maxlength="80" placeholder="OPTIONAL LABEL"></label>' +
      '<label>Title<input id="cms-title" maxlength="140" required></label>' +
      '<label>Body<textarea id="cms-body" rows="7" maxlength="8000" placeholder="Plain text. Separate paragraphs with a blank line."></textarea></label>' +
      '<label>Image URL (optional)<input id="cms-image" type="url" placeholder="https://..."></label>' +
      '<div class="cms-two"><label>Button label<input id="cms-cta-label" maxlength="60" placeholder="Learn more"></label><label>Button link<input id="cms-cta-url" maxlength="500" placeholder="/contact.html"></label></div>' +
      '<div class="cms-two"><label>Sort order<input id="cms-order" type="number" value="0" min="-10000" max="10000"></label><label>Visibility<select id="cms-status"><option value="draft">Draft</option><option value="published">Published</option></select></label></div>' +
      '<div class="cms-form-actions"><button id="cms-save" class="primary-btn" type="submit">Save content</button><button id="cms-cancel" class="ghost-btn" type="button">Clear form</button></div><p class="form-hint">Articles appear on Blog. Projects appear on Work. Sections are added near the bottom of the selected page. Use HTTPS image links. Raw HTML is not accepted.</p><div id="cms-message" class="form-message" aria-live="polite"></div></form></section></div>';

    const frame = $('#studio-frame');
    const textInput = $('#studio-text');
    const styleInputs = { color: $('#studio-color'), backgroundColor: $('#studio-bg'), fontSize: $('#studio-size'), borderRadius: $('#studio-radius') };
    function sendPreview() {
      if (!selectedSelector || !frame.contentWindow) return;
      const patch = { text: textInput.value, styles: {} };
      Object.entries(styleInputs).forEach(([key,input]) => { if (input.value.trim()) patch.styles[key] = input.value.trim(); });
      liveConfig.patches[selectedSelector] = patch;
      frame.contentWindow.postMessage({ type: 'veyrion:live-config', config: liveConfig }, location.origin);
    }
    const handler = event => {
      if (event.origin !== location.origin || event.source !== frame.contentWindow || !event.data || event.data.type !== 'veyrion:select') return;
      selectedSelector = String(event.data.selector || '');
      $('#studio-selection').textContent = selectedSelector || 'No element selected';
      textInput.value = String(event.data.text || '').slice(0,500);
      const styles = event.data.styles || {};
      styleInputs.color.value = styles.color || '';
      styleInputs.backgroundColor.value = styles.backgroundColor || '';
      styleInputs.fontSize.value = styles.fontSize || '';
      styleInputs.borderRadius.value = styles.borderRadius || '';
      $('#studio-save').disabled = !selectedSelector;
      $('#studio-clear').disabled = !selectedSelector;
    };
    window.__veyrionStudioMessageHandler = handler;
    window.addEventListener('message', handler);
    textInput.addEventListener('input', sendPreview);
    Object.values(styleInputs).forEach(input => input.addEventListener('input', sendPreview));
    $('#studio-page').addEventListener('change', () => { frame.src = '/' + $('#studio-page').value + '?studio=1'; selectedSelector = ''; $('#studio-selection').textContent = 'Click a heading or paragraph in the preview.'; });
    $('#studio-refresh').addEventListener('click', () => { const page = $('#studio-page').value; frame.src = '/' + page + '?studio=1&refresh=' + Date.now(); });
    $('#studio-save').addEventListener('click', async () => {
      if (!selectedSelector) return;
      try { await api('/site/config', { method: 'PUT', body: JSON.stringify({ config: liveConfig }) }); notify('Visual change saved.'); }
      catch (error) { notify(error.message, true); }
    });
    $('#studio-clear').addEventListener('click', async () => {
      if (!selectedSelector) return;
      delete liveConfig.patches[selectedSelector];
      try { await api('/site/config', { method: 'PUT', body: JSON.stringify({ config: liveConfig }) }); notify('Visual override removed.'); frame.contentWindow.postMessage({ type: 'veyrion:live-config', config: liveConfig }, location.origin); }
      catch (error) { notify(error.message, true); }
    });

    const pageOptions = {home:'Home',about:'About',backend:'Backend',frontend:'Frontend',saas:'SaaS',games:'Games',security:'Security',services:'Services','case-studies':'Work',process:'Process',blog:'Blog',contact:'Contact',faq:'FAQ',careers:'Collaboration',changelog:'Development log',opensource:'Open source',store:'Store',docs:'Docs'};
    function renderItems() {
      const rows = (items || []).map(item => '<article class="cms-item"><div class="cms-item__main"><div class="cms-item__meta"><span class="status-tag">' + escapeHtml(item.content_type) + '</span>' + statusTag(item.status) + '<span class="secondary-cell">' + escapeHtml(pageOptions[item.page_key] || item.page_key) + '</span></div><strong>' + escapeHtml(item.title) + '</strong><small>/' + escapeHtml(item.slug) + '</small></div><div class="cms-item__actions"><button class="small-btn" type="button" data-edit="' + item.id + '">Edit</button><button class="small-btn cms-delete" type="button" data-delete="' + item.id + '">Delete</button></div></article>').join('');
      $('#cms-items').innerHTML = rows || '<div class="empty-state">No custom content yet. Create your first section, article or project.</div>';
      $$('[data-edit]').forEach(button => button.addEventListener('click', () => {
        const item = items.find(row => String(row.id) === button.dataset.edit); if (!item) return;
        $('#cms-id').value = item.id; $('#cms-type').value = item.content_type; $('#cms-page').value = item.page_key;
        $('#cms-slug').value = item.slug; $('#cms-eyebrow').value = item.eyebrow || ''; $('#cms-title').value = item.title;
        $('#cms-body').value = item.body || ''; $('#cms-image').value = item.image_url || '';
        $('#cms-cta-label').value = item.cta_label || ''; $('#cms-cta-url').value = item.cta_url || '';
        $('#cms-order').value = item.sort_order || 0; $('#cms-status').value = item.status;
        $('#cms-form-title').textContent = 'Edit content'; $('#cms-save').textContent = 'Save changes'; syncPageField(); $('#cms-title').focus();
      }));
      $$('[data-delete]').forEach(button => button.addEventListener('click', async () => {
        const item = items.find(row => String(row.id) === button.dataset.delete);
        if (!item || !window.confirm('Delete "' + item.title + '"? This cannot be undone.')) return;
        try { await api('/content/' + item.id, { method: 'DELETE' }); notify('Content deleted.'); await loadSiteStudio(el); }
        catch (error) { notify(error.message, true); }
      }));
    }
    function syncPageField() {
      const type = $('#cms-type').value;
      if (type === 'article') { $('#cms-page').value = 'blog'; $('#cms-page').disabled = true; }
      else if (type === 'project') { $('#cms-page').value = 'case-studies'; $('#cms-page').disabled = true; }
      else $('#cms-page').disabled = false;
    }
    function clearForm() {
      $('#cms-form').reset(); $('#cms-id').value = ''; $('#cms-page').disabled = false; $('#cms-order').value = '0';
      $('#cms-form-title').textContent = 'Create content'; $('#cms-save').textContent = 'Save content'; $('#cms-message').textContent = '';
    }
    $('#cms-type').addEventListener('change', syncPageField);
    $('#cms-new').addEventListener('click', () => { clearForm(); $('#cms-title').focus(); });
    $('#cms-cancel').addEventListener('click', clearForm);
    $('#cms-form').addEventListener('submit', async event => {
      event.preventDefault();
      const id = $('#cms-id').value;
      const payload = { content_type:$('#cms-type').value, page_key:$('#cms-page').value, slug:$('#cms-slug').value, eyebrow:$('#cms-eyebrow').value, title:$('#cms-title').value, body:$('#cms-body').value, image_url:$('#cms-image').value, cta_label:$('#cms-cta-label').value, cta_url:$('#cms-cta-url').value, sort_order:Number($('#cms-order').value), status:$('#cms-status').value };
      const button = $('#cms-save'); button.disabled = true;
      try { await api(id ? '/content/' + id : '/content', { method:id ? 'PUT' : 'POST', body:JSON.stringify(payload) }); notify(id ? 'Content updated.' : 'Content created.'); await loadSiteStudio(el); }
      catch (error) { $('#cms-message').textContent = error.message; $('#cms-message').className = 'form-message error'; }
      finally { button.disabled = false; }
    });
    syncPageField();
    renderItems();
  }

  init();
})();
