# Diseño: Split Comunidad → Comunidad + Seguidos

**Fecha:** 2026-05-21  
**Estado:** Aprobado

## Problema

La página Comunidad actual mezcla búsqueda de perfiles, lista de seguidos y feed de actividad en una sola vista. El feed aparece vacío para usuarios nuevos (sin follows), lo que rompe el paso 2 del tour de Comunidad — apunta a `#community-feed` y no hay nada que mostrar.

## Solución

Separar el nav en dos pestañas:

- **Comunidad** — descubrimiento público, siempre con contenido
- **Seguidos** — feed social personal, requiere login

---

## 1. Comunidad (actualizada)

### Funcionalidad

- **Feed popular:** 20 valoraciones recientes, máximo 1 por usuario, priorizadas por número de seguidores del autor (DESC), luego por `rated_at` DESC. Cards idénticas a las del feed global del home (`renderFeedItem`).
- **Buscador de perfiles:** igual al actual — busca por username, muestra avatar, juegos, botón Seguir/Siguiendo.
- **Pública:** visible sin login. El botón Seguir pide login si no estás autenticado.

### Backend

Nuevo endpoint `GET /api/community/popular`:

```sql
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
```

Envuelto en subquery para ordenar los 20 por `followers_count DESC, added_at DESC`.

En SQLite (dev local): `DISTINCT ON` no existe — usar subquery con `GROUP BY user_id` + `MAX(rated_at)`.

### HTML (`index.html`)

`#view-community` se simplifica:
- Título + subtítulo actualizados
- `#community-popular-feed` — donde se renderizan las cards populares
- Buscador existente (`#community-search-input` + `#community-search-results`) se mantiene

Eliminar: `#community-following-list`, `#community-feed`

### Tour de Comunidad (`PAGE_TOURS.community`)

3 pasos:
1. Intro (sin target)
2. `#community-popular-feed` — "Valoraciones de la comunidad"
3. `#community-search-input` — "Busca jugadores"

---

## 2. Seguidos (nueva pestaña)

### Funcionalidad

- **Feed de actividad:** valoraciones y cambios de estado de usuarios que sigues. Usa el endpoint existente `/api/following` (devuelve `{ following, feed }`).
- **Lista de seguidos:** usuarios que sigues con botón Dejar de seguir.
- **Buscador:** mismo buscador de perfiles con follow/unfollow.
- **Requiere login:** si no autenticado, muestra mensaje con CTA de registro.

### Backend

Reutiliza `/api/following` existente. No se necesita endpoint nuevo.

### HTML (`index.html`)

Nueva vista `#view-following`:
- Botón `#nav-following` en navbar entre `#nav-community` y `#nav-ideas`
- `#following-search-input` + `#following-search-results` — buscador
- `#following-list` — lista de seguidos (mover lógica actual de `loadCommunity`)
- `#following-feed` — feed de actividad

### Routing

- URL: `/seguidos`
- `VIEWS` añade `'following'`
- `popstate` y `init` manejan `/seguidos` → `showView('following'); loadFollowing()`

### Tour de Seguidos (`PAGE_TOURS.following`)

3 pasos:
1. Intro (sin target)
2. `#following-feed` — "Tu feed de actividad"
3. `#following-search-input` — "Encuentra personas para seguir"

---

## 3. Tour global (home)

`TOUR_STEPS` añade paso entre Comunidad e Ideas:

```
{ target: '#nav-following', title: '👥 Seguidos', text: 'Sigue a otros jugadores y ve aquí su actividad reciente.', pos: 'bottom' }
```

El paso de Comunidad pasa a explicar el descubrimiento de perfiles populares.

---

## 4. i18n

### Claves nuevas (ES + EN)

| Clave | ES | EN |
|---|---|---|
| `nav.following` | Seguidos | Following |
| `following.page_title` | Seguidos | Following |
| `following.page_subtitle` | Tu feed de actividad | Your activity feed |
| `community.popular_title` | Valoraciones destacadas | Featured ratings |
| `tour.step5b.title` | 👥 Seguidos | 👥 Following |
| `tour.step5b.text` | Sigue jugadores y sigue su actividad aquí. | Follow players and track their activity here. |
| `tour.following.step0.title` | 👥 Tus seguidos | 👥 Your following |
| `tour.following.step0.text` | Aquí está el feed de actividad de los jugadores que sigues. | Here's the activity feed of players you follow. |
| `tour.following.step1.title` | 📡 Feed de actividad | 📡 Activity feed |
| `tour.following.step1.text` | Las últimas valoraciones y cambios de estado de tus seguidos. | Latest ratings and status updates from who you follow. |
| `tour.following.step2.title` | 🔍 Busca jugadores | 🔍 Find players |
| `tour.following.step2.text` | Escribe un nombre para encontrar perfiles y seguirlos. | Type a name to find profiles and follow them. |
| `tour.community.step1.title` (update) | 🌟 Valoraciones populares | 🌟 Popular ratings |
| `tour.community.step1.text` (update) | Las últimas valoraciones de los perfiles más seguidos de la comunidad. | Latest ratings from the most-followed profiles in the community. |
| `tour.community.step2.title` (update) | 🔍 Busca jugadores | 🔍 Find players |
| `tour.community.step2.text` (update) | Busca cualquier perfil y síguele para ver su actividad en Seguidos. | Find any profile and follow them to see their activity in Following. |

---

## 5. Archivos modificados

| Archivo | Cambio |
|---|---|
| `main.py` | Nuevo `GET /api/community/popular` |
| `static/index.html` | Nuevo `#nav-following`, `#view-following`; actualizar `#view-community` |
| `static/js/app.js` | `loadCommunity()` rediseñada, nueva `loadFollowing()`, routing, TOUR_STEPS, PAGE_TOURS |
| `static/js/i18n.js` | ~16 claves nuevas/actualizadas en ES y EN |

## 6. Orden de implementación

1. Backend: `GET /api/community/popular`
2. HTML: nav + vistas
3. JS: routing + `loadCommunity()` + `loadFollowing()`
4. JS: tours (TOUR_STEPS + PAGE_TOURS)
5. i18n: todas las claves

No hay dependencias cruzadas entre frontend y backend que obliguen a un orden específico más allá de que el endpoint debe existir antes de probarlo.
