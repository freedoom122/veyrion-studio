// Veyrion Admin Panel
(function() {
  'use strict';

  const API = '/api/v1';
  let token = localStorage.getItem('admin_token');
  let currentUser = null;
  let currentPage = 'dashboard';

  // API helper
  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    try {
      const res = await fetch(API + path, Object.assign({}, opts, { headers: Object.assign({}, headers, opts.headers) }));
      const data = await res.json();
      if (res.status === 401 && path !== '/admin/login' && path !== '/admin/google-login') {
        logout();
        return null;
      }
      return data;
    } catch (err) {
      showToast('Network error', 'error');
      return null;
    }
  }

  function showToast(msg, type) {
    type = type || 'success';
    var toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.hidden = false;
    toast.className = 'toast show ' + type;
    setTimeout(function() { toast.hidden = true; toast.className = 'toast'; }, 3000);
  }

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  // ============ SHOW ERRORS FROM OAUTH CALLBACK ============
  var urlParams = new URLSearchParams(window.location.search);
  var errorParam = urlParams.get('error');
  if (errorParam) {
    var errEl = document.getElementById('login-error');
    errEl.textContent = errorParam;
    errEl.hidden = false;
    window.history.replaceState({}, '', '/admin/');
  }

  // Auto-login if token was set by OAuth callback
  var storedUser = null;
  try { storedUser = JSON.parse(localStorage.getItem('admin_user')); } catch (_) {}
  if (token && storedUser && storedUser.email) {
    currentUser = storedUser;
    showDashboard();
  }

  // ============ EMAIL/PASSWORD LOGIN ============
  document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    var email = document.getElementById('login-email').value;
    var password = document.getElementById('login-password').value;
    var errorEl = document.getElementById('login-error');
    errorEl.hidden = true;

    var res = await api('/admin/login', { method: 'POST', body: JSON.stringify({ email: email, password: password }) });
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
      errorEl.textContent = (res && res.error && res.error.message) || 'Login failed';
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

  // ============ NAVIGATION ============
  $$('.nav-item').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      $$('.nav-item').forEach(function(l) { l.classList.remove('active'); });
      link.classList.add('active');
      currentPage = link.dataset.page;
      loadPage(currentPage);
      // Close sidebar on mobile
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  document.getElementById('sidebar-toggle').addEventListener('click', function() {
    document.getElementById('sidebar').classList.toggle('open');
  });

  document.getElementById('refresh-btn').addEventListener('click', function() { loadPage(currentPage); });

  async function showDashboard() {
    document.getElementById('login-screen').hidden = true;
    document.getElementById('dashboard-screen').hidden = false;
    if (currentUser) {
      document.getElementById('admin-name').textContent = currentUser.name + ' (' + currentUser.role + ')';
    }
    loadPage('dashboard');
  }

  async function loadPage(page) {
    var content = document.getElementById('page-content');
    var titles = {
      dashboard: 'Dashboard', users: 'Users', products: 'Products', orders: 'Orders',
      licenses: 'Licenses', tickets: 'Tickets', contacts: 'Contact Submissions',
      coupons: 'Coupons', subscribers: 'Subscribers',
      settings: 'Settings', logs: 'Audit Logs'
    };
    document.getElementById('page-title').textContent = titles[page] || page;
    content.innerHTML = '<div class="empty-state">Loading...</div>';

    var loaders = {
      dashboard: loadDashboard, users: loadUsers, products: loadProducts,
      orders: loadOrders, licenses: loadLicenses, tickets: loadTickets,
      settings: loadSettings, logs: loadLogs, contacts: loadContacts,
      coupons: loadCoupons, subscribers: loadSubscribers,
    };

    if (loaders[page]) await loaders[page](content);
  }

  // ============ DASHBOARD ============
  async function loadDashboard(el) {
    var res = await api('/admin/dashboard');
    if (!res || !res.success) return;
    var d = res.data;
    el.innerHTML =
      '<div class="stats-grid">' +
        '<div class="stat-card"><div class="stat-card__label">Revenue (30d)</div><div class="stat-card__value accent">$' + d.totalRevenue.toFixed(2) + '</div></div>' +
        '<div class="stat-card"><div class="stat-card__label">Total Users</div><div class="stat-card__value">' + d.totalUsers + '</div></div>' +
        '<div class="stat-card"><div class="stat-card__label">Products</div><div class="stat-card__value">' + d.totalProducts + '</div></div>' +
        '<div class="stat-card"><div class="stat-card__label">Orders</div><div class="stat-card__value">' + d.totalOrders + '</div></div>' +
        '<div class="stat-card"><div class="stat-card__label">Paid Orders</div><div class="stat-card__value accent">' + d.paidOrders + '</div></div>' +
        '<div class="stat-card"><div class="stat-card__label">Pending Orders</div><div class="stat-card__value" style="color:var(--warning)">' + d.pendingOrders + '</div></div>' +
        '<div class="stat-card"><div class="stat-card__label">Open Tickets</div><div class="stat-card__value" style="color:var(--danger)">' + d.openTickets + '</div></div>' +
        '<div class="stat-card"><div class="stat-card__label">Licenses</div><div class="stat-card__value">' + d.totalLicenses + '</div></div>' +
      '</div>' +
      '<div class="table-container">' +
        '<div class="table-header"><h3>Recent Orders</h3></div>' +
        '<table><thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>' +
        d.recentOrders.map(function(o) {
          return '<tr><td style="font-family:var(--font-mono);font-size:12px">' + o.order_number + '</td>' +
            '<td>' + (o.user_name || 'Unknown') + '</td>' +
            '<td>$' + o.total_amount.toFixed(2) + '</td>' +
            '<td><span class="badge badge-' + (o.status === 'paid' ? 'green' : o.status === 'refunded' ? 'red' : 'yellow') + '">' + o.status + '</span></td>' +
            '<td style="color:var(--text-3)">' + new Date(o.created_at).toLocaleDateString() + '</td></tr>';
        }).join('') +
        '</tbody></table></div>';
  }

  // ============ USERS ============
  async function loadUsers(el, page, search) {
    page = page || 1;
    search = search || '';
    var res = await api('/admin/users?page=' + page + '&limit=20&search=' + encodeURIComponent(search));
    if (!res || !res.success) return;
    el.innerHTML =
      '<div class="filter-bar">' +
        '<input type="text" placeholder="Search users..." id="user-search" value="' + search + '">' +
        '<button class="btn btn-sm" onclick="window._adminSearchUsers()">Search</button>' +
      '</div>' +
      '<div class="table-container"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
      res.data.map(function(u) {
        return '<tr>' +
          '<td><strong>' + u.name + '</strong></td>' +
          '<td style="font-family:var(--font-mono);font-size:12px">' + u.email + '</td>' +
          '<td><span class="badge badge-' + (u.role === 'superadmin' ? 'blue' : u.role === 'admin' ? 'green' : 'gray') + '">' + u.role + '</span></td>' +
          '<td style="color:var(--text-3)">' + new Date(u.created_at).toLocaleDateString() + '</td>' +
          '<td>' + (u.is_banned ? '<span class="badge badge-red">Banned</span>' : '<span class="badge badge-green">Active</span>') + '</td>' +
          '<td class="action-cell">' +
            '<button class="btn btn-sm" onclick="window._adminEditUser(' + u.id + ')">Edit</button> ' +
            (u.is_banned
              ? '<button class="btn btn-sm" onclick="window._adminUnbanUser(' + u.id + ')">Unban</button>'
              : '<button class="btn btn-sm btn-danger" onclick="window._adminBanUser(' + u.id + ')">Ban</button>') +
          '</td></tr>';
      }).join('') +
      '</tbody></table>' + renderPagination(res.meta, 'loadUsers') + '</div>';

    document.getElementById('user-search').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') window._adminSearchUsers();
    });
  }

  window._adminSearchUsers = function() {
    var search = document.getElementById('user-search').value || '';
    loadUsers(document.getElementById('page-content'), 1, search);
  };

  window._adminEditUser = async function(id) {
    var res = await api('/admin/users/' + id);
    if (!res || !res.success) return;
    var u = res.data;
    showModal('Edit User — ' + u.name,
      '<div class="field"><label>Name</label><input id="u-name" value="' + (u.name || '') + '"></div>' +
      '<div class="field"><label>Email</label><input id="u-email" value="' + (u.email || '') + '" disabled style="opacity:0.5"></div>' +
      '<div class="field"><label>Company</label><input id="u-company" value="' + (u.company || '') + '"></div>' +
      '<div class="field"><label>Phone</label><input id="u-phone" value="' + (u.phone || '') + '"></div>' +
      '<div class="field"><label>Role</label><select id="u-role">' +
        '<option value="customer"' + (u.role === 'customer' ? ' selected' : '') + '>Customer</option>' +
        '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>Admin</option>' +
        '<option value="superadmin"' + (u.role === 'superadmin' ? ' selected' : '') + '>Super Admin</option>' +
      '</select></div>' +
      '<div class="field"><label>New Password (leave blank to keep current)</label><input id="u-password" type="password" placeholder="Min 8 characters"></div>' +
      '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">' +
        '<button class="btn btn-sm btn-danger" onclick="window._adminDeleteUser(' + u.id + ')">Delete User</button>' +
      '</div>',
      async function() {
        var data = {
          name: document.getElementById('u-name').value,
          company: document.getElementById('u-company').value,
          phone: document.getElementById('u-phone').value,
        };
        // Update user info
        await api('/admin/users/' + id, { method: 'PUT', body: JSON.stringify(data) });

        // Change role if changed
        var newRole = document.getElementById('u-role').value;
        if (newRole !== u.role) {
          await api('/admin/users/' + id + '/role', { method: 'PUT', body: JSON.stringify({ role: newRole }) });
        }

        // Change password if provided
        var newPass = document.getElementById('u-password').value;
        if (newPass && newPass.length >= 8) {
          var pwRes = await api('/admin/users/' + id + '/password', { method: 'PUT', body: JSON.stringify({ password: newPass }) });
          if (pwRes && pwRes.success) showToast('Password updated');
          else showToast('Password change failed', 'error');
        }

        showToast('User updated');
        hideModal();
        loadPage('users');
      }
    );
  };

  window._adminBanUser = async function(id) {
    if (!confirm('Ban this user?')) return;
    await api('/admin/users/' + id + '/ban', { method: 'POST', body: JSON.stringify({ reason: 'Banned by admin' }) });
    showToast('User banned');
    loadPage('users');
  };

  window._adminUnbanUser = async function(id) {
    await api('/admin/users/' + id + '/unban', { method: 'POST' });
    showToast('User unbanned');
    loadPage('users');
  };

  window._adminDeleteUser = async function(id) {
    if (!confirm('Permanently delete this user? This cannot be undone.')) return;
    await api('/admin/users/' + id, { method: 'DELETE' });
    showToast('User deleted');
    hideModal();
    loadPage('users');
  };

  // ============ PRODUCTS ============
  async function loadProducts(el, page, search) {
    page = page || 1;
    search = search || '';
    var res = await api('/admin/products?page=' + page + '&limit=20&search=' + encodeURIComponent(search));
    if (!res || !res.success) return;
    el.innerHTML =
      '<div class="filter-bar">' +
        '<input type="text" placeholder="Search products..." id="product-search" value="' + search + '">' +
        '<button class="btn btn-sm" onclick="window._adminSearchProducts()">Search</button>' +
        '<button class="btn btn-sm btn-primary" onclick="window._adminCreateProduct()">+ New Product</button>' +
      '</div>' +
      '<div class="table-container"><table><thead><tr><th>Name</th><th>Price</th><th>Status</th><th>Sales</th><th>Views</th><th>Actions</th></tr></thead><tbody>' +
      res.data.map(function(p) {
        return '<tr>' +
          '<td><strong>' + p.name + '</strong><br><span style="font-family:var(--font-mono);font-size:11px;color:var(--text-3)">' + p.slug + '</span></td>' +
          '<td>$' + p.price.toFixed(2) + '</td>' +
          '<td><span class="badge badge-' + (p.status === 'active' ? 'green' : p.status === 'draft' ? 'yellow' : 'gray') + '">' + p.status + '</span></td>' +
          '<td>' + p.sales_count + '</td>' +
          '<td>' + p.view_count + '</td>' +
          '<td class="action-cell">' +
            '<button class="btn btn-sm" onclick="window._adminEditProduct(' + p.id + ')">Edit</button> ' +
            '<button class="btn btn-sm btn-danger" onclick="window._adminDeleteProduct(' + p.id + ')">Delete</button>' +
          '</td></tr>';
      }).join('') +
      '</tbody></table>' + renderPagination(res.meta, 'loadProducts') + '</div>';
  }

  window._adminSearchProducts = function() {
    var search = document.getElementById('product-search').value || '';
    loadProducts(document.getElementById('page-content'), 1, search);
  };

  window._adminCreateProduct = function() {
    showModal('Create Product',
      '<div class="field"><label>Slug</label><input id="p-slug" required></div>' +
      '<div class="field"><label>Name</label><input id="p-name" required></div>' +
      '<div class="field"><label>Short Description</label><input id="p-desc-short"></div>' +
      '<div class="field"><label>Full Description</label><textarea id="p-desc-full"></textarea></div>' +
      '<div class="field"><label>Price</label><input type="number" id="p-price" step="0.01" value="0"></div>' +
      '<div class="field"><label>Version</label><input id="p-version" value="1.0.0"></div>' +
      '<div class="field"><label>Status</label><select id="p-status"><option value="draft">Draft</option><option value="active">Active</option></select></div>',
      async function() {
        var data = {
          slug: document.getElementById('p-slug').value,
          name: document.getElementById('p-name').value,
          description_short: document.getElementById('p-desc-short').value,
          description_full: document.getElementById('p-desc-full').value,
          price: parseFloat(document.getElementById('p-price').value) || 0,
          version: document.getElementById('p-version').value,
          status: document.getElementById('p-status').value,
        };
        var res = await api('/admin/products', { method: 'POST', body: JSON.stringify(data) });
        if (res && res.success) { showToast('Product created'); hideModal(); loadPage('products'); }
        else showToast((res && res.error && res.error.message) || 'Failed', 'error');
      }
    );
  };

  window._adminEditProduct = async function(id) {
    var res = await api('/admin/products/' + id);
    if (!res || !res.success) return;
    var p = res.data;
    showModal('Edit Product',
      '<div class="field"><label>Slug</label><input id="p-slug" value="' + p.slug + '"></div>' +
      '<div class="field"><label>Name</label><input id="p-name" value="' + p.name + '"></div>' +
      '<div class="field"><label>Short Description</label><input id="p-desc-short" value="' + (p.description_short || '') + '"></div>' +
      '<div class="field"><label>Full Description</label><textarea id="p-desc-full">' + (p.description_full || '') + '</textarea></div>' +
      '<div class="field"><label>Price</label><input type="number" id="p-price" step="0.01" value="' + p.price + '"></div>' +
      '<div class="field"><label>Version</label><input id="p-version" value="' + (p.version || '') + '"></div>' +
      '<div class="field"><label>Status</label><select id="p-status">' +
        '<option value="draft"' + (p.status === 'draft' ? ' selected' : '') + '>Draft</option>' +
        '<option value="active"' + (p.status === 'active' ? ' selected' : '') + '>Active</option>' +
        '<option value="archived"' + (p.status === 'archived' ? ' selected' : '') + '>Archived</option>' +
      '</select></div>',
      async function() {
        var data = {
          slug: document.getElementById('p-slug').value,
          name: document.getElementById('p-name').value,
          description_short: document.getElementById('p-desc-short').value,
          description_full: document.getElementById('p-desc-full').value,
          price: parseFloat(document.getElementById('p-price').value) || 0,
          version: document.getElementById('p-version').value,
          status: document.getElementById('p-status').value,
        };
        var res2 = await api('/admin/products/' + id, { method: 'PUT', body: JSON.stringify(data) });
        if (res2 && res2.success) { showToast('Product updated'); hideModal(); loadPage('products'); }
        else showToast((res2 && res2.error && res2.error.message) || 'Failed', 'error');
      }
    );
  };

  window._adminDeleteProduct = async function(id) {
    if (!confirm('Delete this product?')) return;
    await api('/admin/products/' + id, { method: 'DELETE' });
    showToast('Product deleted');
    loadPage('products');
  };

  // ============ ORDERS ============
  async function loadOrders(el, page) {
    page = page || 1;
    var res = await api('/admin/orders?page=' + page + '&limit=20');
    if (!res || !res.success) return;
    el.innerHTML =
      '<div class="table-container"><table><thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>' +
      res.data.map(function(o) {
        return '<tr>' +
          '<td style="font-family:var(--font-mono);font-size:12px">' + o.order_number + '</td>' +
          '<td>' + (o.user_name || 'Unknown') + '<br><span style="font-size:11px;color:var(--text-3)">' + (o.user_email || '') + '</span></td>' +
          '<td>$' + o.total_amount.toFixed(2) + '</td>' +
          '<td><span class="badge badge-' + (o.status === 'paid' ? 'green' : o.status === 'refunded' ? 'red' : 'yellow') + '">' + o.status + '</span></td>' +
          '<td style="color:var(--text-3)">' + new Date(o.created_at).toLocaleDateString() + '</td>' +
          '<td class="action-cell">' +
            (o.status === 'pending' ? '<button class="btn btn-sm btn-primary" onclick="window._adminMarkPaid(' + o.id + ')">Mark Paid</button> ' : '') +
            (o.status === 'paid' ? '<button class="btn btn-sm btn-danger" onclick="window._adminRefundOrder(' + o.id + ')">Refund</button>' : '') +
          '</td></tr>';
      }).join('') +
      '</tbody></table>' + renderPagination(res.meta, 'loadOrders') + '</div>';
  }

  window._adminMarkPaid = async function(id) {
    await api('/admin/orders/' + id, { method: 'PUT', body: JSON.stringify({ status: 'paid' }) });
    showToast('Order marked as paid');
    loadPage('orders');
  };

  window._adminRefundOrder = async function(id) {
    if (!confirm('Refund this order?')) return;
    await api('/admin/orders/' + id, { method: 'PUT', body: JSON.stringify({ status: 'refunded' }) });
    showToast('Order refunded');
    loadPage('orders');
  };

  // ============ LICENSES ============
  async function loadLicenses(el, page) {
    page = page || 1;
    var res = await api('/admin/licenses?page=' + page + '&limit=20');
    if (!res || !res.success) return;
    el.innerHTML =
      '<div class="table-container"><table><thead><tr><th>License Key</th><th>Product</th><th>User</th><th>Status</th><th>Activations</th><th>Actions</th></tr></thead><tbody>' +
      res.data.map(function(l) {
        return '<tr>' +
          '<td style="font-family:var(--font-mono);font-size:12px">' + l.license_key + '</td>' +
          '<td>' + (l.product_name || 'N/A') + '</td>' +
          '<td>' + (l.user_name || l.user_email || 'N/A') + '</td>' +
          '<td><span class="badge badge-' + (l.status === 'active' ? 'green' : 'red') + '">' + l.status + '</span></td>' +
          '<td>' + l.activations_count + '/' + l.activations_limit + '</td>' +
          '<td class="action-cell">' +
            (l.status === 'active' ? '<button class="btn btn-sm btn-danger" onclick="window._adminRevokeLicense(' + l.id + ')">Revoke</button>' : '') +
          '</td></tr>';
      }).join('') +
      '</tbody></table>' + renderPagination(res.meta, 'loadLicenses') + '</div>';
  }

  window._adminRevokeLicense = async function(id) {
    if (!confirm('Revoke this license?')) return;
    await api('/admin/licenses/' + id + '/revoke', { method: 'PUT' });
    showToast('License revoked');
    loadPage('licenses');
  };

  // ============ TICKETS ============
  async function loadTickets(el, page) {
    page = page || 1;
    var res = await api('/admin/tickets?page=' + page + '&limit=20');
    if (!res || !res.success) return;
    el.innerHTML =
      '<div class="table-container"><table><thead><tr><th>Subject</th><th>User</th><th>Priority</th><th>Status</th><th>Date</th></tr></thead><tbody>' +
      res.data.map(function(t) {
        return '<tr>' +
          '<td><strong>' + t.subject + '</strong></td>' +
          '<td>' + (t.user_name || 'Unknown') + '</td>' +
          '<td><span class="badge badge-' + (t.priority === 'urgent' ? 'red' : t.priority === 'high' ? 'yellow' : 'gray') + '">' + t.priority + '</span></td>' +
          '<td><span class="badge badge-' + (t.status === 'open' ? 'green' : t.status === 'closed' ? 'gray' : 'blue') + '">' + t.status + '</span></td>' +
          '<td style="color:var(--text-3)">' + new Date(t.created_at).toLocaleDateString() + '</td></tr>';
      }).join('') +
      '</tbody></table>' + renderPagination(res.meta, 'loadTickets') + '</div>';
  }

  // ============ CONTACTS ============
  async function loadContacts(el, page) {
    page = page || 1;
    var res = await api('/admin/contact-submissions?page=' + page + '&limit=20');
    if (!res || !res.success) { el.innerHTML = '<div class="empty-state">No submissions yet.</div>'; return; }
    if (!res.data.length) { el.innerHTML = '<div class="empty-state">No contact form submissions yet.</div>'; return; }
    el.innerHTML =
      '<div class="table-container">' +
        '<div class="table-header"><h3>Contact Submissions (' + res.meta.total + ' total)</h3></div>' +
        '<table><thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Company</th><th>Type</th><th>Brief</th></tr></thead><tbody>' +
        res.data.map(function(s) {
          return '<tr>' +
            '<td style="color:var(--text-3);font-size:12px;white-space:nowrap">' + new Date(s.created_at).toLocaleString() + '</td>' +
            '<td><strong>' + s.name + '</strong></td>' +
            '<td style="font-family:var(--font-mono);font-size:12px">' + s.email + '</td>' +
            '<td>' + s.company + '</td>' +
            '<td><span class="badge badge-blue">' + (s.project_type || 'N/A') + '</span></td>' +
            '<td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-2);font-size:13px" title="' + s.brief.replace(/"/g, '&quot;') + '">' + s.brief + '</td></tr>';
        }).join('') +
        '</tbody></table>' + renderPagination(res.meta, 'loadContacts') + '</div>';
  }

  // ============ COUPONS ============
  async function loadCoupons(el, page) {
    page = page || 1;
    var res = await api('/admin/coupons?page=' + page + '&limit=20');
    if (!res || !res.success) return;
    el.innerHTML =
      '<div class="filter-bar">' +
        '<button class="btn btn-sm btn-primary" onclick="window._adminCreateCoupon()">+ New Coupon</button>' +
      '</div>' +
      '<div class="table-container"><table><thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Uses</th><th>Max Uses</th><th>Min Order</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
      res.data.map(function(c) {
        return '<tr>' +
          '<td style="font-family:var(--font-mono);font-size:13px;font-weight:500">' + c.code + '</td>' +
          '<td><span class="badge badge-blue">' + c.discount_type + '</span></td>' +
          '<td>' + (c.discount_type === 'percentage' ? c.discount_value + '%' : '$' + c.discount_value.toFixed(2)) + '</td>' +
          '<td>' + c.uses_count + '</td>' +
          '<td>' + (c.max_uses || 'Unlimited') + '</td>' +
          '<td>$' + (c.min_order_amount || 0).toFixed(2) + '</td>' +
          '<td style="color:var(--text-3)">' + (c.expires_at ? new Date(c.expires_at).toLocaleDateString() : 'Never') + '</td>' +
          '<td>' + (c.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-gray">Disabled</span>') + '</td>' +
          '<td class="action-cell">' +
            '<button class="btn btn-sm" onclick="window._adminEditCoupon(' + c.id + ')">Edit</button> ' +
            '<button class="btn btn-sm btn-danger" onclick="window._adminDeleteCoupon(' + c.id + ')">Delete</button>' +
          '</td></tr>';
      }).join('') +
      '</tbody></table>' + renderPagination(res.meta, 'loadCoupons') + '</div>';
  }

  window._adminCreateCoupon = function() {
    showModal('Create Coupon',
      '<div class="field"><label>Code</label><input id="c-code" placeholder="e.g. SUMMER20" style="text-transform:uppercase"></div>' +
      '<div class="field"><label>Discount Type</label><select id="c-type"><option value="percentage">Percentage</option><option value="fixed">Fixed Amount</option></select></div>' +
      '<div class="field"><label>Discount Value</label><input type="number" id="c-value" step="0.01" value="10"></div>' +
      '<div class="field"><label>Max Uses (0 = unlimited)</label><input type="number" id="c-max-uses" value="0"></div>' +
      '<div class="field"><label>Min Order Amount</label><input type="number" id="c-min-order" step="0.01" value="0"></div>' +
      '<div class="field"><label>Expires At (optional)</label><input type="date" id="c-expires"></div>',
      async function() {
        var data = {
          code: document.getElementById('c-code').value,
          discount_type: document.getElementById('c-type').value,
          discount_value: parseFloat(document.getElementById('c-value').value) || 0,
          max_uses: parseInt(document.getElementById('c-max-uses').value) || null,
          min_order_amount: parseFloat(document.getElementById('c-min-order').value) || 0,
          expires_at: document.getElementById('c-expires').value || null,
        };
        var res = await api('/admin/coupons', { method: 'POST', body: JSON.stringify(data) });
        if (res && res.success) { showToast('Coupon created'); hideModal(); loadPage('coupons'); }
        else showToast((res && res.error && res.error.message) || 'Failed', 'error');
      }
    );
  };

  window._adminEditCoupon = async function(id) {
    var res = await api('/admin/coupons?page=1&limit=100');
    if (!res || !res.success) return;
    var c = res.data.find(function(x) { return x.id === id; });
    if (!c) return;
    showModal('Edit Coupon',
      '<div class="field"><label>Code</label><input id="c-code" value="' + c.code + '" style="text-transform:uppercase"></div>' +
      '<div class="field"><label>Discount Type</label><select id="c-type"><option value="percentage"' + (c.discount_type === 'percentage' ? ' selected' : '') + '>Percentage</option><option value="fixed"' + (c.discount_type === 'fixed' ? ' selected' : '') + '>Fixed Amount</option></select></div>' +
      '<div class="field"><label>Discount Value</label><input type="number" id="c-value" step="0.01" value="' + c.discount_value + '"></div>' +
      '<div class="field"><label>Max Uses</label><input type="number" id="c-max-uses" value="' + (c.max_uses || 0) + '"></div>' +
      '<div class="field"><label>Min Order Amount</label><input type="number" id="c-min-order" step="0.01" value="' + (c.min_order_amount || 0) + '"></div>' +
      '<div class="field"><label>Expires At</label><input type="date" id="c-expires" value="' + (c.expires_at ? c.expires_at.substring(0, 10) : '') + '"></div>' +
      '<div class="field"><label>Status</label><select id="c-active"><option value="1"' + (c.is_active ? ' selected' : '') + '>Active</option><option value="0"' + (!c.is_active ? ' selected' : '') + '>Disabled</option></select></div>',
      async function() {
        var data = {
          code: document.getElementById('c-code').value,
          discount_type: document.getElementById('c-type').value,
          discount_value: parseFloat(document.getElementById('c-value').value) || 0,
          max_uses: parseInt(document.getElementById('c-max-uses').value) || null,
          min_order_amount: parseFloat(document.getElementById('c-min-order').value) || 0,
          expires_at: document.getElementById('c-expires').value || null,
          is_active: parseInt(document.getElementById('c-active').value),
        };
        var res2 = await api('/admin/coupons/' + id, { method: 'PUT', body: JSON.stringify(data) });
        if (res2 && res2.success) { showToast('Coupon updated'); hideModal(); loadPage('coupons'); }
        else showToast('Failed', 'error');
      }
    );
  };

  window._adminDeleteCoupon = async function(id) {
    if (!confirm('Delete this coupon?')) return;
    await api('/admin/coupons/' + id, { method: 'DELETE' });
    showToast('Coupon deleted');
    loadPage('coupons');
  };

  // ============ SUBSCRIBERS ============
  async function loadSubscribers(el, page) {
    page = page || 1;
    var res = await api('/admin/subscribers?page=' + page + '&limit=20');
    if (!res || !res.success) { el.innerHTML = '<div class="empty-state">No subscribers yet.</div>'; return; }
    if (!res.data.length) { el.innerHTML = '<div class="empty-state">No newsletter subscribers yet.</div>'; return; }
    el.innerHTML =
      '<div class="table-container">' +
        '<div class="table-header"><h3>Subscribers (' + res.meta.total + ' total)</h3></div>' +
        '<table><thead><tr><th>Email</th><th>Name</th><th>Source</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
        res.data.map(function(s) {
          return '<tr>' +
            '<td style="font-family:var(--font-mono);font-size:12px">' + s.email + '</td>' +
            '<td>' + (s.name || '-') + '</td>' +
            '<td><span class="badge badge-gray">' + (s.source || 'website') + '</span></td>' +
            '<td style="color:var(--text-3)">' + new Date(s.created_at).toLocaleDateString() + '</td>' +
            '<td>' + (s.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-gray">Unsubscribed</span>') + '</td>' +
            '<td class="action-cell">' +
              '<button class="btn btn-sm" onclick="window._adminToggleSubscriber(' + s.id + ')">' + (s.is_active ? 'Unsubscribe' : 'Reactivate') + '</button> ' +
              '<button class="btn btn-sm btn-danger" onclick="window._adminDeleteSubscriber(' + s.id + ')">Delete</button>' +
            '</td></tr>';
        }).join('') +
        '</tbody></table>' + renderPagination(res.meta, 'loadSubscribers') + '</div>';
  }

  window._adminToggleSubscriber = async function(id) {
    await api('/admin/subscribers/' + id + '/toggle', { method: 'PUT' });
    showToast('Subscriber updated');
    loadPage('subscribers');
  };

  window._adminDeleteSubscriber = async function(id) {
    if (!confirm('Remove this subscriber?')) return;
    await api('/admin/subscribers/' + id, { method: 'DELETE' });
    showToast('Subscriber removed');
    loadPage('subscribers');
  };

  // ============ SETTINGS ============
  async function loadSettings(el) {
    var res = await api('/admin/settings');
    if (!res || !res.success) return;
    el.innerHTML =
      '<div class="table-container">' +
        '<div class="table-header"><h3>Settings</h3></div>' +
        '<table><thead><tr><th>Key</th><th>Value</th><th>Group</th><th>Actions</th></tr></thead><tbody>' +
        res.data.map(function(s) {
          return '<tr>' +
            '<td style="font-family:var(--font-mono);font-size:12px">' + s.key + '</td>' +
            '<td><input type="text" class="setting-input" data-key="' + s.key + '" value="' + (s.value || '') + '"></td>' +
            '<td><span class="badge badge-gray">' + s.setting_group + '</span></td>' +
            '<td><button class="btn btn-sm" onclick="window._adminSaveSetting(\'' + s.key + '\')">Save</button></td></tr>';
        }).join('') +
        '</tbody></table></div>';
  }

  window._adminSaveSetting = async function(key) {
    var input = document.querySelector('.setting-input[data-key="' + key + '"]');
    if (!input) return;
    await api('/admin/settings', { method: 'PUT', body: JSON.stringify({ key: key, value: input.value }) });
    showToast('Setting "' + key + '" updated');
  };

  // ============ AUDIT LOGS ============
  async function loadLogs(el, page) {
    page = page || 1;
    var res = await api('/admin/logs?page=' + page + '&limit=50');
    if (!res || !res.success) { el.innerHTML = '<div class="empty-state">Access denied. Superadmin only.</div>'; return; }
    el.innerHTML =
      '<div class="table-container"><table><thead><tr><th>Date</th><th>Admin</th><th>Action</th><th>Entity</th><th>IP</th></tr></thead><tbody>' +
      res.data.map(function(l) {
        return '<tr>' +
          '<td style="color:var(--text-3)">' + new Date(l.created_at).toLocaleString() + '</td>' +
          '<td>' + (l.admin_name || 'Unknown') + '</td>' +
          '<td><span class="badge badge-blue">' + l.action + '</span></td>' +
          '<td>' + (l.entity_type || '') + ' ' + (l.entity_id || '') + '</td>' +
          '<td style="font-family:var(--font-mono);font-size:11px">' + (l.ip_address || '') + '</td></tr>';
      }).join('') +
      '</tbody></table>' + renderPagination(res.meta, 'loadLogs') + '</div>';
  }

  // ============ HELPERS ============
  function renderPagination(meta, loaderName) {
    if (!meta || meta.totalPages <= 1) return '';
    var html = '<div class="pagination">';
    if (meta.page > 1) html += '<button onclick="window._adminPaginate(\'' + loaderName + '\', ' + (meta.page - 1) + ')">Prev</button>';
    for (var i = 1; i <= meta.totalPages && i <= 5; i++) {
      html += '<button class="' + (i === meta.page ? 'active' : '') + '" onclick="window._adminPaginate(\'' + loaderName + '\', ' + i + ')">' + i + '</button>';
    }
    if (meta.page < meta.totalPages) html += '<button onclick="window._adminPaginate(\'' + loaderName + '\', ' + (meta.page + 1) + ')">Next</button>';
    html += '</div>';
    return html;
  }

  window._adminPaginate = function(loaderName, page) {
    var loaders = { loadUsers: loadUsers, loadProducts: loadProducts, loadOrders: loadOrders, loadLicenses: loadLicenses, loadTickets: loadTickets, loadLogs: loadLogs, loadContacts: loadContacts, loadCoupons: loadCoupons, loadSubscribers: loadSubscribers };
    if (loaders[loaderName]) loaders[loaderName](document.getElementById('page-content'), page);
  };

  function showModal(title, bodyHtml, onConfirm) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML =
      '<button class="btn" onclick="window._hideModal()">Cancel</button>' +
      '<button class="btn btn-primary" id="modal-confirm">Save</button>';
    document.getElementById('modal').hidden = false;
    document.getElementById('modal-confirm').addEventListener('click', onConfirm);
  }

  function hideModal() { document.getElementById('modal').hidden = true; }
  window._hideModal = hideModal;

  // ============ INIT ============
  if (token) {
    api('/admin/dashboard').then(function(res) {
      if (res && res.success) showDashboard();
      else logout();
    });
  }
})();
