// Veyrion Admin Panel
(function() {
  'use strict';

  const API = '/api/v1';
  let token = localStorage.getItem('admin_token');
  let currentUser = null;
  let currentPage = 'dashboard';

  // Auth
  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(`${API}${path}`, { ...opts, headers: { ...headers, ...opts.headers } });
      const data = await res.json();
      if (res.status === 401 && path !== '/admin/login') {
        logout();
        return null;
      }
      return data;
    } catch (err) {
      showToast('Network error', 'error');
      return null;
    }
  }

  function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.hidden = false;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.hidden = true; toast.className = 'toast'; }, 3000);
  }

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  // Login
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.hidden = true;

    const res = await api('/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (res && res.success) {
      if (res.data.user.role !== 'admin' && res.data.user.role !== 'superadmin') {
        errorEl.textContent = 'Admin access required';
        errorEl.hidden = false;
        return;
      }
      token = res.data.token;
      localStorage.setItem('admin_token', token);
      currentUser = res.data.user;
      showDashboard();
    } else {
      errorEl.textContent = res?.error?.message || 'Login failed';
      errorEl.hidden = false;
    }
  });

  function logout() {
    token = null;
    localStorage.removeItem('admin_token');
    document.getElementById('login-screen').hidden = false;
    document.getElementById('dashboard-screen').hidden = true;
  }

  document.getElementById('logout-btn').addEventListener('click', logout);

  // Navigation
  $$('.nav-item').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      $$('.nav-item').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      currentPage = link.dataset.page;
      loadPage(currentPage);
    });
  });

  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  document.getElementById('refresh-btn').addEventListener('click', () => loadPage(currentPage));

  async function showDashboard() {
    document.getElementById('login-screen').hidden = true;
    document.getElementById('dashboard-screen').hidden = false;
    if (currentUser) {
      document.getElementById('admin-name').textContent = currentUser.name;
    }
    loadPage('dashboard');
  }

  async function loadPage(page) {
    const content = document.getElementById('page-content');
    const titles = {
      dashboard: 'Dashboard', users: 'Users', products: 'Products', orders: 'Orders',
      licenses: 'Licenses', tickets: 'Tickets', coupons: 'Coupons', subscribers: 'Subscribers',
      settings: 'Settings', logs: 'Audit Logs'
    };
    document.getElementById('page-title').textContent = titles[page] || page;
    content.innerHTML = '<div class="empty-state">Loading...</div>';

    const loaders = {
      dashboard: loadDashboard, users: loadUsers, products: loadProducts,
      orders: loadOrders, licenses: loadLicenses, tickets: loadTickets,
      coupons: loadCoupons, subscribers: loadSubscribers, settings: loadSettings,
      logs: loadLogs,
    };

    if (loaders[page]) await loaders[page](content);
  }

  // Dashboard
  async function loadDashboard(el) {
    const res = await api('/admin/dashboard');
    if (!res?.success) return;
    const d = res.data;
    el.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-card__label">Revenue (30d)</div><div class="stat-card__value accent">$${d.totalRevenue.toFixed(2)}</div></div>
        <div class="stat-card"><div class="stat-card__label">Total Users</div><div class="stat-card__value">${d.totalUsers}</div></div>
        <div class="stat-card"><div class="stat-card__label">Products</div><div class="stat-card__value">${d.totalProducts}</div></div>
        <div class="stat-card"><div class="stat-card__label">Orders</div><div class="stat-card__value">${d.totalOrders}</div></div>
        <div class="stat-card"><div class="stat-card__label">Paid Orders</div><div class="stat-card__value accent">${d.paidOrders}</div></div>
        <div class="stat-card"><div class="stat-card__label">Pending Orders</div><div class="stat-card__value" style="color:var(--warning)">${d.pendingOrders}</div></div>
        <div class="stat-card"><div class="stat-card__label">Open Tickets</div><div class="stat-card__value" style="color:var(--danger)">${d.openTickets}</div></div>
        <div class="stat-card"><div class="stat-card__label">Licenses</div><div class="stat-card__value">${d.totalLicenses}</div></div>
      </div>
      <div class="table-container">
        <div class="table-header"><h3>Recent Orders</h3></div>
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            ${d.recentOrders.map(o => `
              <tr>
                <td style="font-family:var(--font-mono);font-size:12px">${o.order_number}</td>
                <td>${o.user_name || 'Unknown'}</td>
                <td>$${o.total_amount.toFixed(2)}</td>
                <td><span class="badge badge-${o.status === 'paid' ? 'green' : o.status === 'refunded' ? 'red' : 'yellow'}">${o.status}</span></td>
                <td style="color:var(--text-3)">${new Date(o.created_at).toLocaleDateString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // Users
  async function loadUsers(el, page = 1, search = '') {
    const res = await api(`/admin/users?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
    if (!res?.success) return;
    el.innerHTML = `
      <div class="filter-bar">
        <input type="text" placeholder="Search users..." id="user-search" value="${search}">
        <button class="btn btn-sm" onclick="window._adminSearchUsers()">Search</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${res.data.map(u => `
              <tr>
                <td>${u.name}</td>
                <td style="font-family:var(--font-mono);font-size:12px">${u.email}</td>
                <td><span class="badge badge-${u.role === 'superadmin' ? 'blue' : u.role === 'admin' ? 'green' : 'gray'}">${u.role}</span></td>
                <td style="color:var(--text-3)">${new Date(u.created_at).toLocaleDateString()}</td>
                <td>${u.is_banned ? '<span class="badge badge-red">Banned</span>' : '<span class="badge badge-green">Active</span>'}</td>
                <td>
                  ${u.is_banned ? `<button class="btn btn-sm" onclick="window._adminUnbanUser(${u.id})">Unban</button>` : `<button class="btn btn-sm btn-danger" onclick="window._adminBanUser(${u.id})">Ban</button>`}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${renderPagination(res.meta, 'loadUsers')}
      </div>`;

    document.getElementById('user-search')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') window._adminSearchUsers();
    });
  }

  window._adminSearchUsers = () => {
    const search = document.getElementById('user-search')?.value || '';
    loadUsers(document.getElementById('page-content'), 1, search);
  };

  window._adminBanUser = async (id) => {
    if (!confirm('Ban this user?')) return;
    await api(`/admin/users/${id}/ban`, { method: 'POST', body: JSON.stringify({ reason: 'Banned by admin' }) });
    showToast('User banned');
    loadPage('users');
  };

  window._adminUnbanUser = async (id) => {
    await api(`/admin/users/${id}/unban`, { method: 'POST' });
    showToast('User unbanned');
    loadPage('users');
  };

  // Products
  async function loadProducts(el, page = 1, search = '') {
    const res = await api(`/admin/products?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
    if (!res?.success) return;
    el.innerHTML = `
      <div class="filter-bar">
        <input type="text" placeholder="Search products..." id="product-search" value="${search}">
        <button class="btn btn-sm" onclick="window._adminSearchProducts()">Search</button>
        <button class="btn btn-sm btn-primary" onclick="window._adminCreateProduct()">+ New Product</button>
      </div>
      <div class="table-container">
        <table>
          <thead><tr><th>Name</th><th>Price</th><th>Status</th><th>Sales</th><th>Views</th><th>Actions</th></tr></thead>
          <tbody>
            ${res.data.map(p => `
              <tr>
                <td><strong>${p.name}</strong><br><span style="font-family:var(--font-mono);font-size:11px;color:var(--text-3)">${p.slug}</span></td>
                <td>$${p.price.toFixed(2)}</td>
                <td><span class="badge badge-${p.status === 'active' ? 'green' : p.status === 'draft' ? 'yellow' : 'gray'}">${p.status}</span></td>
                <td>${p.sales_count}</td>
                <td>${p.view_count}</td>
                <td>
                  <button class="btn btn-sm" onclick="window._adminEditProduct(${p.id})">Edit</button>
                  <button class="btn btn-sm btn-danger" onclick="window._adminDeleteProduct(${p.id})">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${renderPagination(res.meta, 'loadProducts')}
      </div>`;
  }

  window._adminSearchProducts = () => {
    const search = document.getElementById('product-search')?.value || '';
    loadProducts(document.getElementById('page-content'), 1, search);
  };

  window._adminCreateProduct = () => {
    showModal('Create Product', `
      <div class="field"><label>Slug</label><input id="p-slug" required></div>
      <div class="field"><label>Name</label><input id="p-name" required></div>
      <div class="field"><label>Short Description</label><input id="p-desc-short"></div>
      <div class="field"><label>Full Description</label><textarea id="p-desc-full"></textarea></div>
      <div class="field"><label>Price</label><input type="number" id="p-price" step="0.01" value="0"></div>
      <div class="field"><label>Version</label><input id="p-version" value="1.0.0"></div>
      <div class="field"><label>Status</label><select id="p-status"><option value="draft">Draft</option><option value="active">Active</option></select></div>
    `, async () => {
      const data = {
        slug: document.getElementById('p-slug').value,
        name: document.getElementById('p-name').value,
        description_short: document.getElementById('p-desc-short').value,
        description_full: document.getElementById('p-desc-full').value,
        price: parseFloat(document.getElementById('p-price').value) || 0,
        version: document.getElementById('p-version').value,
        status: document.getElementById('p-status').value,
      };
      const res = await api('/admin/products', { method: 'POST', body: JSON.stringify(data) });
      if (res?.success) { showToast('Product created'); hideModal(); loadPage('products'); }
      else showToast(res?.error?.message || 'Failed', 'error');
    });
  };

  window._adminEditProduct = async (id) => {
    const res = await api(`/admin/products/${id}`);
    if (!res?.success) return;
    const p = res.data;
    showModal('Edit Product', `
      <div class="field"><label>Slug</label><input id="p-slug" value="${p.slug}"></div>
      <div class="field"><label>Name</label><input id="p-name" value="${p.name}"></div>
      <div class="field"><label>Short Description</label><input id="p-desc-short" value="${p.description_short || ''}"></div>
      <div class="field"><label>Full Description</label><textarea id="p-desc-full">${p.description_full || ''}</textarea></div>
      <div class="field"><label>Price</label><input type="number" id="p-price" step="0.01" value="${p.price}"></div>
      <div class="field"><label>Version</label><input id="p-version" value="${p.version || ''}"></div>
      <div class="field"><label>Status</label><select id="p-status"><option value="draft" ${p.status === 'draft' ? 'selected' : ''}>Draft</option><option value="active" ${p.status === 'active' ? 'selected' : ''}>Active</option><option value="archived" ${p.status === 'archived' ? 'selected' : ''}>Archived</option></select></div>
    `, async () => {
      const data = {
        slug: document.getElementById('p-slug').value,
        name: document.getElementById('p-name').value,
        description_short: document.getElementById('p-desc-short').value,
        description_full: document.getElementById('p-desc-full').value,
        price: parseFloat(document.getElementById('p-price').value) || 0,
        version: document.getElementById('p-version').value,
        status: document.getElementById('p-status').value,
      };
      const res2 = await api(`/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      if (res2?.success) { showToast('Product updated'); hideModal(); loadPage('products'); }
      else showToast(res2?.error?.message || 'Failed', 'error');
    });
  };

  window._adminDeleteProduct = async (id) => {
    if (!confirm('Delete this product?')) return;
    await api(`/admin/products/${id}`, { method: 'DELETE' });
    showToast('Product deleted');
    loadPage('products');
  };

  // Orders
  async function loadOrders(el, page = 1) {
    const res = await api(`/admin/orders?page=${page}&limit=20`);
    if (!res?.success) return;
    el.innerHTML = `
      <div class="table-container">
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            ${res.data.map(o => `
              <tr>
                <td style="font-family:var(--font-mono);font-size:12px">${o.order_number}</td>
                <td>${o.user_name || 'Unknown'}<br><span style="font-size:11px;color:var(--text-3)">${o.user_email || ''}</span></td>
                <td>$${o.total_amount.toFixed(2)}</td>
                <td><span class="badge badge-${o.status === 'paid' ? 'green' : o.status === 'refunded' ? 'red' : 'yellow'}">${o.status}</span></td>
                <td style="color:var(--text-3)">${new Date(o.created_at).toLocaleDateString()}</td>
                <td>
                  ${o.status === 'pending' ? `<button class="btn btn-sm btn-primary" onclick="window._adminMarkPaid(${o.id})">Mark Paid</button>` : ''}
                  ${o.status === 'paid' ? `<button class="btn btn-sm btn-danger" onclick="window._adminRefundOrder(${o.id})">Refund</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${renderPagination(res.meta, 'loadOrders')}
      </div>`;
  }

  window._adminMarkPaid = async (id) => {
    await api(`/admin/orders/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'paid' }) });
    showToast('Order marked as paid');
    loadPage('orders');
  };

  window._adminRefundOrder = async (id) => {
    if (!confirm('Refund this order?')) return;
    await api(`/admin/orders/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'refunded' }) });
    showToast('Order refunded');
    loadPage('orders');
  };

  // Licenses
  async function loadLicenses(el, page = 1) {
    const res = await api(`/admin/licenses?page=${page}&limit=20`);
    if (!res?.success) return;
    el.innerHTML = `
      <div class="table-container">
        <table>
          <thead><tr><th>License Key</th><th>Product</th><th>User</th><th>Status</th><th>Activations</th><th>Actions</th></tr></thead>
          <tbody>
            ${res.data.map(l => `
              <tr>
                <td style="font-family:var(--font-mono);font-size:12px">${l.license_key}</td>
                <td>${l.product_name || 'N/A'}</td>
                <td>${l.user_name || l.user_email || 'N/A'}</td>
                <td><span class="badge badge-${l.status === 'active' ? 'green' : 'red'}">${l.status}</span></td>
                <td>${l.activations_count}/${l.activations_limit}</td>
                <td>
                  ${l.status === 'active' ? `<button class="btn btn-sm btn-danger" onclick="window._adminRevokeLicense(${l.id})">Revoke</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${renderPagination(res.meta, 'loadLicenses')}
      </div>`;
  }

  window._adminRevokeLicense = async (id) => {
    if (!confirm('Revoke this license?')) return;
    await api(`/admin/licenses/${id}/revoke`, { method: 'PUT' });
    showToast('License revoked');
    loadPage('licenses');
  };

  // Tickets
  async function loadTickets(el, page = 1) {
    const res = await api(`/admin/tickets?page=${page}&limit=20`);
    if (!res?.success) return;
    el.innerHTML = `
      <div class="table-container">
        <table>
          <thead><tr><th>Subject</th><th>User</th><th>Priority</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            ${res.data.map(t => `
              <tr>
                <td><strong>${t.subject}</strong></td>
                <td>${t.user_name || 'Unknown'}</td>
                <td><span class="badge badge-${t.priority === 'urgent' ? 'red' : t.priority === 'high' ? 'yellow' : 'gray'}">${t.priority}</span></td>
                <td><span class="badge badge-${t.status === 'open' ? 'green' : t.status === 'closed' ? 'gray' : 'blue'}">${t.status}</span></td>
                <td style="color:var(--text-3)">${new Date(t.created_at).toLocaleDateString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${renderPagination(res.meta, 'loadTickets')}
      </div>`;
  }

  // Coupons
  async function loadCoupons(el) {
    el.innerHTML = `<div class="empty-state">Coupon management — create coupons from the API or add a coupon form here.</div>`;
  }

  // Subscribers
  async function loadSubscribers(el) {
    el.innerHTML = `<div class="empty-state">Subscriber list — newsletter subscribers will appear here.</div>`;
  }

  // Settings
  async function loadSettings(el) {
    const res = await api('/admin/settings');
    if (!res?.success) return;
    el.innerHTML = `
      <div class="table-container">
        <div class="table-header"><h3>Settings</h3></div>
        <table>
          <thead><tr><th>Key</th><th>Value</th><th>Group</th><th>Actions</th></tr></thead>
          <tbody>
            ${res.data.map(s => `
              <tr>
                <td style="font-family:var(--font-mono);font-size:12px">${s.key}</td>
                <td><input type="text" class="setting-input" data-key="${s.key}" value="${s.value || ''}" style="background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius);padding:4px 8px;color:var(--text);font-size:13px;width:300px;"></td>
                <td><span class="badge badge-gray">${s.setting_group}</span></td>
                <td><button class="btn btn-sm" onclick="window._adminSaveSetting('${s.key}')">Save</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }

  window._adminSaveSetting = async (key) => {
    const input = document.querySelector(`.setting-input[data-key="${key}"]`);
    if (!input) return;
    await api('/admin/settings', { method: 'PUT', body: JSON.stringify({ key, value: input.value }) });
    showToast(`Setting "${key}" updated`);
  };

  // Audit Logs
  async function loadLogs(el, page = 1) {
    const res = await api(`/admin/logs?page=${page}&limit=50`);
    if (!res?.success) { el.innerHTML = '<div class="empty-state">Access denied. Superadmin only.</div>'; return; }
    el.innerHTML = `
      <div class="table-container">
        <table>
          <thead><tr><th>Date</th><th>Admin</th><th>Action</th><th>Entity</th><th>IP</th></tr></thead>
          <tbody>
            ${res.data.map(l => `
              <tr>
                <td style="color:var(--text-3)">${new Date(l.created_at).toLocaleString()}</td>
                <td>${l.admin_name || 'Unknown'}</td>
                <td><span class="badge badge-blue">${l.action}</span></td>
                <td>${l.entity_type || ''} ${l.entity_id || ''}</td>
                <td style="font-family:var(--font-mono);font-size:11px">${l.ip_address || ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${renderPagination(res.meta, 'loadLogs')}
      </div>`;
  }

  // Helpers
  function renderPagination(meta, loaderName) {
    if (!meta || meta.totalPages <= 1) return '';
    let html = '<div class="pagination">';
    if (meta.page > 1) html += `<button onclick="window._adminPaginate('${loaderName}', ${meta.page - 1})">Prev</button>`;
    for (let i = 1; i <= meta.totalPages && i <= 5; i++) {
      html += `<button class="${i === meta.page ? 'active' : ''}" onclick="window._adminPaginate('${loaderName}', ${i})">${i}</button>`;
    }
    if (meta.page < meta.totalPages) html += `<button onclick="window._adminPaginate('${loaderName}', ${meta.page + 1})">Next</button>`;
    html += '</div>';
    return html;
  }

  window._adminPaginate = (loaderName, page) => {
    const loaders = { loadUsers, loadProducts, loadOrders, loadLicenses, loadTickets, loadLogs };
    if (loaders[loaderName]) loaders[loaderName](document.getElementById('page-content'), page);
  };

  function showModal(title, bodyHtml, onConfirm) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn" onclick="window._hideModal()">Cancel</button>
      <button class="btn btn-primary" id="modal-confirm">Save</button>
    `;
    document.getElementById('modal').hidden = false;
    document.getElementById('modal-confirm')?.addEventListener('click', onConfirm);
    document.getElementById('modal-close')?.addEventListener('click', hideModal);
    document.querySelector('.modal-backdrop')?.addEventListener('click', hideModal);
  }

  function hideModal() { document.getElementById('modal').hidden = true; }
  window._hideModal = hideModal;

  // Init
  if (token) {
    api('/admin/dashboard').then(res => {
      if (res?.success) showDashboard();
      else logout();
    });
  }
})();
