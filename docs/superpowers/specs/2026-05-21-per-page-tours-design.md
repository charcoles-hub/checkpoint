# Per-Page Tours — Design Spec

**Date:** 2026-05-21  
**Status:** Approved

## Overview

Add context-aware tours to each main page of Checkpoint. The existing global onboarding tour (home, for unauthenticated users) stays unchanged. Each other nav page gets its own deeper tour that auto-triggers once per device and can be replayed manually via the footer button.

---

## Behaviour

### Auto-trigger
- Fires the first time a user (any, logged in or not) visits a page.
- 500ms delay after `showView()` renders the page (same delay as home tour).
- Tracked per page in localStorage: `ck_tour_explore_done`, `ck_tour_ranking_done`, `ck_tour_community_done`, `ck_tour_ideas_done`, `ck_tour_profile-me_done`.
- Once the key is set, the tour never auto-triggers again for that page on that device.

### Manual trigger (footer button)
- Detects which `view-*` div is currently visible.
- Calls `startPageTour(page)` for that page.
- If the current page has no tour defined (home, public profile, contacto), falls back to the existing home tour behaviour.
- Does **not** set the `_done` localStorage key — manual triggers are always available.

### End of tour
- `endTour()` writes the `ck_tour_${page}_done` key only when the tour was auto-triggered (not manual).
- A `_tourIsManual` flag tracks this.

---

## Engine changes (`app.js`)

### `onEnter` callback on steps
Steps may include `onEnter: () => {}`, executed before the spotlight/popup renders for that step. Used by the Explorar tour to navigate into the Acción category before highlighting the sort tabs.

### `_renderTourStep` change
Before positioning the spotlight, check if `step.onEnter` exists and call it. Wait for any async side-effects (nav + load) before calculating element positions — use a short `setTimeout` or the existing 380ms positioning delay to absorb it.

### `startPageTour(page)`
```
function startPageTour(page) {
  const steps = PAGE_TOURS[page];
  if (!steps) return;
  // destroy any active tour
  if (_tourEl) { _tourEl.remove(); _tourEl = null; document.removeEventListener('keydown', _tourKeyHandler); }
  _tourStep = 0;
  _currentTourPage = page;
  _currentTourSteps = steps;   // replaces TOUR_STEPS reference inside engine
  startTourEngine();           // shared DOM creation + event binding
}
```

The existing `startTour()` (home) calls `startTourEngine()` with `_currentTourSteps = TOUR_STEPS`.

### `showView(v)` hook
```
// after existing showView logic:
if (PAGE_TOURS[v] && !localStorage.getItem(`ck_tour_${v}_done`)) {
  setTimeout(() => startPageTour(v), 500);
}
```

### Footer button
```
document.getElementById('footer-tour').addEventListener('click', () => {
  const activeView = [...document.querySelectorAll('[id^="view-"]')]
    .find(el => el.style.display !== 'none');
  const page = activeView?.id.replace('view-', '');
  if (page && PAGE_TOURS[page]) {
    _tourIsManual = true;
    startPageTour(page);
  } else {
    // fallback: existing home tour behaviour
    localStorage.removeItem('ck_tour_done');
    if (_tourEl) { _tourEl.remove(); _tourEl = null; document.removeEventListener('keydown', _tourKeyHandler); }
    history.pushState({}, '', '/');
    resetHome();
    startTour();
  }
});
```

---

## `PAGE_TOURS` content

### Explorar (4 steps)

| Step | Target | Content |
|------|--------|---------|
| 0 | `null` (centered) | Intro: "Descubre los mejores juegos organizados por categoría, con valoraciones reales de la comunidad." |
| 1 | `.categories-grid` | "Cada tarjeta es una categoría. Haz clic en cualquiera para ver los juegos más destacados de ese género." |
| 2 | sort tabs in category view | `onEnter`: navigate to Acción category. "Dentro de cada categoría puedes ordenar por **Populares** (más añadidos por los usuarios) o **Mejor valorados** (nota media más alta)." |
| 3 | `#search-input` | "Busca cualquier juego directamente por nombre para encontrarlo al instante." |

### Ranking (3 steps)

| Step | Target | Content |
|------|--------|---------|
| 0 | `null` | Intro: "El ranking lo construyen las valoraciones de todos los usuarios de Checkpoint. Sin algoritmos externos." |
| 1 | first ranking row (`.ranking-row`) | "Cada posición refleja la nota media real de la comunidad. Cuantos más usuarios valoren un juego, más fiable es su posición." |
| 2 | `#btn-register` / valorar CTA | "Cuando valoras un juego, tu nota contribuye directamente al ranking global." |

### Comunidad (3 steps)

| Step | Target | Content |
|------|--------|---------|
| 0 | `null` | Intro: "Conecta con otros jugadores, sigue su actividad y descubre qué están jugando." |
| 1 | `#community-search` | "Busca a otros usuarios por nombre de usuario para ver su perfil y colección." |
| 2 | activity/follow area | "Cuando sigues a alguien, su actividad aparece en tu feed: qué juega, qué termina, qué opina." |

### Ideas (4 steps)

| Step | Target | Content |
|------|--------|---------|
| 0 | `null` | Intro: "La hoja de ruta pública de Checkpoint. Aquí puedes ver qué se ha construido, qué está en marcha y qué se puede proponer." |
| 1 | ideas list / vote buttons | "Vota las sugerencias que más te interesen. Las ideas con más votos suben en la lista." |
| 2 | status filter / done ideas | "Las ideas con estado **En producción** o **Completado** también aparecen aquí — puedes ver exactamente qué funcionalidades se han añadido a la app." |
| 3 | add idea button | "¿Tienes una idea? Proponla. El desarrollo de Checkpoint lo decide la comunidad." |

### Mi Perfil (5 steps)

| Step | Target | Content |
|------|--------|---------|
| 0 | `null` | Intro: "Tu diario personal de gaming. Todo lo que juegas, todo lo que piensas, en un solo lugar." |
| 1 | `#btn-add-game` / game list | "Añade cualquier juego, asígnale un estado (Jugado, Jugando, Wishlist, Abandonado) y puntúalo o escribe una reseña." |
| 2 | Steam tab | "En la pestaña Steam puedes importar tu biblioteca completa de Steam. Con ⭐ Premium, la sincronización de juegos y horas jugadas se hace automáticamente cada 24h." |
| 3 | Account tab / avatar section | "Personaliza tu avatar con colores. Con ⭐ Premium puedes añadir foto de perfil y un emoji gaming." |
| 4 | Wishlist / alerts area | "Las alertas de precio son una función ⭐ Premium: te notificamos cuando un juego de tu lista baje al precio que tú elijas." |

---

## i18n

New keys follow the pattern `tour.{page}.step{N}.title` and `tour.{page}.step{N}.text`, added to both `es` and `en` blocks in `i18n.js`.

Example:
```
'tour.explore.step0.title': '🗺️ Explora por categorías',
'tour.explore.step0.text':  'Descubre los mejores juegos organizados por categoría, con valoraciones reales de la comunidad.',
```

---

## Files changed

| File | Change |
|------|--------|
| `static/js/app.js` | `PAGE_TOURS`, `startPageTour()`, `onEnter` support in `_renderTourStep`, hook in `showView()`, updated footer button handler, `_tourIsManual` + `_currentTourPage` state vars |
| `static/js/i18n.js` | ~40 new i18n keys (ES + EN) for 5 page tours × 3-4 steps × 2 strings |

No backend changes. No new files.

---

## Out of scope

- Server-side tracking of tour completion (localStorage is sufficient)
- Tours for public profile pages (`/u/username`) and contacto page
- Animated transitions between steps that navigate pages
