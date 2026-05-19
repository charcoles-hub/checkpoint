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
    document.getElementById('nav-mylist').style.display = loggedIn ? '' : 'none';
    if (loggedIn) document.getElementById('btn-username').textContent = this.user.is_premium ? `⭐ ${this.user.username}` : this.user.username;
  },

  showModal(tab = 'login') {
    document.getElementById('auth-overlay').classList.add('open');
    this.switchTab(tab);
    setTimeout(() => document.getElementById(tab === 'login' ? 'login-email' : 'reg-username').focus(), 100);
  },

  hideModal() {
    document.getElementById('auth-overlay').classList.remove('open');
    document.getElementById('auth-error').style.display = 'none';
  },

  switchTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.getElementById('form-login').style.display = tab === 'login' ? '' : 'none';
    document.getElementById('form-register').style.display = tab === 'register' ? '' : 'none';
    document.getElementById('auth-error').style.display = 'none';
  },

  showError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg;
    el.style.display = '';
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
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.textContent = 'Entrando...';
    try {
      await AUTH.doLogin(
        document.getElementById('login-email').value,
        document.getElementById('login-password').value
      );
    } catch (err) {
      AUTH.showError(err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  });

  document.getElementById('form-register').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.textContent = 'Creando cuenta...';
    try {
      await AUTH.doRegister(
        document.getElementById('reg-username').value,
        document.getElementById('reg-email').value,
        document.getElementById('reg-password').value
      );
    } catch (err) {
      AUTH.showError(err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Crear cuenta';
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

  // Steam import button
  document.getElementById('btn-steam-preview').addEventListener('click', () => {
    const steamId = document.getElementById('steam-id-input').value.trim();
    if (!steamId) { alert('Introduce tu Steam ID primero'); return; }
    document.getElementById('settings-overlay').classList.remove('open');
    openSteamImport(steamId);
  });
});
