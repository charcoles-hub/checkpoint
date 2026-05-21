# Comunidad + Seguidos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar la pestaña Comunidad en dos — Comunidad (feed público de valoraciones populares + búsqueda) y Seguidos (feed personal de seguidos + gestión de follows) — y actualizar todos los tours correspondientes.

**Architecture:** El endpoint `/api/community/popular` devuelve 20 valoraciones recientes (1 por usuario, priorizando usuarios con más seguidores). La vista Comunidad muestra ese feed público y un buscador. La vista Seguidos (nueva, URL `/seguidos`) contiene el feed personal y el buscador con follow/unfollow, reutilizando el endpoint existente `/api/following`.

**Tech Stack:** FastAPI (Python) + SQLite dev / PostgreSQL prod · Vanilla JS SPA (History API) · i18n via `t()` en `i18n.js`

---

## Archivos clave

| Archivo | Rol |
|---|---|
| `main.py` | Backend: nuevo endpoint `GET /api/community/popular` |
| `static/index.html` | Nav + estructuras HTML de ambas vistas |
| `static/js/app.js` | Routing, `loadCommunity()` rewrite, nueva `loadFollowing()`, tours |
| `static/js/i18n.js` | ~18 claves nuevas/actualizadas ES + EN |

---

## Task 1: Backend — `GET /api/community/popular`

**Files:**
- Modify: `main.py` (después de la función `global_activity`, ~línea 644)

- [ ] **Step 1: Añadir el endpoint en `main.py`**

Inserta esto justo después del bloque `@app.get("/api/activity")` (después de la línea `return [dict(r) for r in rows]` del global_activity, ~línea 643):

```python
# ── Community popular feed ─────────────────────────────
@app.get("/api/community/popular")
def community_popular():
    from database import DATABASE_URL
    db = get_db()
    if DATABASE_URL:  # PostgreSQL: DISTINCT ON picks latest entry per user
        rows = db.execute("""
            SELECT * FROM (
                SELECT DISTINCT ON (ge.user_id)
                    ge.steam_appid, ge.game_name, ge.game_image,
                    ge.status, ge.rating, ge.review, ge.notes,
                    COALESCE(ge.rated_at, ge.added_at) as added_at,
                    u.username as player,
                    u.avatar_color, u.avatar_icon, u.avatar_b64,
                    u.is_premium,
                    (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count
                FROM game_entries ge
                JOIN users u ON u.id = ge.user_id
                WHERE ge.rating IS NOT NULL AND ge.status NOT IN ('library', 'wishlist')
                ORDER BY ge.user_id, COALESCE(ge.rated_at, ge.added_at) DESC
            ) sub
            ORDER BY followers_count DESC, added_at DESC
            LIMIT 20
        """).fetchall()
    else:  # SQLite: GROUP BY user_id, MAX picks the row with latest date
        rows = db.execute("""
            SELECT ge.steam_appid, ge.game_name, ge.game_image,
                   ge.status, ge.rating, ge.review, ge.notes,
                   MAX(COALESCE(ge.rated_at, ge.added_at)) as added_at,
                   u.username as player,
                   u.avatar_color, u.avatar_icon, u.avatar_b64,
                   u.is_premium,
                   (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count
            FROM game_entries ge
            JOIN users u ON u.id = ge.user_id
            WHERE ge.rating IS NOT NULL AND ge.status NOT IN ('library', 'wishlist')
            GROUP BY ge.user_id
            ORDER BY followers_count DESC, added_at DESC
            LIMIT 20
        """).fetchall()
    db.close()
    return [dict(r) for r in rows]
```

- [ ] **Step 2: Verificar que el endpoint responde**

Con el servidor corriendo (`uvicorn main:app --reload` desde `/home/sergio/gametracker`):

```bash
curl -s http://localhost:8000/api/community/popular | python3 -m json.tool | head -40
```

Resultado esperado: array JSON (puede estar vacío `[]` si la DB local no tiene datos, pero no debe dar error 500).

- [ ] **Step 3: Commit**

```bash
git add main.py
git commit -m "feat: add /api/community/popular endpoint"
```

---

## Task 2: HTML — Nav + estructuras de vistas

**Files:**
- Modify: `static/index.html`

- [ ] **Step 1: Añadir `#nav-following` al navbar**

En `index.html`, localiza:
```html
      <button class="nl" id="nav-community" data-i18n="nav.community">Comunidad</button>
      <button class="nl" id="nav-ideas" data-i18n="nav.ideas">💡 Ideas</button>
```

Cámbialo por:
```html
      <button class="nl" id="nav-community" data-i18n="nav.community">Comunidad</button>
      <button class="nl" id="nav-following" data-i18n="nav.following">Seguidos</button>
      <button class="nl" id="nav-ideas" data-i18n="nav.ideas">💡 Ideas</button>
```

- [ ] **Step 2: Actualizar `#view-community` — quitar elementos obsoletos, añadir feed popular**

En `index.html`, localiza el bloque `<!-- COMMUNITY VIEW -->`. Reemplaza todo el bloque por:

```html
  <!-- COMMUNITY VIEW -->
  <div id="view-community" style="display:none">
    <section class="games-section" style="padding-top:100px">
      <div class="section-header">
        <div>
          <h2 data-i18n="community.title">Comunidad</h2>
          <p style="color:var(--muted);font-size:0.9rem;margin-top:4px" data-i18n="community.subtitle">Descubre otros jugadores y sigue su actividad</p>
        </div>
      </div>
      <div class="community-search-wrap">
        <div class="search-bar" style="max-width:480px;margin:0 0 24px">
          <span class="search-icon">⌕</span>
          <input type="text" id="community-search-input" autocomplete="off" data-i18n-placeholder="following.search" placeholder="Buscar jugadores por nombre..." />
        </div>
        <div id="community-search-results"></div>
      </div>
      <div id="community-popular-feed"></div>
    </section>
  </div>
```

- [ ] **Step 3: Añadir `#view-following` justo después del bloque de community**

Inmediatamente después del cierre del bloque `<!-- COMMUNITY VIEW -->` (antes del `<!-- EXPLORE VIEW -->`), inserta:

```html
  <!-- FOLLOWING VIEW -->
  <div id="view-following" style="display:none">
    <section class="games-section" style="padding-top:100px">
      <div class="section-header">
        <div>
          <h2 data-i18n="following.page_title">Seguidos</h2>
          <p style="color:var(--muted);font-size:0.9rem;margin-top:4px" data-i18n="following.page_subtitle">Tu feed de actividad</p>
        </div>
      </div>
      <div class="community-search-wrap">
        <div class="search-bar" style="max-width:480px;margin:0 0 24px">
          <span class="search-icon">⌕</span>
          <input type="text" id="following-search-input" autocomplete="off" data-i18n-placeholder="following.search" placeholder="Buscar jugadores por nombre..." />
        </div>
        <div id="following-search-results"></div>
      </div>
      <div id="following-list"></div>
      <div id="following-feed"></div>
    </section>
  </div>
```

- [ ] **Step 4: Commit**

```bash
git add static/index.html
git commit -m "feat: add nav-following and view-following HTML, update view-community"
```

---

## Task 3: JS — VIEWS array, routing, nav handler

**Files:**
- Modify: `static/js/app.js`

- [ ] **Step 1: Añadir `'following'` al array VIEWS**

En `app.js`, localiza:
```javascript
const VIEWS = ['home', 'profile-me', 'ranking', 'profile', 'explore', 'community', 'ideas', 'contacto'];
```

Cámbialo por:
```javascript
const VIEWS = ['home', 'profile-me', 'ranking', 'profile', 'explore', 'community', 'following', 'ideas', 'contacto'];
```

- [ ] **Step 2: Añadir nav click handler para `#nav-following`**

En `app.js`, localiza:
```javascript
document.getElementById('nav-community').addEventListener('click', () => { history.pushState({}, '', '/community'); showView('community'); loadCommunity(); closeMenu(); });
document.getElementById('nav-ideas').addEventListener('click', () => { history.pushState({}, '', '/ideas'); showView('ideas'); loadIdeas(); closeMenu(); });
```

Cámbialo por:
```javascript
document.getElementById('nav-community').addEventListener('click', () => { history.pushState({}, '', '/community'); showView('community'); loadCommunity(); closeMenu(); });
document.getElementById('nav-following').addEventListener('click', () => { history.pushState({}, '', '/seguidos'); showView('following'); loadFollowing(); closeMenu(); });
document.getElementById('nav-ideas').addEventListener('click', () => { history.pushState({}, '', '/ideas'); showView('ideas'); loadIdeas(); closeMenu(); });
```

- [ ] **Step 3: Añadir ruta `/seguidos` en la función `route()`**

En `app.js`, localiza:
```javascript
  else if (path === '/community') { showView('community'); loadCommunity(); }
  else if (path === '/ideas') { showView('ideas'); loadIdeas(); }
```

Cámbialo por:
```javascript
  else if (path === '/community') { showView('community'); loadCommunity(); }
  else if (path === '/seguidos') { showView('following'); loadFollowing(); }
  else if (path === '/ideas') { showView('ideas'); loadIdeas(); }
```

- [ ] **Step 4: Commit**

```bash
git add static/js/app.js
git commit -m "feat: add following view routing and nav handler"
```

---

## Task 4: JS — `loadCommunity()` rewrite

**Files:**
- Modify: `static/js/app.js` (función `loadCommunity`, ~líneas 1635-1740)

- [ ] **Step 1: Reemplazar el cuerpo completo de `loadCommunity()`**

En `app.js`, localiza el bloque que empieza en `let communityLoaded = false;` (~línea 1633) y termina con el `}` de cierre de `loadCommunity` (~línea 1740). Reemplaza **todo** ese bloque por:

```javascript
let communityLoaded = false;

async function loadCommunity() {
  communityLoaded = false;
  const searchInput = document.getElementById('community-search-input');
  const resultsEl = document.getElementById('community-search-results');
  const feedEl = document.getElementById('community-popular-feed');

  feedEl.innerHTML = '';

  // Search bar (clone to remove stale listeners)
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

  if (communityLoaded) return;
  communityLoaded = true;

  feedEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const items = await AUTH.apiFetch('/api/community/popular');
    feedEl.innerHTML = '';
    if (!items.length) {
      feedEl.innerHTML = `<p style="color:var(--muted);margin-top:16px">${t('community.popular_empty')}</p>`;
      return;
    }
    const title = document.createElement('h4');
    title.style.cssText = 'margin:0 0 16px;color:var(--muted2);font-size:0.9rem;text-transform:uppercase;letter-spacing:.05em';
    title.textContent = t('community.popular_title');
    feedEl.appendChild(title);
    items.forEach(e => feedEl.appendChild(renderFeedItem(e)));
  } catch {
    feedEl.innerHTML = `<p style="color:var(--muted);margin-top:16px">${t('community.popular_empty')}</p>`;
  }
}
```

- [ ] **Step 2: Verificar visualmente**

Abre el navegador en `http://localhost:8000/community`. Debe verse:
- Buscador arriba
- Debajo: título "Valoraciones destacadas" + cards de feed (si hay datos en la DB local)

- [ ] **Step 3: Commit**

```bash
git add static/js/app.js
git commit -m "feat: rewrite loadCommunity to show popular feed"
```

---

## Task 5: JS — nueva `loadFollowing()`, eliminar `loadFollowingSection()`

**Files:**
- Modify: `static/js/app.js` (~líneas 1416-1517)

- [ ] **Step 1: Reemplazar el bloque `loadFollowingSection` completo**

En `app.js`, localiza el bloque que empieza con el comentario `// ── Following section ─────────────────────────────────` (~línea 1416) y termina con el `}` de cierre de `loadFollowingSection` (~línea 1517). Reemplaza **todo** ese bloque por:

```javascript
// ── Following view ────────────────────────────────────
let followingLoaded = false;

async function loadFollowing() {
  const searchInput = document.getElementById('following-search-input');
  const resultsEl = document.getElementById('following-search-results');
  const listEl = document.getElementById('following-list');
  const feedEl = document.getElementById('following-feed');

  listEl.innerHTML = '';
  feedEl.innerHTML = '';

  // Search bar (clone to remove stale listeners)
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
              followingLoaded = false;
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

  if (!AUTH.user) {
    listEl.innerHTML = `<p style="color:var(--muted);margin:24px 0">${t('following.login_prompt')}</p>`;
    return;
  }
  if (followingLoaded) return;
  followingLoaded = true;

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
        <div class="user-avatar-sm" style="background:${avatarBg(u)}">${avatarContent(u, '1rem')}</div>
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
        row.remove(); followingLoaded = false;
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
```

- [ ] **Step 2: Verificar que `loadFollowingSection` ya no existe**

```bash
grep -n "loadFollowingSection" /home/sergio/gametracker/static/js/app.js
```

Resultado esperado: sin output.

- [ ] **Step 3: Commit**

```bash
git add static/js/app.js
git commit -m "feat: add loadFollowing(), replace dead loadFollowingSection()"
```

---

## Task 6: JS — Tours (TOUR_STEPS + PAGE_TOURS)

**Files:**
- Modify: `static/js/app.js` (sección TOUR_STEPS y PAGE_TOURS, ~líneas 2098-2176)

- [ ] **Step 1: Añadir paso `#nav-following` en `TOUR_STEPS`**

En `app.js`, en el array `TOUR_STEPS`, localiza:
```javascript
  { target: '#nav-community',get title() { return t('tour.step5.title'); }, get text() { return t('tour.step5.text'); }, pos: 'bottom' },
  { target: '#nav-ideas',    get title() { return t('tour.step6.title'); }, get text() { return t('tour.step6.text'); }, pos: 'bottom' },
```

Cámbialo por:
```javascript
  { target: '#nav-community', get title() { return t('tour.step5.title'); }, get text() { return t('tour.step5.text'); }, pos: 'bottom' },
  { target: '#nav-following', get title() { return t('tour.step5b.title'); }, get text() { return t('tour.step5b.text'); }, pos: 'bottom' },
  { target: '#nav-ideas',     get title() { return t('tour.step6.title'); }, get text() { return t('tour.step6.text'); }, pos: 'bottom' },
```

- [ ] **Step 2: Actualizar `PAGE_TOURS.community` para apuntar al nuevo feed popular**

En `app.js`, dentro de `PAGE_TOURS`, localiza el bloque:
```javascript
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
```

Reemplázalo por:
```javascript
  community: [
    { target: null,
      get title() { return t('tour.community.step0.title'); },
      get text()  { return t('tour.community.step0.text'); } },
    { target: '#community-popular-feed', pos: 'top',
      get title() { return t('tour.community.step1.title'); },
      get text()  { return t('tour.community.step1.text'); } },
    { target: '#community-search-input', pos: 'bottom',
      get title() { return t('tour.community.step2.title'); },
      get text()  { return t('tour.community.step2.text'); } },
  ],
```

- [ ] **Step 3: Añadir `PAGE_TOURS.following`**

En `app.js`, justo después del bloque `community: [ ... ],` y antes de `ideas: [`, inserta:

```javascript
  following: [
    { target: null,
      get title() { return t('tour.following.step0.title'); },
      get text()  { return t('tour.following.step0.text'); } },
    { target: '#following-feed', pos: 'top',
      get title() { return t('tour.following.step1.title'); },
      get text()  { return t('tour.following.step1.text'); } },
    { target: '#following-search-input', pos: 'bottom',
      get title() { return t('tour.following.step2.title'); },
      get text()  { return t('tour.following.step2.text'); } },
  ],
```

- [ ] **Step 4: Commit**

```bash
git add static/js/app.js
git commit -m "feat: update TOUR_STEPS and PAGE_TOURS for community/following split"
```

---

## Task 7: i18n — Nuevas claves ES + EN

**Files:**
- Modify: `static/js/i18n.js`

- [ ] **Step 1: Añadir claves al bloque `es:`**

**a)** Localiza `'nav.community': 'Comunidad',` y añade debajo:
```javascript
    'nav.following': 'Seguidos',
```

**b)** Localiza `'community.title': 'Comunidad',` (~línea 300) y añade debajo:
```javascript
    'community.popular_title': 'Valoraciones destacadas',
    'community.popular_empty': 'Aún no hay valoraciones en la comunidad.',
```

**c)** Localiza `'following.empty': 'Aún no sigues a nadie. Búscalos arriba.',` y añade debajo:
```javascript
    'following.page_title': 'Seguidos',
    'following.page_subtitle': 'Tu feed de actividad',
    'following.login_prompt': 'Inicia sesión para ver a quién sigues y su actividad.',
```

**d)** Localiza `'tour.step5.title': '👥 Comunidad y feed',` y reemplaza las dos líneas de step5:
```javascript
    'tour.step5.title': '👥 Comunidad',
    'tour.step5.text': 'Descubre las últimas valoraciones de los perfiles más populares y busca jugadores.',
    'tour.step5b.title': '👥 Seguidos',
    'tour.step5b.text': 'Sigue a otros jugadores y ve aquí su actividad reciente en tiempo real.',
```

**e)** Localiza y reemplaza las tres claves de `tour.community` (step0 mantiene el mismo title, pero actualizamos step1 y step2):
```javascript
    'tour.community.step0.title': '👥 La comunidad de Checkpoint',
    'tour.community.step0.text': 'Descubre qué están jugando los jugadores más activos de Checkpoint.',
    'tour.community.step1.title': '🌟 Valoraciones populares',
    'tour.community.step1.text': 'Las últimas valoraciones de los perfiles más seguidos, siempre actualizadas.',
    'tour.community.step2.title': '🔍 Busca jugadores',
    'tour.community.step2.text': 'Escribe un nombre para encontrar cualquier perfil y seguirle desde Seguidos.',
```

**f)** Justo después de las claves de `tour.community`, añade:
```javascript
    'tour.following.step0.title': '👥 Tus seguidos',
    'tour.following.step0.text': 'Tu feed social personal. Aquí ves la actividad reciente de los jugadores que sigues.',
    'tour.following.step1.title': '📡 Feed de actividad',
    'tour.following.step1.text': 'Las últimas valoraciones y cambios de estado de los jugadores que sigues aparecen aquí.',
    'tour.following.step2.title': '🔍 Busca jugadores',
    'tour.following.step2.text': 'Escribe un nombre para encontrar perfiles, seguirlos y ver su actividad en este feed.',
```

- [ ] **Step 2: Añadir las mismas claves al bloque `en:`**

**a)** Localiza `'nav.community': 'Community',` y añade debajo:
```javascript
    'nav.following': 'Following',
```

**b)** Localiza `'community.title': 'Community',` y añade debajo:
```javascript
    'community.popular_title': 'Featured ratings',
    'community.popular_empty': 'No community ratings yet.',
```

**c)** Localiza `'following.empty': "You're not following anyone yet. Search above.",` y añade debajo:
```javascript
    'following.page_title': 'Following',
    'following.page_subtitle': 'Your activity feed',
    'following.login_prompt': 'Sign in to see who you follow and their activity.',
```

**d)** Localiza `'tour.step5.title':` en el bloque EN y reemplaza las líneas de step5:
```javascript
    'tour.step5.title': '👥 Community',
    'tour.step5.text': 'Discover the latest ratings from the most popular profiles and find players.',
    'tour.step5b.title': '👥 Following',
    'tour.step5b.text': 'Follow players and see their recent activity here in real time.',
```

**e)** Localiza y reemplaza las claves EN de `tour.community`:
```javascript
    'tour.community.step0.title': '👥 The Checkpoint community',
    'tour.community.step0.text': 'Discover what the most active players on Checkpoint are playing.',
    'tour.community.step1.title': '🌟 Popular ratings',
    'tour.community.step1.text': 'The latest ratings from the most-followed profiles, always up to date.',
    'tour.community.step2.title': '🔍 Find players',
    'tour.community.step2.text': 'Type a name to find any profile and follow them from the Following tab.',
```

**f)** Justo después de las claves EN de `tour.community`, añade:
```javascript
    'tour.following.step0.title': '👥 Your following',
    'tour.following.step0.text': 'Your personal social feed. See recent activity from players you follow.',
    'tour.following.step1.title': '📡 Activity feed',
    'tour.following.step1.text': 'Latest ratings and status updates from players you follow appear here.',
    'tour.following.step2.title': '🔍 Find players',
    'tour.following.step2.text': 'Type a name to find profiles, follow them and see their activity in this feed.',
```

- [ ] **Step 3: Verificar que no faltan claves**

```bash
grep -c "following.page_title\|following.login_prompt\|community.popular_title\|tour.step5b\|tour.following" /home/sergio/gametracker/static/js/i18n.js
```

Resultado esperado: `10` (5 claves × 2 idiomas).

- [ ] **Step 4: Commit**

```bash
git add static/js/i18n.js
git commit -m "feat: add i18n keys for following view and updated community/following tours"
```

---

## Task 8: Verificación final

- [ ] **Step 1: Comprobar Comunidad**

1. Ve a `http://localhost:8000/community`
2. Verifica: feed de valoraciones populares visible (o mensaje vacío si DB local sin datos), buscador funciona
3. Borra el tour en consola: `localStorage.removeItem('ck_tour_community_done')`, recarga
4. Haz clic en "Iniciar tour" del footer — debe mostrar 3 pasos: intro → feed popular → buscador

- [ ] **Step 2: Comprobar Seguidos**

1. Ve a `http://localhost:8000/seguidos`
2. Sin login: buscador + mensaje de login
3. Con login: buscador + lista de seguidos (si tienes) + feed de actividad (si tienes)
4. Borra: `localStorage.removeItem('ck_tour_following_done')`, recarga
5. Haz clic en "Iniciar tour" del footer — 3 pasos: intro → feed → buscador

- [ ] **Step 3: Comprobar tour global (home)**

1. Ve a `http://localhost:8000/`
2. En consola: `localStorage.removeItem('ck_tour_home_done')` y recarga
3. El tour debe tener 10 pasos: bienvenida → juegos → búsqueda → explorar → ranking → Comunidad → **Seguidos** → Ideas → Premium → Registrarse

- [ ] **Step 4: Verificar rutas HTTP**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/community
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/seguidos
```

Resultado esperado: `200` en ambos.

- [ ] **Step 5: Commit final si hay ajustes menores**

```bash
git add -p
git commit -m "fix: final adjustments after verification"
```

---

## Notas de implementación

- `renderFeedItem(e)` espera: `game_image`, `player`, `status`, `rating`, `review`, `notes`, `added_at`, `game_name`, `steam_appid`. El endpoint `/api/community/popular` devuelve todas (más `avatar_color`, `avatar_icon`, `avatar_b64`, `is_premium`, `followers_count` que `renderFeedItem` ignora).
- En SQLite dev local puede que no haya datos — el feed aparece vacío con el mensaje `community.popular_empty`. Es correcto.
- La detección PG vs SQLite usa `from database import DATABASE_URL` (ya existe en el módulo).
- `communityLoaded` se resetea a `false` al inicio de cada llamada a `loadCommunity()` para permitir recargar el feed al volver a la vista.
- El `followingLoaded` ya existía en el código antiguo (`loadFollowingSection`) — se reutiliza en `loadFollowing()`.
