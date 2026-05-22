# Ratings Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar la media de valoraciones de la comunidad en el modal de juego y añadir un tab "Valoraciones" en los perfiles públicos.

**Architecture:** Tres cambios de backend quirúrgicos (enriquecer `game_detail`, relajar filtro de `get_game_reviews`) y tres cambios de frontend (badge en modal, sección de valoraciones sin texto, tab nuevo en perfil público). Los datos del tab de perfil ya están disponibles en la respuesta existente de `/api/users/{username}`.

**Tech Stack:** FastAPI + Python (backend), vanilla JS (frontend), i18n via `static/js/i18n.js`

---

## File Map

| File | Qué cambia |
|------|-----------|
| `main.py` | `game_detail()`: añadir query community stats; `get_game_reviews()`: quitar filtro de texto |
| `static/js/i18n.js` | Renombrar `modal.community_reviews` → `modal.community_ratings`; añadir 3 keys nuevas; añadir `tab.rated` |
| `static/js/app.js` | Modal: badge community avg en `detail-meta`; hacer review-text condicional; cambiar key i18n; `loadProfile`: extender `renderProfileList` con caso `'rated'` |
| `static/index.html` | Añadir tab "Valoraciones" en `#profile-tabs` |

---

### Task 1: Backend — enriquecer `GET /api/games/{id}` con community stats

**Files:**
- Modify: `main.py:241-266`

- [ ] **Step 1: Añadir la query de community stats al final de `game_detail`**

Localiza la función `game_detail` en `main.py` (línea ~241). Reemplaza el bloque completo:

```python
@app.get("/api/games/{game_id}")
async def game_detail(game_id: int):
    data, genres = await asyncio.gather(
        get(f"{STEAM}/appdetails", {"appids": game_id, "l": "english", "cc": "es"}),
        _fetch_genres_and_tags(game_id),
    )
    entry = data.get(str(game_id), {})
    if not entry.get("success"):
        raise HTTPException(404, "Juego no encontrado")
    g = entry["data"]
    po = g.get("price_overview")

    db = get_db()
    stats_row = db.execute(
        "SELECT ROUND(AVG(rating::numeric),1)::float AS avg_rating, COUNT(*) AS votes "
        "FROM game_entries WHERE steam_appid=? AND rating IS NOT NULL AND status IN ('played','playing')",
        (game_id,)
    ).fetchone()
    db.close()
    community_avg = stats_row["avg_rating"] if stats_row and stats_row["avg_rating"] else None
    community_votes = int(stats_row["votes"]) if stats_row else 0

    return {
        "id": game_id,
        "name": g.get("name"),
        "description": g.get("short_description", ""),
        "image": img(game_id),
        "genres": genres,
        "platforms": [k for k, v in g.get("platforms", {}).items() if v],
        "metacritic": g.get("metacritic", {}).get("score"),
        "release_date": g.get("release_date", {}).get("date"),
        "developers": g.get("developers", []),
        "price": fmt_price(po) or "Gratis",
        "price_eur": raw_price(po),
        "discount": po.get("discount_percent") if po else None,
        "community_avg": community_avg,
        "community_votes": community_votes,
    }
```

> Nota: `ROUND(AVG(rating::numeric),1)::float` evita devolver `Decimal` en PostgreSQL (no JSON-serializable). El wrapper `_PGConn` reemplaza `?` por `%s` automáticamente. `community_avg` es `null` si no hay votos.

- [ ] **Step 2: Arrancar el servidor y verificar el endpoint**

```bash
cd /home/sergio/gametracker
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

En otra terminal:
```bash
curl -s "http://localhost:8000/api/games/570" | python3 -m json.tool | grep -E "community|name"
```

Resultado esperado (con votos en DB):
```json
"community_avg": 7.8,
"community_votes": 42,
"name": "Dota 2"
```
Resultado esperado (sin votos):
```json
"community_avg": null,
"community_votes": 0,
```

- [ ] **Step 3: Commit**

```bash
git add main.py
git commit -m "feat: add community_avg and community_votes to game_detail endpoint"
```

---

### Task 2: Backend — modificar `GET /api/games/{id}/reviews` para incluir todas las valoraciones

**Files:**
- Modify: `main.py:881-893`

- [ ] **Step 1: Quitar filtro de texto y añadir filtro por status**

Localiza `get_game_reviews` (~línea 881). Reemplaza el bloque completo:

```python
@app.get("/api/games/{appid}/reviews")
def get_game_reviews(appid: int):
    db = get_db()
    rows = db.execute("""
        SELECT ge.review, ge.rating, COALESCE(ge.rated_at, ge.added_at) as added_at,
               u.username, u.avatar_color, u.avatar_icon
        FROM game_entries ge JOIN users u ON ge.user_id = u.id
        WHERE ge.steam_appid=? AND ge.rating IS NOT NULL
          AND ge.status IN ('played', 'playing')
        ORDER BY COALESCE(ge.rated_at, ge.added_at) DESC LIMIT 20
    """, (appid,)).fetchall()
    db.close()
    return [dict(r) for r in rows]
```

> El campo `review` puede ser `null` — el frontend lo maneja condicionalmente (Task 5). Se añaden `avatar_color` y `avatar_icon` para renders futuros del avatar.

- [ ] **Step 2: Verificar el endpoint**

Con el servidor arrancado:
```bash
curl -s "http://localhost:8000/api/games/570/reviews" | python3 -m json.tool | head -30
```

Resultado esperado: array de objetos, todos con `rating` (número), `review` puede ser `null` o string.

- [ ] **Step 3: Commit**

```bash
git add main.py
git commit -m "feat: reviews endpoint returns all ratings, not only entries with text"
```

---

### Task 3: i18n — añadir/renombrar keys

**Files:**
- Modify: `static/js/i18n.js:312` (bloque ES) y `~713` (bloque EN)

- [ ] **Step 1: Actualizar bloque ES**

Localiza la línea ~312 en `static/js/i18n.js`:
```js
    'modal.community_reviews': 'Reseñas de la comunidad',
```
Reemplaza por:
```js
    'modal.community_ratings': 'Valoraciones de la comunidad',
    'modal.rating_singular': 'valoración',
    'modal.rating_plural': 'valoraciones',
    'tab.rated': 'Valoraciones',
```

- [ ] **Step 2: Actualizar bloque EN**

Localiza la línea ~713:
```js
    'modal.community_reviews': 'Community reviews',
```
Reemplaza por:
```js
    'modal.community_ratings': 'Community ratings',
    'modal.rating_singular': 'rating',
    'modal.rating_plural': 'ratings',
    'tab.rated': 'Ratings',
```

- [ ] **Step 3: Commit**

```bash
git add static/js/i18n.js
git commit -m "i18n: rename community_reviews to community_ratings, add rating count and tab keys"
```

---

### Task 4: Frontend modal — badge de community avg en `detail-meta`

**Files:**
- Modify: `static/js/app.js:569-576`

- [ ] **Step 1: Añadir badge community avg**

Localiza el bloque `detail-meta` dentro de `openModal` (~línea 569). Reemplaza:

```js
      <div class="detail-meta">
        ${g.release_date ? `<div class="detail-badge">📅 <strong>${g.release_date}</strong></div>` : ''}
        ${g.metacritic ? `<div class="detail-badge">🎯 Metacritic <strong>${g.metacritic}</strong></div>` : ''}
        ${g.price ? `<div class="detail-badge">💰 <strong>${g.price}</strong>${g.discount ? ` <span class="discount-tag">-${g.discount}%</span>` : ''}</div>` : ''}
        ${g.developers?.length ? `<div class="detail-badge">👾 <strong>${g.developers[0]}</strong></div>` : ''}
      </div>
```

Por:

```js
      <div class="detail-meta">
        ${g.release_date ? `<div class="detail-badge">📅 <strong>${g.release_date}</strong></div>` : ''}
        ${g.metacritic ? `<div class="detail-badge">🎯 Metacritic <strong>${g.metacritic}</strong></div>` : ''}
        ${g.community_avg ? `<div class="detail-badge">⭐ <strong>${g.community_avg}</strong>/10 <span style="color:var(--muted);font-size:0.85rem">(${g.community_votes} ${g.community_votes === 1 ? t('modal.rating_singular') : t('modal.rating_plural')})</span></div>` : ''}
        ${g.price ? `<div class="detail-badge">💰 <strong>${g.price}</strong>${g.discount ? ` <span class="discount-tag">-${g.discount}%</span>` : ''}</div>` : ''}
        ${g.developers?.length ? `<div class="detail-badge">👾 <strong>${g.developers[0]}</strong></div>` : ''}
      </div>
```

- [ ] **Step 2: Verificar visualmente**

Abre `http://localhost:8000`, entra al modal de un juego que tenga valoraciones en la DB. El badge `⭐ 7.8/10 (12 valoraciones)` debe aparecer entre Metacritic y el precio. Si no hay votos, no aparece el badge.

- [ ] **Step 3: Commit**

```bash
git add static/js/app.js
git commit -m "feat: show community avg rating badge in game modal header"
```

---

### Task 5: Frontend modal — sección community ratings con texto condicional

**Files:**
- Modify: `static/js/app.js:794-812`

- [ ] **Step 1: Actualizar sección de valoraciones comunidad**

Localiza el bloque `fetch('/api/games/${gameId}/reviews')` (~línea 794). Reemplaza el `.then(reviews => {...})` completo:

```js
    fetch(`/api/games/${gameId}/reviews`)
      .then(r => r.ok ? r.json() : [])
      .then(reviews => {
        const el = document.getElementById('modal-reviews');
        if (!el || !reviews.length) return;
        el.innerHTML = `
          <h4 class="modal-section-title">${t('modal.community_ratings')}</h4>
          ${reviews.map(r => `
            <div class="community-review-item">
              <div class="review-meta">
                <span class="review-username">${escHtml(r.username)}</span>
                ${r.rating ? `<span class="game-rating" style="font-size:0.8rem;padding:2px 8px">${r.rating}/10</span>` : ''}
              </div>
              ${r.review ? `<p class="review-text">${escHtml(r.review)}</p>` : ''}
            </div>
          `).join('')}
        `;
      })
      .catch(() => {});
```

- [ ] **Step 2: Verificar visualmente**

En el modal de un juego con valoraciones:
- El título debe decir "Valoraciones de la comunidad" (no "Reseñas")
- Aparecen usuarios que solo pusieron nota (sin texto): solo muestra el badge de rating
- Los que tienen texto muestran el texto debajo del badge

- [ ] **Step 3: Commit**

```bash
git add static/js/app.js
git commit -m "feat: community ratings section shows all ratings, text is optional"
```

---

### Task 6: Frontend perfil público — tab "Valoraciones"

**Files:**
- Modify: `static/index.html:215-220`
- Modify: `static/js/app.js:1624-1626`

- [ ] **Step 1: Añadir tab en HTML**

Localiza `#profile-tabs` en `static/index.html` (~línea 215):

```html
        <div class="list-tabs" id="profile-tabs">
          <button class="list-tab active" data-status="all" data-i18n="tab.all">Todos</button>
          <button class="list-tab" data-status="played" data-i18n="tab.played">Jugados</button>
          <button class="list-tab" data-status="playing" data-i18n="tab.playing">Jugando</button>
          <button class="list-tab" data-status="wishlist" data-i18n="tab.wishlist">Deseados</button>
          <button class="list-tab" data-status="abandoned" data-i18n="tab.abandoned">Abandonados</button>
        </div>
```

Reemplaza por:

```html
        <div class="list-tabs" id="profile-tabs">
          <button class="list-tab active" data-status="all" data-i18n="tab.all">Todos</button>
          <button class="list-tab" data-status="played" data-i18n="tab.played">Jugados</button>
          <button class="list-tab" data-status="playing" data-i18n="tab.playing">Jugando</button>
          <button class="list-tab" data-status="wishlist" data-i18n="tab.wishlist">Deseados</button>
          <button class="list-tab" data-status="abandoned" data-i18n="tab.abandoned">Abandonados</button>
          <button class="list-tab" data-status="rated" data-i18n="tab.rated">Valoraciones</button>
        </div>
```

- [ ] **Step 2: Actualizar `renderProfileList` en `loadProfile`**

Localiza `renderProfileList` dentro de `loadProfile` (~línea 1624):

```js
    function renderProfileList() {
      const filtered = activeStatus === 'all' ? entries : entries.filter(e => e.status === activeStatus);
```

Reemplaza por:

```js
    function renderProfileList() {
      const filtered =
        activeStatus === 'all' ? entries :
        activeStatus === 'rated' ? entries
          .filter(e => e.rating)
          .sort((a, b) => new Date(b.rated_at || b.added_at) - new Date(a.rated_at || a.added_at)) :
        entries.filter(e => e.status === activeStatus);
```

- [ ] **Step 3: Verificar visualmente**

Navega a un perfil público (`/u/<username>`). El tab "Valoraciones" debe aparecer al final. Al clicarlo:
- Solo aparecen juegos con nota asignada (cualquier status)
- Ordenados del más reciente al más antiguo por `rated_at`
- Cada card muestra la nota del usuario (comportamiento existente de `renderCard`)
- Si el usuario no ha valorado nada: aparece el mensaje de `no-results`

- [ ] **Step 4: Commit**

```bash
git add static/index.html static/js/app.js
git commit -m "feat: add Valoraciones tab to public profiles"
```

---

### Task 7: Push final

- [ ] **Push al remoto**

```bash
git push origin master
```

Render detecta el push y redespliega automáticamente (~2 min). Verificar en https://mycheckpoint.games:
1. Modal de un juego con valoraciones → badge `⭐ X/10 (N valoraciones)` en la cabecera
2. Sección inferior del modal → "Valoraciones de la comunidad" con todas las notas (con y sin texto)
3. Perfil público → tab "Valoraciones" presente y funcional, ordenado por fecha
