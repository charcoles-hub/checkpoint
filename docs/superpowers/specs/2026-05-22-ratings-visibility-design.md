# Ratings Visibility — Spec

**Date:** 2026-05-22  
**Status:** Approved

## Problem

Two gaps in how ratings are surfaced:
1. Opening a game modal shows no community average rating; the reviews section only shows entries that have written text, hiding ratings without notes.
2. Public profiles have no dedicated section for a user's rated games — ratings exist on individual cards but there's no consolidated view.

## Solution Overview (Option A)

Minimal-surface changes: enrich two existing backend endpoints and add one frontend tab. No new endpoints.

---

## Backend

### `GET /api/games/{id}` (`main.py:241`)

Add a single DB query at the end of `game_detail()` before returning:

```sql
-- SQLite
SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS votes
FROM game_entries
WHERE steam_appid=? AND rating IS NOT NULL AND status IN ('played','playing')

-- PostgreSQL
SELECT ROUND(AVG(rating::numeric),1)::float AS avg_rating, COUNT(*) AS votes
FROM game_entries
WHERE steam_appid=? AND rating IS NOT NULL AND status IN ('played','playing')
```

Two new fields added to response: `community_avg` (float or null) and `community_votes` (int, 0 if no votes).

> Note: use the `_PGConn`-aware `db` pattern already used in other endpoints. `ROUND(AVG(...))` returns `Decimal` in PostgreSQL — must cast to `::float`.

### `GET /api/games/{id}/reviews` (`main.py:881`)

Remove the filter `AND ge.review IS NOT NULL AND ge.review != ''`. New WHERE clause:

```sql
WHERE ge.steam_appid=? AND ge.rating IS NOT NULL AND ge.status IN ('played','playing')
```

Returns up to 20 most recent entries that have a rating (regardless of whether they wrote a note). `review` field will be `null` for entries without text — frontend handles this gracefully.

---

## Frontend

### Modal — community avg badge (`app.js`, inside `openModal`)

In the `detail-meta` div, after the Metacritic badge:

```js
${g.community_avg
  ? `<div class="detail-badge">⭐ <strong>${g.community_avg}</strong>/10 <span style="color:var(--muted);font-size:0.85rem">(${g.community_votes} ${g.community_votes === 1 ? t('modal.rating_singular') : t('modal.rating_plural')})</span></div>`
  : ''}
```

### Modal — community ratings section

The fetch of `/api/games/${gameId}/reviews` already exists. Changes:
- Rename i18n key `modal.community_reviews` → `modal.community_ratings` (update translations ES + EN).
- Each item: always show the rating badge; show `review-text` paragraph only if `r.review` is non-null.

### Public profile — "Valoraciones" tab (`index.html` + `app.js:loadProfile`)

**HTML** (`index.html`, `#profile-tabs`): add after the existing tabs:
```html
<button class="list-tab" data-status="rated">Valoraciones</button>
```
(i18n: add `profile.tab.rated` key, ES: "Valoraciones", EN: "Ratings")

**JS** (`renderProfileList` inside `loadProfile`, ~app.js:1624): extend the filter logic:
```js
const filtered =
  activeStatus === 'all'    ? entries :
  activeStatus === 'rated'  ? entries
      .filter(e => e.rating)
      .sort((a, b) => new Date(b.rated_at || b.added_at) - new Date(a.rated_at || a.added_at)) :
  entries.filter(e => e.status === activeStatus);
```

Cards render via existing `renderCard` — already shows the user's rating. No new component needed.

---

## i18n keys to add/change

| Key | ES | EN |
|-----|----|----|
| `modal.community_ratings` | "Valoraciones de la comunidad" | "Community ratings" |
| `modal.rating_singular` | "valoración" | "rating" |
| `modal.rating_plural` | "valoraciones" | "ratings" |
| `profile.tab.rated` | "Valoraciones" | "Ratings" |

Remove `modal.community_reviews` (or keep as alias if used elsewhere — check first).

---

## Error handling / edge cases

- `community_avg = null` → badge is simply omitted (no empty state needed).
- `community_votes = 0` → same, badge omitted.
- Ratings tab with 0 rated entries → existing `no-results` message from `renderProfileList` covers this.
- `rated_at` can be null for old entries → fallback to `added_at` already in sort expression.

---

## Files to change

| File | Change |
|------|--------|
| `main.py` | `game_detail()`: add community stats query; `get_game_reviews()`: remove text filter, restrict to rated+played/playing |
| `static/js/app.js` | `openModal`: add community_avg badge; reviews section label + conditional text; `loadProfile` + `renderProfileList`: add 'rated' filter |
| `static/index.html` | Add "Valoraciones" tab button in `#profile-tabs` |
| i18n strings in `app.js` | Add 4 keys above |
