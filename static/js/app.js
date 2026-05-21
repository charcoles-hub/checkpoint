function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Avatar helpers ────────────────────────────────────
const AVATAR_COLORS = {
  '':       'linear-gradient(135deg,var(--purple),var(--cyan))',
  red:      '#ef4444',
  orange:   '#f97316',
  yellow:   '#eab308',
  green:    '#22c55e',
  teal:     '#14b8a6',
  blue:     '#3b82f6',
  indigo:   '#6366f1',
  pink:     '#ec4899',
  slate:    '#64748b',
};
const AVATAR_ICONS = ['👾','🎮','🕹️','🗡️','🧙','🐉','🤖','🦊','🧟','⚔️','🏹','🔮','💀','🛡️','👑','🌙','🦅','🐺','💎','🔥'];

function avatarBg(user) {
  if (user?.avatar_b64) return 'none';
  return AVATAR_COLORS[user?.avatar_color ?? ''] ?? AVATAR_COLORS[''];
}
function avatarContent(user, fontSize) {
  if (user?.avatar_b64) return `<img src="data:image/jpeg;base64,${user.avatar_b64}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  if (user?.avatar_icon) return `<span style="font-size:${fontSize};line-height:1">${user.avatar_icon}</span>`;
  return (user?.username?.[0] ?? '?').toUpperCase();
}

const grid = document.getElementById('games-grid');
const searchInput = document.getElementById('search-input');
const sectionTitle = document.getElementById('section-title');
const paginationEl = document.getElementById('pagination');
const modalOverlay = document.getElementById('modal-overlay');
const modalContent = document.getElementById('modal-content');

let currentPage = 1;
let currentSearch = '';
let currentGenre = '';
let currentPlatform = '';
let currentSort = 'popular';
let searchTimeout = null;
let totalGames = 0;
let genreCache = null;

// ── Views ────────────────────────────────────────────
const VIEWS = ['home', 'profile-me', 'ranking', 'profile', 'explore', 'community', 'ideas', 'contacto'];

function showView(name) {
  if (_tourEl) {
    document.removeEventListener('keydown', _tourKeyHandler);
    _tourEl.remove();
    _tourEl = null;
  }
  VIEWS.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = v === name ? '' : 'none';
  });
  if (PAGE_TOURS[name] && !localStorage.getItem(`ck_tour_${name}_done`)) {
    setTimeout(() => {
      if (!_tourEl && document.getElementById(`view-${name}`)?.style.display !== 'none') startPageTour(name);
    }, 500);
  }
}

// ── Nav hamburger ────────────────────────────────────
const hamburger = document.getElementById('hamburger');
const navRight = document.getElementById('nav-right');
const navLinks = document.querySelector('.nav-links');
hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  navRight.classList.toggle('open');
  if (navLinks) navLinks.classList.toggle('open');
});
function closeMenu() {
  hamburger.classList.remove('open');
  navRight.classList.remove('open');
  if (navLinks) navLinks.classList.remove('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.nav-inner')) closeMenu();
});

// ── Nav ──────────────────────────────────────────────
document.getElementById('nav-home').addEventListener('click', e => { e.preventDefault(); history.pushState({}, '', '/'); resetHome(); closeMenu(); });
document.getElementById('nav-profile-me').addEventListener('click', () => { history.pushState({}, '', '/mi-perfil'); showView('profile-me'); profileMeTab = 'mygames'; loadProfileMe(); closeMenu(); });
document.getElementById('nav-ranking').addEventListener('click', () => { history.pushState({}, '', '/ranking'); showView('ranking'); loadRanking(); closeMenu(); });
document.getElementById('nav-explore').addEventListener('click', () => { history.pushState({}, '', '/explore'); showView('explore'); loadExplore(); closeMenu(); });
document.getElementById('nav-community').addEventListener('click', () => { history.pushState({}, '', '/community'); showView('community'); loadCommunity(); closeMenu(); });
document.getElementById('nav-ideas').addEventListener('click', () => { history.pushState({}, '', '/ideas'); showView('ideas'); loadIdeas(); closeMenu(); });
document.getElementById('footer-contact').addEventListener('click', () => { history.pushState({}, '', '/contacto'); showView('contacto'); });
document.getElementById('footer-tour').addEventListener('click', () => {
  const activeView = [...document.querySelectorAll('[id^="view-"]')]
    .find(el => el.style.display !== 'none');
  const page = activeView?.id.replace('view-', '');
  if (page && PAGE_TOURS[page]) {
    startPageTour(page, true);
  } else {
    if (_tourEl) { _tourEl.remove(); _tourEl = null; document.removeEventListener('keydown', _tourKeyHandler); }
    history.pushState({}, '', '/');
    resetHome();
    startTour(true);
  }
});

function resetHome() {
  currentPage = 1; currentSearch = ''; currentGenre = ''; currentPlatform = ''; currentSort = 'community';
  searchInput.value = '';
  sectionTitle.textContent = t('section.community_top');
  document.querySelectorAll('.genre-pill').forEach(p => p.classList.toggle('active', p.dataset.genre === ''));
  document.querySelectorAll('.platform-pill').forEach(p => p.classList.toggle('active', p.dataset.platform === ''));
  document.getElementById('platform-filter').style.display = 'none';
  document.getElementById('genre-pills').style.display = '';
  document.querySelectorAll('#sort-tabs .sort-tab').forEach(t => t.classList.toggle('active', t.dataset.sort === 'popular'));
  showView('home');
  loadGames();
  loadHomeFeed();
}

// ── Routing ──────────────────────────────────────────
function route() {
  const path = location.pathname;
  const params = new URLSearchParams(location.search);

  // Handle Google OAuth redirect back
  const glToken = params.get('gl_token');
  if (glToken) {
    history.replaceState({}, '', '/');
    AUTH.token = glToken;
    localStorage.setItem('gl_token', glToken);
    AUTH.verify().then(() => showToast(t('toast.login_ok')));
  }
  const authError = params.get('auth_error');
  if (authError) {
    history.replaceState({}, '', '/');
    setTimeout(() => {
      AUTH.showModal('login');
      AUTH.showError(t('auth.google_error'));
    }, 200);
  }

  if (path === '/reset-password') {
    const token = new URLSearchParams(location.search).get('token');
    showView('home'); loadGames(); loadHomeFeed(); initGenrePills();
    if (token) {
      setTimeout(() => {
        AUTH.showModal('login');
        AUTH.switchTab('reset');
      }, 200);
    }
    return;
  }
  if (path === '/' || path === '') { showView('home'); loadGames(); loadHomeFeed(); initGenrePills(); }
  else if (path === '/mi-perfil') { showView('profile-me'); loadProfileMe(); }
  else if (path === '/mylist') { history.replaceState({}, '', '/mi-perfil'); showView('profile-me'); profileMeTab = 'mygames'; loadProfileMe(); }
  else if (path === '/wishlist') { history.replaceState({}, '', '/mi-perfil'); showView('profile-me'); profileMeTab = 'wishlist'; loadProfileMe(); }
  else if (path === '/ranking') { showView('ranking'); loadRanking(); }
  else if (path.startsWith('/explore')) {
    const genreKey = decodeURIComponent(path.replace('/explore/', '').replace('/explore', ''));
    showView('explore');
    if (genreKey) loadGenreDetail(genreKey);
    else loadExplore();
  }
  else if (path.startsWith('/u/')) { showView('profile'); loadProfile(path.slice(3)); }
  else if (path === '/community') { showView('community'); loadCommunity(); }
  else if (path === '/ideas') { showView('ideas'); loadIdeas(); }
  else if (path === '/contacto') { showView('contacto'); }
  else { showView('home'); loadGames(); loadHomeFeed(); initGenrePills(); }
}

window.addEventListener('popstate', route);

// ── Genre pills (home browse) ─────────────────────────
async function initGenrePills() {
  if (genreCache) { renderGenrePills(genreCache); return; }
  try {
    genreCache = await AUTH.apiFetch('/api/genres');
    renderGenrePills(genreCache);
  } catch {}
}

function renderGenrePills(genres) {
  const container = document.getElementById('genre-pills');
  container.innerHTML = `<button class="genre-pill active" data-genre="">${t('genre.all')}</button>`;
  genres.forEach(g => {
    const btn = document.createElement('button');
    btn.className = 'genre-pill';
    btn.dataset.genre = g.key;
    btn.textContent = `${g.emoji} ${g.name}`;
    container.appendChild(btn);
  });
  container.querySelectorAll('.genre-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      container.querySelectorAll('.genre-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentGenre = pill.dataset.genre;
      currentPage = 1;
      currentSort = 'popular';
      document.querySelectorAll('#sort-tabs .sort-tab').forEach(t => t.classList.toggle('active', t.dataset.sort === 'popular'));
      sectionTitle.textContent = currentGenre
        ? t('section.genre_best', {name: genres.find(g => g.key === currentGenre)?.name || currentGenre})
        : t('section.community_top');
      loadGames();
    });
  });
}

// ── Platform filter (search mode) ────────────────────
document.querySelectorAll('.platform-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.platform-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentPlatform = pill.dataset.platform;
    applyPlatformFilter();
  });
});

function applyPlatformFilter() {
  const cards = grid.querySelectorAll('.game-card');
  cards.forEach(card => {
    if (!currentPlatform) { card.style.display = ''; return; }
    const tags = [...card.querySelectorAll('.platform-tag')].map(t => t.textContent);
    card.style.display = tags.includes(currentPlatform) ? '' : 'none';
  });
}

// Sort tabs (home)
document.querySelectorAll('#sort-tabs .sort-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#sort-tabs .sort-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentSort = tab.dataset.sort;
    currentPage = 1;
    loadGames();
  });
});

// ── Game cards ───────────────────────────────────────
function renderCard(game, onClick, onDelete) {
  const statusLabel = { played: t('status.played'), playing: t('status.playing'), wishlist: t('status.wishlist'), abandoned: t('status.abandoned') };
  const name = game.name || game.game_name;
  const appid = game.id || game.steam_appid;
  const headerUrl = game.image || game.game_image || '';
  const posterUrl = appid ? `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg` : headerUrl;

  const card = document.createElement('div');
  card.className = 'game-card';

  const badge = (game.status && game.status !== 'library')
    ? `<span class="status-badge status-${game.status}">${statusLabel[game.status]}</span>`
    : '';
  const rat = game.rating != null
    ? `<span class="game-rating">${game.rating}</span>`
    : game.avg_rating
    ? `<span class="game-rating community-rating">${game.avg_rating}</span>`
    : '';
  const extra = game.price
    ? `<span class="game-year" style="color:var(--cyan)">${game.price}</span>`
    : game.playtime > 0
    ? `<span class="game-year" style="color:var(--muted)">${Math.round(game.playtime/60)}h</span>`
    : '';

  const imgHtml = posterUrl
    ? `<img class="game-card-img" src="${posterUrl}" alt="${escHtml(name)}" loading="lazy"
        onerror="if(this.src!=='${headerUrl}'){this.src='${headerUrl}';this.onerror=null}" />`
    : `<div class="game-card-img-placeholder">🎮</div>`;

  card.innerHTML = `
    ${imgHtml}
    <div class="game-card-overlay"></div>
    ${badge}
    <div class="game-card-body">
      <div class="game-card-title">${escHtml(name)}</div>
      <div class="game-card-meta">${rat}${extra}</div>
    </div>
  `;

  if (onDelete) {
    const del = document.createElement('button');
    del.className = 'card-delete-btn';
    del.title = t('modal.btn_remove');
    del.textContent = '✕';
    del.addEventListener('click', e => { e.stopPropagation(); onDelete(); });
    card.appendChild(del);
  }
  card.addEventListener('click', onClick || (() => openModal(appid)));
  return card;
}

// ── Load games (home) ─────────────────────────────────
async function loadGames() {
  grid.innerHTML = `<div class="loading"><div class="spinner"></div><p>${t('loading.games')}</p></div>`;
  paginationEl.innerHTML = '';

  try {
    let data;
    if (currentGenre && !currentSearch) {
      // Genre browse
      const params = new URLSearchParams({ page: currentPage });
      data = await AUTH.apiFetch(`/api/genres/${encodeURIComponent(currentGenre)}?${params}`);
      if (currentSort === 'community') {
        data.results = data.results
          .filter(g => g.avg_rating)
          .sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0));
      }
    } else if (!currentSearch && !currentGenre) {
      // Home default: top 9 by community rating
      const ranking = await AUTH.apiFetch('/api/ranking');
      data = { results: ranking.slice(0, 9).map(g => ({ ...g, id: g.steam_appid })), count: 9 };
      sectionTitle.textContent = t('section.community_top');
    } else {
      // Normal search/browse
      const params = new URLSearchParams({ page: currentPage });
      if (currentSearch) params.set('search', currentSearch);
      data = await AUTH.apiFetch(`/api/games?${params}`);
    }

    if (!data.results?.length) {
      grid.innerHTML = `<div class="no-results">${t('no_games')}</div>`;
      return;
    }
    grid.innerHTML = '';
    data.results.forEach(g => grid.appendChild(renderCard(g)));
    totalGames = data.count || 0;

    // Apply platform filter if active
    if (currentPlatform) applyPlatformFilter();
    renderPagination();
  } catch (err) {
    // Server may be waking up (cold start) — retry once after 4 seconds
    if (!loadGames._retry) {
      loadGames._retry = true;
      grid.innerHTML = `<div class="loading"><div class="spinner"></div><p>${t('loading.games')}</p></div>`;
      setTimeout(() => { loadGames._retry = false; loadGames(); }, 4000);
    } else {
      loadGames._retry = false;
      grid.innerHTML = `<div class="no-results">${t('error.games')}</div>`;
    }
  }
}

// ── Search ────────────────────────────────────────────
searchInput.addEventListener('input', e => {
  clearTimeout(searchTimeout);
  const q = e.target.value.trim();
  const platformFilter = document.getElementById('platform-filter');
  const genrePills = document.getElementById('genre-pills');

  if (q) {
    platformFilter.style.display = '';
    genrePills.style.display = 'none';
  } else {
    platformFilter.style.display = 'none';
    genrePills.style.display = '';
  }

  searchTimeout = setTimeout(() => {
    currentSearch = q;
    currentPage = 1;
    currentPlatform = '';
    document.querySelectorAll('.platform-pill').forEach(p => p.classList.toggle('active', p.dataset.platform === ''));
    sectionTitle.textContent = q
      ? t('section.results', {q})
      : (currentGenre ? t('section.genre_best', {name: currentGenre}) : t('section.community_top'));
    loadGames();
  }, 400);
});

// ── Pagination ────────────────────────────────────────
function renderPagination(containerEl = paginationEl, onPage) {
  const totalPages = Math.ceil(totalGames / 24);
  if (totalPages <= 1) return;
  const pages = [1];
  if (currentPage > 3) pages.push('…');
  for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
  if (currentPage < totalPages - 2) pages.push('…');
  if (totalPages > 1) pages.push(totalPages);
  containerEl.innerHTML = '';
  const go = onPage || ((p) => { currentPage = p; loadGames(); scrollTo(0, 400); });
  containerEl.appendChild(mkBtn(t('btn.prev'), currentPage === 1, () => { currentPage--; go(currentPage); }));
  pages.forEach(p => {
    if (p === '…') { const s = document.createElement('span'); s.style.cssText = 'padding:8px 4px;color:var(--muted)'; s.textContent = '…'; containerEl.appendChild(s); }
    else containerEl.appendChild(mkBtn(p, false, () => go(p), p === currentPage));
  });
  containerEl.appendChild(mkBtn(t('btn.next'), currentPage === totalPages, () => { currentPage++; go(currentPage); }));
}

function mkBtn(label, disabled, onClick, active = false) {
  const b = document.createElement('button');
  b.className = 'page-btn' + (active ? ' active' : '');
  b.textContent = label; b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

// ── Explore view (genre grid) ─────────────────────────
async function loadExplore() {
  const title = document.getElementById('explore-title');
  const content = document.getElementById('explore-content');
  const sortTabs = document.getElementById('genre-sort-tabs');
  title.textContent = t('explore.title');
  sortTabs.style.display = 'none';
  content.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  document.getElementById('explore-pagination').innerHTML = '';

  try {
    const [genres, previews] = await Promise.all([
      genreCache ? Promise.resolve(genreCache) : AUTH.apiFetch('/api/genres'),
      AUTH.apiFetch('/api/genres/previews')
    ]);
    if (!genreCache) genreCache = genres;

    content.innerHTML = '';
    const genreGrid = document.createElement('div');
    genreGrid.className = 'genre-grid';

    genres.forEach(genre => {
      const preview = previews[genre.key] || {};
      const coverImg = preview.cover_img || '';
      const count = preview.count || 0;

      const card = document.createElement('div');
      card.className = 'genre-card';
      card.innerHTML = `
        ${coverImg ? `<img class="genre-card-bg" src="${coverImg}" alt="${genre.name}" loading="lazy" />` : ''}
        <div class="genre-card-overlay"></div>
        <div class="genre-card-body">
          <span class="genre-emoji">${genre.emoji}</span>
          <span class="genre-card-name">${genre.name}</span>
          ${count ? `<span class="genre-card-count">${t('explore.games', {n: count.toLocaleString()})}</span>` : ''}
        </div>
      `;
      card.addEventListener('click', () => {
        history.pushState({}, '', `/explore/${encodeURIComponent(genre.key)}`);
        loadGenreDetail(genre.key);
      });
      genreGrid.appendChild(card);
    });

    content.appendChild(genreGrid);
  } catch {
    content.innerHTML = `<div class="no-results">${t('explore.error')}</div>`;
  }
}

// ── Genre detail ──────────────────────────────────────
let genrePage = 1;
let genreTotal = 0;
let currentGenreData = [];
let genreSort = 'popular';

async function loadGenreDetail(genreKey) {
  const title = document.getElementById('explore-title');
  const content = document.getElementById('explore-content');
  const sortTabs = document.getElementById('genre-sort-tabs');
  const pagination = document.getElementById('explore-pagination');

  if (!genreCache) genreCache = await AUTH.apiFetch('/api/genres');
  const genre = genreCache.find(g => g.key === genreKey);
  title.textContent = `${genre?.emoji || ''} ${genre?.name || genreKey}`;

  // Back button
  content.innerHTML = `<button class="btn-ghost" id="btn-back-explore" style="margin-bottom:20px">${t('explore.back')}</button><div class="games-grid" id="genre-grid"><div class="loading"><div class="spinner"></div></div></div>`;
  document.getElementById('btn-back-explore').addEventListener('click', () => {
    history.pushState({}, '', '/explore');
    sortTabs.style.display = 'none';
    loadExplore();
  });

  sortTabs.style.display = '';
  genrePage = 1; genreSort = 'popular';
  document.querySelectorAll('#genre-sort-tabs .sort-tab').forEach(t => t.classList.toggle('active', t.dataset.sort === 'popular'));

  const renderGenreGames = async (results) => {
    const genreGrid = document.getElementById('genre-grid');
    if (!genreGrid) return;
    if (genreSort === 'community') {
      document.getElementById('explore-pagination').innerHTML = '';
      genreGrid.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
      try {
        const ranking = await AUTH.apiFetch(`/api/genres/${encodeURIComponent(genreKey)}/ranking`);
        if (!genreGrid) return;
        if (!ranking.length) {
          genreGrid.innerHTML = `<div class="no-results">${t('explore.no_community')}</div>`;
          return;
        }
        genreGrid.innerHTML = '';
        ranking.forEach(g => genreGrid.appendChild(renderCard({ ...g, id: g.steam_appid }, () => openModal(g.steam_appid))));
      } catch { genreGrid.innerHTML = `<div class="no-results">${t('explore.no_community')}</div>`; }
      return;
    }
    genreGrid.innerHTML = '';
    results.forEach(g => genreGrid.appendChild(renderCard(g, () => openModal(g.id))));
  };

  const fetchPage = async (page) => {
    const genreGrid = document.getElementById('genre-grid');
    if (genreGrid) genreGrid.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const data = await AUTH.apiFetch(`/api/genres/${encodeURIComponent(genreKey)}?page=${page}`);
    currentGenreData = data.results;
    genreTotal = data.count;
    renderGenreGames(currentGenreData);
    pagination.innerHTML = '';
    const savedPage = genrePage;
    totalGames = genreTotal; currentPage = savedPage;
    renderPagination(pagination, (p) => { genrePage = p; currentPage = p; fetchPage(p); scrollTo(0, 300); });
  };

  document.querySelectorAll('#genre-sort-tabs .sort-tab').forEach(tab => {
    const fresh = tab.cloneNode(true);
    tab.parentNode.replaceChild(fresh, tab);
    fresh.addEventListener('click', () => {
      document.querySelectorAll('#genre-sort-tabs .sort-tab').forEach(t => t.classList.remove('active'));
      fresh.classList.add('active');
      genreSort = fresh.dataset.sort;
      renderGenreGames(currentGenreData);
    });
  });

  await fetchPage(1);
}

// ── Star rating ───────────────────────────────────────
function buildStars(containerId, initialRating = 0) {
  const el = document.getElementById(containerId);
  if (!el) return;
  let current = initialRating;
  el.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const s = document.createElement('button');
    s.className = 'star-btn' + (i <= current ? ' active' : '');
    s.textContent = i <= current ? '★' : '☆';
    s.dataset.val = i;
    s.addEventListener('mouseenter', () => highlightStars(el, i));
    s.addEventListener('mouseleave', () => highlightStars(el, current));
    s.addEventListener('click', () => { current = i; highlightStars(el, i); el.dataset.value = i; });
    el.appendChild(s);
  }
  el.dataset.value = initialRating;
}

function highlightStars(el, n) {
  el.querySelectorAll('.star-btn').forEach((s, i) => {
    s.classList.toggle('active', i < n);
    s.textContent = i < n ? '★' : '☆';
  });
}

// ── Game modal ───────────────────────────────────────
async function openModal(gameId) {
  modalContent.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  try {
    const [g, myEntry, steamAch] = await Promise.all([
      AUTH.apiFetch(`/api/games/${gameId}`),
      AUTH.user ? AUTH.apiFetch(`/api/list/${gameId}`).catch(() => null) : Promise.resolve(null),
      AUTH.user?.steam_id ? AUTH.apiFetch(`/api/steam/achievements/${gameId}`).catch(() => null) : Promise.resolve(null),
    ]);
    const genres = (g.genres || []).map(x => `<span class="genre-tag">${x}</span>`).join('');
    const plats = (g.platforms || []).slice(0, 5).map(p => `<span class="platform-tag">${p}</span>`).join('');
    const desc = (g.description || t('modal.no_desc')).slice(0, 500) + (g.description?.length > 500 ? '…' : '');

    modalContent.innerHTML = `
      ${g.image ? `<div class="detail-hero"><img class="detail-hero-img" src="${g.image}" alt="${g.name}" /><div class="detail-hero-gradient"></div></div>` : ''}
      <h2 class="detail-title">${g.name}</h2>
      <div class="detail-meta">
        ${g.release_date ? `<div class="detail-badge">📅 <strong>${g.release_date}</strong></div>` : ''}
        ${g.metacritic ? `<div class="detail-badge">🎯 Metacritic <strong>${g.metacritic}</strong></div>` : ''}
        ${g.price ? `<div class="detail-badge">💰 <strong>${g.price}</strong>${g.discount ? ` <span class="discount-tag">-${g.discount}%</span>` : ''}</div>` : ''}
        ${g.developers?.length ? `<div class="detail-badge">👾 <strong>${g.developers[0]}</strong></div>` : ''}
      </div>
      ${genres ? `<div class="detail-genres">${genres}</div>` : ''}
      <p class="detail-desc">${desc}</p>
      ${plats ? `<div class="game-platforms" style="margin-bottom:24px">${plats}</div>` : ''}
      ${steamAch?.total > 0 ? `
      <div class="achievements-section">
        <div class="achievements-header">
          <span>${t('modal.achievements')}</span>
          <span class="ach-count">${steamAch.achieved}/${steamAch.total}</span>
        </div>
        <div class="ach-bar"><div class="ach-progress" style="width:${Math.round(steamAch.achieved/steamAch.total*100)}%"></div></div>
        ${steamAch.achievements.length ? `<div class="ach-list">${steamAch.achievements.map(a => `
          <div class="ach-item" title="${escHtml(a.description || '')}">
            <span class="ach-name">${escHtml(a.name || a.apiname)}</span>
          </div>`).join('')}</div>` : ''}
      </div>` : ''}
      <div class="detail-actions">
        <button class="btn-add" id="modal-btn-played">${t('modal.btn_played')}</button>
        <button class="btn-add" id="modal-btn-playing" style="background:var(--cyan);color:#000">${t('modal.btn_playing')}</button>
        <button class="btn-wishlist" id="modal-btn-wishlist">${t('modal.btn_wishlist')}</button>
        <button class="btn-abandoned" id="modal-btn-abandoned">${t('modal.btn_abandoned')}</button>
      </div>
      <div id="rating-form" style="display:none" class="alert-form-box">
        <p class="alert-form-label" style="margin-bottom:14px">${t('modal.rating_label')}</p>
        <div id="stars-container" style="margin-bottom:14px;display:flex;gap:2px"></div>
        <textarea id="review-notes" class="field-input" rows="2" placeholder="${t('modal.rating_placeholder')}" style="resize:vertical;margin-bottom:12px"></textarea>
        <div style="display:flex;gap:10px">
          <button class="btn-add" id="btn-save-rating">${t('modal.btn_save')}</button>
          <button class="btn-ghost" id="btn-skip-rating">${t('modal.btn_skip')}</button>
        </div>
      </div>
      <div id="alert-form" style="display:none" class="alert-form-box">
        <p class="alert-form-label">${t('modal.alert_label', {price: g.price || t('modal.free')})}</p>
        <div class="alert-input-row">
          <span style="color:var(--muted2)">€</span>
          <input type="number" id="alert-price-input" min="0.01" step="0.01"
            placeholder="${g.price_eur ? (g.price_eur * 0.7).toFixed(2) : '10.00'}" class="field-input" style="margin:0;flex:1" />
          <button class="btn-primary" id="btn-set-alert">${t('modal.btn_set_alert')}</button>
          <button class="btn-ghost" id="btn-skip-alert">${t('modal.btn_skip_alert')}</button>
        </div>
      </div>
      ${myEntry ? `
      <div class="my-entry-box">
        <div class="my-entry-header">
          <span class="status-badge status-${myEntry.status}">${{played:t('status.played'),playing:t('status.playing'),wishlist:t('status.wishlist'),abandoned:t('status.abandoned'),library:t('status.library')}[myEntry.status]}</span>
          ${(myEntry.status !== 'played' && myEntry.status !== 'playing') && myEntry.rating ? `<span class="game-rating">${myEntry.rating}/10</span>` : ''}
          <button class="btn-ghost" id="btn-remove-game" style="margin-left:auto;padding:4px 10px;font-size:0.8rem;color:var(--muted)">${t('modal.btn_remove')}</button>
        </div>
        ${(myEntry.status !== 'played' && myEntry.status !== 'playing') && myEntry.notes ? `<p class="my-entry-notes">"${escHtml(myEntry.notes)}"</p>` : ''}
        ${(myEntry.status === 'played' || myEntry.status === 'playing') ? `
        <div class="rating-edit-section">
          <label style="font-size:0.82rem;color:var(--muted);display:block;margin-bottom:6px">${t('modal.rating_label')}</label>
          <div id="my-entry-stars" style="display:flex;gap:2px;margin-bottom:8px"></div>
          <textarea id="my-entry-notes-input" class="field-input" rows="2" placeholder="${t('modal.rating_placeholder')}" style="resize:vertical;margin-bottom:8px">${escHtml(myEntry.notes || '')}</textarea>
          <button class="btn-ghost" id="btn-update-rating" style="padding:6px 14px;font-size:0.85rem">${t('modal.btn_save')}</button>
        </div>` : ''}
        <div class="draft-section">
          <label style="font-size:0.82rem;color:var(--muted);display:block;margin-bottom:6px">${t('modal.draft_label')}</label>
          <textarea id="draft-input" class="field-input" rows="3" placeholder="${t('modal.draft_placeholder')}" style="resize:vertical;margin-bottom:8px">${escHtml(myEntry.draft_notes || '')}</textarea>
          <button class="btn-ghost" id="btn-save-draft" style="padding:6px 14px;font-size:0.85rem">${t('modal.btn_draft')}</button>
        </div>
      </div>` : AUTH.user ? `
      <div class="draft-section" style="margin-top:16px">
        <label style="font-size:0.82rem;color:var(--muted);display:block;margin-bottom:6px">${t('modal.draft_label_new')}</label>
        <textarea id="draft-input" class="field-input" rows="3" placeholder="${t('modal.draft_placeholder')}" style="resize:vertical;margin-bottom:8px"></textarea>
        <button class="btn-ghost" id="btn-save-draft" style="padding:6px 14px;font-size:0.85rem">${t('modal.btn_draft')}</button>
      </div>` : ''}
      <div id="modal-reviews"></div>
      ${AUTH.user ? '<div id="modal-price-history"></div>' : ''}
    `;

    buildStars('stars-container', 0);
    if (myEntry && (myEntry.status === 'played' || myEntry.status === 'playing')) {
      buildStars('my-entry-stars', myEntry.rating || 0);
    }

    let pendingStatus = 'played';

    document.getElementById('modal-btn-played').addEventListener('click', async () => {
      if (!AUTH.user) { AUTH.showModal('login'); return; }
      pendingStatus = 'played';
      await saveEntry(g, 'played');
      document.getElementById('rating-form').style.display = '';
      document.getElementById('alert-form').style.display = 'none';
    });
    document.getElementById('modal-btn-playing').addEventListener('click', async () => {
      if (!AUTH.user) { AUTH.showModal('login'); return; }
      pendingStatus = 'playing';
      await saveEntry(g, 'playing');
      document.getElementById('rating-form').style.display = '';
      document.getElementById('alert-form').style.display = 'none';
    });
    document.getElementById('modal-btn-abandoned').addEventListener('click', async () => {
      if (!AUTH.user) { AUTH.showModal('login'); return; }
      await saveEntry(g, 'abandoned'); showToast(t('toast.abandoned'));
    });
    document.getElementById('modal-btn-wishlist').addEventListener('click', async () => {
      if (!AUTH.user) { AUTH.showModal('login'); return; }
      await saveEntry(g, 'wishlist');
      document.getElementById('rating-form').style.display = 'none';
      if (AUTH.user.is_premium) {
        document.getElementById('alert-form').style.display = '';
        document.getElementById('alert-price-input').focus();
      } else {
        showToast(t('toast.wishlist_added'));
      }
    });
    document.getElementById('btn-save-rating').addEventListener('click', async () => {
      const rating = parseInt(document.getElementById('stars-container').dataset.value) || null;
      const notes = document.getElementById('review-notes').value.trim() || null;
      await AUTH.apiFetch('/api/list', { method: 'POST', body: JSON.stringify({
        steam_appid: g.id, game_name: g.name, game_image: g.image, status: pendingStatus, rating, notes, genres: g.genres || []
      })});
      document.getElementById('rating-form').style.display = 'none';
      showToast(rating ? t('toast.saved_rating', {n: rating}) : t('toast.saved'));
      if (document.getElementById('view-profile-me').style.display !== 'none') loadMyList();
    });
    document.getElementById('btn-skip-rating').addEventListener('click', () => {
      document.getElementById('rating-form').style.display = 'none';
      showToast(t('toast.saved'));
    });
    document.getElementById('btn-set-alert')?.addEventListener('click', async () => {
      const price = parseFloat(document.getElementById('alert-price-input').value);
      if (!price || price <= 0) { alert(t('toast.invalid_price')); return; }
      try {
        await AUTH.apiFetch('/api/alerts', { method: 'POST', body: JSON.stringify({
          steam_appid: g.id, game_name: g.name, game_image: g.image, target_price: price
        })});
        document.getElementById('alert-form').style.display = 'none';
        showToast(t('toast.alert_set', {price: price.toFixed(2)}));
      } catch (e) {
        if (e.status === 403) {
          document.getElementById('alert-form').style.display = 'none';
          showToast(t('toast.alert_limit'));
          setTimeout(() => showPremiumModal(), 500);
        }
      }
    });
    document.getElementById('btn-skip-alert')?.addEventListener('click', () => {
      document.getElementById('alert-form').style.display = 'none';
      showToast(t('toast.wishlist'));
    });
    document.getElementById('btn-remove-game')?.addEventListener('click', async () => {
      await AUTH.apiFetch(`/api/list/${g.id}`, { method: 'DELETE' });
      closeModal();
      showToast(t('toast.game_removed'));
      if (document.getElementById('view-profile-me').style.display !== 'none') loadMyList();
    });
    document.getElementById('btn-update-rating')?.addEventListener('click', async () => {
      const rating = parseInt(document.getElementById('my-entry-stars').dataset.value) || null;
      const notes = document.getElementById('my-entry-notes-input').value.trim() || null;
      await AUTH.apiFetch('/api/list', { method: 'POST', body: JSON.stringify({
        steam_appid: g.id, game_name: g.name, game_image: g.image,
        status: myEntry.status, rating, notes, genres: g.genres || []
      })});
      myEntry.rating = rating; myEntry.notes = notes;
      showToast(rating ? t('toast.saved_rating', {n: rating}) : t('toast.saved'));
      if (document.getElementById('view-profile-me').style.display !== 'none') loadMyList();
    });
    document.getElementById('btn-save-draft')?.addEventListener('click', async () => {
      if (!AUTH.user) { AUTH.showModal('login'); return; }
      const draft = document.getElementById('draft-input').value.trim() || null;
      const status = myEntry?.status || 'wishlist';
      await AUTH.apiFetch('/api/list', { method: 'POST', body: JSON.stringify({
        steam_appid: g.id, game_name: g.name, game_image: g.image,
        status, rating: myEntry?.rating || null, notes: myEntry?.notes || null, draft_notes: draft, genres: g.genres || []
      })});
      showToast(t('toast.draft'));
    });

    // Price history
    if (AUTH.user) {
      const phEl = document.getElementById('modal-price-history');
      if (phEl) {
        if (!AUTH.user.is_premium) {
          phEl.innerHTML = `
            <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border)">
              <h4 class="modal-section-title">📈 ${t('ph.title')}</h4>
              <div class="ph-lock" onclick="showPremiumModal()">⭐ ${t('ph.lock')}</div>
            </div>`;
        } else {
          phEl.innerHTML = `<div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border)"><div class="loading" style="padding:20px 0"><div class="spinner"></div></div></div>`;
          AUTH.apiFetch(`/api/games/${gameId}/price-history`)
            .then(({ history }) => {
              if (!history.length) {
                phEl.innerHTML = `
                  <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border)">
                    <h4 class="modal-section-title">📈 ${t('ph.title')}</h4>
                    <p style="color:var(--muted);font-size:0.88rem">${t('ph.empty')}</p>
                  </div>`;
                return;
              }
              const prices = history.map(h => h.price ?? h.price_eur);
              const dates = history.map(h => h.date ?? h.checked_at);
              const max = Math.max(...prices);
              const min = Math.min(...prices);
              const fmt = p => `${Number(p).toFixed(2)}€`;
              const bars = prices.map((p, i) => {
                const pct = max > 0 ? Math.max(4, Math.round((p / max) * 100)) : 50;
                const d = new Date(dates[i]).toLocaleDateString(t('time.locale'), { month: 'short', day: 'numeric', year: '2-digit' });
                return `<div class="ph-col" title="${fmt(p)} — ${d}">
                  <div class="ph-bar-wrap"><div class="ph-bar" style="height:${pct}%"></div></div>
                  <div class="ph-label">${fmt(p)}</div>
                  <div class="ph-date">${d}</div>
                </div>`;
              }).join('');
              phEl.innerHTML = `
                <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border)">
                  <h4 class="modal-section-title">📈 ${t('ph.title')}
                    <span style="color:var(--muted);font-weight:400;margin-left:8px">${t('ph.range', {min: fmt(min), max: fmt(max)})}</span>
                  </h4>
                  <div class="ph-chart">${bars}</div>
                </div>`;
            })
            .catch(() => { phEl.innerHTML = ''; });
        }
      }
    }

    // Community reviews (public)
    fetch(`/api/games/${gameId}/reviews`)
      .then(r => r.ok ? r.json() : [])
      .then(reviews => {
        const el = document.getElementById('modal-reviews');
        if (!el || !reviews.length) return;
        el.innerHTML = `
          <h4 class="modal-section-title">${t('modal.community_reviews')}</h4>
          ${reviews.map(r => `
            <div class="community-review-item">
              <div class="review-meta">
                <span class="review-username">${escHtml(r.username)}</span>
                ${r.rating ? `<span class="game-rating" style="font-size:0.8rem;padding:2px 8px">${r.rating}/10</span>` : ''}
              </div>
              <p class="review-text">${escHtml(r.review)}</p>
            </div>
          `).join('')}
        `;
      })
      .catch(() => {});
  } catch {
    modalContent.innerHTML = `
      <div class="no-results" style="padding:40px 0">
        <p style="font-size:1.5rem;margin-bottom:8px">😕</p>
        <p>${t('modal.error')}</p>
        <button class="btn-ghost" style="margin-top:16px" onclick="closeModal()">${t('modal.close')}</button>
      </div>`;
  }
}

async function saveEntry(g, status) {
  await AUTH.apiFetch('/api/list', { method: 'POST', body: JSON.stringify({
    steam_appid: g.id, game_name: g.name, game_image: g.image, status, genres: g.genres || []
  })});
  if (document.getElementById('view-profile-me').style.display !== 'none') {
    if (profileMeTab === 'mygames') loadMyList();
    else if (profileMeTab === 'wishlist') loadWishlist();
  }
}

function closeModal() { modalOverlay.classList.remove('open'); document.body.style.overflow = ''; }

// ── Mi Perfil ─────────────────────────────────────────
let profileMeTab = 'mygames';

function _refreshProfileMeAvatar() {
  const el = document.getElementById('profile-me-avatar');
  if (!el) return;
  el.style.background = avatarBg(AUTH.user);
  el.innerHTML = avatarContent(AUTH.user, '1.7rem');
}

function loadProfileMe() {
  if (!AUTH.user) { showView('home'); AUTH.showModal('login'); return; }
  _refreshProfileMeAvatar();
  document.getElementById('profile-me-name').textContent = AUTH.user.username;
  document.getElementById('profile-me-bio-display').textContent = AUTH.user.bio || '';

  const previewBtn = document.getElementById('btn-preview-profile');
  const freshPreview = previewBtn.cloneNode(true);
  previewBtn.parentNode.replaceChild(freshPreview, previewBtn);
  freshPreview.addEventListener('click', () => {
    history.pushState({}, '', `/u/${AUTH.user.username}`);
    showView('profile');
    loadProfile(AUTH.user.username);
  });

  document.querySelectorAll('#profile-me-tabs .list-tab').forEach(tab => {
    const fresh = tab.cloneNode(true);
    tab.parentNode.replaceChild(fresh, tab);
    fresh.addEventListener('click', () => {
      document.querySelectorAll('#profile-me-tabs .list-tab').forEach(t => t.classList.remove('active'));
      fresh.classList.add('active');
      switchProfileTab(fresh.dataset.tab);
    });
  });
  document.querySelectorAll('#profile-me-tabs .list-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === profileMeTab);
  });
  switchProfileTab(profileMeTab);
}

function switchProfileTab(tab) {
  profileMeTab = tab;
  ['mygames', 'wishlist', 'steam', 'account'].forEach(p => {
    document.getElementById(`panel-${p}`).style.display = p === tab ? '' : 'none';
  });
  if (tab === 'mygames') loadMyList();
  else if (tab === 'wishlist') loadWishlist();
  else if (tab === 'steam') loadSteamTab();
  else if (tab === 'account') loadMyAccount();
}

async function loadMyAccount() {
  const el = document.getElementById('account-content');
  const profileUrl = `${location.origin}/u/${AUTH.user.username}`;

  // Cooldown: check if username was changed less than 7 days ago
  const changedAt = AUTH.user.username_changed_at ? new Date(AUTH.user.username_changed_at) : null;
  const cooldownMs = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const inCooldown = changedAt && (now - changedAt.getTime()) < cooldownMs;
  const nextChangeDate = inCooldown ? new Date(changedAt.getTime() + cooldownMs) : null;
  const nextDateStr = nextChangeDate
    ? nextChangeDate.toLocaleDateString(t('time.locale'), { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;
  const usernameHint = inCooldown
    ? `<span style="color:var(--muted2);font-size:0.78rem">${t('profile_me.username_cooldown', { date: nextDateStr })}</span>`
    : `<span style="color:var(--muted2);font-size:0.78rem">${t('profile_me.username_hint')}</span>`;

  el.innerHTML = `
    <div style="max-width:480px">
      <p style="font-size:0.78rem;color:var(--muted2);text-transform:uppercase;letter-spacing:.07em;margin-bottom:20px">${t('profile_me.section_edit')}</p>

      <label style="font-size:0.85rem;color:var(--muted);display:block;margin-bottom:6px">
        ${t('profile_me.label_username')}
        <span style="margin-left:6px">${usernameHint}</span>
      </label>
      <input type="text" id="account-username" class="field-input" value="${escHtml(AUTH.user.username)}" maxlength="30" style="margin-bottom:16px" ${inCooldown ? 'disabled' : ''} />

      <label style="font-size:0.85rem;color:var(--muted);display:block;margin-bottom:6px">
        ${t('profile_me.label_bio')}
        <span style="color:var(--muted2);font-size:0.78rem;margin-left:4px">${t('profile_me.bio_hint')}</span>
      </label>
      <textarea id="account-bio" class="field-input" rows="3" maxlength="160" placeholder="${t('profile_me.bio_placeholder')}" style="resize:vertical;margin-bottom:6px">${escHtml(AUTH.user.bio || '')}</textarea>
      <div style="text-align:right;font-size:0.78rem;color:var(--muted);margin-bottom:22px"><span id="bio-char-count">${(AUTH.user.bio || '').length}</span>/160</div>

      ${AUTH.user.is_premium ? `
      <label style="font-size:0.85rem;color:var(--muted);display:block;margin-bottom:10px">${t('profile_me.label_photo')} <span class="premium-badge">⭐</span></label>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:8px">
        <div style="width:56px;height:56px;border-radius:50%;overflow:hidden;background:${avatarBg(AUTH.user)};display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;color:#fff;flex-shrink:0" id="avatar-upload-preview">
          ${avatarContent(AUTH.user, '1.5rem')}
        </div>
        <div style="flex:1">
          <input type="file" id="avatar-file-input" accept="image/jpeg,image/png,image/webp" style="display:none">
          <button class="btn-ghost" id="btn-pick-avatar" style="font-size:0.85rem;padding:7px 14px">${t('profile_me.btn_upload_avatar')}</button>
          ${AUTH.user.avatar_b64 ? `<button class="btn-ghost" id="btn-delete-avatar" style="font-size:0.82rem;padding:7px 12px;color:var(--muted);margin-left:8px">${t('profile_me.btn_remove_avatar')}</button>` : ''}
          <p style="font-size:0.77rem;color:var(--muted2);margin-top:6px">${t('profile_me.avatar_hint')}</p>
        </div>
      </div>
      <label style="display:flex;align-items:flex-start;gap:8px;font-size:0.82rem;color:var(--muted);margin-bottom:24px;cursor:pointer">
        <input type="checkbox" id="avatar-tos" style="margin-top:2px;flex-shrink:0">
        ${t('profile_me.avatar_tos')}
      </label>
      ` : ''}

      <label style="font-size:0.85rem;color:var(--muted);display:block;margin-bottom:10px">${t('profile_me.label_color')}</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px">
        ${Object.entries(AVATAR_COLORS).map(([key, val]) => `
          <button class="avatar-color-swatch ${(AUTH.user.avatar_color ?? '') === key ? 'selected' : ''}"
            data-color="${key}"
            style="width:32px;height:32px;border-radius:50%;background:${val};border:3px solid ${(AUTH.user.avatar_color ?? '') === key ? '#fff' : 'transparent'};cursor:pointer;transition:border-color .15s"
            title="${key || 'default'}"></button>
        `).join('')}
      </div>

      ${AUTH.user.is_premium ? `
      <label style="font-size:0.85rem;color:var(--muted);display:block;margin-bottom:10px">${t('profile_me.label_icon')} <span class="premium-badge">⭐</span></label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <button class="avatar-icon-btn ${!AUTH.user.avatar_icon ? 'selected' : ''}" data-icon=""
          style="width:38px;height:38px;border-radius:8px;background:var(--surface2);border:2px solid ${!AUTH.user.avatar_icon ? 'var(--purple)' : 'var(--border)'};cursor:pointer;font-size:1rem">
          ${(AUTH.user.username[0] ?? '?').toUpperCase()}
        </button>
        ${AVATAR_ICONS.map(icon => `
          <button class="avatar-icon-btn ${AUTH.user.avatar_icon === icon ? 'selected' : ''}" data-icon="${icon}"
            style="width:38px;height:38px;border-radius:8px;background:var(--surface2);border:2px solid ${AUTH.user.avatar_icon === icon ? 'var(--purple)' : 'var(--border)'};cursor:pointer;font-size:1.3rem">
            ${icon}
          </button>
        `).join('')}
      </div>
      <p style="font-size:0.78rem;color:var(--muted2);margin-bottom:22px">${t('profile_me.icon_hint')}</p>
      ` : ''}

      <div style="display:flex;align-items:center;gap:14px;margin-bottom:32px">
        <button class="btn-primary" id="btn-save-account">${t('profile_me.btn_save')}</button>
        <span id="account-msg" style="display:none;font-size:0.9rem"></span>
      </div>

      <div style="margin-bottom:32px">
        <p style="font-size:0.78rem;color:var(--muted2);text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px">${t('profile_me.section_preview')}</p>
        <div id="community-preview-card" style="padding:14px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;display:flex;align-items:center;gap:14px">
          <div class="user-avatar-sm" style="background:${avatarBg(AUTH.user)}">${avatarContent(AUTH.user, '1rem')}</div>
          <div style="flex:1">
            <span class="user-row-name">${escHtml(AUTH.user.username)}</span>
            ${AUTH.user.is_premium ? '<span class="premium-badge" style="font-size:0.8rem">⭐</span>' : ''}
            <span id="preview-games-count" style="color:var(--muted);font-size:0.8rem;margin-left:8px"></span>
          </div>
          <button class="btn-ghost" id="btn-preview-from-account" style="font-size:0.82rem;padding:6px 12px">👁 ${t('profile_me.preview_btn')}</button>
        </div>
      </div>

      <div style="padding:16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span style="color:var(--muted2);font-size:0.88rem">${t('mylist.profile_url')}</span>
        <code style="color:var(--cyan);font-size:0.84rem;flex:1">${profileUrl}</code>
        <button class="btn-ghost" id="btn-copy-profile-acc" style="padding:6px 14px;font-size:0.84rem">${t('mylist.btn_copy')}</button>
      </div>
    </div>
  `;

  document.getElementById('account-bio').addEventListener('input', e => {
    document.getElementById('bio-char-count').textContent = e.target.value.length;
  });

  document.getElementById('btn-save-account').addEventListener('click', async () => {
    const username = document.getElementById('account-username').value.trim();
    const bio = document.getElementById('account-bio').value.trim();
    const btn = document.getElementById('btn-save-account');
    const msg = document.getElementById('account-msg');
    if (!username) return;
    btn.disabled = true; btn.textContent = t('profile_me.btn_saving');
    try {
      const avatarColor = document.querySelector('.avatar-color-swatch.selected')?.dataset.color ?? AUTH.user.avatar_color ?? '';
      const avatarIcon  = document.querySelector('.avatar-icon-btn.selected')?.dataset.icon ?? '';
      const updated = await AUTH.apiFetch('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ username, bio, avatar_color: avatarColor, avatar_icon: avatarIcon }) });
      AUTH.user.username = updated.username;
      AUTH.user.bio = updated.bio;
      AUTH.user.username_changed_at = updated.username_changed_at;
      AUTH.user.avatar_color = updated.avatar_color;
      AUTH.user.avatar_icon = updated.avatar_icon;
      localStorage.setItem('gl_user', JSON.stringify(AUTH.user));
      AUTH.updateUI();
      _refreshProfileMeAvatar();
      document.getElementById('profile-me-name').textContent = AUTH.user.username;
      document.getElementById('profile-me-bio-display').textContent = AUTH.user.bio || '';
      msg.innerHTML = `<span style="color:var(--cyan)">✓ ${t('profile_me.saved')}</span>`;
      msg.style.display = '';
      loadMyAccount();
    } catch (err) {
      msg.innerHTML = `<span style="color:#ef4444">${err.message}</span>`;
      msg.style.display = '';
      btn.disabled = false; btn.textContent = t('profile_me.btn_save');
    }
  });

  document.getElementById('btn-copy-profile-acc').addEventListener('click', () => {
    navigator.clipboard.writeText(profileUrl); showToast(t('toast.link_copied'));
  });

  document.querySelectorAll('.avatar-color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.avatar-color-swatch').forEach(s => {
        s.classList.remove('selected'); s.style.borderColor = 'transparent';
      });
      swatch.classList.add('selected'); swatch.style.borderColor = '#fff';
    });
  });

  document.querySelectorAll('.avatar-icon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.avatar-icon-btn').forEach(b => {
        b.classList.remove('selected'); b.style.borderColor = 'var(--border)';
      });
      btn.classList.add('selected'); btn.style.borderColor = 'var(--purple)';
    });
  });

  const fileInput = document.getElementById('avatar-file-input');
  const btnPick   = document.getElementById('btn-pick-avatar');
  const btnDel    = document.getElementById('btn-delete-avatar');

  if (btnPick && fileInput) {
    btnPick.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      const tos = document.getElementById('avatar-tos');
      if (!tos?.checked) { showToast(t('profile_me.avatar_tos_required')); return; }
      const form = new FormData();
      form.append('file', file);
      btnPick.disabled = true; btnPick.textContent = t('profile_me.avatar_uploading');
      try {
        const res = await AUTH.apiFetch('/api/auth/avatar', { method: 'POST', body: form, _raw: true });
        const { avatar_b64 } = await res.json();
        AUTH.user.avatar_b64 = avatar_b64;
        localStorage.setItem('gl_user', JSON.stringify(AUTH.user));
        _refreshProfileMeAvatar();
        loadMyAccount();
        showToast(t('profile_me.avatar_saved'));
      } catch (err) {
        showToast(err.message || t('profile_me.avatar_error'));
      } finally {
        btnPick.disabled = false; btnPick.textContent = t('profile_me.btn_upload_avatar');
      }
    });
  }

  if (btnDel) {
    btnDel.addEventListener('click', async () => {
      await AUTH.apiFetch('/api/auth/avatar', { method: 'DELETE' });
      AUTH.user.avatar_b64 = '';
      localStorage.setItem('gl_user', JSON.stringify(AUTH.user));
      _refreshProfileMeAvatar();
      loadMyAccount();
    });
  }

  document.getElementById('btn-preview-from-account').addEventListener('click', () => {
    history.pushState({}, '', `/u/${AUTH.user.username}`);
    showView('profile');
    loadProfile(AUTH.user.username);
  });

  AUTH.apiFetch(`/api/users/${AUTH.user.username}`).then(({ stats }) => {
    const el = document.getElementById('preview-games-count');
    if (el) el.textContent = t('following.games', { n: stats.total });
    const statsEl = document.getElementById('profile-me-stats');
    if (statsEl) statsEl.innerHTML = `
      <div class="stat-box"><div class="stat-num">${stats.played || 0}</div><div class="stat-label">${t('profile.stat.played')}</div></div>
      <div class="stat-box"><div class="stat-num">${stats.playing || 0}</div><div class="stat-label">${t('profile.stat.playing')}</div></div>
      <div class="stat-box"><div class="stat-num">${stats.wishlist || 0}</div><div class="stat-label">${t('profile.stat.wishlist')}</div></div>
      ${stats.abandoned ? `<div class="stat-box"><div class="stat-num">${stats.abandoned}</div><div class="stat-label">${t('status.abandoned')}</div></div>` : ''}
      ${stats.avg_rating ? `<div class="stat-box"><div class="stat-num">${stats.avg_rating}</div><div class="stat-label">${t('profile.stat.avg')}</div></div>` : ''}
      ${stats.total_playtime > 0 ? `<div class="stat-box"><div class="stat-num">${Math.round(stats.total_playtime/60)}h</div><div class="stat-label">${t('profile.stat.steam')}</div></div>` : ''}
    `;
  }).catch(() => {});
}

// ── My List ──────────────────────────────────────────
async function loadMyList() {
  if (!AUTH.user) { showView('home'); AUTH.showModal('login'); return; }
  const listGrid = document.getElementById('mylist-grid');
  listGrid.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  let activeStatus = 'all';
  const entries = await AUTH.apiFetch('/api/list');

  document.querySelector('.list-search-box')?.remove();

  let listSearch = '';
  let activeGenre = '';

  function buildGenreOptions() {
    const genreSet = new Set();
    entries.forEach(e => (e.genres || []).forEach(g => genreSet.add(g)));
    return [...genreSet].sort();
  }

  const searchBox = document.createElement('div');
  searchBox.className = 'list-search-box';
  searchBox.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <input type="text" class="field-input" id="list-search" placeholder="${t('mylist.search')}"
        style="flex:1;min-width:160px;margin-bottom:0" />
      <select class="field-input genre-filter-select" id="list-genre-filter"
        style="flex:0 0 auto;width:auto;min-width:150px;max-width:220px;margin-bottom:0;cursor:pointer">
        <option value="">${t('mylist.genre_all')}</option>
      </select>
    </div>`;
  listGrid.parentNode.insertBefore(searchBox, listGrid);

  function refreshGenreSelect() {
    const sel = document.getElementById('list-genre-filter');
    if (!sel) return;
    const genres = buildGenreOptions();
    const prev = sel.value;
    sel.innerHTML = `<option value="">${t('mylist.genre_all')}</option>` +
      genres.map(g => `<option value="${escHtml(g)}" ${g === prev ? 'selected' : ''}>${escHtml(g)}</option>`).join('');
    if (!genres.includes(prev)) { sel.value = ''; activeGenre = ''; }
  }
  refreshGenreSelect();

  searchBox.querySelector('#list-search').addEventListener('input', e => {
    listSearch = e.target.value.toLowerCase(); myListPage = 1; renderList();
  });
  searchBox.querySelector('#list-genre-filter').addEventListener('change', e => {
    activeGenre = e.target.value; myListPage = 1; renderList();
  });

  let myListPage = 1;
  const MY_PAGE = 21;

  function renderList() {
    listGrid.style.display = '';
    searchBox.style.display = '';
    let filtered = activeStatus === 'all' ? entries.filter(e => e.status !== 'wishlist') : entries.filter(e => e.status === activeStatus);
    if (listSearch) filtered = filtered.filter(e => (e.game_name || '').toLowerCase().includes(listSearch));
    if (activeGenre) filtered = filtered.filter(e => (e.genres || []).includes(activeGenre));

    document.getElementById('mylist-pagination')?.remove();
    listGrid.innerHTML = '';

    if (!filtered.length) {
      const isEmpty = entries.length === 0;
      listGrid.innerHTML = isEmpty
        ? `<div class="empty-state"><div class="empty-icon">🎮</div><h3>${t('mylist.empty_title')}</h3><p>${t('mylist.empty_desc')}</p><button class="btn-primary" id="btn-start-exploring">${t('mylist.btn_explore')}</button></div>`
        : `<div class="no-results">${listSearch ? t('mylist.no_search', {q: escHtml(listSearch)}) : t('mylist.no_category')}</div>`;
      document.getElementById('btn-start-exploring')?.addEventListener('click', () => {
        history.pushState({}, '', '/'); resetHome();
      });
      return;
    }

    const totalPages = Math.ceil(filtered.length / MY_PAGE);
    if (myListPage > totalPages) myListPage = 1;
    const pageItems = filtered.slice((myListPage - 1) * MY_PAGE, myListPage * MY_PAGE);

    pageItems.forEach(e => listGrid.appendChild(renderCard(e, () => openModal(e.steam_appid), async () => {
      await AUTH.apiFetch(`/api/list/${e.steam_appid}`, { method: 'DELETE' });
      entries.splice(entries.indexOf(e), 1);
      renderList();
      showToast(t('toast.game_removed'));
    })));

    if (totalPages > 1) {
      const pag = document.createElement('div');
      pag.id = 'mylist-pagination';
      pag.className = 'pagination';
      const prev = mkBtn(t('btn.prev'), myListPage === 1, () => { myListPage--; renderList(); listGrid.scrollIntoView({behavior:'smooth',block:'start'}); });
      pag.appendChild(prev);
      for (let p = 1; p <= totalPages; p++) {
        pag.appendChild(mkBtn(p, false, () => { myListPage = p; renderList(); listGrid.scrollIntoView({behavior:'smooth',block:'start'}); }, p === myListPage));
      }
      const next = mkBtn(t('btn.next'), myListPage === totalPages, () => { myListPage++; renderList(); listGrid.scrollIntoView({behavior:'smooth',block:'start'}); });
      pag.appendChild(next);
      listGrid.after(pag);
    }
  }

  document.querySelectorAll('#mylist-tabs .list-tab').forEach(tab => {
    const fresh = tab.cloneNode(true);
    tab.parentNode.replaceChild(fresh, tab);
    fresh.addEventListener('click', () => {
      document.querySelectorAll('#mylist-tabs .list-tab').forEach(t => t.classList.remove('active'));
      fresh.classList.add('active'); activeStatus = fresh.dataset.status; myListPage = 1; renderList();
    });
  });

  renderList();

  AUTH.apiFetch('/api/list/enrich-genres', { method: 'POST' }).then(({ enriched }) => {
    if (enriched > 0) {
      AUTH.apiFetch('/api/list').then(fresh => {
        fresh.forEach(f => {
          const e = entries.find(x => x.steam_appid === f.steam_appid);
          if (e) e.genres = f.genres;
        });
        refreshGenreSelect();
      });
    }
  }).catch(() => {});
}

async function loadWishlist() {
  if (!AUTH.user) { showView('home'); AUTH.showModal('login'); return; }
  const wGrid = document.getElementById('wishlist-grid');
  const alertsEl = document.getElementById('alerts-list');
  wGrid.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  alertsEl.innerHTML = '';

  try {
    const fetchAlerts = AUTH.user.is_premium ? AUTH.apiFetch('/api/alerts') : Promise.resolve(null);
    const [entries, alerts] = await Promise.all([AUTH.apiFetch('/api/list'), fetchAlerts]);
    const wishlist = entries.filter(e => e.status === 'wishlist');
    let wPage = 1;
    let wGenre = '';
    const W_PAGE = 21;

    function buildWGenreOptions() {
      const genreSet = new Set();
      wishlist.forEach(e => (e.genres || []).forEach(g => genreSet.add(g)));
      return [...genreSet].sort();
    }

    document.querySelector('.wishlist-genre-wrap')?.remove();
    const wGenreWrap = document.createElement('div');
    wGenreWrap.className = 'wishlist-genre-wrap';
    wGenreWrap.style.cssText = 'margin-bottom:16px';
    wGenreWrap.innerHTML = `
      <select class="field-input genre-filter-select" id="wishlist-genre-filter"
        style="width:auto;min-width:150px;max-width:220px;cursor:pointer;margin-bottom:0">
        <option value="">${t('mylist.genre_all')}</option>
      </select>`;
    wGrid.parentNode.insertBefore(wGenreWrap, wGrid);

    function refreshWGenreSelect() {
      const sel = document.getElementById('wishlist-genre-filter');
      if (!sel) return;
      const genres = buildWGenreOptions();
      const prev = sel.value;
      sel.innerHTML = `<option value="">${t('mylist.genre_all')}</option>` +
        genres.map(g => `<option value="${escHtml(g)}" ${g === prev ? 'selected' : ''}>${escHtml(g)}</option>`).join('');
      if (!genres.includes(prev)) { sel.value = ''; wGenre = ''; }
    }
    refreshWGenreSelect();

    wGenreWrap.querySelector('#wishlist-genre-filter').addEventListener('change', e => {
      wGenre = e.target.value; wPage = 1; renderWishlist();
    });

    function renderWishlist() {
      document.getElementById('wishlist-pagination')?.remove();
      wGrid.innerHTML = '';
      const visible = wGenre ? wishlist.filter(e => (e.genres || []).includes(wGenre)) : wishlist;
      if (!visible.length) {
        wGrid.innerHTML = wishlist.length === 0
          ? `<div class="empty-state"><div class="empty-icon">⭐</div><h3>${t('wishlist.empty_title')}</h3><p>${t('wishlist.empty_desc')}</p></div>`
          : `<div class="no-results">${t('mylist.no_category')}</div>`;
        return;
      }
      const totalPages = Math.ceil(visible.length / W_PAGE);
      if (wPage > totalPages) wPage = 1;
      visible.slice((wPage - 1) * W_PAGE, wPage * W_PAGE).forEach(e => wGrid.appendChild(renderCard(e, () => openModal(e.steam_appid), async () => {
        await AUTH.apiFetch(`/api/list/${e.steam_appid}`, { method: 'DELETE' });
        loadWishlist();
        showToast(t('toast.game_removed'));
      })));
      if (totalPages > 1) {
        const pag = document.createElement('div');
        pag.id = 'wishlist-pagination';
        pag.className = 'pagination';
        pag.appendChild(mkBtn(t('btn.prev'), wPage === 1, () => { wPage--; renderWishlist(); wGrid.scrollIntoView({behavior:'smooth',block:'start'}); }));
        for (let p = 1; p <= totalPages; p++) {
          pag.appendChild(mkBtn(p, false, () => { wPage = p; renderWishlist(); wGrid.scrollIntoView({behavior:'smooth',block:'start'}); }, p === wPage));
        }
        pag.appendChild(mkBtn(t('btn.next'), wPage === totalPages, () => { wPage++; renderWishlist(); wGrid.scrollIntoView({behavior:'smooth',block:'start'}); }));
        wGrid.after(pag);
      }
    }
    renderWishlist();

    const phSection = document.getElementById('price-history-section');
    if (!AUTH.user.is_premium) {
      alertsEl.innerHTML = `
        <div style="padding:24px;background:linear-gradient(135deg,var(--surface2),var(--surface));border:1px solid var(--border);border-radius:14px;text-align:center;max-width:540px">
          <div style="font-size:2rem;margin-bottom:10px">🔔</div>
          <h4 style="font-size:1.05rem;margin-bottom:8px">${t('alerts.promo_title')}</h4>
          <p style="color:var(--muted);font-size:0.9rem;margin-bottom:18px;line-height:1.5">${t('alerts.promo_desc')}</p>
          <button class="btn-primary" onclick="showPremiumModal()" style="font-size:0.9rem">⭐ ${t('alerts.promo_btn')}</button>
        </div>`;
      if (phSection) phSection.innerHTML = `
        <div style="padding:24px;background:linear-gradient(135deg,rgba(34,211,238,0.05),var(--surface));border:1px solid rgba(34,211,238,0.2);border-radius:14px;max-width:540px">
          <h3 style="font-size:1.1rem;margin-bottom:8px">📈 ${t('ph.title')}</h3>
          <p style="color:var(--muted);font-size:0.9rem;margin-bottom:18px;line-height:1.5">${t('ph.promo_desc')}</p>
          <button class="btn-primary" onclick="showPremiumModal()" style="font-size:0.9rem">⭐ ${t('alerts.promo_btn')}</button>
        </div>`;
    } else {
      renderAlerts(alerts || []);
      if (phSection) phSection.innerHTML = `
        <h3 style="margin-bottom:12px;font-size:1.1rem">📈 ${t('ph.title')}</h3>
        <p style="color:var(--muted);font-size:0.9rem">${t('ph.premium_hint')}</p>`;
    }
  } catch {
    wGrid.innerHTML = `<div class="no-results">${t('error.games')}</div>`;
  }
}

function renderAlerts(alerts) {
  const el = document.getElementById('alerts-list');
  if (!alerts.length) { el.innerHTML = `<p style="color:var(--muted)">${t('alerts.empty')}</p>`; return; }
  el.innerHTML = alerts.map(a => `
    <div class="alert-row ${a.triggered ? 'alert-triggered' : ''}">
      <img src="${a.game_image || ''}" class="alert-thumb" onerror="this.style.display='none'" />
      <div class="alert-info">
        <div class="alert-game">${a.game_name}</div>
        <div class="alert-details">${t('alerts.objective')} <strong>${a.target_price.toFixed(2)}€</strong>
          ${a.current_price ? ` · ${t('alerts.current')} <strong>${a.current_price.toFixed(2)}€</strong>` : ''}
          ${a.triggered ? ` · <span style="color:var(--cyan)">${t('alerts.triggered')}</span>` : ''}
        </div>
      </div>
      <button class="btn-ghost alert-del" data-appid="${a.steam_appid}" style="padding:6px 12px;font-size:0.8rem">${t('alerts.btn_delete')}</button>
    </div>
  `).join('');
  el.querySelectorAll('.alert-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await AUTH.apiFetch(`/api/alerts/${btn.dataset.appid}`, { method: 'DELETE' });
      btn.closest('.alert-row').remove();
    });
  });
}

// ── Feed helpers ─────────────────────────────────────
function _feedAction(e) {
  if (e.review)            return { text: t('feed.action.reviewed'),           cls: 'fa-review' };
  if (e.rating)            return { text: t('feed.action.rated', {n: e.rating}), cls: 'fa-rated' };
  const map = {
    played:    { text: t('feed.action.played'),    cls: 'fa-played' },
    playing:   { text: t('feed.action.playing'),   cls: 'fa-playing' },
    abandoned: { text: t('feed.action.abandoned'), cls: 'fa-abandoned' },
    wishlist:  { text: t('feed.action.wishlist'),  cls: 'fa-wishlist' },
    library:   { text: t('feed.action.library'),   cls: 'fa-library' },
  };
  return map[e.status] || { text: '', cls: '' };
}

function renderFeedItem(e) {
  const item = document.createElement('div');
  item.className = 'feed-item';
  const act = _feedAction(e);
  item.innerHTML = `
    <img src="${e.game_image || ''}" class="feed-thumb" onerror="this.style.display='none'" />
    <div class="feed-info">
      <div class="feed-user">
        <span class="feed-username" data-u="${escHtml(e.player)}">${escHtml(e.player)}</span>
        ${act.text ? `<span class="feed-action ${act.cls}">${act.text}</span>` : ''}
        <span class="feed-time">${timeAgo(e.added_at)}</span>
      </div>
      <div class="feed-game">${escHtml(e.game_name)}</div>
      ${e.review ? `<div class="feed-review">"${escHtml(e.review.slice(0, 120))}${e.review.length > 120 ? '…' : ''}"</div>` :
        e.notes ? `<div class="feed-notes">"${escHtml(e.notes.slice(0, 80))}${e.notes.length > 80 ? '…' : ''}"</div>` : ''}
    </div>
  `;
  item.querySelector('.feed-username').addEventListener('click', () => {
    history.pushState({}, '', `/u/${e.player}`); showView('profile'); loadProfile(e.player);
  });
  item.addEventListener('click', ev => {
    if (!ev.target.classList.contains('feed-username')) openModal(e.steam_appid);
  });
  return item;
}

// ── Home activity feed ───────────────────────────────
async function loadHomeFeed() {
  const feedEl = document.getElementById('home-feed');
  if (!feedEl) return;
  feedEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const items = await AUTH.apiFetch('/api/activity');
    feedEl.innerHTML = '';
    if (!items.length) {
      feedEl.innerHTML = `<p style="color:var(--muted);font-size:0.85rem;padding:8px 0">${t('home.feed_empty')}</p>`;
      return;
    }
    items.forEach(e => feedEl.appendChild(renderFeedItem(e)));
  } catch { feedEl.innerHTML = ''; }
}

// ── Following section ─────────────────────────────────
let followingLoaded = false;

async function loadFollowingSection() {
  if (followingLoaded) return;
  followingLoaded = true;

  const listEl = document.getElementById('following-list');
  const feedEl = document.getElementById('following-feed');
  listEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  const { following, feed } = await AUTH.apiFetch('/api/following');

  // Render followed users
  if (!following.length) {
    listEl.innerHTML = `<p style="color:var(--muted);margin-bottom:24px">${t('following.empty')}</p>`;
  } else {
    listEl.innerHTML = `<h4 style="margin-bottom:12px;color:var(--muted2);font-size:0.9rem;text-transform:uppercase;letter-spacing:.05em">${t('following.title')}</h4>`;
    following.forEach(u => {
      const row = document.createElement('div');
      row.className = 'user-row';
      row.innerHTML = `
        <div class="user-avatar-sm">${u.username[0].toUpperCase()}</div>
        <span class="user-row-name">${u.username}</span>
        <button class="btn-follow following" data-username="${u.username}">${t('following.btn_following')}</button>
      `;
      row.querySelector('.user-avatar-sm').addEventListener('click', () => {
        history.pushState({}, '', `/u/${u.username}`); showView('profile'); loadProfile(u.username);
      });
      row.querySelector('span').addEventListener('click', () => {
        history.pushState({}, '', `/u/${u.username}`); showView('profile'); loadProfile(u.username);
      });
      row.querySelector('.btn-follow').addEventListener('click', async (e) => {
        if (!AUTH.user) { AUTH.showModal('login'); return; }
        try {
          await AUTH.apiFetch(`/api/follow/${u.username}`, { method: 'DELETE' });
          row.remove();
          showToast(t('toast.unfollow', {u: u.username}));
          followingLoaded = false;
        } catch (err) { if (err.status === 401) AUTH.showModal('login'); }
      });
      listEl.appendChild(row);
    });
  }

  // Render activity feed
  if (!feed.length) {
    feedEl.innerHTML = `<p style="color:var(--muted)">${t('following.feed_empty')}</p>`;
  } else {
    feedEl.innerHTML = `<h4 style="margin:24px 0 12px;color:var(--muted2);font-size:0.9rem;text-transform:uppercase;letter-spacing:.05em">${t('following.activity')}</h4>`;
    feed.forEach(e => feedEl.appendChild(renderFeedItem(e)));
  }

  // User search
  const searchInput = document.getElementById('user-search-input');
  const resultsEl = document.getElementById('user-search-results');
  let searchTO = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTO);
    const q = searchInput.value.trim();
    if (!q) { resultsEl.innerHTML = ''; return; }
    searchTO = setTimeout(async () => {
      const users = await AUTH.apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (!users.length) { resultsEl.innerHTML = `<p style="color:var(--muted);padding:8px 0">${t('following.no_results')}</p>`; return; }
      resultsEl.innerHTML = '';
      users.forEach(u => {
        const row = document.createElement('div');
        row.className = 'user-row';
        row.innerHTML = `
          <div class="user-avatar-sm" style="background:${avatarBg(u)}">${avatarContent(u, '1rem')}</div>
          <div style="flex:1">
            <span class="user-row-name">${u.username}</span>
            <span style="color:var(--muted);font-size:0.8rem;margin-left:8px">${t('following.games', {n: u.total_games})}</span>
          </div>
          <button class="btn-follow ${u.is_following ? 'following' : ''}" data-username="${u.username}">
            ${u.is_following ? t('following.btn_following') : t('following.btn_follow')}
          </button>
        `;
        const btn = row.querySelector('.btn-follow');
        btn.addEventListener('click', async () => {
          if (!AUTH.user) { AUTH.showModal('login'); return; }
          try {
          if (btn.classList.contains('following')) {
            await AUTH.apiFetch(`/api/follow/${u.username}`, { method: 'DELETE' });
            btn.classList.remove('following'); btn.textContent = t('following.btn_follow');
            showToast(t('toast.unfollow', {u: u.username}));
          } else {
            await AUTH.apiFetch(`/api/follow/${u.username}`, { method: 'POST' });
            btn.classList.add('following'); btn.textContent = t('following.btn_following');
            showToast(t('toast.follow', {u: u.username}));
          }
          } catch (err) { if (err.status === 401) AUTH.showModal('login'); }
          followingLoaded = false;
        });
        row.querySelector('.user-avatar-sm').addEventListener('click', () => {
          history.pushState({}, '', `/u/${u.username}`); showView('profile'); loadProfile(u.username);
        });
        resultsEl.appendChild(row);
      });
    }, 350);
  });
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('time.now');
  if (m < 60) return t('time.minutes', {n: m});
  const h = Math.floor(m / 60);
  if (h < 24) return t('time.hours', {n: h});
  const d = Math.floor(h / 24);
  if (d < 30) return t('time.days', {n: d});
  return new Date(dateStr).toLocaleDateString(t('time.locale'), { day: 'numeric', month: 'short' });
}

// ── Ranking ──────────────────────────────────────────
async function loadRanking() {
  const el = document.getElementById('ranking-list');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const games = await AUTH.apiFetch('/api/ranking');
    if (!games.length) { el.innerHTML = `<div class="no-results">${t('ranking.empty')}</div>`; return; }
    el.innerHTML = '';
    games.forEach((g, i) => {
      const row = document.createElement('div');
      row.className = 'ranking-row';
      row.innerHTML = `
        <span class="ranking-pos ${i < 3 ? 'top-' + (i+1) : ''}">${i + 1}</span>
        <img src="${g.game_image || ''}" class="alert-thumb" style="width:80px;height:45px" onerror="this.style.display='none'" />
        <div class="alert-info">
          <div class="alert-game">${g.game_name}</div>
          <div class="alert-details">${g.votes} ${g.votes === 1 ? t('ranking.vote') : t('ranking.votes_word')}</div>
        </div>
        <div class="ranking-score"><span class="score-num">${g.avg_rating}</span><span class="score-label">/10</span></div>
      `;
      row.addEventListener('click', () => openModal(g.steam_appid));
      el.appendChild(row);
    });
  } catch { el.innerHTML = `<div class="no-results">${t('ranking.error')}</div>`; }
}

// ── Public Profile ────────────────────────────────────
async function loadProfile(username) {
  const header = document.getElementById('profile-header');
  const profileGrid = document.getElementById('profile-grid');
  header.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const { user, entries, stats, is_following, is_own } = await AUTH.apiFetch(`/api/users/${username}`);
    const joined = new Date(user.created_at).toLocaleDateString(t('time.locale'), { month: 'long', year: 'numeric' });
    header.innerHTML = `
      <div class="profile-hero">
        <div class="profile-avatar" style="background:${avatarBg(user)}">${avatarContent(user, '2rem')}</div>
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <h2 class="profile-name">${user.username}${user.is_premium ? ' <span class="premium-badge">⭐</span>' : ''}</h2>
            ${!is_own && AUTH.user ? `<button class="btn-follow ${is_following ? 'following' : ''}" id="btn-follow-profile">
              ${is_following ? t('profile.btn_following') : t('profile.btn_follow')}
            </button>` : ''}
          </div>
          <p style="color:var(--muted);font-size:0.9rem;margin-top:4px">${t('profile.member_since', {date: joined})}</p>
          <div style="display:flex;gap:16px;margin-top:8px">
            <span style="color:var(--muted2);font-size:0.85rem"><strong>${user.followers}</strong> ${t('profile.followers')}</span>
            <span style="color:var(--muted2);font-size:0.85rem"><strong>${user.following}</strong> ${t('profile.following_count')}</span>
          </div>
        </div>
      </div>
      <div class="profile-stats">
        <div class="stat-box"><div class="stat-num">${stats.played}</div><div class="stat-label">${t('profile.stat.played')}</div></div>
        <div class="stat-box"><div class="stat-num">${stats.playing}</div><div class="stat-label">${t('profile.stat.playing')}</div></div>
        <div class="stat-box"><div class="stat-num">${stats.wishlist}</div><div class="stat-label">${t('profile.stat.wishlist')}</div></div>
        ${stats.abandoned ? `<div class="stat-box"><div class="stat-num">${stats.abandoned}</div><div class="stat-label">${t('status.abandoned')}</div></div>` : ''}
        ${stats.avg_rating ? `<div class="stat-box"><div class="stat-num">${stats.avg_rating}</div><div class="stat-label">${t('profile.stat.avg')}</div></div>` : ''}
        ${stats.total_playtime > 0 ? `<div class="stat-box"><div class="stat-num">${Math.round(stats.total_playtime/60)}h</div><div class="stat-label">${t('profile.stat.steam')}</div></div>` : ''}
      </div>
      ${stats.best_game ? `<div class="profile-best"><span style="color:var(--muted);font-size:0.85rem">${t('profile.best_rated')}</span> <strong>${escHtml(stats.best_game)}</strong> <span class="game-rating" style="font-size:0.8rem">${stats.best_rating}/10</span></div>` : ''}
    `;

    const followBtn = document.getElementById('btn-follow-profile');
    if (followBtn) {
      followBtn.addEventListener('click', async () => {
        if (!AUTH.user) { AUTH.showModal('login'); return; }
        try {
          if (followBtn.classList.contains('following')) {
            await AUTH.apiFetch(`/api/follow/${username}`, { method: 'DELETE' });
            followBtn.classList.remove('following'); followBtn.textContent = t('profile.btn_follow');
            showToast(t('toast.unfollow', {u: username}));
          } else {
            await AUTH.apiFetch(`/api/follow/${username}`, { method: 'POST' });
            followBtn.classList.add('following'); followBtn.textContent = t('profile.btn_following');
            showToast(t('toast.follow', {u: username}));
          }
        } catch (err) { if (err.status === 401) AUTH.showModal('login'); }
        followingLoaded = false;
      });
    }

    let activeStatus = 'all';
    function renderProfileList() {
      const filtered = activeStatus === 'all' ? entries : entries.filter(e => e.status === activeStatus);
      profileGrid.innerHTML = '';
      if (!filtered.length) { profileGrid.innerHTML = `<div class="no-results">${t('profile.no_games')}</div>`; return; }
      filtered.forEach(e => profileGrid.appendChild(renderCard(e, () => openModal(e.steam_appid))));
    }
    document.querySelectorAll('#profile-tabs .list-tab').forEach(tab => {
      const fresh = tab.cloneNode(true);
      tab.parentNode.replaceChild(fresh, tab);
      fresh.addEventListener('click', () => {
        document.querySelectorAll('#profile-tabs .list-tab').forEach(t => t.classList.remove('active'));
        fresh.classList.add('active'); activeStatus = fresh.dataset.status; renderProfileList();
      });
    });
    renderProfileList();
  } catch { header.innerHTML = `<div class="no-results">${t('profile.not_found')}</div>`; }
}

// ── Community view ────────────────────────────────────
let communityLoaded = false;

async function loadCommunity() {
  communityLoaded = false;
  const searchInput = document.getElementById('community-search-input');
  const resultsEl = document.getElementById('community-search-results');
  const listEl = document.getElementById('community-following-list');
  const feedEl = document.getElementById('community-feed');

  listEl.innerHTML = '';
  feedEl.innerHTML = '';

  // User search
  let searchTO = null;
  const freshInput = searchInput.cloneNode(true);
  searchInput.parentNode.replaceChild(freshInput, searchInput);
  freshInput.addEventListener('input', () => {
    clearTimeout(searchTO);
    const q = freshInput.value.trim();
    if (!q) { resultsEl.innerHTML = ''; return; }
    searchTO = setTimeout(async () => {
      const users = await AUTH.apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (!users.length) { resultsEl.innerHTML = `<p style="color:var(--muted);padding:8px 0">${t('following.no_results')}</p>`; return; }
      resultsEl.innerHTML = '';
      users.forEach(u => {
        const row = document.createElement('div');
        row.className = 'user-row';
        row.innerHTML = `
          <div class="user-avatar-sm" style="background:${avatarBg(u)}">${avatarContent(u, '1rem')}</div>
          <div style="flex:1">
            <span class="user-row-name">${u.username}</span>
            ${u.is_premium ? '<span class="premium-badge" style="font-size:0.8rem">⭐</span>' : ''}
            <span style="color:var(--muted);font-size:0.8rem;margin-left:8px">${t('following.games', {n: u.total_games})}</span>
          </div>
          ${AUTH.user ? `<button class="btn-follow ${u.is_following ? 'following' : ''}" data-username="${u.username}">
            ${u.is_following ? t('following.btn_following') : t('following.btn_follow')}
          </button>` : ''}
        `;
        const btn = row.querySelector('.btn-follow');
        if (btn) {
          btn.addEventListener('click', async () => {
            if (!AUTH.user) { AUTH.showModal('login'); return; }
            try {
              if (btn.classList.contains('following')) {
                await AUTH.apiFetch(`/api/follow/${u.username}`, { method: 'DELETE' });
                btn.classList.remove('following'); btn.textContent = t('following.btn_follow');
                showToast(t('toast.unfollow', {u: u.username}));
              } else {
                await AUTH.apiFetch(`/api/follow/${u.username}`, { method: 'POST' });
                btn.classList.add('following'); btn.textContent = t('following.btn_following');
                showToast(t('toast.follow', {u: u.username}));
              }
              communityLoaded = false;
            } catch (err) { if (err.status === 401) AUTH.showModal('login'); }
          });
        }
        row.querySelector('.user-avatar-sm').addEventListener('click', () => {
          history.pushState({}, '', `/u/${u.username}`); showView('profile'); loadProfile(u.username);
        });
        row.querySelector('.user-row-name').addEventListener('click', () => {
          history.pushState({}, '', `/u/${u.username}`); showView('profile'); loadProfile(u.username);
        });
        resultsEl.appendChild(row);
      });
    }, 300);
  });

  if (!AUTH.user) return;
  if (communityLoaded) return;
  communityLoaded = true;

  listEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const { following, feed } = await AUTH.apiFetch('/api/following');

  if (!following.length) {
    listEl.innerHTML = `<p style="color:var(--muted);margin:16px 0">${t('following.empty')}</p>`;
  } else {
    listEl.innerHTML = `<h4 style="margin:24px 0 12px;color:var(--muted2);font-size:0.9rem;text-transform:uppercase;letter-spacing:.05em">${t('following.title')}</h4>`;
    following.forEach(u => {
      const row = document.createElement('div');
      row.className = 'user-row';
      row.innerHTML = `
        <div class="user-avatar-sm">${u.username[0].toUpperCase()}</div>
        <span class="user-row-name">${u.username}</span>
        <button class="btn-follow following" data-username="${u.username}">${t('following.btn_following')}</button>
      `;
      row.querySelector('.user-avatar-sm').addEventListener('click', () => {
        history.pushState({}, '', `/u/${u.username}`); showView('profile'); loadProfile(u.username);
      });
      row.querySelector('.user-row-name').addEventListener('click', () => {
        history.pushState({}, '', `/u/${u.username}`); showView('profile'); loadProfile(u.username);
      });
      row.querySelector('.btn-follow').addEventListener('click', async () => {
        await AUTH.apiFetch(`/api/follow/${u.username}`, { method: 'DELETE' });
        row.remove(); communityLoaded = false;
        showToast(t('toast.unfollow', {u: u.username}));
      });
      listEl.appendChild(row);
    });
  }

  if (!feed.length) {
    feedEl.innerHTML = `<p style="color:var(--muted);margin-top:16px">${t('following.feed_empty')}</p>`;
  } else {
    feedEl.innerHTML = `<h4 style="margin:24px 0 12px;color:var(--muted2);font-size:0.9rem;text-transform:uppercase;letter-spacing:.05em">${t('following.activity')}</h4>`;
    feed.forEach(e => feedEl.appendChild(renderFeedItem(e)));
  }
}

// ── Steam import ──────────────────────────────────────
const steamOverlay = document.getElementById('steam-overlay');
document.getElementById('steam-close').addEventListener('click', () => steamOverlay.classList.remove('open'));
steamOverlay.addEventListener('click', e => { if (e.target === steamOverlay) steamOverlay.classList.remove('open'); });

async function openSteamImport(steamId) {
  const content = document.getElementById('steam-content');
  steamOverlay.classList.add('open');
  content.innerHTML = `<div class="loading"><div class="spinner"></div><p style="margin-top:12px;color:var(--muted)">${t('loading.steam')}</p></div>`;

  try {
    const preview = await AUTH.apiFetch(`/api/steam/preview?steam_id=${encodeURIComponent(steamId)}`);
    const played = preview.games.filter(g => g.playtime > 0).length;
    const topGames = preview.games.slice(0, 5);

    content.innerHTML = `
      <p style="color:var(--muted);margin-bottom:16px;font-size:0.9rem">${t('steam.found', {n: preview.total})}</p>
      <div style="margin-bottom:16px;background:var(--surface2);border-radius:10px;padding:12px;font-size:0.85rem">
        <div style="color:var(--muted2);margin-bottom:8px">${t('steam.top_hours')}</div>
        ${topGames.map(g => `
          <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
            <span>${escHtml(g.name)}</span>
            <span style="color:var(--cyan)">${Math.round(g.playtime/60)}h</span>
          </div>`).join('')}
      </div>
      <div style="margin-bottom:16px">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:10px">
          <input type="radio" name="import-mode" value="played" checked />
          <span>${t('steam.mode_played', {n: played})}</span>
        </label>
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
          <input type="radio" name="import-mode" value="all" />
          <span>${t('steam.mode_all', {n: preview.total})}</span>
        </label>
      </div>
      <button class="btn-primary w-full" id="btn-confirm-import">${t('steam.btn_import')}</button>
      <p style="color:var(--muted);font-size:0.75rem;margin-top:10px;text-align:center">${t('steam.note')}</p>
    `;

    document.getElementById('btn-confirm-import').addEventListener('click', async () => {
      const onlyPlayed = document.querySelector('input[name="import-mode"]:checked').value === 'played';
      const btn = document.getElementById('btn-confirm-import');
      btn.disabled = true; btn.textContent = t('steam.btn_importing');
      try {
        const result = await AUTH.apiFetch('/api/steam/import', {
          method: 'POST',
          body: JSON.stringify({ steam_id: preview.steam_id, games: preview.games, only_played: onlyPlayed })
        });
        steamOverlay.classList.remove('open');
        showToast(t('toast.steam_imported', {n: result.imported}));
        history.pushState({}, '', '/mi-perfil');
        showView('profile-me');
        profileMeTab = 'mygames';
        loadProfileMe();
      } catch (e) {
        showToast(translateError(e.message));
        btn.disabled = false; btn.textContent = t('steam.btn_import');
      }
    });
  } catch(e) {
    content.innerHTML = `
      <div style="text-align:center;padding:20px 0">
        <p style="color:#ef4444;margin-bottom:12px">${escHtml(translateError(e.message))}</p>
        <p style="color:var(--muted);font-size:0.85rem">${t('steam.error_public')}</p>
      </div>`;
  }
}

// ── Steam Tab ─────────────────────────────────────────
function loadSteamTab() {
  const el = document.getElementById('steam-tab-content');
  const steamId = AUTH.user?.steam_id || '';
  const lastSync = AUTH.user?.last_steam_sync;
  const isPremium = AUTH.user?.is_premium;
  const syncBadge = isPremium && steamId ? `
    <div style="display:flex;align-items:center;gap:8px;background:color-mix(in srgb,var(--cyan) 12%,transparent);border:1px solid color-mix(in srgb,var(--cyan) 30%,transparent);border-radius:8px;padding:10px 14px;margin-bottom:20px;font-size:0.88rem">
      <span style="color:var(--cyan);font-size:1rem">🔄</span>
      <div>
        <span style="color:var(--cyan);font-weight:600">${t('steam.autosync_active')}</span>
        <span style="color:var(--muted);margin-left:8px;font-size:0.82rem">${lastSync ? t('steam.autosync_last', {date: new Date(lastSync).toLocaleDateString()}) : t('steam.autosync_pending')}</span>
      </div>
    </div>` : isPremium && !steamId ? `
    <div style="background:color-mix(in srgb,var(--cyan) 8%,transparent);border:1px solid color-mix(in srgb,var(--cyan) 20%,transparent);border-radius:8px;padding:10px 14px;margin-bottom:20px;font-size:0.85rem;color:var(--muted)">
      ${t('steam.autosync_hint')}
    </div>` : '';
  el.innerHTML = `
    <div style="max-width:480px">
      ${syncBadge}
      ${steamId ? `<p style="color:var(--muted);font-size:0.88rem;margin-bottom:12px">${t('steam.connected', {id: escHtml(steamId)})}</p>` : ''}
      <label class="field-label">${t('settings.steam_label')}</label>
      <input type="text" id="steam-id-tab" class="field-input" value="${escHtml(steamId)}"
        placeholder="${t('settings.steam_placeholder')}" style="margin-bottom:8px" />
      <p style="color:var(--muted);font-size:0.8rem;margin-bottom:20px">${t('settings.steam_hint')}</p>
      <button class="btn-primary" id="btn-steam-preview-tab">🎮 ${t('steam.btn_preview')}</button>
      <div id="steam-inline-result" style="margin-top:20px"></div>
    </div>
  `;
  document.getElementById('btn-steam-preview-tab').addEventListener('click', async () => {
    const sid = document.getElementById('steam-id-tab').value.trim();
    if (!sid) return;
    const btn = document.getElementById('btn-steam-preview-tab');
    const resultEl = document.getElementById('steam-inline-result');
    btn.disabled = true; btn.textContent = t('loading.steam');
    resultEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
      const preview = await AUTH.apiFetch(`/api/steam/preview?steam_id=${encodeURIComponent(sid)}`);
      const played = preview.games.filter(g => g.playtime > 0).length;
      resultEl.innerHTML = `
        <p style="color:var(--muted);margin-bottom:12px;font-size:0.9rem">${t('steam.found', {n: preview.total})}</p>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:16px;font-size:0.85rem">
          <div style="color:var(--muted2);margin-bottom:8px">${t('steam.top_hours')}</div>
          ${preview.games.slice(0, 5).map(g => `
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
              <span>${escHtml(g.name)}</span>
              <span style="color:var(--cyan)">${Math.round(g.playtime/60)}h</span>
            </div>`).join('')}
        </div>
        <div style="margin-bottom:16px">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:10px">
            <input type="radio" name="import-mode-tab" value="played" checked />
            <span>${t('steam.mode_played', {n: played})}</span>
          </label>
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
            <input type="radio" name="import-mode-tab" value="all" />
            <span>${t('steam.mode_all', {n: preview.total})}</span>
          </label>
        </div>
        <button class="btn-primary w-full" id="btn-do-import-tab">${t('steam.btn_import')}</button>
        <p style="color:var(--muted);font-size:0.75rem;margin-top:10px;text-align:center">${t('steam.note')}</p>
      `;
      document.getElementById('btn-do-import-tab').addEventListener('click', async () => {
        const onlyPlayed = document.querySelector('input[name="import-mode-tab"]:checked').value === 'played';
        const impBtn = document.getElementById('btn-do-import-tab');
        impBtn.disabled = true; impBtn.textContent = t('steam.btn_importing');
        try {
          const result = await AUTH.apiFetch('/api/steam/import', {
            method: 'POST',
            body: JSON.stringify({ steam_id: preview.steam_id, games: preview.games, only_played: onlyPlayed })
          });
          AUTH.user.steam_id = preview.steam_id;
          localStorage.setItem('gl_user', JSON.stringify(AUTH.user));
          showToast(t('toast.steam_imported', {n: result.imported}));
          profileMeTab = 'mygames'; switchProfileTab('mygames');
        } catch (e) {
          showToast(translateError(e.message));
          impBtn.disabled = false; impBtn.textContent = t('steam.btn_import');
        }
      });
    } catch(e) {
      resultEl.innerHTML = `
        <p style="color:#ef4444;margin-bottom:8px">${escHtml(translateError(e.message))}</p>
        <p style="color:var(--muted);font-size:0.85rem">${t('steam.error_public')}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = `🎮 ${t('steam.btn_preview')}`;
    }
  });
}

// ── Ideas / Roadmap ───────────────────────────────────
let ideasFilter = 'all';
let ideasData = { is_admin: false, suggestions: [] };

async function loadIdeas() {
  const el = document.getElementById('ideas-list');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  document.getElementById('btn-new-idea').style.display = AUTH.user ? '' : 'none';

  document.querySelectorAll('#ideas-tabs .list-tab').forEach(tab => {
    const fresh = tab.cloneNode(true);
    tab.parentNode.replaceChild(fresh, tab);
    fresh.addEventListener('click', () => {
      document.querySelectorAll('#ideas-tabs .list-tab').forEach(t => t.classList.remove('active'));
      fresh.classList.add('active');
      ideasFilter = fresh.dataset.filter;
      renderIdeas();
    });
  });

  try {
    ideasData = await AUTH.apiFetch('/api/suggestions');
    renderIdeas();
  } catch { el.innerHTML = `<div class="no-results">${t('modal.error')}</div>`; }

  const ideaOverlay = document.getElementById('idea-overlay');
  document.getElementById('idea-close').onclick = () => ideaOverlay.classList.remove('open');
  ideaOverlay.onclick = e => { if (e.target === ideaOverlay) ideaOverlay.classList.remove('open'); };

  document.getElementById('btn-new-idea').onclick = () => {
    if (!AUTH.user) { AUTH.showModal('login'); return; }
    document.getElementById('idea-title').value = '';
    document.getElementById('idea-body').value = '';
    document.getElementById('idea-msg').style.display = 'none';
    ideaOverlay.classList.add('open');
  };

  document.getElementById('btn-submit-idea').onclick = async () => {
    const title = document.getElementById('idea-title').value.trim();
    const body = document.getElementById('idea-body').value.trim();
    const msgEl = document.getElementById('idea-msg');
    const btn = document.getElementById('btn-submit-idea');
    if (title.length < 5) { msgEl.style.display = ''; msgEl.style.color = '#ef4444'; msgEl.textContent = t('ideas.err_title'); return; }
    btn.disabled = true; btn.textContent = t('ideas.btn_sending');
    try {
      await AUTH.apiFetch('/api/suggestions', { method: 'POST', body: JSON.stringify({ title, body: body || null }) });
      ideaOverlay.classList.remove('open');
      showToast(t('ideas.toast_sent'));
      ideasData = await AUTH.apiFetch('/api/suggestions');
      renderIdeas();
    } catch(e) {
      msgEl.style.display = ''; msgEl.style.color = '#ef4444'; msgEl.textContent = e.message;
    } finally {
      btn.disabled = false; btn.textContent = t('ideas.btn_submit');
    }
  };
}

function renderIdeas() {
  const el = document.getElementById('ideas-list');
  const list = ideasFilter === 'all'
    ? ideasData.suggestions
    : ideasData.suggestions.filter(s => s.status === ideasFilter);

  if (!list.length) { el.innerHTML = `<div class="no-results">${t('ideas.empty')}</div>`; return; }

  el.innerHTML = '';
  list.forEach(s => el.appendChild(renderSuggestionCard(s)));
}

function renderSuggestionCard(s) {
  const statusLabels = { open: t('ideas.status_open'), planned: t('ideas.status_planned'), done: t('ideas.status_done') };
  const statusCls = { open: 'suggestion-open', planned: 'suggestion-planned', done: 'suggestion-done' };

  const card = document.createElement('div');
  card.className = 'suggestion-card';
  card.innerHTML = `
    <button class="vote-btn ${s.voted ? 'voted' : ''}" data-id="${s.id}">
      <span class="vote-arrow">▲</span>
      <span class="vote-count">${s.votes}</span>
    </button>
    <div class="suggestion-body">
      <div class="suggestion-top">
        <h3 class="suggestion-title">${escHtml(s.title)}</h3>
        <span class="suggestion-status ${statusCls[s.status] || ''}">${statusLabels[s.status] || s.status}</span>
      </div>
      ${s.body ? `<p class="suggestion-desc">${escHtml(s.body)}</p>` : ''}
      <div class="suggestion-meta">
        ${s.author ? `@${escHtml(s.author)}` : t('ideas.anonymous')} · ${timeAgo(s.created_at)}
      </div>
      ${ideasData.is_admin ? `
        <div class="admin-actions">
          <button class="admin-status-btn" data-id="${s.id}" data-status="open">💡</button>
          <button class="admin-status-btn" data-id="${s.id}" data-status="planned">📋</button>
          <button class="admin-status-btn" data-id="${s.id}" data-status="done">✅</button>
        </div>` : ''}
    </div>
  `;

  card.querySelector('.vote-btn').addEventListener('click', async () => {
    if (!AUTH.user) { AUTH.showModal('login'); return; }
    const btn = card.querySelector('.vote-btn');
    try {
      const r = await AUTH.apiFetch(`/api/suggestions/${s.id}/vote`, { method: 'POST' });
      s.voted = r.voted; s.votes = r.count;
      btn.classList.toggle('voted', r.voted);
      btn.querySelector('.vote-count').textContent = r.count;
    } catch {}
  });

  card.querySelectorAll('.admin-status-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await AUTH.apiFetch(`/api/suggestions/${s.id}`, { method: 'PATCH', body: JSON.stringify({ status: btn.dataset.status }) });
      s.status = btn.dataset.status;
      card.querySelector('.suggestion-status').className = `suggestion-status ${statusCls[s.status] || ''}`;
      card.querySelector('.suggestion-status').textContent = statusLabels[s.status];
    });
  });

  return card;
}

// ── Premium ───────────────────────────────────────────
const premiumOverlay = document.getElementById('premium-overlay');

function showPremiumModal() { premiumOverlay.classList.add('open'); }
function closePremiumModal() { premiumOverlay.classList.remove('open'); }

document.getElementById('premium-close').addEventListener('click', closePremiumModal);
premiumOverlay.addEventListener('click', e => { if (e.target === premiumOverlay) closePremiumModal(); });

document.getElementById('btn-premium-menu').addEventListener('click', () => {
  document.getElementById('user-dropdown').classList.remove('open');
  if (AUTH.user?.is_premium) {
    // Open billing portal to manage subscription
    AUTH.apiFetch('/api/billing/portal', { method: 'POST' })
      .then(r => { window.location.href = r.url; })
      .catch(err => {
        if (err.status === 400) showToast(t('toast.portal_no_stripe'));
        else showToast(t('toast.portal_error'));
      });
  } else {
    showPremiumModal();
  }
});

document.getElementById('btn-go-premium').addEventListener('click', async () => {
  if (!AUTH.user) { closePremiumModal(); AUTH.showModal('login'); return; }
  const btn = document.getElementById('btn-go-premium');
  btn.textContent = t('premium.redirecting'); btn.disabled = true;
  try {
    const { url } = await AUTH.apiFetch('/api/billing/checkout', { method: 'POST' });
    window.location.href = url;
  } catch (e) {
    showToast('Error: ' + (translateError(e.message) || 'Inténtalo de nuevo'));
    btn.textContent = t('premium.btn'); btn.disabled = false;
  }
});

// Handle return from Stripe
(function handleStripeReturn() {
  const params = new URLSearchParams(location.search);
  if (params.get('premium') === 'success') {
    history.replaceState({}, '', '/');
    setTimeout(() => showToast(t('toast.premium')), 500);
    AUTH.verify();
  } else if (params.get('premium') === 'cancel') {
    history.replaceState({}, '', '/');
  }
})();

// ── Toast ─────────────────────────────────────────────
function showToast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('toast-show'), 10);
  setTimeout(() => { t.classList.remove('toast-show'); setTimeout(() => t.remove(), 300); }, 3000);
}

// ── Modal events ──────────────────────────────────────
document.getElementById('modal-close').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── Init ──────────────────────────────────────────────
// DOMContentLoaded fires after all scripts run. auth.js registers its listener
// first, so AUTH.init() runs before route() — ensuring AUTH.user is restored
// from localStorage before authenticated views are loaded.
document.addEventListener('DOMContentLoaded', () => {
  route();
  initGenrePills();
  setTimeout(() => {
    if (!AUTH.user && !localStorage.getItem('ck_tour_done')) startTour();
  }, 500);
});


// ── Onboarding Tour ───────────────────────────────────
const TOUR_STEPS = [
  { target: null,             get title() { return t('tour.step0.title'); }, get text() { return t('tour.step0.text'); } },
  { target: '#games-grid',   get title() { return t('tour.step1.title'); }, get text() { return t('tour.step1.text'); }, pos: 'top' },
  { target: '#search-input', get title() { return t('tour.step2.title'); }, get text() { return t('tour.step2.text'); }, pos: 'bottom' },
  { target: '#nav-explore',  get title() { return t('tour.step3.title'); }, get text() { return t('tour.step3.text'); }, pos: 'bottom' },
  { target: '#nav-ranking',  get title() { return t('tour.step4.title'); }, get text() { return t('tour.step4.text'); }, pos: 'bottom' },
  { target: '#nav-community',get title() { return t('tour.step5.title'); }, get text() { return t('tour.step5.text'); }, pos: 'bottom' },
  { target: '#nav-ideas',    get title() { return t('tour.step6.title'); }, get text() { return t('tour.step6.text'); }, pos: 'bottom' },
  { target: '#btn-premium-menu', get title() { return t('tour.step7.title'); }, get text() { return t('tour.step7.text'); }, pos: 'bottom' },
  { target: '#btn-register', get title() { return t('tour.step8.title'); }, get text() { return t('tour.step8.text'); }, pos: 'bottom', cta: true },
];

const PAGE_TOURS = {
  explore: [
    { target: null,
      get title() { return t('tour.explore.step0.title'); },
      get text()  { return t('tour.explore.step0.text'); } },
    { target: '#explore-content', pos: 'top',
      get title() { return t('tour.explore.step1.title'); },
      get text()  { return t('tour.explore.step1.text'); } },
    { target: '#genre-sort-tabs', pos: 'bottom',
      onEnter: () => { history.pushState({}, '', '/explore/action'); loadGenreDetail('action'); },
      get title() { return t('tour.explore.step2.title'); },
      get text()  { return t('tour.explore.step2.text'); } },
  ],
  ranking: [
    { target: null,
      get title() { return t('tour.ranking.step0.title'); },
      get text()  { return t('tour.ranking.step0.text'); } },
    { target: '#ranking-list', pos: 'top',
      get title() { return t('tour.ranking.step1.title'); },
      get text()  { return t('tour.ranking.step1.text'); } },
    { target: null,
      get title() { return t('tour.ranking.step2.title'); },
      get text()  { return t('tour.ranking.step2.text'); } },
  ],
  community: [
    { target: null,
      get title() { return t('tour.community.step0.title'); },
      get text()  { return t('tour.community.step0.text'); } },
    { target: '#community-search-input', pos: 'bottom',
      get title() { return t('tour.community.step1.title'); },
      get text()  { return t('tour.community.step1.text'); } },
    { target: '#community-feed', pos: 'top',
      get title() { return t('tour.community.step2.title'); },
      get text()  { return t('tour.community.step2.text'); } },
  ],
  ideas: [
    { target: null,
      get title() { return t('tour.ideas.step0.title'); },
      get text()  { return t('tour.ideas.step0.text'); } },
    { target: '#ideas-list', pos: 'top',
      get title() { return t('tour.ideas.step1.title'); },
      get text()  { return t('tour.ideas.step1.text'); } },
    { target: '#ideas-tabs', pos: 'bottom',
      get title() { return t('tour.ideas.step2.title'); },
      get text()  { return t('tour.ideas.step2.text'); } },
    { target: '#btn-new-idea', pos: 'bottom',
      get title() { return t('tour.ideas.step3.title'); },
      get text()  { return t('tour.ideas.step3.text'); } },
  ],
  'profile-me': [
    { target: null,
      get title() { return t('tour.profile-me.step0.title'); },
      get text()  { return t('tour.profile-me.step0.text'); } },
    { target: '#mylist-tabs', pos: 'bottom',
      get title() { return t('tour.profile-me.step1.title'); },
      get text()  { return t('tour.profile-me.step1.text'); } },
    { target: '#profile-me-tabs .list-tab[data-tab="steam"]', pos: 'bottom',
      get title() { return t('tour.profile-me.step2.title'); },
      get text()  { return t('tour.profile-me.step2.text'); } },
    { target: '#profile-me-tabs .list-tab[data-tab="account"]', pos: 'bottom',
      get title() { return t('tour.profile-me.step3.title'); },
      get text()  { return t('tour.profile-me.step3.text'); } },
    { target: '#profile-me-tabs .list-tab[data-tab="wishlist"]', pos: 'bottom',
      get title() { return t('tour.profile-me.step4.title'); },
      get text()  { return t('tour.profile-me.step4.text'); } },
  ],
};

let _tourStep = 0;
let _tourEl = null;
let _currentTourSteps = null;  // active step array (set by startTour / startPageTour)
let _currentTourPage = null;   // view name for page tours, null for home tour
let _tourIsManual = false;     // true when triggered via footer button (no localStorage write)

function startTour(manual = false) {
  _currentTourSteps = TOUR_STEPS;
  _currentTourPage = null;
  _tourIsManual = manual;
  _startTourEngine();
}

function startPageTour(page, manual = false) {
  const steps = PAGE_TOURS[page];
  if (!steps) return;
  if (_tourEl) {
    _tourEl.remove();
    _tourEl = null;
    document.removeEventListener('keydown', _tourKeyHandler);
  }
  _currentTourSteps = steps;
  _currentTourPage = page;
  _tourIsManual = manual;
  _startTourEngine();
}

function _startTourEngine() {
  if (_tourEl) return;
  _tourStep = 0;
  _tourEl = document.createElement('div');
  _tourEl.id = 'tour-root';
  _tourEl.innerHTML = `
    <div id="tour-spotlight"></div>
    <div id="tour-popup">
      <div class="tour-header">
        <span class="tour-step-info"></span>
        <button id="tour-skip">Saltar tour</button>
      </div>
      <h3 id="tour-title"></h3>
      <p id="tour-text"></p>
      <div class="tour-dots"></div>
      <div class="tour-footer">
        <button id="tour-back">← Anterior</button>
        <button id="tour-next">Siguiente →</button>
      </div>
    </div>
  `;
  document.body.appendChild(_tourEl);

  document.getElementById('tour-skip').addEventListener('click', endTour);
  document.getElementById('tour-next').addEventListener('click', _tourNext);
  document.getElementById('tour-back').addEventListener('click', _tourPrev);
  document.addEventListener('keydown', _tourKeyHandler);

  _renderTourStep();
}

function _tourKeyHandler(e) {
  if (e.key === 'ArrowRight' || e.key === 'Enter') _tourNext();
  if (e.key === 'ArrowLeft') _tourPrev();
  if (e.key === 'Escape') endTour();
}

function _tourNext() {
  if (_tourStep < _currentTourSteps.length - 1) {
    _tourStep++;
    _renderTourStep();
  } else {
    endTour();
    if (!AUTH.user && !_currentTourPage) AUTH.showModal('register');
  }
}

function _tourPrev() {
  if (_tourStep > 0) { _tourStep--; _renderTourStep(); }
}

function _renderTourStep() {
  const step = _currentTourSteps[_tourStep];
  const isLast = _tourStep === _currentTourSteps.length - 1;
  const isFirst = _tourStep === 0;

  document.getElementById('tour-title').textContent = step.title;
  document.getElementById('tour-text').textContent = step.text;
  document.querySelector('.tour-step-info').textContent = `${_tourStep + 1} / ${_currentTourSteps.length}`;
  document.getElementById('tour-next').textContent = isLast
    ? (_currentTourPage ? t('tour.btn_done') : '¡Empezar! 🚀')
    : 'Siguiente →';
  document.getElementById('tour-back').style.visibility = isFirst ? 'hidden' : '';

  // Dots
  document.querySelector('.tour-dots').innerHTML = _currentTourSteps.map((_, i) =>
    `<span class="tour-dot ${i === _tourStep ? 'active' : ''}"></span>`
  ).join('');

  if (step.onEnter) step.onEnter();

  const spotlight = document.getElementById('tour-spotlight');
  const popup = document.getElementById('tour-popup');

  if (!step.target) {
    spotlight.style.cssText = 'display:none';
    popup.className = 'tour-center';
    return;
  }

  popup.className = '';
  const target = document.querySelector(step.target);
  if (!target || getComputedStyle(target).display === 'none') {
    _tourStep++;
    if (_tourStep < _currentTourSteps.length) _renderTourStep();
    else endTour();
    return;
  }

  // Scroll target into view, then position
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => {
    const r = target.getBoundingClientRect();
    const pad = 10;
    spotlight.style.cssText = `display:block;left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = Math.min(340, vw - 32);

    // Vertical: prefer below, fallback above
    let top;
    if (step.pos === 'bottom' || r.bottom + 16 + 200 < vh) {
      top = r.bottom + pad + 16;
    } else {
      top = r.top - pad - 16 - 240;
    }
    top = Math.max(16, Math.min(top, vh - 260));

    // Horizontal: center on target, clamp to viewport
    let left = r.left + r.width / 2 - pw / 2;
    left = Math.max(16, Math.min(left, vw - pw - 16));

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
    popup.style.width = `${pw}px`;
  }, 380);
}

function endTour() {
  if (!_tourIsManual) {
    if (_currentTourPage) {
      localStorage.setItem(`ck_tour_${_currentTourPage}_done`, '1');
    } else {
      localStorage.setItem('ck_tour_done', '1');
    }
  }
  document.removeEventListener('keydown', _tourKeyHandler);
  if (_tourEl) {
    _tourEl.style.opacity = '0';
    _tourEl.style.transition = 'opacity 0.3s';
    const el = _tourEl;
    _tourEl = null;
    setTimeout(() => el.remove(), 300);
  }
}
