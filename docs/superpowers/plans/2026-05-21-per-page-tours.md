# Per-Page Tours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add context-aware per-page tours to Explorar, Ranking, Comunidad, Ideas, and Mi Perfil — auto-triggering once on first visit, replayable at any time via the footer button.

**Architecture:** Extend the existing tour engine in `app.js` with a `_currentTourSteps` indirection so the same render/navigation machinery works for both the home global tour and per-page tours. `PAGE_TOURS` maps view names to step arrays. `startPageTour(page, manual)` sets up state and delegates to the shared `_startTourEngine()`. The footer button detects the active view and dispatches accordingly.

**Tech Stack:** Vanilla JS, existing tour DOM/CSS (no new dependencies). i18n via existing `t()` function in `i18n.js`.

---

## File map

| File | Changes |
|------|---------|
| `static/js/i18n.js` | Add ~37 new keys per language (ES + EN): `tour.btn_done`, and title+text for 5 page tours |
| `static/js/app.js` | Add state vars, extract `_startTourEngine()`, update `_renderTourStep`/`_tourNext`/`endTour`, add `PAGE_TOURS` + `startPageTour()`, hook `showView()`, update footer button |

---

## Task 1: Add i18n keys for all five page tours

**Files:**
- Modify: `static/js/i18n.js`

- [ ] **Step 1: Add ES keys after the existing `tour.step8.*` keys (around line 338)**

Find this line in the `es` block:
```
'tour.step8.text': 'Crea tu cuenta para llevar tu diario de juegos, valorarlos, seguir a otros jugadores y recibir alertas de precio.',
```

Insert immediately after it:
```js
    'tour.btn_done': '¡Entendido! ✓',

    'tour.explore.step0.title': '🗺️ Explora por géneros',
    'tour.explore.step0.text': 'Descubre los mejores juegos organizados por categoría, con valoraciones reales de todos los jugadores de Checkpoint.',
    'tour.explore.step1.title': '🎮 Categorías de juegos',
    'tour.explore.step1.text': 'Cada tarjeta es un género o tag. Haz clic en cualquiera para ver los mejores juegos de esa categoría.',
    'tour.explore.step2.title': '🔥 Popular o mejor valorado',
    'tour.explore.step2.text': 'Dentro de cada categoría puedes ordenar por Popularidad (más añadidos por usuarios) o Mejor valorados (nota media más alta de la comunidad).',

    'tour.ranking.step0.title': '🏆 El ranking de la comunidad',
    'tour.ranking.step0.text': 'Esta clasificación la construyen las valoraciones reales de los usuarios de Checkpoint. Sin algoritmos externos, sin patrocinios.',
    'tour.ranking.step1.title': '📊 Nota media real',
    'tour.ranking.step1.text': 'Cada posición refleja la nota media de todos los jugadores que han valorado ese juego. Cuantos más votos, más fiable es la posición.',
    'tour.ranking.step2.title': '⭐ Tu voto importa',
    'tour.ranking.step2.text': 'Cuando valoras un juego desde tu perfil o desde la búsqueda, tu nota contribuye directamente a este ranking.',

    'tour.community.step0.title': '👥 La comunidad de Checkpoint',
    'tour.community.step0.text': 'Conecta con otros jugadores, sigue su actividad y descubre qué están jugando en este momento.',
    'tour.community.step1.title': '🔍 Busca jugadores',
    'tour.community.step1.text': 'Escribe el nombre de usuario de cualquier jugador para encontrar su perfil, ver su colección y seguirle.',
    'tour.community.step2.title': '📡 Feed de actividad',
    'tour.community.step2.text': 'Las últimas valoraciones, reseñas y cambios de estado de los jugadores que sigues aparecen aquí en tiempo real.',

    'tour.ideas.step0.title': '💡 Ideas y hoja de ruta',
    'tour.ideas.step0.text': 'La hoja de ruta pública de Checkpoint. Ve qué se está construyendo, qué ya está hecho, y propón lo que quieres ver.',
    'tour.ideas.step1.title': '▲ Vota las sugerencias',
    'tour.ideas.step1.text': 'Dale al triángulo para votar las ideas que más te interesen. Las más votadas tienen prioridad de desarrollo.',
    'tour.ideas.step2.title': '✅ Ideas completadas',
    'tour.ideas.step2.text': 'Las ideas con estado Planificada, En producción o Completada también aparecen aquí. Puedes ver exactamente qué funcionalidades ya están en la app.',
    'tour.ideas.step3.title': '✍️ Propón una idea',
    'tour.ideas.step3.text': 'Inicia sesión para proponer nuevas funcionalidades. El desarrollo de Checkpoint lo decide la comunidad.',

    'tour.profile-me.step0.title': '🎮 Tu diario personal',
    'tour.profile-me.step0.text': 'Todo lo que juegas, en un solo lugar. Organiza tu colección, escribe reseñas y lleva el control de tus horas de juego.',
    'tour.profile-me.step1.title': '📋 Organiza tus juegos',
    'tour.profile-me.step1.text': 'Filtra por estado: Todos, Jugados, Jugando o Abandonados. Usa la búsqueda y el filtro de géneros para encontrar cualquier juego al instante.',
    'tour.profile-me.step2.title': '🎮 Pestaña Steam',
    'tour.profile-me.step2.text': 'Importa tu biblioteca completa de Steam. Con ⭐ Premium, juegos y horas jugadas se sincronizan automáticamente cada 24h.',
    'tour.profile-me.step3.title': '🎨 Mi cuenta',
    'tour.profile-me.step3.text': 'Personaliza tu avatar con colores. Con ⭐ Premium puedes añadir foto de perfil y un emoji gaming para destacar en la comunidad.',
    'tour.profile-me.step4.title': '🔔 Lista de deseados',
    'tour.profile-me.step4.text': 'Guarda juegos en tu wishlist para seguir su precio. Las alertas de precio son una función ⭐ Premium: te avisamos cuando el juego baje al precio que elijas.',
```

- [ ] **Step 2: Add EN keys after the existing `tour.step8.*` keys in the `en` block (around line 682)**

Find this line in the `en` block:
```
'tour.step8.text': 'Create your account to keep your gaming diary, rate games, follow other players and get price alerts.',
```

Insert immediately after it:
```js
    'tour.btn_done': 'Got it! ✓',

    'tour.explore.step0.title': '🗺️ Explore by genre',
    'tour.explore.step0.text': 'Discover the best games organized by category, with real ratings from all Checkpoint players.',
    'tour.explore.step1.title': '🎮 Game categories',
    'tour.explore.step1.text': 'Each card is a genre or tag. Click any to see the top games in that category.',
    'tour.explore.step2.title': '🔥 Popular or top-rated',
    'tour.explore.step2.text': 'Inside each category you can sort by Popularity (most added by users) or Top Rated (highest community average score).',

    'tour.ranking.step0.title': '🏆 The community ranking',
    'tour.ranking.step0.text': 'This leaderboard is built entirely from real Checkpoint user ratings — no external algorithms, no sponsorships.',
    'tour.ranking.step1.title': '📊 Real average score',
    'tour.ranking.step1.text': 'Each position reflects the average score from all players who rated that game. More votes means a more reliable ranking.',
    'tour.ranking.step2.title': '⭐ Your vote counts',
    'tour.ranking.step2.text': 'When you rate a game from your profile or from search, your score directly affects this ranking.',

    'tour.community.step0.title': '👥 The Checkpoint community',
    'tour.community.step0.text': 'Connect with other players, follow their activity and discover what they\'re playing right now.',
    'tour.community.step1.title': '🔍 Find players',
    'tour.community.step1.text': 'Type any username to find their profile, see their collection and follow them.',
    'tour.community.step2.title': '📡 Activity feed',
    'tour.community.step2.text': 'The latest ratings, reviews and status updates from the players you follow appear here in real time.',

    'tour.ideas.step0.title': '💡 Ideas & roadmap',
    'tour.ideas.step0.text': 'Checkpoint\'s public roadmap. See what\'s being built, what\'s already done, and suggest what you want to see next.',
    'tour.ideas.step1.title': '▲ Vote on suggestions',
    'tour.ideas.step1.text': 'Click the triangle to vote for ideas you like. The most-voted ones rise to the top and get prioritized for development.',
    'tour.ideas.step2.title': '✅ Completed ideas',
    'tour.ideas.step2.text': 'Ideas with status Planned, In progress or Done also appear here — you can see exactly which features have already been added to the app.',
    'tour.ideas.step3.title': '✍️ Suggest an idea',
    'tour.ideas.step3.text': 'Sign in to submit new feature ideas. The Checkpoint community decides where development goes next.',

    'tour.profile-me.step0.title': '🎮 Your personal diary',
    'tour.profile-me.step0.text': 'Everything you play, in one place. Organize your collection, write reviews and track your gaming hours.',
    'tour.profile-me.step1.title': '📋 Organize your games',
    'tour.profile-me.step1.text': 'Filter by status: All, Played, Playing or Abandoned. Use search and the genre filter to find any game instantly.',
    'tour.profile-me.step2.title': '🎮 Steam tab',
    'tour.profile-me.step2.text': 'Import your full Steam library. With ⭐ Premium, your games and playtime sync automatically every 24h.',
    'tour.profile-me.step3.title': '🎨 My account',
    'tour.profile-me.step3.text': 'Customize your avatar with colors. With ⭐ Premium you can add a profile photo and a gaming emoji to stand out in the community.',
    'tour.profile-me.step4.title': '🔔 Wishlist',
    'tour.profile-me.step4.text': 'Save games to your wishlist to track their price. Price alerts are a ⭐ Premium feature: we notify you when a game drops to your chosen price.',
```

- [ ] **Step 3: Commit**

```bash
git add static/js/i18n.js
git commit -m "feat: add i18n keys for per-page tours (ES + EN)"
```

---

## Task 2: Refactor tour engine to support swappable step arrays

**Files:**
- Modify: `static/js/app.js`

This task changes internals only — existing home tour behaviour stays identical.

- [ ] **Step 1: Add three new state variables next to the existing `_tourStep` and `_tourEl` declarations (around line 2085)**

Find:
```js
let _tourStep = 0;
let _tourEl = null;
```

Replace with:
```js
let _tourStep = 0;
let _tourEl = null;
let _currentTourSteps = null;  // active step array (set by startTour / startPageTour)
let _currentTourPage = null;   // view name for page tours, null for home tour
let _tourIsManual = false;     // true when triggered via footer button (no localStorage write)
```

- [ ] **Step 2: Extract `_startTourEngine()` from `startTour()` and add `manual` param**

Find the entire `startTour()` function:
```js
function startTour() {
  if (_tourEl) return; // ya activo
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
```

Replace with:
```js
function startTour(manual = false) {
  _currentTourSteps = TOUR_STEPS;
  _currentTourPage = null;
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
```

- [ ] **Step 3: Update `_tourNext()` to use `_currentTourSteps` and only show register modal on home tour**

Find:
```js
function _tourNext() {
  if (_tourStep < TOUR_STEPS.length - 1) {
    _tourStep++;
    _renderTourStep();
  } else {
    endTour();
    if (!AUTH.user) AUTH.showModal('register');
  }
}
```

Replace with:
```js
function _tourNext() {
  if (_tourStep < _currentTourSteps.length - 1) {
    _tourStep++;
    _renderTourStep();
  } else {
    endTour();
    if (!AUTH.user && !_currentTourPage) AUTH.showModal('register');
  }
}
```

- [ ] **Step 4: Update `_tourPrev()` to use `_currentTourSteps`**

Find:
```js
function _tourPrev() {
  if (_tourStep > 0) { _tourStep--; _renderTourStep(); }
}
```

Replace with:
```js
function _tourPrev() {
  if (_tourStep > 0) { _tourStep--; _renderTourStep(); }
}
```

(No change needed — `_tourPrev` doesn't reference `TOUR_STEPS`. Leave as-is.)

- [ ] **Step 5: Update `_renderTourStep()` to use `_currentTourSteps`, call `step.onEnter`, use `tour.btn_done` for page tours, and fix the last-step-skip bug**

Find the entire `_renderTourStep()` function:
```js
function _renderTourStep() {
  const step = TOUR_STEPS[_tourStep];
  const isLast = _tourStep === TOUR_STEPS.length - 1;
  const isFirst = _tourStep === 0;

  document.getElementById('tour-title').textContent = step.title;
  document.getElementById('tour-text').textContent = step.text;
  document.querySelector('.tour-step-info').textContent = `${_tourStep + 1} / ${TOUR_STEPS.length}`;
  document.getElementById('tour-next').textContent = isLast ? '¡Empezar! 🚀' : 'Siguiente →';
  document.getElementById('tour-back').style.visibility = isFirst ? 'hidden' : '';

  // Dots
  document.querySelector('.tour-dots').innerHTML = TOUR_STEPS.map((_, i) =>
    `<span class="tour-dot ${i === _tourStep ? 'active' : ''}"></span>`
  ).join('');

  const spotlight = document.getElementById('tour-spotlight');
  const popup = document.getElementById('tour-popup');

  if (!step.target) {
    spotlight.style.cssText = 'display:none';
    popup.className = 'tour-center';
    return;
  }

  popup.className = '';
  const target = document.querySelector(step.target);
  if (!target || getComputedStyle(target).display === 'none') { _tourStep++; if (_tourStep < TOUR_STEPS.length) _renderTourStep(); return; }

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
```

Replace with:
```js
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
```

- [ ] **Step 6: Update `endTour()` to write the correct localStorage key based on `_currentTourPage` and `_tourIsManual`**

Find:
```js
function endTour() {
  localStorage.setItem('ck_tour_done', '1');
  document.removeEventListener('keydown', _tourKeyHandler);
  if (_tourEl) {
    _tourEl.style.opacity = '0';
    _tourEl.style.transition = 'opacity 0.3s';
    setTimeout(() => _tourEl?.remove(), 300);
    _tourEl = null;
  }
```

Replace with:
```js
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
    setTimeout(() => _tourEl?.remove(), 300);
    _tourEl = null;
  }
```

- [ ] **Step 7: Verify the home tour still works**

Open the app in a browser. Clear localStorage (`ck_tour_done`). Reload the home page — the global tour should auto-start after 500ms and behave exactly as before (9 steps, register modal at end). Use the footer "Iniciar tour" button to replay it from home.

- [ ] **Step 8: Commit**

```bash
git add static/js/app.js
git commit -m "refactor: extract _startTourEngine, use _currentTourSteps in tour engine"
```

---

## Task 3: Add `PAGE_TOURS` object and `startPageTour()` function

**Files:**
- Modify: `static/js/app.js`

- [ ] **Step 1: Add `PAGE_TOURS` immediately after the `TOUR_STEPS` array**

Find the line that ends `TOUR_STEPS`:
```js
  { target: '#btn-register', get title() { return t('tour.step8.title'); }, get text() { return t('tour.step8.text'); }, pos: 'bottom', cta: true },
];
```

Insert immediately after the closing `];`:
```js

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
```

- [ ] **Step 2: Add `startPageTour()` immediately after `startTour()` (after the existing `startTour` + `_startTourEngine` functions)**

Find the line:
```js
function _startTourEngine() {
```

Insert the following **before** `_startTourEngine`:
```js
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

```

- [ ] **Step 3: Manually test each page tour via browser console**

Open the app. In the browser console, run each of the following to verify the tour renders and navigates correctly:

```js
// Test Explorar tour (step 2 should auto-navigate to Acción category)
document.getElementById('nav-explore').click();
setTimeout(() => startPageTour('explore'), 600);

// Test Ranking tour
document.getElementById('nav-ranking').click();
setTimeout(() => startPageTour('ranking'), 600);

// Test Comunidad tour
document.getElementById('nav-community').click();
setTimeout(() => startPageTour('community'), 600);

// Test Ideas tour (step 3 "Propón una idea" should be skipped if not logged in)
document.getElementById('nav-ideas').click();
setTimeout(() => startPageTour('ideas'), 600);
```

For Mi Perfil, log in first, then:
```js
document.getElementById('nav-profile-me').click();
setTimeout(() => startPageTour('profile-me'), 600);
```

Confirm: all tours show correct titles/text, spotlight highlights the right elements, `onEnter` for Explorar step 2 navigates to the Acción category and shows the sort tabs.

- [ ] **Step 4: Commit**

```bash
git add static/js/app.js
git commit -m "feat: add PAGE_TOURS and startPageTour() for per-page tours"
```

---

## Task 4: Wire auto-trigger in `showView()` and update the footer button

**Files:**
- Modify: `static/js/app.js`

- [ ] **Step 1: Add auto-trigger hook to `showView()`**

Find:
```js
function showView(name) {
  VIEWS.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = v === name ? '' : 'none';
  });
}
```

Replace with:
```js
function showView(name) {
  VIEWS.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = v === name ? '' : 'none';
  });
  if (PAGE_TOURS[name] && !localStorage.getItem(`ck_tour_${name}_done`)) {
    setTimeout(() => { if (!_tourEl) startPageTour(name); }, 500);
  }
}
```

- [ ] **Step 2: Update the footer button handler to be context-aware**

Find:
```js
document.getElementById('footer-tour').addEventListener('click', () => {
  localStorage.removeItem('ck_tour_done');
  if (_tourEl) { _tourEl.remove(); _tourEl = null; document.removeEventListener('keydown', _tourKeyHandler); }
  history.pushState({}, '', '/');
  resetHome();
  startTour();
});
```

Replace with:
```js
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
```

- [ ] **Step 3: End-to-end verification**

Test the full auto-trigger flow:

1. Open the app in a private/incognito window (clean localStorage).
2. Navigate to **Explorar** via the nav link — the tour should auto-start after 500ms. Complete it. Confirm `ck_tour_explore_done` is set in localStorage. Navigate back to Explorar — tour should NOT fire again.
3. Navigate to **Ranking** — tour auto-starts. Complete. Confirm `ck_tour_ranking_done` in localStorage.
4. Navigate to **Comunidad** — tour auto-starts. Complete.
5. Navigate to **Ideas** — tour auto-starts. Confirm step 3 ("Propón una idea") is skipped (button hidden for guests).
6. Log in. Navigate to **Mi Perfil** — tour auto-starts. Confirm all 5 steps render correctly with correct Premium mentions.

Test manual replay:
7. While on the **Explorar** page (after tour already completed), click "Iniciar tour" in the footer — the Explorar tour should start again. Confirm `ck_tour_explore_done` is **not** removed (it was manual, key stays set, auto-trigger won't fire again on next visit).
8. From the **home** page, click "Iniciar tour" — the global home tour should start (fallback behavior).

- [ ] **Step 4: Commit**

```bash
git add static/js/app.js
git commit -m "feat: wire per-page tour auto-trigger in showView and context-aware footer button"
```
