# Ratings Display Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar dos vistas de valoraciones: el tab "Valoraciones" en perfiles públicos muestra una lista feed en lugar de tarjetas; la sección de valoraciones en el modal muestra solo las 5 más recientes con reseña escrita.

**Architecture:** Dos cambios independientes: (1) backend quita filtro de texto y reduce LIMIT en `get_game_reviews`; (2) frontend reemplaza `renderCard` con items feed en `renderProfileList` para el caso `'rated'` y añade CSS de override para el contenedor.

**Tech Stack:** FastAPI + Python (backend), vanilla JS + CSS (frontend). No hay test suite — verificación visual.

---

## File Map

| File | Qué cambia |
|------|-----------|
| `main.py:967-978` | `get_game_reviews()`: añadir filtro `review IS NOT NULL`, cambiar LIMIT 20 → 5 |
| `static/js/app.js:1637-1645` | `renderProfileList`: renderizar feed items para `'rated'`; añadir/quitar clase `ratings-list` en `profileGrid` |
| `static/css/style.css:255` | Añadir `.games-grid.ratings-list` para override del grid a columna |

---

### Task 1: Backend — restaurar filtro de texto y reducir limit en `get_game_reviews`

**Files:**
- Modify: `main.py:967-978`

- [ ] **Step 1: Reemplazar el bloque `get_game_reviews`**

Localiza `get_game_reviews` en `main.py` (~línea 967). Reemplaza el bloque completo:

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
          AND ge.review IS NOT NULL AND ge.review != ''
        ORDER BY COALESCE(ge.rated_at, ge.added_at) DESC LIMIT 5
    """, (appid,)).fetchall()
    db.close()
    return [dict(r) for r in rows]
```

Cambios respecto al código actual:
- Añadido: `AND ge.review IS NOT NULL AND ge.review != ''`
- Cambiado: `LIMIT 20` → `LIMIT 5`

- [ ] **Step 2: Verificar el cambio leyendo las líneas modificadas**

```bash
grep -A 12 "def get_game_reviews" main.py
```

Resultado esperado: query con `review IS NOT NULL` y `LIMIT 5`.

- [ ] **Step 3: Commit**

```bash
git add main.py
git commit -m "fix: community ratings in modal require text, limit 5"
```

---

### Task 2: Frontend CSS — añadir override de grid para modo lista

**Files:**
- Modify: `static/css/style.css:255-260`

- [ ] **Step 1: Añadir clase `.ratings-list` como override del grid**

Localiza `.games-grid` en `static/css/style.css` (~línea 255):

```css
.games-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(155px, 1fr));
  gap: 14px;
}
```

Añade la regla nueva inmediatamente después (después del cierre de `}`):

```css
.games-grid.ratings-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
```

- [ ] **Step 2: Verificar**

```bash
grep -A 4 "ratings-list" static/css/style.css
```

Resultado esperado:
```
.games-grid.ratings-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
```

- [ ] **Step 3: Commit**

```bash
git add static/css/style.css
git commit -m "feat: add ratings-list CSS override for profile feed layout"
```

---

### Task 3: Frontend JS — renderizar feed items en el tab "Valoraciones"

**Files:**
- Modify: `static/js/app.js:1637-1656`

- [ ] **Step 1: Reemplazar `renderProfileList` con soporte de feed items**

Localiza `renderProfileList` dentro de `loadProfile` (~línea 1637). Reemplaza el bloque completo de la función y el loop de tabs:

```js
    let activeStatus = 'all';
    function renderProfileList() {
      const filtered =
        activeStatus === 'all' ? entries :
        activeStatus === 'rated' ? [...entries]
          .filter(e => e.rating)
          .sort((a, b) => new Date(b.rated_at || b.added_at) - new Date(a.rated_at || a.added_at)) :
        entries.filter(e => e.status === activeStatus);
      profileGrid.innerHTML = '';
      if (!filtered.length) { profileGrid.innerHTML = `<div class="no-results">${t('profile.no_games')}</div>`; return; }
      if (activeStatus === 'rated') {
        profileGrid.classList.add('ratings-list');
        filtered.forEach(e => {
          const item = document.createElement('div');
          item.className = 'feed-item';
          item.innerHTML = `
            <img src="${e.game_image || ''}" class="feed-thumb" onerror="this.style.display='none'" />
            <div class="feed-info">
              <div class="feed-user">
                <span class="feed-game" style="font-weight:600">${escHtml(e.game_name)}</span>
                ${e.rating ? `<span class="game-rating" style="font-size:0.8rem;padding:2px 8px;margin-left:8px">${e.rating}/10</span>` : ''}
                <span class="feed-time" style="margin-left:auto">${timeAgo(e.rated_at || e.added_at)}</span>
              </div>
              ${e.notes ? `<div class="feed-review">"${escHtml(e.notes.slice(0, 200))}${e.notes.length > 200 ? '…' : ''}"</div>` : ''}
            </div>
          `;
          item.addEventListener('click', () => openModal(e.steam_appid));
          profileGrid.appendChild(item);
        });
      } else {
        profileGrid.classList.remove('ratings-list');
        filtered.forEach(e => profileGrid.appendChild(renderCard(e, () => openModal(e.steam_appid))));
      }
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
```

Cambios clave:
- Para `'rated'`: añade clase `ratings-list` al `profileGrid`, renderiza `feed-item` divs con thumbnail + nombre + badge de rating + texto de notas + fecha
- Para cualquier otro status: quita clase `ratings-list`, usa `renderCard` como antes
- `e.notes` es el campo de texto de la valoración del usuario (campo `notes` en `game_entries`)
- `timeAgo()` ya existe en el codebase (usada en `renderFeedItem`)

- [ ] **Step 2: Verificar visualmente**

Arranca el servidor:
```bash
cd /home/sergio/gametracker && source venv/bin/activate && uvicorn main:app --reload --port 8000
```

Navega a un perfil público con valoraciones → tab "Valoraciones". Debe mostrar:
- Lista vertical de items (no grid de cards)
- Cada item: thumbnail pequeño + nombre del juego + badge rating + texto si existe + fecha relativa
- Clicking en un item abre el modal del juego
- Cambiar a otro tab (ej. "Jugados") → vuelve al grid de cards normal

- [ ] **Step 3: Commit**

```bash
git add static/js/app.js
git commit -m "feat: profile Valoraciones tab renders rating feed instead of game cards"
```

---

### Task 4: Push final

- [ ] **Push al remoto**

```bash
git push origin worktree-ratings-display-redesign
```

Luego merge a master:
```bash
cd /home/sergio/gametracker
git checkout master
git pull
git merge worktree-ratings-display-redesign
git push origin master
```

Verificar en https://mycheckpoint.games:
1. Modal de un juego → sección "Valoraciones de la comunidad" muestra máx 5 entradas, todas con texto escrito
2. Perfil público → tab "Valoraciones" muestra lista feed (no cards), con thumbnail + nombre + nota + reseña + fecha
