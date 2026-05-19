// Global auth state
window.AUTH = {
  user: null,
  token: null,

  init() {
    this.token = localStorage.getItem('gl_token');
    const u = localStorage.getItem('gl_user');
    if (u) this.user = JSON.parse(u);
    this.updateUI();
    if (this.token) this.verify();
  },

  async verify() {
    try {
      const r = await this.apiFetch('/api/auth/me');
      this.user = r;
      localStorage.setItem('gl_user', JSON.stringify(r));
      this.updateUI();
    } catch {
      this.logout(false);
    }
  },

  async apiFetch(url, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const r = await fetch(url, { ...opts, headers });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: 'Error' }));
      const e = new Error(err.detail || 'Error');
      e.status = r.status;
      throw e;
    }
    return r.json();
  },

  updateUI() {
    const loggedIn = !!this.user;
    document.getElementById('btn-login').style.display = loggedIn ? 'none' : '';
    document.getElementById('btn-register').style.display = loggedIn ? 'none' : '';
    document.getElementById('user-menu').style.display = loggedIn ? '' : 'none';
    document.getElementById('nav-profile-me').style.display = loggedIn ? '' : 'none';
    if (loggedIn) document.getElementById('btn-username').textContent = this.user.is_premium ? `⭐ ${this.user.username}` : this.user.username;
  },

  showModal(tab = 'login') {
    document.getElementById('auth-overlay').classList.add('open');
    this.switchTab(tab);
    setTimeout(() => {
      const focus = tab === 'login' ? 'login-email' : tab === 'register' ? 'reg-username' : 'forgot-email';
      const el = document.getElementById(focus);
      if (el) el.focus();
    }, 100);
  },

  hideModal() {
    document.getElementById('auth-overlay').classList.remove('open');
    document.getElementById('auth-error').style.display = 'none';
    this._clearSuccess();
  },

  switchTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.getElementById('form-login').style.display = tab === 'login' ? '' : 'none';
    document.getElementById('form-register').style.display = tab === 'register' ? '' : 'none';
    document.getElementById('form-forgot').style.display = tab === 'forgot' ? '' : 'none';
    document.getElementById('form-reset').style.display = tab === 'reset' ? '' : 'none';
    document.getElementById('auth-error').style.display = 'none';
    this._clearSuccess();
  },

  showError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg;
    el.style.display = '';
    this._clearSuccess();
  },

  showSuccess(msg) {
    this._clearSuccess();
    const el = document.createElement('div');
    el.className = 'auth-success'; el.id = 'auth-success';
    el.textContent = msg;
    document.getElementById('auth-error').insertAdjacentElement('afterend', el);
  },

  _clearSuccess() {
    const el = document.getElementById('auth-success');
    if (el) el.remove();
  },

  async doLogin(email, password) {
    const data = await this.apiFetch('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password })
    });
    this.setSession(data);
  },

  async doRegister(username, email, password) {
    const data = await this.apiFetch('/api/auth/register', {
      method: 'POST', body: JSON.stringify({ username, email, password })
    });
    this.setSession(data);
  },

  setSession({ token, user }) {
    this.token = token;
    this.user = user;
    localStorage.setItem('gl_token', token);
    localStorage.setItem('gl_user', JSON.stringify(user));
    this.updateUI();
    this.hideModal();
  },

  logout(reload = true) {
    this.token = null;
    this.user = null;
    localStorage.removeItem('gl_token');
    localStorage.removeItem('gl_user');
    this.updateUI();
    if (reload) window.location.reload();
  }
};

// Wire up auth modal events
document.addEventListener('DOMContentLoaded', () => {
  AUTH.init();

  document.getElementById('btn-login').addEventListener('click', () => AUTH.showModal('login'));
  document.getElementById('btn-register').addEventListener('click', () => AUTH.showModal('register'));
  document.getElementById('auth-close').addEventListener('click', () => AUTH.hideModal());
  document.getElementById('auth-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('auth-overlay')) AUTH.hideModal();
  });

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => AUTH.switchTab(tab.dataset.tab));
  });

  document.getElementById('form-login').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = t('auth.btn_logging_in');
    try {
      await AUTH.doLogin(
        document.getElementById('login-email').value,
        document.getElementById('login-password').value
      );
    } catch (err) {
      AUTH.showError(translateError(err.message));
    } finally {
      btn.disabled = false; btn.textContent = t('auth.btn_login');
    }
  });

  document.getElementById('form-register').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = t('auth.btn_registering');
    try {
      await AUTH.doRegister(
        document.getElementById('reg-username').value,
        document.getElementById('reg-email').value,
        document.getElementById('reg-password').value
      );
    } catch (err) {
      AUTH.showError(translateError(err.message));
    } finally {
      btn.disabled = false; btn.textContent = t('auth.btn_register');
    }
  });

  // User menu dropdown
  document.getElementById('btn-username').addEventListener('click', () => {
    document.getElementById('user-dropdown').classList.toggle('open');
  });
  document.addEventListener('click', e => {
    if (!document.getElementById('user-menu').contains(e.target))
      document.getElementById('user-dropdown').classList.remove('open');
  });
  document.getElementById('btn-logout').addEventListener('click', () => AUTH.logout());

  // Settings modal
  document.getElementById('btn-settings').addEventListener('click', () => {
    document.getElementById('user-dropdown').classList.remove('open');
    document.getElementById('ntfy-topic').value = AUTH.user?.notify_ntfy || '';
    document.getElementById('steam-id-input').value = AUTH.user?.steam_id || '';
    document.getElementById('settings-overlay').classList.add('open');
  });
  document.getElementById('settings-close').addEventListener('click', () => {
    document.getElementById('settings-overlay').classList.remove('open');
  });
  document.getElementById('settings-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('settings-overlay'))
      document.getElementById('settings-overlay').classList.remove('open');
  });
  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const topic = document.getElementById('ntfy-topic').value.trim();
    const steamId = document.getElementById('steam-id-input').value.trim();
    try {
      await AUTH.apiFetch('/api/auth/settings', { method: 'PATCH', body: JSON.stringify({
        notify_ntfy: topic || null,
        steam_id: steamId || null,
      })});
      AUTH.user.notify_ntfy = topic || null;
      AUTH.user.steam_id = steamId || null;
      localStorage.setItem('gl_user', JSON.stringify(AUTH.user));
      document.getElementById('settings-overlay').classList.remove('open');
    } catch (err) {
      alert(err.message);
    }
  });

  // Forgot password
  document.getElementById('btn-forgot-password').addEventListener('click', () => {
    AUTH.switchTab('forgot');
    document.getElementById('forgot-email').value = document.getElementById('login-email').value;
    setTimeout(() => document.getElementById('forgot-email').focus(), 50);
  });
  document.getElementById('btn-back-to-login').addEventListener('click', () => AUTH.switchTab('login'));

  document.getElementById('form-forgot').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = t('forgot.btn_sending');
    try {
      await AUTH.apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: document.getElementById('forgot-email').value })
      });
      AUTH.showSuccess(t('forgot.success'));
      e.target.reset();
    } catch (err) {
      AUTH.showError(translateError(err.message));
    } finally {
      btn.disabled = false; btn.textContent = t('forgot.btn');
    }
  });

  document.getElementById('form-reset').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = document.getElementById('reset-password').value;
    const pw2 = document.getElementById('reset-password2').value;
    if (pw !== pw2) { AUTH.showError(t('reset.no_match')); return; }
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = t('reset.btn_saving');
    try {
      const token = new URLSearchParams(location.search).get('token');
      await AUTH.apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password: pw })
      });
      history.replaceState({}, '', '/');
      AUTH.showSuccess(t('reset.success'));
      setTimeout(() => AUTH.switchTab('login'), 1800);
    } catch (err) {
      AUTH.showError(translateError(err.message));
    } finally {
      btn.disabled = false; btn.textContent = t('reset.btn');
    }
  });

  // Steam import button
  document.getElementById('btn-steam-preview').addEventListener('click', () => {
    const steamId = document.getElementById('steam-id-input').value.trim();
    if (!steamId) { alert(t('steam.no_id')); return; }
    document.getElementById('settings-overlay').classList.remove('open');
    openSteamImport(steamId);
  });
});
