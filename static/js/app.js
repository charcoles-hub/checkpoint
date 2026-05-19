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
const VIEWS = ['home', 'mylist', 'ranking', 'profile', 'explore'];

function showView(name) {
  VIEWS.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = v === name ? '' : 'none';
  });
}

// ── Nav hamburger ────────────────────────────────────
const hamburger = document.getElementById('hamburger');
const navRight = document.getElementById('nav-right');
hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  navRight.classList.toggle('open');
});
function closeMenu() {
  hamburger.classList.remove('open');
  navRight.classList.remove('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.nav-inner')) closeMenu();
});

// ── Nav ──────────────────────────────────────────────
document.getElementById('nav-home').addEventListener('click', e => { e.preventDefault(); history.pushState({}, '', '/'); resetHome(); closeMenu(); });
document.getElementById('nav-mylist').addEventListener('click', () => { history.pushState({}, '', '/mylist'); showView('mylist'); loadMyList(); closeMenu(); });
document.getElementById('nav-ranking').addEventListener('click', () => { history.pushState({}, '', '/ranking'); showView('ranking'); loadRanking(); closeMenu(); });
document.getElementById('nav-explore').addEventListener('click', () => { history.pushState({}, '', '/explore'); showView('explore'); loadExplore(); closeMenu(); });

function resetHome() {
  currentPage = 1; currentSearch = ''; currentGenre = ''; currentPlatform = ''; currentSort = 'popular';
  searchInput.value = '';
  sectionTitle.textContent = 'Juegos populares';
  document.querySelectorAll('.genre-pill').forEach(p => p.classList.toggle('active', p.dataset.genre === ''));
  document.querySelectorAll('.platform-pill').forEach(p => p.classList.toggle('active', p.dataset.platform === ''));
  document.getElementById('platform-filter').style.display = 'none';
  document.getElementById('genre-pills').style.display = '';
  document.querySelectorAll('#sort-tabs .sort-tab').forEach(t => t.classList.toggle('active', t.dataset.sort === 'popular'));
  showView('home');
  loadGames();
}

// ── Routing ──────────────────────────────────────────
function route() {
  const path = location.pathname;
  if (path === '/' || path === '') { showView('home'); loadGames(); initGenrePills(); }
  else if (path === '/mylist') { showView('mylist'); loadMyList(); }
  else if (path === '/ranking') { showView('ranking'); loadRanking(); }
  else if (path.startsWith('/explore')) {
    const genreKey = decodeURIComponent(path.replace('/explore/', '').replace('/explore', ''));
    showView('explore');
    if (genreKey) loadGenreDetail(genreKey);
    else loadExplore();
  }
  else if (path.startsWith('/u/')) { showView('profile'); loadProfile(path.slice(3)); }
  else { showView('home'); loadGames(); initGenrePills(); }
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
  container.innerHTML = '<button class="genre-pill active" data-genre="">Todos</button>';
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
        ? `Mejores de ${genres.find(g => g.key === currentGenre)?.name || currentGenre}`
        : 'Juegos populares';
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
function renderCard(game, onClick) {
  const platforms = (game.platforms || []).slice(0, 3);
  const statusLabel = { played: 'Jugado', playing: 'Jugando', wishlist: 'Deseado' };
  const name = game.name || game.game_name;
  const image = game.image || game.game_image;

  const card = document.createElement('div');
  card.className = 'game-card';
  card.innerHTML = `
    ${image ? `<img class="game-card-img" src="${image}" alt="${name}" loading="lazy" />` : `<div class="game-card-img-placeholder">🎮</div>`}
    <div class="game-card-body">
      <div class="game-card-title">${name}</div>
      <div class="game-card-meta">
        ${game.rating != null ? `<span class="game-rating">${game.rating}/10</span>` : ''}
        ${game.avg_rating ? `<span class="game-rating community-rating" title="${game.votes} votos">★ ${game.avg_rating}</span>` : ''}
        ${game.status ? `<span class="status-badge status-${game.status}">${statusLabel[game.status]}</span>` : ''}
        ${game.price ? `<span class="game-year" style="color:var(--cyan)">${game.price}</span>` : ''}
      </div>
      ${platforms.length ? `<div class="game-platforms">${platforms.map(p => `<span class="platform-tag">${p}</span>`).join('')}</div>` : ''}
      ${game.notes ? `<div class="game-notes">"${game.notes.slice(0, 60)}${game.notes.length > 60 ? '…' : ''}"</div>` : ''}
    </div>
  `;
  const appid = game.id || game.steam_appid;
  card.addEventListener('click', onClick || (() => openModal(appid)));
  return card;
}

// ── Load games (home) ─────────────────────────────────
async function loadGames() {
  grid.innerHTML = '<div class="loading"><div class="spinner"></div><p>Cargando...</p></div>';
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
    } else {
      // Normal search/browse
      const params = new URLSearchParams({ page: currentPage });
      if (currentSearch) params.set('search', currentSearch);
      data = await AUTH.apiFetch(`/api/games?${params}`);
    }

    if (!data.results?.length) {
      grid.innerHTML = '<div class="no-results">No se encontraron juegos.</div>';
      return;
    }
    grid.innerHTML = '';
    data.results.forEach(g => grid.appendChild(renderCard(g)));
    totalGames = data.count || 0;

    // Apply platform filter if active
    if (currentPlatform) applyPlatformFilter();
    renderPagination();
  } catch {
    grid.innerHTML = '<div class="no-results">Error al cargar juegos.</div>';
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
      ? `Resultados para "${q}"`
      : (currentGenre ? `Mejores de ${currentGenre}` : 'Juegos populares');
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
  containerEl.appendChild(mkBtn('← Anterior', currentPage === 1, () => { currentPage--; go(currentPage); }));
  pages.forEach(p => {
    if (p === '…') { const s = document.createElement('span'); s.style.cssText = 'padding:8px 4px;color:var(--muted)'; s.textContent = '…'; containerEl.appendChild(s); }
    else containerEl.appendChild(mkBtn(p, false, () => go(p), p === currentPage));
  });
  containerEl.appendChild(mkBtn('Siguiente →', currentPage === totalPages, () => { currentPage++; go(currentPage); }));
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
  title.textContent = 'Explorar por género';
  sortTabs.style.display = 'none';
  content.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    if (!genreCache) genreCache = await AUTH.apiFetch('/api/genres');
    // Get a preview image for each genre (first game's image)
    const previews = await Promise.allSettled(
      genreCache.map(g => AUTH.apiFetch(`/api/genres/${encodeURIComponent(g.key)}?page=1`))
    );

    content.innerHTML = '';
    const genreGrid = document.createElement('div');
    genreGrid.className = 'genre-grid';

    genreCache.forEach((genre, i) => {
      const result = previews[i];
      const coverImg = result.status === 'fulfilled' && result.value.results?.length
        ? result.value.results[0].image : '';
      const count = result.status === 'fulfilled' ? result.value.count : 0;

      const card = document.createElement('div');
      card.className = 'genre-card';
      card.innerHTML = `
        ${coverImg ? `<img class="genre-card-bg" src="${coverImg}" alt="${genre.name}" />` : ''}
        <div class="genre-card-overlay"></div>
        <div class="genre-card-body">
          <span class="genre-emoji">${genre.emoji}</span>
          <span class="genre-card-name">${genre.name}</span>
          ${count ? `<span class="genre-card-count">${count.toLocaleString()} juegos</span>` : ''}
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
    content.innerHTML = '<div class="no-results">Error al cargar géneros.</div>';
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
  content.innerHTML = `<button class="btn-ghost" id="btn-back-explore" style="margin-bottom:20px">← Volver a géneros</button><div class="games-grid" id="genre-grid"><div class="loading"><div class="spinner"></div></div></div>`;
  document.getElementById('btn-back-explore').addEventListener('click', () => {
    history.pushState({}, '', '/explore');
    sortTabs.style.display = 'none';
    loadExplore();
  });

  sortTabs.style.display = '';
  genrePage = 1; genreSort = 'popular';
  document.querySelectorAll('#genre-sort-tabs .sort-tab').forEach(t => t.classList.toggle('active', t.dataset.sort === 'popular'));

  const renderGenreGames = (results) => {
    const genreGrid = document.getElementById('genre-grid');
    if (!genreGrid) return;
    let sorted = [...results];
    if (genreSort === 'community') {
      sorted = sorted.filter(g => g.avg_rating).sort((a, b) => b.avg_rating - a.avg_rating);
      if (!sorted.length) {
        genreGrid.innerHTML = '<div class="no-results">Aún no hay valoraciones de la comunidad para este género. ¡Sé el primero!</div>';
        return;
      }
    }
    genreGrid.innerHTML = '';
    sorted.forEach(g => genreGrid.appendChild(renderCard(g, () => openModal(g.id))));
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
    const [g, myEntry] = await Promise.all([
      AUTH.apiFetch(`/api/games/${gameId}`),
      AUTH.user ? AUTH.apiFetch(`/api/list/${gameId}`).catch(() => null) : Promise.resolve(null),
    ]);
    const genres = (g.genres || []).map(x => `<span class="genre-tag">${x}</span>`).join('');
    const plats = (g.platforms || []).slice(0, 5).map(p => `<span class="platform-tag">${p}</span>`).join('');
    const desc = (g.description || 'Sin descripción.').slice(0, 500) + (g.description?.length > 500 ? '…' : '');

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
      <div class="detail-actions">
        <button class="btn-add" id="modal-btn-played">✓ Jugado</button>
        <button class="btn-add" id="modal-btn-playing" style="background:var(--cyan);color:#000">▶ Jugando</button>
        <button class="btn-wishlist" id="modal-btn-wishlist">♡ Deseos</button>
      </div>
      <div id="rating-form" style="display:none" class="alert-form-box">
        <p class="alert-form-label" style="margin-bottom:14px">¿Qué te pareció? <span style="color:var(--muted);font-size:0.8rem">(opcional)</span></p>
        <div id="stars-container" style="margin-bottom:14px;display:flex;gap:2px"></div>
        <textarea id="review-notes" class="field-input" rows="2" placeholder="Escribe tu opinión..." style="resize:vertical;margin-bottom:12px"></textarea>
        <div style="display:flex;gap:10px">
          <button class="btn-add" id="btn-save-rating">Guardar</button>
          <button class="btn-ghost" id="btn-skip-rating">Sin valorar</button>
        </div>
      </div>
      <div id="alert-form" style="display:none" class="alert-form-box">
        <p class="alert-form-label">¿A qué precio te avisamos? (actual: <strong>${g.price || 'gratis'}</strong>)</p>
        <div class="alert-input-row">
          <span style="color:var(--muted2)">€</span>
          <input type="number" id="alert-price-input" min="0.01" step="0.01"
            placeholder="${g.price_eur ? (g.price_eur * 0.7).toFixed(2) : '10.00'}" class="field-input" style="margin:0;flex:1" />
          <button class="btn-primary" id="btn-set-alert">Activar alerta</button>
          <button class="btn-ghost" id="btn-skip-alert">Sin alerta</button>
        </div>
      </div>
      ${myEntry ? `
      <div class="my-entry-box">
        <div class="my-entry-header">
          <span class="status-badge status-${myEntry.status}">${{played:'Jugado',playing:'Jugando',wishlist:'Deseado'}[myEntry.status]}</span>
          ${myEntry.rating ? `<span class="game-rating">${myEntry.rating}/10</span>` : ''}
        </div>
        ${myEntry.notes ? `<p class="my-entry-notes">"${myEntry.notes}"</p>` : ''}
        <div class="draft-section">
          <label style="font-size:0.82rem;color:var(--muted);display:block;margin-bottom:6px">Mis apuntes privados</label>
          <textarea id="draft-input" class="field-input" rows="3" placeholder="Ideas, impresiones, pendientes..." style="resize:vertical;margin-bottom:8px">${myEntry.draft_notes || ''}</textarea>
          <button class="btn-ghost" id="btn-save-draft" style="padding:6px 14px;font-size:0.85rem">Guardar apuntes</button>
        </div>
      </div>` : AUTH.user ? `
      <div class="draft-section" style="margin-top:16px">
        <label style="font-size:0.82rem;color:var(--muted);display:block;margin-bottom:6px">Mis apuntes privados (sin valoración oficial)</label>
        <textarea id="draft-input" class="field-input" rows="3" placeholder="Ideas, impresiones, pendientes..." style="resize:vertical;margin-bottom:8px"></textarea>
        <button class="btn-ghost" id="btn-save-draft" style="padding:6px 14px;font-size:0.85rem">Guardar apuntes</button>
      </div>` : ''}
    `;

    buildStars('stars-container', 0);

    document.getElementById('modal-btn-played').addEventListener('click', async () => {
      if (!AUTH.user) { AUTH.showModal('login'); return; }
      await saveEntry(g, 'played');
      document.getElementById('rating-form').style.display = '';
      document.getElementById('alert-form').style.display = 'none';
    });
    document.getElementById('modal-btn-playing').addEventListener('click', async () => {
      if (!AUTH.user) { AUTH.showModal('login'); return; }
      await saveEntry(g, 'playing'); showToast('▶ Añadido a "Jugando"');
    });
    document.getElementById('modal-btn-wishlist').addEventListener('click', async () => {
      if (!AUTH.user) { AUTH.showModal('login'); return; }
      await saveEntry(g, 'wishlist');
      document.getElementById('alert-form').style.display = '';
      document.getElementById('rating-form').style.display = 'none';
      document.getElementById('alert-price-input').focus();
    });
    document.getElementById('btn-save-rating').addEventListener('click', async () => {
      const rating = parseInt(document.getElementById('stars-container').dataset.value) || null;
      const notes = document.getElementById('review-notes').value.trim() || null;
      await AUTH.apiFetch('/api/list', { method: 'POST', body: JSON.stringify({
        steam_appid: g.id, game_name: g.name, game_image: g.image, status: 'played', rating, notes
      })});
      document.getElementById('rating-form').style.display = 'none';
      showToast(rating ? `✓ Guardado con valoración ${rating}/10` : '✓ Añadido a jugados');
    });
    document.getElementById('btn-skip-rating').addEventListener('click', () => {
      document.getElementById('rating-form').style.display = 'none';
      showToast('✓ Añadido a jugados');
    });
    document.getElementById('btn-set-alert')?.addEventListener('click', async () => {
      const price = parseFloat(document.getElementById('alert-price-input').value);
      if (!price || price <= 0) { alert('Introduce un precio válido'); return; }
      try {
        await AUTH.apiFetch('/api/alerts', { method: 'POST', body: JSON.stringify({
          steam_appid: g.id, game_name: g.name, game_image: g.image, target_price: price
        })});
        document.getElementById('alert-form').style.display = 'none';
        showToast(`🔔 Alerta activada a ${price.toFixed(2)}€`);
      } catch (e) {
        if (e.status === 403) {
          document.getElementById('alert-form').style.display = 'none';
          showToast('Límite de alertas gratuitas alcanzado');
          setTimeout(() => showPremiumModal(), 500);
        }
      }
    });
    document.getElementById('btn-skip-alert')?.addEventListener('click', () => {
      document.getElementById('alert-form').style.display = 'none';
      showToast('♡ Añadido a lista de deseos');
    });
    document.getElementById('btn-save-draft')?.addEventListener('click', async () => {
      if (!AUTH.user) { AUTH.showModal('login'); return; }
      const draft = document.getElementById('draft-input').value.trim() || null;
      const status = myEntry?.status || 'wishlist';
      await AUTH.apiFetch('/api/list', { method: 'POST', body: JSON.stringify({
        steam_appid: g.id, game_name: g.name, game_image: g.image,
        status, rating: myEntry?.rating || null, notes: myEntry?.notes || null, draft_notes: draft
      })});
      showToast('📝 Apuntes guardados');
    });
  } catch { modalContent.innerHTML = '<div class="no-results">Error al cargar el juego.</div>'; }
}

async function saveEntry(g, status) {
  await AUTH.apiFetch('/api/list', { method: 'POST', body: JSON.stringify({
    steam_appid: g.id, game_name: g.name, game_image: g.image, status
  })});
}

function closeModal() { modalOverlay.classList.remove('open'); document.body.style.overflow = ''; }

// ── My List ──────────────────────────────────────────
async function loadMyList() {
  if (!AUTH.user) { showView('home'); AUTH.showModal('login'); return; }
  const listGrid = document.getElementById('mylist-grid');
  const followingSection = document.getElementById('following-section');
  const alertsSection = document.getElementById('alerts-section');
  listGrid.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  let activeStatus = 'all';
  const [entries, alerts] = await Promise.all([AUTH.apiFetch('/api/list'), AUTH.apiFetch('/api/alerts')]);

  function renderList() {
    if (activeStatus === 'siguiendo') {
      listGrid.style.display = 'none';
      followingSection.style.display = '';
      alertsSection.style.display = 'none';
      loadFollowingSection();
      return;
    }
    listGrid.style.display = '';
    followingSection.style.display = 'none';
    alertsSection.style.display = '';
    const filtered = activeStatus === 'all' ? entries : entries.filter(e => e.status === activeStatus);
    listGrid.innerHTML = '';
    if (!filtered.length) { listGrid.innerHTML = '<div class="no-results">No tienes juegos en esta categoría.</div>'; return; }
    filtered.forEach(e => listGrid.appendChild(renderCard(e, () => openModal(e.steam_appid))));
  }

  document.querySelectorAll('#mylist-tabs .list-tab').forEach(tab => {
    const fresh = tab.cloneNode(true);
    tab.parentNode.replaceChild(fresh, tab);
    fresh.addEventListener('click', () => {
      document.querySelectorAll('#mylist-tabs .list-tab').forEach(t => t.classList.remove('active'));
      fresh.classList.add('active'); activeStatus = fresh.dataset.status; renderList();
    });
  });

  renderList();
  renderAlerts(alerts);

  const section = document.getElementById('alerts-section');
  const shareDiv = document.createElement('div');
  shareDiv.style.cssText = 'margin-top:24px;padding:16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap';
  const profileUrl = `${location.origin}/u/${AUTH.user.username}`;
  shareDiv.innerHTML = `
    <span style="color:var(--muted2);font-size:0.9rem">Tu perfil público:</span>
    <code style="color:var(--cyan);font-size:0.85rem;flex:1">${profileUrl}</code>
    <button class="btn-ghost" id="btn-copy-profile" style="padding:6px 14px;font-size:0.85rem">Copiar enlace</button>
  `;
  section.appendChild(shareDiv);
  document.getElementById('btn-copy-profile').addEventListener('click', () => {
    navigator.clipboard.writeText(profileUrl); showToast('🔗 Enlace copiado');
  });
}

function renderAlerts(alerts) {
  const el = document.getElementById('alerts-list');
  if (!alerts.length) { el.innerHTML = '<p style="color:var(--muted)">No tienes alertas de precio activas.</p>'; return; }
  el.innerHTML = alerts.map(a => `
    <div class="alert-row ${a.triggered ? 'alert-triggered' : ''}">
      <img src="${a.game_image || ''}" class="alert-thumb" onerror="this.style.display='none'" />
      <div class="alert-info">
        <div class="alert-game">${a.game_name}</div>
        <div class="alert-details">Objetivo: <strong>${a.target_price.toFixed(2)}€</strong>
          ${a.current_price ? ` · Actual: <strong>${a.current_price.toFixed(2)}€</strong>` : ''}
          ${a.triggered ? ' · <span style="color:var(--cyan)">✓ ¡Precio alcanzado!</span>' : ''}
        </div>
      </div>
      <button class="btn-ghost alert-del" data-appid="${a.steam_appid}" style="padding:6px 12px;font-size:0.8rem">Eliminar</button>
    </div>
  `).join('');
  el.querySelectorAll('.alert-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await AUTH.apiFetch(`/api/alerts/${btn.dataset.appid}`, { method: 'DELETE' });
      btn.closest('.alert-row').remove();
    });
  });
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
    listEl.innerHTML = '<p style="color:var(--muted);margin-bottom:24px">Aún no sigues a nadie. Búscalos arriba.</p>';
  } else {
    listEl.innerHTML = '<h4 style="margin-bottom:12px;color:var(--muted2);font-size:0.9rem;text-transform:uppercase;letter-spacing:.05em">Siguiendo</h4>';
    following.forEach(u => {
      const row = document.createElement('div');
      row.className = 'user-row';
      row.innerHTML = `
        <div class="user-avatar-sm">${u.username[0].toUpperCase()}</div>
        <span class="user-row-name">${u.username}</span>
        <button class="btn-follow following" data-username="${u.username}">Siguiendo</button>
      `;
      row.querySelector('.user-avatar-sm').addEventListener('click', () => {
        history.pushState({}, '', `/u/${u.username}`); showView('profile'); loadProfile(u.username);
      });
      row.querySelector('span').addEventListener('click', () => {
        history.pushState({}, '', `/u/${u.username}`); showView('profile'); loadProfile(u.username);
      });
      row.querySelector('.btn-follow').addEventListener('click', async (e) => {
        await AUTH.apiFetch(`/api/follow/${u.username}`, { method: 'DELETE' });
        row.remove();
        showToast(`Dejaste de seguir a ${u.username}`);
        followingLoaded = false;
      });
      listEl.appendChild(row);
    });
  }

  // Render activity feed
  if (!feed.length) {
    feedEl.innerHTML = '<p style="color:var(--muted)">La actividad de las personas que sigues aparecerá aquí.</p>';
  } else {
    feedEl.innerHTML = '<h4 style="margin:24px 0 12px;color:var(--muted2);font-size:0.9rem;text-transform:uppercase;letter-spacing:.05em">Actividad reciente</h4>';
    const statusLabel = { played: 'Jugado', playing: 'Jugando', wishlist: 'Deseado' };
    const statusColor = { played: 'var(--purple)', playing: 'var(--cyan)', wishlist: 'var(--muted2)' };
    feed.forEach(e => {
      const item = document.createElement('div');
      item.className = 'feed-item';
      item.innerHTML = `
        <img src="${e.game_image || ''}" class="feed-thumb" onerror="this.style.display='none'" />
        <div class="feed-info">
          <div class="feed-user">
            <span class="feed-username" data-u="${e.player}">${e.player}</span>
            <span style="color:var(--muted);font-size:0.82rem"> · ${timeAgo(e.added_at)}</span>
          </div>
          <div class="feed-game">${e.game_name}</div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
            <span style="font-size:0.8rem;color:${statusColor[e.status]}">${statusLabel[e.status]}</span>
            ${e.rating ? `<span class="game-rating" style="font-size:0.8rem">${e.rating}/10</span>` : ''}
          </div>
          ${e.notes ? `<div class="feed-notes">"${e.notes.slice(0, 80)}${e.notes.length > 80 ? '…' : ''}"</div>` : ''}
        </div>
      `;
      item.querySelector('.feed-username').addEventListener('click', () => {
        history.pushState({}, '', `/u/${e.player}`); showView('profile'); loadProfile(e.player);
      });
      item.addEventListener('click', (ev) => {
        if (!ev.target.classList.contains('feed-username')) openModal(e.steam_appid);
      });
      feedEl.appendChild(item);
    });
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
      if (!users.length) { resultsEl.innerHTML = '<p style="color:var(--muted);padding:8px 0">Sin resultados.</p>'; return; }
      resultsEl.innerHTML = '';
      users.forEach(u => {
        const row = document.createElement('div');
        row.className = 'user-row';
        row.innerHTML = `
          <div class="user-avatar-sm">${u.username[0].toUpperCase()}</div>
          <div style="flex:1">
            <span class="user-row-name">${u.username}</span>
            <span style="color:var(--muted);font-size:0.8rem;margin-left:8px">${u.total_games} juegos</span>
          </div>
          <button class="btn-follow ${u.is_following ? 'following' : ''}" data-username="${u.username}">
            ${u.is_following ? 'Siguiendo' : 'Seguir'}
          </button>
        `;
        const btn = row.querySelector('.btn-follow');
        btn.addEventListener('click', async () => {
          if (btn.classList.contains('following')) {
            await AUTH.apiFetch(`/api/follow/${u.username}`, { method: 'DELETE' });
            btn.classList.remove('following'); btn.textContent = 'Seguir';
            showToast(`Dejaste de seguir a ${u.username}`);
          } else {
            await AUTH.apiFetch(`/api/follow/${u.username}`, { method: 'POST' });
            btn.classList.add('following'); btn.textContent = 'Siguiendo';
            showToast(`Siguiendo a ${u.username}`);
          }
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
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d}d`;
  return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

// ── Ranking ──────────────────────────────────────────
async function loadRanking() {
  const el = document.getElementById('ranking-list');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const games = await AUTH.apiFetch('/api/ranking');
    if (!games.length) { el.innerHTML = '<div class="no-results">Aún no hay valoraciones. ¡Sé el primero!</div>'; return; }
    el.innerHTML = '';
    games.forEach((g, i) => {
      const row = document.createElement('div');
      row.className = 'ranking-row';
      row.innerHTML = `
        <span class="ranking-pos ${i < 3 ? 'top-' + (i+1) : ''}">${i + 1}</span>
        <img src="${g.game_image || ''}" class="alert-thumb" style="width:80px;height:45px" onerror="this.style.display='none'" />
        <div class="alert-info">
          <div class="alert-game">${g.game_name}</div>
          <div class="alert-details">${g.votes} ${g.votes === 1 ? 'valoración' : 'valoraciones'}</div>
        </div>
        <div class="ranking-score"><span class="score-num">${g.avg_rating}</span><span class="score-label">/10</span></div>
      `;
      row.addEventListener('click', () => openModal(g.steam_appid));
      el.appendChild(row);
    });
  } catch { el.innerHTML = '<div class="no-results">Error al cargar el ranking.</div>'; }
}

// ── Public Profile ────────────────────────────────────
async function loadProfile(username) {
  const header = document.getElementById('profile-header');
  const profileGrid = document.getElementById('profile-grid');
  header.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const { user, entries, stats, is_following, is_own } = await AUTH.apiFetch(`/api/users/${username}`);
    const joined = new Date(user.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    header.innerHTML = `
      <div class="profile-hero">
        <div class="profile-avatar">${user.username[0].toUpperCase()}</div>
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <h2 class="profile-name">${user.username}${user.is_premium ? ' <span class="premium-badge">⭐</span>' : ''}</h2>
            ${!is_own && AUTH.user ? `<button class="btn-follow ${is_following ? 'following' : ''}" id="btn-follow-profile">
              ${is_following ? 'Siguiendo' : 'Seguir'}
            </button>` : ''}
          </div>
          <p style="color:var(--muted);font-size:0.9rem;margin-top:4px">Miembro desde ${joined}</p>
          <div style="display:flex;gap:16px;margin-top:8px">
            <span style="color:var(--muted2);font-size:0.85rem"><strong>${user.followers}</strong> seguidores</span>
            <span style="color:var(--muted2);font-size:0.85rem"><strong>${user.following}</strong> siguiendo</span>
          </div>
        </div>
      </div>
      <div class="profile-stats">
        <div class="stat-box"><div class="stat-num">${stats.played}</div><div class="stat-label">Jugados</div></div>
        <div class="stat-box"><div class="stat-num">${stats.playing}</div><div class="stat-label">Jugando</div></div>
        <div class="stat-box"><div class="stat-num">${stats.wishlist}</div><div class="stat-label">Deseados</div></div>
        ${stats.avg_rating ? `<div class="stat-box"><div class="stat-num">${stats.avg_rating}</div><div class="stat-label">Nota media</div></div>` : ''}
      </div>
    `;

    const followBtn = document.getElementById('btn-follow-profile');
    if (followBtn) {
      followBtn.addEventListener('click', async () => {
        if (followBtn.classList.contains('following')) {
          await AUTH.apiFetch(`/api/follow/${username}`, { method: 'DELETE' });
          followBtn.classList.remove('following'); followBtn.textContent = 'Seguir';
          showToast(`Dejaste de seguir a ${username}`);
        } else {
          await AUTH.apiFetch(`/api/follow/${username}`, { method: 'POST' });
          followBtn.classList.add('following'); followBtn.textContent = 'Siguiendo';
          showToast(`Siguiendo a ${username}`);
        }
        followingLoaded = false;
      });
    }

    let activeStatus = 'all';
    function renderProfileList() {
      const filtered = activeStatus === 'all' ? entries : entries.filter(e => e.status === activeStatus);
      profileGrid.innerHTML = '';
      if (!filtered.length) { profileGrid.innerHTML = '<div class="no-results">Sin juegos.</div>'; return; }
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
  } catch { header.innerHTML = '<div class="no-results">Usuario no encontrado.</div>'; }
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
      .catch(() => showToast('Error al abrir el portal'));
  } else {
    showPremiumModal();
  }
});

document.getElementById('btn-go-premium').addEventListener('click', async () => {
  if (!AUTH.user) { closePremiumModal(); AUTH.showModal('login'); return; }
  const btn = document.getElementById('btn-go-premium');
  btn.textContent = 'Redirigiendo...'; btn.disabled = true;
  try {
    const { url } = await AUTH.apiFetch('/api/billing/checkout', { method: 'POST' });
    window.location.href = url;
  } catch (e) {
    showToast('Error: ' + (e.message || 'Inténtalo de nuevo'));
    btn.textContent = 'Hazte Premium'; btn.disabled = false;
  }
});

// Handle return from Stripe
(function handleStripeReturn() {
  const params = new URLSearchParams(location.search);
  if (params.get('premium') === 'success') {
    history.replaceState({}, '', '/');
    setTimeout(() => showToast('⭐ ¡Ya eres Premium! Gracias por tu apoyo'), 500);
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
route();
initGenrePills();
