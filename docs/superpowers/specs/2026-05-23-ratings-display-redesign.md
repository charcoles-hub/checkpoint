# Ratings Display Redesign — Spec

**Date:** 2026-05-23  
**Status:** Approved

## Problem

Two display issues introduced in the ratings-visibility feature:
1. The "Valoraciones" tab in public profiles renders game cards (grid layout) — it should be a rating feed (list format) showing the actual review content.
2. The community ratings section in the game modal shows up to 20 entries, including entries without text. It should show only the 5 most recent ratings that have a written review.

---

## Change 1: Profile "Valoraciones" tab — list format

### What changes

When `activeStatus === 'rated'`, `renderProfileList` currently calls `renderCard` for each entry. This will be replaced with a dedicated rating list renderer.

### List item design

Each item reuses existing `feed-item` / `feed-thumb` CSS classes (already defined for the activity feed):

```
[ game thumbnail ]  Game Name                    ★ 8/10
                    "Review text truncated to ~200 chars…"
                    2 días
```

- **Thumbnail**: `feed-thumb` (small square image)
- **Game name**: bold, clickable → `openModal(e.steam_appid)`
- **Rating badge**: `game-rating` class, e.g. `8/10`
- **Review text**: shown if `e.notes` is non-null, truncated at 200 chars with `…`
- **Date**: `timeAgo(e.rated_at || e.added_at)` (relative)
- **Click anywhere on item** → `openModal(e.steam_appid)`

Entries without review text still appear — just without the text line.

### CSS

The `profile-grid` element currently has grid CSS. When in `'rated'` mode, add class `ratings-list` to switch it to a single-column list layout. Remove the class when switching away from the tab.

```css
.ratings-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
```

The existing `.feed-item` styles handle the internal layout — no new item styles needed.

### Data source

Existing `entries` array from `/api/users/{username}` — already contains `rating`, `notes`, `rated_at`, `steam_appid`, `game_name`, `game_image`. No new endpoint needed.

### Empty state

Entries without `e.rating` are already filtered out by the existing `'rated'` case. If the user has no rated games, the existing `no-results` message from `renderProfileList` is shown.

---

## Change 2: Modal community ratings — limit 5, require text

### Backend: `GET /api/games/{appid}/reviews` (`main.py`)

Restore the `review IS NOT NULL AND review != ''` filter (removed in the previous feature) and reduce the limit from 20 to 5:

```sql
WHERE ge.steam_appid=? AND ge.rating IS NOT NULL
  AND ge.status IN ('played', 'playing')
  AND ge.review IS NOT NULL AND ge.review != ''
ORDER BY COALESCE(ge.rated_at, ge.added_at) DESC LIMIT 5
```

**Rationale:** "la reseña escrita siempre será parte de la valoración" — the written review is always part of the community rating display. Entries without text are excluded from this section (the avg badge in the header already represents the full count including text-less ratings).

### Frontend: no change needed

The frontend already renders `r.review` conditionally — since all returned entries now have text, the condition always passes. No visual change required.

---

## Files to change

| File | Change |
|------|--------|
| `main.py` | `get_game_reviews()`: add back `review IS NOT NULL AND review != ''` filter; change LIMIT 20 → LIMIT 5 |
| `static/js/app.js` | `renderProfileList`: replace `renderCard` calls with feed-style item rendering for `'rated'` status; add/remove `ratings-list` class on `profile-grid` |
| `static/index.html` | No change |
| `static/js/i18n.js` | No change |

---

## Edge cases

- **Entry with no image**: `onerror="this.style.display='none'"` on the thumbnail (existing pattern from `renderFeedItem`)
- **No rated entries**: existing `no-results` message from `renderProfileList`
- **No community reviews with text**: `modal-reviews` element stays empty (section only renders when `reviews.length > 0`)
- **`rated_at` null**: fallback to `added_at` in `timeAgo()` call (existing pattern)
