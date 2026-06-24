# CLAUDE.md — Checkpoint

Guía rápida para Claude Code. Detalle bajo demanda en docs/ y memoria.

## Proyecto
Checkpoint: app de gaming (seguimiento/descubrimiento de juegos). Nombre interno del repo: `gametracker`.
**Stack:** FastAPI (Python) backend · frontend JS (`static/app.js`) · SQLite (`gametracker.db`) · deploy Render (`render.yaml`).

## Estructura
- `main.py` — app FastAPI / rutas
- `auth.py` `database.py` `alerts.py` — auth, DB, notificaciones
- `static/` — frontend (`app.js`, assets, `manifest.json`)
- `docs/` — superpowers plans/specs (histórico, ignorado por defecto)

## Convenciones / gotchas
- **Explorar (filtrado de categorías):** batch DB lookup en `api_cache` para filtrar tags — NO HTTP por juego (causa OOM); warmup en background.
- **Tour onboarding:** al añadir/cambiar features visibles, actualizar `TOUR_STEPS` en `static/app.js`.
- Git: commit + push directo sin pedir confirmación.

## Comandos
```bash
uvicorn main:app --reload     # dev server (ajustar si difiere)
```

**Optimizado con** [Claude Token Optimizer](https://github.com/nadimtuhin/claude-token-optimizer)
